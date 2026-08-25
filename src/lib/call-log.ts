/**
 * Faz 11 — CRM arama günlüğü. `staff-advance.ts`/`leave.ts` ile AYNI store
 * deseni. Manuel giriş (gerçek telefoni entegrasyonu yok) — kişi eşleştirme
 * `createCallLogTool` içinde `crm-contact-matching.ts` ile otomatik denenir,
 * bulunamazsa/belirsizse `assignCallContactTool` ile manuel atanır.
 */
import path from "path";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";
import { withFileLock, writeJsonFileAtomic } from "./atomic-json-file";
import type { CallLog, CallDirection, CrmContactType } from "./types";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "call-logs.json");
export const CALL_LOG_FILE = FILE;

type Stored = CallLog & { tenantId: string };

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
function toPublic(r: Stored): CallLog {
  const { tenantId: _t, ...pub } = r;
  void _t;
  return pub;
}
function dbRowToPublic(r: Record<string, unknown>): CallLog {
  return {
    id: r.id as string,
    callerNumber: r.callerNumber as string,
    callerName: (r.callerName as string) ?? undefined,
    contactType: (r.contactType as CrmContactType) ?? undefined,
    contactId: (r.contactId as string) ?? undefined,
    direction: r.direction as CallDirection,
    answered: r.answered as boolean,
    durationSeconds: (r.durationSeconds as number) ?? undefined,
    occurredAt: (r.occurredAt as Date).toISOString(),
    callbackDone: r.callbackDone as boolean,
    callbackAt: (r.callbackAt as Date | null)?.toISOString() ?? undefined,
    callbackByUserId: (r.callbackByUserId as string) ?? undefined,
    note: (r.note as string) ?? undefined,
    createdBy: r.createdBy as string,
    createdAt: (r.createdAt as Date).toISOString(),
    updatedAt: (r.updatedAt as Date).toISOString(),
  };
}

export async function listCallLogs(tenantId: string): Promise<CallLog[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.callLog.findMany({ where: { tenantId }, orderBy: { occurredAt: "desc" } });
    return rows.map((r) => dbRowToPublic(r as unknown as Record<string, unknown>));
  }
  const all = await loadAll();
  return all.filter((r) => r.tenantId === tenantId).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).map(toPublic);
}

export type CreateCallLogResult = { ok: true; entry: CallLog } | { ok: false; message: string };

export async function createCallLog(input: {
  tenantId: string;
  callerNumber: string;
  callerName?: string;
  contactType?: CrmContactType;
  contactId?: string;
  direction: CallDirection;
  answered: boolean;
  durationSeconds?: number;
  occurredAt: string;
  note?: string;
  createdBy: string;
}): Promise<CreateCallLogResult> {
  if (!input.callerNumber.trim()) return { ok: false, message: "Telefon numarası boş olamaz." };
  const now = new Date().toISOString();

  if (isDbMode) {
    const { prisma } = await import("./db");
    const created = await prisma.callLog.create({
      data: {
        id: uid("call"),
        tenantId: input.tenantId,
        callerNumber: input.callerNumber,
        callerName: input.callerName,
        contactType: input.contactType,
        contactId: input.contactId,
        direction: input.direction,
        answered: input.answered,
        durationSeconds: input.durationSeconds,
        occurredAt: new Date(input.occurredAt),
        note: input.note,
        createdBy: input.createdBy,
      },
    });
    return { ok: true, entry: dbRowToPublic(created as unknown as Record<string, unknown>) };
  }

  return withFileLock(FILE, async () => {
    const all = await loadAll();
    const row: Stored = {
      id: uid("call"),
      tenantId: input.tenantId,
      callerNumber: input.callerNumber,
      callerName: input.callerName,
      contactType: input.contactType,
      contactId: input.contactId,
      direction: input.direction,
      answered: input.answered,
      durationSeconds: input.durationSeconds,
      occurredAt: input.occurredAt,
      callbackDone: false,
      note: input.note,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    await saveAll([...all, row]);
    return { ok: true, entry: toPublic(row) };
  });
}

export type UpdateCallLogResult = { ok: true; entry: CallLog } | { ok: false; message: string };

export async function assignCallContact(
  tenantId: string,
  callId: string,
  input: { contactType: CrmContactType; contactId: string }
): Promise<UpdateCallLogResult> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const existing = await prisma.callLog.findFirst({ where: { id: callId, tenantId } });
    if (!existing) return { ok: false, message: "Arama kaydı bulunamadı." };
    const updated = await prisma.callLog.update({
      where: { id: callId },
      data: { contactType: input.contactType, contactId: input.contactId },
    });
    return { ok: true, entry: dbRowToPublic(updated as unknown as Record<string, unknown>) };
  }
  return withFileLock(FILE, async () => {
    const all = await loadAll();
    const idx = all.findIndex((r) => r.id === callId && r.tenantId === tenantId);
    if (idx === -1) return { ok: false, message: "Arama kaydı bulunamadı." };
    const updated: Stored = {
      ...all[idx]!,
      contactType: input.contactType,
      contactId: input.contactId,
      updatedAt: new Date().toISOString(),
    };
    const next = [...all];
    next[idx] = updated;
    await saveAll(next);
    return { ok: true, entry: toPublic(updated) };
  });
}

export async function markCallbackDone(
  tenantId: string,
  callId: string,
  input: { callbackByUserId: string }
): Promise<UpdateCallLogResult> {
  const now = new Date().toISOString();
  if (isDbMode) {
    const { prisma } = await import("./db");
    const existing = await prisma.callLog.findFirst({ where: { id: callId, tenantId } });
    if (!existing) return { ok: false, message: "Arama kaydı bulunamadı." };
    const updated = await prisma.callLog.update({
      where: { id: callId },
      data: { callbackDone: true, callbackAt: new Date(), callbackByUserId: input.callbackByUserId },
    });
    return { ok: true, entry: dbRowToPublic(updated as unknown as Record<string, unknown>) };
  }
  return withFileLock(FILE, async () => {
    const all = await loadAll();
    const idx = all.findIndex((r) => r.id === callId && r.tenantId === tenantId);
    if (idx === -1) return { ok: false, message: "Arama kaydı bulunamadı." };
    const updated: Stored = {
      ...all[idx]!,
      callbackDone: true,
      callbackAt: now,
      callbackByUserId: input.callbackByUserId,
      updatedAt: now,
    };
    const next = [...all];
    next[idx] = updated;
    await saveAll(next);
    return { ok: true, entry: toPublic(updated) };
  });
}
