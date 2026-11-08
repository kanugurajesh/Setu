/**
 * Live evaluation against Groq. Run: npm run eval
 * Needs GROQ_API_KEY in .env.local (or the environment). To evaluate a
 * self-hosted model instead (Ollama, vLLM), set LLM_BASE_URL, LLM_API_KEY,
 * TEXT_MODEL and EVAL_OUT, e.g. EVAL_OUT=eval/results-local.md.
 *
 * Measures what matters clinically rather than "does it look good":
 *  - urgency lands in the expected band (after the safety floor)
 *  - how often the model alone would have under-triaged (rules had to step in)
 *  - red-flag recall and respect for denied symptoms (negation)
 *  - share of evidence quotes verifiable against the transcript
 *  - plans: every expected medicine present, any invented medicine removed
 *  - check-in calls: next action in the expected band, per-medicine adherence
 *    read correctly, and how often the model alone would have under-escalated
 *  - latency per step
 */
import { existsSync, writeFileSync } from "node:fs";
import { CASES, type EvalCase } from "./cases";
import { ACTION_RANK, URGENCY_RANK } from "../src/lib/schemas";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!process.env.GROQ_API_KEY && !process.env.LLM_API_KEY) {
  console.error("GROQ_API_KEY (or LLM_API_KEY) is not set. Add it to .env.local first.");
  process.exit(1);
}

const { buildBrief, buildPlan, checkIn } = await import("../src/lib/server/pipeline");

// Groq's free tier allows a few thousand tokens a minute. Space cases out and
// wait out a 429 instead of recording it as a model failure.
const PAUSE_MS = Number(process.env.EVAL_PAUSE_MS ?? 20000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry one step (not the whole case) when the provider rate-limits, so tokens aren't spent twice. */
async function step<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      const out = await fn();
      await sleep(PAUSE_MS);
      return out;
    } catch (e) {
      if ((e as { code?: string }).code !== "rate_limited" || attempt >= 5) throw e;
      process.stdout.write("(429, waiting 30 s) ");
      await sleep(30_000);
    }
  }
}

interface Row {
  id: string;
  urgency: string;
  urgencyOk: boolean;
  modelAlone: boolean;
  redFlag: boolean | null;
  negationViolations: string[];
  grounding: number;
  briefMs: number;
  planMeds: string;
  inventedRemoved: number;
  planMs: number | null;
  follow: { action: string; ok: boolean; modelAlone: boolean; statusHits: number; statusTotal: number; ms: number } | null;
  error?: string;
}

const has = (hay: string[], needles: string[]) => needles.some((n) => hay.some((h) => h.toLowerCase().includes(n.toLowerCase())));

async function runCase(c: EvalCase): Promise<Row> {
  const b = await step(() => buildBrief({ transcript: c.transcript, patient: c.patient, vitals: c.vitals }));
  const rank = URGENCY_RANK[b.urgency.final];
  const urgencyOk = rank >= URGENCY_RANK[c.expect.minUrgency] && rank <= URGENCY_RANK[c.expect.maxUrgency ?? "emergency"];
  const modelAlone = URGENCY_RANK[b.urgency.model] >= URGENCY_RANK[c.expect.minUrgency];
  const flagText = [...b.brief.red_flags.map((f) => `${f.flag} ${f.why_it_matters}`), ...b.brief.symptoms.map((s) => s.name)];
  const redFlag = c.expect.redFlagAny ? has(flagText, c.expect.redFlagAny) : null;
  const symptomNames = b.brief.symptoms.map((s) => s.name.toLowerCase());
  const negationViolations = (c.expect.deniedSymptoms ?? []).filter((d) => symptomNames.some((s) => s.includes(d.toLowerCase())));

  let follow: Row["follow"] = null;
  let planMeds = "–";
  let inventedRemoved = 0;
  let planMs: number | null = null;
  if (c.plan) {
    const p = await step(() => buildPlan({
      doctorAdvice: c.plan.advice,
      language: c.plan.language,
      patient: c.patient,
      context: { summary: b.brief.one_line_summary, redFlags: b.brief.red_flags.map((f) => f.flag), socialContext: b.brief.social_context.map((s) => s.item) },
    }));
    const names = p.plan.medicines.map((m) => m.name);
    const found = c.plan.expectMeds.filter((e) => names.some((n) => n.toLowerCase().includes(e.toLowerCase())));
    planMeds = `${found.length}/${c.plan.expectMeds.length}`;
    inventedRemoved = p.removed.length;
    planMs = p.meta.latencyMs;

    if (c.followUp) {
      const f = c.followUp;
      const slots = (m: (typeof p.plan.medicines)[number]) => [m.morning && "morning", m.afternoon && "afternoon", m.night && "night"].filter(Boolean).join(", ");
      const r = await step(() => checkIn({
        transcript: f.transcript,
        daysSinceVisit: f.daysSinceVisit,
        language: c.plan.language,
        patient: c.patient,
        plan: {
          medicines: p.plan.medicines.map((m) => ({ name: m.name, schedule: `${slots(m)}; ${m.duration_local}`.slice(0, 200) })),
          warningSigns: p.plan.english.return_immediately_if.slice(0, 8),
          dailySteps: p.plan.english.daily_steps.slice(0, 3),
          followUp: p.plan.english.follow_up.slice(0, 400),
        },
      }));
      const rank = ACTION_RANK[r.action.final];
      const expect = Object.entries(f.expectStatus ?? {});
      follow = {
        action: `${r.action.model}→${r.action.final}`,
        ok: rank >= ACTION_RANK[f.minAction] && rank <= ACTION_RANK[f.maxAction ?? "come_in_now"],
        modelAlone: ACTION_RANK[r.action.model] >= ACTION_RANK[f.minAction],
        statusHits: expect.filter(([name, st]) => r.followUp.medicines.some((m) => m.name.toLowerCase().includes(name.toLowerCase()) && m.status === st)).length,
        statusTotal: expect.length,
        ms: r.meta.latencyMs,
      };
    }
  }

  return {
    id: c.id,
    urgency: `${b.urgency.model}→${b.urgency.final}`,
    urgencyOk,
    modelAlone,
    redFlag,
    negationViolations,
    grounding: b.grounding.verifiedRatio,
    briefMs: b.meta.latencyMs,
    planMeds,
    inventedRemoved,
    planMs,
    follow,
  };
}

