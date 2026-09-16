import { WEEKDAYS } from "../domain/index.ts";
import type { Period, Preferences, Weekday } from "../domain/index.ts";
import type { TravelLookup } from "./candidates.ts";

/**
 * The minimum a period needs to expose to be scored. `CandidatePeriod`
 * satisfies this structurally.
 */
export type ScorablePeriod = {
  period: Pick<Period, "weekday" | "startMinutes" | "endMinutes" | "subject">;
  minutes: number;
  schoolId: string;
};

/**
 * Every preference is priced in the same unit: hundredths of one minute of
 * your own time. So `preferredSubject: 50` reads as "a minute teaching a
 * favourite subject is half as costly as a minute teaching anything else",
 * and the weights can be compared with each other directly.
 *
 * `yourTime` is what stops the search padding a plan. Because the giveback a
 * minute can earn (50 + 25 + 15 = 90) is always less than the 100 it costs,
 * attending a period you do not need can never improve a plan's score.
 */
export const VALUE_PER_MINUTE = {
  yourTime: -100,
  preferredSubject: 50,
  preferredWeekday: 25,
  avoidedWeekday: -25,
  preferredHours: 15,
  travelling: -100,
  overDailyMaximum: -100,
} as const;

function sitsInPreferredHours(
  prefs: Preferences,
  period: ScorablePeriod["period"],
): boolean {
  return (
    prefs.preferredTimeStartMinutes !== null &&
    prefs.preferredTimeEndMinutes !== null &&
    period.startMinutes >= prefs.preferredTimeStartMinutes &&
    period.endMinutes <= prefs.preferredTimeEndMinutes
  );
}

function valuePerMinuteOf(
  prefs: Preferences,
  period: ScorablePeriod["period"],
): number {
  let perMinute = VALUE_PER_MINUTE.yourTime;

  if (prefs.preferredSubjects.includes(period.subject)) {
    perMinute += VALUE_PER_MINUTE.preferredSubject;
  }
  if (prefs.preferredWeekdays.includes(period.weekday)) {
    perMinute += VALUE_PER_MINUTE.preferredWeekday;
  }
  if (prefs.avoidedWeekdays.includes(period.weekday)) {
    perMinute += VALUE_PER_MINUTE.avoidedWeekday;
  }
  if (sitsInPreferredHours(prefs, period)) {
    perMinute += VALUE_PER_MINUTE.preferredHours;
  }

  return perMinute;
}

/** Minutes lost moving between schools across one day, in order of time. */
function travelMinutesAcross(
  travelBetween: TravelLookup,
  periods: ScorablePeriod[],
): number {
  const ordered = [...periods].sort(
    (left, right) => left.period.startMinutes - right.period.startMinutes,
  );

  let minutes = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    minutes += travelBetween(
      ordered[index - 1].schoolId,
      ordered[index].schoolId,
    );
  }
  return minutes;
}

function overtimeMinutes(prefs: Preferences, dayMinutes: number): number {
  if (prefs.maxMinutesPerDay === null) {
    return 0;
  }
  return Math.max(0, dayMinutes - prefs.maxMinutesPerDay);
}

/**
 * Score for the periods attended on one weekday. Always negative: a plan is
 * spending your time, and the best plan is the one that spends it least
 * wastefully.
 *
 * This is the only place preference scoring is implemented. A whole plan's
 * score is the sum over its five days, which is what lets the search compare
 * partial plans: see `scoreWeek`.
 */
export function scoreDay(
  prefs: Preferences,
  travelBetween: TravelLookup,
  periods: ScorablePeriod[],
): number {
  let value = 0;
  let dayMinutes = 0;

  for (const candidate of periods) {
    value += valuePerMinuteOf(prefs, candidate.period) * candidate.minutes;
    dayMinutes += candidate.minutes;
  }

  value +=
    VALUE_PER_MINUTE.travelling * travelMinutesAcross(travelBetween, periods);
  value +=
    VALUE_PER_MINUTE.overDailyMaximum * overtimeMinutes(prefs, dayMinutes);

  return value;
}

/** Sum of the per-day scores. Days never interact, so the parts just add up. */
export function scoreWeek(
  prefs: Preferences,
  travelBetween: TravelLookup,
  periods: ScorablePeriod[],
): number {
  const byWeekday = new Map<Weekday, ScorablePeriod[]>();
  for (const candidate of periods) {
    const day = candidate.period.weekday;
    byWeekday.set(day, [...(byWeekday.get(day) ?? []), candidate]);
  }

  return WEEKDAYS.reduce(
    (total, day) =>
      total + scoreDay(prefs, travelBetween, byWeekday.get(day) ?? []),
    0,
  );
}
