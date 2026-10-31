import { NextResponse } from "next/server";
import { readBlogImage } from "@/lib/platform/blog";

export const dynamic = "force-dynamic";

/**
 * Blog kapak görseli. Adres içeriğin özetidir, bayt değişmez: CDN bir yıl saklar, veritabanı yalnız ilk istekte
 * okunur. İçerik sunucuda yeniden kodlanmış WebP'dir; nosniff + sandbox CSP ile script yürütülemez.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const bytes = await readBlogImage((await params).id).catch(() => null);
  if (!bytes) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/webp",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
    },
  });
}
