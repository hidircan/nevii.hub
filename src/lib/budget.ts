/**
 * Faz 10 (adım 3) — kategori/şube/dönem bazlı hedef gider tutarı. Dashboard
 * bunu gerçekleşen `ExpenseRecord` toplamıyla karşılaştırır (bkz.
 * finance-summary.ts `computeBudgetComparison`). `upsertBudget` idempotent:
 * aynı (tenant, category, branchId, period) için ikinci çağrı YENİ bir
 * kayıt OLUŞTURMAZ, mevcut hedefi günceller (tekrar tekrar aynı bütçeyi
 * girmek kopya satır üretmez).
 */

import path from "path";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";
import { withFileLock, writeJsonFileAtomic } from "./atomic-json-file";
import type { Budget, ExpenseCategory } from "./types";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "budgets.json");
export const BUDGET_FILE = FILE;

type Stored = Budget & { tenantId: string };

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

function toPublic(r: Stored): Budget {
  const { tenantId: _t, ...pub } = r;
  void _t;
  return pub;
}

function dbRowToPublic(r: Record<string, unknown>): Budget {
  return {
    id: r.id as string,
    category: r.category as ExpenseCategory,
    branchId: (r.branchId as string) ?? undefined,
    period: r.period as string,
    targetAmount: r.targetAmount as number,
    createdBy: r.createdBy as string,
    createdAt: (r.createdAt as Date).toISOString(),
    updatedAt: (r.updatedAt as Date).toISOString(),
  };
}

export async function listBudgets(tenantId: string, period?: string): Promise<Budget[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.budget.findMany({ where: { tenantId, period }, orderBy: { period: "desc" } });
    return rows.map((r) => dbRowToPublic(r as unknown as Record<string, unknown>));
  }
  const all = await loadAll();
  return all
    .filter((r) => r.tenantId === tenantId)
    .filter((r) => !period || r.period === period)
    .sort((a, b) => b.period.localeCompare(a.period))
    .map(toPublic);
}

export type UpsertBudgetResult = { ok: true; entry: Budget } | { ok: false; message: string };

export async function upsertBudget(input: {
  tenantId: string;
  category: ExpenseCategory;
  branchId?: string;
  period: string;
  targetAmount: number;
  createdBy: string;
}): Promise<UpsertBudgetResult> {
  if (!/^\d{4}-\d{2}$/.test(input.period)) return { ok: false, message: 'Dönem "yyyy-aa" biçiminde olmalı.' };
  if (!Number.isFinite(input.targetAmount) || input.targetAmount <= 0) {
    return { ok: false, message: "Hedef tutar geçerli bir pozitif sayı olmalı." };
  }
  const now = new Date().toISOString();

  if (isDbMode) {
    const { prisma } = await import("./db");
    const existing = await prisma.budget.findFirst({
      where: { tenantId: input.tenantId, category: input.category, branchId: input.branchId ?? null, period: input.period },
    });
    const row = existing
      ? await prisma.budget.update({ where: { id: existing.id }, data: { targetAmount: input.targetAmount } })
      : await prisma.budget.create({
          data: {
            id: uid("budget"),
            tenantId: input.tenantId,
            category: input.category,
            branchId: input.branchId,
            period: input.period,
            targetAmount: input.targetAmount,
            createdBy: input.createdBy,
          },
        });
    return { ok: true, entry: dbRowToPublic(row as unknown as Record<string, unknown>) };
  }

  return withFileLock(FILE, async () => {
    const all = await loadAll();
    const idx = all.findIndex(
      (r) =>
        r.tenantId === input.tenantId &&
        r.category === input.category &&
        (r.branchId ?? undefined) === (input.branchId ?? undefined) &&
        r.period === input.period
    );
    if (idx === -1) {
      const row: Stored = {
        id: uid("budget"),
        tenantId: input.tenantId,
        category: input.category,
        branchId: input.branchId,
        period: input.period,
        targetAmount: input.targetAmount,
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
      };
      await saveAll([...all, row]);
      return { ok: true, entry: toPublic(row) };
    }
    const updated: Stored = { ...all[idx]!, targetAmount: input.targetAmount, updatedAt: now };
    const next = [...all];
    next[idx] = updated;
    await saveAll(next);
    return { ok: true, entry: toPublic(updated) };
  });
}
