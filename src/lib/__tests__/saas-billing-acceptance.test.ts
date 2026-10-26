import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { resetPlatformStoreForTests } from "../platform/store";
import { approveManualPayment } from "../saas-billing/manual";
import { collectDueSubscriptions } from "../saas-billing/scheduler";
import {
  __resetSaasBillingStoreForTests,
  claimChargeAttempt,
  expireStaleClaim,
  getSaasSubscription,
  listSaasAttempts,
  recordSaasAttempt,
  upsertSaasSubscription,
} from "../saas-billing/store";
import { renewalNoteFor } from "../saas-billing/catalog";
import {
  addProviderLink,
  buildPendingSubscription,
} from "../saas-billing/subscriptions";
import { getSaasProvider } from "../saas-billing/provider-adapter";
import { paytrCallbackHash } from "../saas-billing/paytr-subscription";
import { processIyzicoSubscriptionWebhook, processPaytrCallback } from "../saas-billing/webhooks";

const T1 = "acc_t1";
const NOW = "2026-02-01T00:00:00.000Z";

function snapshot() {
  return {
    planKey: "core",
    planLabel: "Core",
    catalogVersion: null as number | null,
    billingInterval: "monthly" as const,
    currency: "TRY" as const,
    amountMinor: 50000,
    monthlyEquivalentMinor: null as number | null,
    campaignCode: null as string | null,
    campaignNote: null as string | null,
    postCampaignNote: null as string | null,
    limits: { students: 1, users: 1, branches: 1 },
    includedModules: [] as string[],
    taxNote: "t",
    renewalNote: renewalNoteFor("monthly"),
    acceptedAt: "2026-01-01T00:00:00.000Z",
    acceptedBy: "u",
    sandbox: true,
  };
}

/** Vadesi gelmiş MERCHANT_SCHEDULED abonelik tohumu. */
async function seedDueSub() {
  const sub = buildPendingSubscription({
    tenantId: T1,
    provider: "paytr",
    planKey: "core",
    catalogVersion: null,
    billingInterval: "monthly",
    priceSnapshot: snapshot(),
  });
  await upsertSaasSubscription({
    ...sub,
    status: "active",
    executionModel: "MERCHANT_SCHEDULED",
    merchantAccount: "paytr:1",
    currentPeriodStart: "2026-01-01T00:00:00.000Z",
    currentPeriodEnd: "2026-02-01T00:00:00.000Z",
    paidThrough: "2026-02-01T00:00:00.000Z",
    billingEmail: "sahip@kurum.test",
    billingUserIp: "1.2.3.4",
    providerCustomerRef: "ut_test",
    providerCardRef: "ct_test",
  });
  return sub;
}

function paytrEnv() {
  process.env.PAYTR_MERCHANT_ID = "1";
  process.env.PAYTR_MERCHANT_KEY = "k";
  process.env.PAYTR_MERCHANT_SALT = "s";
  process.env.PAYTR_CAP_DIRECT = "true";
  process.env.PAYTR_CAP_CARD_STORAGE = "true";
  process.env.PAYTR_CAP_NON3D = "true";
}

beforeEach(async () => {
  await resetPlatformStoreForTests();
  await __resetSaasBillingStoreForTests();
  vi.unstubAllGlobals();
});

