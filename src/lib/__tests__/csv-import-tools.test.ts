import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  previewTeacherImportTool,
  commitTeacherImportTool,
  previewStudentImportTool,
  commitStudentImportTool,
  getSocialMediaConsentTool,
} from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { resolveBranchId, resolveTeacherIdByEmail } from "../import/branch-lookup";
import type { ServiceContext } from "../services/context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const INSTRUMENT_CATALOG_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "instrument-catalog.json");
const SOCIAL_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "social-media-consents.json");

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
  // fileParallelism:false altında tüm test dosyaları AYNI diskteki JSON
  // depolarını paylaşır — enstrüman kataloğu/sosyal medya izni gibi
  // bağımsız modüller de temizlenmezse önceki dosyalardan sızıntı olur
  // (ör. Bas Gitar/Ukulele otomatik seed'i, katalog zaten dolu görünürse hiç tetiklenmez).
  await fs.rm(INSTRUMENT_CATALOG_FILE, { force: true });
  await fs.rm(SOCIAL_FILE, { force: true });
});

const TEACHER_CSV_VALID = "ad,eposta,telefon,sube,enstruman\nSelin Kara,selin@okul.com,0555 111 1111,Erzene,Piyano\n";

describe("commitTeacherImportTool · hatalı dosya hiçbir şey yazmaz", () => {
  it("bir satırı bile hatalı olan CSV hiçbir kayıt yazmadan reddedilir", async () => {
    const before = await readData();
    const csv =
      "ad,eposta,telefon,sube,enstruman\n" +
      "Selin Kara,selin@okul.com,0555 111 1111,Erzene,Piyano\n" +
      "Ali Veli,gecersiz-eposta,0555 222 2222,Erzene,Piyano\n";

    const res = await commitTeacherImportTool(ctx(), { csvText: csv });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("VALIDATION_ERROR");

    const after = await readData();
    expect(after.teachers.length).toBe(before.teachers.length);
    expect(after.teachers.some((t) => t.email === "selin@okul.com")).toBe(false);
  });

  it("geçerli CSV doğru kayıtları ekler (preview + commit uçtan uca)", async () => {
    const preview = await previewTeacherImportTool(ctx(), { csvText: TEACHER_CSV_VALID });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.data.errorCount).toBe(0);
    expect(preview.data.validCount).toBe(1);

    const commit = await commitTeacherImportTool(ctx(), { csvText: TEACHER_CSV_VALID });
    expect(commit.ok).toBe(true);
    if (!commit.ok) return;
    expect(commit.data.created).toBe(1);

    const data = await readData();
    expect(data.teachers.some((t) => t.email === "selin@okul.com")).toBe(true);
  });

  it("aynı CSV iki kez aktarılınca duplicate öğretmen oluşturmaz", async () => {
    const first = await commitTeacherImportTool(ctx(), { csvText: TEACHER_CSV_VALID });
    expect(first.ok).toBe(true);
    const second = await commitTeacherImportTool(ctx(), { csvText: TEACHER_CSV_VALID });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.created).toBe(0);
    expect(second.data.updated).toBe(1);

    const data = await readData();
    expect(data.teachers.filter((t) => t.email === "selin@okul.com")).toHaveLength(1);
  });

  it("veli/öğretmen rolü içe aktarım yapamaz (FORBIDDEN)", async () => {
    const res = await commitTeacherImportTool(ctx({ role: "TEACHER" }), { csvText: TEACHER_CSV_VALID });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });
});

