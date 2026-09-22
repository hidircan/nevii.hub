import { isDbMode, isMemoryMode } from "../config";
import { requireTenantId, runWithTenantAsync } from "../tenant-context";
import { recordAuditLog } from "../audit/log";
import { remainingAmount, resolveCollectionStatus } from "./status";
import type { AppData, Payment } from "../types";
import type { MarkPaymentPaidOptions } from "../store-json";

export type CollectPaymentResult = {
  payment: Payment;
  data: AppData;
};

export type CollectPaymentOpts = MarkPaymentPaidOptions & {
  voided?: boolean;
  actorUserId?: string;
  tenantId?: string;
  /**
   * true: bu çağrı YENİ bir tahsilat tutarıdır; mevcut `paidAmount`'a EKLENİR.
   * Sözleşme taksitine ikinci/kısmi ödeme bu yoldan gider (2000 + 3950 = 5950).
   * false/undefined: `paidAmount` verilen tutarla DEĞİŞTİRİLİR (düzeltme/edit).
   */
  accumulate?: boolean;
  /**
   * true: `opts.amount` yalnız tahsilatı değil fatura tutarını (`Payment.amount`)
   * da düzeltir. Kayıt anı ilk tahsilatının 1 TL → 7000 TL revizyonu gibi
   * senaryolarda zorunlu — aksi halde paidAmount güncellenir, amount yapışır kalır
   * ve sözleşme/önizleme hâlâ eski tutarı okur.
   */
  reviseBilledAmount?: boolean;
};

function nextPaidAmount(
  previous: { amount: number; paidAmount: number },
  opts: { amount?: number; voided?: boolean; accumulate?: boolean }
): number {
  if (opts.voided) return 0;
  const incoming = Math.trunc(opts.amount ?? previous.amount);
  if (opts.accumulate) return Math.trunc(previous.paidAmount) + incoming;
  return incoming;
}

function applyPaymentPatch(
  data: AppData,
  paymentId: string,
  opts: CollectPaymentOpts
): { next: AppData; payment: Payment; previous: Payment } {
  const idx = data.payments.findIndex((p) => p.id === paymentId);
  if (idx < 0) throw new Error("Ödeme bulunamadı");
  const previous = data.payments[idx]!;
  const student = data.students.find((s) => s.id === previous.studentId);
  const billedAmount =
    opts.reviseBilledAmount && opts.amount !== undefined && !opts.voided
      ? Math.trunc(opts.amount)
      : previous.amount;
  const paidAmount = nextPaidAmount(
    { amount: billedAmount, paidAmount: previous.paidAmount },
    opts
  );
  const status = resolveCollectionStatus({
    amount: billedAmount,
    paidAmount,
    dueDate: previous.dueDate,
    voided: opts.voided,
  });
  const payment: Payment = {
    ...previous,
    amount: billedAmount,
    status,
    paidAmount,
    paidAt: opts.voided ? undefined : opts.paidAt ?? new Date().toISOString(),
    method: opts.method || previous.method || student?.paymentMethod || "transfer",
    ...(opts.paymentNote !== undefined ? { paymentNote: opts.paymentNote } : {}),
    ...(opts.receivedByUserId !== undefined ? { receivedByUserId: opts.receivedByUserId } : {}),
  };
  const payments = [...data.payments];
  payments[idx] = payment;
  return { next: { ...data, payments }, payment, previous };
}

async function syncCasesForPayment(args: {
  tenantId: string;
  payment: Payment;
  actorUserId?: string;
  tx?: Parameters<typeof import("../tahsilat/cases").syncFollowUpCasesFromPaymentTx>[0];
}) {
  const { syncFollowUpCasesFromPayment, syncFollowUpCasesFromPaymentTx } = await import("../tahsilat/cases");
  const payload = {
    tenantId: args.tenantId,
    paymentId: args.payment.id,
    paidAmount: args.payment.paidAmount,
    remaining: remainingAmount(args.payment.amount, args.payment.paidAmount),
    paymentStatus: args.payment.status,
    actorUserId: args.actorUserId,
  };
  if (args.tx) return syncFollowUpCasesFromPaymentTx(args.tx, payload);
  return syncFollowUpCasesFromPayment(payload);
}

