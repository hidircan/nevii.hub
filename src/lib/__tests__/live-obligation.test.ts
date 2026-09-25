/**
 * UAT 2026-09-25 (Öncelik 2) — iptal/yenilenmiş sözleşmenin tahsil edilmemiş taksitleri borç, gecikme,
 * tahsilat kuyruğu ve otomatik hatırlatmaya GİRMEZ; tahsil edilmiş kısmı hareket olarak görünür kalır.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { isLiveObligation, splitStudentDebt } from "../payment-profile";
import { buildTahsilatQueue } from "../tahsilat/queue";
import { buildDashboardSummary } from "../dashboard/daily-summary";
import { createSeedData } from "../seed";
import { readData as readJson, writeData as writeJson } from "../store-json";
import { scanOverduePaymentsTool } from "../services/tools";
import { FOLLOW_UP_CASES_FILE, listFollowUpCases } from "../tahsilat/cases";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { Payment } from "../types";
import type { ServiceContext } from "../services/context";

const terminal = vi.hoisted(() => ({ ids: new Set<string>() }));
vi.mock("../contracts", async (orig) => ({
  ...(await orig<typeof import("../contracts")>()),
  listTerminalContractIds: vi.fn(async () => terminal.ids),
}));
vi.mock("../audit/log", () => ({ recordAuditLog: vi.fn().mockResolvedValue(undefined) }));

const DIR = resolveDataDir(path.join(process.cwd(), "data"));
const pay = (o: Partial<Payment>): Payment => ({
  id: "p",
  studentId: "s1",
  amount: 1000,
  paidAmount: 0,
  status: "pending",
  dueDate: "2026-09-05",
  description: "",
  ...o,
});
const OLD = new Set(["ctr-old"]);

beforeEach(async () => {
  await fs.rm(path.join(DIR, "store.json"), { force: true });
  await fs.rm(FOLLOW_UP_CASES_FILE, { force: true });
  terminal.ids = new Set();
});

describe("isLiveObligation / splitStudentDebt", () => {
  it("terminal sözleşme satırı borç değil; tahsil edilen kısmı hareket olarak kalır", () => {
    const rows = [
      pay({ id: "old-paid", contractId: "ctr-old", status: "partial", paidAmount: 400, paidAt: "2026-09-02" }),
      pay({ id: "old-overdue", contractId: "ctr-old", status: "overdue" }),
      pay({ id: "new-overdue", contractId: "ctr-new", status: "overdue", amount: 1200 }),
      pay({ id: "new-future", contractId: "ctr-new", status: "pending", dueDate: "2026-10-05", amount: 1200 }),
      pay({ id: "voided", status: "voided", amount: 500 }),
    ];
    expect(isLiveObligation(rows[1]!, OLD)).toBe(false);
    expect(isLiveObligation(rows[2]!, OLD)).toBe(true);
    const d = splitStudentDebt(rows, OLD);
    expect(d.open.map((p) => p.id)).toEqual(["new-overdue", "new-future"]);
    expect(d.openTotal).toBe(2400);
    expect(d.overdueTotal).toBe(1200);
    expect(d.movements.map((p) => p.id)).toEqual(["old-paid"]);
    expect(d.closedByContract.map((p) => p.id)).toEqual(["old-paid", "old-overdue"]);
  });

  it("sözleşmesiz manuel/ders bazlı borç canlıdır", () => {
    expect(isLiveObligation(pay({ status: "overdue", source: "lesson_ops" }), OLD)).toBe(true);
  });
});

describe("tüketiciler aynı kuralı kullanır", () => {
  const data = createSeedData();
  const s1 = data.students[0]!;
  const withRows = {
    ...data,
    payments: [
      pay({ id: "old-overdue", studentId: s1.id, contractId: "ctr-old", status: "overdue" }),
      pay({ id: "new-overdue", studentId: s1.id, contractId: "ctr-new", status: "overdue", amount: 1200 }),
    ],
  };

  it("tahsilat kuyruğu eski sözleşme taksitini göstermez", () => {
    const rows = buildTahsilatQueue(withRows, [], new Date("2026-09-25"), undefined, OLD);
    expect(rows.map((r) => r.paymentId)).toEqual(["new-overdue"]);
  });

  it("Günlük Özet gecikmiş toplamı eski sözleşmeyi saymaz", () => {
    const summary = buildDashboardSummary(withRows, { branchId: "all", today: "2026-09-25" }, new Map(), [], OLD);
    expect(summary.money.overdueTotal).toBe(1200);
    expect(summary.money.outstandingTotal).toBe(1200);
  });
});

describe("scanOverduePaymentsTool — otomatik hatırlatma", () => {
  it("iptal edilen sözleşmenin gecikmiş taksiti için takip/hatırlatma oluşturmaz", async () => {
    const data = await readJson();
    const s = data.students.find((x) => !x.communicationOptOut)!;
    await writeJson({
      ...data,
      payments: [
        pay({ id: "old-overdue", studentId: s.id, contractId: "ctr-old", status: "overdue" }),
        pay({ id: "new-overdue", studentId: s.id, contractId: "ctr-new", status: "overdue", amount: 1200 }),
      ],
    });
    terminal.ids = new Set(["ctr-old"]);
    const ctx: ServiceContext = { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    const res = await scanOverduePaymentsTool(ctx);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.scanned).toBe(1);
    const cases = await listFollowUpCases(DEFAULT_TENANT_ID);
    expect(cases.map((c) => c.paymentId)).toEqual(["new-overdue"]);
  });
});
