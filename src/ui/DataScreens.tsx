import { useMemo, useState, type FormEvent } from "react";
import {
  WEEKDAYS,
  minutesToTime,
  parseTimeToMinutes,
  schoolNameById,
  turmaById,
  turmaLabel,
  weekdayLabel,
} from "../domain/index.ts";
import type { CaseloadGoal, OrganizerInput, Period, Weekday } from "../domain/index.ts";
import { Field, RowForm } from "./Field.tsx";
import { createId } from "./ids.ts";
import { useConfigurations, useOrganizer } from "./OrganizerContext.tsx";
import { WeekCalendar, type CalendarEvent } from "./WeekCalendar.tsx";

function formatCaseloadSubjects(goal: CaseloadGoal): string {
  const splits = Object.entries(goal.subjectMinutes ?? {}).filter(
    ([, minutes]) => minutes > 0,
  );
  if (splits.length > 0) {
    return ` · ${splits.map(([subject, minutes]) => `${subject} ${minutes} min`).join(" + ")}`;
  }
  if (goal.requiredSubjects.length > 0) {
    return ` · ${goal.requiredSubjects.join(", ")}`;
  }
  return " · qualquer disciplina";
}

export function SchoolsScreen() {
  const { input, setInput } = useOrganizer();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const travel = Number(form.get("travel") ?? 0);
    if (!name) {
      return;
    }
    setInput({
      ...input,
      schools: [
        ...input.schools,
        { id: createId(), name, defaultTravelMinutes: travel },
      ],
    });
    event.currentTarget.reset();
  }

  return (
    <section>
      <h2>Escolas</h2>
      <RowForm onSubmit={onSubmit}>
        <Field label="Nome">
          <input name="name" required />
        </Field>
        <Field label="Minutos de deslocação">
          <input name="travel" type="number" min={0} defaultValue={20} />
        </Field>
        <button type="submit">Adicionar escola</button>
      </RowForm>
      <ul className="plain-list">
        {input.schools.map((school) => (
          <li key={school.id}>
            {school.name} · {school.defaultTravelMinutes} min de deslocação
            <button
              type="button"
              className="linkish"
              onClick={() =>
                setInput({
                  ...input,
                  schools: input.schools.filter((item) => item.id !== school.id),
                })
              }
            >
              Remover
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TurmasScreen() {
  const { input, setInput } = useOrganizer();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const year = Number(form.get("year"));
    const identification = String(form.get("identification") ?? "").trim().toUpperCase();
    const schoolId = String(form.get("schoolId") ?? "");
    if (!year || !identification || !schoolId) {
      return;
    }
    setInput({
      ...input,
      turmas: [
        ...input.turmas,
        { id: createId(), year, identification, schoolId },
      ],
    });
    event.currentTarget.reset();
  }

  return (
    <section>
      <h2>Turmas</h2>
      <RowForm onSubmit={onSubmit}>
        <Field label="Ano">
          <input name="year" type="number" min={1} max={12} required />
        </Field>
        <Field label="Letra">
          <input name="identification" placeholder="A" required />
        </Field>
        <Field label="Escola">
          <select name="schoolId" required defaultValue="">
            <option value="" disabled>
              Escolher
            </option>
            {input.schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
        </Field>
        <button type="submit">Adicionar turma</button>
      </RowForm>
      <ul className="plain-list">
        {input.turmas.map((turma) => (
          <li key={turma.id}>
            {turmaLabel(turma, schoolNameById(input, turma.schoolId))}
            <button
              type="button"
              className="linkish"
              onClick={() =>
                setInput({
                  ...input,
                  turmas: input.turmas.filter((item) => item.id !== turma.id),
                })
              }
            >
              Remover
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function StudentsScreen() {
  const { input, setInput } = useOrganizer();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const turmaId = String(form.get("turmaId") ?? "");
    if (!name || !turmaId) {
      return;
    }
    setInput({
      ...input,
      students: [...input.students, { id: createId(), name, turmaId }],
    });
    event.currentTarget.reset();
  }

  return (
    <section>
      <h2>Alunos</h2>
      <RowForm onSubmit={onSubmit}>
        <Field label="Nome">
          <input name="name" required />
        </Field>
        <Field label="Turma">
          <select name="turmaId" required defaultValue="">
            <option value="" disabled>
              Escolher
            </option>
            {input.turmas.map((turma) => (
              <option key={turma.id} value={turma.id}>
                {turmaLabel(turma, schoolNameById(input, turma.schoolId))}
              </option>
            ))}
          </select>
        </Field>
        <button type="submit">Adicionar aluno</button>
      </RowForm>
      <ul className="plain-list">
        {input.students.map((student) => {
          const turma = turmaById(input, student.turmaId);
          return (
            <li key={student.id}>
              {student.name}
              {turma
                ? ` · ${turmaLabel(turma, schoolNameById(input, turma.schoolId))}`
                : ""}
              <button
                type="button"
                className="linkish"
                onClick={() =>
                  setInput({
                    ...input,
                    students: input.students.filter((item) => item.id !== student.id),
                    caseload: input.caseload.filter(
                      (goal) => goal.studentId !== student.id,
                    ),
                  })
                }
              >
                Remover
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function TimetableScreen() {
  const { input, setInput } = useOrganizer();
  const [turmaFilter, setTurmaFilter] = useState("");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const turmaId = String(form.get("turmaId") ?? "");
    const weekday = Number(form.get("weekday")) as Weekday;
    const subject = String(form.get("subject") ?? "").trim();
    const startMinutes = parseTimeToMinutes(String(form.get("start") ?? "09:00"));
    const endMinutes = parseTimeToMinutes(String(form.get("end") ?? "09:45"));
    if (!turmaId || !subject) {
      return;
    }
    setInput({
      ...input,
      periods: [
        ...input.periods,
        {
          id: createId(),
          turmaId,
          weekday,
          startMinutes,
          endMinutes,
          subject,
        },
      ],
    });
    event.currentTarget.reset();
  }

  const visiblePeriods = useMemo(
    () =>
      input.periods.filter(
        (period) => !turmaFilter || period.turmaId === turmaFilter,
      ),
    [input.periods, turmaFilter],
  );

  const calendarEvents = useMemo(
    () => periodCalendarEvents(input, visiblePeriods),
    [input, visiblePeriods],
  );

  return (
    <section>
      <h2>Horários</h2>
      <RowForm onSubmit={onSubmit}>
        <Field label="Turma">
          <select name="turmaId" required defaultValue="">
            <option value="" disabled>
              Escolher
            </option>
            {input.turmas.map((turma) => (
              <option key={turma.id} value={turma.id}>
                {turmaLabel(turma, schoolNameById(input, turma.schoolId))}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Dia da semana">
          <select name="weekday" defaultValue="1">
            {WEEKDAYS.map((day) => (
              <option key={day} value={day}>
                {weekdayLabel(day)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Início">
          <input name="start" type="time" defaultValue="09:00" required />
        </Field>
        <Field label="Fim">
          <input name="end" type="time" defaultValue="09:45" required />
        </Field>
        <Field label="Disciplina">
          <input name="subject" placeholder="Matemática" required />
        </Field>
        <button type="submit">Adicionar tempo</button>
      </RowForm>
      {input.turmas.length > 1 ? (
        <label className="field calendar-filter">
          <span>Ver turma</span>
          <select
            value={turmaFilter}
            onChange={(event) => setTurmaFilter(event.target.value)}
          >
            <option value="">Todas</option>
            {input.turmas.map((turma) => (
              <option key={turma.id} value={turma.id}>
                {turmaLabel(turma, schoolNameById(input, turma.schoolId))}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {visiblePeriods.length === 0 ? (
        <p className="hint">Ainda não há tempos letivos neste horário.</p>
      ) : null}
      <WeekCalendar
        events={calendarEvents}
        onRemove={(periodId) =>
          setInput({
            ...input,
            periods: input.periods.filter((item) => item.id !== periodId),
            assistanceSlots: input.assistanceSlots.filter(
              (slot) => slot.periodId !== periodId,
            ),
          })
        }
      />
    </section>
  );
}

function periodCalendarEvents(
  input: OrganizerInput,
  periods: Period[],
): CalendarEvent[] {
  return periods.map((period) => {
    const turma = turmaById(input, period.turmaId);
    const turmaIndex = Math.max(
      input.turmas.findIndex((item) => item.id === period.turmaId),
      0,
    );
    return {
      id: period.id,
      weekday: period.weekday,
      startMinutes: period.startMinutes,
      endMinutes: period.endMinutes,
      title: period.subject,
      subtitle: turma
        ? turmaLabel(turma, schoolNameById(input, turma.schoolId))
        : undefined,
      tone: `tone-${turmaIndex % 4}`,
    };
  });
}

export function AssistanceScreen() {
  const { input, setInput } = useOrganizer();
  const [turmaId, setTurmaId] = useState("");
  const periodsForTurma = input.periods.filter((period) => period.turmaId === turmaId);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const periodId = String(form.get("periodId") ?? "");
    const professorName = String(form.get("professorName") ?? "").trim();
    if (!periodId || !professorName) {
      return;
    }
    setInput({
      ...input,
      assistanceSlots: [
        ...input.assistanceSlots,
        { id: createId(), periodId, professorName },
      ],
    });
    event.currentTarget.reset();
    setTurmaId("");
  }

  return (
    <section>
      <h2>Outros professores</h2>
      <p className="hint">
        O apoio usa os mesmos tempos do horário da turma. Cada turma pode começar a
        horas diferentes. Basta um professor por tempo.
      </p>
      <RowForm onSubmit={onSubmit}>
        <Field label="Turma">
          <select
            name="turmaId"
            required
            value={turmaId}
            onChange={(event) => setTurmaId(event.target.value)}
          >
            <option value="" disabled>
              Escolher
            </option>
            {input.turmas.map((turma) => (
              <option key={turma.id} value={turma.id}>
                {turmaLabel(turma, schoolNameById(input, turma.schoolId))}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tempo letivo">
          <select
            key={turmaId}
            name="periodId"
            required
            defaultValue=""
            disabled={!turmaId}
          >
            <option value="" disabled>
              {turmaId ? "Escolha um tempo desta turma" : "Escolha primeiro a turma"}
            </option>
            {periodsForTurma.map((period) => (
              <option key={period.id} value={period.id}>
                {weekdayLabel(period.weekday)} {minutesToTime(period.startMinutes)}–
                {minutesToTime(period.endMinutes)} · {period.subject}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Professor">
          <input name="professorName" required />
        </Field>
        <button type="submit">Marcar ocupado</button>
      </RowForm>
      <ul className="plain-list">
        {input.assistanceSlots.map((slot) => {
          const period = input.periods.find((item) => item.id === slot.periodId);
          const turma = period ? turmaById(input, period.turmaId) : undefined;
          return (
            <li key={slot.id}>
              {slot.professorName}
              {period
                ? ` · ${weekdayLabel(period.weekday)} ${minutesToTime(period.startMinutes)}–${minutesToTime(period.endMinutes)} · ${period.subject}`
                : ""}
              {turma
                ? ` · ${turmaLabel(turma, schoolNameById(input, turma.schoolId))}`
                : ""}
              <button
                type="button"
                className="linkish"
                onClick={() =>
                  setInput({
                    ...input,
                    assistanceSlots: input.assistanceSlots.filter(
                      (item) => item.id !== slot.id,
                    ),
                  })
                }
              >
                Remover
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function CaseloadScreen() {
  const { input, setInput } = useOrganizer();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const studentId = String(form.get("studentId") ?? "");
    const requiredMinutes = Number(form.get("requiredMinutes") ?? 0);
    const requiredSubjects = String(form.get("requiredSubjects") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (!studentId || requiredMinutes <= 0) {
      return;
    }
    setInput({
      ...input,
      caseload: [
        ...input.caseload.filter((goal) => goal.studentId !== studentId),
        { studentId, requiredMinutes, requiredSubjects, subjectMinutes: {} },
      ],
    });
    event.currentTarget.reset();
  }

  return (
    <section>
      <h2>A minha carga</h2>
      <Field label="Os meus minutos obrigatórios">
        <input
          type="number"
          min={0}
          value={input.requiredTotalMinutes}
          onChange={(event) =>
            setInput({
              ...input,
              requiredTotalMinutes: Number(event.target.value),
            })
          }
        />
      </Field>
      <RowForm onSubmit={onSubmit}>
        <Field label="Aluno">
          <select name="studentId" required defaultValue="">
            <option value="" disabled>
              Escolher
            </option>
            {input.students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Minutos">
          <input name="requiredMinutes" type="number" min={1} defaultValue={45} required />
        </Field>
        <Field label="Disciplinas (vírgula; vazio = qualquer)">
          <input name="requiredSubjects" placeholder="Matemática, Português" />
        </Field>
        <button type="submit">Adicionar à carga</button>
      </RowForm>
      <ul className="plain-list">
        {input.caseload.map((goal) => {
          const student = input.students.find((item) => item.id === goal.studentId);
          return (
            <li key={goal.studentId}>
              {student?.name ?? goal.studentId} · {goal.requiredMinutes} min
              {formatCaseloadSubjects(goal)}
              <button
                type="button"
                className="linkish"
                onClick={() =>
                  setInput({
                    ...input,
                    caseload: input.caseload.filter(
                      (item) => item.studentId !== goal.studentId,
                    ),
                  })
                }
              >
                Remover
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function FreeBlocksScreen() {
  const { input, setInput } = useOrganizer();
  const { configurations } = useConfigurations();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const weekday = Number(form.get("weekday")) as Weekday;
    const startMinutes = parseTimeToMinutes(String(form.get("start") ?? "09:00"));
    const endMinutes = parseTimeToMinutes(String(form.get("end") ?? "12:00"));
    const note = String(form.get("note") ?? "").trim();
    setInput({
      ...input,
      freeBlocks: [
        ...input.freeBlocks,
        { id: createId(), weekday, startMinutes, endMinutes, note },
      ],
    });
    event.currentTarget.reset();
  }

  return (
    <section>
      <h2>Blocos livres</h2>
      <p className="hint">
        Mantenha este intervalo livre. Semanas possíveis:{" "}
        <strong>{configurations.length}</strong>
      </p>
      <RowForm onSubmit={onSubmit}>
        <Field label="Dia da semana">
          <select name="weekday" defaultValue="1">
            {WEEKDAYS.map((day) => (
              <option key={day} value={day}>
                {weekdayLabel(day)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Início">
          <input name="start" type="time" defaultValue="09:00" required />
        </Field>
        <Field label="Fim">
          <input name="end" type="time" defaultValue="12:00" required />
        </Field>
        <Field label="Nota">
          <input name="note" placeholder="Consulta, reunião…" />
        </Field>
        <button type="submit">Manter livre</button>
      </RowForm>
      <ul className="plain-list">
        {input.freeBlocks.map((block) => (
          <li key={block.id}>
            {weekdayLabel(block.weekday)} {minutesToTime(block.startMinutes)}–
            {minutesToTime(block.endMinutes)}
            {block.note ? ` · ${block.note}` : ""}
            <button
              type="button"
              className="linkish"
              onClick={() =>
                setInput({
                  ...input,
                  freeBlocks: input.freeBlocks.filter((item) => item.id !== block.id),
                })
              }
            >
              Remover
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
