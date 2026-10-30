/**
 * 10. tur iş #3 — kurumsal anasayfa dürüstlük + SEO kilitleri.
 *
 * Pazarlama vaatleri (pazarlama/03) ile sitede yazanlar AYNI sınırda kalır:
 * uydurma referans/fiyat/istatistik, çıkmamış özellik, sahte mağaza linki ve
 * "satın al" dili YASAKTIR. SEO temeli (başlık uzunluğu, tek H1, JSON-LD,
 * robots/sitemap/OG) statik olarak kilitlenir.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";
import {
  SITE_CONTACT,
  SITE_FAQ,
  SITE_FEATURES,
  SITE_HERO,
  SITE_MEDIA,
  SITE_PRICING_PLANS,
  SITE_REFERENCES,
  SITE_STEPS,
} from "../site-content";
import { BRAND } from "../brand";
import { trContent } from "../site-locales/tr";
import { enContent } from "../site-locales/en";
import { deContent } from "../site-locales/de";
import { frContent } from "../site-locales/fr";
import { esContent } from "../site-locales/es";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const page = readFileSync(path.join(ROOT, "src/app/page.tsx"), "utf-8");
const sections = readFileSync(path.join(ROOT, "src/components/site/sections.tsx"), "utf-8");

describe("dürüstlük — uydurma veri yok", () => {
  it("referans ve fiyat dizileri BOŞ (gerçek veri eklenene kadar kart basılmaz)", () => {
    expect(SITE_REFERENCES).toEqual([]);
    expect(SITE_PRICING_PLANS).toEqual([]);
  });

  it("medya dizisi BOŞ — doğrulanmamış ekran görüntüsü yayınlanmaz", () => {
    expect(SITE_MEDIA).toEqual([]);
  });

  it("'satın al' dili yok — huni 'demo iste' dilindedir", () => {
    expect(`${page}\n${sections}`).not.toMatch(/satın al/i);
    expect(SITE_HERO.primaryCta.label).toContain("Demo");
  });

  it("sabit kodlanmış mağaza bağlantısı yok (butonlar yapılandırılmış URL koşullu)", () => {
    // Mağaza butonları/bant bileşeni koşullu render edilir (URL yoksa gizli/"yakında");
    // kaynakta kullanılabilir gerçek bir App Store/Play bağlantısı sabit yazılamaz.
    expect(`${page}\n${sections}`).not.toMatch(/apps\.apple\.com\/|play\.google\.com\/store/i);
  });

  it("'otomatik gönderir' vaadi yok — mesajlar her zaman onaylıdır", () => {
    expect(`${page}\n${sections}`).not.toMatch(/otomatik gönder/i);
  });

  it("iletişim e-postası doğrulanmış gönderici adresidir", () => {
    expect(SITE_CONTACT.email).toBe("info@neviihub.com");
  });
});

describe("SEO temeli", () => {
  it("başlık ≤60 karakter ve marka + kategori içerir (5 dil)", () => {
    // Başlık locale sözlüğünden gelir (generateMetadata); her dilde kilitlenir.
    expect(page).toContain("c.meta.title");
    for (const c of [trContent, enContent, deContent, frContent, esContent]) {
      expect(c.meta.title.length).toBeLessThanOrEqual(60);
      expect(c.meta.title).toContain("NeviiHub");
    }
  });

  it("tek H1 (hero) + JSON-LD (SoftwareApplication + FAQPage)", () => {
    expect(sections.match(/<h1/g)?.length).toBe(1);
    expect(page).toContain("SoftwareApplication");
    expect(page).toContain("FAQPage");
    expect(page).toContain("application/ld+json");
  });

  it("SSS içeriği JSON-LD ile aynı kaynaktan beslenir (ayrışma imkânsız)", () => {
    expect(page).toContain("c.faqItems.map");
    expect(page).toContain("<FaqSection c={c} />");
    expect(SITE_FAQ.length).toBeGreaterThan(0);
  });

  it("robots + sitemap + OG görseli dosyaları mevcut", () => {
    expect(existsSync(path.join(ROOT, "src/app/robots.ts"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src/app/sitemap.ts"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src/app/opengraph-image.tsx"))).toBe(true);
    expect(BRAND.ogImagePath).toBe("/opengraph-image");
  });
});

describe("içerik yapısı", () => {
  it("6 özellik kartı + 3 adım + SSS'de demo/CSV soruları", () => {
    expect(SITE_FEATURES).toHaveLength(6);
    expect(SITE_STEPS).toHaveLength(3);
    expect(SITE_FAQ.some((f) => f.question.toLowerCase().includes("demo"))).toBe(true);
    expect(SITE_FAQ.some((f) => f.question.toLowerCase().includes("csv") || f.answer.includes("CSV"))).toBe(true);
  });

  it("bölüm sırası: hero → adımlar → özellikler → portallar → SSS → iletişim", () => {
    // Varsayılan sıra `views` haritasındadır; karşılama hep ilk bölümdür (NeviiOS sırası diğerlerini değiştirir).
    expect(page.indexOf("<SiteHeader")).toBeLessThan(page.indexOf("<HeroSection"));
    expect(page.indexOf("<HeroSection")).toBeLessThan(page.indexOf("sections.map"));
    const order = [
      "<AboutSection",
      "<StepsSection",
      "<FeaturesSection",
      "<PlatformSection",
      "<ReferencesSection",
      "<PricingSection",
      "<MediaSection",
      "<FaqSection",
      "<ContactSection",
    ];
    const positions = order.map((tag) => page.indexOf(tag));
    expect(positions.every((p) => p > -1)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});

describe("canlı CSS kilitleri (2026-10-30 bayat derleme olayı)", () => {
  it("derleme önbelleği kapalı ve derleme sonrası CSS kapısı bağlı", () => {
    expect(readFileSync(path.join(ROOT, "next.config.ts"), "utf-8")).toContain("turbopackFileSystemCacheForBuild: false");
    const scripts = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf-8")).scripts;
    expect(scripts.postbuild).toBe("node scripts/check-built-css.mjs");
  });

  it("koyu iletişim başlığının rengi stil dosyasına bağlı değil; sahneler üst üste binemez", () => {
    expect(sections).toContain('"--text-primary": "#ffffff"');
    expect(page).toContain('"--text-primary": "#0f172a"');
    const css = readFileSync(path.join(ROOT, "src/app/globals.css"), "utf-8");
    expect(css).toContain(".nh-cycle { opacity: 0; visibility: hidden; }");
    expect(css).toContain(".nh-cycle:first-child { opacity: 1; visibility: visible; }");
  });
});
