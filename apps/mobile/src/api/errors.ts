/**
 * Mobil API hata sözleşmesi — RN'siz, saf (vitest ile test edilir).
 * Sunucu zarfı: `{ ok: true, data }` | `{ ok: false, error: { code, message } }`
 * (src/lib/api/http.ts). Kullanıcıya giden metin HTTP sınıfına göre sabit
 * Türkçedir; yalnız 400/409 (iş kuralı, ör. "kapalı gün") sunucu mesajını korur.
 */
export type ApiError = { code: string; message: string; status?: number };
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export const NETWORK_ERROR: ApiError = {
  code: "NETWORK_ERROR",
  message: "Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.",
};

/**
 * Backend'de karşılığı olmayan özellik için kanonik durum: ekran sahte veri veya
 * kırık çağrı yerine bunu gösterir (bkz. docs/mobile/MOBILE_API_ROUTE_DECISIONS.md).
 */
export const FEATURE_UNAVAILABLE: ApiError = {
  code: "FEATURE_UNAVAILABLE",
  message: "Bu özellik şu anda mobil uygulamada kullanılamıyor.",
};

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

export function describeHttpError(status: number, code?: string, serverMessage?: string): ApiError {
  if (status === 401)
    return { code: code ?? "UNAUTHORIZED", status, message: "Oturumunuzun süresi doldu. Lütfen yeniden giriş yapın." };
  if (status === 403)
    return { code: code ?? "FORBIDDEN", status, message: "Bu işlem için yetkiniz yok veya kayıt erişim kapsamınızın dışında." };
  if (status === 404)
    return { code: code ?? "NOT_FOUND", status, message: "Aradığınız kayıt bulunamadı veya artık mevcut değil." };
  if (status === 429)
    return { code: code ?? "RATE_LIMITED", status, message: "Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin." };
  if (status >= 500)
    return { code: code ?? "SERVER_ERROR", status, message: "Sunucuda bir sorun oluştu. Lütfen biraz sonra tekrar deneyin." };
  return {
    code: code ?? "REQUEST_FAILED",
    status,
    message: serverMessage || "İşlem tamamlanamadı. Bilgileri kontrol edip tekrar deneyin.",
  };
}

/** HTTP durum + çözülmüş JSON gövdesi (çözülemediyse null) → ApiResult. */
export function toApiResult<T>(status: number, body: unknown): ApiResult<T> {
  const env =
    body && typeof body === "object" && "ok" in body
      ? (body as { ok: unknown; data?: unknown; error?: { code?: unknown; message?: unknown } })
      : null;
  if (env?.ok === true && status < 400) return { ok: true, data: env.data as T };
  if (!env && status < 400) {
    return {
      ok: false,
      error: { code: "UNEXPECTED_RESPONSE", status, message: "Sunucudan beklenmeyen bir yanıt alındı. Lütfen tekrar deneyin." },
    };
  }
  const code = typeof env?.error?.code === "string" ? env.error.code : undefined;
  const serverMessage = typeof env?.error?.message === "string" ? env.error.message : undefined;
  const effectiveStatus = status >= 400 ? status : (code && CODE_STATUS[code]) || 400;
  return { ok: false, error: describeHttpError(effectiveStatus, code, serverMessage) };
}
