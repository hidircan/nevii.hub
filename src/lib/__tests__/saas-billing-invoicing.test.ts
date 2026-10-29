import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetSaasBillingStoreForTests,
  getInvoiceOrderByAttempt,
  listTenantInvoiceOrders,
  saveBillingProfile,
} from "../saas-billing/store";
import {
  isValidTcknFormat,
  isValidVknFormat,
  maskTaxId,
  validateBillingProfile,
  type BillingProfileRecord,
} from "../saas-billing/invoicing-profile";
import {
  ensureInvoiceOrderForAttempt,
  requestDocument,
  retryDocument,
  resolveEDocumentProvider,
} from "../saas-billing/invoicing-orders";
import type { SaasCollectionAttemptRecord, SaasPriceSnapshot } from "../saas-billing/types";

const T = "tenant_demo_1";

function profile(over: Partial<BillingProfileRecord> = {}): BillingProfileRecord {
  const now = new Date().toISOString();
  return {
    id: "saas_bprof_1",
    tenantId: T,
    displayName: "Demo Müzik",
    recipientType: "corporate",
    legalTitle: "Demo Müzik Eğitim A.Ş.",
    taxId: "1234567890",
    nationalId: null,
    taxOffice: "Kadıköy",
    addressLine: "Örnek Mah. Deneme Sk. No:1",
    district: "Kadıköy",
    city: "İstanbul",
    country: "Türkiye",
    invoiceEmail: "fatura@demo-muzik.test",
    contactName: null,
    contactPhone: null,
    eInvoiceRegistered: null,
    eInvoiceRegisteredAt: null,
    eInvoiceAlias: null,
    version: 1,
    updatedBy: "u1",
    createdAt: now,
    updatedAt: now,
    audit: [],
    ...over,
  };
}

function attempt(over: Partial<SaasCollectionAttemptRecord> = {}): SaasCollectionAttemptRecord {
  const now = new Date().toISOString();
  return {
    id: "saas_att_1",
    tenantId: T,
    subscriptionId: "saas_sub_1",
    periodStart: now,
    periodEnd: now,
    debtKey: "saas_sub_1:" + now,
    amountMinor: 360000,
    currency: "TRY",
    status: "succeeded",
    kind: "charge",
    attemptNo: 1,
    idempotencyKey: "k1",
    provider: "mock",
    merchantAccount: "mock:test",
    providerRef: "mock_ref_1",
    providerEventId: "ev1",
    error: null,
    sentAt: now,
    retryable: null,
    createdAt: now,
    ...over,
  };
}

function snapshot(): SaasPriceSnapshot {
  return {
    planKey: "pro",
    planLabel: "Pro",
    catalogVersion: null,
    billingInterval: "monthly",
    currency: "TRY",
    amountMinor: 300000,
    monthlyEquivalentMinor: null,
    taxRateBps: 2000,
    taxAmountMinor: 60000,
    totalWithTaxMinor: 360000,
    taxDemo: true,
    campaignCode: null,
    campaignNote: null,
    postCampaignNote: null,
    limits: { students: 750, users: 25, branches: 5 },
    includedModules: [],
    taxNote: "Tutarlar KDV hariçtir (+ KDV).",
    renewalNote: "Her ay otomatik tahsilat yapılır.",
    acceptedAt: new Date().toISOString(),
    acceptedBy: "u1",
    sandbox: true,
  };
}

const OLD_ENV = { ...process.env };

const ENV = process.env as Record<string, string | undefined>;

beforeEach(async () => {
  await __resetSaasBillingStoreForTests();
  delete process.env.STORE_MODE;
  process.env.SAAS_BILLING_PROVIDER = "mock";
  delete process.env.VERCEL_ENV;
  ENV.NODE_ENV = "test";
});

afterEach(() => {
  process.env.SAAS_BILLING_PROVIDER = OLD_ENV.SAAS_BILLING_PROVIDER ?? "";
  if (!process.env.SAAS_BILLING_PROVIDER) delete process.env.SAAS_BILLING_PROVIDER;
});

