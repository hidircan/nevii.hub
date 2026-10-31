/**
 * Loginless satın alma hunisi — bekleyen sipariş kaydı (Adım 2) ve
 * token'lı ödeme akışı (Adım 3-5).
 *
 * Güvenlik modeli:
 * - Kayıt "ödeme bekliyor" durumundadır; kullanım hakkı/abonelik AÇMAZ.
 * - Erişim 256-bit token'la; HAM token saklanmaz (sha256 hash), URL'deki
 *   ID tahmin edilemez, kapsam yalnız bu sipariştir.
 * - Mevcut hesaba ait e-posta ile kayıt AÇILMAZ (sahiplenme yok);
 *   çağıran mevcut-müşteri doğrulamasına yönlendirir.
 * - Fiyat snapshot'ı "Ödemeyi tamamla" anında güncel yayından dondurulur.
 * - Çift tıklama/tekrar: idempotencyKey tekilliği + e-posta bekleyen-tekillik.
 */
import { createHash, randomBytes } from "crypto";
import { z } from "zod";
import { isDbMode } from "../config";
import { uid } from "../utils";
import { fail, ok, type ServiceResult } from "../services/result";
import { getPricedPlan, buildPriceSnapshot } from "./catalog";
import { getTaxConfig, taxBreakdown } from "./tax";
import { getDefaultProviderForNew, getProviderDisplayInfo, getSaasProvider } from "./provider-adapter";
import { buildBillingProfileRecord, validateBillingProfile } from "./invoicing-profile";
import { getPublishedCatalog } from "../platform/commercial-catalog";
import { resolveTenantLimits } from "../platform/entitlements";
import { buildPendingSubscription, addProviderLink } from "./subscriptions";
import type { SaasPendingOrderRecord } from "./types";

/** Ödeme penceresi: kayıt 24 saat içinde ödenmezse düşer. */
export const PENDING_ORDER_TTL_MS = 24 * 3600 * 1000;
/** Sonuç/parola kurulum bağlantısı penceresi (ödeme sonrası). */
export const SETUP_TTL_MS = 72 * 3600 * 1000;

/**
 * Satış yalnız kurumsal (şirket / şahıs işletmesi). Bireysel (tüketici) alıcıya
 * mesafeli satış ve cayma hakkı hükümleri uygulanır; metinler buna göre yazılmadı.
 */
export const B2B_ONLY_MESSAGE =
  "NeviiHub kurumsal olarak satılır: alıcı türü olarak şirket veya şahıs işletmesi seçin. Kişisel kullanım için info@neviihub.com adresine yazın.";

export function hashOrderToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function newOrderToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Süreç-içi paralel aynı-anahtar koruması: iki eşzamanlı "Kaydı oluştur"
 * isteği aynı kayda bağlanır (V1; dağıtık kilit/DB unique V2'de).
 */
const inflightCreates = new Map<string, Promise<ServiceResult<CreateOrderResult>>>();

const orderInputSchema = z.object({
  planKey: z.string().trim().min(1).max(64),
  interval: z.enum(["monthly", "yearly"]),
  institutionName: z.string().trim().min(2).max(120),
  ownerName: z.string().trim().min(2).max(120),
  ownerEmail: z.string().trim().email().max(160),
  ownerPhone: z.string().trim().max(20).nullable().optional(),
  /** İstemci üretir (sekme-sabit uuid, checkout-session); çift gönderim + sürdürme. */
  idempotencyKey: z.string().trim().min(8).max(80),
  billing: z.unknown(),
});

export type CreateOrderResult =
  | { outcome: "created"; order: SaasPendingOrderRecord; token: string }
  | { outcome: "replayed"; order: SaasPendingOrderRecord; token: string }
  | { outcome: "email_taken" }
  | { outcome: "pending_exists" };

/**
 * Adım 2 kaydı. Kullanıcı/tenant AÇMAZ, ödeme BAŞLATMAZ, hak VERMEZ.
 * `token` BİR KEZ üretilir ve yalnız bu yanıtta ham döner.
 */
export async function createPendingOrder(args: {
  input: unknown;
  nowIso?: string;
}): Promise<ServiceResult<CreateOrderResult>> {
  const parsed = orderInputSchema.safeParse(args.input);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Geçersiz kayıt.");
  }
  const v = parsed.data;
  const prior = inflightCreates.get(v.idempotencyKey);
  if (prior) return prior;
  const task = createPendingOrderInner(v, args.nowIso);
  inflightCreates.set(v.idempotencyKey, task);
  try {
    return await task;
  } finally {
    inflightCreates.delete(v.idempotencyKey);
  }
}

