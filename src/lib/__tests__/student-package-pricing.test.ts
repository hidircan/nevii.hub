import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createPackageTool, createStudentTool, updateStudentPaymentProfileTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { computeDiscountAmount, computeMonthlyFee } from "../packages";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

vi.mock("../audit/log", () => ({ recordAuditLog: vi.fn().mockResolvedValue(undefined) }));

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
  vi.clearAllMocks();
});

async function createTestPackage(): Promise<string> {
  const res = await createPackageTool(ctx({ role: "SUPER_ADMIN" }), {
    title: "Bireysel Piyano",
    price30Min: 2000,
    price40Min: 2500,
    price50Min: 3000,
  });
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error(res.error.message);
  return res.data.packageId;
}

const baseStudentInput = {
  name: "Test Öğrenci",
  email: "",
  phone: "5551234567",
  parentName: "Veli Adı",
  parentPhone: "5559876543",
  branchId: "erzene",
  instrument: "Piyano",
  teacherId: "t1",
  packageName: "Bireysel Aylık — 4 ders",
  weeklyLessonCount: 1,
  monthlyFee: 1, // paket seçilince yok sayılır
  notes: "",
};

describe("Package C — computeMonthlyFee (saf helper)", () => {
  const pkg = { price30Min: 2000, price40Min: 2500, price50Min: 3000 };

  it("süreye göre doğru liste fiyatını döner (indirim yok)", () => {
    expect(computeMonthlyFee({ pkg, durationMinutes: 30 }).finalMonthlyFee).toBe(2000);
    expect(computeMonthlyFee({ pkg, durationMinutes: 40 }).finalMonthlyFee).toBe(2500);
    expect(computeMonthlyFee({ pkg, durationMinutes: 50 }).finalMonthlyFee).toBe(3000);
  });

  it("yüzde indirim doğru nihai ücreti hesaplar", () => {
    const r = computeMonthlyFee({ pkg, durationMinutes: 40, discountType: "percent", discountValue: 20 });
    expect(r.baseMonthlyFee).toBe(2500);
    expect(r.discountAmount).toBe(500);
    expect(r.finalMonthlyFee).toBe(2000);
  });

  it("tutar indirimi doğru nihai ücreti hesaplar", () => {
    const r = computeMonthlyFee({ pkg, durationMinutes: 40, discountType: "amount", discountValue: 300 });
    expect(r.finalMonthlyFee).toBe(2200);
  });

  it("indirim tabanı aşarsa nihai ücret negatif olmaz, 0'da durur", () => {
    const r = computeMonthlyFee({ pkg, durationMinutes: 30, discountType: "amount", discountValue: 99999 });
    expect(r.finalMonthlyFee).toBe(0);
    expect(r.discountAmount).toBe(2000);
  });

  it("yüzde indirim 100'ü aşarsa 100 ile sınırlanır", () => {
    const r = computeMonthlyFee({ pkg, durationMinutes: 30, discountType: "percent", discountValue: 250 });
    expect(r.finalMonthlyFee).toBe(0);
  });

  it("computeDiscountAmount negatif/sıfır değerlerde 0 döner", () => {
    expect(computeDiscountAmount(1000, "amount", -50)).toBe(0);
    expect(computeDiscountAmount(1000, undefined, 50)).toBe(0);
    expect(computeDiscountAmount(1000, "percent", 0)).toBe(0);
  });

  it("override verildiğinde taban/indirimi görmezden gelir, finalMonthlyFee = override (negatif olamaz)", () => {
    const r = computeMonthlyFee({ pkg, durationMinutes: 40, overrideAmount: -10 });
    expect(r.source).toBe("override");
    expect(r.finalMonthlyFee).toBe(0);
  });
});

