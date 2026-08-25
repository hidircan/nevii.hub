/**
 * Faz 10 (adım 3) — periyodik olarak otomatik `ExpenseRecord` üreten
 * kurallar (ör. "her ay kira"). `staff-advance.ts`/`leave.ts` ile AYNI
 * store deseni (isDbMode ? prisma : atomic JSON dosyası).
 *
 * `tickRecurringExpenseRules` İNSAN TARAFINDAN TETİKLENİR (finans-ozeti
 * ekranındaki "Şimdi çalıştır" düğmesi) — `src/lib/workflows/*` otonom
 * motoruna KASITLI OLARAK bağlanmadı, çünkü o motorun her adımı
 * `agent/registry.ts`teki (AI-tool-çağırma yüzeyi) araçlar üzerinden
 * çalışır ve bu modülün finans/personel kardeşleri (staff/payroll/leave/
 * expense) o registry'de HİÇ KAYITLI DEĞİL — bilinçli bir sınır (HR/finans
 * PII, insan-only). Bu tutarlılığı bozmamak için burada da AYNI sınır
 * korunur.
 *
 * İdempotency: `nextRunDate` her üretimden SONRA ileri alınır — bu yüzden
 * art arda iki `tick` çağrısı (aradan zaman geçmeden) ikinci seferde YENİ
 * bir kayıt ÜRETMEZ (nextRunDate artık "now"un ilerisindedir). Kaçırılan
 * birden fazla dönem varsa (ör. sunucu uzun süre çalışmadıysa) `while`
 * döngüsü HER dönem için ayrı bir ExpenseRecord üretip nextRunDate'i
 * "now"un ilerisine gelene kadar ileri alır (catch-up, veri kaybı yok).
 */

import path from "path";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";
import { withFileLock, writeJsonFileAtomic } from "./atomic-json-file";
import { createExpense } from "./expense";
import type { RecurringExpenseRule, RecurringExpenseFrequency, ExpenseCategory } from "./types";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "recurring-expense-rules.json");
export const RECURRING_EXPENSE_RULE_FILE = FILE;

type Stored = RecurringExpenseRule & { tenantId: string };

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

function toPublic(r: Stored): RecurringExpenseRule {
  const { tenantId: _t, ...pub } = r;
  void _t;
  return pub;
}

function dbRowToPublic(r: Record<string, unknown>): RecurringExpenseRule {
  return {
    id: r.id as string,
    category: r.category as ExpenseCategory,
    subcategory: (r.subcategory as string) ?? undefined,
    supplier: (r.supplier as string) ?? undefined,
    branchId: (r.branchId as string) ?? undefined,
    amount: r.amount as number,
    frequency: r.frequency as RecurringExpenseFrequency,
    nextRunDate: (r.nextRunDate as Date).toISOString().slice(0, 10),
    note: (r.note as string) ?? undefined,
    active: r.active as boolean,
    createdBy: r.createdBy as string,
    createdAt: (r.createdAt as Date).toISOString(),
    updatedAt: (r.updatedAt as Date).toISOString(),
  };
}

export async function listRecurringExpenseRules(tenantId: string): Promise<RecurringExpenseRule[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.recurringExpenseRule.findMany({ where: { tenantId }, orderBy: { nextRunDate: "asc" } });
    return rows.map((r) => dbRowToPublic(r as unknown as Record<string, unknown>));
  }
  const all = await loadAll();
  return all.filter((r) => r.tenantId === tenantId).sort((a, b) => a.nextRunDate.localeCompare(b.nextRunDate)).map(toPublic);
}

export type CreateRecurringExpenseRuleResult =
  | { ok: true; entry: RecurringExpenseRule }
  | { ok: false; message: string };

