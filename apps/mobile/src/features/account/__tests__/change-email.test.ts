/**
 * E-posta değiştirme sözleşmesi — güvenli self-service akış kilitleri.
 * Backend: POST /api/v1/account/email-change/request (şifre + uniqueness
 * sunucuda) + web bağlantısıyla confirm (uygulama token işlemez).
 */
import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const SCREEN = path.join(__dirname, "..", "change-email-screen.tsx");

describe("e-posta değiştirme sözleşmesi", () => {
  it("istek endpoint'ini mevcut şifreyle çağırır; token/confirm işlemez", async () => {
    const content = await fs.readFile(SCREEN, "utf-8");
    expect(content).toContain("/api/v1/account/email-change/request");
    expect(content).toContain("currentPassword");
    expect(content).not.toMatch(/email-change\/confirm|confirmEmailChange|tokenHash/);
  });

  it("mevcut adresi gösterir, aynı-adres gönderimi engeller, bekleyen durum ekranı vardır", async () => {
    const content = await fs.readFile(SCREEN, "utf-8");
    expect(content).toMatch(/emailChange\.currentEmail/);
    expect(content).toMatch(/emailChange\.sameAsCurrent/);
    expect(content).toMatch(/emailChange\.footnote/);
  });

  it("üç persona da (öğrenci/veli/öğretmen) ekrana bağlanır; admin kapsam dışı", async () => {
    const appDir = path.join(__dirname, "..", "..", "..", "..", "app");
    for (const route of ["(student)/hesabim/e-posta-degistir.tsx", "(parent)/hesabim/e-posta-degistir.tsx", "(teacher)/hesabim/e-posta-degistir.tsx"]) {
      const content = await fs.readFile(path.join(appDir, route), "utf-8");
      expect(content).toContain("ChangeEmailScreen");
    }
  });
});
