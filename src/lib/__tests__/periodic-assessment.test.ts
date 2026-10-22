import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import { computePendingPeriodicAssessmentPeriods, PERIODIC_ASSESSMENTS_FILE, clearPeriodicAssessments } from "../periodic-assessment";
import { createPeriodicAssessmentTool, listPendingPeriodicAssessmentsTool, listPeriodicAssessmentsForStudentTool } from "../services/tools";
import { buildPeriodicAssessmentDraft, LESSON_REPORT_PLACEHOLDERS, PERIODIC_REPORT_PLACEHOLDERS } from "../reports/guidance";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { grantStudentAccess } from "./portal-access-test-helper";
import { STUDENT_PORTAL_ACCESS_FILE } from "../student-portal-access";

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "TEACHER", userId: "teacher1", tenantId: DEFAULT_TENANT_ID, teacherId: "t1", channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(PERIODIC_ASSESSMENTS_FILE, { force: true });
  await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
  await clearPeriodicAssessments(DEFAULT_TENANT_ID);
});

describe("computePendingPeriodicAssessmentPeriods (saf fonksiyon)", () => {
  const now = new Date("2026-08-25T12:00:00.000Z");

  it("ilk ders tarihinden itibaren tamamlanmış 4 haftalık dönemleri döner", () => {
    const pending = computePendingPeriodicAssessmentPeriods({ firstLessonAt: "2026-06-01T00:00:00.000Z" }, [], now);
    // 1 Haz - 28 Haz, 29 Haz - 26 Tem, 27 Tem - 23 Ağu → 3 tamamlanmış dönem (24 Ağu'dan başlayan 4. dönem henüz bitmedi).
    expect(pending).toHaveLength(3);
    expect(pending[0]!.periodStart).toBe("2026-06-01T00:00:00.000Z");
  });

  it("henüz hiçbir dönem tamamlanmamışsa boş dizi döner", () => {
    const pending = computePendingPeriodicAssessmentPeriods({ firstLessonAt: "2026-08-20T00:00:00.000Z" }, [], now);
    expect(pending).toHaveLength(0);
  });

  it("gönderilmiş dönemler pending listesinden ÇIKARILIR (tekrar üretilmez)", () => {
    const all = computePendingPeriodicAssessmentPeriods({ firstLessonAt: "2026-06-01T00:00:00.000Z" }, [], now);
    expect(all).toHaveLength(3);
    const afterSubmit = computePendingPeriodicAssessmentPeriods(
      { firstLessonAt: "2026-06-01T00:00:00.000Z" },
      [{ periodStart: all[0]!.periodStart, periodEnd: all[0]!.periodEnd }],
      now
    );
    expect(afterSubmit).toHaveLength(2);
    expect(afterSubmit.some((p) => p.periodStart === all[0]!.periodStart)).toBe(false);
  });

  it("firstLessonAt de enrollmentStartDate de yoksa boş dizi döner", () => {
    expect(computePendingPeriodicAssessmentPeriods({}, [], now)).toEqual([]);
  });

  it("firstLessonAt yoksa enrollmentStartDate'e düşer", () => {
    const pending = computePendingPeriodicAssessmentPeriods(
      { enrollmentStartDate: "2026-06-01T00:00:00.000Z" },
      [],
      now
    );
    expect(pending).toHaveLength(3);
  });

  it("4 tamamlanmış ders olduğunda 28 gün dolmasa bile otomatik 4 derslik dönem üretir", () => {
    const lessons = [
      { id: "l1", startAt: "2026-08-10T10:00:00.000Z", status: "completed" as const, studentAttended: true },
      { id: "l2", startAt: "2026-08-13T10:00:00.000Z", status: "completed" as const, studentAttended: true },
      { id: "l3", startAt: "2026-08-17T10:00:00.000Z", status: "completed" as const, studentAttended: true },
      { id: "l4", startAt: "2026-08-20T10:00:00.000Z", status: "completed" as const, studentAttended: true },
    ];
    const pending = computePendingPeriodicAssessmentPeriods(
      { firstLessonAt: "2026-08-10T10:00:00.000Z" },
      [],
      now,
      lessons
    );
    expect(pending).toHaveLength(1);
    expect(pending[0]!.periodStart).toBe("2026-08-10T10:00:00.000Z");
  });
});

