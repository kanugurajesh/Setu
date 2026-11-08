import { SAMPLES } from "../src/lib/samples";
import type { FollowAction, LangCode, Patient, Urgency, Vitals } from "../src/lib/schemas";
import { parseVitals } from "../src/lib/vitals";
import { redact } from "../src/lib/redact";

export interface EvalCase {
  id: string;
  transcript: string;
  patient: Patient;
  vitals: Vitals;
  expect: {
    minUrgency: Urgency;
    maxUrgency?: Urgency;
    /** at least one of these must appear in model red flags or symptoms */
    redFlagAny?: string[];
    /** none of these may appear as a symptom (they were denied) */
    deniedSymptoms?: string[];
  };
  plan?: { advice: string; language: LangCode; expectMeds: string[] };
  /** A day-N check-in call, read against the plan above. */
  followUp?: {
    transcript: string;
    daysSinceVisit: number;
    minAction: FollowAction;
    maxAction?: FollowAction;
    /** plan medicine (substring) → expected status */
    expectStatus?: Record<string, "taking_as_prescribed" | "missed_some" | "stopped">;
  };
}

const fromSample = (i: number, e: EvalCase["expect"], expectMeds: string[], f?: Omit<NonNullable<EvalCase["followUp"]>, "transcript" | "daysSinceVisit">): EvalCase => {
  const s = SAMPLES[i];
  return {
    id: s.id,
    transcript: redact(s.transcript, { names: [s.patient.name] }).text,
    patient: { ageYears: Number(s.patient.ageYears), sex: s.patient.sex, pregnant: s.patient.pregnant || undefined, knownConditions: s.patient.knownConditions || undefined },
    vitals: parseVitals(s.vitals).vitals,
    expect: e,
    plan: { advice: s.doctorAdvice, language: s.planLanguage, expectMeds },
    followUp: f && { transcript: redact(s.checkIn.transcript, { names: [s.patient.name] }).text, daysSinceVisit: s.checkIn.daysSinceVisit, ...f },
  };
};

export const CASES: EvalCase[] = [
  fromSample(0, { minUrgency: "urgent", redFlagAny: ["oxygen", "spo2", "saturation", "breath"] }, ["Amoxicillin", "Paracetamol", "Metformin"], {
    // stopped the antibiotic on day 2; breathlessness is denied
    minAction: "doctor_review",
    maxAction: "doctor_review",
    expectStatus: { Amoxicillin: "stopped", Metformin: "taking_as_prescribed" },
  }),
  fromSample(1, { minUrgency: "soon", maxUrgency: "urgent", deniedSymptoms: ["chest pain", "breathless", "weakness"] }, ["Amlodipine"], {
    // ran out for two days; "no chest pain, no blurred vision" must not escalate to come-in-now
    minAction: "call_again",
    maxAction: "doctor_review",
    expectStatus: { Amlodipine: "missed_some" },
  }),
  fromSample(2, { minUrgency: "emergency", redFlagAny: ["pre-eclampsia", "preeclampsia", "blood pressure", "bp", "vision"] }, ["Labetalol", "Iron"], {
    // referral never happened, headache and blurred vision persist
    minAction: "come_in_now",
  }),
  {
    id: "child-dehydration",
    transcript:
      "Mother says her 2-year-old son has had loose motions 8 times since yesterday and vomited twice. He has not passed urine since morning, is very sleepy and is not drinking. No blood in stool.",
    patient: { ageYears: 2, sex: "male" },
    vitals: { pulse: 150, tempC: 38.4, weightKg: 11 },
    expect: { minUrgency: "urgent", redFlagAny: ["dehydrat", "urine", "letharg", "sleepy", "drowsy"], deniedSymptoms: ["blood"] },
    plan: {
      advice: "Moderate-severe dehydration. ORS 50 ml after every loose motion. Syrup Zinc 20 mg once daily for 14 days. Refer to CHC today for IV fluids if not drinking within 1 hour.",
      language: "te",
      expectMeds: ["Zinc"],
    },
  },
  {
    id: "routine-refill",
    transcript:
      "Patient came for a refill of BP tablets. Taking Amlodipine 5 mg once a day regularly, never misses. No complaints. No headache, no chest pain, no breathlessness, no swelling in the legs.",
    patient: { ageYears: 58, sex: "male" },
    vitals: { systolic: 128, diastolic: 82, pulse: 74, spo2: 98 },
    expect: { minUrgency: "routine", maxUrgency: "soon", deniedSymptoms: ["headache", "chest pain", "breathless", "swelling"] },
    plan: { advice: "BP well controlled. Continue Tab Amlodipine 5 mg once daily in the morning. Review in 1 month.", language: "en", expectMeds: ["Amlodipine"] },
  },
  {
    id: "telugu-negation",
    transcript: "రోగి: మూడు రోజులుగా దగ్గు ఉంది. జ్వరం లేదు. ఆయాసం లేదు. ఛాతీలో నొప్పి లేదు. రాత్రి దగ్గు ఎక్కువగా ఉంటుంది.",
    patient: { ageYears: 40, sex: "female" },
    vitals: { spo2: 97, tempC: 36.9, pulse: 80 },
    expect: { minUrgency: "routine", maxUrgency: "soon", deniedSymptoms: ["fever", "breath", "chest"] },
  },
  {
    id: "snake-bite",
    transcript: "Patient was bitten by a snake on the left foot one hour ago while working in the paddy field. పాము కాటు. Foot is swelling, he feels dizzy.",
    patient: { ageYears: 45, sex: "male" },
    vitals: { pulse: 112, systolic: 108, diastolic: 70 },
    expect: { minUrgency: "emergency", redFlagAny: ["snake", "envenom", "bite"] },
  },
];
