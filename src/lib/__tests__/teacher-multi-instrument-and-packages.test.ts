import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  createTeacherTool,
  updateTeacherInstrumentsTool,
  createPackageTool,
  updatePackageTool,
  createStudentTool,
  setSocialMediaConsentTool,
  getSocialMediaConsentTool,
} from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const SOCIAL_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "social-media-consents.json");
/** Katalog dosyası da sıfırlanmalı — aksi halde başka bir test dosyasının
 * bıraktığı enstrüman katalog durumu (ör. temel kümenin farklı biçimde
 * seed edilmiş olması) bu dosyanın testlerini etkileyebilir. */
const CATALOG_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "instrument-catalog.json");

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
  await fs.rm(SOCIAL_FILE, { force: true });
  await fs.rm(CATALOG_FILE, { force: true });
});

describe("ÖNCELİK 4 (devam) — öğretmen çoklu enstrüman + seviye", () => {
  it("formdan çoklu enstrüman + seviye kaydedilir; instruments listesi bunlardan türetilir", async () => {
    const res = await createTeacherTool(ctx(), {
      name: "Çoklu Enstrüman Öğretmen",
      email: "coklu@okul.com",
      phone: "5551112233",
      branchId: "erzene",
      instrument: "Piyano",
      instrumentLevels: [
        { instrument: "Keman", level: "Orta" },
        { instrument: "Piyano", level: "Başlangıç" },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const data = await readData();
    const teacher = data.teachers.find((t) => t.id === res.data.teacherId)!;
    expect(teacher.instrumentLevels).toHaveLength(2);
    expect(teacher.instruments).toContain("Keman");
    expect(teacher.instruments).toContain("Piyano");
  });

  it("aynı enstrüman iki kez eklenirse anlaşılır hata döner, kayıt oluşmaz", async () => {
    const before = await readData();
    const res = await createTeacherTool(ctx(), {
      name: "Yinelenen",
      email: "yinelenen@okul.com",
      phone: "5551112233",
      branchId: "erzene",
      instrument: "Piyano",
      instrumentLevels: [
        { instrument: "Piyano", level: "Orta" },
        { instrument: "Piyano", level: "İleri" },
      ],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(JSON.stringify(res.error)).toContain("birden fazla");

    const after = await readData();
    expect(after.teachers.length).toBe(before.teachers.length);
  });

  it("legacy tek enstrümanlı öğretmen (instrumentLevels verilmeden) hâlâ çalışır", async () => {
    const res = await createTeacherTool(ctx(), {
      name: "Legacy Öğretmen",
      email: "legacy@okul.com",
      phone: "5551112233",
      branchId: "erzene",
      instrument: "Gitar",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const data = await readData();
    const teacher = data.teachers.find((t) => t.id === res.data.teacherId)!;
    expect(teacher.instruments).toEqual(["Gitar"]);
    expect(teacher.instrumentLevels).toBeUndefined();
  });

  it("öğretmen detayında düzenleme — yinelenen enstrüman reddedilir, geçerli liste kaydedilir", async () => {
    const created = await createTeacherTool(ctx(), {
      name: "Düzenlenecek",
      email: "duzen@okul.com",
      phone: "5551112233",
      branchId: "erzene",
      instrument: "Piyano",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const dup = await updateTeacherInstrumentsTool(ctx(), {
      teacherId: created.data.teacherId,
      instrumentLevels: [
        { instrument: "Gitar", level: "Orta" },
        { instrument: "Gitar", level: "İleri" },
      ],
    });
    expect(dup.ok).toBe(false);

    const ok1 = await updateTeacherInstrumentsTool(ctx(), {
      teacherId: created.data.teacherId,
      instrumentLevels: [
        { instrument: "Bateri", level: "İleri" },
        { instrument: "Şan", level: "Orta" },
      ],
    });
    expect(ok1.ok).toBe(true);

    const data = await readData();
    const teacher = data.teachers.find((t) => t.id === created.data.teacherId)!;
    expect(teacher.instruments.sort()).toEqual(["Bateri", "Şan"].sort());
  });

  it("TEACHER/PARENT rolü öğretmen enstrümanlarını değiştiremez (RBAC)", async () => {
    const created = await createTeacherTool(ctx(), {
      name: "RBAC Test",
      email: "rbac@okul.com",
      phone: "5551112233",
      branchId: "erzene",
      instrument: "Piyano",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const res = await updateTeacherInstrumentsTool(ctx({ role: "TEACHER", teacherId: created.data.teacherId }), {
      teacherId: created.data.teacherId,
      instrumentLevels: [{ instrument: "Gitar", level: "Orta" }],
    });
    expect(res.ok).toBe(false);
  });
});

describe("ÖNCELİK 4 (devam) — Paket Yönetimi", () => {
  it("admin paket oluşturur, düzenler ve pasife alır", async () => {
    const created = await createPackageTool(ctx(), {
      title: "Test Paketi",
      description: "Açıklama",
      price30Min: 1000,
      price40Min: 1200,
      price50Min: 1400,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await updatePackageTool(ctx(), { packageId: created.data.packageId, price40Min: 1300 });
    expect(updated.ok).toBe(true);

    const archived = await updatePackageTool(ctx(), { packageId: created.data.packageId, status: "archived" });
    expect(archived.ok).toBe(true);

    const data = await readData();
    const pkg = (data.packages ?? []).find((p) => p.id === created.data.packageId)!;
    expect(pkg.price40Min).toBe(1300);
    expect(pkg.status).toBe("archived");
  });

  it("yetkisiz roller (TEACHER/PARENT) paket yönetemez", async () => {
    const res1 = await createPackageTool(ctx({ role: "TEACHER", teacherId: "t1" }), {
      title: "X",
      price30Min: 100,
      price40Min: 100,
      price50Min: 100,
    });
    expect(res1.ok).toBe(false);

    const res2 = await createPackageTool(ctx({ role: "STUDENT", studentId: "s1" }), {
      title: "X",
      price30Min: 100,
      price40Min: 100,
      price50Min: 100,
    });
    expect(res2.ok).toBe(false);
  });

  it("seed paketleri doğru başlık, açıklama ve fiyatlarla oluşur", async () => {
    const data = await readData();
    const packages = data.packages ?? [];
    const yaz8h = packages.find((p) => p.title === "8 Haftalık Yaz Paketi");
    expect(yaz8h).toBeDefined();
    expect(yaz8h?.description).toBe("8 özel ders + 8 grup solfej hediye");
    expect(yaz8h?.price30Min).toBe(10800);
    expect(yaz8h?.price40Min).toBe(12800);
    expect(yaz8h?.price50Min).toBe(14800);

    const mini = packages.find((p) => p.title === "Yaz Mini Paket");
    expect(mini).toBeDefined();
    expect(mini?.price30Min).toBe(6000);
    expect(mini?.price40Min).toBe(7000);
    expect(mini?.price50Min).toBe(8000);
  });

  it("float/kuruş kabul etmez — fiyat tam sayı olmalı", async () => {
    const res = await createPackageTool(ctx(), {
      title: "Ondalıklı",
      price30Min: 100.5,
      price40Min: 120,
      price50Min: 140,
    });
    expect(res.ok).toBe(false);
  });

  it("pasif paket, öğrenci kaydında (create form akışı) yeni referans için kullanılabilir olarak listelenmemeli — burada yalnızca durum kontrolü", async () => {
    const created = await createPackageTool(ctx(), {
      title: "Pasif Aday",
      price30Min: 500,
      price40Min: 600,
      price50Min: 700,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await updatePackageTool(ctx(), { packageId: created.data.packageId, status: "archived" });

    const data = await readData();
    const activeOnly = (data.packages ?? []).filter((p) => p.status === "active");
    expect(activeOnly.some((p) => p.id === created.data.packageId)).toBe(false);
  });

  it("paket fiyat revizyonu, o paketi seçmiş bir öğrencinin mevcut aylık ücretini (monthlyFee) GERİYE DÖNÜK değiştirmez", async () => {
    const pkgRes = await createPackageTool(ctx(), {
      title: "Revizyon Testi",
      price30Min: 1000,
      price40Min: 1000,
      price50Min: 1000,
    });
    expect(pkgRes.ok).toBe(true);
    if (!pkgRes.ok) return;

    const studentRes = await createStudentTool(ctx(), {
      name: "Paket Öğrenci",
      email: "",
      phone: "5551112233",
      parentName: "Veli",
      parentPhone: "5559998877",
      branchId: "erzene",
      instrument: "Piyano",
      teacherId: "t1",
      packageName: "Manuel Paket",
      weeklyLessonCount: 1,
      monthlyFee: 1000,
      notes: "",
      packageId: pkgRes.data.packageId,
      lessonDurationMinutes: 30,
      firstPaymentCollected: { method: "cash", amount: 1000, collectedAt: "2026-08-30" },
      enrollmentStartDate: "2026-09-01",
    });
    expect(studentRes.ok).toBe(true);
    if (!studentRes.ok) return;

    await updatePackageTool(ctx(), { packageId: pkgRes.data.packageId, price30Min: 9999 });

    const data = await readData();
    const student = data.students.find((s) => s.id === studentRes.data.studentId)!;
    // Öğrencinin kendi monthlyFee'si (kayıt anında paketin fiyatından hesaplandı: 1000)
    // paket fiyat revizyonundan (9999) ETKİLENMEDİ — donmuş snapshot korunur.
    expect(student.monthlyFee).toBe(1000);
  });
});

describe("ÖNCELİK 4 (devam) — sosyal medya izni (mevcut SocialMediaConsent modeli)", () => {
  it("admin izin durumunu set edebilir; en güncel kayıt doğru döner", async () => {
    const studentRes = await createStudentTool(ctx(), {
      name: "İzin Öğrenci",
      email: "",
      phone: "5551112233",
      parentName: "Veli",
      parentPhone: "5559998877",
      branchId: "erzene",
      instrument: "Piyano",
      teacherId: "t1",
      packageName: "Manuel Paket",
      weeklyLessonCount: 1,
      monthlyFee: 1000,
      firstPaymentCollected: { method: "cash", amount: 1000, collectedAt: "2026-08-30" },
      enrollmentStartDate: "2026-09-01",
      notes: "",
    });
    expect(studentRes.ok).toBe(true);
    if (!studentRes.ok) return;

    const setRes = await setSocialMediaConsentTool(ctx(), {
      studentId: studentRes.data.studentId,
      status: "granted",
      representativeName: "Veli",
      relationship: "Anne",
      scopes: ["photo"],
    });
    expect(setRes.ok).toBe(true);

    const getRes = await getSocialMediaConsentTool(ctx(), { studentId: studentRes.data.studentId });
    expect(getRes.ok).toBe(true);
    if (getRes.ok) {
      expect(getRes.data.consent?.status).toBe("granted");
      expect(getRes.data.consent?.representativeName).toBe("Veli");
    }
  });

  it("PARENT/STUDENT rolü sosyal medya izni set edemez (RBAC)", async () => {
    const res = await setSocialMediaConsentTool(ctx({ role: "STUDENT", studentId: "s1" }), {
      studentId: "s1",
      status: "granted",
      representativeName: "Veli",
      relationship: "Anne",
      scopes: ["photo"],
    });
    expect(res.ok).toBe(false);
  });
});
