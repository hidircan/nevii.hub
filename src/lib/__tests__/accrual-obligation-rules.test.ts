import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { STUDENT_CONTRACTS_FILE } from "../contracts";
import { DOCUMENT_TEMPLATES_FILE, DOCUMENT_INSTANCES_FILE } from "../documents";
import { createStudentContractTool } from "../services/tools";
import { planContractRestore, planUpcomingAccrualSync, syncStandaloneAccruals } from "../standalone-monthly-accrual";
import { ACCRUAL_SUSPENDED_TAG, applyAccrualOps, contractSuspensionTag, resolveAccrualOp, type PlanRow } from "../payments/accrual-rows";
import type { ServiceContext } from "../services/context";
import type { Payment, Student } from "../types";

// 2026-10-23 — sözleşmesiz aylık tahakkuk: yeniden uygun olan öğrenci, sözleşmede çift borç, ücret değişikliği.
const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const NOW = new Date("2026-10-20T09:00:00Z");
const student = (id: string, p: Partial<Student> = {}): Student =>
  ({ id, name: id, active: true, monthlyFee: 7950, enrollmentStartDate: "2026-09-01", ...p }) as Student;
const plan = (id: string, p: Partial<Payment> = {}): Payment => ({
  id, studentId: "a", amount: 7950, paidAmount: 0, status: "pending", source: "monthly_plan",
  dueDate: "2026-11-01T12:00:00.000Z", description: "Aylık plan — 2026-11 (7950 TL)", installmentPeriodLabel: "Kasım 2026", ...p,
});
const ensureNov = { kind: "ensure" as const, month: "2026-11", amount: 7950, includeUnlinked: true };

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  for (const f of [DATA_FILE, STUDENT_CONTRACTS_FILE, DOCUMENT_TEMPLATES_FILE, DOCUMENT_INSTANCES_FILE]) await fs.rm(f, { force: true });
});
afterEach(() => vi.useRealTimers());

describe("1) yeniden uygun hale gelen öğrenci", () => {
  it("sistemin askıya aldığı satır ayı karşılamaz; AYNI satır yeniden açılır, tekrar çalıştırma ikinci satır üretmez", () => {
    const suspended = plan("n", { status: "voided", adjustedBy: ACCRUAL_SUSPENDED_TAG, adjustmentReason: "x" });
    const sync = planUpcomingAccrualSync({ students: [student("a")], payments: [suspended], contractStatusByStudent: new Map(), month: "2026-11" });
    expect(sync.create).toEqual([{ studentId: "a", month: "2026-11", amount: 7950 }]);
    const [w] = resolveAccrualOp([suspended], ensureNov, "a", NOW);
    expect(w).toMatchObject({ kind: "update", id: "n", reopened: true, patch: { status: "pending", amount: 7950, adjustedBy: undefined } });
    const reopened = { ...suspended, ...(w as { patch: Partial<Payment> }).patch } as PlanRow;
    expect(resolveAccrualOp([reopened], ensureNov, "a", NOW)).toEqual([{ kind: "skip", reason: "exists" }]);
  });

  it("yöneticinin iptal ettiği ay asla otomatik açılmaz", () => {
    const adminVoided = plan("v", { status: "voided" });
    expect(planUpcomingAccrualSync({ students: [student("a")], payments: [adminVoided], contractStatusByStudent: new Map(), month: "2026-11" }).create).toEqual([]);
    expect(resolveAccrualOp([adminVoided], ensureNov, "a", NOW)).toEqual([{ kind: "skip", reason: "admin_voided" }]);
  });
});

describe("3) ücret değişikliği", () => {
  it("yalnız tahsilat görmemiş gelecek ay satırı yeniden fiyatlanır; tahsilat görmüş satıra dokunulmaz", () => {
    const sync = planUpcomingAccrualSync({
      students: [student("a", { monthlyFee: 8500 }), student("b", { monthlyFee: 8500 })],
      payments: [plan("u"), plan("t", { studentId: "b", paidAmount: 1000, status: "partial", paidAt: "2026-10-19T09:00:00Z" })],
      contractStatusByStudent: new Map(),
      month: "2026-11",
    });
    expect(sync.reprice).toEqual([{ paymentId: "u", studentId: "a", amount: 8500 }]);
    expect(sync.suspendIds).toEqual([]);
    expect(resolveAccrualOp([plan("t", { paidAmount: 1000, paidAt: "2026-10-19T09:00:00Z" })], { kind: "reprice", paymentId: "t", amount: 8500 }, "a", NOW)).toEqual([
      { kind: "skip", reason: "touched_or_missing" },
    ]);
  });
});

