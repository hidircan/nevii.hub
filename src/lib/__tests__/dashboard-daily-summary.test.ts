/**
 * C — Günlük Özet: rol/şube farkındalıklı hesap katmanı.
 *
 * Panel artık her şeyi sayfa içinde `filter` ile hesaplamıyor; tek saf
 * fonksiyondan türüyor. Bu test şube süzgecinin GERÇEKTEN süzdüğünü ve
 * "aksiyon" ile "bilgi" ayrımının korunduğunu doğrular.
 */
import { describe, it, expect } from "vitest";
import { buildDashboardSummary, type ContractSummaryInput } from "../dashboard/daily-summary";
import type { AppData } from "../types";

const TODAY = "2026-09-22"; // Salı — Güz döneminde açık gün

function lesson(id: string, branchId: string, studentId: string, hhmm: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    studentId,
    teacherId: "t1",
    roomId: "r1",
    branchId,
    instrument: "Piyano",
    startAt: `${TODAY}T${hhmm}:00.000Z`,
    endAt: `${TODAY}T${hhmm}:40.000Z`,
    type: "regular",
    status: "scheduled",
    ...extra,
  };
}

function payment(id: string, studentId: string, dueDate: string, status: string, amount = 1000, paidAmount = 0) {
  return { id, studentId, amount, paidAmount, dueDate, status, description: "Taksit" };
}

function buildData(): AppData {
  return {
    settings: {
      name: "Test",
      lessonDurationMinutes: 40,
      branches: [
        { id: "evka3", name: "Evka 3", shortName: "Evka 3" },
        { id: "erzene", name: "Erzene", shortName: "Erzene" },
      ],
    },
    teachers: [
      { id: "t1", name: "Öğretmen 1", branchId: "evka3", instruments: ["Piyano"], active: true, maxDailyLessons: 8 },
      { id: "t2", name: "Öğretmen 2", branchId: "erzene", instruments: ["Gitar"], active: true, maxDailyLessons: 8 },
    ],
    students: [
      { id: "s1", name: "Evka Öğrencisi", branchId: "evka3", instruments: ["Piyano"], teacherId: "t1", active: true },
      { id: "s2", name: "Erzene Öğrencisi", branchId: "erzene", instruments: ["Gitar"], teacherId: "t2", active: true },
    ],
    rooms: [
      { id: "r1", name: "Stüdyo 1", branchId: "evka3", instruments: ["Piyano"] },
      { id: "r2", name: "Stüdyo 2", branchId: "erzene", instruments: ["Gitar"] },
    ],
    lessons: [lesson("l1", "evka3", "s1", "10:00"), lesson("l2", "erzene", "s2", "11:00")],
    lessonSeries: [],
    attendances: [],
    makeupRequests: [],
    payments: [
      payment("p1", "s1", "2026-09-01", "overdue"),
      payment("p2", "s2", "2026-09-25", "pending"),
      payment("p3", "s1", "2026-09-05", "paid", 500, 500),
    ],
    teacherFeeRules: [],
    teacherPayouts: [],
  } as unknown as AppData;
}

const contracts = new Map<string, ContractSummaryInput>([
  ["s1", { studentId: "s1", status: "generated", enrollmentEndDate: "2027-06-30" }],
  // s2 bilinçli olarak YOK → "sözleşmesi eksik" aksiyonu üretmeli.
]);

describe("şube süzgeci gerçekten süzer", () => {
  it("Evka 3 seçildiğinde yalnız o şubenin dersi/öğrencisi/ödemesi sayılır", () => {
    const s = buildDashboardSummary(buildData(), { branchId: "evka3", today: TODAY }, contracts);
    expect(s.counts.todayLessons).toBe(1);
    expect(s.counts.activeStudents).toBe(1);
    expect(s.todayLessons[0]!.studentName).toBe("Evka Öğrencisi");
    // Gecikmiş ödeme Evka öğrencisine ait → görünmeli
    expect(s.overdue).toHaveLength(1);
    expect(s.overdue[0]!.studentName).toBe("Evka Öğrencisi");
  });

  it("Erzene seçildiğinde Evka'nın gecikmiş ödemesi GÖRÜNMEZ", () => {
    const s = buildDashboardSummary(buildData(), { branchId: "erzene", today: TODAY }, contracts);
    expect(s.counts.todayLessons).toBe(1);
    expect(s.overdue).toHaveLength(0);
    expect(s.upcomingDue).toHaveLength(1); // 25 Eylül vadesi
  });

  it("'all' seçildiğinde iki şube de sayılır", () => {
    const s = buildDashboardSummary(buildData(), { branchId: "all", today: TODAY }, contracts);
    expect(s.counts.todayLessons).toBe(2);
    expect(s.counts.activeStudents).toBe(2);
    expect(s.branchLoad).toHaveLength(2);
  });
});

