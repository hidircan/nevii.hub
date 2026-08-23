/**
 * Tahsilat Agent — kalıcı vaka takibi (v3).
 * STORE_MODE=db  → Prisma PaymentFollowUpCase
 * STORE_MODE=json → tahsilat-cases.json
 */

import path from "path";
import { isDbMode, resolveDataDir } from "../config";
import { withFileLock, writeJsonFileAtomic } from "../atomic-json-file";
import { withKeyLock } from "../keyed-lock";
import { uid } from "../utils";
import type { PaymentFollowUpCase as DbFollowUpCase } from "@prisma/client";
import {
  assertTransition,
  isOpenFollowUpStatus,
  isTerminalFollowUpStatus,
  normalizeLegacyStatus,
  type FollowUpStatus,
} from "./status";
import type {
  FollowUpAttempt,
  FollowUpCase,
  FollowUpChannel,
  FollowUpEvent,
} from "./types";

export type { FollowUpStatus } from "./status";
export type { FollowUpCase, FollowUpAttempt, FollowUpEvent, FollowUpChannel } from "./types";
export { toPublicCase } from "./types";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "tahsilat-cases.json");

export const FOLLOW_UP_CASES_FILE = FILE;

async function loadAllUnlocked(): Promise<FollowUpCase[]> {
  try {
    const fs = await import("fs/promises");
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw) as FollowUpCase[];
  } catch {
    return [];
  }
}

async function saveAllUnlocked(cases: FollowUpCase[]): Promise<void> {
  await writeJsonFileAtomic(FILE, cases);
}

function withCasesLock<T>(fn: () => Promise<T>): Promise<T> {
  return withFileLock(FILE, fn);
}

function toIso(date: Date | null | undefined): string | undefined {
  return date ? date.toISOString() : undefined;
}

function parseJsonArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function mapDbCase(c: DbFollowUpCase): FollowUpCase {
  const extra = c as DbFollowUpCase & {
    openingBalance?: number | null;
    currentBalance?: number | null;
    currency?: string | null;
    dueDate?: Date | null;
    daysOverdue?: number | null;
    selectedChannel?: string | null;
    approvedMessage?: string | null;
    lastError?: string | null;
    closedAt?: Date | null;
    attributedPaidSnapshot?: number | null;
    attempts?: unknown;
    events?: unknown;
  };
  return {
    id: c.id,
    tenantId: c.tenantId,
    paymentId: c.paymentId,
    studentId: c.studentId,
    status: normalizeLegacyStatus(c.status),
    messageDraft: c.messageDraft,
    approvedBy: c.approvedBy ?? undefined,
    approvedAt: toIso(c.approvedAt),
    sentAt: toIso(c.sentAt),
    resolvedAt: toIso(c.resolvedAt),
    attributedAmount: c.attributedAmount,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    openingBalance: extra.openingBalance ?? undefined,
    currentBalance: extra.currentBalance ?? undefined,
    currency: extra.currency ?? undefined,
    dueDate: toIso(extra.dueDate),
    daysOverdue: extra.daysOverdue ?? undefined,
    selectedChannel: (extra.selectedChannel as FollowUpChannel | null) ?? undefined,
    approvedMessage: extra.approvedMessage ?? undefined,
    lastError: extra.lastError ?? undefined,
    closedAt: toIso(extra.closedAt),
    attributedPaidSnapshot: extra.attributedPaidSnapshot ?? undefined,
    attempts: parseJsonArray<FollowUpAttempt>(extra.attempts),
    events: parseJsonArray<FollowUpEvent>(extra.events),
  };
}

function appendEvent(
  c: FollowUpCase,
  from: FollowUpStatus,
  to: FollowUpStatus,
  actorUserId?: string,
  reason?: string
): FollowUpEvent[] {
  const ev: FollowUpEvent = {
    id: uid("fuev"),
    fromStatus: from,
    toStatus: to,
    actorUserId,
    reason,
    at: new Date().toISOString(),
  };
  return [...(c.events ?? []), ev];
}

