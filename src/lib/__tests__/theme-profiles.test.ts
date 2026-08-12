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

  it("geçerli dört font seçeneğini aynen korur", () => {
    for (const f of FONT_VALUES) {
      expect(normalizeFontChoice(f)).toBe(f);
    }
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

  it("FONT_VALUES tam olarak dört fontu içerir", () => {
    expect(FONT_VALUES).toEqual(["roboto_serif", "playfair_display", "inter", "noto_sans"]);
  });

  it("cookie isimleri kurum/oturum cookie'leriyle çakışmaz (teknik identifier — marka geçişinden bağımsız)", () => {
    expect(THEME_PROFILE_COOKIE).toBe("notaplan_theme_profile");
    expect(FONT_COOKIE).toBe("notaplan_font");
  });

  it("varsayılanlar Kurumsal Altın + Inter'dir", () => {
    expect(DEFAULT_THEME_PROFILE).toBe("gold");
    expect(DEFAULT_FONT_CHOICE).toBe("inter");
  });

  it("dört font seçeneğinin hepsi FARKLI değerlerdir (aynı fonta düşmüyor)", () => {
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

  it("dört fontun tamamı için etiket tanımlıdır ve birbirinden farklıdır", () => {
    const labels = FONT_VALUES.map((f) => FONT_LABELS[f]);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("Görünüm tercihi kurum/yetki kararlarından bağımsızdır", () => {
  it("normalizeThemeProfile/normalizeFontChoice hiçbir rol, tenant veya oturum parametresi almaz", () => {
    expect(normalizeThemeProfile.length).toBe(1);
    expect(normalizeFontChoice.length).toBe(1);
  });
});
