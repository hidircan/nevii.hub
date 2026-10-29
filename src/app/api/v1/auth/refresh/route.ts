import { z } from "zod";
import { NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api/handler";
import { jsonFail } from "@/lib/api/http";
import { isSessionClaimValid } from "@/lib/auth/session-validity";
import { extendUserSession } from "@/lib/auth/session-registry";
import {
  getUserById,
  tenantAllowsLogin,
  issueTokenPair,
  verifyRefreshToken,
  auditLog,
} from "@/lib/auth";
import {
  REFRESH_COOKIE,
  applyAuthCookies,
  parseCookieHeader,
} from "@/lib/auth/cookies";
import { CROSS_SITE_REJECTED_MESSAGE, isCrossSiteMutation } from "@/lib/api/csrf-guard";
import { IDLE_LOGOUT_MESSAGE, isIdleExpired, nowSec } from "@/lib/session-policy";

export const dynamic = "force-dynamic";

const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
  /** Tarayıcı: gerçek kullanıcı etkileşiminden sonra seyrek çağrı — `act` şimdiye çekilir. */
  activity: z.boolean().optional(),
});

/**
 * POST /api/v1/auth/refresh
 * Accepts body.refreshToken or HttpOnly refresh cookie.
 */
export const POST = withApiHandler(
  async ({ body, ctx, request }) => {
    const parsed = refreshSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return jsonFail("VALIDATION_ERROR", "Invalid refresh payload", parsed.error.flatten());
    }

    const cookieToken = parseCookieHeader(request.headers.get("cookie"), REFRESH_COOKIE);
    const token = parsed.data.refreshToken || cookieToken;

    if (!token) {
      return jsonFail("UNAUTHORIZED", "Missing refresh token");
    }

    // CSRF defense-in-depth: only when the browser cookie is the source of the
    // refresh token (no explicit body.refreshToken — that's the mobile/API flow,
    // never auto-attached by a browser, so not at risk).
    if (!parsed.data.refreshToken && cookieToken && isCrossSiteMutation(request)) {
      auditLog({
        action: "auth.refresh_csrf_rejected",
        requestId: ctx.requestId || "unknown",
        outcome: "denied",
      });
      return jsonFail("FORBIDDEN", CROSS_SITE_REJECTED_MESSAGE);
    }

    try {
      const claims = await verifyRefreshToken(token);
      // Web hareketsizlik: act token'a gömülüdür (yalnız tarayıcı girişinde) — taşıma yolundan bağımsız uygulanır.
      const browser = !parsed.data.refreshToken;
      if (isIdleExpired(claims.act)) {
        auditLog({ action: "auth.refresh_idle_expired", requestId: ctx.requestId || "unknown", userId: claims.sub, outcome: "denied" });
        return jsonFail("UNAUTHORIZED", IDLE_LOGOUT_MESSAGE);
      }
      if (!(await isSessionClaimValid(claims, { ignoreRole: true }))) {
        return jsonFail("UNAUTHORIZED", "User no longer valid");
      }
      const user = await getUserById(claims.sub);
      if (!user) {
        return jsonFail("UNAUTHORIZED", "User no longer valid");
      }
      // NeviiOS: tenant ve rol HER refresh'te güncel kullanıcı kaydından gelir —
      // rol düşürme / kurum askıya alma en geç access TTL sonunda etkili olur.
      // SUPER_ADMIN artık tek kurumun sahibidir; tenant uyuşmazlığı istisnası yok.
      if (user.tenantId !== claims.tenantId || !(await tenantAllowsLogin(user.tenantId, user.role))) {
        return jsonFail("UNAUTHORIZED", "Tenant mismatch on refresh");
      }

      if (claims.sid && !(await extendUserSession(claims.sid))) {
        return jsonFail("UNAUTHORIZED", "Session revoked");
      }

      const tokens = await issueTokenPair({
        ...user,
        tenantId: user.tenantId,
        role: user.role,
        teacherId: claims.teacherId ?? user.teacherId,
        studentId: claims.studentId ?? user.studentId,
        sid: claims.sid,
        // Yenileme etkinlik sayılmaz: `act` korunur; yalnız tarayıcının açık etkinlik isteği ilerletir.
        // act'siz eski tarayıcı token'ında saat şimdi başlar; mobil (gövde) token'ı act'siz kalır.
        act: claims.act === undefined ? (browser ? nowSec() : undefined) : parsed.data.activity ? nowSec() : claims.act,
      });

      auditLog({
        action: "auth.refresh_success",
        requestId: ctx.requestId || "unknown",
        userId: user.userId,
        tenantId: user.tenantId,
        role: user.role,
        outcome: "success",
      });

      const res = NextResponse.json({
        ok: true as const,
        data: {
          user: {
            userId: user.userId,
            email: user.email,
            role: user.role,
            tenantId: user.tenantId,
            teacherId: claims.teacherId ?? user.teacherId,
            studentId: claims.studentId ?? user.studentId,
          },
          ...tokens,
        },
      });
      applyAuthCookies(res, tokens);
      return res;
    } catch {
      auditLog({
        action: "auth.refresh_failed",
        requestId: ctx.requestId || "unknown",
        outcome: "denied",
      });
      return jsonFail("UNAUTHORIZED", "Invalid or expired refresh token");
    }
  },
  { public: true }
);
