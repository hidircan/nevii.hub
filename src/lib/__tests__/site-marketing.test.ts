import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetPlatformStoreForTests } from "../platform/store";
import { __resetSaasBillingStoreForTests } from "../saas-billing/store";
import { builtinCatalog, upsertCatalogPlan } from "../platform/commercial-catalog";
import { publishPolicyDraft } from "../platform/policy-versions";
import { getPricingViews } from "../saas-billing/pricing-views";
import { getPricedPlan } from "../saas-billing/catalog";
import { FEATURES, FEATURE_GROUPS } from "../marketing/features";
import { SECTORS } from "../marketing/sectors";
import { BLOG_CATEGORIES, builtinMetas, builtinPost, parseBlogBody, slugifyTitle } from "../marketing/blog";
import { BUILTIN_POSTS } from "../marketing/blog-posts";
import { getPublishedPost, listAllPostsFresh, listPublishedPosts, readBlogImage } from "../platform/blog";
import { deleteBlogPost, saveBlogPost, setBlogPublished } from "../platform/blog-admin";
import { LEGAL_PAGES } from "../marketing/legal-links";
import { LEGAL_DOCS } from "../saas-billing/legal-documents";
import type { ServiceContext } from "../services/context";

const hyper = (): ServiceContext =>
  ({ role: "HYPER_ADMIN", userId: "user_hyper_admin", tenantId: "tenant_platform", channel: "web", requestId: "req_site" }) as ServiceContext;

const reset = async () => {
  await resetPlatformStoreForTests();
  await __resetSaasBillingStoreForTests();
};
beforeEach(reset);
afterEach(reset);

describe("paket değişikliği ana sayfaya yayınla adımıyla yansır (2026-10-31)", () => {
  it("taslak görünmez; yayınlanınca ana sayfa ve satın alma yeni adı görür", async () => {
    const base = builtinCatalog().plans.find((p) => p.key === "starter")!;
    const saved = await upsertCatalogPlan(hyper(), { ...base, label: "Yeni Ad", reason: "Paket adı revizesi" });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const before = await getPricingViews();
    expect(before.views.find((v) => v.key === "starter")?.label).not.toBe("Yeni Ad");

    const published = await publishPolicyDraft(hyper(), "platform", { draftId: saved.data.draftId, confirm: true });
    expect(published.ok).toBe(true);

    const after = await getPricingViews();
    expect(after.views.find((v) => v.key === "starter")?.label).toBe("Yeni Ad");
    expect((await getPricedPlan("starter", "monthly"))?.planLabel).toBe("Yeni Ad");
  });
});