describe("fatura profili — validasyon", () => {
  it("tüzel kişide VKN zorunlu; biçimsiz VKN reddedilir", () => {
    const base = {
      displayName: "Demo",
      recipientType: "corporate",
      legalTitle: "Demo A.Ş.",
      addressLine: "Adres satırı uzunluğu yeterli",
      city: "İstanbul",
      country: "Türkiye",
      invoiceEmail: "fatura@demo-muzik.test",
    } as const;
    expect(validateBillingProfile({ ...base }).ok).toBe(false);
    expect(validateBillingProfile({ ...base, taxId: "123" }).ok).toBe(false);
    expect(isValidVknFormat("1234567890")).toBe(true);
    expect(isValidVknFormat("123456789")).toBe(false);
    expect(validateBillingProfile({ ...base, taxId: "1234567890" }).ok).toBe(true);
  });

  it("TCKN algoritması çalışır; geçersiz numara reddedilir", () => {
    expect(isValidTcknFormat("10000000146")).toBe(true);
    expect(isValidTcknFormat("10000000147")).toBe(false);
    expect(isValidTcknFormat("01234567890")).toBe(false);
    const r = validateBillingProfile({
      displayName: "Demo",
      recipientType: "individual",
      legalTitle: "Ad Soyad",
      nationalId: "10000000147",
      addressLine: "Adres satırı uzunluğu yeterli",
      city: "İstanbul",
      country: "Türkiye",
      invoiceEmail: "fatura@demo-muzik.test",
    });
    expect(r.ok).toBe(false);
  });

  it("bireyselde TCKN veya VKN'den biri şart", () => {
    const base = {
      displayName: "Demo",
      recipientType: "individual",
      legalTitle: "Ad Soyad",
      addressLine: "Adres satırı uzunluğu yeterli",
      city: "İstanbul",
      country: "Türkiye",
      invoiceEmail: "fatura@demo-muzik.test",
    } as const;
    expect(validateBillingProfile({ ...base }).ok).toBe(false);
    expect(validateBillingProfile({ ...base, nationalId: "10000000146" }).ok).toBe(true);
  });

  it("maskeleme kimlik bilgisini gizler", () => {
    expect(maskTaxId("1234567890")).toBe("••••••7890");
    expect(maskTaxId(null)).toBe("—");
    expect(maskTaxId("1234567890")).not.toContain("123456");
  });
});

