/**
 * MERCHANT_SCHEDULED tahsilat zamanlayıcısı (E).
 *
 * - Vade sorgusu indeksli + batch sınırlı; tetikleme yetkili job endpoint'i
 *   (Vercel cron, mevcut altyapı) — process-içi setInterval YOK, yeni ücretli
 *   servis YOK.
 * - Dış çağrı ÖNCESİ atomik claim (`store.claimChargeAttempt`): borç başına
 *   tek açık deneme — DB'de abonelik satırı `FOR UPDATE` + kısmi unique
 *   index, json'da kilitli yazım. İkinci worker claim'de düşer, sağlayıcıya
 *   İKİNCİ istek GİTMEZ. Sağlayıcı idempotency'si varsayılmaz.
 * - Borç kimliği (debtKey) ile deneme kimliği (idempotencyKey) ayrıdır;
 *   her deneme yeni merchant karşılığı (merchant_oid) alır, aynı ref
 *   iki kez gönderilmez.
 * - Timeout/belirsiz sonuçta kör retry YOK: önce durum sorgusuyla uzlaştırma;
 *   retry yalnız kesinleşmiş + tekrar-denenebilir sonuçlarda. Kesinleşmiş
 *   "tekrar denenemez" sonuçta kart güncellenmeden yeni çekim yok.
 * - Crash pencereleri: claim satırı + providerRef üzerinden uzlaştırma ile
 *   kapatılır (bkz. settleOpenAttempt). Gönderilmiş-ama-belirsiz işlem
 *   ASLA süreyle serbest kalmaz: kesinleşemeyen REVIEW/uzlaştırma bekler,
 *   yeni çekime operatör (dış doğrulama sonrası, denetimli) izin verir.
 *   YALNIZCA hiç gönderilmemiş claim, sağlayıcı sorgusu "kayıt yok"
 *   dedikten sonra expire edilir (pozitif kanıt + gönderilmemiş-öncülü;
 *   sorgunun ücret gizlemediği varsayımı sandbox'ta doğrulanacak).
 */
import { uid } from "../utils";
import { ok, type ServiceResult } from "../services/result";
import { getSaasProvider, type SaasBillingProvider } from "./provider-adapter";
import { hasCapability } from "./providers";
import {
  applyCollectionFailure,
  debtKeyFor,
  extendSubscriptionForPaidPeriod,
  resolveUncertainAttempt,
  transitionSubscriptionPastDue,
  withDebtLock,
} from "./collections";
import { addPeriodInTz } from "./periods";
import {
  claimChargeAttempt,
  expireStaleClaim,
  getSaasSubscription,
  listMerchantScheduledDue,
  listSaasAttempts,
  updateSaasAttempt,
  upsertSaasSubscription,
} from "./store";
import { newPaytrMerchantOid } from "./paytr-subscription";
import type { SaasCollectionAttemptRecord, SaasSubscriptionRecord } from "./types";

/** Belirsiz sonucun uzlaştırma bekleme eşiği (ms). */
export const UNCERTAIN_RECONCILE_AFTER_MS = 5 * 60 * 1000;
/** Gönderilmemiş claim'in sorguya alınabilmesi için yaş eşiği: 30 DAKİKA (ms). */
export const STALE_UNSENT_CLAIM_MS = 30 * 60 * 1000;
/**
 * Takılı kalmış belirsiz işlemin operatör incelemesine düşme eşiği:
 * 24 SAAT (ms). Bu eşik SERBEST BIRAKMAZ — yalnızca REVIEW işaretler.
 * Yeni çekim için dış doğrulamalı operatör izni gerekir (releaseStuckClaim).
 */
export const STUCK_CLAIM_REVIEW_AFTER_MS = 24 * 60 * 60 * 1000;

export type SchedulerRunResult = {
  dryRun: boolean;
  due: number;
  charged: number;
  failed: number;
  uncertain: number;
  skipped: string[];
};

export function dueIdempotencyKey(subscriptionId: string, periodStart: string, attemptNo: number): string {
  return `due_${subscriptionId}_${periodStart}_n${attemptNo}`;
}

