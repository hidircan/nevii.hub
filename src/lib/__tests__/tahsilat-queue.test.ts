import { describe, it, expect } from "vitest";
import { buildTahsilatQueue, daysOverdue, nextActionLabel } from "../tahsilat/queue";
import type { AppData, Payment, Student } from "../types";
import type { FollowUpCase } from "../tahsilat/cases";

const NOW = new Date(2026, 7, 10); // 2026-08-10

function makeStudent(overrides: Partial<Student> = {}): Student {
  return {
    id: "s1",
    name: "Test Öğrenci",
    email: "",
    phone: "",
    parentName: "Test Veli",
    parentPhone: "0555 000 0000",
    branchId: "erzene",
    instruments: ["Piyano"],
    teacherId: "t1",
    packageName: "",
    weeklyLessonCount: 1,
    monthlyFee: 0,
    active: true,
    notes: "",
    createdAt: "2026-01-01T00:00:00+03:00",
    ...overrides,
  };
}

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "p1",
    studentId: "s1",
    amount: 3000,
    paidAmount: 0,
    status: "overdue",
    dueDate: "2026-08-01T00:00:00+03:00",
    description: "Ağustos 2026 — Piyano",
    ...overrides,
  };
}

function makeCase(overrides: Partial<FollowUpCase> = {}): FollowUpCase {
  return {
    id: "case1",
    tenantId: "demo-tenant",
    paymentId: "p1",
    studentId: "s1",
    status: "draft",
    messageDraft: "",
    attributedAmount: 0,
    createdAt: "2026-08-01T00:00:00+03:00",
    updatedAt: "2026-08-01T00:00:00+03:00",
    ...overrides,
  };
}

function makeData(overrides: Partial<AppData> = {}): AppData {
  return {
    settings: {
      tenantId: "demo-tenant",
      name: "Test Okulu",
      shortName: "Test",
      city: "İzmir",
      website: "",
      email: "",
      phone: "",
      logoUrl: "",
      makeupWindowDays: 14,
      lessonDurationMinutes: 45,
      workingHours: { start: "09:00", end: "21:00" },
      workingDays: [1, 2, 3, 4, 5, 6],
      currency: "TRY",
      feeRoundingMode: "exact_minutes",
      branches: [],
    },
    teachers: [],
    students: [makeStudent()],
    rooms: [],
    lessons: [],
    lessonSeries: [],
    attendances: [],
    makeupRequests: [],
    payments: [],
    teacherFeeRules: [],
    teacherPayouts: [],
    ...overrides,
  };
}

describe("daysOverdue", () => {
  it("vade tarihinden bugüne geçen gün sayısını doğru hesaplar", () => {
    expect(daysOverdue("2026-08-01T00:00:00+03:00", NOW)).toBe(9);
  });

  it("vade tarihi bugünse 0 döner", () => {
    expect(daysOverdue("2026-08-10T00:00:00+03:00", NOW)).toBe(0);
  });

  it("vade tarihi gelecekteyse negatif değil 0 döner", () => {
    expect(daysOverdue("2026-09-01T00:00:00+03:00", NOW)).toBe(0);
  });
});

describe("nextActionLabel", () => {
  it("vaka yoksa veya taslaksa 'Taslağı onayla' döner", () => {
    expect(nextActionLabel(undefined)).toBe("Taslağı onayla");
    expect(nextActionLabel("draft")).toBe("Taslağı onayla");
  });

  it("onaylandıysa gönderim aksiyonu döner", () => {
    expect(nextActionLabel("approved")).toBe("Mesajı gönder");
  });

  it("gönderildiyse yanıt takibi döner", () => {
    expect(nextActionLabel("sent")).toBe("Yanıtı takip et");
  });

  it("yanıt geldiyse ödeme sonucu işaretleme döner", () => {
    expect(nextActionLabel("replied")).toBe("Ödeme sonucunu işaretle");
  });

  it("kaybedildiyse yeniden takip önerir", () => {
    expect(nextActionLabel("lost")).toBe("Yeniden takip başlat");
  });
});

