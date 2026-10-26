/**
 * SaaS billing deposu — JSON dosya + Prisma (PostgreSQL) çift mod.
 *
 * `src/lib/platform/store.ts` ile AYNI desen: `STORE_MODE=db` iken Prisma,
 * aksi halde atomik JSON dosyası (`saas-billing.json`). DB hatası sessizce
 * JSON'a DÜŞMEZ (fail-closed).
 *
 * Güvenlik sınırları:
 * - PAN/CVV asla saklanmaz: payload yazımında bilinen kart alanları ayıklanır.
 * - Webhook payload'u sınırlıdır (8 KB); üstü reddedilir, log fırtınası yok.
 * - Tam tablo okuma YOK: listeler limitlidir.
 */
import { promises as fs } from "fs";
import path from "path";
import { isDbMode, isMemoryMode, resolveDataDir } from "../config";
import { prisma } from "../db";
import { withFileLock, writeJsonFileAtomic } from "../atomic-json-file";
import type {
  SaasCampaignRecord,
  SaasCheckoutInvitationRecord,
  SaasCollectionAttemptRecord,
  SaasSubscriptionRecord,
  SaasTrialRequestRecord,
  SaasWebhookEventRecord,
} from "./types";

export const SAAS_BILLING_STORE_FILE = path.join(
  resolveDataDir(path.join(process.cwd(), "data")),
  "saas-billing.json"
);

/** Webhook payload üst sınırı (byte). */
export const MAX_WEBHOOK_PAYLOAD_BYTES = 8 * 1024;

/** Savunma derinliği: bu anahtarlar payload'dan her zaman ayıklanır. */
const CARD_FIELD_PATTERN =
  /pan|card_?number|cardnumber|cvv|cvc|cc_?number|credit_?card|kart_?no|kartno/i;

export function stripCardFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripCardFields);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (CARD_FIELD_PATTERN.test(k)) continue;
      out[k] = stripCardFields(v);
    }
    return out;
  }
  return value;
}

export function boundedPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const clean = (stripCardFields(payload) ?? {}) as Record<string, unknown>;
  const bytes = Buffer.byteLength(JSON.stringify(clean), "utf8");
  if (bytes > MAX_WEBHOOK_PAYLOAD_BYTES) {
    throw new Error("Webhook payload boyutu üst sınırı aştı.");
  }
  return clean;
}

type SaasBillingFile = {
  version: 1;
  subscriptions: SaasSubscriptionRecord[];
  attempts: SaasCollectionAttemptRecord[];
  webhookEvents: SaasWebhookEventRecord[];
  campaigns: SaasCampaignRecord[];
  invitations: SaasCheckoutInvitationRecord[];
  trialRequests: SaasTrialRequestRecord[];
};

const EMPTY: SaasBillingFile = {
  version: 1,
  subscriptions: [],
  attempts: [],
  webhookEvents: [],
  campaigns: [],
  invitations: [],
  trialRequests: [],
};

let memoryState: SaasBillingFile | null = null;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

