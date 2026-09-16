import { useEffect, useState } from "react";
import { WEEKDAYS, minutesToTime, weekdayLabel } from "../domain/index.ts";
import type { CalendarEvent, PlacedEvent } from "./calendarLayout.ts";
import {
  calendarTimeRange,
  hourMarks,
  placeOverlappingEvents,
} from "./calendarLayout.ts";

export type { CalendarEvent } from "./calendarLayout.ts";

const PIXELS_PER_MINUTE = 1.5;
const TOP_PAD_PX = 10;

function offsetPx(minutes: number, rangeStart: number): number {
  return TOP_PAD_PX + (minutes - rangeStart) * PIXELS_PER_MINUTE;
}

export function WeekCalendar({
  events,
  onRemove,
}: {
  events: CalendarEvent[];
  onRemove?: (id: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const eventKey = events.map((event) => event.id).join("|");
  const range = calendarTimeRange(events);
  const hours = hourMarks(range);
  const height =
    TOP_PAD_PX +
    (range.endMinutes - range.startMinutes) * PIXELS_PER_MINUTE +
    (expandedId ? 72 : 0);

  useEffect(() => {
    setExpandedId(null);
  }, [eventKey]);

  function toggleEvent(id: string) {
    setExpandedId((current) => (current === id ? null : id));
  }

  return (
    <div className="calendar-week">
      <div className="calendar-week-head">
        <div className="calendar-time-gutter" />
        {WEEKDAYS.map((day) => (
          <div key={day} className="calendar-day-head">
            {weekdayLabel(day)}
          </div>
        ))}
      </div>
      <div className="calendar-week-body" style={{ height }}>
        <div className="calendar-time-gutter">
          {hours.map((minutes) => (
            <div
              key={minutes}
              className="calendar-hour-label"
              style={{
                top: offsetPx(minutes, range.startMinutes),
              }}
            >
              {minutesToTime(minutes)}
            </div>
          ))}
        </div>
        {WEEKDAYS.map((day) => {
          const placed = placeOverlappingEvents(
            events.filter((event) => event.weekday === day),
          );

          return (
            <div key={day} className="calendar-day-col">
              {hours.map((minutes) => (
                <div
                  key={minutes}
                  className="calendar-hour-line"
                  style={{
                    top: offsetPx(minutes, range.startMinutes),
                  }}
                />
              ))}
              {placed.map((event) => (
                <CalendarEventCard
                  key={event.id}
                  event={event}
                  rangeStart={range.startMinutes}
                  expanded={event.id === expandedId}
                  onToggle={() => toggleEvent(event.id)}
                  onRemove={onRemove}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalendarEventCard({
  event,
  rangeStart,
  expanded,
  onToggle,
  onRemove,
}: {
  event: PlacedEvent;
  rangeStart: number;
  expanded: boolean;
  onToggle: () => void;
  onRemove?: (id: string) => void;
}) {
  const widthPercent = 100 / event.columnCount;
  const slotHeight = Math.max(event.endMinutes - event.startMinutes, 20) * PIXELS_PER_MINUTE;
  const tooltip = [
    `${minutesToTime(event.startMinutes)}–${minutesToTime(event.endMinutes)}`,
    event.title,
    event.subtitle,
    event.detail,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className={`calendar-event ${event.tone ?? "tone-0"}${onRemove ? " has-remove" : ""}${expanded ? " is-expanded" : ""}`}
      title={tooltip}
      role={onRemove ? undefined : "button"}
      aria-expanded={expanded}
      onClick={onToggle}
      onKeyDown={(keyboardEvent) => {
        if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
          keyboardEvent.preventDefault();
          onToggle();
        }
      }}
      tabIndex={0}
      style={{
        top: offsetPx(event.startMinutes, rangeStart),
        left: `calc(${event.column * widthPercent}% + 2px)`,
        width: `calc(${widthPercent}% - 4px)`,
        ...(expanded
          ? { height: "auto", minHeight: slotHeight }
          : { height: slotHeight }),
      }}
    >
      {onRemove ? (
        <button
          type="button"
          className="calendar-event-remove"
          aria-label={`Remover ${event.title}`}
          onClick={(clickEvent) => {
            clickEvent.stopPropagation();
            onRemove(event.id);
          }}
        >
          ×
        </button>
      ) : null}
      <p className="calendar-event-time">
        {minutesToTime(event.startMinutes)}–{minutesToTime(event.endMinutes)}
      </p>
      <p className="calendar-event-title">{event.title}</p>
      {event.subtitle ? <p>{event.subtitle}</p> : null}
      {event.detail ? <p className="hint">{event.detail}</p> : null}
    </article>
  );
}
