import { describe, it, expect } from "vitest";
import { getLegalLinks, missingLegalLinks, resolveLegalBaseUrl } from "../legal-links";

describe("legal-links (Faz 6 — gerçek URL'ler)", () => {
  it("üç yasal URL de doludur; placeholder/null YOK", () => {
    const links = getLegalLinks();
    expect(links.privacyPolicyUrl).toMatch(/\/gizlilik$/);
    expect(links.termsUrl).toMatch(/\/kullanim-kosullari$/);
    expect(links.accountDeletionUrl).toMatch(/\/hesap-silme-talebi$/);
    for (const v of Object.values(links)) {
      expect(v).not.toContain("example");
      expect(v).not.toContain("placeholder");
    }
  });

  it("eksik URL raporu boştur (release blocker YOK)", () => {
    expect(missingLegalLinks(getLegalLinks())).toEqual([]);
  });

  it("taban URL kuralı: sondaki eğik çizgi temizlenir, çift // YOK", () => {
    expect(resolveLegalBaseUrl("https://panel.ornek.com/")).toBe("https://panel.ornek.com");
    expect(resolveLegalBaseUrl(undefined)).toBe("http://localhost:3000");
  });

  it("hesap-silme akışı gerçek ekrana bağlanır (statik denetim)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const content = await fs.readFile(path.join(__dirname, "..", "..", "features", "account", "account-screen.tsx"), "utf-8");
    expect(content).toMatch(/Hesabımı silme talebi/);
    expect(content).toMatch(/\/hesap-silme-talebi/);
  });
});
