import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Shared vocab                                                        */
/* ------------------------------------------------------------------ */

export const URGENCIES = ["routine", "soon", "urgent", "emergency"] as const;
export const Urgency = z.enum(URGENCIES);
export type Urgency = z.infer<typeof Urgency>;
export const URGENCY_RANK: Record<Urgency, number> = { routine: 0, soon: 1, urgent: 2, emergency: 3 };
export const maxUrgency = (...u: Urgency[]): Urgency =>
  u.reduce((a, b) => (URGENCY_RANK[b] > URGENCY_RANK[a] ? b : a), "routine" as Urgency);

export const LANGUAGES = { te: "Telugu", hi: "Hindi", en: "English" } as const;
export type LangCode = keyof typeof LANGUAGES;

/* ------------------------------------------------------------------ */
/* Request schemas (validated at the API boundary)                     */
/* ------------------------------------------------------------------ */

const num = (min: number, max: number) => z.number().finite().min(min).max(max).optional();

export const VitalsSchema = z.object({
  systolic: num(40, 300),
  diastolic: num(20, 200),
  pulse: num(20, 250),
  tempC: num(30, 45),
  spo2: num(50, 100),
  glucose: num(10, 900),
  weightKg: num(0.5, 300),
});
export type Vitals = z.infer<typeof VitalsSchema>;

export const PatientSchema = z.object({
  ageYears: num(0, 120),
  sex: z.enum(["female", "male", "other"]).optional(),
  pregnant: z.boolean().optional(),
  knownConditions: z.string().max(300).optional(),
});
export type Patient = z.infer<typeof PatientSchema>;

export const StructureRequest = z.object({
  transcript: z.string().trim().min(15, "Add a little more of the conversation first.").max(8000),
  patient: PatientSchema.default({}),
  vitals: VitalsSchema.default({}),
  documentText: z.string().max(6000).optional(),
});
export type StructureRequest = z.infer<typeof StructureRequest>;

export const PlanRequest = z.object({
  doctorAdvice: z.string().trim().min(10, "The doctor's advice is needed before a plan can be written.").max(4000),
  language: z.enum(["te", "hi", "en"]),
  patient: PatientSchema.default({}),
  context: z
    .object({
      summary: z.string().max(600).default(""),
      redFlags: z.array(z.string().max(200)).max(10).default([]),
      socialContext: z.array(z.string().max(200)).max(10).default([]),
    })
    .default({ summary: "", redFlags: [], socialContext: [] }),
});
export type PlanRequest = z.infer<typeof PlanRequest>;

export const OcrRequest = z.object({
  image: z
    .string()
    .max(4_500_000, "Image is too large. Try a closer, smaller photo.")
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Expected a JPEG, PNG or WebP image."),
});

/* ------------------------------------------------------------------ */
/* Model output schemas (sent to the model as strict JSON Schema)       */
/* Keep these free of length/format constraints: caps are enforced in  */
/* code after validation, which works the same on every provider.      */
/* ------------------------------------------------------------------ */

const Evidence = z
  .string()
  .describe(
    'Verbatim quote of 3-20 words copied exactly from the TRANSCRIPT in its original language and script. Use exactly "[vitals]" if the fact comes from the vitals, or "[document]" if it comes from the document extract.',
  );
const EvidencedItem = z.object({ item: z.string(), evidence: Evidence });

