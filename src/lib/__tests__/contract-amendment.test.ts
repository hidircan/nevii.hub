import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  createStudentContractTool,
  getStudentContractTool,
  cancelStudentContractTool,
  createPaymentTool,
} from "../services/tools";
import { STUDENT_CONTRACTS_FILE } from "../contracts";
import { DOCUMENT_TEMPLATES_FILE, DOCUMENT_INSTANCES_FILE } from "../documents";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { STUDENT_PORTAL_ACCESS_FILE } from "../student-portal-access";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function adminCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(STUDENT_CONTRACTS_FILE, { force: true });
  await fs.rm(DOCUMENT_TEMPLATES_FILE, { force: true });
  await fs.rm(DOCUMENT_INSTANCES_FILE, { force: true });
  await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
});

async function seedRegistrationFirstPayment(studentId: string, amount: number, collectedAt: string) {
  const { addRegistrationFirstPayment } = await import("../store-json");
  await addRegistrationFirstPayment({ studentId, method: "cash", amount, collectedAt, receivedByUserId: "u1" });
}

async function createInitial(overrides?: Record<string, unknown>) {
  await seedRegistrationFirstPayment("s1", 3000, "2026-09-01T00:00:00.000Z");
  const res = await createStudentContractTool(adminCtx(), {
    studentId: "s1",
    contractType: "initial",
    programmeName: "Piyano",
    enrollmentStartDate: "2026-09-01T00:00:00.000Z",
    enrollmentEndDate: "2026-12-01T00:00:00.000Z",
    durationMonths: 3,
    monthlyAmount: 3000,
    installmentCount: 3,
    firstDueDate: "2026-09-01T00:00:00.000Z",
    signatoryFullName: "Selin Arslan",
    signatoryRelationship: "veli",
    ...overrides,
  });
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error("initial kurulum başarısız");
  return res.data;
}

/** Kalan taksitlerin TAMAMINI öde — borçsuz revizyon senaryosu için. */
async function payAllRemaining(installments: Array<{ paymentId: string; amount: number; status?: string }>) {
  for (const row of installments) {
    if (row.status === "paid") continue;
    const paid = await createPaymentTool(adminCtx(), { paymentId: row.paymentId, amount: row.amount });
    expect(paid.ok).toBe(true);
  }
}

function amendInput(previousId: string, overrides?: Record<string, unknown>) {
  return {
    studentId: "s1",
    contractType: "amendment" as const,
    previousContractId: previousId,
    programmeName: "Piyano",
    enrollmentStartDate: "2026-09-01T00:00:00.000Z",
    enrollmentEndDate: "2026-12-01T00:00:00.000Z",
    durationMonths: 3,
    monthlyAmount: 3500,
    installmentCount: 3,
    firstDueDate: "2026-09-01T00:00:00.000Z",
    signatoryFullName: "Selin Arslan",
    signatoryRelationship: "veli",
    // Revizyon aynı dönemi kapsar → örtüşme BEKLENEN durumdur, gerekçe zorunlu.
    allowOverlap: true,
    overlapReason: "Ekim ayı ücret artışı veli ile mutabık kalınarak işlendi.",
    ...overrides,
  };
}

