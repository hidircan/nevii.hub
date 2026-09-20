import { describe, it, expect } from "vitest";
import { countExactWeekdayLessons, resolveLessonStartDay } from "../period-lesson-billing";

/**
 * P0 (2026-09-05) — kayıt tarihi ≠ ders başlangıç tarihi. İlk tahsilat
 * YALNIZCA ders başlangıcından itibaren gerçekleşen planlı dersleri sayar;
 * kayıt ile ders başlangıcı arasındaki günler ASLA faturalandırılmaz.
 */
describe("resolveLessonStartDay", () => {
  it("ders başlangıcı verilmişse onu kullanır (kayıt tarihini DEĞİL)", () => {
    expect(
      resolveLessonStartDay({
        lessonStartDate: "2026-09-20",
        enrollmentStartDate: "2026-09-05",
        fallbackToday: "2026-09-05",
      })
    ).toBe("2026-09-20");
  });

  it("ders başlangıcı yoksa kayıt tarihine düşer — eski kayıtların davranışı DEĞİŞMEZ", () => {
    expect(
      resolveLessonStartDay({ lessonStartDate: undefined, enrollmentStartDate: "2026-09-05", fallbackToday: "2026-09-30" })
    ).toBe("2026-09-05");
    expect(resolveLessonStartDay({ lessonStartDate: "", enrollmentStartDate: "", fallbackToday: "2026-09-30" })).toBe(
      "2026-09-30"
    );
  });

  it("ISO zaman damgasından yalnız gün kısmını alır", () => {
    expect(
      resolveLessonStartDay({
        lessonStartDate: "2026-09-20T00:00:00.000Z",
        enrollmentStartDate: "2026-09-05",
        fallbackToday: "2026-09-05",
      })
    ).toBe("2026-09-20");
  });
});

describe("ilk tahsilat — sahibin verdiği örnek (kayıt 5 Eylül, ders başlangıcı 20 Eylül, Salı/Perşembe)", () => {
  // 2026 Eylül: Salı = 1, 8, 15, 22, 29 · Perşembe = 3, 10, 17, 24
  const TUESDAY_THURSDAY = [2, 4];

  it("ders başlangıcından itibaren SADECE 4 ders sayar (22, 24, 29 Eylül… değil kayıt tarihinden itibaren 9 ders)", () => {
    const guz = { term: "guz" as const, overrides: [] };
    const fromLessonStart = countExactWeekdayLessons("2026-09-20", "2026-09-30", TUESDAY_THURSDAY, guz);
    const fromRegistration = countExactWeekdayLessons("2026-09-05", "2026-09-30", TUESDAY_THURSDAY, guz);
    expect(fromLessonStart).toBe(3); // 22, 24, 29 Eylül
    expect(fromRegistration).toBe(7);
    expect(fromLessonStart).toBeLessThan(fromRegistration);
  });

  it("ders başlangıcından ÖNCEKİ günler hiçbir koşulda sayılmaz", () => {
    expect(countExactWeekdayLessons("2026-09-20", "2026-09-19", TUESDAY_THURSDAY, { term: "guz", overrides: [] })).toBe(0);
  });
});
