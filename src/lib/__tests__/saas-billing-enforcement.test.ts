import { describe, it, expect, beforeEach } from "vitest";
import { resetPlatformStoreForTests, upsertSettingOverride } from "../platform/store";
import { __resetSaasBillingStoreForTests, upsertSaasSubscription } from "../saas-billing/store";
import { buildPendingSubscription } from "../saas-billing/subscriptions";
import {
  __clearEnforcementCacheForTests,
  assertSaasAccess,
  decideSaasAccess,
  isBillingExemptPath,
} from "../saas-billing/enforcement";
import { renewalNoteFor } from "../saas-billing/catalog";

const T1 = "tenant_enf_1";

async function seedSub(status: "active" | "suspended" | "trialing" | "past_due" | "canceled", over: Record<string, unknown> = {}) {
  await upsertSaasSubscription({
    ...buildPendingSubscription({
      tenantId: T1, provider: "iyzico", planKey: "core", catalogVersion: null, billingInterval: "monthly",
      priceSnapshot: {
        planKey: "core", planLabel: "Core", catalogVersion: null, billingInterval: "monthly",
        currency: "TRY", amountMinor: 50000, monthlyEquivalentMinor: null,
        campaignCode: null, campaignNote: null, postCampaignNote: null,
        limits: { students: 1, users: 1, branches: 1 }, includedModules: [],
        taxNote: "t", renewalNote: renewalNoteFor("monthly"),
        acceptedAt: "2026-01-01T00:00:00.000Z", acceptedBy: "u", sandbox: true,
      },
    }),
    status,
    ...over,
  } as never);
}

async function setEnforcement(value: boolean) {
  await upsertSettingOverride({
    scopeType: "tenant", scopeId: T1, key: "billing.enforcement", value,
    updatedAt: new Date().toISOString(), updatedBy: "test",
  });
  __clearEnforcementCacheForTests();
}

beforeEach(async () => {
  await resetPlatformStoreForTests();
  await __resetSaasBillingStoreForTests();
  __clearEnforcementCacheForTests();
});

describe("saas enforcement", () => {
  it("varsayılan legacy: enforcement kapalıysa kısıt yok (mevcut kurumlar etkilenmez)", async () => {
    const d = await decideSaasAccess("tenant_legacy_no_sub", "2026-02-01T00:00:00.000Z");
    expect(d.scope).toBe("legacy");
    expect(d.allowed).toBe(true);
  });

  it("enforcement açık + abonelik yoksa kısıtlı, güvenli mesaj finansal detay içermez", async () => {
    await setEnforcement(true);
    const d = await decideSaasAccess(T1, "2026-02-01T00:00:00.000Z");
    expect(d.allowed).toBe(false);
    expect(d.safeMessage).toContain("aboneliği etkin değil");
    expect(d.safeMessage).not.toMatch(/₺|\d/);
  });

  it("suspended + süresi dolmuş paid-through kısıtlanır", async () => {
    await setEnforcement(true);
    await seedSub("suspended", { paidThrough: "2026-01-15T00:00:00.000Z" });
    const d = await decideSaasAccess(T1, "2026-02-01T00:00:00.000Z");
    expect(d.allowed).toBe(false);
    expect(d.status).toBe("suspended");
  });

  it("dönem sonunda iptal + ödenmiş süre devam ediyorsa erişim sürer", async () => {
    await setEnforcement(true);
    await seedSub("canceled", { paidThrough: "2026-03-01T00:00:00.000Z", cancelAtPeriodEnd: true });
    const d = await decideSaasAccess(T1, "2026-02-15T00:00:00.000Z");
    expect(d.allowed).toBe(true);
    expect(d.billingActionRequired).toBe(true);
  });

  it("yıllık üyelik dönem içinde aylık kontrolle kapatılmaz", async () => {
    await setEnforcement(true);
    await seedSub("active", { paidThrough: "2027-01-01T00:00:00.000Z" });
    const d = await decideSaasAccess(T1, "2026-06-01T00:00:00.000Z");
    expect(d.allowed).toBe(true);
  });

  it("deneme bitimi + aboneliksiz kısıtlanır, otomatik borç üretilmez", async () => {
    await setEnforcement(true);
    await seedSub("trialing", {
      trialStartsAt: "2026-01-01T00:00:00.000Z",
      trialEndsAt: "2026-01-31T00:00:00.000Z",
    });
    const d = await decideSaasAccess(T1, "2026-02-01T00:00:00.000Z");
    expect(d.allowed).toBe(false);
  });

  it("HYPER_ADMIN tenant borcuyla kilitlenmez", async () => {
    await setEnforcement(true);
    await seedSub("suspended", { paidThrough: "2026-01-01T00:00:00.000Z" });
    const r = await assertSaasAccess({ role: "HYPER_ADMIN", tenantId: T1, path: "/api/v1/tenants/x" });
    expect(r.ok).toBe(true);
  });

  it("ödeme/kart/destek yolları kısıttan muaftır", async () => {
    await setEnforcement(true);
    await seedSub("suspended", { paidThrough: "2026-01-01T00:00:00.000Z" });
    for (const p of ["/api/v1/billing/subscription", "/api/v1/auth/login", "/api/v1/account/x"]) {
      const r = await assertSaasAccess({ role: "SUPER_ADMIN", tenantId: T1, path: p });
      expect(r.ok).toBe(true);
    }
    const blocked = await assertSaasAccess({ role: "SUPER_ADMIN", tenantId: T1, path: "/api/v1/students" });
    expect(blocked.ok).toBe(false);
  });

  it("isBillingExemptPath sayfa yollarını da kapsar", () => {
    expect(isBillingExemptPath("/abonelik?x=1")).toBe(true);
    expect(isBillingExemptPath("/panel/ogrenciler")).toBe(false);
  });
});
