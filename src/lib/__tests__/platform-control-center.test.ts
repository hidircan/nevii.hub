import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import {
  DEFAULT_TENANT_ID,
  PLATFORM_TENANT_ID,
  DEV_HYPER_ADMIN_EMAIL,
  DEV_HYPER_ADMIN_PASSWORD,
} from "../auth/config";
import { APP_ROLES, type AuthUser, type AppRole } from "../auth/types";
import { hasPermission } from "../auth/rbac";
import { authenticateUser } from "../auth/users";
import { homePathForRole } from "../auth/role-routes";
import { pickInstitutionSelection, ALL_KURUMLAR } from "../institution/scope";
import { listAvailableKurumlar } from "../institution/context";
import type { ServiceContext } from "../services/context";
import { FEATURE_DISABLED_MESSAGE } from "../platform/features";
import {
  resetPlatformStoreForTests,
  PLATFORM_STORE_FILE,
  upsertPlatformTenant,
} from "../platform/store";

const mockUser: { value: AuthUser } = {
  value: { userId: "u1", role: "SUPER_ADMIN", tenantId: DEFAULT_TENANT_ID },
};

vi.mock("@/lib/auth/authenticate", () => ({
  authenticateRequest: async () => ({ ok: true, user: mockUser.value, via: "bearer" }),
}));
import {
  getTenantSettings,
  updateTenantSetting,
  updateTenantFeature,
  updateIntegrationForScope,
  getPlatformAuditLog,
  getOwnInstitutionSettings,
  updateOwnInstitutionFeature,
} from "../platform/service";
import { resolveSettingFromOverrides } from "../platform/resolve";
import { parseSettingValue, SETTING_BY_KEY } from "../platform/catalog";
import { containsUnredactedSecret, redactSecrets } from "../platform/secrets";
import { createHomeworkTool } from "../services/tools";
import { __resetRateLimitForTests } from "../rate-limit";
import { POST as loginPost } from "../../app/api/v1/auth/login/route";

const TENANT_A = "tenant_a_platform";
const TENANT_B = "tenant_b_platform";

function ctx(role: AppRole, tenantId: string, userId = "u1"): ServiceContext {
  return { role, userId, tenantId, channel: "web", requestId: "req_test" };
}

const hyper = () => ctx("HYPER_ADMIN", PLATFORM_TENANT_ID, "user_hyper_admin");

beforeEach(async () => {
  await resetPlatformStoreForTests();
  await upsertPlatformTenant({ tenantId: TENANT_A, name: "Akademi A", planKey: "standard" }, "seed");
  await upsertPlatformTenant({ tenantId: TENANT_B, name: "Akademi B", planKey: "starter" }, "seed");
});

afterEach(async () => {
  await resetPlatformStoreForTests();
});

describe("HYPER_ADMIN bootstrap", () => {
  it("non-production bootstrap hesabı ile giriş yapar ve kurum tenant'ına bağlanmaz", async () => {
    const user = await authenticateUser(DEV_HYPER_ADMIN_EMAIL, DEV_HYPER_ADMIN_PASSWORD);
    expect(user?.role).toBe("HYPER_ADMIN");
    expect(user?.tenantId).toBe(PLATFORM_TENANT_ID);
    expect(user?.email).toBe(DEV_HYPER_ADMIN_EMAIL);
  });

  it("HYPER_ADMIN ev yolu /platform, SUPER_ADMIN /panel", () => {
    expect(homePathForRole("HYPER_ADMIN")).toBe("/platform");
    expect(homePathForRole("SUPER_ADMIN")).toBe("/panel");
  });
});

