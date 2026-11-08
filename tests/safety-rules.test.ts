import { describe, expect, it } from "vitest";
import { evaluateRules, isNegatedOrQuestion, vitalRules, wordRules } from "@/lib/safety-rules";
import { SAMPLES } from "@/lib/samples";

const ids = (f: { id: string }[]) => f.map((x) => x.id).sort();

describe("vital rules", () => {
  it("grades oxygen saturation", () => {
    expect(vitalRules({ spo2: 96 })).toEqual([]);
    expect(vitalRules({ spo2: 91 })[0]).toMatchObject({ id: "spo2-low", urgency: "urgent" });
    expect(vitalRules({ spo2: 86 })[0]).toMatchObject({ id: "spo2-critical", urgency: "emergency" });
  });

  it("uses a lower BP threshold in pregnancy", () => {
    expect(ids(vitalRules({ systolic: 150, diastolic: 98 }))).toEqual([]);
    expect(ids(vitalRules({ systolic: 150, diastolic: 98 }, { pregnant: true }))).toEqual(["bp-pregnancy"]);
  });

  it("treats any fever in a baby under 3 months as urgent", () => {
    expect(vitalRules({ tempC: 38.2 }, { ageYears: 0.1 })[0]).toMatchObject({ id: "fever-infant", urgency: "urgent" });
    expect(vitalRules({ tempC: 38.2 }, { ageYears: 30 })[0]).toMatchObject({ id: "fever", urgency: "soon" });
  });
});

describe("spoken danger signs", () => {
  it("respects English negation within a clause", () => {
    expect(wordRules("No chest pain, no breathlessness.")).toEqual([]);
    expect(wordRules("Denies chest pain or breathlessness")).toEqual([]);
    expect(ids(wordRules("No fever, chest pain since morning"))).toEqual(["chest-pain"]);
    expect(ids(wordRules("No cough but chest pain at night"))).toEqual(["chest-pain"]);
  });

  it("ignores questions the coordinator asked", () => {
    expect(wordRules("Any chest pain?")).toEqual([]);
    expect(wordRules("ఛాతీలో నొప్పి ఉందా?")).toEqual([]);
  });

  it("detects Telugu and respects Telugu negation", () => {
    expect(ids(wordRules("దగ్గినప్పుడు ఛాతీలో కుడి వైపు నొప్పి వస్తుంది."))).toEqual(["chest-pain"]);
    expect(wordRules("ఛాతీలో నొప్పి లేదు.")).toEqual([]);
    expect(ids(wordRules("నడిచినా ఆయాసం వస్తోంది"))).toEqual(["breathless"]);
  });

  it("detects Hindi and respects Hindi negation", () => {
    expect(ids(wordRules("सीने में दर्द है"))).toEqual(["chest-pain"]);
    expect(wordRules("सीने में दर्द नहीं है")).toEqual([]);
  });

  it("raises headache and vision change in pregnancy", () => {
    const text = "सिर में बहुत दर्द है, और आँखों के सामने धुंधला दिखता है";
    expect(wordRules(text).map((f) => f.urgency)).toEqual(["soon", "soon"]);
    expect(wordRules(text, { pregnant: true }).map((f) => f.urgency)).toEqual(["urgent", "urgent"]);
  });
});

describe("sample cases end to end", () => {
  const run = (i: number, vitals: Record<string, number | undefined>) => {
    const s = SAMPLES[i];
    return evaluateRules({
      text: s.transcript,
      vitals,
      patient: { ageYears: Number(s.patient.ageYears), sex: s.patient.sex, pregnant: s.patient.pregnant },
    });
  };

  it("Telugu pneumonia case is urgent from SpO2 + words", () => {
    const r = run(0, { spo2: 91, tempC: 38.6, pulse: 108, glucose: 286 });
    expect(r.urgency).toBe("urgent");
    expect(ids(r.flags)).toEqual(["breathless", "chest-pain", "fever", "glucose-high", "spo2-low"]);
  });

  it("English hypertension case does not fire on its negations", () => {
    const r = run(1, { systolic: 172, diastolic: 104 });
    expect(ids(r.flags)).toEqual(["bp-high"]);
    expect(r.urgency).toBe("soon");
  });

  it("Hindi pregnancy case combines into an emergency", () => {
    const r = run(2, { systolic: 150, diastolic: 98 });
    expect(r.urgency).toBe("emergency");
    expect(ids(r.flags)).toContain("pre-eclampsia-picture");
  });

  it("negation helper handles Telugu after-negation", () => {
    const t = "నొప్పి లేదు";
    expect(isNegatedOrQuestion(t, 0, 6)).toBe(true);
  });
});
