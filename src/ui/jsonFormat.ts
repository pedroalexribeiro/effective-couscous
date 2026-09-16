import {
  minutesToTime,
  parseTimeToMinutes,
} from "../domain/index.ts";
import type {
  CaseloadGoal,
  FreeBlock,
  OrganizerInput,
  Period,
} from "../domain/index.ts";

type FilePeriod = Omit<Period, "startMinutes" | "endMinutes"> & {
  start: string;
  end: string;
};

type FileFreeBlock = Omit<FreeBlock, "startMinutes" | "endMinutes"> & {
  start: string;
  end: string;
};

export type FileOrganizerInput = Omit<OrganizerInput, "periods" | "freeBlocks"> & {
  periods: FilePeriod[];
  freeBlocks: FileFreeBlock[];
};

type RawClock = {
  start?: unknown;
  end?: unknown;
  startMinutes?: unknown;
  endMinutes?: unknown;
};

function clockToMinutes(clock: unknown, minutes: unknown): number {
  if (typeof clock === "string" && clock.includes(":")) {
    return parseTimeToMinutes(clock);
  }
  if (typeof minutes === "number") {
    return minutes;
  }
  return 0;
}

function periodFromFile(raw: Period & RawClock): Period {
  const { start, end, startMinutes, endMinutes, ...rest } = raw;
  return {
    ...rest,
    startMinutes: clockToMinutes(start, startMinutes),
    endMinutes: clockToMinutes(end, endMinutes),
  };
}

function freeBlockFromFile(raw: FreeBlock & RawClock): FreeBlock {
  const { start, end, startMinutes, endMinutes, ...rest } = raw;
  return {
    ...rest,
    startMinutes: clockToMinutes(start, startMinutes),
    endMinutes: clockToMinutes(end, endMinutes),
  };
}

function periodToFile(period: Period): FilePeriod {
  const { startMinutes, endMinutes, ...rest } = period;
  return {
    ...rest,
    start: minutesToTime(startMinutes),
    end: minutesToTime(endMinutes),
  };
}

function freeBlockToFile(block: FreeBlock): FileFreeBlock {
  const { startMinutes, endMinutes, ...rest } = block;
  return {
    ...rest,
    start: minutesToTime(startMinutes),
    end: minutesToTime(endMinutes),
  };
}

function caseloadFromFile(raw: CaseloadGoal): CaseloadGoal {
  return {
    ...raw,
    requiredSubjects: raw.requiredSubjects ?? [],
    subjectMinutes: raw.subjectMinutes ?? {},
  };
}

export function organizerToFileJson(input: OrganizerInput): FileOrganizerInput {
  return {
    ...input,
    periods: input.periods.map(periodToFile),
    freeBlocks: input.freeBlocks.map(freeBlockToFile),
  };
}

export function organizerFromFileJson(raw: unknown): OrganizerInput {
  const input = raw as OrganizerInput & {
    periods: Array<Period & RawClock>;
    freeBlocks: Array<FreeBlock & RawClock>;
  };
  return {
    ...input,
    periods: (input.periods ?? []).map(periodFromFile),
    freeBlocks: (input.freeBlocks ?? []).map(freeBlockFromFile),
    caseload: (input.caseload ?? []).map(caseloadFromFile),
  };
}
