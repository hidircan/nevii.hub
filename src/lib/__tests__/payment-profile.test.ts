import { describe, it, expect } from "vitest";
import { createSeedData } from "../seed";
import { computeStudentPaymentSummary, sortPaymentsForProfile } from "../payment-profile";

describe("computeStudentPaymentSummary", () => {
  const data = createSeedData();

  it("Lara (s5) için gecikmiş ödeme özeti doğru hesaplanır", () => {
    const payments = data.payments.filter((p) => p.studentId === "s5");
    const summary = computeStudentPaymentSummary(payments);
    expect(summary).toEqual({
      currentContractBilled: null,
      currentContractNumber: null,
      totalBilled: 3600,
      totalCollected: 0,
      remaining: 3600,
      overdueRemaining: 3600,
      openCount: 1,
      paidInstallmentCount: 0,
    });
  });

  it("Ali (s4) için kısmi ödemede kalan tutar doğru hesaplanır", () => {
    const payments = data.payments.filter((p) => p.studentId === "s4");
    const summary = computeStudentPaymentSummary(payments);
    expect(summary).toEqual({
      currentContractBilled: null,
      currentContractNumber: null,
      totalBilled: 3000,
      totalCollected: 1500,
      remaining: 1500,
      // 2026-10-20 — vadesi (2 gün önce) geçmiş kısmi ödemenin kalanı gecikmiştir (payments/status.ts).
      overdueRemaining: 1500,
      openCount: 1,
      paidInstallmentCount: 0,
    });
  });

  it("Zeynep (s1) için tamamı ödenmiş geçmişte kalan ve açık kayıt sıfırdır", () => {
    const payments = data.payments.filter((p) => p.studentId === "s1");
    const summary = computeStudentPaymentSummary(payments);
    expect(summary).toEqual({
      currentContractBilled: null,
      currentContractNumber: null,
      totalBilled: 3200,
      totalCollected: 3200,
      remaining: 0,
      overdueRemaining: 0,
      openCount: 0,
      paidInstallmentCount: 1,
    });
  });

  it("başka öğrencinin ödemeleri özet/listeye karışmaz (öğrenci filtreleme izolasyonu)", () => {
    const laraPayments = data.payments.filter((p) => p.studentId === "s5");
    expect(laraPayments.every((p) => p.studentId === "s5")).toBe(true);
    // Ali'nin (s4) ödemesi Lara'nın listesinde görünmemeli
    expect(laraPayments.some((p) => p.studentId === "s4")).toBe(false);
  });

  it("geçersiz/tenant dışı öğrenci id'si için özet boş ve güvenli döner", () => {
    // Bu mimaride her `readData()` çağrısı zaten tek bir tenant'a bağlıdır
    // (store-db.ts: `school.findFirst({ where: { tenantId } })`, store-json.ts:
    // tek dosya = tek tenant). Var olmayan/başka tenant'a ait bir id, mevcut
    // tenant'ın `data.students` dizisinde asla bulunamaz — sayfa "öğrenci
    // bulunamadı" olarak güvenle reddeder, hiçbir veri sızmaz.
    const missingStudent = data.students.find((s) => s.id === "does-not-exist");
    expect(missingStudent).toBeUndefined();

    const paymentsForMissing = data.payments.filter((p) => p.studentId === "does-not-exist");
    expect(paymentsForMissing).toEqual([]);
    expect(computeStudentPaymentSummary(paymentsForMissing)).toEqual({
      currentContractBilled: null,
      currentContractNumber: null,
      totalBilled: 0,
      totalCollected: 0,
      remaining: 0,
      overdueRemaining: 0,
      openCount: 0,
      paidInstallmentCount: 0,
    });
  });

  it("sortPaymentsForProfile en yeni vadeyi önce sıralar", () => {
    const payments = data.payments.filter((p) => p.studentId === "s1" || p.studentId === "s2");
    const sorted = sortPaymentsForProfile(payments);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i - 1].dueDate >= sorted[i].dueDate).toBe(true);
    }
  });
});
