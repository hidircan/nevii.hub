"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import type { TeacherFeedbackCriterionKey, TeacherFeedbackContinuePreference } from "@/lib/types";

const CRITERIA: { key: TeacherFeedbackCriterionKey; label: string }[] = [
  { key: "clarity", label: "Dersi anlaşılır anlatma" },
  { key: "communication", label: "İletişim ve saygı" },
  { key: "effectiveness", label: "Ders verimliliği" },
  { key: "motivation", label: "Öğrenciyi motive etme" },
  { key: "punctuality", label: "Ders düzeni / zamanında başlama" },
];

const SCORE_LABELS: Record<number, string> = {
  1: "Çok düşük",
  2: "Düşük",
  3: "Orta",
  4: "İyi",
  5: "Çok iyi",
};

const CONTINUE_OPTIONS: { value: TeacherFeedbackContinuePreference; label: string }[] = [
  { value: "yes", label: "Evet" },
  { value: "unsure", label: "Kararsızım" },
  { value: "no", label: "Hayır" },
];

const COMMENT_MAX = 1000;

export type InitialFeedback = {
  scores: Record<TeacherFeedbackCriterionKey, number>;
  continueWithTeacher?: TeacherFeedbackContinuePreference;
  comment?: string;
};

export function TeacherFeedbackForm({
  studentId,
  teacherId,
  teacherName,
  initialFeedback,
  onSubmitted,
}: {
  studentId: string;
  /** 2026-10-14 — değerlendirilen öğretmen (çoklu branş); sunucu uygunluğu doğrular. */
  teacherId?: string;
  teacherName: string;
  initialFeedback?: InitialFeedback | null;
  onSubmitted?: (updated: boolean) => void;
}) {
  const isUpdate = Boolean(initialFeedback);
  const [scores, setScores] = useState<Record<TeacherFeedbackCriterionKey, number>>(
    initialFeedback?.scores ?? Object.fromEntries(CRITERIA.map((c) => [c.key, 3])) as Record<TeacherFeedbackCriterionKey, number>
  );
  const [continueWithTeacher, setContinueWithTeacher] = useState<TeacherFeedbackContinuePreference | "">(
    initialFeedback?.continueWithTeacher ?? ""
  );
  const [comment, setComment] = useState(initialFeedback?.comment ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<null | { updated: boolean }>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/teacher-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          teacherId,
          scores,
          continueWithTeacher: continueWithTeacher || undefined,
          comment: comment.trim() || undefined,
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { updated: boolean };
        error?: { message: string };
      };
      if (!json.ok || !json.data) {
        setError(json.error?.message || "Gönderilemedi.");
        setBusy(false);
        return;
      }
      setSuccess({ updated: json.data.updated });
      onSubmitted?.(json.data.updated);
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <p className="text-sm font-medium text-amber-700" role="status">
        {success.updated
          ? "Değerlendirmeniz güncellendi. Teşekkürler — yalnızca okul yönetimi görüntüler."
          : "Geri bildiriminiz için teşekkürler. Yalnızca okul yönetimi görüntüler."}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-[var(--color-text)]">{teacherName} hakkında</p>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Bu değerlendirme okul yönetimine gizli olarak iletilir; öğretmenin kendisine veya kimliğinizle
          birlikte hiçbir şekilde gösterilmez.
        </p>
      </div>

      <div className="space-y-3">
        {CRITERIA.map((c) => (
          <fieldset key={c.key}>
            <legend className="mb-1.5 text-sm text-[var(--color-text-muted)]">{c.label}</legend>
            <div role="radiogroup" aria-label={c.label} className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => {
                const checked = scores[c.key] === n;
                return (
                  <label
                    key={n}
                    className={`flex-1 min-w-[4.5rem] cursor-pointer rounded-lg border px-2 py-1.5 text-center text-[11px] font-medium transition ${
                      checked
                        ? "border-amber-600 bg-amber-600 text-white"
                        : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:border-amber-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name={c.key}
                      value={n}
                      checked={checked}
                      onChange={() => setScores((prev) => ({ ...prev, [c.key]: n }))}
                      className="sr-only"
                    />
                    {SCORE_LABELS[n]}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm text-[var(--color-text-muted)]">
          Bu öğretmenle derslere devam etmek ister misiniz? <span className="text-[var(--color-text-muted)]">(opsiyonel)</span>
        </legend>
        <div role="radiogroup" aria-label="Derslere devam" className="flex flex-wrap gap-1.5">
          {CONTINUE_OPTIONS.map((opt) => {
            const checked = continueWithTeacher === opt.value;
            return (
              <label
                key={opt.value}
                className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  checked
                    ? "border-amber-600 bg-amber-600 text-white"
                    : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:border-amber-300"
                }`}
              >
                <input
                  type="radio"
                  name="continueWithTeacher"
                  value={opt.value}
                  checked={checked}
                  onChange={() => setContinueWithTeacher(opt.value)}
                  className="sr-only"
                />
                {opt.label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor="feedback-comment" className="mb-1.5 block text-sm text-[var(--color-text-muted)]">
          Yönetim için ek görüşünüz <span className="text-[var(--color-text-muted)]">(opsiyonel)</span>
        </label>
        <textarea
          id="feedback-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, COMMENT_MAX))}
          placeholder="Yönetimin bilmesini istediğiniz bir şey var mı?"
          rows={3}
          maxLength={COMMENT_MAX}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)] outline-none ring-amber-500/30 placeholder:text-[var(--color-text-muted)] focus:ring-2"
        />
        <p className="mt-1 text-right text-[11px] text-[var(--color-text-muted)]">
          {comment.length}/{COMMENT_MAX}
        </p>
      </div>

      {error ? (
        <p className="text-sm font-medium text-rose-600" role="alert">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={busy}>
        {busy ? "Gönderiliyor…" : isUpdate ? "Değerlendirmeyi Güncelle" : "Gönder"}
      </Button>
    </form>
  );
}
