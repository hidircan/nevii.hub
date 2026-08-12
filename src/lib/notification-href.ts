/**
 * Bildirim tıklanınca gidecek güvenli panel rotası.
 * Notification şemasında ayrı href alanı YOK — kind + body içindeki
 * "Detay: /path" ipucundan türetilir. Harici/javascript URL asla dönülmez.
 */

const INTERNAL_PATH = /^\/[a-zA-Z0-9/_\-[\].%?=&]*$/;

/** Body metninden `Detay: /panel/...` yolunu çıkarır (task-reminders deseni). */
function extractPathFromBody(body: string | undefined): string | null {
  if (!body) return null;
  const m = body.match(/Detay:\s*(\/[^\s]+)/);
  if (!m?.[1]) return null;
  const path = m[1];
  if (!INTERNAL_PATH.test(path)) return null;
  if (path.startsWith("//") || path.includes("://")) return null;
  return path;
}

/**
 * Bildirim kind + body → panel/portal rotası.
 * Bilinmeyen kind veya güvenli yol yoksa null (tıklanınca yalnız okundu işaretlenir).
 */
export function resolveNotificationHref(kind: string, body?: string): string | null {
  const fromBody = extractPathFromBody(body);
  if (fromBody) return fromBody;

  switch (kind) {
    case "leave_new_request":
    case "leave_pending_approval":
      return "/panel/personel/izinler";
    case "task_assigned":
    case "task_new_assignment":
    case "task_due_soon":
    case "task_due_today":
    case "task_overdue":
      return "/panel/is-takip";
    case "payment_overdue":
    case "payment_failed_or_pending":
    case "payment_received":
      return "/panel/odemeler";
    case "student_new_registration":
    case "student_new_enrollment":
      return "/panel/ogrenciler";
    case "lesson_started":
    case "lesson_upcoming":
    case "lesson_cancelled":
    case "lesson_rescheduled":
    case "lesson_planned":
      return "/panel/program";
    case "attendance_exception":
      return "/panel/yoklama";
    case "portal_request":
      return "/panel";
    default:
      return null;
  }
}
