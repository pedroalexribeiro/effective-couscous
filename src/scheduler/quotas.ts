import { effectiveSubjectMinutes } from "../domain/index.ts";
import type { OrganizerInput } from "../domain/index.ts";
import type { CandidatePeriod } from "./candidates.ts";

/**
 * Every minutes target the week has to satisfy, flattened into one vector so
 * the search can compare progress against requirements with plain arithmetic.
 *
 * Progress is always stored capped at the requirement. Capping is what makes
 * two partial weeks interchangeable once they have both satisfied a target,
 * which is what lets the join merge them.
 */
export type Quotas = {
  caps: Int32Array;
  /** Human-readable name per index, for diagnostics. */
  labels: string[];
  totalByStudent: Map<string, number>;
  subjectByStudent: Map<string, number>;
  wallClock: number;
};

export function subjectQuotaKey(studentId: string, subject: string): string {
  return `${studentId}\u0000${subject}`;
}

export function buildQuotas(input: OrganizerInput): Quotas {
  const caps: number[] = [];
  const labels: string[] = [];
  const totalByStudent = new Map<string, number>();
  const subjectByStudent = new Map<string, number>();

  const nameOf = (studentId: string): string =>
    input.students.find((student) => student.id === studentId)?.name ??
    studentId;

  for (const goal of input.caseload) {
    totalByStudent.set(goal.studentId, caps.length);
    caps.push(goal.requiredMinutes);
    labels.push(`${nameOf(goal.studentId)} (total)`);

    for (const [subject, minutes] of Object.entries(
      effectiveSubjectMinutes(goal),
    )) {
      subjectByStudent.set(subjectQuotaKey(goal.studentId, subject), caps.length);
      caps.push(minutes);
      labels.push(`${nameOf(goal.studentId)} (${subject})`);
    }
  }

  const wallClock = caps.length;
  caps.push(input.requiredTotalMinutes);
  labels.push("O seu tempo de presença");

  return {
    caps: Int32Array.from(caps),
    labels,
    totalByStudent,
    subjectByStudent,
    wallClock,
  };
}

export function quotaCount(quotas: Quotas): number {
  return quotas.caps.length;
}

export function emptyProgress(quotas: Quotas): Int32Array {
  return new Int32Array(quotaCount(quotas));
}

/**
 * What attending one period contributes, assuming every eligible student is
 * credited. Because progress is capped, crediting a student whose target is
 * already met adds nothing, so this stays a fixed property of the period.
 */
export function candidateProgress(
  quotas: Quotas,
  candidate: CandidatePeriod,
): Int32Array {
  const progress = emptyProgress(quotas);
  progress[quotas.wallClock] = candidate.minutes;

  for (const studentId of candidate.eligibleStudentIds) {
    const total = quotas.totalByStudent.get(studentId);
    if (total !== undefined) {
      progress[total] += candidate.minutes;
    }
    const subject = quotas.subjectByStudent.get(
      subjectQuotaKey(studentId, candidate.period.subject),
    );
    if (subject !== undefined) {
      progress[subject] += candidate.minutes;
    }
  }

  return progress;
}

export function addCapped(
  quotas: Quotas,
  state: Int32Array,
  progress: Int32Array,
): Int32Array {
  const next = new Int32Array(state.length);
  for (let index = 0; index < state.length; index += 1) {
    next[index] = Math.min(
      quotas.caps[index],
      state[index] + progress[index],
    );
  }
  return next;
}

export function allQuotasMet(quotas: Quotas, state: Int32Array): boolean {
  for (let index = 0; index < state.length; index += 1) {
    if (state[index] < quotas.caps[index]) {
      return false;
    }
  }
  return true;
}

export function stateKey(state: Int32Array): string {
  return state.join(",");
}
