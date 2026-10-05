import { getCategoryDef, isNotificationCategory } from "./notification-categories";

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
    case "recruitment_new_application":
      return "/panel/ik/adaylar";
    case "trial_new_application":
      return "/panel/deneme?sekme=basvurular";
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
    case "collections_approval_pending":
    case "collections_send_failed":
      return "/panel/ai/tahsilat-agent";
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
    case "teacher_feedback_submitted":
    case "student_feedback_submitted":
      // Body always carries "Detay: /panel/ogretmenler/<id>/geri-bildirim" —
      // this generic fallback only applies if that hint is ever missing.
      return "/panel/ogretmenler";
    case "teacher_feedback_shared":
      return "/ogretmen/geri-bildirim";
    default:
      return null;
  }
}

/** Filtre ve rozetlerde gösterilen Türkçe işlem türü adı (kategori kataloğundan). */
export function notificationKindLabel(kind: string): string {
  if (isNotificationCategory(kind)) return getCategoryDef(kind)?.label ?? "Diğer";
  return "Diğer";
}

/** Ekranda gösterilen metin. `Detay: /panel/...` teknik yolu kullanıcıya yazılmaz; tıklama hâlâ o yolu kullanır. */
export function presentNotificationBody(body: string): string {
  return body.replace(/\s*Detay:\s*\/\S+/g, "").replace(/\s+/g, " ").trim();
}

export type NotificationFilter = { kindLabel: string; from: string; to: string; query: string };

/** Bildirim merkezi filtresi — tür etiketi, gün aralığı (dahil), metin; en yeni önce. */
export function filterNotifications<T extends { kind: string; title: string; body: string; createdAt: string }>(
  list: T[],
  f: NotificationFilter
): T[] {
  const q = f.query.trim().toLocaleLowerCase("tr");
  return list
    .filter((n) => {
      if (f.kindLabel !== "all" && notificationKindLabel(n.kind) !== f.kindLabel) return false;
      const day = n.createdAt.slice(0, 10);
      if (f.from && day < f.from) return false;
      if (f.to && day > f.to) return false;
      if (q && !`${n.title} ${presentNotificationBody(n.body)}`.toLocaleLowerCase("tr").includes(q)) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
