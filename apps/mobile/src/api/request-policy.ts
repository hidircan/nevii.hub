/**
 * Mobil request politikası — saf, RN-bağımsız karar fonksiyonları.
 *
 * Maliyet hardening turu (F1–F5):
 * - Timeout: mobil ağ gerçekliğine göre merkezi tek değer.
 * - Retry: YALNIZ idempotent GET + (ağ hatası | 5xx). 4xx'te (auth/validation/
 *   rate-limit dahil) retry YOK — fırtına çıkarmaz, hesabı kilitlemez.
 *   Mutation'lar (POST/PATCH/DELETE) ASLA otomatik retry almaz — çift yazma
 *   (çift ödeme/yoklama) riski göze alınamaz; kullanıcı manuel dener.
 * - Otomatik yenileme (focus/foreground) dedupe penceresi: mount+focus+
 *   foreground üçlüsü aynı anda ateşlendiğinde ikinci/üçüncü istek atlanir.
 * - Manuel refresh'e kısa spam kilidi (kullanıcıyı kilitlemez).
 * - Sunucu aramalarında debounce + minimum karakter eşiği.
 */

/** Tek deneme için ağ zaman aşımı (mobil ağ gerçekliği: yavaş 4G hoşgörülü). */
export const API_TIMEOUT_MS = 20_000;

/** GET yeniden deneme sayısı (ilk deneme hariç). */
export const MAX_GET_RETRIES = 2;

/** Backoff tabanı ve tavanı (jitter ile birlikte). */
export const RETRY_BASE_DELAY_MS = 500;
export const RETRY_MAX_DELAY_MS = 8_000;

/**
 * Otomatik tetikleyiciler (focus/foreground/push-yankı) için dedupe penceresi:
 * son tamamlanan isteğin üzerinden bu süre geçmediyse otomatik yenileme atlanır.
 * Mount → focus → foreground üçlüsü milisaniyeler içinde ateşlenir; bu pencere
 * onları tek isteğe indirir. Mutation sonrası dönüşler (saniyeler sonra) etkilenmez.
 */
export const AUTO_REFRESH_DEDUPE_MS = 2_000;

/** Manuel yenileme (pull-to-refresh / tekrar-dene) spam kilidi. */
export const MANUAL_REFRESH_COOLDOWN_MS = 1_000;

/** Sunucu araması debounce süresi (300–500ms bandı). */
export const SEARCH_DEBOUNCE_MS = 400;

/**
 * Sunucu aramasında minimum karakter: 1 karakterli sorgular seçiciliği düşük
 * tam-taramalardır; sonuç gösterilmez, önceki liste korunur, istek atılmaz.
 * Boş sorgu = filtresiz ilk sayfa (istek atılır).
 */
export const SEARCH_MIN_CHARS = 2;

export type RetryOutcome =
  | { kind: "network-error" }
  | { kind: "http"; status: number };

/** Bu sonuçta otomatik retry güvenli mi? Yalnız ağ hatası ve 5xx. */
export function isRetryableOutcome(outcome: RetryOutcome): boolean {
  if (outcome.kind === "network-error") return true;
  return outcome.status >= 500 && outcome.status <= 599;
}

/**
 * Exponential backoff + jitter: `base * 2^attempt` ± %25, tavanla sınırlı.
 * `attempt` 0-bazlı (ilk retry = 0). `random` enjekte edilebilir (testler).
 */
export function retryDelayMs(
  attempt: number,
  random: () => number = Math.random
): number {
  const safeAttempt = Math.max(0, Math.min(attempt, 10));
  const backoff = RETRY_BASE_DELAY_MS * 2 ** safeAttempt;
  const jitter = backoff * 0.25 * (random() * 2 - 1);
  return Math.min(Math.max(0, Math.round(backoff + jitter)), RETRY_MAX_DELAY_MS);
}

/**
 * Otomatik yenileme atlanmalı mı? Son tamamlanma zamanı bilinmiyorsa (hiç
 * istek atılmadıysa) atlanmaz. `nowMs` enjekte edilebilir (testler).
 */
export function shouldSkipAutoRefresh(
  lastCompletedAtMs: number | null,
  nowMs: number = Date.now()
): boolean {
  if (lastCompletedAtMs === null) return false;
  return nowMs - lastCompletedAtMs < AUTO_REFRESH_DEDUPE_MS;
}

/** Manuel yenileme atlanmalı mı (spam kilidi)? */
export function shouldSkipManualRefresh(
  lastRefreshAtMs: number | null,
  nowMs: number = Date.now()
): boolean {
  if (lastRefreshAtMs === null) return false;
  return nowMs - lastRefreshAtMs < MANUAL_REFRESH_COOLDOWN_MS;
}

export type GatedSearchQuery =
  | { fetch: true; q: string }
  | { fetch: false };

/**
 * Ham arama girdisini sunucu isteğine çevirir:
 * - boş (trim sonrası) → `{fetch:true, q:""}` (filtresiz ilk sayfa)
 * - 1 karakter → `{fetch:false}` (önceki sonuçlar korunur, istek yok)
 * - ≥2 karakter → `{fetch:true, q:trimmed}`
 */
export function gateSearchQuery(raw: string): GatedSearchQuery {
  const q = raw.trim();
  if (q.length === 0) return { fetch: true, q: "" };
  if (q.length < SEARCH_MIN_CHARS) return { fetch: false };
  return { fetch: true, q };
}
