import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetPlatformStoreForTests } from "../platform/store";
import {
  __resetSaasBillingStoreForTests,
  getBillingProfile,
  getSaasPendingOrder,
  getSaasSubscription,
  listSaasPendingOrders,
} from "../saas-billing/store";
import { getRequiredDocs } from "../saas-billing/legal-documents";
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

const docs = () => Object.fromEntries(getRequiredDocs().map((d) => [d.id, d.version]));

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
    // Satış yalnız kurumsal: bireysel (tüketici) alıcı reddedilir.
    const consumer = await createPendingOrder({
      input: { ...base("a3b@t.com", "testkey-3b"), billing: { ...BILLING, recipientType: "individual", nationalId: "10000000146" } },
    });
    expect(consumer.ok).toBe(false);
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
      docVersions: docs(),
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
      docVersions: docs(),
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
      docVersions: docs(),
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
      docVersions: docs(),
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
      docVersions: docs(),
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
      docVersions: docs(),
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

describe("NeviiOS taslak görünürlüğü (§3)", () => {
  it("kayıt anında aynı kaynaktan özet listede görünür (kurum açılmadan)", async () => {
    const r = await createPendingOrder({ input: base("taslak@t.com", "testkey-t1") });
    expect(r.ok).toBe(true);
    if (!r.ok || r.data.outcome !== "created") return;
    const orderId = r.data.order.id;
    const { getBillingOverview } = await import("../saas-billing/overview");
    const ov = await getBillingOverview();
    const row = ov.pendingOrders.find((x) => x.id === orderId);
    expect(row).toBeDefined();
    expect(row).toMatchObject({
      institutionName: "Test Koleji",
      ownerName: "Test Sahibi",
      ownerEmail: "taslak@t.com",
      planKey: "core",
      interval: "monthly",
      status: "awaiting_payment",
    });
    expect(row!.planLabel.length).toBeGreaterThan(0);
    expect(row!.createdAt).toBeTruthy();
    expect(row!.updatedAt).toBeTruthy();
  });

  it("ödenen kayıt listede 'paid' aşamasıyla durur (çift sayım yok)", async () => {
    process.env.SAAS_BILLING_PROVIDER = "mock";
    process.env.SAAS_MOCK_WEBHOOK_ENABLED = "true";
    const r = await createPendingOrder({ input: base("odendi@t.com", "testkey-t2") });
    if (!r.ok || r.data.outcome !== "created") return;
    const pay = await startOrderPayment({
      token: r.data.token,
      acceptedTerms: true,
      acceptedRecurring: true,
      marketingConsent: false,
      docVersions: docs(),
      userIp: "127.0.0.1",
      origin: "http://localhost:3001",
    });
    expect(pay.ok).toBe(true);
    const done = await completeMockOrder({ token: r.data.token });
    expect(done.ok).toBe(true);
    const { getBillingOverview } = await import("../saas-billing/overview");
    const ov = await getBillingOverview();
    const rows = ov.pendingOrders.filter((x) => x.ownerEmail === "odendi@t.com");
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("paid");
    expect(rows[0].subscriptionId).toBeTruthy();
  });
});

