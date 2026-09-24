import type { Payment } from "./types";
import { isTerminalContractStatus, selectCurrentContract } from "./contract-list-helpers";

export type StudentPaymentSummary = {
  /** Geçerli tahakkuk: iptal/yenilenmiş sözleşme satırlarından yalnız fiilen tahsil edilen kısım. */
  totalBilled: number;
  /** Gerçekleşmiş tüm tahsilatlar — eski sözleşmeninkiler dahil, hiçbiri gizlenmez. */
  totalCollected: number;
  remaining: number;
  overdueRemaining: number;
  openCount: number;
  /**
   * Güncel (iptal/yenilenmemiş) sözleşmenin taksit tutarları toplamı. `null`:
   * aktif sözleşme yok ya da çağıran sözleşme listesi vermedi.
   */
  currentContractBilled: number | null;
  currentContractNumber: string | null;
};

type SummaryContract = { id: string; status: string; contractNumber?: string; versionNumber?: number; createdAt?: string };

/**
 * Öğrenci bazlı ödeme özeti. Tüm hesaplar tamsayı TL üzerinden yapılır
 * (Payment.amount/paidAmount zaten şemada integer); float yuvarlama riski yok.
 *
 * UAT 2026-09-24 (A) — iptal edilen / yenilemeyle yerini bırakan sözleşmenin
 * taksit satırları silinmez (muhasebe geçmişi), ama ödenmemiş kısmı artık borç
 * değildir. Önceden tüm satırlar toplandığı için eski + yeni sözleşme tutarı
 * "Toplam tahakkuk"ta çift sayılıyordu. Tahsil edilen tutar HER ZAMAN sayılır.
 */
export function computeStudentPaymentSummary(payments: Payment[], contracts?: SummaryContract[]): StudentPaymentSummary {
  let totalBilled = 0;
  let totalCollected = 0;
  let remaining = 0;
  let overdueRemaining = 0;
  let openCount = 0;
  const terminalIds = new Set((contracts ?? []).filter((c) => isTerminalContractStatus(c.status)).map((c) => c.id));
  const current = contracts ? selectCurrentContract(contracts) : null;
  let currentContractBilled = current ? 0 : null;

  for (const p of payments) {
    // "voided" (ders iptaliyle geri alınmış otomatik tahsilat) hiç borç/tahsilat
    // sayılmaz — özet toplamlarına hiç girmez, yalnızca geçmişte görünür kalır.
    if (p.status === "voided") continue;
    totalCollected += p.paidAmount;
    if (current && p.contractId === current.id) currentContractBilled! += p.amount;
    if (p.contractId && terminalIds.has(p.contractId)) {
      totalBilled += p.paidAmount;
      continue;
    }
    totalBilled += p.amount;
    const due = Math.max(p.amount - p.paidAmount, 0);
    remaining += due;
    if (p.status === "overdue") overdueRemaining += due;
    if (p.status !== "paid") openCount += 1;
  }

  return {
    totalBilled,
    totalCollected,
    remaining,
    overdueRemaining,
    openCount,
    currentContractBilled,
    currentContractNumber: current?.contractNumber ?? null,
  };
}

/** Ödeme geçmişi görünümü için sıralama: en yeni vade önce. */
export function sortPaymentsForProfile(payments: Payment[]): Payment[] {
  return [...payments].sort((a, b) => b.dueDate.localeCompare(a.dueDate));
}

/**
 * Öğrenci "Ödeme geçmişi" tablosu — yalnızca GERÇEKLEŞMİŞ ödeme hareketleri
 * (ödendi/kısmi ödendi/iptal edildi). "Bekliyor" ve "Gecikmiş" henüz
 * gerçekleşmemiş, bekleyen durumlardır ve bu geçmiş listesinde gösterilmez.
 * Genel tahsilat/raporlama (computeStudentPaymentSummary, Ödemeler
 * ekranındaki tam liste) bu filtreyi KULLANMAZ — yalnızca bu görünüme özgü.
 */
export function filterPaymentHistory(payments: Payment[]): Payment[] {
  return payments.filter((p) => p.status !== "pending" && p.status !== "overdue");
}
