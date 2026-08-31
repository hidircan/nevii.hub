import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createPackageTool, updatePackageTool, createStudentTool, updateStudentProfileTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import {
  activePackages,
  activeStudentCountForPackage,
  priceForDuration,
  updatePackageData,
} from "../packages";
import { computeStudentMonthlyAmount, validateDiscount, validatePaymentOverride } from "../student-payment-profile";
import type { AppData, Package } from "../types";

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

function makePkg(overrides?: Partial<Package>): Package {
  return {
    id: "pkg1",
    title: "Bireysel ders + 4 grup solfej dersi",
    status: "active",
    price30Min: 6000,
    price40Min: 7000,
    price50Min: 8000,
    createdBy: "seed",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("Paket Yönetimi — oluşturma/düzenleme/pasifleştirme", () => {
  it("aylık ders adedi, grup ders adedi, varsayılan süre/gün ve not alanları kaydedilir", async () => {
    const res = await createPackageTool(ctx(), {
      title: "Bireysel ders + 4 grup solfej dersi",
      price30Min: 6000,
      price40Min: 7000,
      price50Min: 8000,
      monthlyLessonCount: 4,
      groupLessonCount: 4,
      defaultDurationMinutes: 40,
      defaultPaymentDueDay: 5,
      notes: "Standart başlangıç paketi",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const data = await readData();
    const pkg = (data.packages ?? []).find((p) => p.id === res.data.packageId)!;
    expect(pkg.monthlyLessonCount).toBe(4);
    expect(pkg.groupLessonCount).toBe(4);
    expect(pkg.defaultDurationMinutes).toBe(40);
    expect(pkg.defaultPaymentDueDay).toBe(5);
    expect(pkg.notes).toBe("Standart başlangıç paketi");
  });

  it("negatif fiyat reddedilir", async () => {
    const res = await createPackageTool(ctx(), {
      title: "Geçersiz paket",
      price30Min: -100,
      price40Min: 7000,
      price50Min: 8000,
    });
    expect(res.ok).toBe(false);
  });

  it("negatif ders adedi reddedilir", async () => {
    const res = await createPackageTool(ctx(), {
      title: "Geçersiz paket",
      price30Min: 6000,
      price40Min: 7000,
      price50Min: 8000,
      monthlyLessonCount: -1,
    });
    expect(res.ok).toBe(false);
  });

  it("geçersiz varsayılan ödeme günü reddedilir", async () => {
    const res = await createPackageTool(ctx(), {
      title: "Geçersiz paket",
      price30Min: 6000,
      price40Min: 7000,
      price50Min: 8000,
      defaultPaymentDueDay: 31,
    });
    expect(res.ok).toBe(false);
  });

  it("pasifleştirilen paket aktif paket listesinde görünmez, ama var olan referansta kalır", async () => {
    const created = await createPackageTool(ctx(), {
      title: "Arşivlenecek paket",
      price30Min: 6000,
      price40Min: 7000,
      price50Min: 8000,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await updatePackageTool(ctx(), { packageId: created.data.packageId, status: "archived" });
    const data = await readData();
    const active = activePackages(data.packages);
    expect(active.some((p) => p.id === created.data.packageId)).toBe(false);
    expect((data.packages ?? []).some((p) => p.id === created.data.packageId)).toBe(true);
  });

  it("yetkisiz rol (TEACHER) paket oluşturamaz/güncelleyemez", async () => {
    const created = await createPackageTool(ctx({ role: "TEACHER", teacherId: "t1" }), {
      title: "Yasak",
      price30Min: 1,
      price40Min: 1,
      price50Min: 1,
    });
    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(created.error.code).toBe("FORBIDDEN");
  });
});

describe("Paket — aktif öğrenci sayısı (tenant scope)", () => {
  it("yalnızca aktif ve arşivlenmemiş öğrenciler sayılır", () => {
    const data: Pick<AppData, "students"> = {
      students: [
        { id: "s1", packageId: "pkg1", active: true } as AppData["students"][number],
        { id: "s2", packageId: "pkg1", active: false } as AppData["students"][number],
        { id: "s3", packageId: "pkg1", active: true, archivedAt: "2026-01-01" } as AppData["students"][number],
        { id: "s4", packageId: "pkg2", active: true } as AppData["students"][number],
      ],
    };
    expect(activeStudentCountForPackage(data, "pkg1")).toBe(1);
    expect(activeStudentCountForPackage(data, "pkg2")).toBe(1);
    expect(activeStudentCountForPackage(data, "pkg-none")).toBe(0);
  });
});

describe("Öğrenci ödeme profili — süre bazlı fiyat + indirim + override hesabı", () => {
  const pkg = makePkg();

  it("süreye göre liste fiyatı doğru seçilir", () => {
    expect(priceForDuration(pkg, 30)).toBe(6000);
    expect(priceForDuration(pkg, 40)).toBe(7000);
    expect(priceForDuration(pkg, 50)).toBe(8000);
  });

  it("indirim yokken net tutar liste fiyatına eşittir", () => {
    const result = computeStudentMonthlyAmount({}, pkg, 40);
    expect(result.listPrice).toBe(7000);
    expect(result.discountAmount).toBe(0);
    expect(result.netAmount).toBe(7000);
  });

  it("yüzde indirim doğru hesaplanır", () => {
    const result = computeStudentMonthlyAmount({ discountType: "percentage", discountValue: 10 }, pkg, 40);
    expect(result.discountAmount).toBe(700);
    expect(result.netAmount).toBe(6300);
  });

  it("sabit tutar indirimi doğru hesaplanır ve liste fiyatını aşamaz", () => {
    const result = computeStudentMonthlyAmount({ discountType: "fixed", discountValue: 2000 }, pkg, 30);
    expect(result.discountAmount).toBe(2000);
    expect(result.netAmount).toBe(4000);

    const overDiscount = computeStudentMonthlyAmount({ discountType: "fixed", discountValue: 999999 }, pkg, 30);
    expect(overDiscount.discountAmount).toBe(6000);
    expect(overDiscount.netAmount).toBe(0);
  });

  it("override, paket/indirim hesabının yerine geçer (öncelik override'da)", () => {
    const result = computeStudentMonthlyAmount(
      { paymentAmount: 5000, discountType: "percentage", discountValue: 10 },
      pkg,
      40
    );
    expect(result.overrideAmount).toBe(5000);
    expect(result.discountedPrice).toBe(6300);
    expect(result.netAmount).toBe(5000);
  });

  it("paket seçilmemişse liste fiyatı null olur; yalnız override varsa net tutar üretilir", () => {
    const result = computeStudentMonthlyAmount({ paymentAmount: 4500 }, undefined, 40);
    expect(result.listPrice).toBeNull();
    expect(result.netAmount).toBe(4500);

    const noOverride = computeStudentMonthlyAmount({}, undefined, 40);
    expect(noOverride.netAmount).toBeNull();
  });

  it("validateDiscount: tür ve değer birlikte olmalı, yüzde 100'ü geçemez", () => {
    expect(validateDiscount(undefined, undefined)).toBeNull();
    expect(validateDiscount("percentage", 10)).toBeNull();
    expect(validateDiscount("percentage", undefined)).not.toBeNull();
    expect(validateDiscount(undefined, 10)).not.toBeNull();
    expect(validateDiscount("percentage", 150)).not.toBeNull();
    expect(validateDiscount("fixed", -5)).not.toBeNull();
  });

  it("validatePaymentOverride: negatif veya ondalık reddedilir", () => {
    expect(validatePaymentOverride(undefined)).toBeNull();
    expect(validatePaymentOverride(5000)).toBeNull();
    expect(validatePaymentOverride(-1)).not.toBeNull();
    expect(validatePaymentOverride(10.5)).not.toBeNull();
  });
});

describe("Öğrenci ödeme profili — Tool Layer (RBAC, tenant, geçmiş Payment korunur)", () => {
  async function createTestStudent() {
    const pkgRes = await createPackageTool(ctx(), {
      title: "Test paketi",
      price30Min: 6000,
      price40Min: 7000,
      price50Min: 8000,
    });
    if (!pkgRes.ok) throw new Error("paket oluşturulamadı");
    const studentRes = await createStudentTool(ctx(), {
      name: "Test Öğrenci",
      email: "test@ogrenci.com",
      phone: "5551110000",
      parentName: "Veli",
      parentPhone: "5551110001",
      branchId: "erzene",
      instrument: "Piyano",
      teacherId: "t1",
      packageName: "Manuel Paket",
      weeklyLessonCount: 1,
      monthlyFee: 7000,
      firstPaymentCollected: { method: "cash", amount: 7000, collectedAt: "2026-08-30" },
      notes: "",
    });
    if (!studentRes.ok) throw new Error("öğrenci oluşturulamadı: " + studentRes.error.message);
    return { packageId: pkgRes.data.packageId, studentId: studentRes.data.studentId };
  }

  it("paket/süre/indirim/ödeme günü/override kaydedilir ve server-side doğrulanır", async () => {
    const { packageId, studentId } = await createTestStudent();

    const updated = await updateStudentProfileTool(ctx(), {
      studentId,
      packageId,
      lessonDurationMinutes: 40,
      discountType: "percentage",
      discountValue: 10,
      paymentDueDay: 15,
      paymentMethod: "transfer",
    });
    expect(updated.ok).toBe(true);

    const data = await readData();
    const student = data.students.find((s) => s.id === studentId)!;
    expect(student.packageId).toBe(packageId);
    expect(student.lessonDurationMinutes).toBe(40);
    expect(student.discountType).toBe("percentage");
    expect(student.discountValue).toBe(10);
    expect(student.paymentDueDay).toBe(15);
    expect(student.paymentMethod).toBe("transfer");
  });

  it("yüzde indirim 100'ü geçerse reddedilir", async () => {
    const { studentId } = await createTestStudent();
    const res = await updateStudentProfileTool(ctx(), {
      studentId,
      discountType: "percentage",
      discountValue: 150,
    });
    expect(res.ok).toBe(false);
  });

  it("indirim türü değer olmadan gönderilirse reddedilir", async () => {
    const { studentId } = await createTestStudent();
    const res = await updateStudentProfileTool(ctx(), {
      studentId,
      discountType: "fixed",
    });
    expect(res.ok).toBe(false);
  });

  it("yetkisiz rol (TEACHER/PARENT) ödeme profilini değiştiremez", async () => {
    const { studentId } = await createTestStudent();
    const asTeacher = await updateStudentProfileTool(ctx({ role: "TEACHER", teacherId: "t1" }), {
      studentId,
      discountType: "fixed",
      discountValue: 500,
    });
    expect(asTeacher.ok).toBe(false);
    if (!asTeacher.ok) expect(asTeacher.error.code).toBe("FORBIDDEN");

    const asParent = await updateStudentProfileTool(ctx({ role: "STUDENT", studentId }), {
      studentId,
      paymentAmount: 1,
    });
    expect(asParent.ok).toBe(false);
  });

  it("paket/ödeme profili güncellemesi geçmiş (paid) Payment kayıtlarını değiştirmez", async () => {
    const { packageId, studentId } = await createTestStudent();
    const before = await readData();
    const paidPayment = before.payments.find((p) => p.studentId === studentId && p.status === "paid");

    await updateStudentProfileTool(ctx(), {
      studentId,
      packageId,
      discountType: "percentage",
      discountValue: 20,
      paymentAmount: 3000,
    });

    const after = await readData();
    if (paidPayment) {
      const stillThere = after.payments.find((p) => p.id === paidPayment.id)!;
      expect(stillThere.amount).toBe(paidPayment.amount);
      expect(stillThere.status).toBe(paidPayment.status);
    }
  });
});

describe("Paket fiyat/açıklama revizyonu — pure fonksiyon (packages.ts)", () => {
  it("updatePackageData mevcut Payment/Student kayıtlarına dokunmaz, yalnızca Package satırını değiştirir", () => {
    const data: AppData = {
      settings: {} as AppData["settings"],
      teachers: [],
      students: [],
      rooms: [],
      lessons: [],
      lessonSeries: [],
      attendances: [],
      makeupRequests: [],
      payments: [],
      teacherFeeRules: [],
      teacherPayouts: [],
      packages: [makePkg()],
    };
    const result = updatePackageData(data, "pkg1", { price40Min: 9000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pkg.price40Min).toBe(9000);
    expect(result.pkg.price30Min).toBe(6000);
  });
});
