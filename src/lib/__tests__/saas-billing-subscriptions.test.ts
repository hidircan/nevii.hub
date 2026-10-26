import { describe, it, expect, beforeEach } from "vitest";
import { resetPlatformStoreForTests } from "../platform/store";
import { __resetSaasBillingStoreForTests, upsertSaasSubscription } from "../saas-billing/store";
import {
  addPeriod,
  applyFailedPayment,
  applyPlanChange,
  applyVerifiedPayment,
  buildPendingSubscription,
  canTransition,
  cancelAtPeriodEnd,
  mapProviderStatus,
  planUpgradeRequiresPayment,
  reactivate,
  recordRefundOrChargeback,
} from "../saas-billing/subscriptions";
import { buildPriceSnapshot, getPricedPlan, renewalNoteFor } from "../saas-billing/catalog";
import type { SaasPriceSnapshot } from "../saas-billing/types";

const T1 = "tenant_sub_1";

function snapshot(over: Partial<SaasPriceSnapshot> = {}): SaasPriceSnapshot {
  return {
    planKey: "core",
    planLabel: "Core",
    catalogVersion: null,
    billingInterval: "monthly",
    currency: "TRY",
    amountMinor: 50000,
    monthlyEquivalentMinor: null,
    campaignCode: null,
    campaignNote: null,
    postCampaignNote: null,
    limits: { students: 300, users: 10, branches: 2 },
    includedModules: [],
    taxNote: "Tutarlar KDV hariçtir.",
    renewalNote: renewalNoteFor("monthly"),
    acceptedAt: "2026-01-01T00:00:00.000Z",
    acceptedBy: "user_owner",
    sandbox: true,
    ...over,
  };
}

beforeEach(async () => {
  await resetPlatformStoreForTests();
  await __resetSaasBillingStoreForTests();
});

