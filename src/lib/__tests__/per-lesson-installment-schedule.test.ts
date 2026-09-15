import { describe, it, expect } from "vitest";
import { buildPerLessonInstallmentSchedule, computeContractEndDate, resolvePerLessonContractEndDay } from "../contracts";
import { computePeriodBillingLines, type BillableLessonCandidate } from "../period-lesson-billing";
import { DEFAULT_FIRST_COLLECTION_MERGE_THRESHOLD_LESSONS, shouldMergeFirstCollection } from "../types";

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
      monthlyFee: 4000, // ders başı 500 TL × referans 8 ders
      weeklyLessonCount: 2,
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
      monthlyFee: 4000, // ders başı 500 TL × referans 8 ders
      weeklyLessonCount: 2,
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
      monthlyFee: 6000, // ders başı 750 TL × referans 8 ders
      weeklyLessonCount: 2,
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
        monthlyFee: 12000, // ders başı 1500 TL × referans 8 ders
        weeklyLessonCount: 2,
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
        monthlyFee: 8000, // ders başı 1000 TL × referans 8 ders
        weeklyLessonCount: 2,
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
        monthlyFee: 12000, // ders başı 1500 TL × referans 8 ders
        weeklyLessonCount: 2,
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
        monthlyFee: 12000, // ders başı 1500 TL × referans 8 ders
        weeklyLessonCount: 2,
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

  describe("son dönem ücretlendirme tercihi (lastPeriodPricing)", () => {
    function threeRowBillingLines() {
      const lessons = [
        ...["2026-09-15", "2026-09-17", "2026-09-22", "2026-09-24"].map((d, i) => lesson(`s${i}`, d)),
        ...[1, 3, 8, 10, 15, 17, 22, 24].map((d, i) => lesson(`f${i}`, `2026-10-${String(d).padStart(2, "0")}`)),
        ...["2026-11-02", "2026-11-05", "2026-11-09", "2026-11-12"].map((d, i) => lesson(`l${i}`, d)),
      ];
      return computePeriodBillingLines({
        enrollmentStartDay: "2026-09-15",
        enrollmentEndDay: "2026-11-14",
        monthlyFee: 4000, // ders başı 500 TL × referans 8 ders
        weeklyLessonCount: 2,
        lessons,
        studentId: "s1",
        makeupRequests: [],
      });
    }

    it("mode undefined/'remaining_lessons' — davranış DEĞİŞMEZ, son dönem kendi gerçek ders sayısında kalır", () => {
      const billingLines = threeRowBillingLines();
      const schedule = buildPerLessonInstallmentSchedule({
        billingLines,
        mergeThresholdLessons: THRESHOLD,
        firstDueDate: "2026-09-15",
        lastPeriodPricing: { mode: "remaining_lessons" },
      });
      expect(schedule.map((s) => s.amount)).toEqual([2000, 4000, 2000]);
      expect(schedule[2]!.computationSource).toBe("auto");
    });

    it("mode 'regular_fee' — son dönem satırı tam/normal dönem ücretine sabitlenir, kalan ders sayısına bakılmaz", () => {
      const billingLines = threeRowBillingLines();
      const schedule = buildPerLessonInstallmentSchedule({
        billingLines,
        mergeThresholdLessons: THRESHOLD,
        firstDueDate: "2026-09-15",
        lastPeriodPricing: { mode: "regular_fee", regularFeeAmount: 4000 },
      });
      // İlk iki satır ETKİLENMEZ, yalnız son (period_fee) satır 2000 → 4000.
      expect(schedule.map((s) => s.amount)).toEqual([2000, 4000, 4000]);
      expect(schedule[2]!.computationSource).toBe("auto");
      expect(schedule[2]!.kind).toBe("period_fee");
    });

    it("mode 'manual' — son dönem satırı personelin girdiği net tutarı kullanır ve 'manual' işaretlenir", () => {
      const billingLines = threeRowBillingLines();
      const schedule = buildPerLessonInstallmentSchedule({
        billingLines,
        mergeThresholdLessons: THRESHOLD,
        firstDueDate: "2026-09-15",
        lastPeriodPricing: { mode: "manual", manualAmount: 1250 },
      });
      expect(schedule.map((s) => s.amount)).toEqual([2000, 4000, 1250]);
      expect(schedule[2]!.computationSource).toBe("manual");
    });

    it("son satır period_fee DEĞİLSE (tek dönemlik sözleşme, first_collection) tercih uygulanmaz — ilk dönem override'ıyla ÇAKIŞMAZ", () => {
      const billingLines = computePeriodBillingLines({
        enrollmentStartDay: "2026-09-01",
        enrollmentEndDay: "2026-09-30",
        monthlyFee: 4000, // ders başı 500 TL × referans 8 ders
        weeklyLessonCount: 2,
        lessons: [lesson("l1", "2026-09-07")],
        studentId: "s1",
        makeupRequests: [],
      });
      const schedule = buildPerLessonInstallmentSchedule({
        billingLines,
        mergeThresholdLessons: THRESHOLD,
        firstDueDate: "2026-09-01",
        lastPeriodPricing: { mode: "regular_fee", regularFeeAmount: 9999 },
      });
      expect(schedule.length).toBe(1);
      expect(schedule[0]!.kind).toBe("first_collection");
      expect(schedule[0]!.amount).not.toBe(9999); // tercih göz ardı edilir, ilk dönem tutarı korunur
    });
  });
});

