import { validateInput } from "../domain/index.ts";
import type {
  Configuration,
  EnumerateResult,
  OrganizerInput,
  Visit,
  VisitKind,
} from "../domain/index.ts";
import {
  buildCandidates,
  nonEmptySubsets,
  visitConflictsWithChosen,
  type CandidatePeriod,
  type ChosenVisit,
} from "./candidates.ts";
import { scoreConfiguration } from "./score.ts";

export type Enumerator = (input: OrganizerInput) => EnumerateResult;

function kindFor(studentIds: string[]): VisitKind {
  return studentIds.length === 1 ? "one_on_one" : "group";
}

function remainingNeed(
  caseload: OrganizerInput["caseload"],
  credited: Record<string, number>,
): Record<string, number> {
  const remaining: Record<string, number> = {};
  for (const goal of caseload) {
    remaining[goal.studentId] = Math.max(
      0,
      goal.requiredMinutes - (credited[goal.studentId] ?? 0),
    );
  }
  return remaining;
}

function studentCapacity(
  candidates: CandidatePeriod[],
  openIndexes: number[],
  chosen: ChosenVisit[],
  input: OrganizerInput,
  studentId: string,
): number {
  let capacity = 0;
  for (const index of openIndexes) {
    const candidate = candidates[index];
    if (!candidate.eligibleStudentIds.includes(studentId)) {
      continue;
    }
    if (visitConflictsWithChosen(input, candidates, candidate, chosen)) {
      continue;
    }
    capacity += candidate.minutes;
  }
  return capacity;
}

function wallClockCapacity(
  candidates: CandidatePeriod[],
  openIndexes: number[],
  chosen: ChosenVisit[],
  input: OrganizerInput,
): number {
  let capacity = 0;
  for (const index of openIndexes) {
    const candidate = candidates[index];
    if (visitConflictsWithChosen(input, candidates, candidate, chosen)) {
      continue;
    }
    capacity += candidate.minutes;
  }
  return capacity;
}

function canStillMeet(
  input: OrganizerInput,
  candidates: CandidatePeriod[],
  openIndexes: number[],
  chosen: ChosenVisit[],
  credited: Record<string, number>,
  wallClock: number,
): boolean {
  const need = remainingNeed(input.caseload, credited);
  for (const goal of input.caseload) {
    const left = need[goal.studentId];
    if (left === 0) {
      continue;
    }
    if (
      studentCapacity(candidates, openIndexes, chosen, input, goal.studentId) <
      left
    ) {
      return false;
    }
  }
  const wallLeft = Math.max(0, input.requiredTotalMinutes - wallClock);
  if (wallLeft === 0) {
    return true;
  }
  return wallClockCapacity(candidates, openIndexes, chosen, input) >= wallLeft;
}

function quotasMet(
  input: OrganizerInput,
  credited: Record<string, number>,
  wallClock: number,
): boolean {
  if (wallClock < input.requiredTotalMinutes) {
    return false;
  }
  return input.caseload.every(
    (goal) => (credited[goal.studentId] ?? 0) >= goal.requiredMinutes,
  );
}