describe("buildPeriodicAssessmentDraft ve pedagojik placeholder rehberliği", () => {
  it("tüm form alanları için birbirinden farklı, bağlama özel pedagojik placeholder içerir", () => {
    const lessonValues = Object.values(LESSON_REPORT_PLACEHOLDERS);
    expect(lessonValues).toHaveLength(8);
    expect(new Set(lessonValues).size).toBe(8);

    const periodicValues = Object.values(PERIODIC_REPORT_PLACEHOLDERS);
    expect(periodicValues).toHaveLength(4);
    expect(new Set(periodicValues).size).toBe(4);
  });

  it("önceki 4 dersin verilerini ve puanlarını toplayıp otomatik özet ve puan ortalaması üretir", () => {
    const lessons = [
      { id: "l1", studentId: "s1", teacherId: "t1", startAt: "2026-08-01T10:00:00.000Z", instrument: "Piyano" as const, status: "completed" as const, studentAttended: true },
      { id: "l2", studentId: "s1", teacherId: "t1", startAt: "2026-08-08T10:00:00.000Z", instrument: "Piyano" as const, status: "completed" as const, studentAttended: true },
      { id: "l3", studentId: "s1", teacherId: "t1", startAt: "2026-08-15T10:00:00.000Z", instrument: "Piyano" as const, status: "completed" as const, studentAttended: true },
      { id: "l4", studentId: "s1", teacherId: "t1", startAt: "2026-08-22T10:00:00.000Z", instrument: "Piyano" as const, status: "completed" as const, studentAttended: true },
    ];
    const baseScores = {
      teknikBecerisi: 4,
      notaOkuma: 4,
      muzikalite: 5,
      ritimDuyusu: 4,
      calismaDuzeni: 4,
      evOdeviTamamlama: 5,
      dersKatilimi: 5,
      motivasyon: 5,
      genelIlerleme: 4,
      hedefeUlasma: 4,
    };
    const assessments = [
      {
        id: "a1",
        lessonId: "l1",
        studentId: "s1",
        teacherId: "t1",
        ...baseScores,
        piecesWorked: "Bach Minuet in G",
        technicalWork: "Do Majör Gam",
        strengthNote: "Sağ el pozisyonu çok dengeli.",
        improvementNote: "Sol el geçişleri yavaş çalışılmalı.",
        nextStepsNote: "1-8 ölçü metronomla tekrar.",
        teacherSignedName: "Eğitmen",
        createdAt: "2026-08-01T11:00:00.000Z",
      },
      {
        id: "a2",
        lessonId: "l2",
        studentId: "s1",
        teacherId: "t1",
        ...baseScores,
        piecesWorked: "Bach Minuet in G",
        etudesWorked: "Czerny Op. 599 No. 12",
        strengthNote: "Ritim takibi gelişti.",
        improvementNote: "Legato bağlarına dikkat edilmeli.",
        nextStepsNote: "9-16 ölçü eklenecek.",
        teacherSignedName: "Eğitmen",
        createdAt: "2026-08-08T11:00:00.000Z",
      },
    ];

    const draft = buildPeriodicAssessmentDraft({
      lessons,
      assessments,
      periodStart: "2026-08-01T00:00:00.000Z",
      periodEnd: "2026-08-28T00:00:00.000Z",
    });

    expect(draft.lessonCount).toBe(4);
    expect(draft.assessedLessonCount).toBe(2);
    expect(draft.overallScore).toBeGreaterThanOrEqual(4.3);
    expect(draft.topicsSummary.piecesWorked).toEqual(["Bach Minuet in G"]);
    expect(draft.topicsSummary.etudesWorked).toEqual(["Czerny Op. 599 No. 12"]);
    expect(draft.synthesizedNotes.overallProgressNote).toContain("Bach Minuet in G");
    expect(draft.synthesizedNotes.strengthsNote).toContain("Sağ el pozisyonu çok dengeli.");
  });
});

