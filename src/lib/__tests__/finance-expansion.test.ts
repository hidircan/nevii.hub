import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import {
  createExpenseTool,
  markExpensePaidTool,
  getFinanceSummaryTool,
  createRecurringExpenseRuleTool,
  setRecurringExpenseRuleActiveTool,
  tickRecurringExpenseRulesTool,
  listRecurringExpenseRulesTool,
  upsertBudgetTool,
  listBudgetsTool,
} from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { EXPENSE_FILE } from "../expense";
import { RECURRING_EXPENSE_RULE_FILE, tickRecurringExpenseRules } from "../recurring-expense";
import { BUDGET_FILE } from "../budget";
import { effectiveExpensePaymentStatus } from "../finance-summary";

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

/**
 * Kok neden duzeltmesi (2026-08-31 test kosusu): bu dosya onceden gercek
 * `new Date()` kullaniyordu - `todayIso` UTC bazli (`toISOString().slice`),
 * ama `computeFinanceSummary`'nin "bu ay" filtresi YEREL takvim (`getFullYear`/
 * `getMonth`) kullaniyor. Ay sonuna yakin, UTC ofsetinin YEREL tarihi bir
 * sonraki aya tasidigi saatlerde ikisi FARKLI ay uretip bu ayki giderleri
 * sessizce eliyordu (expenseByCategory/costByBranch/budgetComparison
 * undefined/0 kaliyordu - hicbiri kod regresyonu degil, testin kendisi
 * gercek saate bagimliydi). lesson-*.test.ts dosyalarindaki FIXED_NOW
 * deseniyle ayni yaklasim: saat dondurulur, "bugun" HER YERDE ayni sabit
 * ana gore YEREL takvim parcalariyla turetilir (UTC slice YOK).
 */
const FIXED_NOW = new Date("2026-08-15T12:00:00");

beforeEach(async () => {
  process.env.TZ = "Europe/Istanbul";
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  await fs.rm(EXPENSE_FILE, { force: true });
  await fs.rm(RECURRING_EXPENSE_RULE_FILE, { force: true });
  await fs.rm(BUDGET_FILE, { force: true });
});

afterEach(() => {
  vi.useRealTimers();
});

const now = FIXED_NOW;
const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

describe("Faz 10 — effectiveExpensePaymentStatus (pure)", () => {
  it("paymentStatus tanımsızsa (eski kayıt) 'paid' sayılır", () => {
    expect(effectiveExpensePaymentStatus({ paymentStatus: undefined, dueDate: undefined }, now)).toBe("paid");
  });
  it("paymentStatus='paid' ise dueDate geçmiş olsa bile 'paid' kalır", () => {
    expect(effectiveExpensePaymentStatus({ paymentStatus: "paid", dueDate: "2000-01-01" }, now)).toBe("paid");
  });
  it("paymentStatus='pending' + dueDate gelecekte ise 'pending'", () => {
    const future = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
    expect(effectiveExpensePaymentStatus({ paymentStatus: "pending", dueDate: future }, now)).toBe("pending");
  });
  it("paymentStatus='pending' + dueDate geçmişte ise 'overdue' (kalıcı bir DB değeri DEĞİL, türetilir)", () => {
    expect(effectiveExpensePaymentStatus({ paymentStatus: "pending", dueDate: "2000-01-01" }, now)).toBe("overdue");
  });
});

describe("Faz 10 (adım 1) — ExpenseRecord genişletilmiş alanlar", () => {
  it("yeni alanlarla gider oluşturulur ve doğru döner", async () => {
    const created = await createExpenseTool(ctx(), {
      category: "utilities",
      amount: 5000,
      date: todayIso,
      subcategory: "Elektrik",
      supplier: "XYZ Enerji",
      branchId: "erzene",
      taxAmount: 900,
      dueDate: todayIso,
      paymentStatus: "pending",
      paymentMethod: "Havale",
    });
    expect(created.ok).toBe(true);
  });

  it("eski (yalnızca category/amount/date) çağrı şekli hâlâ çalışır — geriye uyumlu", async () => {
    const created = await createExpenseTool(ctx(), { category: "rent", amount: 10000, date: todayIso });
    expect(created.ok).toBe(true);
  });
});

