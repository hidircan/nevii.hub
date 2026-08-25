/**
 * İş 3D — kurum sahibi mali dashboard'u için, ÖNCEDEN hiçbir yerde
 * izlenmeyen gider türleri (kira, fatura, sarf malzemesi, diğer). Bordro
 * (PayrollRecord) ve öğretmen hakedişi (TeacherPayout) burada
 * TEKRARLANMAZ — dashboard onları kendi tablolarından toplar (bkz.
 * src/lib/finance-summary.ts), bu yalnızca gerçekten yeni bir gider
 * kaydı türü.
 *
 * Faz 10 — genişletme: alt kategori/tedarikçi/şube/döviz/vergi/son ödeme
 * tarihi/ödeme-onay durumu (hepsi additive/nullable, eski kayıtları
 * etkilemez). `paymentStatus` yalnızca "pending"|"paid" olarak YAZILIR —
 * "overdue" hiçbir zaman kalıcı bir yazma değeri DEĞİLDİR, tamamen
 * `dueDate` karşısında OKUMA anında türetilir (bkz. finance-summary.ts
 * `effectivePaymentStatus`) — bu, geç ödenmiş bir kaydın "overdue" olarak
 * takılı kalmasını veya ayrı bir zamanlayıcı gerektirmesini önler.
 */

import path from "path";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";
import { withFileLock, writeJsonFileAtomic } from "./atomic-json-file";
import type { ExpenseRecord, ExpenseCategory, ExpensePaymentStatus, ExpenseApprovalStatus } from "./types";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "expenses.json");
export const EXPENSE_FILE = FILE;

type Stored = ExpenseRecord & { tenantId: string };

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

function toPublic(r: Stored): ExpenseRecord {
  const { tenantId: _t, ...pub } = r;
  void _t;
  return pub;
}

function dbRowToPublic(r: Record<string, unknown>): ExpenseRecord {
  return {
    id: r.id as string,
    category: r.category as ExpenseCategory,
    amount: r.amount as number,
    date: (r.date as Date).toISOString().slice(0, 10),
    note: (r.note as string) ?? undefined,
    createdBy: r.createdBy as string,
    createdAt: (r.createdAt as Date).toISOString(),
    subcategory: (r.subcategory as string) ?? undefined,
    supplier: (r.supplier as string) ?? undefined,
    branchId: (r.branchId as string) ?? undefined,
    currency: (r.currency as string) ?? undefined,
    taxAmount: (r.taxAmount as number) ?? undefined,
    dueDate: (r.dueDate as Date | null)?.toISOString().slice(0, 10) ?? undefined,
    paymentStatus: (r.paymentStatus as ExpensePaymentStatus) ?? undefined,
    paymentMethod: (r.paymentMethod as string) ?? undefined,
    approvalStatus: (r.approvalStatus as ExpenseApprovalStatus) ?? undefined,
    approvedBy: (r.approvedBy as string) ?? undefined,
    recurringRuleId: (r.recurringRuleId as string) ?? undefined,
  };
}

export async function listExpenses(tenantId: string, sinceDate?: string): Promise<ExpenseRecord[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.expenseRecord.findMany({
      where: { tenantId, date: sinceDate ? { gte: new Date(sinceDate) } : undefined },
      orderBy: { date: "desc" },
    });
    return rows.map((r) => dbRowToPublic(r as unknown as Record<string, unknown>));
  }
  const all = await loadAll();
  return all
    .filter((r) => r.tenantId === tenantId)
    .filter((r) => !sinceDate || r.date >= sinceDate)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(toPublic);
}

export type CreateExpenseInput = {
  tenantId: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  note?: string;
  createdBy: string;
  subcategory?: string;
  supplier?: string;
  branchId?: string;
  currency?: string;
  taxAmount?: number;
  dueDate?: string;
  paymentStatus?: ExpensePaymentStatus;
  paymentMethod?: string;
  approvalStatus?: ExpenseApprovalStatus;
  approvedBy?: string;
  recurringRuleId?: string;
};

export type CreateExpenseResult = { ok: true; entry: ExpenseRecord } | { ok: false; message: string };

export async function createExpense(input: CreateExpenseInput): Promise<CreateExpenseResult> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, message: "Tutar geçerli bir pozitif sayı olmalı." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, message: 'Tarih "yyyy-aa-gg" biçiminde olmalı.' };
  if (input.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) {
    return { ok: false, message: 'Son ödeme tarihi "yyyy-aa-gg" biçiminde olmalı.' };
  }
  const now = new Date().toISOString();

  if (isDbMode) {
    const { prisma } = await import("./db");
    const created = await prisma.expenseRecord.create({
      data: {
        id: uid("expense"),
        tenantId: input.tenantId,
        category: input.category,
        amount: input.amount,
        date: new Date(input.date),
        note: input.note,
        createdBy: input.createdBy,
        subcategory: input.subcategory,
        supplier: input.supplier,
        branchId: input.branchId,
        currency: input.currency || "TRY",
        taxAmount: input.taxAmount,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        paymentStatus: input.paymentStatus,
        paymentMethod: input.paymentMethod,
        approvalStatus: input.approvalStatus,
        approvedBy: input.approvedBy,
        recurringRuleId: input.recurringRuleId,
      },
    });
    return { ok: true, entry: dbRowToPublic(created as unknown as Record<string, unknown>) };
  }

  return withFileLock(FILE, async () => {
    const all = await loadAll();
    const row: Stored = {
      id: uid("expense"),
      tenantId: input.tenantId,
      category: input.category,
      amount: input.amount,
      date: input.date,
      note: input.note,
      createdBy: input.createdBy,
      createdAt: now,
      subcategory: input.subcategory,
      supplier: input.supplier,
      branchId: input.branchId,
      currency: input.currency || "TRY",
      taxAmount: input.taxAmount,
      dueDate: input.dueDate,
      paymentStatus: input.paymentStatus,
      paymentMethod: input.paymentMethod,
      approvalStatus: input.approvalStatus,
      approvedBy: input.approvedBy,
      recurringRuleId: input.recurringRuleId,
    };
    await saveAll([...all, row]);
    return { ok: true, entry: toPublic(row) };
  });
}

export type UpdateExpenseResult = { ok: true; entry: ExpenseRecord } | { ok: false; message: string };

/** Bir gideri ödenmiş olarak işaretler — "vadesi geçmiş"/"bekliyor" listesinden çıkarır. */
export async function markExpensePaid(
  tenantId: string,
  expenseId: string,
  input: { paymentMethod?: string }
): Promise<UpdateExpenseResult> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const existing = await prisma.expenseRecord.findFirst({ where: { id: expenseId, tenantId } });
    if (!existing) return { ok: false, message: "Gider kaydı bulunamadı." };
    const updated = await prisma.expenseRecord.update({
      where: { id: expenseId },
      data: { paymentStatus: "paid", paymentMethod: input.paymentMethod ?? existing.paymentMethod },
    });
    return { ok: true, entry: dbRowToPublic(updated as unknown as Record<string, unknown>) };
  }

  return withFileLock(FILE, async () => {
    const all = await loadAll();
    const idx = all.findIndex((r) => r.id === expenseId && r.tenantId === tenantId);
    if (idx === -1) return { ok: false, message: "Gider kaydı bulunamadı." };
    const current = all[idx]!;
    const updated: Stored = { ...current, paymentStatus: "paid", paymentMethod: input.paymentMethod ?? current.paymentMethod };
    const next = [...all];
    next[idx] = updated;
    await saveAll(next);
    return { ok: true, entry: toPublic(updated) };
  });
}
