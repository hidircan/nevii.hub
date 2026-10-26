/**
 * 30 günlük deneme (V1: kart istemeden).
 *
 * - Doğrulanmış kurum sahibi e-postası + güvenli tenant açılışı şart.
 * - Trial başlangıç/bitiş + seçili deneme paketi (NeviiOS'tan yapılandırılır).
 * - Deneme sonu: kart/abonelik yoksa kullanım kısıtlanır; otomatik borç
 *   üretilmez, izinsiz kart çekimi YAPILMAZ.
 * - Abuse: aynı kurumun tekrarlı denemeleri sınırlanır — veri
 *   minimizasyonuna uygun: yalnızca doğrulanmış e-posta + kurum vergi/
 *   iletişim kimliği benzerliği; fingerprint/hassas veri toplanmaz.
 * - Rate-limit: tenant başına deneme isteği sınırlı (basit sayaç, 24 saatte 3).
 */
import { createHash } from "crypto";
import { z } from "zod";
import { uid } from "../utils";
import { fail, ok, type ServiceResult } from "../services/result";
import { getTrialPlanKey } from "./enforcement";
import { getPricedPlan, buildPriceSnapshot } from "./catalog";
import { getSaasSubscription, upsertSaasSubscription } from "./store";
import { buildPendingSubscription } from "./subscriptions";
import type { SaasSubscriptionRecord } from "./types";

export const TRIAL_DAYS = 30;
export const TRIAL_RATE_LIMIT_PER_DAY = 3;

/** Basit süreç-içi rate-limit (V1; dağıtık kilit V2'de). */
const trialAttempts = new Map<string, { count: number; resetAt: number }>();

export function __resetTrialRateLimitForTests(): void {
  trialAttempts.clear();
}

function checkTrialRateLimit(key: string, nowMs: number): boolean {
  const cur = trialAttempts.get(key);
  if (!cur || nowMs >= cur.resetAt) {
    trialAttempts.set(key, { count: 1, resetAt: nowMs + 24 * 3600 * 1000 });
    return true;
  }
  if (cur.count >= TRIAL_RATE_LIMIT_PER_DAY) return false;
  cur.count += 1;
  return true;
}

/** Deneme bitiş uyarı günleri (bitişe kalan gün). */
export const TRIAL_REMINDER_DAYS = [7, 3, 1] as const;

export function trialEndIso(startIso: string): string {
  const d = new Date(startIso);
  d.setUTCDate(d.getUTCDate() + TRIAL_DAYS);
  return d.toISOString();
}

export function trialDaysLeft(trialEndsAt: string | null, nowIso?: string): number | null {
  if (!trialEndsAt) return null;
  const ms = new Date(trialEndsAt).getTime() - new Date(nowIso ?? new Date().toISOString()).getTime();
  return Math.max(0, Math.ceil(ms / (24 * 3600 * 1000)));
}

export function shouldSendTrialReminder(
  trialEndsAt: string,
  nowIso?: string
): boolean {
  const left = trialDaysLeft(trialEndsAt, nowIso);
  return left !== null && (TRIAL_REMINDER_DAYS as readonly number[]).includes(left);
}

/**
 * Deneme başlatır. `ownerEmailVerified` false ise fail-closed.
 * Mevcut denemesi/aktif aboneliği olan kuruma ikinci deneme verilmez.
 */
export async function startTrial(args: {
  tenantId: string;
  ownerEmail: string;
  ownerEmailVerified: boolean;
  ownerUserId: string;
  /** Abuse sinyali: aynı doğrulanmış e-postayla daha önce deneme açılmış mı? */
  emailUsedForTrialBefore: boolean;
  nowIso?: string;
}): Promise<ServiceResult<SaasSubscriptionRecord>> {
  const now = args.nowIso ?? new Date().toISOString();
  const nowMs = new Date(now).getTime();
  if (!args.ownerEmailVerified) {
    return fail("FORBIDDEN", "Deneme için kurum sahibi e-postası doğrulanmalı.");
  }
  if (!checkTrialRateLimit(`trial:${args.tenantId}`, nowMs)) {
    return fail("RATE_LIMITED", "Çok fazla deneme isteği. Lütfen yarın tekrar deneyin.");
  }
  const existing = await getSaasSubscription(args.tenantId);
  if (existing && (existing.status === "trialing" || existing.status === "active")) {
    return fail("VALIDATION_ERROR", "Bu kurumun zaten aktif denemesi veya aboneliği var.");
  }
  if (existing?.trialEndsAt) {
    return fail("VALIDATION_ERROR", "Bu kurum daha önce deneme kullandı. Ücretli plana geçebilirsiniz.");
  }
  if (args.emailUsedForTrialBefore) {
    return fail(
      "VALIDATION_ERROR",
      "Bu e-posta ile daha önce deneme başlatıldı. Farklı bir kurumsal e-posta kullanın veya destek ile iletişime geçin."
    );
  }
  const planKey = await getTrialPlanKey();
  const plan = await getPricedPlan(planKey, "monthly");
  if (!plan) return fail("NOT_FOUND", "Deneme paketi bulunamadı.");
  const { resolveTenantLimits } = await import("../platform/entitlements");
  const limits = await resolveTenantLimits(args.tenantId, planKey);
  const { getPublishedCatalog } = await import("../platform/commercial-catalog");
  const { catalog } = await getPublishedCatalog();
  const includedModules = (catalog.plans.find((p) => p.key === planKey)?.includedModules ?? []) as string[];
  const snapshot = buildPriceSnapshot({
    plan,
    limits,
    includedModules,
    campaignCode: null,
    campaignNote: "30 günlük ücretsiz deneme (kart istenmedi).",
    postCampaignNote: "Deneme bitiminde liste fiyatı uygulanır.",
    acceptedBy: args.ownerUserId,
    nowIso: now,
  });
  snapshot.trialOwnerHash = createHash("sha256")
    .update(args.ownerEmail.trim().toLowerCase(), "utf8")
    .digest("hex");
  const sub: SaasSubscriptionRecord = {
    ...buildPendingSubscription({
      tenantId: args.tenantId,
      planKey,
      catalogVersion: plan.catalogVersion,
      billingInterval: "monthly",
      priceSnapshot: snapshot,
      nowIso: now,
    }),
    status: "trialing",
    trialStartsAt: now,
    trialEndsAt: trialEndIso(now),
  };
  await upsertSaasSubscription(sub);
  return ok(sub);
}

