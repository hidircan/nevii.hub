import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetPlatformStoreForTests } from "../platform/store";
import {
  __resetSaasBillingStoreForTests,
  getBillingProfile,
  getSaasPendingOrder,
  getSaasSubscription,
  listSaasPendingOrders,
} from "../saas-billing/store";
import {
  completeMockOrder,
  createPendingOrder,
  getOrderByToken,
  getOrderPublicView,
  reissueSetupLink,
  startOrderPayment,
  updatePendingOrder,
} from "../saas-billing/pending-orders";

const BILLING = {
  displayName: "Test Koleji",
  recipientType: "corporate",
  legalTitle: "Test Koleji Egitim Ltd. Sti.",
  taxId: "1234567890",
  taxOffice: "Test VD",
  addressLine: "Test Mah. Deneme Sok. No:1",
  city: "Istanbul",
  country: "Turkiye",
  invoiceEmail: "fatura@testkoleji.com",
};

const base = (email: string, key: string) => ({
  planKey: "core",
  interval: "monthly" as const,
  institutionName: "Test Koleji",
  ownerName: "Test Sahibi",
  ownerEmail: email,
  idempotencyKey: key,
  billing: BILLING,
});

beforeEach(async () => {
  await resetPlatformStoreForTests();
  await __resetSaasBillingStoreForTests();
  // Onaylı fiyatlı yayın kataloğu (builtin'da pricePublished=false).
  const { builtinCatalog } = await import("../platform/commercial-catalog");
  const { recordPublishedVersion, PLATFORM_SCOPE_ID, COMMERCIAL_CATALOG_KEY } =
    await import("../platform/policy-version-log");
  const catalog = builtinCatalog();
  for (const p of catalog.plans) {
    if (p.key === "core" || p.key === "pro") {
      p.pricePublished = true;
      p.basePriceMonthlyMinor = 150000;
      p.basePriceYearlyMinor = 1500000;
    }
  }
  await recordPublishedVersion(
    { userId: "u_test", role: "HYPER_ADMIN", tenantId: "tenant_platform" } as never,
    PLATFORM_SCOPE_ID,
    COMMERCIAL_CATALOG_KEY,
    catalog as never,
    { reason: "test seed" }
  );
});

const OLD_ENV = { ...process.env };
afterEach(() => {
  process.env.SAAS_BILLING_PROVIDER = OLD_ENV.SAAS_BILLING_PROVIDER;
  process.env.SAAS_MOCK_WEBHOOK_ENABLED = OLD_ENV.SAAS_MOCK_WEBHOOK_ENABLED;
  if (OLD_ENV.SAAS_BILLING_PROVIDER === undefined) delete process.env.SAAS_BILLING_PROVIDER;
  if (OLD_ENV.SAAS_MOCK_WEBHOOK_ENABLED === undefined) delete process.env.SAAS_MOCK_WEBHOOK_ENABLED;
});

