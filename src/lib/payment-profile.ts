import type { Payment } from "./types";
import { paidInstallmentCount, type CalendarPlanInstallment } from "./attendance-calendar-plan";
import { isTerminalContractStatus, selectCurrentContract } from "./contract-list-helpers";
import { isPaymentOverdue } from "./payments/status";
import { supersededUncollectedMonthlyPlanIds, type PlanLinkRow } from "./superseded-monthly-plan";

/**
 * 2026-10-20 — "gecikmiş" TEK kuraldan (`payments/status.ts`): vade günü (kurum saati) geçmiş canlı borç. Ham
 * `status === "overdue"` yalnız oluşturulurken damgalandığı için bayattır; vade bilgisi olmayan özet satırlarda
 * (öğrenci listesi SQL grubu, orada zaten canonical'a çevrilmiş) saklanan statü kullanılır.
 */
function overdueOf(p: Pick<Payment, "status" | "amount" | "paidAmount"> & { dueDate?: string }): boolean {
  return p.dueDate ? isPaymentOverdue({ ...p, dueDate: p.dueDate }) : p.status === "overdue";
}

type DebtRow = Pick<Payment, "status" | "contractId" | "amount" | "paidAmount"> &
  Partial<Pick<PlanLinkRow, "id" | "studentId" | "source" | "enrollmentId" | "description" | "installmentPeriodLabel" | "installmentBreakdown" | "firstCollectionIncludesNextMonth" | "dueDate">>;

/** Dönem alanları yoksa (liste özeti) boş küme: gruplama zaten kalanı düşmüştür. */
function supersededIds(payments: readonly DebtRow[], terminalContractIds: ReadonlySet<string>): Set<string> {
  if (!payments.some((p) => p.source === "monthly_plan" && p.id && p.studentId)) return new Set();
  return supersededUncollectedMonthlyPlanIds(payments as PlanLinkRow[], terminalContractIds);
}

export type StudentPaymentSummary = {
  /** Geçerli tahakkuk: iptal/yenilenmiş sözleşme satırlarından yalnız fiilen tahsil edilen kısım. */
  totalBilled: number;
  /** Gerçekleşmiş tüm tahsilatlar — eski sözleşmeninkiler dahil, hiçbiri gizlenmez. */
  totalCollected: number;
  remaining: number;
  overdueRemaining: number;
  openCount: number;
  /** Tam kapanmış dönem sayısı. Satır adedi değil (`coveredInstallmentCount`). */
  paidInstallmentCount: number;
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
  const duplicatedPlan = supersededIds(payments, terminalIds);
  const current = contracts ? selectCurrentContract(contracts) : null;
  let currentContractBilled = current ? 0 : null;

  for (const p of payments) {
    // "voided" (ders iptaliyle geri alınmış otomatik tahsilat) hiç borç/tahsilat
    // sayılmaz — özet toplamlarına hiç girmez, yalnızca geçmişte görünür kalır.
    if (p.status === "voided" || duplicatedPlan.has(p.id)) continue;
    totalCollected += p.paidAmount;
    if (current && p.contractId === current.id) currentContractBilled! += p.amount;
    if (p.contractId && terminalIds.has(p.contractId)) {
      totalBilled += p.paidAmount;
      continue;
    }
    totalBilled += p.amount;
    const due = Math.max(p.amount - p.paidAmount, 0);
    remaining += due;
    if (overdueOf(p)) overdueRemaining += due;
    if (p.status !== "paid") openCount += 1;
  }

  return {
    totalBilled,
    totalCollected,
    remaining,
    overdueRemaining,
    openCount,
    paidInstallmentCount: paidInstallmentCount(payments),
    currentContractBilled,
    currentContractNumber: current?.contractNumber ?? null,
  };
}

