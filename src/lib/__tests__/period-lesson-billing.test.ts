import { describe, it, expect } from "vitest";
import {
  isBillableLesson,
  resolveExcludedMakeupSourceLessonIds,
  countBillableLessonsInRange,
  splitEnrollmentIntoMonthlyPeriods,
  computePeriodBillingLines,
  estimateBillableLessonCount,
  estimatePeriodBillingLines,
  computePeriodBillingPreview,
  periodKindLabel,
  type BillableLessonCandidate,
} from "../period-lesson-billing";

// Europe/Istanbul UTC+3 — 08:00Z = 11:00 İstanbul, sınır riskine karşı güvenli gün-içi saat.
function lesson(
  id: string,
  isoDay: string,
  overrides: Partial<BillableLessonCandidate> = {}
): BillableLessonCandidate {
  return {
    id,
    studentId: "s1",
    startAt: `${isoDay}T08:00:00.000Z`,
    type: "regular",
    status: "scheduled",
    ...overrides,
  };
}

describe("splitEnrollmentIntoMonthlyPeriods", () => {
  it("ay ortası başlangıç + tam ay + ay ortası bitiş: start/full/end", () => {
    const periods = splitEnrollmentIntoMonthlyPeriods("2026-09-15", "2026-11-20");
    expect(periods).toEqual([
      { periodStart: "2026-09-15", periodEnd: "2026-09-30", kind: "start" },
      { periodStart: "2026-10-01", periodEnd: "2026-10-31", kind: "full" },
      { periodStart: "2026-11-01", periodEnd: "2026-11-20", kind: "end" },
    ]);
  });

  it("başlangıç ve bitiş aynı kısa dönemde: single", () => {
    const periods = splitEnrollmentIntoMonthlyPeriods("2026-09-10", "2026-09-22");
    expect(periods).toEqual([{ periodStart: "2026-09-10", periodEnd: "2026-09-22", kind: "single" }]);
  });

  it("28/29/30/31 günlük aylar doğru ay-sonu üretir", () => {
    expect(splitEnrollmentIntoMonthlyPeriods("2025-02-01", "2025-02-28")[0].periodEnd).toBe("2025-02-28");
    expect(splitEnrollmentIntoMonthlyPeriods("2024-02-01", "2024-02-29")[0].periodEnd).toBe("2024-02-29");
    expect(splitEnrollmentIntoMonthlyPeriods("2026-04-01", "2026-04-30")[0].periodEnd).toBe("2026-04-30");
    expect(splitEnrollmentIntoMonthlyPeriods("2026-01-01", "2026-01-31")[0].periodEnd).toBe("2026-01-31");
    // tam ay sınırı olmayan bir aralıkta da doğru ay-sonu üretmeli
    const feb = splitEnrollmentIntoMonthlyPeriods("2025-02-10", "2025-03-05");
    expect(feb[0].periodEnd).toBe("2025-02-28");
  });

  it("yıl değişimi: Aralık → Ocak ayrı dönemler olarak bölünür", () => {
    const periods = splitEnrollmentIntoMonthlyPeriods("2026-12-15", "2027-01-15");
    expect(periods).toEqual([
      { periodStart: "2026-12-15", periodEnd: "2026-12-31", kind: "start" },
      { periodStart: "2027-01-01", periodEnd: "2027-01-15", kind: "end" },
    ]);
  });

  it("bitiş, başlangıçtan önceyse hata fırlatır", () => {
    expect(() => splitEnrollmentIntoMonthlyPeriods("2026-09-15", "2026-09-01")).toThrow();
  });

  it("periodKindLabel her tür için Türkçe etiket döner", () => {
    expect(periodKindLabel("start")).toBe("Başlangıç dönemi");
    expect(periodKindLabel("full")).toBe("Tam dönem");
    expect(periodKindLabel("end")).toBe("Bitiş dönemi");
    expect(periodKindLabel("single")).toBe("Tek kısa dönem");
  });
});