describe("sipariş snapshot", () => {
  it("doğrulanmış tahsilat için tek sipariş; tekrar aynı kayıt", async () => {
    await saveBillingProfile(profile());
    const a = attempt();
    const r1 = await ensureInvoiceOrderForAttempt({
      attempt: a,
      subscriptionId: "saas_sub_1",
      tenantId: T,
      priceSnapshot: snapshot(),
      planLabel: "Pro",
    });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.data.created).toBe(true);
    expect(r1.data.order.totalMinor).toBe(360000);
    expect(r1.data.order.taxMinor).toBe(60000);
    const r2 = await ensureInvoiceOrderForAttempt({
      attempt: a,
      subscriptionId: "saas_sub_1",
      tenantId: T,
      priceSnapshot: snapshot(),
      planLabel: "Pro",
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.data.created).toBe(false);
    expect(r2.data.order.id).toBe(r1.data.order.id);
    expect(await getInvoiceOrderByAttempt(a.id)).not.toBeNull();
  });

  it("başarısız tahsilat ve profilsiz kurum için sipariş oluşmaz", async () => {
    const r1 = await ensureInvoiceOrderForAttempt({
      attempt: attempt({ id: "a2", status: "failed" }),
      subscriptionId: "saas_sub_1",
      tenantId: T,
      priceSnapshot: snapshot(),
      planLabel: "Pro",
    });
    expect(r1.ok).toBe(false);
    const r2 = await ensureInvoiceOrderForAttempt({
      attempt: attempt({ id: "a3" }),
      subscriptionId: "saas_sub_1",
      tenantId: T,
      priceSnapshot: snapshot(),
      planLabel: "Pro",
    });
    expect(r2.ok).toBe(false);
  });

  it("profil değişimi eski sipariş snapshot'ını değiştirmez", async () => {
    await saveBillingProfile(profile());
    const r = await ensureInvoiceOrderForAttempt({
      attempt: attempt(),
      subscriptionId: "saas_sub_1",
      tenantId: T,
      priceSnapshot: snapshot(),
      planLabel: "Pro",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    await saveBillingProfile(profile({ legalTitle: "Yeni Unvan A.Ş.", version: 2 }));
    const again = await getInvoiceOrderByAttempt(attempt().id);
    // attempt() her çağrıda aynı id'yi üretir (sabit fixture).
    expect(again?.buyer.legalTitle).toBe("Demo Müzik Eğitim A.Ş.");
  });

  it("tenant izolasyonu: liste yalnız kendi siparişlerini döner", async () => {
    await saveBillingProfile(profile());
    await saveBillingProfile(profile({ id: "saas_bprof_2", tenantId: "tenant_demo_2" }));
    await ensureInvoiceOrderForAttempt({
      attempt: attempt(),
      subscriptionId: "saas_sub_1",
      tenantId: T,
      priceSnapshot: snapshot(),
      planLabel: "Pro",
    });
    await ensureInvoiceOrderForAttempt({
      attempt: attempt({ id: "saas_att_2", tenantId: "tenant_demo_2" }),
      subscriptionId: "saas_sub_2",
      tenantId: "tenant_demo_2",
      priceSnapshot: snapshot(),
      planLabel: "Pro",
    });
    expect(await listTenantInvoiceOrders(T, 50)).toHaveLength(1);
    expect(await listTenantInvoiceOrders("tenant_demo_2", 50)).toHaveLength(1);
  });
});

describe("e-belge durum makinesi", () => {
  async function makeOrder() {
    await saveBillingProfile(profile());
    const r = await ensureInvoiceOrderForAttempt({
      attempt: attempt(),
      subscriptionId: "saas_sub_1",
      tenantId: T,
      priceSnapshot: snapshot(),
      planLabel: "Pro",
    });
    if (!r.ok) throw new Error("sipariş kurulamadı");
    return r.data.order;
  }

  it("demo modda önizleme üretilir; ETTN/belge no tahsis edilmez", async () => {
    expect(resolveEDocumentProvider().id).toBe("demo");
    const order = await makeOrder();
    const r = await requestDocument(order.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.created).toBe(true);
    expect(r.data.doc.kind).toBe("demo_preview");
    expect(r.data.doc.status).toBe("issued");
    expect(r.data.doc.ettn).toBeNull();
    expect(r.data.doc.documentNo).toBeNull();
  });

  it("ikinci belge talebi yeni kayıt açmaz (duplicate webhook güvenliği)", async () => {
    const order = await makeOrder();
    const r1 = await requestDocument(order.id);
    const r2 = await requestDocument(order.id);
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r2.data.created).toBe(false);
    expect(r2.data.doc.id).toBe(r1.data.doc.id);
  });

  it("entegratör yokken manuel bekleme; retry sınırı var", async () => {
    process.env.SAAS_BILLING_PROVIDER = "paytr";
    expect(resolveEDocumentProvider().id).toBe("manual");
    const order = await makeOrder();
    const r = await requestDocument(order.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.doc.status).toBe("manual_pending");
    for (let i = 0; i < 5; i++) {
      const rr = await retryDocument(r.data.doc.id);
      expect(rr.ok).toBe(true);
    }
    const over = await retryDocument(r.data.doc.id);
    expect(over.ok).toBe(false);
  });

  it("demo adapter production'da çalışmaz", async () => {
    const { demoEDocumentProvider } = await import("../saas-billing/invoicing-orders");
    ENV.NODE_ENV = "production";
    const order = await makeOrder();
    const res = await demoEDocumentProvider.issue(order, "demo_preview");
    expect(res.ok).toBe(false);
    ENV.NODE_ENV = "test";
  });
});
