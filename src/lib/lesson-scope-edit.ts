/**
 * 2026-09-17 — hatalı planlanmış dersleri SİLME ve REVİZE ETME, üç kapsamla:
 * "single" (yalnız bu ders) | "fromHereOnward" (bu ders ve sonrası) |
 * "entireSeries" (tüm seri). Kapsam deseni lesson-reassignment.ts ile aynıdır.
 *
 * İptalden farkı: iptal edilen ders programda "İptal" olarak KALIR (gerçekleşmemiş
 * ders bilgisi). Silme, yanlış girilmiş kaydı programdan tamamen kaldırır.
 *
 * Koruma: yoklaması/işlemi/tahsilatı/telafi bağı olan ders ne silinir ne revize
 * edilir — bu veriler bozulmasın diye "korunan" olarak raporlanır, kalanlar işlenir.
 * Saatler kurum saat diliminde duvar saatidir (bkz. zonedWallTimeToUtc).
 */
import { addMinutes, differenceInMinutes, parseISO } from "date-fns";
import type { AppData, Lesson, LessonSeriesStatus } from "./types";
import { validateLessonSlot, type SlotValidationCode } from "./makeup-engine";
import { assertWorkDaySchedulable } from "./work-days";
import {
  DEFAULT_APP_TIMEZONE,
  addDaysYmd,
  toZonedYmd,
  wallDateTimeInputToIso,
  zonedHm,
  zonedWallTimeToUtc,
  zonedWeekday,
} from "./timezone";

export type LessonEditScope = "single" | "fromHereOnward" | "entireSeries";

/** Yoklama/işlem/tahsilat/telafi bağı olan ders — silinmez, revize edilmez. Neden Türkçe döner. */
export function lessonProtectionReason(data: AppData, lesson: Lesson): string | null {
  if (lesson.studentAttended || lesson.lessonProcessed || lesson.opsMakeupFlag || lesson.studentAbsent || lesson.studentExcused) {
    return "yoklama/işlem kaydı var";
  }
  if (lesson.status === "completed" || lesson.status === "in_progress" || lesson.status === "no_show") {
    return "ders gerçekleşmiş olarak işaretli";
  }
  if (lesson.teacherAttendanceStatus) return "öğretmen yoklaması girilmiş";
  if (data.attendances.some((a) => a.lessonId === lesson.id)) return "yoklama kaydı var";
  if (data.payments.some((p) => p.lessonId === lesson.id && p.status !== "voided")) return "derse bağlı tahsilat var";
  if (lesson.type === "makeup" || lesson.makeupRequestId) return "telafi dersi";
  if (data.makeupRequests.some((m) => m.sourceLessonId === lesson.id || m.confirmedLessonId === lesson.id)) {
    return "telafi talebine bağlı";
  }
  return null;
}

export type ScopeResolution = { ok: true; anchor: Lesson; targets: Lesson[] } | { ok: false; message: string };

export function resolveScopeLessons(data: AppData, lessonId: string, scope: LessonEditScope): ScopeResolution {
  const anchor = data.lessons.find((l) => l.id === lessonId);
  if (!anchor) return { ok: false, message: "Ders bulunamadı. Sayfayı yenileyip tekrar deneyin." };
  if (scope === "single") return { ok: true, anchor, targets: [anchor] };
  if (!anchor.seriesId) {
    return { ok: false, message: "Bu ders bir seriye ait değil; yalnız \"Sadece bu ders\" seçeneğini kullanın." };
  }
  const cutoff = parseISO(anchor.startAt).getTime();
  const targets = data.lessons
    .filter((l) => l.seriesId === anchor.seriesId)
    .filter((l) => scope === "entireSeries" || parseISO(l.startAt).getTime() >= cutoff)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  return { ok: true, anchor, targets };
}

export type ProtectedLesson = { lessonId: string; startAt: string; reason: string };

export type LessonDeletionPlan =
  | { ok: true; data: AppData; deletedLessonIds: string[]; protectedLessons: ProtectedLesson[]; seriesId?: string }
  | { ok: false; message: string };

