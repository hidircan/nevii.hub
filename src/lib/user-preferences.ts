/**
 * P1 (2026-09-11) — kullanıcı çalışma alanı tercihleri: HESAP bazlı kalıcı
 * store (`userId` + `tenantId`), cookie/localStorage YALNIZCA istemci
 * önbelleğidir (tek gerçek kaynak DEĞİL).
 *
 * KURAL (Ezgi/Nihal senaryosu): aynı cihazda farklı kullanıcı giriş
 * yaptığında ÖNCEKİ kullanıcının tercihleri ASLA kullanılmaz — login'de
 * yalnız giriş yapan hesabın kaydı cookie'lere yazılır, logout'ta istemci
 * önbelleği (tercih cookie'leri + kullanıcı-ad-alanlı localStorage)
 * temizlenir, server kaydı KORUNUR (kullanıcı dönünce düzeni geri bulur).
 *
 * KALICILIK: json/memory modunda `data/user-preferences.json` (atomic +
 * kilit — staff.ts ile AYNI desen); db modunda `UserPreference` tablosu
 * (migration DOSYASI oluşturuldu, UYGULANMADI). Tercih verisi
 * audit/finans/yetki verisiyle KARIŞMAZ (ayrı dosya/tablo, ayrı modül).
 */

import path from "path";
import { isDbMode, resolveDataDir } from "./config";
import { withFileLock, writeJsonFileAtomic } from "./atomic-json-file";
import type { Density, FontChoice, ThemeProfile } from "./theme";

export type UserWorkspacePreferences = {
  themeProfile?: ThemeProfile;
  fontChoice?: FontChoice;
  density?: Density;
  sidebarCollapsed?: boolean;
  /** Bölüm anahtarı → href listesi (kullanıcı sırası). */
  navOrder?: Record<string, string[]>;
  /** Son güvenli rota (yalnız allowlist'tekiler yazılır — bkz. isSafeLastRoute). */
  lastRoute?: string;
  updatedAt: string;
};

type Stored = UserWorkspacePreferences & { userId: string; tenantId: string };

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "user-preferences.json");
export const USER_PREFERENCES_FILE = FILE;

/** `logout`'ta temizlenen istemci önbelleği cookie adları (tercih katmanı). */
export const WORKSPACE_CACHE_COOKIES = [
  "notaplan_theme_profile",
  "notaplan_font",
  "notaplan_density",
  "notaplan_sidebar_collapsed",
] as const;

export const SIDEBAR_COLLAPSED_COOKIE = "notaplan_sidebar_collapsed";

function keyOf(userId: string, tenantId: string): string {
  return `${userId}::${tenantId}`;
}

