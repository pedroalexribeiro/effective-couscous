import {
  effectiveSubjectMinutes,
  minutesToTime,
  validateInput,
  weekdayLabel,
} from "../domain/index.ts";
import type {
  Configuration,
  EnumerateResult,
  OrganizerInput,
  Visit,
  VisitKind,
} from "../domain/index.ts";
import {
  buildCandidates,
  buildConflictMatrix,
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
const MAX_KEPT_CONFIGURATIONS = 50;

type SearchProgress = {
  visited: number;
  lastReportAt: number;
  startedAt: number;
  candidateCount: number;
  onProgress: (progress: EnumerateProgress) => void;
};

type SearchCtx = {
  input: OrganizerInput;
  candidates: CandidatePeriod[];
  conflicts: boolean[][];
  subjectNeedByStudent: Record<string, Record<string, number>>;
  found: Configuration[];
  progress: SearchProgress | undefined;
};

function weekWord(count: number): string {
  return count === 1 ? "semana" : "semanas";
}

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
      message: `${formatElapsed(search.startedAt)} · ${search.visited.toLocaleString("pt-PT")} ramos · ${found.toLocaleString("pt-PT")} ${weekWord(found)} · ${remainingPeriods} períodos por decidir${period}`,
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
  studentId: string,
  subjectNeed: Record<string, number>,
  creditedSubject: Record<string, Record<string, number>>,
): Array<[string, number]> {
  return Object.entries(subjectNeed)
    .map(([subject, need]) => {
      const got = creditedSubject[studentId]?.[subject] ?? 0;
      return [subject, Math.max(0, need - got)] as [string, number];
    })
    .filter(([, left]) => left > 0);
}

function studentStillNeedsPeriod(
  ctx: SearchCtx,
  studentId: string,
  candidate: CandidatePeriod,
  credited: Record<string, number>,
  creditedSubject: Record<string, Record<string, number>>,
): boolean {
  const subjectNeed = ctx.subjectNeedByStudent[studentId] ?? {};
  if (Object.keys(subjectNeed).length > 0) {
    const need = subjectNeed[candidate.period.subject] ?? 0;
    if (need <= 0) {
      return false;
    }
    return (creditedSubject[studentId]?.[candidate.period.subject] ?? 0) < need;
  }
  const goal = ctx.input.caseload.find((item) => item.studentId === studentId);
  if (!goal) {
    return false;
  }
  return (credited[studentId] ?? 0) < goal.requiredMinutes;
}

function takeOptionCount(
  ctx: SearchCtx,
  candidate: CandidatePeriod,
  credited: Record<string, number>,
  creditedSubject: Record<string, Record<string, number>>,
  wallClock: number,
): number {
  let needy = 0;
  for (const studentId of candidate.eligibleStudentIds) {
    if (
      studentStillNeedsPeriod(
        ctx,
        studentId,
        candidate,
        credited,
        creditedSubject,
      )
    ) {
      needy += 1;
    }
  }
  if (needy > 0) {
    return (1 << needy) - 1;
  }
  return wallClock < ctx.input.requiredTotalMinutes ? 1 : 0;
}

function usefulAssignments(
  ctx: SearchCtx,
  candidate: CandidatePeriod,
  credited: Record<string, number>,
  creditedSubject: Record<string, Record<string, number>>,
  wallClock: number,
): string[][] {
  const needy = candidate.eligibleStudentIds.filter((studentId) =>
    studentStillNeedsPeriod(
      ctx,
      studentId,
      candidate,
      credited,
      creditedSubject,
    ),
  );
  if (needy.length > 0) {
    return nonEmptySubsets(needy);
  }
  if (wallClock < ctx.input.requiredTotalMinutes) {
    return [candidate.eligibleStudentIds];
  }
  return [];
}

function studentCapacity(
  ctx: SearchCtx,
  openIndexes: number[],
  chosen: ChosenVisit[],
  studentId: string,
  subject?: string,
): number {
  let capacity = 0;
  for (const index of openIndexes) {
    const candidate = ctx.candidates[index];
    if (!candidate.eligibleStudentIds.includes(studentId)) {
      continue;
    }
    if (subject && candidate.period.subject !== subject) {
      continue;
    }
    if (visitConflictsWithChosen(ctx.conflicts, index, chosen)) {
      continue;
    }
    capacity += candidate.minutes;
  }
  return capacity;
}

function wallClockCapacity(
  ctx: SearchCtx,
  openIndexes: number[],
  chosen: ChosenVisit[],
): number {
  let capacity = 0;
  for (const index of openIndexes) {
    if (visitConflictsWithChosen(ctx.conflicts, index, chosen)) {
      continue;
    }
    capacity += ctx.candidates[index].minutes;
  }
  return capacity;
}

function canStillMeet(
  ctx: SearchCtx,
  openIndexes: number[],
  chosen: ChosenVisit[],
  credited: Record<string, number>,
  creditedSubject: Record<string, Record<string, number>>,
  wallClock: number,
): boolean {
  const need = remainingNeed(ctx.input.caseload, credited);
  for (const goal of ctx.input.caseload) {
    const left = need[goal.studentId];
    if (left > 0) {
      if (studentCapacity(ctx, openIndexes, chosen, goal.studentId) < left) {
        return false;
      }
    }
    for (const [subject, subjectLeft] of remainingSubjectNeed(
      goal.studentId,
      ctx.subjectNeedByStudent[goal.studentId] ?? {},
      creditedSubject,
    )) {
      if (
        studentCapacity(
          ctx,
          openIndexes,
          chosen,
          goal.studentId,
          subject,
        ) < subjectLeft
      ) {
        return false;
      }
    }
  }
  const wallLeft = Math.max(0, ctx.input.requiredTotalMinutes - wallClock);
  if (wallLeft === 0) {
    return true;
  }
  return wallClockCapacity(ctx, openIndexes, chosen) >= wallLeft;
}

