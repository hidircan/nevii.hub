/**
 * 2026-10-03 (owner) — yanlışlıkla oluşturulmuş ödemeyi silme, kontrollü ve kritik şifreli.
 * Finans tek kaynak kuralı: sözleşme taksidi silinmez (yalnız tahsilatı geri alınır); bağımsız satır silinir,
 * takip/online ödeme izi varsa iptal edilir; her işlem yetki + kritik şifre + gerekçe + audit ister.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { deletePaymentTool, getPaymentDeletionPlanTool } from "../services/tools";
import { readData } from "../store";
import { writeData } from "../store-json";
import { FOLLOW_UP_CASES_FILE, upsertFollowUpCase } from "../tahsilat/cases";
import { isLiveObligation, collectedAmountOf } from "../payment-profile";
import { recordAuditLog } from "../audit/log";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import type { Payment } from "../types";
import { CRIT, withTestCriticalPassword } from "./helpers/critical-delete";

// Denetim kaydı yalnız db modunda kalıcı; burada çağrının içeriği doğrulanır.
vi.mock("../audit/log", () => ({ recordAuditLog: vi.fn().mockResolvedValue({ id: "a", persisted: true }) }));

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const admin: ServiceContext = { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(FOLLOW_UP_CASES_FILE, { force: true });
  await withTestCriticalPassword();
  vi.clearAllMocks();
});

/** Seed öğrencisine kontrollü test ödemeleri ekler. */
async function seedPayments(rows: Partial<Payment>[]): Promise<string> {
  const data = await readData();
  const studentId = data.students[0]!.id;
  const base: Payment = {
    id: "",
    studentId,
    amount: 3000,
    paidAmount: 0,
    status: "pending",
    dueDate: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    description: "Test ödemesi",
    source: "manual",
  };
  await writeData({ ...data, payments: [...data.payments, ...rows.map((r) => ({ ...base, ...r }) as Payment)] });
  return studentId;
}

const del = (paymentId: string, action: "reverse_collection" | "remove", over?: Record<string, unknown>) =>
  deletePaymentTool(admin, { paymentId, action, ...CRIT, ...over });

describe("bağımsız ödeme satırı", () => {
  it("yanlışlıkla oluşturulan ödeme kalıcı silinir; denetim kaydı silinen tutarları saklar", async () => {
    await seedPayments([{ id: "pay_mistake", amount: 3000, paidAmount: 3000, status: "paid", paidAt: new Date().toISOString(), method: "cash" }]);
    const plan = await getPaymentDeletionPlanTool(admin, { paymentId: "pay_mistake" });
    expect(plan.ok && plan.data.actions).toEqual(["reverse_collection", "remove"]);
    expect(plan.ok && plan.data.removeMode).toBe("delete");

    const r = await del("pay_mistake", "remove");
    expect(r.ok && r.data.result).toBe("deleted");
    expect((await readData()).payments.some((p) => p.id === "pay_mistake")).toBe(false);
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "payment.delete",
        entityId: "pay_mistake",
        outcome: "success",
        meta: expect.objectContaining({ reason: CRIT.reason, before: expect.objectContaining({ amount: 3000, paidAmount: 3000, method: "cash" }) }),
      })
    );
  });

  it("tahsilat takip kaydı olan ödeme silinmez, iptal edilir ve hiçbir toplamda sayılmaz", async () => {
    const studentId = await seedPayments([{ id: "pay_followed", status: "overdue", dueDate: new Date(Date.now() - 5 * 86_400_000).toISOString() }]);
    await upsertFollowUpCase({ tenantId: DEFAULT_TENANT_ID, paymentId: "pay_followed", studentId, status: "approved", messageDraft: "x", approvedMessage: "x", attributedAmount: 0 });
    const plan = await getPaymentDeletionPlanTool(admin, { paymentId: "pay_followed" });
    expect(plan.ok && plan.data.removeMode).toBe("void");

    const r = await del("pay_followed", "remove");
    expect(r.ok && r.data.result).toBe("voided");
    const p = (await readData()).payments.find((x) => x.id === "pay_followed")!;
    expect(p.status).toBe("voided");
    expect(isLiveObligation(p, new Set())).toBe(false);
    expect(collectedAmountOf(p)).toBe(0);
  });

  it("yalnız tahsilatı geri alma: satır borç olarak kalır, ödenen ve tahsilat izi temizlenir", async () => {
    await seedPayments([{ id: "pay_wrong_collect", paidAmount: 3000, status: "paid", paidAt: new Date().toISOString(), receivedByUserId: "u1", paymentNote: "yanlış" }]);
    const r = await del("pay_wrong_collect", "reverse_collection");
    expect(r.ok && r.data.result).toBe("reversed");
    const p = (await readData()).payments.find((x) => x.id === "pay_wrong_collect")!;
    expect(p).toMatchObject({ paidAmount: 0, status: "pending" });
    expect(p.paidAt).toBeUndefined();
    expect(p.receivedByUserId).toBeUndefined();
    expect(p.paymentNote).toBeUndefined();
  });
});