export function planLessonDeletion(data: AppData, lessonId: string, scope: LessonEditScope, now: Date = new Date()): LessonDeletionPlan {
  const resolved = resolveScopeLessons(data, lessonId, scope);
  if (!resolved.ok) return resolved;
  const protectedLessons: ProtectedLesson[] = [];
  const deleteIds = new Set<string>();
  for (const l of resolved.targets) {
    const reason = lessonProtectionReason(data, l);
    if (reason) protectedLessons.push({ lessonId: l.id, startAt: l.startAt, reason });
    else deleteIds.add(l.id);
  }
  if (deleteIds.size === 0) {
    return {
      ok: false,
      message: `Seçilen ders(ler) silinemez: ${protectedLessons[0]?.reason ?? "korunan kayıt"}. Gerekirse dersi iptal edin.`,
    };
  }
  const lessons = data.lessons.filter((l) => !deleteIds.has(l.id));
  const seriesId = resolved.anchor.seriesId;
  // Serinin hiç dersi kalmadıysa seri de kapatılır (programda boş seri kalmasın).
  const lessonSeries =
    seriesId && !lessons.some((l) => l.seriesId === seriesId)
      ? data.lessonSeries.map((s) =>
          s.id === seriesId ? { ...s, status: "cancelled" as LessonSeriesStatus, updatedAt: now.toISOString() } : s
        )
      : data.lessonSeries;
  return { ok: true, data: { ...data, lessons, lessonSeries }, deletedLessonIds: [...deleteIds], protectedLessons, seriesId };
}

export type LessonRevisionInput = {
  lessonId: string;
  scope: LessonEditScope;
  /** Yalnız "single": yeni tarih-saat, "yyyy-MM-ddTHH:mm" (kurum saati) veya ISO. */
  startAt?: string;
  /** Seri kapsamları: yeni başlangıç saati "HH:mm" (kurum saati). */
  startTime?: string;
  /** Seri kapsamları: yeni haftanın günü (0=Pazar..6=Cumartesi); verilmezse gün korunur. */
  weekday?: number;
  durationMinutes?: number;
  allowAvailabilityOverride?: boolean;
};

export type LessonRevisionConflict = { lessonId: string; startAt: string; code: SlotValidationCode | "CLOSED_DAY"; message: string };

export type LessonRevisionResult =
  | {
      ok: true;
      data: AppData;
      updatedLessons: Lesson[];
      protectedLessons: ProtectedLesson[];
      seriesPatch?: { id: string; startTime: string; weekday: number; durationMinutes: number };
    }
  | { ok: false; code: "INVALID" | "BLOCKED_BY_CONFLICT" | "NEEDS_AVAILABILITY_CONFIRM"; message: string; conflicts?: LessonRevisionConflict[] };