/** Kart güncelleme işareti: hatadan SONRA kaydedilmiş kart bağlantısı. */
function hasNewerCardLink(sub: SaasSubscriptionRecord, sinceIso: string): boolean {
  return (sub.providerLinks ?? []).some((l) => Boolean(l.cardRef) && l.at > sinceIso);
}

export async function collectDueSubscriptions(args?: {
  limit?: number;
  nowIso?: string;
  dryRun?: boolean;
}): Promise<ServiceResult<SchedulerRunResult>> {
  const now = args?.nowIso ?? new Date().toISOString();
  const dryRun = args?.dryRun ?? true;
  const subs = await listMerchantScheduledDue(now, args?.limit ?? 25);
  const result: SchedulerRunResult = {
    dryRun,
    due: subs.length,
    charged: 0,
    failed: 0,
    uncertain: 0,
    skipped: [],
  };
  if (dryRun) {
    for (const s of subs) result.skipped.push(`${s.tenantId}: dry-run (vade ${s.currentPeriodEnd})`);
    return ok(result);
  }
  for (const sub of subs) {
    const r = await collectOneDue(sub, now);
    if (r === "charged") result.charged += 1;
    else if (r === "failed") result.failed += 1;
    else if (r === "uncertain") result.uncertain += 1;
    else result.skipped.push(`${sub.tenantId}: ${r}`);
  }
  return ok(result);
}

