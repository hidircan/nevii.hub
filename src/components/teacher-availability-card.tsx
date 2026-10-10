"use client";

/**
 * 8. tur (B) — ders ekleme / seri pop-up'ında öğretmenlerin seçilen gündeki
 * müsaitliği. Veri (tarih, şube) başına TEK server action ile gelir ve modül
 * seviyesinde önbelleğe alınır — pop-up her açıldığında yeniden sorgu atılmaz.
 * Önbellek, program verisi yenilendiğinde (`dataVersion` değişince) boşaltılır.
 * Buradaki uyarılar rehberdir; son söz sunucudaki `validateLessonSlot`'tadır.
 */

import { useEffect, useState } from "react";
import { actionTeacherDayAvailability } from "@/lib/actions";
import { freeRanges, hmToMin, minToHm, slotAdvice, type TeacherDayAvailability } from "@/lib/teacher-day-availability";

type LoadResult = Awaited<ReturnType<typeof actionTeacherDayAvailability>>;

const cache = new Map<string, Promise<LoadResult>>();
let cacheVersion: unknown = null;

function load(date: string, branchId: string, dataVersion: unknown): Promise<LoadResult> {
  if (dataVersion !== cacheVersion) {
    cache.clear();
    cacheVersion = dataVersion;
  }
  const key = `${date}|${branchId}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = actionTeacherDayAvailability({ date, branchId }).then((r) => {
      if (!r.ok) cache.delete(key);
      return r;
    });
    cache.set(key, hit);
  }
  return hit;
}

export type AvailabilityCardTeacher = { id: string; name: string; isAssigned: boolean; eligible: boolean };

export function TeacherAvailabilityCard({
  date,
  branchId,
  dateLabel,
  teachers,
  selectedTeacherId,
  startHm,
  durationMinutes,
  dataVersion,
  onPickTeacher,
  onPickTime,
}: {
  /** yyyy-MM-dd (kurum saati) */
  date: string;
  branchId: string;
  dateLabel: string;
  teachers: AvailabilityCardTeacher[];
  selectedTeacherId: string;
  /** HH:mm — boşsa yalnız müsaitlik gösterilir, öneri yapılmaz. */
  startHm: string;
  durationMinutes: number;
  dataVersion: unknown;
  onPickTeacher: (teacherId: string) => void;
  onPickTime: (hm: string) => void;
}) {
  const key = `${date}|${branchId}`;
  const [state, setState] = useState<{ key: string; result: LoadResult } | null>(null);

  useEffect(() => {
    let alive = true;
    void load(date, branchId, dataVersion).then((result) => {
      if (alive) setState({ key, result });
    });
    return () => {
      alive = false;
    };
  }, [date, branchId, key, dataVersion]);

  const result = state?.key === key ? state.result : null;

  return (
    <section
      aria-label="Öğretmen müsaitliği"
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3"
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--color-text)]">Öğretmen müsaitliği · {dateLabel}</h3>
        <Legend />
      </div>
      {!result ? (
        <p className="text-xs text-[var(--color-text-muted)]">Müsaitlik yükleniyor…</p>
      ) : !result.ok ? (
        <p role="alert" className="text-xs font-medium" style={{ color: "var(--color-warning)" }}>
          {result.message}
        </p>
      ) : (
        <Rows
          days={result.teachers}
          teachers={teachers}
          selectedTeacherId={selectedTeacherId}
          startHm={startHm}
          durationMinutes={durationMinutes}
          onPickTeacher={onPickTeacher}
          onPickTime={onPickTime}
        />
      )}
    </section>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-muted)]">
      <span className="flex items-center gap-1">
        <span className="h-2.5 w-4 rounded-sm border border-[var(--color-success)] bg-[var(--color-success-soft)]" /> Boş
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2.5 w-4 rounded-sm bg-[var(--color-text-muted)] opacity-50" /> Dersi var
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2.5 w-4 rounded-sm border-2 border-[var(--color-primary)]" /> Seçilen saat
      </span>
    </div>
  );
}

function Rows({
  days,
  teachers,
  selectedTeacherId,
  startHm,
  durationMinutes,
  onPickTeacher,
  onPickTime,
}: {
  days: TeacherDayAvailability[];
  teachers: AvailabilityCardTeacher[];
  selectedTeacherId: string;
  startHm: string;
  durationMinutes: number;
  onPickTeacher: (teacherId: string) => void;
  onPickTime: (hm: string) => void;
}) {
  const byId = new Map(days.map((d) => [d.teacherId, d]));
  const rows = teachers
    .filter((t) => t.isAssigned || (t.eligible && byId.has(t.id)))
    .sort(
      (a, b) =>
        Number(b.isAssigned) - Number(a.isAssigned) ||
        Number(b.id === selectedTeacherId) - Number(a.id === selectedTeacherId) ||
        freeMinutes(byId.get(b.id)) - freeMinutes(byId.get(a.id)) ||
        a.name.localeCompare(b.name, "tr")
    );
  if (rows.length === 0) {
    return <p className="text-xs text-[var(--color-text-muted)]">Bu şube ve enstrüman için uygun öğretmen yok.</p>;
  }

  // Ortak zaman ekseni: tüm pencere/derslerin kapsadığı saatler (en az 09–21), tam saate yuvarlı.
  const all = days.flatMap((d) => [...d.windows, ...d.busy]);
  const axisStart = Math.floor(Math.min(9 * 60, ...all.map((r) => hmToMin(r.start))) / 60) * 60;
  const axisEnd = Math.ceil(Math.max(21 * 60, ...all.map((r) => hmToMin(r.end))) / 60) * 60;
  const pct = (hm: string) => ((hmToMin(hm) - axisStart) / (axisEnd - axisStart)) * 100;
  const width = (r: { start: string; end: string }) => pct(r.end) - pct(r.start);
  const hours: number[] = [];
  for (let m = axisStart; m <= axisEnd; m += 120) hours.push(m);
  const slot = startHm ? { start: startHm, end: minToHm(hmToMin(startHm) + durationMinutes) } : null;

  const selected = rows.find((t) => t.id === selectedTeacherId);
  const selectedDay = selected ? byId.get(selected.id) : undefined;
  const advice = selected && slot ? adviceFor(selected, selectedDay, slot.start, durationMinutes) : null;

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[minmax(0,9rem)_1fr] items-end gap-2 max-sm:hidden">
        <span />
        <div className="relative h-3 text-[10px] text-[var(--color-text-muted)]">
          {hours.map((m) => (
            <span key={m} className="absolute -translate-x-1/2" style={{ left: `${pct(minToHm(m))}%` }}>
              {minToHm(m)}
            </span>
          ))}
        </div>
      </div>
      {rows.map((t) => {
        const day = byId.get(t.id);
        const isSelected = t.id === selectedTeacherId;
        const free = day ? freeRanges(day) : [];
        return (
          <div
            key={t.id}
            className={`grid grid-cols-1 items-center gap-1 rounded-lg px-2 py-1.5 sm:grid-cols-[minmax(0,9rem)_1fr] sm:gap-2 ${
              isSelected
                ? "bg-[var(--color-surface)] ring-2 ring-[var(--color-primary)]"
                : t.isAssigned
                  ? "bg-[var(--color-primary-soft)]"
                  : ""
            }`}
          >
            <button
              type="button"
              disabled={!t.eligible}
              onClick={() => onPickTeacher(t.id)}
              className="min-w-0 text-left text-xs disabled:cursor-not-allowed"
              title={t.eligible ? `${t.name} öğretmenini seç` : undefined}
            >
              <span className={`block truncate ${isSelected || t.isAssigned ? "font-semibold" : ""} text-[var(--color-text)]`}>
                {t.name}
              </span>
              <span className="block truncate text-[11px] text-[var(--color-text-muted)]">
                {t.isAssigned ? "Öğrencinin öğretmeni · " : ""}
                {!day
                  ? "Bu şubede ders vermiyor"
                  : day.windows.length === 0
                    ? "Bu gün müsaitlik yok"
                    : free.length === 0
                      ? "Gün dolu"
                      : `Boş: ${free.map((r) => `${r.start}–${r.end}`).join(", ")}`}
              </span>
            </button>
            <div className="relative h-6 overflow-hidden rounded-md bg-[var(--color-surface)] ring-1 ring-[var(--color-border)]">
              {day?.windows.map((w) => (
                <span
                  key={`w-${w.start}`}
                  className="absolute inset-y-0 border-x border-[var(--color-success)] bg-[var(--color-success-soft)]"
                  style={{ left: `${pct(w.start)}%`, width: `${width(w)}%` }}
                />
              ))}
              {day?.busy.map((b) => (
                <span
                  key={`b-${b.start}`}
                  title={`${b.start}–${b.end} dersi var`}
                  className="absolute inset-y-1 rounded-sm bg-[var(--color-text-muted)] opacity-50"
                  style={{ left: `${pct(b.start)}%`, width: `${width(b)}%` }}
                />
              ))}
              {t.eligible
                ? free.map((r) => (
                    <button
                      key={`f-${r.start}`}
                      type="button"
                      aria-label={`${t.name} ${r.start}–${r.end} arası boş; ${r.start} saatini seç`}
                      title={`${r.start}–${r.end} boş — tıklayınca ${r.start} seçilir`}
                      onClick={() => {
                        onPickTeacher(t.id);
                        onPickTime(r.start);
                      }}
                      className="absolute inset-y-0 hover:bg-[var(--color-success)]/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-focus-ring)]"
                      style={{ left: `${pct(r.start)}%`, width: `${width(r)}%` }}
                    />
                  ))
                : null}
              {slot ? (
                <span
                  aria-hidden
                  className={`pointer-events-none absolute inset-y-0 rounded-sm border-2 border-[var(--color-primary)] ${isSelected ? "" : "opacity-40"}`}
                  style={{ left: `${pct(slot.start)}%`, width: `${Math.max(width(slot), 0.8)}%` }}
                />
              ) : null}
            </div>
          </div>
        );
      })}
      {advice ? (
        <div
          role={advice.tone === "warn" ? "status" : undefined}
          className="mt-2 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-xs"
          style={{
            background: advice.tone === "ok" ? "var(--color-success-soft)" : "var(--color-warning-soft)",
            color: "var(--color-text)",
          }}
        >
          <span className="flex-1">{advice.message}</span>
          {advice.suggestion && advice.suggestion !== startHm ? (
            <button
              type="button"
              onClick={() => onPickTime(advice.suggestion!)}
              className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1 font-medium hover:border-[var(--color-primary)]"
            >
              {advice.suggestion} saatini seç
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function freeMinutes(day: TeacherDayAvailability | undefined): number {
  return day ? freeRanges(day).reduce((sum, r) => sum + hmToMin(r.end) - hmToMin(r.start), 0) : -1;
}

function adviceFor(
  teacher: AvailabilityCardTeacher,
  day: TeacherDayAvailability | undefined,
  startHm: string,
  durationMinutes: number
) {
  if (!day) {
    return {
      tone: "warn" as const,
      message: `${teacher.name} bu şubede ders vermiyor. Başka öğretmen seçin veya öğretmenin şubelerini Öğretmenler ekranından güncelleyin.`,
      suggestion: null,
    };
  }
  return slotAdvice(teacher.name, day, startHm, durationMinutes);
}
