/**
 * 10. tur iş #9 — güvenli sözleşme iptali.
 *
 * İptal bir SİLME değildir (kayıt arşivde kalır) ama geri alınamaz bir durum
 * değişikliğidir: etki özeti + gerekçe + sözleşme-no teyidi + kritik işlem
 * şifresi zorunludur; reddedilen HER deneme audit'e 'denied' yazılır.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  createStudentContractTool,
  getStudentContractTool,
  getContractCancellationImpactTool,
  cancelStudentContractTool,
} from "../services/tools";
import { STUDENT_CONTRACTS_FILE } from "../contracts";
import { DOCUMENT_TEMPLATES_FILE, DOCUMENT_INSTANCES_FILE } from "../documents";
import { CRITICAL_ACTION_PASSWORD_FILE } from "../critical-action-password";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { TEST_CRITICAL_PASSWORD, setupCriticalPassword, secureCancelInput } from "./contract-cancel-test-helper";

const auditCalls: { action: string; outcome: string; meta?: Record<string, unknown> }[] = [];
vi.mock("../audit/log", () => ({
  recordAuditLog: vi.fn(async (input: { action: string; outcome: string; meta?: Record<string, unknown> }) => {
    auditCalls.push({ action: input.action, outcome: input.outcome, meta: input.meta });
    return { id: "audit", persisted: true };
  }),
}));

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function adminCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  auditCalls.length = 0;
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(STUDENT_CONTRACTS_FILE, { force: true });
  await fs.rm(DOCUMENT_TEMPLATES_FILE, { force: true });
  await fs.rm(DOCUMENT_INSTANCES_FILE, { force: true });
  await fs.rm(CRITICAL_ACTION_PASSWORD_FILE, { force: true });
});

async function createInitial() {
  const { addRegistrationFirstPayment } = await import("../store-json");
  await addRegistrationFirstPayment({
    studentId: "s1",
    method: "cash",
    amount: 3000,
    collectedAt: "2026-09-01T00:00:00.000Z",
    receivedByUserId: "u1",
  });
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
  });
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error("initial kurulum başarısız");
  return res.data;
}

describe("getContractCancellationImpactTool — iptal öncesi etki özeti", () => {
  it("taksit/tahsilat/borç/ders etkisini ve şifre durumunu döner", async () => {
    const initial = await createInitial();
    const impact = await getContractCancellationImpactTool(adminCtx(), { contractId: initial.contract.id });
    expect(impact.ok).toBe(true);
    if (!impact.ok) return;
    expect(impact.data.contractNumber).toBe(initial.contract.contractNumber);
    expect(impact.data.cancellable).toBe(true);
    expect(impact.data.isCurrent).toBe(true);
    expect(impact.data.installmentCount).toBe(3);
    // 1. taksit kayıtta tahsil edildi; 2-3 ödenmemiş.
    expect(impact.data.collectedAmount).toBe(3000);
    expect(impact.data.outstandingAmount).toBe(6000);
    expect(impact.data.unpaidInstallmentCount).toBe(2);
    expect(impact.data.futureLessonCount).toBe(0);
    expect(impact.data.criticalPasswordConfigured).toBe(false);

    await setupCriticalPassword();
    const after = await getContractCancellationImpactTool(adminCtx(), { contractId: initial.contract.id });
    expect(after.ok && after.data.criticalPasswordConfigured).toBe(true);
  });

  it("iptal edilmiş sözleşme için cancellable=false + gerekçe döner", async () => {
    const initial = await createInitial();
    await setupCriticalPassword();
    await cancelStudentContractTool(adminCtx(), secureCancelInput(initial.contract));
    const impact = await getContractCancellationImpactTool(adminCtx(), { contractId: initial.contract.id });
    expect(impact.ok).toBe(true);
    if (!impact.ok) return;
    expect(impact.data.cancellable).toBe(false);
    expect(impact.data.cancellableBlockReason).toContain("zaten iptal");
  });

  it("öğretmen etki özetini göremez; olmayan sözleşme NOT_FOUND", async () => {
    const initial = await createInitial();
    const teacher = await getContractCancellationImpactTool(
      adminCtx({ role: "TEACHER", userId: "u3", teacherId: "t1" }),
      { contractId: initial.contract.id }
    );
    expect(teacher.ok).toBe(false);
    const missing = await getContractCancellationImpactTool(adminCtx(), { contractId: "yok-boyle" });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe("NOT_FOUND");
  });
});

describe("cancelStudentContractTool — güvenli iptal kapıları", () => {
  it("gerekçe + sözleşme-no teyidi + kritik şifre olmadan iptal YAPILAMAZ", async () => {
    const initial = await createInitial();
    await setupCriticalPassword();
    const base = secureCancelInput(initial.contract);
    for (const [label, input] of [
      ["gerekçesiz", { ...base, reason: "" }],
      ["kısa gerekçe", { ...base, reason: "abc" }],
      ["teyitsiz", { ...base, confirmationNumber: "" }],
      ["şifresiz", { ...base, criticalPassword: "" }],
    ] as const) {
      const res = await cancelStudentContractTool(adminCtx(), input);
      expect(res.ok, label).toBe(false);
      if (!res.ok) expect(res.error.code, label).toBe("VALIDATION_ERROR");
    }
    const still = await getStudentContractTool(adminCtx(), { contractId: initial.contract.id });
    expect(still.ok && still.data.contract.status).toBe("generated");
  });

  it("yanlış şifre ve yanlış numara reddedilir, sözleşme aktif kalır, denemeler audit'e 'denied' yazılır", async () => {
    const initial = await createInitial();
    await setupCriticalPassword();
    const wrongPw = await cancelStudentContractTool(
      adminCtx(),
      secureCancelInput(initial.contract, { criticalPassword: "yanlis-sifre" })
    );
    expect(wrongPw.ok).toBe(false);
    const wrongNo = await cancelStudentContractTool(
      adminCtx(),
      secureCancelInput(initial.contract, { confirmationNumber: "YANLIS-NO" })
    );
    expect(wrongNo.ok).toBe(false);
    if (!wrongNo.ok) expect(wrongNo.error.message).toContain("eşleşmedi");
    const still = await getStudentContractTool(adminCtx(), { contractId: initial.contract.id });
    expect(still.ok && still.data.contract.status).toBe("generated");
    expect(auditCalls.filter((c) => c.action === "contract.cancel" && c.outcome === "denied")).toHaveLength(2);
  });

  it("kritik şifre belirlenmemişse iptal yapılamaz — Güvenlik ekranına yönlendiren mesaj", async () => {
    const initial = await createInitial();
    const res = await cancelStudentContractTool(
      adminCtx(),
      secureCancelInput(initial.contract, { criticalPassword: TEST_CRITICAL_PASSWORD })
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toMatch(/Güvenlik/);
  });

  it("tam onaylı iptal başarılıdır: kayıt arşivde kalır, taksitler korunur, gerekçe audit'lenir", async () => {
    const initial = await createInitial();
    await setupCriticalPassword();
    const res = await cancelStudentContractTool(
      adminCtx(),
      secureCancelInput(initial.contract, { reason: "Veli talebiyle kayıt dondurma" })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.contract.status).toBe("cancelled");
    // Taksit satırları silinmez.
    const after = await getStudentContractTool(adminCtx(), { contractId: initial.contract.id });
    expect(after.ok && after.data.installments).toHaveLength(3);
    expect(auditCalls.some((c) => c.action === "contract.cancel" && c.outcome !== "denied")).toBe(true);
  });

  it("zaten iptal edilmiş sözleşme tekrar iptal edilemez (CONFLICT değil FORBIDDEN+denied)", async () => {
    const initial = await createInitial();
    await setupCriticalPassword();
    const first = await cancelStudentContractTool(adminCtx(), secureCancelInput(initial.contract));
    expect(first.ok).toBe(true);
    const second = await cancelStudentContractTool(adminCtx(), secureCancelInput(initial.contract));
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe("FORBIDDEN");
      expect(second.error.message).toContain("zaten iptal");
    }
    expect(auditCalls.filter((c) => c.action === "contract.cancel" && c.outcome === "denied")).toHaveLength(1);
  });

  it("öğretmen iptal edemez", async () => {
    const initial = await createInitial();
    await setupCriticalPassword();
    const res = await cancelStudentContractTool(
      adminCtx({ role: "TEACHER", userId: "u3", teacherId: "t1" }),
      secureCancelInput(initial.contract)
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });
});