async function collectOneDue(
  sub: SaasSubscriptionRecord,
  now: string
): Promise<"charged" | "failed" | "uncertain" | string> {
  const provider = getSaasProvider(sub.provider);
  if (!provider.isConfigured()) return `sağlayıcı yapılandırılmadı (${sub.provider})`;
  if (!hasCapability(provider, "server_charge")) {
    return `sağlayıcı server_charge desteklemiyor (${sub.provider})`;
  }
  if (!sub.currentPeriodEnd) return "dönem sonu yok";
  const tz = sub.billingTimeZone || "UTC";
  const periodStart = sub.currentPeriodEnd;
  const periodEnd = addPeriodInTz(periodStart, sub.billingInterval, tz);
  const debtKey = debtKeyFor(sub.id, periodStart);

  return withDebtLock(debtKey, async () => {
    const fresh = (await getSaasSubscription(sub.tenantId)) ?? sub;
    // Koşu sırasında sağlayıcı değişmiş olabilir — taze kayda göre çöz.
    const prov = getSaasProvider(fresh.provider);
    if (!prov.isConfigured()) return `sağlayıcı yapılandırılmadı (${fresh.provider})`;
    if (!hasCapability(prov, "server_charge")) {
      return `sağlayıcı server_charge desteklemiyor (${fresh.provider})`;
    }
    const debtOf = (list: SaasCollectionAttemptRecord[]) =>
      list.filter((a) => a.kind === "charge" && a.periodStart === periodStart);
    const attempts = await listSaasAttempts(fresh.id, 200);
    const debtAttempts = debtOf(attempts);
    if (debtAttempts.some((a) => a.status === "succeeded")) return "dönem zaten ödendi";

    // 1. Açık denemeler: taze ise bekle, bayat ise uzlaştır/expire et.
    //    YENİ çekim, açıklar kapanmadan başlamaz.
    const open = debtAttempts.filter((a) => a.status === "pending" || a.status === "uncertain");
    const nowMs = new Date(now).getTime();
    if (open.some((a) => nowMs - new Date(a.createdAt).getTime() < UNCERTAIN_RECONCILE_AFTER_MS)) {
      return "sonuç bekleniyor (taze deneme)";
    }
    for (const o of open) {
      const settled = await settleOpenAttempt(prov, fresh, o, now);
      if (settled === "charged") return "charged";
      if (settled === "failed") return "failed";
      if (settled === "unknown") return "uzlaştırma belirsiz, bekleniyor";
      // "expired" → yeni claim için devam.
    }

    // 2. Kesinleşmiş "tekrar denenemez" sonuç + kart güncellenmediyse çekim yok.
    const current = debtOf(await listSaasAttempts(fresh.id, 200));
    if (current.some((a) => a.status === "succeeded")) return "dönem zaten ödendi";
    const latestFailed = current
      .filter((a) => a.status === "failed")
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
    if (
      latestFailed?.retryable === false &&
      !hasNewerCardLink(fresh, latestFailed.createdAt)
    ) {
      return "tekrar denenemez sonuç; kart güncellemesi gerekli";
    }

    // 3. Kart çözümü: kayıtlı cardRef yoksa listeden çöz (tek + CVV'siz kart).
    let cardRef = fresh.providerCardRef;
    if (!cardRef) {
      if (!fresh.providerCustomerRef || !prov.listStoredCards) {
        await applyCollectionFailure({
          tenantId: fresh.tenantId,
          error: "Kayıtlı ödeme aracı yok; kurumdan kart kaydı gerekli.",
          providerEventId: `job_${debtKey}`,
          idempotencyKey: dueIdempotencyKey(fresh.id, periodStart, current.length + 1),
          provider: fresh.provider,
          merchantAccount: fresh.merchantAccount,
          retryable: false,
          nowIso: now,
        });
        return "failed";
      }
      const list = await prov.listStoredCards(fresh.providerCustomerRef);
      if (!list.ok) return `kart listesi alınamadı: ${list.error}`;
      if (list.cards.length !== 1) {
        return `kart seçimi gerekli (${list.cards.length} kayıtlı kart)`;
      }
      if (list.cards[0].requireCvv) {
        await applyCollectionFailure({
          tenantId: fresh.tenantId,
          error: "Kart her işlemde CVV istiyor; otomatik çekim yapılamaz.",
          providerEventId: `job_${debtKey}`,
          idempotencyKey: dueIdempotencyKey(fresh.id, periodStart, current.length + 1),
          provider: fresh.provider,
          merchantAccount: fresh.merchantAccount,
          retryable: false,
          nowIso: now,
        });
        return "failed";
      }
      cardRef = list.cards[0].cardRef;
      await upsertSaasSubscription({ ...fresh, providerCardRef: cardRef, updatedAt: now });
    }

    if (!fresh.billingEmail) return "faturalama e-postası yok";
    const merchantOid =
      fresh.provider === "paytr" ? newPaytrMerchantOid() : `NVII${uid("oid").replace(/[^A-Za-z0-9]/g, "")}`.slice(0, 64);

    // 4. ATOMİK CLAIM — dış çağrıdan ÖNCE. Kaybeden worker buradan döner,
    //    sağlayıcıya ikinci istek GİTMEZ.
    const claim = await claimChargeAttempt({
      id: uid("saas_att"),
      tenantId: fresh.tenantId,
      subscriptionId: fresh.id,
      periodStart,
      periodEnd,
      debtKey,
      amountMinor: fresh.priceSnapshot.amountMinor,
      currency: fresh.currency,
      attemptNo: current.length + 1,
      idempotencyKey: dueIdempotencyKey(fresh.id, periodStart, current.length + 1),
      provider: fresh.provider,
      merchantAccount: fresh.merchantAccount,
      providerRef: merchantOid,
      nowIso: now,
    });
    if (claim.status === "paid") return "dönem zaten ödendi";
    if (claim.status === "busy") return "başka worker sahiplendi";
    const claimId = claim.record.id;

    // 5. Çekim + claim finalize (AYNI satır güncellenir, ikinci satır yok).
    const charge = await prov.serverCharge({
      merchantOid,
      email: fresh.billingEmail,
      userIp: fresh.billingUserIp || "127.0.0.1",
      amountMinor: fresh.priceSnapshot.amountMinor,
      currency: fresh.currency,
      customerRef: fresh.providerCustomerRef ?? "",
      cardRef,
    });
    // Gönderim hiç DENENMEDİ (kilit/eksik yetki): claim expire edilir,
    // başarısız-ödeme kaydı YOK, past_due YOK — sonraki koşuda tekrar denenir.
    if (!charge.ok && (charge.errorCode === "LIVE_LOCKED" || charge.errorCode === "PRECONDITION_MISSING")) {
      await expireStaleClaim({
        attemptId: claimId,
        providerRef: merchantOid,
        reason: `gönderilmedi (${charge.errorCode}): ${charge.error}`,
        nowIso: now,
      });
      return `gönderilmedi (${charge.errorCode})`;
    }
    // Gönderim işareti sonuçtan BAĞIMSIZ yazılır (koşu zamanıyla;
    // best-effort — yazılamazsa bayat-claim uzlaştırması sorguyla kapatır).
    await updateSaasAttempt(claimId, { sentAt: now }).catch(() => null);
    const jobEventId = `job_${debtKey}`;

    if (!charge.ok) {
      // Timeout/bağlantı hatası = BELİRSİZ (başarısız değil).
      if (charge.errorCode === "TIMEOUT" || charge.errorCode === "NETWORK_ERROR") {
        await updateSaasAttempt(claimId, { status: "uncertain", error: charge.error });
        return "uncertain";
      }
      await updateSaasAttempt(claimId, {
        status: "failed",
        providerEventId: jobEventId,
        error: charge.error,
        retryable: null,
      });
      await transitionSubscriptionPastDue(fresh.tenantId, now);
      return "failed";
    }
    if (charge.outcome === "success") {
      // Çekim-manuel yarışı: arada başka kanal ödemişse para HAREKET ETTİ —
      // kayıt korunur, dönem uzatması tek etki, çakışma incelemeye düşer.
      const clash = (await listSaasAttempts(fresh.id, 200)).some(
        (a) =>
          a.id !== claimId &&
          a.kind === "charge" &&
          a.status === "succeeded" &&
          a.periodStart === periodStart &&
          a.periodEnd === periodEnd
      );
      await updateSaasAttempt(claimId, {
        status: "succeeded",
        providerEventId: jobEventId,
        error: clash
          ? "CLASH_REVIEW: aynı döneme ikinci başarılı tahsilat (başka kanalla çakışma) — iade incelemesi gerekli."
          : null,
      });
      const sub2 = (await getSaasSubscription(fresh.tenantId)) ?? fresh;
      await extendSubscriptionForPaidPeriod(sub2, periodStart, periodEnd, now);
      if (clash) {
        const { appendPlatformAudit } = await import("../platform/store");
        const { PLATFORM_TENANT_ID } = await import("../auth/config");
        await appendPlatformAudit({
          actorUserId: "cron",
          actorRole: "SYSTEM_CRON",
          actorTenantId: PLATFORM_TENANT_ID,
          targetTenantId: fresh.tenantId,
          action: "saas.job.clash_review",
          entityType: "saas_attempt",
          entityId: claimId,
          before: null,
          after: { debtKey, providerRef: merchantOid },
          requestId: `job-${Date.now()}`,
          outcome: "success",
        });
      }
      return "charged";
    }
    if (charge.outcome === "wait_callback") {
      await updateSaasAttempt(claimId, {
        status: "uncertain",
        error: "Sağlayıcı sonucu callback ile bildirecek.",
      });
      return "uncertain";
    }
    if (charge.outcome === "failed") {
      await updateSaasAttempt(claimId, {
        status: "failed",
        providerEventId: jobEventId,
        error: charge.reason,
        retryable: charge.retryable,
      });
      await transitionSubscriptionPastDue(fresh.tenantId, now);
      return "failed";
    }
    return "failed";
  });
}

