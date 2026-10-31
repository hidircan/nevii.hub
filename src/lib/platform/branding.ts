import { cache } from "react";
import { revalidateTag, unstable_cache } from "next/cache";
import { ok } from "../services/result";
import type { ServiceContext } from "../services/context";
import { BRAND } from "../brand";
import { requireHyperAdmin } from "./access";
import { PLATFORM_SCOPE_ID, recordPublishedVersion } from "./policy-version-log";
import { appendPlatformAudit, deleteSettingOverride, getSettingOverride } from "./store";
import type { SettingScope } from "./types";

/**
 * NeviiOS global platform logosu — ana sayfa, giriş, NeviiOS ve favicon için TEK kaynak.
 *
 * - Kurum logosundan (`institution.logoUrl` / `School.logoUrl`) tamamen ayrı
 *   anahtar ve kapsamdadır: `platform` / `*` / `platform.logo`.
 * - Yüklenen dosya sunucuda küçük PNG varyantlarına yeniden kodlanır (EXIF ve
 *   gömülü içerik atılır); ham dosya saklanmaz. Baytlar ayrı `brand_asset:logo`
 *   satırındadır: ayar listelerine ve sayfa okumalarına hiç girmez.
 * - `platform.logo` satırında yalnız sürüm bilgisi vardır; yüzeyler
 *   `getPlatformBrand()` ile sürümlü URL alır, yeni logo yeni URL demektir.
 * - Yalnız PNG/JPEG/WebP; SVG kabul edilmez (script taşıyabilir → XSS).
 * - Yükleme ve görsel işleme `branding-upload.ts`tedir: sharp yalnız o uca girer,
 *   kök layout'un okuduğu bu dosya her sayfanın paketine girer.
 * - Mobil uygulama ikonu (`apps/mobile/assets`) mağaza derlemesiyle değişir, bu ayardan etkilenmez.
 *
 * ponytail: baytlar ayar satırında (varyantlar toplamı ~100 KB) — nesne deposu
 * bağlanınca yalnız URL tutulur.
 */
export const PLATFORM_LOGO_KEY = "platform.logo";
/** Ham dosya sınırı: base64 ile Vercel'in 4,5 MB gövde sınırının altında kalır. */
export const PLATFORM_LOGO_MAX_BYTES = 3 * 1024 * 1024;
/** Build-time varsayılan (global ürün markası, src/lib/brand.ts). */
export const PLATFORM_LOGO_FALLBACK_PATH: string = BRAND.logoPath ?? "/brand/logo.png";

const PLATFORM_BRAND_TAG = "platform-brand";
export const ASSET_SCOPE = "brand_asset:logo" as SettingScope;
export const ASSET_KEY = "variants";

const MIME_MAGIC: Record<string, (b: Buffer) => boolean> = {
  "image/png": (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/jpeg": (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/webp": (b) => b.length > 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
};

export type PlatformLogoVariant = "logo" | "icon" | "apple";

export type PlatformLogo = {
  mime: string;
  sha256: string;
  size: number;
  updatedAt: string;
  updatedBy: string;
  width?: number;
  height?: number;
  /** Eski kayıt: varyant üretilmeden önce bayt satırın içindeydi. */
  dataBase64?: string;
};

export type PlatformBrand = {
  custom: boolean;
  logoUrl: string;
  iconUrl: string;
  appleIconUrl: string;
  /** En-boy oranı için; varsayılan logo karedir. */
  logoWidth: number;
  logoHeight: number;
};

export const versionOf = (sha256: string) => sha256.slice(0, 16);
const assetUrl = (variant: PlatformLogoVariant, version: string) =>
  `/api/v1/branding/platform-logo?variant=${variant}&v=${version}`;

export function validateLogoUpload(mime: string, dataBase64: string, label = "Logo"): { ok: true; bytes: Buffer } | { ok: false; message: string } {
  const check = MIME_MAGIC[mime];
  if (!check) return { ok: false, message: "Yalnız PNG, JPEG veya WebP yüklenebilir (SVG kabul edilmez)." };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(dataBase64)) return { ok: false, message: "Dosya içeriği geçersiz." };
  const bytes = Buffer.from(dataBase64, "base64");
  if (bytes.length === 0) return { ok: false, message: "Dosya boş." };
  if (bytes.length > PLATFORM_LOGO_MAX_BYTES) return { ok: false, message: `${label} en fazla 3 MB olabilir. Dosyayı küçültüp tekrar yükleyin.` };
  if (!check(bytes)) return { ok: false, message: "Dosya içeriği bildirilen türle eşleşmiyor." };
  return { ok: true, bytes };
}

export async function getPlatformLogo(): Promise<PlatformLogo | null> {
  const row = await getSettingOverride("platform", "*", PLATFORM_LOGO_KEY);
  const v = row?.value as Partial<PlatformLogo> | undefined;
  if (!v?.mime || !v.sha256 || !MIME_MAGIC[v.mime]) return null;
  return v as PlatformLogo;
}

