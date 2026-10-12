import type { MobilePersona } from "../auth/role-to-persona";

/**
 * Push `data` → uygulama içi hedef. Yalnız DOSYASI DOĞRULANMIŞ route'lar
 * eşlenir; bilinmeyen kategori ve mobil ekranı olmayan kategoriler
 * `/notifications` merkezine düşer (ölü deep-link YOK).
 *
 * Sunucu verisi: { kind, lessonId?, studentId? } (bkz. push/sender.ts).
 */
export type PushPayload = {
  kind?: string;
  lessonId?: string;
  studentId?: string;
};

const LESSON_PROGRAM: Record<MobilePersona, string> = {
  teacher: "/(teacher)/bugun",
  student: "/(student)/dersler",
  parent: "/(parent)/dersler",
  admin: "/notifications",
};

const LESSON_KINDS = new Set([
  "lesson_started",
  "lesson_upcoming",
  "lesson_reminder_1d",
  "lesson_reminder_1h",
  "lesson_reminder_15m",
  "lesson_cancelled",
  "lesson_rescheduled",
  "lesson_reassigned",
]);

const HOMEWORK_KINDS = new Set(["homework_missing_for_lesson", "homework_due_date_changed"]);

const PAYMENT_KINDS = new Set(["payment_overdue", "payment_failed_or_pending", "payment_received"]);

const TASK_KINDS = new Set(["task_new_assignment", "task_due_today", "task_overdue"]);

export function resolvePushDestination(payload: PushPayload, persona: MobilePersona | null): string {
  const kind = payload.kind ?? "";
  if (LESSON_KINDS.has(kind)) return persona ? LESSON_PROGRAM[persona] : "/notifications";
  if (HOMEWORK_KINDS.has(kind)) {
    if (persona === "teacher") return "/(teacher)/odevlerim";
    if (persona === "student") return "/(student)/odevler";
    if (persona === "parent") return "/(parent)/odevler";
    return "/notifications";
  }
  if (PAYMENT_KINDS.has(kind)) {
    if (persona === "student") return "/(student)/odemeler";
    if (persona === "parent") return "/(parent)/odemeler";
    if (persona === "admin") return "/(admin)/islemler/finans";
    return "/notifications";
  }
  if (TASK_KINDS.has(kind)) {
    if (persona === "teacher") return "/(teacher)/is-takip";
    if (persona === "admin") return "/(admin)/islemler/is-takip";
    return "/notifications";
  }
  return "/notifications";
}
