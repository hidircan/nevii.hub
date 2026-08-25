import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import { createAssessmentTool, listAssessmentsForStudentTool } from "../services/tools";
import { LESSON_ASSESSMENTS_FILE, clearAssessments } from "../assessment";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "TEACHER", userId: "teacher1", tenantId: DEFAULT_TENANT_ID, teacherId: "t1", channel: "web", ...overrides };
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

beforeEach(async () => {
  await fs.rm(LESSON_ASSESSMENTS_FILE, { force: true });
  await clearAssessments(DEFAULT_TENANT_ID);
});

describe("Faz 3A — LessonAssessment 'çalışılan konular' alanları", () => {
  it("dört alan da girilirse kaydedilir ve geri okunabilir", async () => {
    const res = await createAssessmentTool(ctx(), {
      lessonId: "l1",
      studentId: "s1",
      ...VALID_SCORES,
      piecesWorked: "Für Elise",
      etudesWorked: "Czerny No. 5",
      technicalWork: "Gam çalışması — Do majör",
      theoryWork: "Aralıklar (üçlü, beşli)",
      strengthNote: "Ritim çok iyi",
      nextStepsNote: "Yeni parça",
      improvementNote: "Nota okuma hızlanmalı",
      teacherSignedName: "Öğretmen Adı",
    });
    expect(res.ok).toBe(true);

    const list = await listAssessmentsForStudentTool(ctx({ role: "SCHOOL_ADMIN", teacherId: undefined }), {
      studentId: "s1",
    });
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    const created = list.data.assessments.find((a) => a.lessonId === "l1");
    expect(created?.piecesWorked).toBe("Für Elise");
    expect(created?.etudesWorked).toBe("Czerny No. 5");
    expect(created?.technicalWork).toBe("Gam çalışması — Do majör");
    expect(created?.theoryWork).toBe("Aralıklar (üçlü, beşli)");
  });

  it("hiçbiri girilmezse opsiyonel olarak undefined kalır (zorunlu değil)", async () => {
    const res = await createAssessmentTool(ctx(), {
      lessonId: "l1",
      studentId: "s1",
      ...VALID_SCORES,
      strengthNote: "Ritim çok iyi",
      nextStepsNote: "Yeni parça",
      improvementNote: "Nota okuma hızlanmalı",
      teacherSignedName: "Öğretmen Adı",
    });
    expect(res.ok).toBe(true);

    const list = await listAssessmentsForStudentTool(ctx({ role: "SCHOOL_ADMIN", teacherId: undefined }), {
      studentId: "s1",
    });
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    const created = list.data.assessments.find((a) => a.lessonId === "l1");
    expect(created?.piecesWorked).toBeUndefined();
  });
});
