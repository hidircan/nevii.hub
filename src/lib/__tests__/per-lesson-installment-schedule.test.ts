import { describe, it, expect } from "vitest";
import { buildPerLessonInstallmentSchedule } from "../contracts";
import { computePeriodBillingLines, type BillableLessonCandidate } from "../period-lesson-billing";

function lesson(id: string, isoDay: string): BillableLessonCandidate {
  return { id, studentId: "s1", startAt: `${isoDay}T08:00:00.000Z`, type: "regular", status: "scheduled" };
}

describe("buildPerLessonInstallmentSchedule (P0-1D hazırlık — henüz createContract'a bağlı değil)", () => {
  it("örnek senaryo: ilk kısa dönem 4×500, tam dönem 8×500, son kısa dönem 4×500", () => {
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
      firstDueDate: "2026-09-15",
    });
    expect(schedule.map((s) => s.amount)).toEqual([2000, 4000, 2000]);
    expect(schedule.map((s) => s.sequence)).toEqual([1, 2, 3]);
    expect(schedule[0]!.dueDate).toBe("2026-09-15");
  });

  it("13) ilk dönem manuel düzeltilmişse yalnız o satırda net tutar kullanılır", () => {
    const billingLines = computePeriodBillingLines({
      enrollmentStartDay: "2026-09-01",
      enrollmentEndDay: "2026-10-31",
      perLessonNetFee: 500,
      lessons: [lesson("l1", "2026-09-07"), lesson("l2", "2026-10-05")],
      studentId: "s1",
      makeupRequests: [],
    });
    const schedule = buildPerLessonInstallmentSchedule({
      billingLines,
      firstPeriodManualNetAmount: 300,
      firstDueDate: "2026-09-01",
    });
    expect(schedule[0]!.amount).toBe(300);
    expect(schedule[1]!.amount).toBe(billingLines[1]!.autoCalculatedAmount);
  });

  it("16) manuel düzeltme YOKSA taksit toplamı motorun ürettiği toplamla birebir eşleşir", () => {
    const billingLines = computePeriodBillingLines({
      enrollmentStartDay: "2026-09-15",
      enrollmentEndDay: "2026-11-20",
      perLessonNetFee: 750,
      lessons: [lesson("l1", "2026-09-20"), lesson("l2", "2026-10-05"), lesson("l3", "2026-11-10")],
      studentId: "s1",
      makeupRequests: [],
    });
    const schedule = buildPerLessonInstallmentSchedule({ billingLines, firstDueDate: "2026-09-15" });
    const engineTotal = billingLines.reduce((s, l) => s + l.autoCalculatedAmount, 0);
    const scheduleTotal = schedule.reduce((s, r) => s + r.amount, 0);
    expect(scheduleTotal).toBe(engineTotal);
  });

  it("boş dönem listesi boş taksit listesi döner (hata fırlatmaz)", () => {
    expect(buildPerLessonInstallmentSchedule({ billingLines: [], firstDueDate: "2026-09-01" })).toEqual([]);
  });
});
