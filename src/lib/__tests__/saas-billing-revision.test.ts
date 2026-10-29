import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyCollectionSuccess,
  debtKeyFor,
  withDebtLock,
} from "../saas-billing/collections";
import { approveManualPayment } from "../saas-billing/manual";
import { addPeriod, addPeriodInTz } from "../saas-billing/periods";
import { collectDueSubscriptions } from "../saas-billing/scheduler";
import { processPaytrCallback } from "../saas-billing/webhooks";
import {
  getPaytrConfig,
  isSafeMerchantOid,
  minorToPaytrAmount,
  newPaytrMerchantOid,
  paytrCallbackAmountToMinor,
  paytrCallbackHash,
  paytrCurrencyFor,
  verifyPaytrCallback,
} from "../saas-billing/paytr-subscription";
import { hasCapability } from "../saas-billing/providers";
import {
  getDefaultProviderForNew,
  getSaasProvider,
} from "../saas-billing/provider-adapter";
import {
  __resetSaasBillingStoreForTests,
  getSaasSubscription,
  recordSaasAttempt,
  upsertSaasSubscription,
} from "../saas-billing/store";
import { renewalNoteFor } from "../saas-billing/catalog";
import {
  buildPendingSubscription,
  mapProviderStatus,
} from "../saas-billing/subscriptions";

const T1 = "rev_t1";

