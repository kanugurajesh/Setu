import "server-only";
import { config } from "./config";
import { chatJSON, type CallMeta } from "./llm";
import { BRIEF_SYSTEM, OCR_SYSTEM, briefUserMessage, followUpSystem, followUpUserMessage, planSystem, planUserMessage } from "./prompts";
import { BriefSchema, DocumentSchema, FollowUpSchema, PlanSchema, maxUrgency, type Brief, type FollowUpRequest, type PlanRequest, type StructureRequest, type Urgency } from "../schemas";
import { redact, type RedactionResult } from "../redact";
import { evaluateRules, type RuleResult } from "../safety-rules";
import { groundBrief, type GroundedBrief, type GroundingStats } from "../grounding";
import { guardPlan } from "../plan-guard";
import { guardFollowUp } from "../followup-guard";

export interface BriefResponse {
  brief: GroundedBrief;
  grounding: GroundingStats;
  rules: RuleResult;
  urgency: { model: Urgency; rules: Urgency; final: Urgency; raisedByRules: boolean };
  redaction: { counts: RedactionResult["counts"]; total: number; sentText: string };
  meta: CallMeta;
}

function capBrief(b: Brief): Brief {
  return { ...b, questions_before_doctor: b.questions_before_doctor.slice(0, 5), considerations: b.considerations.slice(0, 4) };
}

export async function buildBrief(req: StructureRequest): Promise<BriefResponse> {
  // Names were already removed on the device. The server catches identifiers
  // that were spoken aloud (phone, Aadhaar, ABHA, email) as a second layer.
  const t = redact(req.transcript);
  const kc = req.patient.knownConditions ? redact(req.patient.knownConditions).text : undefined;
  const doc = req.documentText ? redact(req.documentText).text : undefined;
  const rules = evaluateRules({ text: t.text, vitals: req.vitals, patient: req.patient });

  const { data, meta } = await chatJSON({
    step: "brief",
    schema: BriefSchema,
    schemaName: "doctor_brief",
    reasoningEffort: "medium",
    messages: [
      { role: "system", content: BRIEF_SYSTEM },
      { role: "user", content: briefUserMessage({ transcript: t.text, patient: req.patient, knownConditions: kc, vitals: req.vitals, documentText: doc, rules: rules.flags }) },
    ],
  });

  const brief = capBrief(data);
  const grounded = groundBrief(brief, { transcript: t.text, documentText: doc, hasVitals: Object.values(req.vitals).some((v) => v !== undefined) });
  const final = maxUrgency(brief.urgency, rules.urgency);
  return {
    brief: grounded.brief,
    grounding: grounded.stats,
    rules,
    urgency: { model: brief.urgency, rules: rules.urgency, final, raisedByRules: final !== brief.urgency },
    redaction: { counts: t.counts, total: t.total, sentText: t.text },
    meta,
  };
}

export async function buildPlan(req: PlanRequest) {
  const advice = redact(req.doctorAdvice).text;
  const { data, meta } = await chatJSON({
    step: "plan",
    schema: PlanSchema,
    schemaName: "take_home_plan",
    reasoningEffort: "medium",
    temperature: 0.3,
    messages: [
      { role: "system", content: planSystem(req.language) },
      {
        role: "user",
        content: planUserMessage({
          doctorAdvice: advice,
          patient: req.patient,
          summary: req.context.summary,
          redFlags: req.context.redFlags,
          socialContext: req.context.socialContext,
        }),
      },
    ],
  });
  const guarded = guardPlan(data, advice);
  return { ...guarded, language: req.language, meta };
}

export async function readDocument(image: string) {
  const { data, meta } = await chatJSON({
    step: "ocr",
    schema: DocumentSchema,
    schemaName: "medical_document",
    model: config.visionModel,
    strict: false, // strict constrained decoding is gpt-oss only; zod + repair pass covers this model
    reasoningEffort: "none",
    temperature: 0,
    maxTokens: 3000,
    messages: [
      { role: "system", content: OCR_SYSTEM },
      {
        role: "user",
        content: [
          { type: "text", text: "Read this document and return the JSON." },
          { type: "image_url", image_url: { url: image } },
        ],
      },
    ],
  });
  // Printed headers often carry phone numbers / IDs; strip them before they travel further.
  const r = redact(data.full_text);
  return { document: { ...data, full_text: r.text }, redactedCount: r.total, meta };
}

/**
 * Day-N check-in call. The call transcript is redacted again here, the model
 * reads it against the plan, and the guard verifies quotes and applies the
 * escalation floor (the model can raise the action, never lower it).
 */
export async function checkIn(req: FollowUpRequest) {
  const t = redact(req.transcript);
  const { data, meta } = await chatJSON({
    step: "followup",
    schema: FollowUpSchema,
    schemaName: "follow_up_check_in",
    reasoningEffort: "medium",
    temperature: 0.2,
    messages: [
      { role: "system", content: followUpSystem(req.language) },
      {
        role: "user",
        content: followUpUserMessage({
          transcript: t.text,
          daysSinceVisit: req.daysSinceVisit,
          patient: req.patient,
          medicines: req.plan.medicines,
          warningSigns: req.plan.warningSigns,
          dailySteps: req.plan.dailySteps,
          followUp: req.plan.followUp,
        }),
      },
    ],
  });
  const guarded = guardFollowUp(data, { transcript: t.text, patient: req.patient, planMedicines: req.plan.medicines.map((m) => m.name) });
  return { ...guarded, language: req.language, redactedCount: t.total, meta };
}
