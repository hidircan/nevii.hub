import { Platform } from "react-native";
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "../auth/token-storage";
import { networkError, toApiResult, type ApiResult } from "./errors";
import { getActiveLocale } from "../i18n/locale-store";
import { API_TIMEOUT_MS, MAX_GET_RETRIES, isRetryableOutcome, retryDelayMs } from "./request-policy";

export type { ApiResult };

/**
 * EXPO_PUBLIC_API_URL — iOS Simulator'da localhost çalışır (aynı Mac).
 * Fiziksel cihaz veya Android Emulator'de Mac'in LAN IP'si ya da test ortamının
 * HTTPS adresi gerekir (bkz. docs/mobile/EAS_DEVICE_TEST_READINESS.md).
 * Sonda kalan "/" temizlenir — aksi halde `${base}${path}` çift "//" üretebilir.
 */
function resolveApiBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
  const trimmed = raw.trim().replace(/\/+$/, "");

  if (__DEV__ && Platform.OS !== "web" && /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(trimmed)) {
    console.warn(
      `[Nevii Hub] EXPO_PUBLIC_API_URL "${trimmed}" localhost/127.0.0.1 gösteriyor. ` +
        "Fiziksel bir cihazda (Expo Go) bu adres CİHAZIN KENDİSİNİ işaret eder, Mac'i DEĞİL — " +
        "Mac'in LAN IP'sini kullanın (ör. http://192.168.1.23:3000), bkz. apps/mobile/.env.example."
    );
  }

  return trimmed;
}

const API_BASE_URL = resolveApiBaseUrl();

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * fetch() bağlantı seviyesinde başarısız oldu (DNS/timeout/connection refused —
 * sunucuya hiç ulaşılamadı). Dev modunda hedef host ve gerçek fetch hatası
 * console'a yazılır (asla token/secret); production'da yalnız genel mesaj.
 */
function networkErrorResult<T>(url: string, err: unknown): ApiResult<T> {
  const locale = getActiveLocale();
  if (__DEV__) {
    console.warn(`[Nevii Hub API] ${url} adresine ulaşılamadı: ${err instanceof Error ? err.message : String(err)}`);
    return {
      ok: false,
      error: {
        ...networkError(locale),
        message:
          locale === "en"
            ? `Could not reach server (${hostOf(url)}). Check that the backend is running and EXPO_PUBLIC_API_URL is correct.`
            : `Sunucuya ulaşılamadı (${hostOf(url)}). Backend çalışıyor mu ve EXPO_PUBLIC_API_URL doğru mu kontrol edin.`,
      },
    };
  }
  return { ok: false, error: networkError(locale) };
}

/** Yanıt gövdesini çözer; JSON değilse (ör. HTML 404 — route yok / yanlış sunucu) durum koduna göre hata üretir. */
async function parseApiResponse<T>(res: Response, url: string): Promise<ApiResult<T>> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    if (__DEV__) console.warn(`[Nevii Hub API] ${url} → HTTP ${res.status} ama beklenen JSON gövdesi değil (route yok mu / yanlış sunucu mu?).`);
  }
  return toApiResult<T>(res.status, body);
}

/**
 * Oturum sınırı: her yerel çıkışta `sessionEpoch` artar. Çıkıştan ÖNCE başlamış
 * bir refresh isteği sonradan dönse bile token yazmaz — iptal edilen oturum
 * refresh ile yeniden canlanmaz.
 */
let sessionEpoch = 0;
let onSessionExpired: (() => void) | null = null;

/** Refresh başarısız olduğunda (süresi dolmuş/iptal edilmiş oturum) çağrılır; AuthProvider kaydeder. */
export function setSessionExpiredHandler(fn: () => void): () => void {
  onSessionExpired = fn;
  return () => {
    if (onSessionExpired === fn) onSessionExpired = null;
  };
}

/**
 * GET in-flight dedupe: aynı path'e eşzamanlı çağrılar (ev ekranı + bildirim
 * zili + liste gibi) tek ağ isteğini paylaşır. Anahtar yalnız path'tir —
 * cihazda aynı anda tek kullanıcı oturumu vardır; oturum sınırında
 * (`endLocalSession`) harita temizlenir, eski kullanıcının yanıtı yeni
 * kullanıcıya ASLA sızmaz. Arayan `signal` verirse (iptal edilebilir arama)
 * paylaşılmaz — özel istek açılır.
 */
const inFlightGet = new Map<string, Promise<ApiResult<unknown>>>();

export async function endLocalSession(): Promise<void> {
  sessionEpoch += 1;
  inFlightGet.clear();
  await clearTokens();
}

/** Sunucu oturumunu (sid) kapatır — en iyi çaba; ağ yoksa yerel çıkış yine de tamamdır. */
export async function revokeServerSession(refreshToken: string): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // yerel çıkış zaten yapıldı; refresh token'ın süresi dolunca sunucu oturumu da düşer
  }
}