describe("belge kabulü + sağlayıcı snapshot'ı (§4-§5)", () => {
  const payBase = (t: string) => ({
    token: t,
    acceptedTerms: true,
    acceptedRecurring: true,
    marketingConsent: false,
    userIp: "127.0.0.1",
    origin: "http://localhost:3001",
  });

  it("belge sürümleri eksik/bayat ise ödeme açılmaz", async () => {
    process.env.SAAS_BILLING_PROVIDER = "mock";
    const r = await createPendingOrder({ input: base("doc1@t.com", "testkey-d1") });
    if (!r.ok || r.data.outcome !== "created") return;
    const missing = await startOrderPayment(payBase(r.data.token));
    expect(missing.ok).toBe(false);
    const stale = await startOrderPayment({ ...payBase(r.data.token), docVersions: { "saas-service-terms": "1999-eski" } });
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.error.code).toBe("VALIDATION_ERROR");
  });

  it("güncel sürümler kabul edilir; onay + sağlayıcı snapshot'ı dondurulur", async () => {
    process.env.SAAS_BILLING_PROVIDER = "mock";
    const r = await createPendingOrder({ input: base("doc2@t.com", "testkey-d2") });
    if (!r.ok || r.data.outcome !== "created") return;
    const pay = await startOrderPayment({ ...payBase(r.data.token), docVersions: docs() });
    expect(pay.ok).toBe(true);
    const order = await getSaasPendingOrder(r.data.order.id);
    expect(order?.consents?.docVersions["saas-service-terms"]).toBe(
      getRequiredDocs().find((d) => d.id === "saas-service-terms")!.version
    );
    expect(order?.consents?.providerId).toBe("mock");
    expect(order?.consents?.providerDisplayName).toBeTruthy();
  });

  it("sağlayıcı görünen adı config'den gelir; mock gerçek şirket gibi sunulmaz", async () => {
    const { getProviderDisplayInfo } = await import("../saas-billing/provider-adapter");
    expect(getProviderDisplayInfo("mock").displayName).toMatch(/mock|demo/i);
    expect(getProviderDisplayInfo("mock").termsUrl).toBeNull();
    process.env.SAAS_PROVIDER_DISPLAY_PAYTR = "PayTR Test Unvanı";
    process.env.SAAS_PROVIDER_TERMS_PAYTR = "https://ornek.test/odeme-kosullari";
    const info = getProviderDisplayInfo("paytr");
    expect(info.displayName).toBe("PayTR Test Unvanı");
    expect(info.termsUrl).toBe("https://ornek.test/odeme-kosullari");
    delete process.env.SAAS_PROVIDER_DISPLAY_PAYTR;
    delete process.env.SAAS_PROVIDER_TERMS_PAYTR;
    expect(getProviderDisplayInfo("paytr").displayName).toBe("paytr");
    expect(getProviderDisplayInfo("paytr").termsUrl).toBeNull();
  });
});

describe("önizleme ekranı", () => {
  it("ödeme beklerken müşteri girdiği bilgileri açık görür, ödeme sonrası jeton açık bilgi vermez", async () => {
    const { getOrderReview } = await import("../saas-billing/pending-orders");
    const { saveSaasPendingOrder } = await import("../saas-billing/store");
    const r = await createPendingOrder({ input: base("onizleme@t.com", "testkey-review") });
    if (!r.ok || r.data.outcome !== "created") throw new Error("kayıt açılamadı");
    const review = await getOrderReview({ token: r.data.token });
    expect(review.ok && review.data.ownerEmail).toBe("onizleme@t.com");
    expect(review.ok && review.data.billing.taxId).toBe("1234567890");

    await saveSaasPendingOrder({ ...r.data.order, status: "paid" });
    expect((await getOrderReview({ token: r.data.token })).ok).toBe(false);
    expect((await getOrderReview({ token: "yanlis-jeton" })).ok).toBe(false);
  });
});

