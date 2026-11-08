import { checkEvidence, normalizeForMatch, type Grounding } from "./grounding";
import { evaluateRules, type RuleResult } from "./safety-rules";
import { ACTION_RANK, maxAction, type FollowAction, type FollowUp, type Patient } from "./schemas";

/**
 * The follow-up call is where patients are lost: a referral that never
 * happened, an antibiotic stopped on day 2, a refill that ran out. This module
 * applies the same three rules as the rest of Setu to the check-in call:
 *
 *  1. Every claim carries a quote, and the quote is checked against the call.
 *  2. A deterministic floor decides the least the coordinator must do. The
 *     model can raise the action but never lower it.
 *  3. The AI cannot prescribe. A message that changes a dose is withheld.
 */

export type CallGrounding = Grounding | "none";
type G<T> = T & { grounding: CallGrounding };

export interface GuardedFollowUp extends Omit<FollowUp, "medicines" | "warning_signs_reported" | "barriers"> {
  medicines: G<FollowUp["medicines"][number]>[];
  warning_signs_reported: G<FollowUp["warning_signs_reported"][number]>[];
  barriers: G<FollowUp["barriers"][number]>[];
  trend_grounding: CallGrounding;
}

export interface FloorReason {
  action: FollowAction;
  reason: string;
}

export interface FollowUpGuardResult {
  followUp: GuardedFollowUp;
  rules: RuleResult;
  floor: FloorReason[];
  action: { model: FollowAction; rules: FollowAction; final: FollowAction; raisedByRules: boolean };
  grounding: { total: number; verified: number; notFound: number };
  warnings: string[];
}

const ground = (evidence: string, transcript: string): CallGrounding => {
  if (!evidence.trim()) return "none";
  const g = checkEvidence(evidence, { transcript });
  // [vitals] / [document] make no sense on a phone call.
  return g === "vitals" || g === "document" ? "not_found" : g;
};

