import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { PORTAL_RECORD_MISSING_PARAM, PORTAL_RECORD_MISSING_REDIRECT } from "../auth/portal-record-missing";

/**
 * P0 (2026-09-05) — GERÇEK TARAYICIDA GÖZLENEN YÖNLENDİRME DÖNGÜSÜ.
 * Bir portal sayfası (ör. /ogrenci) oturuma bağlı kaydı bulamayınca
 * `redirect("/login")` yapıyordu; /login geçerli oturumu görüp kullanıcıyı
 * AYNI portala geri gönderiyordu → sonsuz döngü. Bu test, hiçbir portal
 * sayfasının bu ÇIPLAK yönlendirmeye geri dönmemesini korur.
 */
const PORTAL_DIRS = ["src/app/ogrenci", "src/app/ogretmen", "src/app/veli"];

async function collectPageFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collectPageFiles(full)));
    else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("portal yönlendirme döngüsü koruması", () => {
  it("hedef, /login'e döngü kırıcı işaretle gider", () => {
    expect(PORTAL_RECORD_MISSING_REDIRECT).toBe(`/login?${PORTAL_RECORD_MISSING_PARAM}=1`);
  });

  it("hiçbir portal sayfası ÇIPLAK redirect(\"/login\") kullanmaz", async () => {
    const offenders: string[] = [];
    for (const dir of PORTAL_DIRS) {
      for (const file of await collectPageFiles(path.join(process.cwd(), dir))) {
        const source = await fs.readFile(file, "utf8");
        if (source.includes('redirect("/login")')) offenders.push(path.relative(process.cwd(), file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