async function loadAll(): Promise<Stored[]> {
  try {
    const fs = await import("fs/promises");
    const raw = JSON.parse(await fs.readFile(FILE, "utf8")) as Stored[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function toPublic(r: Stored): UserWorkspacePreferences {
  const { userId: _u, tenantId: _t, ...prefs } = r;
  void _u;
  void _t;
  return prefs;
}

function dbRowToPublic(r: Record<string, unknown>): UserWorkspacePreferences {
  return {
    themeProfile: (r.themeProfile as ThemeProfile) ?? undefined,
    fontChoice: (r.fontChoice as FontChoice) ?? undefined,
    density: (r.density as Density) ?? undefined,
    sidebarCollapsed: (r.sidebarCollapsed as boolean) ?? undefined,
    navOrder: (r.navOrderJson ? JSON.parse(r.navOrderJson as string) : undefined) as
      | Record<string, string[]>
      | undefined,
    lastRoute: (r.lastRoute as string) ?? undefined,
    updatedAt: (r.updatedAt as Date)?.toISOString?.() ?? new Date().toISOString(),
  };
}

export async function getUserPreferences(userId: string, tenantId: string): Promise<UserWorkspacePreferences> {
  if (isDbMode) {
    try {
      const { getPrisma } = await import("./db");
      const prisma = getPrisma();
      const row = await prisma.userPreference.findUnique({
        where: { userId_tenantId: { userId, tenantId } },
      });
      if (!row) return { updatedAt: new Date().toISOString() };
      return dbRowToPublic(row as unknown as Record<string, unknown>);
    } catch {
      return { updatedAt: new Date().toISOString() };
    }
  }
  const all = await loadAll();
  const found = all.find((r) => keyOf(r.userId, r.tenantId) === keyOf(userId, tenantId));
  return found ? toPublic(found) : { updatedAt: new Date().toISOString() };
}

export async function saveUserPreferences(
  userId: string,
  tenantId: string,
  patch: Omit<UserWorkspacePreferences, "updatedAt">
): Promise<UserWorkspacePreferences> {
  const now = new Date().toISOString();
  if (isDbMode) {
    const { getPrisma } = await import("./db");
    const prisma = getPrisma();
    const navOrderJson = patch.navOrder !== undefined ? JSON.stringify(patch.navOrder) : undefined;
    const row = await prisma.userPreference.upsert({
      where: { userId_tenantId: { userId, tenantId } },
      create: {
        userId,
        tenantId,
        themeProfile: patch.themeProfile,
        fontChoice: patch.fontChoice,
        density: patch.density,
        sidebarCollapsed: patch.sidebarCollapsed,
        navOrderJson,
        lastRoute: patch.lastRoute,
      },
      update: {
        ...(patch.themeProfile !== undefined ? { themeProfile: patch.themeProfile } : {}),
        ...(patch.fontChoice !== undefined ? { fontChoice: patch.fontChoice } : {}),
        ...(patch.density !== undefined ? { density: patch.density } : {}),
        ...(patch.sidebarCollapsed !== undefined ? { sidebarCollapsed: patch.sidebarCollapsed } : {}),
        ...(navOrderJson !== undefined ? { navOrderJson } : {}),
        ...(patch.lastRoute !== undefined ? { lastRoute: patch.lastRoute } : {}),
      },
    });
    return dbRowToPublic(row as unknown as Record<string, unknown>);
  }
  return withFileLock(FILE, async () => {
    const all = await loadAll();
    const idx = all.findIndex((r) => keyOf(r.userId, r.tenantId) === keyOf(userId, tenantId));
    const prev = idx >= 0 ? all[idx]! : null;
    const next: Stored = {
      userId,
      tenantId,
      themeProfile: patch.themeProfile ?? prev?.themeProfile,
      fontChoice: patch.fontChoice ?? prev?.fontChoice,
      density: patch.density ?? prev?.density,
      sidebarCollapsed: patch.sidebarCollapsed ?? prev?.sidebarCollapsed,
      navOrder: patch.navOrder ?? prev?.navOrder,
      lastRoute: patch.lastRoute ?? prev?.lastRoute,
      updatedAt: now,
    };
    if (idx >= 0) all[idx] = next;
    else all.push(next);
    await writeJsonFileAtomic(FILE, all);
    return toPublic(next);
  });
}

/**
 * Son rota güvenlik filtresi: yalnız uygulama-içi, parametresiz-izinsiz
 * panel/portal rotaları hatırlanır. Auth/print/api/yetkisiz hedefler ASLA
 * yazılmaz; login sonrası geçersiz rota güvenli panele düşer.
 */
const LAST_ROUTE_ALLOWLIST = ["/panel", "/ogretmen", "/ogrenci", "/veli"];

export function isSafeLastRoute(route: string | undefined | null): boolean {
  if (!route || !route.startsWith("/") || route.startsWith("//")) return false;
  if (route.startsWith("/login") || route.startsWith("/sifre-") || route.startsWith("/hesap-")) return false;
  if (route.startsWith("/api/")) return false;
  if (route.includes("sozlesme-yazdir") || route.includes("evrak-yazdir") || route.includes("makbuz")) return false;
  return LAST_ROUTE_ALLOWLIST.some((prefix) => route === prefix || route.startsWith(`${prefix}/`));
}

/** Rol köküne göre kayıtlı rotanın hâlâ yetkili olup olmadığı (rol değiştiyse düş). */
export function resolveResumeRoute(role: string, lastRoute?: string, fallback?: string): string {
  const home = fallback ?? (role === "TEACHER" ? "/ogretmen" : role === "STUDENT" ? "/ogrenci" : "/panel");
  if (!isSafeLastRoute(lastRoute)) return home;
  const route = lastRoute as string;
  if (role === "TEACHER") return route.startsWith("/ogretmen") ? route : home;
  if (role === "STUDENT") return route.startsWith("/ogrenci") || route.startsWith("/veli") ? route : home;
  return route.startsWith("/panel") ? route : home;
}