const medKey = (s: string) =>
  normalizeForMatch(s)
    .replace(/\b(tabs?|tablets?|caps?|capsules?|syp|syrup|inj|injection)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const firstWord = (s: string) => s.split(" ").find((w) => w.length >= 4) ?? "";
// A first word that names a family, not one medicine: Vitamin D3 is not Vitamin B12.
const FAMILY_WORDS = new Set(["vitamin", "insulin", "calcium", "iron", "folic"]);

const exactName = (p: string, r: string) => p === r;
const containsName = (p: string, r: string) => ` ${p} `.includes(` ${r} `) || ` ${r} `.includes(` ${p} `);
const sameFirstWord = (p: string, r: string, plan: string[]) => {
  const w = firstWord(p);
  return w !== "" && !FAMILY_WORDS.has(w) && w === firstWord(r) && plan.filter((x) => firstWord(x) === w).length === 1;
};

/**
 * Pairs each plan medicine with at most one reported medicine, strongest match
 * first, so one patient statement can never be read as being about two medicines.
 */
function matchMedicines<T extends { name: string }>(planNames: string[], reported: T[]) {
  const plan = planNames.map(medKey);
  const keys = reported.map((m) => medKey(m.name));
  const matched: (T | undefined)[] = plan.map(() => undefined);
  const free = new Set(reported.keys());
  const tests = [exactName, containsName, sameFirstWord];
  for (const test of tests) {
    plan.forEach((p, i) => {
      if (matched[i] || !p) return;
      const j = [...free].find((k) => keys[k] && test(p, keys[k], plan));
      if (j === undefined) return;
      matched[i] = reported[j];
      free.delete(j);
    });
  }
  // Left over and resembling nothing in the plan: the model made it up.
  const invented = [...free].filter((k) => !plan.some((p) => p && keys[k] && tests.some((t) => t(p, keys[k], plan)))).map((k) => reported[k].name);
  return { matched, invented };
}

/**
 * A message that changes treatment ("double the dose", "stop the tablet",
 * "take 500 mg") is never passed on. "Do not stop your tablets" is fine.
 */
const MED_WORDS = "doses?|tablets?|medicines?|medications?|pills?|insulin|antibiotics?|drugs?|syrup|capsules?|injections?|course|treatment";
const CHANGE_MED = new RegExp(`\\b(?:double|increase|decrease|reduce|halve|stop|skip|start|add|switch|discontinue|change|cut|hold|pause|avoid|replace)\\b(?:(?!\\band\\b)[^.!?]){0,30}\\b(?:${MED_WORDS})\\b`, "gi");
const TOLD_NOT_TO_TAKE = new RegExp(`\\b(?:do not|don'?t|never|not to)\\s+(?:take|taking|use|using|give|giving)\\b[^.!?]{0,30}\\b(?:${MED_WORDS})\\b`, "i");
const TOLD_AN_AMOUNT = new RegExp(`\\b(?:take|have|give|use)\\s+(?:only\\s+|just\\s+|an?\\s+)?(?:one|two|three|four|five|half|double|extra|another|\\d+)\\b[^.!?]{0,20}\\b(?:${MED_WORDS})\\b`, "i");
// Telugu and Hindi put the object first: "<medicine> ... <stop>". English letters are a medicine name.
const LOCAL_MED = "మందు|మాత్ర|టాబ్లెట్|యాంటీబయాటిక్|ఇన్సులిన్|సిరప్|డోస్|दवा|दवाई|गोली|टैबलेट|एंटीबायोटिक|इंसुलिन|सिरप|खुराक|[A-Za-z]{4,}";
const LOCAL_CHANGE = "ఆపేయ(?!వద్దు|కండి)|ఆపండి|ఆపాలి|మానేయ(?!వద్దు|కండి)|మానండి|మానాలి|తగ్గించ|పెంచ|రెట్టింపు|సగం|వేసుకోవద్దు|తీసుకోవద్దు|(?<!मत |न )बंद कर|(?<!मत |न )छोड़|मत लें|मत लो|मत खा|न लें|ना लें|दोगुन|दुगुन|आधी|कम कर|बढ़ा";
const LOCAL_CHANGE_MED = new RegExp(`(?:${LOCAL_MED})(?:(?!और|మరియు)[^.!?।,\\n]){0,25}(?:${LOCAL_CHANGE})`, "u");

export function messageChangesTreatment(msg: string): boolean {
  if (/\b\d+(\.\d+)?\s?(mg|ml|mcg|g)\b/i.test(msg)) return true;
  if (TOLD_NOT_TO_TAKE.test(msg) || TOLD_AN_AMOUNT.test(msg) || LOCAL_CHANGE_MED.test(msg)) return true;
  for (const m of msg.matchAll(CHANGE_MED)) {
    const before = msg.slice(Math.max(0, (m.index ?? 0) - 12), m.index ?? 0);
    if (!/\b(do not|don'?t|never|not)\s*$/i.test(before)) return true;
  }
  return false;
}

/** The least the coordinator must do, from facts that don't depend on the model's judgement. */
export function followUpFloor(f: FollowUp, rules: RuleResult, planMedicineCount: number): FloorReason[] {
  const out: FloorReason[] = [];
  for (const r of rules.flags)
    out.push({
      action: r.urgency === "emergency" || r.urgency === "urgent" ? "come_in_now" : "doctor_review",
      reason: `Danger sign heard on the call: ${r.label} (${r.detail})`,
    });
  for (const w of f.warning_signs_reported) out.push({ action: "come_in_now", reason: `Patient reports a warning sign: ${w.sign}` });
  for (const m of f.medicines) {
    if (m.status === "stopped") out.push({ action: "doctor_review", reason: `${m.name} stopped${m.reason && m.reason !== "not stated" ? `: ${m.reason}` : ""}` });
    else if (m.status === "missed_some") out.push({ action: "call_again", reason: `${m.name}: doses missed` });
  }
  if (f.overall_trend === "worse") out.push({ action: "doctor_review", reason: "Patient says they are getting worse" });
  if (planMedicineCount > 0 && f.medicines.every((m) => m.status === "not_mentioned"))
    out.push({ action: "call_again", reason: "The call did not cover the medicines" });
  return out;
}

export function guardFollowUp(
  raw: FollowUp,
  src: { transcript: string; patient: Patient; planMedicines: string[] },
): FollowUpGuardResult {
  const warnings: string[] = [];
  const stats = { total: 0, verified: 0, notFound: 0 };
  const tally = (g: CallGrounding) => {
    if (g === "none") return g;
    stats.total++;
    if (g === "not_found") stats.notFound++;
    else stats.verified++;
    return g;
  };

  // One row per plan medicine, in plan order. Names the model made up are dropped.
  const { matched, invented } = matchMedicines(src.planMedicines, raw.medicines);
  if (invented.length) warnings.push(`Ignored ${invented.length} medicine(s) that are not in the plan: ${invented.join(", ")}.`);
  const medicines = src.planMedicines.map((name, i) => {
    const m = matched[i];
    if (!m) return { name, status: "not_mentioned" as const, reason: "not stated", evidence: "", grounding: "none" as const };
    const grounding = tally(m.status === "not_mentioned" ? "none" : ground(m.evidence, src.transcript));
    // "Taking it" is the one claim the floor can't catch, so it has to be proven.
    if (m.status === "taking_as_prescribed" && (grounding === "none" || grounding === "not_found")) {
      warnings.push(`"${name}: taking as prescribed" has no matching quote in the call. Ask the patient.`);
      return { ...m, name, status: "not_mentioned" as const, grounding };
    }
    return { ...m, name, grounding };
  });

  const warning_signs_reported = raw.warning_signs_reported.map((w) => ({ ...w, grounding: tally(ground(w.evidence, src.transcript)) }));
  const barriers = raw.barriers.map((b) => ({ ...b, grounding: tally(ground(b.evidence, src.transcript)) }));
  const trend_grounding = raw.overall_trend === "not_stated" ? "none" : tally(ground(raw.trend_evidence, src.transcript));

  for (const m of medicines)
    if ((m.status === "stopped" || m.status === "missed_some") && m.grounding === "not_found")
      warnings.push(`"${m.name}: ${m.status.replace("_", " ")}" has no matching quote in the call. Confirm with the patient.`);
  for (const w of warning_signs_reported)
    if (w.grounding === "not_found") warnings.push(`Warning sign "${w.sign}" has no matching quote in the call. Kept, to be safe: confirm it.`);

  const rules = evaluateRules({ text: src.transcript, vitals: {}, patient: src.patient });
  const floor = followUpFloor({ ...raw, medicines }, rules, src.planMedicines.length);
  const floorAction = maxAction(...floor.map((f) => f.action));
  const final = maxAction(raw.action, floorAction);

  let { message_local, message_english } = raw;
  if (messageChangesTreatment(message_english) || messageChangesTreatment(message_local)) {
    warnings.push("The suggested message seemed to change a medicine or dose, so it was withheld. Only the doctor changes treatment.");
    message_local = "";
    message_english = "";
  }

  // When the patient must come in, the next call is tomorrow: did they reach?
  const cap = ACTION_RANK[final] >= ACTION_RANK.come_in_now ? 1 : ACTION_RANK[final] >= ACTION_RANK.doctor_review ? 2 : ACTION_RANK[final] >= ACTION_RANK.call_again ? 3 : 14;
  const next_check_in_days = Math.max(1, Math.min(cap, Math.round(raw.next_check_in_days) || 3));

  return {
    followUp: {
      ...raw,
      medicines,
      warning_signs_reported,
      barriers,
      trend_grounding,
      message_local,
      message_english,
      staff_next_steps: raw.staff_next_steps.slice(0, 3),
      habits: raw.habits.slice(0, 3),
      next_check_in_days,
    },
    rules,
    floor,
    action: { model: raw.action, rules: floorAction, final, raisedByRules: final !== raw.action },
    grounding: stats,
    warnings,
  };
}
