import type { DayPlan } from "./dayPlans.ts";
import { addCapped, quotaCount, stateKey, type Quotas } from "./quotas.ts";

/** What the days from some point onwards can still do, given progress so far. */
export type JoinStats = {
  /** How many ways those days can finish with every quota satisfied. */
  count: number;
  /** Best score they can add, or -Infinity when they cannot finish at all. */
  bestScore: number;
};

const IMPOSSIBLE: JoinStats = {
  count: 0,
  bestScore: Number.NEGATIVE_INFINITY,
};

export type Join = {
  /** Memoised. `state` must already be capped. */
  from: (day: number, state: Int32Array) => JoinStats;
  statesCached: () => number;
};

const PROGRESS_EVERY_STATES = 2000;

/**
 * Joins the independent weekdays back into whole weeks.
 *
 * The search abandons a branch on exactly three grounds:
 *
 *  - impossible: the days left cannot deliver enough of some quota, so no
 *    completion exists. `remainingCapacity` gives the optimistic best case,
 *    which makes this check safe — it only ever rejects genuinely dead ends.
 *  - already answered: this day and this capped progress were solved before.
 *    Because progress is capped at each requirement, two different pasts that
 *    reach the same capped progress have identical futures.
 *
 * It never abandons a branch for having already succeeded, which is what the
 * previous implementation did and why it could not see any week that did more
 * than the bare minimum.
 */
export function createJoin(
  quotas: Quotas,
  plansByWeekday: DayPlan[][],
  /** From `remainingCapacity`: the optimistic best each day range can add. */
  capacity: Int32Array[],
  onProgress?: (statesCached: number) => void,
): Join {
  const quotaTotal = quotaCount(quotas);
  const dayCount = plansByWeekday.length;
  const memoByDay: Array<Map<string, JoinStats>> = Array.from(
    { length: dayCount },
    () => new Map(),
  );
  // One reusable buffer per depth. Nothing outside `from` ever holds on to a
  // state, so merging into scratch space keeps the hot loop allocation-free.
  const scratchByDay: Int32Array[] = Array.from(
    { length: dayCount },
    () => new Int32Array(quotaTotal),
  );
  let cached = 0;

  const cannotFinish = (day: number, state: Int32Array): boolean => {
    for (let quota = 0; quota < quotaTotal; quota += 1) {
      if (state[quota] + capacity[day][quota] < quotas.caps[quota]) {
        return true;
      }
    }
    return false;
  };

  const from = (day: number, state: Int32Array): JoinStats => {
    if (cannotFinish(day, state)) {
      return IMPOSSIBLE;
    }
    // Past the last day with nothing missing: exactly one way to finish, and
    // it adds no score.
    if (day === dayCount) {
      return { count: 1, bestScore: 0 };
    }

    const memo = memoByDay[day];
    const key = stateKey(state);
    const known = memo.get(key);
    if (known) {
      return known;
    }

    const merged = scratchByDay[day];
    let count = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const plan of plansByWeekday[day]) {
      const { progress } = plan;
      for (let quota = 0; quota < quotaTotal; quota += 1) {
        const sum = state[quota] + progress[quota];
        const cap = quotas.caps[quota];
        merged[quota] = sum < cap ? sum : cap;
      }

      const rest = from(day + 1, merged);
      if (rest.count === 0) {
        continue;
      }
      count += rest.count;
      const reachable = plan.score + rest.bestScore;
      if (reachable > bestScore) {
        bestScore = reachable;
      }
    }

    const stats = count === 0 ? IMPOSSIBLE : { count, bestScore };
    memo.set(key, stats);
    cached += 1;
    if (onProgress && cached % PROGRESS_EVERY_STATES === 0) {
      onProgress(cached);
    }
    return stats;
  };

  return { from, statesCached: () => cached };
}

export type Combination = {
  /** One day plan index per weekday. */
  planIndexes: number[];
  score: number;
  periodCount: number;
};

function isBetter(left: Combination, right: Combination): boolean {
  if (left.score !== right.score) {
    return left.score > right.score;
  }
  return left.periodCount < right.periodCount;
}

/**
 * Every week that is worth proposing, highest score first, ties broken by
 * using fewer periods.
 *
 * The join's exact remaining-count lookup skips days that cannot finish.
 * `worthProposing` gets the last word on a finished week, so padded weeks
 * never enter the list.
 */
export function selectBestCombinations(
  quotas: Quotas,
  plansByWeekday: DayPlan[][],
  join: Join,
  worthProposing: (planIndexes: number[]) => boolean,
): Combination[] {
  const found: Combination[] = [];
  const dayCount = plansByWeekday.length;

  const walk = (
    day: number,
    state: Int32Array,
    score: number,
    periodCount: number,
    picks: number[],
  ): void => {
    if (day === dayCount) {
      if (worthProposing(picks)) {
        found.push({ planIndexes: [...picks], score, periodCount });
      }
      return;
    }

    for (let planIndex = 0; planIndex < plansByWeekday[day].length; planIndex += 1) {
      const plan = plansByWeekday[day][planIndex];
      const next = addCapped(quotas, state, plan.progress);
      if (join.from(day + 1, next).count === 0) {
        continue;
      }
      picks.push(planIndex);
      walk(
        day + 1,
        next,
        score + plan.score,
        periodCount + plan.candidateIndexes.length,
        picks,
      );
      picks.pop();
    }
  };

  walk(0, new Int32Array(quotaCount(quotas)), 0, 0, []);
  found.sort((left, right) => (isBetter(left, right) ? -1 : 1));
  return found;
}
