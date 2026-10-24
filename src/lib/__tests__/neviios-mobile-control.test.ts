import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DEFAULT_TENANT_ID, PLATFORM_TENANT_ID } from "../auth/config";
import type { AppRole } from "../auth/types";
import type { ServiceContext } from "../services/context";

/**
 * NeviiOS Control Center (2026-09-28) — mobil yönetim hedefli regresyon:
 * kontrol matrisi (hak/ayar/efektif ayrımı), tenant izolasyonu, kapalının
 * gizlenmesi + sunucuda reddi ayrımı, marka girdisi doğrulaması.
 */

const { resetPlatformStoreForTests, upsertPlatformTenant } = await import("../platform/store");
const { updateTenantSetting } = await import("../platform/service");
const { getMobilePolicy, getMobileControlMatrix, MOBILE_REMOTE_KEYS, MOBILE_BINARY_REQUIRED } = await import(
  "../platform/mobile-policy"
);
const { parseSettingValue, SETTING_BY_KEY } = await import("../platform/catalog");
const { createHomeworkTool } = await import("../services/tools");

const TENANT_A = "tenant_mobile_a";
const TENANT_B = "tenant_mobile_b";

function ctx(role: AppRole, tenantId: string, userId = "u1"): ServiceContext {
  return { role, userId, tenantId, channel: "web", requestId: "req_mobile_ctrl" };
}
const hyper = () => ctx("HYPER_ADMIN", PLATFORM_TENANT_ID, "user_hyper_admin");

beforeEach(async () => {
  await resetPlatformStoreForTests();
  await upsertPlatformTenant({ tenantId: TENANT_A, name: "Mobil A", planKey: "starter" }, "seed");
  await upsertPlatformTenant({ tenantId: TENANT_B, name: "Mobil B", planKey: "starter" }, "seed");
});

afterEach(async () => {
  await resetPlatformStoreForTests();
});

async function grantMobile(tenantId: string) {
  const addon = await updateTenantSetting(hyper(), tenantId, {
    key: "subscription.addons",
    value: ["mobileApp"],
    confirm: true,
  });
  expect(addon.ok).toBe(true);
  const app = await updateTenantSetting(hyper(), tenantId, { key: "mobile.appEnabled", value: true, confirm: true });
  expect(app.ok).toBe(true);
}