describe("sözleşme taksidi (finans tek kaynak kuralı)", () => {
  it("taksit silinemez; yanlış tahsilat geri alınır ve taksit vadesine göre gecikmiş görünür", async () => {
    await seedPayments([
      { id: "pay_inst", contractId: "ctr_x", installmentSequence: 2, paidAmount: 3000, status: "paid", paidAt: new Date().toISOString(), dueDate: new Date(Date.now() - 3 * 86_400_000).toISOString() },
    ]);
    const plan = await getPaymentDeletionPlanTool(admin, { paymentId: "pay_inst" });
    expect(plan.ok && plan.data.actions).toEqual(["reverse_collection"]);
    const remove = await del("pay_inst", "remove");
    expect(remove.ok).toBe(false);
    if (!remove.ok) expect(remove.error.message).toContain("Tahsilatı geri al");

    const r = await del("pay_inst", "reverse_collection");
    expect(r.ok).toBe(true);
    const p = (await readData()).payments.find((x) => x.id === "pay_inst")!;
    expect(p).toMatchObject({ contractId: "ctr_x", installmentSequence: 2, paidAmount: 0, status: "overdue" });
  });

  it("tahsilatı olmayan taksitte işlem yok; neden ve çözüm ekranı yazılır", async () => {
    await seedPayments([{ id: "pay_inst_open", contractId: "ctr_x", installmentSequence: 3 }]);
    const plan = await getPaymentDeletionPlanTool(admin, { paymentId: "pay_inst_open" });
    expect(plan.ok && plan.data.actions).toEqual([]);
    expect(plan.ok && plan.data.blockedReason).toContain("Sözleşme ekranı");
  });
});

describe("kontrol kapıları", () => {
  it("yetkisiz rol, yanlış kritik şifre ve kısa gerekçe reddedilir; hiçbir şey değişmez", async () => {
    await seedPayments([{ id: "pay_guard" }]);
    expect((await deletePaymentTool({ ...admin, role: "TEACHER" }, { paymentId: "pay_guard", action: "remove", ...CRIT })).ok).toBe(false);
    expect((await deletePaymentTool({ ...admin, role: "BRANCH_MANAGER" }, { paymentId: "pay_guard", action: "remove", ...CRIT })).ok).toBe(false);
    expect((await del("pay_guard", "remove", { criticalPassword: "yanlis" })).ok).toBe(false);
    expect((await del("pay_guard", "remove", { reason: "kısa" })).ok).toBe(false);
    expect((await readData()).payments.some((p) => p.id === "pay_guard")).toBe(true);
  });

  it("iptal edilmiş ödemede tekrar işlem yapılmaz", async () => {
    await seedPayments([{ id: "pay_void", status: "voided" }]);
    const plan = await getPaymentDeletionPlanTool(admin, { paymentId: "pay_void" });
    expect(plan.ok && plan.data.actions).toEqual([]);
    expect((await del("pay_void", "remove")).ok).toBe(false);
  });
});
