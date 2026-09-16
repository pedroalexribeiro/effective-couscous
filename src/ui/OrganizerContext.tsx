import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { emptyOrganizerInput } from "../domain/index.ts";
import type { OrganizerInput } from "../domain/index.ts";
import { enumerate } from "../scheduler/index.ts";
import { downloadJson, loadState, saveState } from "./storage.ts";
import { sampleWeek } from "./sampleData.ts";

type OrganizerStore = {
  input: OrganizerInput;
  setInput: (next: OrganizerInput | ((current: OrganizerInput) => OrganizerInput)) => void;
  reset: () => void;
  loadSample: () => void;
  exportJson: () => void;
  importJson: (file: File) => Promise<void>;
};

const OrganizerContext = createContext<OrganizerStore | null>(null);

export function OrganizerProvider({ children }: { children: ReactNode }) {
  const [input, setInputState] = useState<OrganizerInput>(() => {
    if (typeof localStorage === "undefined") {
      return emptyOrganizerInput();
    }
    return loadState();
  });

  useEffect(() => {
    saveState(input);
  }, [input]);

  const setInput = useCallback(
    (next: OrganizerInput | ((current: OrganizerInput) => OrganizerInput)) => {
      setInputState(next);
    },
    [],
  );

  const value = useMemo<OrganizerStore>(
    () => ({
      input,
      setInput,
      reset: () => setInputState(emptyOrganizerInput()),
      loadSample: () => setInputState(sampleWeek()),
      exportJson: () => downloadJson(input),
      importJson: async (file: File) => {
        const text = await file.text();
        setInputState(JSON.parse(text) as OrganizerInput);
      },
    }),
    [input, setInput],
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
  const { input } = useOrganizer();
  return useMemo(() => enumerate(input), [input]);
}
