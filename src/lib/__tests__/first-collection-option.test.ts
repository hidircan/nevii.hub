import { describe, it, expect } from "vitest";
import {
  applyInstallmentAmountOverrides,
  buildPerLessonInstallmentSchedule,
  computeContractEndDate,
} from "../contracts";
import { computePeriodAmount, computePeriodBillingLines, type BillableLessonCandidate } from "../period-lesson-billing";

/**
 * Sahibin test ortamında bildirdiği hata (2026-09-16):
 * 4.950 TL × 10 ay, 15 Eylül kaydı, Eylül'de 3 ders.
 *  - İlk tahsilat 3.713 yazıldı (3.712 olmalıydı — küsurat yukarı yuvarlanıyordu).
 *  - Kayıt ekranı Eylül'ü 3 ders sayıp yalnız Eylül'ü tahsil ederken, sözleşme
 *    ekranı aynı ayı tahminle 2 ders sayıp Ekim'i ilk tahsilata KATTI.
 *  - Birleşik satırın tutarı fiilen tahsil edilen Eylül parasına eşitlendiği için
 *    Ekim'in 4.950'si toplamdan düştü: toplam bir ay eksik kaldı.
 * Düzeltme: küsurat aşağı yuvarlanır ve birleştirme artık ders sayısından
 * TÜRETİLMEZ — kullanıcının açık seçimidir (`mergeFirstTwoPeriods`).
 */
function lesson(id: string, isoDay: string): BillableLessonCandidate {
  return { id, studentId: "s1", startAt: `${isoDay}T08:00:00.000Z`, type: "regular", status: "scheduled" };
}

const MONTHLY = 4950;
/** 15 Eylül 2026 Salı → Eylül'de 3 ders kalır. */
const SEPT_DAYS = ["2026-09-15", "2026-09-22", "2026-09-29"];
/** Ekim 2026 – Haziran 2027: her ay 4 ders (tam dönem = tam aylık ücret). */
const FULL_MONTHS: Array<[number, number]> = [
  [2026, 10], [2026, 11], [2026, 12],
  [2027, 1], [2027, 2], [2027, 3], [2027, 4], [2027, 5], [2027, 6],
];
const ALL_LESSONS: BillableLessonCandidate[] = [
  ...SEPT_DAYS.map((d, i) => lesson(`s${i}`, d)),
  ...FULL_MONTHS.flatMap(([y, m]) =>
    [2, 9, 16, 23].map((d) => lesson(`f${y}${m}${d}`, `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`))
  ),
];

function linesFor(endDay: string, lessons: BillableLessonCandidate[] = ALL_LESSONS, startDay = "2026-09-15") {
  return computePeriodBillingLines({
    enrollmentStartDay: startDay,
    enrollmentEndDay: endDay,
    monthlyFee: MONTHLY,
    weeklyLessonCount: 1,
    lessons,
    studentId: "s1",
    makeupRequests: [],
  });
}

describe("computePeriodAmount — küsurat AŞAĞI yuvarlanır (2026-09-16)", () => {
  it("4.950 × 3/4 = 3.712,5 → 3.712 (eskiden 3.713 yazıyordu)", () => {
    expect(computePeriodAmount(MONTHLY, 1, 3)).toBe(3712);
  });

  it("tam dönem her zaman aylık ücretin kendisidir; diğer oranlar bozulmaz", () => {
    expect(computePeriodAmount(MONTHLY, 1, 4)).toBe(MONTHLY);
    expect(computePeriodAmount(MONTHLY, 1, 2)).toBe(2475);
    expect(computePeriodAmount(MONTHLY, 1, 1)).toBe(1237); // 1.237,5 → aşağı
    expect(computePeriodAmount(5950, 2, 8)).toBe(5950);
  });
});