describe("kontrol matrisi — hak yoksa düğme yetki vermez", () => {
  it("starter pakette (hak yok) tüm anahtarlar efektif kapalı + tehlike notu", async () => {
    const m = await getMobileControlMatrix(TENANT_A);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.data.rows).toHaveLength(9);
    for (const row of m.data.rows) {
      expect(row.entitled).toBe(false);
      expect(row.effective).toBe(false);
    }
    const app = m.data.rows.find((r) => r.key === "app")!;
    expect(app.danger).toContain("Paket");
    // push hiçbir durumda efektif "açık" değildir
    expect(m.data.rows.find((r) => r.key === "push")!.effective).toBe(false);
  });

  it("hak + ayar birlikteyse efektif açık; hak geri alınınca düğme yetki vermez", async () => {
    await grantMobile(TENANT_A);
    const open = await getMobilePolicy(ctx("TEACHER", TENANT_A), { platform: "ios" });
    // öğretmen portalı varsayılanı açık + hak var → izinli
    expect(open.ok && open.data.allowed).toBe(true);

    // hakkı geri al (override false) — ayarlar yerinde durur ama policy kapanır
    const revoke = await updateTenantSetting(hyper(), TENANT_A, {
      key: "subscription.entitlementOverrides",
      value: { mobileApp: false },
      confirm: true,
    });
    expect(revoke.ok).toBe(true);
    const closed = await getMobilePolicy(ctx("TEACHER", TENANT_A), { platform: "ios" });
    expect(closed.ok && closed.data.allowed).toBe(false);
    // neden + düzeltme yeri (owner kuralı)
    expect(closed.ok && closed.data.reasons).toContain(
      "Kurum paketinde mobil uygulama hakkı yok. Platform yöneticisi NeviiOS › Kurum › Mobil ekranındaki «Mobil uygulama hakkını ver» düğmesiyle (veya Paket & Limit sekmesinden) hakkı vermeli."
    );
    const matrix = await getMobileControlMatrix(TENANT_A);
    expect(matrix.ok && matrix.data.rows.every((r) => r.effective === false)).toBe(true);
  });

  it("standard paket (mobileApp yok): entitlementOverrides {mobileApp:true} + mobile.appEnabled → öğretmen ve öğrenci izinli (Android)", async () => {
    await upsertPlatformTenant({ tenantId: TENANT_A, name: "Mobil A", planKey: "standard" }, "seed");
    await updateTenantSetting(hyper(), TENANT_A, { key: "mobile.appEnabled", value: true, confirm: true });
    const before = await getMobilePolicy(ctx("TEACHER", TENANT_A), { platform: "android" });
    expect(before.ok && before.data.allowed).toBe(false);
    const grant = await updateTenantSetting(hyper(), TENANT_A, {
      key: "subscription.entitlementOverrides",
      value: { mobileApp: true },
      confirm: true,
      reason: "test",
    });
    expect(grant.ok).toBe(true);
    for (const role of ["TEACHER", "STUDENT"] as const) {
      const p = await getMobilePolicy(ctx(role, TENANT_A), { platform: "android" });
      expect(p.ok && p.data.reasons).toEqual([]);
      expect(p.ok && p.data.allowed).toBe(true);
    }
  });

  it("şube müdürü (doğrudan ya da unified ön ayarda SCHOOL_ADMIN olarak) her durumda kapalı + web paneli nedeni", async () => {
    await grantMobile(TENANT_A);
    await updateTenantSetting(hyper(), TENANT_A, { key: "mobile.adminPortalEnabled", value: true, confirm: true });
    const reason = "Şube müdürü hesapları mobil uygulamayı kullanmaz; web panelini (/panel) kullanın.";
    const direct = await getMobilePolicy(ctx("BRANCH_MANAGER", TENANT_A), { platform: "android" });
    const unified = await getMobilePolicy({ ...ctx("SCHOOL_ADMIN", TENANT_A), loginRole: "BRANCH_MANAGER" }, { platform: "android" });
    const admin = await getMobilePolicy(ctx("SCHOOL_ADMIN", TENANT_A), { platform: "android" });
    for (const p of [direct, unified]) {
      expect(p.ok && p.data.allowed).toBe(false);
      expect(p.ok && p.data.reasons).toEqual([reason]);
    }
    expect(admin.ok && admin.data.allowed).toBe(true);
  });

  it("bakım mesajı doluyken bakım efektifi + açık uyarı; boşalınca güvenli varsayılan", async () => {
    await grantMobile(TENANT_A);
    await updateTenantSetting(hyper(), TENANT_A, { key: "mobile.maintenanceMessage", value: "Gece bakımı" });
    const p = await getMobilePolicy(ctx("STUDENT", TENANT_A), { platform: "android" });
    expect(p.ok && p.data.maintenance.active).toBe(true);
    const m = await getMobileControlMatrix(TENANT_A);
    const maint = m.ok && m.data.rows.find((r) => r.key === "maintenance")!;
    expect(maint && maint.effective).toBe(true);
    expect(maint && maint.danger).toContain("kimse");
    await updateTenantSetting(hyper(), TENANT_A, { key: "mobile.maintenanceMessage", value: "" });
    const p2 = await getMobilePolicy(ctx("STUDENT", TENANT_A), { platform: "android" });
    expect(p2.ok && p2.data.maintenance.active).toBe(false);
  });
});

