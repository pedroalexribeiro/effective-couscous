import { describe, expect, it } from "vitest";
import { effectiveSubjectMinutes } from "./caseload.ts";

describe("effectiveSubjectMinutes", () => {
  it("keeps an explicit split", () => {
    expect(
      effectiveSubjectMinutes({
        studentId: "duarte",
        requiredMinutes: 150,
        requiredSubjects: ["Português", "Matemática"],
        subjectMinutes: { Português: 100, Matemática: 50 },
      }),
    ).toEqual({ Português: 100, Matemática: 50 });
  });

  it("has no subject quotas when none are spelled out", () => {
    expect(
      effectiveSubjectMinutes({
        studentId: "rodrigo",
        requiredMinutes: 60,
        requiredSubjects: ["Português", "Matemática"],
        subjectMinutes: {},
      }),
    ).toEqual({});
  });

  it("has no subject quotas when any subject is allowed", () => {
    expect(
      effectiveSubjectMinutes({
        studentId: "ana",
        requiredMinutes: 45,
        requiredSubjects: [],
        subjectMinutes: {},
      }),
    ).toEqual({});
  });
});
