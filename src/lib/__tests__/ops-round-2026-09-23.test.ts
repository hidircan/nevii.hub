import { describe, expect, it } from "vitest";
import { clampDashboardSpan, resolveDashboardLayout, sanitizeDashboardLayoutPatch } from "../dashboard/layout-prefs";
import { clampYearMonth, shiftYearMonth } from "../year-month";
import { describeAuditEvent, diffRecordFields, readAuditChanges } from "../audit/humanize";
import { applyPayoutLineOverrides, sanitizePayoutLineOverrides, type TeacherEarningsResult } from "../teacher-payout";
import { canRunCriticalActions } from "../critical-action-password";
import { isRecentlyActive, ACTIVE_SESSION_WINDOW_MS } from "../auth/session-concurrency";
import { computeStaffPerformanceMetrics, periodFromYearMonth } from "../staff-performance";
import { validateWeightMap, defaultWeightsFor } from "../performance-weights";
import { lessonHardBlockReason, planForcedLessonDeletion } from "../lesson-scope-edit";
import type { AppData, Lesson } from "../types";

describe("A · dashboard resize", () => {
  it("kenardan sürükleme sonucu 3–12 aralığına oturur (UAT 2026-09-24: min 3)", () => {
    expect(clampDashboardSpan(2.4)).toBe(3);
    expect(clampDashboardSpan(1)).toBe(3);
    expect(clampDashboardSpan(9.6)).toBe(10);
    expect(clampDashboardSpan(40)).toBe(12);
    expect(clampDashboardSpan(Number.NaN)).toBe(12);
  });
  it("yeni ara genişlikler (9–11) kaydedilir ve geri okunur", () => {
    const patch = sanitizeDashboardLayoutPatch({ sectionSpans: { todaySchedule: 9, collections: 2 } }, "SCHOOL_ADMIN");
    expect("clearLayout" in patch).toBe(false);
    const resolved = resolveDashboardLayout(patch as never, "SCHOOL_ADMIN");
    expect(resolved.spans.todaySchedule).toBe(9);
    expect(resolved.spans.collections).toBe(5); // geçersiz 2 → varsayılan
  });
});

describe("G · ay gezgini", () => {
  it("yıl sınırında ileri/geri", () => {
    expect(shiftYearMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftYearMonth("2025-12", 1)).toBe("2026-01");
  });
  it("gelecek ay mevcut aya sabitlenir; bozuk değer mevcut ay", () => {
    expect(clampYearMonth("2026-11", "2026-09")).toBe("2026-09");
    expect(clampYearMonth("2026-05", "2026-09")).toBe("2026-05");
    expect(clampYearMonth("2026-13", "2026-09")).toBe("2026-09");
    expect(clampYearMonth(undefined, "2026-09")).toBe("2026-09");
  });
});

describe("L · insan okunur audit", () => {
  it("katalogdaki olay Türkçe cümleye döner", () => {
    expect(
      describeAuditEvent({ action: "student.create", entityType: "Student", actorName: "Ezgi Güçlü", entityName: "Deniz Ak" })
    ).toBe("Ezgi Güçlü, Deniz Ak öğrencisini oluşturdu.");
  });
  it("katalogda olmayan olay ham kod göstermez", () => {
    const s = describeAuditEvent({ action: "homework.review", entityType: "HomeworkSubmission", actorName: "Nihal" });
    expect(s).not.toContain("homework.review");
    expect(s.startsWith("Nihal,")).toBe(true);
  });
  it("reddedilen işlem belirtilir", () => {
    expect(
      describeAuditEvent({ action: "student.delete_soft", entityType: "Student", actorName: "Nihal", entityName: "Ali", outcome: "denied" })
    ).toContain("(reddedildi)");
  });
  it("alan farkı yalnız değişen alanları ve hassas olmayanları içerir", () => {
    const changes = diffRecordFields(
      { name: "Ali", lessonDurationMinutes: 30, nationalIdCipher: "x" },
      { name: "Ali", lessonDurationMinutes: 40, nationalIdCipher: "y", studentId: "s1" }
    );
    expect(changes).toEqual([{ field: "lessonDurationMinutes", from: 30, to: 40 }]);
    expect(readAuditChanges({ changes })).toHaveLength(1);
    expect(readAuditChanges(null)).toEqual([]);
  });
});

