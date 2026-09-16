import { parseWeekday } from "./time.ts";
import { EMPTY_PREFERENCES, type Preferences, type Weekday } from "./types.ts";

function uniqueWeekdays(raw: unknown): Weekday[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<Weekday>();
  for (const item of raw) {
    const day = parseWeekday(item);
    if (day !== null) {
      seen.add(day);
    }
  }
  return [...seen].sort((left, right) => left - right);
}

function uniqueStrings(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item === "string" && item.trim()) {
      seen.add(item.trim());
    }
  }
  return [...seen];
}

function optionalMinutes(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

/**
 * Turns whatever JSON stored into a valid `Preferences`. Weekday names such
 * as "Sexta" become 1–5; a day listed as both preferred and avoided is
 * treated as avoided.
 */
export function normalizePreferences(raw: unknown): Preferences {
  const value = (raw ?? {}) as Partial<Preferences>;
  const avoidedWeekdays = uniqueWeekdays(value.avoidedWeekdays);
  const preferredWeekdays = uniqueWeekdays(value.preferredWeekdays).filter(
    (day) => !avoidedWeekdays.includes(day),
  );

  return {
    ...EMPTY_PREFERENCES,
    preferredWeekdays,
    avoidedWeekdays,
    preferredSubjects: uniqueStrings(value.preferredSubjects),
    preferredTimeStartMinutes: optionalMinutes(value.preferredTimeStartMinutes),
    preferredTimeEndMinutes: optionalMinutes(value.preferredTimeEndMinutes),
    maxMinutesPerDay: optionalMinutes(value.maxMinutesPerDay),
    minBreakMinutes:
      typeof value.minBreakMinutes === "number" && value.minBreakMinutes > 0
        ? value.minBreakMinutes
        : 0,
  };
}
