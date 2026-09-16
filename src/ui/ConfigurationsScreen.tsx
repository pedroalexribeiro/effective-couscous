import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent,
} from "react";
import {
  schoolNameById,
  turmaById,
  turmaLabel,
  weekdayLabel,
} from "../domain/index.ts";
import type {
  CaseloadGoal,
  Configuration,
  OrganizerInput,
  Period,
  Visit,
  Weekday,
} from "../domain/index.ts";
import { useConfigurations, useOrganizer } from "./OrganizerContext.tsx";
import { horizontalSwipeDirection } from "./swipe.ts";
import { WeekCalendar, type CalendarEvent } from "./WeekCalendar.tsx";

function periodLookup(periods: Period[]): Map<string, Period> {
  return new Map(periods.map((period) => [period.id, period]));
}

function weeksHint(shown: number, totalFound: number): string {
  if (totalFound > shown) {
    return `${totalFound} combinações cumprem todos os requisitos. A lista mostra as ${shown} sem tempos dispensáveis, melhores primeiro. As preferências só ordenam.`;
  }
  if (shown === 1) {
    return "1 semana possível. As preferências só ordenam esta lista.";
  }
  return `${shown} semanas possíveis, melhores primeiro. As preferências só ordenam esta lista.`;
}

function avoidedDayHint(
  visits: Visit[],
  periods: Map<string, Period>,
  avoidedWeekdays: Weekday[],
): string | null {
  if (avoidedWeekdays.length === 0) {
    return null;
  }
  const counts = new Map<Weekday, number>();
  for (const visit of visits) {
    const day = periods.get(visit.periodId)?.weekday;
    if (day === undefined || !avoidedWeekdays.includes(day)) {
      continue;
    }
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  if (counts.size === 0) {
    return null;
  }
  const parts = [...counts.entries()].map(([day, count]) => {
    const aulas = count === 1 ? "1 aula" : `${count} aulas`;
    return `${aulas} de ${weekdayLabel(day).toLowerCase()}`;
  });
  return `Ainda há ${parts.join(" e ")} porque a carga não fecha sem elas. Evitar um dia não dispensa tempos obrigatórios.`;
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
  const lastIndex = Math.max(0, configurations.length - 1);
  const canGoPrev = selectedIndex > 0;
  const canGoNext = selectedIndex < lastIndex;
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  const goPrev = useCallback(() => {
    setSelectedIndex((index) => Math.max(0, index - 1));
  }, []);

  const goNext = useCallback(() => {
    setSelectedIndex((index) => Math.min(lastIndex, index + 1));
  }, [lastIndex]);

  if (selectedIndex > lastIndex) {
    setSelectedIndex(0);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target) || configurations.length === 0) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [configurations.length, goNext, goPrev]);

  function onSwipeStart(event: TouchEvent<HTMLDivElement>) {
    if (event.touches.length !== 1 || isInsideCalendar(event.target)) {
      swipeStart.current = null;
      return;
    }
    const touch = event.changedTouches[0];
    swipeStart.current = { x: touch.clientX, y: touch.clientY };
  }

  function onSwipeEnd(event: TouchEvent<HTMLDivElement>) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) {
      return;
    }
    const touch = event.changedTouches[0];
    const direction = horizontalSwipeDirection(
      touch.clientX - start.x,
      touch.clientY - start.y,
    );
    if (direction === "left") {
      goNext();
    }
    if (direction === "right") {
      goPrev();
    }
  }

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
        <div
          className="config-viewer"
          onTouchStart={onSwipeStart}
          onTouchEnd={onSwipeEnd}
          onTouchCancel={() => {
            swipeStart.current = null;
          }}
        >
          <p className="hint">
            {weeksHint(configurations.length, totalFound)}
            {calculationIsStale ? " Os dados mudaram desde este cálculo." : ""}
          </p>
          {configurations.length > 1 ? (
            <ConfigurationPager
              selectedIndex={selectedIndex}
              count={configurations.length}
              canGoPrev={canGoPrev}
              canGoNext={canGoNext}
              onPrev={goPrev}
              onNext={goNext}
              onSelect={setSelectedIndex}
            />
          ) : null}
          {selected ? (
            <ConfigurationDetail configuration={selected} periods={periods} />
          ) : null}
        </div>
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
          <p className="hint">
            Os dados mudaram. Calcule de novo para atualizar a lista.
          </p>
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

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
  );
}

function isInsideCalendar(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(".calendar-week") !== null;
}

function ConfigurationPager({
  selectedIndex,
  count,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
  onSelect,
}: {
  selectedIndex: number;
  count: number;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="config-pager" role="group" aria-label="Percorrer semanas">
      <button type="button" onClick={onPrev} disabled={!canGoPrev}>
        ← Anterior
      </button>
      <label className="config-pager-status">
        <span className="visually-hidden">Ir para</span>
        <select
          value={selectedIndex}
          onChange={(event) => onSelect(Number(event.target.value))}
        >
          {Array.from({ length: count }, (_, index) => (
            <option key={index} value={index}>
              {`Semana ${index + 1} de ${count}`}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={onNext} disabled={!canGoNext}>
        Seguinte →
      </button>
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
  const avoidedHint = avoidedDayHint(
    configuration.visits,
    periods,
    input.preferences.avoidedWeekdays,
  );

  return (
    <div>
      <WeekCalendar
        events={visitCalendarEvents(configuration.visits, periods, input)}
      />
      <div className="config-summary">
        {avoidedHint ? <p className="hint">{avoidedHint}</p> : null}
        <p>
          O seu tempo: <strong>{configuration.wallClockMinutes} min</strong>{" "}
          (precisa de {input.requiredTotalMinutes})
        </p>
        <ul className="plain-list">
          {input.caseload.map((goal) => {
            const student = input.students.find(
              (item) => item.id === goal.studentId,
            );
            const got = configuration.studentMinutes[goal.studentId] ?? 0;
            return (
              <li key={goal.studentId}>
                {student?.name ?? goal.studentId}: {got} /{" "}
                {goal.requiredMinutes} min
                {formatGoalSplit(goal)}
              </li>
            );
          })}
        </ul>
      </div>
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
    const subtitle =
      visit.kind === "presence"
        ? "Só presença"
        : `${names} · ${visit.kind === "group" ? "grupo" : "1:1"}`;
    return [
      {
        id: visit.periodId,
        weekday: period.weekday,
        startMinutes: period.startMinutes,
        endMinutes: period.endMinutes,
        title: period.subject,
        subtitle,
        detail: turma
          ? turmaLabel(turma, schoolNameById(input, turma.schoolId))
          : undefined,
        tone: visit.kind === "group" ? "tone-group" : "tone-visit",
      },
    ];
  });
}
