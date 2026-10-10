"use client";

/**
 * Faz 1 (ENROLLMENT_PAYMENT_RENEWAL_VALIDATION_FIX) — ders günü/saati için
 * profesyonel, erişilebilir giriş. Önceki halinde bu tek bir serbest metin
 * alanıydı ("Çarşamba 16:00" placeholder'lı `<Input>`) — hem yazım hatasına
 * açık hem klavye/mouse için standart olmayan bir deneyimdi.
 *
 * Kasıtlı tasarım kararı: canonical `LessonSeries` modelinin (weekday 0-6 +
 * "HH:mm" startTime, bkz. src/lib/types.ts) gün/saat GÖSTERİMİNİ birebir
 * kullanır, ama gerçek ders serisi/öğretmen-oda müsaitlik motorunu TETİKLEMEZ
 * — sözleşmedeki bu alan yalnızca BİLGİLENDİRİCİ metindir (Madde 3: "Ders
 * günü/saati: {{lessonScheduleText}}"), otomatik ders üretimi AYRI ve çok
 * daha büyük bir özelliktir, bu düzeltmenin kapsamı DIŞINDA. Depolama biçimi
 * DEĞİŞMEDİ — hâlâ `lessonScheduleText: string` — bu bileşen yalnızca o
 * string'in NASIL girildiğini iyileştirir.
 */

import { useId, useState } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  LESSON_SCHEDULE_WEEKDAY_LABELS as WEEKDAY_LABELS,
  LESSON_SCHEDULE_DISPLAY_ORDER as DISPLAY_ORDER,
  composeLessonScheduleText as composeText,
  parseLessonScheduleText as parseSlots,
  type LessonScheduleSlot as Slot,
} from "@/lib/lesson-schedule-text";

export function LessonScheduleSlotsPicker({
  value,
  onChange,
  name,
}: {
  value: string;
  onChange: (text: string) => void;
  /** Verilirse (native `<form action=...>` akışları için, ör. yeni öğrenci kaydı) aynı ada sahip GİZLİ bir input senkronize edilir. */
  name?: string;
}) {
  const [slots, setSlots] = useState<Slot[]>(() => parseSlots(value));
  const [pendingWeekday, setPendingWeekday] = useState<number | null>(null);
  const [pendingTime, setPendingTime] = useState("");
  const [slotError, setSlotError] = useState<string | null>(null);
  const groupLabelId = useId();

  function commit(next: Slot[]) {
    setSlots(next);
    onChange(composeText(next));
  }

  function onAddSlot() {
    setSlotError(null);
    if (pendingWeekday === null) {
      setSlotError("Önce bir gün seçin.");
      return;
    }
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(pendingTime)) {
      setSlotError("Saat 24 saat biçiminde (SS:DD) girilmelidir.");
      return;
    }
    if (slots.some((s) => s.weekday === pendingWeekday && s.time === pendingTime)) {
      setSlotError("Bu gün/saat zaten eklendi.");
      return;
    }
    commit([...slots, { weekday: pendingWeekday, time: pendingTime }]);
    setPendingWeekday(null);
    setPendingTime("");
  }

  function onRemoveSlot(idx: number) {
    commit(slots.filter((_, i) => i !== idx));
  }

  return (
    <div>
      {name ? <input type="hidden" name={name} value={composeText(slots)} /> : null}
      {slots.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-2">
          {slots.map((s, idx) => (
            <li
              key={`${s.weekday}-${s.time}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-muted)] px-3 py-1 text-xs font-medium text-[var(--color-text)]"
            >
              {WEEKDAY_LABELS[s.weekday]} {s.time}
              <button
                type="button"
                onClick={() => onRemoveSlot(idx)}
                aria-label={`${WEEKDAY_LABELS[s.weekday]} ${s.time} dersini kaldır`}
                className="rounded-full px-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-rose-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-focus-ring)]"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-2 text-xs text-[var(--color-text-muted)]">Henüz ders günü/saati eklenmedi (opsiyonel).</p>
      )}

      <div id={groupLabelId} className="mb-1 text-xs font-medium text-[var(--color-text-muted)]">
        Ders günü ekle
      </div>
      <div role="group" aria-labelledby={groupLabelId} className="mb-2 flex flex-wrap gap-1.5">
        {DISPLAY_ORDER.map((weekday) => (
          <button
            key={weekday}
            type="button"
            aria-pressed={pendingWeekday === weekday}
            onClick={() => setPendingWeekday(weekday)}
            className={cn(
              "rounded-md border px-2.5 py-1.5 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-focus-ring)]",
              pendingWeekday === weekday
                ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                : "border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
            )}
          >
            {WEEKDAY_LABELS[weekday]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
          Saat
          <input
            type="time"
            step={300}
            value={pendingTime}
            onChange={(e) => setPendingTime(e.target.value)}
            className="rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]/30"
          />
        </label>
        <Button type="button" variant="secondary" onClick={onAddSlot}>
          Ekle
        </Button>
      </div>
      {slotError ? <p className="mt-1 text-xs font-medium text-rose-600">{slotError}</p> : null}
    </div>
  );
}

/**
 * Native `<form action={serverAction}>` sayfaları (ör. yeni öğrenci kaydı)
 * için kendi kendine yeten sarmalayıcı — üst bileşenin değeri STATE olarak
 * tutmasına gerek yoktur, yalnızca `name` ile FormData'ya katılır.
 */
export function LessonScheduleField({ name, label }: { name: string; label?: string }) {
  const [value, setValue] = useState("");
  return (
    <div>
      {label ? <p className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">{label}</p> : null}
      <LessonScheduleSlotsPicker value={value} onChange={setValue} name={name} />
    </div>
  );
}
