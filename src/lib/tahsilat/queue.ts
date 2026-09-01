import { parseISO } from "date-fns";
import type { AppData, Payment } from "../types";
import { formatMoney } from "../utils";
import { calendarDaysBetween, DEFAULT_APP_TIMEZONE, toZonedYmd } from "../timezone";
import type { FollowUpCase, FollowUpStatus } from "./cases";

const PRIORITY_RANK: Record<string, number> = {
  overdue: 0,
  partial: 1,
  pending: 2,
};

/**
 * Gecikmiş bir ödeme için vade tarihinden bugüne kaç gün geçtiği (negatifse 0).
 *
 * Kök neden düzeltmesi — `date-fns`in `differenceInCalendarDays` fonksiyonu
 * her iki Date'i de ÇALIŞAN MAKİNENİN yerel saat dilimine göre takvim
 * gününe indirger. Bu fonksiyon sunucu tarafında (bkz. tahsilat-agent/page.tsx
 * — Server Component, `buildTahsilatQueue` çağırır) çalışır; Vercel'in
 * varsayılan UTC saat dilimi Europe/Istanbul'dan (+03:00) farklı olduğundan,
 * "vade 2026-08-01T00:00+03:00" gibi bir tarih UTC takviminde hâlâ
 * "2026-07-31" görünür ve gecikme günü 1 fazla/az hesaplanır — işletme
 * sahibine YANLIŞ bir gecikme süresi gösterilir (P0: finans/tahsilat).
 * Düzeltme AYNI kanonik desen (timezone.ts:calendarDaysBetween/toZonedYmd) —
 * her iki tarih AÇIKÇA Europe/Istanbul takvim gününe çevrilir, hangi
 * sunucu/makine saat diliminde çalışırsa çalışsın sonuç her zaman doğru.
 */
export function daysOverdue(dueDateIso: string, now: Date = new Date()): number {
  const nowYmd = toZonedYmd(now, DEFAULT_APP_TIMEZONE);
  const dueYmd = toZonedYmd(parseISO(dueDateIso), DEFAULT_APP_TIMEZONE);
  const days = calendarDaysBetween(dueYmd, nowYmd);
  return Math.max(days, 0);
}

/** Vaka durumuna göre yöneticinin bir sonraki adımı — Türkçe, tek cümlelik. */
export function nextActionLabel(caseStatus: FollowUpStatus | undefined): string {
  switch (caseStatus) {
    case undefined:
    case "open":
    case "draft":
    case "draft_ready":
      return "Taslağı onayla";
    case "approved":
      return "Mesajı gönder";
    case "sending":
      return "Gönderim sürüyor";
    case "sent":
      return "Yanıtı takip et";
    case "replied":
    case "partial":
      return "Ödeme sonucunu işaretle";
    case "failed":
      return "Gönderimi yeniden dene";
    case "paid":
      return "Tamamlandı";
    case "lost":
    case "dismissed":
      return "Yeniden takip başlat";
    default:
      return "Taslağı onayla";
  }
}

export type TahsilatQueueRow = {
  paymentId: string;
  studentId: string;
  studentName: string;
  parentName: string;
  parentPhone: string;
  description: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  remaining: number;
  paymentStatus: Payment["status"];
  daysOverdue: number;
  caseId?: string;
  caseStatus: FollowUpStatus;
  lastContactAt?: string;
  nextAction: string;
  suggestedMessage: string;
};

/**
 * "Bugünün takip kuyruğu" için satırları kurar ve gerçek önceliğe göre
 * sıralar: önce ödeme durumu (gecikmiş > kısmi > bekleyen), sonra gecikmiş
 * kayıtlarda gecikme günü (en çok geciken önce), sonra kalan tutar (en
 * büyük önce). `Payment`/`FollowUpCase` mantığını değiştirmez — yalnızca
 * mevcut verilerden okunabilir bir görünüm üretir.
 */
export function buildTahsilatQueue(
  data: AppData,
  cases: FollowUpCase[],
  now: Date = new Date(),
  studentFilter?: string
): TahsilatQueueRow[] {
  const rows = data.payments
    .filter((payment) => payment.status !== "paid")
    .filter((payment) => !studentFilter || payment.studentId === studentFilter)
    .map((payment) => {
      const student = data.students.find((s) => s.id === payment.studentId);
      const remaining = Math.max(Number(payment.amount) - Number(payment.paidAmount), 0);
      // Bir ödeme için yalnızca "açık" (paid/lost olmayan) vaka güncel takip
      // sayılır — kapanmış bir vaka varsa yeni bir takip döngüsü başlatılabilir.
      // upsertFollowUpCase'deki dedup mantığıyla birebir aynı filtre.
      const openCase = cases.find(
        (c) =>
          c.paymentId === payment.id &&
          c.status !== "paid" &&
          c.status !== "lost" &&
          c.status !== "dismissed"
      );
      const caseStatus: FollowUpStatus = openCase?.status ?? "draft";
      const overdueDays = payment.status === "overdue" ? daysOverdue(payment.dueDate, now) : 0;
      const suggestedMessage = `Merhaba, ${student?.name ?? "öğrencimiz"} için ${formatMoney(remaining)} tutarında ${
        payment.status === "overdue" ? "gecikmiş" : payment.status === "partial" ? "kısmi" : "bekleyen"
      } ödeme kaydı bulunmaktadır. Size uygun ödeme planı için bizimle iletişime geçebilirsiniz.`;

      return {
        paymentId: payment.id,
        studentId: payment.studentId,
        studentName: student?.name ?? "Öğrenci bulunamadı",
        parentName: student?.parentName ?? "",
        parentPhone: student?.parentPhone ?? "",
        description: payment.description,
        dueDate: payment.dueDate,
        amount: payment.amount,
        paidAmount: payment.paidAmount,
        remaining,
        paymentStatus: payment.status,
        daysOverdue: overdueDays,
        caseId: openCase?.id,
        caseStatus,
        lastContactAt: openCase?.sentAt ?? openCase?.updatedAt,
        nextAction: nextActionLabel(openCase?.status),
        suggestedMessage,
      } satisfies TahsilatQueueRow;
    });

  return rows.sort((a, b) => {
    const rankDiff = (PRIORITY_RANK[a.paymentStatus] ?? 9) - (PRIORITY_RANK[b.paymentStatus] ?? 9);
    if (rankDiff !== 0) return rankDiff;
    const overdueDiff = b.daysOverdue - a.daysOverdue;
    if (overdueDiff !== 0) return overdueDiff;
    return b.remaining - a.remaining;
  });
}