describe("yetki ayrımı", () => {
  it("yalnız HYPER_ADMIN tenant:all ve platform:write sahibidir", () => {
    expect(hasPermission("HYPER_ADMIN", "tenant:all")).toBe(true);
    expect(hasPermission("HYPER_ADMIN", "platform:write")).toBe(true);
    expect(hasPermission("SUPER_ADMIN", "tenant:all")).toBe(false);
    expect(hasPermission("SUPER_ADMIN", "platform:write")).toBe(false);
    expect(hasPermission("SCHOOL_ADMIN", "platform:read")).toBe(false);
    expect(hasPermission("HYPER_ADMIN", "payments:write")).toBe(false);
  });

  it("SUPER_ADMIN kurum ayarını yönetir, platformu yönetemez", () => {
    expect(hasPermission("SUPER_ADMIN", "institution:settings")).toBe(true);
    expect(hasPermission("SUPER_ADMIN", "institution:integrations")).toBe(true);
  });
});

describe("kurum kapsamı — SUPER_ADMIN başka kurumu görmez", () => {
  it("SUPER_ADMIN varsayılanı kendi kurumudur, ALL seçemez", () => {
    const available = [
      { tenantId: "tenant_a", name: "A" },
      { tenantId: "tenant_b", name: "B" },
    ];
    expect(pickInstitutionSelection("SUPER_ADMIN", "tenant_a", available, undefined)).toBe("tenant_a");
    expect(pickInstitutionSelection("SUPER_ADMIN", "tenant_a", available, ALL_KURUMLAR)).toBe("tenant_a");
    expect(pickInstitutionSelection("HYPER_ADMIN", PLATFORM_TENANT_ID, available, undefined)).toBe(ALL_KURUMLAR);
  });

  it("listAvailableKurumlar SUPER_ADMIN'i kendi tenant'ına düşürür", async () => {
    const list = await listAvailableKurumlar(ctx("SUPER_ADMIN", "tenant_yabanci"));
    expect(list).toHaveLength(1);
    expect(list[0]!.tenantId).toBe("tenant_yabanci");
  });
});

describe("ayar çözümleme önceliği", () => {
  it("platform → paket → kurum → şube", () => {
    const def = SETTING_BY_KEY.get("lessons.defaultDurationMinutes")!;
    expect(def).toBeTruthy();
    const overrides = [
      {
        scopeType: "platform" as const,
        scopeId: "*",
        key: def.key,
        value: 30,
        updatedAt: "t",
        updatedBy: "u",
      },
      {
        scopeType: "plan" as const,
        scopeId: "standard",
        key: def.key,
        value: 35,
        updatedAt: "t",
        updatedBy: "u",
      },
      {
        scopeType: "tenant" as const,
        scopeId: TENANT_A,
        key: def.key,
        value: 45,
        updatedAt: "t",
        updatedBy: "u",
      },
      {
        scopeType: "branch" as const,
        scopeId: "br1",
        key: def.key,
        value: 50,
        updatedAt: "t",
        updatedBy: "u",
      },
    ];
    expect(resolveSettingFromOverrides(def.key, overrides, { tenantId: TENANT_A, planKey: "standard" })?.effectiveValue).toBe(45);
    expect(
      resolveSettingFromOverrides(def.key, overrides, { tenantId: TENANT_A, planKey: "standard", branchId: "br1" })
        ?.sourceScope
    ).toBe("branch");
    expect(
      resolveSettingFromOverrides(def.key, overrides, { tenantId: TENANT_A, planKey: "standard", branchId: "br1" })
        ?.effectiveValue
    ).toBe(50);
    expect(resolveSettingFromOverrides(def.key, [], { tenantId: TENANT_A, planKey: "standard" })?.sourceScope).toBe(
      "platform"
    );
  });
});

