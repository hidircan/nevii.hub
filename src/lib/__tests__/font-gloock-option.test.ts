import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { FONT_LABELS, FONT_VALUES, normalizeFontChoice } from "../theme";

const ROOT = path.resolve(import.meta.dirname, "../../..");

describe("Gloock genel font seçeneği — yükleme → normalize → cookie → CSS zinciri", () => {
  it("normalize 'gloock'u korur (inter'e düşürmez)", () => {
    expect(normalizeFontChoice("gloock")).toBe("gloock");
  });

  it("FONT_VALUES gloock'u içerir, etiket tanımlıdır", () => {
    expect(FONT_VALUES).toContain("gloock");
    expect(FONT_LABELS.gloock).toBe("Gloock");
  });

  it("layout Gloock'u next/font ile yükler ve html'e değişkeni yazar", () => {
    const layout = readFileSync(path.join(ROOT, "src/app/layout.tsx"), "utf-8");
    expect(layout).toContain("Gloock");
    expect(layout).toContain("--font-gloock");
    expect(layout).toContain("gloock.variable");
  });

  it("globals.css'te [data-font='gloock'] eşlemesi vardır", () => {
    const css = readFileSync(path.join(ROOT, "src/app/globals.css"), "utf-8");
    expect(css).toMatch(/:root\[data-font="gloock"\]/);
    expect(css).toMatch(/\[data-font="gloock"\][\s\S]{0,300}--font-gloock/);
  });

  it("görünüm ayarları önizlemesi gloock'u tanır", () => {
    const form = readFileSync(path.join(ROOT, "src/components/theme-preferences-form.tsx"), "utf-8");
    expect(form).toContain("gloock:");
  });

  it("mevcut seçenekler (inter/noto_sans/playfair/roboto) bozulmadı", () => {
    for (const f of ["inter", "noto_sans", "playfair_display", "roboto_serif"] as const) {
      expect(normalizeFontChoice(f)).toBe(f);
    }
    expect(normalizeFontChoice(undefined)).toBe("inter");
  });
});