describe("birleştirme artık AÇIK seçim — sahibin hata senaryosu", () => {
  const end = computeContractEndDate("2026-09-15", 10); // 30 Haziran 2027

  it("seçim KAPALI: Eylül tek başına 3.712, Ekim ayrı taksit, 10 satır, toplam 48.262", () => {
    const schedule = buildPerLessonInstallmentSchedule({
      billingLines: linesFor(end),
      mergeFirstTwoPeriods: false,
      firstPeriodManualNetAmount: 3712,
      firstDueDate: "2026-09-15",
    });
    expect(schedule).toHaveLength(10);
    expect(schedule[0]!.kind).toBe("first_collection");
    expect(schedule[0]!.amount).toBe(3712);
    expect(schedule[1]!.periodLabel).toBe("Ekim 2026");
    expect(schedule[1]!.amount).toBe(MONTHLY);
    expect(schedule.map((r) => r.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(schedule.at(-1)!.periodLabel).toBe("Haziran 2027");
    // 3.712 + 9 × 4.950 = 48.262 — bir ay eksik toplam YOK.
    expect(schedule.reduce((s, r) => s + r.amount, 0)).toBe(48262);
  });

  it("seçim AÇIK: ilk satır Eylül+Ekim'i kapsar, tahsil edilen tutar ikisinin yerine geçer", () => {
    const combined = 3712 + MONTHLY;
    const schedule = buildPerLessonInstallmentSchedule({
      billingLines: linesFor(end),
      mergeFirstTwoPeriods: true,
      firstPeriodManualNetAmount: combined,
      firstDueDate: "2026-09-15",
    });
    expect(schedule[0]!.kind).toBe("first_collection_combined");
    expect(schedule[0]!.amount).toBe(combined);
    expect(schedule[0]!.breakdown).toEqual([
      { periodLabel: "15–30 Eylül 2026", amount: 3712 },
      { periodLabel: "Ekim 2026", amount: MONTHLY },
    ]);
    expect(schedule).toHaveLength(9); // 1–2 birleşik + Kasım…Haziran
    expect(schedule[1]!.sequence).toBe(3);
    expect(schedule.at(-1)!.sequence).toBe(10);
    // Birleşik satır iki ayı kapsadığı için toplam yine 48.262 — Ekim kaybolmaz.
    expect(schedule.reduce((s, r) => s + r.amount, 0)).toBe(48262);
  });

  it("ders sayısı birleştirmeyi ARTIK tetiklemez — 2 ders kalsa bile seçim kapalıysa birleşmez", () => {
    const schedule = buildPerLessonInstallmentSchedule({
      billingLines: linesFor(
        "2026-11-30",
        [lesson("a", "2026-09-22"), lesson("b", "2026-09-29"), lesson("c", "2026-10-06")],
        "2026-09-20"
      ),
      mergeFirstTwoPeriods: false,
      firstDueDate: "2026-09-20",
    });
    expect(schedule[0]!.kind).toBe("first_collection");
    expect(schedule[1]!.periodLabel).toBe("Ekim 2026");
  });
});

describe("applyInstallmentAmountOverrides — önizlemede elle düzenlenen tutarlar", () => {
  const base = () =>
    buildPerLessonInstallmentSchedule({
      billingLines: linesFor(computeContractEndDate("2026-09-15", 10)),
      mergeFirstTwoPeriods: false,
      firstDueDate: "2026-09-15",
    });

  it("verilen sıra numaralarının tutarı değişir ve 'manual' işaretlenir; toplam da değişir", () => {
    const rows = applyInstallmentAmountOverrides(base(), [
      { sequence: 1, amount: 3000 },
      { sequence: 10, amount: 4000 },
    ]);
    expect(rows[0]!.amount).toBe(3000);
    expect(rows[0]!.computationSource).toBe("manual");
    expect(rows.at(-1)!.amount).toBe(4000);
    expect(rows.at(-1)!.computationSource).toBe("manual");
    // 3.000 + 8 × 4.950 + 4.000
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(3000 + 8 * MONTHLY + 4000);
    // Dokunulmayan satırlar otomatik kalır.
    expect(rows[1]!.computationSource).toBe("auto");
  });

  it("override yoksa veya tutar aynıysa satır DEĞİŞMEZ (gereksiz 'manual' etiketi yok)", () => {
    const rows = base();
    expect(applyInstallmentAmountOverrides(rows, [])).toBe(rows);
    expect(applyInstallmentAmountOverrides(rows, undefined)).toBe(rows);
    const same = applyInstallmentAmountOverrides(rows, [{ sequence: 2, amount: rows[1]!.amount }]);
    expect(same[1]!.computationSource).toBe(rows[1]!.computationSource);
  });
});
