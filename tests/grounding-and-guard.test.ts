import { describe, expect, it } from "vitest";
import { checkEvidence, groundBrief } from "@/lib/grounding";
import { countMedicineMentions, guardPlan, medicineIsInAdvice } from "@/lib/plan-guard";
import { BriefSchema, PlanSchema, toStrictJsonSchema, type Brief, type Plan } from "@/lib/schemas";

const transcript = "రోగి: నాలుగు రోజుల నుంచి జ్వరం వస్తోంది. దగ్గు కూడా ఉంది, కఫం పసుపు రంగులో వస్తోంది.";

describe("evidence grounding", () => {
  it("accepts exact quotes regardless of punctuation and case", () => {
    expect(checkEvidence("నాలుగు రోజుల నుంచి జ్వరం వస్తోంది", { transcript })).toBe("quoted");
    expect(checkEvidence("“దగ్గు కూడా ఉంది”", { transcript })).toBe("quoted");
  });
  it("accepts near-quotes with a dropped word", () => {
    expect(checkEvidence("కఫం పసుపు రంగులో బాగా వస్తోంది", { transcript })).toBe("close");
  });
  it("flags fabricated evidence", () => {
    expect(checkEvidence("patient has severe vomiting since yesterday", { transcript })).toBe("not_found");
  });
  it("handles structured sources", () => {
    expect(checkEvidence("[vitals]", { transcript })).toBe("vitals");
    expect(checkEvidence("[document]", { transcript })).toBe("not_found");
    expect(checkEvidence("[document]", { transcript, documentText: "Tab Metformin" })).toBe("document");
  });
  it("computes a verified ratio over the whole brief", () => {
    const brief: Brief = {
      one_line_summary: "",
      chief_complaint: "",
      symptoms: [
        { name: "fever", duration: "4 days", severity: "not_stated", evidence: "నాలుగు రోజుల నుంచి జ్వరం" },
        { name: "vomiting", duration: "1 day", severity: "severe", evidence: "vomiting since yesterday night" },
      ],
      pertinent_negatives: [],
      history: [],
      current_medications: [],
      allergies: [],
      social_context: [],
      red_flags: [{ flag: "low SpO2", why_it_matters: "", evidence: "[vitals]" }],
      urgency: "urgent",
      urgency_reason: "",
      questions_before_doctor: [],
      considerations: [],
      transcript_language: "Telugu",
    };
    const { stats, brief: g } = groundBrief(brief, { transcript });
    expect(stats).toMatchObject({ total: 3, quoted: 1, structured: 1, notFound: 1 });
    expect(g.symptoms[1].grounding).toBe("not_found");
  });
});

const advice = `1. Tab Amoxicillin-Clavulanate 625 mg, one tablet twice daily after food, for 7 days.
2. Tab Paracetamol 650 mg when fever is above 100°F.
3. Restart Tab Metformin 500 mg twice daily.`;

const med = (name: string, source_text: string, timing = true): Plan["medicines"][number] => ({
  name,
  source_text,
  purpose_local: "",
  morning: timing,
  afternoon: false,
  night: timing,
  food: "after_food",
  duration_local: "",
  how_to_take_local: "",
});

const basePlan = (medicines: Plan["medicines"]): Plan => ({
  summary_local: "",
  medicines,
  daily_steps: [1, 2, 3, 4].map(() => ({ icon: "water" as const, title_local: "", detail_local: "" })),
  return_immediately_if_local: ["x"],
  follow_up_local: "",
  english: { summary: "", medicines: [], daily_steps: [], return_immediately_if: [], follow_up: "" },
});

describe("the AI cannot prescribe", () => {
  it("matches medicines the doctor wrote, even when reformatted", () => {
    expect(medicineIsInAdvice("Amoxicillin-Clavulanate 625 mg", "", advice)).toBe(true);
    expect(medicineIsInAdvice("Paracetamol", "", advice)).toBe(true);
    expect(medicineIsInAdvice("Metformin 500mg", "Restart Tab Metformin 500 mg", advice)).toBe(true);
  });

  it("removes medicines that are not in the advice and reports it", () => {
    const g = guardPlan(basePlan([med("Paracetamol 650 mg", "Tab Paracetamol 650 mg"), med("Azithromycin 500 mg", "Tab Azithromycin")]), advice);
    expect(g.removed).toEqual(["Azithromycin 500 mg"]);
    expect(g.plan.medicines.map((m) => m.name)).toEqual(["Paracetamol 650 mg"]);
    expect(g.warnings.join(" ")).toMatch(/Removed 1 medicine/);
  });

  it("warns when the plan has fewer medicines than the advice mentions", () => {
    expect(countMedicineMentions(advice)).toBe(3);
    const g = guardPlan(basePlan([med("Paracetamol", "Tab Paracetamol")]), advice);
    expect(g.warnings.join(" ")).toMatch(/mention 3 medicine/);
  });

  it("warns on unclear timing and caps daily steps at 3", () => {
    const g = guardPlan(basePlan([med("Paracetamol", "Tab Paracetamol", false)]), "Tab Paracetamol 650 mg");
    expect(g.warnings.join(" ")).toMatch(/Timing for Paracetamol/);
    expect(g.plan.daily_steps).toHaveLength(3);
  });
});

describe("strict JSON schema", () => {
  const assertStrict = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    if (n.type === "object" && n.properties) {
      expect(n.additionalProperties).toBe(false);
      expect([...(n.required as string[])].sort()).toEqual(Object.keys(n.properties as object).sort());
    }
    Object.values(n).forEach(assertStrict);
  };
  it("every object is closed and fully required", () => {
    assertStrict(toStrictJsonSchema(BriefSchema));
    assertStrict(toStrictJsonSchema(PlanSchema));
    expect(toStrictJsonSchema(BriefSchema)).not.toHaveProperty("$schema");
  });
});
