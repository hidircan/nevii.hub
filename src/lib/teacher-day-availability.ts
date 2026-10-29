/**
 * 8. tur (B) — ders ekleme/seri pop-up'ındaki "öğretmen müsaitlik kartı" için
 * saf yardımcılar. Kural kaynağı `validateLessonSlot` ile aynıdır: pencere =
 * `availabilityForBranch` + haftanın günü; meşguliyet = iptal edilmemiş dersler
 * (şube fark etmez — öğretmen aynı anda iki yerde olamaz) + iptal edilmemiş
 * denemeler. Tüm saatler kurum saatinde "HH:mm".
 */

import { parseISO } from "date-fns";
import { availabilityForBranch, isTeacherSchedulable, teacherServesBranch } from "./teacher-branches";
import { DEFAULT_APP_TIMEZONE, toZonedYmd, zonedHm, zonedWallTimeToUtc, zonedWeekday } from "./timezone";
import type { BranchId, Lesson, Teacher } from "./types";
import { lessonOccupiesSlot } from "./lesson-occupancy";

export type HmRange = { start: string; end: string };
export type TeacherDayAvailability = { teacherId: string; windows: HmRange[]; busy: HmRange[] };

export function hmToMin(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

export function minToHm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** Çakışan/bitişik aralıkları birleştirir, sıralı döner. */
function mergeRanges(ranges: HmRange[]): HmRange[] {
  const sorted = [...ranges].sort((a, b) => a.start.localeCompare(b.start));
  const out: HmRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) {
      if (r.end > last.end) last.end = r.end;
    } else out.push({ ...r });
  }
  return out;
}

/** Bir tarih (yyyy-MM-dd) + şube için her uygun öğretmenin pencere ve meşgul aralıkları — tek geçiş. */
export function buildTeacherDayAvailability(
  data: { teachers: Teacher[]; lessons: Lesson[] },
  trials: Array<{ teacherId: string; startAt: string; endAt: string; status: string }>,
  input: { date: string; branchId: BranchId },
  now: Date = new Date()
): TeacherDayAvailability[] {
  const dow = zonedWeekday(zonedWallTimeToUtc(input.date, "12:00"));
  const busyByTeacher = new Map<string, HmRange[]>();
  const push = (teacherId: string, startAt: string, endAt: string) => {
    const s = parseISO(startAt);
    if (toZonedYmd(s, DEFAULT_APP_TIMEZONE) !== input.date) return;
    const list = busyByTeacher.get(teacherId) ?? [];
    list.push({ start: zonedHm(s, DEFAULT_APP_TIMEZONE), end: zonedHm(parseISO(endAt), DEFAULT_APP_TIMEZONE) });
    busyByTeacher.set(teacherId, list);
  };
  for (const l of data.lessons) if (lessonOccupiesSlot(l)) push(l.teacherId, l.startAt, l.endAt);
  for (const t of trials) if (t.status !== "cancelled") push(t.teacherId, t.startAt, t.endAt);

  return data.teachers
    .filter((t) => isTeacherSchedulable(t, now) && teacherServesBranch(t, input.branchId))
    .map((t) => ({
      teacherId: t.id,
      windows: mergeRanges(
        availabilityForBranch(t.availability, input.branchId)
          .filter((w) => w.dayOfWeek === dow)
          .map((w) => ({ start: w.start, end: w.end }))
      ),
      busy: mergeRanges(busyByTeacher.get(t.id) ?? []),
    }));
}

/** Pencerelerden meşgul aralıkları çıkarır → boş aralıklar. */
export function freeRanges(day: Pick<TeacherDayAvailability, "windows" | "busy">): HmRange[] {
  const out: HmRange[] = [];
  for (const w of day.windows) {
    let cursor = w.start;
    for (const b of day.busy) {
      if (b.end <= cursor || b.start >= w.end) continue;
      if (b.start > cursor) out.push({ start: cursor, end: b.start });
      if (b.end > cursor) cursor = b.end;
    }
    if (cursor < w.end) out.push({ start: cursor, end: w.end });
  }
  return out;
}

/** İstenen saate en yakın, süreyi sığdıran boş başlangıç (15 dk adım). */
export function nearestFreeStart(day: Pick<TeacherDayAvailability, "windows" | "busy">, startHm: string, durationMinutes: number): string | null {
  const want = hmToMin(startHm);
  let best: number | null = null;
  for (const r of freeRanges(day)) {
    const lo = hmToMin(r.start);
    const hi = hmToMin(r.end) - durationMinutes;
    for (let s = lo; s <= hi; s += 15) {
      if (best === null || Math.abs(s - want) < Math.abs(best - want)) best = s;
    }
  }
  return best === null ? null : minToHm(best);
}

const fmt = (ranges: HmRange[]) => ranges.map((r) => `${r.start}–${r.end}`).join(", ");

/**
 * Seçilen saat için yol gösterici Türkçe açıklama. Sert hata değildir: sunucu
 * yine son sözü söyler (`validateLessonSlot`); bu yalnız seçim yaparken rehberdir.
 */
export function slotAdvice(
  teacherName: string,
  day: Pick<TeacherDayAvailability, "windows" | "busy">,
  startHm: string,
  durationMinutes: number
): { tone: "ok" | "warn"; message: string; suggestion: string | null } {
  const s = hmToMin(startHm);
  const e = s + durationMinutes;
  const endHm = minToHm(e);
  const suggestion = nearestFreeStart(day, startHm, durationMinutes);
  const tail = suggestion && suggestion !== startHm ? ` En yakın boş saat: ${suggestion}.` : "";
  if (day.windows.length === 0) {
    return {
      tone: "warn",
      message: `${teacherName} bu gün için müsaitlik bildirmemiş. Yine de planlarsanız ders "müsaitlik dışı" olarak işaretlenir; başka bir gün ya da öğretmen seçebilirsiniz.`,
      suggestion: null,
    };
  }
  const clash = day.busy.find((b) => hmToMin(b.start) < e && s < hmToMin(b.end));
  if (clash) {
    return {
      tone: "warn",
      message: `${teacherName} ${clash.start}–${clash.end} arası başka bir derste.${tail || " Bu gün başka boş saat kalmadı; başka bir gün deneyin."}`,
      suggestion,
    };
  }
  const inside = day.windows.some((w) => w.start <= startHm && endHm <= w.end);
  if (!inside) {
    return {
      tone: "warn",
      message: `${teacherName} bu günde ${fmt(day.windows)} arası müsait.${tail}`,
      suggestion,
    };
  }
  return { tone: "ok", message: `${teacherName} ${startHm}–${endHm} arası müsait.`, suggestion: null };
}
