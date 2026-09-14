import { NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api/handler";
import { ACCESS_COOKIE, REFRESH_COOKIE, clearAuthCookies, parseCookieHeader } from "@/lib/auth/cookies";
import { auditLog } from "@/lib/auth";
import { jsonFail } from "@/lib/api/http";
import { isCrossSiteMutation } from "@/lib/api/csrf-guard";
import { verifyRefreshToken } from "@/lib/auth/jwt";
import { revokeUserSession } from "@/lib/auth/session-registry";

export const dynamic = "force-dynamic";

/** POST /api/v1/auth/logout — clear HttpOnly session cookies */
export const POST = withApiHandler(
  async ({ ctx, request, body }) => {
    const cookieHeader = request.headers.get("cookie");
    const hasSessionCookie =
      Boolean(parseCookieHeader(cookieHeader, ACCESS_COOKIE)) ||
      Boolean(parseCookieHeader(cookieHeader, REFRESH_COOKIE));
    // CSRF defense-in-depth: only relevant when there's an actual browser cookie
    // session to forge a logout of; a Bearer/mobile caller has no cookie to begin with.
    if (hasSessionCookie && isCrossSiteMutation(request)) {
      auditLog({
        action: "auth.logout_csrf_rejected",
        requestId: ctx.requestId || "unknown",
        outcome: "denied",
      });
      return jsonFail("FORBIDDEN", "Cross-origin request rejected");
    }
    // NeviiOS: oturum kaydını kapat (refresh cookie'deki sid). İmza doğrulanmadan sid'e güvenilmez.
    // Mobil (çerezsiz) istemci refresh token'ı gövdede gönderir — /auth/refresh ile aynı sözleşme.
    const bodyRefresh = (body as { refreshToken?: unknown } | null)?.refreshToken;
    const refresh =
      (typeof bodyRefresh === "string" && bodyRefresh) || parseCookieHeader(cookieHeader, REFRESH_COOKIE);
    if (refresh) {
      try {
        const claims = await verifyRefreshToken(refresh);
        if (claims.sid) await revokeUserSession(claims.sid, claims.sub, "logout");
      } catch {
        // süresi dolmuş/geçersiz token — kapatılacak açık oturum yok
      }
    }
    auditLog({
      action: "auth.logout",
      requestId: ctx.requestId || "unknown",
      userId: ctx.userId !== "anonymous" ? ctx.userId : undefined,
      tenantId: ctx.tenantId !== "public" ? ctx.tenantId : undefined,
      outcome: "success",
    });
    const res = NextResponse.json({ ok: true as const, data: { loggedOut: true } });
    clearAuthCookies(res);
    // P1 (2026-09-11) — çıkışta KULLANICIYA AİT istemci önbelleği temizlenir
    // (tercih cookie'leri). Server'daki hesap kaydı KORUNUR — kullanıcı
    // dönünce düzenini geri bulur. Sonraki girişte bootstrap yalnız YENİ
    // hesabın kaydını yazar (Ezgi/Nihal ayrımı).
    for (const name of [
      "notaplan_theme_profile",
      "notaplan_font",
      "notaplan_density",
      "notaplan_sidebar_collapsed",
    ]) {
      res.cookies.set(name, "", { path: "/", maxAge: 0, sameSite: "lax" });
    }
    return res;
  },
  { public: true }
);
