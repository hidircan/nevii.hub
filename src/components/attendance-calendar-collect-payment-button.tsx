"use client";

/**
 * Yoklama Takvimi gün kutusundan tahsilat — TEK finansal gerçek kaynağı
 * (Payment) hiç dallandırmadan, Ödemeler ekranının "Ödendi işaretle" ile
 * BİREBİR AYNI uç noktayı (`POST /api/v1/payments/:paymentId/pay` →
 * createPaymentTool → markPaymentPaid) çağırır.
 */

import { useEffect, useId, useState, useTransition } from "react";
import type { StudentPaymentMethod } from "@/lib/types";
import { formatMoney, paymentMethodLabelTr } from "@/lib/utils";

const PAYMENT_METHOD_OPTIONS: { value: StudentPaymentMethod; label: string }[] = [
  { value: "cash", label: paymentMethodLabelTr("cash") },
  { value: "transfer", label: paymentMethodLabelTr("transfer") },
  { value: "credit_card", label: paymentMethodLabelTr("credit_card") },
];

export function AttendanceCalendarCollectPaymentButton({
  paymentId,
  lessonId,
  defaultMethod,
  registeredAmount,
  onSettled,
}: {
  paymentId: string;
  lessonId: string;
  defaultMethod?: string;
  registeredAmount: number;
  onSettled: (lessonId: string) => void;
}) {
  const selectId = useId();
  const amountId = useId();
  const noteId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [successFlash, setSuccessFlash] = useState(false);
  const initialMethod = PAYMENT_METHOD_OPTIONS.some((o) => o.value === defaultMethod)
    ? (defaultMethod as StudentPaymentMethod)
    : "";
  const [method, setMethod] = useState<StudentPaymentMethod | "">(initialMethod);
  const [amount, setAmount] = useState(String(registeredAmount));
  /** §C.2 — zorunlu DEĞİL ama kalıcı: `Payment.paymentNote` (dekont no, kısmi
   * ödeme gerekçesi vb.). Uç nokta bu alanı zaten kabul ediyordu; eksik olan
   * tek şey onu gönderen bir arayüz adımıydı. */
  const [note, setNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!successFlash) return;
    const t = setTimeout(() => setSuccessFlash(false), 2500);
    return () => clearTimeout(t);
  }, [successFlash]);

  function onRequestCollect() {
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Geçerli bir tutar girin.");
      return;
    }
    setError(null);
    setSuccessMsg(null);
    setConfirmOpen(true);
  }

  function onCollect() {
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Geçerli bir tutar girin.");
      return;
    }
    setError(null);
    setConfirmOpen(false);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/payments/${paymentId}/pay`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(method ? { method } : {}),
            ...(note.trim() ? { paymentNote: note.trim() } : {}),
            amount: parsedAmount,
            paidAt: new Date().toISOString(),
          }),
        });
        const json = (await res.json()) as { ok: boolean; error?: { message: string } };
        if (!json.ok) {
          setError(json.error?.message || "Tahsilat alınamadı.");
          return;
        }
        setSuccessMsg(
          `Ödeme alındı — ${formatMoney(parsedAmount)}${note.trim() ? " (not kaydedildi)" : ""}.`
        );
        setSuccessFlash(true);
      } catch {
        setError("Bağlantı hatası. Tekrar deneyin.");
      } finally {
        onSettled(lessonId);
      }
    });
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-[var(--color-text-muted)]">
        Kayıtlı tutar:{" "}
        <span className="font-medium text-[var(--color-text)]">{formatMoney(registeredAmount)}</span>
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <label htmlFor={amountId} className="text-[11px] text-[var(--color-text-muted)]">
          Tahsil edilen
        </label>
        <input
          id={amountId}
          type="number"
          min={1}
          step={1}
          value={amount}
          disabled={pending || successFlash}
          onChange={(e) => setAmount(e.target.value)}
          className="w-20 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-1 text-[11px] text-[var(--color-text)] disabled:opacity-50"
        />
        <label htmlFor={selectId} className="text-[11px] text-[var(--color-text-muted)]">
          Ödeme şekli
        </label>
        <select
          id={selectId}
          value={method}
          disabled={pending || successFlash}
          onChange={(e) => setMethod(e.target.value as StudentPaymentMethod | "")}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-1 text-[11px] text-[var(--color-text)] disabled:opacity-50"
        >
          <option value="">Varsayılan</option>
          {PAYMENT_METHOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <label htmlFor={noteId} className="text-[11px] text-[var(--color-text-muted)]">
          Not
        </label>
        <input
          id={noteId}
          type="text"
          value={note}
          maxLength={200}
          placeholder="Dekont no, açıklama…"
          disabled={pending || successFlash}
          onChange={(e) => setNote(e.target.value)}
          className="w-36 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-1 text-[11px] text-[var(--color-text)] disabled:opacity-50"
        />
        <button
          type="button"
          disabled={pending || successFlash}
          onClick={onRequestCollect}
          className={
            successFlash
              ? "inline-flex items-center rounded-md border border-[var(--color-success)] bg-[var(--color-success)] px-2.5 py-1 text-[11px] font-semibold text-white"
              : "inline-flex items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-muted)] disabled:opacity-50"
          }
        >
          {pending ? "İşleniyor…" : successFlash ? "✓ Tahsil edildi" : "Tahsil Et"}
        </button>
      </div>
      {successMsg ? (
        <p className="text-[11px] font-medium text-[var(--color-success)]" role="status">
          {successMsg}
        </p>
      ) : null}
      {error ? (
        <p className="text-[11px] font-medium text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      {confirmOpen ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Tahsilatı onayla"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xl">
            <h3 className="text-base font-semibold text-[var(--color-text)]">Tahsilatı onaylıyor musunuz?</h3>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              {formatMoney(Number(amount))}
              {method ? ` — ${paymentMethodLabelTr(method)}` : ""} tutarında bir tahsilat kaydedilecek ve ödeme
              durumu &quot;Ödendi&quot; olarak işaretlenecek.
            </p>
            {note.trim() ? (
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">Not: {note.trim()}</p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={pending}
                className="rounded-lg border border-[var(--color-border)] px-3.5 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] disabled:opacity-50"
              >
                İptal
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={onCollect}
                className="rounded-lg bg-[var(--color-success)] px-3.5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "İşleniyor…" : "Evet, tahsil et"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