describe("sahip görünümü (§7)", () => {
  it("oturumsuz/yanlış rol/başka tenant → FORBIDDEN; maskeli görünüm etkilenmez", async () => {
    const { getOrderOwnerView } = await import("../saas-billing/pending-orders");
    const r = await createPendingOrder({ input: base("sahip@t.com", "testkey-s1") });
    if (!r.ok || r.data.outcome !== "created") return;
    const t = r.data.token;
    const tenantId = r.data.order.tenantId;
    expect((await getOrderOwnerView({ token: t, session: null })).ok).toBe(false);
    expect((await getOrderOwnerView({ token: t, session: { tenantId, role: "SCHOOL_ADMIN" } })).ok).toBe(false);
    expect((await getOrderOwnerView({ token: t, session: { tenantId: "baska", role: "SUPER_ADMIN" } })).ok).toBe(
      false
    );
    const full = await getOrderOwnerView({ token: t, session: { tenantId, role: "SUPER_ADMIN" } });
    expect(full.ok).toBe(true);
    if (!full.ok) return;
    expect(full.data.ownerEmail).toBe("sahip@t.com");
    expect(full.data.invoiceEmail).toBe("fatura@testkoleji.com");
    expect(full.data.taxId).toBe("1234567890");
    // Maskeli görünüm hâlâ maskeli.
    const masked = await getOrderPublicView({ token: t });
    expect(masked.ok).toBe(true);
    if (!masked.ok) return;
    expect(masked.data.ownerEmailMasked).not.toContain("sahip@t.com");
  });
});

