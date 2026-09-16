import type { Configuration, OrganizerInput, Period } from "../domain/index.ts";

function hopsOnDay(
  visits: { schoolId: string; weekday: number; startMinutes: number }[],
  weekday: number,
): number {
  const ordered = visits
    .filter((visit) => visit.weekday === weekday)
    .sort((a, b) => a.startMinutes - b.startMinutes);
  let hops = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].schoolId !== ordered[index - 1].schoolId) {
      hops += 1;
    }
  }
  return hops;
}

export function scoreConfiguration(
  input: OrganizerInput,
  configuration: Omit<Configuration, "score">,
  periodById: Map<string, Period>,
  schoolIdByTurmaId: Map<string, string>,
): number {
  const prefs = input.preferences;
  let score = 0;
  const minutesByDay = new Map<number, number>();
  const visitPlaces: {
    schoolId: string;
    weekday: number;
    startMinutes: number;
  }[] = [];

  for (const visit of configuration.visits) {
    const period = periodById.get(visit.periodId);
    if (!period) {
      continue;
    }
    const schoolId = schoolIdByTurmaId.get(period.turmaId) ?? "";
    visitPlaces.push({
      schoolId,
      weekday: period.weekday,
      startMinutes: period.startMinutes,
    });
    minutesByDay.set(
      period.weekday,
      (minutesByDay.get(period.weekday) ?? 0) + visit.minutes,
    );

    if (prefs.preferredSubjects.includes(period.subject)) {
      score += visit.minutes;
    }
    if (prefs.preferredWeekdays.includes(period.weekday)) {
      score += 3;
    }
    if (prefs.avoidedWeekdays.includes(period.weekday)) {
      score -= 3;
    }
    if (
      prefs.preferredTimeStartMinutes !== null &&
      prefs.preferredTimeEndMinutes !== null &&
      period.startMinutes >= prefs.preferredTimeStartMinutes &&
      period.endMinutes <= prefs.preferredTimeEndMinutes
    ) {
      score += 2;
    }
  }

  if (prefs.maxMinutesPerDay !== null) {
    for (const minutes of minutesByDay.values()) {
      if (minutes > prefs.maxMinutesPerDay) {
        score -= minutes - prefs.maxMinutesPerDay;
      }
    }
  }

  for (const weekday of [1, 2, 3, 4, 5] as const) {
    score -= hopsOnDay(visitPlaces, weekday);
  }

  return score;
}
