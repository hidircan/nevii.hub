import { describe, it, expect, beforeEach } from "vitest";
import { resetPlatformStoreForTests } from "../platform/store";
import { __resetSaasBillingStoreForTests, saveSaasCampaign } from "../saas-billing/store";
import {
  __resetTrialRateLimitForTests,
  startTrial,
  trialDaysLeft,
  trialEndIso,
} from "../saas-billing/trial";
import {
  createPilotCampaign,
  validateCampaignForTenant,
} from "../saas-billing/campaigns";
import { getSaasSubscription } from "../saas-billing/store";

beforeEach(async () => {
  await resetPlatformStoreForTests();
  await __resetSaasBillingStoreForTests();
  __resetTrialRateLimitForTests();
});

describe("saas trial", () => {
  it("doğrulanmış e-posta ile 30 günlük deneme başlatır", async () => {
    const r = await startTrial({
      tenantId: "t_trial_1", ownerEmail: "sahip@kurum.com", ownerEmailVerified: true,
      ownerUserId: "u1", emailUsedForTrialBefore: false, nowIso: "2026-02-01T00:00:00.000Z",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.status).toBe("trialing");
    expect(r.data.trialEndsAt).toBe("2026-03-03T00:00:00.000Z");
    expect(trialDaysLeft(r.data.trialEndsAt, "2026-02-01T00:00:00.000Z")).toBe(30);
  });

  it("doğrulanmamış e-posta fail-closed", async () => {
    const r = await startTrial({
      tenantId: "t_trial_2", ownerEmail: "x@y.com", ownerEmailVerified: false,
      ownerUserId: "u1", emailUsedForTrialBefore: false, nowIso: "2026-02-01T00:00:00.000Z",
    });
    expect(r.ok).toBe(false);
  });

  it("aynı kuruma ikinci deneme yok; e-posta tekrarı engellenir", async () => {
    const args = { tenantId: "t_trial_3", ownerEmail: "a@b.com", ownerEmailVerified: true, ownerUserId: "u1", emailUsedForTrialBefore: false, nowIso: "2026-02-01T00:00:00.000Z" };
    expect((await startTrial(args)).ok).toBe(true);
    expect((await startTrial(args)).ok).toBe(false);
    const other = await startTrial({ ...args, tenantId: "t_trial_4", emailUsedForTrialBefore: true });
    expect(other.ok).toBe(false);
  });

  it("trialEndIso 30 gün ekler", () => {
    expect(trialEndIso("2026-02-01T00:00:00.000Z")).toBe("2026-03-03T00:00:00.000Z");
  });

  it("deneme sahibi e-postası hash'lenir, açık saklanmaz", async () => {
    await startTrial({
      tenantId: "t_trial_5", ownerEmail: "Gizli@Kurum.com", ownerEmailVerified: true,
      ownerUserId: "u1", emailUsedForTrialBefore: false, nowIso: "2026-02-01T00:00:00.000Z",
    });
    const sub = await getSaasSubscription("t_trial_5");
    expect(sub?.priceSnapshot.trialOwnerHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(sub)).not.toContain("Gizli@Kurum.com");
  });
});

describe("saas pilot kampanya", () => {
  it("pilot kurum bağı olmadan kampanya kurulamaz", async () => {
    const r = await createPilotCampaign({
      input: { name: "x", discountType: "percent", percent: 10, postCampaignNote: "liste fiyatı uygulanır" },
      createdBy: "hyper",
    });
    expect(r.ok).toBe(false);
  });

  it("başka kurum özel fiyata erişemez; kapsam/süre/yenileme denetlenir", async () => {
    const c = await createPilotCampaign({
      input: {
        name: "Pilot A", tenantId: "t_pilot_a", discountType: "percent", percent: 50,
        intervalScope: "monthly", validTo: "2026-12-31T00:00:00.000Z",
        maxRenewals: 3, maxRedemptions: 5, postCampaignNote: "Sonrasında liste fiyatı.",
      },
      createdBy: "hyper",
    });
    expect(c.ok).toBe(true);
    if (!c.ok) return;

    const wrongTenant = await validateCampaignForTenant({
      code: c.data.code, tenantId: "t_baska", interval: "monthly",
      listAmountMinor: 10000, renewalsUsed: 0, nowIso: "2026-02-01T00:00:00.000Z",
    });
    expect(wrongTenant.ok).toBe(false);

    const wrongInterval = await validateCampaignForTenant({
      code: c.data.code, tenantId: "t_pilot_a", interval: "yearly",
      listAmountMinor: 100000, renewalsUsed: 0, nowIso: "2026-02-01T00:00:00.000Z",
    });
    expect(wrongInterval.ok).toBe(false);

    const renewalsOut = await validateCampaignForTenant({
      code: c.data.code, tenantId: "t_pilot_a", interval: "monthly",
      listAmountMinor: 10000, renewalsUsed: 3, nowIso: "2026-02-01T00:00:00.000Z",
    });
    expect(renewalsOut.ok).toBe(false);

    const valid = await validateCampaignForTenant({
      code: c.data.code, tenantId: "t_pilot_a", interval: "monthly",
      listAmountMinor: 10000, renewalsUsed: 0, nowIso: "2026-02-01T00:00:00.000Z",
    });
    expect(valid.ok).toBe(true);
    if (!valid.ok) return;
    expect(valid.amountMinor).toBe(5000);
  });

  it("süresi dolmuş kampanya geçersizdir", async () => {
    await saveSaasCampaign({
      id: "cmp_exp", name: "Eski", tenantId: "t_pilot_b", code: "pilot_eski",
      discountType: "fixed_minor", amountMinor: 1000, percent: null, intervalScope: "both",
      validFrom: null, validTo: "2026-01-01T00:00:00.000Z", maxRenewals: null,
      maxRedemptions: null, redeemedCount: 0, postCampaignNote: "Sonrasında liste.",
      active: true, createdBy: "hyper", createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    });
    const r = await validateCampaignForTenant({
      code: "pilot_eski", tenantId: "t_pilot_b", interval: "monthly",
      listAmountMinor: 10000, renewalsUsed: 0, nowIso: "2026-02-01T00:00:00.000Z",
    });
    expect(r.ok).toBe(false);
  });
});