/**
 * Açık denemeyi kapatır: uzlaştırma (sorgu) → charged/failed, ya da güvenli
 * expire → "expired" (yalnızca HİÇ GÖNDERİLMEMİŞ claim'de, sorgu "kayıt yok"
 * dedikten sonra). Doğrulanamayan durumda "unknown" döner — yeni çekim YOK,
 * beklemeye devam; 24 SAAT sonunda REVIEW işaretlenir (serbest kalmaz).
 */
async function settleOpenAttempt(
  provider: SaasBillingProvider,
  sub: SaasSubscriptionRecord,
  open: SaasCollectionAttemptRecord,
  now: string
): Promise<"charged" | "failed" | "unknown" | "expired"> {
  const nowMs = new Date(now).getTime();
  const ageMs = nowMs - new Date(open.createdAt).getTime();
  const canQuery = hasCapability(provider, "status_query") && Boolean(open.providerRef);

  // A. Gönderilmemiş + bayat claim: ÖNCE sorgu (ms-crash penceresi), sonra expire.
  // Serbest bırakma SÜREYLE değil sorgu kanıtıyla olur. Kalıntı varsayım:
  // sorgunun "bulunamadı" cevabının gönderilmiş ücreti gizlemediği —
  // PayTR tarafında doğrulanmadı, sandbox blocker'ı (bkz. docs §8.6).
  if (open.status === "pending" && !open.sentAt && ageMs > STALE_UNSENT_CLAIM_MS) {
    if (!open.providerRef) {
      await expireStaleClaim({
        attemptId: open.id,
        providerRef: "",
        reason: "claim_expired: referanssız bayat claim.",
        nowIso: now,
      });
      return "expired";
    }
    if (!canQuery) return "unknown";
    const q = await provider.queryChargeStatus(open.providerRef);
    if (!q.ok) return "unknown";
    if (!q.found) {
      await expireStaleClaim({
        attemptId: open.id,
        providerRef: open.providerRef,
        reason: "claim_expired_unsent: sağlayıcıda kayıt yok.",
        nowIso: now,
      });
      return "expired";
    }
    if (q.status === "success") {
      if (q.totalAmountMinor != null && q.totalAmountMinor !== open.amountMinor) {
        await updateSaasAttempt(open.id, {
          status: "uncertain",
          error: `MISMATCH_REVIEW: sağlayıcı ${q.totalAmountMinor}, beklenen ${open.amountMinor}.`,
        });
        return "unknown";
      }
      const r = await resolveUncertainAttempt({
        attemptId: open.id,
        succeeded: true,
        providerEventId: `reconcile_${open.id}`,
      });
      if (!r.ok) return "unknown";
      await extendSubscriptionForPaidPeriod(sub, open.periodStart, open.periodEnd, now);
      return "charged";
    }
    await expireStaleClaim({
      attemptId: open.id,
      providerRef: open.providerRef,
      reason: "Sağlayıcıda başarısız (uzlaştırma); yeni deneme açılabilir.",
      nowIso: now,
    });
    return "expired";
  }

  // B. Gönderilmiş/belirsiz: durum sorgusuyla uzlaştır. Kesinleşemeyen
  // ASLA süreyle serbest kalmaz — 24 SAAT sonunda REVIEW işaretlenir,
  // yeni çekim için operatör izni gerekir (releaseStuckClaim).
  const stuckMs = nowMs - new Date(open.sentAt ?? open.createdAt).getTime();
  const flagReview = async (why: string): Promise<void> => {
    if (stuckMs > STUCK_CLAIM_REVIEW_AFTER_MS && !open.error?.includes("STUCK_REVIEW")) {
      await updateSaasAttempt(open.id, {
        status: "uncertain",
        error: `STUCK_REVIEW: ${why} Operatör dış doğrulama yapmadan yeni çekim açılmaz.`,
      });
    }
  };
  if (!canQuery) {
    await flagReview("işlem sorgulanamıyor.");
    return "unknown";
  }
  const q = await provider.queryChargeStatus(open.providerRef!);
  if (!q.ok) {
    await flagReview("durum sorgusu ısrarla hata veriyor.");
    return "unknown";
  }
  if (!q.found) {
    await flagReview("sorgu ısrarla kayıt bulamıyor (bulunamadı = ödenmedi kanıtı değil).");
    return "unknown";
  }
  if (q.status === "success") {
    if (q.totalAmountMinor != null && q.totalAmountMinor !== open.amountMinor) {
      await updateSaasAttempt(open.id, {
        status: "uncertain",
        error: `MISMATCH_REVIEW: sağlayıcı ${q.totalAmountMinor}, beklenen ${open.amountMinor}.`,
      });
      return "unknown";
    }
    const r = await resolveUncertainAttempt({
      attemptId: open.id,
      succeeded: true,
      providerEventId: `reconcile_${open.id}`,
    });
    if (!r.ok) return "unknown";
    const freshSub = (await getSaasSubscription(sub.tenantId)) ?? sub;
    await extendSubscriptionForPaidPeriod(freshSub, open.periodStart, open.periodEnd, now);
    return "charged";
  }
  if (q.status === "failed") {
    await resolveUncertainAttempt({
      attemptId: open.id,
      succeeded: false,
      error: "Uzlaştırma: sağlayıcıda başarısız.",
    });
    await transitionSubscriptionPastDue(sub.tenantId, now);
    return "failed";
  }
  return "unknown";
}

export function newSchedulerRunId(): string {
  return uid("job_saas");
}
