"use client";

/**
 * 2026-09-17 — ders detayında REVİZE ET / SİL, üç kapsamla. Saatler kurum
 * saatiyle girilir ve sunucuda aynı kuralla kaydedilir (sessiz kaydırma yok).
 * Yoklaması/tahsilatı olan dersler sunucuda korunur; sonuç mesajında listelenir.
 * 2026-10-15 — düzenleme (`LessonScopeEditor`) ile "hatalı oluşturuldu — programdan sil" (`LessonDeleteAction`)
 * ayrı bileşenler: silme panelin en altındaki "Riskli işlemler" bölümünde, iptalden ayrı ve açık etiketle durur.
 */

import { useState, useTransition } from "react";
import { actionDeleteLessons, actionForceDeleteLesson, actionReviseLessons, type LessonEditScopeInput } from "@/lib/actions";
import { ModalShell, modalButton } from "@/components/modal-shell";
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

const SCOPE_EFFECT: Record<LessonEditScopeInput, string> = {
  single: "Yalnız bu ders etkilenir.",
  fromHereOnward: "Bu ders ve serinin sonraki tüm dersleri etkilenir; önceki dersler değişmez.",
  entireSeries: "Serinin geçmiş ve gelecek tüm dersleri etkilenir.",
};

function withProtectedNote(base: string, notes: string[]) {
  return notes.length > 0 ? `${base} Korunan (yoklama/tahsilat kaydı olan) dersler değişmedi: ${notes.join(", ")}.` : base;
}

function ScopeRadios({
  lesson,
  scope,
  onChange,
}: {
  lesson: Lesson;
  scope: LessonEditScopeInput;
  onChange: (s: LessonEditScopeInput) => void;
}) {
  const isSeries = Boolean(lesson.seriesId);
  return (
    <div className="flex flex-wrap gap-3 text-sm" role="radiogroup" aria-label="Kapsam">
      {(Object.keys(SCOPE_LABEL) as LessonEditScopeInput[]).map((s) => (
        <label key={s} className={`flex items-center gap-1.5 ${s !== "single" && !isSeries ? "opacity-40" : ""}`}>
          <input
            type="radio"
            name={`scope-${lesson.id}`}
            checked={scope === s}
            disabled={s !== "single" && !isSeries}
            onChange={() => onChange(s)}
          />
          {SCOPE_LABEL[s]}
        </label>
      ))}
    </div>
  );
}

