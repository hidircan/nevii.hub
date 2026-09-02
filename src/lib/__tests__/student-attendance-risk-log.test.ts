import { describe, it, expect, beforeEach } from "vitest";
import {
  recordAttendanceRiskLogIfNew,
  clearStudentAttendanceRiskLog,
} from "../student-attendance-risk-log";

const TENANT = "risk-log-test-tenant";

beforeEach(async () => {
  await clearStudentAttendanceRiskLog(TENANT);
});

describe("recordAttendanceRiskLogIfNew", () => {
  it("ilk çağrıda true döner (yeni kayıt)", async () => {
    const created = await recordAttendanceRiskLogIfNew({
      tenantId: TENANT,
      studentId: "s1",
      calendarMonth: "2026-09",
      threshold: 2,
      triggeredByLessonId: "l1",
    });
    expect(created).toBe(true);
  });

  it("6/7) aynı (tenant, öğrenci, ay) için İKİNCİ çağrı false döner — duplicate önlenir", async () => {
    const first = await recordAttendanceRiskLogIfNew({
      tenantId: TENANT,
      studentId: "s1",
      calendarMonth: "2026-09",
      threshold: 2,
      triggeredByLessonId: "l1",
    });
    const second = await recordAttendanceRiskLogIfNew({
      tenantId: TENANT,
      studentId: "s1",
      calendarMonth: "2026-09",
      threshold: 2,
      triggeredByLessonId: "l4",
    });
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it("8) yeni ay için yeniden true döner", async () => {
    await recordAttendanceRiskLogIfNew({
      tenantId: TENANT,
      studentId: "s1",
      calendarMonth: "2026-09",
      threshold: 2,
      triggeredByLessonId: "l1",
    });
    const nextMonth = await recordAttendanceRiskLogIfNew({
      tenantId: TENANT,
      studentId: "s1",
      calendarMonth: "2026-10",
      threshold: 2,
      triggeredByLessonId: "l2",
    });
    expect(nextMonth).toBe(true);
  });

  it("farklı öğrenci için ayrı kayıt oluşur", async () => {
    const a = await recordAttendanceRiskLogIfNew({
      tenantId: TENANT,
      studentId: "s1",
      calendarMonth: "2026-09",
      threshold: 2,
      triggeredByLessonId: "l1",
    });
    const b = await recordAttendanceRiskLogIfNew({
      tenantId: TENANT,
      studentId: "s2",
      calendarMonth: "2026-09",
      threshold: 2,
      triggeredByLessonId: "l2",
    });
    expect(a).toBe(true);
    expect(b).toBe(true);
  });

  it("10) farklı tenant için ayrı kayıt oluşur (tenant izolasyonu)", async () => {
    const a = await recordAttendanceRiskLogIfNew({
      tenantId: TENANT,
      studentId: "s1",
      calendarMonth: "2026-09",
      threshold: 2,
      triggeredByLessonId: "l1",
    });
    const b = await recordAttendanceRiskLogIfNew({
      tenantId: `${TENANT}-other`,
      studentId: "s1",
      calendarMonth: "2026-09",
      threshold: 2,
      triggeredByLessonId: "l1",
    });
    expect(a).toBe(true);
    expect(b).toBe(true);
    await clearStudentAttendanceRiskLog(`${TENANT}-other`);
  });
});