describe("resolvePerLessonContractEndDay — birleşik ilk tahsilat sözleşmeyi bir ay uzatmaz (2026-09-15)", () => {
  const start = "2026-09-17";
  const linesUntil = (end: string) =>
    computePeriodBillingLines({
      enrollmentStartDay: start,
      enrollmentEndDay: end,
      monthlyFee: 2000,
      weeklyLessonCount: 1,
      lessons: [lesson("a", "2026-09-17"), lesson("b", "2026-10-05"), lesson("c", "2026-10-12")],
      studentId: "s1",
      makeupRequests: [],
    });

  it("10 ay, Eylül başlangıç, Eylül+Ekim birleşik → 30 Haziran; 9 satır, Temmuz yok, Ekim tekrar yok", () => {
    const naiveEnd = computeContractEndDate(start, 10); // 2027-07-17 — eski (hatalı) kapsam
    const naiveLines = linesUntil(naiveEnd);
    expect(naiveLines).toHaveLength(11); // kök neden: ay ortası başlangıçta N+1 takvim dönemi

    const end = resolvePerLessonContractEndDay({
      enrollmentStartDay: start,
      enrollmentEndDay: naiveEnd,
      durationMonths: 10,
      firstPeriodBillableLessonCount: naiveLines[0]!.billableLessonCount,
      mergeThresholdLessons: THRESHOLD,
    });
    expect(end).toBe("2027-06-30");

    const schedule = buildPerLessonInstallmentSchedule({
      billingLines: linesUntil(end),
      mergeThresholdLessons: THRESHOLD,
      firstDueDate: start,
    });
    expect(schedule[0]!.kind).toBe("first_collection_combined");
    expect(schedule[0]!.periodLabel).toBe("17–30 Eylül 2026 + Ekim 2026");
    expect(schedule).toHaveLength(9);
    expect(schedule.at(-1)!.periodLabel).toBe("Haziran 2027");
    expect(schedule.some((r) => r.periodLabel?.includes("Temmuz"))).toBe(false);
    expect(schedule.slice(1).some((r) => r.periodLabel?.includes("Ekim"))).toBe(false);
    // Ekim tutarı yalnız birleşik satırda: 2×500.
    expect(schedule[0]!.breakdown?.[1]).toEqual({ periodLabel: "Ekim 2026", amount: 1000 });
  });

  it("birleşme yoksa (kayıt ayında eşik üstü ders) istemcinin bitişi AYNEN korunur", () => {
    expect(
      resolvePerLessonContractEndDay({
        enrollmentStartDay: "2026-09-01",
        enrollmentEndDay: "2027-07-01",
        durationMonths: 10,
        firstPeriodBillableLessonCount: THRESHOLD + 1,
        mergeThresholdLessons: THRESHOLD,
      })
    ).toBe("2027-07-01");
  });

  it("1 aylık sözleşmede bitiş değişmez (birleşecek ikinci ay sözleşmeye dahil değil)", () => {
    expect(
      resolvePerLessonContractEndDay({
        enrollmentStartDay: start,
        enrollmentEndDay: "2026-10-17",
        durationMonths: 1,
        firstPeriodBillableLessonCount: 1,
        mergeThresholdLessons: THRESHOLD,
      })
    ).toBe("2026-10-17");
  });
});