describe("tenant izolasyonu — A ayarı B'yi etkilemez, oturum yenilemede geçerli", () => {
  it("A'da açılan mobil B'de kapalı kalır", async () => {
    await grantMobile(TENANT_A);
    const a = await getMobilePolicy(ctx("TEACHER", TENANT_A), { platform: "ios" });
    const b = await getMobilePolicy(ctx("TEACHER", TENANT_B), { platform: "ios" });
    expect(a.ok && a.data.allowed).toBe(true);
    expect(b.ok && b.data.allowed).toBe(false);
    const mb = await getMobileControlMatrix(TENANT_B);
    expect(mb.ok && mb.data.rows.find((r) => r.key === "app")!.effective).toBe(false);
  });
});

describe("gizleme + sunucuda ret ayrımı", () => {
  it("kapalı özellik gizlenir (policy) VE veri yazımı sunucuda reddedilir (mobil kanal)", async () => {
    const { updateTenantFeature } = await import("../platform/service");
    const off = await updateTenantFeature(hyper(), DEFAULT_TENANT_ID, { flag: "homework", enabled: false });
    expect(off.ok).toBe(true);
    const res = await createHomeworkTool(
      { role: "TEACHER", userId: "t1", tenantId: DEFAULT_TENANT_ID, teacherId: "t1", channel: "mobile" },
      { studentId: "s1", title: "x", dueDate: "2099-01-01" }
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });
});

describe("marka girdisi doğrulaması — metin/görsel sınırları", () => {
  it("javascript:/data-URI/aşırı uzun logo reddedilir; https ve site-içi yol geçer", () => {
    const logo = SETTING_BY_KEY.get("institution.logoUrl")!;
    expect(parseSettingValue(logo, "javascript:alert(1)").ok).toBe(false);
    expect(parseSettingValue(logo, "data:image/png;base64,AAA").ok).toBe(false);
    expect(parseSettingValue(logo, `https://x.test/${"a".repeat(600)}`).ok).toBe(false);
    expect(parseSettingValue(logo, "https://kurum.test/logo.png").ok).toBe(true);
    expect(parseSettingValue(logo, "/brand/kurum.png").ok).toBe(true);
    expect(parseSettingValue(logo, "").ok).toBe(true);
  });

  it("HTML karşılama metni ve uzun kurum adı reddedilir", () => {
    const msg = SETTING_BY_KEY.get("institution.loginMessage")!;
    expect(parseSettingValue(msg, "<img src=x onerror=alert(1)>").ok).toBe(false);
    expect(parseSettingValue(msg, "a".repeat(501)).ok).toBe(false);
    expect(parseSettingValue(msg, "Hoş geldiniz!").ok).toBe(true);
    const name = SETTING_BY_KEY.get("institution.name")!;
    expect(parseSettingValue(name, "<b>X</b>").ok).toBe(false);
  });

  it("yazım yolu doğrulamayı uygular (servis üzerinden)", async () => {
    const bad = await updateTenantSetting(hyper(), TENANT_A, {
      key: "institution.logoUrl",
      value: "javascript:alert(1)",
    });
    expect(bad.ok).toBe(false);
    const good = await updateTenantSetting(hyper(), TENANT_A, {
      key: "institution.loginMessage",
      value: "Hayırlı dersler!",
    });
    expect(good.ok).toBe(true);
  });
});

describe("uzaktan-değişen / binary-gerektiren ayrımı", () => {
  it("uzaktan anahtarlar snapshot sözleşmesinde; binary listesi push gerçeğini söyler", () => {
    expect(MOBILE_REMOTE_KEYS).toContain("mobile.appEnabled");
    expect(MOBILE_REMOTE_KEYS).toContain("mobile.pushPolicy");
    expect(MOBILE_REMOTE_KEYS).toContain("institution.logoUrl");
    expect(MOBILE_BINARY_REQUIRED.length).toBeGreaterThan(0);
    expect(MOBILE_BINARY_REQUIRED.map((b) => `${b.label} ${b.detail}`).join(" ")).toContain("APNs/FCM");
  });
});
