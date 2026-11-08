import { maxUrgency, type Patient, type Urgency, type Vitals } from "./schemas";

/**
 * Deterministic safety layer. Runs on the device as the coordinator types
 * (no network needed) and again on the server. Its urgency can RAISE the
 * model's urgency but never lower it: a model that misses low SpO2 must not
 * be able to downgrade the case.
 *
 * Thresholds are illustrative defaults for a prototype. In production they are
 * owned and signed off by the partner's clinical team, versioned, and audited.
 */

export interface RuleFlag {
  id: string;
  label: string;
  urgency: Urgency;
  source: "vitals" | "words" | "context";
  detail: string;
}

export interface RuleResult {
  flags: RuleFlag[];
  urgency: Urgency;
}

/* ---------------------------- vitals ---------------------------- */

export function vitalRules(v: Vitals, p: Patient = {}): RuleFlag[] {
  const f: RuleFlag[] = [];
  const add = (id: string, label: string, urgency: Urgency, detail: string) =>
    f.push({ id, label, urgency, source: "vitals", detail });

  if (v.spo2 !== undefined) {
    if (v.spo2 < 90) add("spo2-critical", "Very low oxygen", "emergency", `SpO₂ ${v.spo2}% (< 90%)`);
    else if (v.spo2 < 94) add("spo2-low", "Low oxygen", "urgent", `SpO₂ ${v.spo2}% (< 94%)`);
  }

  const { systolic: s, diastolic: d } = v;
  if (s !== undefined || d !== undefined) {
    const bp = `BP ${s ?? "?"}/${d ?? "?"}`;
    if ((s ?? 0) >= 180 || (d ?? 0) >= 120) add("bp-severe", "Severely high BP", "urgent", `${bp} (≥ 180/120)`);
    else if (p.pregnant && ((s ?? 0) >= 140 || (d ?? 0) >= 90))
      add("bp-pregnancy", "High BP in pregnancy", "urgent", `${bp} (≥ 140/90 while pregnant: assess for pre-eclampsia)`);
    else if ((s ?? 0) >= 160 || (d ?? 0) >= 100) add("bp-high", "High BP", "soon", `${bp} (≥ 160/100)`);
    if (s !== undefined && s < 90) add("bp-low", "Low BP", "urgent", `${bp} (systolic < 90)`);
  }

  if (v.pulse !== undefined) {
    if (v.pulse > 120) add("pulse-high", "Very fast pulse", "urgent", `Pulse ${v.pulse}/min (> 120)`);
    else if (v.pulse < 50) add("pulse-low", "Very slow pulse", "urgent", `Pulse ${v.pulse}/min (< 50)`);
  }

  if (v.tempC !== undefined) {
    const infant = p.ageYears !== undefined && p.ageYears < 0.25;
    if (infant && v.tempC >= 38) add("fever-infant", "Fever in a baby under 3 months", "urgent", `${v.tempC} °C`);
    else if (v.tempC >= 39.5) add("fever-high", "High fever", "urgent", `${v.tempC} °C (≥ 39.5)`);
    else if (v.tempC >= 38) add("fever", "Fever", "soon", `${v.tempC} °C (≥ 38)`);
    if (v.tempC < 35) add("hypothermia", "Low body temperature", "urgent", `${v.tempC} °C (< 35)`);
  }

  if (v.glucose !== undefined) {
    if (v.glucose < 54) add("glucose-critical", "Very low blood sugar", "emergency", `${v.glucose} mg/dL (< 54)`);
    else if (v.glucose < 70) add("glucose-low", "Low blood sugar", "urgent", `${v.glucose} mg/dL (< 70)`);
    else if (v.glucose > 300) add("glucose-very-high", "Very high blood sugar", "urgent", `${v.glucose} mg/dL (> 300)`);
    else if (v.glucose > 250) add("glucose-high", "High blood sugar", "soon", `${v.glucose} mg/dL (> 250)`);
  }
  return f;
}

/* ------------------------- spoken danger signs ------------------------- */
/* English + Telugu + Hindi. Each match is checked for negation ("no chest
   pain", "నొప్పి లేదు", "दर्द नहीं") and for being a question ("ఛాతీ నొప్పి ఉందా?"). */

interface WordRule {
  id: string;
  label: string;
  urgency: Urgency;
  pregnancyUrgency?: Urgency;
  patterns: RegExp[];
}

