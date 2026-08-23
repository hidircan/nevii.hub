import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createPaymentTool, updatePaymentTool } from "../services/tools";
import { readData } from "../store";
import { writeData } from "../store-json";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import type { Payment } from "../types";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "SCHOOL_ADMIN",
    userId: "u1",
    tenantId: DEFAULT_TENANT_ID,
    channel: "web",
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

async function seedPayment(amount = 1000): Promise<Payment> {
  const data = await readData();
  const payment: Payment = {
    id: `pay_modal_${Math.random().toString(36).slice(2)}`,
    studentId: "s1",
    amount,
    paidAmount: 0,
    status: "pending",
    dueDate: new Date().toISOString(),
    description: "Ekim ayı taksiti",
  };
  await writeData({ ...data, payments: [...data.payments, payment] });
  return payment;
}

describe("Ödendi işaretle modalı — Paket 5", () => {
  it("elle girilen tutar/tarih/not ile ödemeyi kaydeder", async () => {
    const payment = await seedPayment(1000);
    const res = await createPaymentTool(ctx(), {
      paymentId: payment.id,
      method: "transfer",
      amount: 800,
      paidAt: "2026-08-01",
      paymentNote: "Dekont #123",
    });
    expect(res.ok).toBe(true);

    const after = await readData();
    const updated = after.payments.find((p) => p.id === payment.id)!;
    expect(updated.status).toBe("partial");
    expect(updated.paidAmount).toBe(800);
    expect(updated.method).toBe("transfer");
    expect(updated.paymentNote).toBe("Dekont #123");
    expect(updated.paidAt?.slice(0, 10)).toBe("2026-08-01");
  });

  it("idempotency: zaten ödenmiş bir kayda tekrar istek atılırsa yan etkisiz ok döner", async () => {
    const payment = await seedPayment(1000);
    const first = await createPaymentTool(ctx(), { paymentId: payment.id, amount: 1000, method: "cash" });
    expect(first.ok).toBe(true);

    const second = await createPaymentTool(ctx(), { paymentId: payment.id, amount: 1000, method: "credit_card" });
    expect(second.ok).toBe(true);

    const after = await readData();
    const finalPayment = after.payments.find((p) => p.id === payment.id)!;
    // İkinci çağrı yöntemi "credit_card" yapmaya çalışsa da, idempotent kısayol
    // ilk kaydı korur — çift tıklama farklı bir istek gövdesiyle bile veri
    // bütünlüğünü bozmaz.
    expect(finalPayment.method).toBe("cash");
  });

  it("yalnız SCHOOL_ADMIN/SUPER_ADMIN/AI_AGENT ödeme işaretleyebilir (RBAC)", async () => {
    const payment = await seedPayment(1000);
    const res = await createPaymentTool(ctx({ role: "TEACHER" }), { paymentId: payment.id });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });

  it("düzenle akışı: tamamlanmış ödemenin yöntem/tutar/notunu günceller", async () => {
    const payment = await seedPayment(1000);
    await createPaymentTool(ctx(), { paymentId: payment.id, amount: 1000, method: "cash" });

    const res = await updatePaymentTool(ctx(), {
      paymentId: payment.id,
      method: "credit_card",
      amount: 950,
      paymentNote: "Düzeltme: kısmi iade",
    });
    expect(res.ok).toBe(true);

    const after = await readData();
    const updated = after.payments.find((p) => p.id === payment.id)!;
    expect(updated.method).toBe("credit_card");
    expect(updated.paidAmount).toBe(950);
    expect(updated.paymentNote).toBe("Düzeltme: kısmi iade");
  });

  it("henüz ödenmemiş bir kayıt düzenle akışıyla değiştirilemez", async () => {
    const payment = await seedPayment(1000);
    const res = await updatePaymentTool(ctx(), { paymentId: payment.id, method: "cash" });
    expect(res.ok).toBe(false);
  });

  it("düzenleme de SCHOOL_ADMIN/SUPER_ADMIN dışına kapalıdır (RBAC)", async () => {
    const payment = await seedPayment(1000);
    await createPaymentTool(ctx(), { paymentId: payment.id, amount: 1000, method: "cash" });
    const res = await updatePaymentTool(ctx({ role: "TEACHER" }), { paymentId: payment.id, method: "credit_card" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });
});
