/**
 * Role → route helpers with NO server-only imports (no `next/headers`, no
 * store access) — safe to import from both Server Components and Client
 * Components (e.g. notification-bell.tsx). session.ts re-exports these for
 * server call sites so there's one source of truth.
 */
import type { AppRole } from "./types";

export function homePathForRole(role: AppRole): string {
  switch (role) {
    case "TEACHER":
      return "/ogretmen";
    case "PARENT":
      return "/veli";
    case "STUDENT":
      return "/ogrenci";
    case "AI_AGENT":
    case "SCHOOL_ADMIN":
    case "SUPER_ADMIN":
    default:
      return "/panel";
  }
}

/** Rol-uyumlu "Bildirim ayarları" rotası — notification-bell ve portal linkleri buradan türetir. */
export function notificationSettingsPathForRole(role: AppRole): string {
  switch (role) {
    case "TEACHER":
      return "/ogretmen/ayarlar/bildirimler";
    case "PARENT":
      return "/veli/ayarlar/bildirimler";
    case "STUDENT":
      return "/ogrenci/ayarlar/bildirimler";
    case "AI_AGENT":
    case "SCHOOL_ADMIN":
    case "SUPER_ADMIN":
    default:
      return "/panel/ayarlar/bildirimler";
  }
}

/**
 * "Tüm bildirimler" rotası. Yalnızca admin portalında ayrı bir tam liste
 * sayfası var (`/panel/bildirimler`) — öğretmen/veli/öğrenci portalları
 * için henüz ayrı bir liste sayfası yok, bu yüzden kendi ana sayfalarına
 * yönlendirilir (bell dropdown zaten son 20 bildirimi orada gösteriyor).
 */
export function notificationListPathForRole(role: AppRole): string {
  switch (role) {
    case "SCHOOL_ADMIN":
    case "SUPER_ADMIN":
    case "AI_AGENT":
      return "/panel/bildirimler";
    default:
      return homePathForRole(role);
  }
}