afterEach(() => {
  for (const k of [
    "PAYTR_MERCHANT_ID",
    "PAYTR_MERCHANT_KEY",
    "PAYTR_MERCHANT_SALT",
    "PAYTR_CAP_DIRECT",
    "PAYTR_CAP_CARD_STORAGE",
    "PAYTR_CAP_NON3D",
    "PAYTR_TEST_MODE",
    "SAAS_BILLING_LIVE_CHARGES",
    "VERCEL_ENV",
    "IYZICO_BASE_URL",
    "BILLING_CRON_SECRET",
    "CRON_SECRET",
  ]) {
    delete process.env[k];
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("atomik claim (dış çağrı öncesi iş sahiplenme)", () => {
  const claim = (n: number, oid: string) => ({
    id: `att_claim_${n}_${oid}`,
    tenantId: T1,
    subscriptionId: "sub_1",
    periodStart: "2026-02-01T00:00:00.000Z",
    periodEnd: "2026-03-01T00:00:00.000Z",
    debtKey: "sub_1:2026-02-01T00:00:00.000Z",
    amountMinor: 50000,
    currency: "TRY" as const,
    attemptNo: n,
    idempotencyKey: `due_sub_1_2026-02-01T00:00:00.000Z_n${n}`,
    provider: "paytr" as const,
    merchantAccount: "paytr:1",
    providerRef: oid,
    nowIso: NOW,
  });
  it("iki paralel claim'den biri kazanır, diğeri busy döner", async () => {
    const [a, b] = await Promise.all([
      claimChargeAttempt(claim(1, "oid_a")),
      claimChargeAttempt(claim(1, "oid_b")),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual(["busy", "claimed"]);
  });
  it("dönem ödenmişse claim paid döner (çekim yok)", async () => {
    await claimChargeAttempt(claim(1, "oid_a"));
    const { updateSaasAttempt } = await import("../saas-billing/store");
    const open = await listSaasAttempts("sub_1", 10);
    await updateSaasAttempt(open[0].id, { status: "succeeded" });
    const r = await claimChargeAttempt(claim(2, "oid_b"));
    expect(r.status).toBe("paid");
  });
  it("expire koşullu: yanlış ref false, doğru ref true, ikincisi false", async () => {
    const c = await claimChargeAttempt(claim(1, "oid_a"));
    if (c.status !== "claimed") throw new Error("claim bekleniyordu");
    expect(
      await expireStaleClaim({ attemptId: c.record.id, providerRef: "oid_WRONG", reason: "x", nowIso: NOW })
    ).toBe(false);
    expect(
      await expireStaleClaim({ attemptId: c.record.id, providerRef: "oid_a", reason: "x", nowIso: NOW })
    ).toBe(true);
    expect(
      await expireStaleClaim({ attemptId: c.record.id, providerRef: "oid_a", reason: "x", nowIso: NOW })
    ).toBe(false);
  });
});

describe("dry-run saflığı + fail-closed", () => {
  it("dry-run: deneme yok, abonelik değişmez, e-posta yok", async () => {
    const before = await seedDueSub();
    const r = await collectDueSubscriptions({ dryRun: true, nowIso: NOW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.dryRun).toBe(true);
    expect(r.data.due).toBe(1);
    expect(r.data.charged).toBe(0);
    expect(await listSaasAttempts(before.id, 50)).toHaveLength(0);
    const after = await getSaasSubscription(T1);
    expect(after?.status).toBe("active");
    expect(after?.paidThrough).toBe("2026-02-01T00:00:00.000Z");
    expect(after?.currentPeriodEnd).toBe("2026-02-01T00:00:00.000Z");
  });
  it("yapılandırılmamış sağlayıcıyla apply: çekim yok, başarısız kayıt yok", async () => {
    const sub = await seedDueSub();
    const r = await collectDueSubscriptions({ dryRun: false, nowIso: NOW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.charged).toBe(0);
    expect(r.data.failed).toBe(0);
    expect(r.data.skipped[0]).toContain("yapılandırılmadı");
    expect(await listSaasAttempts(sub.id, 50)).toHaveLength(0);
    expect((await getSaasSubscription(T1))?.status).toBe("active");
  });
});

describe("job apply yolu (stub fetch, gerçek ağ yok)", () => {
  it("başarılı çekim: TEK satır (claim finalize), active + dönem uzar", async () => {
    const sub = await seedDueSub();
    paytrEnv();
    const bodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { body?: unknown }) => {
        bodies.push(String(init?.body ?? ""));
        return { ok: true, json: async () => ({ status: "success" }) };
      })
    );
    const r = await collectDueSubscriptions({ dryRun: false, nowIso: NOW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.charged).toBe(1);
    // Tek çekim isteği gönderildi.
    expect(bodies.filter((b) => b.includes("recurring_payment")).length).toBe(1);
    const attempts = await listSaasAttempts(sub.id, 50);
    expect(attempts.filter((a) => a.status === "succeeded")).toHaveLength(1);
    expect(attempts).toHaveLength(1);
    const fresh = await getSaasSubscription(T1);
    expect(fresh?.status).toBe("active");
    expect(fresh?.paidThrough).toBe("2026-03-01T00:00:00.000Z");
    // İkinci koşu: dönem ödendi, yeni çekim yok.
    bodies.length = 0;
    const r2 = await collectDueSubscriptions({ dryRun: false, nowIso: NOW });
    if (!r2.ok) return;
    expect(r2.data.charged).toBe(0);
    expect(bodies.length).toBe(0);
  });
  it("timeout → uncertain; sorgu success → charged (kör retry yok)", async () => {
    const sub = await seedDueSub();
    paytrEnv();
    let mode: "timeout" | "query" = "timeout";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (mode === "timeout") {
          const e = new Error("aborted") as Error & { name: string };
          e.name = "AbortError";
          throw e;
        }
        return { ok: true, json: async () => ({ status: "success", total_amount: "50000" }) };
      })
    );
    const r1 = await collectDueSubscriptions({ dryRun: false, nowIso: NOW });
    if (!r1.ok) return;
    expect(r1.data.uncertain).toBe(1);
    expect((await listSaasAttempts(sub.id, 50))[0].status).toBe("uncertain");
    // 6 dk sonra: uzlaştırma sorgusu success → charged, YENİ çekim isteği yok.
    mode = "query";
    let chargeCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { body?: unknown }) => {
        if (String(init?.body ?? "").includes("recurring_payment")) chargeCalls += 1;
        return { ok: true, json: async () => ({ status: "success", total_amount: "50000" }) };
      })
    );
    const r2 = await collectDueSubscriptions({ dryRun: false, nowIso: "2026-02-01T00:06:00.000Z" });
    if (!r2.ok) return;
    expect(r2.data.charged).toBe(1);
    expect(chargeCalls).toBe(0);
    expect((await getSaasSubscription(T1))?.paidThrough).toBe("2026-03-01T00:00:00.000Z");
  });
  it("sorgu tutar uyuşmazlığında finalize yok (inceleme)", async () => {
    const sub = await seedDueSub();
    paytrEnv();
    await recordSaasAttempt({
      id: "att_mm_1",
      tenantId: T1,
      subscriptionId: sub.id,
      periodStart: "2026-02-01T00:00:00.000Z",
      periodEnd: "2026-03-01T00:00:00.000Z",
      debtKey: `${sub.id}:2026-02-01T00:00:00.000Z`,
      amountMinor: 50000,
      currency: "TRY",
      status: "uncertain",
      kind: "charge",
      attemptNo: 1,
      idempotencyKey: "idem_mm_1",
      provider: "paytr",
      merchantAccount: "paytr:1",
      providerRef: "oid_mm",
      providerEventId: null,
      error: "bekliyor",
      sentAt: "2026-02-01T00:00:00.000Z",
      retryable: null,
      createdAt: "2026-02-01T00:00:00.000Z",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ status: "success", total_amount: "49999" }) }))
    );
    const r = await collectDueSubscriptions({ dryRun: false, nowIso: "2026-02-01T00:06:00.000Z" });
    if (!r.ok) return;
    expect(r.data.charged).toBe(0);
    expect(r.data.uncertain).toBe(0);
    expect(r.data.skipped[0]).toContain("belirsiz");
    expect((await getSaasSubscription(T1))?.status).toBe("active");
    expect((await getSaasSubscription(T1))?.paidThrough).toBe("2026-02-01T00:00:00.000Z");
    const att = (await listSaasAttempts(sub.id, 50))[0];
    expect(att.status).toBe("uncertain");
    expect(att.error).toContain("MISMATCH_REVIEW");
  });
  it("tekrar-denenemez sonuç: kart güncellenmeden çekim yok; yeni kartla açılır", async () => {
    const sub = await seedDueSub();
    paytrEnv();
    await recordSaasAttempt({
      id: "att_nr_1",
      tenantId: T1,
      subscriptionId: sub.id,
      periodStart: "2026-02-01T00:00:00.000Z",
      periodEnd: "2026-03-01T00:00:00.000Z",
      debtKey: `${sub.id}:2026-02-01T00:00:00.000Z`,
      amountMinor: 50000,
      currency: "TRY",
      status: "failed",
      kind: "charge",
      attemptNo: 1,
      idempotencyKey: "idem_nr_1",
      provider: "paytr",
      merchantAccount: "paytr:1",
      providerRef: "oid_nr",
      providerEventId: "job_x",
      error: "kart reddetti",
      sentAt: "2026-02-01T00:00:00.000Z",
      retryable: false,
      createdAt: "2026-02-01T00:00:00.000Z",
    });
    let chargeCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { body?: unknown }) => {
        if (String(init?.body ?? "").includes("recurring_payment")) chargeCalls += 1;
        return { ok: true, json: async () => ({ status: "success" }) };
      })
    );
    const r1 = await collectDueSubscriptions({ dryRun: false, nowIso: "2026-02-02T00:00:00.000Z" });
    if (!r1.ok) return;
    expect(r1.data.charged).toBe(0);
    expect(r1.data.skipped[0]).toContain("kart güncellemesi");
    expect(chargeCalls).toBe(0);
    // Yeni kart bağlantısı → kapı açılır.
    const cur = await getSaasSubscription(T1);
    if (!cur) throw new Error("sub yok");
    await upsertSaasSubscription(
      addProviderLink(
        cur,
        { provider: "paytr", merchant: "paytr:1", cardRef: "ct_yeni" },
        "2026-02-03T00:00:00.000Z"
      )
    );
    const r2 = await collectDueSubscriptions({ dryRun: false, nowIso: "2026-02-03T00:00:00.000Z" });
    if (!r2.ok) return;
    expect(r2.data.charged).toBe(1);
    expect(chargeCalls).toBe(1);
  });
});

