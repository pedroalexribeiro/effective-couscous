import { minutesToTime, validateInput, weekdayLabel } from "../domain/index.ts";
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

export type EnumerateProgress = {
  phase: "candidates" | "search" | "sort" | "done";
  message: string;
  visitedNodes: number;
  found: number;
  candidateCount: number;
  remainingPeriods: number;
};

export type Enumerator = (
  input: OrganizerInput,
  onProgress?: (progress: EnumerateProgress) => void,
) => EnumerateResult;

const PROGRESS_EVERY_MS = 150;

type SearchProgress = {
  visited: number;
  lastReportAt: number;
  startedAt: number;
  candidateCount: number;
  onProgress: (progress: EnumerateProgress) => void;
};

function formatElapsed(startedAt: number): string {
  return `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
}

function periodDebugLabel(candidate: CandidatePeriod): string {
  const { period } = candidate;
  return `${weekdayLabel(period.weekday)} ${minutesToTime(period.startMinutes)} ${period.subject}`;
}

function emitProgress(
  onProgress: ((progress: EnumerateProgress) => void) | undefined,
  update: {
    phase: EnumerateProgress["phase"];
    message: string;
    found?: number;
    candidateCount?: number;
    remainingPeriods?: number;
    visitedNodes?: number;
  },
  search?: SearchProgress,
): void {
  if (!onProgress) {
    return;
  }
  onProgress({
    phase: update.phase,
    message: update.message,
    visitedNodes: update.visitedNodes ?? search?.visited ?? 0,
    found: update.found ?? 0,
    candidateCount: update.candidateCount ?? search?.candidateCount ?? 0,
    remainingPeriods: update.remainingPeriods ?? 0,
  });
  if (search) {
    search.lastReportAt = Date.now();
  }
}

function tickSearchProgress(
  search: SearchProgress | undefined,
  found: number,
  remainingPeriods: number,
  current?: CandidatePeriod,
): void {
  if (!search) {
    return;
  }
  search.visited += 1;
  if (Date.now() - search.lastReportAt < PROGRESS_EVERY_MS) {
    return;
  }
  const period = current ? ` · a decidir ${periodDebugLabel(current)}` : "";
  emitProgress(
    search.onProgress,
    {
      phase: "search",
      message: `${formatElapsed(search.startedAt)} · ${search.visited.toLocaleString("pt-PT")} ramos · ${found.toLocaleString("pt-PT")} semanas · ${remainingPeriods} períodos por decidir${period}`,
      found,
      remainingPeriods,
    },
    search,
  );
}

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

function remainingSubjectNeed(
  goal: OrganizerInput["caseload"][number],
  creditedSubject: Record<string, Record<string, number>>,
): Array<[string, number]> {
  return Object.entries(goal.subjectMinutes ?? {})
    .map(([subject, need]) => {
      const got = creditedSubject[goal.studentId]?.[subject] ?? 0;
      return [subject, Math.max(0, need - got)] as [string, number];
    })
    .filter(([, left]) => left > 0);
}

function studentCapacity(
  candidates: CandidatePeriod[],
  openIndexes: number[],
  chosen: ChosenVisit[],
  input: OrganizerInput,
  studentId: string,
  subject?: string,
): number {
  let capacity = 0;
  for (const index of openIndexes) {
    const candidate = candidates[index];
    if (!candidate.eligibleStudentIds.includes(studentId)) {
      continue;
    }
    if (subject && candidate.period.subject !== subject) {
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
  creditedSubject: Record<string, Record<string, number>>,
  wallClock: number,
): boolean {
  const need = remainingNeed(input.caseload, credited);
  for (const goal of input.caseload) {
    const left = need[goal.studentId];
    if (left > 0) {
      if (
        studentCapacity(candidates, openIndexes, chosen, input, goal.studentId) <
        left
      ) {
        return false;
      }
    }
    for (const [subject, subjectLeft] of remainingSubjectNeed(
      goal,
      creditedSubject,
    )) {
      if (
        studentCapacity(
          candidates,
          openIndexes,
          chosen,
          input,
          goal.studentId,
          subject,
        ) < subjectLeft
      ) {
        return false;
      }
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
  creditedSubject: Record<string, Record<string, number>>,
  wallClock: number,
): boolean {
  if (wallClock < input.requiredTotalMinutes) {
    return false;
  }
  return input.caseload.every((goal) => {
    if ((credited[goal.studentId] ?? 0) < goal.requiredMinutes) {
      return false;
    }
    return Object.entries(goal.subjectMinutes ?? {}).every(
      ([subject, need]) =>
        (creditedSubject[goal.studentId]?.[subject] ?? 0) >= need,
    );
  });
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
    for (const [subject, need] of Object.entries(goal.subjectMinutes ?? {})) {
      const subjectCapacity = candidates
        .filter(
          (candidate) =>
            candidate.eligibleStudentIds.includes(goal.studentId) &&
            candidate.period.subject === subject,
        )
        .reduce((sum, candidate) => sum + candidate.minutes, 0);
      if (subjectCapacity < need) {
        reasons.push(
          `${student?.name ?? "Um aluno"} precisa de ${need} minutos de ${subject}, mas só existem ${subjectCapacity} minutos elegíveis.`,
        );
      }
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

function addCredit(
  credited: Record<string, number>,
  creditedSubject: Record<string, Record<string, number>>,
  studentId: string,
  subject: string,
  minutes: number,
): void {
  credited[studentId] = (credited[studentId] ?? 0) + minutes;
  const bySubject = creditedSubject[studentId] ?? {};
  bySubject[subject] = (bySubject[subject] ?? 0) + minutes;
  creditedSubject[studentId] = bySubject;
}

function removeCredit(
  credited: Record<string, number>,
  creditedSubject: Record<string, Record<string, number>>,
  studentId: string,
  subject: string,
  minutes: number,
): void {
  credited[studentId] -= minutes;
  creditedSubject[studentId][subject] -= minutes;
}

function search(
  input: OrganizerInput,
  candidates: CandidatePeriod[],
  openIndexes: number[],
  chosen: ChosenVisit[],
  credited: Record<string, number>,
  creditedSubject: Record<string, Record<string, number>>,
  wallClock: number,
  found: Configuration[],
  progress: SearchProgress | undefined,
): void {
  if (
    !canStillMeet(
      input,
      candidates,
      openIndexes,
      chosen,
      credited,
      creditedSubject,
      wallClock,
    )
  ) {
    tickSearchProgress(progress, found.length, openIndexes.length);
    return;
  }

  if (openIndexes.length === 0) {
    if (quotasMet(input, credited, creditedSubject, wallClock)) {
      found.push(
        toConfiguration(input, candidates, chosen, credited, wallClock),
      );
    }
    tickSearchProgress(progress, found.length, 0);
    return;
  }

  const pick = pickMrvIndex(input, candidates, openIndexes, chosen);
  const rest = openIndexes.filter((index) => index !== pick);
  const candidate = candidates[pick];
  tickSearchProgress(progress, found.length, rest.length, candidate);

  if (visitConflictsWithChosen(input, candidates, candidate, chosen)) {
    search(
      input,
      candidates,
      rest,
      chosen,
      credited,
      creditedSubject,
      wallClock,
      found,
      progress,
    );
    return;
  }

  const assignments = nonEmptySubsets(candidate.eligibleStudentIds);
  for (const studentIds of assignments) {
    for (const studentId of studentIds) {
      addCredit(
        credited,
        creditedSubject,
        studentId,
        candidate.period.subject,
        candidate.minutes,
      );
    }
    chosen.push({ candidateIndex: pick, studentIds });
    search(
      input,
      candidates,
      rest,
      chosen,
      credited,
      creditedSubject,
      wallClock + candidate.minutes,
      found,
      progress,
    );
    chosen.pop();
    for (const studentId of studentIds) {
      removeCredit(
        credited,
        creditedSubject,
        studentId,
        candidate.period.subject,
        candidate.minutes,
      );
    }
  }

  search(
    input,
    candidates,
    rest,
    chosen,
    credited,
    creditedSubject,
    wallClock,
    found,
    progress,
  );
}

export const enumerate: Enumerator = (input, onProgress) => {
  const startedAt = Date.now();
  emitProgress(onProgress, {
    phase: "candidates",
    message: "A construir tempos elegíveis…",
  });

  if (input.caseload.length === 0) {
    const result = {
      configurations: [],
      infeasibleReasons: infeasibleReasons(input, buildCandidates(input)),
    };
    emitProgress(onProgress, {
      phase: "done",
      message: `Concluído em ${formatElapsed(startedAt)}. Nenhuma semana possível.`,
    });
    return result;
  }

  const candidates = buildCandidates(input);
  const progress: SearchProgress | undefined = onProgress
    ? {
        visited: 0,
        lastReportAt: 0,
        startedAt,
        candidateCount: candidates.length,
        onProgress,
      }
    : undefined;

  emitProgress(
    onProgress,
    {
      phase: "search",
      message: `${candidates.length} tempos elegíveis. A procurar combinações… Isto pode demorar.`,
      candidateCount: candidates.length,
      remainingPeriods: candidates.length,
    },
    progress,
  );

  const credited: Record<string, number> = {};
  const creditedSubject: Record<string, Record<string, number>> = {};
  for (const goal of input.caseload) {
    credited[goal.studentId] = 0;
    creditedSubject[goal.studentId] = {};
  }

  const found: Configuration[] = [];
  const openIndexes = candidates.map((_, index) => index);
  search(
    input,
    candidates,
    openIndexes,
    [],
    credited,
    creditedSubject,
    0,
    found,
    progress,
  );

  if (found.length > 0) {
    emitProgress(
      onProgress,
      {
        phase: "sort",
        message: `A ordenar ${found.length.toLocaleString("pt-PT")} semanas…`,
        found: found.length,
        candidateCount: candidates.length,
      },
      progress,
    );
  }

  found.sort((a, b) => b.score - a.score || a.visits.length - b.visits.length);

  if (found.length === 0) {
    const result = {
      configurations: [],
      infeasibleReasons: infeasibleReasons(input, candidates),
    };
    emitProgress(
      onProgress,
      {
        phase: "done",
        message: `Concluído em ${formatElapsed(startedAt)}. Nenhuma semana possível (${(progress?.visited ?? 0).toLocaleString("pt-PT")} ramos).`,
        candidateCount: candidates.length,
        visitedNodes: progress?.visited,
      },
      progress,
    );
    return result;
  }

  emitProgress(
    onProgress,
    {
      phase: "done",
      message: `Concluído: ${found.length.toLocaleString("pt-PT")} semanas em ${formatElapsed(startedAt)} (${(progress?.visited ?? 0).toLocaleString("pt-PT")} ramos).`,
      found: found.length,
      candidateCount: candidates.length,
      visitedNodes: progress?.visited,
    },
    progress,
  );

  return { configurations: found, infeasibleReasons: [] };
};
