import { useEffect, useMemo, useState } from "react";
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
