import { cache } from "react";
import { z } from "zod";
import { fail, ok } from "../services/result";
import type { ServiceContext } from "../services/context";
import { requireHyperAdmin } from "./access";
import { PLATFORM_SCOPE_ID, recordPublishedVersion } from "./policy-version-log";
import { appendPlatformAudit, getSettingOverride, upsertSettingOverride } from "./store";

/**
 * Mobil uygulama mağaza bağlantıları — TEK etkin kaynak.
 *
 * Öncelik: Site ayarı (bu dosya) > ortam (`APP_STORE_URL`/`PLAY_STORE_URL`).
 * - Site ayarında geçerli URL varsa o kullanılır (kaynak: "site").
 * - Yoksa env'deki geçerli URL kullanılır (kaynak: "env").
 * - İkisi de yoksa bağlantı üretilmez; site/e-posta bu bölümü gizler.
 * Görünürlük bayrakları YALNIZ site gösterimini etkiler (e-posta ve
 * parola-kurulum yönlendirmesi etkin URL'yi kullanır).
 * Yalnız https + resmi mağaza domain'i kabul edilir.
 */
export const SITE_MOBILE_APPS_KEY = "site.mobileApps";

export type MobileAppLinks = {
  appStoreUrl: string | null;
  playStoreUrl: string | null;
  appStoreVisible: boolean;
  playVisible: boolean;
};

function normalizeStoreUrl(raw: unknown, hosts: string[]): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v) return null;
  if (v.length > 300) return null;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (!hosts.includes(u.hostname.toLocaleLowerCase())) return null;
  return u.toString();
}

const normAppStore = (v: unknown) => normalizeStoreUrl(v, ["apps.apple.com", "itunes.apple.com"]);
const normPlay = (v: unknown) => normalizeStoreUrl(v, ["play.google.com"]);

/** Site ayarındaki ham değerler (env'siz). */
/** İstek başına tek okuma (sayfa + generateMetadata + bant aynı satırı paylaşır). */
export const getSiteMobileApps = cache(async function getSiteMobileApps(): Promise<MobileAppLinks> {
  const row = await getSettingOverride("platform", "*", SITE_MOBILE_APPS_KEY);
  const v = (row?.value ?? {}) as Partial<Record<string, unknown>>;
  return {
    appStoreUrl: typeof v.appStoreUrl === "string" && v.appStoreUrl.trim() ? normAppStore(v.appStoreUrl) : null,
    playStoreUrl: typeof v.playStoreUrl === "string" && v.playStoreUrl.trim() ? normPlay(v.playStoreUrl) : null,
    appStoreVisible: v.appStoreVisible !== false,
    playVisible: v.playVisible !== false,
  };
});

export type ResolvedMobileAppLinks = {
  appStoreUrl?: string;
  playStoreUrl?: string;
  appStoreSource: "site" | "env" | null;
  playSource: "site" | "env" | null;
};

/** Etkin bağlantılar: site ayarı > env. Bozuk kayıtlı değer yayına sızmaz. */
export async function resolveMobileAppLinks(): Promise<ResolvedMobileAppLinks> {
  const site = await getSiteMobileApps();
  const envApp = normAppStore(process.env.APP_STORE_URL);
  const envPlay = normPlay(process.env.PLAY_STORE_URL);
  const appStoreUrl = site.appStoreUrl ?? envApp ?? null;
  const playStoreUrl = site.playStoreUrl ?? envPlay ?? null;
  return {
    ...(appStoreUrl ? { appStoreUrl } : {}),
    ...(playStoreUrl ? { playStoreUrl } : {}),
    appStoreSource: site.appStoreUrl ? "site" : envApp ? "env" : null,
    playSource: site.playStoreUrl ? "site" : envPlay ? "env" : null,
  };
}

/** App Store bağlantısından sayısal uygulama kimliği (akıllı bant için). */
export function appStoreIdFromUrl(url: string): string | null {
  const m = url.match(/\/id(\d{5,})/);
  return m ? m[1]! : null;
}

export async function getSiteMobileAppsMeta(ctx: ServiceContext) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const [site, resolved] = await Promise.all([getSiteMobileApps(), resolveMobileAppLinks()]);
  return ok({ links: site, resolved });
}

const inputSchema = z.object({
  appStoreUrl: z.string().max(300).nullable().optional(),
  playStoreUrl: z.string().max(300).nullable().optional(),
  appStoreVisible: z.boolean().optional(),
  playVisible: z.boolean().optional(),
});

export async function setSiteMobileApps(ctx: ServiceContext, input: unknown) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Geçersiz mobil uygulama yükü.");
  const pick = (raw: string | null | undefined, norm: (v: unknown) => string | null, label: string) => {
    if (raw === null || raw === undefined || raw.trim() === "") return { ok: true as const, value: null };
    const n = norm(raw);
    if (!n) return { ok: false as const, error: `${label} geçersiz; resmi mağaza adresini https ile girin.` };
    return { ok: true as const, value: n };
  };
  const app = pick(parsed.data.appStoreUrl, normAppStore, "App Store adresi");
  if (!app.ok) return fail("VALIDATION_ERROR", app.error);
  const play = pick(parsed.data.playStoreUrl, normPlay, "Google Play adresi");
  if (!play.ok) return fail("VALIDATION_ERROR", play.error);
  const before = await getSiteMobileApps();
  const next: MobileAppLinks = {
    appStoreUrl: app.value,
    playStoreUrl: play.value,
    appStoreVisible: parsed.data.appStoreVisible ?? before.appStoreVisible,
    playVisible: parsed.data.playVisible ?? before.playVisible,
  };
  const now = new Date().toISOString();
  await upsertSettingOverride({
    scopeType: "platform",
    scopeId: "*",
    key: SITE_MOBILE_APPS_KEY,
    value: { ...next, updatedAt: now, updatedBy: ctx.userId },
    updatedAt: now,
    updatedBy: ctx.userId,
  });
  await appendPlatformAudit({
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    actorTenantId: ctx.tenantId,
    targetTenantId: null,
    action: "site.mobileApps.update",
    entityType: "SiteMobileApps",
    entityId: SITE_MOBILE_APPS_KEY,
    before: before as never,
    after: next as never,
    requestId: ctx.requestId || "n/a",
    outcome: "success",
  });
  await recordPublishedVersion(ctx, PLATFORM_SCOPE_ID, SITE_MOBILE_APPS_KEY, next, { reason: "Mobil uygulama bağlantıları güncellendi" });
  return ok({ links: next });
}

/**
 * Mobil web "uygulamada aç" bandının ortak ayarı (ana sayfa + giriş).
 * Görünür mağaza bağlantısı da şema da yoksa null (bant çıkmaz).
 */
export async function getAppBannerConfig(): Promise<{
  scheme?: string;
  appStoreUrl?: string;
  playStoreUrl?: string;
} | null> {
  const [site, resolved] = await Promise.all([getSiteMobileApps(), resolveMobileAppLinks()]);
  const scheme = process.env.MOBILE_APP_SCHEME || undefined;
  const appStoreUrl = site.appStoreVisible ? resolved.appStoreUrl : undefined;
  const playStoreUrl = site.playVisible ? resolved.playStoreUrl : undefined;
  if (!scheme && !appStoreUrl && !playStoreUrl) return null;
  return { scheme, appStoreUrl, playStoreUrl };
}
