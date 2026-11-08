import { describe, expect, it } from "vitest";
import { guardFollowUp, messageChangesTreatment } from "@/lib/followup-guard";
import { checkEvidence } from "@/lib/grounding";
import { medicineIsInAdvice } from "@/lib/plan-guard";
import { redact } from "@/lib/redact";
import { evaluateRules, wordRules } from "@/lib/safety-rules";
import type { FollowUp } from "@/lib/schemas";
import { clientIp } from "@/lib/server/http";
import { parseAge } from "@/lib/vitals";

const ids = (t: string) => wordRules(t).map((f) => f.id).sort();

describe("danger signs the negation check used to swallow", () => {
  it.each([
    ["ఊపిరి ఆడటం లేదు", "breathless"],
    ["ఊపిరి అందటం లేదు", "breathless"],
    ["साँस नहीं आ रही", "breathless"],
    ["ఛాతీ నొప్పి తగ్గలేదు", "chest-pain"],
    ["ఛాతీ నొప్పి తగ్గడం లేదు", "chest-pain"],
    ["ఆయాసం తగ్గలేదు", "breathless"],
    ["सीने में दर्द कम नहीं हुआ", "chest-pain"],
    ["ఛాతీ నొప్పి ఉంది జ్వరం లేదు", "chest-pain"],
    ["सीने में दर्द है बुखार नहीं", "chest-pain"],
    ["I did not take my tablets and I have chest pain", "chest-pain"],
    ["no relief from chest pain", "chest-pain"],
    ["I could not sleep because of chest pain", "chest-pain"],
    ["I have chest pain since morning, should I come?", "chest-pain"],
    ["I have chest pain what should I do?", "chest-pain"],
    ["She fainted yesterday, what should we do?", "unconscious"],
    ["What should I do, I have chest pain?", "chest-pain"],
  ])("flags %s", (text, id) => {
    expect(ids(text)).toContain(id);
  });

  it.each([
    "No chest pain",
    "no history of chest pain",
    "She has not had any chest pain",
    "He doesn't have chest pain",
    "no longer has chest pain",
    "Denies fever and chest pain",
    "No fever or chest pain",
    "ఛాతీ నొప్పి లేదు",
    "ఛాతీ నొప్పి ఏమీ లేదు",
    "ఆయాసం ఇప్పుడు లేదు",
    "सीने में दर्द बिल्कुल नहीं है",
    "Do you have chest pain?",
    "Do you get chest pain when you walk?",
    "Coordinator: Any chest pain or breathlessness?",
    "సమన్వయకర్త: ఆయాసం ఉందా?",
    "क्या सीने में दर्द है?",
  ])("stays quiet on %s", (text) => {
    expect(wordRules(text)).toEqual([]);
  });
});

describe("pre-eclampsia picture", () => {
  it.each([
    [150, 95],
    [185, 125],
  ])("%i/%i with a severe headache in pregnancy is an emergency", (systolic, diastolic) => {
    const r = evaluateRules({ text: "severe headache since morning", vitals: { systolic, diastolic }, patient: { pregnant: true } });
    expect(r.urgency).toBe("emergency");
  });
});

const base = (over: Partial<FollowUp> = {}): FollowUp => ({
  medicines: [],
  overall_trend: "not_stated",
  trend_evidence: "",
  warning_signs_reported: [],
  barriers: [],
  habits: [],
  action: "on_track",
  action_reason: "",
  staff_next_steps: [],
  message_local: "",
  message_english: "",
  next_check_in_days: 3,
  ...over,
});

