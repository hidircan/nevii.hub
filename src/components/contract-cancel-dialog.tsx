"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CalendarX, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { friendlyApiErrorMessage } from "@/lib/api/friendly-error";

type CancellationImpact = {
  contractId: string;
  contractNumber: string;
  versionNumber: number;
  status: string;
  studentId: string;
  studentName: string;
  cancellable: boolean;
  cancellableBlockReason?: string;
  isCurrent: boolean;
  installmentCount: number;
  collectedAmount: number;
  outstandingAmount: number;
  unpaidInstallmentCount: number;
  futureLessonCount: number;
  lockedLessonCount: number;
  lockedReasons: string[];
  criticalPasswordConfigured: boolean;
};

type CancelResult = {
  cancelledLessonIds: string[];
  keptLessons: { lessonId: string; reason: string }[];
};

function formatTL(n: number) {
  return new Intl.NumberFormat("tr-TR").format(n) + " ₺";
}

/**
 * Sözleşme iptali — GÜVENLİ iki aşamalı onay (10. tur iş #9; ders-etkisi
 * kuralları 2026-09-20'den beri aynı).
 *
 * 1. adım: etki özeti (taksit/tahsilat/borç + gelecek dersler) ve ders
 *    seçimi. Varsayılan GÜVENLİ olandır: dersler kalır. "İşlendi"/telafi
 *    işaretli dersler hiçbir koşulda silinmez (bkz. lesson-cancel-rules.ts).
 * 2. adım: gerekçe + sözleşme numarasını aynen yazma + kritik işlem şifresi.
 *    Sunucu (cancelStudentContractTool) aynı kuralları ayrıca uygular ve her
 *    denemeyi audit'e yazar. Sözleşme SİLİNMEZ, arşivde kalır.
 *
 * Odak: 10. tur iş #5 deseni — YALNIZCA açılış geçişinde panele alınır,
 * kapanışta tetikleyiciye döner; `busy` değişimi odağı çekmez.
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
  const [step, setStep] = useState<1 | 2>(1);
  const [impact, setImpact] = useState<CancellationImpact | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alsoCancelLessons, setAlsoCancelLessons] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmationNumber, setConfirmationNumber] = useState("");
  const [password, setPassword] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(busy);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    busyRef.current = busy;
  });

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busyRef.current) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      triggerRef.current?.focus?.();
    };
  }, [open]);

  async function openDialog() {
    setOpen(true);
    setStep(1);
    setError(null);
    setImpact(null);
    setAlsoCancelLessons(false);
    setReason("");
    setConfirmationNumber("");
    setPassword("");
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/contracts/${contractId}/cancellation-impact`, { method: "GET" });
      const payload = (await res.json().catch(() => null)) as
        | { data?: CancellationImpact; error?: { code?: string; message?: string } }
        | null;
      if (!res.ok || !payload?.data) {
        setImpact(null);
        setError(
          friendlyApiErrorMessage(
            payload?.error,
            "İptal etkisi okunamadı. Etki özeti olmadan iptal yapılamaz; sayfayı yenileyip tekrar deneyin."
          )
        );
        return;
      }
      setImpact(payload.data);
    } catch {
      setImpact(null);
      setError("Sunucuya ulaşılamadı. Etki özeti olmadan iptal yapılamaz; bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/contracts/${contractId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cancelFutureLessons: alsoCancelLessons,
          reason: reason.trim(),
          confirmationNumber: confirmationNumber.trim(),
          criticalPassword: password,
        }),
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
      setPassword("");
    }
  }

  const cancellable = impact ? impact.futureLessonCount - impact.lockedLessonCount : 0;
  const canSubmit =
    !!impact?.cancellable &&
    !!impact?.criticalPasswordConfigured &&
    reason.trim().length >= 5 &&
    confirmationNumber.trim().length > 0 &&
    password.length > 0;

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
              {contractNumber} iptal edilecek ({step}/2)
            </h3>

            <p className="mt-2 text-xs text-[var(--color-text-muted)]">
              Sözleşme <strong>silinmez</strong>, “İptal edildi” olarak işaretlenir ve arşivde kalır. Taksit
              satırları ve tahsil edilmiş ödemeler korunur.
            </p>

            {loading || (!impact && !error) ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> İptal etkisi hesaplanıyor…
              </p>
            ) : null}

            {impact && step === 1 ? (
              <div className="mt-3 space-y-3 text-xs">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
                  <dt className="text-[var(--color-text-muted)]">Öğrenci</dt>
                  <dd className="font-medium">{impact.studentName}</dd>
                  <dt className="text-[var(--color-text-muted)]">Sürüm</dt>
                  <dd className="font-medium">
                    v{impact.versionNumber}
                    {impact.isCurrent ? " (güncel sözleşme — iptalden sonra öğrencinin güncel sözleşmesi kalmaz)" : ""}
                  </dd>
                  <dt className="text-[var(--color-text-muted)]">Taksit</dt>
                  <dd className="font-medium">
                    {impact.installmentCount} ({impact.unpaidInstallmentCount} ödenmemiş)
                  </dd>
                  <dt className="text-[var(--color-text-muted)]">Tahsil edilen</dt>
                  <dd className="font-medium">{formatTL(impact.collectedAmount)}</dd>
                  <dt className="text-[var(--color-text-muted)]">Açık borç</dt>
                  <dd
                    className="font-medium"
                    style={impact.outstandingAmount > 0 ? { color: "var(--color-danger)" } : undefined}
                  >
                    {formatTL(impact.outstandingAmount)}
                  </dd>
                  <dt className="text-[var(--color-text-muted)]">Gelecek ders</dt>
                  <dd className="font-medium">{impact.futureLessonCount}</dd>
                </dl>

                {!impact.cancellable ? (
                  <p className="rounded-md border px-3 py-2 font-medium" style={{ borderColor: "var(--color-danger)", color: "var(--color-danger)" }}>
                    {impact.cancellableBlockReason ?? "Bu sözleşme iptal edilemez."}
                  </p>
                ) : impact.futureLessonCount > 0 ? (
                  <div
                    className="rounded-[var(--radius-md)] border p-3"
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
                ) : (
                  <p className="text-sm text-[var(--color-text-muted)]">
                    Bu sözleşmeden üretilmiş gelecek ders yok; ders programı etkilenmeyecek.
                  </p>
                )}

                {impact.cancellable && !impact.criticalPasswordConfigured ? (
                  <p className="rounded-md border px-3 py-2" style={{ borderColor: "var(--color-warning)", color: "var(--color-warning)" }}>
                    Kritik işlem şifresi belirlenmemiş; iptal yapılamaz.{" "}
                    <Link href="/panel/ayarlar/guvenlik" className="font-semibold underline">
                      Ayarlar → Güvenlik
                    </Link>{" "}
                    ekranından belirleyin.
                  </p>
                ) : null}

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                    Vazgeç
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={!impact.cancellable || !impact.criticalPasswordConfigured}
                    onClick={() => setStep(2)}
                  >
                    Devam et
                  </Button>
                </div>
              </div>
            ) : null}

            {impact && step === 2 ? (
              <div className="mt-3 space-y-3 text-xs">
                <p className="rounded-md px-3 py-2 font-medium" style={{ background: "var(--color-danger-soft)", color: "var(--color-danger)" }}>
                  {impact.contractNumber} iptal edilecek. Bu işlem GERİ ALINAMAZ; kayıt arşivde kalır.
                </p>
                <label className="block">
                  <span className="font-medium text-[var(--color-text)]">İptal gerekçesi (en az 5 karakter)</span>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    maxLength={500}
                    aria-label="İptal gerekçesi"
                    className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm"
                    placeholder="Örn. Veli talebiyle kayıt donduruldu"
                  />
                </label>
                <label className="block">
                  <span className="font-medium text-[var(--color-text)]">
                    Onay için sözleşme numarasını aynen yazın: <strong>{impact.contractNumber}</strong>
                  </span>
                  <input
                    value={confirmationNumber}
                    onChange={(e) => setConfirmationNumber(e.target.value)}
                    autoComplete="off"
                    className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="font-medium text-[var(--color-text)]">Kritik işlem şifresi</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="off"
                    className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm"
                  />
                </label>
                <div className="flex justify-between gap-2">
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => setStep(1)}>
                    Geri
                  </Button>
                  <Button type="button" variant="danger" disabled={!canSubmit || busy} onClick={() => void confirm()}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                    <CalendarX className="mr-1.5 h-4 w-4" aria-hidden />
                    {busy
                      ? "İptal ediliyor…"
                      : alsoCancelLessons
                        ? `Sözleşmeyi ve ${cancellable} dersi iptal et`
                        : "Sözleşmeyi iptal et"}
                  </Button>
                </div>
              </div>
            ) : null}

            {error ? (
              <p className="mt-3 text-sm font-medium" role="alert" style={{ color: "var(--color-danger)" }}>
                {error}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
