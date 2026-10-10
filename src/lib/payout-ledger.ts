/**
 * 2026-09-30 — Öğretmen hakediş DEFTERİ (saf fonksiyonlar, I/O yok).
 *
 * Bir hakediş kaydı:  hesaplanan (totalAmount, satır düzeltmeleri dahil)
 *                   + düzeltmeler (adjustments, ters kaydı olmayanlar)
 *                   = net hakediş;   net − ödenen (payments) = kalan bakiye.
 * Kurallar (owner kararı 2026-09-30):
 * - Ödeme/düzeltme satırı SİLİNMEZ; yanlışsa ters kayıt (reversedAt) ile toplamdan çıkar.
 * - Durum defterden türetilir: pending · partial · paid · cancelled.
 * - Ödemesi olan kayıt iptal edilemez; iptal kaydı toplamlara ve politika kilidine girmez.
 * - Eski kayıt (payments yok) + status "paid" = tüm tutar tek ödemede ödenmiş sayılır; ilk defter
 *   işleminde bu ödeme açık bir satıra dönüştürülür (`ensureLedger`) — tutar değişmez.
 */
import type { TeacherPayout, TeacherPayoutAdjustmentEntry, TeacherPayoutPaymentEntry, TeacherPayoutStatus } from "./types";
import { uid } from "./utils";

const EPS = 0.005;

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function isActivePayout(p: Pick<TeacherPayout, "status">): boolean {
  return p.status !== "cancelled";
}

/** Toplamlara giren ödemeler (eski kayıtta tek sentetik ödeme). */
export function activePayments(p: TeacherPayout): TeacherPayoutPaymentEntry[] {
  if (!p.payments) {
    return p.status === "paid"
      ? [{ id: `legacy-${p.id}`, amount: p.totalAmount, paidAt: p.paidAt ?? p.generatedAt, method: p.method, createdByUserId: "", createdAt: p.paidAt ?? p.generatedAt, note: "Eski kayıt (tek ödeme)" }]
      : [];
  }
  return p.payments.filter((x) => !x.reversedAt);
}

export function activeAdjustments(p: TeacherPayout, kind?: TeacherPayoutAdjustmentEntry["kind"]): TeacherPayoutAdjustmentEntry[] {
  return (p.adjustments ?? []).filter((a) => !a.reversedAt && (!kind || a.kind === kind));
}

export function payoutPaidAmount(p: TeacherPayout): number {
  return round2(activePayments(p).reduce((s, x) => s + x.amount, 0));
}

export function payoutAdjustmentTotal(p: TeacherPayout, kind?: TeacherPayoutAdjustmentEntry["kind"]): number {
  return round2(activeAdjustments(p, kind).reduce((s, a) => s + a.amount, 0));
}

/** İptal kaydında 0 — toplamlara hiçbir şey taşımaz. */
export function payoutNetAmount(p: TeacherPayout): number {
  return p.status === "cancelled" ? 0 : round2(p.totalAmount + payoutAdjustmentTotal(p));
}

/** Pozitif = öğretmene ödenecek; negatif = fazla ödeme (öğretmenden alacak). */
export function payoutBalance(p: TeacherPayout): number {
  return p.status === "cancelled" ? 0 : round2(payoutNetAmount(p) - payoutPaidAmount(p));
}

export function derivePayoutStatus(p: TeacherPayout): TeacherPayoutStatus {
  if (p.status === "cancelled") return "cancelled";
  const paid = payoutPaidAmount(p);
  if (paid <= EPS) return "pending";
  return payoutBalance(p) <= EPS ? "paid" : "partial";
}

export const PAYOUT_STATUS_LABEL: Record<TeacherPayoutStatus | "no_lessons" | "not_created", string> = {
  pending: "Bekliyor",
  partial: "Kısmi ödendi",
  paid: "Ödendi",
  cancelled: "İptal",
  no_lessons: "Ders yok",
  not_created: "Kayıt yok",
};

/** Eski tek-bayraklı kaydı açık deftere çevirir (tutar değişmez). */
export function ensureLedger(p: TeacherPayout): TeacherPayout {
  if (p.payments) return p;
  return { ...p, payments: activePayments(p).map((x) => ({ ...x, id: uid("tpp") })) };
}

function finalize(p: TeacherPayout): TeacherPayout {
  const status = derivePayoutStatus(p);
  const last = activePayments(p).sort((a, b) => b.paidAt.localeCompare(a.paidAt))[0];
  return { ...p, status, paidAt: last?.paidAt };
}

export type LedgerResult = { ok: true; payout: TeacherPayout } | { ok: false; message: string };

