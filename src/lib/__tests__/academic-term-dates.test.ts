import { describe, it, expect } from "vitest";
import {
  validateAcademicTermDates,
  defaultAcademicTermDates,
  isYmdWithinAcademicTerm,
  resolveTermForYmd,
  academicTermMonths,
  monthOverlapsAcademicTerm,
} from "../academic-term-dates";

describe("validateAcademicTermDates", () => {
  it("boş tarihi sessizce varsayılana düşürmez", () => {
    const res = validateAcademicTermDates({
      guzStart: "",
      guzEnd: "2027-06-15",
      yazStart: "2026-07-01",
      yazEnd: "2026-09-14",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.fieldErrors.guzStart).toMatch(/boş olamaz/);
  });

  it("başlangıç bitişten sonraysa reddeder", () => {
    const res = validateAcademicTermDates({
      guzStart: "2027-06-15",
      guzEnd: "2026-09-15",
      yazStart: "2026-07-01",
      yazEnd: "2026-08-31",
    });
    expect(res.ok).toBe(false);
  });

  it("çakışan Güz/Yaz dönemlerini reddeder", () => {
    const res = validateAcademicTermDates({
      guzStart: "2026-09-01",
      guzEnd: "2027-06-30",
      yazStart: "2026-08-01",
      yazEnd: "2026-09-15",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toMatch(/çakışma/);
  });

  it("Eylül geçişini kabul eder: Yaz 14'üne, Güz 15'inden", () => {
    const res = validateAcademicTermDates({
      guzStart: "2026-09-15",
      guzEnd: "2027-06-15",
      yazStart: "2026-07-01",
      yazEnd: "2026-09-14",
    });
    expect(res.ok).toBe(true);
  });
});

describe("Eylül geçişi — kurum ayarına göre dönem", () => {
  const dates = {
    guzStart: "2026-09-15",
    guzEnd: "2027-06-15",
    yazStart: "2026-07-01",
    yazEnd: "2026-09-14",
  };

  it("14 Eylül Yaz, 15 Eylül Güz", () => {
    expect(isYmdWithinAcademicTerm("2026-09-14", "yaz", dates)).toBe(true);
    expect(isYmdWithinAcademicTerm("2026-09-14", "guz", dates)).toBe(false);
    expect(isYmdWithinAcademicTerm("2026-09-15", "guz", dates)).toBe(true);
    expect(isYmdWithinAcademicTerm("2026-09-15", "yaz", dates)).toBe(false);
    expect(resolveTermForYmd("2026-09-14", dates)).toBe("yaz");
    expect(resolveTermForYmd("2026-09-15", dates)).toBe("guz");
  });

  it("Eylül hem Yaz hem Güz ay listesinde yer alır (kısmi ay)", () => {
    const yazMonths = academicTermMonths("yaz", 2026, dates).map((m) => `${m.year}-${m.month}`);
    const guzMonths = academicTermMonths("guz", 2026, dates).map((m) => `${m.year}-${m.month}`);
    expect(yazMonths).toContain("2026-9");
    expect(guzMonths).toContain("2026-9");
    expect(monthOverlapsAcademicTerm(2026, 9, "yaz", dates)).toBe(true);
    expect(monthOverlapsAcademicTerm(2026, 9, "guz", dates)).toBe(true);
  });
});

describe("varsayılan tarihler geriye uyumlu", () => {
  it("Güz 1 Eylül–30 Haziran, Yaz 1 Temmuz–31 Ağustos", () => {
    expect(defaultAcademicTermDates(2026)).toEqual({
      guzStart: "2026-09-01",
      guzEnd: "2027-06-30",
      yazStart: "2026-07-01",
      yazEnd: "2026-08-31",
    });
  });
});
