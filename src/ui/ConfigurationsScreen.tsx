import { useEffect, useMemo, useRef, useState } from "react";
import {
  schoolNameById,
  turmaById,
  turmaLabel,
} from "../domain/index.ts";
import type { CaseloadGoal, Configuration, OrganizerInput, Period, Visit } from "../domain/index.ts";
import { useConfigurations, useOrganizer } from "./OrganizerContext.tsx";
import { WeekCalendar, type CalendarEvent } from "./WeekCalendar.tsx";

function periodLookup(periods: Period[]): Map<string, Period> {
  return new Map(periods.map((period) => [period.id, period]));
}

function weeksHint(shown: number, totalFound: number): string {
  if (totalFound > shown) {
    return `${totalFound} semanas possíveis. A lista mostra as ${shown} melhores. As preferências só ordenam.`;
  }
  if (shown === 1) {
    return "1 semana possível. As preferências só ordenam esta lista.";
  }
  return `${shown} semanas possíveis. As preferências só ordenam esta lista.`;
}

function formatGoalSplit(goal: CaseloadGoal): string {
  const splits = Object.entries(goal.subjectMinutes ?? {}).filter(
    ([, minutes]) => minutes > 0,
  );
  if (splits.length === 0) {
    return "";
  }
  return ` · ${splits.map(([subject, minutes]) => `${subject} ${minutes}`).join(" + ")}`;
}

export function ConfigurationsScreen() {
  const { input } = useOrganizer();
  const {
    configurations,
    totalFound,
    infeasibleReasons,
    hasResult,
    calculating,
    progressLog,
    calculate,
    calculationIsStale,
  } = useConfigurations();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = configurations[selectedIndex] ?? configurations[0] ?? null;
  const periods = useMemo(() => periodLookup(input.periods), [input.periods]);

  useEffect(() => {
    if (selectedIndex >= configurations.length) {
      setSelectedIndex(0);
    }
  }, [configurations.length, selectedIndex]);

  return (
    <section>
      <h2>Configurações</h2>
      <CalculationStatus
        calculating={calculating}
        calculationIsStale={calculationIsStale}
        hasResult={hasResult}
        progressLog={progressLog}
        onCalculate={calculate}
      />
      {!hasResult && !calculating ? (
        <p>Ainda não calculou as semanas possíveis.</p>
      ) : null}
      {hasResult && configurations.length === 0 ? (
        <>
          <p>Nenhuma semana possível. Nada resta com as restrições atuais.</p>
          <ul className="plain-list">
            {infeasibleReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </>
      ) : null}
      {configurations.length > 0 ? (
        <>
          <p className="hint">
            {weeksHint(configurations.length, totalFound)}
            {calculationIsStale ? " Os dados mudaram desde este cálculo." : ""}
          </p>
          <label className="field">
            <span>Percorrer</span>
            <select
              value={selectedIndex}
              onChange={(event) => setSelectedIndex(Number(event.target.value))}
            >
              {configurations.map((config, index) => (
                <option key={index} value={index}>
                  {`Semana ${index + 1} · ${config.visits.length} ${config.visits.length === 1 ? "visita" : "visitas"} · ${config.wallClockMinutes} min seus`}
                </option>
              ))}
            </select>
          </label>
          {selected ? (
            <ConfigurationDetail
              configuration={selected}
              periods={periods}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function CalculationStatus({
  calculating,
  calculationIsStale,
  hasResult,
  progressLog,
  onCalculate,
}: {
  calculating: boolean;
  calculationIsStale: boolean;
  hasResult: boolean;
  progressLog: string[];
  onCalculate: () => void;
}) {
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [progressLog]);

  return (
    <div className="calculation-panel">
      {calculating ? (
        <div className="calculating-banner" role="status" aria-live="polite">
          <strong>A calcular as semanas possíveis</strong>
          <p>
            Isto pode demorar. Não desligue o ecrã — o telefone pode parecer
            parado, mas o cálculo continua.
          </p>
        </div>
      ) : null}
      <div className="calculate-row">
        <button type="button" onClick={onCalculate} disabled={calculating}>
          {calculating ? "A calcular…" : "Calcular semanas"}
        </button>
        {calculationIsStale ? (
          <p className="hint">Os dados mudaram. Calcule de novo para atualizar a lista.</p>
        ) : null}
        {!hasResult && !calculating ? (
          <p className="hint">O cálculo só corre quando premir o botão.</p>
        ) : null}
      </div>
      {progressLog.length > 0 ? (
        <pre ref={logRef} className="debug-log" aria-live="polite">
          {progressLog.join("\n")}
        </pre>
      ) : null}
    </div>
  );
}

function ConfigurationDetail({
  configuration,
  periods,
}: {
  configuration: Configuration;
  periods: Map<string, Period>;
}) {
  const { input } = useOrganizer();

  return (
    <div>
      <p>
        O seu tempo: <strong>{configuration.wallClockMinutes} min</strong> (precisa de{" "}
        {input.requiredTotalMinutes})
      </p>
      <ul className="plain-list">
        {input.caseload.map((goal) => {
          const student = input.students.find((item) => item.id === goal.studentId);
          const got = configuration.studentMinutes[goal.studentId] ?? 0;
          return (
            <li key={goal.studentId}>
              {student?.name ?? goal.studentId}: {got} / {goal.requiredMinutes} min
              {formatGoalSplit(goal)}
            </li>
          );
        })}
      </ul>
      <WeekCalendar events={visitCalendarEvents(configuration.visits, periods, input)} />
    </div>
  );
}

function visitCalendarEvents(
  visits: Visit[],
  periods: Map<string, Period>,
  input: OrganizerInput,
): CalendarEvent[] {
  return visits.flatMap((visit) => {
    const period = periods.get(visit.periodId);
    if (!period) {
      return [];
    }
    const turma = turmaById(input, period.turmaId);
    const names = visit.studentIds
      .map(
        (id) => input.students.find((student) => student.id === id)?.name ?? id,
      )
      .join(", ");
    return [
      {
        id: visit.periodId,
        weekday: period.weekday,
        startMinutes: period.startMinutes,
        endMinutes: period.endMinutes,
        title: period.subject,
        subtitle: `${names} · ${visit.kind === "group" ? "grupo" : "1:1"}`,
        detail: turma
          ? turmaLabel(turma, schoolNameById(input, turma.schoolId))
          : undefined,
        tone: visit.kind === "group" ? "tone-group" : "tone-visit",
      },
    ];
  });
}