/** Bu auth uçlarında 401 "oturum bitti" değil, işlemin kendi sonucudur → refresh denenmez. */
const NO_REFRESH_PATH = /^\/api\/v1\/auth\/(login|refresh|logout|forgot-password|reset-password)\b/;

let refreshInFlight: Promise<boolean> | null = null;

/** Web tarafı HttpOnly çerez kullanır; mobil HİÇBİR çerez mekanizmasına güvenmez — her istek Bearer token taşır. */
async function authorizedFetch(
  path: string,
  init: RequestInit = {},
  retry = true,
  callerSignal?: AbortSignal
): Promise<Response> {
  const accessToken = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const res = await fetchWithTimeout(`${API_BASE_URL}${path}`, { ...init, headers }, callerSignal);

  if (res.status === 401 && retry && !NO_REFRESH_PATH.test(path)) {
    if (await refreshAccessToken()) return authorizedFetch(path, init, false, callerSignal);
    await endLocalSession();
    onSessionExpired?.();
  }
  return res;
}

/** Deneme başına merkezi timeout; arayan sinyali de iç zamanlayıcıyla birleşir. */
async function fetchWithTimeout(url: string, init: RequestInit, callerSignal?: AbortSignal): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
  const onCallerAbort = () => ctrl.abort();
  if (callerSignal) {
    if (callerSignal.aborted) {
      clearTimeout(timer);
      throw callerSignal.reason instanceof Error ? callerSignal.reason : new Error("aborted");
    }
    callerSignal.addEventListener("abort", onCallerAbort, { once: true });
  }
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", onCallerAbort);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    const epoch = sessionEpoch;
    refreshInFlight = (async () => {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) return false;
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return false;
        const json = (await res.json()) as { ok: boolean; data?: { accessToken: string; refreshToken: string } };
        if (!json.ok || !json.data) return false;
        if (epoch !== sessionEpoch) return false;
        await setTokens(json.data.accessToken, json.data.refreshToken);
        return true;
      } catch (err) {
        if (__DEV__) console.warn(`[Nevii Hub API] refresh isteği ${hostOf(API_BASE_URL)} adresine ulaşamadı:`, err instanceof Error ? err.message : err);
        return false;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function request<T>(
  path: string,
  init: RequestInit,
  opts: { retryable: boolean; signal?: AbortSignal }
): Promise<ApiResult<T>> {
  const url = `${API_BASE_URL}${path}`;
  const signal = opts.signal;
  let attempt = 0;
  for (;;) {
    if (signal?.aborted) return networkErrorResult<T>(url, signal.reason ?? new Error("aborted"));
    try {
      const res = await authorizedFetch(path, init, true, signal);
      if (opts.retryable && isRetryableOutcome({ kind: "http", status: res.status }) && attempt < MAX_GET_RETRIES) {
        attempt += 1;
        await sleep(retryDelayMs(attempt - 1));
        continue;
      }
      return await parseApiResponse<T>(res, url);
    } catch (err) {
      // Arayan iptal ettiyse (arama değişti / ekran kapandı): retry YOK.
      if (signal?.aborted) return networkErrorResult<T>(url, err);
      if (opts.retryable && isRetryableOutcome({ kind: "network-error" }) && attempt < MAX_GET_RETRIES) {
        attempt += 1;
        await sleep(retryDelayMs(attempt - 1));
        continue;
      }
      return networkErrorResult<T>(url, err);
    }
  }
}

export type ApiGetOptions = {
  /**
   * İptal sinyali (yalnız arama gibi terk-edilebilir isteklerde): verilirse
   * istek in-flight dedupe'a KATILMAZ — özel istek açılır ve sinyal ile
   * gerçekten iptal edilir. Verilmezse aynı path paylaşılır.
   */
  signal?: AbortSignal;
};

export function apiGet<T>(path: string, opts: ApiGetOptions = {}): Promise<ApiResult<T>> {
  if (opts.signal) return request<T>(path, { method: "GET" }, { retryable: true, signal: opts.signal });
  const key = path;
  const shared = inFlightGet.get(key);
  if (shared) return shared as Promise<ApiResult<T>>;
  const started: Promise<ApiResult<T>> = request<T>(path, { method: "GET" }, { retryable: true });
  const tracked = started.then(
    (res) => {
      if (inFlightGet.get(key) === tracked) inFlightGet.delete(key);
      return res;
    },
    (err: unknown) => {
      if (inFlightGet.get(key) === tracked) inFlightGet.delete(key);
      throw err;
    }
  ) as Promise<ApiResult<unknown>>;
  inFlightGet.set(key, tracked);
  return tracked as Promise<ApiResult<T>>;
}

export function apiPost<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  return request<T>(
    path,
    { method: "POST", body: body ? JSON.stringify(body) : undefined },
    { retryable: false }
  );
}

export function apiDelete<T>(path: string): Promise<ApiResult<T>> {
  return request<T>(path, { method: "DELETE" }, { retryable: false });
}

export function apiPatch<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  return request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }, { retryable: false });
}

export { API_BASE_URL };
