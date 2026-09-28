import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { authCopy } from "../i18n/copy";

/**
 * P0 UAT (2026-09-08) — "Login ekranında Şifremi unuttum akışı yok".
 *
 * AUDIT: backend zaten tamdı ve güvenliydi (nötr anti-enumeration yanıtı,
 * e-posta başına 5/15dk + IP başına 20/15dk limit, sha256 hash'li tek
 * kullanımlık 30 dk'lık token, audit log). Eksik olan tek şey kullanıcının
 * kodu İSTEYEBİLECEĞİ adımdı: `/api/v1/auth/forgot-password` UI'dan HİÇ
 * çağrılmıyordu. Bkz. docs/security/PASSWORD_RESET_DESIGN.md
 */
const ROOT = path.resolve(import.meta.dirname, "../../..");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const LOGIN = strip(readFileSync(path.join(ROOT, "src/components/login-form.tsx"), "utf-8"));
const FORM = strip(readFileSync(path.join(ROOT, "src/components/reset-password-form.tsx"), "utf-8"));
const ROUTE = readFileSync(path.join(ROOT, "src/app/api/v1/auth/forgot-password/route.ts"), "utf-8");

describe("Giriş ekranı — şifremi unuttum erişilebilir", () => {
  it("`/sifre-sifirla` bağlantısı vardır", () => {
    expect(LOGIN).toMatch(/href="\/sifre-sifirla"/);
    // Kök neden (neviios kurum dili): etiket bileşende sabit metin DEĞİL,
    // i18n anahtarıdır (`copy.forgot`). Niyet aynı kalır — TR karşılığı
    // "Şifremi unuttum" olmalıdır — ama doğruluk kaynağı bileşenin
    // kullandığı SÖZLÜKTÜR (3 admin sıfırlama testindeki codeLabel
    // deseniyle aynı).
    expect(LOGIN).toContain("copy.forgot");
    expect(authCopy("tr").forgot).toBe("Şifremi unuttum");
  });
});

describe("Sıfırlama formu — kullanıcı kodu KENDİSİ isteyebilir", () => {
  it("talep adımı `/api/v1/auth/forgot-password` ucunu çağırır", () => {
    expect(FORM).toContain('"/api/v1/auth/forgot-password"');
  });

  it("token yoksa talep adımıyla, varsa doğrudan sıfırlama adımıyla açılır", () => {
    expect(FORM).toMatch(/useState<"request" \| "reset">\(initialToken \? "reset" : "request"\)/);
  });

  it("sunucunun NÖTR metni gösterilir — hesap varlığı sızdırılmaz", () => {
    expect(FORM).toContain("kayıtlı bir hesap varsa");
    // UI kendi başına "hesap bulunamadı" gibi bir ayrım YAPMAMALI.
    expect(FORM).not.toMatch(/hesap bulunamadı|kullanıcı bulunamadı/i);
  });

  it("devResetToken arayüzde GÖSTERİLMEZ", () => {
    expect(FORM).not.toContain("devResetToken");
  });

  it("kullanıcı elindeki kodla doğrudan devam edebilir", () => {
    expect(FORM).toContain("Kodum var, devam et");
  });
});

describe("forgot-password ucu — güvenlik özellikleri korunur", () => {
  it("hesap var/yok AYNI nötr yanıt", () => {
    expect(ROUTE).toContain("NEUTRAL_MESSAGE");
    // Nötr metin hem limitli hem normal yolda dönmeli.
    expect((ROUTE.match(/NEUTRAL_MESSAGE/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("e-posta VE IP bazlı rate limit uygulanır", () => {
    expect(ROUTE).toMatch(/isRateLimited\(`forgot-password:\$\{email\}`/);
    expect(ROUTE).toMatch(/isRateLimited\(`forgot-password:ip:\$\{ip\}`/);
  });

  it("devResetToken yalnız production DIŞINDA döner", () => {
    expect(ROUTE).toMatch(/process\.env\.NODE_ENV !== "production"\) devResetToken = raw/);
  });

  it("talep audit log'a yazılır", () => {
    expect(ROUTE).toContain("auth.password_reset_requested");
  });
});
