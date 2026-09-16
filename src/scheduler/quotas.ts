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
      subjectByStudent.set(
        subjectQuotaKey(goal.studentId, subject),
        caps.length,
      );
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
    next[index] = Math.min(quotas.caps[index], state[index] + progress[index]);
  }
  return next;
}

/**
 * Whether every period in a plan is pulling its weight: dropping any single
 * one of them would leave some requirement unmet.
 *
 * Without this, a plan can contain an hour you did not need. The obvious case
 * is a period no student needed that also was not needed to reach your own
 * total — but it is not always obvious from the period itself. A class you sit
 * in on Monday genuinely counts towards your required minutes at the time,
 * and only turns out to have been unnecessary once Thursday's periods push you
 * past the total anyway. Necessity is a property of the whole plan, so it can
 * only be judged once the plan is complete.
 *
 * `steps` is what each period contributes, uncapped; order does not matter.
 */
export function everyPeriodIsNeeded(
  quotas: Quotas,
  steps: Int32Array[],
): boolean {
  const totals = new Int32Array(quotaCount(quotas));
  for (const step of steps) {
    for (let index = 0; index < totals.length; index += 1) {
      totals[index] += step[index];
    }
  }

  return steps.every((step) =>
    totals.some((total, index) => total - step[index] < quotas.caps[index]),
  );
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