describe("tenant izolasyonu", () => {
  it("Tenant A ayarı Tenant B'ye sızmaz", async () => {
    const a = await updateTenantSetting(hyper(), TENANT_A, {
      key: "institution.name",
      value: "Gizli A",
    });
    expect(a.ok).toBe(true);
    const settingsA = await getTenantSettings(hyper(), TENANT_A);
    const settingsB = await getTenantSettings(hyper(), TENANT_B);
    expect(settingsA.ok && settingsA.data.settings.find((s) => s.key === "institution.name")?.effectiveValue).toBe(
      "Gizli A"
    );
    expect(settingsB.ok && settingsB.data.settings.find((s) => s.key === "institution.name")?.effectiveValue).not.toBe(
      "Gizli A"
    );
  });

  it("SUPER_ADMIN başka tenant ayarını değiştiremez", async () => {
    const res = await updateTenantSetting(ctx("SUPER_ADMIN", TENANT_A), TENANT_B, {
      key: "institution.name",
      value: "Sızma",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });

  it("SUPER_ADMIN yalnız kendi tenant ayarını görür", async () => {
    await updateTenantSetting(hyper(), TENANT_A, { key: "contact.city", value: "İzmir" });
    const own = await getOwnInstitutionSettings(ctx("SUPER_ADMIN", TENANT_A));
    expect(own.ok).toBe(true);
    const other = await getTenantSettings(ctx("SUPER_ADMIN", TENANT_A), TENANT_B);
    expect(other.ok).toBe(false);
  });
});

describe("kritik ayar ve audit", () => {
  it("geçersiz ayar değeri reddedilir", async () => {
    const res = await updateTenantSetting(hyper(), TENANT_A, {
      key: "lessons.defaultDurationMinutes",
      value: 5,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("kritik ayar onaysız reddedilir, onaylı audit + hedef tenant yazar", async () => {
    const denied = await updateTenantSetting(hyper(), TENANT_A, {
      key: "makeup.windowDays",
      value: 21,
    });
    expect(denied.ok).toBe(false);

    const okRes = await updateTenantSetting(hyper(), TENANT_A, {
      key: "makeup.windowDays",
      value: 21,
      confirm: true,
    });
    expect(okRes.ok).toBe(true);
    const audit = await getPlatformAuditLog(hyper());
    expect(audit.ok).toBe(true);
    if (audit.ok) {
      const hit = audit.data.events.find((e) => e.action === "platform.setting.update" && e.entityId === "makeup.windowDays");
      expect(hit?.targetTenantId).toBe(TENANT_A);
      expect(hit?.actorRole).toBe("HYPER_ADMIN");
    }
  });
});

describe("feature flag", () => {
  it("kapalıysa backend mutasyonu reddedilir", async () => {
    const toggle = await updateTenantFeature(hyper(), DEFAULT_TENANT_ID, {
      flag: "homework",
      enabled: false,
    });
    expect(toggle.ok).toBe(true);
    const res = await createHomeworkTool(
      {
        role: "TEACHER",
        userId: "t1",
        tenantId: DEFAULT_TENANT_ID,
        teacherId: "t1",
        channel: "web",
      },
      { studentId: "s1", title: "x", dueDate: "2099-01-01" }
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("FORBIDDEN");
      expect(res.error.message).toBe(FEATURE_DISABLED_MESSAGE);
    }
  });

  it("SCHOOL_ADMIN kritik bayrağı değiştiremez", async () => {
    const res = await updateOwnInstitutionFeature(ctx("SCHOOL_ADMIN", TENANT_A), {
      flag: "payments",
      enabled: false,
      confirm: true,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });
});

describe("secret sızıntısı yok", () => {
  it("API cevabı ve audit orijinal sırrı içermez", async () => {
    const secret = "super-secret-value-9999";
    const res = await updateIntegrationForScope(hyper(), "tenant", TENANT_A, {
      provider: "gemini",
      secret,
      confirm: true,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(containsUnredactedSecret(res.data, secret)).toBe(false);
      expect(JSON.stringify(res.data)).not.toContain(secret);
      expect(res.data.integration.secretLast4).toBe("9999");
      expect(JSON.stringify(res.data)).not.toContain("super-secret-value");
    }
    const audit = await getPlatformAuditLog(hyper(), TENANT_A);
    expect(audit.ok).toBe(true);
    if (audit.ok) {
      expect(containsUnredactedSecret(audit.data, secret)).toBe(false);
    }
    const raw = await fs.readFile(PLATFORM_STORE_FILE, "utf-8").catch(() => "");
    expect(raw.includes(secret)).toBe(false);
  });

  it("redactSecrets anahtar adlarını maskeler", () => {
    const out = redactSecrets({ apiKey: "abcd1234", nested: { secret: "long-secret-value" } });
    expect(JSON.stringify(out)).not.toContain("abcd1234");
    expect(JSON.stringify(out)).not.toContain("long-secret-value");
  });
});

describe("parseSettingValue", () => {
  it("renk ve enum doğrular", () => {
    const color = SETTING_BY_KEY.get("institution.colorPrimary")!;
    expect(parseSettingValue(color, "not-a-color").ok).toBe(false);
    expect(parseSettingValue(color, "#ff00aa").ok).toBe(true);
  });
});

describe("HYPER_ADMIN login (POST /api/v1/auth/login)", () => {
  beforeEach(() => {
    __resetRateLimitForTests("auth-login-ip");
    __resetRateLimitForTests("auth-login-ip-email");
  });

  function loginReq(email: string, password: string) {
    return new Request("https://example.test/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.77" },
      body: JSON.stringify({ email, password }),
    });
  }

  it("varsayılan HYPER_ADMIN hesabı login şemasından geçer ve rol HYPER_ADMIN döner", async () => {
    const res = await loginPost(loginReq(DEV_HYPER_ADMIN_EMAIL, DEV_HYPER_ADMIN_PASSWORD));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      data?: { user?: { role?: string; email?: string } };
      error?: { message?: string };
    };
    expect(json.ok).toBe(true);
    expect(json.data?.user?.role).toBe("HYPER_ADMIN");
    expect(json.data?.user?.email).toBe(DEV_HYPER_ADMIN_EMAIL);
  });

  it("eski hyper@localhost adresi email doğrulamasında reddedilir", async () => {
    const res = await loginPost(loginReq("hyper@localhost", DEV_HYPER_ADMIN_PASSWORD));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: boolean; error?: { message?: string } };
    expect(json.ok).toBe(false);
    expect(json.error?.message).toBe("Invalid login payload");
  });
});

describe("platform API RBAC", () => {
  it("SUPER_ADMIN /api/v1/platform/dashboard için 403 alır", async () => {
    mockUser.value = { userId: "super", role: "SUPER_ADMIN", tenantId: DEFAULT_TENANT_ID };
    const { GET } = await import("../../app/api/v1/platform/dashboard/route");
    const res = await GET(new Request("http://localhost/api/v1/platform/dashboard"));
    expect(res.status).toBe(403);
  });

  it("SCHOOL_ADMIN, TEACHER, STUDENT platform API'de 403 alır", async () => {
    const { GET } = await import("../../app/api/v1/platform/dashboard/route");
    for (const role of ["SCHOOL_ADMIN", "TEACHER", "STUDENT"] as const) {
      mockUser.value = { userId: "x", role, tenantId: DEFAULT_TENANT_ID };
      const res = await GET(new Request("http://localhost/api/v1/platform/dashboard"));
      expect(res.status, role).toBe(403);
    }
  });

  it("HYPER_ADMIN dashboard 200 alır", async () => {
    mockUser.value = { userId: "user_hyper_admin", role: "HYPER_ADMIN", tenantId: PLATFORM_TENANT_ID };
    const { GET } = await import("../../app/api/v1/platform/dashboard/route");
    const res = await GET(new Request("http://localhost/api/v1/platform/dashboard"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.totals).toBeDefined();
  });
});

describe("APP_ROLES", () => {
  it("HYPER_ADMIN tanımlıdır", () => {
    expect(APP_ROLES).toContain("HYPER_ADMIN");
  });
});