const WORD_RULES: WordRule[] = [
  {
    id: "chest-pain",
    label: "Chest pain",
    urgency: "urgent",
    patterns: [
      /chest (pain|tightness|heaviness)|pain in (the |my |her |his )?chest/i,
      /(ఛాతీ|ఛాతి|గుండె)[^.?!\n।]{0,15}నొప్పి/u,
      /(सीने|छाती)[^.?!\n।]{0,15}दर्द/u,
    ],
  },
  {
    id: "breathless",
    label: "Breathlessness",
    urgency: "urgent",
    patterns: [
      /breathless|short(ness)? of breath|difficulty (in )?breathing|can'?t breathe|gasping/i,
      // "ఊపిరి ఆడటం లేదు" ("I can't breathe") and "साँस नहीं आ रही": here the negative IS the symptom
      /ఊపిరి\s*(ఆడ|అంద)[^.?!\n।,\s]*\s*లేదు/u,
      /(साँस|सांस)\s*(नहीं|नही)\s*(आ|ले)/u,
      /ఆయాసం|ఊపిరి (ఆడ|అంద)/u,
      /(साँस|सांस) (फूल|लेने में)/u,
    ],
  },
  {
    id: "unconscious",
    label: "Fainting or unconsciousness",
    urgency: "emergency",
    patterns: [/unconscious|fainted|passed out|not responding|collapsed/i, /స్పృహ (తప్ప|కోల్పో)|కళ్ళు తిరిగి పడ/u, /बेहोश/u],
  },
  {
    id: "seizure",
    label: "Seizure / fits",
    urgency: "emergency",
    patterns: [/seizure|convulsion|\bfits\b/i, /ఫిట్స్|మూర్ఛ/u, /दौरा पड़|मिर्गी/u],
  },
  {
    id: "bleeding",
    label: "Vomiting or coughing blood / black stool",
    urgency: "emergency",
    patterns: [
      /vomit(ing|ed)? blood|blood in (the )?(vomit|stool)|black (tarry )?stool|cough(ing|ed)? (up )?blood/i,
      /రక్తం[^.?!\n।]{0,12}(వాంతి|దగ్గు)|(వాంతి|దగ్గు)[^.?!\n।]{0,12}రక్తం/u,
      /खून की उल्टी|उल्टी में खून/u,
    ],
  },
  {
    id: "stroke",
    label: "Possible stroke signs",
    urgency: "emergency",
    patterns: [
      /(weakness|numbness) (in|of) (one side|the arm|an arm|the leg|a leg|the face)|one[- ]sided weakness|slurred speech|face (droop|drooping)/i,
      /(ఒక వైపు|ఒకవైపు)[^.?!\n।]{0,12}(బలహీన|చచ్చుబడ)|మాట ముద్ద/u,
      /लकवा|एक तरफ़? कमज़?ोरी/u,
    ],
  },
  {
    id: "self-harm",
    label: "Self-harm risk",
    urgency: "urgent",
    patterns: [/suicid|kill (myself|herself|himself)|end (my|her|his) life|don'?t want to live/i, /చచ్చిపోవాలని|ఆత్మహత్య/u, /आत्महत्या|मर जाना चाहत/u],
  },
  {
    id: "bite",
    label: "Snake or animal bite",
    urgency: "emergency",
    patterns: [/snake ?bite|bitten by (a )?snake|dog bite/i, /పాము (కాటు|కరిచ)/u, /(साँप|सांप) ने काटा/u],
  },
  {
    id: "vision",
    label: "Blurred vision",
    urgency: "soon",
    pregnancyUrgency: "urgent",
    patterns: [/blurr(ed|y) vision|vision (is )?blurr/i, /(చూపు|కళ్ళు) మసక/u, /धुंधला/u],
  },
  {
    id: "severe-headache",
    label: "Severe headache",
    urgency: "soon",
    pregnancyUrgency: "urgent",
    patterns: [
      /(severe|worst|very bad|terrible) headache|headache[^.?!\n]{0,15}\b(severe|very bad|getting worse)\b/i,
      /తల[^.?!\n।]{0,8}(బాగా|చాలా|విపరీత)[^.?!\n।]{0,8}నొప్పి/u,
      // "सिर में अभी भी बहुत दर्द" ("still a bad headache"): follow-up calls put words in between
      /सिर में[^.?!\n।]{0,12}(बहुत|तेज़?)[^.?!\n।]{0,6}दर्द/u,
    ],
  },
];

/* A denial or question only counts when it is clearly about this symptom. An
   unclear sentence stays flagged: a false alarm costs a look, a miss costs far more. */
const SP = "[ \\t]+";
const EN_FILLER = `(?:(?:any|a|an|the|have|has|had|having|get|gets|getting|got|feel|feels|feeling|felt|experience|experiences|experiencing|complain|complains|complaining|complaint|complaints|report|reports|reporting|history|h/o|c/o|of|sign|signs|symptom|symptoms|episode|episodes|further|more|new|longer|her|his|my|their|recent)${SP})*`;
const enNegation = (heads: string, joiners: string) =>
  new RegExp(`\\b(?:${heads})${SP}${EN_FILLER}(?:[\\p{L}\\p{N}'-]+(?:${SP}[\\p{L}\\p{N}'-]+)?${SP}(?:${joiners})${SP}${EN_FILLER})*$`, "iu");
const EN_NEGATIONS = [
  // "No fever and chest pain" is ambiguous, so plain "no" only spans or/nor lists.
  enNegation("no|not|never|nil|without|(?:do|does|did|has|have|had|is|was)n'?t", "or|nor"),
  enNegation("denies|denied|deny|negative for", "or|nor|and"),
];

// Whole word only: "తగ్గలేదు" (has not reduced) contains లేదు but denies nothing.
const LOCAL_NEGATOR = /(?<![\p{L}\p{M}])(?:లేదు|లేవు|లేదని|नहीं|नही)(?![\p{L}\p{M}])/u;
// "తగ్గడం లేదు", "दर्द कम नहीं": the symptom has NOT gone away.
const LOCAL_PERSISTS = /తగ్గ|ఆగ|పోవ|పోల|कम|ठीक|बंद|गया|गयी|गई|रुक|जा\s|हट|आराम/u;
// "ఛాతీ నొప్పి ఉంది జ్వరం లేదు": the negator belongs to the next symptom.
const LOCAL_AFFIRMED = /ఉంది|ఉన్నాయి|వస్తోంది|వస్తుంది|అవుతోంది|కానీ|పైగా|है|हैं|रहा|रही|और|लेकिन/u;

function isLocallyDenied(after: string): boolean {
  const clauseEnd = after.search(/[.;,\n?!।]/);
  const clause = clauseEnd >= 0 ? after.slice(0, clauseEnd) : after;
  const found = LOCAL_NEGATOR.exec(clause);
  if (!found || found.index > 20) return false;
  const between = clause.slice(0, found.index);
  return !LOCAL_PERSISTS.test(between) && !LOCAL_AFFIRMED.test(between);
}

const ASKS_FROM_THE_START = /^(?:do|does|did|any|is|are|was|were|have|has|had|when|how|what|where|why)\b/i;
const STATES_IT_HAS = /\b(?:i|she|he|we|they|my|her|his)\s+(?:have|has|had|am|is|got|feel|feels|having)\b/i;
// A different question later in the sentence: "I have chest pain, should I come?"
const ASKS_SOMETHING_ELSE = /[,;]|\b(?:what|should|shall|can|could|will|would|how|why|where|must|do i|is it)\b|ఏం|ఏమి|ఎలా|ఎందుకు|क्या कर|कैसे|कहाँ|कहां|क्यों|चाहिए/iu;

function isQuestionAboutIt(before: string, after: string): boolean {
  const clauseEnd = after.search(/[.!?\n।]/);
  if (clauseEnd < 0 || after[clauseEnd] !== "?") return false;
  const lead = (before.split(/[.!?\n।;,]/).pop() ?? "").replace(/^\s*[\p{L}\p{M}]+\s*:\s*/u, "").trimStart();
  if (ASKS_FROM_THE_START.test(lead)) return true;
  if (STATES_IT_HAS.test(lead)) return false;
  return !ASKS_SOMETHING_ELSE.test(after.slice(0, clauseEnd));
}

/** Is this match negated or only asked about? Exported for tests. */
export function isNegatedOrQuestion(text: string, start: number, end: number): boolean {
  const before = text.slice(Math.max(0, start - 40), start);
  const after = text.slice(end, end + 40);
  return EN_NEGATIONS.some((r) => r.test(before)) || isLocallyDenied(after) || isQuestionAboutIt(before, after);
}

export function wordRules(text: string, p: Patient = {}): RuleFlag[] {
  const flags: RuleFlag[] = [];
  for (const rule of WORD_RULES) {
    let hit: string | null = null;
    for (const pattern of rule.patterns) {
      const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
      for (const m of text.matchAll(re)) {
        const start = m.index ?? 0;
        if (!isNegatedOrQuestion(text, start, start + m[0].length)) {
          hit = m[0];
          break;
        }
      }
      if (hit) break;
    }
    if (hit) {
      const urgency = p.pregnant && rule.pregnancyUrgency ? rule.pregnancyUrgency : rule.urgency;
      const ctx = p.pregnant && rule.pregnancyUrgency ? " (raised: pregnant)" : "";
      flags.push({ id: rule.id, label: rule.label, urgency, source: "words", detail: `Heard: “${hit}”${ctx}` });
    }
  }
  return flags;
}

/* ----------------------------- combined ----------------------------- */

export function evaluateRules(input: { text: string; vitals: Vitals; patient: Patient }): RuleResult {
  const flags = [...vitalRules(input.vitals, input.patient), ...wordRules(input.text, input.patient)];

  // Combination: pregnancy + (headache or blurred vision) + raised BP is a classic pre-eclampsia picture
  // bp-severe takes the place of bp-pregnancy at 180/120 and above, so both must count.
  const pe = input.patient.pregnant && flags.some((f) => f.id === "bp-pregnancy" || f.id === "bp-severe") && flags.some((f) => f.id === "vision" || f.id === "severe-headache");
  if (pe)
    flags.push({
      id: "pre-eclampsia-picture",
      label: "Pregnancy + high BP + headache/vision change",
      urgency: "emergency",
      source: "context",
      detail: "Combination of signs that needs same-day referral",
    });

  return { flags, urgency: maxUrgency(...flags.map((f) => f.urgency)) };
}
