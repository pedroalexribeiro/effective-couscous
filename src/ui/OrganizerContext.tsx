import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { emptyOrganizerInput } from "../domain/index.ts";
import type { EnumerateResult, OrganizerInput } from "../domain/index.ts";
import type { EnumerateWorkerEvent, EnumerateWorkerRequest } from "../scheduler/enumerateMessages.ts";
import { organizerFromFileJson } from "./jsonFormat.ts";
import { downloadJson, loadState, saveState } from "./storage.ts";
import { sampleWeek } from "./sampleData.ts";

const MAX_PROGRESS_LINES = 40;

type OrganizerStore = {
  input: OrganizerInput;
  setInput: (next: OrganizerInput | ((current: OrganizerInput) => OrganizerInput)) => void;
  reset: () => void;
  loadSample: () => void;
  exportJson: () => void;
  importJson: (file: File) => Promise<void>;
  result: EnumerateResult | null;
  calculating: boolean;
  progressLog: string[];
  calculate: () => void;
  calculationIsStale: boolean;
};

const OrganizerContext = createContext<OrganizerStore | null>(null);

async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  if (!("wakeLock" in navigator)) {
    return null;
  }
  try {
    return await navigator.wakeLock.request("screen");
  } catch {
    return null;
  }
}

export function OrganizerProvider({ children }: { children: ReactNode }) {
  const [input, setInputState] = useState<OrganizerInput>(() => {
    if (typeof localStorage === "undefined") {
      return emptyOrganizerInput();
    }
    return loadState();
  });
  const [result, setResult] = useState<EnumerateResult | null>(null);
  const [calculatedInput, setCalculatedInput] = useState<OrganizerInput | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [progressLog, setProgressLog] = useState<string[]>([]);
  const workerRef = useRef<Worker | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const runInputRef = useRef<OrganizerInput>(input);

  useEffect(() => {
    saveState(input);
  }, [input]);

  const stopCalculation = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    void wakeLockRef.current?.release();
    wakeLockRef.current = null;
    setCalculating(false);
  }, []);

  useEffect(() => () => stopCalculation(), [stopCalculation]);

  const appendProgress = useCallback((line: string) => {
    setProgressLog((current) => {
      const next = [...current, line];
      return next.length > MAX_PROGRESS_LINES ? next.slice(-MAX_PROGRESS_LINES) : next;
    });
  }, []);

  const clearResult = useCallback(() => {
    stopCalculation();
    setResult(null);
    setCalculatedInput(null);
    setProgressLog([]);
  }, [stopCalculation]);

  const setInput = useCallback(
    (next: OrganizerInput | ((current: OrganizerInput) => OrganizerInput)) => {
      setInputState(next);
    },
    [],
  );

  const calculate = useCallback(() => {
    stopCalculation();
    runInputRef.current = input;
    setCalculating(true);
    setProgressLog([
      "A calcular… Isto pode demorar. Não desligue o ecrã.",
    ]);

    const worker = new Worker(
      new URL("../scheduler/enumerateWorker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;

    void requestWakeLock().then((sentinel) => {
      if (workerRef.current !== worker) {
        void sentinel?.release();
        return;
      }
      wakeLockRef.current = sentinel;
    });

    worker.onmessage = (event: MessageEvent<EnumerateWorkerEvent>) => {
      const message = event.data;
      if (message.type === "progress") {
        appendProgress(message.progress.message);
        return;
      }
      if (message.type === "error") {
        appendProgress(`Erro: ${message.message}`);
        stopCalculation();
        return;
      }
      setResult(message.result);
      setCalculatedInput(runInputRef.current);
      stopCalculation();
    };

    worker.onerror = () => {
      appendProgress("Erro: o cálculo falhou.");
      stopCalculation();
    };

    const request: EnumerateWorkerRequest = { input };
    worker.postMessage(request);
  }, [appendProgress, input, stopCalculation]);

  const value = useMemo<OrganizerStore>(
    () => ({
      input,
      setInput,
      reset: () => {
        clearResult();
        setInputState(emptyOrganizerInput());
      },
      loadSample: () => {
        clearResult();
        setInputState(sampleWeek());
      },
      exportJson: () => downloadJson(input),
      importJson: async (file: File) => {
        const text = await file.text();
        clearResult();
        setInputState(organizerFromFileJson(JSON.parse(text)));
      },
      result,
      calculating,
      progressLog,
      calculate,
      calculationIsStale: result !== null && input !== calculatedInput,
    }),
    [
      calculate,
      calculatedInput,
      calculating,
      clearResult,
      input,
      progressLog,
      result,
      setInput,
    ],
  );

  return (
    <OrganizerContext.Provider value={value}>{children}</OrganizerContext.Provider>
  );
}

export function useOrganizer(): OrganizerStore {
  const store = useContext(OrganizerContext);
  if (!store) {
    throw new Error("useOrganizer must be used inside OrganizerProvider");
  }
  return store;
}

export function useConfigurations() {
  const {
    result,
    calculating,
    progressLog,
    calculate,
    calculationIsStale,
  } = useOrganizer();
  return {
    configurations: result?.configurations ?? [],
    infeasibleReasons: result?.infeasibleReasons ?? [],
    hasResult: result !== null,
    calculating,
    progressLog,
    calculate,
    calculationIsStale,
  };
}
