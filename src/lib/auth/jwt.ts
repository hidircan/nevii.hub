import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import {
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL,
  getJwtSecret,
} from "./config";
import type { AppRole, AuthUser, JwtClaims, TokenType } from "./types";
import { APP_ROLES } from "./types";

function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && (APP_ROLES as readonly string[]).includes(value);
}

export async function signToken(
  user: AuthUser,
  typ: TokenType
): Promise<string> {
  const secret = getJwtSecret();
  const ttl = typ === "access" ? ACCESS_TOKEN_TTL : REFRESH_TOKEN_TTL;

  return new SignJWT({
    role: user.role,
    tenantId: user.tenantId,
    typ,
    teacherId: user.teacherId,
    studentId: user.studentId,
    email: user.email,
    ...(user.sid ? { sid: user.sid } : {}),
    ...(typeof user.act === "number" ? { act: user.act } : {}),
  } satisfies Omit<JwtClaims, "sub" | "iat" | "exp">)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.userId)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .setIssuer("notaplan")
    .setAudience("notaplan-api")
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<JwtClaims> {
  const { payload } = await jwtVerify(token, getJwtSecret(), {
    issuer: "notaplan",
    audience: "notaplan-api",
  });
  return parseClaims(payload, "access");
}

export async function verifyRefreshToken(token: string): Promise<JwtClaims> {
  const { payload } = await jwtVerify(token, getJwtSecret(), {
    issuer: "notaplan",
    audience: "notaplan-api",
  });
  return parseClaims(payload, "refresh");
}

function parseClaims(payload: JWTPayload, expectedTyp: TokenType): JwtClaims {
  const sub = payload.sub;
  const role = payload.role;
  const tenantId = payload.tenantId;
  const typRaw = payload.typ;
  const typ: TokenType | undefined =
    typRaw === "access" || typRaw === "refresh" ? typRaw : undefined;

  if (!sub || typeof sub !== "string") {
    throw new Error("Invalid token: missing sub");
  }
  if (!isAppRole(role)) {
    throw new Error("Invalid token: missing or invalid role");
  }
  if (!tenantId || typeof tenantId !== "string") {
    throw new Error("Invalid token: missing tenantId");
  }
  if (typ !== expectedTyp) {
    throw new Error(`Invalid token type: expected ${expectedTyp}`);
  }

  return {
    sub,
    role,
    tenantId,
    typ,
    teacherId: typeof payload.teacherId === "string" ? payload.teacherId : undefined,
    studentId: typeof payload.studentId === "string" ? payload.studentId : undefined,
    email: typeof payload.email === "string" ? payload.email : undefined,
    sid: typeof payload.sid === "string" ? payload.sid : undefined,
    act: typeof payload.act === "number" ? payload.act : undefined,
    iat: payload.iat,
    exp: payload.exp,
  };
}

export async function issueTokenPair(user: AuthUser): Promise<{
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: string;
}> {
  const [accessToken, refreshToken] = await Promise.all([
    signToken(user, "access"),
    signToken(user, "refresh"),
  ]);
  return {
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    expiresIn: ACCESS_TOKEN_TTL,
  };
}
