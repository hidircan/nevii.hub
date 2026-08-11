/**
 * İş 3 — İzin ve devamlılık. Basit izin kaydı; yasal/otomatik bakiye
 * hesaplama motoru DEĞİL (bkz. StaffMember.annualLeaveAllowanceDays —
 * kurumun kendi belirlediği bir sayı, burada yalnızca ONAYLANMIŞ izin
 * günleri toplamıyla karşılaştırılabilir, otomatik düşülmez).
 */

import path from "path";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";
import { withFileLock, writeJsonFileAtomic } from "./atomic-json-file";
import type { LeaveRequest, LeaveStatus, LeaveType } from "./types";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "leave.json");
export const LEAVE_FILE = FILE;

type Stored = LeaveRequest & { tenantId: string };

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

function toPublic(r: Stored): LeaveRequest {
  const { tenantId: _t, ...pub } = r;
  void _t;
  return pub;
}

function dbRowToPublic(r: Record<string, unknown>): LeaveRequest {
  return {
    id: r.id as string,
    staffId: r.staffId as string,
    type: r.type as LeaveType,
    startDate: (r.startDate as Date).toISOString().slice(0, 10),
    endDate: (r.endDate as Date).toISOString().slice(0, 10),
    dayCount: r.dayCount as number,
    description: (r.description as string) ?? undefined,
    status: r.status as LeaveStatus,
    approvedBy: (r.approvedBy as string) ?? undefined,
    approvedAt: (r.approvedAt as Date | null)?.toISOString() ?? undefined,
    createdBy: r.createdBy as string,
    createdAt: (r.createdAt as Date).toISOString(),
    updatedAt: (r.updatedAt as Date).toISOString(),
  };
}

export async function listLeave(tenantId: string, staffId?: string): Promise<LeaveRequest[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.leaveRequest.findMany({
      where: { tenantId, staffId },
      orderBy: { startDate: "desc" },
    });
    return rows.map((r) => dbRowToPublic(r as unknown as Record<string, unknown>));
  }
  const all = await loadAll();
  return all
    .filter((r) => r.tenantId === tenantId)
    .filter((r) => !staffId || r.staffId === staffId)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .map(toPublic);
}

function dayCountBetween(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

export type CreateLeaveResult = { ok: true; entry: LeaveRequest } | { ok: false; message: string };

export async function createLeaveRequest(input: {
  tenantId: string;
  staffId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  description?: string;
  createdBy: string;
}): Promise<CreateLeaveResult> {
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (!DATE_RE.test(input.startDate) || !DATE_RE.test(input.endDate)) {
    return { ok: false, message: 'Tarihler "yyyy-aa-gg" biçiminde olmalı.' };
  }
  const dayCount = dayCountBetween(input.startDate, input.endDate);
  if (dayCount < 1) return { ok: false, message: "Bitiş tarihi başlangıçtan önce olamaz." };
  const now = new Date().toISOString();

  if (isDbMode) {
    const { prisma } = await import("./db");
    const created = await prisma.leaveRequest.create({
      data: {
        id: uid("leave"),
        tenantId: input.tenantId,
        staffId: input.staffId,
        type: input.type,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        dayCount,
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
      id: uid("leave"),
      tenantId: input.tenantId,
      staffId: input.staffId,
      type: input.type,
      startDate: input.startDate,
      endDate: input.endDate,
      dayCount,
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

export type UpdateLeaveResult = { ok: true; entry: LeaveRequest } | { ok: false; message: string };

export async function decideLeaveRequest(
  tenantId: string,
  leaveId: string,
  input: { status: "approved" | "rejected"; approvedBy: string }
): Promise<UpdateLeaveResult> {
  const now = new Date().toISOString();

  if (isDbMode) {
    const { prisma } = await import("./db");
    const existing = await prisma.leaveRequest.findFirst({ where: { id: leaveId, tenantId } });
    if (!existing) return { ok: false, message: "İzin talebi bulunamadı." };
    if (existing.status !== "pending_approval" && existing.status !== "draft") {
      return { ok: false, message: "Bu izin talebi zaten sonuçlandırılmış." };
    }
    const updated = await prisma.leaveRequest.update({
      where: { id: leaveId },
      data: { status: input.status, approvedBy: input.approvedBy, approvedAt: new Date() },
    });
    return { ok: true, entry: dbRowToPublic(updated as unknown as Record<string, unknown>) };
  }

  return withFileLock(FILE, async () => {
    const all = await loadAll();
    const idx = all.findIndex((r) => r.id === leaveId && r.tenantId === tenantId);
    if (idx === -1) return { ok: false, message: "İzin talebi bulunamadı." };
    const current = all[idx]!;
    if (current.status !== "pending_approval" && current.status !== "draft") {
      return { ok: false, message: "Bu izin talebi zaten sonuçlandırılmış." };
    }
    const updated: Stored = {
      ...current,
      status: input.status,
      approvedBy: input.approvedBy,
      approvedAt: now,
      updatedAt: now,
    };
    const next = [...all];
    next[idx] = updated;
    await saveAll(next);
    return { ok: true, entry: toPublic(updated) };
  });
}