describe("buildTahsilatQueue", () => {
  it("ödenmiş (paid) ödemeleri kuyruğa hiç almaz", () => {
    const data = makeData({ payments: [makePayment({ id: "p1", status: "paid" })] });
    const rows = buildTahsilatQueue(data, [], NOW);
    expect(rows).toHaveLength(0);
  });

  it("gecikmiş > kısmi > bekleyen sırasıyla önceliklendirir", () => {
    const data = makeData({
      payments: [
        makePayment({ id: "p-pending", status: "pending", dueDate: "2026-09-01T00:00:00+03:00" }),
        makePayment({ id: "p-partial", status: "partial", paidAmount: 1000 }),
        makePayment({ id: "p-overdue", status: "overdue" }),
      ],
    });
    const rows = buildTahsilatQueue(data, [], NOW);
    expect(rows.map((r) => r.paymentId)).toEqual(["p-overdue", "p-partial", "p-pending"]);
  });

  it("aynı öncelik kademesinde en çok geciken önce gelir", () => {
    const data = makeData({
      payments: [
        makePayment({ id: "p-recent", status: "overdue", dueDate: "2026-08-08T00:00:00+03:00" }), // 2 gün gecikmiş
        makePayment({ id: "p-old", status: "overdue", dueDate: "2026-07-20T00:00:00+03:00" }), // 21 gün gecikmiş
      ],
    });
    const rows = buildTahsilatQueue(data, [], NOW);
    expect(rows.map((r) => r.paymentId)).toEqual(["p-old", "p-recent"]);
  });

  it("gecikme günü eşitse kalan tutarı büyük olan önce gelir", () => {
    const data = makeData({
      payments: [
        makePayment({ id: "p-small", status: "overdue", amount: 1000 }),
        makePayment({ id: "p-big", status: "overdue", amount: 5000 }),
      ],
    });
    const rows = buildTahsilatQueue(data, [], NOW);
    expect(rows.map((r) => r.paymentId)).toEqual(["p-big", "p-small"]);
  });

  it("studentId filtresi yalnızca o öğrencinin kaydını döner", () => {
    const data = makeData({
      students: [makeStudent({ id: "s1" }), makeStudent({ id: "s2" })],
      payments: [
        makePayment({ id: "p1", studentId: "s1" }),
        makePayment({ id: "p2", studentId: "s2" }),
      ],
    });
    const rows = buildTahsilatQueue(data, [], NOW, "s1");
    expect(rows.map((r) => r.paymentId)).toEqual(["p1"]);
  });

  it("açık (paid/lost olmayan) vaka varsa onun durumunu ve sonraki aksiyonu yansıtır", () => {
    const data = makeData({ payments: [makePayment({ id: "p1" })] });
    const cases = [makeCase({ id: "c1", paymentId: "p1", status: "sent" })];
    const rows = buildTahsilatQueue(data, cases, NOW);
    expect(rows[0].caseId).toBe("c1");
    expect(rows[0].caseStatus).toBe("sent");
    expect(rows[0].nextAction).toBe("Yanıtı takip et");
  });

  it("en son vaka 'lost' ise açık vaka yok sayılır ve taslak durumuna döner (yeniden takip)", () => {
    const data = makeData({ payments: [makePayment({ id: "p1" })] });
    const cases = [makeCase({ id: "c1", paymentId: "p1", status: "lost" })];
    const rows = buildTahsilatQueue(data, cases, NOW);
    expect(rows[0].caseId).toBeUndefined();
    expect(rows[0].caseStatus).toBe("draft");
    expect(rows[0].nextAction).toBe("Taslağı onayla");
  });

  it("başka ödemenin vakası bu satırı etkilemez", () => {
    const data = makeData({ payments: [makePayment({ id: "p1" })] });
    const cases = [makeCase({ id: "c-other", paymentId: "p-other", status: "sent" })];
    const rows = buildTahsilatQueue(data, cases, NOW);
    expect(rows[0].caseId).toBeUndefined();
    expect(rows[0].caseStatus).toBe("draft");
  });

  it("öğrenci bulunamazsa uydurma isim üretmez, güvenli bir yer tutucu döner", () => {
    const data = makeData({ students: [], payments: [makePayment({ id: "p1", studentId: "does-not-exist" })] });
    const rows = buildTahsilatQueue(data, [], NOW);
    expect(rows[0].studentName).toBe("Öğrenci bulunamadı");
  });
});
