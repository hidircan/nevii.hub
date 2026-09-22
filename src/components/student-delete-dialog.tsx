"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { actionDeleteStudent, actionGetStudentDeletionImpact, actionRestoreDeletedStudent } from "@/lib/actions";
import type { StudentDeletionImpact } from "@/lib/services/tools";

function formatTL(n: number) {
  return new Intl.NumberFormat("tr-TR").format(n) + " ₺";
}

/**
 * Öğrenci silme — yalnız kurum sahibi, iki aşamalı (2026-09-22).
 *
 * 1. adım: etki özeti (sözleşme, ödeme, ders, evrak, açık borç) + yöntem seçimi.
 *    Varsayılan GERİ ALINABİLİR silmedir; kalıcı silme yalnız hiçbir bağlı kaydı
 *    olmayan öğrencide seçilebilir.
 * 2. adım: gerekçe + öğrencinin adını aynen yazma + kritik işlem şifresi.
 * Sunucu (deleteStudentTool) aynı kuralları ayrıca uygular ve her denemeyi audit'e yazar.
 */
export function StudentDeleteDialog({ studentId, studentName }: { studentId: string; studentName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [impact, setImpact] = useState<StudentDeletionImpact | null>(null);
  const [mode, setMode] = useState<"soft" | "hard">("soft");
  const [reason, setReason] = useState("");
  const [confirmationName, setConfirmationName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    setStep(1);
    setMode("soft");
    setReason("");
    setConfirmationName("");
    setPassword("");
    setError(null);
    setImpact(null);
    const res = await actionGetStudentDeletionImpact(studentId);
    if (res.ok) setImpact(res.data);
    else setError(res.message);
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await actionDeleteStudent({ studentId, mode, confirmationName, criticalPassword: password, reason });
    setBusy(false);
    setPassword("");
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setOpen(false);
    router.push(res.data.mode === "hard" ? "/panel/ogrenciler" : `/panel/ogrenciler/${studentId}`);
    router.refresh();
  }

  const canSubmit =
    !!impact?.criticalPasswordConfigured && reason.trim().length >= 5 && confirmationName.trim().length > 0 && password.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => void openDialog()}
        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-danger-soft)]"
        style={{ borderColor: "var(--color-danger)", color: "var(--color-danger)" }}
      >
        Öğrenciyi sil
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
            aria-labelledby={`delete-title-${studentId}`}
            className="w-full max-w-lg rounded-t-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-md)] outline-none sm:rounded-[var(--radius-lg)]"
          >
            <h3 id={`delete-title-${studentId}`} className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
              <AlertTriangle className="h-4 w-4" style={{ color: "var(--color-danger)" }} aria-hidden />
              {studentName} — öğrenciyi sil ({step}/2)
            </h3>

            {!impact && !error ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Etki hesaplanıyor…
              </p>
            ) : null}

            {impact && step === 1 ? (
              <div className="mt-3 space-y-3 text-xs">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
                  <dt className="text-[var(--color-text-muted)]">Öğrenci no</dt>
                  <dd className="font-medium">{impact.displayId ?? "—"}</dd>
                  <dt className="text-[var(--color-text-muted)]">Sözleşme</dt>
                  <dd className="font-medium">
                    {impact.contractCount} {impact.hasCurrentContract ? "(güncel sözleşme VAR)" : ""}
                  </dd>
                  <dt className="text-[var(--color-text-muted)]">Ödeme kaydı</dt>
                  <dd className="font-medium">{impact.paymentCount}</dd>
                  <dt className="text-[var(--color-text-muted)]">Tahsil edilen</dt>
                  <dd className="font-medium">{formatTL(impact.collectedAmount)}</dd>
                  <dt className="text-[var(--color-text-muted)]">Açık borç</dt>
                  <dd className="font-medium" style={impact.outstandingAmount > 0 ? { color: "var(--color-danger)" } : undefined}>
                    {formatTL(impact.outstandingAmount)}
                  </dd>
                  <dt className="text-[var(--color-text-muted)]">Ders</dt>
                  <dd className="font-medium">
                    {impact.lessonCount} (yaklaşan {impact.upcomingLessonCount})
                  </dd>
                  <dt className="text-[var(--color-text-muted)]">Evrak</dt>
                  <dd className="font-medium">{impact.documentCount}</dd>
                </dl>

                <fieldset className="space-y-2">
                  <legend className="mb-1 font-semibold text-[var(--color-text)]">Silme yöntemi</legend>
                  <label className="flex items-start gap-2">
                    <input type="radio" name="mode" checked={mode === "soft"} onChange={() => setMode("soft")} />
                    <span>
                      <strong>Geri alınabilir silme (önerilen).</strong> Öğrenci listelerden kaybolur ve pasife alınır.
                      Sözleşme, ödeme, evrak ve audit kayıtları korunur; kurum sahibi Silinenler&apos;den geri alabilir.
                    </span>
                  </label>
                  <label className={`flex items-start gap-2 ${impact.hardDeleteEligible ? "" : "opacity-50"}`}>
                    <input
                      type="radio"
                      name="mode"
                      disabled={!impact.hardDeleteEligible}
                      checked={mode === "hard"}
                      onChange={() => setMode("hard")}
                    />
                    <span>
                      <strong>Kalıcı silme — GERİ ALINAMAZ.</strong>{" "}
                      {impact.hardDeleteEligible
                        ? "Bu öğrencinin hiçbir bağlı kaydı yok; kayıt tamamen silinir."
                        : "Kullanılamaz: sözleşme, ödeme, ders, yoklama veya evrak kaydı olan öğrenci kalıcı silinemez."}
                    </span>
                  </label>
                </fieldset>

                {!impact.criticalPasswordConfigured ? (
                  <p className="rounded-md border px-3 py-2" style={{ borderColor: "var(--color-warning)", color: "var(--color-warning)" }}>
                    Kritik işlem şifresi belirlenmemiş; silme yapılamaz.{" "}
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
                  <Button type="button" variant="danger" disabled={!impact.criticalPasswordConfigured} onClick={() => setStep(2)}>
                    Devam et
                  </Button>
                </div>
              </div>
            ) : null}

            {impact && step === 2 ? (
              <div className="mt-3 space-y-3 text-xs">
                <p className="rounded-md px-3 py-2 font-medium" style={{ background: "var(--color-danger-soft)", color: "var(--color-danger)" }}>
                  {mode === "hard"
                    ? "Kalıcı silme seçildi. Bu işlem GERİ ALINAMAZ."
                    : "Geri alınabilir silme seçildi. Öğrenci Silinenler listesinden geri alınabilir."}
                </p>
                <label className="block">
                  <span className="font-medium text-[var(--color-text)]">Silme gerekçesi</span>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value.slice(0, 500))}
                    rows={2}
                    className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm"
                    placeholder="Örn. Deneme kaydı, yanlışlıkla iki kez oluşturuldu"
                  />
                </label>
                <label className="block">
                  <span className="font-medium text-[var(--color-text)]">
                    Onay için öğrencinin adını aynen yazın: <strong>{impact.name}</strong>
                  </span>
                  <input
                    value={confirmationName}
                    onChange={(e) => setConfirmationName(e.target.value)}
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
                  <Button type="button" variant="danger" disabled={!canSubmit || busy} onClick={() => void submit()}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {mode === "hard" ? "Kalıcı olarak sil" : "Öğrenciyi sil"}
                  </Button>
                </div>
              </div>
            ) : null}

            {error ? (
              <p className="mt-3 text-xs font-medium" role="alert" style={{ color: "var(--color-danger)" }}>
                {error}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Silinmiş öğrencinin detayında: açık durum bandı + kurum sahibi için geri alma. */
export function StudentDeletedBanner({
  studentId,
  deletedAtLabel,
  deletedBy,
  reason,
  canRestore,
}: {
  studentId: string;
  deletedAtLabel: string;
  deletedBy: string;
  reason?: string;
  canRestore: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    setBusy(true);
    setError(null);
    const res = await actionRestoreDeletedStudent(studentId);
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mb-4 rounded-[var(--radius-md)] border px-3 py-2.5 text-sm" style={{ borderColor: "var(--color-danger)", background: "var(--color-danger-soft)" }}>
      <p className="font-semibold" style={{ color: "var(--color-danger)" }}>
        Bu öğrenci silindi (geri alınabilir) — {deletedAtLabel}, {deletedBy}.
      </p>
      {reason ? <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">Gerekçe: {reason}</p> : null}
      <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
        Sözleşme, ödeme ve evrak kayıtları korunuyor. Geri alındığında öğrenci pasif olarak döner.
      </p>
      {canRestore ? (
        <div className="mt-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void restore()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Silmeyi geri al
          </Button>
        </div>
      ) : null}
      {error ? (
        <p className="mt-1 text-xs font-medium" role="alert" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
