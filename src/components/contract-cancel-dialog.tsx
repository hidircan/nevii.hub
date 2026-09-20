"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CalendarX, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { friendlyApiErrorMessage } from "@/lib/api/friendly-error";

type LessonImpact = {
  futureLessonCount: number;
  lockedLessonCount: number;
  lockedReasons: string[];
};

type CancelResult = {
  cancelledLessonIds: string[];
  keptLessons: { lessonId: string; reason: string }[];
};

/**
 * Sözleşme iptali — ETKİ GÖSTEREN onay akışı (2026-09-20).
 *
 * Önce yalnız "İptal et" butonu vardı ve tek tıkla sözleşme iptal oluyordu.
 * Sözleşmeden ders programı üretilebildiği için (bkz. K) artık iptalin bir
 * yan etkisi olabilir: o sözleşmeden doğmuş GELECEK dersler.
 *
 * Ürün kuralı: **sessiz/otomatik silme YOKTUR.** Diyalog önce etkiyi sorar
 * (kaç ders, kaçı kural gereği iptal edilemez), sonra kullanıcıya iki ayrı
 * ve açıkça yazılmış seçenek sunar. Varsayılan GÜVENLİ olandır: dersler
 * kalır. "İşlendi"/telafi işaretli dersler hiçbir koşulda silinmez —
 * hakediş ve telafi hakkı onlara bağlıdır (bkz. lesson-cancel-rules.ts).
 */
export function ContractCancelDialog({
  contractId,
  contractNumber,
  onCancelled,
}: {
  contractId: string;
  contractNumber: string;
  onCancelled: (summary: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [impact, setImpact] = useState<LessonImpact | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alsoCancelLessons, setAlsoCancelLessons] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy]);

  async function openDialog() {
    setOpen(true);
    setError(null);
    setAlsoCancelLessons(false);
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/contracts/${contractId}/lesson-schedule`, { method: "GET" });
      const payload = (await res.json().catch(() => null)) as
        | { data?: LessonImpact; error?: { code?: string; message?: string } }
        | null;
      if (!res.ok || !payload?.data) {
        // Etki okunamazsa iptali ENGELLEMEYİZ — ama ders sayısını da uydurmayız.
        setImpact(null);
        setError(
          friendlyApiErrorMessage(
            payload?.error,
            "Bu sözleşmeden üretilmiş ders sayısı okunamadı. Yine de iptal edebilirsiniz; dersler otomatik silinmez."
          )
        );
        return;
      }
      setImpact(payload.data);
    } catch {
      setImpact(null);
      setError("Sunucuya ulaşılamadı. Yine de iptal edebilirsiniz; dersler otomatik silinmez.");
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/contracts/${contractId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelFutureLessons: alsoCancelLessons }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { data?: CancelResult; error?: { code?: string; message?: string } }
        | null;
      if (!res.ok) {
        setError(friendlyApiErrorMessage(payload?.error, payload?.error?.message ?? "Sözleşme iptal edilemedi."));
        return;
      }
      const cancelled = payload?.data?.cancelledLessonIds.length ?? 0;
      const kept = payload?.data?.keptLessons.length ?? 0;
      setOpen(false);
      onCancelled(
        `${contractNumber} iptal edildi.` +
          (cancelled > 0 ? ` ${cancelled} gelecek ders de iptal edildi.` : "") +
          (kept > 0 ? ` ${kept} ders kuralları gereği korundu (işlendi/telafi işaretli).` : "")
      );
    } catch {
      setError("Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  const cancellable = impact ? impact.futureLessonCount - impact.lockedLessonCount : 0;

  return (
    <>
      <button
        type="button"
        onClick={() => void openDialog()}
        className="font-medium text-rose-600 hover:underline"
      >
        İptal et
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`cancel-title-${contractId}`}
            className="w-full max-w-lg rounded-t-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-md)] outline-none sm:rounded-[var(--radius-lg)]"
          >
            <h3
              id={`cancel-title-${contractId}`}
              className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]"
            >
              <AlertTriangle className="h-4 w-4" style={{ color: "var(--color-danger)" }} aria-hidden />
              {contractNumber} iptal edilecek
            </h3>

            <p className="mt-2 text-xs text-[var(--color-text-muted)]">
              Sözleşme <strong>silinmez</strong>, “İptal edildi” olarak işaretlenir ve arşivde kalır. Taksit
              satırları ve tahsil edilmiş ödemeler korunur.
            </p>

            {loading ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Bu sözleşmeye bağlı dersler kontrol ediliyor…
              </p>
            ) : impact && impact.futureLessonCount > 0 ? (
              <div
                className="mt-3 rounded-[var(--radius-md)] border p-3"
                style={{
                  borderColor: "color-mix(in srgb, var(--color-warning) 35%, transparent)",
                  background: "var(--color-warning-soft)",
                }}
              >
                <p className="text-sm font-medium" style={{ color: "var(--color-warning)" }}>
                  Bu sözleşmeden üretilmiş {impact.futureLessonCount} gelecek ders var.
                </p>
                <fieldset className="mt-2 space-y-2">
                  <legend className="sr-only">Derslere ne yapılsın?</legend>
                  <label className="flex items-start gap-2 text-xs text-[var(--color-text)]">
                    <input
                      type="radio"
                      name={`lesson-action-${contractId}`}
                      checked={!alsoCancelLessons}
                      onChange={() => setAlsoCancelLessons(false)}
                      className="mt-0.5"
                    />
                    <span>
                      <strong>Dersler kalsın</strong> (önerilen) — program değişmez; dersleri sonra elle
                      düzenleyebilirsiniz.
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-xs text-[var(--color-text)]">
                    <input
                      type="radio"
                      name={`lesson-action-${contractId}`}
                      checked={alsoCancelLessons}
                      onChange={() => setAlsoCancelLessons(true)}
                      className="mt-0.5"
                    />
                    <span>
                      <strong>{cancellable} gelecek dersi de iptal et</strong>
                      {impact.lockedLessonCount > 0 ? (
                        <>
                          {" "}
                          — {impact.lockedLessonCount} ders kuralları gereği korunur:
                          <span className="block text-[var(--color-text-muted)]">
                            {impact.lockedReasons.join(" ")}
                          </span>
                        </>
                      ) : null}
                    </span>
                  </label>
                </fieldset>
              </div>
            ) : impact ? (
              <p className="mt-3 text-sm text-[var(--color-text-muted)]">
                Bu sözleşmeden üretilmiş gelecek ders yok; ders programı etkilenmeyecek.
              </p>
            ) : null}

            {error ? (
              <p className="mt-3 text-sm font-medium" style={{ color: "var(--color-danger)" }}>
                {error}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
                Vazgeç
              </Button>
              <Button type="button" disabled={busy || loading} onClick={() => void confirm()}>
                <CalendarX className="mr-1.5 h-4 w-4" aria-hidden />
                {busy
                  ? "İptal ediliyor…"
                  : alsoCancelLessons
                    ? `Sözleşmeyi ve ${cancellable} dersi iptal et`
                    : "Sözleşmeyi iptal et"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
