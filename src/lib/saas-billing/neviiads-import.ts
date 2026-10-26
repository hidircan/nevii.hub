/**
 * NeviiAds → NeviiHub "kabul edilmiş teklifi aboneliğe aktar" köprüsü.
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
import {
  findSaasInvitationByProposal,
  getSaasCampaign,
  getSaasCampaignByCode,
  getSaasInvitationByTokenHash,
  saveSaasInvitation,
} from "./store";
import type { SaasBillingInterval, SaasCheckoutInvitationRecord } from "./types";
import { isSaasBillingInterval } from "./types";

export function isNeviiAdsImportEnabled(): boolean {
  return (process.env.NEVIIADS_IMPORT_ENABLED || "").toLowerCase() === "true";
}

function expectedTokenHash(): string | null {
  const raw = process.env.NEVIIADS_IMPORT_TOKEN || "";
  if (!raw) return null;
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/** Dar kapsamlı aktarım jetonu doğrulaması (sabit zamanlı karşılaştırma). */
export function verifyImportToken(provided: string | null): boolean {
  const expected = expectedTokenHash();
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
    return fail("FORBIDDEN", "NeviiAds aktarımı kapalı (varsayılan).");
  }
  if (!verifyImportToken(args.token)) {
    return fail("FORBIDDEN", "Aktarım yetkisi geçersiz.");
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