export function publicMeta(logo: PlatformLogo | null) {
  return logo
    ? { mime: logo.mime, size: logo.size, sha256: logo.sha256, updatedAt: logo.updatedAt, updatedBy: logo.updatedBy, width: logo.width ?? null, height: logo.height ?? null }
    : null;
}

/** Baytı okur. `version` verilmişse o sürüm (değişmez), yoksa yayındaki logo. */
export async function readPlatformLogoAsset(variant: PlatformLogoVariant, version?: string | null) {
  const requested = version && /^[a-f0-9]{16}$/.test(version) ? version : null;
  const load = async (v: string) => (await getSettingOverride(ASSET_SCOPE, v, ASSET_KEY))?.value as Record<string, string> | undefined;
  const stored = requested ? await load(requested) : undefined;
  if (stored?.[variant]) {
    return { bytes: Buffer.from(stored[variant]!, "base64"), mime: "image/png", etag: `${requested}-${variant}`, immutable: true };
  }
  const logo = await getPlatformLogo();
  if (!logo) return null;
  const current = versionOf(logo.sha256);
  // Eski kayıtta varyant yok: tek dosya her yüzeye verilir.
  if (logo.dataBase64) {
    return { bytes: Buffer.from(logo.dataBase64, "base64"), mime: logo.mime, etag: `${current}-${variant}`, immutable: requested === current };
  }
  const assets = await load(current);
  if (!assets?.[variant]) return null;
  return { bytes: Buffer.from(assets[variant]!, "base64"), mime: "image/png", etag: `${current}-${variant}`, immutable: false };
}

const readBrandMeta = unstable_cache(
  async () => {
    const logo = await getPlatformLogo();
    return logo ? { sha256: logo.sha256, width: logo.width ?? null, height: logo.height ?? null } : null;
  },
  [PLATFORM_BRAND_TAG],
  { tags: [PLATFORM_BRAND_TAG], revalidate: 3600 }
);

/**
 * Tüm yüzeylerin ortak okuyucusu; kök layout her sayfada çağırır. Bu yüzden
 * istekler arası önbellektedir (kayıtta `invalidatePlatformBrand` temizler) ve
 * DB'ye her sayfada gitmez. Okunamazsa sayfa kırılmaz, varsayılan logoya düşer.
 */
export const getPlatformBrand = cache(async (): Promise<PlatformBrand> => {
  // Next çalışma ortamı dışında (test, script) unstable_cache hata verir: doğrudan okunur.
  const meta = await readBrandMeta().catch(() => getPlatformLogo().catch(() => null));
  if (!meta) {
    return { custom: false, logoUrl: PLATFORM_LOGO_FALLBACK_PATH, iconUrl: "/icon.png", appleIconUrl: "/icon.png", logoWidth: 1, logoHeight: 1 };
  }
  const v = versionOf(meta.sha256);
  return {
    custom: true,
    logoUrl: assetUrl("logo", v),
    iconUrl: assetUrl("icon", v),
    appleIconUrl: assetUrl("apple", v),
    logoWidth: meta.width ?? 1,
    logoHeight: meta.height ?? 1,
  };
});

export function invalidatePlatformBrand() {
  try {
    revalidateTag(PLATFORM_BRAND_TAG, { expire: 0 });
  } catch {
    // Next çalışma ortamı dışında (test, script) önbellek de yok.
  }
}

export async function auditLogo(ctx: ServiceContext, action: string, before: unknown, after: unknown) {
  await appendPlatformAudit({
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    actorTenantId: ctx.tenantId,
    targetTenantId: null,
    action,
    entityType: "PlatformLogo",
    entityId: PLATFORM_LOGO_KEY,
    before: (before ?? null) as never,
    after: (after ?? null) as never,
    requestId: ctx.requestId || "n/a",
    outcome: "success",
  });
}

export async function getPlatformLogoMeta(ctx: ServiceContext) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  return ok({ logo: publicMeta(await getPlatformLogo()), fallbackPath: PLATFORM_LOGO_FALLBACK_PATH });
}

export async function resetPlatformLogo(ctx: ServiceContext) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const before = publicMeta(await getPlatformLogo());
  await deleteSettingOverride("platform", "*", PLATFORM_LOGO_KEY);
  await auditLogo(ctx, "platform.logo.reset", before, { fallbackPath: PLATFORM_LOGO_FALLBACK_PATH });
  await recordPublishedVersion(ctx, PLATFORM_SCOPE_ID, PLATFORM_LOGO_KEY, null, { reason: "Varsayılana dönüldü" });
  invalidatePlatformBrand();
  return ok({ logo: null, fallbackPath: PLATFORM_LOGO_FALLBACK_PATH });
}
