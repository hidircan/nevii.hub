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
import { BLOG_POSTS } from "../marketing/blog";
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
    for (const p of BLOG_POSTS) {
      for (const f of p.features) expect(slugs).toContain(f);
      expect(SECTORS.map((s) => s.slug)).toContain(p.sectorSlug);
    }
  });

  it("gerçek dışı iddia yok: TR sunucu, garanti, uydurma müşteri", () => {
    const text = JSON.stringify([FEATURES, SECTORS, BLOG_POSTS]) + readFileSync(join(process.cwd(), "src/components/site/home-sections.tsx"), "utf8");
    expect(text).not.toMatch(/TR sunucu|Türkiye'deki sunucu|%100 güvenli|garanti ediyoruz|Nilüfer/i);
  });

  it("her hukuki sayfa kayıtlı bir belgeye bağlıdır", () => {
    const ids = LEGAL_DOCS.filter((d) => d.appliesB2B).map((d) => d.id);
    for (const l of LEGAL_PAGES) expect(ids).toContain(l.docId);
    expect(LEGAL_PAGES.map((l) => l.docId).sort()).toEqual([...ids].sort());
  });
});