describe("createPeriodicAssessmentTool — idempotency + eşleşme kontrolü", () => {
  it("aynı dönem için ikinci kez gönderilemez (ALREADY_SUBMITTED/CONFLICT)", async () => {
    const pendingBefore = await listPendingPeriodicAssessmentsTool(ctx(), {});
    expect(pendingBefore.ok).toBe(true);
    if (!pendingBefore.ok) return;
    const target = pendingBefore.data.items.find((i) => i.teacherId === "t1");
    if (!target) {
      // seed verisinde t1'in henüz tamamlanmış bir dönemi yoksa test anlamsız — atla.
      return;
    }

    const first = await createPeriodicAssessmentTool(ctx(), {
      studentId: target.studentId,
      periodStart: target.periodStart,
      periodEnd: target.periodEnd,
      overallProgressNote: "İlk 4 hafta genel olarak olumlu.",
      scores: {
        teknikBecerisi: 4,
        notaOkuma: 4,
        muzikalite: 5,
        ritimDuyusu: 4,
        calismaDuzeni: 4,
        evOdeviTamamlama: 4,
        dersKatilimi: 5,
        motivasyon: 5,
        genelIlerleme: 4,
        hedefeUlasma: 4,
      },
      teacherSignedName: "Test Öğretmen",
    });
    expect(first.ok).toBe(true);

    const savedList = await listPeriodicAssessmentsForStudentTool(ctx(), { studentId: target.studentId });
    expect(savedList.ok).toBe(true);
    if (savedList.ok) {
      const saved = savedList.data.assessments.find((a) => a.periodStart === target.periodStart);
      expect(saved).toBeDefined();
      expect(saved?.overallScore).toBe(4.3);
      expect(saved?.scores?.muzikalite).toBe(5);
      expect(saved?.teacherSignedName).toBe("Test Öğretmen");
    }

    const second = await createPeriodicAssessmentTool(ctx(), {
      studentId: target.studentId,
      periodStart: target.periodStart,
      periodEnd: target.periodEnd,
      overallProgressNote: "Tekrar deneme.",
    });
    expect(second.ok).toBe(false);

    const pendingAfter = await listPendingPeriodicAssessmentsTool(ctx(), {});
    expect(pendingAfter.ok).toBe(true);
    if (!pendingAfter.ok) return;
    expect(
      pendingAfter.data.items.some(
        (i) => i.studentId === target.studentId && i.periodStart === target.periodStart
      )
    ).toBe(false);
  });

  it("bekleyen olmayan (rastgele) bir dönem için gönderim reddedilir", async () => {
    const res = await createPeriodicAssessmentTool(ctx(), {
      studentId: "s1",
      periodStart: "2099-01-01T00:00:00.000Z",
      periodEnd: "2099-01-28T00:00:00.000Z",
      overallProgressNote: "Geçersiz dönem denemesi.",
    });
    expect(res.ok).toBe(false);
  });
});

describe("Faz 3B — RBAC", () => {
  it("TEACHER başka bir öğretmenin öğrencisi için değerlendirme gönderemez", async () => {
    const res = await createPeriodicAssessmentTool(ctx({ teacherId: "t2" }), {
      studentId: "s1", // s1'in öğretmeni t1
      periodStart: "2026-06-01T00:00:00.000Z",
      periodEnd: "2026-06-28T00:00:00.000Z",
      overallProgressNote: "Yetkisiz deneme.",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });

  it("veli (STUDENT rolü, GUARDIAN erişimi) yalnızca kendi çocuğunun kayıtlarına erişebilir", async () => {
    const parentCtx = ctx({ role: "STUDENT", teacherId: undefined, studentId: "s1" });
    await grantStudentAccess(parentCtx, "s1", "GUARDIAN");

    const ownStudent = await listPeriodicAssessmentsForStudentTool(parentCtx, { studentId: "s1" });
    expect(ownStudent.ok).toBe(true);

    const otherStudent = await listPeriodicAssessmentsForStudentTool(parentCtx, { studentId: "s2" });
    expect(otherStudent.ok).toBe(false);
    if (!otherStudent.ok) expect(otherStudent.error.code).toBe("FORBIDDEN");
  });
});
