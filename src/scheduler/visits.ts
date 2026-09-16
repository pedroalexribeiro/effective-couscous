import type { Visit, VisitKind } from "../domain/index.ts";
import type { CandidatePeriod } from "./candidates.ts";
import { subjectQuotaKey, type Quotas } from "./quotas.ts";

function kindFor(studentIds: string[]): VisitKind {
  if (studentIds.length === 0) {
    return "presence";
  }
  return studentIds.length === 1 ? "one_on_one" : "group";
}

/** Minutes credited so far, while walking a week in chronological order. */
type Ledger = {
  total: Map<string, number>;
  subject: Map<string, number>;
};

function creditedTotal(ledger: Ledger, studentId: string): number {
  return ledger.total.get(studentId) ?? 0;
}

function creditedSubject(
  ledger: Ledger,
  studentId: string,
  subject: string,
): number {
  return ledger.subject.get(subjectQuotaKey(studentId, subject)) ?? 0;
}

/**
 * Whether working with this student in this period would still advance one of
 * their unmet targets. A student whose targets are all met is left out, so the
 * plan reports `60 / 60` rather than crediting minutes nobody asked for.
 */
function stillNeeds(
  quotas: Quotas,
  ledger: Ledger,
  studentId: string,
  subject: string,
): boolean {
  const totalQuota = quotas.totalByStudent.get(studentId);
  if (
    totalQuota !== undefined &&
    creditedTotal(ledger, studentId) < quotas.caps[totalQuota]
  ) {
    return true;
  }

  const subjectQuota = quotas.subjectByStudent.get(
    subjectQuotaKey(studentId, subject),
  );
  return (
    subjectQuota !== undefined &&
    creditedSubject(ledger, studentId, subject) < quotas.caps[subjectQuota]
  );
}

function credit(
  ledger: Ledger,
  studentId: string,
  subject: string,
  minutes: number,
): void {
  ledger.total.set(studentId, creditedTotal(ledger, studentId) + minutes);
  ledger.subject.set(
    subjectQuotaKey(studentId, subject),
    creditedSubject(ledger, studentId, subject) + minutes,
  );
}

export function chronologically(
  candidates: CandidatePeriod[],
): CandidatePeriod[] {
  return [...candidates].sort(
    (left, right) =>
      left.period.weekday - right.period.weekday ||
      left.period.startMinutes - right.period.startMinutes,
  );
}

/**
 * Turns the periods of one week into visits, deciding who you work with in
 * each. Walking in chronological order matters: whether a student still needs
 * a period depends on what they were already credited earlier in the week.
 */
export function buildVisits(
  quotas: Quotas,
  candidates: CandidatePeriod[],
): { visits: Visit[]; studentMinutes: Record<string, number> } {
  const ledger: Ledger = { total: new Map(), subject: new Map() };
  const visits: Visit[] = [];

  for (const candidate of chronologically(candidates)) {
    const subject = candidate.period.subject;
    const studentIds = candidate.eligibleStudentIds.filter((studentId) =>
      stillNeeds(quotas, ledger, studentId, subject),
    );
    for (const studentId of studentIds) {
      credit(ledger, studentId, subject, candidate.minutes);
    }

    visits.push({
      periodId: candidate.period.id,
      studentIds,
      kind: kindFor(studentIds),
      minutes: candidate.minutes,
    });
  }

  return {
    visits,
    studentMinutes: Object.fromEntries(ledger.total),
  };
}