describe("sürdürme bağlantısı (§2-C)", () => {
  it("kayıt yok/geçersiz e-posta → aynı sonuç (numaralandırma yok)", async () => {
    const { requestOrderResume } = await import("../saas-billing/pending-orders");
    const a = await requestOrderResume({ email: "yok@t.com", origin: "http://localhost:3001" });
    const b = await requestOrderResume({ email: "geçersiz", origin: "http://localhost:3001" });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.data).toEqual({ mailed: false, reason: "NOT_FOUND" });
    expect(b.data).toEqual({ mailed: false, reason: "NOT_FOUND" });
  });

  it("bekleyen kayıt → token döner (eski ölür); mail altyapısı kapalıysa sahte başarı yok", async () => {
    const { requestOrderResume } = await import("../saas-billing/pending-orders");
    const r = await createPendingOrder({ input: base("devam@t.com", "testkey-r1") });
    if (!r.ok || r.data.outcome !== "created") return;
    const t1 = r.data.token;
    const res = await requestOrderResume({ email: "devam@t.com", origin: "http://localhost:3001" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Test ortamında mail kapalı (allowlist/live yok) → mailed:false + gerekçe.
    expect(res.data.mailed).toBe(false);
    expect(res.data.reason).toContain("TEST_MODE_BLOCKED");
    // Eski token öldü (yeni token e-postayla gider, yanıtta dönmez).
    expect((await getOrderByToken({ token: t1 })).ok).toBe(false);
    // Kayıt hâlâ TEK ve bekliyor (ikinci kayıt açılmadı).
    expect(await listSaasPendingOrders(10)).toHaveLength(1);
  });

  it("süresi dolmuş/ödenmiş kayda sürdürme yok", async () => {
    const { requestOrderResume } = await import("../saas-billing/pending-orders");
    const r = await createPendingOrder({ input: base("bitmis@t.com", "testkey-r2") });
    if (!r.ok || r.data.outcome !== "created") return;
    const future = new Date(Date.now() + 25 * 3600 * 1000).toISOString();
    const res = await requestOrderResume({ email: "bitmis@t.com", origin: "http://localhost:3001", nowIso: future });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toEqual({ mailed: false, reason: "NOT_FOUND" });
  });
});

describe("ödeme sonrası çift-adres teslimat (§6)", () => {
  const payAll = async (t: string) =>
    startOrderPayment({
      token: t,
      acceptedTerms: true,
      acceptedRecurring: true,
      marketingConsent: false,
      docVersions: docs(),
      userIp: "127.0.0.1",
      origin: "http://localhost:3001",
    });

  it("farklı adresler → iki ayrı deneme + durum kaydı (demo: engelli, sahte başarı yok)", async () => {
    process.env.SAAS_BILLING_PROVIDER = "mock";
    process.env.SAAS_MOCK_WEBHOOK_ENABLED = "true";
    const { sendOrderConfirmationMails } = await import("../saas-billing/pending-orders");
    const r = await createPendingOrder({ input: base("hesap@t.com", "testkey-m1") });
    if (!r.ok || r.data.outcome !== "created") return;
    // base() fatura e-postası farklı: fatura@testkoleji.com
    expect((await payAll(r.data.token)).ok).toBe(true);
    expect((await completeMockOrder({ token: r.data.token, origin: "http://localhost:3001" })).ok).toBe(true);
    const order = await getSaasPendingOrder(r.data.order.id);
    expect(order?.mailStatus?.account?.state).toBe("blocked");
    expect(order?.mailStatus?.account?.reason).toContain("TEST_MODE_BLOCKED");
    expect(order?.mailStatus?.invoice?.state).toBe("blocked");
    // İkinci çağrı yeni gönderim denemez (durum korunur, kayıt tek).
    const again = await sendOrderConfirmationMails({
      orderId: r.data.order.id,
      setupPath: null,
      origin: "http://localhost:3001",
    });
    expect(again.ok).toBe(true);
    expect(await listSaasPendingOrders(10)).toHaveLength(1);
  });

  it("aynı adres → fatura postası birleşik sayılır (dedup)", async () => {
    process.env.SAAS_BILLING_PROVIDER = "mock";
    process.env.SAAS_MOCK_WEBHOOK_ENABLED = "true";
    const input = { ...base("ayni@t.com", "testkey-m2"), billing: { ...BILLING, invoiceEmail: "ayni@t.com" } };
    const r = await createPendingOrder({ input });
    if (!r.ok || r.data.outcome !== "created") return;
    expect((await payAll(r.data.token)).ok).toBe(true);
    expect((await completeMockOrder({ token: r.data.token, origin: "http://localhost:3001" })).ok).toBe(true);
    const order = await getSaasPendingOrder(r.data.order.id);
    expect(order?.mailStatus?.invoice?.state).toBe("skipped_same_address");
  });

  it("ödenmemiş kayda bildirim yok", async () => {
    const { sendOrderConfirmationMails } = await import("../saas-billing/pending-orders");
    const r = await createPendingOrder({ input: base("odenmemis@t.com", "testkey-m3") });
    if (!r.ok || r.data.outcome !== "created") return;
    const res = await sendOrderConfirmationMails({
      orderId: r.data.order.id,
      setupPath: null,
      origin: "http://localhost:3001",
    });
    expect(res.ok).toBe(false);
  });
});

describe("KDV snapshot koruması (§8)", () => {
  const payAll = async (t: string) =>
    startOrderPayment({
      token: t,
      acceptedTerms: true,
      acceptedRecurring: true,
      marketingConsent: false,
      docVersions: docs(),
      userIp: "127.0.0.1",
      origin: "http://localhost:3001",
    });

  it("oran değişimi eski snapshot'ı yeniden hesaplamaz; yeni işlem yeni oranı alır", async () => {
    process.env.SAAS_BILLING_PROVIDER = "mock";
    delete process.env.SAAS_TAX_RATE_BPS;
    delete process.env.SAAS_TAX_RATE_VERIFIED;
    const a = await createPendingOrder({ input: base("kdv-a@t.com", "testkey-k1") });
    if (!a.ok || a.data.outcome !== "created") return;
    expect((await payAll(a.data.token)).ok).toBe(true);
    const snapA = (await getSaasPendingOrder(a.data.order.id))?.priceSnapshot;
    expect(snapA?.taxDemo).toBe(true);

    process.env.SAAS_TAX_RATE_BPS = "1000";
    process.env.SAAS_TAX_RATE_VERIFIED = "true";
    const b = await createPendingOrder({ input: base("kdv-b@t.com", "testkey-k2") });
    if (!b.ok || b.data.outcome !== "created") return;
    expect((await payAll(b.data.token)).ok).toBe(true);
    const snapB = (await getSaasPendingOrder(b.data.order.id))?.priceSnapshot;
    expect(snapB?.taxRateBps).toBe(1000);
    expect(snapB?.taxDemo).toBe(false);

    const snapA2 = (await getSaasPendingOrder(a.data.order.id))?.priceSnapshot;
    expect(snapA2?.taxDemo).toBe(true);
    expect(snapA2?.taxRateBps).toBe(snapA?.taxRateBps);
    delete process.env.SAAS_TAX_RATE_BPS;
    delete process.env.SAAS_TAX_RATE_VERIFIED;
  });

  it("KDV kararı HYPER_ADMIN ister; validation + denetim izi çalışır", async () => {
    const { recordTaxDecision, listTaxDecisions } = await import("../saas-billing/tax-decisions");
    const stranger = { role: "SCHOOL_ADMIN", userId: "u-s", tenantId: "t-s", channel: "web" } as never;
    expect((await recordTaxDecision(stranger, { rateBps: 2000, validFrom: "2026-11-01", reason: "x".repeat(20) })).ok).toBe(false);
    const hyper = { role: "HYPER_ADMIN", userId: "u-h", tenantId: "t-h", channel: "web" } as never;
    expect((await recordTaxDecision(hyper, { rateBps: 0, validFrom: "2026-11-01", reason: "x".repeat(20) })).ok).toBe(false);
    expect((await recordTaxDecision(hyper, { rateBps: 2000, validFrom: "2026-11-01", reason: "kısa" })).ok).toBe(false);
    const r = await recordTaxDecision(hyper, {
      rateBps: 2000,
      validFrom: "2026-11-01",
      reason: "Mali müşavir yazısı 2026-10-29",
    });
    expect(r.ok).toBe(true);
    const list = await listTaxDecisions(hyper);
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.data.some((d) => d.rateBps === 2000 && d.status === "published")).toBe(true);
  });
});

