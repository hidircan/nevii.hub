import { createHash } from "node:crypto";
import { z } from "zod";
import { fail, ok } from "../services/result";
import type { ServiceContext } from "../services/context";
import { requireHyperAdmin } from "./access";
import {
  ASSET_KEY,
  ASSET_SCOPE,
  auditLogo,
  getPlatformLogo,
  invalidatePlatformBrand,
  PLATFORM_LOGO_KEY,
  publicMeta,
  validateLogoUpload,
  versionOf,
  type PlatformLogo,
} from "./branding";
import { PLATFORM_SCOPE_ID, recordPublishedVersion } from "./policy-version-log";
import { upsertSettingOverride } from "./store";
import type { JsonValue } from "./types";

const MAX_INPUT_PIXELS = 40_000_000;
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

/**
 * Logoyu kırpar ve varyantları üretir. İkonlar beyaz kare zeminlidir: şeffaf
 * koyu logo koyu sekmede kaybolur, iOS da şeffaflığı siyaha boyar.
 */
async function normalizeLogo(input: Buffer) {
  const sharp = (await import("sharp")).default;
  const source = () => sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).rotate().ensureAlpha();
  // Tek renkli görselde trim hata verir; o zaman kırpmadan devam edilir.
  const trimmed = await source()
    .trim({ threshold: 10 })
    .png()
    .toBuffer()
    .catch(() => source().png().toBuffer());
  const logo = await sharp(trimmed)
    .resize(512, 512, { fit: "inside", withoutEnlargement: true })
    .png({ palette: true, quality: 90, compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });
  const square = async (size: number) => {
    const pad = Math.round(size * 0.1);
    const inner = size - 2 * pad;
    const fitted = await sharp(trimmed)
      .resize(inner, inner, { fit: "contain", background: { ...WHITE, alpha: 0 } })
      .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { ...WHITE, alpha: 0 } })
      .png()
      .toBuffer();
    // Sharp boru hattında flatten yeniden boyutlamadan önce çalışır; ayrı adım şart.
    return sharp(fitted).flatten({ background: WHITE }).png({ compressionLevel: 9 }).toBuffer();
  };
  return { logo: logo.data, width: logo.info.width, height: logo.info.height, icon: await square(64), apple: await square(180) };
}

const uploadSchema = z.object({ mime: z.string().min(1).max(40), dataBase64: z.string().min(1).max(4_200_000) });

export async function setPlatformLogo(ctx: ServiceContext, input: unknown) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Logo en fazla 3 MB olabilir. Dosyayı küçültüp tekrar yükleyin.");
  const valid = validateLogoUpload(parsed.data.mime, parsed.data.dataBase64);
  if (!valid.ok) return fail("VALIDATION_ERROR", valid.message);
  let variants: Awaited<ReturnType<typeof normalizeLogo>>;
  try {
    variants = await normalizeLogo(valid.bytes);
  } catch {
    return fail("VALIDATION_ERROR", "Görsel işlenemedi. Dosya bozuk veya çok büyük olabilir (en fazla 40 megapiksel); PNG, JPEG ya da WebP olarak yeniden kaydedip tekrar yükleyin.");
  }
  const before = publicMeta(await getPlatformLogo());
  const now = new Date().toISOString();
  const logo: PlatformLogo = {
    mime: "image/png",
    sha256: createHash("sha256").update(valid.bytes).digest("hex"),
    size: variants.logo.length,
    width: variants.width,
    height: variants.height,
    updatedAt: now,
    updatedBy: ctx.userId,
  };
  // Önce bayt, sonra işaretçi: yarım kayıtta eski logo yayında kalır.
  await upsertSettingOverride({
    scopeType: ASSET_SCOPE,
    scopeId: versionOf(logo.sha256),
    key: ASSET_KEY,
    value: {
      logo: variants.logo.toString("base64"),
      icon: variants.icon.toString("base64"),
      apple: variants.apple.toString("base64"),
    },
    updatedAt: now,
    updatedBy: ctx.userId,
  });
  await upsertSettingOverride({ scopeType: "platform", scopeId: "*", key: PLATFORM_LOGO_KEY, value: logo as unknown as JsonValue, updatedAt: now, updatedBy: ctx.userId });
  await auditLogo(ctx, "platform.logo.update", before, publicMeta(logo));
  await recordPublishedVersion(ctx, PLATFORM_SCOPE_ID, PLATFORM_LOGO_KEY, logo as unknown as JsonValue, { reason: "Logo yüklendi" });
  invalidatePlatformBrand();
  return ok({ logo: publicMeta(logo) });
}
