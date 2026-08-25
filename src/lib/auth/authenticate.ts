import { verifyAccessToken, verifyRefreshToken } from "./jwt";
import type { AuthUser, JwtClaims } from "./types";
import { auditLog } from "./audit";
import { ACCESS_COOKIE, parseCookieHeader } from "./cookies";

export type AuthMethod = "bearer" | "cookie";

export type AuthenticateResult =
  | { ok: true; user: AuthUser; claims: JwtClaims; via: AuthMethod }
  | { ok: false; code: "UNAUTHORIZED"; message: string };

function extractAccessToken(request: Request): { token: string; via: AuthMethod } | null {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const t = header.slice(7).trim();
    return t ? { token: t, via: "bearer" } : null;
  }
  // Browser session (HttpOnly cookie)
  const cookieToken = parseCookieHeader(request.headers.get("cookie"), ACCESS_COOKIE);
  return cookieToken ? { token: cookieToken, via: "cookie" } : null;
}

/**
 * Extract and verify access token (Bearer header or HttpOnly cookie).
 * Tenant/role/userId come only from verified JWT claims.
 */
export async function authenticateRequest(
  request: Request,
  requestId: string
): Promise<AuthenticateResult> {
  const extracted = extractAccessToken(request);
  let claims: JwtClaims;
  let via: AuthMethod;

  try {
    if (extracted) {
      claims = await verifyAccessToken(extracted.token);
      via = extracted.via;
    } else {
      const refreshToken = parseCookieHeader(request.headers.get("cookie"), "np_refresh");
      if (!refreshToken) throw new Error("Missing access and refresh tokens");
      claims = await verifyRefreshToken(refreshToken);
      via = "cookie";
    }

    const user: AuthUser = {
      userId: claims.sub,
      role: claims.role,
      tenantId: claims.tenantId,
      email: claims.email,
      teacherId: claims.teacherId,
      studentId: claims.studentId,
    };

    // Reject client spoofing: if client sends X-Tenant-Id, it must match JWT (or be ignored)
    const clientTenant = request.headers.get("x-tenant-id");
    if (clientTenant && clientTenant !== user.tenantId) {
      auditLog({
        action: "auth.tenant_mismatch",
        requestId,
        userId: user.userId,
        tenantId: user.tenantId,
        role: user.role,
        outcome: "denied",
        meta: { clientTenant },
      });
      return {
        ok: false,
        code: "UNAUTHORIZED",
        message: "Tenant claim mismatch; tenant is resolved from token only",
      };
    }

    auditLog({
      action: "auth.success",
      requestId,
      userId: user.userId,
      tenantId: user.tenantId,
      role: user.role,
      path: new URL(request.url).pathname,
      method: request.method,
      outcome: "success",
    });

    return { ok: true, user, claims, via };
  } catch {
    auditLog({
      action: "auth.invalid_token",
      requestId,
      path: new URL(request.url).pathname,
      method: request.method,
      outcome: "denied",
    });
    return {
      ok: false,
      code: "UNAUTHORIZED",
      message: "Invalid or expired access token",
    };
  }
}
