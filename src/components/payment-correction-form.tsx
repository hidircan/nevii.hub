"use client";

/**
 * 2026-10-20 — MEVCUT bir tahsilatı düzeltme formu (yeni tahsilat AÇMAZ).
 * `PATCH /api/v1/payments/:id` (updatePaymentTool) — sözleşme ekranındaki ilk
 * tahsilat düzeltmesiyle aynı uç nokta. Yalnız gerçekten değişen alanlar
 * gönderilir; audit diff'i de yalnız onları yazar. Yoklama Takvimi ve Ödemeler
 * detayı bu tek bileşeni kullanır.
 */
import { useState } from "react";
import { apiFetch } from "@/lib/api/client-fetch";

export type CorrectablePayment = {
  paymentId: string;
  /** Satırın TOPLAM tahsil edilen tutarı (çok aylı tahsilatta ay payı değil). */
  paidAmount: number;
  paidAt?: string;
  method?: string;
  note?: string;
};

function istanbulDay(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
}

export function PaymentCorrectionForm({
  payment,
  onSaved,
  onCancel,
}: {
  payment: CorrectablePayment;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const initial = {
    amount: String(payment.paidAmount),
    date: istanbulDay(payment.paidAt),
    method: payment.method ?? "",
    note: payment.note ?? "",
  };
  const [amount, setAmount] = useState(initial.amount);
  const [date, setDate] = useState(initial.date);
  const [method, setMethod] = useState(initial.method);
  const [note, setNote] = useState(initial.note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const body: Record<string, unknown> = {};
    if (amount !== initial.amount) {
      const n = Number(amount);
      if (!Number.isFinite(n) || n <= 0) {
        setError("Tahsil edilen tutar sıfırdan büyük olmalı. Tahsilatı tamamen geri almak için Ödemeler ekranından silin.");
        return;
      }
      body.amount = n;
    }
    if (date !== initial.date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        setError("Tahsilat tarihini takvimden seçin.");
        return;
      }
      body.paidAt = date;
    }
    if (method !== initial.method && method) body.method = method;
    if (note.trim() !== initial.note.trim()) body.paymentNote = note.trim();
    if (Object.keys(body).length === 0) {
      onCancel();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/v1/payments/${encodeURIComponent(payment.paymentId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok: boolean; error?: { message?: string } };
      if (!json.ok) {
        setError(json.error?.message ?? "Tahsilat güncellenemedi. Sayfayı yenileyip tekrar deneyin.");
        return;
      }
      onSaved();
    } catch {
      setError("Sunucuya ulaşılamadı; bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs";
  return (
    <div className="mt-1 space-y-1.5 rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-surface-muted)] p-2 text-[11px]">
      <p className="font-semibold text-[var(--color-text)]">Tahsilatı düzelt — mevcut kayıt güncellenir, yeni tahsilat açılmaz</p>
      <div className="grid grid-cols-2 gap-1.5">
        <label className="space-y-0.5">
          <span className="text-[10px] text-[var(--color-text-muted)]">Tahsil edilen tutar</span>
          <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className={field} />
        </label>
        <label className="space-y-0.5">
          <span className="text-[10px] text-[var(--color-text-muted)]">Tahsilat tarihi</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
        </label>
        <label className="space-y-0.5">
          <span className="text-[10px] text-[var(--color-text-muted)]">Ödeme şekli</span>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={field}>
            {initial.method ? null : <option value="">Belirtilmemiş</option>}
            <option value="cash">Nakit</option>
            <option value="transfer">Havale</option>
            <option value="credit_card">Kredi Kartı</option>
          </select>
        </label>
        <label className="space-y-0.5">
          <span className="text-[10px] text-[var(--color-text-muted)]">Not</span>
          <input type="text" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={field} />
        </label>
      </div>
      {error ? <p className="font-medium text-[var(--color-danger)]" role="alert">{error}</p> : null}
      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={onCancel} className="rounded-md px-2 py-1 font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
          Vazgeç
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="rounded-md bg-[var(--color-primary)] px-2.5 py-1 font-semibold text-[var(--color-text-inverted)] disabled:opacity-70"
        >
          {busy ? "Kaydediliyor…" : "Düzeltmeyi kaydet"}
        </button>
      </div>
    </div>
  );
}
