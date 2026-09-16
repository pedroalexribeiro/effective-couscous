import { periodDuration } from "./time.ts";
import type { OrganizerInput, Turma } from "./types.ts";

export function turmaLabel(turma: Turma, schoolName: string): string {
  return `${turma.year}.º ${turma.identification} · ${schoolName}`;
}

export function schoolNameById(
  input: OrganizerInput,
  schoolId: string,
): string {
  return input.schools.find((school) => school.id === schoolId)?.name ?? schoolId;
}

export function turmaById(input: OrganizerInput, turmaId: string): Turma | undefined {
  return input.turmas.find((turma) => turma.id === turmaId);
}

export function studentIsEligibleForPeriod(
  requiredSubjects: string[],
  studentTurmaId: string,
  periodTurmaId: string,
  periodSubject: string,
): boolean {
  if (studentTurmaId !== periodTurmaId) {
    return false;
  }
  if (requiredSubjects.length === 0) {
    return true;
  }
  return requiredSubjects.includes(periodSubject);
}

export function validateInput(input: OrganizerInput): string[] {
  const issues: string[] = [];

  for (const turma of input.turmas) {
    if (!input.schools.some((school) => school.id === turma.schoolId)) {
      issues.push(`A turma ${turma.year}.º ${turma.identification} não tem escola.`);
    }
  }

  for (const period of input.periods) {
    if (!input.turmas.some((turma) => turma.id === period.turmaId)) {
      issues.push(`O tempo de ${period.subject} aponta para uma turma inexistente.`);
    }
    if (periodDuration(period.startMinutes, period.endMinutes) <= 0) {
      issues.push(`O tempo de ${period.subject} tem de terminar depois de começar.`);
    }
  }

  for (const student of input.students) {
    if (!input.turmas.some((turma) => turma.id === student.turmaId)) {
      issues.push(`${student.name} não tem turma.`);
    }
  }

  for (const goal of input.caseload) {
    if (!input.students.some((student) => student.id === goal.studentId)) {
      issues.push("A carga aponta para um aluno inexistente.");
    }
    if (goal.requiredMinutes <= 0) {
      issues.push("Cada aluno da carga precisa de um número positivo de minutos.");
    }
  }

  if (input.requiredTotalMinutes < 0) {
    issues.push("Os minutos obrigatórios não podem ser negativos.");
  }

  return issues;
}
