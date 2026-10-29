/**
 * UAT 2026-09-24 (A) — öğrenci "Toplam tahakkuk" kartı iptal edilmiş / yenilemeyle
 * yerini bırakmış sözleşmenin tutarını güncel sözleşmeye EKLEMEZ; gerçekleşmiş
 * tahsilatlar ise hiçbir senaryoda kaybolmaz.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { computeStudentPaymentSummary } from "../payment-profile";
import type { Payment } from "../types";

function pay(over: Partial<Payment>): Payment {
  return { id: over.id ?? "p", studentId: "s1", amount: 0, paidAmount: 0, status: "pending", dueDate: over.status === "overdue" ? "2026-09-05" : "2026-10-05", description: "", ...over };
}

// 2026-10-20 — "gecikmiş" artık vade gününden türetilir (payments/status.ts); sabit fixture tarihleri için saat sabit.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-20T09:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});
const c = (id: string, status: string, versionNumber = 1) => ({ id, status, versionNumber, contractNumber: `NO-${id}` });

describe("computeStudentPaymentSummary — sözleşme farkındalığı", () => {
  it("aktif tek sözleşme: sözleşme tahakkuku = taksit toplamı", () => {
    const s = computeStudentPaymentSummary(
      [pay({ id: "a1", contractId: "A", amount: 6000, paidAmount: 6000, status: "paid" }), pay({ id: "a2", contractId: "A", amount: 6000 })],
      [c("A", "signed")]
    );
    expect(s.currentContractBilled).toBe(12000);
    expect(s.currentContractNumber).toBe("NO-A");
    expect(s.totalBilled).toBe(12000);
    expect(s.remaining).toBe(6000);
  });

  it("iptal edilen eski sözleşme + yeni sözleşme: eski tutar ikinci kez eklenmez, eski tahsilat korunur", () => {
    const s = computeStudentPaymentSummary(
      [
        pay({ id: "o1", contractId: "OLD", amount: 7000, paidAmount: 7000, status: "paid" }),
        pay({ id: "o2", contractId: "OLD", amount: 7000, status: "overdue" }),
        pay({ id: "n1", contractId: "NEW", amount: 6000 }),
        pay({ id: "n2", contractId: "NEW", amount: 6000 }),
      ],
      [c("OLD", "cancelled"), c("NEW", "signed")]
    );
    expect(s.currentContractBilled).toBe(12000);
    expect(s.totalCollected).toBe(7000); // gerçekleşmiş tahsilat silinmez
    expect(s.totalBilled).toBe(7000 + 12000); // eski sözleşmeden yalnız tahsil edilen kısım
    expect(s.remaining).toBe(12000); // eski ödenmemiş taksit borç değil
    expect(s.overdueRemaining).toBe(0);
    expect(s.totalBilled).toBe(s.totalCollected + s.remaining);
  });

  it("yenileme (superseded → v2): güncel sözleşme v2", () => {
    const s = computeStudentPaymentSummary(
      [pay({ id: "v1", contractId: "V1", amount: 5000 }), pay({ id: "v2", contractId: "V2", amount: 5500 })],
      [c("V1", "superseded", 1), c("V2", "generated", 2)]
    );
    expect(s.currentContractBilled).toBe(5500);
    expect(s.remaining).toBe(5500);
  });

  it("sözleşmesiz öğrenci: kart boş durum (null), manuel/ders bazlı borç kalan borçta görünür", () => {
    const s = computeStudentPaymentSummary([pay({ id: "m", amount: 800, source: "lesson_ops" })], []);
    expect(s.currentContractBilled).toBeNull();
    expect(s.remaining).toBe(800);
  });

  it("tümü iptal: aktif sözleşme yok → null, eski tahsilat yine görünür", () => {
    const s = computeStudentPaymentSummary([pay({ id: "x", contractId: "X", amount: 4000, paidAmount: 1000, status: "partial" })], [c("X", "cancelled")]);
    expect(s.currentContractBilled).toBeNull();
    expect(s.totalCollected).toBe(1000);
    expect(s.remaining).toBe(0);
  });

  it("sözleşme listesi verilmezse eski davranış (geriye uyum)", () => {
    const s = computeStudentPaymentSummary([pay({ id: "y", contractId: "Y", amount: 4000 })]);
    expect(s.totalBilled).toBe(4000);
    expect(s.currentContractBilled).toBeNull();
  });
});