async function collectDb(
  tenantId: string,
  paymentId: string,
  opts: CollectPaymentOpts
): Promise<CollectPaymentResult> {
  const { prisma } = await import("../db");
  const { Prisma } = await import("@prisma/client");
  await prisma.$transaction(
    async (tx) => {
      const payment = await tx.payment.findFirst({ where: { id: paymentId, tenantId } });
      if (!payment) throw new Error("Ödeme bulunamadı");
      const student = payment.studentId
        ? await tx.student.findFirst({ where: { id: payment.studentId, tenantId } })
        : null;
      const billedAmount =
        opts.reviseBilledAmount && opts.amount !== undefined && !opts.voided
          ? Math.trunc(opts.amount)
          : payment.amount;
      const paidAmount = nextPaidAmount(
        { amount: billedAmount, paidAmount: payment.paidAmount },
        opts
      );
      const status = resolveCollectionStatus({
        amount: billedAmount,
        paidAmount,
        dueDate: payment.dueDate.toISOString(),
        voided: opts.voided,
      });
      await tx.payment.updateMany({
        where: { id: paymentId, tenantId },
        data: {
          status,
          amount: billedAmount,
          paidAmount,
          paidAt: opts.voided ? null : opts.paidAt ? new Date(opts.paidAt) : new Date(),
          method: opts.method || payment.method || student?.paymentMethod || undefined,
          ...(opts.paymentNote !== undefined ? { paymentNote: opts.paymentNote } : {}),
          ...(opts.receivedByUserId !== undefined ? { receivedByUserId: opts.receivedByUserId } : {}),
        },
      });
      const updated = await tx.payment.findFirst({ where: { id: paymentId, tenantId } });
      if (!updated) throw new Error("Ödeme bulunamadı");
      await syncCasesForPayment({
        tenantId,
        actorUserId: opts.actorUserId,
        tx,
        payment: {
          id: updated.id,
          studentId: updated.studentId,
          amount: updated.amount,
          paidAmount: updated.paidAmount,
          status: updated.status as Payment["status"],
          dueDate: updated.dueDate.toISOString(),
          description: updated.description,
          method: updated.method ?? undefined,
          paidAt: updated.paidAt?.toISOString(),
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
  const { readData } = await import("../store");
  const data = await readData();
  const payment = data.payments.find((p) => p.id === paymentId);
  if (!payment) throw new Error("Ödeme bulunamadı");
  return { payment, data };
}

async function collectFileBacked(
  tenantId: string,
  paymentId: string,
  opts: CollectPaymentOpts
): Promise<CollectPaymentResult> {
  const store = isMemoryMode ? await import("../store-memory") : await import("../store-json");
  const casesMod = await import("../tahsilat/cases");
  let caseSnapshot: Awaited<ReturnType<typeof casesMod.loadAllFollowUpCasesUnlocked>> | null = null;
  const data = await store.mutateStoreUnderLock(async (current) => {
    const applied = applyPaymentPatch(current, paymentId, opts);
    caseSnapshot = await casesMod.loadAllFollowUpCasesUnlocked();
    try {
      await syncCasesForPayment({ tenantId, payment: applied.payment, actorUserId: opts.actorUserId });
    } catch (err) {
      void recordAuditLog({
        tenantId,
        actorUserId: opts.actorUserId ?? "system",
        actorRole: "unknown",
        action: "payment.case_sync_failed",
        entityType: "Payment",
        entityId: paymentId,
        outcome: "error",
        meta: { compensated: true, reason: "case_sync_failed" },
      });
      throw err;
    }
    return applied.next;
  }, async () => {
    if (caseSnapshot) await casesMod.replaceFollowUpCasesSnapshot(caseSnapshot);
    void recordAuditLog({
      tenantId,
      actorUserId: opts.actorUserId ?? "system",
      actorRole: "unknown",
      action: "payment.store_write_failed",
      entityType: "Payment",
      entityId: paymentId,
      outcome: "error",
      meta: { compensated: true, reason: "store_write_failed" },
    });
  });
  const payment = data.payments.find((p) => p.id === paymentId);
  if (!payment) throw new Error("Ödeme bulunamadı");
  return { payment, data };
}

export async function collectPayment(
  paymentId: string,
  opts: CollectPaymentOpts = {}
): Promise<CollectPaymentResult> {
  const tenantId = opts.tenantId || requireTenantId();
  if (isDbMode) return collectDb(tenantId, paymentId, opts);
  return runWithTenantAsync(tenantId, () => collectFileBacked(tenantId, paymentId, opts));
}
