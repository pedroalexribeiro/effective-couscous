import type { EnumerateResult, OrganizerInput } from "../domain/index.ts";
import type { EnumerateProgress } from "./enumerate.ts";

export type EnumerateWorkerRequest = {
  input: OrganizerInput;
};

export type EnumerateWorkerEvent =
  | { type: "progress"; progress: EnumerateProgress }
  | { type: "done"; result: EnumerateResult }
  | { type: "error"; message: string };
