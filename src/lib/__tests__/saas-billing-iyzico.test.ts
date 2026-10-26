import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";
import {
  isIyzicoSubConfigured,
  iyzicoSubscriptionWebhookSignature,
  verifyIyzicoSubWebhook,
} from "../saas-billing/iyzico-subscription";
import {
  getSaasBillingProvider,
  getSaasProviderName,
} from "../saas-billing/provider-adapter";

const SECRET = "s3cr3t";
const MERCHANT = "m123";

describe("iyzico abonelik imza + adapter", () => {
  beforeEach(() => {
    delete process.env.IYZICO_API_KEY;
    delete process.env.IYZICO_SECRET_KEY;
    delete process.env.IYZICO_MERCHANT_ID;
    delete process.env.SAAS_BILLING_PROVIDER;
  });
  afterEach(() => {
    delete process.env.IYZICO_API_KEY;
    delete process.env.IYZICO_SECRET_KEY;
    delete process.env.IYZICO_MERCHANT_ID;
    delete process.env.SAAS_BILLING_PROVIDER;
  });

  it("abonelik imza formülü resmi dokümanla eşleşir", () => {
    // key = merchantId + secretKey + eventType + subRef + orderRef + customerRef
    const fields = {
      merchantId: MERCHANT,
      eventType: "subscription.order.success",
      subscriptionReferenceCode: "sub",
      orderReferenceCode: "ord",
      customerReferenceCode: "cus",
    };
    const expected = createHmac("sha256", SECRET)
      .update(MERCHANT + SECRET + fields.eventType + "sub" + "ord" + "cus", "utf8")
      .digest("hex");
    expect(iyzicoSubscriptionWebhookSignature(SECRET, fields)).toBe(expected);
  });

  it("verifyIyzicoSubWebhook imzalı gövdeyi kabul, sahteyi reddeder", () => {
    process.env.IYZICO_SECRET_KEY = SECRET;
    process.env.IYZICO_MERCHANT_ID = MERCHANT;
    const rawBody = JSON.stringify({
      orderReferenceCode: "ord",
      customerReferenceCode: "cus",
      subscriptionReferenceCode: "sub",
      iyziReferenceCode: "iyzi",
      iyziEventType: "subscription.order.success",
      iyziEventTime: 1758704403161,
    });
    const sig = iyzicoSubscriptionWebhookSignature(SECRET, {
      merchantId: MERCHANT,
      eventType: "subscription.order.success",
      subscriptionReferenceCode: "sub",
      orderReferenceCode: "ord",
      customerReferenceCode: "cus",
    });
    const good = verifyIyzicoSubWebhook({ rawBody, signatureHeader: sig });
    expect(good.ok).toBe(true);
    const bad = verifyIyzicoSubWebhook({ rawBody, signatureHeader: "0".repeat(64) });
    expect(bad.ok).toBe(false);
  });

  it("yapılandırma yoksa fail-closed: none provider", () => {
    expect(isIyzicoSubConfigured()).toBe(false);
    expect(getSaasProviderName()).toBe("none");
    expect(getSaasBillingProvider().isConfigured()).toBe(false);
  });

  it("mock provider sonuçlarını mock diye etiketler", async () => {
    process.env.SAAS_BILLING_PROVIDER = "mock";
    const p = getSaasBillingProvider();
    expect(p.name).toBe("mock");
    const init = await p.initializeCheckout({
      tenantId: "t", planKey: "core", billingInterval: "monthly", amountMinor: 100,
      callbackUrl: "http://localhost/cb", idempotencyKey: "k1",
      customer: { name: "A", surname: "B", email: "a@b.c", gsmNumber: "1", identityNumber: "1", address: "a", city: "c", country: "TR" },
    });
    expect(init.ok).toBe(true);
    if (!init.ok) return;
    expect(init.mock).toBe(true);
    const ret = await p.retrieveCheckoutResult(init.providerReference);
    expect(ret.ok).toBe(true);
    if (!ret.ok) return;
    expect(ret.mock).toBe(true);
  });
});
