import { validateInput, weekdayLabel } from "../domain/index.ts";
import type {
  Configuration,
  EnumerateResult,
  OrganizerInput,
} from "../domain/index.ts";
import {
  buildCandidates,
  buildConflictMatrix,
  type CandidatePeriod,
} from "./candidates.ts";
import {
  buildDayPlans,
  remainingCapacity,
  MAX_PLANS_PER_DAY,
  type DayPlan,
} from "./dayPlans.ts";
import { createJoin, selectBestCombinations } from "./join.ts";
import {
  buildQuotas,
  emptyProgress,
  everyPeriodIsNeeded,
  type Quotas,
} from "./quotas.ts";
import { buildVisits } from "./visits.ts";

export type EnumerateProgress = {
  phase: "candidates" | "search" | "sort" | "done";
  message: string;
  candidateCount: number;
  /** Distinct progress states the join has answered so far. */
  statesExplored: number;
  found: number;
};

export type Enumerator = (
  input: OrganizerInput,
  onProgress?: (progress: EnumerateProgress) => void,
) => EnumerateResult;

function weekWord(count: number): string {
  return count === 1 ? "semana" : "semanas";
}

function formatCount(count: number): string {
  return count.toLocaleString("pt-PT");
}

function elapsedSince(startedAt: number): string {
  return `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
}

type Reporter = (
  phase: EnumerateProgress["phase"],
  message: string,
  extra?: Partial<EnumerateProgress>,
) => void;

function createReporter(
  onProgress: ((progress: EnumerateProgress) => void) | undefined,
): Reporter {
  return (phase, message, extra) => {
    onProgress?.({
      phase,
      message,
      candidateCount: extra?.candidateCount ?? 0,
      statesExplored: extra?.statesExplored ?? 0,
      found: extra?.found ?? 0,
    });
  };
}

function failed(
  report: Reporter,
  startedAt: number,
  reasons: string[],
): EnumerateResult {
  report(
    "done",
    `Concluído em ${elapsedSince(startedAt)}. Nenhuma semana possível.`,
  );
  return { configurations: [], totalFound: 0, infeasibleReasons: reasons };
}

/** Cheap data errors, checked before any searching happens. */
function inputProblems(input: OrganizerInput): string[] {
  const problems = validateInput(input);
  if (input.caseload.length === 0) {
    problems.push("Adicione pelo menos um aluno à carga.");
  }
  return problems;
}

/**
 * Targets that cannot be reached even in the best case.
 *
 * `capacity[0]` is the most each quota can receive across the whole week,
 * already accounting for periods that clash within a day, so a shortfall here
 * is proof that no week exists.
 */
function unreachableQuotas(quotas: Quotas, capacity: Int32Array[]): string[] {
  const reasons: string[] = [];
  for (let quota = 0; quota < quotas.caps.length; quota += 1) {
    const available = capacity[0][quota];
    if (available < quotas.caps[quota]) {
      reasons.push(
        `${quotas.labels[quota]} precisa de ${quotas.caps[quota]} minutos, mas no máximo consegue ${available}.`,
      );
    }
  }
  return reasons;
}

function chosenCandidates(
  candidates: CandidatePeriod[],
  plansByWeekday: DayPlan[][],
  planIndexes: number[],
): CandidatePeriod[] {
  return planIndexes.flatMap((planIndex, day) =>
    plansByWeekday[day][planIndex].candidateIndexes.map(
      (candidateIndex) => candidates[candidateIndex],
    ),
  );
}

function toConfiguration(
  quotas: Quotas,
  chosen: CandidatePeriod[],
  score: number,
): Configuration {
  const { visits, studentMinutes } = buildVisits(quotas, chosen);
  return {
    visits,
    wallClockMinutes: chosen.reduce(
      (total, candidate) => total + candidate.minutes,
      0,
    ),
    studentMinutes,
    score,
  };
}

export const enumerate: Enumerator = (input, onProgress) => {
  const startedAt = Date.now();
  const report = createReporter(onProgress);
  report("candidates", "A construir tempos elegíveis…");

  const problems = inputProblems(input);
  if (problems.length > 0) {
    return failed(report, startedAt, problems);
  }

  const candidates = buildCandidates(input);
  if (candidates.length === 0) {
    return failed(report, startedAt, [
      "Não restam tempos letivos elegíveis. Verifique disciplinas, outros professores e blocos livres.",
    ]);
  }

  const quotas = buildQuotas(input);
  const conflicts = buildConflictMatrix(input, candidates);
  const dayPlans = buildDayPlans(input, candidates, conflicts, quotas);

  if (dayPlans.kind === "too-many") {
    return failed(report, startedAt, [
      `${weekdayLabel(dayPlans.weekday)} tem ${dayPlans.periodCount} tempos elegíveis e mais de ${formatCount(MAX_PLANS_PER_DAY)} combinações possíveis.`,
      "Restrinja as disciplinas da carga, marque blocos livres ou reduza os tempos letivos para tornar o cálculo possível.",
    ]);
  }

  const capacity = remainingCapacity(quotas, dayPlans.byWeekday);
  const shortfalls = unreachableQuotas(quotas, capacity);
  if (shortfalls.length > 0) {
    return failed(report, startedAt, shortfalls);
  }

  report(
    "search",
    `${candidates.length} tempos elegíveis · ${dayPlans.byWeekday.map((plans) => plans.length).join(" / ")} combinações por dia. A juntar os dias…`,
    { candidateCount: candidates.length },
  );

  const join = createJoin(
    quotas,
    dayPlans.byWeekday,
    capacity,
    (statesExplored) => {
      report(
        "search",
        `${elapsedSince(startedAt)} · ${formatCount(statesExplored)} estados analisados`,
        { candidateCount: candidates.length, statesExplored },
      );
    },
  );

  const whole = join.from(0, emptyProgress(quotas));
  if (whole.count === 0) {
    return failed(report, startedAt, [
      "Nenhuma semana completa satisfaz todas as restrições ao mesmo tempo.",
    ]);
  }

  report(
    "sort",
    `${formatCount(whole.count)} ${weekWord(whole.count)} possíveis. A ordenar…`,
    {
      candidateCount: candidates.length,
      statesExplored: join.statesCached(),
      found: whole.count,
    },
  );

  const stepsOf = (planIndexes: number[]): Int32Array[] =>
    planIndexes.flatMap(
      (planIndex, day) => dayPlans.byWeekday[day][planIndex].steps,
    );

  const configurations = selectBestCombinations(
    quotas,
    dayPlans.byWeekday,
    join,
    (planIndexes) => everyPeriodIsNeeded(quotas, stepsOf(planIndexes)),
  ).map((combination) =>
    toConfiguration(
      quotas,
      chosenCandidates(candidates, dayPlans.byWeekday, combination.planIndexes),
      combination.score,
    ),
  );

  report(
    "done",
    `Concluído: ${formatCount(configurations.length)} ${weekWord(configurations.length)} em ${elapsedSince(startedAt)}${
      whole.count > configurations.length
        ? ` · ${formatCount(whole.count)} no total, as outras têm tempos dispensáveis`
        : ""
    }.`,
    {
      candidateCount: candidates.length,
      statesExplored: join.statesCached(),
      found: configurations.length,
    },
  );

  return {
    configurations,
    totalFound: whole.count,
    infeasibleReasons: [],
  };
};
