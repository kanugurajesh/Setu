import { describe, expect, it } from "vitest";
import { redact, nameVariants } from "@/lib/redact";

describe("redact", () => {
  it("removes Indian mobile numbers in common formats", () => {
    for (const p of ["9876543210", "98765 43210", "+91 98765 43210", "+91-9876543210", "09876543210"]) {
      const r = redact(`call ${p} today`);
      expect(r.text).toBe("call [PHONE_1] today");
      expect(r.counts.phone).toBe(1);
    }
  });

  it("removes Aadhaar and ABHA numbers without touching vitals", () => {
    const r = redact("Aadhaar 4321 5678 9012, ABHA 12-3456-7890-1234. SpO2 91, BP 138/86, sugar 286");
    expect(r.text).toBe("Aadhaar [AADHAAR_1], ABHA [ABHA_1]. SpO2 91, BP 138/86, sugar 286");
    expect(r.total).toBe(2);
  });

  it("does not treat a 12-digit Aadhaar as a phone number", () => {
    expect(redact("4321 5678 9012").counts.phone).toBeUndefined();
  });

  it("replaces patient names in Latin and Telugu script, longest first", () => {
    const r = redact("Lakshmamma Devi says... ఊర్లో అందరూ లక్ష్మమ్మ అని పిలుస్తారు. lakshmamma agreed.", {
      names: ["Lakshmamma Devi, లక్ష్మమ్మ"],
    });
    expect(r.text).toBe("[PATIENT] says... ఊర్లో అందరూ [PATIENT] అని పిలుస్తారు. [PATIENT] agreed.");
    expect(r.counts.name).toBe(3);
  });

  it("does not redact a short name inside another word", () => {
    expect(redact("Ravi travelled to Ravipadu", { names: ["Ravi"] }).text).toBe("[PATIENT] travelled to Ravipadu");
  });

  it("builds name variants from comma-separated scripts", () => {
    expect(nameVariants(["Ravi Kumar"])).toEqual(["Ravi Kumar", "Kumar", "Ravi"]);
  });
});
