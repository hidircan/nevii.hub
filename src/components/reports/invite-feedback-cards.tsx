"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import type { TeacherFeedbackContinuePreference, TeacherFeedbackCriterionKey } from "@/lib/types";
import { CONTINUE_OPTIONS, CRITERIA } from "@/components/teacher-feedback-form";
import { FieldTextarea, ScoreSegment, SCORE_SCALE_HINT } from "./form-parts";

type TeacherRow = { id: string; name: string; instruments: string[]; done: boolean };

/** Kişiye özel bağlantı sayfası — öğretmen başına açılır kart + sade puanlama formu (oturumsuz POST). */
export function InviteFeedbackCards({ code, teachers }: { code: string; teachers: TeacherRow[] }) {
  const [done, setDone] = useState<Record<string, boolean>>(() => Object.fromEntries(teachers.map((t) => [t.id, t.done])));
  const [open, setOpen] = useState<string | null>(teachers.find((t) => !t.done)?.id ?? null);
  const allDone = teachers.every((t) => done[t.id]);

  return (
    <div className="space-y-3">
      {teachers.map((t) => (
        <section key={t.id} className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          <button
            type="button"
            disabled={done[t.id]}
            onClick={() => setOpen(open === t.id ? null : t.id)}
            aria-expanded={open === t.id}
            className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left disabled:cursor-default"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-[var(--color-text)]">{t.name}</span>
              <span className="block truncate text-xs text-[var(--color-text-muted)]">{t.instruments.join(", ")}</span>
            </span>
            {done[t.id] ? (
              <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--color-success)]">
                <CheckCircle2 className="h-4 w-4" aria-hidden /> Değerlendirildi
              </span>
            ) : (
              <span className="shrink-0 text-xs font-medium text-[var(--color-primary)]">{open === t.id ? "Kapat" : "Değerlendir"}</span>
            )}
          </button>
          {open === t.id && !done[t.id] ? (
            <div className="border-t border-[var(--color-border)] p-4">
              <InviteForm
                code={code}
                teacherId={t.id}
                onDone={() => {
                  const next = { ...done, [t.id]: true };
                  setDone(next);
                  setOpen(teachers.find((x) => !next[x.id])?.id ?? null);
                }}
              />
            </div>
          ) : null}
        </section>
      ))}
      {allDone ? (
        <p role="status" className="rounded-[var(--radius-lg)] bg-[var(--color-surface-muted)] p-4 text-sm text-[var(--color-text)]">
          Teşekkür ederiz — tüm değerlendirmeleriniz alındı.
        </p>
      ) : null}
    </div>
  );
}

function InviteForm({ code, teacherId, onDone }: { code: string; teacherId: string; onDone: () => void }) {
  const [scores, setScores] = useState<Record<TeacherFeedbackCriterionKey, number>>(
    Object.fromEntries(CRITERIA.map((c) => [c.key, 3])) as Record<TeacherFeedbackCriterionKey, number>
  );
  const [cont, setCont] = useState<TeacherFeedbackContinuePreference | "">("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/degerlendir/${encodeURIComponent(code)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId, scores, continueWithTeacher: cont || undefined, comment: comment.trim() || undefined }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (res.ok && json?.ok) return onDone();
      setError(json?.message ?? "Değerlendirmeniz gönderilemedi. Lütfen tekrar deneyin.");
    } catch {
      setError("Bağlantı hatası — internetinizi kontrol edip tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <p className="text-xs text-[var(--color-text-muted)]">{SCORE_SCALE_HINT}</p>
      {CRITERIA.map((c) => (
        <ScoreSegment key={c.key} name={`${teacherId}-${c.key}`} label={c.label} value={scores[c.key]} onChange={(v) => setScores({ ...scores, [c.key]: v })} />
      ))}
      <fieldset>
        <legend className="mb-1.5 text-sm text-[var(--color-text)]">Bu öğretmenle devam etmek ister misiniz?</legend>
        <div className="grid grid-cols-3 gap-1.5">
          {CONTINUE_OPTIONS.map((o) => (
            <label key={o.value}>
              <input type="radio" name={`${teacherId}-devam`} className="peer sr-only" checked={cont === o.value} onChange={() => setCont(o.value)} />
              <span className="flex min-h-11 cursor-pointer items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text-muted)] peer-checked:border-[var(--color-primary)] peer-checked:bg-[var(--color-primary)] peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--color-focus-ring)]">
                {o.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <FieldTextarea id={`${teacherId}-yorum`} label="Yorumunuz (isteğe bağlı)" rows={3} maxLength={1000} value={comment} onChange={setComment} />
      {error ? (
        <p role="alert" className="text-sm font-medium text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="flex min-h-12 w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary)] text-base font-semibold text-white disabled:opacity-60"
      >
        {busy ? "Gönderiliyor…" : "Değerlendirmeyi gönder"}
      </button>
    </form>
  );
}
