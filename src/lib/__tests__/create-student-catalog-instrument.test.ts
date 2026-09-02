import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  createStudentTool,
  createTeacherTool,
  createInstrumentCatalogTool,
  updateInstrumentCatalogTool,
} from "../services/tools";
import { clearInstrumentCatalog } from "../instrument-catalog";
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
  // P0-A — kataloğu (store.json'dan AYRI dosya) her testten önce sıfırla:
  // başka test dosyalarının bıraktığı arşivlenmiş kayıtlar (ör. "Piyano")
  // sızıp bu dosyadaki testleri de bozabiliyordu — bkz. write-scope-actions.test.ts.
  await clearInstrumentCatalog(DEFAULT_TENANT_ID);
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
    enrollmentStartDate: "2026-09-01",
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

  it("katalogda olmayan tamamen UYDURMA bir enstrüman hâlâ GERÇEK bir hata ile reddedilir — şema gevşetmesi doğrulamayı TAMAMEN kaldırmadı", async () => {
    const res = await createStudentTool(ctx(), studentInput({ instrument: "Uydurma Çalgı", teacherId: "t1" }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
    expect(res.error.message).not.toBe("Invalid input");
    // P0-A — artık ÖNCE aktif katalog kontrolünden geçer (daha doğru/açık
    // mesaj: "öğretmen seçimi yanlış" değil, "bu enstrüman hiç aktif değil").
    expect(res.error.message).toContain("aktif bir enstrüman değil");
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

describe("createStudentTool — P0-A: sunucu tarafı aktif katalog kontrolü (resolveActiveInstrumentNames)", () => {
  it("PASİFE ALINMIŞ bir katalog enstrümanı reddedilir — az önce aktifken şimdi pasif", async () => {
    const created = await createInstrumentCatalogTool(ctx(), { name: "Sitar" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const archived = await updateInstrumentCatalogTool(ctx(), {
      entryId: created.data.entryId,
      status: "archived",
    });
    expect(archived.ok).toBe(true);

    const res = await createStudentTool(ctx(), studentInput({ instrument: "Sitar", teacherId: "t-any" }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
    expect(res.error.message).toContain("aktif bir enstrüman değil");
  });

  it("BAŞKA bir tenant'ın kataloğunda aktif olan enstrüman bu tenant'ta reddedilir — tenant izolasyonu", async () => {
    const otherTenantId = "tenant_other_test_kampus";
    // Bu test dosyasının kendi çalıştırmaları arasında (aynı /tmp katalog
    // dosyası kalıcı olduğundan) "Vibrafon" zaten kayıtlıysa yinelenen isim
    // hatasıyla düşmemesi için diğer tenant'ın kataloğu da sıfırlanır.
    await clearInstrumentCatalog(otherTenantId);
    const createdElsewhere = await createInstrumentCatalogTool(ctx({ tenantId: otherTenantId }), {
      name: "Vibrafon",
    });
    expect(createdElsewhere.ok).toBe(true);

    // Bu tenant'ın (DEFAULT_TENANT_ID) kataloğunda "Vibrafon" hiç yok.
    const res = await createStudentTool(ctx(), studentInput({ instrument: "Vibrafon", teacherId: "t-any" }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
    expect(res.error.message).toContain("aktif bir enstrüman değil");

    // Doğru tenant'ta ise (öğretmen kontrolüne kadar) katalog kontrolünü geçer.
    const okInOwnTenant = await createStudentTool(
      ctx({ tenantId: otherTenantId }),
      studentInput({ instrument: "Vibrafon", teacherId: "t-any" })
    );
    expect(okInOwnTenant.ok).toBe(false);
    if (okInOwnTenant.ok) return;
    // Katalog kontrolünü geçip bir sonraki adıma (öğretmen bulunamadı) düştüğünü doğrula.
    expect(okInOwnTenant.error.message).not.toContain("aktif bir enstrüman değil");
  });
});
