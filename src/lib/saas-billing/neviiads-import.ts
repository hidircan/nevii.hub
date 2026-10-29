/**
 * NeviiAds → NeviiHub "kabul edilmiş teklifi aboneliğe aktar" köprüsü.
 * Ayrıca: yeni kurum → satın alma başvurusu, ve NeviiOS → NeviiAds
 * salt-okunur satış özeti (ayrı `NEVIIADS_SUMMARY_TOKEN`).
 *
 * MALİYET/KOTA SINIRI (önceliklidir):
 * - Varsayılan KAPALI (`NEVIIADS_IMPORT_ENABLED=true` olmadan çalışmaz).
 * - Kullanıcı tarafından başlatılan TEK işlem; polling/Realtime/toplu
 *   aynalama/arka plan senkronu YOK.
 * - Yalnız gereken alanlar: teklif kimliği/sürümü, doğrulanmış kurum
 *   referansı, paket/fiyat sürümü, periyot, kampanya referansı.
 * - İstemcinin tutarı/"ödendi" bilgisi GÜVENİLMEZ — sunucu yeniden doğrular.
 * - Aynı teklifin yeniden aktarımı ikinci abonelik/işlem YARATMAZ (idempotent).
 * - NeviiAds'e service-role / doğrudan DB credential YOK: dar kapsamlı,
 *   iptal edilebilir aktarım jetonu (`NEVIIADS_IMPORT_TOKEN` hash'i sunucuda).
 * - PDF/görsel/base64/HTML/dosya gövdesi buluta YÜKLENMEZ.
 * - NeviiAds "ödendi"/erişim durumunu keyfî YAZAMAZ; billing kaynağı NeviiHub.
 * - Teklif kabulü hukuken imzalanmış sözleşme SAYILMAZ: koşul sürümü, kabul
 *   zamanı ve yetkili kişi kaydı tutulur; e-imza yoksa varmış gibi gösterilmez.
 */
import { createHash, randomBytes } from "crypto";
import { z } from "zod";
import { uid } from "../utils";
import { fail, ok, type ServiceResult } from "../services/result";
import { getPricedPlan } from "./catalog";
import { validateCampaignForTenant } from "./campaigns";
import { submitPurchaseRequest } from "./purchase";
import { getPlatformTenant, listPlatformTenants } from "../platform/store";
import { getPublishedCatalog } from "../platform/commercial-catalog";
import {
  findSaasInvitationByProposal,
  getSaasCampaign,
  getSaasCampaignByCode,
  getSaasInvitationByTokenHash,
  listSaasInvitations,
  listSaasPendingOrders,
  listSaasPurchaseRequests,
  listSaasSubscriptions,
  saveSaasInvitation,
} from "./store";
import type { SaasBillingInterval, SaasCheckoutInvitationRecord } from "./types";
import { isSaasBillingInterval } from "./types";

const IMPORT_DISABLED_MESSAGE =
  "NeviiAds aktarımı kapalı. NeviiHub ortamına NEVIIADS_IMPORT_ENABLED=true ve NEVIIADS_IMPORT_TOKEN ekleyip sunucuyu yeniden başlatın.";
const IMPORT_TOKEN_MESSAGE =
  "Aktarım jetonu eşleşmiyor. NeviiAds → Ayarlar → Entegrasyonlar → NeviiHub bölümüne NeviiHub'daki NEVIIADS_IMPORT_TOKEN değerini girin.";

export function isNeviiAdsImportEnabled(): boolean {
  return (process.env.NEVIIADS_IMPORT_ENABLED || "").toLowerCase() === "true";
}

type BridgeTokenEnv = "NEVIIADS_IMPORT_TOKEN" | "NEVIIADS_SUMMARY_TOKEN";

