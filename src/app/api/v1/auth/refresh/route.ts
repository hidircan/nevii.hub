import { z } from "zod";
import { NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api/handler";
import { jsonFail } from "@/lib/api/http";
import {
  getUserById,
  issueTokenPair,
  verifyRefreshToken,
  auditLog,
} from "@/lib/auth";
import {
  REFRESH_COOKIE,
  applyAuthCookies,
  parseCookieHeader,
} from "@/lib/auth/cookies";
import { isCrossSiteMutation } from "@/lib/api/csrf-guard";

export const dynamic = "force-dynamic";

const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
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
      return jsonFail("FORBIDDEN", "Cross-origin request rejected");
    }

    try {
      const claims = await verifyRefreshToken(token);
      const user = await getUserById(claims.sub);
      if (!user) {
        return jsonFail("UNAUTHORIZED", "User no longer valid");
      }
      if (user.tenantId !== claims.tenantId && user.role !== "SUPER_ADMIN") {
        return jsonFail("UNAUTHORIZED", "Tenant mismatch on refresh");
      }

      const tokens = await issueTokenPair({
        ...user,
        tenantId: claims.tenantId,
        role: claims.role,
        teacherId: claims.teacherId ?? user.teacherId,
        studentId: claims.studentId ?? user.studentId,
      });

      auditLog({
        action: "auth.refresh_success",
        requestId: ctx.requestId || "unknown",
        userId: user.userId,
        tenantId: claims.tenantId,
        role: claims.role,
        outcome: "success",
      });

      const res = NextResponse.json({
        ok: true as const,
        data: {
          user: {
            userId: user.userId,
            email: user.email,
            role: claims.role,
            tenantId: claims.tenantId,
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
