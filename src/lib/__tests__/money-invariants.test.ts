/**
 * P0-1 (2026-09-09) — PARA DEĞİŞMEZLERİ.
 *
 * Owner bulgusu: 3 aylık / 5.950 TL sözleşmede ödeme önizlemesi sonraki
 * ayları 5.952 TL gösteriyordu. Kök neden ÇİFT YUVARLAMA'dır:
 * `derivePerLessonAmount` aylık ücreti referans ders adedine bölüp TAM
 * SAYIYA yuvarlıyor, sonra dönem tutarı bu yuvarlanmış değerle YENİDEN
 * çarpılıyordu — kalan (referans × yuvarlama hatası) her TAM aya sızıyordu.
 *
 * Bu dosya, düzeltmenin geri gelmesini engelleyen değişmezleri kilitler.
 * Kasıtlı olarak `perLessonNetFee` değil AYLIK ÜCRET tabanlıdır: sözleşmede
 * onaylanan aylık ücret tek doğruluk kaynağıdır, ders başı tutar ondan
 * TÜRETİLEN bir gösterim değeridir.
 */
import { describe, it, expect } from "vitest";
import {
  computePeriodBillingLines,
  estimatePeriodBillingLines,
  referenceMonthlyLessonCount,
  type BillableLessonCandidate,
} from "../period-lesson-billing";

function lesson(id: string, isoDay: string): BillableLessonCandidate {
  return { id, studentId: "s1", startAt: `${isoDay}T08:00:00.000Z`, type: "regular", status: "scheduled" };
}

/** Bir tam takvim ayına, haftalık sıklığın referans adedi kadar ders yerleştirir. */
function fullMonthLessons(monthPrefix: string, weeklyLessonCount: number): BillableLessonCandidate[] {
  const count = referenceMonthlyLessonCount(weeklyLessonCount);
  return Array.from({ length: count }, (_, i) =>
    lesson(`l${i}`, `${monthPrefix}-${String(i + 1).padStart(2, "0")}`)
  );
}

describe("P0-1 — tam dönem HER ZAMAN onaylı aylık ücrete eşittir", () => {
  // Owner'ın bildirdiği tam senaryo + yuvarlama hatasına duyarlı diğer tutarlar.
  const fees = [5950, 5951, 5949, 1001, 3333, 2875];

  for (const monthlyFee of fees) {
    for (const weeklyLessonCount of [1, 2, 3, 4]) {
      it(`${monthlyFee} TL / haftada ${weeklyLessonCount} ders — tam ay = ${monthlyFee} TL (5.952 REGRESYONU)`, () => {
        const lines = computePeriodBillingLines({
          enrollmentStartDay: "2026-10-01",
          enrollmentEndDay: "2026-10-31",
          monthlyFee,
          weeklyLessonCount,
          lessons: fullMonthLessons("2026-10", weeklyLessonCount),
          studentId: "s1",
          makeupRequests: [],
        });
        expect(lines).toHaveLength(1);
        expect(lines[0]!.billableLessonCount).toBe(referenceMonthlyLessonCount(weeklyLessonCount));
        expect(lines[0]!.autoCalculatedAmount).toBe(monthlyFee);
      });
    }
  }

  it("PROJEKSİYON yolu (gerçek ders programı yokken) da aynı değişmeze uyar", () => {
    const lines = estimatePeriodBillingLines({
      enrollmentStartDay: "2026-10-01",
      enrollmentEndDay: "2026-12-31",
      monthlyFee: 5950,
      weeklyLessonCount: 2,
    });
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line.autoCalculatedAmount).toBe(5950);
    }
    expect(lines.reduce((s, l) => s + l.autoCalculatedAmount, 0)).toBe(3 * 5950);
  });
});

describe("P0-1 — kısmi dönemler orantılıdır ve TEK yuvarlama içerir", () => {
  it("yarım ay, tam ayın yarısına yuvarlanır (çift yuvarlama YOK)", () => {
    const lines = computePeriodBillingLines({
      enrollmentStartDay: "2026-10-01",
      enrollmentEndDay: "2026-10-31",
      monthlyFee: 5950,
      weeklyLessonCount: 2,
      // referans 8 ders yerine yalnız 4 ders
      lessons: fullMonthLessons("2026-10", 2).slice(0, 4),
      studentId: "s1",
      makeupRequests: [],
    });
    expect(lines[0]!.autoCalculatedAmount).toBe(2975); // 5950 × 4/8 — tam
  });

  it("her satır tam sayı TL'dir (float sızıntısı yok)", () => {
    for (const count of [1, 2, 3, 5, 7, 9, 11]) {
      const lines = computePeriodBillingLines({
        enrollmentStartDay: "2026-10-01",
        enrollmentEndDay: "2026-10-31",
        monthlyFee: 5950,
        weeklyLessonCount: 3,
        lessons: fullMonthLessons("2026-10", 3).slice(0, count),
        studentId: "s1",
        makeupRequests: [],
      });
      expect(Number.isInteger(lines[0]!.autoCalculatedAmount)).toBe(true);
    }
  });

  it("referanstan FAZLA ders içeren yoğun ay yine TAM aylık ücret (tavan haftalık×4 — sahip kararı 2026-09-17)", () => {
    const lessons = [...fullMonthLessons("2026-10", 2), lesson("extra", "2026-10-28")];
    const lines = computePeriodBillingLines({
      enrollmentStartDay: "2026-10-01",
      enrollmentEndDay: "2026-10-31",
      monthlyFee: 5950,
      weeklyLessonCount: 2,
      lessons,
      studentId: "s1",
      makeupRequests: [],
    });
    expect(lines[0]!.billableLessonCount).toBe(9);
    expect(lines[0]!.autoCalculatedAmount).toBe(5950);
  });
});
