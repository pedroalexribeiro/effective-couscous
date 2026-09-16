import { WEEKDAYS, type Weekday } from "./types.ts";

const WEEKDAY_LABELS: Record<Weekday, string> = {
  1: "Segunda",
  2: "Terça",
  3: "Quarta",
  4: "Quinta",
  5: "Sexta",
};

const WEEKDAY_ALIASES: Record<string, Weekday> = {
  "1": 1,
  monday: 1,
  segunda: 1,
  "segunda-feira": 1,
  "2": 2,
  tuesday: 2,
  terca: 2,
  "terca-feira": 2,
  "3": 3,
  wednesday: 3,
  quarta: 3,
  "quarta-feira": 3,
  "4": 4,
  thursday: 4,
  quinta: 4,
  "quinta-feira": 4,
  "5": 5,
  friday: 5,
  sexta: 5,
  "sexta-feira": 5,
};

function isWeekday(value: number): value is Weekday {
  return WEEKDAYS.includes(value as Weekday);
}

export function weekdayLabel(day: Weekday): string {
  return WEEKDAY_LABELS[day];
}

/** Accepts 1–5, "5", "Sexta", "Friday", and similar labels. */
export function parseWeekday(value: unknown): Weekday | null {
  if (typeof value === "number" && isWeekday(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  const asNumber = Number(trimmed);
  if (isWeekday(asNumber)) {
    return asNumber;
  }
  const key = trimmed
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  return WEEKDAY_ALIASES[key] ?? null;
}

export function parseTimeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(total: number): string {
  const hours = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (total % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function periodDuration(startMinutes: number, endMinutes: number): number {
  return endMinutes - startMinutes;
}

export function intervalsOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return startA < endB && startB < endA;
}

export function gapAfter(firstEnd: number, secondStart: number): number {
  return secondStart - firstEnd;
}
