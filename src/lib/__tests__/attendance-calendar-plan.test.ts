/**
 * P0 (2026-09-09) — Yoklama Takvimi ay tutarı SÖZLEŞME SNAPSHOT'INDAN gelir.
 *
 * Bu dosya saf çözümleyiciyi (`resolveContractPlanForMonth`) izole fixture'la
 * kilitler: takvim hiçbir koşulda tutarı yeniden HESAPLAMAZ, yalnız
 * sözleşmenin dondurulmuş plan satırlarını okur.
 */
import { describe, it, expect } from "vitest";
import {
  resolveContractPlanForMonth,
  contractCoversMonth,
  isPlanEligibleContractStatus,
  type CalendarPlanContract,
  type CalendarPlanInstallment,
} from "../attendance-calendar-plan";
import type { ContractStatus } from "../types";

function contract(over: Partial<CalendarPlanContract> = {}): CalendarPlanContract {
  return {
    id: "ctr1",
    contractNumber: "2026-2027-0001",
    status: "signed",
    enrollmentStartDate: "2026-10-01",
    enrollmentEndDate: "2027-01-01",
    ...over,
  };
}

function installment(over: Partial<CalendarPlanInstallment> = {}): CalendarPlanInstallment {
  return {
    id: "pay1",
    contractId: "ctr1",
    installmentSequence: 1,
    amount: 5950,
    paidAmount: 0,
    dueDate: "2026-11-15T00:00:00.000Z",
    status: "pending",
    ...over,
  };
}

describe("Senaryo 1 — normal 8 dersli ay: plan 5.950 TL → takvim 5.950 TL", () => {
  it("dondurulmuş plan tutarını AYNEN döner", () => {
    const plan = resolveContractPlanForMonth({
      contracts: [contract()],
      installments: [installment({ amount: 5950, periodLabel: "Kasım 2026" })],
      year: 2026,
      month: 11,
    });
    expect(plan.state).toBe("ok");
    if (plan.state !== "ok") return;
    expect(plan.amount).toBe(5950);
    expect(plan.remaining).toBe(5950);
    expect(plan.status).toBe("pending");
    expect(plan.periodLabel).toBe("Kasım 2026");
  });
});

describe("Senaryo 2 — 9 dersli dönem: snapshot 6.694 TL → takvim 6.694 TL", () => {
  it("takvim kendi formülüyle (9 × 744 = 6.696) BAŞKA bir rakam üretmez", () => {
    const plan = resolveContractPlanForMonth({
      contracts: [contract()],
      installments: [
        installment({ amount: 6694, dueDate: "2026-10-01T00:00:00.000Z", periodLabel: "Ekim 2026" }),
      ],
      year: 2026,
      month: 10,
    });
    expect(plan.state).toBe("ok");
    if (plan.state !== "ok") return;
    expect(plan.amount).toBe(6694);
    expect(plan.amount).not.toBe(6696);
  });
});

describe("Senaryo 3 — sözleşme sonrası ders sayısı değişse de snapshot korunur", () => {
  it("çözümleyici ders sayısını GİRDİ olarak bile almaz", () => {
    // Ders sayısı çözümleyicinin imzasında YOKTUR; bu testin kendisi,
    // takvimin ders sayısından tutar türetmesinin imkânsız olduğunu belgeler.
    const rows = [installment({ amount: 5950, periodLabel: "Kasım 2026" })];
    const first = resolveContractPlanForMonth({ contracts: [contract()], installments: rows, year: 2026, month: 11 });
    // Aynı plan satırı, "ders sayısı değişti" senaryosunda da AYNI tutarı verir.
    const second = resolveContractPlanForMonth({ contracts: [contract()], installments: rows, year: 2026, month: 11 });
    expect(first).toEqual(second);
    if (first.state !== "ok") return;
    expect(first.amount).toBe(5950);
  });
});

