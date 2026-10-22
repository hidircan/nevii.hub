import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createStudentContractTool } from "../services/tools";
import { STUDENT_CONTRACTS_FILE } from "../contracts";
import { DOCUMENT_TEMPLATES_FILE, DOCUMENT_INSTANCES_FILE } from "../documents";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { debtSourceOf, splitStudentDebt, summarizeStudentDebt } from "../payment-profile";
import { diffInstallmentPlan } from "../contract-revision";
import type { Payment } from "../types";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const adminCtx = (): ServiceContext => ({ role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" });

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(STUDENT_CONTRACTS_FILE, { force: true });
  await fs.rm(DOCUMENT_TEMPLATES_FILE, { force: true });
  await fs.rm(DOCUMENT_INSTANCES_FILE, { force: true });
});

const row = (p: Partial<Payment> & Pick<Payment, "id" | "amount" | "status">): Payment => ({
  studentId: "s",
  paidAmount: 0,
  dueDate: p.status === "overdue" ? "2026-09-05" : "2026-10-05",
  description: "x",
  ...p,
});

// 2026-10-20 — "gecikmiş" artık vade gününden türetilir (payments/status.ts); sabit fixture tarihleri için saat sabit.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-20T09:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});


describe("summarizeStudentDebt — sözleşmesiz öğrenci dışlanmaz, iptal/yenilenmiş sayılmaz (2026-10-04)", () => {
  it("bağımsız borçlar sayılır; voided ve iptal edilmiş sözleşmenin kalanı sayılmaz; çift sayım yok", () => {
    const payments = [
      row({ id: "a", amount: 4000, status: "pending", source: "monthly_plan" }),
      row({ id: "b", amount: 1000, status: "overdue", source: "manual" }),
      row({ id: "c", amount: 900, status: "partial", paidAmount: 400, source: "lesson_ops", lessonId: "l1" }),
      row({ id: "d", amount: 5000, status: "voided", source: "manual" }),
      row({ id: "e", amount: 3000, status: "pending", contractId: "old", source: "contract" }),
      row({ id: "f", amount: 3000, status: "paid", paidAmount: 3000, source: "registration_first_payment" }),
    ];
    const summary = summarizeStudentDebt(payments, new Set(["old"]));
    expect(summary.openTotal).toBe(4000 + 1000 + 500);
    expect(summary.overdueTotal).toBe(1000);
    expect(summary.status).toBe("overdue");
    const view = splitStudentDebt(payments, new Set(["old"]));
    expect(view.openTotal).toBe(summary.openTotal);
    expect(view.bySource.map((x) => [x.key, x.openTotal])).toEqual([
      ["monthly_plan", 4000],
      ["lesson", 500],
      ["manual", 1000],
    ]);
    expect(debtSourceOf(payments[4]!)).toBe("contract");
  });

  it("hiç kaydı olmayan öğrenci 'none', yalnız tahsil edilmiş kayıt 'paid'", () => {
    expect(summarizeStudentDebt([], new Set()).status).toBe("none");
    expect(summarizeStudentDebt([row({ id: "p", amount: 10, status: "paid", paidAmount: 10 })], new Set()).status).toBe("paid");
  });
});

describe("diffInstallmentPlan — revizyonda plan değişikliği görülür", () => {
  it("tutar, vade ve satır sayısı farkı listelenir; aynı plan boş döner", () => {
    const prev = [
      { sequence: 1, amount: 3000, dueDate: "2026-09-01" },
      { sequence: 2, amount: 3000, dueDate: "2026-10-05" },
    ];
    expect(diffInstallmentPlan(prev, prev)).toEqual([]);
    const next = [
      { sequence: 1, amount: 3000, dueDate: "2026-09-01T00:00:00.000Z" },
      { sequence: 2, amount: 2500, dueDate: "2026-10-10" },
      { sequence: 3, amount: 0, dueDate: "2026-11-05" },
    ];
    expect(diffInstallmentPlan(prev, next).map((d) => d.key)).toEqual(["plan-2-amount", "plan-2-due", "plan-3"]);
  });
});