describe("commitStudentImportTool · öğretmen içe aktarıldıktan sonra öğrenci akışı", () => {
  it("güvenli sıra: önce öğretmen, sonra o öğretmene referans veren öğrenci başarıyla eklenir", async () => {
    const teacherCommit = await commitTeacherImportTool(ctx(), { csvText: TEACHER_CSV_VALID });
    expect(teacherCommit.ok).toBe(true);

    // ÖNCELİK 4 (devam) — öğrenci CSV'sinde öğretmen artık AD ile eşleşir (e-posta değil).
    const studentCsv =
      "ad_soyad,veli_ad_soyad,veli_telefon,ogrenci_telefon,sube,enstruman,ogretmen,paket,ders_suresi,haftalik_ders_sayisi,aylik_ucret,notlar\n" +
      "Deniz Ak,Ayşe Ak,0555 333 3334,0555 333 3333,Erzene,Piyano,Selin Kara,Paket,30,1,3000,\n";

    const preview = await previewStudentImportTool(ctx(), { csvText: studentCsv });
    expect(preview.ok).toBe(true);
    if (preview.ok) expect(preview.data.errorCount).toBe(0);

    const commit = await commitStudentImportTool(ctx(), { csvText: studentCsv });
    expect(commit.ok).toBe(true);
    if (!commit.ok) return;
    expect(commit.data.created).toBe(1);

    const data = await readData();
    const created = data.students.find((s) => s.phone === "0555 333 3333");
    expect(created).toBeDefined();
    const teacher = data.teachers.find((t) => t.email === "selin@okul.com");
    expect(created?.teacherId).toBe(teacher?.id);
  });

  it("aynı isimde birden fazla aktif öğretmen varsa öğrenci satırı belirsiz eşleşme hatasıyla reddedilir", async () => {
    const teacherCsv =
      "ad,eposta,telefon,sube,enstruman\n" +
      "Ada Yıldız,ada1@okul.com,0555 444 4441,Erzene,Piyano\n" +
      "Ada Yıldız,ada2@okul.com,0555 444 4442,Erzene,Gitar\n";
    const teacherCommit = await commitTeacherImportTool(ctx(), { csvText: teacherCsv });
    expect(teacherCommit.ok).toBe(true);

    const studentCsv =
      "ad_soyad,veli_ad_soyad,veli_telefon,ogrenci_telefon,sube,enstruman,ogretmen,paket,ders_suresi,haftalik_ders_sayisi,aylik_ucret,notlar\n" +
      "Efe Kaya,Veli Kaya,0555 555 5551,0555 555 5552,Erzene,Piyano,Ada Yıldız,Paket,30,1,3000,\n";
    const preview = await previewStudentImportTool(ctx(), { csvText: studentCsv });
    expect(preview.ok).toBe(true);
    if (preview.ok) {
      expect(preview.data.errorCount).toBeGreaterThan(0);
      expect(preview.data.errors.some((e) => e.field === "ogretmen" && e.message.includes("kod"))).toBe(true);
    }
  });
});

describe("tenant dışı / bulunamayan ilişki reddi", () => {
  it("mevcut tenant verisinde olmayan bir şube kısa adı asla çözülmez", async () => {
    const data = await readData();
    const result = resolveBranchId(data, "Başka Bir Okulun Şubesi");
    expect(result.ok).toBe(false);
  });

  it("mevcut tenant verisinde olmayan bir öğretmen e-postası asla çözülmez", async () => {
    const data = await readData();
    const result = resolveTeacherIdByEmail(data, "disaridan@baskaokul.com");
    expect(result.ok).toBe(false);
  });
});