export function applyLessonRevision(data: AppData, input: LessonRevisionInput): LessonRevisionResult {
  const resolved = resolveScopeLessons(data, input.lessonId, input.scope);
  if (!resolved.ok) return { ok: false, code: "INVALID", message: resolved.message };
  const { anchor } = resolved;

  const protectedLessons: ProtectedLesson[] = [];
  const editable = resolved.targets.filter((l) => {
    if (l.status === "cancelled") return false;
    const reason = lessonProtectionReason(data, l);
    if (reason) protectedLessons.push({ lessonId: l.id, startAt: l.startAt, reason });
    return !reason;
  });
  if (editable.length === 0) {
    return {
      ok: false,
      code: "INVALID",
      message: `Seçilen ders(ler) değiştirilemez: ${protectedLessons[0]?.reason ?? "iptal edilmiş"}.`,
    };
  }

  const anchorDuration = differenceInMinutes(parseISO(anchor.endAt), parseISO(anchor.startAt));
  const plans: { lesson: Lesson; start: Date; duration: number }[] = [];
  if (input.scope === "single") {
    const iso = input.startAt ? wallDateTimeInputToIso(input.startAt) : anchor.startAt;
    if (!iso) return { ok: false, code: "INVALID", message: "Geçerli bir tarih ve saat seçin." };
    plans.push({ lesson: editable[0]!, start: parseISO(iso), duration: input.durationMinutes ?? anchorDuration });
  } else {
    if (input.startTime !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.startTime)) {
      return { ok: false, code: "INVALID", message: "Saat SS:dd biçiminde olmalı (ör. 15:50)." };
    }
    const anchorWeekday = zonedWeekday(parseISO(anchor.startAt));
    const dayShift = input.weekday === undefined ? 0 : input.weekday - anchorWeekday;
    for (const l of editable) {
      const current = parseISO(l.startAt);
      const hm = input.startTime ?? zonedHm(current, DEFAULT_APP_TIMEZONE);
      const ymd = addDaysYmd(toZonedYmd(current, DEFAULT_APP_TIMEZONE), dayShift);
      const duration = input.durationMinutes ?? differenceInMinutes(parseISO(l.endAt), current);
      plans.push({ lesson: l, start: zonedWallTimeToUtc(ymd, hm), duration });
    }
  }

  // Taşınan dersler birbirinin eski yeriyle çakışma saymasın.
  const movingIds = new Set(plans.map((p) => p.lesson.id));
  const others: AppData = { ...data, lessons: data.lessons.filter((l) => !movingIds.has(l.id)) };
  const conflicts: LessonRevisionConflict[] = [];
  let needsConfirm = false;
  const updatedLessons: Lesson[] = [];
  for (const p of plans) {
    const startIso = p.start.toISOString();
    // ÇALIŞMA GÜNÜ TEK KAYNAĞI — "zorla açık" günler burada da geçerlidir.
    const planTerm = p.lesson.term ?? data.students.find((s) => s.id === p.lesson.studentId)?.termType ?? "guz";
    const planDay = assertWorkDaySchedulable(
      p.start,
      planTerm,
      data.closedDayOverrides ?? [],
      data.settings.termWeeklyClosedDays
    );
    if (!planDay.ok) {
      conflicts.push({ lessonId: p.lesson.id, startAt: startIso, code: "CLOSED_DAY", message: planDay.day.explanation });
      continue;
    }
    const check = validateLessonSlot(
      others,
      { instrument: p.lesson.instrument, studentId: p.lesson.studentId },
      { teacherId: p.lesson.teacherId, roomId: p.lesson.roomId, startAt: startIso },
      { durationMinutes: p.duration, allowAvailabilityOverride: true }
    );
    if (!check.ok) {
      conflicts.push({ lessonId: p.lesson.id, startAt: startIso, code: check.code, message: check.message });
      continue;
    }
    if (check.slot.availabilityOverridden) needsConfirm = true;
    updatedLessons.push({ ...p.lesson, startAt: check.slot.startAt, endAt: addMinutes(p.start, p.duration).toISOString() });
  }

  if (conflicts.length > 0) {
    return {
      ok: false,
      code: "BLOCKED_BY_CONFLICT",
      message: `${conflicts.length} derste çakışma var; hiçbir ders değiştirilmedi. İlk sorun: ${conflicts[0]!.message}`,
      conflicts,
    };
  }
  if (needsConfirm && !input.allowAvailabilityOverride) {
    return {
      ok: false,
      code: "NEEDS_AVAILABILITY_CONFIRM",
      message: "Öğretmen seçilen saatte müsait görünmüyor. Yine de bu saate planlamak için onaylayın.",
    };
  }

  const byId = new Map(updatedLessons.map((l) => [l.id, l]));
  const lessons = data.lessons.map((l) => byId.get(l.id) ?? l);
  let seriesPatch: { id: string; startTime: string; weekday: number; durationMinutes: number } | undefined;
  let lessonSeries = data.lessonSeries;
  if (input.scope !== "single" && anchor.seriesId) {
    const first = updatedLessons[0]!;
    seriesPatch = {
      id: anchor.seriesId,
      startTime: zonedHm(parseISO(first.startAt), DEFAULT_APP_TIMEZONE),
      weekday: zonedWeekday(parseISO(first.startAt)),
      durationMinutes: differenceInMinutes(parseISO(first.endAt), parseISO(first.startAt)),
    };
    const patch = seriesPatch;
    lessonSeries = data.lessonSeries.map((s) =>
      s.id === patch.id
        ? { ...s, startTime: patch.startTime, weekday: patch.weekday, durationMinutes: patch.durationMinutes, updatedAt: new Date().toISOString() }
        : s
    );
  }
  return { ok: true, data: { ...data, lessons, lessonSeries }, updatedLessons, protectedLessons, seriesPatch };
}