async function createPendingOrderInner(
  v: z.infer<typeof orderInputSchema>,
  nowIso?: string
): Promise<ServiceResult<CreateOrderResult>> {
  const now = nowIso ?? new Date().toISOString();
  const {
    getSaasPendingOrderByIdempotencyKey,
    listSaasPendingOrdersByEmail,
    saveSaasPendingOrder,
  } = await import("./store");

  // Seçim yayında ve onaylı fiyatlı mı? (Snapshot KURULMAZ — ödeme anında.)
  const plan = await getPricedPlan(v.planKey, v.interval);
  if (!plan) return fail("NOT_FOUND", "Seçilen paket yayında değil.");
  if (!plan.approved) {
    return fail("FORBIDDEN", "Bu paketin onaylı fiyatı yok; satın alma kapalı.");
  }

  // Çift tıklama/tekrar: aynı anahtar aynı kayda döner. Token ham
  // saklanmadığından ilk token yeniden verilemez; YENİ token üretilip
  // eskisi öldürülür (aynı form örneği son yanıtın token'ını kullanır).
  // Anahtar istemci-sırrıdır (uuid); sunucu yanıtı yalnız onu bilene gider.
  const replay = await getSaasPendingOrderByIdempotencyKey(v.idempotencyKey);
  if (replay) {
    if (replay.status !== "awaiting_payment") {
      return fail("VALIDATION_ERROR", "Bu kayıt için yeni işlem açılamaz.");
    }
    const token = newOrderToken();
    const next = { ...replay, accessTokenHash: hashOrderToken(token), updatedAt: now };
    await saveSaasPendingOrder(next);
    return ok({ outcome: "replayed", order: next, token });
  }

  const email = v.ownerEmail.toLowerCase();
  // Mevcut hesap sahiplenmesi YOK: kayıt açılmadan mevcut-müşteri yoluna düşülür.
  const { findUserByEmail } = await import("../auth/users");
  if (await findUserByEmail(email)) {
    return ok({ outcome: "email_taken" });
  }

  // Aynı e-postanın bekleyen kaydı varsa ikincisi açılmaz (eskisini kullanır).
  const mine = await listSaasPendingOrdersByEmail(email);
  if (mine.some((o) => o.status === "awaiting_payment" && o.expiresAt > now)) {
    return ok({ outcome: "pending_exists" });
  }

  const billing = validateBillingProfile({
    ...(typeof v.billing === "object" && v.billing ? v.billing : {}),
    displayName:
      ((v.billing as Record<string, unknown> | null)?.displayName as string | undefined) ||
      v.institutionName,
  });
  if (!billing.ok) return fail("VALIDATION_ERROR", billing.error);
  if (billing.data.recipientType === "individual") return fail("VALIDATION_ERROR", B2B_ONLY_MESSAGE);

  const token = newOrderToken();
  const record: SaasPendingOrderRecord = {
    id: uid("saas_pord"),
    tenantId: uid("tenant"),
    planKey: plan.planKey,
    interval: v.interval,
    institutionName: v.institutionName,
    ownerName: v.ownerName,
    ownerEmail: email,
    ownerPhone: v.ownerPhone?.trim() || null,
    billing: billing.data,
    status: "awaiting_payment",
    accessTokenHash: hashOrderToken(token),
    idempotencyKey: v.idempotencyKey,
    subscriptionId: null,
    priceSnapshot: null,
    consents: null,
    setupUserId: null,
    mailStatus: null,
    expiresAt: new Date(new Date(now).getTime() + PENDING_ORDER_TTL_MS).toISOString(),
    createdAt: now,
    updatedAt: now,
  };
  await saveSaasPendingOrder(record);
  const { notifyOwnerNewRequest } = await import("./request-notify");
  await notifyOwnerNewRequest({ kind: "taslak", id: record.id, institutionName: record.institutionName, createdAt: now });
  return ok({ outcome: "created", order: record, token });
}

/** Token'lı kayıt okuma — ham token doğrulanır, süre dolmuşa düşürülür. */
export async function getOrderByToken(args: {
  token: string;
  nowIso?: string;
}): Promise<ServiceResult<SaasPendingOrderRecord>> {
  const raw = (args.token ?? "").trim();
  if (!/^[0-9a-f]{64}$/.test(raw)) {
    return fail("NOT_FOUND", "Kayıt bulunamadı veya bağlantının süresi doldu.");
  }
  const { getSaasPendingOrderByTokenHash, saveSaasPendingOrder } = await import("./store");
  const order = await getSaasPendingOrderByTokenHash(hashOrderToken(raw));
  if (!order) return fail("NOT_FOUND", "Kayıt bulunamadı veya bağlantının süresi doldu.");
  const now = args.nowIso ?? new Date().toISOString();
  if (order.status === "awaiting_payment" && order.expiresAt <= now) {
    const next = { ...order, status: "expired" as const, updatedAt: now };
    await saveSaasPendingOrder(next);
    return fail("NOT_FOUND", "Kayıt bulunamadı veya bağlantının süresi doldu.");
  }
  return ok(order);
}

const updateInputSchema = z.object({
  institutionName: z.string().trim().min(2).max(120).optional(),
  ownerName: z.string().trim().min(2).max(120).optional(),
  ownerPhone: z.string().trim().max(20).nullable().optional(),
  billing: z.unknown().optional(),
});

/**
 * Adım 3 "Bilgileri düzenle" dönüşü — yalnız ödeme bekleyen kayıt, yalnız
 * token sahibi. E-posta DEĞİŞTİRİLEMEZ (hesap bağını kaydırır).
 */
