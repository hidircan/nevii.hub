import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createStudentContractTool, getContractHtmlTool, updateSchoolLogoTool } from "../services/tools";
import { STUDENT_CONTRACTS_FILE } from "../contracts";
import { DOCUMENT_TEMPLATES_FILE, DOCUMENT_INSTANCES_FILE } from "../documents";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

/**
 * P0-E (2026-09-02) — sözleşme başlığındaki kurum logosu, oluşturma anında
 * DONDURULMUŞ (immutable snapshot) olmalı: kurum daha sonra logosunu
 * değiştirse/kaldırsa bile ÖNCEDEN oluşturulmuş sözleşmeler SESSİZCE
 * değişmemeli; yeni sözleşmeler her zaman o anki AKTİF logoyu almalı.
 */
const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function adminCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(STUDENT_CONTRACTS_FILE, { force: true });
  await fs.rm(DOCUMENT_TEMPLATES_FILE, { force: true });
  await fs.rm(DOCUMENT_INSTANCES_FILE, { force: true });
});

/**
 * `createContract` "initial" için `firstPaymentCollected` input'unu KULLANMAZ
 * — kayıt (createStudentTool) sırasında zaten oluşturulmuş
 * `registration_first_payment` Payment satırını BULUP yeniden kullanır (bkz.
 * contracts.test.ts AYNI desen); burada da o satır doğrudan seed edilir.
 */
async function initialInput(overrides?: Partial<Record<string, unknown>>) {
  const enrollmentStartDate = (overrides?.enrollmentStartDate as string) ?? "2026-09-01T00:00:00.000Z";
  const monthlyAmount = (overrides?.monthlyAmount as number) ?? 3000;
  const { addRegistrationFirstPayment } = await import("../store-json");
  await addRegistrationFirstPayment({
    studentId: (overrides?.studentId as string) ?? "s1",
    method: "cash",
    amount: monthlyAmount,
    collectedAt: enrollmentStartDate,
    receivedByUserId: "u1",
  });
  return {
    studentId: "s1",
    contractType: "initial" as const,
    programmeName: "Piyano",
    enrollmentStartDate,
    enrollmentEndDate: "2026-12-01T00:00:00.000Z",
    durationMonths: 3,
    monthlyAmount,
    installmentCount: 3,
    firstDueDate: enrollmentStartDate,
    signatoryFullName: "Selin Arslan",
    signatoryRelationship: "veli",
    firstPaymentCollected: { method: "cash", amount: monthlyAmount, collectedAt: enrollmentStartDate },
    ...overrides,
  };
}