function findOpen(cases: FollowUpCase[], tenantId: string, paymentId: string): FollowUpCase | undefined {
  return cases.find(
    (c) => c.tenantId === tenantId && c.paymentId === paymentId && isOpenFollowUpStatus(c.status)
  );
}

async function listFollowUpCasesDb(tenantId: string): Promise<FollowUpCase[]> {
  const { prisma } = await import("../db");
  const rows = await prisma.paymentFollowUpCase.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(mapDbCase);
}

function extraWriteData(partial: Partial<FollowUpCase>) {
  return {
    openingBalance: partial.openingBalance ?? undefined,
    currentBalance: partial.currentBalance ?? undefined,
    currency: partial.currency ?? undefined,
    dueDate: partial.dueDate ? new Date(partial.dueDate) : undefined,
    daysOverdue: partial.daysOverdue ?? undefined,
    selectedChannel: partial.selectedChannel ?? undefined,
    approvedMessage: partial.approvedMessage ?? undefined,
    lastError: partial.lastError ?? undefined,
    closedAt: partial.closedAt ? new Date(partial.closedAt) : undefined,
    attributedPaidSnapshot: partial.attributedPaidSnapshot ?? undefined,
    attempts: partial.attempts === undefined ? undefined : (partial.attempts as object),
    events: partial.events === undefined ? undefined : (partial.events as object),
  };
}

