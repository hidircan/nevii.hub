"use client";

/**
 * Rapor portalı (2026-10-14) — 4 haftalık genel gelişim değerlendirmesi (PeriodicAssessment). `/gelisim` ve
 * öğretmen portalının "4 Haftalık Değerlendirme" listesi AYNI bileşeni kullanır. Mevcut API: POST /api/v1/periodic-assessments.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchJson } from "@/lib/api/client-fetch";
import { formatDate } from "@/lib/utils";
import { FieldTextarea, FormSection, SubmitBar, SuccessPanel, reportErrorMessage } from "./form-parts";
import { useFormDraft } from "./use-form-draft";

type Draft = {
  overallProgressNote: string;
  strengthsNote: string;
  areasForImprovementNote: string;
  recommendationNote: string;
};

export function PeriodicAssessmentMobileForm({
  studentId,
  period,
  draftOwner,
  doneHref,
  onSubmitted,
}: {
  studentId: string;
  /** Taslak anahtarı için öğretmen kimliği. */
  draftOwner: string;
  period: { periodStart: string; periodEnd: string };
  doneHref?: { href: string; label: string };
  onSubmitted?: () => void;
}) {
  const router = useRouter();
  const { value: d, update, clear, restored } = useFormDraft<Draft>(
    `nevii:rapor:donem:${draftOwner}:${studentId}:${period.periodStart}`,
    { overallProgressNote: "", strengthsNote: "", areasForImprovementNote: "", recommendationNote: "" }
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <SuccessPanel
        title="Değerlendirme gönderildi"
        description="4 haftalık değerlendirme kaydedildi ve yöneticiye bildirildi."
        primary={doneHref}
      />
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!d.overallProgressNote.trim()) {
      setError("Genel gelişim değerlendirmesi alanını doldurun.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await apiFetchJson("/api/v1/periodic-assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        overallProgressNote: d.overallProgressNote.trim(),
        strengthsNote: d.strengthsNote.trim() || undefined,
        areasForImprovementNote: d.areasForImprovementNote.trim() || undefined,
        recommendationNote: d.recommendationNote.trim() || undefined,
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(reportErrorMessage(result.error, "Değerlendirme gönderilemedi. Bağlantınızı kontrol edip tekrar deneyin."));
      return;
    }
    clear();
    setDone(true);
    onSubmitted?.();
    router.refresh();
  }

  const key = `${studentId}-${period.periodStart}`;
  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-4" noValidate>
      {restored ? (
        <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
          Bu cihazda yarım kalan taslağınız geri yüklendi.
        </p>
      ) : null}
      <FormSection title="Dönem" description={`${formatDate(period.periodStart)} – ${formatDate(period.periodEnd)}`}>
        <FieldTextarea
          id={`genel-${key}`}
          label="Genel gelişim değerlendirmesi"
          required
          rows={4}
          maxLength={4000}
          value={d.overallProgressNote}
          onChange={(v) => update({ overallProgressNote: v })}
        />
        <FieldTextarea id={`guclu-${key}`} label="Güçlü yönler" rows={2} maxLength={2000} value={d.strengthsNote} onChange={(v) => update({ strengthsNote: v })} />
        <FieldTextarea
          id={`alan-${key}`}
          label="Gelişime açık alanlar"
          rows={2}
          maxLength={2000}
          value={d.areasForImprovementNote}
          onChange={(v) => update({ areasForImprovementNote: v })}
        />
        <FieldTextarea id={`oneri-${key}`} label="Öneriler" rows={2} maxLength={2000} value={d.recommendationNote} onChange={(v) => update({ recommendationNote: v })} />
      </FormSection>
      <SubmitBar busy={busy} label="Değerlendirmeyi gönder" error={error} />
    </form>
  );
}
