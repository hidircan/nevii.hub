/**
 * İş 3 — Bordro. StaffMember'ın aylık ücret kaydı; öğretmenlerin ders
 * bazlı hakedişinden (TeacherPayout, teacher-payout.ts) TAMAMEN AYRI bir
 * tablo/dosya — hiçbir otomatik entegrasyon yok (bilinçli — dosya başı
 * StaffMember/PayrollRecord yorumuna bakın). Aynı desen: isDbMode ?
 * prisma : atomic JSON dosyası (bkz. atomic-json-file.ts).
 */

import path from "path";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";
import { withFileLock, writeJsonFileAtomic } from "./atomic-json-file";
import type { PayrollRecord, PayrollStatus } from "./types";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "payroll.json");
export const PAYROLL_FILE = FILE;

type Stored = PayrollRecord & { tenantId: string };

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

function toPublic(r: Stored): PayrollRecord {
  const { tenantId: _t, ...pub } = r;
  void _t;
  return pub;
}

function dbRowToPublic(r: Record<string, unknown>): PayrollRecord {
  return {
    id: r.id as string,
    staffId: r.staffId as string,
    month: r.month as string,
    grossAmount: r.grossAmount as number,
    netAmount: r.netAmount as number,
    extraPayment: (r.extraPayment as number) ?? undefined,
    deduction: (r.deduction as number) ?? undefined,
    status: r.status as PayrollStatus,
    paymentDate: (r.paymentDate as Date | null)?.toISOString().slice(0, 10) ?? undefined,
    paymentMethod: (r.paymentMethod as string) ?? undefined,
    note: (r.note as string) ?? undefined,
    createdBy: r.createdBy as string,
    createdAt: (r.createdAt as Date).toISOString(),
    updatedAt: (r.updatedAt as Date).toISOString(),
  };
}

export async function listPayroll(tenantId: string, filter?: { staffId?: string; month?: string }): Promise<PayrollRecord[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.payrollRecord.findMany({
      where: { tenantId, staffId: filter?.staffId, month: filter?.month },
      orderBy: [{ month: "desc" }, { createdAt: "asc" }],
    });
    return rows.map((r) => dbRowToPublic(r as unknown as Record<string, unknown>));
  }
  const all = await loadAll();
  return all
    .filter((r) => r.tenantId === tenantId)
    .filter((r) => !filter?.staffId || r.staffId === filter.staffId)
    .filter((r) => !filter?.month || r.month === filter.month)
    .sort((a, b) => b.month.localeCompare(a.month) || a.createdAt.localeCompare(b.createdAt))
    .map(toPublic);
}

export type CreatePayrollResult = { ok: true; entry: PayrollRecord } | { ok: false; message: string };

const MONTH_RE = /^\d{4}-\d{2}$/;

