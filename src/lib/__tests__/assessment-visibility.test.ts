import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import {
  createAssessmentTool,
  listAssessmentsForStudentTool,
  getAssessmentTool,
  getAssessmentReportTool,
} from "../services/tools";
import { LESSON_ASSESSMENTS_FILE, clearAssessments } from "../assessment";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { STUDENT_PORTAL_ACCESS_FILE } from "../student-portal-access";
import { grantStudentAccess } from "./portal-access-test-helper";

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "TEACHER",
    userId: "teacher1",
    tenantId: DEFAULT_TENANT_ID,
    teacherId: "t1",
    channel: "web",
    ...overrides,
  };
}

const VALID_SCORES = {
  teknikBecerisi: 5,
  notaOkuma: 4,
  muzikalite: 4,
  ritimDuyusu: 3,
  calismaDuzeni: 3,
  evOdeviTamamlama: 3,
  dersKatilimi: 4,
  motivasyon: 5,
  genelIlerleme: 4,
  hedefeUlasma: 4,
};

async function createValidAssessment(overrides?: Partial<Record<string, unknown>>) {
  return createAssessmentTool(ctx(), {
    lessonId: "l1",
    studentId: "s1",
    ...VALID_SCORES,
    strengthNote: "Ritim çok iyi",
    nextStepsNote: "Yeni parça",
    improvementNote: "Nota okuma hızlanmalı",
    parentPrivateNote: "Veliye özel: ders ücreti gecikmesi konuşulacak",
    parentNoteVisibleToStudent: false,
    teacherSignedName: "Öğretmen Adı",
    ...overrides,
  });
}

beforeEach(async () => {
  await fs.rm(LESSON_ASSESSMENTS_FILE, { force: true });
  await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
  await clearAssessments(DEFAULT_TENANT_ID);
});

describe("EPIC 7 — createAssessmentTool: yalnızca kendi öğrencisi (TEACHER ownership)", () => {
  it("TEACHER kendi öğrencisi (s1, teacherId=t1) için değerlendirme oluşturabilir", async () => {
    const result = await createValidAssessment();
    expect(result.ok).toBe(true);
  });

  it("TEACHER BAŞKA bir öğretmenin öğrencisi (s2, teacherId=t2) için oluşturamaz (FORBIDDEN)", async () => {
    const result = await createValidAssessment({ studentId: "s2" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("SCHOOL_ADMIN herhangi bir öğrenci için oluşturabilir", async () => {
    const result = await createAssessmentTool(ctx({ role: "SCHOOL_ADMIN", teacherId: undefined }), {
      lessonId: "l2",
      studentId: "s2",
      ...VALID_SCORES,
      strengthNote: "x",
      nextStepsNote: "y",
      improvementNote: "z",
      teacherSignedName: "Yönetici",
    });
    expect(result.ok).toBe(true);
  });

  it("PARENT değerlendirme oluşturamaz (FORBIDDEN)", async () => {
    const result = await createAssessmentTool(ctx({ role: "STUDENT", teacherId: undefined, studentId: "s1" }), {
      lessonId: "l1",
      studentId: "s1",
      ...VALID_SCORES,
      strengthNote: "x",
      nextStepsNote: "y",
      improvementNote: "z",
      teacherSignedName: "x",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("puan aralık dışıysa (0 veya 6) VALIDATION_ERROR döner", async () => {
    const result = await createValidAssessment({ teknikBecerisi: 6 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("teacherId her zaman öğrencinin atanmış öğretmeninden alınır (kayıtta doğrulanır)", async () => {
    const created = await createValidAssessment();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const list = await listAssessmentsForStudentTool(ctx({ role: "SCHOOL_ADMIN", teacherId: undefined }), {
      studentId: "s1",
    });
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.data.assessments[0]?.teacherId).toBe("t1");
  });
});

describe("EPIC 7 — listAssessmentsForStudentTool: erişim ve parentPrivateNote görünürlüğü", () => {
  it("TEACHER kendi öğrencisinin değerlendirmelerini görür (parentPrivateNote dahil — bugünkü rol setinde herkes görür)", async () => {
    await createValidAssessment();
    const result = await listAssessmentsForStudentTool(ctx(), { studentId: "s1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.assessments).toHaveLength(1);
    expect(result.data.assessments[0].parentPrivateNote).toBe(
      "Veliye özel: ders ücreti gecikmesi konuşulacak"
    );
  });

  it("TEACHER başka öğretmenin öğrencisinin değerlendirmelerini göremez (FORBIDDEN)", async () => {
    const result = await listAssessmentsForStudentTool(ctx(), { studentId: "s2" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("veli (STUDENT rolü, GUARDIAN erişimi) yalnızca kendi çocuğunun değerlendirmelerini görebilir", async () => {
    await createValidAssessment();
    const parentCtx = ctx({ role: "STUDENT", teacherId: undefined, studentId: "s1" });
    await grantStudentAccess(parentCtx, "s1", "GUARDIAN");
    const own = await listAssessmentsForStudentTool(parentCtx, { studentId: "s1" });
    expect(own.ok).toBe(true);
    if (own.ok) expect(own.data.assessments).toHaveLength(1);

    const other = await listAssessmentsForStudentTool(parentCtx, { studentId: "s2" });
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.error.code).toBe("FORBIDDEN");
  });
});

describe("EPIC 7 — getAssessmentTool", () => {
  it("kayıt bulunamazsa NOT_FOUND döner", async () => {
    const result = await getAssessmentTool(ctx(), { assessmentId: "does-not-exist" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("başka öğretmenin öğrencisine ait kaydı TEACHER göremez (FORBIDDEN)", async () => {
    const created = await createAssessmentTool(ctx({ role: "SCHOOL_ADMIN", teacherId: undefined }), {
      lessonId: "l2",
      studentId: "s2",
      ...VALID_SCORES,
      strengthNote: "x",
      nextStepsNote: "y",
      improvementNote: "z",
      teacherSignedName: "Yönetici",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await getAssessmentTool(ctx(), { assessmentId: created.data.assessmentId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });
});

describe("EPIC 7 — getAssessmentReportTool: 4 haftalık birleşik rapor", () => {
  it("trend, oluşturulan değerlendirme sayısı kadar nokta içerir", async () => {
    await createValidAssessment();
    await createValidAssessment({ lessonId: "l7" });
    const result = await getAssessmentReportTool(ctx(), { studentId: "s1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.assessments).toHaveLength(2);
    expect(result.data.trend).toHaveLength(2);
  });
});
