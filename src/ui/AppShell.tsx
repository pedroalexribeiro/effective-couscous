import { useEffect, useRef, useState } from "react";
import {
  AssistanceScreen,
  CaseloadScreen,
  FreeBlocksScreen,
  SchoolsScreen,
  StudentsScreen,
  TimetableScreen,
  TurmasScreen,
} from "./DataScreens.tsx";
import { ConfigurationsScreen } from "./ConfigurationsScreen.tsx";
import { OrganizerProvider, useConfigurations, useOrganizer } from "./OrganizerContext.tsx";

const SCREENS = [
  "schools",
  "turmas",
  "students",
  "timetables",
  "assistance",
  "caseload",
  "free-blocks",
  "configurations",
] as const;

type Screen = (typeof SCREENS)[number];

const SCREEN_LABEL: Record<Screen, string> = {
  schools: "Escolas",
  turmas: "Turmas",
  students: "Alunos",
  timetables: "Horários",
  assistance: "Outros professores",
  caseload: "A minha carga",
  "free-blocks": "Blocos livres",
  configurations: "Configurações",
};

export function AppShell() {
  return (
    <OrganizerProvider>
      <Shell />
    </OrganizerProvider>
  );
}

function useNarrowViewport() {
  const [narrow, setNarrow] = useState(() =>
    window.matchMedia("(max-width: 40rem)").matches,
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 40rem)");
    const sync = () => setNarrow(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return narrow;
}

function DataToolbar({
  onImportClick,
}: {
  onImportClick: () => void;
}) {
  const { reset, loadSample, exportJson } = useOrganizer();

  return (
    <div className="toolbar">
      <button type="button" onClick={loadSample}>
        Carregar semana de exemplo
      </button>
      <button type="button" onClick={exportJson}>
        Exportar JSON
      </button>
      <button type="button" onClick={onImportClick}>
        Importar JSON
      </button>
      <button type="button" onClick={reset}>
        Limpar
      </button>
    </div>
  );
}

function Shell() {
  const [screen, setScreen] = useState<Screen>("schools");
  const { importJson } = useOrganizer();
  const { configurations } = useConfigurations();
  const fileRef = useRef<HTMLInputElement>(null);
  const narrow = useNarrowViewport();

  const toolbar = (
    <DataToolbar onImportClick={() => fileRef.current?.click()} />
  );

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Organizador de aulas</h1>
          <p className="hint">
            {configurations.length === 1
              ? "1 semana possível"
              : `${configurations.length} semanas possíveis`}
          </p>
        </div>
        {narrow ? (
          <details className="toolbar-menu">
            <summary>Dados</summary>
            {toolbar}
          </details>
        ) : (
          toolbar
        )}
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void importJson(file);
            }
            event.target.value = "";
          }}
        />
      </header>
      <nav className="tabs" aria-label="Secções">
        {SCREENS.map((id) => (
          <button
            key={id}
            type="button"
            className={screen === id ? "active" : ""}
            onClick={(event) => {
              setScreen(id);
              event.currentTarget.scrollIntoView({
                inline: "center",
                block: "nearest",
                behavior: "smooth",
              });
            }}
          >
            {SCREEN_LABEL[id]}
            {id === "configurations" ? ` (${configurations.length})` : ""}
          </button>
        ))}
      </nav>
      <main>
        {screen === "schools" ? <SchoolsScreen /> : null}
        {screen === "turmas" ? <TurmasScreen /> : null}
        {screen === "students" ? <StudentsScreen /> : null}
        {screen === "timetables" ? <TimetableScreen /> : null}
        {screen === "assistance" ? <AssistanceScreen /> : null}
        {screen === "caseload" ? <CaseloadScreen /> : null}
        {screen === "free-blocks" ? <FreeBlocksScreen /> : null}
        {screen === "configurations" ? <ConfigurationsScreen /> : null}
      </main>
    </div>
  );
}
