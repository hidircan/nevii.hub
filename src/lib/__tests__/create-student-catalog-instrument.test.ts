import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createStudentTool, createTeacherTool } from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

/**
 * P0-1 (2026-08-29) — REGRESYON: "Yeni Öğrenci Kaydı" formunda enstrüman
 * dropdown'ı kataloğun (`instrument-catalog.json`) GÜNCEL aktif listesini
 * gösterir (bkz. `yeni/page.tsx` → `listInstrumentCatalogTool`), ama
 * `studentSchema.instrument` (validation.ts) SABİT 8 değerlik bir zod
 * enum'a kilitliydi. Katalogda olup ("Bas Gitar", "Ukulele") enum'da
 * OLMAYAN bir enstrüman seçilince — GERÇEK, geçerli bir kullanıcı eylemi —
 * sunucu tarafı doğrulama jenerik "Invalid input" ile REDDEDİYOR, bu da
 * `<form action={actionAddStudent}>` (useActionState YOK) deseninde
 * yakalanmamış bir sunucu hatası olarak istemciye "Runtime Error" şeklinde
 * sızıyordu (kanıt: production'daki gerçek instrument-catalog.json'da
 * "Bas Gitar"/"Ukulele" zaten `active` olarak kayıtlı).
 */
const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

function studentInput(overrides?: Partial<Record<string, unknown>>) {
  return {
    name: "Test Öğrenci",
    email: "",
    phone: "5551234567",
    parentName: "Veli",
    parentPhone: "5559876543",
    branchId: "erzene",
    instrument: "Bas Gitar",
    teacherId: "t_bas_gitar",
    packageName: "Bireysel Aylık — 4 ders",
    weeklyLessonCount: 1,
    monthlyFee: 3000,
    firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: "2026-08-30" },
    ...overrides,
  };
}

describe("createStudentTool — katalog-only enstrüman (sabit enum'da OLMAYAN) reddedilmez", () => {
  it("kataloğa yeni eklenmiş bir enstrüman (ör. 'Bas Gitar') artık şema seviyesinde jenerik 'Invalid input' ile REDDEDİLMEZ", async () => {
    const teacher = await createTeacherTool(ctx(), {
      name: "Bas Gitar Öğretmeni",
      email: "basgitar@test.com",
      phone: "5551110000",
      branchId: "erzene",
      instrument: "Bas Gitar",
    });
    expect(teacher.ok).toBe(true);
    if (!teacher.ok) return;

    const res = await createStudentTool(ctx(), studentInput({ teacherId: teacher.data.teacherId }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.studentId).toBeTruthy();

    const { readData } = await import("../store");
    const data = await readData();
    const created = data.students.find((s) => s.id === res.data.studentId);
    expect(created?.instruments).toEqual(["Bas Gitar"]);
  });

  it("katalogda olmayan tamamen UYDURMA bir enstrüman hâlâ GERÇEK bir hata ile (öğretmen bulunamaz) reddedilir — şema gevşetmesi doğrulamayı TAMAMEN kaldırmadı", async () => {
    const res = await createStudentTool(ctx(), studentInput({ instrument: "Uydurma Çalgı", teacherId: "t1" }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
    expect(res.error.message).not.toBe("Invalid input");
    expect(res.error.message).toContain("enstrümanını öğretmiyor");
  });

  it("boş isim (gerçek geçersiz girdi) HÂLÂ zod fieldErrors ile reddedilir — alan bazlı hata bilgisi kaybolmadı", async () => {
    const res = await createStudentTool(ctx(), studentInput({ name: "" }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.message).toBe("Invalid input");
    const details = res.error.details as { fieldErrors?: Record<string, string[]> };
    expect(details.fieldErrors?.name?.[0]).toBeTruthy();
  });
});