export async function updatePendingOrder(args: {
  token: string;
  input: unknown;
  nowIso?: string;
}): Promise<ServiceResult<SaasPendingOrderRecord>> {
  const cur = await getOrderByToken({ token: args.token, nowIso: args.nowIso });
  if (!cur.ok) return cur;
  const order = cur.data;
  if (order.status !== "awaiting_payment") {
    return fail("VALIDATION_ERROR", "Bu kayıt artık düzenlenemez.");
  }
  const parsed = updateInputSchema.safeParse(args.input);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Geçersiz kayıt.");
  }
  const v = parsed.data;
  let billing = order.billing;
  if (v.billing !== undefined) {
    const bv = validateBillingProfile(v.billing);
    if (!bv.ok) return fail("VALIDATION_ERROR", bv.error);
    if (bv.data.recipientType === "individual") return fail("VALIDATION_ERROR", B2B_ONLY_MESSAGE);
    billing = bv.data;
  }
  const now = args.nowIso ?? new Date().toISOString();
  const { saveSaasPendingOrder } = await import("./store");
  const next: SaasPendingOrderRecord = {
    ...order,
    institutionName: v.institutionName ?? order.institutionName,
    ownerName: v.ownerName ?? order.ownerName,
    ownerPhone: v.ownerPhone !== undefined ? v.ownerPhone?.trim() || null : order.ownerPhone,
    billing,
    updatedAt: now,
  };
  await saveSaasPendingOrder(next);
  return ok(next);
}

/**
 * Adım 3 "Ödemeyi tamamla": bilgiler/fiyat sunucuda yeniden doğrulanır,
 * snapshot dondurulur, fatura profili yazılır, sağlayıcı akışı başlatılır.
 * KVKK aydınlatması metin olarak sunulur (onay kutusu değil); pazarlama
 * izni ayrı, isteğe bağlı ve önceden işaretli DEĞİL.
 */
export async function startOrderPayment(args: {
  token: string;
  acceptedTerms: boolean;
  acceptedRecurring: boolean;
  marketingConsent: boolean;
  /** Kabul edilen belge sürümleri (belge → sürüm). */
  docVersions?: unknown;
  userIp: string;
  origin: string;
  nowIso?: string;
}): Promise<
  ServiceResult<{
    orderId: string;
    provider: string;
    providerReference: string;
    mock: boolean;
    breakdown: {
      exclMinor: number;
      taxMinor: number;
      totalMinor: number;
      rateLabel: string;
      taxDemo: boolean;
      displayExcl: string;
      displayTax: string;
      displayTotal: string;
    };
  }>