/** Deneme → ücretli geçiş: ödeme yöntemi + yenileme açıkça kabul edilmiş olmalı. */
export async function convertTrialToPaid(args: {
  tenantId: string;
  acceptedTerms: boolean;
  nowIso?: string;
}): Promise<ServiceResult<SaasSubscriptionRecord>> {
  if (!args.acceptedTerms) {
    return fail("VALIDATION_ERROR", "Ücretliye geçiş için ödeme koşulları açıkça kabul edilmeli.");
  }
  const sub = await getSaasSubscription(args.tenantId);
  if (!sub || sub.status !== "trialing") {
    return fail("VALIDATION_ERROR", "Aktif deneme bulunamadı.");
  }
  // Ödeme doğrulanmadan statü değişmez — checkout akışı tamamlanınca
  // applyVerifiedPayment active'e geçirir. Burada yalnız niyet kaydı.
  const now = args.nowIso ?? new Date().toISOString();
  const next: SaasSubscriptionRecord = {
    ...sub,
    priceSnapshot: {
      ...sub.priceSnapshot,
      campaignNote: `${sub.priceSnapshot.campaignNote ?? ""} Ücretliye geçiş onayı alındı (${now}).`.trim(),
    },
    updatedAt: now,
  };
  await upsertSaasSubscription(next);
  return ok(next);
}

export function newTrialRequestId(): string {
  return uid("trial");
}

// ───────────── Herkese açık deneme başvurusu (/deneme) ─────────────

const trialRequestSchema = z.object({
  institutionName: z.string().trim().min(2).max(120),
  ownerName: z.string().trim().min(2).max(120),
  ownerEmail: z.email().max(160),
  ownerPhone: z.string().trim().max(20).nullable().optional(),
});

/**
 * Herkese açık başvuru kaydı. Tenant AÇILMAZ — onay sonrası mevcut güvenli
 * davet akışıyla (kurum sahibi daveti → tenant provision) ilerlenir.
 * Spam/abuse: IP başına rate-limit route'ta, e-posta başına tek bekleyen başvuru.
 */
export async function submitTrialRequest(args: {
  input: unknown;
  nowIso?: string;
}): Promise<ServiceResult<import("./types").SaasTrialRequestRecord>> {
  const parsed = trialRequestSchema.safeParse(args.input);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Geçersiz başvuru.");
  }
  const v = parsed.data;
  const now = args.nowIso ?? new Date().toISOString();
  const { listSaasTrialRequests, saveSaasTrialRequest } = await import("./store");
  const recent = await listSaasTrialRequests(200);
  const dup = recent.find(
    (r) =>
      r.ownerEmail.toLowerCase() === v.ownerEmail.toLowerCase() &&
      (r.status === "pending" || r.status === "approved")
  );
  if (dup) {
    return fail("VALIDATION_ERROR", "Bu e-posta ile zaten bir başvuru bulunuyor.");
  }
  const record: import("./types").SaasTrialRequestRecord = {
    id: uid("saas_tr"),
    institutionName: v.institutionName,
    ownerName: v.ownerName,
    ownerEmail: v.ownerEmail.toLowerCase(),
    ownerPhone: v.ownerPhone?.trim() || null,
    status: "pending",
    tenantId: null,
    decidedBy: null,
    decidedAt: null,
    createdAt: now,
  };
  await saveSaasTrialRequest(record);
  return ok(record);
}

/**
 * Başvuru kararı (HYPER_ADMIN). Onay = başvuru "approved" + tenant bağlantısı;
 * deneme, güvenli tenant açılışı tamamlanınca `startTrial` ile başlatılır.
 */
export async function decideTrialRequest(args: {
  requestId: string;
  approve: boolean;
  tenantId?: string;
  decidedBy: string;
  nowIso?: string;
}): Promise<ServiceResult<import("./types").SaasTrialRequestRecord>> {
  const { getSaasTrialRequest, saveSaasTrialRequest } = await import("./store");
  const r = await getSaasTrialRequest(args.requestId);
  if (!r) return fail("NOT_FOUND", "Başvuru bulunamadı.");
  if (r.status !== "pending") return fail("VALIDATION_ERROR", "Başvuru zaten değerlendirildi.");
  const now = args.nowIso ?? new Date().toISOString();
  const next = {
    ...r,
    status: (args.approve ? "approved" : "rejected") as import("./types").SaasTrialRequestStatus,
    tenantId: args.tenantId ?? null,
    decidedBy: args.decidedBy,
    decidedAt: now,
  };
  await saveSaasTrialRequest(next);
  return ok(next);
}
