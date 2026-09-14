import { describe, expect, it } from "vitest";
import {
  attendanceA11yLabel,
  toAttendanceRate,
  toAttendanceView,
  toSafeCount,
} from "../attendance-summary";
import type { AttendanceSummary } from "../../../types/api";

function summary(overrides: Partial<AttendanceSummary> = {}): AttendanceSummary {
  return {
    studentId: "s1",
    totalLessons: 10,
    attended: 8,
    absent: 1,
    excused: 1,
    makeup: 0,
    pending: 0,
    ...overrides,
  };
}

describe("toSafeCount", () => {
  it("geçerli sayıyı aynen döndürür (küsuratı kırpar)", () => {
    expect(toSafeCount(7)).toBe(7);
    expect(toSafeCount(7.9)).toBe(7);
  });

  it("bozuk değerleri crash'siz 0'a indirir", () => {
    expect(toSafeCount(undefined)).toBe(0);
    expect(toSafeCount(null)).toBe(0);
    expect(toSafeCount("5")).toBe(0);
    expect(toSafeCount(NaN)).toBe(0);
    expect(toSafeCount(Infinity)).toBe(0);
    expect(toSafeCount(-3)).toBe(0);
  });
});

describe("toAttendanceRate", () => {
  it("normal oranı hesaplar", () => {
    expect(toAttendanceRate(10, 8)).toBe(80);
  });

  it("sıfır toplamda bölme yapmadan 0 döner", () => {
    expect(toAttendanceRate(0, 0)).toBe(0);
    expect(toAttendanceRate(0, 5)).toBe(0);
  });

  it("oranı 0–100 aralığında tutar", () => {
    expect(toAttendanceRate(10, 99)).toBe(100);
    expect(toAttendanceRate(10, -2)).toBe(0);
  });
});

describe("toAttendanceView", () => {
  it("null/undefined yanıtta null döner (fake kart yok)", () => {
    expect(toAttendanceView(null)).toBeNull();
    expect(toAttendanceView(undefined)).toBeNull();
  });

  it("boş yanıtta hasRecords false olur", () => {
    const view = toAttendanceView(summary({ totalLessons: 0, attended: 0 }));
    expect(view).not.toBeNull();
    expect(view!.hasRecords).toBe(false);
    expect(view!.rate).toBe(0);
  });

  it("eksik alanlarda crash olmaz, oran güvenli hesaplanır", () => {
    const partial = { studentId: "s1", totalLessons: 4, attended: 3 } as AttendanceSummary;
    const view = toAttendanceView(partial)!;
    expect(view.absent).toBe(0);
    expect(view.excused).toBe(0);
    expect(view.makeup).toBe(0);
    expect(view.pending).toBe(0);
    expect(view.rate).toBe(75);
    expect(view.hasRecords).toBe(true);
  });

  it("bozuk sayılarda NaN üretmez", () => {
    const view = toAttendanceView(summary({ totalLessons: NaN, attended: Infinity, absent: -2 }))!;
    expect(Number.isNaN(view.rate)).toBe(false);
    expect(view.hasRecords).toBe(false);
  });
});

describe("attendanceA11yLabel", () => {
  it("oran ve durumu tek Türkçe cümlede özetler", () => {
    const view = toAttendanceView(summary())!;
    const label = attendanceA11yLabel(view);
    expect(label).toContain("yüzde 80");
    expect(label).toContain("10 dersten 8 katılım");
  });
});
