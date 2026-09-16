import { describe, expect, it } from "vitest";
import { sampleWeek } from "./sampleData.ts";
import { organizerFromFileJson, organizerToFileJson } from "./jsonFormat.ts";

describe("jsonFormat", () => {
  it("writes period clocks as HH:MM", () => {
    const file = organizerToFileJson(sampleWeek());
    expect(file.periods[0]).toMatchObject({
      start: "09:00",
      end: "09:45",
    });
    expect(file.periods[0]).not.toHaveProperty("startMinutes");
    expect(file.periods[0]).not.toHaveProperty("endMinutes");
  });

  it("reads HH:MM clocks back into minutes", () => {
    const roundTrip = organizerFromFileJson(organizerToFileJson(sampleWeek()));
    expect(roundTrip.periods[0]).toMatchObject({
      startMinutes: 9 * 60,
      endMinutes: 9 * 60 + 45,
    });
  });

  it("reads weekday names in preferences as 1–5", () => {
    const parsed = organizerFromFileJson({
      ...organizerToFileJson(sampleWeek()),
      preferences: {
        preferredWeekdays: ["Segunda", "Terça"],
        avoidedWeekdays: ["Sexta"],
        preferredSubjects: ["Português"],
      },
    });
    expect(parsed.preferences.preferredWeekdays).toEqual([1, 2]);
    expect(parsed.preferences.avoidedWeekdays).toEqual([5]);
  });
});
