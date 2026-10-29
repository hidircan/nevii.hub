import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { STUDENT_CONTRACTS_FILE } from "../contracts";
import { DOCUMENT_TEMPLATES_FILE, DOCUMENT_INSTANCES_FILE } from "../documents";
import { createStudentContractTool } from "../services/tools";
import type { ServiceContext } from "../services/context";

// 2026-10-23 — sözleşme + sözleşmesiz satırların askıya alınması tek işlem: askıya alma başarısızsa sözleşme de yazılmaz.
const failSuspension = { on: false };
vi.mock("../payments/accrual-rows", async (orig) => {
  const real = await orig<typeof import("../payments/accrual-rows")>();
  return {
    ...real,
    applyAccrualOps: (async (...args: Parameters<typeof real.applyAccrualOps>) => {
      if (failSuspension.on && args[2].some((op) => op.kind === "suspendForContract")) throw new Error("simüle hata");
      return real.applyAccrualOps(...args);
    }) as typeof real.applyAccrualOps,
  };
});

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T09:00:00Z"));
  for (const f of [DATA_FILE, STUDENT_CONTRACTS_FILE, DOCUMENT_TEMPLATES_FILE, DOCUMENT_INSTANCES_FILE]) await fs.rm(f, { force: true });
});
afterEach(() => {
  failSuspension.on = false;
  vi.useRealTimers();
});

describe("sözleşme oluşturma atomikliği", () => {
  it("askıya alma başarısız → sözleşme ve taksitleri geri alınır, sözleşmesiz satır açık kalır (çift borç yok)", async () => {
    const store = await import("../store-json");
    await store.addRegistrationFirstPayment({ studentId: "s1", method: "cash", amount: 3000, collectedAt: "2026-09-01T00:00:00.000Z", receivedByUserId: "u1" });
    const { paymentId: oct } = await store.upsertMonthlyPlanPayment({ studentId: "s1", month: "2026-10", amount: 3000 });
    failSuspension.on = true;
    const ctx: ServiceContext = { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    const res = await createStudentContractTool(ctx, {
      studentId: "s1", contractType: "initial", programmeName: "Piyano",
      enrollmentStartDate: "2026-09-01T00:00:00.000Z", enrollmentEndDate: "2026-12-01T00:00:00.000Z",
      durationMonths: 3, monthlyAmount: 3000, installmentCount: 3, firstDueDate: "2026-09-01T00:00:00.000Z",
      signatoryFullName: "Veli", signatoryRelationship: "veli",
    });
    expect(res.ok).toBe(false);
    const { listContractsForStudent } = await import("../contracts");
    expect(await listContractsForStudent(DEFAULT_TENANT_ID, "s1")).toEqual([]);
    const payments = (await store.readData()).payments.filter((p) => p.studentId === "s1");
    expect(payments.some((p) => p.contractId)).toBe(false);
    const row = payments.find((p) => p.id === oct)!;
    expect(row.status).not.toBe("voided");
    expect(row.adjustedBy).toBeUndefined();
  });
});
