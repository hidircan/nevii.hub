/**
 * İletişim Merkezi — kalıcı CommunicationMessage store'u (FAZ2).
 * STORE_MODE=db    → Prisma CommunicationMessage
 * STORE_MODE=json  → communication-messages.json
 * STORE_MODE=memory → aynı JSON dosya yolu (tahsilat cases.ts ile aynı desen:
 *   bu yan-store dosya tabanlı kalır, store-memory.ts'in in-process AppData
 *   singleton'ından ayrıdır — mode parity burada "db vs dosya" ekseninde).
 */

import path from "path";
import { isDbMode, resolveDataDir } from "../config";
import { withFileLock, writeJsonFileAtomic } from "../atomic-json-file";
import { withKeyLock } from "../keyed-lock";
import { uid } from "../utils";
import type { CommunicationMessage as DbCommunicationMessage } from "@prisma/client";
import { assertCommunicationTransition, type CommunicationStatus } from "./status";
import type { CommunicationEvent, CommunicationMessage } from "./types";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "communication-messages.json");

export const COMMUNICATION_MESSAGES_FILE = FILE;

async function loadAllUnlocked(): Promise<CommunicationMessage[]> {
  try {
    const fs = await import("fs/promises");
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw) as CommunicationMessage[];
  } catch {
    return [];
  }
}

async function saveAllUnlocked(rows: CommunicationMessage[]): Promise<void> {
  await writeJsonFileAtomic(FILE, rows);
}

function withMessagesLock<T>(fn: () => Promise<T>): Promise<T> {
  return withFileLock(FILE, fn);
}

function toIso(date: Date | null | undefined): string | undefined {
  return date ? date.toISOString() : undefined;
}

function parseEvents(v: unknown): CommunicationEvent[] {
  return Array.isArray(v) ? (v as CommunicationEvent[]) : [];
}

