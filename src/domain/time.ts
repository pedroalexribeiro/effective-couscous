import type { Weekday } from "./types.ts";

const WEEKDAY_LABELS: Record<Weekday, string> = {
  1: "Segunda",
  2: "Terça",
  3: "Quarta",
  4: "Quinta",
  5: "Sexta",
};

export function weekdayLabel(day: Weekday): string {
  return WEEKDAY_LABELS[day];
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
