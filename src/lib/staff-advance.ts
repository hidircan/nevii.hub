/**
 * Faz 9B — Personel maaş avansı. `leave.ts`'in durum-geçiş deseniyle
 * (pending_approval -> approved|rejected -> paid|cancelled) AYNI iskelet;
 * ek olarak yıl içi (approved+paid) toplamı `StaffMember.annualAdvanceLimit`
 * ile karşılaştırılır (bkz. sumApprovedOrPaidForYear + createStaffAdvanceTool
 * içindeki limit kontrolü, tools.ts) — kod tabanında ilk "limit vs kullanım"
 * kontrolü, kasıtlı olarak sıfırdan yazıldı (leave.ts'teki
 * annualLeaveAllowanceDays yalnızca bilgi amaçlı, otomatik uygulanmıyor).
 */

import path from "path";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";
import { withFileLock, writeJsonFileAtomic } from "./atomic-json-file";
import type { StaffAdvance, StaffAdvanceStatus } from "./types";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "staff-advance.json");
export const STAFF_ADVANCE_FILE = FILE;

type Stored = StaffAdvance & { tenantId: string };

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

function toPublic(r: Stored): StaffAdvance {
  const { tenantId: _t, ...pub } = r;
  void _t;
  return pub;
}

function dbRowToPublic(r: Record<string, unknown>): StaffAdvance {
  return {
    id: r.id as string,
    staffId: r.staffId as string,
    amount: r.amount as number,
    requestDate: (r.requestDate as Date).toISOString().slice(0, 10),
    status: r.status as StaffAdvanceStatus,
    approvedBy: (r.approvedBy as string) ?? undefined,
    approvedAt: (r.approvedAt as Date | null)?.toISOString() ?? undefined,
    paidAt: (r.paidAt as Date | null)?.toISOString() ?? undefined,
    paymentMethod: (r.paymentMethod as string) ?? undefined,
    description: (r.description as string) ?? undefined,
    createdBy: r.createdBy as string,
    createdAt: (r.createdAt as Date).toISOString(),
    updatedAt: (r.updatedAt as Date).toISOString(),
  };
}

export async function listStaffAdvances(tenantId: string, staffId?: string): Promise<StaffAdvance[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.staffAdvance.findMany({
      where: { tenantId, staffId },
      orderBy: { requestDate: "desc" },
    });
    return rows.map((r) => dbRowToPublic(r as unknown as Record<string, unknown>));
  }
  const all = await loadAll();
  return all
    .filter((r) => r.tenantId === tenantId)
    .filter((r) => !staffId || r.staffId === staffId)
    .sort((a, b) => b.requestDate.localeCompare(a.requestDate))
    .map(toPublic);
}

/** Bir takvim yılı içinde onaylanmış/ödenmiş avans toplamı — limit kontrolü için. */
export async function sumApprovedOrPaidForYear(tenantId: string, staffId: string, year: number): Promise<number> {
  const all = await listStaffAdvances(tenantId, staffId);
  return all
    .filter((a) => (a.status === "approved" || a.status === "paid") && a.requestDate.startsWith(`${year}-`))
    .reduce((sum, a) => sum + a.amount, 0);
}

export type CreateStaffAdvanceResult = { ok: true; entry: StaffAdvance } | { ok: false; message: string };

