/**
 * 2026-09-19 — resmî tatil doğruluğu ve tek kaynak.
 * Kaynak: Diyanet "Dini Günler" (vakithesaplama.diyanet.gov.tr/dinigunler.php?yil=YYYY).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { findOfficialHoliday, turkishOfficialHolidays } from "../turkish-holidays";
import { resolveDayStatus } from "../attendance-calendar";
import { countExactWeekdayLessons } from "../period-lesson-billing";
import { validateLessonSlot } from "../makeup-engine";
import type { AppData } from "../types";

const names = (year: number, prefix: string) =>
  turkishOfficialHolidays(year)
    .filter((h) => h.name.startsWith(prefix))
    .map((h) => h.date);

describe("dini bayram tarihleri (Diyanet doğrulamalı)", () => {
  it("2026: Ramazan arefe 19.03, 20–22.03; Kurban arefe 26.05, 27–30.05", () => {
    expect(names(2026, "Ramazan")).toEqual(["2026-03-19", "2026-03-20", "2026-03-21", "2026-03-22"]);
    expect(names(2026, "Kurban")).toEqual(["2026-05-26", "2026-05-27", "2026-05-28", "2026-05-29", "2026-05-30"]);
  });

  it("2027 Ramazan düzeltildi: arefe 08.03, bayram 09–11.03 (eskiden 1 gün geç, 12.03 bitiyordu)", () => {
    expect(names(2027, "Ramazan")).toEqual(["2027-03-08", "2027-03-09", "2027-03-10", "2027-03-11"]);
    expect(findOfficialHoliday("2027-03-12")).toBeUndefined();
    expect(names(2027, "Kurban")).toEqual(["2027-05-15", "2027-05-16", "2027-05-17", "2027-05-18", "2027-05-19"]);
  });

  it("2028 Ramazan düzeltildi: arefe 25.02, bayram 26–28.02 (29.02 tatil değil)", () => {
    expect(names(2028, "Ramazan")).toEqual(["2028-02-25", "2028-02-26", "2028-02-27", "2028-02-28"]);
    expect(findOfficialHoliday("2028-02-29")).toBeUndefined();
  });

  it("2029 eklendi; arefe günleri 'yarım gün' olarak etiketli; 28 Ekim arefesi var", () => {
    expect(names(2029, "Ramazan")[1]).toBe("2029-02-14");
    expect(names(2029, "Kurban")[1]).toBe("2029-04-24");
    expect(findOfficialHoliday("2026-05-26")?.name).toMatch(/yarım gün/);
    expect(findOfficialHoliday("2026-10-28")?.name).toMatch(/Cumhuriyet Bayramı Arefesi/);
  });
});

describe("tek kaynak: takvim, planlama, ücret ve Ders Programı", () => {
  it("Yoklama Takvimi resmî tatili kapalı gösterir", () => {
    const res = resolveDayStatus(new Date(2027, 2, 9, 12), "guz", []);
    expect(res.status).toBe("closed");
    expect(res.label).toMatch(/Ramazan Bayramı 1\. Gün/);
  });

  it("ders planlama (validateLessonSlot) resmî tatili Türkçe nedenle reddeder", () => {
    const data = { settings: { lessonDurationMinutes: 40 }, lessons: [], teachers: [], rooms: [] } as unknown as AppData;
    const res = validateLessonSlot(data, { instrument: "Piyano", studentId: "s1" }, { teacherId: "t1", roomId: "r1", startAt: "2026-10-29T12:00:00.000Z" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("OFFICIAL_HOLIDAY");
      expect(res.message).toMatch(/Cumhuriyet Bayramı resmî tatildir/);
    }
  });

  it("kayıt önizlemesi kesin ders sayımı tatili saymaz (Ekim 2026 Perşembe: 5 → 4, 29 Ekim)", () => {
    expect(countExactWeekdayLessons("2026-10-01", "2026-10-31", [4])).toBe(4);
  });

  it("Ders Programı başlığı aynı findOfficialHoliday kaynağını kullanır (yalnız sabit günler değil)", () => {
    const code = readFileSync(path.resolve(import.meta.dirname, "../../components/program-studio.tsx"), "utf-8");
    expect(code).toMatch(/findOfficialHoliday\(toYmd\(day\)\)/);
    expect(code).not.toMatch(/turkeyFixedPublicHolidays/);
  });
});
