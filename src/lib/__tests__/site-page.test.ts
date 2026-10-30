import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import type { AppRole } from "../auth/types";
import { DEFAULT_TENANT_ID, PLATFORM_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { resetPlatformStoreForTests } from "../platform/store";
import { safeSiteHref, resolveSitePage, setSitePage, getSitePageSettings } from "../platform/site-page";
import { getSiteContent } from "../site-locales";

const ROOT = process.cwd();
const ctx = (role: AppRole): ServiceContext => ({ role, userId: "u1", tenantId: role === "HYPER_ADMIN" ? PLATFORM_TENANT_ID : DEFAULT_TENANT_ID, channel: "web", requestId: "req_site" });
const hyper = () => ctx("HYPER_ADMIN");

beforeEach(async () => {
  await resetPlatformStoreForTests();
});

describe("Referanslar görünürlüğü", () => {
  it("hiç kayıt yokken kapalı başlar; bölüm ve menü bağlantısı birlikte yok", async () => {
    for (const locale of ["tr", "en", "de", "fr", "es"] as const) {
      const { c, sections } = await resolveSitePage(locale);
      expect(sections).not.toContain("references");
      expect(c.nav.some((n) => n.href === "#referanslar")).toBe(false);
    }
  });

  it("açılınca bölüm ve menü geri gelir, başka ayar kaydı kapalılığı bozmaz", async () => {
    await setSitePage(hyper(), { links: { heroTrial: "/deneme" } });
    expect((await resolveSitePage("tr")).sections).not.toContain("references");
    const settings = await getSitePageSettings();
    await setSitePage(hyper(), { layout: { order: settings.order, hidden: [] } });
    const { c, sections } = await resolveSitePage("tr");
    expect(sections).toContain("references");
    expect(c.nav.some((n) => n.href === "#referanslar")).toBe(true);
  });

  it("referans verisi kapatınca silinmez", async () => {
    const rows = [{ name: "Örnek Kurum", sector: "Müzik" }];
    await setSitePage(hyper(), { list: { locale: "tr", key: "referenceItems", rows } });
    expect((await resolveSitePage("tr")).c.referenceItems).toEqual(rows);
    // Çevirisi girilmeyen dilde Türkçesine düşer.
    expect((await resolveSitePage("en")).c.referenceItems).toEqual(rows);
  });
});

describe("bölüm yönetimi", () => {
  it("sıra yayına yansır; kapalı bölüme giden düğme de gizlenir", async () => {
    const { order } = await getSitePageSettings();
    const faqFirst = ["faq", ...order.filter((id) => id !== "faq")];
    await setSitePage(hyper(), { layout: { order: faqFirst, hidden: ["references", "contact", "platform"] } });
    const { c, sections } = await resolveSitePage("tr");
    expect(sections[0]).toBe("faq");
    expect(sections).not.toContain("contact");
    expect(c.links.headerDemo).toBeNull();
    expect(c.links.pricingPlaceholder).toBeNull();
    expect(c.links.heroTour).toBeNull();
    expect(c.nav.some((n) => n.href === "#iletisim")).toBe(false);
  });

  it("fiyatlandırma kapatılamaz: satın alma ekranları oraya döner", async () => {
    const { order } = await getSitePageSettings();
    const res = await setSitePage(hyper(), { layout: { order, hidden: ["pricing"] } });
    expect(res.ok).toBe(false);
    expect((await resolveSitePage("tr")).sections).toContain("pricing");
  });
});

describe("içerik ve bağlantı güvenliği", () => {
  it("güvensiz hedefler reddedilir", () => {
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,x", "//evil.example", "http://evil.example", "/\\evil.example", "#yok", "vbscript:x", " java\nscript:x"]) {
      expect(safeSiteHref(bad), bad).toBeNull();
    }
    for (const good of ["#iletisim", "/deneme", "https://neviihub.com/x", "mailto:info@neviihub.com", "tel:+902320000000"]) {
      expect(safeSiteHref(good), good).toBe(good);
    }
  });

  it("listede ve düğmede javascript: kaydedilemez, hata alanı adıyla söyler", async () => {
    const list = await setSitePage(hyper(), { list: { locale: "tr", key: "nav", rows: [{ label: "X", href: "javascript:alert(1)" }] } });
    expect(!list.ok && list.error.message).toMatch(/1\. öğe.*Hedef/);
    const link = await setSitePage(hyper(), { links: { heroTrial: "javascript:alert(1)" } });
    expect(link.ok).toBe(false);
  });

  it("görsel yolu yalnız site içi olabilir (CSP uzak görseli engeller)", async () => {
    const res = await setSitePage(hyper(), { list: { locale: "tr", key: "mediaItems", rows: [{ title: "G", imageUrl: "https://evil.example/x.png" }] } });
    expect(res.ok).toBe(false);
    const hero = await setSitePage(hyper(), { heroShowcase: { imageUrl: "javascript:x", imageAlt: "", caption: "" } });
    expect(hero.ok).toBe(false);
  });

  it("depoya bozuk değer sızsa bile yayına çıkmaz", async () => {
    const { upsertSettingOverride } = await import("../platform/store");
    await upsertSettingOverride({
      scopeType: "platform",
      scopeId: "*",
      key: "site.page",
      value: { links: { heroTrial: "javascript:alert(1)" }, lists: { tr: { nav: [{ label: "X", href: "javascript:alert(1)" }] } }, order: ["yok"], hidden: ["pricing"] },
      updatedAt: new Date().toISOString(),
      updatedBy: "x",
    });
    const { c, sections } = await resolveSitePage("tr");
    expect(c.links.heroTrial).toBe("/deneme");
    expect(c.nav).toEqual(getSiteContent("tr").nav);
    expect(sections).toContain("pricing");
  });

  it("JSON-LD metni </script> ile etiketi kapatamaz; SSS kaynağı düzenlenen içeriktir", () => {
    const page = readFileSync(path.join(ROOT, "src/app/page.tsx"), "utf-8");
    expect(page).toContain('.replace(/</g, "\\\\u003c")');
    expect(page).toContain("c.faqItems.map");
    expect(page).not.toContain("SITE_FAQ");
  });

  it("sayfada HTML/JS çalıştıran alan yok; tek dangerouslySetInnerHTML JSON-LD'dir", () => {
    const sections = readFileSync(path.join(ROOT, "src/components/site/sections.tsx"), "utf-8");
    expect(sections).not.toContain("dangerouslySetInnerHTML");
    expect(readFileSync(path.join(ROOT, "src/components/platform/site-page-manager.tsx"), "utf-8")).not.toContain("dangerouslySetInnerHTML");
  });
});