describe("ÖNCELİK 4 (devam) — öğrenci CSV importunda T.C. kimlik + sosyal medya izni", () => {
  it("T.C. kimlik no şifreli saklanır; commit sonucunda/export edilebilir hiçbir yerde düz metin yok", async () => {
    const studentCsv =
      "ad_soyad,veli_ad_soyad,veli_telefon,ogrenci_telefon,sube,enstruman,ogretmen,paket,ders_suresi,haftalik_ders_sayisi,aylik_ucret,tc_kimlik_no\n" +
      "Kimlikli Öğrenci,Veli Adı,0555 666 6661,0555 666 6662,Erzene,Piyano,Turgay Hoşbaş,Paket,30,1,3000,10000000146\n";

    const commit = await commitStudentImportTool(ctx(), { csvText: studentCsv });
    expect(commit.ok).toBe(true);
    if (!commit.ok) return;

    const created = commit.data.data.students.find((s) => s.phone === "0555 666 6662");
    expect(created).toBeDefined();
    expect(created?.nationalIdCipher).toBeTruthy();
    expect(created?.nationalIdCipher).not.toContain("10000000146");
    expect(created?.nationalIdLast2).toBe("46");
    // JSON.stringify tüm sonucu — ham T.C. hiçbir yerde (audit meta dahil) yok.
    expect(JSON.stringify(commit)).not.toContain("10000000146");
  });

  it("sosyal medya izni (Evet/Hayır) import sonrası mevcut SocialMediaConsent modeline yazılır", async () => {
    const studentCsv =
      "ad_soyad,veli_ad_soyad,veli_telefon,ogrenci_telefon,sube,enstruman,ogretmen,paket,ders_suresi,haftalik_ders_sayisi,aylik_ucret,sosyal_medya_izni\n" +
      "İzinli Öğrenci,Veli Adı,0555 777 7771,0555 777 7772,Erzene,Piyano,Turgay Hoşbaş,Paket,30,1,3000,Evet\n";

    const commit = await commitStudentImportTool(ctx(), { csvText: studentCsv });
    expect(commit.ok).toBe(true);
    if (!commit.ok) return;

    const created = commit.data.data.students.find((s) => s.phone === "0555 777 7772");
    expect(created).toBeDefined();
    if (!created) return;

    const consent = await getSocialMediaConsentTool(ctx(), { studentId: created.id });
    expect(consent.ok).toBe(true);
    if (consent.ok) expect(consent.data.consent?.status).toBe("granted");
  });

  it("geçersiz ders süresi olan bir satır tüm dosyayı reddeder (atomik) — hiçbir öğrenci eklenmez", async () => {
    const before = await readData();
    const studentCsv =
      "ad_soyad,veli_ad_soyad,veli_telefon,ogrenci_telefon,sube,enstruman,ogretmen,paket,ders_suresi,haftalik_ders_sayisi,aylik_ucret\n" +
      "Geçersiz Süre,Veli,0555 888 8881,0555 888 8882,Erzene,Piyano,Nilüfer Acar,Paket,25,1,3000\n";
    const commit = await commitStudentImportTool(ctx(), { csvText: studentCsv });
    expect(commit.ok).toBe(false);
    const after = await readData();
    expect(after.students.length).toBe(before.students.length);
  });
});

describe("ÖNCELİK 4 (devam) — öğretmen CSV çoklu enstrüman (tools katmanı)", () => {
  it("Bas Gitar/Ukulele dahil çoklu enstrümanlı öğretmen commit ile başarıyla eklenir (kataloğun tenant-scoped seed'i sayesinde)", async () => {
    const csv =
      "ad_soyad,email,telefon,sube,enstrumanlar,enstruman_seviyeleri,lise,universite,mezuniyet,sozlesme_baslangic,sozlesme_bitis\n" +
      "Çoklu Öğretmen,coklu@okul.com,0555 999 1111,Erzene,Gitar|Bas Gitar|Ukulele,İleri|Orta|Başlangıç,İzmir Lisesi,İTÜ,2016,2026-09-01,2027-08-31\n";

    const preview = await previewTeacherImportTool(ctx(), { csvText: csv });
    expect(preview.ok).toBe(true);
    if (preview.ok) expect(preview.data.errorCount).toBe(0);

    const commit = await commitTeacherImportTool(ctx(), { csvText: csv });
    expect(commit.ok).toBe(true);
    if (!commit.ok) return;
    expect(commit.data.created).toBe(1);

    const data = await readData();
    const teacher = data.teachers.find((t) => t.email === "coklu@okul.com");
    expect(teacher).toBeDefined();
    expect(teacher?.instruments).toEqual(expect.arrayContaining(["Gitar", "Bas Gitar", "Ukulele"]));
    expect(teacher?.instrumentLevels).toHaveLength(3);
    expect(teacher?.highSchool).toBe("İzmir Lisesi");
    expect(teacher?.university).toBe("İTÜ");
    expect(teacher?.graduationYear).toBe(2016);
  });

  it("enstrüman/seviye sayısı uyuşmayan satır tüm dosyayı reddeder (atomik) — hiçbir öğretmen eklenmez", async () => {
    const before = await readData();
    const csv =
      "ad_soyad,email,telefon,sube,enstrumanlar,enstruman_seviyeleri\n" +
      "Sayı Uyuşmaz,uyusmaz@okul.com,0555 999 2222,Erzene,Piyano|Gitar,İleri\n";
    const commit = await commitTeacherImportTool(ctx(), { csvText: csv });
    expect(commit.ok).toBe(false);
    const after = await readData();
    expect(after.teachers.length).toBe(before.teachers.length);
  });
});
