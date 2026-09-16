import { describe, expect, it } from "vitest";
import { EMPTY_PREFERENCES } from "../domain/index.ts";
import type { Preferences } from "../domain/index.ts";
import { enumerate } from "./enumerate.ts";
import { twoNonOverlappingPeriods } from "./fixtures.ts";
import {
  VALUE_PER_MINUTE,
  VALUE_PER_PERIOD,
  scoreDay,
  type ScorablePeriod,
} from "./score.ts";

const noTravel = () => 0;

function prefs(overrides: Partial<Preferences> = {}): Preferences {
  return { ...EMPTY_PREFERENCES, ...overrides };
}

function period(
  overrides: Partial<ScorablePeriod["period"]> = {},
): ScorablePeriod {
  const details = {
    weekday: 1 as const,
    startMinutes: 9 * 60,
    endMinutes: 10 * 60,
    subject: "Math",
    ...overrides,
  };
  return {
    period: details,
    minutes: details.endMinutes - details.startMinutes,
    schoolId: "school-1",
  };
}

describe("scoreDay", () => {
  it("charges a plan for the time it asks you to spend", () => {
    expect(scoreDay(prefs(), noTravel, [period()])).toBe(
      VALUE_PER_MINUTE.yourTime * 60,
    );
  });

  it("scores an empty day as costing nothing", () => {
    expect(scoreDay(prefs(), noTravel, [])).toBe(0);
  });

  it("keeps every preference on a scale you can compare", () => {
    // The point of the shared unit: no single preference can drown out the
    // others by an order of magnitude.
    const base = scoreDay(prefs(), noTravel, [period()]);
    const subject = scoreDay(prefs({ preferredSubjects: ["Math"] }), noTravel, [
      period(),
    ]);
    const weekday = scoreDay(prefs({ preferredWeekdays: [1] }), noTravel, [
      period(),
    ]);
    const hours = scoreDay(
      prefs({
        preferredTimeStartMinutes: 8 * 60,
        preferredTimeEndMinutes: 12 * 60,
      }),
      noTravel,
      [period()],
    );

    const gains = [subject - base, weekday - base, hours - base];
    expect(Math.min(...gains)).toBeGreaterThan(0);
    // Widest gap between any two preferences stays within a factor of four.
    expect(Math.max(...gains) / Math.min(...gains)).toBeLessThanOrEqual(4);
  });

  it("never lets an extra period improve a day, however well it fits", () => {
    // This is the property that stops the search padding plans with periods
    // nobody needs. It has to hold for the most attractive period possible.
    const perfect = prefs({
      preferredSubjects: ["Math"],
      preferredWeekdays: [1],
      preferredTimeStartMinutes: 8 * 60,
      preferredTimeEndMinutes: 18 * 60,
    });
    const one = [period()];
    const two = [
      period(),
      period({ startMinutes: 11 * 60, endMinutes: 12 * 60 }),
    ];

    expect(scoreDay(perfect, noTravel, two)).toBeLessThan(
      scoreDay(perfect, noTravel, one),
    );
  });

  it("counts the minutes lost moving between schools", () => {
    const sameSchool = [
      period(),
      period({ startMinutes: 11 * 60, endMinutes: 12 * 60 }),
    ];
    const otherSchool: ScorablePeriod[] = [
      period(),
      {
        ...period({ startMinutes: 11 * 60, endMinutes: 12 * 60 }),
        schoolId: "school-2",
      },
    ];
    const travelBetween = (from: string, to: string) => (from === to ? 0 : 20);

    expect(scoreDay(prefs(), travelBetween, otherSchool)).toBe(
      scoreDay(prefs(), travelBetween, sameSchool) +
        VALUE_PER_MINUTE.travelling * 20,
    );
  });

  it("charges extra for minutes past your daily maximum", () => {
    const capped = prefs({ maxMinutesPerDay: 45 });
    expect(scoreDay(capped, noTravel, [period()])).toBe(
      VALUE_PER_MINUTE.yourTime * 60 + VALUE_PER_MINUTE.overDailyMaximum * 15,
    );
  });

  it("still prefers a normal day over an avoided day with a favourite subject", () => {
    const monday = [period({ weekday: 1, subject: "Math" })];
    const fridayFavourite = [
      period({ weekday: 5, subject: "Portuguese" }),
    ];
    const ranked = prefs({
      avoidedWeekdays: [5],
      preferredSubjects: ["Portuguese"],
    });

    expect(scoreDay(ranked, noTravel, monday)).toBeGreaterThan(
      scoreDay(ranked, noTravel, fridayFavourite),
    );
  });

  it("ranks two short avoided-day classes below one longer class there", () => {
    const oneLongFriday = [
      period({ weekday: 5, startMinutes: 9 * 60, endMinutes: 10 * 60 + 30 }),
    ];
    const twoShortFridays = [
      period({ weekday: 5, startMinutes: 9 * 60, endMinutes: 9 * 60 + 45 }),
      period({ weekday: 5, startMinutes: 11 * 60, endMinutes: 11 * 60 + 45 }),
    ];
    const avoided = prefs({ avoidedWeekdays: [5] });

    expect(scoreDay(avoided, noTravel, oneLongFriday)).toBeGreaterThan(
      scoreDay(avoided, noTravel, twoShortFridays),
    );
    expect(scoreDay(avoided, noTravel, twoShortFridays)).toBe(
      scoreDay(avoided, noTravel, oneLongFriday) + VALUE_PER_PERIOD.avoidedWeekday,
    );
  });
});

describe("ranking", () => {
  it("prefers the favourite subject between two plans of equal length", () => {
    const input = twoNonOverlappingPeriods();
    input.preferences = prefs({ preferredSubjects: ["Portuguese"] });

    const [best] = enumerate(input).configurations;

    // Both plans ask one 45-minute period of you, so the preference decides.
    expect(best.visits.map((visit) => visit.periodId)).toEqual(["p-pt-tue"]);
  });

  it("ranks the week with the fewest classes on an avoided weekday first", () => {
    const input = twoNonOverlappingPeriods();
    input.requiredTotalMinutes = 90;
    input.caseload = [
      {
        studentId: "ana",
        requiredMinutes: 90,
        requiredSubjects: [],
        subjectMinutes: {},
      },
    ];
    input.periods.push({
      id: "p-sci-fri",
      turmaId: "turma-5a",
      weekday: 5,
      startMinutes: 9 * 60,
      endMinutes: 9 * 60 + 45,
      subject: "Portuguese",
    });
    input.preferences = prefs({
      avoidedWeekdays: [5],
      preferredSubjects: ["Portuguese"],
    });

    const [best] = enumerate(input).configurations;
    expect(best.visits.map((visit) => visit.periodId).sort()).toEqual([
      "p-math-mon",
      "p-pt-tue",
    ]);
  });
});
