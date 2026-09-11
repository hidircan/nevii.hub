import { describe, it, expect } from "vitest";
import {
  normalizeThemeProfile,
  normalizeFontChoice,
  THEME_PROFILE_VALUES,
  FONT_VALUES,
  THEME_PROFILE_COOKIE,
  FONT_COOKIE,
  DEFAULT_THEME_PROFILE,
  DEFAULT_FONT_CHOICE,
  THEME_PROFILE_LABELS,
  FONT_LABELS,
  normalizePortalPresentation,
  PORTAL_PRESENTATION_COOKIE,
  DEFAULT_PORTAL_PRESENTATION,
} from "../theme";

describe("normalizeThemeProfile — varsayılan Kurumsal Altın", () => {
  it("cookie yoksa/geçersizse 'gold'a düşer, asla hata fırlatmaz", () => {
    expect(normalizeThemeProfile(undefined)).toBe("gold");
    expect(normalizeThemeProfile(null)).toBe("gold");
    expect(normalizeThemeProfile("")).toBe("gold");
    expect(normalizeThemeProfile("neon-purple")).toBe("gold");
  });

  it("geçerli yedi profili aynen korur", () => {
    for (const p of THEME_PROFILE_VALUES) {
      expect(normalizeThemeProfile(p)).toBe(p);
    }
  });
});

describe("normalizeFontChoice — varsayılan Inter", () => {
  it("cookie yoksa/geçersizse 'inter'e düşer", () => {
    expect(normalizeFontChoice(undefined)).toBe("inter");
    expect(normalizeFontChoice("comic-sans")).toBe("inter");
  });

  it("geçerli beş font seçeneğini aynen korur (P1 revizyonu: gloock geri getirildi)", () => {
    for (const f of FONT_VALUES) {
      expect(normalizeFontChoice(f)).toBe(f);
    }
    expect(normalizeFontChoice("gloock")).toBe("gloock");
  });
});

describe("Sabitler", () => {
  it("THEME_PROFILE_VALUES tam olarak dokuz profili içerir", () => {
    expect(THEME_PROFILE_VALUES).toEqual([
      "gold",
      "obsidian",
      "navy",
      "forest",
      "burgundy",
      "ocean",
      "lavender",
      "atolye",
      "murekkep",
    ]);
  });

  it("FONT_VALUES tam olarak beş fontu içerir (P1 revizyonu: gloock genel seçenek)", () => {
    expect(FONT_VALUES).toEqual(["roboto_serif", "playfair_display", "inter", "noto_sans", "gloock"]);
  });

  it("cookie isimleri kurum/oturum cookie'leriyle çakışmaz (teknik identifier — marka geçişinden bağımsız)", () => {
    expect(THEME_PROFILE_COOKIE).toBe("notaplan_theme_profile");
    expect(FONT_COOKIE).toBe("notaplan_font");
  });

  it("varsayılanlar Kurumsal Altın + Inter'dir", () => {
    expect(DEFAULT_THEME_PROFILE).toBe("gold");
    expect(DEFAULT_FONT_CHOICE).toBe("inter");
  });

  it("beş font seçeneğinin hepsi FARKLI değerlerdir (aynı fonta düşmüyor)", () => {
    expect(new Set(FONT_VALUES).size).toBe(FONT_VALUES.length);
  });

  it("yedi tema profilinin hepsi FARKLI değerlerdir", () => {
    expect(new Set(THEME_PROFILE_VALUES).size).toBe(THEME_PROFILE_VALUES.length);
  });
});

describe("Gold + Obsidian — kritik profil sözleşmesi (bu sprint)", () => {
  it("gold ve obsidian THEME_PROFILE_LABELS'ta doğru Türkçe etiketle eşleşir", () => {
    expect(THEME_PROFILE_LABELS.gold).toBe("Kurumsal Altın");
    expect(THEME_PROFILE_LABELS.obsidian).toBe("Gece Obsidyen");
  });

  it("obsidian geçerli bir tema profili olarak normalize edilir (fallback'e düşmez)", () => {
    expect(normalizeThemeProfile("obsidian")).toBe("obsidian");
  });

  it("yedi temanın tamamı için etiket tanımlıdır (eksik/undefined yok)", () => {
    for (const profile of THEME_PROFILE_VALUES) {
      expect(typeof THEME_PROFILE_LABELS[profile]).toBe("string");
      expect(THEME_PROFILE_LABELS[profile].length).toBeGreaterThan(0);
    }
  });

  it("beş fontun tamamı için etiket tanımlıdır ve birbirinden farklıdır", () => {
    const labels = FONT_VALUES.map((f) => FONT_LABELS[f]);
    expect(new Set(labels).size).toBe(labels.length);
    expect(FONT_LABELS.gloock).toBe("Gloock");
  });
});

describe("Görünüm tercihi kurum/yetki kararlarından bağımsızdır", () => {
  it("normalizeThemeProfile/normalizeFontChoice hiçbir rol, tenant veya oturum parametresi almaz", () => {
    expect(normalizeThemeProfile.length).toBe(1);
    expect(normalizeFontChoice.length).toBe(1);
  });
});

describe("PortalPresentation (İş 3 — Glass 3D Mobile)", () => {
  it("cookie yoksa/geçersizse 'standard'a düşer, asla hata fırlatmaz", () => {
    expect(normalizePortalPresentation(undefined)).toBe("standard");
    expect(normalizePortalPresentation(null)).toBe("standard");
    expect(normalizePortalPresentation("neon-purple")).toBe("standard");
  });

  it("'glass' geçerli bir değer olarak aynen korunur", () => {
    expect(normalizePortalPresentation("glass")).toBe("glass");
  });

  it("varsayılan 'standard'dır ve ThemeProfile cookie'sinden AYRI bir cookie adı kullanır", () => {
    expect(DEFAULT_PORTAL_PRESENTATION).toBe("standard");
    expect(PORTAL_PRESENTATION_COOKIE).toBe("notaplan_portal_presentation");
    expect(PORTAL_PRESENTATION_COOKIE).not.toBe(THEME_PROFILE_COOKIE);
  });
});