describe("Faz 10 (adım 2) — dashboard genişletmesi (kategori kırılımı, şube, vade uyarıları)", () => {
  it("expenseByCategory bu ayki giderleri kategoriye göre toplar", async () => {
    await createExpenseTool(ctx(), { category: "rent", amount: 10000, date: todayIso });
    await createExpenseTool(ctx(), { category: "rent", amount: 5000, date: todayIso });
    await createExpenseTool(ctx(), { category: "utilities", amount: 2000, date: todayIso });

    const res = await getFinanceSummaryTool(ctx(), {});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const rent = res.data.expenseByCategory.find((c) => c.category === "rent");
    const utilities = res.data.expenseByCategory.find((c) => c.category === "utilities");
    expect(rent?.amount).toBe(15000);
    expect(utilities?.amount).toBe(2000);
  });

  it("costByBranch — ExpenseRecord.branchId bordro ile aynı toplama eklenir", async () => {
    await createExpenseTool(ctx(), { category: "supplies", amount: 3000, date: todayIso, branchId: "erzene" });
    const res = await getFinanceSummaryTool(ctx(), {});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const erzene = res.data.costByBranch.find((b) => b.branchId === "erzene");
    expect(erzene?.amount).toBeGreaterThanOrEqual(3000);
  });

  it("upcomingExpenseWarnings — pending+geçmiş dueDate 'overdue', pending+gelecek dueDate 'pending' olarak listelenir; paid olan hiç listelenmez", async () => {
    const overdueExp = await createExpenseTool(ctx(), {
      category: "rent",
      amount: 1000,
      date: todayIso,
      dueDate: "2000-01-01",
      paymentStatus: "pending",
    });
    const futureDue = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
    const pendingExp = await createExpenseTool(ctx(), {
      category: "rent",
      amount: 2000,
      date: todayIso,
      dueDate: futureDue,
      paymentStatus: "pending",
    });
    await createExpenseTool(ctx(), {
      category: "rent",
      amount: 3000,
      date: todayIso,
      dueDate: todayIso,
      paymentStatus: "paid",
    });
    expect(overdueExp.ok && pendingExp.ok).toBe(true);

    const res = await getFinanceSummaryTool(ctx(), {});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const statuses = res.data.upcomingExpenseWarnings.map((w) => w.status);
    expect(statuses).toContain("overdue");
    expect(statuses).toContain("pending");
    expect(res.data.upcomingExpenseWarnings).toHaveLength(2);
  });

  it("markExpensePaidTool ile işaretlenen gider artık uyarı listesinde görünmez", async () => {
    const created = await createExpenseTool(ctx(), {
      category: "rent",
      amount: 1000,
      date: todayIso,
      dueDate: "2000-01-01",
      paymentStatus: "pending",
    });
    if (!created.ok) return;
    const before = await getFinanceSummaryTool(ctx(), {});
    if (before.ok) expect(before.data.upcomingExpenseWarnings).toHaveLength(1);

    const paid = await markExpensePaidTool(ctx(), { expenseId: created.data.expenseId });
    expect(paid.ok).toBe(true);

    const after = await getFinanceSummaryTool(ctx(), {});
    expect(after.ok).toBe(true);
    if (after.ok) expect(after.data.upcomingExpenseWarnings).toHaveLength(0);
  });
});