export const BriefSchema = z.object({
  one_line_summary: z
    .string()
    .describe("One sentence, at most 30 words, e.g. '62F, 4 days fever with productive cough and exertional breathlessness; SpO2 91%; diabetic, off metformin 2 weeks.'"),
  chief_complaint: z.string(),
  symptoms: z.array(
    z.object({
      name: z.string(),
      duration: z.string().describe("e.g. '4 days', or 'not stated'"),
      severity: z.enum(["mild", "moderate", "severe", "not_stated"]),
      evidence: Evidence,
    }),
  ),
  pertinent_negatives: z.array(EvidencedItem).describe("Symptoms the patient explicitly denied"),
  history: z.array(EvidencedItem).describe("Known conditions, past illness, pregnancy details, family history"),
  current_medications: z.array(
    z.object({
      name: z.string(),
      how_taken: z.string().describe("Dose and frequency as stated, or 'not stated'"),
      adherence: z.enum(["regular", "irregular", "stopped", "not_stated"]),
      evidence: Evidence,
    }),
  ),
  allergies: z.array(EvidencedItem),
  social_context: z
    .array(EvidencedItem)
    .describe("Living situation, work, diet, habits, money or distance barriers that affect care"),
  red_flags: z.array(z.object({ flag: z.string(), why_it_matters: z.string(), evidence: Evidence })),
  urgency: Urgency,
  urgency_reason: z.string(),
  questions_before_doctor: z
    .array(z.string())
    .describe("At most 5 short questions the coordinator should ask before the doctor joins, to fill important gaps"),
  considerations: z
    .array(z.string())
    .describe("At most 4 possibilities for the doctor to rule in or out, each starting with 'Consider'. Not a diagnosis."),
  transcript_language: z.string().describe("e.g. 'Telugu with English medical terms'"),
});
export type Brief = z.infer<typeof BriefSchema>;

export const DocumentSchema = z.object({
  document_type: z.enum(["prescription", "lab_report", "discharge_summary", "other", "unreadable"]),
  legibility: z.enum(["good", "partial", "poor"]),
  date_on_document: z.string().describe("As written on the document, or empty string"),
  medications: z.array(
    z.object({ name: z.string(), dose: z.string(), frequency: z.string(), duration: z.string() }),
  ),
  lab_values: z.array(
    z.object({ test: z.string(), value: z.string(), unit: z.string(), reference_range: z.string() }),
  ),
  full_text: z.string().describe("Line-by-line transcription of everything legible. Use '?' for any illegible word."),
  reader_notes: z.string().describe("Anything staff should double-check, e.g. an unclear dose"),
});
export type DocumentExtract = z.infer<typeof DocumentSchema>;

export const PLAN_ICONS = ["water", "walk", "food", "sleep", "breath", "medicine", "hygiene", "rest", "family", "salt", "no_smoking"] as const;

export const PlanSchema = z.object({
  summary_local: z.string().describe("2 short sentences: what the doctor found and what happens next, in the patient's language"),
  medicines: z.array(
    z.object({
      name: z.string().describe("Medicine name copied exactly as the doctor wrote it, in English letters"),
      source_text: z.string().describe("The exact phrase from the doctor's advice this medicine came from"),
      purpose_local: z.string().describe("What it is for, in 3-6 simple words"),
      morning: z.boolean(),
      afternoon: z.boolean(),
      night: z.boolean(),
      food: z.enum(["before_food", "after_food", "with_food", "any_time", "not_specified"]),
      duration_local: z.string().describe("e.g. '7 days', or 'until the doctor says stop'"),
      how_to_take_local: z.string(),
    }),
  ),
  daily_steps: z
    .array(z.object({ icon: z.enum(PLAN_ICONS), title_local: z.string(), detail_local: z.string() }))
    .describe("Exactly 3 small, specific, achievable daily actions fitted to this patient's life"),
  return_immediately_if_local: z.array(z.string()).describe("3-5 concrete warning signs, each a short sentence"),
  follow_up_local: z.string(),
  english: z.object({
    summary: z.string(),
    medicines: z.array(z.string()).describe("One line per medicine: name, timing, food, duration"),
    daily_steps: z.array(z.string()),
    return_immediately_if: z.array(z.string()),
    follow_up: z.string(),
  }),
});
export type Plan = z.infer<typeof PlanSchema>;

/* ------------------------------------------------------------------ */
/* Follow-up check-in (the days after the visit)                       */
/* ------------------------------------------------------------------ */

