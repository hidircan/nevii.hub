"use client";

/**
 * Rapor portalı (2026-10-14) — ders bazlı gelişim raporu (LessonAssessment). `/gelisim` ve öğretmen portalının
 * "Gelişim" alanı AYNI bileşeni kullanır. Mevcut API: POST /api/v1/assessments.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ASSESSMENT_ITEM_LABELS, ASSESSMENT_SECTIONS } from "@/lib/assessment/score";
import { DEFAULT_ASSESSMENT_SCORES, LESSON_REPORT_PLACEHOLDERS } from "@/lib/reports/guidance";
import type { AssessmentScores } from "@/lib/types";
import { apiFetchJson } from "@/lib/api/client-fetch";
import { formatDateTime } from "@/lib/utils";
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

export type AssessableLesson = { id: string; startAt: string; instrument?: string };

const DEFAULT_SCORES: AssessmentScores = DEFAULT_ASSESSMENT_SCORES;

type Draft = {
  lessonId: string;
  scores: AssessmentScores;
  strengthNote: string;
  improvementNote: string;
  nextStepsNote: string;
  piecesWorked: string;
  etudesWorked: string;
  technicalWork: string;
  theoryWork: string;
  parentPrivateNote: string;
  parentNoteVisibleToStudent: boolean;
  teacherSignedName: string;
};

export function LessonAssessmentMobileForm({
  studentId,
  lessons,
  defaultLessonId,
  teacherName,
  draftOwner,
  doneHref,
}: {
  studentId: string;
  /** Taslak anahtarı için öğretmen kimliği (ortak cihazda başka öğretmene geri yüklenmez). */
  draftOwner: string;
  lessons: AssessableLesson[];
  defaultLessonId?: string;
  teacherName: string;
  /** Gönderim sonrası "devam" bağlantısı (ör. /gelisim); yoksa sayfa yenilenir ve yeni rapor yazılabilir. */
  doneHref?: { href: string; label: string };
}) {
  const router = useRouter();
  const firstLessonId = defaultLessonId && lessons.some((l) => l.id === defaultLessonId) ? defaultLessonId : (lessons[0]?.id ?? "");
  const { value: d, update, clear, restored } = useFormDraft<Draft>(`nevii:rapor:ders:${draftOwner}:${studentId}`, {
    lessonId: firstLessonId,
    scores: DEFAULT_SCORES,
    strengthNote: "",
    improvementNote: "",
    nextStepsNote: "",
    piecesWorked: "",
    etudesWorked: "",
    technicalWork: "",
    theoryWork: "",
    parentPrivateNote: "",
    parentNoteVisibleToStudent: false,
    teacherSignedName: teacherName,
  }, { exclude: ["parentPrivateNote"] });
  const lessonId = lessons.some((l) => l.id === d.lessonId) ? d.lessonId : firstLessonId;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (lessons.length === 0) {
    return (
      <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] p-4 text-sm text-[var(--color-text-muted)]">
        Bu öğrenciyle raporlanabilecek geçmiş bir dersiniz yok. Ders tamamlandıktan sonra burada görünecek.
      </p>
    );
  }

  if (done) {
    return (
      <SuccessPanel
        title="Rapor gönderildi"
        description="Gelişim raporu kaydedildi ve yöneticiye bildirildi."
        primary={doneHref}
        onAnother={() => setDone(false)}
      />
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!d.strengthNote.trim() || !d.improvementNote.trim() || !d.nextStepsNote.trim()) {
      setError("Güçlü yönler, gelişime açık alanlar ve sonraki adımlar alanlarını doldurun.");
      return;
    }
    if (!d.teacherSignedName.trim()) {
      setError("İmza için adınızı ve soyadınızı yazın.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await apiFetchJson("/api/v1/assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lessonId,
        studentId,
        ...d.scores,
        strengthNote: d.strengthNote.trim(),
        improvementNote: d.improvementNote.trim(),
        nextStepsNote: d.nextStepsNote.trim(),
        piecesWorked: d.piecesWorked.trim() || undefined,
        etudesWorked: d.etudesWorked.trim() || undefined,
        technicalWork: d.technicalWork.trim() || undefined,
        theoryWork: d.theoryWork.trim() || undefined,
        parentPrivateNote: d.parentPrivateNote.trim() || undefined,
        parentNoteVisibleToStudent: d.parentNoteVisibleToStudent,
        teacherSignedName: d.teacherSignedName.trim(),
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(reportErrorMessage(result.error, "Rapor gönderilemedi. Bağlantınızı kontrol edip tekrar deneyin."));
      return;
    }
    clear();
    setDone(true);
    router.refresh();
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-4" noValidate>
      {restored ? (
        <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
          Bu cihazda yarım kalan taslağınız geri yüklendi.
        </p>
      ) : null}

      <FormSection title="Ders">
        <label htmlFor={`ders-${studentId}`} className="sr-only">
          Raporlanacak ders
        </label>
        <select
          id={`ders-${studentId}`}
          value={lessonId}
          onChange={(e) => update({ lessonId: e.target.value })}
          className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-base text-[var(--color-text)] sm:text-sm"
        >
          {lessons.map((l) => (
            <option key={l.id} value={l.id}>
              {formatDateTime(l.startAt)}
              {l.instrument ? ` · ${l.instrument}` : ""}
            </option>
          ))}
        </select>
      </FormSection>

      {ASSESSMENT_SECTIONS.map((section) => (
        <FormSection key={section.id} title={section.label} description={section.id === "A" ? SCORE_SCALE_HINT : undefined}>
          {section.items.map((item) => (
            <ScoreSegment
              key={item}
              name={`${studentId}-${item}`}
              label={ASSESSMENT_ITEM_LABELS[item]}
              value={d.scores[item]}
              onChange={(v) => update({ scores: { ...d.scores, [item]: v } })}
            />
          ))}
        </FormSection>
      ))}

      <FormSection
        title="Değerlendirme notları"
        description="Kutuların içindeki silik örnekler rehberlik içindir; tıklayıp kendi ders notunuzu kısaca yazabilirsiniz."
      >
        <FieldTextarea
          id={`guclu-${studentId}`}
          label="Güçlü yönler"
          required
          placeholder={LESSON_REPORT_PLACEHOLDERS.strengthNote}
          value={d.strengthNote}
          onChange={(v) => update({ strengthNote: v })}
          maxLength={2000}
        />
        <FieldTextarea
          id={`gelisim-${studentId}`}
          label="Gelişime açık alanlar"
          required
          placeholder={LESSON_REPORT_PLACEHOLDERS.improvementNote}
          value={d.improvementNote}
          onChange={(v) => update({ improvementNote: v })}
          maxLength={2000}
        />
        <FieldTextarea
          id={`sonraki-${studentId}`}
          label="Sonraki adımlar"
          required
          placeholder={LESSON_REPORT_PLACEHOLDERS.nextStepsNote}
          value={d.nextStepsNote}
          onChange={(v) => update({ nextStepsNote: v })}
          maxLength={2000}
        />
      </FormSection>

      <OptionalSection title="Çalışılan konular">
        <FieldTextarea
          id={`parca-${studentId}`}
          label="İşlenen parçalar"
          rows={2}
          placeholder={LESSON_REPORT_PLACEHOLDERS.piecesWorked}
          value={d.piecesWorked}
          onChange={(v) => update({ piecesWorked: v })}
          maxLength={2000}
        />
        <FieldTextarea
          id={`etut-${studentId}`}
          label="İşlenen etütler"
          rows={2}
          placeholder={LESSON_REPORT_PLACEHOLDERS.etudesWorked}
          value={d.etudesWorked}
          onChange={(v) => update({ etudesWorked: v })}
          maxLength={2000}
        />
        <FieldTextarea
          id={`teknik-${studentId}`}
          label="Teknik çalışmalar"
          rows={2}
          placeholder={LESSON_REPORT_PLACEHOLDERS.technicalWork}
          value={d.technicalWork}
          onChange={(v) => update({ technicalWork: v })}
          maxLength={2000}
        />
        <FieldTextarea
          id={`teori-${studentId}`}
          label="Teorik / pratik konular"
          rows={2}
          placeholder={LESSON_REPORT_PLACEHOLDERS.theoryWork}
          value={d.theoryWork}
          onChange={(v) => update({ theoryWork: v })}
          maxLength={2000}
        />
      </OptionalSection>

      <OptionalSection title="Veliye özel not">
        <FieldTextarea
          id={`veli-${studentId}`}
          label="Not"
          hint="Varsayılan olarak yalnız yönetici ve veli görür. Gizlilik için bu not taslakta saklanmaz."
          placeholder={LESSON_REPORT_PLACEHOLDERS.parentPrivateNote}
          rows={2}
          value={d.parentPrivateNote}
          onChange={(v) => update({ parentPrivateNote: v })}
        />
        <label className="flex min-h-11 items-center gap-3 text-sm text-[var(--color-text)]">
          <input
            type="checkbox"
            checked={d.parentNoteVisibleToStudent}
            onChange={(e) => update({ parentNoteVisibleToStudent: e.target.checked })}
            className="h-5 w-5"
          />
          Öğrenci de görebilsin
        </label>
      </OptionalSection>

      <div>
        <label htmlFor={`imza-${studentId}`} className="mb-1.5 block text-sm font-medium text-[var(--color-text)]">
          İmza (ad soyad)
        </label>
        <input
          id={`imza-${studentId}`}
          value={d.teacherSignedName}
          onChange={(e) => update({ teacherSignedName: e.target.value })}
          placeholder="Örn: Deniz Aydın"
          autoComplete="name"
          className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-base text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]/60 sm:text-sm"
        />
      </div>

      <SubmitBar busy={busy} label="Raporu gönder" error={error} />
    </form>
  );
}