describe("Senaryo 4 — plan satırı olmayan ay", () => {
  it("aktif sözleşme var ama o ayın satırı yoksa AÇIK durum döner", () => {
    const plan = resolveContractPlanForMonth({
      contracts: [contract()],
      installments: [installment({ dueDate: "2026-11-15T00:00:00.000Z" })],
      year: 2026,
      month: 12, // Aralık satırı YOK
    });
    expect(plan.state).toBe("no_installment_for_month");
    if (plan.state !== "no_installment_for_month") return;
    expect(plan.message).toBe("Bu ay için aktif ödeme planı bulunmuyor.");
  });

  it("hiç aktif sözleşme yoksa AÇIK durum döner — uydurma/sıfır tutar YOK", () => {
    const plan = resolveContractPlanForMonth({ contracts: [], installments: [], year: 2026, month: 11 });
    expect(plan.state).toBe("no_active_contract");
    if (plan.state !== "no_active_contract") return;
    expect(plan.message).toBe("Bu ay için aktif ödeme planı bulunmuyor.");
    // "amount" alanı bu durumda TİPTE YOKTUR — çağıran sıfır/önceki ay
    // tutarı gösteremez, derleyici zorlar.
    expect("amount" in plan).toBe(false);
  });

  it("sözleşmenin kapsamadığı ay (tarih dışı) plan kaynağı olamaz", () => {
    const plan = resolveContractPlanForMonth({
      contracts: [contract({ enrollmentStartDate: "2026-10-01", enrollmentEndDate: "2026-12-31" })],
      installments: [installment({ dueDate: "2027-02-15T00:00:00.000Z" })],
      year: 2027,
      month: 2,
    });
    expect(plan.state).toBe("no_active_contract");
  });
});

describe("Senaryo 5 — tahsilat sonrası ödenen / kalan / durum", () => {
  it("kısmi ödeme: partial + kalan borç doğru", () => {
    const plan = resolveContractPlanForMonth({
      contracts: [contract()],
      installments: [installment({ amount: 5950, paidAmount: 2000 })],
      year: 2026,
      month: 11,
    });
    if (plan.state !== "ok") throw new Error("ok bekleniyordu");
    expect(plan.paidAmount).toBe(2000);
    expect(plan.remaining).toBe(3950);
    expect(plan.status).toBe("partial");
  });

  it("tam ödeme: paid + kalan 0", () => {
    const plan = resolveContractPlanForMonth({
      contracts: [contract()],
      installments: [installment({ amount: 5950, paidAmount: 5950, status: "paid" })],
      year: 2026,
      month: 11,
    });
    if (plan.state !== "ok") throw new Error("ok bekleniyordu");
    expect(plan.remaining).toBe(0);
    expect(plan.status).toBe("paid");
  });

  it("fazla ödeme kalan borcu NEGATİFE düşürmez", () => {
    const plan = resolveContractPlanForMonth({
      contracts: [contract()],
      installments: [installment({ amount: 5950, paidAmount: 7000 })],
      year: 2026,
      month: 11,
    });
    if (plan.state !== "ok") throw new Error("ok bekleniyordu");
    expect(plan.remaining).toBe(0);
    expect(plan.status).toBe("paid");
  });

  it("vadesi geçmiş ve hiç ödenmemiş satır overdue döner", () => {
    const plan = resolveContractPlanForMonth({
      contracts: [contract()],
      installments: [installment({ dueDate: "2026-11-15T00:00:00.000Z" })],
      year: 2026,
      month: 11,
      now: new Date("2026-12-01T00:00:00.000Z"),
    });
    if (plan.state !== "ok") throw new Error("ok bekleniyordu");
    expect(plan.status).toBe("overdue");
  });
});

