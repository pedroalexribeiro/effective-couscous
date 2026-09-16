import {
  gapAfter,
  intervalsOverlap,
  periodDuration,
  studentIsEligibleForPeriod,
} from "../domain/index.ts";
import type { OrganizerInput, Period, Student } from "../domain/index.ts";

export type CandidatePeriod = {
  period: Period;
  eligibleStudentIds: string[];
  minutes: number;
  schoolId: string;
};

/** Minutes needed to get from one school to another. Same school means zero. */
export type TravelLookup = (fromSchoolId: string, toSchoolId: string) => number;

/**
 * Built once and reused. Each school carries a single travel figure rather
 * than a school-to-school table, so the cost of a move is taken as the larger
 * of the two ends.
 */
export function createTravelLookup(input: OrganizerInput): TravelLookup {
  const minutesBySchool = new Map(
    input.schools.map((school) => [school.id, school.defaultTravelMinutes]),
  );

  return (fromSchoolId, toSchoolId) => {
    if (fromSchoolId === toSchoolId) {
      return 0;
    }
    return Math.max(
      minutesBySchool.get(fromSchoolId) ?? 0,
      minutesBySchool.get(toSchoolId) ?? 0,
    );
  };
}

function occupiedByAssistance(input: OrganizerInput, period: Period): boolean {
  return input.assistanceSlots.some((slot) => slot.periodId === period.id);
}

export function eligibleStudentsForPeriod(
  input: OrganizerInput,
  period: Period,
): Student[] {
  return input.caseload.flatMap((goal) => {
    const student = input.students.find((item) => item.id === goal.studentId);
    if (!student) {
      return [];
    }
    if (
      !studentIsEligibleForPeriod(
        goal.requiredSubjects,
        student.turmaId,
        period.turmaId,
        period.subject,
      )
    ) {
      return [];
    }
    return [student];
  });
}

function hitsFreeBlock(input: OrganizerInput, period: Period): boolean {
  return input.freeBlocks.some(
    (block) =>
      block.weekday === period.weekday &&
      intervalsOverlap(
        period.startMinutes,
        period.endMinutes,
        block.startMinutes,
        block.endMinutes,
      ),
  );
}

export function buildCandidates(input: OrganizerInput): CandidatePeriod[] {
  return input.periods.flatMap((period) => {
    if (occupiedByAssistance(input, period)) {
      return [];
    }
    if (hitsFreeBlock(input, period)) {
      return [];
    }
    const eligible = eligibleStudentsForPeriod(input, period);
    if (eligible.length === 0) {
      return [];
    }
    const turma = input.turmas.find((item) => item.id === period.turmaId);
    if (!turma) {
      return [];
    }
    const minutes = periodDuration(period.startMinutes, period.endMinutes);
    if (minutes <= 0) {
      return [];
    }
    return [
      {
        period,
        eligibleStudentIds: eligible.map((student) => student.id),
        minutes,
        schoolId: turma.schoolId,
      },
    ];
  });
}

export type ChosenVisit = {
  candidateIndex: number;
  studentIds: string[];
};

function clash(
  travelBetween: TravelLookup,
  minBreakMinutes: number,
  left: CandidatePeriod,
  right: CandidatePeriod,
): boolean {
  if (left.period.weekday !== right.period.weekday) {
    return false;
  }
  if (
    intervalsOverlap(
      left.period.startMinutes,
      left.period.endMinutes,
      right.period.startMinutes,
      right.period.endMinutes,
    )
  ) {
    return true;
  }

  const [first, second] =
    left.period.startMinutes <= right.period.startMinutes
      ? [left, right]
      : [right, left];
  const gap = gapAfter(first.period.endMinutes, second.period.startMinutes);
  const travel = travelBetween(first.schoolId, second.schoolId);
  return gap < Math.max(minBreakMinutes, travel);
}

export function periodsConflict(
  input: OrganizerInput,
  left: CandidatePeriod,
  right: CandidatePeriod,
): boolean {
  return clash(
    createTravelLookup(input),
    input.preferences.minBreakMinutes,
    left,
    right,
  );
}

export function buildConflictMatrix(
  input: OrganizerInput,
  candidates: CandidatePeriod[],
): boolean[][] {
  const travelBetween = createTravelLookup(input);
  const { minBreakMinutes } = input.preferences;

  const conflicts = candidates.map(() => candidates.map(() => false));
  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      const conflict = clash(
        travelBetween,
        minBreakMinutes,
        candidates[left],
        candidates[right],
      );
      conflicts[left][right] = conflict;
      conflicts[right][left] = conflict;
    }
  }
  return conflicts;
}

export function visitConflictsWithChosen(
  conflicts: boolean[][],
  candidateIndex: number,
  chosen: ChosenVisit[],
): boolean {
  return chosen.some(
    (visit) => conflicts[candidateIndex][visit.candidateIndex],
  );
}

export function nonEmptySubsets(ids: string[]): string[][] {
  const subsets: string[][] = [];
  const total = 1 << ids.length;
  for (let mask = 1; mask < total; mask += 1) {
    const subset: string[] = [];
    for (let bit = 0; bit < ids.length; bit += 1) {
      if (mask & (1 << bit)) {
        subset.push(ids[bit]);
      }
    }
    subsets.push(subset);
  }
  return subsets;
}
