import type { CaseloadGoal } from "./types.ts";

export function effectiveSubjectMinutes(
  goal: CaseloadGoal,
): Record<string, number> {
  // Listed required subjects only decide eligibility.
  // A minute split is used when the caseload spells it out.
  const explicit: Record<string, number> = {};
  for (const [subject, minutes] of Object.entries(goal.subjectMinutes ?? {})) {
    if (minutes > 0) {
      explicit[subject] = minutes;
    }
  }
  if (Object.keys(explicit).length > 0) {
    return explicit;
  }
  return {};
}
