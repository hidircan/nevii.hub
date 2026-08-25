"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { ASSESSMENT_SECTIONS, ASSESSMENT_ITEM_LABELS } from "@/lib/assessment/score";
import type { AssessmentScores } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

type LessonOption = { id: string; startAt: string };

const DEFAULT_SCORES: AssessmentScores = {
  teknikBecerisi: 3,
  notaOkuma: 3,
  muzikalite: 3,
  ritimDuyusu: 3,
  calismaDuzeni: 3,
  evOdeviTamamlama: 3,
  dersKatilimi: 3,
  motivasyon: 3,
  genelIlerleme: 3,
  hedefeUlasma: 3,
};

export function LessonAssessmentForm({
  studentId,
  lessons,
  defaultTeacherName,
}: {
  studentId: string;
  lessons: LessonOption[];
  defaultTeacherName: string;
}) {
  const router = useRouter();
  const [lessonId, setLessonId] = useState(lessons[0]?.id ?? "");
  const [scores, setScores] = useState<AssessmentScores>(DEFAULT_SCORES);
  // Faz 3A — "çalışılan konular", hepsi opsiyonel.
  const [piecesWorked, setPiecesWorked] = useState("");
  const [etudesWorked, setEtudesWorked] = useState("");
  const [technicalWork, setTechnicalWork] = useState("");
  const [theoryWork, setTheoryWork] = useState("");
  const [strengthNote, setStrengthNote] = useState("");
  const [nextStepsNote, setNextStepsNote] = useState("");
  const [improvementNote, setImprovementNote] = useState("");
  const [parentPrivateNote, setParentPrivateNote] = useState("");
  const [parentNoteVisibleToStudent, setParentNoteVisibleToStudent] = useState(false);
  const [teacherSignedName, setTeacherSignedName] = useState(defaultTeacherName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function setScore(item: keyof AssessmentScores, value: number) {
    setScores((prev) => ({ ...prev, [item]: value }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!lessonId) {
      setError("Ders seçimi zorunlu.");
      return;
    }
    if (!strengthNote.trim() || !nextStepsNote.trim() || !improvementNote.trim()) {
      setError("Güçlü yönler, sonraki adımlar ve gelişim alanları zorunludur.");
      return;
    }
    if (!teacherSignedName.trim()) {
      setError("Öğretmen adı zorunludur.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/api/v1/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId,
          studentId,
          ...scores,
          piecesWorked: piecesWorked.trim() || undefined,
          etudesWorked: etudesWorked.trim() || undefined,
          technicalWork: technicalWork.trim() || undefined,
          theoryWork: theoryWork.trim() || undefined,
          strengthNote,
          nextStepsNote,
          improvementNote,
          parentPrivateNote: parentPrivateNote.trim() || undefined,
          parentNoteVisibleToStudent,
          teacherSignedName,
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!json.ok) {
        setError(json.error?.message || "Değerlendirme oluşturulamadı.");
        setBusy(false);
        return;
      }
      setSuccess(true);
      setStrengthNote("");
      setNextStepsNote("");
      setImprovementNote("");
      setParentPrivateNote("");
      router.refresh();
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Ders</label>
        <select
          value={lessonId}
          onChange={(event) => setLessonId(event.target.value)}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-muted)] outline-none ring-amber-200 focus:ring-2"
        >
          {lessons.length === 0 ? <option value="">Ders bulunamadı</option> : null}
          {lessons.map((l) => (
            <option key={l.id} value={l.id}>
              {formatDateTime(l.startAt)}
            </option>
          ))}
        </select>
      </div>

      {ASSESSMENT_SECTIONS.map((section) => (
        <div key={section.id} className="rounded-xl border border-[var(--color-border)] p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            {section.id}. {section.label}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {section.items.map((item) => (
              <div key={item}>
                <label className="mb-1 flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                  <span>{ASSESSMENT_ITEM_LABELS[item]}</span>
                  <span className="font-semibold text-amber-700">{scores[item]}</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={scores[item]}
                  onChange={(event) => setScore(item, Number(event.target.value))}
                  className="w-full"
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="rounded-xl border border-[var(--color-border)] p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Çalışılan konular (opsiyonel)
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Bu hafta işlenen parçalar</label>
            <textarea
              value={piecesWorked}
              onChange={(event) => setPiecesWorked(event.target.value)}
              rows={2}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-muted)] outline-none ring-amber-200 focus:ring-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">İşlenen etütler</label>
            <textarea
              value={etudesWorked}
              onChange={(event) => setEtudesWorked(event.target.value)}
              rows={2}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-muted)] outline-none ring-amber-200 focus:ring-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Teknik çalışmalar</label>
            <textarea
              value={technicalWork}
              onChange={(event) => setTechnicalWork(event.target.value)}
              rows={2}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-muted)] outline-none ring-amber-200 focus:ring-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Teorik/pratik konular</label>
            <textarea
              value={theoryWork}
              onChange={(event) => setTheoryWork(event.target.value)}
              rows={2}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-muted)] outline-none ring-amber-200 focus:ring-2"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Güçlü yönler</label>
        <textarea
          value={strengthNote}
          onChange={(event) => setStrengthNote(event.target.value)}
          rows={2}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-muted)] outline-none ring-amber-200 focus:ring-2"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Gelişime açık alanlar</label>
        <textarea
          value={improvementNote}
          onChange={(event) => setImprovementNote(event.target.value)}
          rows={2}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-muted)] outline-none ring-amber-200 focus:ring-2"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Sonraki adımlar</label>
        <textarea
          value={nextStepsNote}
          onChange={(event) => setNextStepsNote(event.target.value)}
          rows={2}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-muted)] outline-none ring-amber-200 focus:ring-2"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
          Veliye özel not (isteğe bağlı)
        </label>
        <textarea
          value={parentPrivateNote}
          onChange={(event) => setParentPrivateNote(event.target.value)}
          rows={2}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-muted)] outline-none ring-amber-200 focus:ring-2"
        />
        <label className="mt-2 flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
          <input
            type="checkbox"
            checked={parentNoteVisibleToStudent}
            onChange={(event) => setParentNoteVisibleToStudent(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Öğrenciye de göster
        </label>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Öğretmen adı (dijital onay)</label>
        <input
          value={teacherSignedName}
          onChange={(event) => setTeacherSignedName(event.target.value)}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-muted)] outline-none ring-amber-200 focus:ring-2"
        />
      </div>

      <Button type="submit" disabled={busy || lessons.length === 0}>
        {busy ? "Kaydediliyor..." : "Değerlendirmeyi kaydet"}
      </Button>
      {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : null}
      {success ? <p className="text-xs font-medium text-emerald-600">Kaydedildi.</p> : null}
    </form>
  );
}
