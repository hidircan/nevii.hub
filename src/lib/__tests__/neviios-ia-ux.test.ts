import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetPlatformStoreForTests, upsertPlatformTenant } from "../platform/store";
import { __resetSaasBillingStoreForTests } from "../saas-billing/store";
import { SCREEN_REGISTRY, screensFor } from "../platform/permission-matrix";
import { FEATURE_CATALOG } from "../platform/features";
import { MODULE_GUIDE, checkModuleDeps } from "../platform/module-guide";
import { auditActionLabel } from "../platform/audit-labels";
import { appStoreIdFromUrl, resolveMobileAppLinks, setSiteMobileApps } from "../platform/site-mobile-apps";
import { builtinCatalog, planReferences, renameCatalogPlan, upsertCatalogPlan } from "../platform/commercial-catalog";
import { getBillingOverview } from "../saas-billing/overview";
import type { ServiceContext } from "../services/context";

const hyper = (): ServiceContext =>
  ({ role: "HYPER_ADMIN", userId: "user_hyper_admin", tenantId: "tenant_platform", channel: "web", requestId: "req_ia" }) as ServiceContext;

beforeEach(async () => {
  await resetPlatformStoreForTests();
  await __resetSaasBillingStoreForTests();
});
afterEach(async () => {
  await resetPlatformStoreForTests();
  await __resetSaasBillingStoreForTests();
});

