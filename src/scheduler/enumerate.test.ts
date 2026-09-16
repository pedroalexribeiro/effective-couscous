import { emptyOrganizerInput } from "../domain/index.ts";
import { describe, expect, it } from "vitest";
import { enumerate } from "./enumerate.ts";
import {
  twoNonOverlappingPeriods,
  twoStudentsSameMathPeriod,
} from "./fixtures.ts";

function periodIds(visits: { periodId: string }[]): string[] {
  return visits.map((visit) => visit.periodId).sort();
}

describe("enumerate", () => {
  it("credits a 45-minute group once to you and 45 to each student", () => {
    const result = enumerate(twoStudentsSameMathPeriod());
    expect(result.configurations).toHaveLength(1);

    const [config] = result.configurations;
    expect(config.visits).toHaveLength(1);
    expect(config.visits[0].kind).toBe("group");
    expect(config.visits[0].studentIds).toEqual(["ana", "bruno"]);
    expect(config.wallClockMinutes).toBe(45);
    expect(config.studentMinutes.ana).toBe(45);
    expect(config.studentMinutes.bruno).toBe(45);
  });

  it("credits a 1:1 visit to one student only", () => {
    const input = twoStudentsSameMathPeriod();
    input.students = [input.students[0]];
    input.caseload = [input.caseload[0]];
    const result = enumerate(input);

    expect(result.configurations).toHaveLength(1);
    const [config] = result.configurations;
    expect(config.visits[0].kind).toBe("one_on_one");
    expect(config.visits[0].studentIds).toEqual(["ana"]);
    expect(config.wallClockMinutes).toBe(45);
    expect(config.studentMinutes.ana).toBe(45);
    expect(config.studentMinutes.bruno).toBeUndefined();
  });

  it("enumerates the exact feasible set for two alternative periods", () => {
    const result = enumerate(twoNonOverlappingPeriods());
    const sets = result.configurations.map((config) => periodIds(config.visits));

    expect(sets).toEqual(
      expect.arrayContaining([["p-math-mon"], ["p-pt-tue"]]),
    );
    expect(sets).toHaveLength(2);
    expect(result.totalFound).toBe(2);
  });

  it("drops every configuration that collides with a free block", () => {
    const withBlock = twoNonOverlappingPeriods();
    withBlock.freeBlocks = [
      {
        id: "free-mon",
        weekday: 1,
        startMinutes: 9 * 60,
        endMinutes: 10 * 60,
        note: "Keep Monday morning empty",
      },
    ];

    const before = enumerate(twoNonOverlappingPeriods());
    const after = enumerate(withBlock);

    expect(before.configurations.length).toBeGreaterThan(after.configurations.length);
    expect(after.configurations).toHaveLength(1);
    expect(after.configurations[0].visits.map((visit) => visit.periodId)).toEqual([
      "p-pt-tue",
    ]);
  });

  it("excludes a period already taken by another professor", () => {
    const input = twoNonOverlappingPeriods();
    input.assistanceSlots = [
      { id: "help-1", periodId: "p-math-mon", professorName: "Prof. Silva" },
    ];
    const result = enumerate(input);

    expect(result.configurations).toHaveLength(1);
    expect(result.configurations[0].visits.map((visit) => visit.periodId)).toEqual([
      "p-pt-tue",
    ]);
  });

  it("requires the listed minutes in each subject, not any mix", () => {
    const input = twoNonOverlappingPeriods();
    input.caseload = [
      {
        studentId: "ana",
        requiredMinutes: 90,
        requiredSubjects: ["Math", "Portuguese"],
        subjectMinutes: { Math: 45, Portuguese: 45 },
      },
    ];
    input.requiredTotalMinutes = 90;
    const result = enumerate(input);
    expect(result.configurations).toHaveLength(1);
    expect(periodIds(result.configurations[0].visits)).toEqual([
      "p-math-mon",
      "p-pt-tue",
    ]);
  });

  it("ranks Portuguese ahead of Mathematics when it is preferred", () => {
    const input = twoNonOverlappingPeriods();
    input.preferences = {
      ...input.preferences,
      preferredSubjects: ["Portuguese"],
    };
    const result = enumerate(input);
    const mathOnly = result.configurations.find(
      (config) =>
        config.visits.length === 1 && config.visits[0].periodId === "p-math-mon",
    );
    expect(result.configurations[0].visits.some((visit) => visit.periodId === "p-pt-tue")).toBe(
      true,
    );
    expect(mathOnly).toBeDefined();
    expect(result.configurations[0].score).toBeGreaterThan(mathOnly!.score);
  });

  it("returns no week when the caseload is empty", () => {
    const result = enumerate(emptyOrganizerInput());
    expect(result.configurations).toHaveLength(0);
    expect(result.infeasibleReasons.length).toBeGreaterThan(0);
  });

  it("reports progress phases when a callback is given", () => {
    const phases: string[] = [];
    const messages: string[] = [];
    enumerate(twoNonOverlappingPeriods(), (progress) => {
      phases.push(progress.phase);
      messages.push(progress.message);
    });

    expect(phases[0]).toBe("candidates");
    expect(phases).toContain("search");
    expect(phases.at(-1)).toBe("done");
    expect(messages.some((message) => message.includes("tempos elegíveis"))).toBe(
      true,
    );
  });
});
