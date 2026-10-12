/**
 * Geri-navigasyon sözleşmesi (statik).
 * Kural: geri butonu merkezi `goBack` kullanır (canGoBack → back, yoksa
 * güvenli fallback); detay ekranları deep-link fallback'i verir; ana
 * sayfalar/sekme kökleri geri butonu taşımaz (yanlışlıkla kapatma yok).
 */
import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const SRC = path.join(__dirname, "..", "..");

describe("geri-navigasyon sözleşmesi", () => {
  it("AppHeader merkezi goBack kullanır", async () => {
    const content = await fs.readFile(path.join(SRC, "components", "ui", "app-header.tsx"), "utf-8");
    expect(content).toMatch(/goBack\(router, backFallback\)/);
    expect(content).not.toMatch(/onPress=\{\(\) => router\.back\(\)\}/);
  });

  it("öğrenci/veli detay ekranları liste fallback'i verir", async () => {
    const cases: Array<[string, string]> = [
      ["lessons-screen.tsx", 'listFallback(base, "dersler")'],
      ["homework-screen.tsx", 'listFallback(base, "odevler")'],
      ["payments-screen.tsx", 'listFallback(base, "odemeler")'],
      ["contracts-screen.tsx", 'listFallback(base, "sozlesmeler")'],
      ["materials-screen.tsx", 'listFallback(base, "gelisim")'],
    ];
    for (const [file, fallback] of cases) {
      const content = await fs.readFile(path.join(SRC, "features", "student-scope", file), "utf-8");
      expect(content, file).toContain(fallback);
    }
    const makeup = await fs.readFile(path.join(SRC, "features", "student-scope", "makeup-screen.tsx"), "utf-8");
    expect(makeup).toContain("backFallback={`${basePath}/telafiler`}");
  });

  it("sekme köklerinde geri butonu yok", async () => {
    for (const file of ["home-screen.tsx", "gelisim-screen.tsx", "lessons-screen.tsx"]) {
      const content = await fs.readFile(path.join(SRC, "features", "student-scope", file), "utf-8");
      // Liste/kök AppHeader'ları: showBack yalnızca Detay fonksiyonlarında.
      const listPart = content.split("DetailScreen")[0] ?? "";
      expect(listPart, file).not.toMatch(/showBack/);
    }
  });
});
