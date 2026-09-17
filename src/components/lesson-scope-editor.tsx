"use client";

/**
 * 2026-09-17 — ders detayında REVİZE ET / SİL, üç kapsamla. Saatler kurum
 * saatiyle girilir ve sunucuda aynı kuralla kaydedilir (sessiz kaydırma yok).
 * Yoklaması/tahsilatı olan dersler sunucuda korunur; sonuç mesajında listelenir.
 */

import { useState, useTransition } from "react";
import { actionDeleteLessons, actionReviseLessons, type LessonEditScopeInput } from "@/lib/actions";
import { Button, Input, Label, Select } from "@/components/ui";
import { dayName } from "@/lib/utils";
import { DEFAULT_APP_TIMEZONE, isoToWallDateTimeInput, zonedHm, zonedWeekday } from "@/lib/timezone";
import type { Lesson } from "@/lib/types";
import { LESSON_DURATION_OPTIONS } from "@/lib/lesson-duration";

const SCOPE_LABEL: Record<LessonEditScopeInput, string> = {
  single: "Sadece bu ders",
  fromHereOnward: "Bu ders ve sonrası",
  entireSeries: "Tüm seri",
};

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

export function LessonScopeEditor({ lesson, onDone }: { lesson: Lesson; onDone: (message: string) => void }) {
  const isSeries = Boolean(lesson.seriesId);
  const start = new Date(lesson.startAt);
  const currentDuration = Math.round((new Date(lesson.endAt).getTime() - start.getTime()) / 60_000);
  const [scope, setScope] = useState<LessonEditScopeInput>("single");
  const [startAt, setStartAt] = useState(isoToWallDateTimeInput(lesson.startAt));
  const [startTime, setStartTime] = useState(zonedHm(start, DEFAULT_APP_TIMEZONE));
  const [weekday, setWeekday] = useState(zonedWeekday(start));
  const [duration, setDuration] = useState(currentDuration);
  const [error, setError] = useState<string | null>(null);
  const [confirmAvailability, setConfirmAvailability] = useState(false);
  const [pending, startTransition] = useTransition();

  const scopeEffect =
    scope === "single"
      ? "Yalnız bu ders etkilenir."
      : scope === "fromHereOnward"
        ? "Bu ders ve serinin sonraki tüm dersleri etkilenir; önceki dersler değişmez."
        : "Serinin geçmiş ve gelecek tüm dersleri etkilenir.";

  function withProtectedNote(base: string, notes: string[]) {
    return notes.length > 0 ? `${base} Korunan (yoklama/tahsilat kaydı olan) dersler değişmedi: ${notes.join(", ")}.` : base;
  }

  function onRevise(allowAvailabilityOverride = false) {
    setError(null);
    startTransition(async () => {
      const result = await actionReviseLessons({
        lessonId: lesson.id,
        scope,
        ...(scope === "single" ? { startAt } : { startTime, weekday }),
        durationMinutes: duration,
        allowAvailabilityOverride,
      });
      if (!result.ok) {
        setConfirmAvailability(Boolean(result.overridable));
        setError(result.message);
        return;
      }
      setConfirmAvailability(false);
      onDone(withProtectedNote(`${result.updatedCount} ders güncellendi.`, result.protectedNotes));
    });
  }

  function onDelete() {
    const question =
      scope === "single"
        ? "Bu ders programdan tamamen silinecek. Emin misiniz?"
        : scope === "fromHereOnward"
          ? "Bu ders ve serinin sonraki tüm dersleri programdan silinecek. Emin misiniz?"
          : "Serinin tüm dersleri programdan silinecek. Emin misiniz?";
    if (!window.confirm(`${question}\n\nYoklaması veya tahsilatı olan dersler silinmez.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await actionDeleteLessons({ lessonId: lesson.id, scope });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onDone(withProtectedNote(`${result.deletedCount} ders silindi.`, result.protectedNotes));
    });
  }

  return (
    <div className="mt-4 space-y-3 border-t border-[var(--color-border)] pt-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Dersi düzenle / sil</p>
      <div className="flex flex-wrap gap-3 text-sm" role="radiogroup" aria-label="Kapsam">
        {(Object.keys(SCOPE_LABEL) as LessonEditScopeInput[]).map((s) => (
          <label key={s} className={`flex items-center gap-1.5 ${s !== "single" && !isSeries ? "opacity-40" : ""}`}>
            <input
              type="radio"
              name={`scope-${lesson.id}`}
              checked={scope === s}
              disabled={s !== "single" && !isSeries}
              onChange={() => {
                setScope(s);
                setError(null);
                setConfirmAvailability(false);
              }}
            />
            {SCOPE_LABEL[s]}
          </label>
        ))}
      </div>
      <p className="text-xs text-amber-700">{scopeEffect}</p>

      <div className="flex flex-wrap items-end gap-2">
        {scope === "single" ? (
          <div>
            <Label>Tarih ve saat</Label>
            <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </div>
        ) : (
          <>
            <div>
              <Label>Gün</Label>
              <Select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
                {WEEKDAYS.map((d) => (
                  <option key={d} value={d}>
                    {dayName(d)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Saat</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
          </>
        )}
        <div>
          <Label>Süre</Label>
          <Select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {[...new Set([...LESSON_DURATION_OPTIONS, currentDuration])].sort((a, b) => a - b).map((d) => (
              <option key={d} value={d}>
                {d} dk
              </option>
            ))}
          </Select>
        </div>
        <Button type="button" variant="secondary" disabled={pending} onClick={() => onRevise(false)}>
          {pending ? "Kaydediliyor…" : "Değişikliği kaydet"}
        </Button>
        <Button type="button" variant="danger" disabled={pending} onClick={onDelete}>
          Sil
        </Button>
      </div>

      {error ? (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800" role="alert">
          <p>{error}</p>
          {confirmAvailability ? (
            <Button type="button" variant="secondary" className="mt-2 !py-1 !text-xs" disabled={pending} onClick={() => onRevise(true)}>
              Yine de bu saate planla
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
