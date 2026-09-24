import { Platform } from "react-native";
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "../auth/token-storage";
import { NETWORK_ERROR, toApiResult, type ApiResult } from "./errors";

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
  if (__DEV__) {
    console.warn(`[Nevii Hub API] ${url} adresine ulaşılamadı: ${err instanceof Error ? err.message : String(err)}`);
    return {
      ok: false,
      error: {
        ...NETWORK_ERROR,
        message: `Sunucuya ulaşılamadı (${hostOf(url)}). Backend çalışıyor mu ve EXPO_PUBLIC_API_URL doğru mu kontrol edin.`,
      },
    };
  }
  return { ok: false, error: NETWORK_ERROR };
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
/** "taken_over": oturum başka cihazdan devralındı (tek aktif oturum kuralı) — kullanıcıya açıkça söylenir. */
export type SessionEndReason = "expired" | "taken_over";
let onSessionExpired: ((reason: SessionEndReason) => void) | null = null;

/** Refresh başarısız olduğunda (süresi dolmuş/iptal edilmiş oturum) çağrılır; AuthProvider kaydeder. */
export function setSessionExpiredHandler(fn: (reason: SessionEndReason) => void): () => void {
  onSessionExpired = fn;
  return () => {
    if (onSessionExpired === fn) onSessionExpired = null;
  };
}

export async function endLocalSession(): Promise<void> {
  sessionEpoch += 1;
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
async function authorizedFetch(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const accessToken = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  if (res.status === 401 && retry && !NO_REFRESH_PATH.test(path)) {
    if (await refreshAccessToken()) return authorizedFetch(path, init, false);
    const reason = await resolveSessionEndReason();
    await endLocalSession();
    onSessionExpired?.(reason);
  }
  return res;
}

/** Refresh reddedildiğinde nedenini sorar (token'lar henüz silinmeden); belirsizse "expired". */
async function resolveSessionEndReason(): Promise<SessionEndReason> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return "expired";
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/auth/session-status`, {
      headers: { Authorization: `Bearer ${refreshToken}` },
    });
    const json = (await res.json()) as { data?: { state?: string } };
    return json.data?.state === "taken_over" ? "taken_over" : "expired";
  } catch {
    return "expired";
  }
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

async function request<T>(path: string, init: RequestInit): Promise<ApiResult<T>> {
  const url = `${API_BASE_URL}${path}`;
  try {
    const res = await authorizedFetch(path, init);
    return await parseApiResponse<T>(res, url);
  } catch (err) {
    return networkErrorResult<T>(url, err);
  }
}

export function apiGet<T>(path: string): Promise<ApiResult<T>> {
  return request<T>(path, { method: "GET" });
}

export function apiPost<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  return request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
}

export function apiDelete<T>(path: string): Promise<ApiResult<T>> {
  return request<T>(path, { method: "DELETE" });
}

export function apiPatch<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  return request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined });
}

export { API_BASE_URL };