> {
  if (!args.acceptedTerms) {
    return fail("VALIDATION_ERROR", "Ödeme koşulları açıkça kabul edilmeli.");
  }
  if (!args.acceptedRecurring) {
    return fail("VALIDATION_ERROR", "Otomatik tahsilat yetkisi açıkça verilmeli.");
  }
  const { validateDocAcceptanceAsync } = await import("./legal-doc-store");
  const docCheck = await validateDocAcceptanceAsync(args.docVersions);
  if (!docCheck.ok) return fail("VALIDATION_ERROR", docCheck.message);
  const cur = await getOrderByToken({ token: args.token, nowIso: args.nowIso });
  if (!cur.ok) return cur;
  const order = cur.data;
  if (order.status !== "awaiting_payment") {
    return fail("VALIDATION_ERROR", "Bu kayıt için ödeme başlatılamaz.");
  }
  const now = args.nowIso ?? new Date().toISOString();
  const { getSaasSubscription, saveSaasPendingOrder, saveBillingProfile, upsertSaasSubscription } =
    await import("./store");

  // Fiyat güncel yayından YENİDEN çözülür (istemci tutarı güvenilmez).
  const plan = await getPricedPlan(order.planKey, order.interval);
  if (!plan || !plan.approved) {
    return fail("FORBIDDEN", "Paket artık bu koşullarla satılmıyor; kaydı yenileyin.");
  }
  const providerId = getDefaultProviderForNew();
  if (providerId !== "mock") {
    const { getDocsApprovalStatusAsync } = await import("./legal-doc-store");
    const approval = await getDocsApprovalStatusAsync();
    if (!approval.allApproved) {
      return fail(
        "FORBIDDEN",
        `Sözleşme metinleri henüz hukuk onayından geçmedi (${approval.pending.join(", ")}); gerçek satış kapalı.`
      );
    }
  }
  const provider = getSaasProvider(providerId);
  if (!provider.isConfigured()) {
    const missing = provider.missingPreconditions()[0] ?? "Sağlayıcı yapılandırılmadı.";
    return fail("FORBIDDEN", `Ödeme entegrasyonu hazır değil: ${missing}`, { providerNotReady: true });
  }
  const tax = getTaxConfig();
  if (providerId !== "mock" && !tax.verified) {
    return fail("FORBIDDEN", "KDV oranı doğrulanmadı; gerçek checkout kapalı.");
  }
  // Gerçek sağlayıcılar alıcı kimlik alanları ister (uygulama toplamaz);
  // sahte form YOK — açık engel dönülür.
  if (providerId !== "mock") {
    return fail(
      "FORBIDDEN",
      "Gerçek sağlayıcı akışı bu turda askıda: merchant yetkisi ve alıcı kimlik alanları eksik. Sahte ödeme formu açılmadı.",
      { providerNotReady: true }
    );
  }
  const taxLines = taxBreakdown(plan.amountMinor, tax, plan.currency);

  // Fatura profili ödeme ÖNCESİ yazılır (belge hattı profilsiz sipariş üretmez).
  const profile = buildBillingProfileRecord({
    data: order.billing,
    tenantId: order.tenantId,
    updatedBy: `order:${order.id}`,
    nowIso: now,
  });
  await saveBillingProfile(profile);

  const limits = await resolveTenantLimits(order.tenantId, order.planKey);
  const { catalog } = await getPublishedCatalog();
  const includedModules = (catalog.plans.find((p) => p.key === order.planKey)?.includedModules ??
    []) as string[];
  const termsText =
    `${plan.planLabel} (${order.interval === "yearly" ? "yıllık" : "aylık"}), ` +
    `KDV dahil toplam ${taxLines.displayTotal}. ${plan.renewalNote}`;
  const snapshot = buildPriceSnapshot({
    plan,
    limits,
    includedModules,
    campaignCode: null,
    campaignNote: null,
    postCampaignNote: "Liste fiyatı uygulanır.",
    acceptedBy: `order:${order.id}`,
    tax: taxLines,
    nowIso: now,
  });

  // Aynı kayıt için ikinci "Ödemeyi tamamla": mevcut bekleyen abonelik korunur,
  // ikinci abonelik/çekim AÇILMAZ.
  const prevSub = order.subscriptionId
    ? await getSaasSubscription(order.tenantId)
    : null;
  const pendingSub =
    prevSub && prevSub.status === "pending"
      ? { ...prevSub, priceSnapshot: snapshot, updatedAt: now }
      : {
          ...buildPendingSubscription({
            tenantId: order.tenantId,
            planKey: order.planKey,
            catalogVersion: plan.catalogVersion,
            billingInterval: order.interval,
            priceSnapshot: snapshot,
            provider: providerId,
            executionModel: provider.executionModel,
            merchantAccount: provider.merchantAccount(),
            billingEmail: order.ownerEmail,
            billingUserIp: args.userIp,
          }),
        };
  await upsertSaasSubscription(pendingSub);
  const consentAt = now;
  await upsertSaasSubscription(
    addProviderLink(
      pendingSub,
      {
        provider: providerId,
        merchant: provider.merchantAccount(),
        consent: { scope: "card_storage+recurring", version: "v1", at: consentAt },
      },
      consentAt
    )
  );

  const { newSaasIdempotencyKey } = await import("./provider-adapter");
  const init = await provider.initializeCheckout({
    tenantId: order.tenantId,
    planKey: order.planKey,
    billingInterval: order.interval,
    amountMinor: taxLines.totalMinor,
    currency: pendingSub.currency,
    callbackUrl: `${args.origin}/api/v1/billing/checkout/callback`,
    okUrl: `${args.origin}/abonelik/sonuc?status=pending`,
    failUrl: `${args.origin}/abonelik/sonuc?status=error`,
    userIp: args.userIp,
    idempotencyKey: `${pendingSub.id}:${newSaasIdempotencyKey()}`,
    customerRef: pendingSub.providerCustomerRef,
    customer: {
      name: order.ownerName,
      surname: order.ownerName,
      email: order.ownerEmail,
      gsmNumber: order.ownerPhone ?? "",
      identityNumber: "",
      address: order.billing.addressLine,
      city: order.billing.city,
      country: order.billing.country,
    },
  });
  if (!init.ok) return fail("INTERNAL_ERROR", init.error, { providerCode: init.errorCode });

  const providerDisplay = getProviderDisplayInfo(providerId);
  await saveSaasPendingOrder({
    ...order,
    subscriptionId: pendingSub.id,
    priceSnapshot: snapshot,
    consents: {
      termsAt: now,
      recurringAt: now,
      marketingAt: args.marketingConsent ? now : null,
      termsText,
      docVersions: { ...(args.docVersions as Record<string, string>) },
      docTextHashes: await acceptedDocTextHashes(),
      providerId,
      providerDisplayName: providerDisplay.displayName,
    },
    updatedAt: now,
  });

  return ok({
    orderId: order.id,
    provider: providerId,
    providerReference: init.providerReference,
    mock: init.mock,
    breakdown: {
      exclMinor: taxLines.exclMinor,
      taxMinor: taxLines.taxMinor,
      totalMinor: taxLines.totalMinor,
      rateLabel: taxLines.rateLabel,
      taxDemo: taxLines.demo,
      displayExcl: taxLines.displayExcl,
      displayTax: taxLines.displayTax,
      displayTotal: taxLines.displayTotal,
    },
  });
}

/**
 * Mock sipariş tamamlama (local demo): bekleyen siparişin aboneliğini
 * doğrulanmış mock bildirimiyle active'e geçirir, kurumu ve yönetici
 * adayını açar, parola kurulum jetonu üretir.
 *
 * KİLİTLER (mock/complete ile AYNI):
 * - production'da YOK, yalnız SAAS_BILLING_PROVIDER=mock,
 *   yalnız SAAS_MOCK_WEBHOOK_ENABLED=true.
 * - Yalnız token sahibinin KENDİ siparişi.
 */
export function mockSimulatorGuard(): { ok: true } | { ok: false; message: string } {
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    return { ok: false, message: "Bulunamadı." };
  }
  if (process.env.SAAS_BILLING_PROVIDER !== "mock") {
    return { ok: false, message: "Mock tamamlama yalnız mock sağlayıcıda çalışır." };
  }
  if (process.env.SAAS_MOCK_WEBHOOK_ENABLED !== "true") {
    return { ok: false, message: "Mock webhook simülatörü kapalı (SAAS_MOCK_WEBHOOK_ENABLED=true gerekli)." };
  }
  return { ok: true };
}

export async function completeMockOrder(args: {
  token: string;
  nowIso?: string;
  /** Bildirim bağlantıları için istek kökü (yoksa posta atlanır, durum işlenir). */
  origin?: string;
}): Promise<
  ServiceResult<{
    orderId: string;
    status: string;
    mock: true;
    /** Demo kurulum bağlantısı (gerçek e-postada gönderilir; localde ekranda). */
    setupPath: string | null;
    setupAlreadyIssued: boolean;
  }>
