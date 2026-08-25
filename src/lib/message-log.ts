/**
 * Faz 11 — CRM mesaj günlüğü. `call-log.ts` ile AYNI store deseni. Ham
 * içerik her zaman `contentOrSummary`de saklanır; erişim sınırlaması
 * LİSTE fonksiyonunda uygulanır (`toPublicSummary` — ilk 80 karakter dışı
 * kırpılır, Homework.fileData'nın listede "1" ile değiştirilmesiyle AYNI
 * "liste kısıtlı, detay tam" deseni). Tam içerik yalnızca
 * `getMessageLogTool` (audit'li) ile görülür.
 */
import path from "path";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";
import { withFileLock, writeJsonFileAtomic } from "./atomic-json-file";
import type { MessageLog, MessageChannel, MessageLogStatus, CrmContactType } from "./types";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "message-logs.json");
export const MESSAGE_LOG_FILE = FILE;

const SUMMARY_MAX_CHARS = 80;

type Stored = MessageLog & { tenantId: string };

async function loadAll(): Promise<Stored[]> {
  try {
    const fs = await import("fs/promises");
    return JSON.parse(await fs.readFile(FILE, "utf8")) as Stored[];
  } catch {
    return [];
  }
}
async function saveAll(rows: Stored[]) {
  await writeJsonFileAtomic(FILE, rows);
}
function toPublicFull(r: Stored): MessageLog {
  const { tenantId: _t, ...pub } = r;
  void _t;
  return pub;
}

/** Liste görünümü — ham içerik yerine kırpılmış özet taşır (bkz. dosya başı notu). */
export function toPublicSummary(m: MessageLog): MessageLog {
  if (m.contentOrSummary.length <= SUMMARY_MAX_CHARS) return m;
  return { ...m, contentOrSummary: `${m.contentOrSummary.slice(0, SUMMARY_MAX_CHARS)}…` };
}

function dbRowToPublic(r: Record<string, unknown>): MessageLog {
  return {
    id: r.id as string,
    channel: r.channel as MessageChannel,
    senderIdentifier: r.senderIdentifier as string,
    occurredAt: (r.occurredAt as Date).toISOString(),
    contentOrSummary: r.contentOrSummary as string,
    status: r.status as MessageLogStatus,
    contactType: (r.contactType as CrmContactType) ?? undefined,
    contactId: (r.contactId as string) ?? undefined,
    responderUserId: (r.responderUserId as string) ?? undefined,
    createdBy: r.createdBy as string,
    createdAt: (r.createdAt as Date).toISOString(),
    updatedAt: (r.updatedAt as Date).toISOString(),
  };
}

export async function listMessageLogs(tenantId: string): Promise<MessageLog[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.messageLog.findMany({ where: { tenantId }, orderBy: { occurredAt: "desc" } });
    return rows.map((r) => dbRowToPublic(r as unknown as Record<string, unknown>));
  }
  const all = await loadAll();
  return all.filter((r) => r.tenantId === tenantId).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).map(toPublicFull);
}

export async function getMessageLog(tenantId: string, messageId: string): Promise<MessageLog | undefined> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const row = await prisma.messageLog.findFirst({ where: { id: messageId, tenantId } });
    return row ? dbRowToPublic(row as unknown as Record<string, unknown>) : undefined;
  }
  const all = await loadAll();
  const row = all.find((r) => r.id === messageId && r.tenantId === tenantId);
  return row ? toPublicFull(row) : undefined;
}

export type CreateMessageLogResult = { ok: true; entry: MessageLog } | { ok: false; message: string };