describe("isBillableLesson", () => {
  const noExclusions = { excludedSourceLessonIds: new Set<string>(), frozenRanges: [] };

  it("normal planlı ders ücretlidir", () => {
    expect(isBillableLesson(lesson("l1", "2026-09-07"), noExclusions)).toBe(true);
  });

  it("deneme dersi ücretsizdir", () => {
    expect(isBillableLesson(lesson("l1", "2026-09-07", { type: "trial" }), noExclusions)).toBe(false);
  });

  it("iptal edilmiş ders ücretsizdir", () => {
    expect(isBillableLesson(lesson("l1", "2026-09-07", { status: "cancelled" }), noExclusions)).toBe(false);
  });

  it("kurumun kapalı günü işaretli ders ücretsizdir", () => {
    expect(isBillableLesson(lesson("l1", "2026-09-07", { opsClosedFlag: true }), noExclusions)).toBe(false);
  });

  it("açık ücretsiz/ikram bayraklı ders ücretsizdir", () => {
    expect(isBillableLesson(lesson("l1", "2026-09-07", { isFreeLesson: true }), noExclusions)).toBe(false);
  });

  it("telafiye giden kaynak ders ücretsizdir (yerini telafi dersi alır)", () => {
    const context = { excludedSourceLessonIds: new Set(["l1"]), frozenRanges: [] };
    expect(isBillableLesson(lesson("l1", "2026-09-07"), context)).toBe(false);
    // telafi dersinin kendisi (type:"makeup") normal şekilde ücretlidir
    expect(isBillableLesson(lesson("l2", "2026-09-10", { type: "makeup" }), context)).toBe(true);
  });

  it("öğrencinin dondurulmuş olduğu aralığa düşen ders ücretsizdir", () => {
    const context = {
      excludedSourceLessonIds: new Set<string>(),
      frozenRanges: [{ start: "2026-09-05", end: "2026-09-12" }],
    };
    expect(isBillableLesson(lesson("l1", "2026-09-07"), context)).toBe(false);
    expect(isBillableLesson(lesson("l2", "2026-09-13"), context)).toBe(true);
  });
});

describe("resolveExcludedMakeupSourceLessonIds", () => {
  it("iptal/expired olmayan telafi taleplerinin kaynak dersini hariç tutar", () => {
    const excluded = resolveExcludedMakeupSourceLessonIds([
      { sourceLessonId: "l1", status: "pending" },
      { sourceLessonId: "l2", status: "confirmed" },
      { sourceLessonId: "l3", status: "cancelled" },
      { sourceLessonId: "l4", status: "expired" },
    ]);
    expect(excluded.has("l1")).toBe(true);
    expect(excluded.has("l2")).toBe(true);
    expect(excluded.has("l3")).toBe(false);
    expect(excluded.has("l4")).toBe(false);
  });
});

describe("countBillableLessonsInRange", () => {
  it("yalnız aralık içindeki, aynı öğrenciye ait ücretlendirilebilir dersleri sayar", () => {
    const lessons = [
      lesson("l1", "2026-09-07"),
      lesson("l2", "2026-09-14"),
      lesson("l3", "2026-10-05"), // aralık dışı
      lesson("l4", "2026-09-07", { studentId: "s2" }), // başka öğrenci
    ];
    const count = countBillableLessonsInRange(lessons, "s1", "2026-09-01", "2026-09-30", {
      excludedSourceLessonIds: new Set(),
      frozenRanges: [],
    });
    expect(count).toBe(2);
  });
});