export async function createRecurringExpenseRule(input: {
  tenantId: string;
  category: ExpenseCategory;
  subcategory?: string;
  supplier?: string;
  branchId?: string;
  amount: number;
  frequency: RecurringExpenseFrequency;
  nextRunDate: string;
  note?: string;
  createdBy: string;
}): Promise<CreateRecurringExpenseRuleResult> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, message: "Tutar geçerli bir pozitif sayı olmalı." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.nextRunDate)) return { ok: false, message: 'Tarih "yyyy-aa-gg" biçiminde olmalı.' };
  const now = new Date().toISOString();

  if (isDbMode) {
    const { prisma } = await import("./db");
    const created = await prisma.recurringExpenseRule.create({
      data: {
        id: uid("recur"),
        tenantId: input.tenantId,
        category: input.category,
        subcategory: input.subcategory,
        supplier: input.supplier,
        branchId: input.branchId,
        amount: input.amount,
        frequency: input.frequency,
        nextRunDate: new Date(input.nextRunDate),
        note: input.note,
        createdBy: input.createdBy,
      },
    });
    return { ok: true, entry: dbRowToPublic(created as unknown as Record<string, unknown>) };
  }

  return withFileLock(FILE, async () => {
    const all = await loadAll();
    const row: Stored = {
      id: uid("recur"),
      tenantId: input.tenantId,
      category: input.category,
      subcategory: input.subcategory,
      supplier: input.supplier,
      branchId: input.branchId,
      amount: input.amount,
      frequency: input.frequency,
      nextRunDate: input.nextRunDate,
      note: input.note,
      active: true,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    await saveAll([...all, row]);
    return { ok: true, entry: toPublic(row) };
  });
}

export type SetRecurringExpenseRuleActiveResult =
  | { ok: true; entry: RecurringExpenseRule }
  | { ok: false; message: string };

export async function setRecurringExpenseRuleActive(
  tenantId: string,
  ruleId: string,
  active: boolean
): Promise<SetRecurringExpenseRuleActiveResult> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const existing = await prisma.recurringExpenseRule.findFirst({ where: { id: ruleId, tenantId } });
    if (!existing) return { ok: false, message: "Kural bulunamadı." };
    const updated = await prisma.recurringExpenseRule.update({ where: { id: ruleId }, data: { active } });
    return { ok: true, entry: dbRowToPublic(updated as unknown as Record<string, unknown>) };
  }
  return withFileLock(FILE, async () => {
    const all = await loadAll();
    const idx = all.findIndex((r) => r.id === ruleId && r.tenantId === tenantId);
    if (idx === -1) return { ok: false, message: "Kural bulunamadı." };
    const updated: Stored = { ...all[idx]!, active, updatedAt: new Date().toISOString() };
    const next = [...all];
    next[idx] = updated;
    await saveAll(next);
    return { ok: true, entry: toPublic(updated) };
  });
}

function advanceByFrequency(date: Date, frequency: RecurringExpenseFrequency): Date {
  const next = new Date(date);
  if (frequency === "monthly") next.setMonth(next.getMonth() + 1);
  else if (frequency === "quarterly") next.setMonth(next.getMonth() + 3);
  else next.setFullYear(next.getFullYear() + 1);
  return next;
}

async function setRuleNextRunDate(tenantId: string, ruleId: string, nextRunDate: string): Promise<void> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    await prisma.recurringExpenseRule.update({ where: { id: ruleId }, data: { nextRunDate: new Date(nextRunDate) } });
    return;
  }
  await withFileLock(FILE, async () => {
    const all = await loadAll();
    const idx = all.findIndex((r) => r.id === ruleId && r.tenantId === tenantId);
    if (idx === -1) return;
    const next = [...all];
    next[idx] = { ...next[idx]!, nextRunDate, updatedAt: new Date().toISOString() };
    await saveAll(next);
  });
}

export type TickRecurringExpenseRulesResult = { generated: number };

/** Vadesi gelmiş (nextRunDate <= now) tüm aktif kuralları çalıştırır — bkz. dosya başı idempotency notu. */
export async function tickRecurringExpenseRules(
  tenantId: string,
  now: Date = new Date()
): Promise<TickRecurringExpenseRulesResult> {
  const rules = (await listRecurringExpenseRules(tenantId)).filter((r) => r.active);
  let generated = 0;

  for (const rule of rules) {
    let cursor = new Date(`${rule.nextRunDate}T00:00:00`);
    let lastCursor = cursor;
    while (cursor.getTime() <= now.getTime()) {
      const dateIso = cursor.toISOString().slice(0, 10);
      const result = await createExpense({
        tenantId,
        category: rule.category,
        amount: rule.amount,
        date: dateIso,
        note: rule.note,
        createdBy: rule.createdBy,
        subcategory: rule.subcategory,
        supplier: rule.supplier,
        branchId: rule.branchId,
        recurringRuleId: rule.id,
      });
      if (result.ok) generated++;
      lastCursor = cursor;
      cursor = advanceByFrequency(cursor, rule.frequency);
    }
    if (cursor.getTime() !== lastCursor.getTime()) {
      await setRuleNextRunDate(tenantId, rule.id, cursor.toISOString().slice(0, 10));
    }
  }

  return { generated };
}