describe("aksiyon / bilgi ayrımı", () => {
  it("gecikmiş tahsilat ve sözleşmesizlik AKSİYON'dur, yaklaşan vade BİLGİ'dir", () => {
    const s = buildDashboardSummary(buildData(), { branchId: "all", today: TODAY }, contracts);
    const actionKeys = s.actions.map((a) => a.key);
    expect(actionKeys).toContain("overdue");
    expect(actionKeys).toContain("contracts");

    const signalKeys = s.signals.map((x) => x.key);
    expect(signalKeys).toContain("upcoming-due");
    expect(actionKeys).not.toContain("upcoming-due");
  });

  it("aksiyonlar ağırlığa göre sıralı — para en üstte", () => {
    const s = buildDashboardSummary(buildData(), { branchId: "all", today: TODAY }, contracts);
    expect(s.actions[0]!.key).toBe("overdue");
    const weights = s.actions.map((a) => a.weight);
    expect(weights).toEqual([...weights].sort((a, b) => b - a));
  });

  it("hiç sorun yoksa aksiyon listesi boştur (her şey uyarı rengine boyanmaz)", () => {
    const data = buildData();
    data.payments = [];
    const full = new Map<string, ContractSummaryInput>([
      ["s1", { studentId: "s1", status: "generated", enrollmentEndDate: "2027-06-30" }],
      ["s2", { studentId: "s2", status: "generated", enrollmentEndDate: "2027-06-30" }],
    ]);
    const s = buildDashboardSummary(data, { branchId: "all", today: TODAY }, full);
    expect(s.actions).toHaveLength(0);
  });
});

describe("sözleşme izleme", () => {
  it("sözleşmesi olmayan, süresi geçmiş ve yakında bitecek ayrı ayrı sınıflanır", () => {
    const withStates = new Map<string, ContractSummaryInput>([
      ["s1", { studentId: "s1", status: "generated", enrollmentEndDate: "2026-09-10" }], // geçmiş
      ["s2", { studentId: "s2", status: "generated", enrollmentEndDate: "2026-10-05" }], // 13 gün → yakında
    ]);
    const s = buildDashboardSummary(buildData(), { branchId: "all", today: TODAY }, withStates);
    const byId = Object.fromEntries(s.contractWatch.map((c) => [c.studentId, c.state]));
    expect(byId.s1).toBe("expired");
    expect(byId.s2).toBe("expiring");
    // Süresi geçmiş üstte sıralanır (aksiyon önceliği)
    expect(s.contractWatch[0]!.state).toBe("expired");
  });

  it("iptal edilmiş sözleşme 'sözleşmesi yok' sayılır", () => {
    const cancelled = new Map<string, ContractSummaryInput>([
      ["s1", { studentId: "s1", status: "cancelled", enrollmentEndDate: "2027-06-30" }],
    ]);
    const s = buildDashboardSummary(buildData(), { branchId: "evka3", today: TODAY }, cancelled);
    expect(s.contractWatch[0]!.state).toBe("missing");
  });
});

describe("para rakamları tek kaynaktan gelir", () => {
  it("bu ay tahsil edilen, açık bakiye ve gecikmiş ayrı ayrı doğrudur", () => {
    const data = buildData();
    data.payments = [
      payment("p1", "s1", "2026-09-01", "overdue", 1000, 0),
      payment("p2", "s1", "2026-09-25", "pending", 2000, 500),
      { ...payment("p3", "s1", "2026-09-05", "paid", 800, 800), paidAt: "2026-09-05T10:00:00.000Z" },
    ] as AppData["payments"];
    const s = buildDashboardSummary(data, { branchId: "evka3", today: TODAY }, contracts);
    expect(s.money.overdueTotal).toBe(1000);
    expect(s.money.outstandingTotal).toBe(1000 + 1500);
    expect(s.money.collectedThisMonth).toBe(800);
  });
});