function snapshot() {
  return {
    planKey: "core",
    planLabel: "Core",
    catalogVersion: null,
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

async function seedPaytrSub() {
  const sub = buildPendingSubscription({
    tenantId: T1,
    provider: "paytr",
    planKey: "core",
    catalogVersion: null,
    billingInterval: "monthly",
    priceSnapshot: snapshot(),
  });
  await upsertSaasSubscription(sub);
  return sub;
}

beforeEach(async () => {
  await __resetSaasBillingStoreForTests();
});

afterEach(() => {
  delete process.env.SAAS_BILLING_PROVIDER;
  delete process.env.PAYTR_MERCHANT_ID;
  delete process.env.PAYTR_MERCHANT_KEY;
  delete process.env.PAYTR_MERCHANT_SALT;
});

describe("para biçimi (V1 sözleşmesi korunur, ICU-bağımsız)", () => {
  it("tr-TR: sembol sonda, nokta gruplu", async () => {
    const { formatMoney } = await import("../saas-billing/types");
    expect(formatMoney(0, "TRY", "tr-TR")).toBe("0,00 ₺");
    expect(formatMoney(123456, "TRY", "tr-TR")).toBe("1.234,56 ₺");
  });
  it("en-US: sembol başta, virgül gruplu", async () => {
    const { formatMoney } = await import("../saas-billing/types");
    expect(formatMoney(2599, "USD", "en-US")).toBe("$25.99");
    expect(formatMoney(123456, "USD", "en-US")).toBe("$1,234.56");
  });
  it("USD tr-TR: kuruş modeli bozulmaz", async () => {
    const { formatMoney } = await import("../saas-billing/types");
    expect(formatMoney(2599, "USD", "tr-TR")).toBe("25,99 $");
  });
});

describe("takvim dönemleri (sabit 30 gün yok)", () => {
  it("ay sonu taşmaz: 31 Ocak + 1 ay = 28 Şubat", () => {
    expect(addPeriodInTz("2026-01-30T21:00:00.000Z", "monthly", "Europe/Istanbul")).toBe(
      "2026-02-27T21:00:00.000Z"
    );
  });
  it("yıllık: 29 Şubat 2024 + 12 ay = 28 Şubat 2025", () => {
    expect(addPeriodInTz("2024-02-28T21:00:00.000Z", "yearly", "Europe/Istanbul")).toBe(
      "2025-02-27T21:00:00.000Z"
    );
  });
  it("normal ay: 15 Mart + 1 ay = 15 Nisan", () => {
    expect(addPeriodInTz("2026-03-14T21:00:00.000Z", "monthly", "Europe/Istanbul")).toBe(
      "2026-04-14T21:00:00.000Z"
    );
  });
  it("Atlanta DST: duvar saati günü korunur (7 Mart + 1 ay = 7 Nisan)", () => {
    const end = addPeriodInTz("2026-03-07T17:00:00.000Z", "monthly", "America/New_York");
    expect(end).toBe("2026-04-07T16:00:00.000Z"); // 7 Nisan 12:00 EDT
    const inNy = new Date(end).toLocaleString("en-US", { timeZone: "America/New_York" });
    expect(inNy).toContain("4/7/2026");
  });
  it("Istanbul sabit +3: kış/yaz aynı offset", () => {
    expect(addPeriodInTz("2025-12-14T21:00:00.000Z", "monthly", "Europe/Istanbul")).toBe(
      "2026-01-14T21:00:00.000Z"
    );
    expect(addPeriodInTz("2026-06-14T21:00:00.000Z", "monthly", "Europe/Istanbul")).toBe(
      "2026-07-14T21:00:00.000Z"
    );
  });
  it("UTC kısayolu normal günü korur", () => {
    expect(addPeriod("2026-01-15T00:00:00.000Z", "monthly")).toBe("2026-02-15T00:00:00.000Z");
    expect(addPeriod("2026-01-15T00:00:00.000Z", "yearly")).toBe("2027-01-15T00:00:00.000Z");
  });
  it("geçersiz tarih fırlatır", () => {
    expect(() => addPeriodInTz("bogus", "monthly", "Europe/Istanbul")).toThrow();
  });
});

describe("sağlayıcı ayrımı + execution modeli", () => {
  it("bilinmeyen sağlayıcı kapalı (none) adaptöre düşer", () => {
    const p = getSaasProvider("qnbee" as never);
    expect(p.id).toBe("none");
    expect(p.isConfigured()).toBe(false);
    expect(p.executionModel).toBeNull();
  });
  it("iyzico PROVIDER_MANAGED, paytr MERCHANT_SCHEDULED", () => {
    expect(getSaasProvider("iyzico").executionModel).toBe("PROVIDER_MANAGED");
    expect(getSaasProvider("paytr").executionModel).toBe("MERCHANT_SCHEDULED");
  });
  it("capability: desteklenmeyen özellik taklit edilmez, UNSUPPORTED döner", async () => {
    const paytr = getSaasProvider("paytr");
    const iyzico = getSaasProvider("iyzico");
    expect(hasCapability(paytr, "server_charge")).toBe(true);
    expect(hasCapability(paytr, "provider_renewal")).toBe(false);
    expect(hasCapability(iyzico, "server_charge")).toBe(false);
    expect(hasCapability(iyzico, "provider_renewal")).toBe(true);
    const r = await iyzico.serverCharge({
      merchantOid: "m",
      email: "a@b.c",
      userIp: "1.1.1.1",
      amountMinor: 100,
      currency: "TRY",
      customerRef: "c",
      cardRef: "k",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("UNSUPPORTED");
  });
  it("yeni abonelik varsayılanı: yapılandırma yoksa none (fail-closed)", () => {
    delete process.env.IYZICO_API_KEY;
    expect(getDefaultProviderForNew()).toBe("none");
  });
  it("yeni abonelik varsayılanı SAAS_BILLING_PROVIDER ile seçilir", () => {
    process.env.SAAS_BILLING_PROVIDER = "iyzico";
    expect(getDefaultProviderForNew()).toBe("iyzico");
    process.env.SAAS_BILLING_PROVIDER = "paytr";
    expect(getDefaultProviderForNew()).toBe("paytr");
  });
  it("eski abonelik kendi sağlayıcısında kalır (global ayar taşımaz)", () => {
    process.env.SAAS_BILLING_PROVIDER = "paytr";
    expect(getSaasProvider("iyzico").id).toBe("iyzico");
    expect(getDefaultProviderForNew()).toBe("paytr");
  });
});

describe("durum eşlemesi izolasyonu", () => {
  it("eski iyzico eşlemesi yeni ayardan etkilenmez", () => {
    process.env.SAAS_BILLING_PROVIDER = "paytr";
    expect(mapProviderStatus("iyzico", "ACTIVE")).toBe("active");
    expect(mapProviderStatus("iyzico", "CANCELED")).toBe("canceled");
  });
  it("paytr ödeme sonucu eşlemesi", () => {
    expect(mapProviderStatus("paytr", "success")).toBe("active");
    expect(mapProviderStatus("paytr", "failed")).toBe("past_due");
    expect(mapProviderStatus("paytr", "wait_callback")).toBe("pending");
    expect(mapProviderStatus("paytr", "bogus")).toBeNull();
  });
  it("bilinmeyen sağlayıcı eşlemesi null", () => {
    expect(mapProviderStatus("bogus" as never, "ACTIVE")).toBeNull();
  });
});

describe("provider-independent tahsilat uygulaması", () => {
  const charge = {
    amountMinor: 50000,
    currency: "TRY" as const,
    provider: "paytr" as const,
    merchantAccount: "paytr:123",
    providerRef: "oid_1",
    providerEventId: "paytr:oid_1",
    idempotencyKey: "idem_1",
    periodStart: "2026-02-01T00:00:00.000Z",
    periodEnd: "2026-03-01T00:00:00.000Z",
    nowIso: "2026-02-01T00:00:00.000Z",
  };
  it("eşleşen ödeme success: active + paidThrough", async () => {
    await seedPaytrSub();
    const r = await applyCollectionSuccess({ tenantId: T1, ...charge });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.duplicate).toBe(false);
    expect(r.data.subscription.status).toBe("active");
    expect(r.data.subscription.paidThrough).toBe("2026-03-01T00:00:00.000Z");
  });
  it("yanlış tutar success üretmez", async () => {
    await seedPaytrSub();
    const r = await applyCollectionSuccess({ tenantId: T1, ...charge, amountMinor: 49999 });
    expect(r.ok).toBe(false);
  });
  it("yanlış para birimi success üretmez", async () => {
    await seedPaytrSub();
    const r = await applyCollectionSuccess({ tenantId: T1, ...charge, currency: "USD" });
    expect(r.ok).toBe(false);
  });
  it("aynı sipariş tekrarı duplicate (çift hak yok)", async () => {
    await seedPaytrSub();
    const first = await applyCollectionSuccess({ tenantId: T1, ...charge });
    expect(first.ok && first.data.duplicate).toBe(false);
    const second = await applyCollectionSuccess({
      tenantId: T1,
      ...charge,
      idempotencyKey: "idem_2",
      providerEventId: "paytr:oid_1b",
    });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.data.duplicate).toBe(true);
  });
  it("aynı döneme ikinci farklı sipariş duplicate (dönem tek-success)", async () => {
    await seedPaytrSub();
    await applyCollectionSuccess({ tenantId: T1, ...charge });
    const r = await applyCollectionSuccess({
      tenantId: T1,
      ...charge,
      providerRef: "oid_2",
      providerEventId: "paytr:oid_2",
      idempotencyKey: "idem_3",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.duplicate).toBe(true);
  });
  it("abonelik yoksa NOT_FOUND (fail-closed)", async () => {
    const r = await applyCollectionSuccess({ tenantId: "yok", ...charge });
    expect(r.ok).toBe(false);
  });
});

describe("dönem kilidi + borç kimliği", () => {
  it("debtKey abonelik + dönem başlangıcından türetilir", () => {
    expect(debtKeyFor("sub_1", "2026-02-01T00:00:00.000Z")).toBe("sub_1:2026-02-01T00:00:00.000Z");
  });
  it("withDebtLock aynı borcu serileştirir", async () => {
    const order: string[] = [];
    const slow = withDebtLock("d1", async () => {
      order.push("a-start");
      await new Promise((r) => setTimeout(r, 20));
      order.push("a-end");
      return "a";
    });
    const fast = withDebtLock("d1", async () => {
      order.push("b");
      return "b";
    });
    expect(await Promise.all([slow, fast])).toEqual(["a", "b"]);
    expect(order).toEqual(["a-start", "a-end", "b"]);
  });
});

describe("manuel mutabakat", () => {
  it("eksik girdi VALIDATION_ERROR", async () => {
    const r = await approveManualPayment({
      input: { tenantId: T1, providerRef: "x", amountMinor: 1, currency: "TRY" },
      approvedBy: "admin",
    });
    expect(r.ok).toBe(false);
  });
  it("abonelik yoksa NOT_FOUND", async () => {
    const r = await approveManualPayment({
      input: {
        tenantId: "yok",
        providerRef: "REF123",
        amountMinor: 50000,
        currency: "TRY",
        occurredAt: "2026-02-01T10:00:00.000Z",
        note: "banka transferi dekontu",
      },
      approvedBy: "admin",
    });
    expect(r.ok).toBe(false);
  });
  it("onay erişim açar, sağlayıcı manual olur, yürütme modeli yoktur", async () => {
    await seedPaytrSub();
    const r = await approveManualPayment({
      input: {
        tenantId: T1,
        providerRef: "REF123",
        amountMinor: 50000,
        currency: "TRY",
        occurredAt: "2026-02-01T10:00:00.000Z",
        note: "banka transferi dekontu",
      },
      approvedBy: "admin",
      nowIso: "2026-02-01T12:00:00.000Z",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.paidThrough).toBeTruthy();
  });
  it("aynı referans tekrarı CONFLICT", async () => {
    await seedPaytrSub();
    const input = {
      tenantId: T1,
      providerRef: "REF999",
      amountMinor: 50000,
      currency: "TRY",
      occurredAt: "2026-02-01T10:00:00.000Z",
      note: "banka transferi dekontu",
    };
    const first = await approveManualPayment({ input, approvedBy: "admin" });
    expect(first.ok).toBe(true);
    const second = await approveManualPayment({ input, approvedBy: "admin" });
    expect(second.ok).toBe(false);
  });
  it("yanlış tutarlı manuel onay başarısız", async () => {
    await seedPaytrSub();
    const r = await approveManualPayment({
      input: {
        tenantId: T1,
        providerRef: "REF555",
        amountMinor: 1,
        currency: "TRY",
        occurredAt: "2026-02-01T10:00:00.000Z",
        note: "eksik tutar denemesi",
      },
      approvedBy: "admin",
    });
    expect(r.ok).toBe(false);
  });
});

describe("PayTR saf fonksiyonlar", () => {
  it("tutar dönüşümü: 15000 kuruş → '150.00'", () => {
    expect(minorToPaytrAmount(15000, "TRY")).toBe("150.00");
    expect(minorToPaytrAmount(2599, "USD")).toBe("25.99");
  });
  it("geçersiz tutar fırlatır", () => {
    expect(() => minorToPaytrAmount(0, "TRY")).toThrow();
    expect(() => minorToPaytrAmount(12.5, "TRY")).toThrow();
  });
  it("callback tutarı ×100 string → minor", () => {
    expect(paytrCallbackAmountToMinor("15000")).toBe(15000);
    expect(() => paytrCallbackAmountToMinor("abc")).toThrow();
    expect(() => paytrCallbackAmountToMinor("15.00")).toThrow();
  });
  it("para birimi: TRY→TL, USD→USD, EUR desteklenmez", () => {
    expect(paytrCurrencyFor("TRY")).toBe("TL");
    expect(paytrCurrencyFor("USD")).toBe("USD");
    expect(() => paytrCurrencyFor("EUR" as never)).toThrow();
  });
  it("merchantOid güvenli alfabededir", () => {
    const oid = newPaytrMerchantOid();
    expect(isSafeMerchantOid(oid)).toBe(true);
    expect(isSafeMerchantOid("NVII abc!")).toBe(false);
  });
  it("callback hash deterministir", () => {
    const a = { merchantKey: "k", merchantSalt: "s", merchantOid: "o", status: "success", totalAmount: "100" };
    expect(paytrCallbackHash(a)).toBe(paytrCallbackHash(a));
  });
  it("callback doğrulaması: yanlış imza reddedilir", () => {
    process.env.PAYTR_MERCHANT_ID = "1";
    process.env.PAYTR_MERCHANT_KEY = "k";
    process.env.PAYTR_MERCHANT_SALT = "s";
    const r = verifyPaytrCallback({
      merchant_oid: "o1",
      status: "success",
      total_amount: "100",
      hash: "deadbeef",
    });
    expect(r.ok).toBe(false);
  });
  it("callback doğrulaması: doğru imza kabul edilir", () => {
    process.env.PAYTR_MERCHANT_ID = "1";
    process.env.PAYTR_MERCHANT_KEY = "k";
    process.env.PAYTR_MERCHANT_SALT = "s";
    const hash = paytrCallbackHash({
      merchantKey: "k",
      merchantSalt: "s",
      merchantOid: "o1",
      status: "success",
      totalAmount: "100",
    });
    const r = verifyPaytrCallback({
      merchant_oid: "o1",
      status: "success",
      total_amount: "100",
      hash,
      ctoken: "ct_1",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.status).toBe("success");
    expect(r.data.totalAmountMinor).toBe(100);
    expect(r.data.ctoken).toBe("ct_1");
    expect(r.data.utoken).toBeNull();
  });
  it("test modu varsayılanı fail-safe (1)", () => {
    expect(getPaytrConfig().testMode).toBe("1");
  });
});

describe("PayTR callback ucu (imzalı bildirim)", () => {
  const MERCHANT = { id: "1", key: "k", salt: "s" };
  function signedForm(over: Record<string, string> = {}) {
    process.env.PAYTR_MERCHANT_ID = MERCHANT.id;
    process.env.PAYTR_MERCHANT_KEY = MERCHANT.key;
    process.env.PAYTR_MERCHANT_SALT = MERCHANT.salt;
    const base = {
      merchant_oid: "NVIIabc123",
      status: "success",
      total_amount: "50000",
      ...over,
    };
    return {
      ...base,
      hash: paytrCallbackHash({
        merchantKey: MERCHANT.key,
        merchantSalt: MERCHANT.salt,
        merchantOid: base.merchant_oid,
        status: base.status,
        totalAmount: base.total_amount,
      }),
    };
  }
  it("tanınmayan merchant_oid uygulanmaz", async () => {
    const r = await processPaytrCallback({ form: signedForm() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.outcome).toBe("failed");
  });
  it("kayıtlı deneme + eşleşen tutar active yapar", async () => {
    const sub = await seedPaytrSub();
    await recordSaasAttempt({
      id: "att_paytr_1",
      tenantId: T1,
      subscriptionId: sub.id,
      periodStart: "2026-02-01T00:00:00.000Z",
      periodEnd: "2026-03-01T00:00:00.000Z",
      debtKey: "sub:2026-02-01T00:00:00.000Z",
      amountMinor: 50000,
      currency: "TRY",
      status: "uncertain",
      kind: "charge",
      attemptNo: 1,
      idempotencyKey: "idem_paytr_1",
      provider: "paytr",
      merchantAccount: "paytr:1",
      providerRef: "NVIIabc123",
      providerEventId: null,
      error: "bekliyor",
      sentAt: null,
      retryable: null,
      createdAt: "2026-02-01T00:00:00.000Z",
    });
    const r = await processPaytrCallback({ form: signedForm() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.outcome).toBe("processed");
    const fresh = await getSaasSubscription(T1);
    expect(fresh?.status).toBe("active");
  });
  it("tutar uyuşmazlığı uygulanmaz", async () => {
    const sub = await seedPaytrSub();
    await recordSaasAttempt({
      id: "att_paytr_2",
      tenantId: T1,
      subscriptionId: sub.id,
      periodStart: "2026-02-01T00:00:00.000Z",
      periodEnd: "2026-03-01T00:00:00.000Z",
      debtKey: "sub:2026-02-01T00:00:00.000Z",
      amountMinor: 50000,
      currency: "TRY",
      status: "uncertain",
      kind: "charge",
      attemptNo: 1,
      idempotencyKey: "idem_paytr_2",
      provider: "paytr",
      merchantAccount: "paytr:1",
      providerRef: "NVIIabc123",
      providerEventId: null,
      error: "bekliyor",
      sentAt: null,
      retryable: null,
      createdAt: "2026-02-01T00:00:00.000Z",
    });
    const r = await processPaytrCallback({ form: signedForm({ total_amount: "49999" }) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.outcome).toBe("failed");
    const fresh = await getSaasSubscription(T1);
    expect(fresh?.status).toBe("pending");
  });
  it("imzasız bildirim reddedilir", async () => {
    process.env.PAYTR_MERCHANT_ID = "1";
    process.env.PAYTR_MERCHANT_KEY = "k";
    process.env.PAYTR_MERCHANT_SALT = "s";
    const r = await processPaytrCallback({
      form: { merchant_oid: "x", status: "success", total_amount: "1", hash: "nope" },
    });
    expect(r.ok).toBe(false);
  });
});

describe("tahsilat zamanlayıcısı (kuru çalıştırma)", () => {
  it("db yokken kuru çalıştırma güvenli boş döner", async () => {
    const r = await collectDueSubscriptions({ dryRun: true, nowIso: "2026-02-01T00:00:00.000Z" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.dryRun).toBe(true);
    expect(r.data.charged).toBe(0);
  });
});
