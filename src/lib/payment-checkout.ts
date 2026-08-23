/**
 * Karma Öğrenci Portalı — `PaymentCheckoutAttempt` store katmanı. AYNI ikili
 * (json dosya ↔ Prisma DB) desen (`notification-preferences.ts`,
 * `student-portal-access.ts`). Bu, `Payment`'ın YANINDA, ayrı ve additive
 * bir tablo — mevcut manuel tahsilat akışı hiçbir şekilde değiştirilmedi.
 *
 * `findCheckoutAttemptByProviderReference` BİLİNÇLİ OLARAK tenant-scoped
 * DEĞİL — webhook, provider'ın opaque referansından hangi tenant'a ait
 * olduğunu ÖNCE bulmak zorunda (tıpkı `src/lib/whatsapp/phone-map.ts`
 * findTenantsForPhone'un telefon numarasından tenant çözmesi gibi). Diğer
 * TÜM fonksiyonlar tenant-scoped'tur.
 */
import path from "path";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "payment-checkout-attempts.json");

export const PAYMENT_CHECKOUT_ATTEMPTS_FILE = FILE;

export type CheckoutAttemptStatus = "pending" | "succeeded" | "failed" | "expired";

export type CheckoutAttemptRecord = {
  id: string;
  tenantId: string;
  paymentId: string;
  studentId: string;
  initiatedByUserId: string;
  provider: string;
  providerReference: string | null;
  /** Sağlayıcının barındırdığı checkout sayfası URL'i — yalnızca idempotent tekrar kullanım için. */
  checkoutUrl: string | null;
  status: CheckoutAttemptStatus;
  amount: number;
  currency: string;
  idempotencyKey: string;
  expiresAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

async function loadAll(): Promise<CheckoutAttemptRecord[]> {
  try {
    const fs = await import("fs/promises");
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw) as CheckoutAttemptRecord[];
  } catch {
    return [];
  }
}

async function saveAll(rows: CheckoutAttemptRecord[]): Promise<void> {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2));
}

function toRecord(r: {
  id: string;
  tenantId: string;
  paymentId: string;
  studentId: string;
  initiatedByUserId: string;
  provider: string;
  providerReference: string | null;
  checkoutUrl: string | null;
  status: string;
  amount: number;
  currency: string;
  idempotencyKey: string;
  expiresAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): CheckoutAttemptRecord {
  return {
    ...r,
    status: r.status as CheckoutAttemptStatus,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    completedAt: r.completedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Aynı ödeme için hâlâ geçerli (pending, süresi geçmemiş) bir deneme varsa onu döner — yeni bir sağlayıcı işlemi başlatmadan önce yeniden kullanmak için. */
export async function findPendingCheckoutAttempt(
  tenantId: string,
  paymentId: string
): Promise<CheckoutAttemptRecord | null> {
  const now = Date.now();
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.paymentCheckoutAttempt.findMany({
      where: { tenantId, paymentId, status: "pending" },
      orderBy: { createdAt: "desc" },
    });
    const fresh = rows.find((r) => !r.expiresAt || r.expiresAt.getTime() > now);
    return fresh ? toRecord(fresh) : null;
  }
  const all = await loadAll();
  const candidates = all
    .filter((r) => r.tenantId === tenantId && r.paymentId === paymentId && r.status === "pending")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const fresh = candidates.find((r) => !r.expiresAt || new Date(r.expiresAt).getTime() > now);
  return fresh ?? null;
}

export async function createCheckoutAttempt(input: {
  tenantId: string;
  paymentId: string;
  studentId: string;
  initiatedByUserId: string;
  provider: string;
  amount: number;
  currency: string;
  idempotencyKey: string;
  expiresAt?: string;
}): Promise<CheckoutAttemptRecord> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const created = await prisma.paymentCheckoutAttempt.create({
      data: {
        id: uid("pca"),
        tenantId: input.tenantId,
        paymentId: input.paymentId,
        studentId: input.studentId,
        initiatedByUserId: input.initiatedByUserId,
        provider: input.provider,
        status: "pending",
        amount: input.amount,
        currency: input.currency,
        idempotencyKey: input.idempotencyKey,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      },
    });
    return toRecord(created);
  }
  const all = await loadAll();
  const now = new Date().toISOString();
  const record: CheckoutAttemptRecord = {
    id: uid("pca"),
    tenantId: input.tenantId,
    paymentId: input.paymentId,
    studentId: input.studentId,
    initiatedByUserId: input.initiatedByUserId,
    provider: input.provider,
    providerReference: null,
    checkoutUrl: null,
    status: "pending",
    amount: input.amount,
    currency: input.currency,
    idempotencyKey: input.idempotencyKey,
    expiresAt: input.expiresAt ?? null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  all.push(record);
  await saveAll(all);
  return record;
}

/** Provider'dan dönen referans + (varsa) barındırılan checkout URL'ini kaydeder — idempotent tekrar kullanım için. */
export async function setCheckoutAttemptProviderDetails(
  tenantId: string,
  id: string,
  details: { providerReference: string; checkoutUrl?: string }
): Promise<void> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    await prisma.paymentCheckoutAttempt.updateMany({
      where: { id, tenantId },
      data: { providerReference: details.providerReference, checkoutUrl: details.checkoutUrl ?? undefined },
    });
    return;
  }
  const all = await loadAll();
  const idx = all.findIndex((r) => r.id === id && r.tenantId === tenantId);
  if (idx === -1) return;
  all[idx] = {
    ...all[idx],
    providerReference: details.providerReference,
    checkoutUrl: details.checkoutUrl ?? all[idx].checkoutUrl,
    updatedAt: new Date().toISOString(),
  };
  await saveAll(all);
}

