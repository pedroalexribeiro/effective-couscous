import { describe, expect, it } from "vitest";
import { normalizePreferences } from "./preferences.ts";
import { parseWeekday } from "./time.ts";

describe("parseWeekday", () => {
  it("reads numbers, numeric strings, and Portuguese names", () => {
    expect(parseWeekday(5)).toBe(5);
    expect(parseWeekday("5")).toBe(5);
    expect(parseWeekday("Sexta")).toBe(5);
    expect(parseWeekday("sexta-feira")).toBe(5);
    expect(parseWeekday("Friday")).toBe(5);
    expect(parseWeekday("Terça")).toBe(2);
  });

  it("rejects values that are not a weekday", () => {
    expect(parseWeekday("Sábado")).toBeNull();
    expect(parseWeekday(6)).toBeNull();
    expect(parseWeekday(null)).toBeNull();
  });
});

describe("normalizePreferences", () => {
  it("turns weekday names into 1–5 and lets avoided win a conflict", () => {
    const prefs = normalizePreferences({
      preferredWeekdays: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
      avoidedWeekdays: ["Sexta"],
      preferredSubjects: ["Português"],
    });

    expect(prefs.preferredWeekdays).toEqual([1, 2, 3, 4]);
    expect(prefs.avoidedWeekdays).toEqual([5]);
    expect(prefs.preferredSubjects).toEqual(["Português"]);
  });

  it("fills missing fields so scoring never sees undefined lists", () => {
    expect(normalizePreferences(undefined)).toMatchObject({
      preferredWeekdays: [],
      avoidedWeekdays: [],
      preferredSubjects: [],
      minBreakMinutes: 0,
    });
  });
});
