"use client";

/** Refresh a browser session once after an expired access cookie, then retry. */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshBrowserSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch("/api/v1/auth/refresh", {
      method: "POST",
      credentials: "include",
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export type ApiFetchOptions = RequestInit & {
  retryOnUnauthorized?: boolean;
};

export async function apiFetch(
  input: RequestInfo | URL,
  init: ApiFetchOptions = {}
): Promise<Response> {
  const { retryOnUnauthorized = true, credentials = "include", ...requestInit } = init;
  const response = await fetch(input, { ...requestInit, credentials });

  if (!retryOnUnauthorized || response.status !== 401) {
    return response;
  }

  if (!(await refreshBrowserSession())) {
    return response;
  }

  return fetch(input, { ...requestInit, credentials });
}

export type ApiFetchJsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

/**
 * Faz 2 güvenlik/kalite taraması — `apiFetch` + güvenli JSON ayrıştırmayı TEK
 * yerde birleştirir. `res.json()`'ı try/catch'siz çağıran birkaç panel
 * bileşeninde gerçek bir kök neden bulundu: ağ hatası veya sunucudan JSON
 * OLMAYAN bir gövde (framework/proxy seviyesi HTML hata sayfası, 504 gateway
 * timeout vb.) geldiğinde `res.json()` fırlatıyor, hiçbir catch yakalamadığı
 * için hem kullanıcıya HİÇBİR mesaj gösterilmiyor hem de `busy`/loading
 * durumu asla sıfırlanmayıp buton kalıcı olarak kilitli kalıyordu (bkz.
 * `periodic-assessment-pending-list.tsx`'in eski `submit()`'i). Bu yardımcı
 * her iki hata sınıfını da (ağ + ayrıştırma) yakalayıp mevcut sunucu
 * `ServiceResult` (ok/error) deseniyle TUTARLI, normalize edilmiş bir sonuç
 * döner — çağıran ASLA bir throw ile karşılaşmaz, her zaman `result.ok` ile
 * dallanabilir.
 */
export async function apiFetchJson<T = unknown>(
  input: RequestInfo | URL,
  init: ApiFetchOptions = {}
): Promise<ApiFetchJsonResult<T>> {
  let response: Response;
  try {
    response = await apiFetch(input, init);
  } catch {
    return {
      ok: false,
      error: { code: "NETWORK_ERROR", message: "Bağlantı hatası — lütfen tekrar deneyin." },
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      ok: false,
      error: {
        code: "INVALID_RESPONSE",
        message: response.ok
          ? "Sunucudan beklenmeyen bir yanıt geldi."
          : `Sunucu hatası (${response.status}). Lütfen tekrar deneyin.`,
      },
    };
  }

  if (body && typeof body === "object" && "ok" in body) {
    return body as ApiFetchJsonResult<T>;
  }
  return {
    ok: false,
    error: { code: "INVALID_RESPONSE", message: "Sunucudan beklenmeyen bir yanıt geldi." },
  };
}
