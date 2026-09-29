import { addMinutes, isBefore } from "date-fns";
import { DEFAULT_APP_TIMEZONE, addDaysYmd, toZonedYmd, zonedWallTimeToUtc } from "./timezone";
import type { AppData, Instrument, StudentTermType } from "./types";
import { assertWorkDaySchedulable, isSuggestableWorkDay } from "./work-days";
import { validateLessonSlot, type ValidatedSlot } from "./makeup-engine";
import { teacherServesBranch } from "./teacher-branches";

export type LessonSlotSuggestion = ValidatedSlot & {
  score: number;
  reasons: string[];
};

export type SuggestLessonSlotsParams = {
  studentId: string;
  instrument: Instrument;
  teacherId?: string;
  daysAhead?: number;
  maxSlots?: number;
};

/**
 * Sıradan ders planlama için "uygun saatleri bul" asistanı. Telafi motorundan
 * (suggestMakeupSlots) bilinçli olarak ayrı tutulur — iki domain'in nedenleri
 * ve varsayılanları farklıdır — ancak TÜM güvenlik/çakışma/uygunluk kuralları
 * tek kaynaktan, `validateLessonSlot`'tan gelir; burada hiçbir kural
 * kopyalanmaz veya yeniden yazılmaz.
 */
export function suggestLessonSlots(
  data: AppData,
  params: SuggestLessonSlotsParams,
  now: Date = new Date()
): LessonSlotSuggestion[] {
  const daysAhead = params.daysAhead ?? 14;
  const maxSlots = params.maxSlots ?? 8;
  const duration = data.settings.lessonDurationMinutes;
  const { workingHours, workingDays } = data.settings;

  const student = data.students.find((s) => s.id === params.studentId);

  let candidates = data.teachers.filter(
    (t) => t.active && t.instruments.includes(params.instrument)
  );
  if (params.teacherId) {
    candidates = candidates.filter((t) => t.id === params.teacherId);
  }

  candidates.sort((a, b) => {
    if (student) {
      if (a.id === student.teacherId && b.id !== student.teacherId) return -1;
      if (b.id === student.teacherId && a.id !== student.teacherId) return 1;
      if (a.branchId === student.branchId && b.branchId !== student.branchId) return -1;
      if (b.branchId === student.branchId && a.branchId !== student.branchId) return 1;
    }
    return 0;
  });

  const roomsForInstrument = data.rooms.filter((r) => r.active !== false && r.instruments.includes(params.instrument));

  const suggestions: LessonSlotSuggestion[] = [];

  const todayYmd = toZonedYmd(now, DEFAULT_APP_TIMEZONE);
  for (let d = 1; d <= daysAhead; d++) {
    const ymd = addDaysYmd(todayYmd, d);
    if (!isSuggestableWorkDay(ymd, student?.termType ?? "guz", data.closedDayOverrides ?? [], data.settings.termWeeklyClosedDays, workingDays)) continue;

    const dayStart = zonedWallTimeToUtc(ymd, workingHours.start);
    const dayEnd = zonedWallTimeToUtc(ymd, workingHours.end);

    for (let cursor = new Date(dayStart); cursor < dayEnd; cursor = addMinutes(cursor, 30)) {
      const previewEnd = addMinutes(cursor, duration);
      if (previewEnd > dayEnd) break;
      if (isBefore(cursor, now)) continue;

      for (const teacher of candidates) {
        const teacherRooms = roomsForInstrument.filter((r) => teacherServesBranch(teacher, r.branchId));
        let matched: ValidatedSlot | null = null;
        for (const room of teacherRooms) {
          const result = validateLessonSlot(
            data,
            { instrument: params.instrument, studentId: params.studentId },
            { teacherId: teacher.id, roomId: room.id, startAt: cursor.toISOString() },
            { now }
          );
          if (result.ok) {
            matched = result.slot;
            break;
          }
        }
        if (!matched) continue;

        const reasons: string[] = [];
        let score = 40;

        if (student && teacher.id === student.teacherId) {
          score += 30;
          reasons.push("Öğrencinin mevcut öğretmeni");
        }
        if (student && teacherServesBranch(teacher, student.branchId)) {
          score += 15;
          reasons.push("Aynı şube");
        }
        score += Math.max(0, 20 - d);
        reasons.push("Öğretmen müsait");
        reasons.push("Programda boşluk var");

        suggestions.push({ ...matched, score, reasons });
      }
    }
  }

  suggestions.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const unique: LessonSlotSuggestion[] = [];
  for (const s of suggestions) {
    const key = `${s.startAt}|${s.teacherId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(s);
    if (unique.length >= maxSlots) break;
  }
  return unique;
}


/**
 * Planlama kapalı gün engeli — ÇALIŞMA GÜNÜ TEK KAYNAĞI (src/lib/work-days.ts).
 *
 * 2026-09-20 kök neden: burası `isDateClosed`'u çağırıyordu; o fonksiyon
 * yalnız "Pazartesi" + verilen tarih listesine bakıyor, `ClosedDay.isOpen`
 * bayrağını HİÇ okumuyordu — yani yöneticinin "zorla açık" ettiği bir gün
 * yine reddediliyordu. Üstelik tek çağıranı (`createTrialLessonTool`) listeyi
 * BOŞ geçiyordu, dolayısıyla istisnalar deneme dersi planlamasına hiç
 * ulaşmıyordu. Artık ders planlama doğrulamasının (`validateLessonSlot`)
 * kullandığı aynı çözümleyiciden geçer.
 */
export function assertSchedulableDate(
  startAtIso: string,
  data: Pick<AppData, "settings" | "closedDayOverrides">,
  term: StudentTermType = "guz"
): { ok: true } | { ok: false; message: string } {
  const start = new Date(startAtIso);
  if (Number.isNaN(start.getTime())) return { ok: false, message: "Geçerli bir tarih ve saat seçin." };
  const result = assertWorkDaySchedulable(
    start,
    term,
    data.closedDayOverrides ?? [],
    data.settings.termWeeklyClosedDays
  );
  return result.ok ? { ok: true } : { ok: false, message: result.message };
}
