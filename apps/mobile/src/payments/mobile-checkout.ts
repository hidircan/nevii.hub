import { apiPost, type ApiResult } from "../api/client";
import type { PaymentCheckoutResponse } from "../types/api";

/**
 * Mobil online ödeme — hosted checkout, sistem tarayıcısı.
 *
 * Kart/CVV ASLA uygulamaya girmez: sunucu
 * (`POST /api/v1/mobile/payments/:id/checkout`) sağlayıcının checkout
 * URL'ini döner, uygulama onu sistem tarayıcısında açar. Ödeme sonucu
 * `neviihub://payment-result` deep-link'iyle uygulamaya döner; "paid"
 * durumuna geçiş SADECE doğrulanmış webhook ile olur — bu ekran sonucu
 * KANIT saymaz, yalnızca bakiyeyi tazeler.
 */

export type CheckoutStart =
  | { status: "ready"; checkoutUrl: string }
  | { status: "unavailable"; message: string }
  | { status: "error"; message: string };

export type BrowserDeps = {
  canOpen: (url: string) => Promise<boolean>;
  open: (url: string) => Promise<void>;
};

export function checkoutEndpoint(paymentId: string): string {
  return `/api/v1/mobile/payments/${encodeURIComponent(paymentId)}/checkout`;
}

export async function startOnlineCheckout(
  paymentId: string,
  browser: BrowserDeps,
  post: (path: string, body?: unknown) => Promise<ApiResult<PaymentCheckoutResponse>> = apiPost
): Promise<CheckoutStart> {
  const res = await post(checkoutEndpoint(paymentId), {});
  if (!res.ok) {
    // Sağlayıcı bağlı değil → dürüst "henüz aktif değil" (sahte başarı YOK).
    if (res.error.code === "CONFLICT") {
      return { status: "unavailable", message: "Online ödeme henüz aktif değil. Lütfen kurumunuzla iletişime geçin." };
    }
    return { status: "error", message: res.error.message };
  }
  const url = res.data.checkoutUrl;
  if (typeof url !== "string" || !/^https:\/\//.test(url)) {
    return { status: "error", message: "Ödeme sayfası açılamadı. Lütfen tekrar deneyin." };
  }
  try {
    if (!(await browser.canOpen(url))) {
      return { status: "error", message: "Tarayıcı açılamadı. Lütfen tekrar deneyin." };
    }
    await browser.open(url);
    return { status: "ready", checkoutUrl: url };
  } catch {
    return { status: "error", message: "Tarayıcı açılamadı. Lütfen tekrar deneyin." };
  }
}
