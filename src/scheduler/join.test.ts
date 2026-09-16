import { describe, expect, it } from "vitest";
import { EMPTY_PREFERENCES, emptyOrganizerInput } from "../domain/index.ts";
import type { OrganizerInput, Weekday } from "../domain/index.ts";
import {
  buildCandidates,
  buildConflictMatrix,
  createTravelLookup,
} from "./candidates.ts";
import { enumerate } from "./enumerate.ts";
import { scoreWeek } from "./score.ts";
import {
  addCapped,
  allQuotasMet,
  buildQuotas,
  candidateProgress,
  emptyProgress,
} from "./quotas.ts";

/**
 * Counts valid weeks the slow, obvious way: try every clash-free set of
 * periods and keep the ones that meet every target. Exponential, so only
 * usable on small inputs — which is exactly what makes it a good oracle.
 */
function bruteForceCount(input: OrganizerInput): {
  count: number;
  bestScore: number;
} {
  const candidates = buildCandidates(input);
  const conflicts = buildConflictMatrix(input, candidates);
  const quotas = buildQuotas(input);
  const progressPerCandidate = candidates.map((candidate) =>
    candidateProgress(quotas, candidate),
  );

  let count = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  const chosen: number[] = [];

  const walk = (position: number): void => {
    if (position === candidates.length) {
      let state = emptyProgress(quotas);
      for (const index of chosen) {
        state = addCapped(quotas, state, progressPerCandidate[index]);
      }
      if (allQuotasMet(quotas, state)) {
        count += 1;
        bestScore = Math.max(
          bestScore,
          scoreWeek(
            input.preferences,
            createTravelLookup(input),
            chosen.map((index) => candidates[index]),
          ),
        );
      }
      return;
    }

    walk(position + 1);
    if (!chosen.some((other) => conflicts[position][other])) {
      chosen.push(position);
      walk(position + 1);
      chosen.pop();
    }
  };

  walk(0);
  return { count, bestScore };
}

function week(options: {
  periodsPerDay: number;
  students: number;
  minutesPerStudent: number;
  requiredTotalMinutes: number;
  preferredSubjects?: string[];
}): OrganizerInput {
  const input = emptyOrganizerInput();
  input.schools = [
    { id: "north", name: "Escola Norte", defaultTravelMinutes: 15 },
    { id: "south", name: "Escola Sul", defaultTravelMinutes: 15 },
  ];
  input.turmas = [
    { id: "t-a", year: 5, identification: "A", schoolId: "north" },
    { id: "t-b", year: 6, identification: "B", schoolId: "south" },
  ];
  input.preferences = {
    ...EMPTY_PREFERENCES,
    preferredSubjects: options.preferredSubjects ?? [],
  };

  for (let student = 0; student < options.students; student += 1) {
    const id = `s-${student}`;
    const turmaId = student % 2 === 0 ? "t-a" : "t-b";
    input.students.push({ id, name: `Aluno ${student}`, turmaId });
    input.caseload.push({
      studentId: id,
      requiredMinutes: options.minutesPerStudent,
      requiredSubjects: [],
      subjectMinutes: {},
    });
  }

  for (const turma of input.turmas) {
    for (let day = 1; day <= 3; day += 1) {
      for (let slot = 0; slot < options.periodsPerDay; slot += 1) {
        const start = 9 * 60 + slot * 60;
        input.periods.push({
          id: `p-${turma.id}-${day}-${slot}`,
          turmaId: turma.id,
          weekday: day as Weekday,
          startMinutes: start,
          endMinutes: start + 45,
          subject: slot % 2 === 0 ? "Matemática" : "Português",
        });
      }
    }
  }

  input.requiredTotalMinutes = options.requiredTotalMinutes;
  return input;
}

describe("the join agrees with brute force", () => {
  const cases = [
    {
      name: "one student, tight target",
      options: {
        periodsPerDay: 2,
        students: 1,
        minutesPerStudent: 45,
        requiredTotalMinutes: 45,
      },
    },
    {
      name: "two students in different schools",
      options: {
        periodsPerDay: 2,
        students: 2,
        minutesPerStudent: 45,
        requiredTotalMinutes: 90,
      },
    },
    {
      name: "targets needing several periods",
      options: {
        periodsPerDay: 3,
        students: 2,
        minutesPerStudent: 90,
        requiredTotalMinutes: 180,
      },
    },
    {
      name: "own attendance above the caseload",
      options: {
        periodsPerDay: 3,
        students: 1,
        minutesPerStudent: 45,
        requiredTotalMinutes: 225,
      },
    },
    {
      name: "with a scored subject preference",
      options: {
        periodsPerDay: 3,
        students: 2,
        minutesPerStudent: 90,
        requiredTotalMinutes: 135,
        preferredSubjects: ["Português"],
      },
    },
  ];

  for (const { name, options } of cases) {
    it(`counts and ranks correctly: ${name}`, () => {
      const input = week(options);
      const expected = bruteForceCount(input);
      const result = enumerate(input);

      expect(result.totalFound).toBe(expected.count);
      expect(result.configurations[0].score).toBe(expected.bestScore);
    });
  }

  it("reports a score that matches scoring the chosen periods directly", () => {
    const input = week({
      periodsPerDay: 3,
      students: 2,
      minutesPerStudent: 90,
      requiredTotalMinutes: 135,
      preferredSubjects: ["Português"],
    });
    const candidates = buildCandidates(input);
    const byId = new Map(
      candidates.map((candidate) => [candidate.period.id, candidate]),
    );

    for (const configuration of enumerate(input).configurations) {
      const chosen = configuration.visits.map((visit) =>
        byId.get(visit.periodId)!,
      );
      expect(configuration.score).toBe(
        scoreWeek(input.preferences, createTravelLookup(input), chosen),
      );
    }
  });

  it("returns the best weeks first", () => {
    const result = enumerate(
      week({
        periodsPerDay: 3,
        students: 2,
        minutesPerStudent: 90,
        requiredTotalMinutes: 135,
        preferredSubjects: ["Português"],
      }),
    );
    const scores = result.configurations.map((config) => config.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});