describe("sözleşme dışı borcun sözleşmeye taşınması (çift borç yok, izlenebilir)", () => {
  async function seed() {
    const { addRegistrationFirstPayment, upsertMonthlyPlanPayment, readData } = await import("../store-json");
    await addRegistrationFirstPayment({ studentId: "s1", method: "cash", amount: 3000, collectedAt: "2026-09-01T00:00:00.000Z", receivedByUserId: "u1" });
    const { paymentId } = await upsertMonthlyPlanPayment({ studentId: "s1", month: "2026-10", amount: 3000 });
    const data = await readData();
    return { monthlyPlanId: paymentId, paidSeedId: data.payments.find((p) => p.studentId === "s1" && p.status === "paid")!.id };
  }
  const input = (extra: Record<string, unknown>) => ({
    studentId: "s1",
    contractType: "initial" as const,
    programmeName: "Piyano",
    enrollmentStartDate: "2026-09-01T00:00:00.000Z",
    enrollmentEndDate: "2026-12-01T00:00:00.000Z",
    durationMonths: 3,
    monthlyAmount: 3000,
    installmentCount: 3,
    firstDueDate: "2026-09-01T00:00:00.000Z",
    signatoryFullName: "Veli",
    signatoryRelationship: "veli",
    ...extra,
  });

  it("seçilen aylık plan satırı silinmez, 'sözleşmeye taşındı' notuyla iptal edilir; borç yalnız sözleşmede kalır", async () => {
    const { monthlyPlanId } = await seed();
    const res = await createStudentContractTool(adminCtx(), input({ carryOverPaymentIds: [monthlyPlanId] }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.carriedOverPaymentIds).toEqual([monthlyPlanId]);
    const { readData } = await import("../store-json");
    const moved = (await readData()).payments.find((p) => p.id === monthlyPlanId)!;
    expect(moved.status).toBe("voided");
    expect(moved.paymentNote).toContain("taşındı");
  });

  it("tahsilat görmüş satır taşınamaz — sözleşme de yazılmaz", async () => {
    const { paidSeedId } = await seed();
    const res = await createStudentContractTool(adminCtx(), input({ carryOverPaymentIds: [paidSeedId] }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.message).toContain("taşınamaz");
    const { listContractsForStudent } = await import("../contracts");
    expect(await listContractsForStudent(DEFAULT_TENANT_ID, "s1")).toHaveLength(0);
  });

  it("taşı seçilmeden sözleşme, aynı ayın tahsilatsız aylık planını iptal eder; başka ay durur", async () => {
    const { monthlyPlanId, paidSeedId } = await seed();
    const { upsertMonthlyPlanPayment, readData } = await import("../store-json");
    const later = await upsertMonthlyPlanPayment({ studentId: "s1", month: "2026-12", amount: 3000 });
    const res = await createStudentContractTool(adminCtx(), input({}));
    expect(res.ok).toBe(true);
    const payments = (await readData()).payments.filter((p) => p.studentId === "s1");
    const moved = payments.find((p) => p.id === monthlyPlanId)!;
    expect(moved.status).toBe("voided");
    expect(moved.amount).toBe(3000);
    expect(moved.paymentNote).toContain("taşındı");
    expect(payments.find((p) => p.id === later.paymentId)!.status).not.toBe("voided");
    expect(payments.find((p) => p.id === paidSeedId)!.status).toBe("paid");
    const open = summarizeStudentDebt(payments, new Set()).openTotal;
    const expected = payments
      .filter((p) => p.id !== monthlyPlanId && p.status !== "paid" && p.status !== "voided")
      .reduce((sum, p) => sum + Math.max(p.amount - p.paidAmount, 0), 0);
    expect(open).toBe(expected);
    expect(open).toBeGreaterThan(0);
    expect(payments.some((p) => p.contractId && p.source === "contract")).toBe(true);
  });

  it("2026-10-04 Ela vakası: aktif sözleşmesi olan öğrenciye ikinci ilk sözleşme açılamaz (çift borç yok)", async () => {
    await seed();
    const first = await createStudentContractTool(adminCtx(), input({ keepRestSeparate: undefined }));
    expect(first.ok).toBe(true);
    const second = await createStudentContractTool(adminCtx(), input({}));
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.message).toContain("aktif sözleşmesi var");
    const { listContractsForStudent } = await import("../contracts");
    expect(await listContractsForStudent(DEFAULT_TENANT_ID, "s1")).toHaveLength(1);
  });
});
