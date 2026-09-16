import { describe, expect, it } from "vitest";
import { EMPTY_PREFERENCES } from "../domain/index.ts";
import type { Preferences } from "../domain/index.ts";
import { enumerate } from "./enumerate.ts";
import { twoNonOverlappingPeriods } from "./fixtures.ts";
import { VALUE_PER_MINUTE, scoreDay, type ScorablePeriod } from "./score.ts";

const noTravel = () => 0;

function prefs(overrides: Partial<Preferences> = {}): Preferences {
  return { ...EMPTY_PREFERENCES, ...overrides };
}

function period(
  overrides: Partial<ScorablePeriod["period"]> = {},
): ScorablePeriod {
  return {
    period: {
      weekday: 1,
      startMinutes: 9 * 60,
      endMinutes: 10 * 60,
      subject: "Math",
      ...overrides,
    },
    minutes: 60,
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
});

describe("ranking", () => {
  it("puts the plan that meets the targets ahead of one that overshoots", () => {
    const input = twoNonOverlappingPeriods();
    input.preferences = prefs({ preferredSubjects: ["Portuguese"] });

    const [best, ...rest] = enumerate(input).configurations;

    // Either period alone clears Ana's 45 minutes, so attending both is pure
    // waste — even though the second one is her favourite subject.
    expect(best.visits).toHaveLength(1);
    expect(rest.at(-1)?.visits).toHaveLength(2);
  });
});