describe("computePeriodBillingLines — P0-1 senaryoları", () => {
  const makeupRequests: { sourceLessonId: string; status: string }[] = [];

  it("1) haftada 2 ders, ay ortası başlangıç: ilk dönem GERÇEK 4 ders üzerinden", () => {
    // Eylül 15'te başlıyor, haftada Salı/Perşembe 2 ders: 15,17,22,24,29 (2026-09 Salı=1,8,15,22,29)
    const lessons = [
      lesson("l1", "2026-09-15"),
      lesson("l2", "2026-09-17"),
      lesson("l3", "2026-09-22"),
      lesson("l4", "2026-09-24"),
      lesson("l5", "2026-09-29"), // 5. ders — bilerek eklendi, dönem dışına taşmadığını kanıtlar
      lesson("l6", "2026-10-01"), // bir sonraki döneme ait
    ];
    const lines = computePeriodBillingLines({
      enrollmentStartDay: "2026-09-15",
      enrollmentEndDay: "2026-09-29",
      perLessonNetFee: 500,
      lessons,
      studentId: "s1",
      makeupRequests,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].billableLessonCount).toBe(5);
    expect(lines[0].autoCalculatedAmount).toBe(2500);
  });

  it("örnek senaryodaki gibi: ilk kısa dönem 4 ders × 500 = 2.000 TL", () => {
    const lessons = [
      lesson("l1", "2026-09-15"),
      lesson("l2", "2026-09-17"),
      lesson("l3", "2026-09-22"),
      lesson("l4", "2026-09-24"),
    ];
    const lines = computePeriodBillingLines({
      enrollmentStartDay: "2026-09-15",
      enrollmentEndDay: "2026-09-24",
      perLessonNetFee: 500,
      lessons,
      studentId: "s1",
      makeupRequests,
    });
    expect(lines[0].billableLessonCount).toBe(4);
    expect(lines[0].autoCalculatedAmount).toBe(2000);
  });

  it("2) tam dönem: GERÇEK 8 ders üzerinden hesaplanır", () => {
    const lessons = [1, 3, 8, 10, 15, 17, 22, 24].map((d, i) =>
      lesson(`l${i}`, `2026-10-${String(d).padStart(2, "0")}`)
    );
    const lines = computePeriodBillingLines({
      enrollmentStartDay: "2026-10-01",
      enrollmentEndDay: "2026-10-31",
      perLessonNetFee: 500,
      lessons,
      studentId: "s1",
      makeupRequests,
    });
    expect(lines[0].kind).toBe("single");
    expect(lines[0].billableLessonCount).toBe(8);
    expect(lines[0].autoCalculatedAmount).toBe(4000);
  });

  it("3) ay ortasında biten öğrenci: son dönem YALNIZ 4 ders üzerinden", () => {
    const lessons = [1, 3, 8, 10, 15, 17, 22, 24].map((d, i) =>
      lesson(`l${i}`, `2026-11-${String(d).padStart(2, "0")}`)
    );
    const lines = computePeriodBillingLines({
      enrollmentStartDay: "2026-11-01",
      enrollmentEndDay: "2026-11-14", // yalnız ilk 4 ders (1,3,8,10) bu aralıkta
      perLessonNetFee: 500,
      lessons,
      studentId: "s1",
      makeupRequests,
    });
    expect(lines[0].billableLessonCount).toBe(4);
    expect(lines[0].autoCalculatedAmount).toBe(2000);
  });

  it("4) başlangıç ve bitiş aynı kısa dönemde (single)", () => {
    const lessons = [lesson("l1", "2026-09-12"), lesson("l2", "2026-09-19")];
    const lines = computePeriodBillingLines({
      enrollmentStartDay: "2026-09-10",
      enrollmentEndDay: "2026-09-22",
      perLessonNetFee: 500,
      lessons,
      studentId: "s1",
      makeupRequests,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].kind).toBe("single");
    expect(lines[0].billableLessonCount).toBe(2);
  });

  it("6) yıl değişimi: Aralık/Ocak dönemleri ayrı ayrı doğru hesaplanır", () => {
    const lessons = [
      lesson("l1", "2026-12-15"),
      lesson("l2", "2026-12-22"),
      lesson("l3", "2026-12-29"),
      lesson("l4", "2027-01-05"),
      lesson("l5", "2027-01-12"),
    ];
    const lines = computePeriodBillingLines({
      enrollmentStartDay: "2026-12-15",
      enrollmentEndDay: "2027-01-15",
      perLessonNetFee: 500,
      lessons,
      studentId: "s1",
      makeupRequests,
    });
    expect(lines).toHaveLength(2);
    expect(lines[0].billableLessonCount).toBe(3);
    expect(lines[1].billableLessonCount).toBe(2);
  });

  it("7) haftalık 1 ders farklı gün dağılımında da doğru sayar", () => {
    const lessons = [lesson("l1", "2026-09-07"), lesson("l2", "2026-09-21")]; // her 2 haftada bir gibi düzensiz
    const lines = computePeriodBillingLines({
      enrollmentStartDay: "2026-09-01",
      enrollmentEndDay: "2026-09-30",
      perLessonNetFee: 750,
      lessons,
      studentId: "s1",
      makeupRequests,
    });
    expect(lines[0].billableLessonCount).toBe(2);
    expect(lines[0].autoCalculatedAmount).toBe(1500);
  });

  it("8) deneme dersi tahsilata dahil DEĞİLDİR", () => {
    const lessons = [
      lesson("l1", "2026-09-07"),
      lesson("l2", "2026-09-10", { type: "trial" }),
    ];
    const lines = computePeriodBillingLines({
      enrollmentStartDay: "2026-09-01",
      enrollmentEndDay: "2026-09-30",
      perLessonNetFee: 500,
      lessons,
      studentId: "s1",
      makeupRequests,
    });
    expect(lines[0].billableLessonCount).toBe(1);
  });

  it("9) iptal/kapalı gün/dondurma tahsilata dahil DEĞİLDİR", () => {
    const lessons = [
      lesson("l1", "2026-09-07"),
      lesson("l2", "2026-09-08", { status: "cancelled" }),
      lesson("l3", "2026-09-09", { opsClosedFlag: true }),
      lesson("l4", "2026-09-10"), // dondurma aralığında
      lesson("l5", "2026-09-20"),
    ];
    const lines = computePeriodBillingLines({
      enrollmentStartDay: "2026-09-01",
      enrollmentEndDay: "2026-09-30",
      perLessonNetFee: 500,
      lessons,
      studentId: "s1",
      makeupRequests,
      frozenRanges: [{ start: "2026-09-10", end: "2026-09-10" }],
    });
    expect(lines[0].billableLessonCount).toBe(2); // l1, l5
  });

  it("10) telafi dersi ÇİFT tahsilat üretmez (kaynak hariç, telafi dahil = net 1)", () => {
    const lessons = [
      lesson("l1", "2026-09-07"), // kaçırılan, telafiye gönderildi
      lesson("l2", "2026-09-14", { type: "makeup" }), // telafi dersi
    ];
    const lines = computePeriodBillingLines({
      enrollmentStartDay: "2026-09-01",
      enrollmentEndDay: "2026-09-30",
      perLessonNetFee: 500,
      lessons,
      studentId: "s1",
      makeupRequests: [{ sourceLessonId: "l1", status: "confirmed" }],
    });
    expect(lines[0].billableLessonCount).toBe(1);
    expect(lines[0].autoCalculatedAmount).toBe(500);
  });

  it("14a) aynı girdi için motor HER ZAMAN aynı çıktıyı üretir (deterministik/saf)", () => {
    const input = {
      enrollmentStartDay: "2026-09-15",
      enrollmentEndDay: "2026-11-20",
      perLessonNetFee: 500,
      lessons: [lesson("l1", "2026-09-15"), lesson("l2", "2026-10-05")],
      studentId: "s1",
      makeupRequests,
    };
    expect(computePeriodBillingLines(input)).toEqual(computePeriodBillingLines(input));
  });

  it("negatif veya kesirli ders başı ücret reddedilir (para güvenliği)", () => {
    const base = {
      enrollmentStartDay: "2026-09-01",
      enrollmentEndDay: "2026-09-30",
      lessons: [],
      studentId: "s1",
      makeupRequests,
    };
    expect(() => computePeriodBillingLines({ ...base, perLessonNetFee: -1 })).toThrow();
    expect(() => computePeriodBillingLines({ ...base, perLessonNetFee: 500.5 })).toThrow();
  });

  it("computePeriodBillingLines her satırı estimated:false olarak işaretler", () => {
    const lines = computePeriodBillingLines({
      enrollmentStartDay: "2026-09-01",
      enrollmentEndDay: "2026-09-30",
      perLessonNetFee: 500,
      lessons: [lesson("l1", "2026-09-07")],
      studentId: "s1",
      makeupRequests,
    });
    expect(lines[0].estimated).toBe(false);
  });
});