const rows: Row[] = [];
for (const c of CASES) {
  process.stdout.write(`• ${c.id} … `);
  for (;;) {
    try {
      const r = await runCase(c);
      rows.push(r);
      console.log(`${r.urgencyOk ? "ok" : "URGENCY MISS"} (${(r.briefMs / 1000).toFixed(1)} s)${r.follow ? ` · check-in ${r.follow.ok ? "ok" : "MISS"} ${r.follow.action}` : ""}`);
      break;
    } catch (e) {
      console.log(`error: ${(e as Error).message}`);
      rows.push({ id: c.id, urgency: "–", urgencyOk: false, modelAlone: false, redFlag: null, negationViolations: [], grounding: 0, briefMs: 0, planMeds: "–", inventedRemoved: 0, planMs: null, follow: null, error: (e as Error).message });
      break;
    }
  }
}

const ok = rows.filter((r) => !r.error);
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const flagged = ok.filter((r) => r.redFlag !== null);
const follows = ok.map((r) => r.follow).filter((f): f is NonNullable<Row["follow"]> => f !== null);

const summary = [
  `| metric | value |`,
  `|---|---|`,
  `| cases | ${rows.length} (${rows.length - ok.length} errored) |`,
  `| urgency in expected band (with safety floor) | ${pct(ok.filter((r) => r.urgencyOk).length, ok.length)} |`,
  `| model alone met minimum urgency | ${pct(ok.filter((r) => r.modelAlone).length, ok.length)} |`,
  `| red-flag recall | ${pct(flagged.filter((r) => r.redFlag).length, flagged.length)} |`,
  `| denied symptoms wrongly listed | ${ok.reduce((a, r) => a + r.negationViolations.length, 0)} |`,
  `| mean evidence verified | ${pct(ok.reduce((a, r) => a + r.grounding, 0), ok.length)} |`,
  `| invented medicines removed by guard | ${ok.reduce((a, r) => a + r.inventedRemoved, 0)} |`,
  `| median brief latency | ${(median(ok.map((r) => r.briefMs)) / 1000).toFixed(1)} s |`,
  `| median plan latency | ${(median(ok.filter((r) => r.planMs !== null).map((r) => r.planMs!)) / 1000).toFixed(1)} s |`,
  `| check-in: next action in expected band (with floor) | ${pct(follows.filter((f) => f.ok).length, follows.length)} |`,
  `| check-in: model alone met minimum action | ${pct(follows.filter((f) => f.modelAlone).length, follows.length)} |`,
  `| check-in: medicine adherence read correctly | ${pct(follows.reduce((a, f) => a + f.statusHits, 0), follows.reduce((a, f) => a + f.statusTotal, 0))} |`,
  `| median check-in latency | ${(median(follows.map((f) => f.ms)) / 1000).toFixed(1)} s |`,
].join("\n");

const table = [
  `| case | urgency model→final | in band | model alone | red flag | negation misses | evidence verified | plan meds | check-in action model→final | brief s |`,
  `|---|---|---|---|---|---|---|---|---|---|`,
  ...rows.map(
    (r) =>
      `| ${r.id} | ${r.urgency} | ${r.urgencyOk ? "✓" : "✗"} | ${r.modelAlone ? "✓" : "✗"} | ${r.redFlag === null ? "–" : r.redFlag ? "✓" : "✗"} | ${r.negationViolations.join(", ") || "0"} | ${Math.round(r.grounding * 100)}% | ${r.planMeds} | ${r.follow ? `${r.follow.action} ${r.follow.ok ? "✓" : "✗"}` : "–"} | ${(r.briefMs / 1000).toFixed(1)}${r.error ? ` ⚠ ${r.error}` : ""} |`,
  ),
].join("\n");

const md = `# Eval results\n\nRun: ${new Date().toISOString()} · model: ${process.env.TEXT_MODEL || "openai/gpt-oss-120b"} · served by: ${process.env.LLM_BASE_URL ? new URL(process.env.LLM_BASE_URL).host : "Groq"}\n\n${summary}\n\n${table}\n`;
writeFileSync(process.env.EVAL_OUT || "eval/results.md", md);
writeFileSync(`eval/results-${Date.now()}.json`, JSON.stringify(rows, null, 2));
console.log("\n" + md);
