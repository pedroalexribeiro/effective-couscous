import { EMPTY_PREFERENCES, emptyOrganizerInput } from "../domain/index.ts";
import type { OrganizerInput } from "../domain/index.ts";

export function twoStudentsSameMathPeriod(): OrganizerInput {
  const input = emptyOrganizerInput();
  input.schools = [{ id: "school-1", name: "Escola Norte", defaultTravelMinutes: 20 }];
  input.turmas = [
    { id: "turma-5a", year: 5, identification: "A", schoolId: "school-1" },
  ];
  input.periods = [
    {
      id: "p-math-mon",
      turmaId: "turma-5a",
      weekday: 1,
      startMinutes: 9 * 60,
      endMinutes: 9 * 60 + 45,
      subject: "Math",
    },
  ];
  input.students = [
    { id: "ana", name: "Ana", turmaId: "turma-5a" },
    { id: "bruno", name: "Bruno", turmaId: "turma-5a" },
  ];
  input.caseload = [
    { studentId: "ana", requiredMinutes: 45, requiredSubjects: ["Math"] },
    { studentId: "bruno", requiredMinutes: 45, requiredSubjects: ["Math"] },
  ];
  input.requiredTotalMinutes = 45;
  input.preferences = { ...EMPTY_PREFERENCES };
  return input;
}

export function twoNonOverlappingPeriods(): OrganizerInput {
  const input = twoStudentsSameMathPeriod();
  input.students = [{ id: "ana", name: "Ana", turmaId: "turma-5a" }];
  input.caseload = [
    { studentId: "ana", requiredMinutes: 45, requiredSubjects: [] },
  ];
  input.requiredTotalMinutes = 45;
  input.periods = [
    {
      id: "p-math-mon",
      turmaId: "turma-5a",
      weekday: 1,
      startMinutes: 9 * 60,
      endMinutes: 9 * 60 + 45,
      subject: "Math",
    },
    {
      id: "p-pt-tue",
      turmaId: "turma-5a",
      weekday: 2,
      startMinutes: 9 * 60,
      endMinutes: 9 * 60 + 45,
      subject: "Portuguese",
    },
  ];
  return input;
}
