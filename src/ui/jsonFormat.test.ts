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

  it("still reads the old startMinutes format", () => {
    const parsed = organizerFromFileJson(sampleWeek());
    expect(parsed.periods[0].startMinutes).toBe(9 * 60);
    expect(parsed.periods[0].endMinutes).toBe(9 * 60 + 45);
  });
});