function quotasMet(
  ctx: SearchCtx,
  credited: Record<string, number>,
  creditedSubject: Record<string, Record<string, number>>,
  wallClock: number,
): boolean {
  if (wallClock < ctx.input.requiredTotalMinutes) {
    return false;
  }
  return ctx.input.caseload.every((goal) => {
    if ((credited[goal.studentId] ?? 0) < goal.requiredMinutes) {
      return false;
    }
    return Object.entries(ctx.subjectNeedByStudent[goal.studentId] ?? {}).every(
      ([subject, need]) =>
        (creditedSubject[goal.studentId]?.[subject] ?? 0) >= need,
    );
  });
}

function pickMrvIndex(
  ctx: SearchCtx,
  openIndexes: number[],
  chosen: ChosenVisit[],
  credited: Record<string, number>,
  creditedSubject: Record<string, Record<string, number>>,
  wallClock: number,
): number {
  let bestIndex = openIndexes[0];
  let fewest = Number.POSITIVE_INFINITY;

  for (const index of openIndexes) {
    if (visitConflictsWithChosen(ctx.conflicts, index, chosen)) {
      return index;
    }
    const optionCount = takeOptionCount(
      ctx,
      ctx.candidates[index],
      credited,
      creditedSubject,
      wallClock,
    );
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
    for (const [subject, need] of Object.entries(effectiveSubjectMinutes(goal))) {
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
  ctx: SearchCtx,
  openIndexes: number[],
  chosen: ChosenVisit[],
  credited: Record<string, number>,
  creditedSubject: Record<string, Record<string, number>>,
  wallClock: number,
): void {
  if (
    !canStillMeet(
      ctx,
      openIndexes,
      chosen,
      credited,
      creditedSubject,
      wallClock,
    )
  ) {
    tickSearchProgress(ctx.progress, ctx.found.length, openIndexes.length);
    return;
  }

  if (quotasMet(ctx, credited, creditedSubject, wallClock)) {
    ctx.found.push(
      toConfiguration(
        ctx.input,
        ctx.candidates,
        chosen,
        credited,
        wallClock,
      ),
    );
    tickSearchProgress(ctx.progress, ctx.found.length, openIndexes.length);
    return;
  }

  if (openIndexes.length === 0) {
    tickSearchProgress(ctx.progress, ctx.found.length, 0);
    return;
  }

  const pick = pickMrvIndex(
    ctx,
    openIndexes,
    chosen,
    credited,
    creditedSubject,
    wallClock,
  );
  const rest = openIndexes.filter((index) => index !== pick);
  const candidate = ctx.candidates[pick];
  tickSearchProgress(ctx.progress, ctx.found.length, rest.length, candidate);

  if (visitConflictsWithChosen(ctx.conflicts, pick, chosen)) {
    search(ctx, rest, chosen, credited, creditedSubject, wallClock);
    return;
  }

  const assignments = usefulAssignments(
    ctx,
    candidate,
    credited,
    creditedSubject,
    wallClock,
  );
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
      ctx,
      rest,
      chosen,
      credited,
      creditedSubject,
      wallClock + candidate.minutes,
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

  search(ctx, rest, chosen, credited, creditedSubject, wallClock);
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
      totalFound: 0,
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
  const subjectNeedByStudent: Record<string, Record<string, number>> = {};
  for (const goal of input.caseload) {
    credited[goal.studentId] = 0;
    creditedSubject[goal.studentId] = {};
    subjectNeedByStudent[goal.studentId] = effectiveSubjectMinutes(goal);
  }

  const found: Configuration[] = [];
  const ctx: SearchCtx = {
    input,
    candidates,
    conflicts: buildConflictMatrix(input, candidates),
    subjectNeedByStudent,
    found,
    progress,
  };
  search(ctx, candidates.map((_, index) => index), [], credited, creditedSubject, 0);

  if (found.length > 0) {
    emitProgress(
      onProgress,
      {
        phase: "sort",
        message: `A ordenar ${found.length.toLocaleString("pt-PT")} ${weekWord(found.length)}…`,
        found: found.length,
        candidateCount: candidates.length,
      },
      progress,
    );
  }

  found.sort((a, b) => b.score - a.score || a.visits.length - b.visits.length);
  const totalFound = found.length;
  if (found.length > MAX_KEPT_CONFIGURATIONS) {
    found.length = MAX_KEPT_CONFIGURATIONS;
  }

  if (found.length === 0) {
    const result = {
      configurations: [],
      totalFound: 0,
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
      message: `Concluído: ${totalFound.toLocaleString("pt-PT")} ${weekWord(totalFound)} em ${formatElapsed(startedAt)} (${(progress?.visited ?? 0).toLocaleString("pt-PT")} ramos)${totalFound > found.length ? ` · a mostrar as ${found.length} melhores` : ""}.`,
      found: found.length,
      candidateCount: candidates.length,
      visitedNodes: progress?.visited,
    },
    progress,
  );

  return { configurations: found, totalFound, infeasibleReasons: [] };
};