export async function createStaffAdvance(input: {
  tenantId: string;
  staffId: string;
  amount: number;
  requestDate: string;
  description?: string;
  createdBy: string;
}): Promise<CreateStaffAdvanceResult> {
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (!DATE_RE.test(input.requestDate)) return { ok: false, message: 'Talep tarihi "yyyy-aa-gg" biçiminde olmalı.' };
  if (!Number.isInteger(input.amount) || input.amount <= 0) return { ok: false, message: "Tutar pozitif bir tam sayı olmalı." };
  const now = new Date().toISOString();

  if (isDbMode) {
    const { prisma } = await import("./db");
    const created = await prisma.staffAdvance.create({
      data: {
        id: uid("advance"),
        tenantId: input.tenantId,
        staffId: input.staffId,
        amount: input.amount,
        requestDate: new Date(input.requestDate),
        description: input.description,
        status: "pending_approval",
        createdBy: input.createdBy,
      },
    });
    return { ok: true, entry: dbRowToPublic(created as unknown as Record<string, unknown>) };
  }

  return withFileLock(FILE, async () => {
    const all = await loadAll();
    const row: Stored = {
      id: uid("advance"),
      tenantId: input.tenantId,
      staffId: input.staffId,
      amount: input.amount,
      requestDate: input.requestDate,
      description: input.description,
      status: "pending_approval",
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    await saveAll([...all, row]);
    return { ok: true, entry: toPublic(row) };
  });
}

export type UpdateStaffAdvanceResult = { ok: true; entry: StaffAdvance } | { ok: false; message: string };

export async function decideStaffAdvance(
  tenantId: string,
  advanceId: string,
  input: { status: "approved" | "rejected"; approvedBy: string }
): Promise<UpdateStaffAdvanceResult> {
  const now = new Date().toISOString();

  if (isDbMode) {
    const { prisma } = await import("./db");
    const existing = await prisma.staffAdvance.findFirst({ where: { id: advanceId, tenantId } });
    if (!existing) return { ok: false, message: "Avans talebi bulunamadı." };
    if (existing.status !== "pending_approval") return { ok: false, message: "Bu avans talebi zaten sonuçlandırılmış." };
    const updated = await prisma.staffAdvance.update({
      where: { id: advanceId },
      data: { status: input.status, approvedBy: input.approvedBy, approvedAt: new Date() },
    });
    return { ok: true, entry: dbRowToPublic(updated as unknown as Record<string, unknown>) };
  }

  return withFileLock(FILE, async () => {
    const all = await loadAll();
    const idx = all.findIndex((r) => r.id === advanceId && r.tenantId === tenantId);
    if (idx === -1) return { ok: false, message: "Avans talebi bulunamadı." };
    const current = all[idx]!;
    if (current.status !== "pending_approval") return { ok: false, message: "Bu avans talebi zaten sonuçlandırılmış." };
    const updated: Stored = { ...current, status: input.status, approvedBy: input.approvedBy, approvedAt: now, updatedAt: now };
    const next = [...all];
    next[idx] = updated;
    await saveAll(next);
    return { ok: true, entry: toPublic(updated) };
  });
}

export async function markStaffAdvancePaid(
  tenantId: string,
  advanceId: string,
  input: { paymentMethod?: string }
): Promise<UpdateStaffAdvanceResult> {
  const now = new Date().toISOString();

  if (isDbMode) {
    const { prisma } = await import("./db");
    const existing = await prisma.staffAdvance.findFirst({ where: { id: advanceId, tenantId } });
    if (!existing) return { ok: false, message: "Avans talebi bulunamadı." };
    if (existing.status !== "approved") return { ok: false, message: "Yalnızca onaylanmış avans ödenmiş sayılabilir." };
    const updated = await prisma.staffAdvance.update({
      where: { id: advanceId },
      data: { status: "paid", paidAt: new Date(), paymentMethod: input.paymentMethod },
    });
    return { ok: true, entry: dbRowToPublic(updated as unknown as Record<string, unknown>) };
  }

  return withFileLock(FILE, async () => {
    const all = await loadAll();
    const idx = all.findIndex((r) => r.id === advanceId && r.tenantId === tenantId);
    if (idx === -1) return { ok: false, message: "Avans talebi bulunamadı." };
    const current = all[idx]!;
    if (current.status !== "approved") return { ok: false, message: "Yalnızca onaylanmış avans ödenmiş sayılabilir." };
    const updated: Stored = {
      ...current,
      status: "paid",
      paidAt: now,
      paymentMethod: input.paymentMethod ?? current.paymentMethod,
      updatedAt: now,
    };
    const next = [...all];
    next[idx] = updated;
    await saveAll(next);
    return { ok: true, entry: toPublic(updated) };
  });
}

export async function cancelStaffAdvance(tenantId: string, advanceId: string): Promise<UpdateStaffAdvanceResult> {
  const now = new Date().toISOString();

  if (isDbMode) {
    const { prisma } = await import("./db");
    const existing = await prisma.staffAdvance.findFirst({ where: { id: advanceId, tenantId } });
    if (!existing) return { ok: false, message: "Avans talebi bulunamadı." };
    if (existing.status !== "pending_approval" && existing.status !== "approved") {
      return { ok: false, message: "Ödenmiş veya zaten sonuçlandırılmış avans iptal edilemez." };
    }
    const updated = await prisma.staffAdvance.update({ where: { id: advanceId }, data: { status: "cancelled" } });
    return { ok: true, entry: dbRowToPublic(updated as unknown as Record<string, unknown>) };
  }

  return withFileLock(FILE, async () => {
    const all = await loadAll();
    const idx = all.findIndex((r) => r.id === advanceId && r.tenantId === tenantId);
    if (idx === -1) return { ok: false, message: "Avans talebi bulunamadı." };
    const current = all[idx]!;
    if (current.status !== "pending_approval" && current.status !== "approved") {
      return { ok: false, message: "Ödenmiş veya zaten sonuçlandırılmış avans iptal edilemez." };
    }
    const updated: Stored = { ...current, status: "cancelled", updatedAt: now };
    const next = [...all];
    next[idx] = updated;
    await saveAll(next);
    return { ok: true, entry: toPublic(updated) };
  });
}
