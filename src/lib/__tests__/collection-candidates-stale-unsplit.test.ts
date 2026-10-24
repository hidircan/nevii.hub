/**
 * 2026-10-24 — tahsilat adayları ve "Ödenmiş taksit sayısı" (Ediz A. H. vakası, sentetik veri).
 *
 * Kök neden: kayıt ilk tahsilatı sonradan tek aya düzeltilmiş ama "takip eden ayı da ekle" işareti açık kalmıştı.
 * Sözleşme Ekim'i ayrı taksitle borçlandırdığı hâlde işaret Ekim'e 0 TL'lik bir "unsplit" pay ekliyordu:
 * Ekim'de iki aday → tahsilat engeli; sayaç Ekim'i ödenmiş sayıyordu (1 yerine 2).
 */
import { describe, it, expect } from "vitest";
import {
  resolveContractPlanForMonth,
  paidInstallmentCount,
  type CalendarPlanContract,
  type CalendarPlanInstallment,
} from "../attendance-calendar-plan";
import { paidInstallmentCountsByStudent } from "../payment-profile";
import { buildPaymentMonthView } from "../payment-month-view";

const ctr = (id: string, status: CalendarPlanContract["status"], start = "2026-09-01"): CalendarPlanContract => ({
  id,
  contractNumber: `NO-${id}`,
  status,
  enrollmentStartDate: start,
  enrollmentEndDate: "2027-06-30",
});

const row = (over: Partial<CalendarPlanInstallment> & { id: string }): CalendarPlanInstallment => ({
  contractId: "v1",
  installmentSequence: 2,
  amount: 7950,
  paidAmount: 0,
  dueDate: "2026-10-15T00:00:00.000Z",
  status: "pending",
  source: "contract",
  ...over,
});

/** Ödenmiş ilk tahsilat: tek ay etiketi + açık kalmış "takip eden ay" işareti. */
const staleFirst = (contractId = "v1") =>
  row({
    id: "first",
    contractId,
    installmentSequence: 1,
    paidAmount: 7950,
    status: "paid",
    dueDate: "2026-08-31T00:00:00.000Z",
    source: "registration_first_payment",
    installmentPeriodLabel: "19–30 Eylül 2026",
    firstCollectionIncludesNextMonth: true,
  });

const v1Ekim = row({ id: "v1-ekim", installmentPeriodLabel: "Ekim 2026" });
const v3Rows = [
  row({ id: "v3-eylul", contractId: "v3", installmentSequence: 1, amount: 3975, dueDate: "2026-09-15T00:00:00.000Z", installmentPeriodLabel: "Eylül 2026" }),
  row({ id: "v3-ekim", contractId: "v3", installmentSequence: 2, installmentPeriodLabel: "Ekim 2026" }),
];
const plan = (contracts: CalendarPlanContract[], installments: CalendarPlanInstallment[], month = 10) =>
  resolveContractPlanForMonth({ contracts, installments, year: 2026, month });