describe("NeviiOS bilgi mimarisi", () => {
  it("platform menüsündeki her ekran bir gruba aittir ve grup sırası sabittir", () => {
    const grants = [{ resource: "audit", action: "read", scope: "platform" }] as never;
    void grants;
    const all = SCREEN_REGISTRY.filter((s) => s.area === "platform" && !s.hiddenInNav);
    // Özet grupsuz (ilk), diğerleri gruplu
    expect(all[0]!.id).toBe("platform.overview");
    for (const s of all.slice(1)) expect(s.navGroup, s.id).toBeTruthy();
    const groups = [...new Set(all.slice(1).map((s) => s.navGroup))];
    expect(groups).toEqual(["Kurumlar ve Erişim", "Satış ve Abonelik", "Marka ve Site", "Entegrasyonlar", "Güvenlik ve Operasyon"]);
  });

  it("Başvurular ayrı rotadadır (fatura çapasında değil)", () => {
    const r = SCREEN_REGISTRY.find((s) => s.id === "platform.billing.requests")!;
    expect(r.path).toBe("/platform/basvurular");
  });

  it("Ödeme Sağlayıcıları tek giriştir (Entegrasyonlar grubu)", () => {
    const hits = SCREEN_REGISTRY.filter((s) => s.path === "/platform/odeme-saglayicilari" && !s.hiddenInNav);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.navGroup).toBe("Entegrasyonlar");
  });

  it("menüde mükerrer yol yoktur", () => {
    const paths = SCREEN_REGISTRY.filter((s) => s.area === "platform" && !s.hiddenInNav).map((s) => s.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("screensFor sırayı korur (grup içi karışma yok)", () => {
    const full = [
      "audit",
      "institution_settings",
      "users",
      "roles",
      "platform_branding",
      "integrations",
      "packages",
      "saas_billing",
    ].flatMap((resource) => [
      { resource, action: "read", scope: "platform" },
      { resource, action: "manage", scope: "platform" },
      { resource, action: "configure", scope: "platform" },
      { resource, action: "create", scope: "platform" },
    ]) as never;
    const ids = screensFor({ grants: full }, "platform").map((s) => s.id);
    expect(ids[0]).toBe("platform.overview");
    // Kurumlar grubu Satış grubundan önce gelir
    expect(ids.indexOf("platform.tenants")).toBeLessThan(ids.indexOf("platform.packages"));
    expect(ids.indexOf("platform.packages")).toBeLessThan(ids.indexOf("platform.branding"));
    expect(ids.indexOf("platform.branding")).toBeLessThan(ids.indexOf("platform.billing.providers"));
    expect(ids.indexOf("platform.billing.providers")).toBeLessThan(ids.indexOf("platform.audit"));
  });
});

describe("Modül kılavuzu", () => {
  it("katalogdaki her bayrağın kılavuz girdisi vardır", () => {
    for (const f of FEATURE_CATALOG) expect(MODULE_GUIDE[f.key], f.key).toBeTruthy();
  });

  it("bağımlılık denetimi boşken uyarı vermez, eksikte uyarır", () => {
    expect(checkModuleDeps(["payments", "aiAssistant"])).toEqual([]);
    const guide = { ...MODULE_GUIDE, demo_x: { ...MODULE_GUIDE.payments!, requires: ["demo_y"] } };
    expect(checkModuleDeps(["demo_x"], guide)).toHaveLength(1);
    expect(checkModuleDeps(["demo_x", "demo_y"], guide)).toEqual([]);
  });

  it("backend denetimi yalnız doğrulanan 5 bayrakta işaretlidir", () => {
    const enforced = Object.entries(MODULE_GUIDE)
      .filter(([, g]) => g.enforcedBackend)
      .map(([k]) => k)
      .sort();
    expect(enforced).toEqual(["announcements", "homework", "payments", "tasks", "teacherFeedback"]);
  });
});

describe("Denetim dili", () => {
  it("bilinen eylemler cümleyle gösterilir", () => {
    expect(auditActionLabel("platform.catalog.plan_rename")).toBe("Paket anahtarı değişti");
    expect(auditActionLabel("platform.tenant.provision")).toBe("Kurum açıldı");
    expect(auditActionLabel("platform.user.role_change")).toBe("Kullanıcı rolü değişti");
    expect(auditActionLabel("site.mobileApps.update")).toBe("Mobil uygulama bağlantıları güncellendi");
    expect(auditActionLabel("auth.login_failed")).toBe("Giriş denemesi başarısız");
  });

  it("bilinmeyen kod ham gösterilmez, sadeleştirilir", () => {
    expect(auditActionLabel("x.yeni_islem")).toBe("Yeni islem");
  });
});

describe("Paket anahtarı değişimi", () => {
  const studio = () => {
    const base = builtinCatalog().plans.find((p) => p.key === "starter")!;
    return { ...base, key: "studio", label: "Studio", reason: "Test paketi" };
  };

  it("hiç kullanılmayan özel paket yeniden adlandırılabilir", async () => {
    expect((await upsertCatalogPlan(hyper(), studio())).ok).toBe(true);
    const rn = await renameCatalogPlan(hyper(), { key: "studio", newKey: "atelier", reason: "Ad düzeltmesi" });
    expect(rn.ok).toBe(true);
    const { getCatalogOverview } = await import("../platform/commercial-catalog");
    const over = await getCatalogOverview(hyper());
    expect(over.ok).toBe(true);
    if (over.ok) {
      expect(over.data.draft!.plans.some((p) => p.key === "atelier")).toBe(true);
      expect(over.data.draft!.plans.some((p) => p.key === "studio")).toBe(false);
    }
  });

  it("yerleşik anahtar değişmez", async () => {
    const rn = await renameCatalogPlan(hyper(), { key: "core", newKey: "cekirdek", reason: "Deneme sebebi" });
    expect(rn.ok).toBe(false);
  });

  it("kullanan kurum varken değişmez ve engel sayılır", async () => {
    expect((await upsertCatalogPlan(hyper(), studio())).ok).toBe(true);
    await upsertPlatformTenant({ tenantId: "tenant_demo_x", name: "Demo X", planKey: "studio" } as never, "user_hyper_admin");
    const refs = await planReferences("studio");
    expect(refs.tenants).toBe(1);
    const rn = await renameCatalogPlan(hyper(), { key: "studio", newKey: "atelier", reason: "Deneme sebebi" });
    expect(rn.ok).toBe(false);
    if (!rn.ok) expect(rn.error.message).toContain("1 kurum");
  });

  it("geçersiz ve çakışan anahtar reddedilir", async () => {
    expect((await upsertCatalogPlan(hyper(), studio())).ok).toBe(true);
    expect((await renameCatalogPlan(hyper(), { key: "studio", newKey: "STUDIO!", reason: "Deneme sebebi" })).ok).toBe(false);
    expect((await renameCatalogPlan(hyper(), { key: "studio", newKey: "studio", reason: "Deneme sebebi" })).ok).toBe(false);
    const base = builtinCatalog().plans.find((p) => p.key === "starter")!;
    expect((await upsertCatalogPlan(hyper(), { ...base, key: "diger", label: "Diğer", reason: "Test paketi" })).ok).toBe(true);
    const dup = await renameCatalogPlan(hyper(), { key: "studio", newKey: "diger", reason: "Deneme sebebi" });
    expect(dup.ok).toBe(false);
  });
});

describe("Eski (legacy) paket silme", () => {
  it("kullanılmayan yerleşik eski paket silinebilir; güncel yerleşik silinemez", async () => {
    const { deleteCatalogPlan, getCatalogOverview } = await import("../platform/commercial-catalog");
    const legacy = await deleteCatalogPlan(hyper(), { key: "professional", reason: "Eski paket temizliği" });
    expect(legacy.ok).toBe(true);
    const over = await getCatalogOverview(hyper());
    expect(over.ok && over.data.draft!.plans.some((p) => p.key === "professional")).toBe(false);
    const current = await deleteCatalogPlan(hyper(), { key: "starter", reason: "Silme denemesi" });
    expect(current.ok).toBe(false);
  });

  it("kullanan kurum varken eski paket de silinemez", async () => {
    const { deleteCatalogPlan } = await import("../platform/commercial-catalog");
    await upsertPlatformTenant({ tenantId: "tenant_demo_std", name: "Demo Std", planKey: "standard" } as never, "user_hyper_admin");
    const del = await deleteCatalogPlan(hyper(), { key: "standard", reason: "Silme denemesi" });
    expect(del.ok).toBe(false);
  });
});

describe("Mobil uygulama bağlantıları", () => {
  it("geçersiz adres reddedilir", async () => {
    expect((await setSiteMobileApps(hyper(), { appStoreUrl: "http://ornek.com/a" })).ok).toBe(false);
    expect((await setSiteMobileApps(hyper(), { playStoreUrl: "https://kotu-site.com/app" })).ok).toBe(false);
    expect((await setSiteMobileApps(hyper(), { appStoreUrl: "javascript:alert(1)" })).ok).toBe(false);
  });

  it("site ayarı env'i ezer; boşken env kullanılır", async () => {
    const origApp = process.env.APP_STORE_URL;
    const origPlay = process.env.PLAY_STORE_URL;
    process.env.APP_STORE_URL = "https://apps.apple.com/tr/app/env-uygulama/id111111";
    process.env.PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.env.app";
    try {
      let r = await resolveMobileAppLinks();
      expect(r.appStoreSource).toBe("env");
      const saved = await setSiteMobileApps(hyper(), { appStoreUrl: "https://apps.apple.com/tr/app/site-uygulama/id222222" });
      expect(saved.ok).toBe(true);
      r = await resolveMobileAppLinks();
      expect(r.appStoreSource).toBe("site");
      expect(r.appStoreUrl).toContain("id222222");
      expect(r.playSource).toBe("env");
    } finally {
      if (origApp === undefined) delete process.env.APP_STORE_URL;
      else process.env.APP_STORE_URL = origApp;
      if (origPlay === undefined) delete process.env.PLAY_STORE_URL;
      else process.env.PLAY_STORE_URL = origPlay;
    }
  });

  it("App Store kimliği bağlantıdan türetilir", () => {
    expect(appStoreIdFromUrl("https://apps.apple.com/tr/app/neviihub/id123456789")).toBe("123456789");
    expect(appStoreIdFromUrl("https://apps.apple.com/tr/app/neviihub")).toBeNull();
  });
});

describe("Site metin düzenlemeleri", () => {
  it("override kaydedilir ve çözülen içeriğe yansır; boş değer varsayılana döndürür", async () => {
    const { resolveSiteContent, setSiteContentOverrides } = await import("../platform/site-content-overrides");
    const { getSiteContent } = await import("../site-locales");
    const code = getSiteContent("tr").hero.headline;
    const saved = await setSiteContentOverrides(hyper(), { locale: "tr", values: { "hero.headline": "Özel karşılama başlığı" } });
    expect(saved.ok).toBe(true);
    expect((await resolveSiteContent("tr")).hero.headline).toBe("Özel karşılama başlığı");
    expect((await resolveSiteContent("en")).hero.headline).not.toBe("Özel karşılama başlığı");
    const cleared = await setSiteContentOverrides(hyper(), { locale: "tr", values: { "hero.headline": "" } });
    expect(cleared.ok).toBe(true);
    expect((await resolveSiteContent("tr")).hero.headline).toBe(code);
  });

  it("listeye olmayan alan ve bozulan yer tutucu reddedilir", async () => {
    const { setSiteContentOverrides } = await import("../platform/site-content-overrides");
    expect((await setSiteContentOverrides(hyper(), { locale: "tr", values: { "nav": "X" } })).ok).toBe(false);
    expect((await setSiteContentOverrides(hyper(), { locale: "tr", values: { "pricingChrome.yearlyNote": "tutar yok" } })).ok).toBe(false);
    expect((await setSiteContentOverrides(hyper(), { locale: "tr", values: { "pricingChrome.yearlyNote": "aylık {equiv} eşdeğer" } })).ok).toBe(true);
  });
});

describe("Denetim filtre ve sayfalama", () => {
  it("eylem öneki + sonuç filtresi ve sayfa dilimi çalışır", async () => {
    const { appendPlatformAudit } = await import("../platform/store");
    const { getPlatformAuditLog } = await import("../platform/service");
    const base = {
      actorUserId: "user_hyper_admin",
      actorRole: "HYPER_ADMIN",
      actorTenantId: "tenant_platform",
      targetTenantId: null,
      entityType: "CommercialCatalog",
      entityId: "commercial.catalog",
      before: null,
      after: null,
      requestId: "req_audit",
      outcome: "success",
    } as const;
    for (let i = 0; i < 12; i++) {
      await appendPlatformAudit({ ...base, action: "platform.catalog.plan_upsert" });
    }
    await appendPlatformAudit({ ...base, action: "platform.user.invite", outcome: "denied" });
    const filtered = await getPlatformAuditLog(hyper(), undefined, { action: "platform.catalog", pageSize: 10, page: 2 });
    expect(filtered.ok).toBe(true);
    if (filtered.ok) {
      expect(filtered.data.total).toBe(12);
      expect(filtered.data.events).toHaveLength(2);
      expect(filtered.data.pages).toBe(2);
    }
    const denied = await getPlatformAuditLog(hyper(), undefined, { outcome: "denied" });
    expect(denied.ok && denied.data.total).toBe(1);
  });
});

describe("Başvuru veri ayrımı", () => {
  it("fatura özeti başvuruları atlayabilir, başvuru ekranı tam alır", async () => {
    const { submitTrialRequest } = await import("../saas-billing/trial");
    const submitted = await submitTrialRequest({
      input: {
        institutionName: "Senkron Koleji",
        ownerName: "Senkron Sahibi",
        ownerEmail: "senkron@ornek.com",
        ownerPhone: null,
      },
    });
    expect(submitted.ok).toBe(true);
    const slim = await getBillingOverview({ includeRequests: false });
    expect(slim.trialRequests).toHaveLength(0);
    const full = await getBillingOverview();
    expect(full.trialRequests).toHaveLength(1);
    expect(full.trialRequests[0]!.institutionName).toBe("Senkron Koleji");
  });
});

describe("Anahtar değişimi: deneme ayarı engeli + ad tutarlılığı", () => {
  const studio = () => {
    const base = builtinCatalog().plans.find((p) => p.key === "starter")!;
    return { ...base, key: "studio", label: "Studio", reason: "Test paketi" };
  };

  it("deneme paketi ayarında seçili anahtar değişmez", async () => {
    expect((await upsertCatalogPlan(hyper(), studio())).ok).toBe(true);
    const { upsertSettingOverride } = await import("../platform/store");
    await upsertSettingOverride({
      scopeType: "platform", scopeId: "*", key: "billing.trialPlanKey", value: "studio",
      updatedAt: new Date().toISOString(), updatedBy: "test",
    });
    const refs = await planReferences("studio");
    expect(refs.trialSetting).toBe(1);
    const rn = await renameCatalogPlan(hyper(), { key: "studio", newKey: "atelier", reason: "Deneme sebebi" });
    expect(rn.ok).toBe(false);
    if (!rn.ok) expect(rn.error.message).toContain("deneme paketi ayarı");
  });

  it("ad eşlemesi yayındaki kataloğu verir (yayın yoksa yerleşik adlar)", async () => {
    const { getPlanNameMap } = await import("../platform/commercial-catalog");
    const names = await getPlanNameMap();
    expect(names.get("pro")).toBe("Pro");
    expect(names.get("starter")).toBe("Starter");
  });

  it("e-belge denetim kayıtları kullanıcı diliyle gösterilir", async () => {
    const { auditEntityLabel } = await import("../platform/audit-labels");
    expect(auditActionLabel("saas.edoc.resend_email")).toBe("E-belge e-postası yeniden gönderildi");
    expect(auditActionLabel("saas.edoc.retry")).toBe("E-belge düzenleme yeniden denendi");
    expect(auditEntityLabel("EDocument")).toBe("E-Belge");
  });
});
