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

    // Either period alone satisfies Ana, and so does attending both. The third
    // option only exists because the search no longer abandons a branch for
    // having already succeeded.
    expect(sets).toEqual(
      expect.arrayContaining([
        ["p-math-mon"],
        ["p-pt-tue"],
        ["p-math-mon", "p-pt-tue"],
      ]),
    );
    expect(sets).toHaveLength(3);
    expect(result.totalFound).toBe(3);
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

  it("allows a subject split that leaves the rest of the total free", () => {
    // Ana must get 45 minutes of Maths; the other 45 can be any subject.
    // This used to find nothing at all: once a subject split existed, the
    // overall total stopped driving the search but was still demanded.
    const input = twoNonOverlappingPeriods();
    input.caseload = [
      {
        studentId: "ana",
        requiredMinutes: 90,
        requiredSubjects: [],
        subjectMinutes: { Math: 45 },
      },
    ];
    input.requiredTotalMinutes = 90;

    const result = enumerate(input);
    expect(result.totalFound).toBe(1);
    expect(periodIds(result.configurations[0].visits)).toEqual([
      "p-math-mon",
      "p-pt-tue",
    ]);
    expect(result.configurations[0].studentMinutes.ana).toBe(90);
  });

  it("explains which target is out of reach instead of just failing", () => {
    const input = twoNonOverlappingPeriods();
    input.caseload = [
      {
        studentId: "ana",
        requiredMinutes: 500,
        requiredSubjects: [],
        subjectMinutes: {},
      },
    ];

    const result = enumerate(input);
    expect(result.configurations).toHaveLength(0);
    expect(result.infeasibleReasons).toEqual([
      "Ana (total) precisa de 500 minutos, mas no máximo consegue 90.",
    ]);
  });

  it("reports bad data before doing any searching", () => {
    const input = twoNonOverlappingPeriods();
    input.caseload = [
      {
        studentId: "ghost",
        requiredMinutes: 45,
        requiredSubjects: [],
        subjectMinutes: {},
      },
    ];

    const result = enumerate(input);
    expect(result.infeasibleReasons).toContain(
      "A carga aponta para um aluno inexistente.",
    );
  });

  it("marks a period attended only to reach your own minutes as presence", () => {
    // Ana needs 45 minutes, but you need 90 of attendance, so one period is
    // there purely to make your own total up.
    const input = twoNonOverlappingPeriods();
    input.requiredTotalMinutes = 90;

    const result = enumerate(input);
    expect(result.totalFound).toBe(1);

    const [configuration] = result.configurations;
    expect(configuration.wallClockMinutes).toBe(90);
    expect(configuration.studentMinutes.ana).toBe(45);

    const kinds = configuration.visits.map((visit) => visit.kind).sort();
    expect(kinds).toEqual(["one_on_one", "presence"]);
    const presence = configuration.visits.find(
      (visit) => visit.kind === "presence",
    );
    expect(presence?.studentIds).toEqual([]);
  });

  it("leaves out a student whose minutes are already covered", () => {
    // Both students share the Monday period, but Bruno needs nothing more
    // afterwards, so the later period is credited to Ana alone.
    const input = twoStudentsSameMathPeriod();
    input.periods.push({
      id: "p-math-tue",
      turmaId: "turma-5a",
      weekday: 2,
      startMinutes: 9 * 60,
      endMinutes: 9 * 60 + 45,
      subject: "Math",
    });
    input.caseload = [
      { studentId: "ana", requiredMinutes: 90, requiredSubjects: ["Math"], subjectMinutes: {} },
      { studentId: "bruno", requiredMinutes: 45, requiredSubjects: ["Math"], subjectMinutes: {} },
    ];
    input.requiredTotalMinutes = 90;

    const result = enumerate(input);
    expect(result.totalFound).toBe(1);

    const [configuration] = result.configurations;
    expect(configuration.studentMinutes).toEqual({ ana: 90, bruno: 45 });
    const tuesday = configuration.visits.find(
      (visit) => visit.periodId === "p-math-tue",
    );
    expect(tuesday?.studentIds).toEqual(["ana"]);
    expect(tuesday?.kind).toBe("one_on_one");
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