> {
  const g = mockSimulatorGuard();
  if (!g.ok) return fail("FORBIDDEN", g.message);
  const cur = await getOrderByToken({ token: args.token, nowIso: args.nowIso });
  if (!cur.ok) return cur;
  const order = cur.data;
  const { saveSaasPendingOrder, getSaasSubscription } = await import("./store");

  // Ödeme zaten doğrulandıysa yeniden çekim YOK — mevcut durum dönülür.
  if (order.status === "paid") {
    return ok({
      orderId: order.id,
      status: "paid",
      mock: true,
      setupPath: null,
      setupAlreadyIssued: true,
    });
  }
  if (order.status !== "awaiting_payment" || !order.subscriptionId) {
    return fail("VALIDATION_ERROR", "Önce ödeme adımı tamamlanmalı.");
  }
  const sub = await getSaasSubscription(order.tenantId);
  if (!sub || sub.id !== order.subscriptionId) {
    return fail("NOT_FOUND", "Abonelik bulunamadı.");
  }
  if (sub.status !== "pending") {
    return fail("VALIDATION_ERROR", `Yalnız bekleyen abonelik tamamlanabilir (şu an: ${sub.status}).`);
  }
  const now = args.nowIso ?? new Date().toISOString();
  const { applyNormalizedPaymentEvent } = await import("./webhooks");
  const res = await applyNormalizedPaymentEvent({
    event: {
      provider: "mock",
      merchantAccount: "mock:test",
      eventId: `mock_complete_${sub.id}_${Date.now()}`,
      eventType: "mock.payment_succeeded",
      succeeded: true,
      amountMinor: sub.priceSnapshot.totalWithTaxMinor ?? sub.priceSnapshot.amountMinor,
      currency: sub.currency,
      providerRef: sub.providerSubscriptionRef ?? sub.id,
      eventTimeIso: now,
      payload: { mock: true, note: "local demo webhook simulator; gercek tahsilat degildir" },
      refs: {
        customerRef: `mock_cus_${sub.id}`,
        subscriptionRef: `mock_sub_${sub.id}`,
        cardRef: null,
        planRef: "mock_plan",
      },
    },
    resolveTenant: async (ref) => {
      if (ref === sub.id || ref === sub.providerSubscriptionRef || ref === `mock_sub_${sub.id}`) {
        return sub.tenantId;
      }
      return null;
    },
    nowIso: now,
  });
  if (!res.ok) return res;

  // Kurum kabuğu: portföyde görünür taslak (okul/şube provision'ı DB modunda).
  const { upsertPlatformTenant } = await import("../platform/store");
  await upsertPlatformTenant(
    {
      tenantId: order.tenantId,
      name: order.institutionName,
      active: false,
      lifecycle: "draft",
      planKey: order.planKey,
      contactEmail: order.ownerEmail,
      idempotencyKey: `order:${order.id}`,
    },
    `order:${order.id}`
  );

  // Operasyon dosyası (JSON modu): BOŞ şablon, idempotent. Dosya yoksa
  // /panel tenant uyuşmazlığıyla çöker; demo veri KOPYALANMAZ.
  if (!isDbMode) {
    const { ensureTenantDataFile } = await import("../store-json");
    await ensureTenantDataFile(order.tenantId, order.institutionName);
  }

  // Yönetici adayı: girişi bilinmeyen rastgele parola hash'iyle AÇILIR —
  // erişim yalnız kurulum bağlantısındaki tek kullanımlık jetonla.
  const { createDynamicUser } = await import("../auth/dynamic-users");
  const { hashPasswordSync } = await import("../auth/password");
  const user = await createDynamicUser({
    tenantId: order.tenantId,
    email: order.ownerEmail,
    passwordHash: hashPasswordSync(randomBytes(32).toString("hex")),
    role: "SUPER_ADMIN",
  });
  const { createPasswordResetToken } = await import("../auth/password-reset");
  const setupCode = await createPasswordResetToken(order.tenantId, user.userId, SETUP_TTL_MS);

  const next = { ...order, status: "paid" as const, setupUserId: user.userId, updatedAt: now };
  await saveSaasPendingOrder(next);
  const setupPath = `/sifre-sifirla?token=${encodeURIComponent(setupCode)}&mode=setup`;
  // §6: hesap + fatura postası (demo modunda engelli-durum kaydı; sahte başarı yok).
  if (args.origin) {
    await sendOrderConfirmationMails({ orderId: order.id, setupPath, origin: args.origin, nowIso: now }).catch(
      () => null
    );
  } else {
    await saveSaasPendingOrder({
      ...next,
      mailStatus: {
        account: { state: "blocked", reason: "NO_ORIGIN", at: now },
        invoice: { state: "blocked", reason: "NO_ORIGIN", at: now },
      },
      updatedAt: now,
    });
  }
  return ok({
    orderId: order.id,
    status: "paid",
    mock: true,
    setupPath,
    setupAlreadyIssued: false,
  });
}

/**
 * Kurulum bağlantısı yeniden gönderimi (kontrollü): eski jeton ölür,
 * yenisi üretilir. Yalnız ödemesi doğrulanmış kayıt.
 */