describe("bekleyen sipariş kaydı (Adım 2)", () => {
  it("geçerli kayıt ödeme-bekliyor açar, token doğrulanır, ham saklanmaz", async () => {
    const r = await createPendingOrder({ input: base("a1@t.com", "testkey-1") });
    expect(r.ok).toBe(true);
    if (!r.ok || r.data.outcome !== "created") return;
    expect(r.data.order.status).toBe("awaiting_payment");
    expect(r.data.order.subscriptionId).toBeNull();
    expect(r.data.token).toMatch(/^[0-9a-f]{64}$/);
    const stored = await getSaasPendingOrder(r.data.order.id);
    expect(stored?.accessTokenHash).not.toContain(r.data.token.slice(0, 16));
    const read = await getOrderByToken({ token: r.data.token });
    expect(read.ok).toBe(true);
  });

  it("yayında olmayan plan ve geçersiz fatura reddedilir", async () => {
    const badPlan = await createPendingOrder({ input: { ...base("a2@t.com", "testkey-2"), planKey: "yok" } });
    expect(badPlan.ok).toBe(false);
    const badVkn = await createPendingOrder({
      input: { ...base("a3@t.com", "testkey-3"), billing: { ...BILLING, taxId: "123" } },
    });
    expect(badVkn.ok).toBe(false);
  });

  it("mevcut hesaba ait e-posta ile kayıt açılmaz (sahiplenme yok)", async () => {
    const { createDynamicUser } = await import("../auth/dynamic-users");
    const { hashPasswordSync } = await import("../auth/password");
    await createDynamicUser({
      tenantId: "t_x",
      email: "var@t.com",
      passwordHash: hashPasswordSync("x"),
      role: "STUDENT",
    });
    const r = await createPendingOrder({ input: base("var@t.com", "testkey-4") });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.outcome).toBe("email_taken");
    expect(await listSaasPendingOrders(10)).toHaveLength(0);
  });

  it("aynı anahtar tekrarında tek kayıt; eski token ölür, yenisi çalışır", async () => {
    const first = await createPendingOrder({ input: base("a5@t.com", "testkey-5") });
    if (!first.ok || first.data.outcome !== "created") return;
    const t1 = first.data.token;
    const second = await createPendingOrder({ input: base("a5@t.com", "testkey-5") });
    expect(second.ok).toBe(true);
    if (!second.ok || second.data.outcome !== "replayed") return;
    expect(second.data.order.id).toBe(first.data.order.id);
    expect(second.data.token).not.toBe(t1);
    expect((await getOrderByToken({ token: t1 })).ok).toBe(false);
    expect((await getOrderByToken({ token: second.data.token })).ok).toBe(true);
    expect(await listSaasPendingOrders(10)).toHaveLength(1);
  });

  it("paralel aynı-anahtar gönderim tek kayıt üretir", async () => {
    const [a, b] = await Promise.all([
      createPendingOrder({ input: base("a6@t.com", "testkey-6") }),
      createPendingOrder({ input: base("a6@t.com", "testkey-6") }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    expect(await listSaasPendingOrders(10)).toHaveLength(1);
  });

  it("aynı e-postaya ikinci bekleyen kayıt açılmaz", async () => {
    await createPendingOrder({ input: base("a7@t.com", "testkey-7a") });
    const r = await createPendingOrder({ input: base("a7@t.com", "testkey-7b") });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.outcome).toBe("pending_exists");
  });

  it("yanlış/biçimsiz token okunamaz (tahmin/kapı)", async () => {
    await createPendingOrder({ input: base("a8@t.com", "testkey-8") });
    expect((await getOrderByToken({ token: "0".repeat(64) })).ok).toBe(false);
    expect((await getOrderByToken({ token: "saas_pord_xxx" })).ok).toBe(false);
    expect((await getOrderByToken({ token: "" })).ok).toBe(false);
  });

  it("süresi dolmuş kayıt düşer", async () => {
    const r = await createPendingOrder({
      input: base("a9@t.com", "testkey-9"),
      nowIso: "2026-01-01T00:00:00.000Z",
    });
    if (!r.ok || r.data.outcome !== "created") return;
    const read = await getOrderByToken({ token: r.data.token, nowIso: "2026-01-05T00:00:00.000Z" });
    expect(read.ok).toBe(false);
    const stored = await getSaasPendingOrder(r.data.order.id);
    expect(stored?.status).toBe("expired");
  });
});

describe("düzenleme ve önizleme", () => {
  it("token ile düzenlenir; e-posta sabit kalır", async () => {
    const r = await createPendingOrder({ input: base("b1@t.com", "testkey-b1") });
    if (!r.ok || r.data.outcome !== "created") return;
    const u = await updatePendingOrder({
      token: r.data.token,
      input: { institutionName: "Yeni Ad", billing: { ...BILLING, city: "Ankara" } },
    });
    expect(u.ok).toBe(true);
    if (!u.ok) return;
    expect(u.data.institutionName).toBe("Yeni Ad");
    expect(u.data.billing.city).toBe("Ankara");
    expect(u.data.ownerEmail).toBe("b1@t.com");
  });

  it("herkese açık görünüm maskelidir", async () => {
    const r = await createPendingOrder({ input: base("gizli@t.com", "testkey-b2") });
    if (!r.ok || r.data.outcome !== "created") return;
    const v = await getOrderPublicView({ token: r.data.token });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.data.billing.taxIdMasked).not.toContain("1234567890");
    expect(v.data.ownerEmailMasked).not.toContain("gizli@t.com");
    expect(v.data.billing.legalTitle).toBe("Test Koleji Egitim Ltd. Sti.");
    expect(v.data.totals?.totalMinor).toBeGreaterThan(0);
  });
});

