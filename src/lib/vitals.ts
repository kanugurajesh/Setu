import type { Vitals } from "./schemas";

export type VitalKey = "systolic" | "diastolic" | "pulse" | "temp" | "spo2" | "glucose" | "weightKg";
export type VitalStrings = Record<VitalKey, string>;

export const EMPTY_VITALS: VitalStrings = { systolic: "", diastolic: "", pulse: "", temp: "", spo2: "", glucose: "", weightKg: "" };

export const VITAL_FIELDS: { key: VitalKey; label: string; unit: string; min: number; max: number; ph: string }[] = [
  { key: "systolic", label: "BP systolic", unit: "mmHg", min: 40, max: 300, ph: "120" },
  { key: "diastolic", label: "BP diastolic", unit: "mmHg", min: 20, max: 200, ph: "80" },
  { key: "pulse", label: "Pulse", unit: "/min", min: 20, max: 250, ph: "76" },
  { key: "temp", label: "Temperature", unit: "°C or °F", min: 30, max: 113, ph: "98.6" },
  { key: "spo2", label: "SpO₂", unit: "%", min: 50, max: 100, ph: "98" },
  { key: "glucose", label: "Sugar (random)", unit: "mg/dL", min: 10, max: 900, ph: "110" },
  { key: "weightKg", label: "Weight", unit: "kg", min: 0.5, max: 300, ph: "55" },
];

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Parses the form. Temperatures above 50 are read as °F (most clinic thermometers) and converted. */
export function parseVitals(v: VitalStrings): { vitals: Vitals; errors: Partial<Record<VitalKey, string>>; tempNote?: string } {
  const vitals: Vitals = {};
  const errors: Partial<Record<VitalKey, string>> = {};
  let tempNote: string | undefined;
  for (const f of VITAL_FIELDS) {
    const raw = v[f.key].trim();
    if (!raw) continue;
    const n = Number(raw.replace(",", "."));
    if (!Number.isFinite(n) || n < f.min || n > f.max) {
      errors[f.key] = `${f.min}–${f.max}`;
      continue;
    }
    if (f.key === "temp") {
      const c = n > 50 ? round1(((n - 32) * 5) / 9) : n;
      if (c < 30 || c > 45) {
        errors.temp = "Check value";
        continue;
      }
      if (n > 50) tempNote = `${n} °F = ${c} °C`;
      vitals.tempC = c;
    } else {
      (vitals as Record<string, number>)[f.key] = n;
    }
  }
  return { vitals, errors, tempNote };
}
