import { describe, it, expect } from "vitest";
import { getPaymentProvider } from "../payment-provider/provider-factory";
import { isPaymentProviderConfigured } from "../payment-provider/config";

describe("payment-provider altyapı iskeleti", () => {
  it("gerçek sağlayıcı yapılandırılmamışken console provider fail-closed döner", async () => {
    expect(isPaymentProviderConfigured()).toBe(false);
    const provider = getPaymentProvider();
    expect(provider.name).toBe("console");
    expect(provider.isConfigured()).toBe(false);

    const checkout = await provider.createCheckout({
      tenantId: "t1",
      paymentId: "p1",
      amount: 10000,
      currency: "TRY",
      description: "test",
      successUrl: "https://example.com/ok",
      cancelUrl: "https://example.com/cancel",
      idempotencyKey: "p1",
      buyer: {
        id: "s1",
        name: "Test",
        surname: "Öğrenci",
        email: "test@example.com",
        phone: "05551112233",
        ip: "127.0.0.1",
        addressLine: "-",
        city: "İstanbul",
        country: "Turkey",
      },
    });
    expect(checkout.ok).toBe(false);
    if (!checkout.ok) expect(checkout.errorCode).toBe("NOT_CONFIGURED");
  });

  it("imzasız/sağlayıcısız webhook asla başarılı doğrulanmaz", async () => {
    const provider = getPaymentProvider();
    const result = await provider.verifyWebhook({ rawBody: "{}", signatureHeader: null });
    expect(result.ok).toBe(false);
  });
});
