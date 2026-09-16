export type Weekday = 1 | 2 | 3 | 4 | 5;

export type VisitKind = "one_on_one" | "group";

export type School = {
  id: string;
  name: string;
  defaultTravelMinutes: number;
};

export type Turma = {
  id: string;
  year: number;
  identification: string;
  schoolId: string;
};

export type Period = {
  id: string;
  turmaId: string;
  weekday: Weekday;
  startMinutes: number;
  endMinutes: number;
  subject: string;
};

export type Student = {
  id: string;
  name: string;
  turmaId: string;
};

export type CaseloadGoal = {
  studentId: string;
  requiredMinutes: number;
  requiredSubjects: string[];
  subjectMinutes: Record<string, number>;
};

export type AssistanceSlot = {
  id: string;
  periodId: string;
  professorName: string;
};

export type FreeBlock = {
  id: string;
  weekday: Weekday;
  startMinutes: number;
  endMinutes: number;
  note: string;
};

export type Preferences = {
  preferredWeekdays: Weekday[];
  avoidedWeekdays: Weekday[];
  preferredTimeStartMinutes: number | null;
  preferredTimeEndMinutes: number | null;
  maxMinutesPerDay: number | null;
  minBreakMinutes: number;
};

export type OrganizerInput = {
  schools: School[];
  turmas: Turma[];
  periods: Period[];
  students: Student[];
  assistanceSlots: AssistanceSlot[];
  caseload: CaseloadGoal[];
  requiredTotalMinutes: number;
  freeBlocks: FreeBlock[];
  preferences: Preferences;
};

export type Visit = {
  periodId: string;
  studentIds: string[];
  kind: VisitKind;
  minutes: number;
};

export type Configuration = {
  visits: Visit[];
  wallClockMinutes: number;
  studentMinutes: Record<string, number>;
  score: number;
};

export type EnumerateResult = {
  configurations: Configuration[];
  infeasibleReasons: string[];
};

export const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];

export const EMPTY_PREFERENCES: Preferences = {
  preferredWeekdays: [],
  avoidedWeekdays: [],
  preferredTimeStartMinutes: null,
  preferredTimeEndMinutes: null,
  maxMinutesPerDay: null,
  minBreakMinutes: 0,
};

export function emptyOrganizerInput(): OrganizerInput {
  return {
    schools: [],
    turmas: [],
    periods: [],
    students: [],
    assistanceSlots: [],
    caseload: [],
    requiredTotalMinutes: 0,
    freeBlocks: [],
    preferences: { ...EMPTY_PREFERENCES },
  };
}
