import { useEffect, useMemo, useState } from "react";
import {
  WEEKDAYS,
  minutesToTime,
  schoolNameById,
  turmaById,
  weekdayLabel,
} from "../domain/index.ts";
import type { Configuration, Period } from "../domain/index.ts";
import { useConfigurations, useOrganizer } from "./OrganizerContext.tsx";

function periodLookup(periods: Period[]): Map<string, Period> {
  return new Map(periods.map((period) => [period.id, period]));
}

export function ConfigurationsScreen() {
  const { input } = useOrganizer();
  const result = useConfigurations();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = result.configurations[selectedIndex] ?? result.configurations[0] ?? null;
  const periods = useMemo(() => periodLookup(input.periods), [input.periods]);

  useEffect(() => {
    if (selectedIndex >= result.configurations.length) {
      setSelectedIndex(0);
    }
  }, [result.configurations.length, selectedIndex]);

  if (result.configurations.length === 0) {
    return (
      <section>
        <h2>Configurações</h2>
        <p>Nenhuma semana possível. Nada resta com as restrições atuais.</p>
        <ul className="plain-list">
          {result.infeasibleReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section>
      <h2>Configurações</h2>
      <p className="hint">
        {result.configurations.length === 1
          ? "1 semana possível. As preferências só ordenam esta lista."
          : `${result.configurations.length} semanas possíveis. As preferências só ordenam esta lista.`}
      </p>
      <label className="field">
        <span>Percorrer</span>
        <select
          value={selectedIndex}
          onChange={(event) => setSelectedIndex(Number(event.target.value))}
        >
          {result.configurations.map((config, index) => (
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
    </section>
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
            </li>
          );
        })}
      </ul>
      <WeekCalendar configuration={configuration} periods={periods} />
    </div>
  );
}

function WeekCalendar({
  configuration,
  periods,
}: {
  configuration: Configuration;
  periods: Map<string, Period>;
}) {
  const { input } = useOrganizer();

  return (
    <div className="week-grid">
      {WEEKDAYS.map((day) => {
        const visits = configuration.visits
          .map((visit) => ({ visit, period: periods.get(visit.periodId) }))
          .filter((item) => item.period?.weekday === day)
          .sort(
            (a, b) => (a.period?.startMinutes ?? 0) - (b.period?.startMinutes ?? 0),
          );

        return (
          <div key={day} className="week-day">
            <h3>{weekdayLabel(day)}</h3>
            {visits.length === 0 ? (
              <p className="hint">Livre</p>
            ) : (
              visits.map(({ visit, period }) => {
                if (!period) {
                  return null;
                }
                const turma = turmaById(input, period.turmaId);
                const names = visit.studentIds
                  .map(
                    (id) =>
                      input.students.find((student) => student.id === id)?.name ?? id,
                  )
                  .join(", ");
                return (
                  <article key={visit.periodId} className="visit-card">
                    <p>
                      {minutesToTime(period.startMinutes)}–
                      {minutesToTime(period.endMinutes)}
                    </p>
                    <p>
                      {period.subject}
                      {visit.kind === "group" ? " · grupo" : " · 1:1"}
                    </p>
                    <p>{names}</p>
                    {turma ? (
                      <p className="hint">
                        {turma.year}.º {turma.identification} ·{" "}
                        {schoolNameById(input, turma.schoolId)}
                      </p>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>
        );
      })}
    </div>
  );
}
