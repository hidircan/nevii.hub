import { describe, it, expect, beforeEach } from "vitest";
import { resetPlatformStoreForTests } from "../platform/store";
import { __resetSaasBillingStoreForTests } from "../saas-billing/store";
import { getEffectiveDocs, getDocsApprovalStatusAsync } from "../saas-billing/legal-doc-store";
import { LEGAL_TEMPLATES, renderLegalText } from "../saas-billing/legal-templates";
import { LEGAL_DOCS } from "../saas-billing/legal-documents";
import { saveSellerProfile } from "../saas-billing/seller-profile";
import { isValidTaxIdFormat, validateBillingProfile } from "../saas-billing/invoicing-profile";

beforeEach(async () => {
  await resetPlatformStoreForTests();
  await __resetSaasBillingStoreForTests();
});

const hyper = { role: "HYPER_ADMIN", userId: "u-h", tenantId: "t-h", channel: "web" } as never;

describe("hazır hukuki taslaklar", () => {
  it("her kayıtlı belgenin taslağı var ve yayın sınırının altında", () => {
    for (const d of LEGAL_DOCS) {
      expect(LEGAL_TEMPLATES[d.id], d.id).toBeTruthy();
      expect(LEGAL_TEMPLATES[d.id].length).toBeLessThan(60000);
    }
  });

  it("satıcı profili metne yerleşir; eksik alan açıkça işaretlenir", async () => {
    let docs = await getEffectiveDocs();
    const terms = docs.find((d) => d.id === "saas-service-terms")!;
    expect(terms.draft).toBe(true);
    expect(terms.approved).toBe(false);
    expect(terms.bodyText).toContain("[doldurulacak");
    expect(terms.bodyText).not.toMatch(/\{\{[A-Z_]+\}\}/);

    const saved = await saveSellerProfile(hyper, {
      legalTitle: "Örnek Mühendislik — Ad Soyad",
      taxId: "10000000146",
      taxOffice: "Kadıköy",
      addressLine: "Örnek Mah. 1",
      city: "İstanbul",
      invoiceEmail: "info@example.com",
      kepAddress: "ornek@hs01.kep.tr",
    });
    expect(saved.ok).toBe(true);
    docs = await getEffectiveDocs();
    const body = docs.find((d) => d.id === "saas-service-terms")!.bodyText!;
    expect(body).toContain("Örnek Mühendislik — Ad Soyad");
    expect(body).toContain("ornek@hs01.kep.tr");
    // Taslak gerçek satışı açmaz.
    expect((await getDocsApprovalStatusAsync()).allApproved).toBe(false);
  });

  it("renderLegalText bilinmeyen yer tutucuya dokunmaz", () => {
    const out = renderLegalText("{{MARKA}} {{BILINMEYEN}}", {
      legalTitle: "X", taxId: null, taxOffice: null, addressLine: null, city: null,
      country: "Türkiye", invoiceEmail: "a@b.c", verified: true,
    });
    expect(out).toBe("NeviiHub {{BILINMEYEN}}");
  });
});

describe("vergi numarası biçimi", () => {
  it("şahıs işletmesi TCKN, şirket yalnız VKN", () => {
    expect(isValidTaxIdFormat("1234567890")).toBe(true);
    expect(isValidTaxIdFormat("10000000146")).toBe(true);
    expect(isValidTaxIdFormat("10000000147")).toBe(false);
    const base = {
      displayName: "Stüdyo", legalTitle: "Ayşe Yılmaz Yoga", addressLine: "Moda Cad. 1",
      city: "İstanbul", country: "Türkiye", invoiceEmail: "a@b.co",
    };
    expect(validateBillingProfile({ ...base, recipientType: "sole_trader", taxId: "10000000146" }).ok).toBe(true);
    expect(validateBillingProfile({ ...base, recipientType: "corporate", taxId: "10000000146" }).ok).toBe(false);
  });
});
