/**
 * İş 3D — kurum sahibi mali dashboard'u için, ÖNCEDEN hiçbir yerde
 * izlenmeyen gider türleri (kira, fatura, sarf malzemesi, diğer). Bordro
 * (PayrollRecord) ve öğretmen hakedişi (TeacherPayout) burada
 * TEKRARLANMAZ — dashboard onları kendi tablolarından toplar (bkz.
 * src/lib/finance-summary.ts), bu yalnızca gerçekten yeni bir gider
 * kaydı türü.
 */

import path from "path";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";
import { withFileLock, writeJsonFileAtomic } from "./atomic-json-file";
import type { ExpenseRecord, ExpenseCategory } from "./types";

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

export async function listExpenses(tenantId: string, sinceDate?: string): Promise<ExpenseRecord[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.expenseRecord.findMany({
      where: { tenantId, date: sinceDate ? { gte: new Date(sinceDate) } : undefined },
      orderBy: { date: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      category: r.category as ExpenseCategory,
      amount: r.amount,
      date: r.date.toISOString().slice(0, 10),
      note: r.note ?? undefined,
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
    }));
  }
  const all = await loadAll();
  return all
    .filter((r) => r.tenantId === tenantId)
    .filter((r) => !sinceDate || r.date >= sinceDate)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(toPublic);
}

export type CreateExpenseResult = { ok: true; entry: ExpenseRecord } | { ok: false; message: string };

export async function createExpense(input: {
  tenantId: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  note?: string;
  createdBy: string;
}): Promise<CreateExpenseResult> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, message: "Tutar geçerli bir pozitif sayı olmalı." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, message: 'Tarih "yyyy-aa-gg" biçiminde olmalı.' };
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
      },
    });
    return {
      ok: true,
      entry: {
        id: created.id,
        category: created.category as ExpenseCategory,
        amount: created.amount,
        date: created.date.toISOString().slice(0, 10),
        note: created.note ?? undefined,
        createdBy: created.createdBy,
        createdAt: created.createdAt.toISOString(),
      },
    };
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
    };
    await saveAll([...all, row]);
    return { ok: true, entry: toPublic(row) };
  });
}
