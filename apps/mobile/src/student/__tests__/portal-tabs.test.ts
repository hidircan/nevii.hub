/**
 * Öğrenci/veli panel sözleşmesi (statik).
 * Kural: Hesabım sekmede YOK (header'da zil sağındaki profil ikonundan),
 * Ödemeler görünür ana aksiyondur; sekme kökleri showAccount taşır.
 */
import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const APP_DIR = path.join(__dirname, "..", "..", "..", "app");

describe("öğrenci/veli panel sözleşmesi", () => {
  it.each(["(parent)", "(student)"])("%s: Ödemeler sekmede, Hesabım gizli", async (group) => {
    const layout = await fs.readFile(path.join(APP_DIR, group, "_layout.tsx"), "utf-8");
    expect(layout).toMatch(/name="odemeler"/);
    expect(layout).not.toMatch(/name="odemeler" options=\{\{ href: null \}\}/);
    expect(layout).toMatch(/<Tabs\.Screen name="hesabim" options=\{\{ href: null \}\} \/>/);
    expect(layout).not.toMatch(/title: "Hesabım"/);
  });

  it("sekme kökleri hesap ikonunu zil sağında gösterir (showAccount)", async () => {
    const roots = [
      "src/features/student-scope/home-screen.tsx",
      "src/features/student-scope/lessons-screen.tsx",
      "src/features/student-scope/homework-screen.tsx",
      "src/features/student-scope/payments-screen.tsx",
      "src/features/student-scope/gelisim-screen.tsx",
    ];
    for (const rel of roots) {
      const content = await fs.readFile(path.join(APP_DIR, "..", rel), "utf-8");
      expect(content, rel).toMatch(/showAccount=\{`\$\{basePath\}\/hesabim`\}/);
    }
  });
});
