"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { actionUpdatePayment } from "@/lib/actions";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatPaymentCollectionSummary,
  paymentMethodLabelTr,
} from "@/lib/utils";
import { paymentSourceLabel } from "@/lib/payment-source-label";

type PaymentMethod = "credit_card" | "cash" | "transfer";

const METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "transfer", label: paymentMethodLabelTr("transfer") },
  { value: "credit_card", label: paymentMethodLabelTr("credit_card") },
  { value: "cash", label: paymentMethodLabelTr("cash") },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function toDatetimeLocal(iso: string | undefined): string {
  if (!iso) {
    const n = new Date();
    const pad = (x: number) => String(x).padStart(2, "0");
    return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}T${pad(n.getHours())}:${pad(n.getMinutes())}`;
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return todayIso() + "T12:00";
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToIso(value: string): string {
  if (!value) return new Date().toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00`).toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/**
 * Mevcut tahsilat kaydının düzeltilmesi — Ödemeler ekranlarında YENİ tahsilat
 * açılmaz (tahsilat yalnız Yoklama Takvimi üzerinden yapılır). Bu modal yalnız
 * "edit" kipindedir: önce kayıt özeti, sonra düzeltme formu ve onay.
 */
export function PaymentMarkPaidModal({
  paymentId,
  studentName,
  defaultAmount,
  initialMethod,
  initialNote,
  initialPaidAt,
  dueDate,
  description,
  source,
  lessonId,
  collectorName,
  suggestedAmount,
  adjustmentReason,
  onClose,
}: {
  paymentId: string;
  studentName: string;
  defaultAmount: number;
  initialMethod?: PaymentMethod;
  initialNote?: string;
  initialPaidAt?: string;
  dueDate?: string;
  description?: string;
  source?: string;
  lessonId?: string;
  collectorName?: string | null;
  /** P0 revizyonu — motorun önerdiği tutar (kısmi/uyarlanmış tahsilat bağlamı). */
  suggestedAmount?: number | null;
  /** P0 revizyonu — kısmi ilk tahsilat gerekçesi (Payment.adjustmentReason). */
  adjustmentReason?: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const titleId = useId();
  const [step, setStep] = useState<"summary" | "form" | "confirm">("summary");
  const [method, setMethod] = useState<PaymentMethod>(initialMethod ?? "transfer");
  const [amount, setAmount] = useState(String(defaultAmount));
  const [paidAtLocal, setPaidAtLocal] = useState(toDatetimeLocal(initialPaidAt));
  const [note, setNote] = useState(initialNote ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const parsedAmount = Number(amount);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const sourceLabel = paymentSourceLabel({ source, lessonId });
  const methodLabel = paymentMethodLabelTr(method);
  const collectionSummary = formatPaymentCollectionSummary({
    paidAt: initialPaidAt,
    amount: defaultAmount,
    method,
    collectorName,
  });

  function goToConfirm() {
    setError(null);
    if (!amountValid) {
      setError("Geçerli bir tutar girin.");
      return;
    }
    if (!paidAtLocal) {
      setError("Tahsilat tarih/saatini girin.");
      return;
    }
    setStep("confirm");
  }

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    const paidAtIso = datetimeLocalToIso(paidAtLocal);
    const result = await actionUpdatePayment({
      paymentId,
      method,
      amount: parsedAmount,
      paymentNote: note.trim() || undefined,
      paidAt: paidAtIso,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      setStep("form");
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)]"
      >
        {step === "summary" ? (
          <>
            <h2 id={titleId} className="text-base font-semibold text-[var(--color-text)]">
              Ödeme detayı
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{studentName}</p>
            <dl className="mt-4 space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-sm">
              {description ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--color-text-muted)]">Açıklama</dt>
                  <dd className="text-right font-medium text-[var(--color-text)]">{description}</dd>
                </div>
              ) : null}
              {dueDate ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--color-text-muted)]">Vade tarihi</dt>
                  <dd className="text-right text-[var(--color-text)]">{formatDate(dueDate)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--color-text-muted)]">Tahsil edildiği an</dt>
                <dd className="text-right font-medium text-[var(--color-text)]">
                  {initialPaidAt ? formatDateTime(initialPaidAt) : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--color-text-muted)]">Tahsil edilen tutar</dt>
                <dd className="text-right font-medium text-[var(--color-text)]">{formatMoney(defaultAmount)}</dd>
              </div>
              {suggestedAmount != null && suggestedAmount !== defaultAmount ? (
                <>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[var(--color-text-muted)]">Planlanan / önerilen tutar</dt>
                    <dd className="text-right text-[var(--color-text)]">{formatMoney(suggestedAmount)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[var(--color-text-muted)]">Fark</dt>
                    <dd className="text-right text-[var(--color-text)]">
                      {defaultAmount - suggestedAmount > 0 ? "+" : ""}
                      {formatMoney(defaultAmount - suggestedAmount)}
                    </dd>
                  </div>
                </>
              ) : null}
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--color-text-muted)]">Yöntem</dt>
                <dd className="text-right text-[var(--color-text)]">{methodLabel}</dd>
              </div>
              {note.trim() ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--color-text-muted)]">Referans / not</dt>
                  <dd className="text-right text-[var(--color-text)]">{note.trim()}</dd>
                </div>
              ) : null}
              {adjustmentReason?.trim() ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--color-text-muted)]">Kısmi tahsilat gerekçesi</dt>
                  <dd className="text-right text-[var(--color-text)]">{adjustmentReason.trim()}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--color-text-muted)]">Tahsil eden</dt>
                <dd className="text-right text-[var(--color-text)]">{collectorName?.trim() || "Kayıtlı değil"}</dd>
              </div>
              {sourceLabel ? (
                <div className="flex justify-between gap-3 border-t border-[var(--color-border)] pt-2">
                  <dt className="text-[var(--color-text-muted)]">Kaynak</dt>
                  <dd className="text-right text-xs font-medium text-[var(--color-text)]">{sourceLabel}</dd>
                </div>
              ) : null}
            </dl>
            {collectionSummary ? (
              <p className="mt-3 text-xs leading-relaxed text-[var(--color-text-muted)]">{collectionSummary}</p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[var(--color-border)] px-3.5 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
              >
                Kapat
              </button>
              <button
                type="button"
                onClick={() => setStep("form")}
                className="rounded-lg bg-[var(--color-primary)] px-3.5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
              >
                Düzenle
              </button>
            </div>
          </>
        ) : null}

        {step === "form" ? (
          <>
            <h2 id={titleId} className="text-base font-semibold text-[var(--color-text)]">
              Ödemeyi düzenle
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{studentName}</p>
            {sourceLabel ? (
              <p className="mt-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2.5 py-1.5 text-[11px] text-[var(--color-text-muted)]">
                {sourceLabel} — kaydı düzenleyebilirsiniz.
              </p>
            ) : null}

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Ödeme yöntemi</label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]"
                >
                  {METHOD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
                  Tahsil edilen tutar (TL)
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
                  Tahsilat tarihi ve saati
                </label>
                <input
                  type="datetime-local"
                  value={paidAtLocal}
                  onChange={(e) => setPaidAtLocal(e.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]"
                />
                {dueDate ? (
                  <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">Vade: {formatDate(dueDate)} (ayrı alan)</p>
                ) : null}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
                  Açıklama / referans (isteğe bağlı)
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Örn. dekont no, kim aldı"
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]"
                />
              </div>
            </div>

            {error ? (
              <p className="mt-2 text-xs font-medium text-[var(--color-danger)]" role="alert">
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStep("summary")}
                className="rounded-lg border border-[var(--color-border)] px-3.5 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={goToConfirm}
                className="rounded-lg bg-[var(--color-primary)] px-3.5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
              >
                Devam et
              </button>
            </div>
          </>
        ) : null}

        {step === "confirm" ? (
          <>
            <h2 id={titleId} className="text-base font-semibold text-[var(--color-text)]">
              Ödemeyi kaydetmek istediğinize emin misiniz?
            </h2>
            <div className="mt-3 space-y-1 rounded-lg bg-[var(--color-surface-muted)] p-3 text-sm text-[var(--color-text)]">
              <p>
                <span className="text-[var(--color-text-muted)]">Öğrenci:</span> {studentName}
              </p>
              <p>
                <span className="text-[var(--color-text-muted)]">Tutar:</span> {formatMoney(parsedAmount)}
              </p>
              <p>
                <span className="text-[var(--color-text-muted)]">Yöntem:</span> {methodLabel}
              </p>
              <p>
                <span className="text-[var(--color-text-muted)]">Tahsilat anı:</span>{" "}
                {formatDateTime(datetimeLocalToIso(paidAtLocal))}
              </p>
              {note.trim() ? (
                <p>
                  <span className="text-[var(--color-text-muted)]">Not:</span> {note.trim()}
                </p>
              ) : null}
            </div>
            {error ? (
              <p className="mt-2 text-xs font-medium text-[var(--color-danger)]" role="alert">
                {error}
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStep("form")}
                disabled={submitting}
                className="rounded-lg border border-[var(--color-border)] px-3.5 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] disabled:opacity-50"
              >
                Geri dön
              </button>
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={submitting}
                className="rounded-lg bg-[var(--color-success)] px-3.5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? "Kaydediliyor…" : "Evet, kaydet"}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
