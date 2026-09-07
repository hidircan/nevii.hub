import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import path from "path";

/**
 * P0 UAT REGRESYONU (2026-09-07) — giriş ekranında demo kimlik bilgisi.
 *
 * Önceki durum: `login-form.tsx` ("use client") içinde 14 hesabın e-postası
 * ve AÇIK METİN parolası bir dizide duruyor, "Demo ile giriş" düğmeleri
 * olarak render ediliyordu. Client component olduğu için bu parolalar
 * ekranda gizlense bile HER ZİYARETÇİYE giden JS paketinde yer alıyordu.
 * Ölçüm: dosyada 16 `password:` alanı → düzeltme sonrası 0; derlenmiş
 * `.next/static` içinde de iz yok.
 */
const ROOT = path.resolve(import.meta.dirname, "../../..");
const LOGIN = readFileSync(path.join(ROOT, "src/components/login-form.tsx"), "utf-8");
const LOGIN_CODE = LOGIN.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/** Bilinen demo parola kalıpları — istemciye giden hiçbir yerde bulunmamalı. */
const CREDENTIAL_PATTERNS = [/demo-admin/, /demo-teacher-csv/, /demo-parent/, /demo-student-csv/];

describe("Giriş ekranı — demo kimlik bilgisi sızdırmaz", () => {
  it("login formunda hiçbir parola sabiti yok", () => {
    expect(LOGIN_CODE).not.toMatch(/password:\s*"/);
    for (const re of CREDENTIAL_PATTERNS) expect(LOGIN_CODE).not.toMatch(re);
  });

  it("demo persona listesi ve hızlı giriş düğmeleri kaldırıldı", () => {
    expect(LOGIN_CODE).not.toContain("DEMO_PERSONAS");
    expect(LOGIN_CODE).not.toContain("onDemoSelect");
    expect(LOGIN_CODE).not.toContain("Demo ile giriş");
  });

  it("e-posta ve parola alanları ÖN DOLDURULMAZ", () => {
    expect(LOGIN_CODE).toMatch(/useState\(""\)/);
    expect(LOGIN_CODE).not.toMatch(/useState\("[^"]*@[^"]*"\)/);
  });

  it("derlenmiş istemci paketinde demo parola YOK (build varsa)", () => {
    const staticDir = path.join(ROOT, ".next/static");
    if (!existsSync(staticDir)) return; // build yoksa bu kontrol atlanır
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.(js|css)$/.test(e.name) && statSync(full).size < 8_000_000) files.push(full);
      }
    };
    walk(staticDir);
    const leaked = files.filter((f) => {
      const c = readFileSync(f, "utf-8");
      return CREDENTIAL_PATTERNS.some((re) => re.test(c));
    });
    expect(leaked.map((f) => path.relative(ROOT, f))).toEqual([]);
  });
});
