import { emptyOrganizerInput } from "../domain/index.ts";
import type { OrganizerInput } from "../domain/index.ts";

const STORAGE_KEY = "class-organizer-state";

export function loadState(): OrganizerInput {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return emptyOrganizerInput();
  }
  try {
    return JSON.parse(raw) as OrganizerInput;
  } catch {
    return emptyOrganizerInput();
  }
}

export function saveState(input: OrganizerInput): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(input));
}

export function downloadJson(input: OrganizerInput): void {
  const blob = new Blob([JSON.stringify(input, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "class-organizer.json";
  link.click();
  URL.revokeObjectURL(url);
}