/** Öğrenci kimliği → ödenmiş taksit sayısı. Ödemeler listesi çekmecesi bunu düz nesne olarak alır. */
export function paidInstallmentCountsByStudent(
  payments: readonly (CalendarPlanInstallment & { studentId: string })[]
): Record<string, number> {
  const groups = new Map<string, (CalendarPlanInstallment & { studentId: string })[]>();
  for (const p of payments) {
    const list = groups.get(p.studentId);
    if (list) list.push(p);
    else groups.set(p.studentId, [p]);
  }
  const out: Record<string, number> = {};
  for (const [studentId, rows] of groups) out[studentId] = paidInstallmentCount(rows);
  return out;
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

// 2026-10-23 — kaynak türü ve adı tek yerde (`payment-source-label.ts`); buradan da dışa verilir.
import { DEBT_SOURCE_LABEL, debtSourceOf, type DebtSourceKey } from "./payment-source-label";
export { DEBT_SOURCE_LABEL, debtSourceOf, type DebtSourceKey };

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
  payments: DebtRow[],
  terminalContractIds: ReadonlySet<string>
): StudentDebtSummary {
  const duplicatedPlan = supersededIds(payments, terminalContractIds);
  let openTotal = 0;
  let overdueTotal = 0;
  let openCount = 0;
  let anyPartial = false;
  let anyPaid = false;
  for (const p of payments) {
    if (p.status === "paid") anyPaid = true;
    if (p.id && duplicatedPlan.has(p.id)) continue;
    if (!isLiveObligation(p, terminalContractIds)) continue;
    const due = Math.max(p.amount - p.paidAmount, 0);
    if (due <= 0) continue;
    openTotal += due;
    openCount += 1;
    if (overdueOf(p)) overdueTotal += due;
    else if (p.status === "partial" || p.paidAmount > 0) anyPartial = true;
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
  const duplicatedPlan = supersededIds(payments, terminalContractIds);
  const live = payments.filter((p) => isLiveObligation(p, terminalContractIds) && !duplicatedPlan.has(p.id));
  const open = [...live].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const due = (p: Payment) => Math.max(p.amount - p.paidAmount, 0);
  return {
    open,
    openTotal: open.reduce((s, p) => s + due(p), 0),
    overdueTotal: open.filter((p) => overdueOf(p)).reduce((s, p) => s + due(p), 0),
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

/**
 * 2026-10-09 — öğrenci düzeyi finans toplamının BRANŞ kırılımı. Her ödeme satırı tek branşa (veya "belirtilmemiş"
 * gruba) düşer; toplamlar öğrenci bazındaki açık borç/tahsilatla birebir aynıdır (çift sayım yok). Güncel sözleşme
 * branş başına `selectCurrentContract` ile seçilir.
 */
export type BranchPaymentRow = {
  key: string;
  label: string;
  openTotal: number;
  overdueTotal: number;
  collected: number;
  currentContractNumber: string | null;
  currentContractBilled: number | null;
};

export function computeBranchPaymentBreakdown(input: {
  payments: Payment[];
  contracts: (SummaryContract & { enrollmentId?: string })[];
  branches: { id: string; label: string }[];
  paymentBranchOf: (p: Payment) => string | undefined;
  contractBranchOf: (c: SummaryContract & { enrollmentId?: string }) => string | undefined;
  unassignedLabel: string;
}): BranchPaymentRow[] {
  const terminalIds = new Set(input.contracts.filter((c) => isTerminalContractStatus(c.status)).map((c) => c.id));
  const duplicatedPlan = supersededIds(input.payments, terminalIds);
  const rows = new Map<string, BranchPaymentRow>();
  const rowOf = (key: string, label: string) => {
    let r = rows.get(key);
    if (!r) {
      r = { key, label, openTotal: 0, overdueTotal: 0, collected: 0, currentContractNumber: null, currentContractBilled: null };
      rows.set(key, r);
    }
    return r;
  };
  for (const b of input.branches) {
    const r = rowOf(b.id, b.label);
    const current = selectCurrentContract(input.contracts.filter((c) => input.contractBranchOf(c) === b.id));
    if (current) {
      r.currentContractNumber = current.contractNumber ?? null;
      r.currentContractBilled = input.payments
        .filter((p) => p.contractId === current.id && p.status !== "voided")
        .reduce((s, p) => s + p.amount, 0);
    }
  }
  for (const p of input.payments) {
    if (p.source === "club" || p.clubMembershipId) continue;
    const key = input.paymentBranchOf(p) ?? "__unassigned__";
    const r = rows.get(key) ?? rowOf("__unassigned__", input.unassignedLabel);
    r.collected += collectedAmountOf(p);
    if (duplicatedPlan.has(p.id) || !isLiveObligation(p, terminalIds)) continue;
    const due = Math.max(p.amount - p.paidAmount, 0);
    r.openTotal += due;
    if (overdueOf(p)) r.overdueTotal += due;
  }
  return [...rows.values()];
}
