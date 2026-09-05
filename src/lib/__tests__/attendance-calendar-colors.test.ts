import { describe, it, expect } from "vitest";
import {
  ATTENDANCE_CALENDAR_COLORS,
  attendanceCalendarTextColor,
  resolveDayFillSegments,
} from "../attendance-calendar";

/**
 * Yoklama Takvimi gün kutusu dolgusu — TEK renk kaynağı (ATTENDANCE_CALENDAR_COLORS)
 * ve segment çözümleme kuralı (resolveDayFillSegments) saf fonksiyon testleri.
 * UI (attendance-calendar-panel.tsx) bu iki fonksiyonu DOĞRUDAN kullanır —
 * ayrı bir hard-coded renk mantığı yoktur.
 */
describe("Yoklama Takvimi — gün kutusu dolgu rengi (tek kaynak)", () => {
  it("kapalı gün her zaman tek 'closed' segmenti döner — statü ne olursa olsun", () => {
    const segments = resolveDayFillSegments("closed", [{ lessonId: "l1", opsStatus: "attended" }]);
    expect(segments).toEqual(["closed"]);
  });

  it("dersi olmayan açık gün 'open' (nötr) döner", () => {
    expect(resolveDayFillSegments("open", [])).toEqual(["open"]);
  });

  it("tek ders, statü girilmemişse 'planned' (planlı, nötr mavi) döner", () => {
    expect(resolveDayFillSegments("open", [{ lessonId: "l1", opsStatus: null }])).toEqual(["planned"]);
  });

  it("tek ders Geldi ise ['attended'] döner", () => {
    expect(resolveDayFillSegments("open", [{ lessonId: "l1", opsStatus: "attended" }])).toEqual(["attended"]);
  });

  it("tek ders İşlendi ise ['processed'] döner", () => {
    expect(resolveDayFillSegments("open", [{ lessonId: "l1", opsStatus: "processed" }])).toEqual(["processed"]);
  });

  it("tek ders Telafi ise ['makeup'] döner", () => {
    expect(resolveDayFillSegments("open", [{ lessonId: "l1", opsStatus: "makeup" }])).toEqual(["makeup"]);
  });

  it("aynı günde birden fazla ders AYNI statüdeyse tek segmente indirgenir (bilgi kaybı yok — hepsi zaten aynı renk)", () => {
    const segments = resolveDayFillSegments("open", [
      { lessonId: "l1", opsStatus: "attended" },
      { lessonId: "l2", opsStatus: "attended" },
    ]);
    expect(segments).toEqual(["attended"]);
  });

  it("aynı günde birden fazla ders FARKLI statüdeyse, HER dersin kendi rengi kendi sırasında korunur — tek statüye indirgenmez", () => {
    const segments = resolveDayFillSegments("open", [
      { lessonId: "l1", opsStatus: "attended" },
      { lessonId: "l2", opsStatus: "processed" },
      { lessonId: "l3", opsStatus: null },
    ]);
    expect(segments).toEqual(["attended", "processed", "planned"]);
  });

  it("P0 (2026-09-05) — Geldi=yeşil, İşlendi=KIRMIZI, Telafi=SARI, Kapalı=siyah renk sözleşmesi", () => {
    expect(ATTENDANCE_CALENDAR_COLORS.attended).toBe("#16a34a");
    expect(ATTENDANCE_CALENDAR_COLORS.processed).toBe("#dc2626");
    expect(ATTENDANCE_CALENDAR_COLORS.makeup).toBe("#ca8a04");
    expect(ATTENDANCE_CALENDAR_COLORS.excused).toBe("#7c3aed");
    expect(ATTENDANCE_CALENDAR_COLORS.closed).toBe("#0a0a0a");
  });

  it("erişilebilir kontrast: sarı (Telafi) dolguda koyu metin, diğerlerinde açık metin", () => {
    expect(attendanceCalendarTextColor("makeup")).toBe("#1c1503");
    expect(attendanceCalendarTextColor("attended")).toBe("#ffffff");
    expect(attendanceCalendarTextColor("processed")).toBe("#ffffff");
    expect(attendanceCalendarTextColor("closed")).toBe("#ffffff");
  });
});
