import { promises as fs } from "fs";
import path from "path";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";

/**
 * Hesap silme talepleri (Faz 6 — store uyumluluğu + KVKK).
 *
 * Model: kullanıcı (her rol, kendi hesabı) TEK açık talep oluşturabilir
 * (idempotent: açık talep varken tekrar istek aynı kaydı döner). Karar
 * admin'dedir (onay/red/işlendi + not). FİZİKSEL silme bu modülde YOK —
 * `processed` kararı sonrası gerçek silme/anonimleştirme kurumun retention
 * politikasına göre yapılır; finansal/audit kayıtları yasal saklama
 * zorunluluğuyla korunur (bkz. `/hesap-silme-talebi` metni).
 *
 * Depolama: JSON modda dosya, DB modda Prisma (`AccountDeletionRequest`).
 */
export type DeletionRequestStatus = "pending" | "approved" | "rejected" | "processed" | "cancelled";

export type AccountDeletionRequest = {
  id: string;
  tenantId: string;
  userId: string;
  email: string;
  role: string;
  reason?: string;
  status: DeletionRequestStatus;
  decidedBy?: string;
  decisionNote?: string;
  decidedAt?: string;
  createdAt: string;
  updatedAt: string;
};

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "account-deletion-requests.json");
export const ACCOUNT_DELETION_REQUESTS_FILE = FILE;

async function loadAll(): Promise<AccountDeletionRequest[]> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as AccountDeletionRequest[]) : [];
  } catch {
    return [];
  }
}

async function saveAll(rows: AccountDeletionRequest[]): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2));
}

type DbRow = {
  id: string;
  tenantId: string;
  userId: string;
  email: string;
  role: string;
  reason: string | null;
  status: string;
  decidedBy: string | null;
  decisionNote: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toRecord(r: DbRow): AccountDeletionRequest {
  return {
    id: r.id,
    tenantId: r.tenantId,
    userId: r.userId,
    email: r.email,
    role: r.role,
    ...(r.reason ? { reason: r.reason } : {}),
    status: r.status as DeletionRequestStatus,
    ...(r.decidedBy ? { decidedBy: r.decidedBy } : {}),
    ...(r.decisionNote ? { decisionNote: r.decisionNote } : {}),
    ...(r.decidedAt ? { decidedAt: r.decidedAt.toISOString() } : {}),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

const OPEN = new Set(["pending", "approved"]);

/** Kullanıcının açık (pending/approved) talebi varsa döner. */
export async function getOpenDeletionRequest(
  tenantId: string,
  userId: string
): Promise<AccountDeletionRequest | null> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const row = await prisma.accountDeletionRequest.findFirst({
      where: { tenantId, userId, status: { in: ["pending", "approved"] } },
      orderBy: { createdAt: "desc" },
    });
    return row ? toRecord(row as DbRow) : null;
  }
  const all = await loadAll();
  return all.find((r) => r.tenantId === tenantId && r.userId === userId && OPEN.has(r.status)) ?? null;
}

export async function getMyDeletionRequests(
  tenantId: string,
  userId: string
): Promise<AccountDeletionRequest[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.accountDeletionRequest.findMany({
      where: { tenantId, userId },
      orderBy: { createdAt: "desc" },
    });
    return (rows as DbRow[]).map(toRecord);
  }
  return (await loadAll())
    .filter((r) => r.tenantId === tenantId && r.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Idempotent oluşturma: açık talep varsa onu döner (`created=false`). */
export async function createDeletionRequest(input: {
  tenantId: string;
  userId: string;
  email: string;
  role: string;
  reason?: string;
}): Promise<{ request: AccountDeletionRequest; created: boolean }> {
  const open = await getOpenDeletionRequest(input.tenantId, input.userId);
  if (open) return { request: open, created: false };
  const now = new Date().toISOString();
  if (isDbMode) {
    const { prisma } = await import("./db");
    const row = await prisma.accountDeletionRequest.create({
      data: {
        id: uid("del"),
        tenantId: input.tenantId,
        userId: input.userId,
        email: input.email,
        role: input.role,
        reason: input.reason ?? null,
        status: "pending",
      },
    });
    return { request: toRecord(row as DbRow), created: true };
  }
  const all = await loadAll();
  const request: AccountDeletionRequest = {
    id: uid("del"),
    tenantId: input.tenantId,
    userId: input.userId,
    email: input.email,
    role: input.role,
    ...(input.reason ? { reason: input.reason } : {}),
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  all.push(request);
  await saveAll(all);
  return { request, created: true };
}

/** Kullanıcı kendi BEKLEYEN talebini geri çeker. */
export async function cancelDeletionRequest(
  tenantId: string,
  userId: string
): Promise<AccountDeletionRequest | null> {
  const open = await getOpenDeletionRequest(tenantId, userId);
  if (!open || open.status !== "pending") return null;
  return setDeletionRequestStatus(tenantId, open.id, "cancelled", {});
}

export async function listDeletionRequests(tenantId: string): Promise<AccountDeletionRequest[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.accountDeletionRequest.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });
    return (rows as DbRow[]).map(toRecord);
  }
  return (await loadAll())
    .filter((r) => r.tenantId === tenantId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function setDeletionRequestStatus(
  tenantId: string,
  id: string,
  status: DeletionRequestStatus,
  opts: { decidedBy?: string; decisionNote?: string }
): Promise<AccountDeletionRequest | null> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const existing = await prisma.accountDeletionRequest.findFirst({ where: { id, tenantId } });
    if (!existing) return null;
    const row = await prisma.accountDeletionRequest.update({
      where: { id },
      data: {
        status,
        decidedBy: opts.decidedBy ?? null,
        decisionNote: opts.decisionNote ?? null,
        decidedAt: status === "pending" ? null : new Date(),
      },
    });
    return toRecord(row as DbRow);
  }
  const all = await loadAll();
  const idx = all.findIndex((r) => r.id === id && r.tenantId === tenantId);
  if (idx < 0) return null;
  const now = new Date().toISOString();
  all[idx] = {
    ...all[idx]!,
    status,
    ...(opts.decidedBy ? { decidedBy: opts.decidedBy } : {}),
    ...(opts.decisionNote ? { decisionNote: opts.decisionNote } : {}),
    ...(status === "pending" ? {} : { decidedAt: now }),
    updatedAt: now,
  };
  await saveAll(all);
  return all[idx]!;
}
