import { NextResponse } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE, parseCookieHeader } from "@/lib/auth/cookies";
import { verifyAccessToken, verifyRefreshToken } from "@/lib/auth/jwt";
import { resolveSessionStatus } from "@/lib/auth/session-concurrency";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/auth/session-status — N: bu tarayıcının oturumu hâlâ açık mı?
 * Başka cihazdan devralındıysa `taken_over` döner; istemci kullanıcıyı bilgilendirip
 * çıkış yaptırır. Yalnız imzası doğrulanmış çerezdeki sid okunur; başka hiçbir bilgi dönmez.
 */
export async function GET(request: Request) {
  const cookieHeader = request.headers.get("cookie");
  const access = parseCookieHeader(cookieHeader, ACCESS_COOKIE);
  const refresh = parseCookieHeader(cookieHeader, REFRESH_COOKIE);
  let claims: { sub: string; sid?: string } | null = null;
  for (const [token, verify] of [
    [access, verifyAccessToken],
    [refresh, verifyRefreshToken],
  ] as const) {
    if (!token) continue;
    try {
      claims = await verify(token);
      break;
    } catch {
      // süresi dolmuş erişim token'ı → refresh ile dene
    }
  }
  if (!claims) return NextResponse.json({ ok: true, data: { state: "none" } }, { headers: { "Cache-Control": "no-store" } });
  try {
    const status = await resolveSessionStatus(claims.sid, claims.sub);
    return NextResponse.json({ ok: true, data: status }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Kayıt okunamazsa istemciyi yanlışlıkla çıkarmayız.
    return NextResponse.json({ ok: true, data: { state: "active" } }, { headers: { "Cache-Control": "no-store" } });
  }
}