describe("Senaryo 6 — taslak / iptal / superseded sözleşme kaynak OLAMAZ", () => {
  const notEligible: ContractStatus[] = ["draft", "cancelled", "superseded"];
  for (const status of notEligible) {
    it(`${status} sözleşme ödeme kaynağı olarak seçilmez`, () => {
      const plan = resolveContractPlanForMonth({
        contracts: [contract({ status })],
        installments: [installment()],
        year: 2026,
        month: 11,
      });
      expect(plan.state).toBe("no_active_contract");
    });
  }

  const eligible: ContractStatus[] = ["generated", "printed", "wet_signature_pending", "signed", "recorded"];
  for (const status of eligible) {
    it(`${status} sözleşme geçerli kaynaktır`, () => {
      expect(isPlanEligibleContractStatus(status)).toBe(true);
    });
  }

  it("iptal edilmiş sözleşme varken AKTİF olan seçilir (iptal olan yok sayılır)", () => {
    const plan = resolveContractPlanForMonth({
      contracts: [
        contract({ id: "eski", contractNumber: "0001", status: "cancelled" }),
        contract({ id: "yeni", contractNumber: "0002", status: "signed" }),
      ],
      installments: [installment({ contractId: "yeni", amount: 5950 })],
      year: 2026,
      month: 11,
    });
    if (plan.state !== "ok") throw new Error("ok bekleniyordu");
    expect(plan.contractId).toBe("yeni");
    expect(plan.amount).toBe(5950);
  });
});

describe("Çakışma — birden fazla aktif sözleşme aynı ayı kapsıyorsa SESSİZ seçim yok", () => {
  it("açık yönetici durumu döner, tutar üretmez", () => {
    const plan = resolveContractPlanForMonth({
      contracts: [
        contract({ id: "a", contractNumber: "0001", status: "signed" }),
        contract({ id: "b", contractNumber: "0002", status: "recorded" }),
      ],
      installments: [installment({ contractId: "a", amount: 5950 }), installment({ contractId: "b", amount: 7000 })],
      year: 2026,
      month: 11,
    });
    expect(plan.state).toBe("multiple_active_contracts");
    if (plan.state !== "multiple_active_contracts") return;
    expect(plan.contractNumbers).toEqual(["0001", "0002"]);
    expect("amount" in plan).toBe(false);
  });
});

describe("Aynı ayda birden fazla plan satırı — dondurulmuş tutarlar TOPLANIR", () => {
  it("iki satır varsa toplamı döner (yeni formül değil, sadece toplama)", () => {
    const plan = resolveContractPlanForMonth({
      contracts: [contract()],
      installments: [
        installment({ id: "p1", installmentSequence: 1, amount: 5950, paidAmount: 5950, dueDate: "2026-11-05T00:00:00.000Z" }),
        installment({ id: "p2", installmentSequence: 2, amount: 1000, paidAmount: 0, dueDate: "2026-11-20T00:00:00.000Z" }),
      ],
      year: 2026,
      month: 11,
    });
    if (plan.state !== "ok") throw new Error("ok bekleniyordu");
    expect(plan.amount).toBe(6950);
    expect(plan.paidAmount).toBe(5950);
    expect(plan.remaining).toBe(1000);
    expect(plan.status).toBe("partial");
    expect(plan.installmentSequences).toEqual([1, 2]);
    // Birden fazla satırda tek bir dönem etiketi iddia EDİLMEZ.
    expect(plan.periodLabel).toBeUndefined();
  });
});

describe("contractCoversMonth — sınırlar dahil", () => {
  it("başlangıç ve bitiş ayları DAHİLDİR", () => {
    const c = contract({ enrollmentStartDate: "2026-10-01", enrollmentEndDate: "2027-01-01" });
    expect(contractCoversMonth(c, "2026-09")).toBe(false);
    expect(contractCoversMonth(c, "2026-10")).toBe(true);
    expect(contractCoversMonth(c, "2026-12")).toBe(true);
    expect(contractCoversMonth(c, "2027-01")).toBe(true);
    expect(contractCoversMonth(c, "2027-02")).toBe(false);
  });

  it("tam ISO datetime de kabul edilir (yalnız yyyy-MM kullanılır)", () => {
    const c = contract({
      enrollmentStartDate: "2026-10-01T00:00:00.000Z",
      enrollmentEndDate: "2027-01-01T00:00:00.000Z",
    });
    expect(contractCoversMonth(c, "2026-11")).toBe(true);
  });
});
