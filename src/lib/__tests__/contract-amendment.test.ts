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
import { CRITICAL_ACTION_PASSWORD_FILE } from "../critical-action-password";
import { setupCriticalPassword, secureCancelInput } from "./contract-cancel-test-helper";

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
  await fs.rm(CRITICAL_ACTION_PASSWORD_FILE, { force: true });
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
    // 2026-10-04 — mahsup: önceki sürümde tahsil edilen 9.000 TL yeniden borç yazılmaz.
    // 2026-10-24 — dönem bazlı: her ayın 3.000'i kendi ayına düşer; zam farkı (3.500 − 3.000) her ayda kalır.
    expect(res.data.amendmentCredit).toEqual({ collected: 9000, applied: 9000, leftover: 0 });
    expect(res.data.installments.map((r) => r.amount)).toEqual([500, 500, 500]);

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
    await setupCriticalPassword();
    const cancelled = await cancelStudentContractTool(adminCtx(), secureCancelInput(initial.contract));
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

  it("2026-10-04: açık borç varken revizyon ENGELLENMEZ — eski açık taksitler yeni planla yer değiştirir, tahsilat mahsup edilir, çift borç olmaz", async () => {
    const initial = await createInitial();
    // 1. taksit kayıtta ödendi (3.000), 2. ve 3. açık (6.000).
    const res = await createStudentContractTool(adminCtx(), amendInput(initial.contract.id));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.amendmentCredit).toEqual({ collected: 3000, applied: 3000, leftover: 0 });
    expect(res.data.installments.map((r) => r.amount)).toEqual([500, 3500, 3500]);

    const { readData } = await import("../store-json");
    const { listTerminalContractIds } = await import("../contracts");
    const { summarizeStudentDebt, collectedAmountOf } = await import("../payment-profile");
    const payments = (await readData()).payments.filter((p) => p.studentId === "s1");
    const debt = summarizeStudentDebt(payments, await listTerminalContractIds(DEFAULT_TENANT_ID));
    // Yeni sözleşme 10.500 − tahsil edilen 3.000 = 7.500; eski açık 6.000 artık borç DEĞİL.
    expect(debt.openTotal).toBe(7500);
    const contractIds = new Set([initial.contract.id, res.data.contract.id]);
    expect(payments.filter((p) => p.contractId && contractIds.has(p.contractId)).reduce((s, p) => s + collectedAmountOf(p), 0)).toBe(3000);
  });

  it("2026-10-24: ikinci revizyon ilk sürümdeki gerçek tahsilatı da mahsup eder (zincir); çift sayım yok", async () => {
    const initial = await createInitial();
    const v2 = await createStudentContractTool(adminCtx(), amendInput(initial.contract.id));
    expect(v2.ok).toBe(true);
    if (!v2.ok) return;
    const v3 = await createStudentContractTool(adminCtx(), amendInput(v2.data.contract.id, { monthlyAmount: 4000 }));
    expect(v3.ok).toBe(true);
    if (!v3.ok) return;
    // v1'de kayıtta alınan 3.000 TL v2'de yalnız tutardan düşülmüştü (tahsilat değil) — v3 yine 3.000 mahsup eder.
    expect(v3.data.amendmentCredit).toEqual({ collected: 3000, applied: 3000, leftover: 0 });
    expect(v3.data.installments.map((r) => r.amount)).toEqual([1000, 4000, 4000]);
  });

  it("2026-10-24: önceki mahsup ile gerçek yeni tahsilat ayrılır — v2'de alınan Ekim parası da kendi ayına, bir kez", async () => {
    const initial = await createInitial();
    const v2 = await createStudentContractTool(adminCtx(), amendInput(initial.contract.id));
    expect(v2.ok).toBe(true);
    if (!v2.ok) return;
    const ekim = v2.data.installments.find((r) => r.sequence === 2)!;
    expect((await createPaymentTool(adminCtx(), { paymentId: ekim.paymentId, amount: ekim.amount })).ok).toBe(true);
    const v3 = await createStudentContractTool(adminCtx(), amendInput(v2.data.contract.id, { monthlyAmount: 4000 }));
    expect(v3.ok).toBe(true);
    if (!v3.ok) return;
    // v1 Eylül 3.000 (gerçek) + v2 Ekim 3.500 (gerçek); v2'nin Eylül mahsubu (3.000) ikinci kez sayılmaz.
    expect(v3.data.amendmentCredit).toEqual({ collected: 6500, applied: 6500, leftover: 0 });
    expect(v3.data.installments.map((r) => r.amount)).toEqual([1000, 500, 4000]);
  });

  it("2026-10-24: geri alınmış (iade/ters kayıt) tahsilat revizyonda mahsup edilmez", async () => {
    const initial = await createInitial();
    const { mutateStoreUnderLock } = await import("../store-json");
    await mutateStoreUnderLock(async (d) => ({
      ...d,
      payments: d.payments.map((p) => (p.source === "registration_first_payment" ? { ...p, paidAmount: 0, status: "pending" as const, paidAt: undefined } : p)),
    }));
    const v2 = await createStudentContractTool(adminCtx(), amendInput(initial.contract.id));
    expect(v2.ok).toBe(true);
    if (!v2.ok) return;
    expect(v2.data.amendmentCredit?.collected ?? 0).toBe(0);
    expect(v2.data.installments.map((r) => r.amount)).toEqual([3500, 3500, 3500]);
  });

  it("2026-10-24: zincir yenileme sınırında durur — önceki dönemin tahsilatı yenilemenin revizyonunda mahsup edilmez", async () => {
    const initial = await createInitial();
    await payAllRemaining(initial.installments);
    const renewal = await createStudentContractTool(adminCtx(), {
      ...amendInput(initial.contract.id, {
        contractType: "renewal",
        enrollmentStartDate: "2026-12-01T00:00:00.000Z",
        enrollmentEndDate: "2027-03-01T00:00:00.000Z",
        firstDueDate: "2026-12-01T00:00:00.000Z",
        monthlyAmount: 3000,
        firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: "2026-12-01T00:00:00.000Z" },
      }),
    });
    expect(renewal.ok, renewal.ok ? "" : renewal.error.message).toBe(true);
    if (!renewal.ok) return;
    const amended = await createStudentContractTool(
      adminCtx(),
      amendInput(renewal.data.contract.id, {
        enrollmentStartDate: "2026-12-01T00:00:00.000Z",
        enrollmentEndDate: "2027-03-01T00:00:00.000Z",
        firstDueDate: "2026-12-01T00:00:00.000Z",
      })
    );
    expect(amended.ok, amended.ok ? "" : amended.error.message).toBe(true);
    if (!amended.ok) return;
    // Yalnız yenilemede alınan 3.000; ilk dönemin 9.000'i bu dönemin revizyonuna mahsup edilmez.
    expect(amended.data.amendmentCredit?.collected).toBe(3000);
  });

  it("2026-10-24: revize edilmiş sözleşmenin açık taksidine tahsilat yazılmaz (güncel sözleşmeye yönlendirir)", async () => {
    const initial = await createInitial();
    const v2 = await createStudentContractTool(adminCtx(), amendInput(initial.contract.id));
    expect(v2.ok).toBe(true);
    const old = initial.installments.find((r) => r.status !== "paid")!;
    const res = await createPaymentTool(adminCtx(), { paymentId: old.paymentId, amount: old.amount });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
    expect(res.error.message).toContain("revize edildi");
    const { readData } = await import("../store-json");
    expect((await readData()).payments.find((p) => p.id === old.paymentId)?.paidAmount).toBe(0);
  });

  it("2026-10-04: hiçbir alanı/planı değişmeyen revizyon sunucuda reddedilir (mükerrer sürüm yok)", async () => {
    const initial = await createInitial();
    const res = await createStudentContractTool(adminCtx(), amendInput(initial.contract.id, { monthlyAmount: 3000 }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.message).toContain("birebir aynı");
    const again = await getStudentContractTool(adminCtx(), { contractId: initial.contract.id });
    expect(again.ok && again.data.contract.status).not.toBe("superseded");
  });

  it("2026-10-04: yalnız ödeme planında (taksit tutarı) değişiklik de geçerli revizyondur", async () => {
    const initial = await createInitial();
    const res = await createStudentContractTool(
      adminCtx(),
      amendInput(initial.contract.id, { monthlyAmount: 3000, installmentAmountOverrides: [{ sequence: 3, amount: 2500 }] })
    );
    expect(res.ok).toBe(true);
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
