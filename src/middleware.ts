import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth/cookies";
import { getJwtSecret } from "@/lib/auth/config";

const PROTECTED = ["/panel", "/veli", "/ogretmen", "/ogrenci", "/platform", "/sube"];

async function hasValidAccess(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) return false;
  try {
    // getJwtSecret() throws fail-closed if JWT_SECRET is missing/short in production —
    // never fall back to a guessable dev secret to verify a real user's token.
    await jwtVerify(token, getJwtSecret(), {
      issuer: "notaplan",
      audience: "notaplan-api",
    });
    return true;
  } catch {
    return false;
  }
}

function hasRefresh(request: NextRequest): boolean {
  return Boolean(request.cookies.get(REFRESH_COOKIE)?.value);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  if (!isProtected) return NextResponse.next();

  if ((await hasValidAccess(request)) || hasRefresh(request)) {
    // NeviiOS presence: yalnız yol (sorgu dizesi asla) oturum katmanına iletilir.
    // Refresh varsa oturum katmanı sessizce yeniler.
    const headers = new Headers(request.headers);
    headers.set("x-neviios-path", pathname);
    return NextResponse.next({ request: { headers } });
  }

  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/panel/:path*",
    "/veli/:path*",
    "/ogretmen/:path*",
    "/ogrenci/:path*",
    "/platform/:path*",
    "/sube/:path*",
    "/panel",
    "/veli",
    "/ogretmen",
    "/ogrenci",
    "/platform",
    "/sube",
  ],
};
