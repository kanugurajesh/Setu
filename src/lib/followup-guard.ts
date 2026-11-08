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

const sameMedicine = (a: string, b: string) => {
  const x = normalizeForMatch(a).replace(/\b(tab|tablet|cap|capsule|syp|syrup)\b/g, "").trim();
  const y = normalizeForMatch(b).replace(/\b(tab|tablet|cap|capsule|syp|syrup)\b/g, "").trim();
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const first = (s: string) => s.split(" ").find((w) => w.length >= 4) ?? "";
  return first(x) !== "" && first(x) === first(y);
};

/**
 * A message that changes treatment ("double the dose", "stop the tablet",
 * "take 500 mg") is never passed on. "Do not stop your tablets" is fine.
 */
export function messageChangesTreatment(msg: string): boolean {
  if (/\b\d+(\.\d+)?\s?(mg|ml|mcg|g)\b/i.test(msg)) return true;
  const re = /\b(double|increase|decrease|reduce|halve|stop|skip|start|add|switch)\b[^.!?]{0,30}\b(doses?|tablets?|medicines?|pills?|insulin|antibiotics?|drugs?|syrup|capsules?|injections?|course|treatment)\b/gi;
  for (const m of msg.matchAll(re)) {
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
  const invented = raw.medicines.filter((m) => !src.planMedicines.some((p) => sameMedicine(p, m.name))).map((m) => m.name);
  if (invented.length) warnings.push(`Ignored ${invented.length} medicine(s) that are not in the plan: ${invented.join(", ")}.`);
  const medicines = src.planMedicines.map((name) => {
    const m = raw.medicines.find((x) => sameMedicine(name, x.name));
    if (!m) return { name, status: "not_mentioned" as const, reason: "not stated", evidence: "", grounding: "none" as const };
    const grounding = tally(m.status === "not_mentioned" ? "none" : ground(m.evidence, src.transcript));
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
  if (messageChangesTreatment(message_english)) {
    warnings.push("The suggested message seemed to change a medicine or dose, so it was withheld. Only the doctor changes treatment.");
    message_local = "";
    message_english = "";
  }

  // When the patient must come in, the next call is tomorrow: did they reach?
  const cap = ACTION_RANK[final] >= ACTION_RANK.come_in_now ? 1 : ACTION_RANK[final] >= ACTION_RANK.doctor_review ? 2 : 14;
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
