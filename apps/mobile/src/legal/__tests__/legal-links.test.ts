import { describe, it, expect } from "vitest";
import { getLegalLinks, missingLegalLinks } from "../legal-links";

describe("legal-links", () => {
  it("placeholder URL üretmez — yapılandırılmadıysa null döner", () => {
    const links = getLegalLinks();
    for (const v of Object.values(links)) {
      expect(v).toBeNull();
    }
  });

  it("eksik URL'leri blocker listesi olarak raporlar", () => {
    expect(missingLegalLinks(getLegalLinks())).toEqual(
      expect.arrayContaining(["privacyPolicyUrl", "termsUrl", "accountDeletionUrl"])
    );
  });

  it("sahte hesap-silme API'si çağrılmaz (statik denetim)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const content = await fs.readFile(path.join(__dirname, "..", "..", "features", "account", "account-screen.tsx"), "utf-8");
    expect(content).not.toMatch(/account.*delete|delete.*account|anonymiz/i);
    expect(content).toMatch(/Hesabımı silme talebi/);
  });
});