describe("tahsilat adayı", () => {
  it("revize edilmiş iki sözleşme + bir geçerli sözleşme → Ekim'de tek aday (engel yok)", () => {
    const p = plan(
      [ctr("v1", "superseded", "2026-09-19"), ctr("v2", "superseded", "2026-09-19"), ctr("v3", "generated")],
      [staleFirst(), v1Ekim, row({ id: "v2-ekim", contractId: "v2", amount: 3975 }), ...v3Rows]
    );
    expect(p.state).toBe("ok");
    if (p.state !== "ok") return;
    expect(p.paymentIds).toEqual(["v3-ekim"]);
    expect(p.openPaymentIds).toEqual(["v3-ekim"]);
  });

  it("kök neden: aynı sözleşmenin Ekim taksiti varken ilk tahsilatın bayat 'takip eden ay' payı aday olmaz", () => {
    const p = plan([ctr("v1", "signed", "2026-09-19")], [staleFirst(), v1Ekim]);
    expect(p.state).toBe("ok");
    if (p.state !== "ok") return;
    expect(p.paymentIds).toEqual(["v1-ekim"]);
    expect(p.openPaymentIds).toEqual(["v1-ekim"]);
    expect(p.remaining).toBe(7950);
  });

  it("işaret geçerliyse (sözleşmede o ayın kendi taksiti YOK) ay ilk tahsilatla karşılanmış kalır", () => {
    const p = plan([ctr("v1", "signed")], [staleFirst(), row({ id: "kasim", installmentSequence: 2, installmentPeriodLabel: "Kasım 2026" })]);
    expect(p.state).toBe("ok");
    if (p.state !== "ok") return;
    expect(p.paymentIds).toEqual(["first"]);
    expect(p.openPaymentIds).toEqual([]);
    expect(p.remaining).toBe(0);
  });

  it("gerçekten iki açık taksit → ikisi de aday kalır (seçim zorunluluğu korunur)", () => {
    const p = plan([ctr("v1", "signed")], [v1Ekim, row({ id: "ekim-ek", installmentSequence: 3, amount: 1000, installmentPeriodLabel: "Ekim 2026" })]);
    expect(p.state).toBe("ok");
    if (p.state !== "ok") return;
    expect(p.openPaymentIds).toEqual(["v1-ekim", "ekim-ek"]);
  });

  it("tamamen ödenmiş ve iptal (voided) taksit aday olmaz; tutarlar korunur", () => {
    const p = plan(
      [ctr("v1", "signed")],
      [
        v1Ekim,
        row({ id: "ekim-odendi", installmentSequence: 3, amount: 1000, paidAmount: 1000, status: "paid", installmentPeriodLabel: "Ekim 2026" }),
        row({ id: "ekim-void", installmentSequence: 4, amount: 500, status: "voided", installmentPeriodLabel: "Ekim 2026" }),
      ]
    );
    expect(p.state).toBe("ok");
    if (p.state !== "ok") return;
    expect(p.paymentIds).toEqual(["v1-ekim", "ekim-odendi"]);
    expect(p.openPaymentIds).toEqual(["v1-ekim"]);
    expect(p.amount).toBe(8950);
    expect(p.paidAmount).toBe(1000);
  });

  it("iptal edilmiş sözleşmeden kalan ÖDENMİŞ tahsilat kaybolmaz: geçmiş ve tahsilat toplamında kalır", () => {
    const view = buildPaymentMonthView(
      [staleFirst(), v1Ekim, ...v3Rows].map((p) => ({ ...p, studentId: "s1" })) as never,
      { month: "2026-09", todayYmd: "2026-10-24", terminalContractIds: new Set(["v1"]), studentName: () => "Öğrenci" }
    );
    expect(view.rows.find((r) => r.id === "first")?.collected).toBe(7950);
    expect(view.summary.collected).toBe(7950);
  });
});

describe("Ödenmiş taksit sayısı (öğrencinin tüm geçmişi, benzersiz kapanmış dönem)", () => {
  it("Ediz vakası: bayat 'takip eden ay' Ekim'i ödenmiş saymaz → 1 (eskiden 2)", () => {
    expect(paidInstallmentCount([staleFirst(), v1Ekim, ...v3Rows])).toBe(1);
  });

  it("işaret geçerliyse birleşik ilk tahsilat iki dönem sayılır", () => {
    expect(paidInstallmentCount([staleFirst()])).toBe(2);
  });

  it("iki kısmi tahsilat tek taksidi kapatır → 1; kısmi kalan taksit 0", () => {
    // Satırda kısmi tahsilatlar toplanır (paidAmount); işlem sayısı değil, kapanan dönem sayılır.
    expect(paidInstallmentCount([row({ id: "a", paidAmount: 4000 + 3950, status: "paid" })])).toBe(1);
    expect(paidInstallmentCount([row({ id: "b", paidAmount: 4000, status: "partial" })])).toBe(0);
  });

  it("tek tahsilat iki döneme dağıtılmışsa (kırılım) iki dönem sayılır", () => {
    const combined = row({
      id: "c",
      installmentSequence: 1,
      amount: 11925,
      paidAmount: 11925,
      status: "paid",
      installmentBreakdown: [
        { periodLabel: "19–30 Eylül 2026", amount: 3975 },
        { periodLabel: "Ekim 2026", amount: 7950 },
      ],
    });
    expect(paidInstallmentCount([combined])).toBe(2);
  });

  it("iade/ters kayıt sonrası (tahsilat geri alındı) ve iptal satırı sayılmaz", () => {
    expect(paidInstallmentCount([row({ id: "geri", paidAmount: 0, status: "pending" })])).toBe(0);
    expect(paidInstallmentCount([row({ id: "void", paidAmount: 7950, status: "voided" })])).toBe(0);
  });

  it("başka öğrencinin satırları karışmaz", () => {
    const counts = paidInstallmentCountsByStudent([
      { ...staleFirst(), studentId: "s1" },
      { ...v1Ekim, studentId: "s1" },
      { ...row({ id: "x", contractId: "other", paidAmount: 7950, status: "paid" }), studentId: "s2" },
    ]);
    expect(counts).toEqual({ s1: 1, s2: 1 });
  });
});