async function readFile(): Promise<SaasBillingFile> {
  try {
    const raw = await fs.readFile(SAAS_BILLING_STORE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<SaasBillingFile>;
    return {
      version: 1,
      subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [],
      attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [],
      webhookEvents: Array.isArray(parsed.webhookEvents) ? parsed.webhookEvents : [],
      campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns : [],
      invitations: Array.isArray(parsed.invitations) ? parsed.invitations : [],
      trialRequests: Array.isArray(parsed.trialRequests) ? parsed.trialRequests : [],
    };
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return clone(EMPTY);
    throw e;
  }
}

async function readState(): Promise<SaasBillingFile> {
  if (isMemoryMode) {
    if (!memoryState) memoryState = clone(EMPTY);
    return memoryState;
  }
  return readFile();
}

async function writeState(next: SaasBillingFile): Promise<void> {
  if (isMemoryMode) {
    memoryState = next;
    return;
  }
  await withFileLock(SAAS_BILLING_STORE_FILE, async () => {
    await writeJsonFileAtomic(SAAS_BILLING_STORE_FILE, next);
  });
}

/**
 * Kilit ZATEN alınmış bölümlerde kullanılır (withFileLock içi).
 * writeState çağrılırsa aynı anahtarda özyinelemeli kilitlenme olur.
 */
async function commitLockedState(next: SaasBillingFile): Promise<void> {
  if (isMemoryMode) {
    memoryState = next;
    return;
  }
  await writeJsonFileAtomic(SAAS_BILLING_STORE_FILE, next);
}

/**
 * DB satır → kayıt eşlemesi. Prisma DateTime'ları Date döner; kayıt
 * sözleşmesi ISO string'dir. Eşleme yapılmazsa dönem karşılaştırmaları
 * (`===`) db modunda sessizce yanlış sonuç verir.
 */
function iso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

function isoOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

function mapSubscriptionRow(row: Record<string, unknown>): SaasSubscriptionRecord {
  return {
    ...(row as unknown as SaasSubscriptionRecord),
    priceSnapshot: row.priceSnapshot as SaasSubscriptionRecord["priceSnapshot"],
    providerLinks: (row.providerLinks as SaasSubscriptionRecord["providerLinks"]) ?? [],
    trialStartsAt: isoOrNull(row.trialStartsAt),
    trialEndsAt: isoOrNull(row.trialEndsAt),
    currentPeriodStart: isoOrNull(row.currentPeriodStart),
    currentPeriodEnd: isoOrNull(row.currentPeriodEnd),
    paidThrough: isoOrNull(row.paidThrough),
    canceledAt: isoOrNull(row.canceledAt),
    lastWebhookAt: isoOrNull(row.lastWebhookAt),
    lastReconciledAt: isoOrNull(row.lastReconciledAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function mapAttemptRow(row: Record<string, unknown>): SaasCollectionAttemptRecord {
  return {
    ...(row as unknown as SaasCollectionAttemptRecord),
    periodStart: iso(row.periodStart),
    periodEnd: iso(row.periodEnd),
    sentAt: isoOrNull(row.sentAt),
    retryable: (row.retryable as boolean | null) ?? null,
    createdAt: iso(row.createdAt),
  };
}

/** Test izolasyonu: dosya/bellek deposunu sıfırlar (yalnız testlerde çağrılır). */
export async function __resetSaasBillingStoreForTests(): Promise<void> {
  if (isDbMode) {
    // Testler STORE_MODE=json ile çalışır; db sıfırlama bilinçli olarak yok.
    throw new Error("Test sıfırlama yalnız json/memory modunda desteklenir.");
  }
  memoryState = clone(EMPTY);
  await writeState(clone(EMPTY));
}

// ───────────── Okuma/yazma yardımcıları ─────────────

function dbFailClosed(e: unknown): never {
  console.error("[saas-billing] db error", e instanceof Error ? e.message : e);
  throw e instanceof Error ? e : new Error("SaaS billing veritabanı işlemi başarısız");
}

// ── Subscription ──

export async function getSaasSubscription(
  tenantId: string
): Promise<SaasSubscriptionRecord | null> {
  if (isDbMode) {
    try {
      const row = await prisma.saasSubscription.findUnique({ where: { tenantId } });
      return row ? mapSubscriptionRow(row as unknown as Record<string, unknown>) : null;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const s = await readState();
  return s.subscriptions.find((x) => x.tenantId === tenantId) ?? null;
}

export async function upsertSaasSubscription(
  record: SaasSubscriptionRecord
): Promise<SaasSubscriptionRecord> {
  if (isDbMode) {
    try {
      const data = {
        planKey: record.planKey,
        catalogVersion: record.catalogVersion,
        status: record.status,
        billingInterval: record.billingInterval,
        currency: record.currency,
        priceSnapshot: record.priceSnapshot as object,
        trialStartsAt: record.trialStartsAt ? new Date(record.trialStartsAt) : null,
        trialEndsAt: record.trialEndsAt ? new Date(record.trialEndsAt) : null,
        currentPeriodStart: record.currentPeriodStart ? new Date(record.currentPeriodStart) : null,
        currentPeriodEnd: record.currentPeriodEnd ? new Date(record.currentPeriodEnd) : null,
        paidThrough: record.paidThrough ? new Date(record.paidThrough) : null,
        canceledAt: record.canceledAt ? new Date(record.canceledAt) : null,
        cancelAtPeriodEnd: record.cancelAtPeriodEnd,
        provider: record.provider,
        executionModel: record.executionModel,
        merchantAccount: record.merchantAccount,
        providerCustomerRef: record.providerCustomerRef,
        providerSubscriptionRef: record.providerSubscriptionRef,
        providerCardRef: record.providerCardRef,
        providerLinks: (record.providerLinks ?? []) as object,
        billingTimeZone: record.billingTimeZone || "UTC",
        billingEmail: record.billingEmail || "",
        billingUserIp: record.billingUserIp || "",
        lastWebhookAt: record.lastWebhookAt ? new Date(record.lastWebhookAt) : null,
        lastReconciledAt: record.lastReconciledAt ? new Date(record.lastReconciledAt) : null,
      };
      const row = await prisma.saasSubscription.upsert({
        where: { tenantId: record.tenantId },
        create: { id: record.id, tenantId: record.tenantId, ...data },
        update: data,
      });
      return mapSubscriptionRow(row as unknown as Record<string, unknown>);
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const s = await readState();
  const idx = s.subscriptions.findIndex((x) => x.tenantId === record.tenantId);
  const next = clone(s);
  if (idx >= 0) next.subscriptions[idx] = clone(record);
  else next.subscriptions.push(clone(record));
  await writeState(next);
  return record;
}

export async function getSaasSubscriptionById(
  id: string
): Promise<SaasSubscriptionRecord | null> {
  if (isDbMode) {
    try {
      const row = await prisma.saasSubscription.findUnique({ where: { id } });
      return row ? mapSubscriptionRow(row as unknown as Record<string, unknown>) : null;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const s = await readState();
  return s.subscriptions.find((x) => x.id === id) ?? null;
}

/** NeviiOS genel görünümü — sınırlı liste, tam tablo okuma yok. */
export async function listSaasSubscriptions(limit = 100): Promise<SaasSubscriptionRecord[]> {
  const n = Math.min(Math.max(limit, 1), 500);
  if (isDbMode) {
    try {
      const rows = await prisma.saasSubscription.findMany({
        take: n,
        orderBy: { updatedAt: "desc" },
      });
      return rows.map((r) => mapSubscriptionRow(r as unknown as Record<string, unknown>));
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const s = await readState();
  return [...s.subscriptions]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, n);
}

// ── Collection attempts ──

export async function getAttemptByIdempotencyKey(
  idempotencyKey: string
): Promise<SaasCollectionAttemptRecord | null> {
  if (isDbMode) {
    try {
      const row = await prisma.saasCollectionAttempt.findUnique({ where: { idempotencyKey } });
      return row ? mapAttemptRow(row as unknown as Record<string, unknown>) : null;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const s = await readState();
  return s.attempts.find((x) => x.idempotencyKey === idempotencyKey) ?? null;
}

function isOpenClaimStatus(s: string): boolean {
  return s === "pending" || s === "uncertain";
}

/** Idempotent kayıt: aynı key varsa mevcut döner, ikinci satır yazılmaz. */
export async function recordSaasAttempt(
  attempt: SaasCollectionAttemptRecord
): Promise<{ record: SaasCollectionAttemptRecord; duplicate: boolean }> {
  const existing = await getAttemptByIdempotencyKey(attempt.idempotencyKey);
  if (existing) return { record: existing, duplicate: true };
  if (isDbMode) {
    try {
      const row = await prisma.saasCollectionAttempt.create({
        data: {
          id: attempt.id,
          tenantId: attempt.tenantId,
          subscriptionId: attempt.subscriptionId,
          periodStart: new Date(attempt.periodStart),
          periodEnd: new Date(attempt.periodEnd),
          debtKey: attempt.debtKey,
          amountMinor: attempt.amountMinor,
          currency: attempt.currency,
          status: attempt.status,
          kind: attempt.kind,
          attemptNo: attempt.attemptNo,
          idempotencyKey: attempt.idempotencyKey,
          provider: attempt.provider,
          merchantAccount: attempt.merchantAccount,
          providerRef: attempt.providerRef,
          providerEventId: attempt.providerEventId,
          error: attempt.error,
          sentAt: attempt.sentAt ? new Date(attempt.sentAt) : null,
          retryable: attempt.retryable,
        },
      });
      return { record: mapAttemptRow(row as unknown as Record<string, unknown>), duplicate: false };
    } catch (e: unknown) {
      // Yarışta unique ihlali (idempotency / açık-claim / dönem-success) →
      // mevcut kaydı dön (idempotent, ikinci etki yok).
      if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
        const row = await prisma.saasCollectionAttempt.findUnique({
          where: { idempotencyKey: attempt.idempotencyKey },
        });
        if (row) return { record: mapAttemptRow(row as unknown as Record<string, unknown>), duplicate: true };
        const clash = await prisma.saasCollectionAttempt.findFirst({
          where: {
            subscriptionId: attempt.subscriptionId,
            periodStart: new Date(attempt.periodStart),
            kind: "charge",
            status: attempt.status === "succeeded" ? "succeeded" : { in: ["pending", "uncertain"] },
          },
          orderBy: { createdAt: "desc" },
        });
        if (clash) return { record: mapAttemptRow(clash as unknown as Record<string, unknown>), duplicate: true };
      }
      dbFailClosed(e);
    }
  }
  // JSON modu: kontrol + yazım dosya kilidi altında (süreç-içi atomiklik;
  // JSON zaten yalnızca local/test içindir, üretim db modudur).
  return withFileLock(SAAS_BILLING_STORE_FILE, async () => {
    const s = await readState();
    const dup = s.attempts.find((x) => x.idempotencyKey === attempt.idempotencyKey);
    if (dup) return { record: dup, duplicate: true };
    if (attempt.kind === "charge" && isOpenClaimStatus(attempt.status)) {
      const open = s.attempts.find(
        (x) =>
          x.subscriptionId === attempt.subscriptionId &&
          x.periodStart === attempt.periodStart &&
          x.kind === "charge" &&
          isOpenClaimStatus(x.status)
      );
      if (open) return { record: open, duplicate: true };
    }
    if (attempt.kind === "charge" && attempt.status === "succeeded") {
      const paid = s.attempts.find(
        (x) =>
          x.subscriptionId === attempt.subscriptionId &&
          x.periodStart === attempt.periodStart &&
          x.periodEnd === attempt.periodEnd &&
          x.kind === "charge" &&
          x.status === "succeeded"
      );
      if (paid) return { record: paid, duplicate: true };
    }
    const next = clone(s);
    next.attempts.push(clone(attempt));
    await commitLockedState(next);
    return { record: attempt, duplicate: false };
  });
}

export type ChargeClaimResult =
  | { status: "claimed"; record: SaasCollectionAttemptRecord }
  | { status: "busy"; record: SaasCollectionAttemptRecord }
  | { status: "paid"; record: SaasCollectionAttemptRecord };

/**
 * Dış API çağrısından ÖNCE atomik iş sahiplenme (claim).
 *
 * - db: abonelik satırı `FOR UPDATE` ile kilitlenir; dönem ödenmişse "paid",
 *   açık claim varsa "busy", yoksa pending claim yazılır ("claimed").
 *   Kısmi unique index ikinci bir açık claim'i P2002 ile düşürür (backstop).
 * - json: dosya kilidi altında aynı karar (süreç-içi; üretim db modudur).
 *
 * Dönen "claimed" kaydın `providerRef`i bu denemenin merchant karşılığıdır;
 * crash sonrası uzlaştırma bu referansla yapılır.
 */
export async function claimChargeAttempt(args: {
  id: string;
  tenantId: string;
  subscriptionId: string;
  periodStart: string;
  periodEnd: string;
  debtKey: string;
  amountMinor: number;
  currency: SaasCollectionAttemptRecord["currency"];
  attemptNo: number;
  idempotencyKey: string;
  provider: SaasCollectionAttemptRecord["provider"];
  merchantAccount: string;
  providerRef: string;
  nowIso: string;
}): Promise<ChargeClaimResult> {
  if (isDbMode) {
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "SaasSubscription" WHERE "id" = ${args.subscriptionId} FOR UPDATE`;
        const existing = await tx.saasCollectionAttempt.findMany({
          where: { subscriptionId: args.subscriptionId, periodStart: new Date(args.periodStart), kind: "charge" },
        });
        const paid = existing.find((a) => a.status === "succeeded");
        if (paid) return { status: "paid", record: mapAttemptRow(paid as unknown as Record<string, unknown>) };
        const open = existing.find((a) => isOpenClaimStatus(a.status));
        if (open) return { status: "busy", record: mapAttemptRow(open as unknown as Record<string, unknown>) };
        const row = await tx.saasCollectionAttempt.create({
          data: {
            id: args.id,
            tenantId: args.tenantId,
            subscriptionId: args.subscriptionId,
            periodStart: new Date(args.periodStart),
            periodEnd: new Date(args.periodEnd),
            debtKey: args.debtKey,
            amountMinor: args.amountMinor,
            currency: args.currency,
            status: "pending",
            kind: "charge",
            attemptNo: args.attemptNo,
            idempotencyKey: args.idempotencyKey,
            provider: args.provider,
            merchantAccount: args.merchantAccount,
            providerRef: args.providerRef,
            providerEventId: null,
            error: null,
            sentAt: null,
            retryable: null,
          },
        });
        return { status: "claimed", record: mapAttemptRow(row as unknown as Record<string, unknown>) };
      });
    } catch (e: unknown) {
      if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
        const row = await prisma.saasCollectionAttempt.findFirst({
          where: {
            subscriptionId: args.subscriptionId,
            periodStart: new Date(args.periodStart),
            kind: "charge",
            status: { in: ["pending", "uncertain", "succeeded"] },
          },
          orderBy: { createdAt: "desc" },
        });
        const record =
          row != null
            ? mapAttemptRow(row as unknown as Record<string, unknown>)
            : ({ id: "", status: "pending" }) as unknown as SaasCollectionAttemptRecord;
        return { status: row?.status === "succeeded" ? "paid" : "busy", record };
      }
      dbFailClosed(e);
    }
  }
  return withFileLock(SAAS_BILLING_STORE_FILE, async () => {
    const s = await readState();
    const debt = s.attempts.filter(
      (x) => x.subscriptionId === args.subscriptionId && x.periodStart === args.periodStart && x.kind === "charge"
    );
    const paid = debt.find((x) => x.status === "succeeded");
    if (paid) return { status: "paid", record: paid };
    const open = debt.find((x) => isOpenClaimStatus(x.status));
    if (open) return { status: "busy", record: open };
    const dup = s.attempts.find((x) => x.idempotencyKey === args.idempotencyKey);
    if (dup) return { status: "busy", record: dup };
    const record: SaasCollectionAttemptRecord = {
      id: args.id,
      tenantId: args.tenantId,
      subscriptionId: args.subscriptionId,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      debtKey: args.debtKey,
      amountMinor: args.amountMinor,
      currency: args.currency,
      status: "pending",
      kind: "charge",
      attemptNo: args.attemptNo,
      idempotencyKey: args.idempotencyKey,
      provider: args.provider,
      merchantAccount: args.merchantAccount,
      providerRef: args.providerRef,
      providerEventId: null,
      error: null,
      sentAt: null,
      retryable: null,
      createdAt: args.nowIso,
    };
    const next = clone(s);
    next.attempts.push(record);
    await commitLockedState(next);
    return { status: "claimed", record };
  });
}

/**
 * Takılı kalmış BELİRSİZ denemeyi operatör kararıyla kapatır (serbest bırakma).
 * YALNIZCA `uncertain` satırlar kapanır (uçuşan pending'e dokunulmaz).
 * Çağıran (HYPER_ADMIN route): dış doğrulama (sağlayıcı panel kaydı) +
 * gerekçe + audit ZORUNLU. Yeni çekim izni = bu kayıt + denetim izi.
 */
export async function releaseStuckClaim(args: {
  attemptId: string;
  reason: string;
  actorUserId: string;
  externalRef: string;
}): Promise<boolean> {
  const error = `operator_released by ${args.actorUserId}: ${args.reason} (dış kayıt: ${args.externalRef})`;
  if (isDbMode) {
    try {
      const r = await prisma.saasCollectionAttempt.updateMany({
        where: { id: args.attemptId, status: "uncertain" },
        data: { status: "failed", error },
      });
      return r.count === 1;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  return withFileLock(SAAS_BILLING_STORE_FILE, async () => {
    const s = await readState();
    const idx = s.attempts.findIndex((x) => x.id === args.attemptId && x.status === "uncertain");
    if (idx < 0) return false;
    const next = clone(s);
    next.attempts[idx] = { ...next.attempts[idx], status: "failed", error };
    await commitLockedState(next);
    return true;
  });
}

/**
 * Gönderilmeden çöken claim'i koşullu kapatır (expire). Koşul sağlanmazsa
 * false döner — başkası sahiplendi/çözdü demektir, üzerine yazılmaz.
 * Çağıran, expire ÖNCESİ sağlayıcı sorgusuyla "gönderilmedi" hükmünü
 * doğrulamak zorundadır (claim penceresindeki ms-crash'e karşı).
 */
export async function expireStaleClaim(args: {
  attemptId: string;
  providerRef: string;
  reason: string;
  nowIso: string;
}): Promise<boolean> {
  if (isDbMode) {
    try {
      const r = await prisma.saasCollectionAttempt.updateMany({
        where: { id: args.attemptId, status: "pending", sentAt: null, providerRef: args.providerRef },
        data: { status: "failed", error: args.reason },
      });
      return r.count === 1;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  return withFileLock(SAAS_BILLING_STORE_FILE, async () => {
    const s = await readState();
    const idx = s.attempts.findIndex(
      (x) => x.id === args.attemptId && x.status === "pending" && x.sentAt === null && x.providerRef === args.providerRef
    );
    if (idx < 0) return false;
    const next = clone(s);
    next.attempts[idx] = { ...next.attempts[idx], status: "failed", error: args.reason };
    await commitLockedState(next);
    return true;
  });
}

export async function updateSaasAttempt(
  id: string,
  patch: Partial<SaasCollectionAttemptRecord>
): Promise<SaasCollectionAttemptRecord | null> {
  if (isDbMode) {
    try {
      const row = await prisma.saasCollectionAttempt.update({
        where: { id },
        data: {
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.providerRef !== undefined ? { providerRef: patch.providerRef } : {}),
          ...(patch.providerEventId !== undefined ? { providerEventId: patch.providerEventId } : {}),
          ...(patch.error !== undefined ? { error: patch.error } : {}),
          ...(patch.sentAt !== undefined ? { sentAt: patch.sentAt ? new Date(patch.sentAt) : null } : {}),
          ...(patch.retryable !== undefined ? { retryable: patch.retryable } : {}),
        },
      });
      return mapAttemptRow(row as unknown as Record<string, unknown>);
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const s = await readState();
  const idx = s.subscriptions.length >= 0 ? s.attempts.findIndex((x) => x.id === id) : -1;
  if (idx < 0) return null;
  const next = clone(s);
  next.attempts[idx] = { ...next.attempts[idx], ...clone(patch), id };
  await writeState(next);
  return next.attempts[idx];
}

export async function getSaasAttemptById(
  id: string
): Promise<SaasCollectionAttemptRecord | null> {
  if (isDbMode) {
    try {
      const row = await prisma.saasCollectionAttempt.findUnique({ where: { id } });
      return row ? mapAttemptRow(row as unknown as Record<string, unknown>) : null;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const s = await readState();
  return s.attempts.find((x) => x.id === id) ?? null;
}

/** Callback çözümlemesi: sağlayıcı referansından deneme bulunur. */
export async function findAttemptByProviderRef(
  provider: string,
  providerRef: string
): Promise<SaasCollectionAttemptRecord | null> {
  if (isDbMode) {
    try {
      const row = await prisma.saasCollectionAttempt.findFirst({
        where: { provider, providerRef },
        orderBy: { createdAt: "desc" },
      });
      return row ? mapAttemptRow(row as unknown as Record<string, unknown>) : null;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const s = await readState();
  const matches = s.attempts.filter((x) => x.provider === provider && x.providerRef === providerRef);
  return matches.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0] ?? null;
}

/**
 * Vadesi gelmiş MERCHANT_SCHEDULED abonelikler (indeksli, sınırlı batch).
 * Sadece dönem sonu geçmiş + aktif borçlu durumlar döner.
 */
export async function listMerchantScheduledDue(
  nowIso: string,
  limit = 25
): Promise<SaasSubscriptionRecord[]> {
  const n = Math.min(Math.max(limit, 1), 100);
  if (isDbMode) {
    try {
      const rows = await prisma.saasSubscription.findMany({
        where: {
          executionModel: "MERCHANT_SCHEDULED",
          status: { in: ["active", "past_due"] },
          currentPeriodEnd: { lte: new Date(nowIso) },
        },
        take: n,
        orderBy: { currentPeriodEnd: "asc" },
      });
      return rows.map((r) => mapSubscriptionRow(r as unknown as Record<string, unknown>));
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const s = await readState();
  const nowMs = new Date(nowIso).getTime();
  return s.subscriptions
    .filter(
      (x) =>
        x.executionModel === "MERCHANT_SCHEDULED" &&
        (x.status === "active" || x.status === "past_due") &&
        x.currentPeriodEnd !== null &&
        new Date(x.currentPeriodEnd).getTime() <= nowMs
    )
    .sort((a, b) => (a.currentPeriodEnd! < b.currentPeriodEnd! ? -1 : 1))
    .slice(0, n);
}

export async function listSaasAttempts(
  subscriptionId: string,
  limit = 50
): Promise<SaasCollectionAttemptRecord[]> {
  const n = Math.min(Math.max(limit, 1), 200);
  if (isDbMode) {
    try {
      const rows = await prisma.saasCollectionAttempt.findMany({
        where: { subscriptionId },
        take: n,
        orderBy: { createdAt: "desc" },
      });
      return rows.map((r) => mapAttemptRow(r as unknown as Record<string, unknown>));
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const s = await readState();
  return s.attempts
    .filter((x) => x.subscriptionId === subscriptionId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, n);
}

// ── Webhook inbox ──

export async function findSaasWebhookEvent(
  eventId: string
): Promise<SaasWebhookEventRecord | null> {
  if (isDbMode) {
    try {
      const row = await prisma.saasWebhookEvent.findUnique({ where: { eventId } });
      return row ? (row as unknown as SaasWebhookEventRecord) : null;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const s = await readState();
  return s.webhookEvents.find((x) => x.eventId === eventId) ?? null;
}

/** Idempotent inbox kaydı: aynı eventId varsa mevcut döner. */
export async function insertSaasWebhookEvent(
  event: SaasWebhookEventRecord
): Promise<{ record: SaasWebhookEventRecord; duplicate: boolean }> {
  const existing = await findSaasWebhookEvent(event.eventId);
  if (existing) return { record: existing, duplicate: true };
  const payload = boundedPayload(event.payload);
  if (isDbMode) {
    try {
      const row = await prisma.saasWebhookEvent.create({
        data: {
          id: event.id,
          provider: event.provider,
          eventId: event.eventId,
          eventType: event.eventType,
          tenantId: event.tenantId,
          subscriptionId: event.subscriptionId,
          payload: payload as object,
          signatureValid: event.signatureValid,
          status: event.status,
          processedAt: event.processedAt ? new Date(event.processedAt) : null,
          error: event.error,
        },
      });
      return { record: row as unknown as SaasWebhookEventRecord, duplicate: false };
    } catch (e: unknown) {
      if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
        const row = await prisma.saasWebhookEvent.findUnique({ where: { eventId: event.eventId } });
        if (row) return { record: row as unknown as SaasWebhookEventRecord, duplicate: true };
      }
      dbFailClosed(e);
    }
  }
  const s = await readState();
  const next = clone(s);
  next.webhookEvents.push({ ...clone(event), payload });
  await writeState(next);
  return { record: { ...event, payload }, duplicate: false };
}

export async function updateSaasWebhookEvent(
  id: string,
  patch: Partial<SaasWebhookEventRecord>
): Promise<SaasWebhookEventRecord | null> {
  if (isDbMode) {
    try {
      const row = await prisma.saasWebhookEvent.update({
        where: { id },
        data: {
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.tenantId !== undefined ? { tenantId: patch.tenantId } : {}),
          ...(patch.subscriptionId !== undefined ? { subscriptionId: patch.subscriptionId } : {}),
          ...(patch.processedAt !== undefined
            ? { processedAt: patch.processedAt ? new Date(patch.processedAt) : null }
            : {}),
          ...(patch.error !== undefined ? { error: patch.error } : {}),
        },
      });
      return row as unknown as SaasWebhookEventRecord;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const s = await readState();
  const idx = s.webhookEvents.findIndex((x) => x.id === id);
  if (idx < 0) return null;
  const next = clone(s);
  next.webhookEvents[idx] = { ...next.webhookEvents[idx], ...clone(patch), id };
  await writeState(next);
  return next.webhookEvents[idx];
}

export async function listSaasWebhookEvents(limit = 50): Promise<SaasWebhookEventRecord[]> {
  const n = Math.min(Math.max(limit, 1), 200);
  if (isDbMode) {
    try {
      const rows = await prisma.saasWebhookEvent.findMany({
        take: n,
        orderBy: { createdAt: "desc" },
      });
      return rows as unknown as SaasWebhookEventRecord[];
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const s = await readState();
  return [...s.webhookEvents]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, n);
}

// ── Campaigns ──

export async function getSaasCampaignByCode(code: string): Promise<SaasCampaignRecord | null> {
  if (isDbMode) {
    try {
      const row = await prisma.saasCampaign.findUnique({ where: { code } });
      return row ? (row as unknown as SaasCampaignRecord) : null;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const s = await readState();
  return s.campaigns.find((x) => x.code === code) ?? null;
}

export async function getSaasCampaign(id: string): Promise<SaasCampaignRecord | null> {
  if (isDbMode) {
    try {
      const row = await prisma.saasCampaign.findUnique({ where: { id } });
      return row ? (row as unknown as SaasCampaignRecord) : null;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const s = await readState();
  return s.campaigns.find((x) => x.id === id) ?? null;
}

export async function saveSaasCampaign(c: SaasCampaignRecord): Promise<SaasCampaignRecord> {
  if (isDbMode) {
    try {
      const data = {
        name: c.name,
        tenantId: c.tenantId,
        code: c.code,
        discountType: c.discountType,
        amountMinor: c.amountMinor,
        percent: c.percent,
        intervalScope: c.intervalScope,
        validFrom: c.validFrom ? new Date(c.validFrom) : null,
        validTo: c.validTo ? new Date(c.validTo) : null,
        maxRenewals: c.maxRenewals,
        maxRedemptions: c.maxRedemptions,
        redeemedCount: c.redeemedCount,
        postCampaignNote: c.postCampaignNote,
        active: c.active,
        createdBy: c.createdBy,
      };
      const row = await prisma.saasCampaign.upsert({
        where: { id: c.id },
        create: { id: c.id, ...data },
        update: data,
      });
      return row as unknown as SaasCampaignRecord;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const s = await readState();
  const next = clone(s);
  const idx = next.campaigns.findIndex((x) => x.id === c.id);
  if (idx >= 0) next.campaigns[idx] = clone(c);
  else next.campaigns.push(clone(c));
  await writeState(next);
  return c;
}

// ── Checkout invitations ──

export async function getSaasInvitationByTokenHash(
  tokenHash: string
): Promise<SaasCheckoutInvitationRecord | null> {
  if (isDbMode) {
    try {
      const row = await prisma.saasCheckoutInvitation.findUnique({ where: { tokenHash } });
      return row ? (row as unknown as SaasCheckoutInvitationRecord) : null;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const s = await readState();
  return s.invitations.find((x) => x.tokenHash === tokenHash) ?? null;
}

export async function findSaasInvitationByProposal(
  proposalId: string,
  proposalVersion: number
): Promise<SaasCheckoutInvitationRecord | null> {
  if (isDbMode) {
    try {
      const row = await prisma.saasCheckoutInvitation.findFirst({
        where: { proposalId, proposalVersion },
        orderBy: { createdAt: "desc" },
      });
      return row ? (row as unknown as SaasCheckoutInvitationRecord) : null;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const s = await readState();
  const matches = s.invitations.filter(
    (x) => x.proposalId === proposalId && x.proposalVersion === proposalVersion
  );
  return matches.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0] ?? null;
}

export async function saveSaasInvitation(
  inv: SaasCheckoutInvitationRecord
): Promise<SaasCheckoutInvitationRecord> {
  if (isDbMode) {
    try {
      const data = {
        tenantId: inv.tenantId,
        proposalId: inv.proposalId,
        proposalVersion: inv.proposalVersion,
        campaignId: inv.campaignId,
        planKey: inv.planKey,
        billingInterval: inv.billingInterval,
        currency: inv.currency,
        displayAmountMinor: inv.displayAmountMinor,
        tokenHash: inv.tokenHash,
        status: inv.status,
        expiresAt: new Date(inv.expiresAt),
        acceptedAt: inv.acceptedAt ? new Date(inv.acceptedAt) : null,
        acceptedBy: inv.acceptedBy,
        createdBy: inv.createdBy,
      };
      const row = await prisma.saasCheckoutInvitation.upsert({
        where: { id: inv.id },
        create: { id: inv.id, ...data },
        update: data,
      });
      return row as unknown as SaasCheckoutInvitationRecord;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const s = await readState();
  const next = clone(s);
  const idx = next.invitations.findIndex((x) => x.id === inv.id);
  if (idx >= 0) next.invitations[idx] = clone(inv);
  else next.invitations.push(clone(inv));
  await writeState(next);
  return inv;
}

// ── Trial requests ──

export async function getSaasTrialRequest(
  id: string
): Promise<SaasTrialRequestRecord | null> {
  if (isDbMode) {
    try {
      const row = await prisma.saasTrialRequest.findUnique({ where: { id } });
      return row ? (row as unknown as SaasTrialRequestRecord) : null;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const s = await readState();
  return s.trialRequests.find((x) => x.id === id) ?? null;
}

export async function saveSaasTrialRequest(
  r: SaasTrialRequestRecord
): Promise<SaasTrialRequestRecord> {
  if (isDbMode) {
    try {
      const data = {
        institutionName: r.institutionName,
        ownerName: r.ownerName,
        ownerEmail: r.ownerEmail,
        ownerPhone: r.ownerPhone,
        status: r.status,
        tenantId: r.tenantId,
        decidedBy: r.decidedBy,
        decidedAt: r.decidedAt ? new Date(r.decidedAt) : null,
      };
      const row = await prisma.saasTrialRequest.upsert({
        where: { id: r.id },
        create: { id: r.id, ...data },
        update: data,
      });
      return row as unknown as SaasTrialRequestRecord;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const s = await readState();
  const next = clone(s);
  const idx = next.trialRequests.findIndex((x) => x.id === r.id);
  if (idx >= 0) next.trialRequests[idx] = clone(r);
  else next.trialRequests.push(clone(r));
  await writeState(next);
  return r;
}

export async function listSaasTrialRequests(limit = 50): Promise<SaasTrialRequestRecord[]> {
  const n = Math.min(Math.max(limit, 1), 200);
  if (isDbMode) {
    try {
      const rows = await prisma.saasTrialRequest.findMany({
        take: n,
        orderBy: { createdAt: "desc" },
      });
      return rows as unknown as SaasTrialRequestRecord[];
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const s = await readState();
  return [...s.trialRequests]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, n);
}
