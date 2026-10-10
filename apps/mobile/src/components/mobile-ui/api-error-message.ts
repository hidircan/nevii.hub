/**
 * Öğrenci/veli portalı için API hata kodu → kullanıcı dostu Türkçe mesaj.
 *
 * Backend kelime dağarcığı (`src/lib/services/result.ts` ServiceErrorCode,
 * read-only referans): VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND,
 * CONFLICT, RATE_LIMITED, INTERNAL_ERROR. Mobil API istemcisi
 * (`apps/mobile/src/api/client.ts`, read-only) buna iki istemci-içi kod
 * ekler: NETWORK_ERROR ve UNEXPECTED_RESPONSE.
 *
 * Kurallar:
 * - STUDENT ve PARENT'a teknik detay (HTTP kodu, host, stack) gösterilmez.
 * - 401/403/404 kullanıcıya "erişim/kayıt gerçeği" olarak anlatılır; sahte
 *   başarı veya boş beyaz ekran yerine bu metinler ErrorState ile gösterilir.
 * - FORBIDDEN/NOT_FOUND erişim-kapsamı gerçeğidir; retry ile düzelmez
 *   (`isAccessScopeError` + ErrorState `code` deseniyle nötr tonda gösterilir).
 */

import type { Locale } from "../../i18n/locales";
import { getActiveLocale } from "../../i18n/locale-store";

export type PortalApiErrorCode =
  | "NETWORK_ERROR"
  | "UNEXPECTED_RESPONSE"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | string;

export function isAccessScopeError(code: string): boolean {
  return code === "FORBIDDEN" || code === "NOT_FOUND";
}

/**
 * UI'ya sızmaması gereken teknik kalıplar (stack, secret, iç hata).
 * Bilinmeyen kodlarda fallback mesajı bu filtreden geçmeden gösterilmez.
 */
const SENSITIVE_PATTERNS = [
  /stack/i,
  /exception/i,
  /password/i,
  /token/i,
  /secret/i,
  /api[-_ ]?key/i,
  /database[-_ ]?url/i,
  /direct[-_ ]?url/i,
  /prisma/i,
  /supabase/i,
  /at\s+[\w$.]+\s*\(.*:\d+:\d+\)/,
];

export function containsSensitiveText(value: string): boolean {
  return SENSITIVE_PATTERNS.some((re) => re.test(value));
}

/**
 * `code` + ham backend mesajından ekranda gösterilecek metni üretir.
 * Kullanıcı girdisi hataları (VALIDATION_ERROR/CONFLICT) backend mesajını
 * korur — çünkü o mesaj eyleme dönüktür; diğer kodlarda sabit, sakin,
 * suçlayıcı olmayan Türkçe metin döndürülür.
 */
const GENERIC_TR = "Şu anda veriler yüklenemedi. Tekrar deneyin.";
const GENERIC_EN = "Data could not be loaded right now. Please try again.";

export function portalErrorMessage(
  code: string,
  fallbackMessage?: string,
  locale: Locale = getActiveLocale(),
): string {
  const en = locale === "en";
  const generic = en ? GENERIC_EN : GENERIC_TR;
  switch (code) {
    case "NETWORK_ERROR":
      return en ? "Could not connect to the internet. Please try again." : "İnternet bağlantısı kurulamadı. Lütfen tekrar deneyin.";
    case "UNAUTHORIZED":
      return en ? "Your session has expired. Please sign in again." : "Oturumunuz sona erdi. Tekrar giriş yapın.";
    case "FORBIDDEN":
      return en ? "You are not authorized to view this information." : "Bu bilgiye erişim yetkiniz yok.";
    case "NOT_FOUND":
      return en ? "The requested record was not found." : "İstenen kayıt bulunamadı.";
    case "RATE_LIMITED":
      return en ? "Too many requests were sent. Wait a little and try again." : "Çok fazla istek gönderildi. Biraz bekleyip tekrar deneyin.";
    case "INTERNAL_ERROR":
    case "SERVER_ERROR":
    case "UNEXPECTED_RESPONSE":
      return generic;
    case "FEATURE_UNAVAILABLE":
      // Canonical: src/api/errors.ts FEATURE_UNAVAILABLE ile aynı metin.
      return en ? "This feature is not available in the mobile app right now." : "Bu özellik şu anda mobil uygulamada kullanılamıyor.";
    case "VALIDATION_ERROR":
    case "CONFLICT": {
      // Kullanıcı girdisi hataları backend'in eyleme dönük mesajını korur —
      // ama hassas kalıp içeriyorsa genel metne düşer.
      const fallback = fallbackMessage?.trim();
      if (fallback && !containsSensitiveText(fallback)) return fallback;
      return generic;
    }
    default:
      // Bilinmeyen kod: ham backend mesajı ASLA gösterilmez (sızıntı riski).
      return generic;
  }
}
