import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createStudentContractTool, getContractHtmlTool } from "../services/tools";
import { STUDENT_CONTRACTS_FILE } from "../contracts";
import {
  DOCUMENT_TEMPLATES_FILE,
  DOCUMENT_INSTANCES_FILE,
  createTemplate,
  activateTemplateExclusive,
  ensureDefaultTemplates,
} from "../documents";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

/**
 * SÜRÜM KAPISI (2026-09-05) — "TEK BAĞLI SÖZLEŞME AKIŞI" kabul kriteri.
 *
 * Kayıt → Sözleşme Önizleme → Sözleşme Oluştur → TEK yazdırma/PDF. Çıktı
 * SIRASI ana sözleşme → KVKK → fotoğraf/video olmalı ve her bölüm GERÇEK
 * kurumsal kaynak metnini taşımalı — kurumun elinde eski, tek satırlık bir
 * "stub" KVKK/fotoğraf-video şablonu kalmış olsa BİLE. Yani normal
 * yeni-öğrenci akışında AYRI bir "taslak oluştur → şablonu etkinleştir"
 * adımı GEREKMEZ (bkz. contract-annexes.ts `resolveAnnexBody`).
 */
const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function adminCtx(): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(STUDENT_CONTRACTS_FILE, { force: true });
  await fs.rm(DOCUMENT_TEMPLATES_FILE, { force: true });
  await fs.rm(DOCUMENT_INSTANCES_FILE, { force: true });
});

async function createContractHtml() {
  const enrollmentStartDate = "2026-09-01T00:00:00.000Z";
  const { addRegistrationFirstPayment } = await import("../store-json");
  await addRegistrationFirstPayment({
    studentId: "s1",
    method: "cash",
    amount: 3000,
    collectedAt: enrollmentStartDate,
    receivedByUserId: "u1",
  });
  const res = await createStudentContractTool(adminCtx(), {
    studentId: "s1",
    contractType: "initial",
    programmeName: "Piyano",
    enrollmentStartDate,
    enrollmentEndDate: "2026-12-01T00:00:00.000Z",
    durationMonths: 3,
    monthlyAmount: 3000,
    installmentCount: 3,
    firstDueDate: enrollmentStartDate,
    signatoryFullName: "Selin Arslan",
    signatoryRelationship: "veli",
    lessonScheduleText: "Salı 17:00, Perşembe 17:00",
    photoVideoConsent: {
      granted: true,
      representativeName: "Selin Arslan",
      relationship: "veli",
      scopes: ["website", "instagram"],
    },
    firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: enrollmentStartDate },
  });
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error(JSON.stringify(res.error));
  const htmlRes = await getContractHtmlTool(adminCtx(), { contractId: res.data.contract.id });
  expect(htmlRes.ok).toBe(true);
  if (!htmlRes.ok) throw new Error(htmlRes.error.message);
  return htmlRes.data.html;
}

/** Kurumun AKTİF ek şablonlarını, sahadaki gerçek bozuk durumla aynı şekilde tek satırlık stub'a indirger. */
async function degradeAnnexTemplatesToStubs() {
  await ensureDefaultTemplates(DEFAULT_TENANT_ID);
  for (const kind of ["kvkk", "parent_social_media_consent"] as const) {
    const stub = await createTemplate({
      tenantId: DEFAULT_TENANT_ID,
      kind,
      name: `eski stub ${kind}`,
      bodyHtml: "<p>{{reference}}</p>",
      createdById: "u1",
      active: false,
    });
    await activateTemplateExclusive(DEFAULT_TENANT_ID, stub.id);
  }
}

describe("Sözleşme çıktısı — tek belge, kurumsal kaynak metniyle", () => {
  it("ana sözleşme → KVKK → fotoğraf/video sırasıyla TEK çıktıda üretilir", async () => {
    const html = await createContractHtml();
    const mainAt = html.indexOf("MADDE 1 – TARAFLAR");
    const kvkkAt = html.indexOf("KVKK AYDINLATMA METNİ");
    const fotoAt = html.indexOf("FOTOĞRAF / VİDEO AÇIK RIZA FORMU");
    expect(mainAt).toBeGreaterThanOrEqual(0);
    expect(kvkkAt).toBeGreaterThan(mainAt);
    expect(fotoAt).toBeGreaterThan(kvkkAt);
  });

  it("eski tek-satırlık stub şablonlar aktifken bile ekler GERÇEK kurumsal metni taşır", async () => {
    await degradeAnnexTemplatesToStubs();
    const html = await createContractHtml();
    // KVKK bölümü: kaynak metnin ayırt edici hükümleri
    expect(html).toContain("KVKK AYDINLATMA METNİ");
    expect(html).toContain("6698 sayılı");
    expect(html).toContain("Veri Sorumlusu");
    // Fotoğraf/video bölümü: kaynak metnin kanal listesi + rıza beyanı
    expect(html).toContain("FOTOĞRAF / VİDEO AÇIK RIZA FORMU");
    expect(html).toContain("Kurumun resmi internet sitesi");
    expect(html).toContain("açık rıza vermenin eğitim hizmetinden yararlanmanın şartı olmadığını");
    // hiçbir bölüm yalnızca başlığa inmemiş olmalı
    expect(html.length).toBeGreaterThan(8000);
  });

  it("bölümler AYRI kalır: her ekin kendi başlığı, referansı ve sayfa sonu vardır", async () => {
    const html = await createContractHtml();
    expect(html).toMatch(/KVKK Aydınlatma Metni \/ Kişisel Verilerin Korunması · Referans: .+-EK1/);
    expect(html).toMatch(/Fotoğraf \/ Video Açık Rıza Formu · Referans: .+-EK2/);
    expect(html.match(/page-break-before:always/g)).toHaveLength(2);
  });

  it("kayıtta girilen ders günü/saati sözleşme çıktısına OTOMATİK taşınır", async () => {
    const html = await createContractHtml();
    expect(html).toContain("Salı 17:00, Perşembe 17:00");
  });

  it("fotoğraf/video izin kararı çıktıya işlenir — muğlak tek onay YOK", async () => {
    const html = await createContractHtml();
    expect(html).toContain("☑ Yukarıdaki seçimlerim doğrultusunda açık rıza veriyorum.");
    expect(html).toContain("☐ Fotoğraf/video kullanımına açık rıza vermiyorum.");
  });
});
