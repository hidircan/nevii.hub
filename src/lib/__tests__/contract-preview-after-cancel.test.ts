import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  createStudentContractTool,
  cancelStudentContractTool,
  previewContractInstallmentPlanTool,
} from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { CRITICAL_ACTION_PASSWORD_FILE } from "../critical-action-password";
import { setupCriticalPassword, secureCancelInput } from "./contract-cancel-test-helper";

/**
 * Regresyon (2026-09-16) — "sözleşmeyi iptal ettim, yeniden oluştururken ödeme
 * önizlemesi boş geliyor". Kök neden istemci tarafındaydı (ön doldurma yalnız
 * `?yeniKayit=1` adresinde üretiliyordu, bkz. contract-prefill.ts), ama
 * sunucunun da her koşulda çalıştığı KANITLANMALI: iptal edilmiş bir sözleşme
 * ve ona bağlı taksit/ödeme satırları dururken önizleme motoru yine dolu ve
 * doğru bir plan üretmeli, yeni sözleşme yeniden oluşturulabilmeli.
 */
const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

vi.mock("../audit/log", () => ({ recordAuditLog: vi.fn().mockResolvedValue(undefined) }));

function adminCtx(): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
}

const MONTHLY = 4950;

async function seedStudent() {
  const { readData, writeData, addRegistrationFirstPayment } = await import("../store-json");
  const data = await readData();
  data.students.push({
    id: "s_cancel_preview",
    name: "İptal Sonrası Öğrenci",
    email: "",
    phone: "5551234567",
    parentName: "Veli",
    parentPhone: "5559876543",
    branchId: "erzene",
    instruments: ["Piyano"],
    teacherId: "t1",
    weeklyLessonCount: 1,
    monthlyFee: MONTHLY,
    derivedPerLessonAmount: Math.round(MONTHLY / 4),
    enrollmentStartDate: "2026-09-15",
    lessonStartDate: "2026-09-15",
    active: true,
    notes: "",
    createdAt: "2026-09-15T00:00:00.000Z",
    lessonDurationMinutes: 40,
  } as unknown as (typeof data.students)[number]);
  for (const [i, day] of ["2026-09-15", "2026-09-22", "2026-09-29", "2026-10-06", "2026-10-13"].entries()) {
    data.lessons.push({
      id: `les_cp_${i}`,
      studentId: "s_cancel_preview",
      teacherId: "t1",
      roomId: "r1",
      branchId: "erzene",
      instrument: "Piyano",
      startAt: `${day}T10:00:00.000Z`,
      endAt: `${day}T10:40:00.000Z`,
      type: "regular",
      status: "scheduled",
    } as unknown as (typeof data.lessons)[number]);
  }
  await writeData(data);
  await addRegistrationFirstPayment({
    studentId: "s_cancel_preview",
    method: "cash",
    amount: 3712,
    collectedAt: "2026-09-15",
    receivedByUserId: "u1",
  });
}

function contractInput() {
  return {
    studentId: "s_cancel_preview",
    contractType: "initial" as const,
    programmeName: "Piyano",
    enrollmentStartDate: "2026-09-15",
    enrollmentEndDate: "2027-06-30",
    durationMonths: 10,
    monthlyAmount: MONTHLY,
    installmentCount: 10,
    firstDueDate: "2026-09-15",
    signatoryFullName: "Veli Adı",
    signatoryRelationship: "veli",
    usePerLessonBilling: true,
    mergeFirstCollection: false,
  };
}

function previewInput() {
  return {
    studentId: "s_cancel_preview",
    durationMonths: 10,
    monthlyAmount: MONTHLY,
    installmentCount: 10,
    firstDueDate: "2026-09-15",
    enrollmentStartDate: "2026-09-15",
    enrollmentEndDate: "2027-06-30",
    usePerLessonBilling: true,
    mergeFirstCollection: false,
  };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(CRITICAL_ACTION_PASSWORD_FILE, { force: true });
  vi.clearAllMocks();
});

describe("iptal edilen sözleşmeden sonra ödeme önizlemesi", () => {
  it("önizleme sözleşme oluşturulmadan ÖNCE doludur (temel durum)", async () => {
    await seedStudent();
    const res = await previewContractInstallmentPlanTool(adminCtx(), previewInput());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.installments.length).toBe(10);
    expect(res.data.totalContractAmount).toBeGreaterThan(0);
  });

  it("sözleşme İPTAL edildikten sonra önizleme yine dolu — iptal edilmiş sözleşme ve taksit satırları engellemez", async () => {
    await seedStudent();
    const created = await createStudentContractTool(adminCtx(), contractInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // İptal edilen sözleşmenin taksitleri (Payment satırları) veride KALIR — audit/geçmiş.
    const { readData } = await import("../store-json");
    const installmentPaymentsBefore = (await readData()).payments.filter(
      (p) => p.contractId === created.data.contract.id
    );
    expect(installmentPaymentsBefore.length).toBeGreaterThan(0);

    await setupCriticalPassword();
    const cancelled = await cancelStudentContractTool(adminCtx(), secureCancelInput(created.data.contract));
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(cancelled.data.contract.status).toBe("cancelled");

    const preview = await previewContractInstallmentPlanTool(adminCtx(), previewInput());
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.data.installments.length).toBe(10);
    expect(preview.data.installments[0]!.kind).toBe("first_collection");
    expect(preview.data.installments.at(-1)!.periodLabel).toBe("Haziran 2027");
    expect(preview.data.totalContractAmount).toBeGreaterThan(0);
  });

  it("iptal sonrası aynı öğrenci için YENİ ilk kayıt sözleşmesi oluşturulabilir", async () => {
    await seedStudent();
    const first = await createStudentContractTool(adminCtx(), contractInput());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    await setupCriticalPassword();
    await cancelStudentContractTool(adminCtx(), secureCancelInput(first.data.contract));

    const second = await createStudentContractTool(adminCtx(), contractInput());
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.installments.length).toBe(10);
    expect(second.data.contract.id).not.toBe(first.data.contract.id);
    expect(second.data.contract.status).not.toBe("cancelled");
  });
});
