"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { ApiError, kb, postJSON, type BriefResponse, type FollowUpResponse, type OcrResponse, type PlanResponse, type TranscriptResult } from "@/lib/client";
import { redact } from "@/lib/redact";
import { evaluateRules } from "@/lib/safety-rules";
import { SAMPLES, type SampleCase } from "@/lib/samples";
import type { FollowUpRequest, LangCode, Patient } from "@/lib/schemas";
import { EMPTY_VITALS, parseVitals, type VitalStrings } from "@/lib/vitals";
import { BriefStep } from "./BriefStep";
import { FollowUpStep } from "./FollowUpStep";
import type { CapturedDoc } from "./DocCapture";
import { IntakeStep } from "./IntakeStep";
import { PlanStep } from "./PlanStep";
import { TracePanel, type TraceEntry } from "./TracePanel";

export interface IntakeState {
  name: string;
  ageYears: string;
  sex: "" | "female" | "male" | "other";
  pregnant: boolean;
  knownConditions: string;
  vitals: VitalStrings;
  transcript: string;
  sttLanguage: "auto" | "te" | "hi" | "en";
  lowConfidence: string[];
  doc: CapturedDoc | null;
  sampleId: string | null;
}

const EMPTY: IntakeState = {
  name: "",
  ageYears: "",
  sex: "",
  pregnant: false,
  knownConditions: "",
  vitals: EMPTY_VITALS,
  transcript: "",
  sttLanguage: "te",
  lowConfidence: [],
  doc: null,
  sampleId: null,
};

const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

type Step = 0 | 1 | 2 | 3;

