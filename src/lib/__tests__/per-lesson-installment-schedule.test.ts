import { describe, it, expect } from "vitest";
import { buildPerLessonInstallmentSchedule } from "../contracts";
import { computePeriodBillingLines, type BillableLessonCandidate } from "../period-lesson-billing";
import { DEFAULT_FIRST_COLLECTION_MERGE_THRESHOLD_LESSONS } from "../types";

function lesson(id: string, isoDay: string): BillableLessonCandidate {
  return { id, studentId: "s1", startAt: `${isoDay}T08:00:00.000Z`, type: "regular", status: "scheduled" };
}

const THRESHOLD = DEFAULT_FIRST_COLLECTION_MERGE_THRESHOLD_LESSONS; // 3

describe("buildPerLessonInstallmentSchedule", () => {
  it("örnek senaryo: ilk kısa dönem 4×500 (eşik üstü, birleşmez), tam dönem 8×500, son kısa dönem 4×500", () => {
    const lessons = [
      ...["2026-09-15", "2026-09-17", "2026-09-22", "2026-09-24"].map((d, i) => lesson(`s${i}`, d)),
      ...[1, 3, 8, 10, 15, 17, 22, 24].map((d, i) => lesson(`f${i}`, `2026-10-${String(d).padStart(2, "0")}`)),
      ...["2026-11-02", "2026-11-05", "2026-11-09", "2026-11-12"].map((d, i) => lesson(`l${i}`, d)),
    ];
    const billingLines = computePeriodBillingLines({
      enrollmentStartDay: "2026-09-15",
      enrollmentEndDay: "2026-11-14",
      perLessonNetFee: 500,
      lessons,
      studentId: "s1",
      makeupRequests: [],
    });
    const schedule = buildPerLessonInstallmentSchedule({
      billingLines,
      mergeThresholdLessons: THRESHOLD,
      firstDueDate: "2026-09-15",
    });
    expect(schedule.map((s) => s.amount)).toEqual([2000, 4000, 2000]);
    expect(schedule.map((s) => s.sequence)).toEqual([1, 2, 3]);
    expect(schedule[0]!.dueDate).toBe("2026-09-15");
    expect(schedule[0]!.kind).toBe("first_collection");
    expect(schedule[1]!.kind).toBe("period_fee");
  });

  it("ilk dönem manuel düzeltilmişse (eşik üstü, birleşmeyen senaryo) yalnız o satırda net tutar kullanılır", () => {
    // İlk dönemde 4 ders (eşik 3'ün üstünde) → birleşme YOK, iki bağımsız satır.
    const billingLines = computePeriodBillingLines({
      enrollmentStartDay: "2026-09-01",
      enrollmentEndDay: "2026-10-31",
      perLessonNetFee: 500,
      lessons: [
        lesson("l1", "2026-09-07"),
        lesson("l2", "2026-09-14"),
        lesson("l3", "2026-09-21"),
        lesson("l4", "2026-09-28"),
        lesson("l5", "2026-10-05"),
      ],
      studentId: "s1",
      makeupRequests: [],
    });
    expect(billingLines[0]!.billableLessonCount).toBeGreaterThan(THRESHOLD);
    const schedule = buildPerLessonInstallmentSchedule({
      billingLines,
      mergeThresholdLessons: THRESHOLD,
      firstPeriodManualNetAmount: 300,
      firstDueDate: "2026-09-01",
    });
    expect(schedule[0]!.kind).toBe("first_collection");
    expect(schedule[0]!.amount).toBe(300);
    expect(schedule[0]!.computationSource).toBe("manual");
    expect(schedule[1]!.amount).toBe(billingLines[1]!.autoCalculatedAmount);
    expect(schedule[1]!.computationSource).toBe("auto");
  });

  it("manuel düzeltme YOKSA taksit toplamı motorun ürettiği toplamla birebir eşleşir", () => {
    const billingLines = computePeriodBillingLines({
      enrollmentStartDay: "2026-09-15",
      enrollmentEndDay: "2026-11-20",
      perLessonNetFee: 750,
      lessons: [lesson("l1", "2026-09-20"), lesson("l2", "2026-10-05"), lesson("l3", "2026-11-10")],
      studentId: "s1",
      makeupRequests: [],
    });
    const schedule = buildPerLessonInstallmentSchedule({
      billingLines,
      mergeThresholdLessons: THRESHOLD,
      firstDueDate: "2026-09-15",
    });
    const engineTotal = billingLines.reduce((s, l) => s + l.autoCalculatedAmount, 0);
    const scheduleTotal = schedule.reduce((s, r) => s + r.amount, 0);
    expect(scheduleTotal).toBe(engineTotal);
  });

  it("boş dönem listesi boş taksit listesi döner (hata fırlatmaz)", () => {
    expect(
      buildPerLessonInstallmentSchedule({ billingLines: [], mergeThresholdLessons: THRESHOLD, firstDueDate: "2026-09-01" })
    ).toEqual([]);
  });

  describe("3 ders eşiği — birleştirilmiş ilk tahsilat", () => {
    it("kayıt ayında kalan ders sayısı eşiğe eşit/altındaysa ilk iki dönem TEK satırda birleşir", () => {
      // 17 Eylül kayıt, yalnız 2 ders kalıyor (eşik altı) → Eylül + Ekim birleşir.
      const lessons = [
        lesson("s1", "2026-09-21"),
        lesson("s2", "2026-09-28"),
        ...[5, 12, 19, 26].map((d, i) => lesson(`o${i}`, `2026-10-${String(d).padStart(2, "0")}`)),
        lesson("n1", "2026-11-02"),
      ];
      const billingLines = computePeriodBillingLines({
        enrollmentStartDay: "2026-09-17",
        enrollmentEndDay: "2026-11-30",
        perLessonNetFee: 1500,
        lessons,
        studentId: "s1",
        makeupRequests: [],
      });
      expect(billingLines[0]!.billableLessonCount).toBe(2); // eşik (3) altında
      const schedule = buildPerLessonInstallmentSchedule({
        billingLines,
        mergeThresholdLessons: THRESHOLD,
        firstDueDate: "2026-09-17",
      });
      // Eylül (2×1500=3000) + Ekim (4×1500=6000) = 9000, tek satırda.
      expect(schedule[0]!.kind).toBe("first_collection_combined");
      expect(schedule[0]!.amount).toBe(9000);
      expect(schedule[0]!.periodLabel).toContain("Eylül");
      expect(schedule[0]!.periodLabel).toContain("Ekim");
      expect(schedule[0]!.breakdown).toEqual([
        { periodLabel: expect.stringContaining("Eylül") as unknown as string, amount: 3000 },
        { periodLabel: "Ekim 2026", amount: 6000 },
      ]);
      // Kasım'dan itibaren normal dönem ücretine döner.
      expect(schedule[1]!.kind).toBe("period_fee");
      expect(schedule[1]!.periodLabel).toBe("Kasım 2026");
      expect(schedule.length).toBe(2);
    });

    it("kayıt ayında kalan ders sayısı eşikten FAZLAysa birleştirme olmaz, ilk ay kendi başına kalır", () => {
      const lessons = [
        ...["2026-09-17", "2026-09-19", "2026-09-24", "2026-09-26"].map((d, i) => lesson(`s${i}`, d)),
        ...[3, 10, 17, 24].map((d, i) => lesson(`o${i}`, `2026-10-${String(d).padStart(2, "0")}`)),
      ];
      const billingLines = computePeriodBillingLines({
        enrollmentStartDay: "2026-09-17",
        enrollmentEndDay: "2026-10-31",
        perLessonNetFee: 1000,
        lessons,
        studentId: "s1",
        makeupRequests: [],
      });
      expect(billingLines[0]!.billableLessonCount).toBe(4); // eşik (3) üstünde
      const schedule = buildPerLessonInstallmentSchedule({
        billingLines,
        mergeThresholdLessons: THRESHOLD,
        firstDueDate: "2026-09-17",
      });
      expect(schedule[0]!.kind).toBe("first_collection");
      expect(schedule[0]!.amount).toBe(4000); // yalnız Eylül, Ekim'e kopyalanmaz
      expect(schedule[1]!.amount).toBe(4000); // Ekim kendi (farklı) tutarı
      expect(schedule.length).toBe(2);
    });

    it("birleştirilmiş satırda manuel tutar, GERÇEKTEN TAHSİL EDİLEN TOPLAM (Eylül+Ekim birlikte) tutarıdır — breakdown yine de OTOMATİK bileşenleri gösterir", () => {
      const lessons = [
        lesson("s1", "2026-09-21"),
        ...[5, 12, 19, 26].map((d, i) => lesson(`o${i}`, `2026-10-${String(d).padStart(2, "0")}`)),
      ];
      const billingLines = computePeriodBillingLines({
        enrollmentStartDay: "2026-09-17",
        enrollmentEndDay: "2026-10-31",
        perLessonNetFee: 1500,
        lessons,
        studentId: "s1",
        makeupRequests: [],
      });
      // Otomatik toplam: Eylül (1×1500) + Ekim (4×1500) = 7500. Veli fiilen 7000 ödedi.
      const schedule = buildPerLessonInstallmentSchedule({
        billingLines,
        mergeThresholdLessons: THRESHOLD,
        firstPeriodManualNetAmount: 7000,
        firstDueDate: "2026-09-17",
      });
      expect(schedule[0]!.amount).toBe(7000);
      expect(schedule[0]!.computationSource).toBe("manual");
      // breakdown ŞEFFAFLIK için her zaman otomatik hesaplanan bileşenleri gösterir.
      expect(schedule[0]!.breakdown).toEqual([
        { periodLabel: expect.stringContaining("Eylül") as unknown as string, amount: 1500 },
        { periodLabel: "Ekim 2026", amount: 6000 },
      ]);
    });

    it("manuel toplam OTOMATİK toplamla birebir eşleşirse computationSource 'auto' kalır", () => {
      const lessons = [
        lesson("s1", "2026-09-21"),
        ...[5, 12, 19, 26].map((d, i) => lesson(`o${i}`, `2026-10-${String(d).padStart(2, "0")}`)),
      ];
      const billingLines = computePeriodBillingLines({
        enrollmentStartDay: "2026-09-17",
        enrollmentEndDay: "2026-10-31",
        perLessonNetFee: 1500,
        lessons,
        studentId: "s1",
        makeupRequests: [],
      });
      const schedule = buildPerLessonInstallmentSchedule({
        billingLines,
        mergeThresholdLessons: THRESHOLD,
        firstPeriodManualNetAmount: 7500, // otomatikle birebir aynı
        firstDueDate: "2026-09-17",
      });
      expect(schedule[0]!.amount).toBe(7500);
      expect(schedule[0]!.computationSource).toBe("auto");
    });
  });
});
