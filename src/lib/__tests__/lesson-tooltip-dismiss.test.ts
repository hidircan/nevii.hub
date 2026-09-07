import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * P0 UAT REGRESYONU (2026-09-07) — "hover ile açılan bilgi notu ekranda takılı kalıyor".
 *
 * KÖK NEDEN (kaynak okunarak belirlendi): hover kartının görünürlüğü saf CSS
 * ile sürülüyordu ve kurallar arasında `group-focus-within:opacity-100` vardı.
 * `:focus-within` FARE ile gelen odağı da kapsar — kullanıcı bir ders kartına
 * tıkladığında kart (role="button", tabIndex=0) odakta kalır ve fare ayrılsa
 * bile tooltip görünür kalır.
 *
 * DÜRÜSTLÜK NOTU: bu turda takılı tooltip durumu gerçek tarayıcıda
 * OTOMASYONLA yeniden üretilemedi (hover kartı harness'ta güvenilir biçimde
 * hedeflenemedi). Düzeltme CSS mekanizmasına ve kod okumasına dayanır;
 * insan tarafından 10 saniyelik bir göz doğrulaması önerilir.
 */
const SRC = readFileSync(
  path.resolve(import.meta.dirname, "../../components/program-studio.tsx"),
  "utf-8"
);
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("Ders hover kartı — kapanma yolları", () => {
  it("fare ile gelen odakta AÇIK KALMAZ (`group-focus-within` yok)", () => {
    expect(CODE).not.toContain("group-focus-within:opacity-100");
  });

  it("hover ve KLAVYE odağında açılır (erişilebilirlik korunur)", () => {
    expect(CODE).toContain("group-hover:opacity-100");
    expect(CODE).toContain("group-focus-visible:opacity-100");
  });

  it("Escape klavye odağını bırakır (tooltip kapanır)", () => {
    expect(CODE).toMatch(/if \(e\.key === "Escape"\) e\.currentTarget\.blur\(\)/);
  });

  it("tooltip fare olaylarını yutmaz (pointer-events-none)", () => {
    // Aksi hâlde tooltip'in kendisi hover'ı sürdürüp kapanmayı engellerdi.
    expect(CODE).toMatch(/pointer-events-none[\s\S]{0,400}group-hover:opacity-100/);
  });
});
