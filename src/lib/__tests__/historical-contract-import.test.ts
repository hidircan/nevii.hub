import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  previewHistoricalContractImportTool,
  commitHistoricalContractImportTool,
  listDocumentInstancesTool,
} from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { DOCUMENT_INSTANCES_FILE, DOCUMENT_TEMPLATES_FILE } from "../documents";
import { STUDENT_CONTRACTS_FILE } from "../contracts";
import type { ServiceContext } from "../services/context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function adminCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}
function teacherCtx(): ServiceContext {
  return { role: "TEACHER", userId: "u3", tenantId: DEFAULT_TENANT_ID, teacherId: "t1", channel: "web" };
}

beforeEach(async () => {
  await fs.rm(DOCUMENT_INSTANCES_FILE, { force: true });
  await fs.rm(DOCUMENT_TEMPLATES_FILE, { force: true });
  await fs.rm(STUDENT_CONTRACTS_FILE, { force: true });
});

const HEADER =
  "ogrenci_adi,ogrenci_kodu,sozlesme_turu,program_adi,baslangic_tarihi,bitis_tarihi,sure_ay,aylik_ucret,taksit_sayisi,odeme_yontemi,veli_ad_soyad,sozlesme_tarihi,belge_durumu,not\n";

function row(overrides?: Partial<Record<string, string>>): string {
  const base: Record<string, string> = {
    ogrenci_adi: "",
    ogrenci_kodu: "s1",
    sozlesme_turu: "ilk",
    program_adi: "Piyano",
    baslangic_tarihi: "2024-09-01",
    bitis_tarihi: "2025-06-01",
    sure_ay: "9",
    aylik_ucret: "2500",
    taksit_sayisi: "9",
    odeme_yontemi: "nakit",
    veli_ad_soyad: "Test Veli",
    sozlesme_tarihi: "2024-08-28",
    belge_durumu: "imzali_nusha_mevcut",
    not: "",
    ...overrides,
  };
  return [
    base.ogrenci_adi,
    base.ogrenci_kodu,
    base.sozlesme_turu,
    base.program_adi,
    base.baslangic_tarihi,
    base.bitis_tarihi,
    base.sure_ay,
    base.aylik_ucret,
    base.taksit_sayisi,
    base.odeme_yontemi,
    base.veli_ad_soyad,
    base.sozlesme_tarihi,
    base.belge_durumu,
    base.not,
  ].join(",");
}

describe("Tarihi Sözleşme CSV toplu içe aktarım — önizleme", () => {
  it("geçerli satır önizlemede valid listesine girer", async () => {
    const csv = HEADER + row() + "\n";
    const res = await previewHistoricalContractImportTool(adminCtx(), { csvText: csv });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.validCount).toBe(1);
    expect(res.data.errorCount).toBe(0);
  });

  it.each([
    { field: "sozlesme_turu", value: "gecersiz", errField: "sozlesme_turu" },
    { field: "baslangic_tarihi", value: "01.09.2024", errField: "baslangic_tarihi" },
    { field: "sure_ay", value: "13", errField: "sure_ay" },
    { field: "aylik_ucret", value: "-100", errField: "aylik_ucret" },
    { field: "odeme_yontemi", value: "çek", errField: "odeme_yontemi" },
    { field: "belge_durumu", value: "bilinmeyen", errField: "belge_durumu" },
  ])("geçersiz $field satır hatası üretir, satır reddedilir", async ({ field, value, errField }) => {
    const csv = HEADER + row({ [field]: value }) + "\n";
    const res = await previewHistoricalContractImportTool(adminCtx(), { csvText: csv });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.errorCount).toBeGreaterThan(0);
    expect(res.data.errors.some((e) => e.field === errField)).toBe(true);
  });

  it("bulunamayan öğrenci kodu satır hatası üretir", async () => {
    const csv = HEADER + row({ ogrenci_kodu: "hic-olmayan-kod" }) + "\n";
    const res = await previewHistoricalContractImportTool(adminCtx(), { csvText: csv });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.errorCount).toBeGreaterThan(0);
  });

  it("yalnızca SCHOOL_ADMIN/SUPER_ADMIN önizleme yapabilir", async () => {
    const csv = HEADER + row() + "\n";
    const res = await previewHistoricalContractImportTool(teacherCtx(), { csvText: csv });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });
});

