import type { Plan } from "./schemas";

/**
 * "The AI cannot prescribe." Every medicine in a take-home plan must be
 * traceable to the doctor's own words. Anything else is removed before the
 * plan reaches the screen, and the removal is reported.
 */

const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

const numbersIn = (s: string) => s.replace(/(\d),(?=\d)/g, "$1").match(/\d+(?:\.\d+)?/g) ?? [];
const numbersAllIn = (name: string, text: string) => {
  const have = new Set(numbersIn(text));
  return numbersIn(name).every((n) => have.has(n));
};

export function medicineIsInAdvice(name: string, sourceText: string, advice: string): boolean {
  const a = norm(advice);
  const n = norm(name);
  if (n.length >= 3 && a.includes(n)) return numbersAllIn(name, advice);
  // Doctor may write "Tab. Amoxyclav 625" while the model writes "Amoxyclav 625 mg":
  // accept if the distinctive first word (>= 4 letters, not a form word) is present
  // AND the quoted source phrase is present.
  const first = name
    .split(/[\s\-/]+/)
    .map(norm)
    .find((w) => w.length >= 4 && !/^(tab|tablet|tabs|cap|capsule|syrup|syp|inj|injection|drops?)$/.test(w));
  const src = norm(sourceText);
  // Any strength in the name must come from that same phrase: 5 mg can't become 10 mg.
  return Boolean(first && a.includes(first) && src.length >= 4 && a.includes(src)) && numbersAllIn(name, sourceText);
}

// A form word followed by a capitalised drug name ("Tab Paracetamol", "Cap. Amoxil"),
// so instructions like "one tablet twice daily" are not counted as a medicine.
const FORM_WORDS = /\b(?:[Tt][Aa][Bb](?:[Ll][Ee][Tt])?[Ss]?|[Cc][Aa][Pp](?:[Ss][Uu][Ll][Ee])?[Ss]?|[Ss][Yy][Pp]|[Ss]yrup|[Ii][Nn][Jj](?:ection)?|[Oo]intment|[Ii]nhaler)\.?\s+[A-Z]/g;

export function countMedicineMentions(advice: string): number {
  return (advice.match(FORM_WORDS) ?? []).length;
}

export interface GuardResult {
  plan: Plan;
  warnings: string[];
  removed: string[];
}

export function guardPlan(plan: Plan, advice: string): GuardResult {
  const warnings: string[] = [];
  const removed: string[] = [];
  const medicines = plan.medicines.filter((m) => {
    const ok = medicineIsInAdvice(m.name, m.source_text, advice);
    if (!ok) removed.push(m.name);
    return ok;
  });
  if (removed.length)
    warnings.push(`Removed ${removed.length} medicine(s) whose name or strength is not in the doctor's advice: ${removed.join(", ")}.`);

  const mentioned = countMedicineMentions(advice);
  if (mentioned > medicines.length)
    warnings.push(
      `The doctor's advice seems to mention ${mentioned} medicine(s) but the plan shows ${medicines.length}. Check before handing over.`,
    );

  for (const m of medicines)
    if (!m.morning && !m.afternoon && !m.night)
      warnings.push(`Timing for ${m.name} is not clear from the advice. Confirm with the doctor.`);

  const daily_steps = plan.daily_steps.slice(0, 3);
  const return_immediately_if_local = plan.return_immediately_if_local.slice(0, 6);
  if (return_immediately_if_local.length === 0) warnings.push("No warning signs were generated. Add them before handing over.");

  return { plan: { ...plan, medicines, daily_steps, return_immediately_if_local }, warnings, removed };
}