describe("follow-up guard", () => {
  const taking = { status: "taking_as_prescribed" as const, reason: "not stated" };

  it("keeps two medicines of the same family apart", () => {
    const transcript = "I take the vitamin D3 daily. I stopped the vitamin B12 tablet";
    const r = guardFollowUp(
      base({
        medicines: [
          { name: "Vitamin D3", ...taking, evidence: "I take the vitamin D3 daily" },
          { name: "Vitamin B12", status: "stopped", reason: "side effect", evidence: "I stopped the vitamin B12 tablet" },
        ],
      }),
      { transcript, patient: {}, planMedicines: ["Vitamin D3", "Vitamin B12"] },
    );
    expect(r.followUp.medicines.map((m) => m.status)).toEqual(["taking_as_prescribed", "stopped"]);
    expect(r.action.final).toBe("doctor_review");
  });

  it("uses each reported medicine once, and an exact name wins", () => {
    const transcript = "folic acid is finished and I stopped the iron folic acid tablet";
    const r = guardFollowUp(
      base({
        medicines: [
          { name: "Folic Acid", status: "missed_some", reason: "ran out", evidence: "folic acid is finished" },
          { name: "Iron Folic Acid", status: "stopped", reason: "not stated", evidence: "I stopped the iron folic acid tablet" },
        ],
      }),
      { transcript, patient: {}, planMedicines: ["Iron Folic Acid", "Folic Acid"] },
    );
    expect(r.followUp.medicines.map((m) => m.status)).toEqual(["stopped", "missed_some"]);
  });

  it("still ignores a medicine that is not in the plan", () => {
    const r = guardFollowUp(base({ medicines: [{ name: "Vitamin C", ...taking, evidence: "" }] }), { transcript: "nothing much to report today", patient: {}, planMedicines: ["Vitamin D3"] });
    expect(r.warnings.join(" ")).toMatch(/Vitamin C/);
    expect(r.followUp.medicines[0].status).toBe("not_mentioned");
  });

  it.each(["", "I take all my tablets on time every day"])("does not accept 'taking' without a real quote (%s)", (evidence) => {
    const r = guardFollowUp(base({ medicines: [{ name: "Amlodipine", ...taking, evidence }] }), { transcript: "Hello, the weather is hot here today", patient: {}, planMedicines: ["Amlodipine"] });
    expect(r.followUp.medicines[0].status).toBe("not_mentioned");
    expect(r.action.final).toBe("call_again");
    expect(r.warnings.join(" ")).toMatch(/no matching quote/);
  });

  it("calls back within 3 days when there is a barrier to fix", () => {
    const r = guardFollowUp(base({ next_check_in_days: 14, medicines: [{ name: "Amlodipine", status: "missed_some", reason: "ran out", evidence: "tablets ran out two days ago" }] }), {
      transcript: "tablets ran out two days ago",
      patient: {},
      planMedicines: ["Amlodipine"],
    });
    expect(r.action.final).toBe("call_again");
    expect(r.followUp.next_check_in_days).toBe(3);
  });

  it("withholds a treatment change written only in the patient's language", () => {
    const r = guardFollowUp(base({ message_local: "యాంటీబయాటిక్ ఆపేయండి", message_english: "Keep going, you are doing well." }), { transcript: "nothing much to report today", patient: {}, planMedicines: [] });
    expect(r.followUp.message_local).toBe("");
    expect(r.followUp.message_english).toBe("");
  });

  it.each(["Do not take the antibiotic any more.", "Take two tablets at night from today.", "Discontinue the medicine for now.", "మాత్రలు మానేయండి", "Metformin ఆపేయండి", "दवा बंद कर दें", "गोली मत लें"])("withholds: %s", (m) => {
    expect(messageChangesTreatment(m)).toBe(true);
  });

  it.each([
    "Please keep taking your tablets every day.",
    "Don't forget to take your medicine.",
    "Do not change your medicines, the doctor will advise.",
    "Reduce salt and take your tablets.",
    "మాత్రలు ఆపవద్దు",
    "మాత్రలు మానకండి",
    "दवा बंद मत करें",
    "दवा मत छोड़ें",
    "दवा लेते रहें और नमक कम करें",
  ])("allows: %s", (m) => {
    expect(messageChangesTreatment(m)).toBe(false);
  });
});

