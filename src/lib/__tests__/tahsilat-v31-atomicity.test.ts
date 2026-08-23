import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createPaymentTool } from "../services/tools";
import { readData } from "../store";
import { writeData } from "../store-json";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import type { Payment } from "../types";
import {
  upsertFollowUpCase,
  listFollowUpCases,
  getFollowUpCase,
  FOLLOW_UP_CASES_FILE,
  __failNextFollowUpSyncForTests,
} from "../tahsilat/cases";
import { collectPayment } from "../payments/collect";
import { resolveCollectionStatus } from "../payments/status";
import { runWithTenantAsync } from "../tenant-context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(): ServiceContext {
  return {
    role: "SCHOOL_ADMIN",
    userId: "u1",
    tenantId: DEFAULT_TENANT_ID,
    channel: "web",
  };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(FOLLOW_UP_CASES_FILE, { force: true });
});

async function seedPayment(amount = 2000): Promise<Payment> {
  const data = await readData();
  const payment: Payment = {
    id: `pay_atom_${Math.random().toString(36).slice(2)}`,
    studentId: "s1",
    amount,
    paidAmount: 0,
    status: "pending",
    dueDate: new Date().toISOString(),
    description: "atom test",
  };
  await writeData({ ...data, payments: [...data.payments, payment] });
  return payment;
}

describe("ödeme-vaka atomiklik (json)", () => {
  it("kısmi tahsilat payment+vaka birlikte partial yazar", async () => {
    const payment = await seedPayment(2000);
    await upsertFollowUpCase({
      tenantId: DEFAULT_TENANT_ID,
      paymentId: payment.id,
      studentId: "s1",
      status: "sent",
      messageDraft: "x",
      attributedAmount: 0,
    });
    const res = await createPaymentTool(ctx(), { paymentId: payment.id, amount: 800, method: "cash" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.status).toBe("partial");
    const after = await readData();
    expect(after.payments.find((p) => p.id === payment.id)?.status).toBe("partial");
    const cases = await listFollowUpCases(DEFAULT_TENANT_ID);
    expect(cases[0]?.status).toBe("partial");
    expect(cases[0]?.attributedAmount).toBe(800);
  });

  it("vaka senkronu patlarsa ödeme yazılmaz", async () => {
    const payment = await seedPayment(2000);
    await upsertFollowUpCase({
      tenantId: DEFAULT_TENANT_ID,
      paymentId: payment.id,
      studentId: "s1",
      status: "sent",
      messageDraft: "x",
      attributedAmount: 0,
    });
    __failNextFollowUpSyncForTests();
    await expect(
      runWithTenantAsync(DEFAULT_TENANT_ID, () => collectPayment(payment.id, { amount: 2000, tenantId: DEFAULT_TENANT_ID }))
    ).rejects.toThrow("TEST_FORCE_CASE_SYNC_FAIL");
    const after = await readData();
    expect(after.payments.find((p) => p.id === payment.id)?.status).toBe("pending");
    expect((await getFollowUpCase(DEFAULT_TENANT_ID, (await listFollowUpCases(DEFAULT_TENANT_ID))[0]!.id))?.status).toBe(
      "sent"
    );
  });

  it("aynı paidAmount ikinci kez attribution eklemez", async () => {
    const payment = await seedPayment(2000);
    await upsertFollowUpCase({
      tenantId: DEFAULT_TENANT_ID,
      paymentId: payment.id,
      studentId: "s1",
      status: "sent",
      messageDraft: "x",
      attributedAmount: 0,
    });
    await createPaymentTool(ctx(), { paymentId: payment.id, amount: 2000 });
    await createPaymentTool(ctx(), { paymentId: payment.id, amount: 2000 });
    const c = (await listFollowUpCases(DEFAULT_TENANT_ID))[0];
    expect(c?.attributedAmount).toBe(2000);
    expect(c?.status).toBe("paid");
  });

  it("void attribution sıfırlar ve vakayı sent'e alır", async () => {
    const payment = await seedPayment(2000);
    await upsertFollowUpCase({
      tenantId: DEFAULT_TENANT_ID,
      paymentId: payment.id,
      studentId: "s1",
      status: "sent",
      messageDraft: "x",
      attributedAmount: 0,
    });
    await createPaymentTool(ctx(), { paymentId: payment.id, amount: 500 });
    await runWithTenantAsync(DEFAULT_TENANT_ID, () =>
      collectPayment(payment.id, { voided: true, tenantId: DEFAULT_TENANT_ID })
    );
    const p = (await readData()).payments.find((x) => x.id === payment.id);
    expect(p?.status).toBe("voided");
    const c = (await listFollowUpCases(DEFAULT_TENANT_ID))[0];
    expect(c?.attributedAmount).toBe(0);
    expect(c?.status).toBe("sent");
  });

  it("statü çözümü integer tutar kullanır", () => {
    expect(resolveCollectionStatus({ amount: 1000, paidAmount: 400, dueDate: new Date().toISOString() })).toBe(
      "partial"
    );
    expect(resolveCollectionStatus({ amount: 1000, paidAmount: 1000, dueDate: new Date().toISOString() })).toBe("paid");
  });
});
