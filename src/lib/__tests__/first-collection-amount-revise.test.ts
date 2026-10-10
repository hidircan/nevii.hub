import { beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { readData } from "../store";
import { writeData } from "../store-json";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { updatePaymentTool } from "../services/tools";
import type { ServiceContext } from "../services/context";
import type { Payment } from "../types";

/**
 * J — İlk tahsilat tutarı revizyonu (2026-09-22).
 *
 * Belirti: kayıtta 1 TL girilmiş ilk tahsilat, sözleşme ekranından 7000 TL'ye
 * düzeltilince UI hâlâ 1 TL gösteriyordu.
 *
 * Kök neden: updatePaymentTool → collectPayment yalnız paidAmount yazıyordu;
 * Payment.amount (fatura tutarı, UI/sözleşme kaynağı) yapışık kalıyordu.
 */

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "SUPER_ADMIN",
    userId: "user_owner_nilufer",
    tenantId: DEFAULT_TENANT_ID,
    channel: "web",
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

async function seedRegistrationFirstPayment(amount: number): Promise<Payment> {
  const data = await readData();
  const payment: Payment = {
    id: `pay_reg_${Math.random().toString(36).slice(2)}`,
    studentId: "s1",
    amount,
    paidAmount: amount,
    status: "paid",
    dueDate: new Date().toISOString(),
    paidAt: new Date().toISOString(),
    method: "cash",
    description: "Kayıt ilk tahsilatı",
    source: "registration_first_payment",
  };
  await writeData({ ...data, payments: [...data.payments, payment] });
  return payment;
}

describe("İlk tahsilat tutarı revizyonu — amount + paidAmount birlikte", () => {
  it("1 TL kayıt → 7000 TL düzeltme: amount ve paidAmount ikisi de 7000 olur", async () => {
    const payment = await seedRegistrationFirstPayment(1);
    expect(payment.amount).toBe(1);
    expect(payment.paidAmount).toBe(1);

    const res = await updatePaymentTool(ctx(), {
      paymentId: payment.id,
      amount: 7000,
      method: "transfer",
    });
    expect(res.ok).toBe(true);

    const after = await readData();
    const updated = after.payments.find((p) => p.id === payment.id)!;
    expect(updated.amount).toBe(7000);
    expect(updated.paidAmount).toBe(7000);
    expect(updated.method).toBe("transfer");
    expect(updated.status).toBe("paid");
  });

  it("kısmi taksitte fatura tutarı korunur — yalnız paidAmount değişir", async () => {
    const data = await readData();
    const payment: Payment = {
      id: `pay_partial_${Math.random().toString(36).slice(2)}`,
      studentId: "s1",
      amount: 10000,
      paidAmount: 5000,
      status: "partial",
      dueDate: new Date().toISOString(),
      paidAt: new Date().toISOString(),
      method: "cash",
      description: "Taksit",
      source: "contract",
    };
    await writeData({ ...data, payments: [...data.payments, payment] });

    const res = await updatePaymentTool(ctx(), { paymentId: payment.id, amount: 6000 });
    expect(res.ok).toBe(true);

    const after = await readData();
    const updated = after.payments.find((p) => p.id === payment.id)!;
    expect(updated.paidAmount).toBe(6000);
    expect(updated.amount).toBe(10000);
  });
});