describe("estimateBillableLessonCount — henüz program yokken PROJEKSİYON", () => {
  it("haftada 2 ders, 14 günlük dönem → 4 ders tahmini", () => {
    expect(estimateBillableLessonCount("2026-09-01", "2026-09-14", 2)).toBe(4);
  });

  it("haftada 1 ders, 30 günlük ay → ~4 ders tahmini", () => {
    expect(estimateBillableLessonCount("2026-09-01", "2026-09-30", 1)).toBe(4);
  });

  it("geçersiz/sıfır haftalık sıklıkta 0 döner", () => {
    expect(estimateBillableLessonCount("2026-09-01", "2026-09-30", 0)).toBe(0);
  });
});

describe("estimatePeriodBillingLines — kayıt önizlemesi (gerçek ders YOK)", () => {
  it("ilk kısa dönem + tam dönem + son kısa dönem için tahmini tutar üretir, estimated:true", () => {
    const lines = estimatePeriodBillingLines({
      enrollmentStartDay: "2026-09-15",
      enrollmentEndDay: "2026-11-20",
      perLessonNetFee: 500,
      weeklyLessonCount: 2,
    });
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line.estimated).toBe(true);
      expect(line.autoCalculatedAmount).toBe(line.billableLessonCount * 500);
      expect(line.autoCalculatedAmount).toBeGreaterThanOrEqual(0);
    }
  });

  it("negatif ders başı ücret reddedilir", () => {
    expect(() =>
      estimatePeriodBillingLines({
        enrollmentStartDay: "2026-09-01",
        enrollmentEndDay: "2026-09-30",
        perLessonNetFee: -1,
        weeklyLessonCount: 2,
      })
    ).toThrow();
  });
});

describe("computePeriodBillingPreview — TEK giriş noktası (kayıt önizlemesi + simülasyon)", () => {
  const previewBase = {
    enrollmentStartDay: "2026-09-15",
    enrollmentEndDay: "2026-09-29",
    perLessonNetFee: 500,
    studentId: "s1",
    makeupRequests: [] as { sourceLessonId: string; status: string }[],
    weeklyLessonCount: 2,
  };

  it("gerçek ders YOKSA tahmine düşer (estimated:true)", () => {
    const lines = computePeriodBillingPreview({ ...previewBase, lessons: [] });
    expect(lines[0].estimated).toBe(true);
  });

  it("gerçek ders VARSA kesin sayar (estimated:false), tahmini YOK SAYAR", () => {
    const lines = computePeriodBillingPreview({
      ...previewBase,
      lessons: [lesson("l1", "2026-09-15"), lesson("l2", "2026-09-17")],
    });
    expect(lines[0].estimated).toBe(false);
    expect(lines[0].billableLessonCount).toBe(2);
  });
});
