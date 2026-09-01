import { Platform } from "react-native";
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from "../auth/token-storage";

/**
 * EXPO_PUBLIC_API_URL — iOS Simulator'da localhost çalışır (aynı Mac).
 * Fiziksel cihaz veya Android Emulator'de Mac'in LAN IP'si gerekir (bkz. README/.env.example).
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

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * fetch() ATMADI ama yanıt beklenen `{ok,...}` JSON'u değil (ör. bir 404/500 HTML
 * hata sayfası — route hiç yok veya yanlış sunucuya bağlanılmış demektir).
 * Dev modunda status kodu ve hedef URL console'a yazılır (asla token/secret).
 */
function unexpectedResponseResult(url: string, status: number): { ok: false; error: { code: string; message: string } } {
  if (__DEV__) {
    console.warn(`[Nevii Hub API] ${url} → HTTP ${status} ama beklenen JSON gövdesi değil (route yok mu / yanlış sunucu mu?).`);
    return {
      ok: false,
      error: {
        code: "UNEXPECTED_RESPONSE",
        message: `Sunucudan beklenmeyen yanıt (HTTP ${status}, ${hostOf(url)}). Bu adreste doğru backend/route çalışıyor mu kontrol edin.`,
      },
    };
  }
  return { ok: false, error: { code: "UNEXPECTED_RESPONSE", message: "Sunucudan beklenmeyen bir yanıt alındı." } };
}

/**
 * fetch() bağlantı seviyesinde başarısız oldu (DNS/timeout/connection refused —
 * sunucuya hiç ulaşılamadı). Dev modunda hedef host/port ve gerçek fetch hatası
 * console'a yazılır (asla token/secret); production'da yalnız genel mesaj gösterilir.
 */
function networkErrorResult(url: string, err: unknown): { ok: false; error: { code: string; message: string } } {
  const detail = err instanceof Error ? err.message : String(err);

  if (__DEV__) {
    console.warn(`[Nevii Hub API] ${url} adresine ulaşılamadı: ${detail}`);
    return {
      ok: false,
      error: {
        code: "NETWORK_ERROR",
        message: `Sunucuya ulaşılamadı (${hostOf(url)}). Backend çalışıyor mu ve EXPO_PUBLIC_API_URL doğru mu kontrol edin.`,
      },
    };
  }

  return { ok: false, error: { code: "NETWORK_ERROR", message: "Sunucuya ulaşılamadı." } };
}

/** fetch() başarılıysa yanıtı `{ok,...}` JSON olarak çözer; ayrıştırma hatasını bağlantı hatasından ayırır. */
async function parseApiResponse<T>(res: Response, url: string): Promise<ApiResult<T>> {
  try {
    return (await res.json()) as ApiResult<T>;
  } catch {
    return unexpectedResponseResult(url, res.status);
  }
}

let refreshInFlight: Promise<boolean> | null = null;

/** Web tarafı HttpOnly çerez kullanır; mobil HİÇBİR çerez mekanizmasına güvenmez — her istek Bearer token taşır. */
async function authorizedFetch(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const accessToken = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  if (res.status === 401 && retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return authorizedFetch(path, init, false);
    await clearTokens();
  }
  return res;
}

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
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
        await setTokens(json.data.accessToken, json.data.refreshToken);
        return true;
      } catch (err) {
        if (__DEV__) console.warn(`[Nevii Hub API] refresh isteği ${API_BASE_URL} adresine ulaşamadı:`, err);
        return false;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  const url = `${API_BASE_URL}${path}`;
  try {
    const res = await authorizedFetch(path, { method: "GET" });
    return await parseApiResponse<T>(res, url);
  } catch (err) {
    return networkErrorResult(url, err);
  }
}

export async function apiPost<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  const url = `${API_BASE_URL}${path}`;
  try {
    const res = await authorizedFetch(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
    return await parseApiResponse<T>(res, url);
  } catch (err) {
    return networkErrorResult(url, err);
  }
}

export async function apiDelete<T>(path: string): Promise<ApiResult<T>> {
  const url = `${API_BASE_URL}${path}`;
  try {
    const res = await authorizedFetch(path, { method: "DELETE" });
    return await parseApiResponse<T>(res, url);
  } catch (err) {
    return networkErrorResult(url, err);
  }
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  const url = `${API_BASE_URL}${path}`;
  try {
    const res = await authorizedFetch(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined });
    return await parseApiResponse<T>(res, url);
  } catch (err) {
    return networkErrorResult(url, err);
  }
}

export { API_BASE_URL };
