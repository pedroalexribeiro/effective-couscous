import { useMemo } from "react";
import type { Preferences, Weekday } from "../domain/index.ts";
import {
  WEEKDAYS,
  minutesToTime,
  parseTimeToMinutes,
  weekdayLabel,
} from "../domain/index.ts";
import { Field } from "./Field.tsx";
import { useOrganizer } from "./OrganizerContext.tsx";

type WeekdayMode = "preferred" | "normal" | "avoided";

function weekdayMode(prefs: Preferences, day: Weekday): WeekdayMode {
  if (prefs.avoidedWeekdays.includes(day)) {
    return "avoided";
  }
  if (prefs.preferredWeekdays.includes(day)) {
    return "preferred";
  }
  return "normal";
}

function withWeekdayMode(
  prefs: Preferences,
  day: Weekday,
  mode: WeekdayMode,
): Preferences {
  const without = (days: Weekday[]) => days.filter((item) => item !== day);
  if (mode === "preferred") {
    return {
      ...prefs,
      preferredWeekdays: [...without(prefs.preferredWeekdays), day].sort(
        (left, right) => left - right,
      ),
      avoidedWeekdays: without(prefs.avoidedWeekdays),
    };
  }
  if (mode === "avoided") {
    return {
      ...prefs,
      preferredWeekdays: without(prefs.preferredWeekdays),
      avoidedWeekdays: [...without(prefs.avoidedWeekdays), day].sort(
        (left, right) => left - right,
      ),
    };
  }
  return {
    ...prefs,
    preferredWeekdays: without(prefs.preferredWeekdays),
    avoidedWeekdays: without(prefs.avoidedWeekdays),
  };
}

function toggleSubject(prefs: Preferences, subject: string): Preferences {
  const selected = prefs.preferredSubjects.includes(subject);
  return {
    ...prefs,
    preferredSubjects: selected
      ? prefs.preferredSubjects.filter((item) => item !== subject)
      : [...prefs.preferredSubjects, subject],
  };
}

function optionalNumber(raw: string): number | null {
  if (raw === "") {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function PreferencesScreen() {
  const { input, setInput } = useOrganizer();
  const prefs = input.preferences;

  const subjects = useMemo(() => {
    const names = new Set([
      ...input.periods.map((period) => period.subject),
      ...prefs.preferredSubjects,
    ]);
    return [...names].sort((left, right) => left.localeCompare(right, "pt"));
  }, [input.periods, prefs.preferredSubjects]);

  function update(next: Preferences) {
    setInput({ ...input, preferences: next });
  }

  return (
    <section>
      <h2>Preferências</h2>
      <p className="hint">
        Só ordenam as semanas possíveis. Evitar um dia põe primeiro as semanas
        com menos aulas nesse dia.
      </p>

      <div className="prefs-block">
        <h3>Dias da semana</h3>
        <div className="weekday-prefs">
          {WEEKDAYS.map((day) => {
            const mode = weekdayMode(prefs, day);
            return (
              <div
                key={day}
                className="weekday-pref"
                role="radiogroup"
                aria-label={weekdayLabel(day)}
              >
                <span className="weekday-pref-day">{weekdayLabel(day)}</span>
                <div className="weekday-pref-options">
                  <label>
                    <input
                      type="radio"
                      name={`weekday-${day}`}
                      checked={mode === "preferred"}
                      onChange={() => update(withWeekdayMode(prefs, day, "preferred"))}
                    />
                    Preferido
                  </label>
                  <label>
                    <input
                      type="radio"
                      name={`weekday-${day}`}
                      checked={mode === "normal"}
                      onChange={() => update(withWeekdayMode(prefs, day, "normal"))}
                    />
                    Normal
                  </label>
                  <label>
                    <input
                      type="radio"
                      name={`weekday-${day}`}
                      checked={mode === "avoided"}
                      onChange={() => update(withWeekdayMode(prefs, day, "avoided"))}
                    />
                    Evitar
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="prefs-block">
        <h3>Disciplinas preferidas</h3>
        {subjects.length === 0 ? (
          <p className="hint">Adicione tempos no horário para as escolher aqui.</p>
        ) : (
          <ul className="check-list">
            {subjects.map((subject) => (
              <li key={subject}>
                <label>
                  <input
                    type="checkbox"
                    checked={prefs.preferredSubjects.includes(subject)}
                    onChange={() => update(toggleSubject(prefs, subject))}
                  />
                  {subject}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="prefs-block">
        <h3>Horário preferido</h3>
        <div className="row-form">
          <Field label="Início">
            <input
              type="time"
              value={
                prefs.preferredTimeStartMinutes === null
                  ? ""
                  : minutesToTime(prefs.preferredTimeStartMinutes)
              }
              onChange={(event) =>
                update({
                  ...prefs,
                  preferredTimeStartMinutes:
                    event.target.value === ""
                      ? null
                      : parseTimeToMinutes(event.target.value),
                })
              }
            />
          </Field>
          <Field label="Fim">
            <input
              type="time"
              value={
                prefs.preferredTimeEndMinutes === null
                  ? ""
                  : minutesToTime(prefs.preferredTimeEndMinutes)
              }
              onChange={(event) =>
                update({
                  ...prefs,
                  preferredTimeEndMinutes:
                    event.target.value === ""
                      ? null
                      : parseTimeToMinutes(event.target.value),
                })
              }
            />
          </Field>
        </div>
      </div>

      <div className="prefs-block">
        <h3>Limites do dia</h3>
        <div className="row-form">
          <Field label="Máximo de minutos por dia">
            <input
              type="number"
              min={0}
              placeholder="Sem limite"
              value={prefs.maxMinutesPerDay ?? ""}
              onChange={(event) =>
                update({
                  ...prefs,
                  maxMinutesPerDay: optionalNumber(event.target.value),
                })
              }
            />
          </Field>
          <Field label="Intervalo mínimo entre aulas (min)">
            <input
              type="number"
              min={0}
              value={prefs.minBreakMinutes}
              onChange={(event) =>
                update({
                  ...prefs,
                  minBreakMinutes: Math.max(0, Number(event.target.value) || 0),
                })
              }
            />
          </Field>
        </div>
        <p className="hint">
          O intervalo mínimo é uma restrição: tempos demasiado próximos deixam
          de ser possíveis. O máximo diário só penaliza na ordenação.
        </p>
      </div>
    </section>
  );
}
