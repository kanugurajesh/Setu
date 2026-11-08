/**
 * PII redaction. Pure and dependency-free so it runs both in the browser
 * (patient names never leave the device) and on the server (defence in depth
 * for identifiers spoken aloud: Aadhaar, ABHA, phone numbers, email).
 *
 * Known limits, stated honestly: a name spoken in a different script from the
 * one typed into the name field will not be caught; addresses and village
 * names are not redacted.
 */

export type RedactionKind = "name" | "phone" | "aadhaar" | "abha" | "email";

export interface RedactionResult {
  text: string;
  counts: Partial<Record<RedactionKind, number>>;
  total: number;
}

const PATTERNS: [RedactionKind, RegExp][] = [
  ["email", /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi],
  // ABHA health ID: 14 digits written 2-4-4-4
  ["abha", /(?<!\d)\d{2}-\d{4}-\d{4}-\d{4}(?!\d)/g],
  // Aadhaar: 12 digits, first digit 2-9, optionally grouped 4-4-4
  ["aadhaar", /(?<!\d)[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}(?!\d)/g],
  // Indian mobile: optional +91 / 0 prefix, 10 digits starting 6-9, optional 5-5 split
  ["phone", /(?<![\d+])(?:\+91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g],
];

const TOKEN: Record<RedactionKind, string> = {
  name: "NAME",
  phone: "PHONE",
  aadhaar: "AADHAAR",
  abha: "ABHA",
  email: "EMAIL",
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isLatin = (s: string) => /^[\p{Script=Latin}\s.'-]+$/u.test(s);

/** Split "Lakshmamma Devi, లక్ష్మమ్మ" into full names and their parts (>=3 chars). */
export function nameVariants(names: string[]): string[] {
  const out = new Set<string>();
  for (const raw of names.flatMap((n) => n.split(","))) {
    const full = raw.trim();
    if (full.length < 2) continue;
    out.add(full);
    for (const part of full.split(/\s+/)) if (part.length >= 3) out.add(part);
  }
  // longest first so "Lakshmamma Devi" is replaced before "Lakshmamma"
  return [...out].sort((a, b) => b.length - a.length);
}

export function redact(input: string, opts: { names?: string[] } = {}): RedactionResult {
  let text = input;
  const counts: RedactionResult["counts"] = {};
  const bump = (k: RedactionKind) => (counts[k] = (counts[k] ?? 0) + 1);

  for (const name of nameVariants(opts.names ?? [])) {
    // \b only works for Latin script; for Telugu/Devanagari match the literal
    const re = isLatin(name)
      ? new RegExp(`\\b${escapeRe(name)}\\b`, "giu")
      : new RegExp(escapeRe(name), "gu");
    text = text.replace(re, () => {
      bump("name");
      return "[PATIENT]";
    });
  }

  for (const [kind, re] of PATTERNS) {
    let i = 0;
    text = text.replace(re, () => {
      bump(kind);
      i += 1;
      return `[${TOKEN[kind]}_${i}]`;
    });
  }

  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  return { text, counts, total };
}