export async function createPayrollRecord(input: {
  tenantId: string;
  staffId: string;
  month: string;
  grossAmount: number;
  netAmount: number;
  extraPayment?: number;
  deduction?: number;
  paymentMethod?: string;
  note?: string;
  createdBy: string;
}): Promise<CreatePayrollResult> {
  if (!MONTH_RE.test(input.month)) return { ok: false, message: 'Ay "yyyy-aa" biçiminde olmalı.' };
  if (!Number.isFinite(input.grossAmount) || input.grossAmount < 0) return { ok: false, message: "Brüt ücret geçersiz." };
  if (!Number.isFinite(input.netAmount) || input.netAmount < 0) return { ok: false, message: "Net ücret geçersiz." };
  const now = new Date().toISOString();

  if (isDbMode) {
    const { prisma } = await import("./db");
    const existing = await prisma.payrollRecord.findFirst({
      where: { tenantId: input.tenantId, staffId: input.staffId, month: input.month },
    });
    if (existing) return { ok: false, message: `${input.staffId} için ${input.month} ayında zaten bir bordro kaydı var.` };
    const created = await prisma.payrollRecord.create({
      data: {
        id: uid("payroll"),
        tenantId: input.tenantId,
        staffId: input.staffId,
        month: input.month,
        grossAmount: input.grossAmount,
        netAmount: input.netAmount,
        extraPayment: input.extraPayment,
        deduction: input.deduction,
        status: "draft",
        paymentMethod: input.paymentMethod,
        note: input.note,
        createdBy: input.createdBy,
      },
    });
    return { ok: true, entry: dbRowToPublic(created as unknown as Record<string, unknown>) };
  }

  return withFileLock(FILE, async () => {
    const all = await loadAll();
    if (all.some((r) => r.tenantId === input.tenantId && r.staffId === input.staffId && r.month === input.month)) {
      return { ok: false, message: `${input.staffId} için ${input.month} ayında zaten bir bordro kaydı var.` };
    }
    const row: Stored = {
      id: uid("payroll"),
      tenantId: input.tenantId,
      staffId: input.staffId,
      month: input.month,
      grossAmount: input.grossAmount,
      netAmount: input.netAmount,
      extraPayment: input.extraPayment,
      deduction: input.deduction,
      status: "draft",
      paymentMethod: input.paymentMethod,
      note: input.note,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    await saveAll([...all, row]);
    return { ok: true, entry: toPublic(row) };
  });
}

export type UpdatePayrollResult = { ok: true; entry: PayrollRecord } | { ok: false; message: string };

/** Statü akışı serbest bırakılmaz — yalnızca ileri (draft→pending_approval→approved→paid) veya cancelled'a geçilebilir. */
const STATUS_ORDER: PayrollStatus[] = ["draft", "pending_approval", "approved", "paid"];

export async function updatePayrollStatus(
  tenantId: string,
  payrollId: string,
  input: { status: PayrollStatus; paymentDate?: string; paymentMethod?: string; note?: string }
): Promise<UpdatePayrollResult> {
  const now = new Date().toISOString();

  if (isDbMode) {
    const { prisma } = await import("./db");
    const existing = await prisma.payrollRecord.findFirst({ where: { id: payrollId, tenantId } });
    if (!existing) return { ok: false, message: "Bordro kaydı bulunamadı." };
    if (!isValidTransition(existing.status as PayrollStatus, input.status)) {
      return { ok: false, message: `"${existing.status}" durumundan "${input.status}" durumuna geçilemez.` };
    }
    const updated = await prisma.payrollRecord.update({
      where: { id: payrollId },
      data: {
        status: input.status,
        paymentDate: input.paymentDate ? new Date(input.paymentDate) : undefined,
        paymentMethod: input.paymentMethod,
        note: input.note,
      },
    });
    return { ok: true, entry: dbRowToPublic(updated as unknown as Record<string, unknown>) };
  }

  return withFileLock(FILE, async () => {
    const all = await loadAll();
    const idx = all.findIndex((r) => r.id === payrollId && r.tenantId === tenantId);
    if (idx === -1) return { ok: false, message: "Bordro kaydı bulunamadı." };
    const current = all[idx]!;
    if (!isValidTransition(current.status, input.status)) {
      return { ok: false, message: `"${current.status}" durumundan "${input.status}" durumuna geçilemez.` };
    }
    const updated: Stored = {
      ...current,
      status: input.status,
      paymentDate: input.paymentDate ?? current.paymentDate,
      paymentMethod: input.paymentMethod ?? current.paymentMethod,
      note: input.note ?? current.note,
      updatedAt: now,
    };
    const next = [...all];
    next[idx] = updated;
    await saveAll(next);
    return { ok: true, entry: toPublic(updated) };
  });
}

function isValidTransition(from: PayrollStatus, to: PayrollStatus): boolean {
  if (to === "cancelled") return from !== "paid"; // ödenmiş bir bordro iptal edilemez, yalnızca kayıt tutulur
  const fromIdx = STATUS_ORDER.indexOf(from);
  const toIdx = STATUS_ORDER.indexOf(to);
  if (fromIdx === -1 || toIdx === -1) return false;
  return toIdx === fromIdx + 1;
}
