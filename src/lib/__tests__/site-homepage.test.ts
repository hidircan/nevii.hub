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
    expect(page).toContain("SITE_FAQ");
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
    const order = [
      "<HeroSection",
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