function mapDb(row: DbCommunicationMessage): CommunicationMessage {
  return {
    id: row.id,
    tenantId: row.tenantId,
    recipientType: row.recipientType as CommunicationMessage["recipientType"],
    recipientId: row.recipientId,
    recipientName: row.recipientName,
    recipientPhone: row.recipientPhone,
    channel: row.channel as CommunicationMessage["channel"],
    messageType: row.messageType as CommunicationMessage["messageType"],
    resourceType: row.resourceType as CommunicationMessage["resourceType"],
    resourceId: row.resourceId,
    status: row.status as CommunicationStatus,
    draftBody: row.draftBody,
    approvedBodySnapshot: row.approvedBodySnapshot ?? undefined,
    templateKey: (row as { templateKey?: string | null }).templateKey ?? undefined,
    createdBy: row.createdBy,
    approvedBy: row.approvedBy ?? undefined,
    approvedAt: toIso(row.approvedAt),
    attemptCount: row.attemptCount,
    providerResultCode: row.providerResultCode ?? undefined,
    providerResultSummary: row.providerResultSummary ?? undefined,
    blockedReasonCode: row.blockedReasonCode ?? undefined,
    blockedReasonMessage: row.blockedReasonMessage ?? undefined,
    idempotencyKey: row.idempotencyKey,
    approvalBatchId: row.approvalBatchId ?? undefined,
    events: parseEvents(row.events),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPrismaData(m: Omit<CommunicationMessage, "id" | "createdAt" | "updatedAt">) {
  return {
    tenantId: m.tenantId,
    recipientType: m.recipientType,
    recipientId: m.recipientId,
    recipientName: m.recipientName,
    recipientPhone: m.recipientPhone,
    channel: m.channel,
    messageType: m.messageType,
    resourceType: m.resourceType,
    resourceId: m.resourceId,
    status: m.status,
    draftBody: m.draftBody,
    approvedBodySnapshot: m.approvedBodySnapshot ?? null,
    templateKey: (m as { templateKey?: string }).templateKey ?? null,
    createdBy: m.createdBy,
    approvedBy: m.approvedBy ?? null,
    approvedAt: m.approvedAt ? new Date(m.approvedAt) : null,
    attemptCount: m.attemptCount,
    providerResultCode: m.providerResultCode ?? null,
    providerResultSummary: m.providerResultSummary ?? null,
    blockedReasonCode: m.blockedReasonCode ?? null,
    blockedReasonMessage: m.blockedReasonMessage ?? null,
    idempotencyKey: m.idempotencyKey,
    approvalBatchId: m.approvalBatchId ?? null,
    events: (m.events ?? []) as object,
  };
}

export async function listCommunicationMessages(tenantId: string): Promise<CommunicationMessage[]> {
  if (isDbMode) {
    const { prisma } = await import("../db");
    const rows = await prisma.communicationMessage.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapDb);
  }
  return (await loadAllUnlocked())
    .filter((m) => m.tenantId === tenantId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getCommunicationMessage(tenantId: string, id: string): Promise<CommunicationMessage | null> {
  if (isDbMode) {
    const { prisma } = await import("../db");
    const row = await prisma.communicationMessage.findFirst({ where: { id, tenantId } });
    return row ? mapDb(row) : null;
  }
  return (await loadAllUnlocked()).find((m) => m.id === id && m.tenantId === tenantId) ?? null;
}

export async function findCommunicationMessageByIdempotencyKey(
  tenantId: string,
  idempotencyKey: string
): Promise<CommunicationMessage | null> {
  if (isDbMode) {
    const { prisma } = await import("../db");
    const row = await prisma.communicationMessage.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
    });
    return row ? mapDb(row) : null;
  }
  return (await loadAllUnlocked()).find((m) => m.tenantId === tenantId && m.idempotencyKey === idempotencyKey) ?? null;
}

/**
 * Idempotent create: aynı tenant+idempotencyKey için ikinci çağrı, yeni kayıt
 * yaratmadan mevcut kaydı döner (aynı telafi/olay tekrar denenirse duplicate
 * taslak oluşmaz — FAZ2 idempotency kuralı).
 */
export async function createCommunicationMessage(
  input: Omit<CommunicationMessage, "id" | "createdAt" | "updatedAt" | "events"> & { events?: CommunicationEvent[] }
): Promise<{ record: CommunicationMessage; created: boolean }> {
  const lockKey = `comm-create:${input.tenantId}:${input.idempotencyKey}`;
  return withKeyLock(lockKey, async () => {
    const existing = await findCommunicationMessageByIdempotencyKey(input.tenantId, input.idempotencyKey);
    if (existing) return { record: existing, created: false };

    const now = new Date().toISOString();
    const record: CommunicationMessage = {
      ...input,
      id: `comm_${crypto.randomUUID().slice(0, 8)}`,
      events: input.events ?? [],
      createdAt: now,
      updatedAt: now,
    };

    if (isDbMode) {
      const { prisma } = await import("../db");
      try {
        const row = await prisma.communicationMessage.create({
          data: { ...toPrismaData(record), id: record.id, createdAt: new Date(now) },
        });
        return { record: mapDb(row), created: true };
      } catch {
        // unique constraint race — another request created it first
        const raced = await findCommunicationMessageByIdempotencyKey(input.tenantId, input.idempotencyKey);
        if (raced) return { record: raced, created: false };
        throw new Error("İletişim kaydı oluşturulamadı");
      }
    }

    return withMessagesLock(async () => {
      const all = await loadAllUnlocked();
      // re-check inside the file lock in case of a race between the keyed-lock check and here
      const raced = all.find((m) => m.tenantId === input.tenantId && m.idempotencyKey === input.idempotencyKey);
      if (raced) return { record: raced, created: false };
      await saveAllUnlocked([...all, record]);
      return { record, created: true };
    });
  });
}

async function persistUpdate(record: CommunicationMessage): Promise<CommunicationMessage> {
  if (isDbMode) {
    const { prisma } = await import("../db");
    const row = await prisma.communicationMessage.update({
      where: { id: record.id },
      data: toPrismaData(record),
    });
    return mapDb(row);
  }
  return withMessagesLock(async () => {
    const all = await loadAllUnlocked();
    const now = new Date().toISOString();
    const next = { ...record, updatedAt: now };
    const idx = all.findIndex((m) => m.id === record.id && m.tenantId === record.tenantId);
    if (idx < 0) throw new Error("İletişim kaydı bulunamadı");
    all[idx] = next;
    await saveAllUnlocked(all);
    return next;
  });
}

function appendEvent(
  current: CommunicationMessage,
  from: CommunicationStatus,
  to: CommunicationStatus,
  actorUserId?: string,
  reason?: string
): CommunicationEvent[] {
  const ev: CommunicationEvent = { id: uid("commev"), fromStatus: from, toStatus: to, actorUserId, reason, at: new Date().toISOString() };
  return [...(current.events ?? []), ev];
}

/** Server-side merkezi durum geçişi — geçersiz geçişleri CommunicationTransitionError ile reddeder. */
export async function transitionCommunicationMessage(input: {
  tenantId: string;
  id: string;
  to: CommunicationStatus;
  actorUserId?: string;
  reason?: string;
  patch?: Partial<CommunicationMessage>;
}): Promise<CommunicationMessage | null> {
  const current = await getCommunicationMessage(input.tenantId, input.id);
  if (!current) return null;
  assertCommunicationTransition(current.status, input.to);
  const events = appendEvent(current, current.status, input.to, input.actorUserId, input.reason);
  return persistUpdate({
    ...current,
    ...input.patch,
    id: current.id,
    tenantId: current.tenantId,
    status: input.to,
    events,
  });
}

/** Sadece draft/pending_approval taslak içeriğini düzenler (state machine dışı doğrudan patch, onay bilgisi taşımaz). */
export async function editCommunicationMessageDraft(input: {
  tenantId: string;
  id: string;
  draftBody: string;
}): Promise<CommunicationMessage | null> {
  const current = await getCommunicationMessage(input.tenantId, input.id);
  if (!current) return null;
  return persistUpdate({ ...current, draftBody: input.draftBody });
}

export async function clearCommunicationMessages(tenantId: string): Promise<void> {
  if (isDbMode) {
    const { prisma } = await import("../db");
    await prisma.communicationMessage.deleteMany({ where: { tenantId } });
    return;
  }
  await withMessagesLock(async () => {
    const all = await loadAllUnlocked();
    const remaining = all.filter((m) => m.tenantId !== tenantId);
    if (remaining.length !== all.length) await saveAllUnlocked(remaining);
  });
}

export async function loadAllCommunicationMessagesUnlocked(): Promise<CommunicationMessage[]> {
  return loadAllUnlocked();
}
