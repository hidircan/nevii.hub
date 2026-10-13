import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs, readFileSync } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createDocumentInstance, getDocumentInstance, listDocumentInstances, listDocumentsForStudent } from "../documents";
import { DEFAULT_TENANT_ID } from "../auth/config";

/**
 * Kota (2026-10-13, docs/performance/QUOTA_AUDIT_2026_10_12.md): evrak listeleri ağır kolonları (`fileData`,
 * `renderedHtml`) taşımaz; tekil detay taşır. Portal sayfaları tenant'ın tamamını değil tek öğrenci dilimini okur.
 */
const DIR = resolveDataDir(path.join(process.cwd(), "data"));

beforeEach(async () => {
  for (const f of ["store.json", "document-templates.json", "document-instances.json"]) {
    await fs.rm(path.join(DIR, f), { force: true });
  }
});

describe("evrak listeleri — ağır kolon yok, detay tam", () => {
  it("liste fileData/renderedHtml döndürmez; getDocumentInstance renderedHtml'i korur", async () => {
    const doc = await createDocumentInstance({
      tenantId: DEFAULT_TENANT_ID,
      templateId: "tpl_yok",
      kind: "kvkk",
      fieldValues: { __bodyHtml: "<p>Merhaba kota</p>" },
      studentId: "s1",
      createdBy: "u1",
    });

    const [all, forStudent] = await Promise.all([
      listDocumentInstances(DEFAULT_TENANT_ID),
      listDocumentsForStudent(DEFAULT_TENANT_ID, "s1"),
    ]);
    for (const list of [all, forStudent]) {
      const row = list.find((d) => d.id === doc.id);
      expect(row).toBeDefined();
      expect(row).not.toHaveProperty("renderedHtml");
      expect(row).not.toHaveProperty("fileData");
    }

    const detail = await getDocumentInstance(DEFAULT_TENANT_ID, doc.id);
    expect(detail?.renderedHtml).toContain("Merhaba kota");
  });

  it("db modu liste sorguları kolonları DB'den hiç okumaz (omit)", () => {
    const src = readFileSync(path.join(process.cwd(), "src/lib/documents/index.ts"), "utf8");
    expect(src.match(/omit: LIST_OMIT/g)?.length).toBe(2);
  });
});

describe("portal sayfaları — tam okuma yok", () => {
  it.each([
    "src/app/ogrenci/degerlendirme/page.tsx",
    "src/app/ogretmen/degerlendirme/[studentId]/page.tsx",
    "src/app/ogretmen/ogrenciler/[studentId]/page.tsx",
  ])("%s tek öğrenci dilimini okur", (rel) => {
    const src = readFileSync(path.join(process.cwd(), rel), "utf8");
    expect(src).not.toMatch(/\breadData\s*\(/);
    expect(src).toMatch(/\breadStudentScope\s*\(/);
  });
});