describe("tanıtım içeriği", () => {
  it("adresler benzersiz, özellik grupları dolu, sektör ve blog bağlantıları gerçek özelliğe gider", () => {
    const slugs = FEATURES.map((f) => f.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const g of FEATURE_GROUPS) expect(FEATURES.some((f) => f.group === g)).toBe(true);
    for (const s of SECTORS) for (const a of s.answers) expect(slugs).toContain(a.feature);
    const categories = BLOG_CATEGORIES.map((c) => c.slug);
    for (const p of BUILTIN_POSTS) {
      for (const f of p.features) expect(slugs).toContain(f);
      expect(categories).toContain(p.category);
    }
    for (const c of BLOG_CATEGORIES) {
      if (c.sectorSlug) expect(SECTORS.map((s) => s.slug)).toContain(c.sectorSlug);
    }
  });

  it("gerçek dışı iddia yok: TR sunucu, garanti, uydurma müşteri", () => {
    const text = JSON.stringify([FEATURES, SECTORS, BUILTIN_POSTS]) + readFileSync(join(process.cwd(), "src/components/site/home-sections.tsx"), "utf8");
    expect(text).not.toMatch(/TR sunucu|Türkiye'deki sunucu|%100 güvenli|garanti ediyoruz|Nilüfer/i);
  });

  it("her hukuki sayfa kayıtlı bir belgeye bağlıdır", () => {
    const ids = LEGAL_DOCS.filter((d) => d.appliesB2B).map((d) => d.id);
    for (const l of LEGAL_PAGES) expect(ids).toContain(l.docId);
    expect(LEGAL_PAGES.map((l) => l.docId).sort()).toEqual([...ids].sort());
  });
});

describe("şüphe uyandıran metin yok (owner kuralı, 2026-10-31)", () => {
  it("tanıtım yüzeylerinde sunucu konumu ve kurumlar arası ayrım anlatılmaz", () => {
    const files = ["src/components/site/home-sections.tsx", "src/lib/marketing/features.ts", "src/lib/marketing/sectors.ts", "src/lib/site-content.ts", "src/lib/site-locales/tr.ts"];
    const text = files.map((f) => readFileSync(join(process.cwd(), f), "utf8")).join("\n") + JSON.stringify(BUILTIN_POSTS);
    expect(text).not.toMatch(/Frankfurt|Avrupa'da|izole|izolasyon|diğer kurumlardan|kurumlar arası/i);
  });
});

describe("blog", () => {
  const body = "Bu yazı testi için yazıldı. ".repeat(12);
  const save = (over: Record<string, unknown> = {}) => saveBlogPost(hyper(), { title: "Salonda aidat düzeni", category: "spor", body, published: true, ...over });

  it("her kategoride en az iki hazır yazı var ve yazılar uzun", () => {
    for (const c of BLOG_CATEGORIES) expect(BUILTIN_POSTS.filter((p) => p.category === c.slug).length).toBeGreaterThanOrEqual(2);
    for (const p of BUILTIN_POSTS) expect(p.body.trim().split(/\s+/).length).toBeGreaterThan(700);
    expect(new Set(BUILTIN_POSTS.map((p) => p.slug)).size).toBe(BUILTIN_POSTS.length);
  });

  it("metin HTML olarak yorumlanmaz, biçim kuralları çalışır", () => {
    const blocks = parseBlogBody("İlk <script>alert(1)</script> paragraf\n\n## Başlık\n\n- bir\n- iki");
    expect(blocks).toEqual([
      { type: "p", text: "İlk <script>alert(1)</script> paragraf" },
      { type: "h2", text: "Başlık" },
      { type: "ul", items: ["bir", "iki"] },
    ]);
    expect(slugifyTitle("Çocuğum Şu An Etüte Geldi mi?")).toBe("cocugum-su-an-etute-geldi-mi");
  });

  it("yalnız platform sahibi yazar", async () => {
    const r = await saveBlogPost({ ...hyper(), role: "SUPER_ADMIN" } as ServiceContext, { title: "Salonda aidat düzeni", category: "spor", body, published: true });
    expect(r.ok).toBe(false);
  });

  it("yazı yayınlanır, taslağa alınır, silinir; aynı başlık yeni adres alır", async () => {
    const first = await save();
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.post.slug).toBe("salonda-aidat-duzeni");
    expect((await listPublishedPosts()).some((p) => p.slug === "salonda-aidat-duzeni")).toBe(true);
    expect((await getPublishedPost("salonda-aidat-duzeni"))?.body).toBe(body.trim());

    const second = await save();
    expect(second.ok && second.data.post.slug).toBe("salonda-aidat-duzeni-2");

    await setBlogPublished(hyper(), { slug: "salonda-aidat-duzeni", published: false });
    expect(await getPublishedPost("salonda-aidat-duzeni")).toBeNull();

    await deleteBlogPost(hyper(), { slug: "salonda-aidat-duzeni" });
    expect((await listAllPostsFresh()).some((p) => p.slug === "salonda-aidat-duzeni")).toBe(false);
  });

  it("hazır yazı düzenlenir, gizlenir ve ilk hâline döner; bilinmeyen adres okunmaz", async () => {
    const slug = builtinMetas()[0]!.slug;
    await saveBlogPost(hyper(), { slug, title: "Düzenlenmiş başlık", category: builtinMetas()[0]!.category, body, published: true });
    expect((await getPublishedPost(slug))?.title).toBe("Düzenlenmiş başlık");
    await setBlogPublished(hyper(), { slug, published: false });
    expect((await listPublishedPosts()).some((p) => p.slug === slug)).toBe(false);
    await deleteBlogPost(hyper(), { slug });
    expect((await getPublishedPost(slug))?.title).toBe(builtinPost(slug)!.title);
    expect(await getPublishedPost("olmayan-yazi")).toBeNull();
  });

  it("kapak küçültülür, satır dışında tutulur, değişince eskisi silinir", async () => {
    const sharp = (await import("sharp")).default;
    const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: { r: 200, g: 120, b: 40 } } }).jpeg().toBuffer();
    const saved = await save({ coverMime: "image/jpeg", coverBase64: big.toString("base64") });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const cover = saved.data.post.cover!;
    expect(cover.width).toBeLessThanOrEqual(1600);
    expect(cover.size).toBeLessThanOrEqual(300 * 1024);
    expect(JSON.stringify(saved.data.post)).not.toContain(big.toString("base64").slice(0, 40));
    expect(await readBlogImage(cover.id)).not.toBeNull();
    expect(await readBlogImage("../../etc/passwd")).toBeNull();

    await saveBlogPost(hyper(), { slug: saved.data.post.slug, title: "Salonda aidat düzeni", category: "spor", body, published: true, removeCover: true });
    expect(await readBlogImage(cover.id)).toBeNull();
  });
});
