import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "./calendarLayout.ts";
import {
  calendarTimeRange,
  hourMarks,
  placeOverlappingEvents,
} from "./calendarLayout.ts";

function event(
  id: string,
  startMinutes: number,
  endMinutes: number,
): CalendarEvent {
  return {
    id,
    weekday: 1,
    startMinutes,
    endMinutes,
    title: id,
  };
}

describe("calendarTimeRange", () => {
  it("uses a school-day default when there are no events", () => {
    expect(calendarTimeRange([])).toEqual({
      startMinutes: 9 * 60,
      endMinutes: 16 * 60,
    });
  });

  it("snaps the span to whole hours", () => {
    expect(
      calendarTimeRange([event("a", 9 * 60 + 15, 15 * 60 + 30)]),
    ).toEqual({
      startMinutes: 9 * 60,
      endMinutes: 16 * 60,
    });
  });
});

describe("hourMarks", () => {
  it("includes both ends of the range", () => {
    expect(
      hourMarks({ startMinutes: 9 * 60, endMinutes: 12 * 60 }),
    ).toEqual([9 * 60, 10 * 60, 11 * 60, 12 * 60]);
  });
});

describe("placeOverlappingEvents", () => {
  it("keeps non-overlapping events in a single column", () => {
    const placed = placeOverlappingEvents([
      event("morning", 9 * 60, 10 * 60),
      event("afternoon", 11 * 60, 12 * 60),
    ]);

    expect(placed).toEqual([
      expect.objectContaining({ id: "morning", column: 0, columnCount: 1 }),
      expect.objectContaining({ id: "afternoon", column: 0, columnCount: 1 }),
    ]);
  });

  it("splits overlapping events into columns", () => {
    const placed = placeOverlappingEvents([
      event("long", 9 * 60, 10 * 60 + 30),
      event("short", 10 * 60, 11 * 60),
    ]);

    expect(placed).toEqual([
      expect.objectContaining({ id: "long", column: 0, columnCount: 2 }),
      expect.objectContaining({ id: "short", column: 1, columnCount: 2 }),
    ]);
  });

  it("reuses a free column inside an overlapping cluster", () => {
    const placed = placeOverlappingEvents([
      event("cover", 9 * 60, 12 * 60),
      event("early", 9 * 60, 10 * 60),
      event("later", 10 * 60 + 30, 11 * 60),
    ]);

    expect(placed).toEqual([
      expect.objectContaining({ id: "cover", column: 0, columnCount: 2 }),
      expect.objectContaining({ id: "early", column: 1, columnCount: 2 }),
      expect.objectContaining({ id: "later", column: 1, columnCount: 2 }),
    ]);
  });
});