async function upsertFollowUpCaseDb(
  partial: Omit<FollowUpCase, "id" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<FollowUpCase> {
  const { prisma } = await import("../db");
  const now = new Date();
  const data = {
    paymentId: partial.paymentId,
    studentId: partial.studentId,
    status: partial.status,
    messageDraft: partial.messageDraft,
    approvedBy: partial.approvedBy ?? null,
    approvedAt: partial.approvedAt ? new Date(partial.approvedAt) : null,
    sentAt: partial.sentAt ? new Date(partial.sentAt) : null,
    resolvedAt: partial.resolvedAt ? new Date(partial.resolvedAt) : null,
    attributedAmount: partial.attributedAmount,
    ...extraWriteData(partial),
  };

  const existing = partial.id
    ? await prisma.paymentFollowUpCase.findFirst({
        where: { id: partial.id, tenantId: partial.tenantId },
      })
    : await prisma.paymentFollowUpCase.findFirst({
        where: {
          tenantId: partial.tenantId,
          paymentId: partial.paymentId,
          status: { notIn: [...TERMINAL] },
        },
      });
  if (existing) {
    const row = await prisma.paymentFollowUpCase.update({
      where: { id: existing.id },
      data,
    });
    return mapDbCase(row);
  }
  const id = partial.id ?? `case_${crypto.randomUUID().slice(0, 8)}`;
  try {
    const row = await prisma.paymentFollowUpCase.create({
      data: { ...data, id, tenantId: partial.tenantId, createdAt: now },
    });
    return mapDbCase(row);
  } catch {
    const raced = await prisma.paymentFollowUpCase.findFirst({
      where: {
        tenantId: partial.tenantId,
        paymentId: partial.paymentId,
        status: { notIn: [...TERMINAL] },
      },
    });
    if (!raced) throw new Error("Vaka oluşturulamadı");
    const row = await prisma.paymentFollowUpCase.update({ where: { id: raced.id }, data });
    return mapDbCase(row);
  }
}

const TERMINAL = ["paid", "lost", "dismissed"] as const;

async function clearFollowUpCasesDb(tenantId: string): Promise<void> {
  const { prisma } = await import("../db");
  await prisma.paymentFollowUpCase.deleteMany({ where: { tenantId } });
}

export async function listFollowUpCases(tenantId: string): Promise<FollowUpCase[]> {
  if (isDbMode) return listFollowUpCasesDb(tenantId);
  return (await loadAllUnlocked()).filter((c) => c.tenantId === tenantId);
}

export async function getFollowUpCase(tenantId: string, id: string): Promise<FollowUpCase | null> {
  if (isDbMode) {
    const { prisma } = await import("../db");
    const row = await prisma.paymentFollowUpCase.findFirst({ where: { id, tenantId } });
    return row ? mapDbCase(row) : null;
  }
  return (await loadAllUnlocked()).find((c) => c.id === id && c.tenantId === tenantId) ?? null;
}

export async function upsertFollowUpCase(
  partial: Omit<FollowUpCase, "id" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<FollowUpCase> {
  const lockKey = `followup:${partial.tenantId}:${partial.paymentId}`;
  return withKeyLock(lockKey, async () => {
    if (isDbMode) return upsertFollowUpCaseDb(partial);
    return withCasesLock(async () => {
      const all = await loadAllUnlocked();
      const now = new Date().toISOString();
      const existing = partial.id
        ? all.find((c) => c.id === partial.id && c.tenantId === partial.tenantId)
        : findOpen(all, partial.tenantId, partial.paymentId);
      const record: FollowUpCase = existing
        ? { ...existing, ...partial, id: existing.id, createdAt: existing.createdAt, updatedAt: now }
        : {
            ...partial,
            id: `case_${crypto.randomUUID().slice(0, 8)}`,
            createdAt: now,
            updatedAt: now,
            events: partial.events ?? [],
            attempts: partial.attempts ?? [],
          };
      const next = existing ? all.map((c) => (c.id === record.id ? record : c)) : [...all, record];
      await saveAllUnlocked(next);
      return record;
    });
  });
}

export async function transitionFollowUpCase(input: {
  tenantId: string;
  caseId: string;
  to: FollowUpStatus;
  actorUserId?: string;
  reason?: string;
  patch?: Partial<FollowUpCase>;
}): Promise<FollowUpCase | null> {
  const current = await getFollowUpCase(input.tenantId, input.caseId);
  if (!current) return null;
  assertTransition(current.status, input.to);
  if (current.status === input.to && !input.patch) return current;
  const now = new Date().toISOString();
  const events = appendEvent(current, current.status, input.to, input.actorUserId, input.reason);
  const closed =
    isTerminalFollowUpStatus(input.to) && !isTerminalFollowUpStatus(current.status)
      ? { resolvedAt: now, closedAt: now }
      : {};
  return upsertFollowUpCase({
    ...current,
    ...input.patch,
    ...closed,
    status: input.to,
    events,
    tenantId: input.tenantId,
  });
}

export async function markPaymentCasesPaid(args: {
  tenantId: string;
  paymentId: string;
  amount: number;
}): Promise<FollowUpCase[]> {
  return syncFollowUpCasesFromPayment({
    tenantId: args.tenantId,
    paymentId: args.paymentId,
    paidAmount: args.amount,
    remaining: 0,
    paymentStatus: "paid",
  });
}

export type PaymentCaseSyncArgs = {
  tenantId: string;
  paymentId: string;
  paidAmount: number;
  remaining: number;
  paymentStatus: string;
  actorUserId?: string;
};

export type PlannedCaseSync = {
  id: string;
  from: FollowUpStatus;
  to: FollowUpStatus;
  next: FollowUpCase;
};

let failNextSyncForTests = false;
export function __failNextFollowUpSyncForTests() {
  failNextSyncForTests = true;
}

export function planFollowUpSyncFromPayment(
  cases: FollowUpCase[],
  args: PaymentCaseSyncArgs,
  now = new Date()
): PlannedCaseSync[] {
  const planned: PlannedCaseSync[] = [];
  for (const c of cases) {
    if (c.tenantId !== args.tenantId || c.paymentId !== args.paymentId) continue;
    if (!isOpenFollowUpStatus(c.status) && args.paymentStatus !== "voided") continue;
    if (args.paymentStatus === "voided" && c.status !== "paid" && c.status !== "partial" && !isOpenFollowUpStatus(c.status)) {
      continue;
    }
    const snapshot = c.attributedPaidSnapshot ?? 0;
    const delta = Math.max(0, Math.trunc(args.paidAmount) - snapshot);
    const nextAttributed = snapshot === args.paidAmount ? c.attributedAmount : c.attributedAmount + delta;
    let to: FollowUpStatus = c.status;
    if (args.paymentStatus === "voided") {
      to = c.sentAt || c.status === "sent" || c.status === "partial" || c.status === "paid" ? "sent" : c.approvedAt ? "approved" : "draft";
    } else if (args.remaining <= 0 || args.paymentStatus === "paid") {
      to = "paid";
    } else if (args.paidAmount > 0) {
      to = "partial";
    }
    if (to === c.status && nextAttributed === c.attributedAmount && snapshot === args.paidAmount) {
      continue;
    }
    const nowIso = now.toISOString();
    const events = appendEvent(c, c.status, to, args.actorUserId, args.paymentStatus === "voided" ? "payment_voided" : "payment_sync");
    const closed =
      isTerminalFollowUpStatus(to) && !isTerminalFollowUpStatus(c.status)
        ? { resolvedAt: nowIso, closedAt: nowIso }
        : args.paymentStatus === "voided"
          ? { resolvedAt: undefined, closedAt: undefined }
          : {};
    planned.push({
      id: c.id,
      from: c.status,
      to,
      next: {
        ...c,
        ...closed,
        status: to,
        events,
        attributedAmount: args.paymentStatus === "voided" ? 0 : nextAttributed,
        attributedPaidSnapshot: args.paymentStatus === "voided" ? 0 : Math.trunc(args.paidAmount),
        currentBalance: Math.max(args.remaining, 0),
        updatedAt: nowIso,
      },
    });
  }
  return planned;
}

export function applyPlannedFollowUpSync(all: FollowUpCase[], planned: PlannedCaseSync[]): FollowUpCase[] {
  const byId = new Map(planned.map((p) => [p.id, p.next]));
  return all.map((c) => byId.get(c.id) ?? c);
}

export async function replaceFollowUpCasesSnapshot(next: FollowUpCase[]): Promise<void> {
  await withCasesLock(async () => {
    await saveAllUnlocked(next);
  });
}

export async function loadAllFollowUpCasesUnlocked(): Promise<FollowUpCase[]> {
  return loadAllUnlocked();
}

export async function syncFollowUpCasesFromPayment(args: PaymentCaseSyncArgs): Promise<FollowUpCase[]> {
  if (failNextSyncForTests) {
    failNextSyncForTests = false;
    throw new Error("TEST_FORCE_CASE_SYNC_FAIL");
  }
  const lockKey = `followup-sync:${args.tenantId}:${args.paymentId}`;
  return withKeyLock(lockKey, async () => {
    if (isDbMode) {
      const { prisma } = await import("../db");
      const rows = await prisma.paymentFollowUpCase.findMany({ where: { tenantId: args.tenantId } });
      const all = rows.map(mapDbCase);
      const planned = planFollowUpSyncFromPayment(all, args);
      for (const p of planned) {
        await prisma.paymentFollowUpCase.update({
          where: { id: p.next.id },
          data: caseToPrismaData(p.next),
        });
      }
      return planned.map((p) => p.next);
    }
    return withCasesLock(async () => {
      const all = await loadAllUnlocked();
      const planned = planFollowUpSyncFromPayment(all, args);
      if (!planned.length) return [];
      await saveAllUnlocked(applyPlannedFollowUpSync(all, planned));
      return planned.map((p) => p.next);
    });
  });
}

function caseToPrismaData(c: FollowUpCase) {
  return {
    status: c.status,
    messageDraft: c.messageDraft,
    approvedBy: c.approvedBy ?? null,
    approvedAt: c.approvedAt ? new Date(c.approvedAt) : null,
    sentAt: c.sentAt ? new Date(c.sentAt) : null,
    resolvedAt: c.resolvedAt ? new Date(c.resolvedAt) : null,
    attributedAmount: c.attributedAmount,
    openingBalance: c.openingBalance ?? null,
    currentBalance: c.currentBalance ?? null,
    currency: c.currency ?? null,
    dueDate: c.dueDate ? new Date(c.dueDate) : null,
    daysOverdue: c.daysOverdue ?? null,
    selectedChannel: c.selectedChannel ?? null,
    approvedMessage: c.approvedMessage ?? null,
    lastError: c.lastError ?? null,
    closedAt: c.closedAt ? new Date(c.closedAt) : null,
    attributedPaidSnapshot: c.attributedPaidSnapshot ?? 0,
    attempts: (c.attempts ?? []) as object,
    events: (c.events ?? []) as object,
  };
}

export async function syncFollowUpCasesFromPaymentTx(
  tx: Pick<import("@prisma/client").Prisma.TransactionClient, "paymentFollowUpCase">,
  args: PaymentCaseSyncArgs
): Promise<FollowUpCase[]> {
  if (failNextSyncForTests) {
    failNextSyncForTests = false;
    throw new Error("TEST_FORCE_CASE_SYNC_FAIL");
  }
  const rows = await tx.paymentFollowUpCase.findMany({ where: { tenantId: args.tenantId } });
  const all = rows.map(mapDbCase);
  const planned = planFollowUpSyncFromPayment(all, args);
  for (const p of planned) {
    await tx.paymentFollowUpCase.update({
      where: { id: p.next.id },
      data: caseToPrismaData(p.next),
    });
  }
  return planned.map((p) => p.next);
}

export async function recordFollowUpAttempt(
  tenantId: string,
  caseId: string,
  attempt: FollowUpAttempt
): Promise<FollowUpCase | null> {
  const current = await getFollowUpCase(tenantId, caseId);
  if (!current) return null;
  const attempts = [...(current.attempts ?? [])];
  const idx = attempts.findIndex((a) => a.idempotencyKey === attempt.idempotencyKey);
  if (idx >= 0) attempts[idx] = { ...attempts[idx], ...attempt, id: attempts[idx]!.id };
  else attempts.push(attempt);
  return upsertFollowUpCase({ ...current, attempts, tenantId });
}

export async function findAttemptByIdempotency(
  tenantId: string,
  caseId: string,
  key: string
): Promise<FollowUpAttempt | undefined> {
  const c = await getFollowUpCase(tenantId, caseId);
  return c?.attempts?.find((a) => a.idempotencyKey === key);
}

export async function applyFollowUpDelivery(input: {
  tenantId: string;
  providerMessageId: string;
  status: FollowUpAttempt["status"];
  deliveryConfidence: FollowUpAttempt["deliveryConfidence"];
}): Promise<FollowUpCase | null> {
  const cases = await listFollowUpCases(input.tenantId);
  const owner = cases.find((c) => c.attempts?.some((a) => a.providerMessageId === input.providerMessageId));
  if (!owner) return null;
  const attempts = (owner.attempts ?? []).map((a) =>
    a.providerMessageId === input.providerMessageId
      ? {
          ...a,
          status: input.status,
          deliveryConfidence: input.deliveryConfidence,
          updatedAt: new Date().toISOString(),
        }
      : a
  );
  return upsertFollowUpCase({ ...owner, attempts, tenantId: input.tenantId });
}

export async function clearFollowUpCases(tenantId: string): Promise<void> {
  if (isDbMode) return clearFollowUpCasesDb(tenantId);
  await withCasesLock(async () => {
    const all = await loadAllUnlocked();
    const remaining = all.filter((c) => c.tenantId !== tenantId);
    if (remaining.length !== all.length) await saveAllUnlocked(remaining);
  });
}

export type CollectionRoi = {
  activeCases: number;
  resolvedThisMonth: number;
  attributedThisMonth: number;
  lostThisMonth: number;
  closedThisMonth: number;
  successRate: number | null;
  sentThisMonth: number;
  respondedThisMonth: number;
};

export type CollectionsDashboard = CollectionRoi & {
  draftPending: number;
  sendAttempts: { whatsapp: number; sms: number; manual: number };
  sendOutcomes: {
    sent: number;
    failed: number;
    delivered: number;
    unverified: number;
  };
  attributedTotal: number;
  collectedPaidAmount: number;
  conversionRate: number | null;
  last7DaysAttributed: number;
  last30DaysAttributed: number;
};

function monthStart(now = new Date()) {
  const d = new Date(now);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getCollectionRoi(tenantId: string, now: Date = new Date()): Promise<CollectionRoi> {
  const cases = await listFollowUpCases(tenantId);
  const start = monthStart(now);
  const resolved = cases.filter(
    (c) => c.status === "paid" && c.resolvedAt && new Date(c.resolvedAt) >= start
  );
  const lost = cases.filter(
    (c) =>
      (c.status === "lost" || c.status === "dismissed") &&
      c.resolvedAt &&
      new Date(c.resolvedAt) >= start
  );
  const closedThisMonth = resolved.length + lost.length;
  const sentThisMonth = cases.filter((c) => c.sentAt && new Date(c.sentAt) >= start).length;
  const respondedThisMonth = cases.filter(
    (c) =>
      (c.status === "replied" || c.status === "paid" || c.status === "lost" || c.status === "partial") &&
      new Date(c.updatedAt) >= start
  ).length;
  return {
    activeCases: cases.filter((c) => isOpenFollowUpStatus(c.status)).length,
    resolvedThisMonth: resolved.length,
    attributedThisMonth: resolved.reduce((s, c) => s + c.attributedAmount, 0),
    lostThisMonth: lost.length,
    closedThisMonth,
    successRate: closedThisMonth > 0 ? resolved.length / closedThisMonth : null,
    sentThisMonth,
    respondedThisMonth,
  };
}

export async function getCollectionsDashboard(
  tenantId: string,
  now: Date = new Date()
): Promise<CollectionsDashboard> {
  const base = await getCollectionRoi(tenantId, now);
  const cases = await listFollowUpCases(tenantId);
  const attempts = cases.flatMap((c) => c.attempts ?? []);
  const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const attributedIn = (from: Date) =>
    cases
      .filter((c) => c.status === "paid" && c.resolvedAt && new Date(c.resolvedAt) >= from)
      .reduce((s, c) => s + c.attributedAmount, 0);
  const sentCases = cases.filter((c) => Boolean(c.sentAt));
  const paidAfterSend = sentCases.filter((c) => c.status === "paid").length;
  return {
    ...base,
    draftPending: cases.filter((c) => c.status === "draft" || c.status === "open" || c.status === "draft_ready")
      .length,
    sendAttempts: {
      whatsapp: attempts.filter((a) => a.channel === "whatsapp").length,
      sms: attempts.filter((a) => a.channel === "sms").length,
      manual: attempts.filter((a) => a.channel === "manual").length,
    },
    sendOutcomes: {
      sent: attempts.filter((a) => a.status === "sent" || a.status === "delivered").length,
      failed: attempts.filter((a) => a.status === "failed" || a.status === "undelivered").length,
      delivered: attempts.filter((a) => a.deliveryConfidence === "delivered").length,
      unverified: attempts.filter(
        (a) => a.status === "sent" || a.status === "manual_send_pending"
      ).filter((a) => a.deliveryConfidence !== "delivered").length,
    },
    attributedTotal: cases.reduce((s, c) => s + (c.attributedAmount || 0), 0),
    collectedPaidAmount: cases
      .filter((c) => c.status === "paid")
      .reduce((s, c) => s + c.attributedAmount, 0),
    conversionRate: sentCases.length > 0 ? paidAfterSend / sentCases.length : null,
    last7DaysAttributed: attributedIn(last7),
    last30DaysAttributed: attributedIn(last30),
  };
}

export function mergeCollectionRoi(parts: CollectionRoi[]): CollectionRoi {
  const activeCases = parts.reduce((s, p) => s + p.activeCases, 0);
  const resolvedThisMonth = parts.reduce((s, p) => s + p.resolvedThisMonth, 0);
  const attributedThisMonth = parts.reduce((s, p) => s + p.attributedThisMonth, 0);
  const lostThisMonth = parts.reduce((s, p) => s + p.lostThisMonth, 0);
  const closedThisMonth = parts.reduce((s, p) => s + p.closedThisMonth, 0);
  const sentThisMonth = parts.reduce((s, p) => s + p.sentThisMonth, 0);
  const respondedThisMonth = parts.reduce((s, p) => s + p.respondedThisMonth, 0);
  return {
    activeCases,
    resolvedThisMonth,
    attributedThisMonth,
    lostThisMonth,
    closedThisMonth,
    successRate: closedThisMonth > 0 ? resolvedThisMonth / closedThisMonth : null,
    sentThisMonth,
    respondedThisMonth,
  };
}
