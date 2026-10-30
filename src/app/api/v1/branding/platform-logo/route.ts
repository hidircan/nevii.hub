import { NextResponse } from "next/server";
import { PLATFORM_LOGO_FALLBACK_PATH, readPlatformLogoAsset, type PlatformLogoVariant } from "@/lib/platform/branding";

export const dynamic = "force-dynamic";

const VARIANTS: PlatformLogoVariant[] = ["logo", "icon", "apple"];

/**
 * Public global platform logosu ve ondan türeyen ikonlar. Ayar yoksa build-time
 * varsayılana yönlendirir. İçerik türü yalnız sunucuda yeniden kodlanmış PNG'dir;
 * nosniff + sandbox CSP ile içerik tahmini ve script yürütme engellenir.
 * `?v=<sürüm>` değişmez baytı gösterir (uzun önbellek); yeni logo yeni URL demektir.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const variant = VARIANTS.find((x) => x === params.get("variant")) ?? "logo";
  const asset = await readPlatformLogoAsset(variant, params.get("v")).catch(() => null);
  if (!asset) {
    const fallback = variant === "logo" ? PLATFORM_LOGO_FALLBACK_PATH : "/icon.png";
    return NextResponse.redirect(new URL(fallback, request.url), 302);
  }
  return new NextResponse(new Uint8Array(asset.bytes), {
    headers: {
      "Content-Type": asset.mime,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": asset.immutable ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate",
      ETag: `"${asset.etag}"`,
    },
  });
}