export const FOLLOW_ACTIONS = ["on_track", "call_again", "doctor_review", "come_in_now"] as const;
export const FollowAction = z.enum(FOLLOW_ACTIONS);
export type FollowAction = z.infer<typeof FollowAction>;
export const ACTION_RANK: Record<FollowAction, number> = { on_track: 0, call_again: 1, doctor_review: 2, come_in_now: 3 };
export const maxAction = (...a: FollowAction[]): FollowAction =>
  a.reduce((x, y) => (ACTION_RANK[y] > ACTION_RANK[x] ? y : x), "on_track" as FollowAction);

export const FollowUpRequest = z.object({
  transcript: z.string().trim().min(15, "Add a little more of the call first.").max(6000),
  daysSinceVisit: z.number().int().min(0).max(120),
  language: z.enum(["te", "hi", "en"]),
  patient: PatientSchema.default({}),
  plan: z.object({
    medicines: z.array(z.object({ name: z.string().max(120), schedule: z.string().max(200) })).max(12),
    warningSigns: z.array(z.string().max(240)).max(8),
    dailySteps: z.array(z.string().max(240)).max(3),
    followUp: z.string().max(400).default(""),
  }),
});
export type FollowUpRequest = z.infer<typeof FollowUpRequest>;

const CallEvidence = z
  .string()
  .describe("Verbatim quote of 3-20 words copied exactly from the CALL in its original language and script, or empty string if there is none.");

export const FollowUpSchema = z.object({
  medicines: z
    .array(
      z.object({
        name: z.string().describe("Exactly one of the PLAN MEDICINES names, copied as given"),
        status: z.enum(["taking_as_prescribed", "missed_some", "stopped", "not_mentioned"]),
        reason: z.string().describe("Why, in plain English (e.g. 'ran out, shop is 6 km away', 'loose motions'), or 'not stated'"),
        evidence: CallEvidence,
      }),
    )
    .describe("One entry per PLAN MEDICINE, in the same order. Use status not_mentioned and evidence '' if the call does not say."),
  overall_trend: z.enum(["better", "same", "worse", "mixed", "not_stated"]),
  trend_evidence: CallEvidence,
  warning_signs_reported: z
    .array(z.object({ sign: z.string(), evidence: CallEvidence }))
    .describe("Warning signs or new serious symptoms the patient says they HAVE now. Never include ones they deny."),
  barriers: z
    .array(z.object({ barrier: z.string(), kind: z.enum(["cost", "distance", "side_effect", "understanding", "family", "other"]), evidence: CallEvidence }))
    .describe("What is making the plan hard to follow"),
  habits: z.array(z.object({ step: z.string(), doing: z.enum(["yes", "partly", "no", "not_stated"]) })).describe("One per PLAN DAILY STEP"),
  action: FollowAction,
  action_reason: z.string(),
  staff_next_steps: z.array(z.string()).describe("At most 3 concrete things the coordinator should do now, e.g. 'Arrange metformin refill from centre stock'"),
  message_local: z
    .string()
    .describe("2-3 short sentences for the coordinator to say to the patient, in the patient's language. Encourage, address the barrier, repeat when to come back. Never change, add or stop any medicine."),
  message_english: z.string(),
  next_check_in_days: z.number().describe("Days until the next call: 1-14"),
});
export type FollowUp = z.infer<typeof FollowUpSchema>;

/* ------------------------------------------------------------------ */
/* Zod → strict JSON Schema                                            */
/* Groq strict mode needs every key required + additionalProperties    */
/* false on every object. We post-process zod's own output.            */
/* ------------------------------------------------------------------ */

type Json = { [k: string]: unknown };

export function toStrictJsonSchema(schema: z.ZodType): Json {
  const raw = z.toJSONSchema(schema, { target: "draft-7" }) as Json;
  delete raw.$schema;
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    const n = node as Json;
    if (n.type === "object" && n.properties && typeof n.properties === "object") {
      n.required = Object.keys(n.properties as Json);
      n.additionalProperties = false;
    }
    Object.values(n).forEach(walk);
  };
  walk(raw);
  return raw;
}
