import { EMPTY_PREFERENCES } from "../domain/index.ts";
import type { OrganizerInput } from "../domain/index.ts";

export function sampleWeek(): OrganizerInput {
  return {
    schools: [
      { id: "school-norte", name: "Escola Norte", defaultTravelMinutes: 20 },
      { id: "school-sul", name: "Escola Sul", defaultTravelMinutes: 20 },
    ],
    turmas: [
      { id: "turma-5a", year: 5, identification: "A", schoolId: "school-norte" },
      { id: "turma-6b", year: 6, identification: "B", schoolId: "school-sul" },
    ],
    periods: [
      {
        id: "p-5a-math-mon",
        turmaId: "turma-5a",
        weekday: 1,
        startMinutes: 9 * 60,
        endMinutes: 9 * 60 + 45,
        subject: "Matemática",
      },
      {
        id: "p-5a-pt-tue",
        turmaId: "turma-5a",
        weekday: 2,
        startMinutes: 9 * 60,
        endMinutes: 9 * 60 + 45,
        subject: "Português",
      },
      {
        id: "p-6b-math-wed",
        turmaId: "turma-6b",
        weekday: 3,
        startMinutes: 11 * 60,
        endMinutes: 11 * 60 + 45,
        subject: "Matemática",
      },
    ],
    students: [
      { id: "ana", name: "Ana", turmaId: "turma-5a" },
      { id: "bruno", name: "Bruno", turmaId: "turma-5a" },
      { id: "carla", name: "Carla", turmaId: "turma-6b" },
    ],
    assistanceSlots: [
      {
        id: "occupied-pt",
        periodId: "p-5a-pt-tue",
        professorName: "Prof. Silva",
      },
    ],
    caseload: [
      { studentId: "ana", requiredMinutes: 45, requiredSubjects: ["Matemática"], subjectMinutes: {} },
      { studentId: "bruno", requiredMinutes: 45, requiredSubjects: ["Matemática"], subjectMinutes: {} },
      { studentId: "carla", requiredMinutes: 45, requiredSubjects: ["Matemática"], subjectMinutes: {} },
    ],
    requiredTotalMinutes: 90,
    freeBlocks: [],
    preferences: {
      ...EMPTY_PREFERENCES,
      minBreakMinutes: 0,
    },
  };
}
