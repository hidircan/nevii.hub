import { createHash } from "node:crypto";
import { z } from "zod";
import { fail, ok } from "../services/result";
import type { ServiceContext } from "../services/context";
import { BRAND } from "../brand";
import { PLATFORM_TENANT_ID } from "../auth/config";
import { requireHyperAdmin } from "./access";
import { PLATFORM_SCOPE_ID, recordPublishedVersion } from "./policy-version-log";
import { appendPlatformAudit, deleteSettingOverride, listSettingOverrides, upsertSettingOverride } from "./store";

/**
 * NeviiOS global platform logosu.
 *
 * - Kurum logosundan (`institution.logoUrl` / `School.logoUrl`) tamamen ayrı
 *   anahtar ve kapsamdadır: `platform` / `*` / `platform.logo`.
 * - Runtime'da `public/` klasörüne YAZILMAZ; bayt içeriği platform ayar
 *   deposunda (json / PostgreSQL JSONB) tutulur ve `/api/v1/branding/platform-logo`
 *   ile nosniff başlığıyla sunulur. Ayar yoksa build-time varsayılana düşer.
 * - Favicon (`src/app/icon.png`) build-time varlıktır; bu ayar faviconu
 *   DEĞİŞTİRMEZ (tarayıcı önbelleği + statik dosya kuralı).
 * - Yalnız PNG/JPEG/WebP; SVG kabul edilmez (script taşıyabilir → XSS).
 *
 * ponytail: bayt içeriği ayar satırında (≤200KB) — gerçek nesne deposu
 * (S3/Supabase Storage) bağlanınca yalnız URL tutulur.
 */
export const PLATFORM_LOGO_KEY = "platform.logo";
export const PLATFORM_LOGO_MAX_BYTES = 200 * 1024;
/** Build-time varsayılan (global ürün markası, src/lib/brand.ts). */
export const PLATFORM_LOGO_FALLBACK_PATH: string = BRAND.logoPath ?? "/brand/logo.png";

const MIME_MAGIC: Record<string, (b: Buffer) => boolean> = {
  "image/png": (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/jpeg": (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/webp": (b) => b.length > 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
};

export type PlatformLogo = { mime: string; dataBase64: string; sha256: string; size: number; updatedAt: string; updatedBy: string };

export function validateLogoUpload(mime: string, dataBase64: string): { ok: true; bytes: Buffer } | { ok: false; message: string } {
  const check = MIME_MAGIC[mime];
  if (!check) return { ok: false, message: "Yalnız PNG, JPEG veya WebP yüklenebilir (SVG kabul edilmez)." };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(dataBase64)) return { ok: false, message: "Dosya içeriği geçersiz." };
  const bytes = Buffer.from(dataBase64, "base64");
  if (bytes.length === 0) return { ok: false, message: "Dosya boş." };
  if (bytes.length > PLATFORM_LOGO_MAX_BYTES) return { ok: false, message: "Logo en fazla 200 KB olabilir." };
  if (!check(bytes)) return { ok: false, message: "Dosya içeriği bildirilen türle eşleşmiyor." };
  return { ok: true, bytes };
}

export async function getPlatformLogo(): Promise<PlatformLogo | null> {
  const row = (await listSettingOverrides({ tenantId: PLATFORM_TENANT_ID })).find(
    (o) => o.scopeType === "platform" && o.scopeId === "*" && o.key === PLATFORM_LOGO_KEY
  );
  const v = row?.value as Partial<PlatformLogo> | undefined;
  if (!v?.mime || !v.dataBase64 || !MIME_MAGIC[v.mime]) return null;
  return v as PlatformLogo;
}

function publicMeta(logo: PlatformLogo | null) {
  return logo ? { mime: logo.mime, size: logo.size, sha256: logo.sha256, updatedAt: logo.updatedAt, updatedBy: logo.updatedBy } : null;
}

async function audit(ctx: ServiceContext, action: string, before: unknown, after: unknown) {
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

const uploadSchema = z.object({ mime: z.string().min(1).max(40), dataBase64: z.string().min(1).max(400_000) });

export async function setPlatformLogo(ctx: ServiceContext, input: unknown) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Geçersiz logo yükü");
  const valid = validateLogoUpload(parsed.data.mime, parsed.data.dataBase64);
  if (!valid.ok) return fail("VALIDATION_ERROR", valid.message);
  const before = publicMeta(await getPlatformLogo());
  const now = new Date().toISOString();
  const logo: PlatformLogo = {
    mime: parsed.data.mime,
    dataBase64: parsed.data.dataBase64,
    sha256: createHash("sha256").update(valid.bytes).digest("hex"),
    size: valid.bytes.length,
    updatedAt: now,
    updatedBy: ctx.userId,
  };
  await upsertSettingOverride({ scopeType: "platform", scopeId: "*", key: PLATFORM_LOGO_KEY, value: logo, updatedAt: now, updatedBy: ctx.userId });
  await audit(ctx, "platform.logo.update", before, publicMeta(logo));
  await recordPublishedVersion(ctx, PLATFORM_SCOPE_ID, PLATFORM_LOGO_KEY, logo, { reason: "Logo yüklendi" });
  return ok({ logo: publicMeta(logo) });
}

export async function resetPlatformLogo(ctx: ServiceContext) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const before = publicMeta(await getPlatformLogo());
  await deleteSettingOverride("platform", "*", PLATFORM_LOGO_KEY);
  await audit(ctx, "platform.logo.reset", before, { fallbackPath: PLATFORM_LOGO_FALLBACK_PATH });
  await recordPublishedVersion(ctx, PLATFORM_SCOPE_ID, PLATFORM_LOGO_KEY, null, { reason: "Varsayılana dönüldü" });
  return ok({ logo: null, fallbackPath: PLATFORM_LOGO_FALLBACK_PATH });
}
