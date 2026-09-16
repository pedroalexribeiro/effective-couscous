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

export function travelMinutesBetween(
  input: OrganizerInput,
  fromSchoolId: string,
  toSchoolId: string,
): number {
  if (fromSchoolId === toSchoolId) {
    return 0;
  }
  const fromSchool = input.schools.find((school) => school.id === fromSchoolId);
  const toSchool = input.schools.find((school) => school.id === toSchoolId);
  return Math.max(
    fromSchool?.defaultTravelMinutes ?? 0,
    toSchool?.defaultTravelMinutes ?? 0,
  );
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

export function visitConflictsWithChosen(
  input: OrganizerInput,
  candidates: CandidatePeriod[],
  candidate: CandidatePeriod,
  chosen: ChosenVisit[],
): boolean {
  const breakMinutes = input.preferences.minBreakMinutes;

  return chosen.some((visit) => {
    const other = candidates[visit.candidateIndex];
    if (other.period.weekday !== candidate.period.weekday) {
      return false;
    }
    if (
      intervalsOverlap(
        candidate.period.startMinutes,
        candidate.period.endMinutes,
        other.period.startMinutes,
        other.period.endMinutes,
      )
    ) {
      return true;
    }

    const [first, second] =
      candidate.period.startMinutes <= other.period.startMinutes
        ? [candidate, other]
        : [other, candidate];
    const gap = gapAfter(first.period.endMinutes, second.period.startMinutes);
    const travel = travelMinutesBetween(
      input,
      first.schoolId,
      second.schoolId,
    );
    const neededGap = Math.max(breakMinutes, travel);
    return gap < neededGap;
  });
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
