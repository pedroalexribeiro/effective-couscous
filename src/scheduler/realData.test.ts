import { describe, expect, it } from "vitest";
import realDataFile from "../../data/class-organizer.json";
import { organizerFromFileJson } from "../ui/jsonFormat.ts";
import type { OrganizerInput } from "../domain/index.ts";
import { buildCandidates } from "./candidates.ts";
import { enumerate } from "./enumerate.ts";

function realInput(): OrganizerInput {
  return organizerFromFileJson(realDataFile);
}

describe("the committed real dataset", () => {
  it("narrows 211 periods down to the eligible ones", () => {
    const input = realInput();
    expect(input.periods).toHaveLength(211);
    expect(buildCandidates(input)).toHaveLength(66);
  });

  it("finds every valid plan and returns the best 50", () => {
    const result = enumerate(realInput());

    expect(result.totalFound).toBe(2437);
    expect(result.configurations).toHaveLength(50);
    expect(result.infeasibleReasons).toEqual([]);
  });

  it("returns plans in descending score order", () => {
    const scores = enumerate(realInput()).configurations.map(
      (configuration) => configuration.score,
    );
    expect(scores).toEqual([...scores].sort((left, right) => right - left));
  });

  it("gives every student their minutes in every returned plan", () => {
    const input = realInput();

    for (const configuration of enumerate(input).configurations) {
      expect(configuration.wallClockMinutes).toBeGreaterThanOrEqual(
        input.requiredTotalMinutes,
      );

      for (const goal of input.caseload) {
        expect(
          configuration.studentMinutes[goal.studentId] ?? 0,
        ).toBeGreaterThanOrEqual(goal.requiredMinutes);
      }
    }
  });

  it("never puts a plan with a pointless visit at the top", () => {
    // A presence visit earns its place only by pushing you up to your own
    // minimum. If the plan clears the minimum without it, attending was a
    // waste of an hour and the plan should not be recommended.
    const input = realInput();
    const best = enumerate(input).configurations.slice(0, 10);

    for (const configuration of best) {
      const pointless = configuration.visits.filter(
        (visit) =>
          visit.kind === "presence" &&
          configuration.wallClockMinutes - visit.minutes >=
            input.requiredTotalMinutes,
      );
      expect(pointless).toEqual([]);
    }
  });

  it("respects the per-subject splits in every returned plan", () => {
    const input = realInput();
    const periodById = new Map(
      input.periods.map((period) => [period.id, period]),
    );

    for (const configuration of enumerate(input).configurations) {
      const credited = new Map<string, number>();
      for (const visit of configuration.visits) {
        const subject = periodById.get(visit.periodId)?.subject;
        for (const studentId of visit.studentIds) {
          const key = `${studentId}|${subject}`;
          credited.set(key, (credited.get(key) ?? 0) + visit.minutes);
        }
      }

      for (const goal of input.caseload) {
        for (const [subject, minutes] of Object.entries(goal.subjectMinutes)) {
          expect(
            credited.get(`${goal.studentId}|${subject}`) ?? 0,
          ).toBeGreaterThanOrEqual(minutes);
        }
      }
    }
  });
});
