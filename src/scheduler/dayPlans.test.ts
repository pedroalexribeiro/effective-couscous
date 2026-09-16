import { describe, expect, it } from "vitest";
import { WEEKDAYS } from "../domain/index.ts";
import {
  buildCandidates,
  buildConflictMatrix,
  periodsConflict,
} from "./candidates.ts";
import { buildDayPlans } from "./dayPlans.ts";
import { buildQuotas } from "./quotas.ts";
import { sampleWeek } from "../ui/sampleData.ts";
import { twoNonOverlappingPeriods } from "./fixtures.ts";

describe("buildDayPlans", () => {
  it("never reports a clash between periods on different weekdays", () => {
    // The whole design rests on this: it is what makes the five weekdays
    // independent and lets them be enumerated separately.
    const input = sampleWeek();
    const candidates = buildCandidates(input);

    for (const left of candidates) {
      for (const right of candidates) {
        if (left.period.weekday !== right.period.weekday) {
          expect(periodsConflict(input, left, right)).toBe(false);
        }
      }
    }
  });

  it("offers attending nothing and attending the period on each day", () => {
    const input = twoNonOverlappingPeriods();
    const candidates = buildCandidates(input);
    const quotas = buildQuotas(input);
    const result = buildDayPlans(
      input,
      candidates,
      buildConflictMatrix(input, candidates),
      quotas,
    );

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    expect(result.byWeekday).toHaveLength(WEEKDAYS.length);
    // Monday and Tuesday hold one period each: attend it, or do not.
    expect(result.byWeekday[0]).toHaveLength(2);
    expect(result.byWeekday[1]).toHaveLength(2);
    // Nothing is eligible on the other days, leaving only the empty plan.
    expect(result.byWeekday[2]).toHaveLength(1);
    expect(result.byWeekday[2][0].candidateIndexes).toEqual([]);
  });

  it("excludes plans that would put you in two places at once", () => {
    const input = twoNonOverlappingPeriods();
    // A second Monday period overlapping the first one.
    input.periods.push({
      id: "p-clash-mon",
      turmaId: "turma-5a",
      weekday: 1,
      startMinutes: 9 * 60 + 30,
      endMinutes: 10 * 60 + 15,
      subject: "Math",
    });

    const candidates = buildCandidates(input);
    const result = buildDayPlans(
      input,
      candidates,
      buildConflictMatrix(input, candidates),
      buildQuotas(input),
    );
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    const mondayPlanSizes = result.byWeekday[0]
      .map((plan) => plan.candidateIndexes.length)
      .sort();
    // Empty, either period alone — but never both together.
    expect(mondayPlanSizes).toEqual([0, 1, 1]);
  });
});