describe("Package C — createStudentTool paket fiyatlandırma", () => {
  it("30/40/50 dışında bir süre reddedilir", async () => {
    const packageId = await createTestPackage();
    const res = await createStudentTool(ctx(), {
      ...baseStudentInput,
      packageId,
      lessonDurationMinutes: 35,
    });
    expect(res.ok).toBe(false);
  });

  it("süre seçimine göre doğru liste fiyatı monthlyFee olarak kaydedilir (indirim yok)", async () => {
    const packageId = await createTestPackage();
    const res = await createStudentTool(ctx(), {
      ...baseStudentInput,
      packageId,
      lessonDurationMinutes: 40,
      firstPaymentCollected: { method: "cash", amount: 2500, collectedAt: "2026-08-30" },
      enrollmentStartDate: "2026-09-01",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const data = await readData();
    const student = data.students.find((s) => s.id === res.data.studentId)!;
    expect(student.monthlyFee).toBe(2500);
    expect(student.packageBaseMonthlyFee).toBe(2500);
    expect(student.monthlyFeeManualOverride).toBeFalsy();
  });

  it("indirim uygulanınca nihai ücret doğru hesaplanır ve kaydedilir", async () => {
    const packageId = await createTestPackage();
    const res = await createStudentTool(ctx(), {
      ...baseStudentInput,
      packageId,
      lessonDurationMinutes: 40,
      discountType: "percent",
      discountValue: 20,
      firstPaymentCollected: { method: "cash", amount: 2000, collectedAt: "2026-08-30" },
      enrollmentStartDate: "2026-09-01",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const data = await readData();
    const student = data.students.find((s) => s.id === res.data.studentId)!;
    expect(student.monthlyFee).toBe(2000);
    expect(student.packageBaseMonthlyFee).toBe(2500);
    expect(student.discountType).toBe("percent");
    expect(student.discountValue).toBe(20);
  });

  it("paketsiz (legacy) akışta indirim/override alanları reddedilir", async () => {
    const res = await createStudentTool(ctx(), {
      ...baseStudentInput,
      monthlyFee: 3000,
      discountType: "percent",
      discountValue: 10,
    });
    expect(res.ok).toBe(false);
  });

  it("paketsiz (legacy) akışta serbest monthlyFee aynen kaydedilir", async () => {
    const res = await createStudentTool(ctx(), {
      ...baseStudentInput,
      monthlyFee: 4200,
      firstPaymentCollected: { method: "cash", amount: 4200, collectedAt: "2026-08-30" },
      enrollmentStartDate: "2026-09-01",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const data = await readData();
    const student = data.students.find((s) => s.id === res.data.studentId)!;
    expect(student.monthlyFee).toBe(4200);
    expect(student.packageBaseMonthlyFee).toBeUndefined();
  });

  it("paymentDueDay 1-31 dışında reddedilir", async () => {
    const res = await createStudentTool(ctx(), { ...baseStudentInput, paymentDueDay: 32 });
    expect(res.ok).toBe(false);
    const res2 = await createStudentTool(ctx(), { ...baseStudentInput, paymentDueDay: 0 });
    expect(res2.ok).toBe(false);
  });

  it("paymentDueDay 1-31 aralığında kabul edilir", async () => {
    const res = await createStudentTool(ctx(), {
      ...baseStudentInput,
      paymentDueDay: 15,
      paymentMethod: "cash",
      firstPaymentCollected: { method: "cash", amount: baseStudentInput.monthlyFee, collectedAt: "2026-08-30" },
      enrollmentStartDate: "2026-09-01",
      // P0-1 (2026-09-02) — baseStudentInput.monthlyFee (1 TL, testin gerçek
      // konusu olmayan bir değer) türetilmiş ders başı tutarla eşleşmiyor;
      // bu testin amacı paymentDueDay kabulü, tutar eşleşmesi değil.
      firstPaymentAdjustmentReason: "Test — tutar eşleşmesi bu testin konusu değil",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const data = await readData();
    const student = data.students.find((s) => s.id === res.data.studentId)!;
    expect(student.paymentDueDay).toBe(15);
    expect(student.paymentMethod).toBe("cash");
  });

  it("AI_AGENT paket akışında manuel ücret override edemez (yalnız yetkili yönetici)", async () => {
    const packageId = await createTestPackage();
    const res = await createStudentTool(ctx({ role: "AI_AGENT" }), {
      ...baseStudentInput,
      packageId,
      lessonDurationMinutes: 40,
      monthlyFeeOverrideAmount: 1,
      monthlyFeeOverrideReason: "test",
      enrollmentStartDate: "2026-09-01",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });

  it("SCHOOL_ADMIN paket akışında manuel ücreti override edebilir, gerekçe zorunludur", async () => {
    const packageId = await createTestPackage();
    const noReason = await createStudentTool(ctx(), {
      ...baseStudentInput,
      packageId,
      lessonDurationMinutes: 40,
      monthlyFeeOverrideAmount: 1800,
    });
    expect(noReason.ok).toBe(false);

    const withReason = await createStudentTool(ctx(), {
      ...baseStudentInput,
      packageId,
      lessonDurationMinutes: 40,
      monthlyFeeOverrideAmount: 1800,
      monthlyFeeOverrideReason: "Kardeş indirimi anlaşması",
      firstPaymentCollected: { method: "cash", amount: 1800, collectedAt: "2026-08-30" },
      enrollmentStartDate: "2026-09-01",
    });
    expect(withReason.ok).toBe(true);
    if (!withReason.ok) return;
    const data = await readData();
    const student = data.students.find((s) => s.id === withReason.data.studentId)!;
    expect(student.monthlyFee).toBe(1800);
    expect(student.monthlyFeeManualOverride).toBe(true);
    expect(student.monthlyFeeOverrideReason).toBe("Kardeş indirimi anlaşması");
  });
});

describe("Package C — updateStudentPaymentProfileTool", () => {
  async function createBaseStudent(): Promise<string> {
    const res = await createStudentTool(ctx(), {
      ...baseStudentInput,
      monthlyFee: 3000,
      firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: "2026-08-30" },
      enrollmentStartDate: "2026-09-01",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.error.message);
    return res.data.studentId;
  }

  it("TEACHER/PARENT ödeme profilini güncelleyemez (RBAC)", async () => {
    const studentId = await createBaseStudent();
    const res = await updateStudentPaymentProfileTool(ctx({ role: "TEACHER", teacherId: "t1" }), {
      studentId,
      paymentDueDay: 10,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");

    const res2 = await updateStudentPaymentProfileTool(ctx({ role: "STUDENT", studentId }), {
      studentId,
      paymentDueDay: 10,
    });
    expect(res2.ok).toBe(false);
  });

  it("yetkili yönetici paket atayıp nihai ücreti otomatik hesaplatabilir", async () => {
    const studentId = await createBaseStudent();
    const packageId = await createTestPackage();
    const res = await updateStudentPaymentProfileTool(ctx(), {
      studentId,
      packageId,
      lessonDurationMinutes: 50,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.monthlyFee).toBe(3000);

    const data = await readData();
    const student = data.students.find((s) => s.id === studentId)!;
    expect(student.monthlyFee).toBe(3000);
    expect(student.monthlyFeeManualOverride).toBeFalsy();
  });

  it("yetkili yönetici override yaparsa monthlyFee elle girilen değere eşitlenir ve audit üretir", async () => {
    const { recordAuditLog } = await import("../audit/log");
    const studentId = await createBaseStudent();
    const packageId = await createTestPackage();
    const res = await updateStudentPaymentProfileTool(ctx(), {
      studentId,
      packageId,
      lessonDurationMinutes: 30,
      monthlyFeeOverrideAmount: 1500,
      monthlyFeeOverrideReason: "Burs",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.monthlyFee).toBe(1500);

    const data = await readData();
    const student = data.students.find((s) => s.id === studentId)!;
    expect(student.monthlyFee).toBe(1500);
    expect(student.monthlyFeeManualOverride).toBe(true);
    expect(student.monthlyFeeOverrideReason).toBe("Burs");

    expect(recordAuditLog).toHaveBeenCalled();
    const call = vi.mocked(recordAuditLog).mock.calls.find((c) => c[0]?.action === "student.payment_profile_update");
    expect(call).toBeDefined();
    expect(call?.[0]?.meta).toMatchObject({
      reason: "Burs",
      after: expect.objectContaining({ monthlyFee: 1500, monthlyFeeManualOverride: true }),
    });
  });

  it("indirim yalnızca paket seçiliyken uygulanabilir", async () => {
    const studentId = await createBaseStudent();
    const res = await updateStudentPaymentProfileTool(ctx(), {
      studentId,
      discountType: "percent",
      discountValue: 10,
    });
    expect(res.ok).toBe(false);
  });

  it("var olmayan öğrenci NOT_FOUND döner", async () => {
    const res = await updateStudentPaymentProfileTool(ctx(), { studentId: "does-not-exist", paymentDueDay: 5 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("NOT_FOUND");
  });
});