describe("Faz 10 (adım 3) — RecurringExpenseRule idempotency + Budget karşılaştırma", () => {
  it("tick çağrısı vadesi gelmiş kuralı bir ExpenseRecord'a çevirir; aynı tick tekrar çağrılınca DUPLICATE üretmez", async () => {
    const rule = await createRecurringExpenseRuleTool(ctx(), {
      category: "rent",
      amount: 7000,
      frequency: "monthly",
      nextRunDate: todayIso,
    });
    expect(rule.ok).toBe(true);
    if (!rule.ok) return;

    const first = await tickRecurringExpenseRulesTool(ctx(), {});
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.data.generated).toBe(1);

    const second = await tickRecurringExpenseRulesTool(ctx(), {});
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.data.generated).toBe(0);

    const res = await getFinanceSummaryTool(ctx(), {});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const rentTotal = res.data.expenseByCategory.find((c) => c.category === "rent")?.amount ?? 0;
    expect(rentTotal).toBe(7000);
  });

  it("kaçırılan birden fazla dönem varsa tek tick'te HEPSİ üretilir (catch-up)", async () => {
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 10);
    const rule = await createRecurringExpenseRuleTool(ctx(), {
      category: "utilities",
      amount: 500,
      frequency: "monthly",
      nextRunDate: twoMonthsAgo,
    });
    if (!rule.ok) return;
    const tick = await tickRecurringExpenseRulesTool(ctx(), {});
    expect(tick.ok).toBe(true);
    if (tick.ok) expect(tick.data.generated).toBeGreaterThanOrEqual(3);
  });

  it("pasife alınan kural tick'te çalışmaz", async () => {
    const rule = await createRecurringExpenseRuleTool(ctx(), {
      category: "supplies",
      amount: 100,
      frequency: "monthly",
      nextRunDate: todayIso,
    });
    if (!rule.ok) return;
    await setRecurringExpenseRuleActiveTool(ctx(), { ruleId: rule.data.ruleId, active: false });
    const tick = await tickRecurringExpenseRulesTool(ctx(), {});
    expect(tick.ok).toBe(true);
    if (tick.ok) expect(tick.data.generated).toBe(0);
  });

  it("listRecurringExpenseRulesTool RBAC — TEACHER erişemez", async () => {
    const res = await listRecurringExpenseRulesTool(ctx({ role: "TEACHER" }), {});
    expect(res.ok).toBe(false);
  });

  it("upsertBudgetTool idempotent — aynı (kategori,şube,dönem) ikinci çağrıda YENİ kayıt üretmez, günceller", async () => {
    const first = await upsertBudgetTool(ctx(), { category: "rent", period: thisMonth, targetAmount: 10000 });
    expect(first.ok).toBe(true);
    const second = await upsertBudgetTool(ctx(), { category: "rent", period: thisMonth, targetAmount: 20000 });
    expect(second.ok).toBe(true);

    const list = await listBudgetsTool(ctx(), {});
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    const rentBudgets = list.data.budgets.filter((b) => b.category === "rent" && b.period === thisMonth);
    expect(rentBudgets).toHaveLength(1);
    expect(rentBudgets[0]!.targetAmount).toBe(20000);
  });

  it("budgetComparison — hedefin üstünde/altında gerçekleşen doğru hesaplanır", async () => {
    await upsertBudgetTool(ctx(), { category: "rent", period: thisMonth, targetAmount: 5000 });
    await createExpenseTool(ctx(), { category: "rent", amount: 8000, date: todayIso });

    const res = await getFinanceSummaryTool(ctx(), {});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const comparison = res.data.budgetComparison.find((b) => b.category === "rent" && !b.branchId);
    expect(comparison?.targetAmount).toBe(5000);
    expect(comparison?.actualAmount).toBe(8000);
  });
});

describe("Faz 10 (adım 3) — tickRecurringExpenseRules doğrudan modül testi (RBAC katmanı olmadan)", () => {
  it("aktif olmayan kuralı listelemez/çalıştırmaz", async () => {
    const result = await tickRecurringExpenseRules(DEFAULT_TENANT_ID, now);
    expect(result.generated).toBe(0);
  });
});
