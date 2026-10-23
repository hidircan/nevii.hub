/**
 * resolveDisplayName sözleşmesi — profil kimliği regresyon testi.
 * Kök neden: Ebru Şirince hesabında adın bazen yalnız "Öğretmen" görünmesi
 * (restore sonrası boş e-posta → rol etiketi ada düşüyordu) ve öğretmen
 * Hesabım ekranında başlıkta e-posta görünmesi.
 *
 * Yeni sözleşme: sunucunun `fullName` alanı → (uyum için) `teacherName` →
 * null. E-posta kimlik yerine GEÇMEZ; ayrı iletişim satırıdır.
 */
import { describe, it, expect } from "vitest";
import { resolveDisplayName } from "../display-name";

describe("resolveDisplayName", () => {
  it("sunucu fullName varsa onu döndürür (en yüksek öncelik)", () => {
    expect(resolveDisplayName({ fullName: "Ebru Şirince", teacherName: "Eski Ad" })).toBe("Ebru Şirince");
  });

  it("fullName yoksa teacherName'e düşer (eski sunucu uyumu)", () => {
    expect(resolveDisplayName({ fullName: null, teacherName: "Ebru Şirince" })).toBe("Ebru Şirince");
  });

  it("boşluklardan ibaret değerler yok hükmündedir", () => {
    expect(resolveDisplayName({ fullName: "   ", teacherName: "  " })).toBeNull();
  });

  it("ikisi de yoksa null döner (iskelet gösterilir, rol etiketi ada konmaz)", () => {
    expect(resolveDisplayName({})).toBeNull();
    expect(resolveDisplayName({ fullName: null, teacherName: null })).toBeNull();
  });

  it("e-posta parametresi YOK — e-posta ada dönüşemez", () => {
    const fn = resolveDisplayName as unknown as (input: Record<string, unknown>) => string | null;
    expect(fn({ email: "ebru@kurum.com" })).toBeNull();
  });
});

describe("account-screen sözleşmesi", () => {
  it("ad yerine rol etiketi konmaz; fullName kullanılır; e-posta ayrı satırdadır", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const content = await fs.readFile(path.join(__dirname, "..", "account-screen.tsx"), "utf-8");
    expect(content).not.toMatch(/\?\?\s*\(?.*roleLabel/);
    expect(content).toMatch(/showSkeleton/);
    expect(content).toMatch(/resolveDisplayName\(\{ fullName: user\.fullName, teacherName \}\)/);
    // E-posta yalnız AYRI satırda gösterilir, ad yerine geçmez.
    expect(content).toMatch(/\{user\.email\}/);
  });

  it("öğretmende profil fotoğrafı alanı ve yükleme çağrısı yok (feature flag)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const content = await fs.readFile(path.join(__dirname, "..", "account-screen.tsx"), "utf-8");
    expect(content).toMatch(/canManageProfilePhoto\(user\?\.role\)/);
    expect(content).toMatch(/\{photoEnabled \? \(/);
    const flags = await fs.readFile(path.join(__dirname, "..", "feature-flags.ts"), "utf-8");
    expect(flags).toMatch(/PROFILE_PHOTO_UPLOAD_ENABLED = false/);
    expect(flags).toMatch(/role === "TEACHER"\) return PROFILE_PHOTO_UPLOAD_ENABLED/);
  });

  it("görünüm bölümünde tema + yazı boyutu birlikte sunulur", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const content = await fs.readFile(path.join(__dirname, "..", "account-screen.tsx"), "utf-8");
    expect(content).toMatch(/THEME_OPTIONS/);
    expect(content).toMatch(/FONT_SIZE_OPTIONS/);
    expect(content).toMatch(/setFontSize\(opt\.value\)/);
    expect(content).toMatch(/account\.fontSize/);
  });
});