describe("K · hakediş revizyonu", () => {
  const base: TeacherEarningsResult = {
    lines: [
      { lessonId: "l1", lessonDate: "2026-09-01T10:00:00Z", studentId: "s1", studentName: "A", instrument: "Piyano", durationMinutes: 40, perMinuteRate: 10, amount: 400 },
      { lessonId: "l2", lessonDate: "2026-09-02T10:00:00Z", studentId: "s2", studentName: "B", instrument: "Piyano", durationMinutes: 30, perMinuteRate: 10, amount: 300 },
    ],
    totalLessons: 2,
    totalMinutes: 70,
    totalAmount: 700,
    missingFeeRuleLessonIds: [],
    canCreatePayout: true,
  };
  it("süre değişince tutar süre × saatlik ücretten, elle tutar girilince o geçerli", () => {
    const r = applyPayoutLineOverrides(base, { l1: { minutes: 50 }, l2: { amount: 250 } });
    expect(r.lines[0]!.amount).toBe(500);
    expect(r.lines[0]!.original?.amount).toBe(400);
    expect(r.lines[1]!.amount).toBe(250);
    expect(r.totalAmount).toBe(750);
    expect(r.totalMinutes).toBe(80);
  });
  it("hesaplananla aynı değerler ve dökümde olmayan dersler saklanmaz; sınır dışı reddedilir", () => {
    const ok = sanitizePayoutLineOverrides(base, { l1: { minutes: 40, hourlyRate: 600, amount: 400 }, ghost: { amount: 1 } });
    expect(ok).toEqual({ ok: true, overrides: {} });
    expect(sanitizePayoutLineOverrides(base, { l1: { minutes: -5 } }).ok).toBe(false);
  });
});

describe("D/M · kritik işlem yetki matrisi", () => {
  it("kurum sahibi + kurum yöneticisi; öğretmen/veli değil", () => {
    expect(canRunCriticalActions("SUPER_ADMIN")).toBe(true);
    expect(canRunCriticalActions("SCHOOL_ADMIN")).toBe(true);
    expect(canRunCriticalActions("TEACHER")).toBe(false);
    expect(canRunCriticalActions("PARENT")).toBe(false);
    expect(canRunCriticalActions(undefined)).toBe(false);
  });

  const lesson = (over: Partial<Lesson>): Lesson =>
    ({
      id: "les1",
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      branchId: "b1",
      instrument: "Piyano",
      startAt: "2026-09-10T10:00:00Z",
      endAt: "2026-09-10T10:40:00Z",
      type: "regular",
      status: "completed",
      ...over,
    }) as Lesson;
  const data = (l: Lesson, extra: Partial<AppData> = {}): AppData =>
    ({
      lessons: [l],
      lessonSeries: [],
      attendances: [{ id: "att1", lessonId: l.id }],
      payments: [],
      makeupRequests: [],
      ...extra,
    }) as unknown as AppData;

  it("statülü ders yoklamasıyla birlikte silinir", () => {
    const plan = planForcedLessonDeletion(data(lesson({})), "les1");
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.data.lessons).toHaveLength(0);
      expect(plan.data.attendances).toHaveLength(0);
      expect(plan.removedAttendanceIds).toEqual(["att1"]);
    }
  });
  it("tahsilat veya telafi bağlı ders kritik şifreyle bile silinmez", () => {
    const l = lesson({});
    expect(lessonHardBlockReason(data(l, { payments: [{ lessonId: "les1", status: "paid" }] as never }), l)).toMatch(/tahsilat/);
    expect(lessonHardBlockReason(data(l), lesson({ type: "makeup" }))).toMatch(/telafi/);
    expect(planForcedLessonDeletion(data(l, { payments: [{ lessonId: "les1", status: "paid" }] as never }), "les1").ok).toBe(false);
  });
});

describe("N · tek aktif oturum", () => {
  it("son 30 dk'da görülen oturum aktif sayılır, daha eskisi değil", () => {
    const now = new Date("2026-09-23T12:00:00Z");
    expect(isRecentlyActive({ lastSeenAt: new Date(now.getTime() - 5 * 60_000).toISOString() }, now)).toBe(true);
    expect(isRecentlyActive({ lastSeenAt: new Date(now.getTime() - ACTIVE_SESSION_WINDOW_MS - 1).toISOString() }, now)).toBe(false);
  });
});

describe("I · deneme dersi performans metriği", () => {
  it("planlanan ve dönüştürülen denemeler personele yazılır; iptal sayılmaz", () => {
    const m = computeStaffPerformanceMetrics({
      period: periodFromYearMonth("2026-09"),
      staff: { id: "st1", branchId: "b1", portalUserId: "u1" },
      tasks: [],
      payments: [],
      students: [],
      trials: [
        { createdBy: "u1", startAt: "2026-09-05T10:00:00Z", status: "planned" },
        { createdBy: "u1", startAt: "2026-09-06T10:00:00Z", status: "cancelled" },
        { createdBy: "u2", startAt: "2026-09-06T10:00:00Z", status: "attended", convertedByUserId: "u1", convertedAt: "2026-09-08T10:00:00Z" },
        { createdBy: "u1", startAt: "2026-08-30T10:00:00Z", status: "planned" },
      ],
      assigneeIds: new Set(["u1"]),
      collectorUserId: "u1",
    });
    expect(m.trialsPlanned).toBe(1);
    expect(m.trialsConverted).toBe(1);
  });
  it("yeni ağırlık varsayılanı toplam 100 ve eski kayıt (trialsPlanned yok) hâlâ geçerli", () => {
    expect(Object.values(defaultWeightsFor("staff")).reduce((a, b) => a + b, 0)).toBe(100);
    expect(validateWeightMap("staff", { tasks: 35, onTime: 25, collections: 25, newStudents: 10, lessonsPlanned: 5 }).ok).toBe(true);
  });
});
