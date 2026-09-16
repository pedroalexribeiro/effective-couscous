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
  const range = calendarTimeRange(events);
  const hours = hourMarks(range);
  const height =
    TOP_PAD_PX + (range.endMinutes - range.startMinutes) * PIXELS_PER_MINUTE;

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
  onRemove,
}: {
  event: PlacedEvent;
  rangeStart: number;
  onRemove?: (id: string) => void;
}) {
  const widthPercent = 100 / event.columnCount;
  const duration = Math.max(event.endMinutes - event.startMinutes, 20);
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
      className={`calendar-event ${event.tone ?? "tone-0"}${onRemove ? " has-remove" : ""}`}
      title={tooltip}
      style={{
        top: offsetPx(event.startMinutes, rangeStart),
        height: duration * PIXELS_PER_MINUTE,
        left: `calc(${event.column * widthPercent}% + 2px)`,
        width: `calc(${widthPercent}% - 4px)`,
      }}
    >
      {onRemove ? (
        <button
          type="button"
          className="calendar-event-remove"
          aria-label={`Remover ${event.title}`}
          onClick={() => onRemove(event.id)}
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
