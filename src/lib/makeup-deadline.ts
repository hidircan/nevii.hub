/**
 * Telafi planlama sınırının saf hesabı. `makeup-engine` ve `lesson-occupancy`
 * bunu kullanır; yaşam döngüsü mutasyonları (`makeup-lifecycle`) de buradan
 * okur. Döngü olmasın diye motor/store import etmez.
 */
import type { AppData, Lesson, MakeupRequest } from "./types";
import { addDaysYmd, resolveAppTimezone, toZonedYmd, zonedWallTimeToUtc } from "./timezone";

export const MAKEUP_PLANNING_EXPIRED_REASON = "Telafi planlama süresi doldu";

export type MakeupChangeAction =
  | "planning_expired"
  | "deadline_extended"
  | "plan_revised"
  | "plan_deleted"
  | "right_cancelled";

export interface MakeupChangeEntry {
  action: MakeupChangeAction;
  at: string;
  by: string;
  from?: string;
  to?: string;
  note?: string;
}

const UNPLANNED = new Set(["pending", "suggested", "awaiting_info"]);

/** Son geçerli yerel günün ertesi günü 00:00 (kurum saat dilimi). Bu an kapanmıştır. */
export function makeupPlanningDeadline(expiresAtIso: string, timeZone = resolveAppTimezone()): Date {
  const ymd = toZonedYmd(new Date(expiresAtIso), timeZone);
  return zonedWallTimeToUtc(addDaysYmd(ymd, 1), "00:00", timeZone);
}

/**
 * Otomatik kapatma kesme tarihi (OWNER KARARI, hakediş korunur): planlama sınırı bu andan ÖNCE olan talepler
 * "legacy"dir — ekranda eskisi gibi yalnız `expired` görünür, kaynak derse/hakedişe dokunulmaz ve DB'ye yazılmaz.
 * Sınırı bu andan sonra olanlar tam kapatılır (kaynak ders İşlendi). Deploy günü için `MAKEUP_EXPIRY_CLOSURE_FROM`
 * (ISO, örn. 2026-10-20T00:00:00+03:00) ortam değişkeniyle ayarlayın; yoksa varsayılan kullanılır.
 */
const DEFAULT_MAKEUP_EXPIRY_CLOSURE_FROM = "2026-10-15T00:00:00+03:00";

export function makeupExpiryClosureFrom(): Date {
  const raw = process.env.MAKEUP_EXPIRY_CLOSURE_FROM?.trim();
  const parsed = raw ? new Date(raw) : new Date(NaN);
  return Number.isNaN(parsed.getTime()) ? new Date(DEFAULT_MAKEUP_EXPIRY_CLOSURE_FROM) : parsed;
}

/** Planlama sınırı kesme tarihinden önceyse true: otomatik kapatma (ders/hakediş) uygulanmaz. */
export function isLegacyMakeupExpiry(expiresAtIso: string, timeZone = resolveAppTimezone()): boolean {
  return makeupPlanningDeadline(expiresAtIso, timeZone).getTime() < makeupExpiryClosureFrom().getTime();
}

export function isPastMakeupPlanningDeadline(expiresAtIso: string, now: Date, timeZone = resolveAppTimezone()): boolean {
  const expires = new Date(expiresAtIso);
  if (Number.isNaN(expires.getTime())) return false;
  return now.getTime() >= makeupPlanningDeadline(expiresAtIso, timeZone).getTime();
}

/** Seçilen yyyy-MM-dd o yerel günün öğleni olarak saklanır; sınır bir gün daha uzamasın. */
export function expiresAtForLastLocalDay(ymd: string, timeZone = resolveAppTimezone()): string {
  return zonedWallTimeToUtc(ymd, "12:00", timeZone).toISOString();
}

export function isUnplannedMakeup(request: Pick<MakeupRequest, "status" | "confirmedLessonId">): boolean {
  return UNPLANNED.has(request.status) && !request.confirmedLessonId;
}

export function isMakeupPlanningExpiryClosure(
  lesson: Pick<Lesson, "lessonProcessed" | "lessonProcessedReason" | "studentAttended" | "actualStartAt">
): boolean {
  return (
    lesson.lessonProcessed === true &&
    lesson.lessonProcessedReason === MAKEUP_PLANNING_EXPIRED_REASON &&
    lesson.studentAttended !== true &&
    !lesson.actualStartAt
  );
}

export function activeMakeupLessonForRequest(
  data: Pick<AppData, "lessons">,
  request: Pick<MakeupRequest, "id" | "confirmedLessonId">
): Lesson | undefined {
  return data.lessons.find(
    (lesson) =>
      lesson.type === "makeup" &&
      lesson.status !== "cancelled" &&
      (lesson.makeupRequestId === request.id || lesson.id === request.confirmedLessonId)
  );
}