describe("createStudentContractTool / getContractHtmlTool — P0-E kurum logosu snapshot", () => {
  it("varsayılan tohum kurum logosu (seed) sözleşmeye doğru şekilde gömülür — sabit yerel dosya yolu DEĞİL", async () => {
    const res = await createStudentContractTool(adminCtx(), await initialInput());
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const htmlRes = await getContractHtmlTool(adminCtx(), { contractId: res.data.contract.id });
    expect(htmlRes.ok).toBe(true);
    if (!htmlRes.ok) return;
    expect(htmlRes.data.html).toContain('data-institution-logo="1"');
    // P0-E — logo kaynağı YALNIZ kurumun aktif seçtiği logo olmalı; yerel
    // dev/örnek dosya (nacar-logo.png) veya sabit kodlanmış bir yol ASLA
    // görünmemeli.
    expect(htmlRes.data.html).not.toContain("nacar-logo.png");
    expect(htmlRes.data.html).not.toContain("/Users/");
    expect(res.data.contract.contractDataSnapshot.logoUrl).toBeTruthy();
  });

  it("kurumun aktif logosu boşsa (logoUrl='') render KIRILMAZ, kurum adı metin olarak gösterilir", async () => {
    // `updateSchoolLogoTool` yalnız YÜKLEME akışını kapsıyor (kaldırma/
    // temizleme akışı bu P0 sprintinin kapsamı dışında) — "boş/geçersiz
    // logoUrl" DURUMUNU test etmek için store-json'daki alt-seviye
    // fonksiyon doğrudan çağrılır (updateSchoolLogoTool'un ZATEN kullandığı
    // AYNI fonksiyon — bkz. tools.ts updateSchoolLogoTool).
    const { updateSchoolLogoUrl } = await import("../store-json");
    await updateSchoolLogoUrl("");

    const res = await createStudentContractTool(adminCtx(), await initialInput());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.contract.contractDataSnapshot.logoUrl).toBe("");

    const htmlRes = await getContractHtmlTool(adminCtx(), { contractId: res.data.contract.id });
    expect(htmlRes.ok).toBe(true);
    if (!htmlRes.ok) return;
    expect(htmlRes.data.html).toContain('data-institution-logo="1"');
    const logoBlock = htmlRes.data.html.match(/<div data-institution-logo="1"[^>]*>[\s\S]*?<\/div>/)?.[0] ?? "";
    expect(logoBlock).not.toContain("<img");
    expect(logoBlock.length).toBeGreaterThan(0);
  });

  it("aktif kurum logosu VARSA sözleşmeye gömülür — ortalanmış, kırpılmayan, banner DEĞİL", async () => {
    const logoRes = await updateSchoolLogoTool(adminCtx(), { fileMimeType: "image/png", fileData: "aaaabbbbAAAA" });
    expect(logoRes.ok).toBe(true);

    const res = await createStudentContractTool(adminCtx(), await initialInput());
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const htmlRes = await getContractHtmlTool(adminCtx(), { contractId: res.data.contract.id });
    expect(htmlRes.ok).toBe(true);
    if (!htmlRes.ok) return;
    expect(htmlRes.data.html).toContain("<img");
    expect(htmlRes.data.html).toContain("max-height:96px");
    expect(htmlRes.data.html).toContain("text-align:center");
    // Banner/hero DEĞİL — sabit üç haneli bir yükseklik asla yazılmaz.
    expect(htmlRes.data.html).not.toMatch(/[^-]height:\s*(\d{3,})px/);
  });

  it("sözleşme OLUŞTUKTAN SONRA kurum logosu değişse bile — o sözleşme SESSİZCE değişmez (donmuş snapshot)", async () => {
    const first = await updateSchoolLogoTool(adminCtx(), { fileMimeType: "image/png", fileData: "aaaabbbbAAAA" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const contractRes = await createStudentContractTool(adminCtx(), await initialInput());
    expect(contractRes.ok).toBe(true);
    if (!contractRes.ok) return;
    // Sözleşme oluştuktan SONRA kurumun logosu DEĞİŞTİ.
    const second = await updateSchoolLogoTool(adminCtx(), { fileMimeType: "image/png", fileData: "ccccddddCCCC" });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.logoUrl).not.toBe(first.data.logoUrl);

    const htmlRes = await getContractHtmlTool(adminCtx(), { contractId: contractRes.data.contract.id });
    expect(htmlRes.ok).toBe(true);
    if (!htmlRes.ok) return;
    // Eski (birinci) logo hâlâ gösteriliyor — YENİ logo DEĞİL.
    expect(htmlRes.data.html).toContain(first.data.logoUrl);
    expect(htmlRes.data.html).not.toContain(second.data.logoUrl);
  });

  it("P0 (2026-09-05) — donmuş logo harici bir http(s) URL ise (CSP `img-src` sessizce engeller) GÜVENLİ fallback: kurumun GÜNCEL data: URI logosu gösterilir, donmuş veri DEĞİŞTİRİLMEZ", async () => {
    const { updateSchoolLogoUrl } = await import("../store-json");
    await updateSchoolLogoUrl("https://okul.example/eski-logo.png");

    const res = await createStudentContractTool(adminCtx(), await initialInput());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Donmuş snapshot AYNEN harici URL'i taşımaya devam eder — tarihsel veri değişmez.
    expect(res.data.contract.contractDataSnapshot.logoUrl).toBe("https://okul.example/eski-logo.png");

    // Kurum SONRADAN gerçek yükleme akışına geçti (data: URI).
    const updated = await updateSchoolLogoTool(adminCtx(), { fileMimeType: "image/png", fileData: "aaaabbbbAAAA" });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;

    const htmlRes = await getContractHtmlTool(adminCtx(), { contractId: res.data.contract.id });
    expect(htmlRes.ok).toBe(true);
    if (!htmlRes.ok) return;
    // Donmuş harici URL asla render edilmez (CSP zaten sessizce engelliyor,
    // görünür hata yok) — görüntüleme fallback'i kurumun GÜNCEL logosunu kullanır.
    expect(htmlRes.data.html).not.toContain("https://okul.example/eski-logo.png");
    expect(htmlRes.data.html).toContain(updated.data.logoUrl);
    expect(htmlRes.data.html).toContain("<img");

    // Donmuş snapshot HÂLÂ (store'da) harici URL — yalnız GÖRÜNTÜLEME katmanında düzeltildi.
    const reread = await getContractHtmlTool(adminCtx(), { contractId: res.data.contract.id });
    expect(reread.ok).toBe(true);
  });

  it("P0 (2026-09-05) — donmuş harici logo URL'si var ama kurumun GÜNCEL logosu da harici/geçersizse kurum adı metnine güvenle düşülür (kırık img YOK)", async () => {
    const { updateSchoolLogoUrl } = await import("../store-json");
    await updateSchoolLogoUrl("https://okul.example/eski-logo.png");

    const res = await createStudentContractTool(adminCtx(), await initialInput());
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // Kurumun GÜNCEL logosu da hâlâ harici bir URL (hiç içeri aktarılmamış).
    const htmlRes = await getContractHtmlTool(adminCtx(), { contractId: res.data.contract.id });
    expect(htmlRes.ok).toBe(true);
    if (!htmlRes.ok) return;
    expect(htmlRes.data.html).toContain('data-institution-logo="1"');
    const logoBlock = htmlRes.data.html.match(/<div data-institution-logo="1"[^>]*>[\s\S]*?<\/div>/)?.[0] ?? "";
    expect(logoBlock).not.toContain("<img");
    expect(logoBlock.length).toBeGreaterThan(0);
  });

  it("YENİ bir sözleşme, logo değiştikten SONRA oluşturulursa GÜNCEL (yeni) logoyu kullanır", async () => {
    await updateSchoolLogoTool(adminCtx(), { fileMimeType: "image/png", fileData: "aaaabbbbAAAA" });
    const updated = await updateSchoolLogoTool(adminCtx(), { fileMimeType: "image/png", fileData: "ccccddddCCCC" });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;

    const res = await createStudentContractTool(adminCtx(), await initialInput());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.contract.contractDataSnapshot.logoUrl).toBe(updated.data.logoUrl);

    const htmlRes = await getContractHtmlTool(adminCtx(), { contractId: res.data.contract.id });
    expect(htmlRes.ok).toBe(true);
    if (!htmlRes.ok) return;
    expect(htmlRes.data.html).toContain(updated.data.logoUrl);
  });
});