describe("taksit numarası = sözleşme ayı (2026-09-15)", () => {
  it("10 Eylül kayıt, Eylül+Ekim ilk tahsilatta → Kasım 3., Haziran 10. taksit; 2. numara ayrı satır değil", () => {
    // 10 Eylül 2026 Perşembe — haftada 1 ders, Eylül'de yalnız 10 ve 17 planlı (2 < 3 → birleşir).
    const lessons = [lesson("a", "2026-09-10"), lesson("b", "2026-09-17"), lesson("c", "2026-10-01")];
    const end = resolvePerLessonContractEndDay({
      enrollmentStartDay: "2026-09-10",
      enrollmentEndDay: computeContractEndDate("2026-09-10", 10),
      durationMonths: 10,
      firstPeriodBillableLessonCount: 2,
      mergeThresholdLessons: THRESHOLD,
    });
    expect(end).toBe("2027-06-30");
    const schedule = buildPerLessonInstallmentSchedule({
      billingLines: computePeriodBillingLines({
        enrollmentStartDay: "2026-09-10",
        enrollmentEndDay: end,
        monthlyFee: 2000,
        weeklyLessonCount: 1,
        lessons,
        studentId: "s1",
        makeupRequests: [],
      }),
      mergeThresholdLessons: THRESHOLD,
      firstDueDate: "2026-09-10",
    });
    expect(schedule.map((r) => r.sequence)).toEqual([1, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(schedule.find((r) => r.sequence === 3)!.periodLabel).toBe("Kasım 2026");
    expect(schedule.find((r) => r.sequence === 10)!.periodLabel).toBe("Haziran 2027");
    expect(schedule.some((r) => r.sequence === 2)).toBe(false);
  });

  it("birleşme yoksa numaralama değişmez (1, 2, 3 …)", () => {
    const schedule = buildPerLessonInstallmentSchedule({
      billingLines: computePeriodBillingLines({
        enrollmentStartDay: "2026-09-01",
        enrollmentEndDay: "2026-11-30",
        monthlyFee: 2000,
        weeklyLessonCount: 1,
        lessons: ["2026-09-03", "2026-09-10", "2026-09-17", "2026-09-24"].map((d, i) => lesson(`s${i}`, d)),
        studentId: "s1",
        makeupRequests: [],
      }),
      mergeThresholdLessons: THRESHOLD,
      firstDueDate: "2026-09-01",
    });
    expect(schedule.map((r) => r.sequence)).toEqual([1, 2, 3]);
  });
});

describe("shouldMergeFirstCollection — kayıt ve sözleşme için TEK kural", () => {
  it("eşikten AZ ders → birleşir; tam eşik (3) → birleşmez (kayıt anında yalnız kayıt ayı tahsil edilir)", () => {
    expect(shouldMergeFirstCollection(2, THRESHOLD)).toBe(true);
    expect(shouldMergeFirstCollection(3, THRESHOLD)).toBe(false);
  });

  it("kayıt ayında tam 3 ders → sözleşme de birleştirmez; Ekim ayrı 2. taksit olarak faturalanır", () => {
    const schedule = buildPerLessonInstallmentSchedule({
      billingLines: computePeriodBillingLines({
        enrollmentStartDay: "2026-09-10",
        enrollmentEndDay: "2026-10-31",
        monthlyFee: 2000,
        weeklyLessonCount: 1,
        lessons: [lesson("a", "2026-09-10"), lesson("b", "2026-09-17"), lesson("c", "2026-09-24"), lesson("d", "2026-10-01")],
        studentId: "s1",
        makeupRequests: [],
      }),
      mergeThresholdLessons: THRESHOLD,
      firstDueDate: "2026-09-10",
    });
    expect(schedule.map((r) => [r.sequence, r.kind, r.periodLabel])).toEqual([
      [1, "first_collection", "10–30 Eylül 2026"],
      [2, "period_fee", "Ekim 2026"],
    ]);
  });
});
