/**
 * UAT 2026-09-25 — kök neden: db modunda `readData()` ödeme eşlemesi `contractId` ve
 * `installmentSequence`'ı taşımıyordu. JSON testleri geçiyor, test/production (db) ortamında
 * yoklama takvimi her ay "aktif ödeme planı yok" diyor, takvim tahsilatı sözleşme taksiti yerine
 * ayrı bir "monthly_plan" satırı açıyordu. Bu test Prisma kolon listesiyle parity'yi kilitler.
 */
import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("../db", () => ({ prisma: {} }));

import { mapDbPayment } from "../store-db";
import { resolveContractPlanForMonth } from "../attendance-calendar-plan";

/** Uygulama modeline taşınmayan, kiracı/altyapı kolonları. */
const NOT_IN_APP_MODEL = new Set(["tenantId", "schoolId", "updatedAt"]);

const row = {
  id: "pay1",
  tenantId: "t1",
  studentId: "s1",
  schoolId: "sch1",
  amount: 6000,
  paidAmount: 2500,
  status: "partial",
  dueDate: new Date("2026-10-05T00:00:00.000Z"),
  paidAt: new Date("2026-10-03T10:00:00.000Z"),
  description: "Sözleşme taksiti 2/10",
  method: "cash",
  paymentNote: "not",
  lessonId: null,
  source: "contract",
  receivedByUserId: "u1",
  contractId: "ctr1",
  installmentSequence: 2,
  autoSuggestedAmount: null,
  adjustmentReason: null,
  adjustedBy: null,
  adjustedAt: null,
  firstCollectionIncludesNextMonth: null,
  installmentKind: "period_fee",
  installmentPeriodLabel: "Ekim 2026",
  installmentBreakdown: null,
  installmentComputationSource: "auto",
  installmentNote: null,
  createdAt: new Date("2026-09-20T00:00:00.000Z"),
  updatedAt: new Date("2026-09-20T00:00:00.000Z"),
} as unknown as Parameters<typeof mapDbPayment>[0];

describe("mapDbPayment — db ↔ json parity", () => {
  it("Prisma Payment'ın her uygulama kolonu eşlenir", () => {
    const mapped = mapDbPayment(row) as unknown as Record<string, unknown>;
    const missing = Object.keys(Prisma.PaymentScalarFieldEnum).filter((k) => !NOT_IN_APP_MODEL.has(k) && !(k in mapped));
    expect(missing).toEqual([]);
  });

  it("sözleşme bağı korunur ve takvim planı db satırından çözülür", () => {
    const p = mapDbPayment(row);
    expect(p.contractId).toBe("ctr1");
    expect(p.installmentSequence).toBe(2);
    const plan = resolveContractPlanForMonth({
      contracts: [{ id: "ctr1", contractNumber: "NO-1", status: "signed", enrollmentStartDate: "2026-09-10", enrollmentEndDate: "2027-06-30" }],
      installments: [p],
      year: 2026,
      month: 10,
    });
    expect(plan.state).toBe("ok");
    if (plan.state !== "ok") return;
    expect(plan.amount).toBe(6000);
    expect(plan.paidAmount).toBe(2500);
    expect(plan.remaining).toBe(3500);
  });
});
