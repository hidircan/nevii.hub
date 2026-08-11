import { describe, it, expect } from "vitest";
import {
  normalizeThemeProfile,
  normalizeDensity,
  normalizeFontChoice,
  QUICK_THEME_TO_PROFILE,
  DEFAULT_THEME_PROFILE,
  DEFAULT_DENSITY,
  THEME_PROFILE_VALUES,
} from "../theme";
import { roleLabelTr, initialsFromEmail } from "../auth/role-labels";
import { PANEL_SYSTEM_NAV, PANEL_MAIN_NAV, PANEL_FINANCE_NAV, PANEL_OPS_NAV, PANEL_AI_NAV } from "../nav/panel-nav";
import { changeOwnPassword } from "../auth/users";

/**
 * İş 1-4 (kompakt header, kullanıcı menüsü, görünüm/yoğunluk tercihi,
 * kurumsal+atölye tema) için SALT MANTIK testleri. Proje test altyapısı
 * (`vitest.config.mts`) yalnız `environment: "node"` + `src/lib/__tests__/**`
 * hedefler — jsdom/React Testing Library YOK. Bu yüzden dropdown açma/kapama,
 * Escape/dışarı tıklama, avatar render'ı gibi DOM etkileşimleri BURADA test
 * EDİLEMEZ (yeni bir test altyapısı kurmak bu turun kapsamı dışında
 * bırakıldı — final raporda açıkça belirtilmiştir). Bunun yerine, o
 * davranışların dayandığı SAF fonksiyonlar (normalize/eşleme/etiket
 * üretimi) ve rota/nav kataloğu değişiklikleri test edilir.
 */

describe("theme.ts — atölye profili ve hızlı tema eşlemesi", () => {
  it("THEME_PROFILE_VALUES artık 'atolye' içerir", () => {
    expect(THEME_PROFILE_VALUES).toContain("atolye");
  });

  it("normalizeThemeProfile geçersiz/eksik değeri varsayılana indirger", () => {
    expect(normalizeThemeProfile(undefined)).toBe(DEFAULT_THEME_PROFILE);
    expect(normalizeThemeProfile("bilinmeyen")).toBe(DEFAULT_THEME_PROFILE);
    expect(normalizeThemeProfile("atolye")).toBe("atolye");
  });

  it("QUICK_THEME_TO_PROFILE, kullanıcı menüsündeki 3 seçenekten ikisini gerçek profillere eşler", () => {
    expect(QUICK_THEME_TO_PROFILE.kurumsal).toBe("gold");
    expect(QUICK_THEME_TO_PROFILE.atolye).toBe("atolye");
  });

  it("normalizeFontChoice mevcut davranışı bozmaz", () => {
    expect(normalizeFontChoice("inter")).toBe("inter");
    expect(normalizeFontChoice("gecersiz")).toBe("inter");
  });
});

describe("theme.ts — yoğunluk tercihi", () => {
  it("normalizeDensity geçersiz/eksik değeri 'comfortable' varsayılanına indirger", () => {
    expect(normalizeDensity(undefined)).toBe(DEFAULT_DENSITY);
    expect(normalizeDensity("gecersiz")).toBe("comfortable");
    expect(normalizeDensity("compact")).toBe("compact");
  });
});

describe("role-labels.ts — kullanıcı menüsü özet metinleri", () => {
  it("roleLabelTr her AppRole için Türkçe bir etiket döner", () => {
    expect(roleLabelTr("SUPER_ADMIN")).toBe("Kurum Sahibi");
    expect(roleLabelTr("SCHOOL_ADMIN")).toBe("Kurum Yöneticisi");
    expect(roleLabelTr("TEACHER")).toBe("Öğretmen");
  });

  it("initialsFromEmail 'ad.soyad@...' deseninden iki baş harf üretir", () => {
    expect(initialsFromEmail("nilufer.acar@niluferacar.com.tr", "KY")).toBe("NA");
    expect(initialsFromEmail("ezgi.guclu@niluferacar.com.tr", "KY")).toBe("EG");
  });

  it("e-posta yoksa fallback'ten (rol) üretir, hata fırlatmaz", () => {
    expect(initialsFromEmail(null, "SUPER_ADMIN")).toBe("SU");
    expect(initialsFromEmail("", "TEACHER")).toBe("TE");
  });
});

describe("panel-nav.ts — Görünüm Ayarları sidebar'dan kaldırıldı (İş 3)", () => {
  it("hiçbir panel nav bölümü /gorunum-ayarlari rotasına işaret etmiyor", () => {
    const allHrefs = [
      ...PANEL_MAIN_NAV,
      ...PANEL_FINANCE_NAV,
      ...PANEL_OPS_NAV,
      ...PANEL_AI_NAV,
      ...PANEL_SYSTEM_NAV,
    ].map((item) => item.href);
    expect(allHrefs).not.toContain("/gorunum-ayarlari");
  });
});

describe("changeOwnPassword — mode parity (json/memory'de kalıcı değil)", () => {
  it("STORE_MODE=json altında (bu test ortamı) MODE_NOT_SUPPORTED döner, sessizce başarılı görünmez", async () => {
    const res = await changeOwnPassword("user_admin", "demo-admin", "yeni-guclu-sifre-123");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("MODE_NOT_SUPPORTED");
  });
});
