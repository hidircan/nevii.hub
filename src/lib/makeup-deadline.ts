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
  | "right_cancelled"
  | "reopened";

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

/**
 * 2026-10-21 — SON GÜN TEK KAYNAK. Hak, kaçan dersin tarihinden doğar (§3.4): son gün = kaynak ders başlangıcı +
 * pencere. Talep açılışı (üç store modu) ve pencere değişimi bunu kullanır. Tek bilinçli istisna "yeniden Telafi":
 * süre bugünden başlar (`reopenMakeupRequest`, lesson-ops) — owner kararı.
 */
export function makeupExpiresAtFromSource(sourceStartAt: string | Date, windowDays: number): string {
  return new Date(new Date(sourceStartAt).getTime() + windowDays * 86_400_000).toISOString();
}

/**
 * 2026-10-20 — POLİTİKA PENCERESİ TEK KURAL. Pencere değişince henüz kullanılmamış (açık veya planlı) taleplerin son
 * günü yeni pencereye göre yeniden hesaplanır (`makeupExpiresAtFromSource`). Asla KISALTMAZ (yöneticinin elle
 * uzattığı son gün, yeniden açılışta bugünden başlayan süre ve eski, daha uzun pencere korunur). 2026-10-21: çapa
 * eskiden `createdAt` idi, açılış ise kaynak dersi kullanıyordu — iki farklı kural; artık ikisi de kaynak ders.
 * Kaynak ders bulunamazsa `createdAt`e düşer. Üç store modu bu fonksiyonu (DB modu aynı kuralı tek SQL ile) uygular.
 */
export const MAKEUP_WINDOW_FOLLOWING_STATUSES = ["pending", "suggested", "awaiting_info", "confirmed"] as const;

export function expiresAtForPolicyWindow(
  request: Pick<MakeupRequest, "status" | "createdAt" | "expiresAt">,
  windowDays: number,
  sourceStartAt?: string
): string {
  if (!(MAKEUP_WINDOW_FOLLOWING_STATUSES as readonly string[]).includes(request.status)) return request.expiresAt;
  const anchor = sourceStartAt ?? request.createdAt;
  if (Number.isNaN(new Date(anchor).getTime())) return request.expiresAt;
  const byPolicy = makeupExpiresAtFromSource(anchor, windowDays);
  const current = new Date(request.expiresAt).getTime();
  return Number.isNaN(current) || new Date(byPolicy).getTime() > current ? byPolicy : request.expiresAt;
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

const CLOSED = new Set(["cancelled", "expired"]);

/**
 * 2026-10-15 — TEK kural (Telafi Merkezi, ders silme önizlemesi/yürütücüsü, yeniden Telafi): kapanmış (iptal/süresi
 * dolmuş) ve canlı (iptal edilmemiş) telafi dersi olmayan talep "pasif bağ"dır — geçmiş izi, gerçek telafi değil.
 * Açık, planlı veya gerçekleşmiş talep "aktif"tir ve korunur.
 */
export function isPassiveMakeup(data: Pick<AppData, "lessons">, request: MakeupRequest): boolean {
  return CLOSED.has(request.status) && !activeMakeupLessonForRequest(data, request);
}

/** Dersin kaynak veya onaylı ders olduğu telafi talepleri, aktif/pasif ayrımıyla. */
export function makeupLinksOfLesson(
  data: Pick<AppData, "lessons" | "makeupRequests">,
  lessonId: string
): { active: MakeupRequest[]; passive: MakeupRequest[] } {
  const links = data.makeupRequests.filter((m) => m.sourceLessonId === lessonId || m.confirmedLessonId === lessonId);
  return {
    active: links.filter((m) => !isPassiveMakeup(data, m)),
    passive: links.filter((m) => isPassiveMakeup(data, m)),
  };
}

/** Yeniden Telafi işaretlenen dersin yeniden açılacak kapanmış talebi (en yenisi). */
export function closedMakeupToReopen(
  data: Pick<AppData, "lessons" | "makeupRequests">,
  lessonId: string
): MakeupRequest | undefined {
  return data.makeupRequests
    .filter((m) => m.sourceLessonId === lessonId && isPassiveMakeup(data, m))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

/** Kapanmış talebi bekleyen hâle döndürür; süre bugünden yeniden başlar, karar/SLA/plan izleri temizlenir. */
export function reopenMakeupRequest(
  request: MakeupRequest,
  op: { reason: string; now: Date; actorUserId: string; windowDays: number }
): MakeupRequest {
  return {
    ...request,
    status: "pending",
    reason: op.reason,
    expiresAt: new Date(op.now.getTime() + op.windowDays * 86_400_000).toISOString(),
    suggestedSlots: [],
    confirmedLessonId: undefined,
    decisionNote: undefined,
    decidedBy: undefined,
    decidedAt: undefined,
    slaDeadline: undefined,
    slaEscalationLevel: 0,
    changeLog: [
      ...(request.changeLog ?? []),
      { action: "reopened", at: op.now.toISOString(), by: op.actorUserId, from: request.status, to: "pending" },
    ],
  };
}
