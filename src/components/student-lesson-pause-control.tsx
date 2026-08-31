"use client";

/**
 * Nilüfer Acar politikası §1E — ödeme nedeniyle ders programının GEÇİCİ,
 * YETKİLİ ve GEREKÇELİ duraklatılması. Backend (pauseStudentLessonScheduleTool
 * / reactivateStudentLessonScheduleTool, src/lib/services/tools.ts) hazırdı;
 * bu bileşen daha önce eksik olan admin UI'ı sağlar. Otomatik tetikleyici
 * YOK — yalnızca bu ekrandan insan kararıyla çağrılır.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionPauseStudentLessonSchedule, actionReactivateStudentLessonSchedule } from "@/lib/actions";
import { Button, Label } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export function StudentLessonPauseControl({
  studentId,
  canManage,
  paymentPauseStatus,
  paymentPausedAt,
  paymentPauseReason,
}: {
  studentId: string;
  canManage: boolean;
  paymentPauseStatus?: string | null;
  paymentPausedAt?: string | null;
  paymentPauseReason?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [showReasonForm, setShowReasonForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPaused = paymentPauseStatus === "paused";

  function submitPause() {
    if (!reason.trim()) {
      setError("Duraklatma gerekçesi zorunludur.");
      return;
    }
    if (!window.confirm("Bu öğrencinin ders programını ödeme nedeniyle duraklatmak istediğinize emin misiniz? Yeni ders üretilmeyecek, mevcut kayıtlar silinmeyecek.")) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await actionPauseStudentLessonSchedule({ studentId, reason: reason.trim() });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setShowReasonForm(false);
      setReason("");
      router.refresh();
    });
  }

  function submitReactivate() {
    if (!window.confirm("Bu öğrencinin ders programını yeniden aktifleştirmek istediğinize emin misiniz?")) return;
    setError(null);
    startTransition(async () => {
      const result = await actionReactivateStudentLessonSchedule({ studentId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mb-6 rounded-lg border border-[var(--color-border)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text)]">
            Ders Programı Durumu:{" "}
            <span className={isPaused ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}>
              {isPaused ? "Ödeme Nedeniyle Geçici Olarak Duraklatıldı" : "Aktif"}
            </span>
          </p>
          {isPaused ? (
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {paymentPausedAt ? `${formatDate(paymentPausedAt)} tarihinden beri` : null}
              {paymentPauseReason ? ` — Gerekçe: ${paymentPauseReason}` : null}
            </p>
          ) : null}
        </div>
        {canManage ? (
          isPaused ? (
            <Button type="button" variant="secondary" disabled={pending} onClick={submitReactivate}>
              Ders Planını Yeniden Aktifleştir
            </Button>
          ) : !showReasonForm ? (
            <Button type="button" variant="secondary" disabled={pending} onClick={() => setShowReasonForm(true)}>
              Ders Planını Geçici Olarak Duraklat
            </Button>
          ) : null
        ) : null}
      </div>

      {showReasonForm && !isPaused ? (
        <div className="mt-3 space-y-2">
          <Label>Duraklatma gerekçesi (zorunlu)</Label>
          <textarea
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)] focus:ring-2 focus:ring-[var(--color-focus-ring)]/30"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="Örn. 2 aydır ödeme yapılmıyor, aile ile görüşüldü."
          />
          <div className="flex gap-2">
            <Button type="button" disabled={pending} onClick={submitPause}>
              Duraklatmayı Onayla
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setShowReasonForm(false)}>
              Vazgeç
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-[var(--color-danger)]">{error}</p> : null}
    </div>
  );
}
