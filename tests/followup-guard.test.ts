import { describe, expect, it } from "vitest";
import { followUpFloor, guardFollowUp, messageChangesTreatment } from "@/lib/followup-guard";
import { evaluateRules } from "@/lib/safety-rules";
import { SAMPLES } from "@/lib/samples";
import { FollowUpSchema, toStrictJsonSchema, type FollowUp } from "@/lib/schemas";

const base = (over: Partial<FollowUp> = {}): FollowUp => ({
  medicines: [],
  overall_trend: "better",
  trend_evidence: "",
  warning_signs_reported: [],
  barriers: [],
  habits: [],
  action: "on_track",
  action_reason: "",
  staff_next_steps: [],
  message_local: "బాగా చేస్తున్నారు.",
  message_english: "You are doing well. Keep taking your tablets.",
  next_check_in_days: 7,
  ...over,
});

const lakshmi = SAMPLES.find((s) => s.id === "lakshmamma")!.checkIn.transcript;
const shabana = SAMPLES.find((s) => s.id === "shabana")!.checkIn.transcript;
const ravi = SAMPLES.find((s) => s.id === "ravi")!.checkIn.transcript;
const PLAN_MEDS = ["Amoxicillin-Clavulanate 625 mg", "Paracetamol 650 mg", "Metformin 500 mg"];

describe("follow-up safety floor", () => {
  it("a stopped antibiotic forces at least a doctor review, even if the model says on track", () => {
    const r = guardFollowUp(
      base({
        medicines: [{ name: "Amoxicillin-Clavulanate 625 mg", status: "stopped", reason: "loose motions", evidence: "విరేచనాలు అయ్యాయి, అందుకే నిన్నటి నుంచి ఆపేశాను" }],
      }),
      { transcript: lakshmi, patient: { ageYears: 62, sex: "female" }, planMedicines: PLAN_MEDS },
    );
    expect(r.action.final).toBe("doctor_review");
    expect(r.action.raisedByRules).toBe(true);
    expect(r.followUp.medicines[0].grounding).toBe("quoted");
  });

  it("denied breathlessness and the coordinator's question do not raise an alarm", () => {
    const rules = evaluateRules({ text: lakshmi, vitals: {}, patient: { ageYears: 62 } });
    expect(rules.flags.map((f) => f.id)).not.toContain("breathless");
  });

  it("English negations on the call are respected", () => {
    const rules = evaluateRules({ text: ravi, vitals: {}, patient: { ageYears: 34 } });
    expect(rules.flags).toEqual([]);
  });

  it("danger signs heard on a pregnancy call force 'come in now' whatever the model says", () => {
    const r = guardFollowUp(base({ action: "call_again" }), { transcript: shabana, patient: { pregnant: true, ageYears: 26, sex: "female" }, planMedicines: [] });
    expect(r.action.final).toBe("come_in_now");
    expect(r.rules.flags.map((f) => f.id)).toEqual(expect.arrayContaining(["severe-headache", "vision"]));
    expect(r.followUp.next_check_in_days).toBe(1);
  });

  it("the model can raise the action but never lower it", () => {
    const r = guardFollowUp(base({ action: "come_in_now", next_check_in_days: 9 }), { transcript: ravi, patient: {}, planMedicines: [] });
    expect(r.action.final).toBe("come_in_now");
    expect(r.action.raisedByRules).toBe(false);
  });

  it("a call that never covered the medicines is not 'on track'", () => {
    const floor = followUpFloor(base(), { flags: [], urgency: "routine" }, 2);
    expect(floor.map((f) => f.action)).toContain("call_again");
  });
});

describe("follow-up grounding and medicines", () => {
  it("fills every plan medicine in order, drops invented ones, and flags unquoted claims", () => {
    const r = guardFollowUp(
      base({
        medicines: [
          { name: "Metformin", status: "taking_as_prescribed", reason: "not stated", evidence: "Metformin ఉదయం, రాత్రి భోజనం తర్వాత వేసుకుంటున్నాను" },
          { name: "Atorvastatin 10 mg", status: "stopped", reason: "not stated", evidence: "she stopped it" },
          { name: "Paracetamol", status: "missed_some", reason: "", evidence: "she said she skipped many doses" },
        ],
      }),
      { transcript: lakshmi, patient: {}, planMedicines: PLAN_MEDS },
    );
    expect(r.followUp.medicines.map((m) => m.name)).toEqual(PLAN_MEDS);
    expect(r.followUp.medicines[0].status).toBe("not_mentioned");
    expect(r.followUp.medicines[2].grounding).toBe("quoted");
    expect(r.followUp.medicines[1].grounding).toBe("not_found");
    expect(r.warnings.join(" ")).toMatch(/Atorvastatin/);
    expect(r.warnings.join(" ")).toMatch(/no matching quote/);
  });
});

describe("the follow-up message cannot change treatment", () => {
  it.each([
    "Take 500 mg twice a day from now on.",
    "Double the dose of your BP tablet.",
    "You can stop the tablets now that the fever is gone.",
    "Start taking an iron tablet daily.",
  ])("withholds: %s", (m) => expect(messageChangesTreatment(m)).toBe(true));

  it.each(["Do not stop your tablets, the doctor will advise you.", "Keep your tablets by the water pot.", "Come to the centre on Saturday."])(
    "allows: %s",
    (m) => expect(messageChangesTreatment(m)).toBe(false),
  );

  it("blanks a message that changes treatment and says why", () => {
    const r = guardFollowUp(base({ message_english: "Stop the antibiotic and take curd rice.", message_local: "…" }), { transcript: ravi, patient: {}, planMedicines: [] });
    expect(r.followUp.message_local).toBe("");
    expect(r.warnings.join(" ")).toMatch(/withheld/);
  });
});

describe("strict schema", () => {
  it("every object in the follow-up schema is closed and fully required", () => {
    const js = JSON.stringify(toStrictJsonSchema(FollowUpSchema));
    expect(js).not.toMatch(/"additionalProperties":true/);
    expect(js).toContain('"next_check_in_days"');
  });
});
