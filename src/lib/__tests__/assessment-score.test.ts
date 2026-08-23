import { describe, it, expect } from "vitest";
import {
  computeOverallScore,
  computeSectionScore,
  computeTrend,
  canViewParentPrivateNote,
  stripPrivateNoteForRecipient,
} from "../assessment/score";
import type { AssessmentScores, LessonAssessment } from "../types";

const SCORES: AssessmentScores = {
  teknikBecerisi: 5,
  notaOkuma: 5,
  muzikalite: 4,
  ritimDuyusu: 4,
  calismaDuzeni: 3,
  evOdeviTamamlama: 3,
  dersKatilimi: 2,
  motivasyon: 2,
  genelIlerleme: 1,
  hedefeUlasma: 1,
};

function assessment(overrides: Partial<LessonAssessment>): LessonAssessment {
  return {
    id: "a1",
    lessonId: "l1",
    studentId: "s1",
    teacherId: "t1",
    ...SCORES,
    strengthNote: "İyi",
    nextStepsNote: "Devam",
    improvementNote: "Ritim",
    parentPrivateNote: "gizli not",
    parentNoteVisibleToStudent: false,
    teacherSignedName: "Öğretmen",
    teacherSignedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("EPIC 7 — computeOverallScore / computeSectionScore", () => {
  it("genel ortalama tüm 10 maddenin ortalamasıdır", () => {
    expect(computeOverallScore(SCORES)).toBe((5 + 5 + 4 + 4 + 3 + 3 + 2 + 2 + 1 + 1) / 10);
  });

  it("A bölümü (teknikBecerisi+notaOkuma) ortalaması doğru hesaplanır", () => {
    expect(computeSectionScore(SCORES, "A")).toBe(5);
  });

  it("E bölümü (genelIlerleme+hedefeUlasma) ortalaması doğru hesaplanır", () => {
    expect(computeSectionScore(SCORES, "E")).toBe(1);
  });

  it("ekstra (id/lessonId gibi) alanlar içeren bir LessonAssessment nesnesi verilse bile yalnızca skor alanları kullanılır", () => {
    const a = assessment({});
    expect(computeOverallScore(a)).toBe(computeOverallScore(SCORES));
  });
});

describe("EPIC 7 — computeTrend", () => {
  it("son N değerlendirmeyi tarihe göre artan sırada döner", () => {
    const older = assessment({ id: "old", createdAt: "2026-01-01T00:00:00.000Z" });
    const newer = assessment({ id: "new", createdAt: "2026-02-01T00:00:00.000Z" });
    const trend = computeTrend([newer, older]);
    expect(trend.map((t) => t.assessmentId)).toEqual(["old", "new"]);
  });

  it("limit'ten fazla değerlendirme varsa yalnızca en son N tanesi döner", () => {
    const items = [1, 2, 3, 4, 5].map((n) =>
      assessment({ id: `a${n}`, createdAt: `2026-0${n}-01T00:00:00.000Z` })
    );
    const trend = computeTrend(items, 4);
    expect(trend).toHaveLength(4);
    expect(trend.map((t) => t.assessmentId)).toEqual(["a2", "a3", "a4", "a5"]);
  });
});

describe("EPIC 7 — canViewParentPrivateNote / stripPrivateNoteForRecipient", () => {
  it("SCHOOL_ADMIN/SUPER_ADMIN/TEACHER/AI_AGENT her zaman görür", () => {
    for (const role of ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER", "AI_AGENT"]) {
      expect(canViewParentPrivateNote(role, false)).toBe(true);
    }
  });

  it("Karma Öğrenci Portalı — STUDENT rolü + accessType=GUARDIAN (eski PARENT rolünün karşılığı) her zaman görür", () => {
    expect(canViewParentPrivateNote("STUDENT", false, "GUARDIAN")).toBe(true);
  });

  it("STUDENT rolü + accessType=SELF (öğrencinin kendisi), parentNoteVisibleToStudent=false iken göremez", () => {
    expect(canViewParentPrivateNote("STUDENT", false, "SELF")).toBe(false);
    expect(canViewParentPrivateNote("STUDENT", false)).toBe(false);
  });

  it("STUDENT rolü + accessType=SELF, öğretmen açıkça izin verdiyse (parentNoteVisibleToStudent=true) görebilir", () => {
    expect(canViewParentPrivateNote("STUDENT", true, "SELF")).toBe(true);
  });

  it("stripPrivateNoteForRecipient: izinsiz alıcı (SELF) için parentPrivateNote yanıttan TAMAMEN çıkarılır", () => {
    const a = assessment({ parentNoteVisibleToStudent: false });
    const stripped = stripPrivateNoteForRecipient(a, "STUDENT", "SELF");
    expect(stripped.parentPrivateNote).toBeUndefined();
    expect("parentPrivateNote" in stripped).toBe(true); // alan var ama değeri undefined — response'ta hiç görünmemeli (JSON.stringify düşürür)
  });

  it("stripPrivateNoteForRecipient: izinli alıcı (GUARDIAN) için not olduğu gibi kalır", () => {
    const a = assessment({ parentPrivateNote: "gizli not" });
    const kept = stripPrivateNoteForRecipient(a, "STUDENT", "GUARDIAN");
    expect(kept.parentPrivateNote).toBe("gizli not");
  });
});
