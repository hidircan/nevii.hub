import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";

/**
 * Faz 2 güvenlik/kalite taraması — bir önceki geçişte elle yapılan "tüm
 * portallardaki rota taraması"nı kalıcı, otomatik bir kontrole dönüştürür.
 * Expo Router dosya tabanlı yönlendirmede iki sınıf hata sessizce (build
 * zamanı hatasız, ama çalışma zamanında belirsiz/yanlış davranışla) kırılır:
 *
 * 1) Aynı segment için HEM `foo.tsx` HEM `foo/index.tsx` — ikisi de aynı
 *    `/foo` rotasına çözülür, Expo Router hangisini kullanacağını
 *    garanti etmez (gözlemlenen kök neden: bir önceki geçişte
 *    `(teacher)/bugun.tsx` + `(teacher)/bugun/index.tsx` gibi çakışmalar).
 * 2) Bir `_layout.tsx` içinde aynı `name` ile iki `Tabs.Screen`/
 *    `Stack.Screen` — sekme çubuğunda/stack'te belirsiz/yinelenen sekme.
 *
 * Tam bir Expo Router AST ayrıştırıcısı KURULMAZ (ponytail — gereksiz
 * karmaşıklık); bir dosya sistemi taraması + hedefli regex yeterli.
 */

const APP_DIR = path.join(__dirname, "../../../app");

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

describe("Expo Router rota bütünlüğü (apps/mobile/app)", () => {
  it("hiçbir segment için hem `foo.tsx` hem `foo/index.tsx` birlikte var olmaz", async () => {
    const allFiles = await walk(APP_DIR);
    const collisions: string[] = [];

    for (const file of allFiles) {
      const base = path.basename(file, ".tsx");
      if (base === "_layout" || base === "index") continue;
      const dir = path.dirname(file);
      const siblingIndex = path.join(dir, base, "index.tsx");
      try {
        await fs.access(siblingIndex);
        collisions.push(`${path.relative(APP_DIR, file)}  <->  ${path.relative(APP_DIR, siblingIndex)}`);
      } catch {
        // no collision — expected path
      }
    }

    expect(collisions, `Çakışan rota segmentleri bulundu:\n${collisions.join("\n")}`).toEqual([]);
  });

  it("hiçbir `_layout.tsx` aynı `name` ile iki Tabs.Screen/Stack.Screen tanımlamaz", async () => {
    const allFiles = await walk(APP_DIR);
    const layoutFiles = allFiles.filter((f) => path.basename(f) === "_layout.tsx");
    expect(layoutFiles.length).toBeGreaterThan(0);

    const problems: string[] = [];
    const screenNamePattern = /<(?:Tabs|Stack)\.Screen\s+name="([^"]+)"/g;

    for (const file of layoutFiles) {
      const content = await fs.readFile(file, "utf-8");
      const names: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = screenNamePattern.exec(content)) !== null) {
        names.push(match[1]);
      }
      const seen = new Set<string>();
      const dupes = new Set<string>();
      for (const n of names) {
        if (seen.has(n)) dupes.add(n);
        seen.add(n);
      }
      if (dupes.size > 0) {
        problems.push(`${path.relative(APP_DIR, file)}: yinelenen name=[${[...dupes].join(", ")}]`);
      }
    }

    expect(problems, `Yinelenen Screen name'leri bulundu:\n${problems.join("\n")}`).toEqual([]);
  });
});
