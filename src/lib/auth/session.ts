import { cookies, headers } from "next/headers";
import { verifyAccessToken, verifyRefreshToken, issueTokenPair } from "./jwt";
import { getUserById, tenantAllowsLogin } from "./users";
import { isSessionClaimValid } from "./session-validity";
import { touchSessionPresence } from "./session-registry";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "./cookies";
import type { ServiceContext } from "../services/context";
import type { AppRole } from "./types";
import { APP_ROLES } from "./types";

function isAppRole(v: string): v is AppRole {
  return (APP_ROLES as readonly string[]).includes(v);
}

/** Middleware'in eklediği yol başlığı (sorgu dizesi YOK) — yalnız presence için. */
export const PRESENCE_PATH_HEADER = "x-neviios-path";

async function claimsToContext(claims: {
  sub: string;
  role: AppRole;
  tenantId: string;
  teacherId?: string;
  studentId?: string;
  sid?: string;
}): Promise<ServiceContext> {
  const { resolveEffectiveRole } = await import("../platform/manager-preset");
  const role = await resolveEffectiveRole(claims.role, claims.tenantId);
  try {
    const path = (await headers()).get(PRESENCE_PATH_HEADER);
    touchSessionPresence(claims.sid, { path: path && path.startsWith("/") ? path.slice(0, 200) : null });
  } catch {
    // headers() render bağlamı dışında olabilir — presence best-effort
  }
  return {
    role,
    loginRole: role !== claims.role ? claims.role : undefined,
    sid: claims.sid,
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
      if (!(await isSessionClaimValid(claims))) return null;
      return await claimsToContext(claims);
    } catch {
      // try refresh below
    }
  }

  const refresh = jar.get(REFRESH_COOKIE)?.value;
  if (!refresh) return null;

  try {
    const claims = await verifyRefreshToken(refresh);
    if (!(await isSessionClaimValid(claims, { ignoreRole: true }))) return null;
    const user = await getUserById(claims.sub);
    if (!user) return null;
    // NeviiOS: güncel rol/tenant; kurum askıdaysa oturum yenilenmez.
    if (user.tenantId !== claims.tenantId || !(await tenantAllowsLogin(user.tenantId, user.role))) return null;

    if (claims.sid) {
      const { extendUserSession } = await import("./session-registry");
      if (!(await extendUserSession(claims.sid))) return null;
    }
    const tokens = await issueTokenPair({
      ...user,
      tenantId: user.tenantId,
      role: user.role,
      teacherId: claims.teacherId ?? user.teacherId,
      studentId: claims.studentId ?? user.studentId,
      sid: claims.sid,
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
      role: user.role,
      tenantId: user.tenantId,
      teacherId: claims.teacherId ?? user.teacherId,
      studentId: claims.studentId ?? user.studentId,
      sid: claims.sid,
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
