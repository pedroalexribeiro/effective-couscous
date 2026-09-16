import { enumerate } from "./enumerate.ts";
import type {
  EnumerateWorkerEvent,
  EnumerateWorkerRequest,
} from "./enumerateMessages.ts";

self.onmessage = (event: MessageEvent<EnumerateWorkerRequest>) => {
  try {
    const result = enumerate(event.data.input, (progress) => {
      const message: EnumerateWorkerEvent = { type: "progress", progress };
      self.postMessage(message);
    });
    const done: EnumerateWorkerEvent = { type: "done", result };
    self.postMessage(done);
  } catch (error) {
    const failed: EnumerateWorkerEvent = {
      type: "error",
      message: error instanceof Error ? error.message : "Falha ao calcular",
    };
    self.postMessage(failed);
  }
};