describe("createStudentContractTool — revizyon (amendment)", () => {
  it("revizyon yeni sürüm üretir; önceki sürüm DEĞİŞMEDEN superseded olur, belgesi korunur", async () => {
    const initial = await createInitial();
    await payAllRemaining(initial.installments);
    const before = await getStudentContractTool(adminCtx(), { contractId: initial.contract.id });
    expect(before.ok).toBe(true);
    if (!before.ok) return;

    const res = await createStudentContractTool(adminCtx(), amendInput(initial.contract.id));
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // Yeni sürüm.
    expect(res.data.contract.contractType).toBe("amendment");
    expect(res.data.contract.versionNumber).toBe(initial.contract.versionNumber + 1);
    expect(res.data.contract.previousContractId).toBe(initial.contract.id);
    expect(res.data.contract.monthlyAmount).toBe(3500);
    expect(res.data.contract.totalContractAmount).toBe(10500);
    expect(res.data.contract.status).toBe("generated");
    expect(res.data.contract.documentInstanceId).toBeTruthy();
    expect(res.data.contract.documentInstanceId).not.toBe(initial.contract.documentInstanceId);
    expect(res.data.installments).toHaveLength(3);

    // Önceki sürüm: durumu dışında HİÇBİR alanı değişmedi.
    const after = await getStudentContractTool(adminCtx(), { contractId: initial.contract.id });
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.data.contract.status).toBe("superseded");
    expect(after.data.contract.documentInstanceId).toBe(before.data.contract.documentInstanceId);
    expect(after.data.contract.monthlyAmount).toBe(3000);
    expect(after.data.contract.totalContractAmount).toBe(9000);
    expect(after.data.contract.contractDataSnapshot).toEqual(before.data.contract.contractDataSnapshot);
    // Önceki sürümün taksit kayıtları korunur, yeni sözleşmeye taşınmaz.
    expect(after.data.installments).toHaveLength(3);
    expect(after.data.installments.every((r) => r.status === "paid")).toBe(true);
    expect(res.data.installments.every((r) => r.status !== "paid")).toBe(true);
  });

  it("revizyon yeni tahsilat anı yaratmaz — formal sürede bile firstPaymentCollected istenmez", async () => {
    const initial = await createInitial();
    await payAllRemaining(initial.installments);
    const res = await createStudentContractTool(adminCtx(), amendInput(initial.contract.id));
    expect(res.ok).toBe(true);
  });

  it("önceki sözleşme referansı olmadan revizyon reddedilir", async () => {
    await createInitial();
    const input = amendInput("x");
    delete (input as Record<string, unknown>).previousContractId;
    const res = await createStudentContractTool(adminCtx(), input);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
    expect(res.error.message).toContain("önceki sözleşme referansı");
  });

  it("aynı-dönem revizyonda gerekçesiz örtüşme reddedilir", async () => {
    const initial = await createInitial();
    await payAllRemaining(initial.installments);
    const res = await createStudentContractTool(
      adminCtx(),
      amendInput(initial.contract.id, { allowOverlap: false, overlapReason: undefined })
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
    expect(res.error.message).toContain("önceki sözleşmenin bitiş tarihinden önce");
  });

  it("iptal edilmiş sözleşme revize edilemez", async () => {
    const initial = await createInitial();
    const cancelled = await cancelStudentContractTool(adminCtx(), { contractId: initial.contract.id });
    expect(cancelled.ok).toBe(true);
    const res = await createStudentContractTool(adminCtx(), amendInput(initial.contract.id));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
    expect(res.error.message).toContain("yenilenemez");
  });

  it("zaten yenilenmiş (superseded) sözleşme tekrar revize edilemez", async () => {
    const initial = await createInitial();
    await payAllRemaining(initial.installments);
    const first = await createStudentContractTool(adminCtx(), amendInput(initial.contract.id));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    await payAllRemaining(first.data.installments);
    const second = await createStudentContractTool(adminCtx(), amendInput(initial.contract.id));
    expect(second.ok).toBe(false);
  });

  it("borç varken revizyon engellenir (CONFLICT); gerekçeli override ile geçer", async () => {
    const initial = await createInitial();
    // 2. ve 3. taksit ödenmedi → borç var.
    const blocked = await createStudentContractTool(adminCtx(), amendInput(initial.contract.id));
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error.code).toBe("CONFLICT");

    const allowed = await createStudentContractTool(
      adminCtx(),
      amendInput(initial.contract.id, {
        renewalDebtOverrideReason: "Kalan taksitler yeni planda yeniden vadelendirildi — finans onayı",
      })
    );
    expect(allowed.ok).toBe(true);
  });

  it("yalnızca sözleşme personeli revize edebilir — öğretmen REDDEDİLİR", async () => {
    const initial = await createInitial();
    await payAllRemaining(initial.installments);
    const res = await createStudentContractTool(
      { role: "TEACHER", userId: "u3", tenantId: DEFAULT_TENANT_ID, teacherId: "t1", channel: "web" },
      amendInput(initial.contract.id)
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });
});
