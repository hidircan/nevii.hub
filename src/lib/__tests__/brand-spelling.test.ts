import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { BRAND } from "../brand";

const ROOT = path.resolve(import.meta.dirname, "../../..");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "__tests__") return [];
      return walk(full);
    }
    return /\.(tsx?|css)$/.test(e.name) ? [full] : [];
  });
}

/** Yorum satırları temizlenir — yasaklı kalıp açıklamada geçebilir. */
function codeOf(file: string): string {
  return readFileSync(file, "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

describe("NeviiHub marka yazımı standardı", () => {
  it("BRAND.name tam olarak 'NeviiHub'dır", () => {
    expect(BRAND.name).toBe("NeviiHub");
    expect(BRAND.shortName).toBe("NeviiHub");
    expect(BRAND.assistantName).toBe("NeviiHub AI");
  });

  it("Türkçe noktalı büyük İ içeren 'NEVİİHUB' yazımı hiçbir görünür kodda YOK (yorumlar hariç)", () => {
    const offenders: string[] = [];
    for (const file of walk(path.join(ROOT, "src"))) {
      if (codeOf(file).includes("NEVİİHUB")) offenders.push(path.relative(ROOT, file));
    }
    expect(offenders).toEqual([]);
  });

  it("marka metnini taşıyan görünür öğelerde `uppercase` YOK (kaynak doğru, dönüşüm yanlıştı)", () => {
    const brandFiles = [
      "src/components/sidebar.tsx",
      "src/app/login/page.tsx",
      "src/app/sifre-sifirla/page.tsx",
      "src/app/hesap-aktivasyon/page.tsx",
      "src/components/site/sections.tsx",
    ];
    for (const rel of brandFiles) {
      const code = codeOf(path.join(ROOT, rel));
      // BRAND.name/shortName render eden satırda uppercase sınıfı olmamalı.
      const lines = code.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]!.includes("BRAND.name") || lines[i]!.includes("BRAND.shortName")) {
          const window = lines.slice(Math.max(0, i - 4), i + 1).join("\n");
          expect(`${rel}:${i + 1} -> ${window}`).not.toMatch(/uppercase/);
        }
      }
    }
  });

  it("asistan görünen adı BRAND.assistantName'den gelir ('Nevii Hub AI' boşluklu yazım yok)", () => {
    for (const rel of ["src/components/ai/global-assistant.tsx", "src/components/ai/assistant-chat-body.tsx"]) {
      const code = codeOf(path.join(ROOT, rel));
      expect(code).not.toContain("Nevii Hub AI");
      expect(code).toContain("BRAND.assistantName");
    }
  });

  it("ana sayfa başlığında logo yanında marka metni vardır", () => {
    const code = codeOf(path.join(ROOT, "src/components/site/sections.tsx"));
    expect(code).toContain("BRAND.shortName");
  });
});
