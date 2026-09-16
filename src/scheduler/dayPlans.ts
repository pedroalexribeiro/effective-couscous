import { WEEKDAYS } from "../domain/index.ts";
import type { OrganizerInput, Weekday } from "../domain/index.ts";
import { createTravelLookup, type TravelLookup } from "./candidates.ts";
import type { CandidatePeriod } from "./candidates.ts";
import { scoreDay } from "./score.ts";
import {
  candidateProgress,
  emptyProgress,
  quotaCount,
  type Quotas,
} from "./quotas.ts";

/** One way to spend a single weekday: a clash-free set of periods to attend. */
export type DayPlan = {
  weekday: Weekday;
  /** Chronological, which is the order the join has to apply them in. */
  candidateIndexes: number[];
  /**
   * What each period contributes, in the same order. These are shared
   * references to one array per period, not copies.
   */
  steps: Int32Array[];
  /** Uncapped total of `steps`, used only for optimistic bounds. */
  progress: Int32Array;
  minutes: number;
  score: number;
};

/**
 * Enumerating one day at a time is only correct because two periods on
 * different weekdays can never clash — see `periodsConflict`, which returns
 * false immediately when the weekdays differ. Guarded by a test.
 *
 * A single day with many loosely-clashing periods can still produce an
 * unusable number of plans, so enumeration stops at this limit and reports
 * back rather than hanging.
 */
export const MAX_PLANS_PER_DAY = 5000;

export type DayPlansResult =
  | { kind: "ok"; byWeekday: DayPlan[][] }
  | { kind: "too-many"; weekday: Weekday; periodCount: number };

function indexesByWeekday(
  candidates: CandidatePeriod[],
): Map<Weekday, number[]> {
  const byWeekday = new Map<Weekday, number[]>();
  candidates.forEach((candidate, index) => {
    const day = candidate.period.weekday;
    byWeekday.set(day, [...(byWeekday.get(day) ?? []), index]);
  });
  return byWeekday;
}

function planFrom(
  input: OrganizerInput,
  travelBetween: TravelLookup,
  candidates: CandidatePeriod[],
  quotas: Quotas,
  perCandidateProgress: Int32Array[],
  weekday: Weekday,
  chosen: number[],
): DayPlan {
  const inTimeOrder = [...chosen].sort(
    (left, right) =>
      candidates[left].period.startMinutes -
      candidates[right].period.startMinutes,
  );

  const progress = emptyProgress(quotas);
  let minutes = 0;

  for (const index of inTimeOrder) {
    minutes += candidates[index].minutes;
    const contribution = perCandidateProgress[index];
    for (let quota = 0; quota < progress.length; quota += 1) {
      progress[quota] += contribution[quota];
    }
  }

  return {
    weekday,
    candidateIndexes: inTimeOrder,
    steps: inTimeOrder.map((index) => perCandidateProgress[index]),
    progress,
    minutes,
    score: scoreDay(
      input.preferences,
      travelBetween,
      inTimeOrder.map((index) => candidates[index]),
    ),
  };
}

/**
 * Every clash-free subset of one weekday's periods, including the empty one
 * (attending nothing that day is a legitimate choice).
 */
function enumerateOneDay(
  input: OrganizerInput,
  travelBetween: TravelLookup,
  candidates: CandidatePeriod[],
  conflicts: boolean[][],
  quotas: Quotas,
  perCandidateProgress: Int32Array[],
  weekday: Weekday,
  dayIndexes: number[],
): DayPlan[] | null {
  const plans: DayPlan[] = [];
  const chosen: number[] = [];
  let overflowed = false;

  const walk = (position: number): void => {
    if (overflowed) {
      return;
    }
    if (position === dayIndexes.length) {
      if (plans.length >= MAX_PLANS_PER_DAY) {
        overflowed = true;
        return;
      }
      plans.push(
        planFrom(
          input,
          travelBetween,
          candidates,
          quotas,
          perCandidateProgress,
          weekday,
          chosen,
        ),
      );
      return;
    }

    const index = dayIndexes[position];
    walk(position + 1);

    if (!chosen.some((other) => conflicts[index][other])) {
      chosen.push(index);
      walk(position + 1);
      chosen.pop();
    }
  };

  walk(0);
  return overflowed ? null : plans;
}

export function buildDayPlans(
  input: OrganizerInput,
  candidates: CandidatePeriod[],
  conflicts: boolean[][],
  quotas: Quotas,
): DayPlansResult {
  const perCandidateProgress = candidates.map((candidate) =>
    candidateProgress(quotas, candidate),
  );
  const travelBetween = createTravelLookup(input);
  const byWeekday = indexesByWeekday(candidates);
  const plansByWeekday: DayPlan[][] = [];

  for (const weekday of WEEKDAYS) {
    const dayIndexes = byWeekday.get(weekday) ?? [];
    const plans = enumerateOneDay(
      input,
      travelBetween,
      candidates,
      conflicts,
      quotas,
      perCandidateProgress,
      weekday,
      dayIndexes,
    );
    if (!plans) {
      return { kind: "too-many", weekday, periodCount: dayIndexes.length };
    }
    // Best first, so the top-50 search finds a strong plan early and its
    // bound starts pruning immediately.
    plans.sort((left, right) => right.score - left.score);
    plansByWeekday.push(plans);
  }

  return { kind: "ok", byWeekday: plansByWeekday };
}

/** Most of each quota the days from `fromDay` onwards can still deliver. */
export function remainingCapacity(
  quotas: Quotas,
  plansByWeekday: DayPlan[][],
): Int32Array[] {
  const dayCount = plansByWeekday.length;
  const capacity: Int32Array[] = Array.from(
    { length: dayCount + 1 },
    () => new Int32Array(quotaCount(quotas)),
  );

  for (let day = dayCount - 1; day >= 0; day -= 1) {
    for (let quota = 0; quota < quotaCount(quotas); quota += 1) {
      let best = 0;
      for (const plan of plansByWeekday[day]) {
        best = Math.max(best, plan.progress[quota]);
      }
      capacity[day][quota] = capacity[day + 1][quota] + best;
    }
  }

  return capacity;
}
