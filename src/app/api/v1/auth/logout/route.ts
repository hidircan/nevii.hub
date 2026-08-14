import { NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api/handler";
import { ACCESS_COOKIE, REFRESH_COOKIE, clearAuthCookies, parseCookieHeader } from "@/lib/auth/cookies";
import { auditLog } from "@/lib/auth";
import { jsonFail } from "@/lib/api/http";
import { isCrossSiteMutation } from "@/lib/api/csrf-guard";

export const dynamic = "force-dynamic";

/** POST /api/v1/auth/logout — clear HttpOnly session cookies */
export const POST = withApiHandler(
  async ({ ctx, request }) => {
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
    auditLog({
      action: "auth.logout",
      requestId: ctx.requestId || "unknown",
      userId: ctx.userId !== "anonymous" ? ctx.userId : undefined,
      tenantId: ctx.tenantId !== "public" ? ctx.tenantId : undefined,
      outcome: "success",
    });
    const res = NextResponse.json({ ok: true as const, data: { loggedOut: true } });
    clearAuthCookies(res);
    return res;
  },
  { public: true }
);
