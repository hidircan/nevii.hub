import { describe, it, expect } from "vitest";
import {
  resolveReportDateRange,
  buildAttendanceReport,
  type AttendanceReportLessonInput,
} from "../attendance-report";

function lesson(overrides: Partial<AttendanceReportLessonInput> & { id: string; startAt: string }): AttendanceReportLessonInput {
  return {
    studentId: "s1",
    teacherId: "t1",
    branchId: "b1",
    roomId: "r1",
    instrument: "Piyano",
    status: "scheduled",
    type: "regular",
    ...overrides,
  };
}

describe("resolveReportDateRange", () => {
  it("today: from=to=bugün", () => {
    const res = resolveReportDateRange("today", undefined, new Date("2026-09-02T10:00:00.000Z"));
    expect(res).toEqual({ from: "2026-09-02", to: "2026-09-02" });
  });

  it("this_week: Pazartesi-Pazar aralığı (2026-09-02 Çarşamba)", () => {
    const res = resolveReportDateRange("this_week", undefined, new Date("2026-09-02T10:00:00.000Z"));
    expect(res).toEqual({ from: "2026-08-31", to: "2026-09-06" });
  });

  it("this_month: ayın 1'i ile son günü", () => {
    const res = resolveReportDateRange("this_month", undefined, new Date("2026-09-02T10:00:00.000Z"));
    expect(res).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("custom: verilen aralığı aynen döner", () => {
    const res = resolveReportDateRange("custom", { from: "2026-01-01", to: "2026-01-15" });
    expect(res).toEqual({ from: "2026-01-01", to: "2026-01-15" });
  });

  it("custom: from/to eksikse hata fırlatır", () => {
    expect(() => resolveReportDateRange("custom")).toThrow();
  });

  it("custom: to < from ise hata fırlatır", () => {
    expect(() => resolveReportDateRange("custom", { from: "2026-01-15", to: "2026-01-01" })).toThrow();
  });
});

describe("buildAttendanceReport", () => {
  it("12) boş filtre sonucu düzgün boş durum döner", () => {
    const res = buildAttendanceReport([], [], { from: "2026-09-01", to: "2026-09-30" });
    expect(res.rows).toEqual([]);
    expect(res.summary.totalPlanned).toBe(0);
    expect(res.summary.riskyStudentCount).toBe(0);
  });

  it("aralık dışındaki dersler hariç tutulur", () => {
    const lessons = [
      lesson({ id: "l1", startAt: "2026-09-05T08:00:00.000Z" }),
      lesson({ id: "l2", startAt: "2026-10-05T08:00:00.000Z" }),
    ];
    const res = buildAttendanceReport(lessons, [], { from: "2026-09-01", to: "2026-09-30" }, new Date("2026-09-10T12:00:00+03:00"));
    expect(res.rows.map((r) => r.lessonId)).toEqual(["l1"]);
  });

  it("13) öğrenci/öğretmen/şube/tarih/durum filtreleri doğru çalışır", () => {
    const lessons = [
      lesson({ id: "l1", startAt: "2026-09-05T08:00:00.000Z", studentId: "s1", teacherId: "t1", branchId: "b1" }),
      lesson({ id: "l2", startAt: "2026-09-06T08:00:00.000Z", studentId: "s2", teacherId: "t2", branchId: "b2" }),
      lesson({ id: "l3", startAt: "2026-09-07T08:00:00.000Z", studentId: "s1", teacherId: "t1", status: "cancelled" }),
    ];
    const range = { from: "2026-09-01", to: "2026-09-30" };
    expect(buildAttendanceReport(lessons, [], { ...range, studentId: "s1" }).rows).toHaveLength(2);
    expect(buildAttendanceReport(lessons, [], { ...range, teacherId: "t2" }).rows).toHaveLength(1);
    expect(buildAttendanceReport(lessons, [], { ...range, branchId: "b2" }).rows).toHaveLength(1);
    expect(buildAttendanceReport(lessons, [], { ...range, status: "cancelled" }, new Date("2026-09-10T12:00:00+03:00")).rows).toHaveLength(1);
    expect(buildAttendanceReport(lessons, [], { ...range, instrument: "Keman" }).rows).toHaveLength(0);
  });

  it("14) haftalık/aylık özet metrikler doğru sayılır", () => {
    const lessons = [
      lesson({ id: "l1", startAt: "2026-09-01T08:00:00.000Z", studentAttended: true }),
      lesson({ id: "l2", startAt: "2026-09-02T08:00:00.000Z", lessonProcessed: true, lessonProcessedReason: "işlendi" }),
      lesson({ id: "l3", startAt: "2026-09-03T08:00:00.000Z", studentAbsent: true }),
      lesson({ id: "l4", startAt: "2026-09-04T08:00:00.000Z", studentExcused: true }),
      lesson({ id: "l5", startAt: "2026-09-05T08:00:00.000Z", opsMakeupFlag: true }),
      lesson({ id: "l6", startAt: "2026-09-06T08:00:00.000Z", status: "cancelled" }),
      lesson({ id: "l7", startAt: "2026-09-07T08:00:00.000Z" }),
    ];
    const res = buildAttendanceReport(lessons, [], { from: "2026-09-01", to: "2026-09-30" }, new Date("2026-09-10T12:00:00+03:00"));
    expect(res.summary).toEqual({
      totalPlanned: 7,
      attended: 1,
      absent: 0,
      excused: 0,
      processed: 1,
      makeup: 1,
      makeupPlanned: 0,
      cancelled: 1,
      riskyStudentCount: 0,
    });
  });

  it("işlendi gerekçesi ve telafi gerekçesi satırda görünür", () => {
    const lessons = [
      lesson({ id: "l1", startAt: "2026-09-05T08:00:00.000Z", lessonProcessed: true, lessonProcessedReason: "Ders fiilen işlendi" }),
      lesson({ id: "l2", startAt: "2026-09-06T08:00:00.000Z", opsMakeupFlag: true }),
    ];
    const res = buildAttendanceReport(lessons, [{ sourceLessonId: "l2", reason: "Öğrenci hastaydı" }], {
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(res.rows.find((r) => r.lessonId === "l1")?.processedReason).toBe("Ders fiilen işlendi");
    expect(res.rows.find((r) => r.lessonId === "l2")?.makeupReason).toBe("Öğrenci hastaydı");
  });

  it("riskli öğrenci: aynı ay 3. işlenmiş derste satırlar studentAtRisk=true, riskyStudentCount doğru", () => {
    const lessons = [
      lesson({ id: "l1", startAt: "2026-09-01T08:00:00.000Z", lessonProcessed: true }),
      lesson({ id: "l2", startAt: "2026-09-08T08:00:00.000Z", lessonProcessed: true }),
      lesson({ id: "l3", startAt: "2026-09-15T08:00:00.000Z", lessonProcessed: true }),
      lesson({ id: "l4", startAt: "2026-09-01T08:00:00.000Z", studentId: "s2", lessonProcessed: true }),
    ];
    const res = buildAttendanceReport(lessons, [], { from: "2026-09-01", to: "2026-09-30" });
    expect(res.summary.riskyStudentCount).toBe(1);
    expect(res.rows.filter((r) => r.studentId === "s1").every((r) => r.studentAtRisk)).toBe(true);
    expect(res.rows.find((r) => r.studentId === "s2")?.studentAtRisk).toBe(false);
  });

  it("riskli öğrenci hesabı filtreden BAĞIMSIZDIR — başka öğretmen filtrelense bile aynı öğrencinin riski değişmez", () => {
    const lessons = [
      lesson({ id: "l1", startAt: "2026-09-01T08:00:00.000Z", teacherId: "t1", lessonProcessed: true }),
      lesson({ id: "l2", startAt: "2026-09-08T08:00:00.000Z", teacherId: "t2", lessonProcessed: true }),
      lesson({ id: "l3", startAt: "2026-09-15T08:00:00.000Z", teacherId: "t1", lessonProcessed: true }),
    ];
    const res = buildAttendanceReport(lessons, [], { from: "2026-09-01", to: "2026-09-30", teacherId: "t1" });
    expect(res.rows).toHaveLength(2);
    expect(res.rows.every((r) => r.studentAtRisk)).toBe(true);
  });
});
