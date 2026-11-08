import type { Brief } from "./schemas";

/**
 * Evidence verification. The model must attach a verbatim quote to every fact.
 * We check each quote against the transcript in code, so a hallucinated
 * symptom shows up to the doctor as "not found in conversation" instead of
 * looking exactly like a real one.
 */

export type Grounding = "quoted" | "close" | "vitals" | "document" | "not_found";

export interface GroundingStats {
  total: number;
  quoted: number;
  close: number;
  structured: number; // vitals / document
  notFound: number;
  /** share of evidence items we could verify (quoted + close + structured) */
  verifiedRatio: number;
}

export const normalizeForMatch = (s: string) =>
  s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokens = (s: string) => normalizeForMatch(s).split(" ").filter(Boolean);

export function checkEvidence(evidence: string, src: { transcript: string; documentText?: string }): Grounding {
  const ev = evidence.trim();
  if (/^\[vitals\]$/i.test(ev)) return "vitals";
  if (/^\[document\]$/i.test(ev)) return src.documentText ? "document" : "not_found";

  const needle = normalizeForMatch(ev);
  if (!needle) return "not_found";
  const hay = normalizeForMatch(src.transcript);
  if (hay.includes(needle)) return "quoted";

  // Tolerate small copy differences (a dropped word, a different suffix):
  // at least 75% of the quote's words appear inside one window of the transcript.
  const ev_t = tokens(ev);
  const tr_t = tokens(src.transcript);
  if (ev_t.length >= 2 && tr_t.length) {
    const win = ev_t.length + 4;
    for (let i = 0; i <= Math.max(0, tr_t.length - ev_t.length); i++) {
      const window = new Set(tr_t.slice(i, i + win));
      const hits = ev_t.filter((t) => window.has(t)).length;
      if (hits / ev_t.length >= 0.75) return "close";
    }
  }
  return "not_found";
}

type WithGrounding<T> = T & { grounding: Grounding };

export type GroundedBrief = Omit<
  Brief,
  "symptoms" | "pertinent_negatives" | "history" | "current_medications" | "allergies" | "social_context" | "red_flags"
> & {
  symptoms: WithGrounding<Brief["symptoms"][number]>[];
  pertinent_negatives: WithGrounding<Brief["pertinent_negatives"][number]>[];
  history: WithGrounding<Brief["history"][number]>[];
  current_medications: WithGrounding<Brief["current_medications"][number]>[];
  allergies: WithGrounding<Brief["allergies"][number]>[];
  social_context: WithGrounding<Brief["social_context"][number]>[];
  red_flags: WithGrounding<Brief["red_flags"][number]>[];
};

const LIST_KEYS = ["symptoms", "pertinent_negatives", "history", "current_medications", "allergies", "social_context", "red_flags"] as const;

export function groundBrief(brief: Brief, src: { transcript: string; documentText?: string }): { brief: GroundedBrief; stats: GroundingStats } {
  const stats = { total: 0, quoted: 0, close: 0, structured: 0, notFound: 0, verifiedRatio: 1 };
  const out: Record<string, unknown> = { ...brief };
  for (const key of LIST_KEYS) {
    out[key] = (brief[key] as { evidence: string }[]).map((item) => {
      const g = checkEvidence(item.evidence, src);
      stats.total++;
      if (g === "quoted") stats.quoted++;
      else if (g === "close") stats.close++;
      else if (g === "vitals" || g === "document") stats.structured++;
      else stats.notFound++;
      return { ...item, grounding: g };
    });
  }
  stats.verifiedRatio = stats.total ? (stats.total - stats.notFound) / stats.total : 1;
  return { brief: out as GroundedBrief, stats };
}
