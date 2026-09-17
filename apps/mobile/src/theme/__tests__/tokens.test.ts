/**
 * Tema sözleşmesi regresyon testi — kök neden: eski/paralel bir `colors`/
 * `colorsDark` düz obje API'si (bkz. list-screen.tsx/logout-row.tsx/
 * placeholder-screen.tsx/screen-states.tsx, artık `useTheme()`'e taşındı)
 * `tokens.ts`'te HİÇ EXPORT edilmiyordu — `undefined.surface` erişimi
 * "Cannot read property 'surface' of undefined" ile çöküyordu. Bu test TEK
 * gerçek kaynağın (`lightTheme`/`darkTheme`) her zaman tüm renk anahtarlarını
 * TANIMLI döndürdüğünü doğrular; ekran bileşenleri artık ikinci bir tema
 * objesi İCAT ETMEDEN doğrudan bunu tüketir (bkz. theme-context.tsx useTheme).
 */
import { describe, it, expect } from "vitest";
import { lightTheme, darkTheme, type ThemeColors } from "../tokens";

const REQUIRED_COLOR_KEYS: (keyof ThemeColors)[] = [
  "primary",
  "primaryStrong",
  "primarySoft",
  "primaryOn",
  "success",
  "successSoft",
  "warning",
  "warningSoft",
  "danger",
  "dangerSoft",
  "info",
  "infoSoft",
  "bg",
  "bgMuted",
  "bgRaised",
  "border",
  "borderStrong",
  "divider",
  "text",
  "textMuted",
  "textFaint",
  "textInverse",
  "overlay",
];

describe("tek tema sözleşmesi — lightTheme/darkTheme", () => {
  it.each([
    ["lightTheme", lightTheme],
    ["darkTheme", darkTheme],
  ])("%s tüm renk anahtarlarını tanımlı (string) döndürür — undefined YOK", (_name, theme) => {
    for (const key of REQUIRED_COLOR_KEYS) {
      expect(typeof theme.colors[key]).toBe("string");
      expect(theme.colors[key].length).toBeGreaterThan(0);
    }
  });

  it("mode alanı doğru ayarlı", () => {
    expect(lightTheme.mode).toBe("light");
    expect(darkTheme.mode).toBe("dark");
  });

  it("açık/koyu tema gerçekten farklı renkler kullanır (davranış korunuyor)", () => {
    expect(lightTheme.colors.bg).not.toBe(darkTheme.colors.bg);
    expect(lightTheme.colors.text).not.toBe(darkTheme.colors.text);
    expect(lightTheme.colors.primary).not.toBe(darkTheme.colors.primary);
  });

  it("eski düz obje API'si (`colors`/`colorsDark`) artık export edilmiyor — tek sözleşme lightTheme/darkTheme", async () => {
    const mod = await import("../tokens");
    expect((mod as Record<string, unknown>).colors).toBeUndefined();
    expect((mod as Record<string, unknown>).colorsDark).toBeUndefined();
  });

  it("font sözleşmesi — display (Gloock) yalnız başlıklarda, gövde sistem sans'ı", async () => {
    const mod = await import("../tokens");
    expect(typeof mod.fonts.display).toBe("string");
    expect(mod.fonts.display.length).toBeGreaterThan(0);
    expect(mod.lightTheme.typography.display.fontFamily).toBe(mod.fonts.display);
    expect(mod.darkTheme.typography.display.fontFamily).toBe(mod.fonts.display);
    // Gloock tek kesit (400) — kalınlaştırma yok.
    expect(mod.lightTheme.typography.display.fontWeight).toBe("400");
    // Gövde/card/caption sistem sans'ında kalır — her metin display olmaz.
    expect((mod.lightTheme.typography.body as { fontFamily?: string }).fontFamily).toBeUndefined();
    expect((mod.lightTheme.typography.cardTitle as { fontFamily?: string }).fontFamily).toBeUndefined();
  });
});
