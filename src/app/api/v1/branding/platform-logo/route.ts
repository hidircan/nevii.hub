import { NextResponse } from "next/server";
import { getPlatformLogo, PLATFORM_LOGO_FALLBACK_PATH } from "@/lib/platform/branding";

export const dynamic = "force-dynamic";

/**
 * Public global platform logosu. Ayar yoksa build-time varsayılana
 * yönlendirir. İçerik türü yalnız doğrulanmış PNG/JPEG/WebP'dir; nosniff +
 * sandbox CSP ile tarayıcı içerik tahmini ve script yürütme engellenir.
 */
export async function GET(request: Request) {
  const logo = await getPlatformLogo().catch(() => null);
  if (!logo) return NextResponse.redirect(new URL(PLATFORM_LOGO_FALLBACK_PATH, request.url), 302);
  return new NextResponse(new Uint8Array(Buffer.from(logo.dataBase64, "base64")), {
    headers: {
      "Content-Type": logo.mime,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "public, max-age=300",
      ETag: `"${logo.sha256.slice(0, 32)}"`,
    },
  });
}