export async function markCheckoutAttemptFailed(tenantId: string, id: string): Promise<void> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    await prisma.paymentCheckoutAttempt.updateMany({ where: { id, tenantId }, data: { status: "failed" } });
    return;
  }
  const all = await loadAll();
  const idx = all.findIndex((r) => r.id === id && r.tenantId === tenantId);
  if (idx === -1) return;
  all[idx] = { ...all[idx], status: "failed", updatedAt: new Date().toISOString() };
  await saveAll(all);
}

/**
 * Webhook, provider'dan gelen opaque `providerReference`'tan hangi
 * tenant/checkout denemesine ait olduğunu bulmak için kullanır — TEK
 * bilinçli tenant-scoped OLMAYAN sorgu (bkz. dosya başı yorumu).
 */
export async function findCheckoutAttemptByProviderReference(
  providerReference: string
): Promise<CheckoutAttemptRecord | null> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const row = await prisma.paymentCheckoutAttempt.findFirst({ where: { providerReference } });
    return row ? toRecord(row) : null;
  }
  const all = await loadAll();
  return all.find((r) => r.providerReference === providerReference) ?? null;
}

/**
 * Webhook başarı bildirimini idempotent şekilde uygular: zaten `succeeded`
 * ise (tekrarlanan/replay edilen webhook) İKİNCİ kez `Payment`'ı asla
 * tekrar tahsil etmez — yalnızca `true` (zaten işlenmiş) döner.
 */
export async function markCheckoutAttemptSucceeded(tenantId: string, id: string): Promise<boolean> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const result = await prisma.paymentCheckoutAttempt.updateMany({
      where: { id, tenantId, status: { not: "succeeded" } },
      data: { status: "succeeded", completedAt: new Date() },
    });
    return result.count > 0;
  }
  const all = await loadAll();
  const idx = all.findIndex((r) => r.id === id && r.tenantId === tenantId);
  if (idx === -1) return false;
  if (all[idx].status === "succeeded") return false;
  const now = new Date().toISOString();
  all[idx] = { ...all[idx], status: "succeeded", completedAt: now, updatedAt: now };
  await saveAll(all);
  return true;
}
