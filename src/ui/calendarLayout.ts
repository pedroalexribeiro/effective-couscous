import type { Weekday } from "../domain/index.ts";

export type CalendarEvent = {
  id: string;
  weekday: Weekday;
  startMinutes: number;
  endMinutes: number;
  title: string;
  subtitle?: string;
  detail?: string;
  tone?: string;
};

export type PlacedEvent = CalendarEvent & {
  column: number;
  columnCount: number;
};

export type TimeRange = {
  startMinutes: number;
  endMinutes: number;
};

const DEFAULT_START_MINUTES = 9 * 60;
const DEFAULT_END_MINUTES = 16 * 60;

export function calendarTimeRange(events: CalendarEvent[]): TimeRange {
  if (events.length === 0) {
    return {
      startMinutes: DEFAULT_START_MINUTES,
      endMinutes: DEFAULT_END_MINUTES,
    };
  }

  const earliest = Math.min(...events.map((event) => event.startMinutes));
  const latest = Math.max(...events.map((event) => event.endMinutes));
  return {
    startMinutes: Math.floor(earliest / 60) * 60,
    endMinutes: Math.ceil(latest / 60) * 60,
  };
}

export function hourMarks(range: TimeRange): number[] {
  const marks: number[] = [];
  for (
    let minutes = range.startMinutes;
    minutes <= range.endMinutes;
    minutes += 60
  ) {
    marks.push(minutes);
  }
  return marks;
}

export function placeOverlappingEvents(events: CalendarEvent[]): PlacedEvent[] {
  const sorted = [...events].sort((left, right) => {
    if (left.startMinutes !== right.startMinutes) {
      return left.startMinutes - right.startMinutes;
    }
    return right.endMinutes - left.endMinutes;
  });

  const placed: PlacedEvent[] = [];
  let cluster: Array<{ event: CalendarEvent; column: number }> = [];
  let columnEnds: number[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;

  function flushCluster() {
    const columnCount = Math.max(columnEnds.length, 1);
    for (const item of cluster) {
      placed.push({
        ...item.event,
        column: item.column,
        columnCount,
      });
    }
    cluster = [];
    columnEnds = [];
    clusterEnd = Number.NEGATIVE_INFINITY;
  }

  for (const event of sorted) {
    if (cluster.length > 0 && event.startMinutes >= clusterEnd) {
      flushCluster();
    }

    let column = columnEnds.findIndex((end) => end <= event.startMinutes);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(event.endMinutes);
    } else {
      columnEnds[column] = event.endMinutes;
    }

    cluster.push({ event, column });
    clusterEnd = Math.max(clusterEnd, event.endMinutes);
  }

  flushCluster();
  return placed;
}
