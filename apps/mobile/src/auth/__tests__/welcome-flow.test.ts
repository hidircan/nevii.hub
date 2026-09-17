/**
 * Karşılama → giriş → geri dönüş akış sözleşmesi (statik route denetimi).
 * Kök neden: ilk açılışta doğrudan login'e düşme + geri dönüşsüzlük.
 * Sözleşme: oturumsuz ilk durak /welcome; login'den replace ile /welcome'a
 * dönüş; giriş sonrası index persona evine gider (signedIn login/welcome
 * göstermez).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

const APP_DIR = path.join(__dirname, "..", "..", "..", "app");

async function readRoute(...segments: string[]): Promise<string> {
  return fs.readFile(path.join(APP_DIR, ...segments), "utf-8");
}

describe("welcome/login akış sözleşmesi", () => {
  it("index: oturumsuz kullanıcı /welcome'a yönlenir (doğrudan /login YOK)", async () => {
    const content = await readRoute("index.tsx");
    expect(content).toMatch(/href="\/welcome"/);
    expect(content).not.toMatch(/href="\/login"/);
  });

  it("welcome: birincil CTA 'Giriş yap' → /login; oturumlu kullanıcı persona evine gider", async () => {
    const content = await readRoute("welcome.tsx");
    expect(content).toContain("Giriş yap");
    expect(content).toMatch(/router\.push\("\/login"\)/);
    expect(content).toMatch(/href="\/"/);
  });

  it("login: girişsiz karşılamaya dönüş var; girişli kullanıcı login'i görmez", async () => {
    const content = await readRoute("login.tsx");
    expect(content).toMatch(/\/welcome/);
    expect(content).toMatch(/href="\/"/);
  });

  it("kök layout welcome route'unu tanır", async () => {
    const content = await readRoute("_layout.tsx");
    expect(content).toMatch(/name="welcome"/);
  });
});
