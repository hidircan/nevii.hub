/**
 * Role → route helpers with NO server-only imports (no `next/headers`, no
 * store access) — safe to import from both Server Components and Client
 * Components (e.g. notification-bell.tsx). session.ts re-exports these for
 * server call sites so there's one source of truth.
 */
import type { AppRole } from "./types";

/**
 * Control Center (2026-09-28) — giriş sonrası `next` doğrulayıcı (open
 * redirect kapalı): yalnız uygulama-içi göreli yollar. Mutlak URL,
 * protokol-göreli (`//`), şema (`:`), ters bölü ve satır-sonu içeren
 * değerler reddedilir → fallback. Çift kodlanmış (`%2F%2F`) saldırılar
 * için bir kez decode edilir, çözüleni doğrulanır.
 */
export function resolveSafeLoginNext(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  if (decoded.length > 500) return fallback;
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return fallback;
  if (decoded.includes(":") || decoded.includes("\\") || /[\r\n\t]/.test(decoded)) return fallback;
  return decoded;
}

/**
 * Platform kapısı (`/platform/giris`) giriş-sonrası hedef: HYPER_ADMIN
 * yalnız `/platform` altına gider (güvensiz/geçersiz next → `/platform`);
 * kurum rolleri kendi ana sayfasına gider (platforma ASLA).
 */
export function resolvePlatformLoginDest(role: AppRole, nextPath: string | null | undefined): string {
  if (role === "HYPER_ADMIN") {
    const safe = resolveSafeLoginNext(nextPath, "/platform");
    return safe === "/platform" || safe.startsWith("/platform/") ? safe : "/platform";
  }
  return homePathForRole(role);
}

export function homePathForRole(role: AppRole): string {
  switch (role) {
    case "HYPER_ADMIN":
      return "/platform";
    case "BRANCH_MANAGER":
      return "/sube";
    case "TEACHER":
      return "/ogretmen";
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
    case "HYPER_ADMIN":
      return "/platform";
    case "BRANCH_MANAGER":
      return "/sube";
    case "TEACHER":
      return "/ogretmen/ayarlar/bildirimler";
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
    case "HYPER_ADMIN":
      return "/platform";
    case "SCHOOL_ADMIN":
    case "SUPER_ADMIN":
    case "AI_AGENT":
      return "/panel/bildirimler";
    default:
      return homePathForRole(role);
  }
}