function pickMrvIndex(
  input: OrganizerInput,
  candidates: CandidatePeriod[],
  openIndexes: number[],
  chosen: ChosenVisit[],
): number {
  let bestIndex = openIndexes[0];
  let fewest = Number.POSITIVE_INFINITY;

  for (const index of openIndexes) {
    const candidate = candidates[index];
    if (visitConflictsWithChosen(input, candidates, candidate, chosen)) {
      return index;
    }
    const optionCount = nonEmptySubsets(candidate.eligibleStudentIds).length;
    if (optionCount < fewest) {
      fewest = optionCount;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function toConfiguration(
  input: OrganizerInput,
  candidates: CandidatePeriod[],
  chosen: ChosenVisit[],
  credited: Record<string, number>,
  wallClock: number,
): Configuration {
  const visits: Visit[] = chosen.map((visit) => {
    const candidate = candidates[visit.candidateIndex];
    return {
      periodId: candidate.period.id,
      studentIds: visit.studentIds,
      kind: kindFor(visit.studentIds),
      minutes: candidate.minutes,
    };
  });

  const periodById = new Map(
    input.periods.map((period) => [period.id, period]),
  );
  const schoolIdByTurmaId = new Map(
    input.turmas.map((turma) => [turma.id, turma.schoolId]),
  );
  const base = {
    visits,
    wallClockMinutes: wallClock,
    studentMinutes: { ...credited },
  };

  return {
    ...base,
    score: scoreConfiguration(input, base, periodById, schoolIdByTurmaId),
  };
}

function infeasibleReasons(
  input: OrganizerInput,
  candidates: CandidatePeriod[],
): string[] {
  const reasons: string[] = [];
  const issues = validateInput(input);
  reasons.push(...issues);

  if (input.caseload.length === 0) {
    reasons.push("Adicione pelo menos um aluno à carga.");
  }
  if (candidates.length === 0) {
    reasons.push(
      "Não restam tempos letivos elegíveis. Verifique disciplinas, outros professores e blocos livres.",
    );
  }

  for (const goal of input.caseload) {
    const student = input.students.find((item) => item.id === goal.studentId);
    const capacity = candidates
      .filter((candidate) =>
        candidate.eligibleStudentIds.includes(goal.studentId),
      )
      .reduce((sum, candidate) => sum + candidate.minutes, 0);
    if (capacity < goal.requiredMinutes) {
      reasons.push(
        `${student?.name ?? "Um aluno"} precisa de ${goal.requiredMinutes} minutos, mas só existem ${capacity} minutos elegíveis.`,
      );
    }
  }

  const wallCapacity = candidates.reduce(
    (sum, candidate) => sum + candidate.minutes,
    0,
  );
  if (wallCapacity < input.requiredTotalMinutes) {
    reasons.push(
      `Precisa de ${input.requiredTotalMinutes} minutos de presença, mas só existem ${wallCapacity} minutos elegíveis.`,
    );
  }

  if (reasons.length === 0) {
    reasons.push("Nenhuma semana completa satisfaz todas as restrições ao mesmo tempo.");
  }

  return reasons;
}

function search(
  input: OrganizerInput,
  candidates: CandidatePeriod[],
  openIndexes: number[],
  chosen: ChosenVisit[],
  credited: Record<string, number>,
  wallClock: number,
  found: Configuration[],
): void {
  if (!canStillMeet(input, candidates, openIndexes, chosen, credited, wallClock)) {
    return;
  }

  if (openIndexes.length === 0) {
    if (quotasMet(input, credited, wallClock)) {
      found.push(
        toConfiguration(input, candidates, chosen, credited, wallClock),
      );
    }
    return;
  }

  const pick = pickMrvIndex(input, candidates, openIndexes, chosen);
  const rest = openIndexes.filter((index) => index !== pick);
  const candidate = candidates[pick];

  if (visitConflictsWithChosen(input, candidates, candidate, chosen)) {
    search(input, candidates, rest, chosen, credited, wallClock, found);
    return;
  }

  const assignments = nonEmptySubsets(candidate.eligibleStudentIds);
  for (const studentIds of assignments) {
    for (const studentId of studentIds) {
      credited[studentId] = (credited[studentId] ?? 0) + candidate.minutes;
    }
    chosen.push({ candidateIndex: pick, studentIds });
    search(
      input,
      candidates,
      rest,
      chosen,
      credited,
      wallClock + candidate.minutes,
      found,
    );
    chosen.pop();
    for (const studentId of studentIds) {
      credited[studentId] -= candidate.minutes;
    }
  }

  search(input, candidates, rest, chosen, credited, wallClock, found);
}

export const enumerate: Enumerator = (input) => {
  if (input.caseload.length === 0) {
    return {
      configurations: [],
      infeasibleReasons: infeasibleReasons(input, buildCandidates(input)),
    };
  }
  const candidates = buildCandidates(input);
  const credited: Record<string, number> = {};
  for (const goal of input.caseload) {
    credited[goal.studentId] = 0;
  }

  const found: Configuration[] = [];
  const openIndexes = candidates.map((_, index) => index);
  search(input, candidates, openIndexes, [], credited, 0, found);

  found.sort((a, b) => b.score - a.score || a.visits.length - b.visits.length);

  if (found.length === 0) {
    return {
      configurations: [],
      infeasibleReasons: infeasibleReasons(input, candidates),
    };
  }

  return { configurations: found, infeasibleReasons: [] };
};
