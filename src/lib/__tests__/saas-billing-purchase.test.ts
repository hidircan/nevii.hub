import { describe, it, expect, beforeEach } from "vitest";
import { resetPlatformStoreForTests } from "../platform/store";
import {
  __resetSaasBillingStoreForTests,
  getSaasPurchaseRequest,
  listSaasAttempts,
} from "../saas-billing/store";
import { submitPurchaseRequest, decidePurchaseRequest } from "../saas-billing/purchase";
import { createPilotCampaign } from "../saas-billing/campaigns";
import { approveManualPayment } from "../saas-billing/manual";
import { __resetTrialRateLimitForTests, startTrial } from "../saas-billing/trial";
import { getBillingOverview } from "../saas-billing/overview";

beforeEach(async () => {
  await resetPlatformStoreForTests();
  await __resetSaasBillingStoreForTests();
  __resetTrialRateLimitForTests();
});

const base = {
  planKey: "core",
  interval: "monthly" as const,
  institutionName: "Test Koleji",
  ownerName: "Test Sahibi",
  ownerEmail: "sahip@testkoleji.com",
};

describe("satın alma başvurusu (checkout hesap adımı)", () => {
  it("geçerli başvuruyu pending olarak kaydeder, seçimi korur", async () => {
    const r = await submitPurchaseRequest({ input: base });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.status).toBe("pending");
    expect(r.data.planKey).toBe("core");
    expect(r.data.interval).toBe("monthly");
    expect(r.data.tenantId).toBeNull();
    const stored = await getSaasPurchaseRequest(r.data.id);
    expect(stored?.ownerEmail).toBe("sahip@testkoleji.com");
  });

  it("yayında olmayan plan reddedilir", async () => {
    const r = await submitPurchaseRequest({ input: { ...base, planKey: "yok-boyle-plan" } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("NOT_FOUND");
  });

  it("aynı e-postayla ikinci bekleyen başvuru engellenir; ret sonrası yeniden başvurulabilir", async () => {
    const first = await submitPurchaseRequest({ input: base });
    expect(first.ok).toBe(true);
    const dup = await submitPurchaseRequest({ input: base });
    expect(dup.ok).toBe(false);
    if (!first.ok) return;
    const rej = await decidePurchaseRequest({ requestId: first.data.id, approve: false, decidedBy: "u_admin" });
    expect(rej.ok).toBe(true);
    const again = await submitPurchaseRequest({ input: base });
    expect(again.ok).toBe(true);
  });

  it("onay/red kararı ve çift karar koruması", async () => {
    const r = await submitPurchaseRequest({ input: base });
    if (!r.ok) return;
    const okRes = await decidePurchaseRequest({ requestId: r.data.id, approve: true, tenantId: "t_new", decidedBy: "u_admin" });
    expect(okRes.ok).toBe(true);
    if (!okRes.ok) return;
    expect(okRes.data.status).toBe("approved");
    expect(okRes.data.tenantId).toBe("t_new");
    const twice = await decidePurchaseRequest({ requestId: r.data.id, approve: true, decidedBy: "u_admin" });
    expect(twice.ok).toBe(false);
  });

  it("başvurular billing özetine düşer", async () => {
    await submitPurchaseRequest({ input: base });
    const ov = await getBillingOverview();
    expect(ov.purchaseRequests.length).toBe(1);
    expect(ov.purchaseRequests[0]?.planKey).toBe("core");
  });
});

describe("TL girişi sunucu dönüşümü", () => {
  it("kampanya sabit tutarı TL'den kuruşa çevrilir", async () => {
    const r = await createPilotCampaign({
      input: {
        name: "TL kampanya", tenantId: "t_new", discountType: "fixed_minor",
        amountTl: "250", intervalScope: "both", postCampaignNote: "Sonrası liste fiyatı uygulanır.",
      },
      createdBy: "u_admin",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.amountMinor).toBe(25000);
  });

  it("kampanyada virgüllü TL yuvarlanır; çift tutar reddedilir", async () => {
    const r = await createPilotCampaign({
      input: {
        name: "Virgül", tenantId: "t_new", discountType: "fixed_minor",
        amountTl: "99,99", intervalScope: "both", postCampaignNote: "Sonrası liste fiyatı uygulanır.",
      },
      createdBy: "u_admin",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.amountMinor).toBe(9999);
    const both = await createPilotCampaign({
      input: {
        name: "Çift", tenantId: "t_new", discountType: "fixed_minor",
        amountMinor: 100, amountTl: "1", intervalScope: "both", postCampaignNote: "Sonrası liste fiyatı uygulanır.",
      },
      createdBy: "u_admin",
    });
    expect(both.ok).toBe(false);
  });

  it("manuel ödeme TL girişiyle onaylanır", async () => {
    const { buildPendingSubscription } = await import("../saas-billing/subscriptions");
    const { upsertSaasSubscription, getSaasSubscription } = await import("../saas-billing/store");
    await upsertSaasSubscription(
      buildPendingSubscription({
        tenantId: "t_man", provider: "paytr", planKey: "core", catalogVersion: null,
        billingInterval: "monthly",
        priceSnapshot: {
          planKey: "core", planLabel: "Core", catalogVersion: null, billingInterval: "monthly",
          currency: "TRY", amountMinor: 123456, monthlyEquivalentMinor: null,
          campaignCode: null, campaignNote: null, postCampaignNote: null,
          limits: { students: 1, users: 1, branches: 1 }, includedModules: [],
          taxNote: "t", renewalNote: "r", acceptedAt: "2026-01-01T00:00:00.000Z",
          acceptedBy: "u", sandbox: true,
        },
      })
    );
    const r = await approveManualPayment({
      input: {
        tenantId: "t_man", providerRef: "dekont-1", amountTl: "1234,56",
        currency: "TRY", occurredAt: "2026-02-02T00:00:00.000Z", note: "Banka transferi dekontu",
      },
      approvedBy: "u_admin",
    });
    expect(r.ok).toBe(true);
    const sub = await getSaasSubscription("t_man");
    const attempts = sub ? await listSaasAttempts(sub.id, 5) : [];
    expect(attempts.some((a) => a.amountMinor === 123456)).toBe(true);
  });

  it("manuel ödemede tutarsız giriş reddedilir", async () => {
    const { buildPendingSubscription } = await import("../saas-billing/subscriptions");
    const { upsertSaasSubscription } = await import("../saas-billing/store");
    const snap = (amountMinor: number) => ({
      planKey: "core", planLabel: "Core", catalogVersion: null, billingInterval: "monthly" as const,
      currency: "TRY" as const, amountMinor, monthlyEquivalentMinor: null,
      campaignCode: null, campaignNote: null, postCampaignNote: null,
      limits: { students: 1, users: 1, branches: 1 }, includedModules: [] as string[],
      taxNote: "t", renewalNote: "r", acceptedAt: "2026-01-01T00:00:00.000Z",
      acceptedBy: "u", sandbox: true,
    });
    await upsertSaasSubscription(
      buildPendingSubscription({ tenantId: "t_man2", provider: "paytr", planKey: "core", catalogVersion: null, billingInterval: "monthly", priceSnapshot: snap(100) })
    );
    const both = await approveManualPayment({
      input: {
        tenantId: "t_man2", providerRef: "dekont-2", amountMinor: 100, amountTl: "1",
        currency: "TRY", occurredAt: "2026-02-02T00:00:00.000Z", note: "Banka transferi dekontu",
      },
      approvedBy: "u_admin",
    });
    expect(both.ok).toBe(false);
    const none = await approveManualPayment({
      input: {
        tenantId: "t_man2", providerRef: "dekont-3",
        currency: "TRY", occurredAt: "2026-02-02T00:00:00.000Z", note: "Banka transferi dekontu",
      },
      approvedBy: "u_admin",
    });
    expect(none.ok).toBe(false);
  });
});