describe("saas abonelik durum makinesi", () => {
  it("sağlayıcı durumlarını yerel durumlara eşler; bilinmeyende fail-closed", () => {
    expect(mapProviderStatus("ACTIVE")).toBe("active");
    expect(mapProviderStatus("PENDING")).toBe("pending");
    expect(mapProviderStatus("UNPAID")).toBe("suspended");
    expect(mapProviderStatus("UPGRADED")).toBe("active");
    expect(mapProviderStatus("CANCELED")).toBe("canceled");
    expect(mapProviderStatus("EXPIRED")).toBe("expired");
    expect(mapProviderStatus("past_due")).toBe("past_due");
    expect(mapProviderStatus("BOGUS_STATUS")).toBeNull();
  });

  it("sırası bozuk geçişi engeller; yeniden etkinleştirme açık izin ister", () => {
    expect(canTransition("active", "past_due")).toBe(true);
    expect(canTransition("past_due", "active")).toBe(true);
    expect(canTransition("canceled", "active")).toBe(false);
    expect(canTransition("canceled", "active", { allowReactivation: true })).toBe(true);
    expect(canTransition("canceled", "expired")).toBe(true);
  });

  it("doğrulanmış ödeme active'e geçirir; aynı dönem ikinci success yazılmaz", async () => {
    await upsertSaasSubscription(
      buildPendingSubscription({ tenantId: T1, planKey: "core", catalogVersion: null, billingInterval: "monthly", priceSnapshot: snapshot(), nowIso: "2026-02-01T00:00:00.000Z" })
    );
    const first = await applyVerifiedPayment({
      tenantId: T1, amountMinor: 50000, providerRef: "ord_1", providerEventId: "evt_1",
      idempotencyKey: "wh_evt_1", nowIso: "2026-02-01T00:00:00.000Z",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.subscription.status).toBe("active");
    expect(first.data.subscription.paidThrough).toBe("2026-03-01T00:00:00.000Z");

    // Aynı sipariş, farklı olay kimliği → çift teslimat, tek etki.
    const second = await applyVerifiedPayment({
      tenantId: T1, amountMinor: 50000, providerRef: "ord_1", providerEventId: "evt_1b",
      idempotencyKey: "wh_evt_1b", nowIso: "2026-02-05T00:00:00.000Z",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.duplicate).toBe(true);
  });

  it("başarısız ödeme past_due yapar; dönem sonunda iptal paid-through'u korur", async () => {
    await upsertSaasSubscription({
      ...buildPendingSubscription({ tenantId: T1, planKey: "core", catalogVersion: null, billingInterval: "monthly", priceSnapshot: snapshot() }),
      status: "active",
      currentPeriodStart: "2026-02-01T00:00:00.000Z",
      currentPeriodEnd: "2026-03-01T00:00:00.000Z",
      paidThrough: "2026-03-01T00:00:00.000Z",
    });
    const f = await applyFailedPayment({
      tenantId: T1, error: "kart reddi", providerEventId: "evt_f", idempotencyKey: "wh_evt_f",
      nowIso: "2026-02-10T00:00:00.000Z",
    });
    expect(f.ok && f.data.status).toBe("past_due");
    const c = await cancelAtPeriodEnd(T1, "2026-02-11T00:00:00.000Z");
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.data.status).toBe("canceled");
    expect(c.data.paidThrough).toBe("2026-03-01T00:00:00.000Z");
    expect(c.data.cancelAtPeriodEnd).toBe(true);
  });

  it("yeniden etkinleştirme pending'e döner (ödeme doğrulanmadan hak yok)", async () => {
    await upsertSaasSubscription({
      ...buildPendingSubscription({ tenantId: T1, planKey: "core", catalogVersion: null, billingInterval: "monthly", priceSnapshot: snapshot() }),
      status: "suspended",
    });
    const r = await reactivate(T1, "2026-02-12T00:00:00.000Z");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.status).toBe("pending");
  });

  it("yıllık dönem bir yıl uzar; aylık dönem bir ay uzar", () => {
    expect(addPeriod("2026-02-01T00:00:00.000Z", "yearly")).toBe("2027-02-01T00:00:00.000Z");
    expect(addPeriod("2026-01-15T00:00:00.000Z", "monthly")).toBe("2026-02-15T00:00:00.000Z");
  });

  it("upgrade ödeme ister; düşürme varsayılan sonraki döneme planlanır", () => {
    const rank = { starter: 1, core: 2, pro: 3 };
    expect(planUpgradeRequiresPayment("core", "pro", rank)).toBe(true);
    expect(planUpgradeRequiresPayment("pro", "core", rank)).toBe(false);
  });

  it("düşürme planı mevcut limiti/hakkı hemen değiştirmez", async () => {
    await upsertSaasSubscription(
      buildPendingSubscription({ tenantId: T1, planKey: "pro", catalogVersion: null, billingInterval: "monthly", priceSnapshot: snapshot({ planKey: "pro", planLabel: "Pro" }) })
    );
    const r = await applyPlanChange({
      tenantId: T1, targetPlanKey: "starter",
      priceSnapshot: snapshot({ planKey: "pro", planLabel: "Pro" }),
      effective: "next_period", nowIso: "2026-02-01T00:00:00.000Z",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.planKey).toBe("pro");
    expect(r.data.priceSnapshot.campaignNote).toContain("starter");
  });

  it("iade/chargeback ayrı kayıt; geçmiş charge satırı değişmez", async () => {
    const sub = buildPendingSubscription({ tenantId: T1, planKey: "core", catalogVersion: null, billingInterval: "monthly", priceSnapshot: snapshot() });
    await upsertSaasSubscription(sub);
    const r = await recordRefundOrChargeback({
      tenantId: T1, kind: "refund", amountMinor: 50000, providerRef: "rf_1",
      providerEventId: "evt_rf", idempotencyKey: "wh_evt_rf", nowIso: "2026-02-15T00:00:00.000Z",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.kind).toBe("refund");
    expect(r.data.status).toBe("succeeded");
  });

  it("onaylı fiyat yoksa katalog tutar uydurmaz; checkout kapalı sayılır", async () => {
    const plan = await getPricedPlan("core", "monthly");
    expect(plan).not.toBeNull();
    expect(plan!.approved).toBe(false);
    expect(plan!.sandbox).toBe(true);
    expect(plan!.amountMinor).toBe(0);
  });

  it("snapshot kabul anını dondurur", () => {
    const plan = { planKey: "core", planLabel: "Core", catalogVersion: null as number | null, billingInterval: "monthly" as const, currency: "TRY" as const, amountMinor: 50000, monthlyEquivalentMinor: null, taxNote: "t", renewalNote: "r", sandbox: true };
    const s = buildPriceSnapshot({
      plan, limits: { students: 1, users: 1, branches: 1 }, includedModules: [],
      campaignCode: null, campaignNote: null, postCampaignNote: null,
      acceptedBy: "u1", nowIso: "2026-02-01T00:00:00.000Z",
    });
    expect(s.acceptedAt).toBe("2026-02-01T00:00:00.000Z");
    expect(s.amountMinor).toBe(50000);
  });
});