describe("sözleşme onay kilidi (§5)", () => {
  it("gerçek sağlayıcıda onaysız sözleşme metni satışı kapatır", async () => {
    process.env.SAAS_BILLING_PROVIDER = "paytr";
    const r = await createPendingOrder({ input: base("kilit@t.com", "testkey-k1") });
    if (!r.ok || r.data.outcome !== "created") return;
    const pay = await startOrderPayment({
      token: r.data.token,
      acceptedTerms: true,
      acceptedRecurring: true,
      marketingConsent: false,
      docVersions: docs(),
      userIp: "127.0.0.1",
      origin: "http://localhost:3001",
    });
    expect(pay.ok).toBe(false);
    if (pay.ok) return;
    expect(pay.error.message).toContain("hukuk onayından");
  });

  it("mock demoda onaysız metin engel değil, bilgi notu", async () => {
    process.env.SAAS_BILLING_PROVIDER = "mock";
    const { getDocsApprovalStatus } = await import("../saas-billing/legal-documents");
    // Taslak rozeti: onay yok ama demo akışı açık (UI tek bant gösterir).
    expect(getDocsApprovalStatus().allApproved).toBe(false);
    const r = await createPendingOrder({ input: base("demo@t.com", "testkey-k2") });
    if (!r.ok || r.data.outcome !== "created") return;
    const pay = await startOrderPayment({
      token: r.data.token,
      acceptedTerms: true,
      acceptedRecurring: true,
      marketingConsent: false,
      docVersions: docs(),
      userIp: "127.0.0.1",
      origin: "http://localhost:3001",
    });
    expect(pay.ok).toBe(true);
  });

  it("yalnız 2 sözleşme zorunlu; aydınlatma kutu istemez", async () => {
    const { validateDocAcceptance, getRequiredDocs } = await import("../saas-billing/legal-documents");
    expect(getRequiredDocs().map((d) => d.id).sort()).toEqual(["renewal-cancel-refund", "saas-service-terms"]);
    expect(validateDocAcceptance(docs()).ok).toBe(true);
    expect(validateDocAcceptance({ "saas-service-terms": "1999-eski" }).ok).toBe(false);
  });
});
