"use client";

/**
 * Rapor portalı — 4 derslik / 4 haftalık genel gelişim değerlendirmesi (PeriodicAssessment).
 *
 * Sıfırdan kompozisyon yazdırmak yerine:
 * 1) Dönemdeki önceki 4 dersin verilerini (puanlar, çalışılan konular, güçlü/gelişim notları)
 *    otomatik özet olarak öğretmenin önüne getirir.
 * 2) Dönem puanlarını önceki 4 ders ortalamasıyla hazır doldurur; öğretmen dilerse tek dokunuşla revize eder.
 * 3) Özet değerlendirme metinlerini 4 ders verisinden sentezler; boş alanlarda bağlama özel silik örnek
 *    cümleler (placeholder) gösterir.
 * 4) "Onaylıyorum ve Raporu Tamamlıyorum" adımıyla yönetici ekranına ve PDF çıktısına hazır kaydeder.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ASSESSMENT_ITEM_LABELS,
  ASSESSMENT_SECTIONS,
  computeOverallScore,
  computeSectionScore,
} from "@/lib/assessment/score";
import {
  DEFAULT_ASSESSMENT_SCORES,
  PERIODIC_REPORT_PLACEHOLDERS,
  type PeriodicAssessmentDraft,
} from "@/lib/reports/guidance";
import type { AssessmentScores } from "@/lib/types";
import { apiFetchJson } from "@/lib/api/client-fetch";
import { formatDate, formatDateTime } from "@/lib/utils";
import {
  FieldTextarea,
  FormSection,
  OptionalSection,
  ScoreSegment,
  SCORE_SCALE_HINT,
  SubmitBar,
  SuccessPanel,
  reportErrorMessage,
} from "./form-parts";
import { useFormDraft } from "./use-form-draft";

type Draft = {
  scores: AssessmentScores;
  overallProgressNote: string;
  strengthsNote: string;
  areasForImprovementNote: string;
  recommendationNote: string;
  teacherSignedName: string;
  approved: boolean;
};

export function PeriodicAssessmentMobileForm({
  studentId,
  period,
  draftSummary,
  teacherName = "",
  draftOwner,
  doneHref,
  onSubmitted,
}: {
  studentId: string;
  /** Taslak anahtarı için öğretmen kimliği. */
  draftOwner: string;
  period: { periodStart: string; periodEnd: string };
  /** Önceki 4 dersten otomatik derlenen özet ve puan önerisi. */
  draftSummary?: PeriodicAssessmentDraft;
  teacherName?: string;
  doneHref?: { href: string; label: string };
  onSubmitted?: () => void;
}) {
  const router = useRouter();
  const initialScores = draftSummary?.suggestedScores ?? DEFAULT_ASSESSMENT_SCORES;
  const synth = draftSummary?.synthesizedNotes;

  const { value: d, update, clear, restored } = useFormDraft<Draft>(
    `nevii:rapor:donem:${draftOwner}:${studentId}:${period.periodStart}`,
    {
      scores: initialScores,
      overallProgressNote: synth?.overallProgressNote ?? "",
      strengthsNote: synth?.strengthsNote ?? "",
      areasForImprovementNote: synth?.areasForImprovementNote ?? "",
      recommendationNote: synth?.recommendationNote ?? "",
      teacherSignedName: teacherName,
      approved: true,
    }
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const currentScores = d.scores ?? initialScores;
  const overallAvg = computeOverallScore(currentScores);

  if (done) {
    return (
      <SuccessPanel
        title="4 haftalık rapor onaylandı"
        description="4 derslik dönem özeti, puanlar ve değerlendirmeniz kaydedilerek yönetici Raporlar ekranına iletildi."
        primary={doneHref}
      />
    );
  }

  function applyAutoSynthesis() {
    if (!draftSummary) return;
    update({
      scores: draftSummary.suggestedScores,
      overallProgressNote:
        draftSummary.synthesizedNotes.overallProgressNote || d.overallProgressNote,
      strengthsNote: draftSummary.synthesizedNotes.strengthsNote || d.strengthsNote,
      areasForImprovementNote:
        draftSummary.synthesizedNotes.areasForImprovementNote || d.areasForImprovementNote,
      recommendationNote:
        draftSummary.synthesizedNotes.recommendationNote || d.recommendationNote,
    });
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!d.overallProgressNote.trim()) {
      setError("Genel gelişim değerlendirmesi alanını kontrol edip doldurun.");
      return;
    }
    if (!d.approved) {
      setError("Kaydetmeden önce 4 derslik rapor özetini onayladığınızı işaretleyin.");
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
        scores: currentScores,
        overallProgressNote: d.overallProgressNote.trim(),
        strengthsNote: d.strengthsNote.trim() || undefined,
        areasForImprovementNote: d.areasForImprovementNote.trim() || undefined,
        recommendationNote: d.recommendationNote.trim() || undefined,
        teacherSignedName: (d.teacherSignedName || teacherName).trim() || undefined,
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
  const lessonSummaries = draftSummary?.lessonSummaries ?? [];
  const hasTopics =
    Boolean(draftSummary?.topicsSummary.piecesWorked.length) ||
    Boolean(draftSummary?.topicsSummary.etudesWorked.length) ||
    Boolean(draftSummary?.topicsSummary.technicalWork.length) ||
    Boolean(draftSummary?.topicsSummary.theoryWork.length);

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-4" noValidate>
      {restored ? (
        <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
          Bu cihazda yarım kalan taslağınız geri yüklendi.
        </p>
      ) : null}

      <FormSection
        title="1. Önceki 4 Dersin Otomatik Özeti"
        description={`${formatDate(period.periodStart)} – ${formatDate(period.periodEnd)} dönemi için sistemdeki ders kayıtlarından derlendi.`}
      >
        <div className="grid grid-cols-3 gap-2 rounded-[var(--radius-md)] bg-[var(--color-surface-muted)] p-3 text-center">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Ders sayısı</p>
            <p className="mt-0.5 text-base font-semibold tabular-nums text-[var(--color-text)]">
              {draftSummary ? `${draftSummary.lessonCount} ders` : "4 hafta"}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Ders raporu</p>
            <p className="mt-0.5 text-base font-semibold tabular-nums text-[var(--color-text)]">
              {draftSummary ? `${draftSummary.assessedLessonCount} kayıt` : "—"}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Dönem puanı</p>
            <p className="mt-0.5 text-base font-semibold tabular-nums text-[var(--color-primary)]">
              {overallAvg.toFixed(1)} / 5
            </p>
          </div>
        </div>

        {lessonSummaries.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-[var(--color-text-muted)]">Dönem içindeki dersler</p>
            <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
              {lessonSummaries.map((item, idx) => (
                <li key={item.lessonId} className="space-y-1 px-3 py-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[var(--color-text)]">
                      {idx + 1}. Ders · {formatDateTime(item.startAt)}
                      {item.instrument ? ` (${item.instrument})` : ""}
                    </span>
                    <span className="rounded px-1.5 py-0.5 font-semibold tabular-nums text-[var(--color-primary)] bg-[var(--color-primary-soft)]">
                      {item.overallScore !== undefined ? `${item.overallScore.toFixed(1)}/5` : "Rapor bekliyor"}
                    </span>
                  </div>
                  {item.piecesWorked || item.etudesWorked || item.technicalWork || item.theoryWork ? (
                    <p className="text-[var(--color-text-muted)]">
                      Çalışılanlar:{" "}
                      {[item.piecesWorked, item.etudesWorked, item.technicalWork, item.theoryWork]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}
                  {item.strengthNote ? (
                    <p className="text-[var(--color-text-muted)]">Not: {item.strengthNote}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-[var(--color-text-muted)]">
            Bu dönemde henüz tekil ders raporu girilmemiş; aşağıdaki alanlardan doğrudan dönem özetini onaylayabilirsiniz.
          </p>
        )}

        {hasTopics && draftSummary ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)]/50 p-3 text-xs space-y-1">
            <p className="font-semibold text-[var(--color-text)]">4 Derste Çalışılan Konular Özeti</p>
            {draftSummary.topicsSummary.piecesWorked.length > 0 ? (
              <p className="text-[var(--color-text-muted)]">
                <span className="font-medium text-[var(--color-text)]">Parçalar:</span>{" "}
                {draftSummary.topicsSummary.piecesWorked.join(", ")}
              </p>
            ) : null}
            {draftSummary.topicsSummary.etudesWorked.length > 0 ? (
              <p className="text-[var(--color-text-muted)]">
                <span className="font-medium text-[var(--color-text)]">Etütler:</span>{" "}
                {draftSummary.topicsSummary.etudesWorked.join(", ")}
              </p>
            ) : null}
            {draftSummary.topicsSummary.technicalWork.length > 0 ? (
              <p className="text-[var(--color-text-muted)]">
                <span className="font-medium text-[var(--color-text)]">Teknik:</span>{" "}
                {draftSummary.topicsSummary.technicalWork.join(", ")}
              </p>
            ) : null}
            {draftSummary.topicsSummary.theoryWork.length > 0 ? (
              <p className="text-[var(--color-text-muted)]">
                <span className="font-medium text-[var(--color-text)]">Teori:</span>{" "}
                {draftSummary.topicsSummary.theoryWork.join(", ")}
              </p>
            ) : null}
          </div>
        ) : null}

        {draftSummary && draftSummary.assessedLessonCount > 0 ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={applyAutoSynthesis}
              className="rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
            >
              Önceki ders verilerinden özeti yenile
            </button>
          </div>
        ) : null}
      </FormSection>

      <FormSection
        title="2. Dönem Puan Özeti"
        description="Puanlar önceki ders ortalamasından otomatik getirildi. Olduğu gibi bırakabilir veya aşağıdan değiştirebilirsiniz."
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {ASSESSMENT_SECTIONS.map((sec) => (
            <div
              key={sec.id}
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)]/50 px-2.5 py-2 text-center"
            >
              <p className="text-[11px] font-medium text-[var(--color-text-muted)]">{sec.label}</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--color-text)]">
                {computeSectionScore(currentScores, sec.id).toFixed(1)}/5
              </p>
            </div>
          ))}
        </div>

        <OptionalSection title="Puanları detaylı incele / düzenle">
          <p className="text-xs text-[var(--color-text-muted)]">{SCORE_SCALE_HINT}</p>
          {ASSESSMENT_SECTIONS.map((section) => (
            <div key={section.id} className="space-y-3 pt-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                {section.id}. {section.label}
              </p>
              {section.items.map((item) => (
                <ScoreSegment
                  key={item}
                  name={`${key}-${item}`}
                  label={ASSESSMENT_ITEM_LABELS[item]}
                  value={currentScores[item]}
                  onChange={(v) => update({ scores: { ...currentScores, [item]: v } })}
                />
              ))}
            </div>
          ))}
        </OptionalSection>
      </FormSection>

      <FormSection
        title="3. Kontrol ve Değerlendirme"
        description="Önceki derslerden derlenen metinleri kontrol edin; gerekirse düzenleyin veya kısa değerlendirmenizi ekleyin."
      >
        <FieldTextarea
          id={`genel-${key}`}
          label="4 derslik genel gelişim değerlendirmesi"
          required
          rows={3}
          maxLength={4000}
          placeholder={PERIODIC_REPORT_PLACEHOLDERS.overallProgressNote}
          value={d.overallProgressNote}
          onChange={(v) => update({ overallProgressNote: v })}
        />
        <FieldTextarea
          id={`guclu-${key}`}
          label="Dönemin öne çıkan güçlü yönleri"
          rows={2}
          maxLength={2000}
          placeholder={PERIODIC_REPORT_PLACEHOLDERS.strengthsNote}
          value={d.strengthsNote}
          onChange={(v) => update({ strengthsNote: v })}
        />
        <FieldTextarea
          id={`alan-${key}`}
          label="Odaklanılacak gelişim alanları"
          rows={2}
          maxLength={2000}
          placeholder={PERIODIC_REPORT_PLACEHOLDERS.areasForImprovementNote}
          value={d.areasForImprovementNote}
          onChange={(v) => update({ areasForImprovementNote: v })}
        />
        <FieldTextarea
          id={`oneri-${key}`}
          label="Sonraki 4 ders için hedef ve öneriler"
          rows={2}
          maxLength={2000}
          placeholder={PERIODIC_REPORT_PLACEHOLDERS.recommendationNote}
          value={d.recommendationNote}
          onChange={(v) => update({ recommendationNote: v })}
        />
      </FormSection>

      <FormSection title="4. Onay ve İmza">
        <div>
          <label htmlFor={`imza-${key}`} className="mb-1.5 block text-sm font-medium text-[var(--color-text)]">
            Öğretmen adı soyadı (imza)
          </label>
          <input
            id={`imza-${key}`}
            value={d.teacherSignedName}
            onChange={(e) => update({ teacherSignedName: e.target.value })}
            placeholder="Örn: Deniz Aydın"
            autoComplete="name"
            className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-base text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]/60 sm:text-sm"
          />
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-[var(--color-text)]">
          <input
            type="checkbox"
            checked={d.approved}
            onChange={(e) => update({ approved: e.target.checked })}
            className="h-5 w-5 accent-[var(--color-primary)]"
          />
          <span>
            4 derslik dönem özetini ve puanlarını kontrol ettim, <strong>onaylıyorum</strong>.
          </span>
        </label>
      </FormSection>

      <SubmitBar busy={busy} label="Onaylıyorum ve Raporu Tamamlıyorum" error={error} />
    </form>
  );
}