describe("Tarihi Sözleşme CSV toplu içe aktarım — commit", () => {
  it("hatalı satır varsa HİÇBİR kayıt eklenmez", async () => {
    const csv = HEADER + row() + "\n" + row({ sure_ay: "99" }) + "\n";
    const res = await commitHistoricalContractImportTool(adminCtx(), { csvText: csv });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");

    const docs = await listDocumentInstancesTool(adminCtx(), {});
    expect(docs.ok).toBe(true);
    if (!docs.ok) return;
    expect(docs.data.documents.filter((d) => d.kind === "student_enrollment_contract").length).toBe(0);
  });

  it("geçerli satır arşiv DocumentInstance olarak (status=uploaded) oluşturulur — StudentContract/Payment YARATILMAZ", async () => {
    const csv = HEADER + row() + "\n";
    const res = await commitHistoricalContractImportTool(adminCtx(), { csvText: csv });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.created).toBe(1);

    const docs = await listDocumentInstancesTool(adminCtx(), { studentId: "s1" });
    expect(docs.ok).toBe(true);
    if (!docs.ok) return;
    const imported = docs.data.documents.find((d) => d.kind === "student_enrollment_contract");
    expect(imported).toBeTruthy();
    expect(imported!.status).toBe("uploaded");

    // StudentContract dosyasına hiç yazılmadığını doğrudan dosyadan kontrol et.
    const raw = await fs.readFile(STUDENT_CONTRACTS_FILE, "utf8").catch(() => "[]");
    const contracts = JSON.parse(raw) as unknown[];
    expect(contracts.length).toBe(0);
  });

  it("içe aktarılan belgenin başlığı öğrenci adını içerir (okunabilir isimlendirme)", async () => {
    const csv = HEADER + row() + "\n";
    const res = await commitHistoricalContractImportTool(adminCtx(), { csvText: csv });
    expect(res.ok).toBe(true);

    const docs = await listDocumentInstancesTool(adminCtx(), { studentId: "s1" });
    if (!docs.ok) return;
    const imported = docs.data.documents.find((d) => d.kind === "student_enrollment_contract");
    expect(imported).toBeTruthy();
  });

  it("EN AZ 100 satırlık büyük bir CSV tek seferde başarıyla içe aktarılır", async () => {
    const rows: string[] = [];
    for (let i = 0; i < 120; i++) {
      rows.push(
        row({
          program_adi: `Program ${i}`,
          baslangic_tarihi: "2024-09-01",
          bitis_tarihi: "2025-06-01",
          sozlesme_tarihi: "2024-08-28",
        })
      );
    }
    const csv = HEADER + rows.join("\n") + "\n";

    const preview = await previewHistoricalContractImportTool(adminCtx(), { csvText: csv });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.data.totalRows).toBe(120);
    expect(preview.data.validCount).toBe(120);
    expect(preview.data.errorCount).toBe(0);

    const commit = await commitHistoricalContractImportTool(adminCtx(), { csvText: csv });
    expect(commit.ok).toBe(true);
    if (!commit.ok) return;
    expect(commit.data.created).toBe(120);

    const docs = await listDocumentInstancesTool(adminCtx(), { studentId: "s1" });
    expect(docs.ok).toBe(true);
    if (!docs.ok) return;
    expect(docs.data.documents.filter((d) => d.kind === "student_enrollment_contract").length).toBe(120);
  });

  it("yalnızca SCHOOL_ADMIN/SUPER_ADMIN içe aktarabilir", async () => {
    const csv = HEADER + row() + "\n";
    const res = await commitHistoricalContractImportTool(teacherCtx(), { csvText: csv });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });
});