export function LessonScopeEditor({ lesson, onDone }: { lesson: Lesson; onDone: (message: string) => void }) {
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

  return (
    <div className="space-y-3">
      <ScopeRadios
        lesson={lesson}
        scope={scope}
        onChange={(s) => {
          setScope(s);
          setError(null);
          setConfirmAvailability(false);
        }}
      />
      <p className="text-xs text-amber-700">{SCOPE_EFFECT[scope]}</p>

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
        <Button type="button" disabled={pending} onClick={() => onRevise(false)}>
          {pending ? "Kaydediliyor…" : "Değişikliği kaydet"}
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

/**
 * "Hatalı oluşturuldu — programdan sil": yanlış planlanmış ders(ler)i kaldırır (iptal DEĞİL — iptalde ders "İptal"
 * olarak kalır). Kapsam seçimi pencerenin içinde; gerekçe + kritik işlem şifresi zorunlu (sunucu kuralı değişmedi).
 */
export function LessonDeleteAction({ lesson, onDone }: { lesson: Lesson; onDone: (message: string) => void }) {
  const [scope, setScope] = useState<LessonEditScopeInput>("single");
  const [pending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [forceMode, setForceMode] = useState(false);
  const [forcePassword, setForcePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function onDelete() {
    setDeleteOpen(true);
    setForceMode(false);
    setForcePassword("");
    setDeleteReason("");
    setDeleteError(null);
  }

  function confirmDelete() {
    setDeleteError(null);
    startTransition(async () => {
      if (forceMode) {
        const res = await actionForceDeleteLesson({ lessonId: lesson.id, criticalPassword: forcePassword, reason: deleteReason });
        setForcePassword("");
        if (!res.ok) {
          setDeleteError(res.message);
          return;
        }
        setDeleteOpen(false);
        onDone("Statüsü girilmiş ders ve yoklaması tamamen silindi. İşlem denetim kaydına yazıldı.");
        return;
      }
      const result = await actionDeleteLessons({ lessonId: lesson.id, scope, reason: deleteReason, criticalPassword: forcePassword });
      setForcePassword("");
      if (!result.ok) {
        setDeleteError(result.message);
        if (result.forceable) setForceMode(true);
        return;
      }
      setDeleteOpen(false);
      onDone(withProtectedNote(`${result.deletedCount} ders silindi.`, result.protectedNotes));
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={onDelete}
        className="rounded-md px-1.5 py-1 text-xs font-medium text-[var(--color-danger)] underline-offset-2 hover:bg-[var(--color-danger-soft)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-focus-ring)]"
      >
        Hatalı oluşturuldu — programdan sil
      </button>

      <ModalShell
        open={deleteOpen}
        tone="danger"
        busy={pending}
        title={forceMode ? "Statüsü girilmiş dersi tamamen sil" : `Dersi programdan sil — ${SCOPE_LABEL[scope]}`}
        onClose={() => setDeleteOpen(false)}
        footer={
          <>
            <button type="button" className={modalButton.secondary} onClick={() => setDeleteOpen(false)} disabled={pending}>
              Vazgeç
            </button>
            <button
              type="button"
              className={modalButton.danger}
              disabled={pending || deleteReason.trim().length < 5 || forcePassword.length === 0}
              onClick={confirmDelete}
            >
              {pending ? "Siliniyor…" : forceMode ? "Tamamen sil" : "Programdan sil"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {lesson.seriesId && !forceMode ? (
            <div className="space-y-1">
              <ScopeRadios
                lesson={lesson}
                scope={scope}
                onChange={(s) => {
                  setScope(s);
                  setDeleteError(null);
                }}
              />
              <p className="text-xs text-amber-700">{SCOPE_EFFECT[scope]}</p>
            </div>
          ) : null}
          <ul className="space-y-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-2.5 text-xs">
            <li>
              <strong>İptal et</strong> — ders programda &quot;İptal&quot; olarak kalır; telafi ve yoklama kuralları işler. (Bu
              pencereyi kapatıp &quot;Dersi iptal et&quot;i kullanın.)
            </li>
            <li className={forceMode ? "opacity-60" : ""}>
              <strong>Programdan sil</strong> — yanlış girilmiş, henüz statüsü olmayan ders(ler) kaldırılır.{" "}
              {scope === "single" ? "Yalnız bu ders." : scope === "fromHereOnward" ? "Bu ders ve serinin sonrakileri." : "Serinin tamamı."}{" "}
              Yoklaması/tahsilatı olanlar atlanır. Kurum sahibinin kritik işlem şifresi ve gerekçe gerekir.
            </li>
            <li className={forceMode ? "" : "opacity-60"}>
              <strong>Tamamen sil (kritik)</strong> — statüsü girilmiş tek ders yoklamasıyla birlikte silinir.{" "}
              <strong>Geri alınamaz</strong>; kurum sahibinin kritik işlem şifresi gerekir, dersin dökümü denetim kaydında kalır.
              Tahsilat veya telafi bağlı derste yapılamaz.
            </li>
          </ul>
          <label className="block text-xs font-medium text-[var(--color-text)]">
            Gerekçe (en az 5 karakter)
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              rows={2}
              maxLength={500}
              className="mt-1 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-xs font-medium text-[var(--color-text)]">
            Kritik işlem şifresi
            <input
              type="password"
              autoComplete="off"
              value={forcePassword}
              onChange={(e) => setForcePassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
            />
          </label>
          {deleteError ? (
            <p role="alert" className="text-xs font-medium" style={{ color: "var(--color-danger)" }}>
              {deleteError}
            </p>
          ) : null}
        </div>
      </ModalShell>
    </>
  );
}