function expectedTokenHash(envName: BridgeTokenEnv): string | null {
  const raw = process.env[envName] || "";
  if (!raw) return null;
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/** Dar kapsamlı aktarım jetonu doğrulaması (sabit zamanlı karşılaştırma). */
export function verifyImportToken(provided: string | null): boolean {
  return verifyBridgeToken(provided, "NEVIIADS_IMPORT_TOKEN");
}

/**
 * Köprü jetonları ayrıdır: aktarım (yazma) ve özet (salt-okunur) ayrı env'de;
 * env silinip sunucu yeniden başlatılınca jeton iptal olur.
 */
function verifyBridgeToken(provided: string | null, envName: BridgeTokenEnv): boolean {
  const expected = expectedTokenHash(envName);
  if (!expected || !provided) return false;
  const a = createHash("sha256").update(provided, "utf8").digest("hex");
  if (a.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

const importSchema = z.object({
  /** NeviiAds teklif kimliği + kabul edilen sürüm. */
  proposalId: z.string().trim().min(1).max(80),
  proposalVersion: z.number().int().min(1),
  /** Doğrulanmış kurum referansı (tenantId; sunucuda varlık kontrolü yapılır). */
  tenantId: z.string().min(1),
  planKey: z.string().regex(/^[a-z][a-z0-9_]{1,31}$/),
  billingInterval: z.string().refine(isSaasBillingInterval, "Geçersiz periyot."),
  /** Koşul sürümü + kabul kaydı (hukuki imza DEĞİL). */
  termsVersion: z.string().trim().min(1).max(40),
  acceptedAt: z.iso.datetime(),
  acceptedByName: z.string().trim().min(2).max(120),
  acceptedByEmail: z.email().max(160),
  /** Sunucu-içi kampanya referansı (opsiyonel). */
  campaignCode: z.string().trim().max(80).nullable().optional(),
  /** Görüntüleme tutarı — tahsilatta KULLANILMAZ, yalnız loglanır. */
  displayAmountMinor: z.number().int().min(0).nullable().optional(),
});

export type NeviiAdsImportInput = z.infer<typeof importSchema>;

/**
 * Kabul edilmiş teklifi güvenli checkout davetine dönüştürür.
 * Idempotent: aynı (proposalId, proposalVersion) mevcut daveti döner.
 */
export async function importAcceptedProposal(args: {
  token: string | null;
  input: unknown;
  createdBy: string;
  nowIso?: string;
}): Promise<
  ServiceResult<{
    invitation: SaasCheckoutInvitationRecord;
    duplicate: boolean;
    /** Ham davet jetonu — YALNIZCA ilk yanıtta, tek gösterim. */
    token: string | null;
  }>
> {
  if (!isNeviiAdsImportEnabled()) {
    return fail("FORBIDDEN", IMPORT_DISABLED_MESSAGE);
  }
  if (!verifyImportToken(args.token)) {
    return fail("FORBIDDEN", IMPORT_TOKEN_MESSAGE);
  }
  const parsed = importSchema.safeParse(args.input);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Geçersiz aktarım verisi.");
  }
  const v = parsed.data;
  const now = args.nowIso ?? new Date().toISOString();

  // Idempotency: aynı kabulden çift abonelik/davet yok.
  const existing = await findSaasInvitationByProposal(v.proposalId, v.proposalVersion);
  if (existing) return ok({ invitation: existing, duplicate: true, token: null });

  // Kurum varlığı: yanlış tenantId ile kimsenin açamayacağı davet üretilmez.
  if (!(await getPlatformTenant(v.tenantId))) {
    return fail(
      "NOT_FOUND",
      `NeviiHub'da "${v.tenantId}" kimlikli kurum yok. NeviiAds'te özeti yenileyip listeden kurumu seçin; kurum henüz yoksa "Yeni kurum başvurusu" ile aktarın.`
    );
  }

  const interval = v.billingInterval as SaasBillingInterval;
  const plan = await getPricedPlan(v.planKey, interval);
  if (!plan) return fail("NOT_FOUND", "Paket bulunamadı veya pasif.");

  let amountMinor = plan.amountMinor;
  let campaignId: string | null = null;
  if (v.campaignCode) {
    const val = await validateCampaignForTenant({
      code: v.campaignCode,
      tenantId: v.tenantId,
      interval,
      listAmountMinor: plan.amountMinor,
      renewalsUsed: 0,
      nowIso: now,
    });
    if (!val.ok) return fail("VALIDATION_ERROR", val.error);
    amountMinor = val.amountMinor;
    const campaign = await getSaasCampaignByCode(v.campaignCode);
    campaignId = campaign?.id ?? null;
  }

  // Davet jetonu: 32 bayt rastgele, DB'de SHA-256 hash; URL'de sır/kişisel veri yok.
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const expiresAt = new Date(new Date(now).getTime() + 7 * 24 * 3600 * 1000).toISOString();
  const invitation: SaasCheckoutInvitationRecord = {
    id: uid("saas_inv"),
    tenantId: v.tenantId,
    proposalId: v.proposalId,
    proposalVersion: v.proposalVersion,
    campaignId,
    planKey: v.planKey,
    billingInterval: interval,
    currency: "TRY",
    displayAmountMinor: amountMinor,
    tokenHash,
    status: "pending",
    expiresAt,
    acceptedAt: null,
    acceptedBy: null,
    createdBy: `${args.createdBy} (neviiads:${v.proposalId}v${v.proposalVersion}, terms:${v.termsVersion}, ${v.acceptedByName} <${v.acceptedByEmail}> @${v.acceptedAt})`,
    createdAt: now,
  };
  await saveSaasInvitation(invitation);
  // Ham jeton YALNIZCA bu yanıtta döner (tek gösterim); DB'de hash tutulur.
  return ok({ invitation, duplicate: false, token });
}

/**
 * NeviiAds'teki kurum NeviiHub'da henüz yoksa: teklif → satın alma başvurusu
 * (`/platform/basvurular`). Mevcut başvuru akışı aynen kullanılır (tenant
 * AÇMAZ, ödeme BAŞLATMAZ; onay sahipte). Aktarım jetonuyla korunur.
 */
export async function importProspectAsPurchaseRequest(args: {
  token: string | null;
  input: unknown;
}): Promise<ServiceResult<{ requestId: string }>> {
  if (!isNeviiAdsImportEnabled()) return fail("FORBIDDEN", IMPORT_DISABLED_MESSAGE);
  if (!verifyImportToken(args.token)) return fail("FORBIDDEN", IMPORT_TOKEN_MESSAGE);
  const res = await submitPurchaseRequest({ input: args.input });
  return res.ok ? ok({ requestId: res.data.id }) : res;
}

const ACTIVE_SUB_STATUSES = new Set(["active", "trialing", "past_due"]);

/**
 * NeviiOS → NeviiAds salt-okunur satış özeti. Kullanıcı düğmeye basınca TEK
 * istek; polling/arka plan senkronu yok. Sınırlı listeler (tam okuma yok),
 * yalnız satış takibine gereken alanlar (fatura/kimlik/jeton verisi YOK).
 * Ayrı jeton: `NEVIIADS_SUMMARY_TOKEN` (yalnız okuma; aktarım yapamaz).
 */
export async function getNeviiAdsSalesSummary(args: { token: string | null; nowIso?: string }) {
  if (!process.env.NEVIIADS_SUMMARY_TOKEN) {
    return fail(
      "FORBIDDEN",
      "NeviiAds özeti kapalı. NeviiHub ortamına NEVIIADS_SUMMARY_TOKEN ekleyip sunucuyu yeniden başlatın."
    );
  }
  if (!verifyBridgeToken(args.token, "NEVIIADS_SUMMARY_TOKEN")) {
    return fail(
      "FORBIDDEN",
      "Özet jetonu eşleşmiyor. NeviiAds → Ayarlar → Entegrasyonlar → NeviiHub bölümüne NeviiHub'daki NEVIIADS_SUMMARY_TOKEN değerini girin."
    );
  }
  const [requests, orders, subs, invitations, tenants, { catalog }] = await Promise.all([
    listSaasPurchaseRequests(200),
    listSaasPendingOrders(200),
    listSaasSubscriptions(200),
    listSaasInvitations(100),
    listPlatformTenants(),
    getPublishedCatalog(),
  ]);
  const tenantName = new Map(tenants.map((t) => [t.tenantId, t.name]));
  const planLabel = new Map(catalog.plans.map((p) => [p.key, p.label]));
  const newRequests = requests.filter((r) => r.status === "pending");
  const awaiting = orders.filter((o) => o.status === "awaiting_payment");
  const activeSubs = subs.filter((s) => ACTIVE_SUB_STATUSES.has(s.status));
  return ok({
    generatedAt: args.nowIso ?? new Date().toISOString(),
    counts: {
      newPurchaseRequests: newRequests.length,
      awaitingPaymentOrders: awaiting.length,
      activeSubscriptions: activeSubs.length,
    },
    purchaseRequests: newRequests.slice(0, 20).map((r) => ({
      id: r.id,
      institutionName: r.institutionName,
      ownerName: r.ownerName,
      ownerEmail: r.ownerEmail,
      planLabel: planLabel.get(r.planKey) ?? r.planKey,
      interval: r.interval,
      createdAt: r.createdAt,
    })),
    pendingOrders: awaiting.slice(0, 20).map((o) => ({
      id: o.id,
      institutionName: o.institutionName,
      planLabel: planLabel.get(o.planKey) ?? o.planKey,
      interval: o.interval,
      expiresAt: o.expiresAt,
      createdAt: o.createdAt,
    })),
    subscriptions: activeSubs.slice(0, 50).map((s) => ({
      tenantId: s.tenantId,
      tenantName: tenantName.get(s.tenantId) ?? null,
      planLabel: planLabel.get(s.planKey) ?? s.planKey,
      status: s.status,
      billingInterval: s.billingInterval,
      amountMinor: s.priceSnapshot.amountMinor,
      currentPeriodEnd: s.currentPeriodEnd,
    })),
    /** NeviiAds'ten gelen davetlerin durumu (teklif ↔ davet eşleşmesi). */
    proposalInvitations: invitations
      .filter((i) => i.proposalId)
      .map((i) => ({
        proposalId: i.proposalId,
        proposalVersion: i.proposalVersion,
        tenantName: tenantName.get(i.tenantId) ?? null,
        status: i.status,
        expiresAt: i.expiresAt,
      })),
    /** Aktarım seçicileri: yayındaki paketler + mevcut kurumlar. */
    plans: catalog.plans
      .filter((p) => p.status === "active" && !p.legacy)
      .map((p) => ({ key: p.key, label: p.label })),
    tenants: tenants.map((t) => ({ tenantId: t.tenantId, name: t.name })),
  });
}

// ───────────── Davet kullanımı (checkout) ─────────────

/**
 * Ham davet jetonunu doğrular: hash eşleşmesi + pending + süre + tenant bağı.
 * Süresi dolmuş davet "expired" işaretlenir (etki: checkout reddi).
 */
export async function getValidInvitation(args: {
  token: string;
  tenantId: string;
  nowIso?: string;
}): Promise<ServiceResult<SaasCheckoutInvitationRecord>> {
  const now = args.nowIso ?? new Date().toISOString();
  const tokenHash = createHash("sha256").update(args.token, "utf8").digest("hex");
  const inv = await getSaasInvitationByTokenHash(tokenHash);
  if (!inv) return fail("NOT_FOUND", "Davet bulunamadı.");
  if (inv.tenantId !== args.tenantId) {
    return fail("FORBIDDEN", "Bu davet kurumunuza ait değil.");
  }
  if (inv.status !== "pending") {
    return fail("VALIDATION_ERROR", "Davet artık geçerli değil.");
  }
  if (new Date(inv.expiresAt).getTime() <= new Date(now).getTime()) {
    await saveSaasInvitation({ ...inv, status: "expired" });
    return fail("VALIDATION_ERROR", "Davetin süresi doldu.");
  }
  return ok(inv);
}

/** Davet kaydını tüketilmiş işaretler (çağrıcı doğrulanmış kaydı verir). */
export async function markInvitationConsumed(
  invitation: SaasCheckoutInvitationRecord,
  acceptedBy: string,
  nowIso?: string
): Promise<SaasCheckoutInvitationRecord> {
  const now = nowIso ?? new Date().toISOString();
  const next = { ...invitation, status: "consumed" as const, acceptedAt: now, acceptedBy };
  await saveSaasInvitation(next);
  return next;
}

/** Davetin kampanyasını çözer (yoksa null). */
export async function resolveInvitationCampaign(
  invitation: SaasCheckoutInvitationRecord
): Promise<{ code: string } | null> {
  if (!invitation.campaignId) return null;
  const c = await getSaasCampaign(invitation.campaignId);
  return c ? { code: c.code } : null;
}
