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

/**
 * UAT 2026-09-25 — TEK "canlı borç" kuralı. İptal edilmiş / yenilemeyle yerini bırakmış sözleşmenin
 * taksit satırları silinmez (muhasebe geçmişi) ama ödenmemiş kısmı artık kimseye borç değildir:
 * gecikmiş tutar, Günlük Özet, tahsilat kuyruğu ve otomatik hatırlatma bu satırları saymaz.
 */
export function isLiveObligation(
  p: Pick<Payment, "status" | "contractId">,
  terminalContractIds: ReadonlySet<string>
): boolean {
  if (p.status === "paid" || p.status === "voided") return false;
  return !(p.contractId && terminalContractIds.has(p.contractId));
}

/**
 * 9. tur (owner kararı 2026-09-27) — TEK "tahsil edilen" tanımı: satırda FİİLEN
 * alınmış para. Kısmi ödemenin alınan kısmı dahildir; kalan bakiye
 * `isLiveObligation` üzerinden açık alacakta ayrıca görünür. İptal edilmiş
 * (voided) satır 0. Eski "ödendi" satırında paidAmount boş kalmışsa tutarın
 * tamamı alınmış sayılır (ödeme dökümünün mevcut davranışı). Ödemeler,
 * Finans Özeti, Günlük Özet, panel istatistikleri ve dökümler bunu kullanır.
 */
export function collectedAmountOf(p: Pick<Payment, "status" | "amount" | "paidAmount">): number {
  if (p.status === "voided") return 0;
  if (p.status === "paid") return p.paidAmount > 0 ? p.paidAmount : p.amount;
  return Math.max(0, p.paidAmount ?? 0);
}

/**
 * 2026-10-04 — BORÇ KAYNAĞI (tek tablo `Payment`; satır ikinci bir yerden toplanmaz).
 * - contract: güncel sözleşmenin dondurulmuş taksidi (`contractId`)
 * - registration: kayıt anı ilk tahsilatı (sözleşmeye bağlanmamışsa)
 * - monthly_plan: sözleşmesiz öğrencinin aylık plan satırı (Yoklama Takvimi / Ödemeler)
 * - lesson: ders bazlı otomatik tahsilat (Geldi/İşlendi)
 * - manual: elle girilen bağımsız borç/tahakkuk
 * Tahsilat = satırdaki `paidAmount`; iptal (voided) ve iptal/yenilenmiş sözleşmenin ödenmemiş
 * kalanı borç değildir (`isLiveObligation`). İade ayrı bir satır türü değildir: yanlış tahsilat
 * ters kayıtla (tahsilatı geri alma) düzeltilir, borç yeniden canlanır.
 */
export type DebtSourceKey = "contract" | "registration" | "monthly_plan" | "club" | "lesson" | "manual";

export const DEBT_SOURCE_LABEL: Record<DebtSourceKey, string> = {
  contract: "Sözleşme taksidi",
  registration: "Kayıt ilk tahsilatı",
  monthly_plan: "Sözleşmesiz aylık plan",
  club: "Kulüp ücreti",
  lesson: "Ders bazlı tahsilat",
  manual: "Elle girilen borç",
};

export function debtSourceOf(p: Pick<Payment, "source" | "contractId" | "lessonId">): DebtSourceKey {
  if (p.contractId) return "contract";
  if (p.source === "registration_first_payment") return "registration";
  if (p.source === "monthly_plan") return "monthly_plan";
  if (p.source === "club") return "club";
  if (p.source === "lesson_ops" || p.lessonId) return "lesson";
  return "manual";
}

export type StudentDebtSummary = {
  openTotal: number;
  overdueTotal: number;
  openCount: number;
  /** Liste rozeti: canlı borç yoksa ve hiç tahsilat da yoksa "none". */
  status: "paid" | "overdue" | "partial" | "pending" | "none";
};

/**
 * TEK açık borç özeti — Öğrenciler listesi, öğrenci detayı, Ödeme Merkezi ve öğrenci/veli portalı
 * bunu (veya aynı kurala dayanan `splitStudentDebt`) kullanır. Sözleşmesi olmayan öğrencinin
 * bağımsız borcu (aylık plan, elle borç, ders bazlı) aynen sayılır; sözleşme yok diye dışlanmaz.
 */
export function summarizeStudentDebt(
  payments: Pick<Payment, "status" | "contractId" | "amount" | "paidAmount">[],
  terminalContractIds: ReadonlySet<string>
): StudentDebtSummary {
  let openTotal = 0;
  let overdueTotal = 0;
  let openCount = 0;
  let anyPartial = false;
  let anyPaid = false;
  for (const p of payments) {
    if (p.status === "paid") anyPaid = true;
    if (!isLiveObligation(p, terminalContractIds)) continue;
    const due = Math.max(p.amount - p.paidAmount, 0);
    if (due <= 0) continue;
    openTotal += due;
    openCount += 1;
    if (p.status === "overdue") overdueTotal += due;
    if (p.status === "partial") anyPartial = true;
  }
  const status: StudentDebtSummary["status"] =
    overdueTotal > 0 ? "overdue" : anyPartial ? "partial" : openCount > 0 ? "pending" : anyPaid ? "paid" : "none";
  return { openTotal, overdueTotal, openCount, status };
}

export type StudentDebtView = {
  /** Açık (vadesi gelmemiş veya gecikmiş) canlı borç satırları — en eski vade önce. */
  open: Payment[];
  openTotal: number;
  overdueTotal: number;
  /** Fiilen tahsil edilmiş hareketler (kısmi dahil; eski sözleşmeninkiler de) — en yeni önce. */
  movements: Payment[];
  /** İptal/yenilenmiş sözleşmenin ödenmemiş kalan satırları — gösterilir ama borç sayılmaz. */
  closedByContract: Payment[];
  /** Açık borcun kaynağa göre dağılımı (yalnız açık tutarı olan kaynaklar). */
  bySource: { key: DebtSourceKey; label: string; openTotal: number; count: number }[];
};

export function splitStudentDebt(payments: Payment[], terminalContractIds: ReadonlySet<string>): StudentDebtView {
  const live = payments.filter((p) => isLiveObligation(p, terminalContractIds));
  const open = [...live].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const due = (p: Payment) => Math.max(p.amount - p.paidAmount, 0);
  return {
    open,
    openTotal: open.reduce((s, p) => s + due(p), 0),
    overdueTotal: open.filter((p) => p.status === "overdue").reduce((s, p) => s + due(p), 0),
    movements: payments
      .filter((p) => p.status !== "voided" && p.paidAmount > 0)
      .sort((a, b) => (b.paidAt ?? b.dueDate).localeCompare(a.paidAt ?? a.dueDate)),
    closedByContract: payments.filter(
      (p) => p.status !== "paid" && p.status !== "voided" && !!p.contractId && terminalContractIds.has(p.contractId)
    ),
    bySource: (Object.keys(DEBT_SOURCE_LABEL) as DebtSourceKey[])
      .map((key) => {
        const rows = open.filter((p) => debtSourceOf(p) === key && due(p) > 0);
        return { key, label: DEBT_SOURCE_LABEL[key], openTotal: rows.reduce((s, p) => s + due(p), 0), count: rows.length };
      })
      .filter((x) => x.count > 0),
  };
}
