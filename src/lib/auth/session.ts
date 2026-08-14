import { cookies } from "next/headers";
import { verifyAccessToken, verifyRefreshToken, issueTokenPair } from "./jwt";
import { getUserById } from "./users";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "./cookies";
import type { ServiceContext } from "../services/context";
import type { AppRole } from "./types";
import { APP_ROLES } from "./types";

function isAppRole(v: string): v is AppRole {
  return (APP_ROLES as readonly string[]).includes(v);
}

function claimsToContext(claims: {
  sub: string;
  role: AppRole;
  tenantId: string;
  teacherId?: string;
  studentId?: string;
}): ServiceContext {
  return {
    role: claims.role,
    userId: claims.sub,
    tenantId: claims.tenantId,
    teacherId: claims.teacherId,
    studentId: claims.studentId,
    channel: "web",
  };
}

/**
 * Resolve web session from HttpOnly cookies.
 * Tries access token; on expiry attempts refresh token silently.
 */
export async function getSessionContext(): Promise<ServiceContext | null> {
  const jar = await cookies();
  const access = jar.get(ACCESS_COOKIE)?.value;
  if (access) {
    try {
      const claims = await verifyAccessToken(access);
      if (!isAppRole(claims.role)) return null;
      return claimsToContext(claims);
    } catch {
      // try refresh below
    }
  }

  const refresh = jar.get(REFRESH_COOKIE)?.value;
  if (!refresh) return null;

  try {
    const claims = await verifyRefreshToken(refresh);
    const user = await getUserById(claims.sub);
    if (!user) return null;

    const tokens = await issueTokenPair({
      ...user,
      tenantId: claims.tenantId,
      role: claims.role,
      teacherId: claims.teacherId ?? user.teacherId,
      studentId: claims.studentId ?? user.studentId,
    });

    // Refresh cookies in Server Components is limited; set via jar if mutable
    try {
      jar.set(ACCESS_COOKIE, tokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });
      jar.set(REFRESH_COOKIE, tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });
    } catch {
      // cookie set may fail in some RSC contexts — access still valid for this request via returned context
    }

    return claimsToContext({
      sub: user.userId,
      role: claims.role,
      tenantId: claims.tenantId,
      teacherId: claims.teacherId ?? user.teacherId,
      studentId: claims.studentId ?? user.studentId,
    });
  } catch {
    return null;
  }
}

export async function requireSessionContext(): Promise<ServiceContext> {
  const ctx = await getSessionContext();
  if (!ctx) {
    throw new Error("UNAUTHENTICATED");
  }
  return ctx;
}

export { homePathForRole, notificationSettingsPathForRole, notificationListPathForRole } from "./role-routes";
