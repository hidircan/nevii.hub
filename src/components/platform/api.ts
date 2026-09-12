/** NeviiOS istemci yardımcıları — tek fetch sarmalayıcı (cookie + JSON + ServiceResult). */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code?: string; message: string; details?: Record<string, unknown> } };

export async function callApi<T>(url: string, method: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return (await res.json()) as ApiResult<T>;
  } catch {
    return { ok: false, error: { message: "Ağ hatası" } };
  }
}