export async function createMessageLog(input: {
  tenantId: string;
  channel: MessageChannel;
  senderIdentifier: string;
  occurredAt: string;
  contentOrSummary: string;
  contactType?: CrmContactType;
  contactId?: string;
  createdBy: string;
}): Promise<CreateMessageLogResult> {
  if (!input.senderIdentifier.trim()) return { ok: false, message: "Gönderen bilgisi boş olamaz." };
  if (!input.contentOrSummary.trim()) return { ok: false, message: "İçerik boş olamaz." };
  const now = new Date().toISOString();

  if (isDbMode) {
    const { prisma } = await import("./db");
    const created = await prisma.messageLog.create({
      data: {
        id: uid("msg"),
        tenantId: input.tenantId,
        channel: input.channel,
        senderIdentifier: input.senderIdentifier,
        occurredAt: new Date(input.occurredAt),
        contentOrSummary: input.contentOrSummary,
        contactType: input.contactType,
        contactId: input.contactId,
        createdBy: input.createdBy,
      },
    });
    return { ok: true, entry: dbRowToPublic(created as unknown as Record<string, unknown>) };
  }

  return withFileLock(FILE, async () => {
    const all = await loadAll();
    const row: Stored = {
      id: uid("msg"),
      tenantId: input.tenantId,
      channel: input.channel,
      senderIdentifier: input.senderIdentifier,
      occurredAt: input.occurredAt,
      contentOrSummary: input.contentOrSummary,
      status: "unread",
      contactType: input.contactType,
      contactId: input.contactId,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    await saveAll([...all, row]);
    return { ok: true, entry: toPublicFull(row) };
  });
}

export type UpdateMessageLogResult = { ok: true; entry: MessageLog } | { ok: false; message: string };

export async function assignMessageContact(
  tenantId: string,
  messageId: string,
  input: { contactType: CrmContactType; contactId: string }
): Promise<UpdateMessageLogResult> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const existing = await prisma.messageLog.findFirst({ where: { id: messageId, tenantId } });
    if (!existing) return { ok: false, message: "Mesaj kaydı bulunamadı." };
    const updated = await prisma.messageLog.update({
      where: { id: messageId },
      data: { contactType: input.contactType, contactId: input.contactId },
    });
    return { ok: true, entry: dbRowToPublic(updated as unknown as Record<string, unknown>) };
  }
  return withFileLock(FILE, async () => {
    const all = await loadAll();
    const idx = all.findIndex((r) => r.id === messageId && r.tenantId === tenantId);
    if (idx === -1) return { ok: false, message: "Mesaj kaydı bulunamadı." };
    const updated: Stored = {
      ...all[idx]!,
      contactType: input.contactType,
      contactId: input.contactId,
      updatedAt: new Date().toISOString(),
    };
    const next = [...all];
    next[idx] = updated;
    await saveAll(next);
    return { ok: true, entry: toPublicFull(updated) };
  });
}

export async function setMessageStatus(
  tenantId: string,
  messageId: string,
  input: { status: MessageLogStatus; responderUserId?: string }
): Promise<UpdateMessageLogResult> {
  const now = new Date().toISOString();
  if (isDbMode) {
    const { prisma } = await import("./db");
    const existing = await prisma.messageLog.findFirst({ where: { id: messageId, tenantId } });
    if (!existing) return { ok: false, message: "Mesaj kaydı bulunamadı." };
    const updated = await prisma.messageLog.update({
      where: { id: messageId },
      data: { status: input.status, responderUserId: input.responderUserId ?? existing.responderUserId },
    });
    return { ok: true, entry: dbRowToPublic(updated as unknown as Record<string, unknown>) };
  }
  return withFileLock(FILE, async () => {
    const all = await loadAll();
    const idx = all.findIndex((r) => r.id === messageId && r.tenantId === tenantId);
    if (idx === -1) return { ok: false, message: "Mesaj kaydı bulunamadı." };
    const updated: Stored = {
      ...all[idx]!,
      status: input.status,
      responderUserId: input.responderUserId ?? all[idx]!.responderUserId,
      updatedAt: now,
    };
    const next = [...all];
    next[idx] = updated;
    await saveAll(next);
    return { ok: true, entry: toPublicFull(updated) };
  });
}