describe("canlı rakamlar", () => {
  it("kurum ayrımı ve kişisel veri yok; tek sorgu saatlik önbellekte", () => {
    const src = readFileSync(path.join(ROOT, "src/lib/platform/site-stats.ts"), "utf-8");
    expect(src).toContain("revalidate: 3600");
    expect(src).not.toMatch(/"name"|"email"|GROUP BY/);
  });

  it("varsayılan sırada Hakkında'dan sonra gelir; kayıtlı eski sıraya da oraya girer ve kapatılabilir", async () => {
    expect((await getSitePageSettings()).order.slice(0, 2)).toEqual(["about", "stats"]);
    const { upsertSettingOverride } = await import("../platform/store");
    await upsertSettingOverride({ scopeType: "platform", scopeId: "*", key: "site.page", value: { order: ["faq", "about", "contact"], hidden: ["references"] }, updatedAt: new Date().toISOString(), updatedBy: "x" });
    const order = (await getSitePageSettings()).order;
    expect(order.indexOf("stats")).toBe(order.indexOf("about") + 1);
    expect((await setSitePage(hyper(), { layout: { order, hidden: ["references", "stats"] } })).ok).toBe(true);
    expect((await resolveSitePage("tr")).sections).not.toContain("stats");
  });
});

describe("yetki, kalıcılık ve tek kaynak", () => {
  it("HYPER_ADMIN dışında kimse değiştiremez", async () => {
    for (const role of ["SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER"] as const) {
      const res = await setSitePage(ctx(role), { links: { heroTrial: "/x" } });
      expect(!res.ok && res.error.code, role).toBe("FORBIDDEN");
    }
  });

  it("kayıt bu oturumun belleğine değil depoya gider; dil bazlı liste diğer dili etkilemez", async () => {
    const rows = [{ question: "Soru?", answer: "Yanıt." }];
    expect((await setSitePage(hyper(), { list: { locale: "tr", key: "faqItems", rows } })).ok).toBe(true);
    const { getSettingOverride } = await import("../platform/store");
    expect(JSON.stringify((await getSettingOverride("platform", "*", "site.page"))?.value)).toContain("Soru?");
    expect((await resolveSitePage("tr")).c.faqItems).toEqual(rows);
    expect((await resolveSitePage("en")).c.faqItems).toEqual(getSiteContent("en").faqItems);
    expect((await setSitePage(hyper(), { list: { locale: "tr", key: "faqItems", rows: null } })).ok).toBe(true);
    expect((await resolveSitePage("tr")).c.faqItems).toEqual(getSiteContent("tr").faqItems);
  });

  it("önceki sürüme geri alınır", async () => {
    const { rollbackPolicy } = await import("../platform/policy-versions");
    await setSitePage(hyper(), { links: { heroTrial: "/ilk" } });
    await setSitePage(hyper(), { links: { heroTrial: "/ikinci" } });
    const res = await rollbackPolicy(hyper(), "platform", { key: "site.page", reason: "Yanlış bağlantı", confirm: true });
    expect(res.ok).toBe(true);
    expect((await resolveSitePage("tr")).c.links.heroTrial).toBe("/ilk");
  });

  it("fiyat ve hukuki metin yapı ayarında tutulmaz", async () => {
    const source = readFileSync(path.join(ROOT, "src/lib/platform/site-page.ts"), "utf-8");
    expect(source).not.toMatch(/amountMinor|displayTotal|legal-doc/);
    const sections = readFileSync(path.join(ROOT, "src/components/site/sections.tsx"), "utf-8");
    expect(sections).toContain("getPublishedCatalog");
  });
});