export default function Workspace() {
  const [step, setStep] = useState<Step>(0);
  const [intake, setIntake] = useState<IntakeState>(EMPTY);
  const [brief, setBrief] = useState<BriefResponse | null>(null);
  const [briefKey, setBriefKey] = useState("");
  const [briefBusy, setBriefBusy] = useState(false);
  const [briefErr, setBriefErr] = useState<string | null>(null);
  const [advice, setAdvice] = useState("");
  const [planLang, setPlanLang] = useState<LangCode>("te");
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [planKey, setPlanKey] = useState("");
  const [planBusy, setPlanBusy] = useState(false);
  const [planErr, setPlanErr] = useState<string | null>(null);
  const [callText, setCallText] = useState("");
  const [callDays, setCallDays] = useState(3);
  const [follow, setFollow] = useState<FollowUpResponse | null>(null);
  const [followKey, setFollowKey] = useState("");
  const [followBusy, setFollowBusy] = useState(false);
  const [followErr, setFollowErr] = useState<string | null>(null);
  const [trace, setTrace] = useState<TraceEntry[]>([]);
  const traceId = useRef(0);

  const patch = useCallback((p: Partial<IntakeState>) => setIntake((s) => ({ ...s, ...p })), []);
  const addTrace = useCallback((e: Omit<TraceEntry, "id" | "at">) => {
    traceId.current += 1;
    const id = traceId.current;
    setTrace((t) => [...t, { ...e, id, at: now() }]);
  }, []);

  const sample: SampleCase | undefined = SAMPLES.find((s) => s.id === intake.sampleId);

  /* ---------- derived, all on device ---------- */
  const names = useMemo(() => (intake.name.trim() ? [intake.name] : []), [intake.name]);
  const redacted = useMemo(() => redact(intake.transcript, { names }), [intake.transcript, names]);
  const parsed = useMemo(() => parseVitals(intake.vitals), [intake.vitals]);
  const patient: Patient = useMemo(() => {
    const age = Number(intake.ageYears);
    return {
      ageYears: intake.ageYears.trim() && Number.isFinite(age) && age >= 0 && age <= 120 ? age : undefined,
      sex: intake.sex || undefined,
      pregnant: intake.sex === "female" && intake.pregnant ? true : undefined,
      knownConditions: intake.knownConditions.trim() ? redact(intake.knownConditions, { names }).text : undefined,
    };
  }, [intake.ageYears, intake.sex, intake.pregnant, intake.knownConditions, names]);
  const live = useMemo(() => evaluateRules({ text: redacted.text, vitals: parsed.vitals, patient }), [redacted.text, parsed.vitals, patient]);

  const briefRequest = useMemo(
    () => ({ transcript: redacted.text, patient, vitals: parsed.vitals, documentText: intake.doc?.extract.full_text || undefined }),
    [redacted.text, patient, parsed.vitals, intake.doc],
  );
  const currentBriefKey = JSON.stringify(briefRequest);

  const planRequest = useMemo(
    () =>
      brief
        ? {
            doctorAdvice: redact(advice, { names }).text,
            language: planLang,
            patient,
            context: {
              summary: brief.brief.one_line_summary.slice(0, 600),
              redFlags: [...new Set([...brief.brief.red_flags.map((f) => f.flag), ...brief.rules.flags.map((f) => f.label)])].slice(0, 10).map((s) => s.slice(0, 200)),
              socialContext: brief.brief.social_context.map((s) => s.item.slice(0, 200)).slice(0, 10),
            },
          }
        : null,
    [brief, advice, names, planLang, patient],
  );
  const currentPlanKey = JSON.stringify(planRequest);

  // The check-in is read against the plan the patient actually went home with.
  const followRequest: FollowUpRequest | null = useMemo(() => {
    if (!plan) return null;
    const slots = (m: PlanResponse["plan"]["medicines"][number]) =>
      [m.morning && "morning", m.afternoon && "afternoon", m.night && "night"].filter(Boolean).join(", ") || "timing unclear";
    const cut = (s: string, n: number) => s.slice(0, n);
    return {
      transcript: redact(callText, { names }).text,
      daysSinceVisit: callDays,
      language: plan.language,
      patient,
      plan: {
        medicines: plan.plan.medicines.slice(0, 12).map((m) => ({ name: cut(m.name, 120), schedule: cut(`${slots(m)}; ${m.food.replace(/_/g, " ")}; ${m.duration_local}`, 200) })),
        warningSigns: plan.plan.english.return_immediately_if.slice(0, 8).map((w) => cut(w, 240)),
        dailySteps: plan.plan.english.daily_steps.slice(0, 3).map((w) => cut(w, 240)),
        followUp: cut(plan.plan.english.follow_up, 400),
      },
    };
  }, [plan, callText, callDays, names, patient]);
  const currentFollowKey = JSON.stringify(followRequest);

  /* ---------- actions ---------- */
  function loadSample(s: SampleCase) {
    setIntake({
      ...EMPTY,
      sampleId: s.id,
      name: s.patient.name,
      ageYears: s.patient.ageYears,
      sex: s.patient.sex,
      pregnant: s.patient.pregnant,
      knownConditions: s.patient.knownConditions,
      vitals: { ...s.vitals },
      transcript: s.transcript,
      sttLanguage: s.sttLanguage,
    });
    setBrief(null);
    setPlan(null);
    resetFollow();
    setAdvice("");
    setPlanLang(s.planLanguage);
    setBriefErr(null);
    setPlanErr(null);
    setStep(0);
  }

  function resetFollow() {
    setFollow(null);
    setCallText("");
    setCallDays(3);
    setFollowErr(null);
  }

  function onTranscript(r: TranscriptResult, bytes: number) {
    patch({
      transcript: intake.transcript.trim() ? `${intake.transcript.trim()}\n${r.text}` : r.text,
      lowConfidence: [...intake.lowConfidence, ...r.lowConfidence.map((s) => s.text)].slice(-8),
    });
    addTrace({
      step: "Speech → text",
      model: r.meta.model,
      latencyMs: r.meta.latencyMs,
      attempts: r.meta.attempts,
      ok: true,
      notes: [
        `${r.durationSec.toFixed(0)} s of audio, uploaded ${kb(bytes)}`,
        `language detected: ${r.language}`,
        r.lowConfidence.length ? `${r.lowConfidence.length} low-confidence segment(s) flagged for review` : "no low-confidence segments",
      ],
    });
  }

  function onOcr(r: OcrResponse, bytes: number) {
    addTrace({
      step: "Document → structured",
      model: r.meta.model,
      latencyMs: r.meta.latencyMs,
      tokens: { in: r.meta.promptTokens, out: r.meta.completionTokens },
      attempts: r.meta.attempts,
      ok: r.document.document_type !== "unreadable",
      notes: [
        `image shrunk on device to ${kb(bytes)}`,
        `${r.document.medications.length} medicine(s), ${r.document.lab_values.length} lab value(s), legibility ${r.document.legibility}`,
        r.redactedCount ? `${r.redactedCount} identifier(s) on the document redacted` : "no identifiers found on the document",
      ],
    });
  }

  async function makeBrief() {
    setBriefBusy(true);
    setBriefErr(null);
    try {
      const r = await postJSON<BriefResponse>("/api/brief", briefRequest);
      setBrief(r);
      setBriefKey(currentBriefKey);
      setPlan(null);
      setStep(1);
      const g = r.grounding;
      addTrace({
        step: "Conversation → doctor brief",
        model: r.meta.model,
        latencyMs: r.meta.latencyMs,
        tokens: { in: r.meta.promptTokens, out: r.meta.completionTokens },
        attempts: r.meta.attempts,
        ok: true,
        notes: [
          `${redacted.counts.name ?? 0} name(s) removed on device, ${r.redaction.total} more identifier(s) removed by server`,
          `${g.total - g.notFound}/${g.total} facts verified against the conversation${g.notFound ? `, ${g.notFound} flagged` : ""}`,
          `urgency: model ${r.urgency.model}, rules ${r.urgency.rules} → ${r.urgency.final}${r.urgency.raisedByRules ? " (raised by rules)" : ""}`,
        ],
      });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Could not prepare the brief.";
      setBriefErr(msg);
      addTrace({ step: "Conversation → doctor brief", ok: false, notes: [msg] });
    } finally {
      setBriefBusy(false);
    }
  }

  async function makePlan() {
    if (!planRequest) return;
    setPlanBusy(true);
    setPlanErr(null);
    try {
      const r = await postJSON<PlanResponse>("/api/plan", planRequest);
      setPlan(r);
      setPlanKey(currentPlanKey);
      setFollow(null);
      setStep(2);
      addTrace({
        step: "Advice → take-home plan",
        model: r.meta.model,
        latencyMs: r.meta.latencyMs,
        tokens: { in: r.meta.promptTokens, out: r.meta.completionTokens },
        attempts: r.meta.attempts,
        ok: true,
        notes: [
          `${r.plan.medicines.length} medicine(s), all traced to the doctor's words`,
          r.removed.length ? `guard removed: ${r.removed.join(", ")}` : "guard removed nothing",
          `${r.warnings.length} warning(s) for staff`,
        ],
      });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Could not write the plan.";
      setPlanErr(msg);
      addTrace({ step: "Advice → take-home plan", ok: false, notes: [msg] });
    } finally {
      setPlanBusy(false);
    }
  }

  function onCallTranscript(r: TranscriptResult, bytes: number) {
    setCallText((t) => (t.trim() ? `${t.trim()}\n${r.text}` : r.text));
    addTrace({
      step: "Call → text",
      model: r.meta.model,
      latencyMs: r.meta.latencyMs,
      attempts: r.meta.attempts,
      ok: true,
      notes: [`${r.durationSec.toFixed(0)} s of audio, uploaded ${kb(bytes)}`, `language detected: ${r.language}`],
    });
  }

  async function makeFollowUp() {
    if (!followRequest) return;
    setFollowBusy(true);
    setFollowErr(null);
    try {
      const r = await postJSON<FollowUpResponse>("/api/followup", followRequest);
      setFollow(r);
      setFollowKey(currentFollowKey);
      const stopped = r.followUp.medicines.filter((m) => m.status === "stopped").length;
      addTrace({
        step: "Check-in call → next action",
        model: r.meta.model,
        latencyMs: r.meta.latencyMs,
        tokens: { in: r.meta.promptTokens, out: r.meta.completionTokens },
        attempts: r.meta.attempts,
        ok: true,
        notes: [
          `action: model ${r.action.model}, rules ${r.action.rules} → ${r.action.final}${r.action.raisedByRules ? " (raised by rules)" : ""}`,
          `${r.grounding.verified}/${r.grounding.total} claims verified against the call`,
          `${stopped} medicine(s) stopped, ${r.followUp.warning_signs_reported.length} warning sign(s), ${r.followUp.barriers.length} barrier(s)`,
        ],
      });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Could not check the call.";
      setFollowErr(msg);
      addTrace({ step: "Check-in call → next action", ok: false, notes: [msg] });
    } finally {
      setFollowBusy(false);
    }
  }

  function newPatient() {
    setIntake(EMPTY);
    setBrief(null);
    setPlan(null);
    resetFollow();
    setAdvice("");
    setBriefErr(null);
    setPlanErr(null);
    setStep(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const steps = [
    { n: 1, t: "Intake", s: "Coordinator, in any language", ok: true },
    { n: 2, t: "Doctor brief", s: "Remote doctor, a 30-second read", ok: Boolean(brief) },
    { n: 3, t: "Take-home plan", s: "Patient and family, at home", ok: Boolean(plan) },
    { n: 4, t: "Check-in", s: "A call in the days after", ok: Boolean(plan) },
  ];
  // How far along the bridge the coloured arch reaches: the furthest step that exists.
  // Piers sit at 0, 37.5, 62.5 and 100% (the middle two are centred in their columns).
  const reach = follow ? 3 : plan ? 2 : brief ? 1 : 0;
  const REACH_PCT = [0, 37.5, 62.5, 100];

  return (
    <>
      <div className="hero">
        <h1>
          A consultation lasts minutes.
          <br />
          Health happens in the weeks after.
        </h1>
        <p>
          Setu helps a coordinator capture the conversation in Telugu, Hindi or English, gives the remote doctor a brief where every fact can be checked, and turns the doctor&apos;s advice into a plan the patient can follow at home.
        </p>
      </div>

      <nav className="bridge" aria-label="Steps" style={{ "--reach": `${REACH_PCT[reach]}%` } as React.CSSProperties}>
        <svg className="bridge-art" viewBox="0 0 1000 72" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="arch-g" gradientUnits="userSpaceOnUse" x1="0" x2="1000" y1="0" y2="0">
              <stop offset="0" style={{ stopColor: "var(--care)" }} />
              <stop offset="1" style={{ stopColor: "var(--marigold)" }} />
            </linearGradient>
            <clipPath id="arch-reach">
              <rect className="bridge-reach" x="0" y="0" height="72" />
            </clipPath>
          </defs>
          <g className="bridge-base">
            <path d="M0 64 Q500 -40 1000 64" />
            <path d="M125 41.3V64M250 25V64M375 15.3V64M500 12V64M625 15.3V64M750 25V64M875 41.3V64" />
          </g>
          <g clipPath="url(#arch-reach)">
            <path className="bridge-arch" d="M0 64 Q500 -40 1000 64" />
            <path className="bridge-hangers" d="M125 41.3V64M250 25V64M375 15.3V64M500 12V64M625 15.3V64M750 25V64M875 41.3V64" />
          </g>
          <path className="bridge-deck" d="M0 64H1000" />
        </svg>
        <ol>
          {steps.map((s, i) => (
            <li key={s.n}>
              <button
                type="button"
                className={`pier${i <= reach && s.ok ? " reached" : ""}`}
                aria-current={step === i ? "step" : undefined}
                disabled={!s.ok}
                onClick={() => setStep(i as Step)}
              >
                <span className="knot" aria-hidden />
                <b>{s.t}</b>
                <small>{s.s}</small>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="layout">
        <div className="stack">
          {step === 0 && (
            <IntakeStep
              intake={intake}
              patch={patch}
              samples={SAMPLES}
              onSample={loadSample}
              redacted={redacted}
              parsed={parsed}
              live={live}
              onTranscript={onTranscript}
              onOcr={onOcr}
              busy={briefBusy}
              error={briefErr}
              onSubmit={makeBrief}
              hasBrief={Boolean(brief)}
              briefFresh={Boolean(brief) && briefKey === currentBriefKey}
              goBrief={() => setStep(1)}
            />
          )}
          {step === 1 && brief && (
            <BriefStep
              data={brief}
              stale={briefKey !== currentBriefKey}
              regenerating={briefBusy}
              onRegenerate={makeBrief}
              advice={advice}
              setAdvice={setAdvice}
              sampleAdvice={sample?.doctorAdvice}
              planLang={planLang}
              setPlanLang={setPlanLang}
              onPlan={makePlan}
              busy={planBusy}
              error={planErr}
              briefError={briefErr}
              back={() => setStep(0)}
            />
          )}
          {step === 2 && plan && (
            <PlanStep
              data={plan}
              patientName={intake.name.split(",")[0]?.trim() || ""}
              stale={planKey !== currentPlanKey}
              regenerating={planBusy}
              onRegenerate={makePlan}
              onNew={newPatient}
              onFollowUp={() => setStep(3)}
              back={() => setStep(1)}
            />
          )}
          {step === 3 && plan && (
            <FollowUpStep
              plan={plan}
              patient={patient}
              names={names}
              sample={sample}
              transcript={callText}
              setTranscript={setCallText}
              days={callDays}
              setDays={setCallDays}
              data={follow}
              stale={Boolean(follow) && followKey !== currentFollowKey}
              busy={followBusy}
              error={followErr}
              onSubmit={makeFollowUp}
              onTranscript={onCallTranscript}
              onNew={newPatient}
              back={() => setStep(2)}
            />
          )}
        </div>
        <aside className="aside">
          <TracePanel entries={trace} onClear={() => setTrace([])} />
        </aside>
      </div>
    </>
  );
}