export function addPaymentData(
  payout: TeacherPayout,
  input: { amount?: number; paidAt?: string; method?: string; note?: string },
  actorUserId: string,
  now: Date = new Date()
): LedgerResult {
  if (payout.status === "cancelled") return { ok: false, message: "İptal edilmiş hakedişe ödeme girilemez. Önce dönemin hakedişini yeniden oluşturun." };
  const p = ensureLedger(payout);
  const balance = payoutBalance(p);
  if (balance <= EPS) {
    return { ok: false, message: "Bu hakedişin ödenecek bakiyesi yok. Ek ödeme gerekiyorsa önce gerekçeli bir düzeltme kaydı ekleyin." };
  }
  const amount = input.amount === undefined ? balance : round2(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: "Ödeme tutarı 0'dan büyük olmalı." };
  if (amount > balance + EPS) {
    return { ok: false, message: `Ödeme tutarı kalan bakiyeyi (${balance.toFixed(2)} TL) aşamaz; çift ödeme oluşmasın diye reddedildi.` };
  }
  const entry: TeacherPayoutPaymentEntry = {
    id: uid("tpp"),
    amount,
    paidAt: input.paidAt ?? now.toISOString(),
    method: input.method ?? p.method,
    note: input.note?.trim() || undefined,
    createdByUserId: actorUserId,
    createdAt: now.toISOString(),
  };
  return { ok: true, payout: finalize({ ...p, payments: [...(p.payments ?? []), entry], method: entry.method ?? p.method }) };
}

export function reversePaymentData(payout: TeacherPayout, paymentId: string | "all", reason: string, actorUserId: string, now: Date = new Date()): LedgerResult {
  const p = ensureLedger(payout);
  const ids = paymentId === "all" ? activePayments(p).map((x) => x.id) : [paymentId];
  const targets = (p.payments ?? []).filter((x) => ids.includes(x.id) && !x.reversedAt);
  if (targets.length === 0) return { ok: false, message: "Ters kaydı yapılacak aktif ödeme bulunamadı. Sayfayı yenileyip tekrar deneyin." };
  const at = now.toISOString();
  const payments = (p.payments ?? []).map((x) =>
    ids.includes(x.id) && !x.reversedAt ? { ...x, reversedAt: at, reversedByUserId: actorUserId, reverseReason: reason } : x
  );
  return { ok: true, payout: finalize({ ...p, payments }) };
}

export function addAdjustmentData(
  payout: TeacherPayout,
  input: { amount: number; reason: string; kind?: TeacherPayoutAdjustmentEntry["kind"] },
  actorUserId: string,
  now: Date = new Date()
): LedgerResult {
  if (payout.status === "cancelled") return { ok: false, message: "İptal edilmiş hakedişe düzeltme eklenemez." };
  const amount = round2(input.amount);
  if (!Number.isFinite(amount) || Math.abs(amount) < 0.01 || Math.abs(amount) > 1_000_000) {
    return { ok: false, message: "Düzeltme tutarı 0 olamaz ve en fazla ±1.000.000 TL olabilir (ek ödeme için +, kesinti için −)." };
  }
  const p = ensureLedger(payout);
  const entry: TeacherPayoutAdjustmentEntry = {
    id: uid("tpa"),
    amount,
    reason: input.reason.trim(),
    kind: input.kind ?? "manual",
    createdByUserId: actorUserId,
    createdAt: now.toISOString(),
  };
  return { ok: true, payout: finalize({ ...p, adjustments: [...(p.adjustments ?? []), entry] }) };
}

export function reverseAdjustmentData(payout: TeacherPayout, adjustmentId: string, reason: string, actorUserId: string, now: Date = new Date()): LedgerResult {
  const target = (payout.adjustments ?? []).find((a) => a.id === adjustmentId && !a.reversedAt);
  if (!target) return { ok: false, message: "Geri alınacak aktif düzeltme bulunamadı. Sayfayı yenileyip tekrar deneyin." };
  const at = now.toISOString();
  const adjustments = (payout.adjustments ?? []).map((a) =>
    a.id === adjustmentId ? { ...a, reversedAt: at, reversedByUserId: actorUserId, reverseReason: reason } : a
  );
  return { ok: true, payout: finalize({ ...ensureLedger(payout), adjustments }) };
}

/** Yalnız ödemesi olmayan kayıt iptal edilir; ödenmiş kayıt ters/düzeltme kaydı alır. */
export function cancelPayoutData(payout: TeacherPayout, reason: string, actorUserId: string, now: Date = new Date()): LedgerResult {
  if (payout.status === "cancelled") return { ok: false, message: "Bu hakediş zaten iptal edilmiş." };
  if (payoutPaidAmount(payout) > EPS) {
    return {
      ok: false,
      message: "Bu hakedişe ödeme yapılmış; iptal edilemez. Hatalı ödemeyi ters kayıtla geri alın veya farkı düzeltme kaydıyla yönetin.",
    };
  }
  return {
    ok: true,
    payout: {
      ...ensureLedger(payout),
      status: "cancelled",
      cancelledAt: now.toISOString(),
      cancelledByUserId: actorUserId,
      cancelReason: reason,
      paidAt: undefined,
    },
  };
}

export type PayoutPaymentRow = {
  key: string;
  payoutId: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  paidAt: string;
  method?: string;
  note?: string;
};

/** Ödeme geçmişi = gerçekleşen (ters kaydı olmayan) ödeme satırları; kısmi ödemeler ayrı satır. */
export function payoutPaymentRows(payouts: TeacherPayout[]): PayoutPaymentRow[] {
  return payouts
    .filter((p) => p.status !== "cancelled")
    .flatMap((p) =>
      activePayments(p).map((x) => ({
        key: `${p.id}:${x.id}`,
        payoutId: p.id,
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        amount: x.amount,
        paidAt: x.paidAt,
        method: x.method,
        note: x.note,
      }))
    )
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt));
}
