import { NextRequest, NextResponse } from "next/server";
import { LOCALE_COOKIE } from "@/lib/i18n/copy";
import { normalizeSiteLocale } from "@/lib/site-locales";

/**
 * GET /api/site-locale?lang=xx&next=/
 * Herkese açık site dilini `nevii_lang` cookie'sine yazar ve geri yönlendirir.
 * JS gerektirmez (seçici düz bağlantılardır). `next` yalnız site-içi yoldur.
 */
export function GET(req: NextRequest) {
  const url = new URL(req.url);
  const lang = normalizeSiteLocale(url.searchParams.get("lang"));
  const next = url.searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const res = NextResponse.redirect(new URL(safeNext, url.origin));
  res.cookies.set(LOCALE_COOKIE, lang, {
    path: "/",
    maxAge: 365 * 24 * 3600,
    sameSite: "lax",
  });
  return res;
}
