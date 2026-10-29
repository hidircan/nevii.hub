/**
 * Tema + yazı boyutu kalıcılığı sözleşmesi (statik).
 *
 * Kural: kullanıcı seçimi SecureStore'da saklanır ve açılışta geri yüklenir;
 * geçersiz/eski değerler varsayılana düşer, uygulama çökmez. Tema varsayılanı
 * AÇIK; yazı boyutu varsayılanı `normal` (ölçek 1).
 */
import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { FONT_SCALE, buildTheme } from "../tokens";

const CONTEXT = path.join(__dirname, "..", "theme-context.tsx");

describe("tema tercihi kalıcılığı", () => {
  it("SecureStore anahtarları sabittir ve açılışta okunur", async () => {
    const content = await fs.readFile(CONTEXT, "utf-8");
    expect(content).toContain('const PREFERENCE_KEY = "neviihub_theme_preference"');
    expect(content).toContain('const FONT_SIZE_KEY = "neviihub_font_size_preference"');
    expect(content).toMatch(/SecureStore\.getItemAsync\(PREFERENCE_KEY\)/);
    expect(content).toMatch(/SecureStore\.getItemAsync\(FONT_SIZE_KEY\)/);
  });

  it("seçim değiştiğinde yeni değer yazılır (tema + yazı boyutu)", async () => {
    const content = await fs.readFile(CONTEXT, "utf-8");
    expect(content).toMatch(/SecureStore\.setItemAsync\(PREFERENCE_KEY, pref\)/);
    expect(content).toMatch(/SecureStore\.setItemAsync\(FONT_SIZE_KEY, size\)/);
  });

  it("geçersiz saklanmış değer sessizce varsayılana düşer (tip kapısı)", async () => {
    const content = await fs.readFile(CONTEXT, "utf-8");
    expect(content).toMatch(/value === "light" \|\| value === "dark" \|\| value === "system"/);
    expect(content).toMatch(/value === "normal" \|\| value === "large" \|\| value === "xlarge"/);
    expect(content).toMatch(/useState<ThemePreference>\("light"\)/);
    expect(content).toMatch(/useState<FontScalePreference>\("normal"\)/);
  });

  it("eski marka anahtarı okunur ve yeni anahtara taşınır (seçim kaybı yok)", async () => {
    const content = await fs.readFile(CONTEXT, "utf-8");
    expect(content).toContain('const LEGACY_PREFERENCE_KEY = "notaplan_theme_preference"');
    expect(content).toMatch(/isThemePreference\(legacyTheme\)/);
    expect(content).toMatch(/SecureStore\.setItemAsync\(PREFERENCE_KEY, themeValue\)/);
  });

  it("yazı boyutu ölçeği temaya uygulanır; kullanıcıya açık seçenekler üç tanedir", () => {
    expect(FONT_SCALE).toEqual({ normal: 1, large: 1.15, xlarge: 1.3 });
    expect(buildTheme("light", FONT_SCALE.normal).typography.body.fontSize).toBe(16);
    expect(buildTheme("light", FONT_SCALE.large).typography.body.fontSize).toBeCloseTo(18.4, 1);
    expect(buildTheme("dark", FONT_SCALE.xlarge).typography.body.fontSize).toBeCloseTo(20.8, 1);
  });
});
