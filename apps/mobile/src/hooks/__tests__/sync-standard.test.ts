/**
 * Web-mobil veri senkron standardı sözleşmesi (statik).
 *
 * Kural: liste/ana ekranlar focus + foreground'da yeniden doğrular, kritik
 * ekranlar pull-to-refresh ile tüm kaynakları yeniler. `useApiGet` kalıcı
 * cache tutmaz (bellek-içi istek state'i); yetki her istekte sunucudadır.
 */
import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const APP_DIR = path.join(__dirname, "..", "..", "..", "app");
const SRC_DIR = path.join(__dirname, "..", "..");

async function read(p: string): Promise<string> {
  return fs.readFile(p, "utf-8");
}

describe("senkron standardı", () => {
  it("useApiGet kalıcı cache tutmaz (offline sonsuz stale yok)", async () => {
    const content = await read(path.join(SRC_DIR, "hooks", "use-api.ts"));
    expect(content).not.toMatch(/AsyncStorage|SecureStore|persist|staleTime|cacheTime/i);
  });

  it("ana ekranlar focus + foreground tazeler", async () => {
    const srcFiles = [
      "features/student-scope/home-screen.tsx",
      "features/parent/child-screen.tsx",
      "features/parent/attendance-screen.tsx",
      "features/student-scope/homework-screen.tsx",
      "features/student-scope/payments-screen.tsx",
    ];
    for (const rel of srcFiles) {
      const content = await read(path.join(SRC_DIR, rel));
      expect(content, rel).toMatch(/useFocusRefetch|refreshAll/);
      expect(content, rel).toMatch(/useAppForegroundRefetch/);
    }
    const appFile = "app/(teacher)/bugun/index.tsx";
    const appContent = await read(path.join(SRC_DIR, "..", appFile));
    expect(appContent, appFile).toMatch(/useFocusRefetch|refreshAll/);
    expect(appContent, appFile).toMatch(/useAppForegroundRefetch/);
  });

  it("öğretmen listeleri focus + foreground tazeler", async () => {
    for (const file of ["ogrencilerim/index.tsx", "odevler/index.tsx"]) {
      const content = await read(path.join(APP_DIR, "(teacher)", file));
      expect(content, file).toMatch(/useFocusRefetch/);
      expect(content, file).toMatch(/useAppForegroundRefetch/);
    }
  });

  it("öğrenci ana ekranı pull-to-refresh ile TÜM kaynakları yeniler", async () => {
    const content = await read(path.join(SRC_DIR, "features", "student-scope", "home-screen.tsx"));
    for (const hook of ["schedule", "profile", "homework", "attendance", "assessments", "notifications", "makeup", "balance"]) {
      expect(content, hook).toMatch(new RegExp(`${hook}\\.refresh\\(\\)`));
    }
  });
});
