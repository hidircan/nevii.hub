import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import { computePendingPeriod, PERIODIC_ASSESSMENTS_FILE, clearPeriodicAssessments } from "../periodic-assessment";
import { readReferenceData } from "../store";
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

describe("computePendingPeriod (tek kural, saf fonksiyon)", () => {
  const now = new Date("2026-08-25T12:00:00.000Z");
  const lesson = (day: string, status: "completed" | "cancelled" | "no_show" | "scheduled" = "completed") => ({
    startAt: `2026-${day}T10:00:00.000Z`,
    status,
  });
  const weekly = [lesson("07-28"), lesson("08-04"), lesson("08-11"), lesson("08-18"), lesson("08-25")];

  it("4 ders tamamlanınca TEK dönem: ilk 4 dersin başı–sonu", () => {
    expect(computePendingPeriod(weekly.slice(0, 4), undefined, now)).toEqual({
      periodStart: "2026-07-28T10:00:00.000Z",
      periodEnd: "2026-08-18T10:00:00.000Z",
    });
  });

  it("4 dersten azsa (ya da iptal/gelmedi/gelecek ders sayılmazsa) dönem yok", () => {
    expect(computePendingPeriod(weekly.slice(0, 3), undefined, now)).toBeNull();
    expect(computePendingPeriod([...weekly.slice(0, 3), lesson("08-20", "cancelled"), lesson("08-21", "no_show")], undefined, now)).toBeNull();
    expect(computePendingPeriod([...weekly.slice(0, 3), lesson("08-30")], undefined, now)).toBeNull();
  });

  it("son raporun bitişinden SONRAKİ dersler sayılır; eski takvim dönemi kaydı da kapsar", () => {
    expect(computePendingPeriod(weekly, "2026-08-04T10:00:00.000Z", now)).toBeNull(); // sonrasında yalnız 3 ders var
    // Eski 28 günlük takvim kaydı (bitiş 23 Ağu) → yalnız 25 Ağu sayılır.
    expect(computePendingPeriod(weekly, "2026-08-23T00:00:00.000Z", now)).toBeNull();
  });

  it("rapor hiç yoksa 60 günden eski dersler birikmez", () => {
    const old = ["03-02", "03-09", "03-16", "03-23", "03-30"].map((d) => lesson(d));
    expect(computePendingPeriod(old, undefined, now)).toBeNull();
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
      // "Hazırlayan" adı istemcinin yazdığı metin değil, öğretmen kaydındaki ad.
      const t1 = (await readReferenceData()).teachers.find((t) => t.id === "t1");
      expect(saved?.teacherSignedName).toBe(t1?.name);
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
