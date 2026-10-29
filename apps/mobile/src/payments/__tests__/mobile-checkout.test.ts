import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
});

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("../../auth/token-storage", () => ({
  getAccessToken: async () => null,
  getRefreshToken: async () => null,
  setTokens: async () => undefined,
  clearTokens: async () => undefined,
  getStoredEmail: async () => null,
  setStoredEmail: async () => undefined,
  clearStoredEmail: async () => undefined,
}));

import { checkoutEndpoint, startOnlineCheckout } from "../mobile-checkout";
import type { ApiResult } from "../../api/client";
import type { PaymentCheckoutResponse } from "../../types/api";

const browser = () => ({ canOpen: async () => true, open: async () => undefined });

function post(result: ApiResult<PaymentCheckoutResponse>) {
  return vi.fn(async () => result);
}

describe("mobil online ödeme", () => {
  it("uç yolu paymentId'yi kodlar", () => {
    expect(checkoutEndpoint("a/b")).toBe("/api/v1/mobile/payments/a%2Fb/checkout");
  });

  it("başarıda https URL'ini tarayıcıda açar", async () => {
    const open = vi.fn(async () => undefined);
    const result = await startOnlineCheckout(
      "p1",
      { canOpen: async () => true, open },
      post({ ok: true, data: { checkoutUrl: "https://provider.test/pay/x" } })
    );
    expect(result).toEqual({ status: "ready", checkoutUrl: "https://provider.test/pay/x" });
    expect(open).toHaveBeenCalledOnce();
  });

  it("CONFLICT → dürüst 'henüz aktif değil' (sahte başarı YOK, tarayıcı AÇILMAZ)", async () => {
    const open = vi.fn(async () => undefined);
    const result = await startOnlineCheckout(
      "p1",
      { canOpen: async () => true, open },
      post({ ok: false, error: { code: "CONFLICT", message: "sağlayıcı yok" } })
    );
    expect(result.status).toBe("unavailable");
    expect(open).not.toHaveBeenCalled();
  });

  it("https olmayan URL ve açılamayan tarayıcıda hata (kart verisi ASLA uygulamaya girmez)", async () => {
    const open = vi.fn(async () => undefined);
    const bad = await startOnlineCheckout("p1", browser(), post({ ok: true, data: { checkoutUrl: "javascript:alert(1)" } }));
    expect(bad.status).toBe("error");
    const noBrowser = await startOnlineCheckout(
      "p1",
      { canOpen: async () => false, open },
      post({ ok: true, data: { checkoutUrl: "https://provider.test/pay/x" } })
    );
    expect(noBrowser.status).toBe("error");
    expect(open).not.toHaveBeenCalled();
  });

  it("sunucu/ağ hatası olduğu gibi taşınır", async () => {
    const result = await startOnlineCheckout(
      "p1",
      browser(),
      post({ ok: false, error: { code: "FORBIDDEN", message: "yetki yok" } })
    );
    expect(result).toEqual({ status: "error", message: "yetki yok" });
  });
});
