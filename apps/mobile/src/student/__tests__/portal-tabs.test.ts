/**
 * Öğrenci/veli panel sözleşmesi (statik).
 * Kural: Hesabım sekmede YOK (header'da zil sağındaki profil ikonundan),
 * Ödemeler görünür ana aksiyondur; sekme kökleri showAccount taşır.
 * Program ("dersler") ve Sözleşmelerim sekmede YOK — dersler ana sayfadaki
 * sıradaki ders / "Bu haftanın dersleri → Tümü"nden, sözleşmeler YALNIZ
 * Hesabım içinden açılır. Veli "Çocuğum" sekmesi görünür bağlam merkezidir.
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

  it.each(["(parent)", "(student)"])("%s: Program sekmede yok, route korunur", async (group) => {
    const layout = await fs.readFile(path.join(APP_DIR, group, "_layout.tsx"), "utf-8");
    expect(layout).toMatch(/<Tabs\.Screen name="dersler" options=\{\{ href: null \}\} \/>/);
    expect(layout).not.toMatch(/title: "Program"/);
    await fs.access(path.join(APP_DIR, group, "dersler", "index.tsx"));
    await fs.access(path.join(APP_DIR, group, "dersler", "[lessonId].tsx"));
  });

  it.each(["(parent)", "(student)"])("%s: Sözleşmeler sekmede yok, Hesabım kısayolu var", async (group) => {
    const layout = await fs.readFile(path.join(APP_DIR, group, "_layout.tsx"), "utf-8");
    expect(layout).toMatch(/<Tabs\.Screen name="sozlesmeler" options=\{\{ href: null \}\} \/>/);
    const account = await fs.readFile(path.join(APP_DIR, group, "hesabim", "index.tsx"), "utf-8");
    expect(account).toMatch(/Sözleşmelerim/);
  });

  it("(parent): Çocuğum sekmede görünür bağlam merkezidir", async () => {
    const layout = await fs.readFile(path.join(APP_DIR, "(parent)", "_layout.tsx"), "utf-8");
    expect(layout).toMatch(/name="cocugum"/);
    expect(layout).not.toMatch(/name="cocugum" options=\{\{ href: null \}\}/);
    expect(layout).toMatch(/title: "Çocuğum"/);
  });

  it("(parent): yoklama/degerlendirme push-only (sekmede yok)", async () => {
    const layout = await fs.readFile(path.join(APP_DIR, "(parent)", "_layout.tsx"), "utf-8");
    expect(layout).toMatch(/<Tabs\.Screen name="yoklama" options=\{\{ href: null \}\} \/>/);
    expect(layout).toMatch(/<Tabs\.Screen name="degerlendirme" options=\{\{ href: null \}\} \/>/);
  });

  it("veli/öğrenci sekme dili tutarlı (Ödevler)", async () => {
    for (const group of ["(parent)", "(student)"]) {
      const layout = await fs.readFile(path.join(APP_DIR, group, "_layout.tsx"), "utf-8");
      expect(layout).toMatch(/title: "Ödevler"/);
      expect(layout).not.toMatch(/title: "Ödevlerim"/);
    }
  });

  it("(admin): eski düz route'lar sekmede yok", async () => {
    const layout = await fs.readFile(path.join(APP_DIR, "(admin)", "_layout.tsx"), "utf-8");
    for (const name of ["dersler", "duyurular", "ogretmenler"]) {
      expect(layout).toMatch(new RegExp(`<Tabs\\.Screen name="${name}" options=\\{\\{ href: null \\}\\} \\/>`));
    }
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
