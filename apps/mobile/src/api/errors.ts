/**
 * Mobil API hata sözleşmesi — RN'siz, saf (vitest ile test edilir).
 * Sunucu zarfı: `{ ok: true, data }` | `{ ok: false, error: { code, message } }`
 * (src/lib/api/http.ts). Kullanıcıya giden metin HTTP sınıfına göre sabit
 * ve aktif dile göredir; yalnız 400/409 (iş kuralı, ör. "kapalı gün")
 * sunucu mesajını korur.
 */
import type { Locale } from "../i18n/locales";
import { getActiveLocale } from "../i18n/locale-store";

export type ApiError = { code: string; message: string; status?: number };
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

const MSG: Record<string, Record<Locale, string>> = {
  network: {
    tr: "Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.",
    en: "Could not reach the server. Check your internet connection and try again.",
  },
  unavailable: {
    tr: "Bu özellik şu anda mobil uygulamada kullanılamıyor.",
    en: "This feature is currently unavailable in the mobile app.",
  },
  unauthorized: {
    tr: "Oturumunuzun süresi doldu. Lütfen yeniden giriş yapın.",
    en: "Your session has expired. Please sign in again.",
  },
  forbidden: {
    tr: "Bu işlem için yetkiniz yok veya kayıt erişim kapsamınızın dışında.",
    en: "You are not authorized for this action, or the record is outside your access scope.",
  },
  notFound: {
    tr: "Aradığınız kayıt bulunamadı veya artık mevcut değil.",
    en: "The requested record was not found or no longer exists.",
  },
  rateLimited: {
    tr: "Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.",
    en: "Too many attempts. Please try again in a few minutes.",
  },
  server: {
    tr: "Sunucuda bir sorun oluştu. Lütfen biraz sonra tekrar deneyin.",
    en: "Something went wrong on the server. Please try again shortly.",
  },
  failed: {
    tr: "İşlem tamamlanamadı. Bilgileri kontrol edip tekrar deneyin.",
    en: "The operation could not be completed. Check the details and try again.",
  },
  unexpected: {
    tr: "Sunucudan beklenmeyen bir yanıt alındı. Lütfen tekrar deneyin.",
    en: "Received an unexpected response from the server. Please try again.",
  },
};

export function networkError(locale: Locale = getActiveLocale()): ApiError {
  return { code: "NETWORK_ERROR", message: MSG.network[locale] };
}

/**
 * Backend'de karşılığı olmayan özellik için kanonik durum: ekran sahte veri veya
 * kırık çağrı yerine bunu gösterir (bkz. docs/mobile/MOBILE_API_ROUTE_DECISIONS.md).
 */
export function featureUnavailable(locale: Locale = getActiveLocale()): ApiError {
  return { code: "FEATURE_UNAVAILABLE", message: MSG.unavailable[locale] };
}

/** src/lib/api/http.ts STATUS ile aynı — 2xx gövdede `ok:false` gelirse sınıfı koddan çıkarmak için. */
const CODE_STATUS: Record<string, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export function describeHttpError(
  status: number,
  code?: string,
  serverMessage?: string,
  locale: Locale = getActiveLocale(),
): ApiError {
  if (status === 401)
    return { code: code ?? "UNAUTHORIZED", status, message: MSG.unauthorized[locale] };
  if (status === 403)
    return { code: code ?? "FORBIDDEN", status, message: MSG.forbidden[locale] };
  if (status === 404)
    return { code: code ?? "NOT_FOUND", status, message: MSG.notFound[locale] };
  if (status === 429)
    return { code: code ?? "RATE_LIMITED", status, message: MSG.rateLimited[locale] };
  if (status >= 500)
    return { code: code ?? "SERVER_ERROR", status, message: MSG.server[locale] };
  return {
    code: code ?? "REQUEST_FAILED",
    status,
    message: serverMessage || MSG.failed[locale],
  };
}

/** HTTP durum + çözülmüş JSON gövdesi (çözülemediyse null) → ApiResult. */
export function toApiResult<T>(status: number, body: unknown, locale: Locale = getActiveLocale()): ApiResult<T> {
  const env =
    body && typeof body === "object" && "ok" in body
      ? (body as { ok: unknown; data?: unknown; error?: { code?: unknown; message?: unknown } })
      : null;
  if (env?.ok === true && status < 400) return { ok: true, data: env.data as T };
  if (!env && status < 400) {
    return {
      ok: false,
      error: { code: "UNEXPECTED_RESPONSE", status, message: MSG.unexpected[locale] },
    };
  }
  const code = typeof env?.error?.code === "string" ? env.error.code : undefined;
  const serverMessage = typeof env?.error?.message === "string" ? env.error.message : undefined;
  const effectiveStatus = status >= 400 ? status : (code && CODE_STATUS[code]) || 400;
  return { ok: false, error: describeHttpError(effectiveStatus, code, serverMessage, locale) };
}
