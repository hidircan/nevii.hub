import type { ApiResult } from "../api/errors";

/**
 * Oturum doğrulama sonucu → auth durumu. Yalnız 401 çıkış yaptırır; ağ/5xx/403
 * hatası "error"dur (token'lar korunur, kullanıcı "Tekrar dene" görür) — soğuk
 * açılışta bağlantı yokken sessiz çıkış YOK.
 */
export function sessionStatusFor(res: ApiResult<unknown>): "signedIn" | "signedOut" | "error" {
  if (res.ok) return "signedIn";
  return res.error.code === "UNAUTHORIZED" ? "signedOut" : "error";
}
