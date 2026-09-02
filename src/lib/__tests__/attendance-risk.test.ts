import { describe, it, expect } from "vitest";
import {
  evaluateAttendanceRisk,
  buildAttendanceRiskDedupeKey,
  buildAttendanceRiskNotificationText,
  STUDENT_ATTENDANCE_RISK_THRESHOLD,
} from "../attendance-risk";

function processedLesson(studentId: string, day: string) {
  return { studentId, lessonProcessed: true as const, startAt: `${day}T08:00:00.000Z` };
}

describe("evaluateAttendanceRisk", () => {
  it("5) aynı ay ilk ve ikinci işlenmiş ders: eşik AŞILMAZ", () => {
    const lessons = [processedLesson("s1", "2026-09-05"), processedLesson("s1", "2026-09-12")];
    const res = evaluateAttendanceRisk(lessons, "s1", { startAt: "2026-09-12T08:00:00.000Z" });
    expect(res.processedCountInMonth).toBe(2);
    expect(res.crossedThreshold).toBe(false);
  });

  it("6) aynı ay üçüncü işlenmiş ders: eşik AŞILIR", () => {
    const lessons = [
      processedLesson("s1", "2026-09-05"),
      processedLesson("s1", "2026-09-12"),
      processedLesson("s1", "2026-09-19"),
    ];
    const res = evaluateAttendanceRisk(lessons, "s1", { startAt: "2026-09-19T08:00:00.000Z" });
    expect(res.processedCountInMonth).toBe(3);
    expect(res.crossedThreshold).toBe(true);
    expect(res.calendarMonth).toBe("2026-09");
  });

  it("7) dördüncü/beşinci işlenmiş derste de eşik aşılmış SAYILIR (duplicate engeli evaluateAttendanceRisk'in işi DEĞİL, log'un işi)", () => {
    const lessons = [1, 2, 3, 4, 5].map((d) => processedLesson("s1", `2026-09-0${d}`));
    const res = evaluateAttendanceRisk(lessons, "s1", { startAt: "2026-09-05T08:00:00.000Z" });
    expect(res.crossedThreshold).toBe(true);
    expect(res.processedCountInMonth).toBe(5);
  });

  it("8) yeni ayda sayaç sıfırdan başlar", () => {
    const lessons = [
      processedLesson("s1", "2026-09-05"),
      processedLesson("s1", "2026-09-12"),
      processedLesson("s1", "2026-09-19"),
      processedLesson("s1", "2026-10-03"),
    ];
    const res = evaluateAttendanceRisk(lessons, "s1", { startAt: "2026-10-03T08:00:00.000Z" });
    expect(res.calendarMonth).toBe("2026-10");
    expect(res.processedCountInMonth).toBe(1);
    expect(res.crossedThreshold).toBe(false);
  });

  it("başka öğrencinin işlenmiş dersleri sayaca karışmaz", () => {
    const lessons = [
      processedLesson("s1", "2026-09-05"),
      processedLesson("s2", "2026-09-06"),
      processedLesson("s2", "2026-09-07"),
      processedLesson("s2", "2026-09-08"),
    ];
    const res = evaluateAttendanceRisk(lessons, "s1", { startAt: "2026-09-05T08:00:00.000Z" });
    expect(res.processedCountInMonth).toBe(1);
  });

  it("9) Europe/Istanbul gece yarısı sınırı — UTC 21:30 son ders bir sonraki İstanbul gününe/ayına düşebilir", () => {
    // 2026-08-31T21:30:00.000Z = 2026-09-01T00:30 İstanbul (UTC+3) — Eylül ayına sayılmalı.
    const lessons = [{ studentId: "s1", lessonProcessed: true as const, startAt: "2026-08-31T21:30:00.000Z" }];
    const res = evaluateAttendanceRisk(lessons, "s1", { startAt: "2026-08-31T21:30:00.000Z" });
    expect(res.calendarMonth).toBe("2026-09");
  });

  it("özel eşik verilebilir", () => {
    const lessons = [processedLesson("s1", "2026-09-05"), processedLesson("s1", "2026-09-12")];
    const res = evaluateAttendanceRisk(lessons, "s1", { startAt: "2026-09-12T08:00:00.000Z" }, 1);
    expect(res.crossedThreshold).toBe(true);
  });

  it("varsayılan eşik 2'dir", () => {
    expect(STUDENT_ATTENDANCE_RISK_THRESHOLD).toBe(2);
  });
});

describe("buildAttendanceRiskDedupeKey", () => {
  it("spec'teki tam biçimi üretir", () => {
    expect(buildAttendanceRiskDedupeKey("t1", "s1", "2026-09")).toBe("attendance-processed-risk:t1:s1:2026-09");
  });
});

describe("buildAttendanceRiskNotificationText", () => {
  it("öğrenci adı, ay, sayı ve linki içerir", () => {
    const { title, body } = buildAttendanceRiskNotificationText({
      studentName: "Ali Veli",
      calendarMonth: "2026-09",
      processedCountInMonth: 3,
      detailHref: "/panel/ogrenciler/s1",
    });
    expect(title).toContain("Ali Veli");
    expect(body).toContain("Ali Veli");
    expect(body).toContain("2026-09");
    expect(body).toContain("3");
    expect(body).toContain("/panel/ogrenciler/s1");
  });
});