export async function reissueSetupLink(args: {
  token: string;
  nowIso?: string;
}): Promise<ServiceResult<{ setupPath: string; expiresAt: string }>> {
  const cur = await getOrderByToken({ token: args.token, nowIso: args.nowIso });
  if (!cur.ok) return cur;
  const order = cur.data;
  if (order.status !== "paid" || !order.setupUserId) {
    return fail("VALIDATION_ERROR", "Kurulum bağlantısı yalnız ödemesi doğrulanmış kayıt içindir.");
  }
  const now = args.nowIso ?? new Date().toISOString();
  const { createPasswordResetToken } = await import("../auth/password-reset");
  const setupCode = await createPasswordResetToken(order.tenantId, order.setupUserId, SETUP_TTL_MS);
  const { saveSaasPendingOrder } = await import("./store");
  await saveSaasPendingOrder({ ...order, updatedAt: now });
  return ok({
    setupPath: `/sifre-sifirla?token=${encodeURIComponent(setupCode)}&mode=setup`,
    expiresAt: new Date(new Date(now).getTime() + SETUP_TTL_MS).toISOString(),
  });
}

export type OrderPublicView = {
  orderId: string;
  planKey: string;
  planLabel: string;
  interval: "monthly" | "yearly";
  status: SaasPendingOrderRecord["status"];
  expiresAt: string;
  institutionName: string;
  ownerName: string;
  ownerEmailMasked: string;
  ownerPhone: string | null;
  billing: {
    legalTitle: string;
    taxIdMasked: string;
    taxOffice: string | null;
    city: string;
    invoiceEmailMasked: string;
  };
  totals: {
    exclMinor: number;
    taxMinor: number;
    totalMinor: number;
    rateLabel: string;
    taxDemo: boolean;
    displayExcl: string;
    displayTax: string;
    displayTotal: string;
  } | null;
  subscription: { status: string; paidThrough: string | null } | null;
  invoice: { state: "none" | "awaiting" | "processing" | "ready" | "failed"; emailState: string } | null;
  consents: { termsAt: string; recurringAt: string; marketing: boolean } | null;
};

/**
 * Kurum sahibinin KENDİ siparişi: yetkili oturumda TAM görünüm (§7).
 * Koşullar (hepsi): geçerli token + oturum tenant'ı siparişin tenant'ı ile
 * AYNI + rol SUPER_ADMIN. Sağlanmazsa maskeli görünüme DÜŞÜLÜR (yetki
 * kaldırılmaz, yalnız tam adres gizlenir).
 */
export async function getOrderOwnerView(args: {
  token: string;
  session: { tenantId: string; role: string } | null;
  nowIso?: string;
}): Promise<ServiceResult<OrderPublicView & { ownerEmail: string; invoiceEmail: string; taxId: string | null }>> {
  const cur = await getOrderByToken({ token: args.token, nowIso: args.nowIso });
  if (!cur.ok) return cur as never;
  const order = cur.data;
  const s = args.session;
  if (!s || s.role !== "SUPER_ADMIN" || s.tenantId !== order.tenantId) {
    return fail("FORBIDDEN", "Bu görünüm yalnız kurum sahibinin oturumunda açılır.");
  }
  const view = await getOrderPublicView({ token: args.token, nowIso: args.nowIso });
  if (!view.ok) return view as never;
  return ok({
    ...view.data,
    ownerEmail: order.ownerEmail,
    invoiceEmail: order.billing.invoiceEmail,
    taxId: order.billing.taxId ?? order.billing.nationalId ?? null,
  });
}

/**
 * Önizleme ekranı: müşteri az önce girdiği bilgileri açık görür. Aynı jeton düzenleme ekranını da açtığı için
 * ödeme öncesinde maskeleme koruma sağlamıyordu. Ödeme sonrası jeton açık bilgi vermez, sonuç ekranı maskeli kalır.
 */
export async function getOrderReview(args: { token: string; nowIso?: string }) {
  const cur = await getOrderByToken({ token: args.token, nowIso: args.nowIso });
  if (!cur.ok) return cur;
  const o = cur.data;
  if (o.status !== "awaiting_payment") return fail("FORBIDDEN", "Bu kayıt artık ödeme beklemiyor. Paket seçiminden yeniden başlayın.");
  return ok({ institutionName: o.institutionName, ownerName: o.ownerName, ownerEmail: o.ownerEmail, ownerPhone: o.ownerPhone, billing: o.billing });
}

/**
 * Sürdürme bağlantısı isteği (§2-C + §11): bağlantısını kaybeden alıcı,
 * kayıttaki e-postasına yeni bir devam bağlantısı ister.
 * - E-posta eşleşmesi YETKİ vermez; posta kutusuna giden YENİ token (eski
 *   ölür) sahipliği kanıtlar. Ham token saklanmadığı için döndürme zorunlu.
 * - Kayıt yoksa da AYNI sonuç döner (numaralandırma yok); e-posta yalnız
 *   gerçek bekleyen kayıt varsa ve mail altyapısı izin verirse gider.
 */
export async function requestOrderResume(args: {
  email: unknown;
  origin: string;
  nowIso?: string;
}): Promise<ServiceResult<{ mailed: boolean; reason: string }>> {
  const parsed = z.string().trim().email().max(160).safeParse(args.email);
  if (!parsed.success) {
    return ok({ mailed: false, reason: "NOT_FOUND" });
  }
  const email = parsed.data.toLowerCase();
  const now = args.nowIso ?? new Date().toISOString();
  const { listSaasPendingOrdersByEmail, saveSaasPendingOrder } = await import("./store");
  const mine = await listSaasPendingOrdersByEmail(email);
  const cand = mine
    .filter((o) => o.status === "awaiting_payment" && o.expiresAt > now)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  if (!cand) return ok({ mailed: false, reason: "NOT_FOUND" });
  // Yeni token üret, eskiyi öldür (tek geçerli bağlantı).
  const token = newOrderToken();
  await saveSaasPendingOrder({ ...cand, accessTokenHash: hashOrderToken(token), updatedAt: now });
  const { sendOrderResumeEmail } = await import("./emails");
  const sent = await sendOrderResumeEmail({
    to: email,
    institutionName: cand.institutionName,
    resumeUrl: `${args.origin}/satin-al/bilgiler?t=${encodeURIComponent(token)}`,
    expiresAt: cand.expiresAt,
  });
  if (sent.sent) return ok({ mailed: true, reason: "SENT" });
  return ok({ mailed: false, reason: sent.reason });
}