describe("canlı-tahsilat kilidi", () => {
  it("PayTR test_mode=0 bayraksız kilitli (ağ çağrısı yok)", async () => {
    paytrEnv();
    process.env.PAYTR_TEST_MODE = "0";
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ status: "success" }) }));
    vi.stubGlobal("fetch", fetchMock);
    const p = getSaasProvider("paytr");
    const r = await p.serverCharge({
      merchantOid: "oid_live",
      email: "a@b.c",
      userIp: "1.1.1.1",
      amountMinor: 100,
      currency: "TRY",
      customerRef: "ut",
      cardRef: "ct",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errorCode).toBe("LIVE_LOCKED");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("bayrak + production birlikte gerekli (preview yetmez)", async () => {
    paytrEnv();
    process.env.PAYTR_TEST_MODE = "0";
    process.env.SAAS_BILLING_LIVE_CHARGES = "true";
    process.env.VERCEL_ENV = "preview";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ status: "success" }) })));
    const p = getSaasProvider("paytr");
    const r = await p.serverCharge({
      merchantOid: "o",
      email: "a@b.c",
      userIp: "1.1.1.1",
      amountMinor: 100,
      currency: "TRY",
      customerRef: "ut",
      cardRef: "ct",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("LIVE_LOCKED");
  });
  it("C: production + bayrak kapalı → gerçek çekim engellenir", async () => {
    paytrEnv();
    process.env.PAYTR_TEST_MODE = "0";
    process.env.VERCEL_ENV = "production";
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ status: "success" }) }));
    vi.stubGlobal("fetch", fetchMock);
    const p = getSaasProvider("paytr");
    const r = await p.serverCharge({
      merchantOid: "o",
      email: "a@b.c",
      userIp: "1.1.1.1",
      amountMinor: 100,
      currency: "TRY",
      customerRef: "ut",
      cardRef: "ct",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errorCode).toBe("LIVE_LOCKED");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("D: production + bayrak açık ama yetki eksik → çekim yapılamaz (ağ yok)", async () => {
    process.env.PAYTR_MERCHANT_ID = "1";
    process.env.PAYTR_MERCHANT_KEY = "k";
    process.env.PAYTR_MERCHANT_SALT = "s";
    process.env.PAYTR_TEST_MODE = "0";
    process.env.SAAS_BILLING_LIVE_CHARGES = "true";
    process.env.VERCEL_ENV = "production";
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ status: "success" }) }));
    vi.stubGlobal("fetch", fetchMock);
    const p = getSaasProvider("paytr");
    expect(p.isConfigured()).toBe(false);
    const r = await p.serverCharge({
      merchantOid: "o",
      email: "a@b.c",
      userIp: "1.1.1.1",
      amountMinor: 100,
      currency: "TRY",
      customerRef: "ut",
      cardRef: "ct",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errorCode).toBe("PRECONDITION_MISSING");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("D-karşıtı: tüm koşullar + stub ağ → istek oluşur (gerçek ağa çıkılmaz)", async () => {
    paytrEnv();
    process.env.PAYTR_TEST_MODE = "0";
    process.env.SAAS_BILLING_LIVE_CHARGES = "true";
    process.env.VERCEL_ENV = "production";
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ status: "success" }) }));
    vi.stubGlobal("fetch", fetchMock);
    const p = getSaasProvider("paytr");
    const r = await p.serverCharge({
      merchantOid: "o",
      email: "a@b.c",
      userIp: "1.1.1.1",
      amountMinor: 100,
      currency: "TRY",
      customerRef: "ut",
      cardRef: "ct",
    });
    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("sandbox modu kilide takılmaz", async () => {
    paytrEnv();
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ status: "success" }) }));
    vi.stubGlobal("fetch", fetchMock);
    const p = getSaasProvider("paytr");
    const r = await p.serverCharge({
      merchantOid: "o",
      email: "a@b.c",
      userIp: "1.1.1.1",
      amountMinor: 100,
      currency: "TRY",
      customerRef: "ut",
      cardRef: "ct",
    });
    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });
  it("iyzico prod URL bayraksız kilitli", async () => {
    process.env.IYZICO_BASE_URL = "https://api.iyzipay.com";
    const p = getSaasProvider("iyzico");
    const r = await p.initializeCheckout({
      tenantId: "t",
      planKey: "core",
      billingInterval: "monthly",
      amountMinor: 100,
      callbackUrl: "http://localhost/cb",
      idempotencyKey: "k1",
      customer: { name: "A", surname: "B", email: "a@b.c", gsmNumber: "1", identityNumber: "1", address: "a", city: "c", country: "TR" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("LIVE_LOCKED");
  });
});

describe("manuel vs otomatik yarışı", () => {
  it("manuel önce öderse job çekmez (dönem ödendi)", async () => {
    const sub = await seedDueSub();
    const m = await approveManualPayment({
      input: {
        tenantId: T1,
        providerRef: "REFJOB1",
        amountMinor: 50000,
        currency: "TRY",
        occurredAt: "2026-02-01T00:00:00.000Z",
        note: "banka transferi dekontu",
      },
      approvedBy: "admin",
      nowIso: NOW,
    });
    expect(m.ok).toBe(true);
    paytrEnv();
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ status: "success" }) }));
    vi.stubGlobal("fetch", fetchMock);
    // Manuel onay sağlayıcıyı "manual" yapar; job listesine girmez.
    expect((await getSaasSubscription(T1))?.provider).toBe("manual");
    const r = await collectDueSubscriptions({ dryRun: false, nowIso: NOW });
    if (!r.ok) return;
    expect(r.data.due).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sub.id).toBeTruthy();
  });
  it("açık job claim'i varken manuel onaylanırsa job bekler (çift çekim yok)", async () => {
    const sub = await seedDueSub();
    const c = await claimChargeAttempt({
      id: "att_race_1",
      tenantId: T1,
      subscriptionId: sub.id,
      periodStart: "2026-02-01T00:00:00.000Z",
      periodEnd: "2026-03-01T00:00:00.000Z",
      debtKey: `${sub.id}:2026-02-01T00:00:00.000Z`,
      amountMinor: 50000,
      currency: "TRY",
      attemptNo: 1,
      idempotencyKey: "due_x_n1",
      provider: "paytr",
      merchantAccount: "paytr:1",
      providerRef: "oid_race",
      nowIso: NOW,
    });
    expect(c.status).toBe("claimed");
    const m = await approveManualPayment({
      input: {
        tenantId: T1,
        providerRef: "REFJOB2",
        amountMinor: 50000,
        currency: "TRY",
        occurredAt: "2026-02-01T00:00:00.000Z",
        note: "banka transferi dekontu",
      },
      approvedBy: "admin",
      nowIso: NOW,
    });
    expect(m.ok).toBe(true);
    // Manuel onay sonrası sağlayıcı manual → job bu borca dokunmaz.
    paytrEnv();
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ status: "success" }) }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await collectDueSubscriptions({ dryRun: false, nowIso: NOW });
    if (!r.ok) return;
    expect(r.data.due).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("consent kaydı şekli", () => {
  it("addProviderLink consent taşır", () => {
    const sub = buildPendingSubscription({
      tenantId: T1,
      provider: "paytr",
      planKey: "core",
      catalogVersion: null,
      billingInterval: "monthly",
      priceSnapshot: snapshot(),
    });
    const next = addProviderLink(
      sub,
      {
        provider: "paytr",
        merchant: "paytr:1",
        consent: { scope: "card_storage+recurring", version: "v1", at: NOW },
      },
      NOW
    );
    expect(next.providerLinks).toHaveLength(1);
    expect(next.providerLinks[0].consent?.scope).toBe("card_storage+recurring");
    expect(next.providerLinks[0].consent?.version).toBe("v1");
  });
});