describe("plan guard keeps the doctor's strength", () => {
  const advice = "Tab Amlodipine 5 mg once daily at night for 10 days";
  it("rejects a changed strength, even if that number appears elsewhere", () => {
    expect(medicineIsInAdvice("Amlodipine 10 mg", "Tab Amlodipine 5 mg", advice)).toBe(false);
    expect(medicineIsInAdvice("Amlodipine 50 mg", "Tab Amlodipine 5 mg", advice)).toBe(false);
  });
  it("accepts the real one, reformatted or with no strength", () => {
    expect(medicineIsInAdvice("Amlodipine 5mg", "Tab Amlodipine 5 mg", advice)).toBe(true);
    expect(medicineIsInAdvice("Amlodipine", "Tab Amlodipine 5 mg", advice)).toBe(true);
    expect(medicineIsInAdvice("Vitamin D3", "Cap Vitamin D3", "Cap Vitamin D3 weekly")).toBe(true);
    expect(medicineIsInAdvice("Calcium 1000 mg", "Tab Calcium 1,000 mg", "Tab Calcium 1,000 mg daily")).toBe(true);
  });
});

describe("redaction", () => {
  it("removes more number formats", () => {
    expect(redact("call 987 654 3210").text).toBe("call [PHONE_1]");
    expect(redact("ABHA 91234567890123").text).toBe("ABHA [ABHA_1]");
  });
  it("leaves BP and short numbers alone", () => {
    expect(redact("BP 138/86, pulse 108, sugar 286, 3 days").total).toBe(0);
  });
  it("does not cut a name out of the middle of a word", () => {
    expect(redact("आराम करें", { names: ["राम"] }).text).toBe("आराम करें");
    expect(redact("राम को बुखार है", { names: ["राम"] }).text).toBe("[PATIENT] को बुखार है");
  });
  it("still catches a name with a case ending attached", () => {
    expect(redact("లక్ష్మమ్మకు జ్వరం", { names: ["లక్ష్మమ్మ"] }).text).toBe("[PATIENT]కు జ్వరం");
  });
});

describe("[vitals] evidence", () => {
  it("only counts when vitals were recorded", () => {
    expect(checkEvidence("[vitals]", { transcript: "x" })).toBe("not_found");
    expect(checkEvidence("[vitals]", { transcript: "x", hasVitals: true })).toBe("vitals");
  });
});

describe("rate limit key", () => {
  const req = (xff: string) => new Request("http://x/", { headers: { "x-forwarded-for": xff } });
  it("ignores the entries a client can fake", () => {
    expect(clientIp(req("1.1.1.1, 9.9.9.9"), 1)).toBe("9.9.9.9");
    expect(clientIp(req("2.2.2.2, 9.9.9.9"), 1)).toBe("9.9.9.9");
  });
  it("supports more than one proxy", () => {
    expect(clientIp(req("1.1.1.1, 9.9.9.9, 8.8.8.8"), 2)).toBe("9.9.9.9");
  });
  it("shares one bucket when there is no proxy to trust", () => {
    expect(clientIp(req("1.1.1.1"), 0)).toBe("local");
  });
});

describe("age field", () => {
  it.each([
    ["45", 45],
    ["0.5", 0.5],
    ["2 months", 0.167],
    ["3 weeks", 0.058],
    ["10 days", 0.027],
    ["45 yrs", 45],
  ])("reads %s", (raw, years) => expect(parseAge(raw)).toEqual({ years }));

  it("is empty when blank and an error when unreadable", () => {
    expect(parseAge("  ")).toEqual({});
    expect(parseAge("two months").error).toBeTruthy();
    expect(parseAge("200").error).toBeTruthy();
  });

  it("lets the infant fever rule run for a 2-month-old", () => {
    const r = evaluateRules({ text: "", vitals: { tempC: 38.2 }, patient: { ageYears: parseAge("2 months").years } });
    expect(r.flags[0]).toMatchObject({ id: "fever-infant", urgency: "urgent" });
  });
});