describe("ödeme ve tamamlama", () => {
  async function paidOrder(email: string, key: string, token: string) {
    const r = await createPendingOrder({ input: base(email, key) });
    if (!r.ok || r.data.outcome !== "created") throw new Error("create failed");
    return r.data.token;
  }

  it("onaysız ödeme açılmaz", async () => {
    const t = await paidOrder("c1@t.com", "testkey-c1", "");
    const r = await startOrderPayment({
      token: t,
      acceptedTerms: true,
      acceptedRecurring: false,
      marketingConsent: false,
      userIp: "127.0.0.1",
      origin: "http://localhost:3001",
    });
    expect(r.ok).toBe(false);
  });

  it("mock ödeme snapshot dondurur, profil yazar, aboneliği beklemeye alır", async () => {
    process.env.SAAS_BILLING_PROVIDER = "mock";
    const t = await paidOrder("c2@t.com", "testkey-c2", "");
    const r = await startOrderPayment({
      token: t,
      acceptedTerms: true,
      acceptedRecurring: true,
      marketingConsent: true,
      userIp: "127.0.0.1",
      origin: "http://localhost:3001",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.mock).toBe(true);
    const order = await getSaasPendingOrder(r.data.orderId);
    expect(order?.priceSnapshot?.planKey).toBe("core");
    expect(order?.consents?.marketingAt).not.toBeNull();
    const profile = await getBillingProfile(order!.tenantId);
    expect(profile?.legalTitle).toBe("Test Koleji Egitim Ltd. Sti.");
    const sub = await getSaasSubscription(order!.tenantId);
    expect(sub?.status).toBe("pending");
  });

  it("çift ödeme ikinci abonelik/çekim açmaz", async () => {
    process.env.SAAS_BILLING_PROVIDER = "mock";
    const t = await paidOrder("c3@t.com", "testkey-c3", "");
    const pay = {
      token: t,
      acceptedTerms: true,
      acceptedRecurring: true,
      marketingConsent: false,
      userIp: "127.0.0.1",
      origin: "http://localhost:3001",
    };
    const r1 = await startOrderPayment(pay);
    const r2 = await startOrderPayment(pay);
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok) return;
    const order = await getSaasPendingOrder(r1.data.orderId);
    const sub = await getSaasSubscription(order!.tenantId);
    expect(sub?.id).toBe(order?.subscriptionId);
  });

  it("sağlayıcı hazır değilse sahte form yok, dürüst engel", async () => {
    process.env.SAAS_BILLING_PROVIDER = "paytr";
    const t = await paidOrder("c4@t.com", "testkey-c4", "");
    const r = await startOrderPayment({
      token: t,
      acceptedTerms: true,
      acceptedRecurring: true,
      marketingConsent: false,
      userIp: "127.0.0.1",
      origin: "http://localhost:3001",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("FORBIDDEN");
  });

  it("mock tamamlama: active + kurum + yönetici + kurulum jetonu; tekrar güvenli", async () => {
    process.env.SAAS_BILLING_PROVIDER = "mock";
    process.env.SAAS_MOCK_WEBHOOK_ENABLED = "true";
    const t = await paidOrder("c5@t.com", "testkey-c5", "");
    await startOrderPayment({
      token: t,
      acceptedTerms: true,
      acceptedRecurring: true,
      marketingConsent: false,
      userIp: "127.0.0.1",
      origin: "http://localhost:3001",
    });
    const done = await completeMockOrder({ token: t });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.data.mock).toBe(true);
    expect(done.data.setupPath).toContain("/sifre-sifirla?token=");
    expect(done.data.setupPath).toContain("mode=setup");
    const order = await getSaasPendingOrder(done.data.orderId);
    expect(order?.status).toBe("paid");
    const sub = await getSaasSubscription(order!.tenantId);
    expect(sub?.status).toBe("active");
    expect(sub?.paidThrough).toBeTruthy();
    // Kurulum jetonu gerçekten tüketilebilir (tek kullanımlık altyapı).
    const code = new URL(done.data.setupPath!, "http://x").searchParams.get("token")!;
    const { consumePasswordResetToken } = await import("../auth/password-reset");
    const consumed = await consumePasswordResetToken(code);
    expect(consumed?.userId).toBe(order?.setupUserId);
    // Tekrar tamamlama ikinci kullanıcı/çekim üretmez.
    const again = await completeMockOrder({ token: t });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.data.setupAlreadyIssued).toBe(true);
    const { findDynamicUserByEmail } = await import("../auth/dynamic-users");
    expect(await findDynamicUserByEmail(order!.tenantId, "c5@t.com")).toBeTruthy();
  });

  it("yeniden gönderim eski kurulum jetonunu öldürür", async () => {
    process.env.SAAS_BILLING_PROVIDER = "mock";
    process.env.SAAS_MOCK_WEBHOOK_ENABLED = "true";
    const t = await paidOrder("c6@t.com", "testkey-c6", "");
    await startOrderPayment({
      token: t,
      acceptedTerms: true,
      acceptedRecurring: true,
      marketingConsent: false,
      userIp: "127.0.0.1",
      origin: "http://localhost:3001",
    });
    const done = await completeMockOrder({ token: t });
    if (!done.ok || !done.data.setupPath) return;
    const oldCode = new URL(done.data.setupPath, "http://x").searchParams.get("token")!;
    const re = await reissueSetupLink({ token: t });
    expect(re.ok).toBe(true);
    if (!re.ok) return;
    const newCode = new URL(re.data.setupPath, "http://x").searchParams.get("token")!;
    expect(newCode).not.toBe(oldCode);
    const { consumePasswordResetToken } = await import("../auth/password-reset");
    expect(await consumePasswordResetToken(oldCode)).toBeNull();
    expect(await consumePasswordResetToken(newCode)).not.toBeNull();
  });

  it("ödenmemiş kayda kurulum bağlantısı yok", async () => {
    const t = await paidOrder("c7@t.com", "testkey-c7", "");
    const re = await reissueSetupLink({ token: t });
    expect(re.ok).toBe(false);
  });
});