describe("geçiş sonrası eski callback (legacy link)", () => {
  const SECRET = "s3cr3t";
  const MERCHANT = "M1";
  function sign(fields: { eventType: string; sub: string; order: string; customer: string }): string {
    const key = MERCHANT + SECRET + fields.eventType + fields.sub + fields.order + fields.customer;
    return createHmac("sha256", SECRET).update(key, "utf8").digest("hex");
  }
  it("kayıtlı legacy bağlantı varsa eski sağlayıcı olayı işlenir", async () => {
    process.env.IYZICO_SECRET_KEY = SECRET;
    process.env.IYZICO_MERCHANT_ID = MERCHANT;
    const sub = buildPendingSubscription({
      tenantId: T1,
      provider: "paytr",
      planKey: "core",
      catalogVersion: null,
      billingInterval: "monthly",
      priceSnapshot: snapshot(),
    });
    await upsertSaasSubscription({
      ...addProviderLink(
        sub,
        { provider: "iyzico", merchant: `iyzico:${MERCHANT}`, subscriptionRef: "sub_old" },
        "2026-01-15T00:00:00.000Z"
      ),
      merchantAccount: "paytr:1",
      providerSubscriptionRef: "sub_old",
    });
    const rawBody = JSON.stringify({
      iyziEventType: "subscription.order.success",
      iyziReferenceCode: "iyzi_legacy_1",
      orderReferenceCode: "ord_legacy_1",
      customerReferenceCode: "cus_old",
      subscriptionReferenceCode: "sub_old",
      iyziEventTime: Date.parse(NOW),
    });
    const res = await processIyzicoSubscriptionWebhook({
      rawBody,
      signatureHeader: sign({ eventType: "subscription.order.success", sub: "sub_old", order: "ord_legacy_1", customer: "cus_old" }),
      resolveTenant: async (ref) => (ref === "sub_old" ? T1 : null),
      nowIso: NOW,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.outcome).toBe("processed");
    expect((await getSaasSubscription(T1))?.status).toBe("active");
    delete process.env.IYZICO_SECRET_KEY;
    delete process.env.IYZICO_MERCHANT_ID;
  });
  it("bağlantısız eski sağlayıcı olayı reddedilir", async () => {
    process.env.IYZICO_SECRET_KEY = SECRET;
    process.env.IYZICO_MERCHANT_ID = MERCHANT;
    const sub = buildPendingSubscription({
      tenantId: T1,
      provider: "paytr",
      planKey: "core",
      catalogVersion: null,
      billingInterval: "monthly",
      priceSnapshot: snapshot(),
    });
    await upsertSaasSubscription({ ...sub, merchantAccount: "paytr:1", providerSubscriptionRef: "sub_x" });
    const rawBody = JSON.stringify({
      iyziEventType: "subscription.order.success",
      iyziReferenceCode: "iyzi_legacy_2",
      orderReferenceCode: "ord_legacy_2",
      customerReferenceCode: "cus_x",
      subscriptionReferenceCode: "sub_x",
      iyziEventTime: Date.parse(NOW),
    });
    const res = await processIyzicoSubscriptionWebhook({
      rawBody,
      signatureHeader: sign({ eventType: "subscription.order.success", sub: "sub_x", order: "ord_legacy_2", customer: "cus_x" }),
      resolveTenant: async () => T1,
      nowIso: NOW,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.outcome).toBe("failed");
    expect((await getSaasSubscription(T1))?.status).toBe("pending");
    delete process.env.IYZICO_SECRET_KEY;
    delete process.env.IYZICO_MERCHANT_ID;
  });
});

describe("Q1: gönderilmiş-belirsiz işlem süreyle serbest kalmaz", () => {
  it("timeout → sorgu sonuçsuz → 25 SAAT geçse de ikinci çekim YOK; geç callback finalize eder", async () => {
    const sub = await seedDueSub();
    paytrEnv();
    let chargeCalls = 0;
    // 1. koşu: çekim gönderilir, sonuç ulaşmaz (timeout).
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { body?: unknown }) => {
        if (String(init?.body ?? "").includes("recurring_payment")) chargeCalls += 1;
        const e = new Error("aborted") as Error & { name: string };
        e.name = "AbortError";
        throw e;
      })
    );
    const r1 = await collectDueSubscriptions({ dryRun: false, nowIso: "2026-02-01T00:00:00.000Z" });
    if (!r1.ok) return;
    expect(r1.data.uncertain).toBe(1);
    expect(chargeCalls).toBe(1);
    const claim = (await listSaasAttempts(sub.id, 50))[0];
    expect(claim.status).toBe("uncertain");
    expect(claim.sentAt).toBeTruthy();

    // 2. koşu ("ikinci worker", 25 SAAT sonra): sorgu ısrarla sonuçsuz.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { body?: unknown }) => {
        if (String(init?.body ?? "").includes("recurring_payment")) chargeCalls += 1;
        return { ok: true, json: async () => ({ status: "error", err_msg: "kayıt yok" }) };
      })
    );
    const r2 = await collectDueSubscriptions({ dryRun: false, nowIso: "2026-02-02T01:00:00.000Z" });
    if (!r2.ok) return;
    expect(chargeCalls).toBe(1); // YENİ dış çekim YOK.
    expect(r2.data.charged).toBe(0);
    expect(r2.data.skipped[0]).toContain("belirsiz");
    const stuck = (await listSaasAttempts(sub.id, 50))[0];
    expect(stuck.status).toBe("uncertain");
    expect(stuck.error).toContain("STUCK_REVIEW");

    // 3. İlk işlem için geç başarı bildirimi gelir → finalize, çift çekim yok.
    const form = {
      merchant_oid: claim.providerRef as string,
      status: "success",
      total_amount: "50000",
      hash: paytrCallbackHash({
        merchantKey: "k",
        merchantSalt: "s",
        merchantOid: claim.providerRef as string,
        status: "success",
        totalAmount: "50000",
      }),
    };
    const cb = await processPaytrCallback({ form, nowIso: "2026-02-02T02:00:00.000Z" });
    expect(cb.ok).toBe(true);
    if (!cb.ok) return;
    expect(cb.data.outcome).toBe("processed");
    expect((await getSaasSubscription(T1))?.status).toBe("active");
    expect((await getSaasSubscription(T1))?.paidThrough).toBe("2026-03-01T00:00:00.000Z");
    expect(chargeCalls).toBe(1);
    expect((await listSaasAttempts(sub.id, 50)).filter((a) => a.status === "succeeded")).toHaveLength(1);
  });

  it("operatör serbest bırakma: uncertain kapanır, pending'e dokunulmaz", async () => {
    const { releaseStuckClaim } = await import("../saas-billing/store");
    const sub = await seedDueSub();
    const mk = (id: string, status: "uncertain" | "pending", key: string) =>
      recordSaasAttempt({
        id,
        tenantId: T1,
        subscriptionId: sub.id,
        periodStart: "2026-02-01T00:00:00.000Z",
        periodEnd: "2026-03-01T00:00:00.000Z",
        debtKey: `${sub.id}:2026-02-01T00:00:00.000Z`,
        amountMinor: 50000,
        currency: "TRY",
        status,
        kind: "charge",
        attemptNo: 1,
        idempotencyKey: key,
        provider: "paytr",
        merchantAccount: "paytr:1",
        providerRef: `oid_${id}`,
        providerEventId: null,
        error: "x",
        sentAt: status === "uncertain" ? "2026-02-01T00:00:00.000Z" : null,
        retryable: null,
        createdAt: "2026-02-01T00:00:00.000Z",
      });
    await mk("att_rel_u", "uncertain", "idem_rel_u");
    // Aynı borca ikinci açık satır yazılamaz (open-claim koruması) — pending
    // ayrı borçla yazılır.
    const pend = await recordSaasAttempt({
      id: "att_rel_p",
      tenantId: T1,
      subscriptionId: sub.id,
      periodStart: "2026-03-01T00:00:00.000Z",
      periodEnd: "2026-04-01T00:00:00.000Z",
      debtKey: `${sub.id}:2026-03-01T00:00:00.000Z`,
      amountMinor: 50000,
      currency: "TRY",
      status: "pending",
      kind: "charge",
      attemptNo: 1,
      idempotencyKey: "idem_rel_p",
      provider: "paytr",
      merchantAccount: "paytr:1",
      providerRef: "oid_rel_p",
      providerEventId: null,
      error: null,
      sentAt: null,
      retryable: null,
      createdAt: "2026-02-01T00:00:00.000Z",
    });
    expect(pend.duplicate).toBe(false);
    expect(
      await releaseStuckClaim({
        attemptId: "att_rel_u",
        reason: "PayTR panelinde bu oid için ücret görünmüyor.",
        actorUserId: "hyper1",
        externalRef: "panel-2026-02-02-001",
      })
    ).toBe(true);
    expect(
      await releaseStuckClaim({
        attemptId: "att_rel_p",
        reason: "deneme",
        actorUserId: "hyper1",
        externalRef: "x",
      })
    ).toBe(false);
    expect(
      await releaseStuckClaim({
        attemptId: "att_rel_u",
        reason: "tekrar",
        actorUserId: "hyper1",
        externalRef: "x",
      })
    ).toBe(false);
    const { getSaasAttemptById } = await import("../saas-billing/store");
    expect((await getSaasAttemptById("att_rel_u"))?.status).toBe("failed");
    expect((await getSaasAttemptById("att_rel_u"))?.error).toContain("operator_released");
    expect((await getSaasAttemptById("att_rel_p"))?.status).toBe("pending");
  });

  it("serbest bırakma sonrası yeni çekim açılabilir (operatör izniyle)", async () => {
    const sub = await seedDueSub();
    paytrEnv();
    const { releaseStuckClaim } = await import("../saas-billing/store");
    await recordSaasAttempt({
      id: "att_rel_r",
      tenantId: T1,
      subscriptionId: sub.id,
      periodStart: "2026-02-01T00:00:00.000Z",
      periodEnd: "2026-03-01T00:00:00.000Z",
      debtKey: `${sub.id}:2026-02-01T00:00:00.000Z`,
      amountMinor: 50000,
      currency: "TRY",
      status: "uncertain",
      kind: "charge",
      attemptNo: 1,
      idempotencyKey: "idem_rel_r",
      provider: "paytr",
      merchantAccount: "paytr:1",
      providerRef: "oid_rel_r",
      providerEventId: null,
      error: "STUCK_REVIEW: test",
      sentAt: "2026-02-01T00:00:00.000Z",
      retryable: null,
      createdAt: "2026-02-01T00:00:00.000Z",
    });
    expect(
      await releaseStuckClaim({
        attemptId: "att_rel_r",
        reason: "Panelde ücret yok, yeniden çekime izin verildi.",
        actorUserId: "hyper1",
        externalRef: "panel-002",
      })
    ).toBe(true);
    let chargeCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { body?: unknown }) => {
        if (String(init?.body ?? "").includes("recurring_payment")) chargeCalls += 1;
        return { ok: true, json: async () => ({ status: "success" }) };
      })
    );
    const r = await collectDueSubscriptions({ dryRun: false, nowIso: "2026-02-03T00:00:00.000Z" });
    if (!r.ok) return;
    expect(r.data.charged).toBe(1);
    expect(chargeCalls).toBe(1);
  });

  it("gönderilmemiş-bayat claim: sorgu kayıt-yok + expire → yeni çekim (kilitli davranış)", async () => {
    const sub = await seedDueSub();
    paytrEnv();
    await recordSaasAttempt({
      id: "att_nsent_1",
      tenantId: T1,
      subscriptionId: sub.id,
      periodStart: "2026-02-01T00:00:00.000Z",
      periodEnd: "2026-03-01T00:00:00.000Z",
      debtKey: `${sub.id}:2026-02-01T00:00:00.000Z`,
      amountMinor: 50000,
      currency: "TRY",
      status: "pending",
      kind: "charge",
      attemptNo: 1,
      idempotencyKey: "idem_nsent_1",
      provider: "paytr",
      merchantAccount: "paytr:1",
      providerRef: "oid_nsent",
      providerEventId: null,
      error: null,
      sentAt: null,
      retryable: null,
      createdAt: "2026-02-01T00:00:00.000Z",
    });
    let chargeCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { body?: unknown }) => {
        const body = String(init?.body ?? "");
        if (body.includes("recurring_payment")) {
          chargeCalls += 1;
          return { ok: true, json: async () => ({ status: "success" }) };
        }
        return { ok: true, json: async () => ({ status: "error", err_msg: "kayıt yok" }) };
      })
    );
    const r = await collectDueSubscriptions({ dryRun: false, nowIso: "2026-02-01T01:00:00.000Z" });
    if (!r.ok) return;
    expect(r.data.charged).toBe(1);
    expect(chargeCalls).toBe(1);
    const { getSaasAttemptById } = await import("../saas-billing/store");
    expect((await getSaasAttemptById("att_nsent_1"))?.status).toBe("failed");
    expect((await getSaasAttemptById("att_nsent_1"))?.error).toContain("claim_expired_unsent");
  });
});

describe("job endpoint auth", () => {
  it("secret yoksa/yanlışsa 401; doğruysa dry-run 200", async () => {
    const { GET } = await import("../../app/api/v1/platform/jobs/saas-collections/route");
    const noAuth = await GET(new Request("http://localhost/api/v1/platform/jobs/saas-collections"));
    expect(noAuth.status).toBe(401);
    process.env.BILLING_CRON_SECRET = "0123456789abcdef0123456789abcdef";
    const wrong = await GET(
      new Request("http://localhost/api/v1/platform/jobs/saas-collections", {
        headers: { authorization: "Bearer [REDACTED]" },
      })
    );
    expect(wrong.status).toBe(401);
    const okRes = await GET(
      new Request("http://localhost/api/v1/platform/jobs/saas-collections", {
        headers: { authorization: "Bearer 0123456789abcdef0123456789abcdef" },
      })
    );
    expect(okRes.status).toBe(200);
    const json = (await okRes.json()) as { ok: boolean; data: { dryRun: boolean } };
    expect(json.ok).toBe(true);
    expect(json.data.dryRun).toBe(true);
  });
});
