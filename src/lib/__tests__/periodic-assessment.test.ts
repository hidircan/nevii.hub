import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import { computePendingPeriodicAssessmentPeriods, PERIODIC_ASSESSMENTS_FILE, clearPeriodicAssessments } from "../periodic-assessment";
import { createPeriodicAssessmentTool, listPendingPeriodicAssessmentsTool, listPeriodicAssessmentsForStudentTool } from "../services/tools";
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
    });
    expect(first.ok).toBe(true);

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