/**
 * Ödeme sonrası çift-adres teslimat (§6): hesap adresine sözleşmeler + ödeme
 * özeti + kurulum bağlantısı; fatura adresine belge durumu. İki adres aynıysa
 * TEK birleşik gönderim (dedup); fatura gecikirse hesap postası beklemez.
 * - Tür başına idempotent: gönderilmiş tür yeniden gönderilmez.
 * - Mail hatası YENİDEN TAHSİLAT/fatura/hesap üretmez; durum kayda işlenir.
 * - Normalizasyon: yalnız kırpma + küçük harf (farklı alıcılar birleşmez).
 */
export async function sendOrderConfirmationMails(args: {
  orderId: string;
  setupPath: string | null;
  origin: string;
  nowIso?: string;
}): Promise<ServiceResult<{ account: string; invoice: string }>> {
  const { getSaasPendingOrder, saveSaasPendingOrder } = await import("./store");
  const order = await getSaasPendingOrder(args.orderId);
  if (!order || order.status !== "paid") {
    return fail("VALIDATION_ERROR", "Bildirim yalnız ödemesi doğrulanmış kayıt içindir.");
  }
  const now = args.nowIso ?? new Date().toISOString();
  const { sendOrderAccountEmail, sendOrderInvoiceEmail } = await import("./emails");
  const { LEGAL_DOCS } = await import("./legal-documents");
  const { getPricedPlan } = await import("./catalog");
  const { formatMinorTR } = await import("./types");
  const plan = await getPricedPlan(order.planKey, order.interval);
  const planLabel = plan?.planLabel ?? order.planKey;
  const total = order.priceSnapshot ? formatMinorTR(order.priceSnapshot.totalWithTaxMinor ?? 0) : "";
  const periodLabel = order.interval === "yearly" ? "yıllık" : "aylık";
  const docTitles = Object.entries(order.consents?.docVersions ?? {}).map(([id, version]) => ({
    title: LEGAL_DOCS.find((d) => d.id === id)?.title ?? id,
    version,
  }));
  const accountTo = order.ownerEmail.trim().toLowerCase();
  const invoiceTo = order.billing.invoiceEmail.trim().toLowerCase();
  const sameAddress = accountTo === invoiceTo;
  const status = order.mailStatus ?? { account: null, invoice: null };

  if (!status.account || status.account.state !== "sent") {
    const sent = await sendOrderAccountEmail({
      to: order.ownerEmail,
      institutionName: order.institutionName,
      planLabel,
      totalDisplay: total,
      periodLabel,
      docTitles,
      setupUrl: args.setupPath ? `${args.origin}${args.setupPath}` : null,
    });
    status.account = sent.sent
      ? { state: "sent", reason: "SENT", at: now }
      : { state: "blocked", reason: sent.reason, at: now };
  }
  if (sameAddress) {
    status.invoice = { state: "skipped_same_address", reason: "SAME_AS_ACCOUNT", at: now };
  } else if (!status.invoice || status.invoice.state !== "sent") {
    const sent = await sendOrderInvoiceEmail({
      to: order.billing.invoiceEmail,
      institutionName: order.institutionName,
      planLabel,
      totalDisplay: total,
      invoiceReady: false,
      invoiceUrl: null,
    });
    status.invoice = sent.sent
      ? { state: "sent", reason: "SENT", at: now }
      : { state: "blocked", reason: sent.reason, at: now };
  }
  await saveSaasPendingOrder({ ...order, mailStatus: status, updatedAt: now });
  return ok({ account: status.account!.state, invoice: status.invoice!.state });
}

/**
 * Token sahibine açık görünüm: kimlik bilgileri MASKELİ, ham token/snapshot
 * detayı YOK. Önizleme + sonuç ekranları ve istemci durum yoklaması kullanır.
 */