describe("2) sözleşme açılınca çift borç yok", () => {
  const adminCtx = (): ServiceContext => ({ role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" });
  const contractInput = {
    studentId: "s1", contractType: "initial" as const, programmeName: "Piyano",
    enrollmentStartDate: "2026-09-01T00:00:00.000Z", enrollmentEndDate: "2026-12-01T00:00:00.000Z",
    durationMonths: 3, monthlyAmount: 3000, installmentCount: 3, firstDueDate: "2026-09-01T00:00:00.000Z",
    signatoryFullName: "Veli", signatoryRelationship: "veli",
  };
  async function seed() {
    const store = await import("../store-json");
    await store.addRegistrationFirstPayment({ studentId: "s1", method: "cash", amount: 3000, collectedAt: "2026-09-01T00:00:00.000Z", receivedByUserId: "u1" });
    const oct = (await store.upsertMonthlyPlanPayment({ studentId: "s1", month: "2026-10", amount: 3000 })).paymentId;
    const nov = (await store.upsertMonthlyPlanPayment({ studentId: "s1", month: "2026-11", amount: 3000 })).paymentId;
    return { store, oct, nov };
  }

  it("kapsanan aylardaki tahsilat görmemiş satırlar HEMEN askıya alınır; iptalde aynı satırlar geri açılır", async () => {
    const { store, oct, nov } = await seed();
    const res = await createStudentContractTool(adminCtx(), contractInput);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const tag = contractSuspensionTag(res.data.contract.id);
    let rows = (await store.readData()).payments;
    expect(rows.filter((p) => p.id === oct || p.id === nov).map((p) => [p.status, p.adjustedBy])).toEqual([["voided", tag], ["voided", tag]]);

    const { cancelContract } = await import("../contracts");
    await cancelContract(DEFAULT_TENANT_ID, res.data.contract.id);
    await syncStandaloneAccruals(DEFAULT_TENANT_ID, { apply: true, studentId: "s1", actorUserId: "u1", now: NOW });
    rows = (await store.readData()).payments;
    const plans = rows.filter((p) => p.studentId === "s1" && p.source === "monthly_plan" && p.status !== "voided");
    expect(plans.map((p) => p.id).sort()).toEqual([oct, nov].sort());
    expect(plans.every((p) => p.adjustedBy === undefined)).toBe(true);
  });

  it("kısmen tahsil edilmiş sözleşmesiz ay varken sözleşme yazılmaz (net Türkçe neden)", async () => {
    const { store, oct } = await seed();
    const { collectPayment } = await import("../payments/collect");
    await collectPayment(oct, { amount: 1000, accumulate: true, tenantId: DEFAULT_TENANT_ID, actorUserId: "u1" });
    void store;
    const res = await createStudentContractTool(adminCtx(), contractInput);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.message).toContain("Ekim 2026");
    expect(res.error.message).toContain("kısmi tahsilat");
  });

  it("yaşayan sözleşme kilit içinde görülür: tahakkuk satır açmaz (cron ile sözleşme yarışı)", async () => {
    await seed();
    const writes = await applyAccrualOps(DEFAULT_TENANT_ID, "s1", [{ kind: "ensure", month: "2026-12", amount: 3000, includeUnlinked: true }], {
      actorUserId: "cron",
      gate: () => true,
      now: NOW,
    });
    expect(writes).toEqual([]);
  });

  it("geri açma kanonik: etiketi hangi sözleşme koymuş olursa olsun güncel duruma bakar; ödenmiş ay ve yaşayan sözleşme açmaz", () => {
    // Yenileme zinciri: A'nın askıya aldığı Ekim, B iptal edilince değerlendirilir (etiket A olsa da).
    const suspendedOct = plan("o", { studentId: "s1", status: "voided", adjustedBy: contractSuspensionTag("A"), description: "Aylık plan — 2026-10 (3000 TL)", installmentPeriodLabel: "Ekim 2026" });
    const none = () => false;
    expect(planContractRestore([suspendedOct], none)).toEqual([{ paymentId: "o", studentId: "s1", amount: 7950 }]);
    // Zincirdeki HERHANGİ bir sözleşmeden (burada B) o aya tahsilat alınmışsa ay ödenmiştir → açılmaz.
    const paidByB = plan("i", { studentId: "s1", source: "contract", contractId: "B", paidAmount: 3000, status: "paid", installmentPeriodLabel: "Ekim 2026" });
    expect(planContractRestore([suspendedOct, paidByB], none)).toEqual([]);
    // Güncel sözleşme yaşıyorsa açılmaz; sistemin tahakkuk nedeniyle askıya aldığı satır bu kuralın konusu değildir.
    expect(planContractRestore([suspendedOct], () => true)).toEqual([]);
    expect(planContractRestore([{ ...suspendedOct, adjustedBy: ACCRUAL_SUSPENDED_TAG }], none)).toEqual([]);
  });

  it("yenileme zinciri (entegrasyon): A askıya alır, B yeniler, B iptal → satırlar AYNEN geri açılır, ikinci satır yok", async () => {
    const { store, oct, nov } = await seed();
    const a = await createStudentContractTool(adminCtx(), contractInput);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const b = await createStudentContractTool(adminCtx(), {
      ...contractInput,
      contractType: "renewal",
      previousContractId: a.data.contract.id,
      renewalDebtOverrideReason: "Test: önceki sözleşmenin açık taksitleri bilinçli olarak devrediliyor.",
      allowOverlap: true,
      overlapReason: "Test: yenileme aynı dönemi kapsıyor.",
      firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: "2026-10-20T09:00:00.000Z" },
    });
    expect(b.ok, b.ok ? "" : b.error.message).toBe(true);
    if (!b.ok) return;
    const { cancelContract } = await import("../contracts");
    await cancelContract(DEFAULT_TENANT_ID, b.data.contract.id);
    await syncStandaloneAccruals(DEFAULT_TENANT_ID, { apply: true, studentId: "s1", actorUserId: "u1", now: NOW });
    const open = (await store.readData()).payments.filter((p) => p.studentId === "s1" && p.source === "monthly_plan" && p.status !== "voided");
    expect(open.map((p) => p.id).sort()).toEqual([oct, nov].sort());
  });
});
