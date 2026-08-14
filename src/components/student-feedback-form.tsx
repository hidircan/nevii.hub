"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import type { StudentFeedbackCriterionKey } from "@/lib/types";

const CRITERIA: { key: StudentFeedbackCriterionKey; label: string }[] = [
  { key: "attendance", label: "Derse katılım" },
  { key: "practice", label: "Pratik ve ödev disiplini" },
  { key: "progress", label: "Gelişim ve performans" },
  { key: "attitude", label: "İletişim ve tutum" },
  { key: "preparedness", label: "Derse hazırlık" },
];

const SCORE_LABELS: Record<number, string> = {
  1: "Çok düşük",
  2: "Düşük",
  3: "Orta",
  4: "İyi",
  5: "Çok iyi",
};

const COMMENT_MAX = 1000;

export type InitialStudentFeedback = {
  scores: Record<StudentFeedbackCriterionKey, number>;
  comment?: string;
};

export function StudentFeedbackForm({
  studentId,
  studentName,
  initialFeedback,
  onSubmitted,
}: {
  studentId: string;
  studentName: string;
  initialFeedback?: InitialStudentFeedback | null;
  onSubmitted?: (updated: boolean) => void;
}) {
  const isUpdate = Boolean(initialFeedback);
  const [scores, setScores] = useState<Record<StudentFeedbackCriterionKey, number>>(
    initialFeedback?.scores ??
      (Object.fromEntries(CRITERIA.map((c) => [c.key, 3])) as Record<StudentFeedbackCriterionKey, number>)
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
      const res = await fetch("/api/v1/student-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, scores, comment: comment.trim() || undefined }),
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
          ? "Değerlendirmeniz güncellendi. Yalnızca okul yönetimi görüntüler."
          : "Değerlendirmeniz kaydedildi. Yalnızca okul yönetimi görüntüler."}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-[var(--color-text)]">{studentName} — Öğrenci Değerlendirmesi</p>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Bu değerlendirme okul yönetimine iletilir; öğrenciye/veliye gösterilmez.
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

      <div>
        <label htmlFor="student-feedback-comment" className="mb-1.5 block text-sm text-[var(--color-text-muted)]">
          Yorum <span className="text-[var(--color-text-muted)]">(opsiyonel)</span>
        </label>
        <textarea
          id="student-feedback-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, COMMENT_MAX))}
          placeholder="Öğrenci hakkında ek notunuz var mı?"
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
        {busy ? "Gönderiliyor…" : isUpdate ? "Değerlendirmeyi Güncelle" : "Değerlendir"}
      </Button>
    </form>
  );
}