export async function getOrderPublicView(args: {
  token: string;
  nowIso?: string;
}): Promise<ServiceResult<OrderPublicView>> {
  const cur = await getOrderByToken({ token: args.token, nowIso: args.nowIso });
  if (!cur.ok) return cur;
  const order = cur.data;
  const { maskTaxId } = await import("./invoicing-profile");
  const { formatMinorTR } = await import("./types");
  const plan = await getPricedPlan(order.planKey, order.interval);
  const snap = order.priceSnapshot;
  const totals =
    snap && snap.totalWithTaxMinor !== null && snap.totalWithTaxMinor !== undefined
      ? {
          exclMinor: snap.amountMinor,
          taxMinor: snap.taxAmountMinor ?? 0,
          totalMinor: snap.totalWithTaxMinor,
          rateLabel:
            snap.taxRateBps !== null && snap.taxRateBps !== undefined
              ? `%${(snap.taxRateBps / 100).toLocaleString("tr-TR")}`
              : "KDV",
          taxDemo: snap.taxDemo ?? false,
          displayExcl: formatMinorTR(snap.amountMinor),
          displayTax: formatMinorTR(snap.taxAmountMinor ?? 0),
          displayTotal: formatMinorTR(snap.totalWithTaxMinor),
        }
      : plan
        ? (() => {
            const tax = getTaxConfig();
            const t = taxBreakdown(plan.amountMinor, tax, plan.currency);
            return {
              exclMinor: t.exclMinor,
              taxMinor: t.taxMinor,
              totalMinor: t.totalMinor,
              rateLabel: t.rateLabel,
              taxDemo: t.demo,
              displayExcl: t.displayExcl,
              displayTax: t.displayTax,
              displayTotal: t.displayTotal,
            };
          })()
        : null;
  let subscription: OrderPublicView["subscription"] = null;
  let invoice: OrderPublicView["invoice"] = null;
  if (order.subscriptionId) {
    const { getSaasSubscription, listSaasAttempts, getInvoiceOrderByAttempt, getEDocumentByOrder } =
      await import("./store");
    const sub = await getSaasSubscription(order.tenantId);
    if (sub && sub.id === order.subscriptionId) {
      subscription = { status: sub.status, paidThrough: sub.paidThrough };
      const attempts = await listSaasAttempts(sub.id, 10);
      const okAttempt = attempts.find((a) => a.status === "succeeded");
      if (okAttempt) {
        const inv = await getInvoiceOrderByAttempt(okAttempt.id).catch(() => null);
        if (!inv) {
          invoice = { state: "awaiting", emailState: "pending" };
        } else {
          const doc = await getEDocumentByOrder(inv.id).catch(() => null);
          invoice = !doc
            ? { state: "awaiting", emailState: "pending" }
            : doc.status === "failed"
              ? { state: "failed", emailState: doc.emailStatus }
              : doc.status === "issued" || doc.status === "transmitted"
                ? { state: "ready", emailState: doc.emailStatus }
                : { state: "processing", emailState: doc.emailStatus };
        }
      } else if (attempts.some((a) => a.status === "failed")) {
        invoice = { state: "none", emailState: "none" };
      }
    }
  }
  return ok({
    orderId: order.id,
    planKey: order.planKey,
    planLabel: plan?.planLabel ?? snap?.planLabel ?? order.planKey,
    interval: order.interval,
    status: order.status,
    expiresAt: order.expiresAt,
    institutionName: order.institutionName,
    ownerName: order.ownerName,
    ownerEmailMasked: maskEmail(order.ownerEmail),
    ownerPhone: order.ownerPhone,
    billing: {
      legalTitle: order.billing.legalTitle,
      taxIdMasked: maskTaxId(order.billing.taxId ?? order.billing.nationalId ?? null),
      taxOffice: order.billing.taxOffice ?? null,
      city: order.billing.city,
      invoiceEmailMasked: maskEmail(order.billing.invoiceEmail),
    },
    totals,
    subscription,
    invoice,
    consents: order.consents
      ? {
          termsAt: order.consents.termsAt,
          recurringAt: order.consents.recurringAt,
          marketing: order.consents.marketingAt !== null,
        }
      : null,
  });
}

/**
 * Önizleme/ödeme ekranı bağlamı: güncel belge kayıt defteri + işlemdeki
 * sağlayıcının görünen kimliği. Belge METNİ içermez (taslak üstverisi).
 */
export async function getCheckoutDocContext(): Promise<{
  documents: { id: string; title: string; version: string; scope: string; about: string; bodyText: string | null; draft: boolean }[];
  provider: { id: string; displayName: string; termsUrl: string | null };
  acceptedVersions: Record<string, string>;
  docsApproved: boolean;
  isMock: boolean;
}> {
  const { getEffectiveDocs, getDocsApprovalStatusAsync } = await import("./legal-doc-store");
  const providerId = getDefaultProviderForNew();
  const info = getProviderDisplayInfo(providerId);
  const docs = await getEffectiveDocs();
  return {
    documents: docs.map((d) => ({ id: d.id, title: d.title, version: d.version, scope: d.scope, about: d.about, bodyText: d.bodyText, draft: d.draft })),
    provider: { id: providerId, displayName: info.displayName, termsUrl: info.termsUrl },
    acceptedVersions: Object.fromEntries(docs.filter((d) => d.scope === "required").map((d) => [d.id, d.version])),
    docsApproved: (await getDocsApprovalStatusAsync()).allApproved,
    isMock: providerId === "mock",
  };
}

/**
 * Kabul anında müşteriye gösterilen (satıcı bilgisiyle doldurulmuş) metnin
 * sha256 parmak izi. Satıcı profili veya yayın sonradan değişse de hangi
 * metnin onaylandığı ispatlanabilir (HMK m.193 delil maddesi).
 */
async function acceptedDocTextHashes(): Promise<Record<string, string>> {
  const { getEffectiveDocs } = await import("./legal-doc-store");
  const docs = await getEffectiveDocs();
  return Object.fromEntries(
    docs.filter((d) => d.bodyText).map((d) => [d.id, createHash("sha256").update(d.bodyText!, "utf8").digest("hex")])
  );
}

/** E-posta maskesi (sonuç ekranı): a***@k***.com biçimi. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "•••";
  const d = domain.split(".");
  const head = d[0] ? `${d[0][0]}***` : "***";
  return `${local[0]}***@${head}.${d.slice(1).join(".")}`;
}
