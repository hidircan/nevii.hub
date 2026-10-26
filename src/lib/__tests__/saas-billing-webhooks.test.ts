import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";
import { resetPlatformStoreForTests } from "../platform/store";
import {
  __resetSaasBillingStoreForTests,
  getSaasSubscription,
  listSaasAttempts,
  upsertSaasSubscription,
} from "../saas-billing/store";
import { buildPendingSubscription } from "../saas-billing/subscriptions";
import { processIyzicoSubscriptionWebhook } from "../saas-billing/webhooks";
import { renewalNoteFor } from "../saas-billing/catalog";

const T1 = "tenant_wh_1";
const SECRET = "test_secret_key_123";
const MERCHANT = "test_merchant_1";

function sign(fields: { eventType: string; sub: string; order: string; customer: string }): string {
  const key = MERCHANT + SECRET + fields.eventType + fields.sub + fields.order + fields.customer;
  return createHmac("sha256", SECRET).update(key, "utf8").digest("hex");
}

function body(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    orderReferenceCode: "ord_1",
    customerReferenceCode: "cus_1",
    subscriptionReferenceCode: "sub_1",
    iyziReferenceCode: "iyzi_1",
    iyziEventType: "subscription.order.success",
    iyziEventTime: Date.parse("2026-02-01T00:00:00.000Z"),
    ...over,
  });
}

beforeEach(async () => {
  await resetPlatformStoreForTests();
  await __resetSaasBillingStoreForTests();
  process.env.IYZICO_SECRET_KEY = SECRET;
  process.env.IYZICO_MERCHANT_ID = MERCHANT;
  await upsertSaasSubscription({
    ...buildPendingSubscription({
      tenantId: T1, planKey: "core", catalogVersion: null, billingInterval: "monthly",
      priceSnapshot: {
        planKey: "core", planLabel: "Core", catalogVersion: null, billingInterval: "monthly",
        currency: "TRY", amountMinor: 50000, monthlyEquivalentMinor: null,
        campaignCode: null, campaignNote: null, postCampaignNote: null,
        limits: { students: 1, users: 1, branches: 1 }, includedModules: [],
        taxNote: "t", renewalNote: renewalNoteFor("monthly"),
        acceptedAt: "2026-01-01T00:00:00.000Z", acceptedBy: "u", sandbox: true,
      },
    }),
    providerSubscriptionRef: "sub_1",
  });
});

afterEach(() => {
  delete process.env.IYZICO_SECRET_KEY;
  delete process.env.IYZICO_MERCHANT_ID;
});

describe("saas webhook inbox", () => {
  it("imzalı success olayı active'e geçirir ve dönem yazar", async () => {
    const rawBody = body();
    const res = await processIyzicoSubscriptionWebhook({
      rawBody,
      signatureHeader: sign({ eventType: "subscription.order.success", sub: "sub_1", order: "ord_1", customer: "cus_1" }),
      resolveTenant: async (ref) => (ref === "sub_1" ? T1 : null),
      nowIso: "2026-02-01T00:00:00.000Z",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.outcome).toBe("processed");
    const sub = await getSaasSubscription(T1);
    expect(sub?.status).toBe("active");
    const attempts = await listSaasAttempts(sub!.id, 10);
    expect(attempts.filter((a) => a.status === "succeeded")).toHaveLength(1);
  });

  it("yinelenen teslimat ikinci ödeme/hak üretmez", async () => {
    const rawBody = body();
    const sig = sign({ eventType: "subscription.order.success", sub: "sub_1", order: "ord_1", customer: "cus_1" });
    const run = () =>
      processIyzicoSubscriptionWebhook({
        rawBody, signatureHeader: sig,
        resolveTenant: async () => T1, nowIso: "2026-02-01T00:00:00.000Z",
      });
    const a = await run();
    const b = await run();
    expect(a.ok && a.data.outcome).toBe("processed");
    expect(b.ok && b.data.outcome).toBe("duplicate");
    const sub = await getSaasSubscription(T1);
    const attempts = await listSaasAttempts(sub!.id, 10);
    expect(attempts.filter((a2) => a2.status === "succeeded")).toHaveLength(1);
  });

  it("sahte/eksik imza reddedilir, durum değişmez", async () => {
    const res = await processIyzicoSubscriptionWebhook({
      rawBody: body(),
      signatureHeader: "deadbeef",
      resolveTenant: async () => T1,
      nowIso: "2026-02-01T00:00:00.000Z",
    });
    expect(res.ok).toBe(false);
    const sub = await getSaasSubscription(T1);
    expect(sub?.status).toBe("pending");
  });

  it("failure olayı past_due yapar", async () => {
    const rawBody = body({ iyziEventType: "subscription.order.failure", iyziReferenceCode: "iyzi_f" });
    const res = await processIyzicoSubscriptionWebhook({
      rawBody,
      signatureHeader: sign({ eventType: "subscription.order.failure", sub: "sub_1", order: "ord_1", customer: "cus_1" }),
      resolveTenant: async () => T1,
      nowIso: "2026-02-01T00:00:00.000Z",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.outcome).toBe("processed");
    const sub = await getSaasSubscription(T1);
    expect(sub?.status).toBe("past_due");
  });

  it("gecikmiş failure olayı ileri durumu geri döndürmez", async () => {
    await upsertSaasSubscription({
      ...(await getSaasSubscription(T1))!,
      status: "active",
      paidThrough: "2026-04-01T00:00:00.000Z",
      lastWebhookAt: "2026-03-01T00:00:00.000Z",
    });
    const rawBody = body({
      iyziEventType: "subscription.order.failure",
      iyziReferenceCode: "iyzi_stale",
      iyziEventTime: Date.parse("2026-01-15T00:00:00.000Z"),
    });
    const res = await processIyzicoSubscriptionWebhook({
      rawBody,
      signatureHeader: sign({ eventType: "subscription.order.failure", sub: "sub_1", order: "ord_1", customer: "cus_1" }),
      resolveTenant: async () => T1,
      nowIso: "2026-03-02T00:00:00.000Z",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.outcome).toBe("ignored");
    const sub = await getSaasSubscription(T1);
    expect(sub?.status).toBe("active");
  });

  it("bilinmeyen abonelik referansı etkisizdir", async () => {
    const res = await processIyzicoSubscriptionWebhook({
      rawBody: body(),
      signatureHeader: sign({ eventType: "subscription.order.success", sub: "sub_1", order: "ord_1", customer: "cus_1" }),
      resolveTenant: async () => null,
      nowIso: "2026-02-01T00:00:00.000Z",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.outcome).toBe("failed");
  });
});
