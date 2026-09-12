import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID, PLATFORM_TENANT_ID } from "../auth/config";
import type { AuthUser, AppRole } from "../auth/types";
import type { ServiceContext } from "../services/context";

/**
 * NeviiOS Control Center — güvenlik ve politika regresyonları.
 * STORE_MODE=json: kalıcı kullanıcı yazımı (rol değişikliği, davet kabulü,
 * kurulum) db-only olduğundan burada fail-closed davranışları doğrulanır.
 */

const mockUser: { value: AuthUser } = {
  value: { userId: "user_hyper_admin", role: "HYPER_ADMIN", tenantId: PLATFORM_TENANT_ID },
};
vi.mock("@/lib/auth/authenticate", () => ({
  authenticateRequest: async () => ({ ok: true, user: mockUser.value, via: "bearer" }),
}));

const sessionCtx: { value: ServiceContext | null } = { value: null };
vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth/session")>();
  return {
    ...actual,
    requireSessionContext: async () => {
      if (!sessionCtx.value) throw new Error("no session");
      return sessionCtx.value;
    },
    getSessionContext: async () => sessionCtx.value,
  };
});

const { resetPlatformStoreForTests, upsertPlatformTenant, listPlatformAudit, saveSupportSession, getInvitation, saveInvitation } =
  await import("../platform/store");
const { updateTenantSetting, updateTenantFeature, getTenantSettings, resetTenantSetting, updateIntegrationForScope, testIntegrationForScope } =
  await import("../platform/service");
const { previewRoleChange, assignRole, grantUserBranchAccess, revokeUserBranchAccess, inviteTenantUser, DB_ONLY_USER_WRITE_MESSAGE } =
  await import("../platform/users-admin");
const { resolveBranchScope, getBranchManagerOverview, canSeeInstitutionFinance, NO_BRANCH_SCOPE_MESSAGE } = await import(
  "../platform/branch-scope"
);
const { openSupportSession, endSupportSession, getSupportDataView } = await import("../platform/support-access");
const { setPlatformLogo, resetPlatformLogo, getPlatformLogo, validateLogoUpload, PLATFORM_LOGO_FALLBACK_PATH } = await import(
  "../platform/branding"
);
const { resolveTenantLimits, assertWithinLimit } = await import("../platform/entitlements");
const { resolveAllFeatures } = await import("../platform/resolve");
const {
  applyAppearancePolicy,
  applyStudentFormConfig,
  studentFormConfigSchema,
  renderMessageTemplate,
  messageTemplateSchema,
} = await import("../platform/policies");
const { snapshotPolicy } = await import("../platform/policy-snapshot");
const { createTenantDraft, provisionTenant, acceptOwnerInvitation, JSON_PROVISION_BLOCKED_MESSAGE } = await import(
  "../platform/provision"
);
const { requireHyperAdminPage } = await import("../platform/session");
const { PLATFORM_BRAND } = await import("../platform/brand");
const { createStudentTool, createHomeworkTool } = await import("../services/tools");
const { readData } = await import("../store");
const { runWithTenantAsync } = await import("../tenant-context");
const { hasPermission } = await import("../auth/rbac");
const { issueTokenPair } = await import("../auth/jwt");
const { __resetRateLimitForTests } = await import("../rate-limit");

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const TENANT_B = "tenant_b_neviios";
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]).toString("base64");

function ctx(role: AppRole, tenantId = DEFAULT_TENANT_ID, userId = "u1"): ServiceContext {
  return { role, userId, tenantId, channel: "web", requestId: "req_neviios" };
}
const hyper = () => ctx("HYPER_ADMIN", PLATFORM_TENANT_ID, "user_hyper_admin");

function req(url: string, method = "GET", body?: unknown) {
  return new Request(`http://localhost${url}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const seg = (params: Record<string, string>) => ({ params: Promise.resolve(params) });

const studentInput = (extra: Record<string, unknown> = {}) => ({
  name: "NeviiOS Test Öğrenci",
  email: "",
  phone: "0555 000 0000",
  parentName: "Veli",
  parentPhone: "0555 000 0001",
  branchId: "erzene",
  instrument: "Piyano",
  teacherId: "t1",
  packageName: "Bireysel Aylık — 4 ders",
  weeklyLessonCount: 1,
  monthlyFee: 3000,
  // NeviiHub kayıt formunun zorunlu alanları (ilk tahsilat + ders başlangıcı).
  firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: "2026-08-30" },
  enrollmentStartDate: "2026-09-01",
  ...extra,
});

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await resetPlatformStoreForTests();
  await upsertPlatformTenant({ tenantId: TENANT_B, name: "Akademi B", planKey: "starter" }, "seed");
  mockUser.value = { userId: "user_hyper_admin", role: "HYPER_ADMIN", tenantId: PLATFORM_TENANT_ID };
  sessionCtx.value = null;
});

afterEach(async () => {
  await resetPlatformStoreForTests();
});

// ───────────────────────── Route / API RBAC ─────────────────────────

describe("platform sayfa RBAC (layout'a güvenmez)", () => {
  it("SUPER_ADMIN / SCHOOL_ADMIN / BRANCH_MANAGER sayfa segmentinde 404 ile kesilir", async () => {
    for (const role of ["SUPER_ADMIN", "SCHOOL_ADMIN", "BRANCH_MANAGER", "TEACHER"] as const) {
      sessionCtx.value = ctx(role);
      await expect(requireHyperAdminPage("/platform/kurumlar"), role).rejects.toThrow();
    }
  });

  it("HYPER_ADMIN geçer", async () => {
    sessionCtx.value = hyper();
    await expect(requireHyperAdminPage("/platform")).resolves.toMatchObject({ role: "HYPER_ADMIN" });
  });
});

describe("platform API RBAC — yeni NeviiOS uçları (URL/API bypass)", () => {
  const routes: [string, () => Promise<{ GET?: unknown; POST?: unknown; PUT?: unknown; DELETE?: unknown }>, string][] = [
    ["members", () => import("../../app/api/v1/platform/tenants/[tenantId]/members/route"), "GET"],
    ["role", () => import("../../app/api/v1/platform/tenants/[tenantId]/members/role/route"), "POST"],
    ["branch-access", () => import("../../app/api/v1/platform/tenants/[tenantId]/members/branch-access/route"), "POST"],
    ["support", () => import("../../app/api/v1/platform/tenants/[tenantId]/support/route"), "POST"],
    ["support-view", () => import("../../app/api/v1/platform/tenants/[tenantId]/support/view/route"), "GET"],
    ["provision", () => import("../../app/api/v1/platform/tenants/[tenantId]/provision/route"), "POST"],
    ["invitations", () => import("../../app/api/v1/platform/tenants/[tenantId]/invitations/route"), "POST"],
    ["settings-reset", () => import("../../app/api/v1/platform/tenants/[tenantId]/settings/route"), "DELETE"],
    ["logo", () => import("../../app/api/v1/platform/branding/logo/route"), "PUT"],
    ["template-preview", () => import("../../app/api/v1/platform/templates/preview/route"), "POST"],
  ];

  it("kurum rolleri kendi tenant'larını URL'ye yazsalar bile 403 alır", async () => {
    for (const role of ["SUPER_ADMIN", "SCHOOL_ADMIN", "BRANCH_MANAGER", "TEACHER", "STUDENT"] as const) {
      mockUser.value = { userId: "x", role, tenantId: DEFAULT_TENANT_ID };
      for (const [name, load, method] of routes) {
        const mod = (await load()) as Record<string, (r: Request, s: unknown) => Promise<Response>>;
        const res = await mod[method]!(req(`/api/v1/platform/x`, method, method === "GET" ? undefined : {}), seg({ tenantId: DEFAULT_TENANT_ID }));
        expect(res.status, `${role} ${name}`).toBe(403);
      }
    }
  });

  it("HYPER_ADMIN üye listesine erişir, hedef tenant açıktır", async () => {
    const { GET } = await import("../../app/api/v1/platform/tenants/[tenantId]/members/route");
    const res = await GET(req(`/api/v1/platform/tenants/${DEFAULT_TENANT_ID}/members`), seg({ tenantId: DEFAULT_TENANT_ID }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.members.every((m: { role: string }) => m.role !== "HYPER_ADMIN")).toBe(true);
  });

  it("BRANCH_MANAGER kurum geneli API'lerde fail-closed 403 alır", async () => {
    mockUser.value = { userId: "bm1", role: "BRANCH_MANAGER", tenantId: DEFAULT_TENANT_ID };
    const { GET } = await import("../../app/api/v1/tahsilat/roi/route");
    expect((await GET(req("/api/v1/tahsilat/roi"))).status).toBe(403);
  });

  it("öğretmen/öğrenci kurum geneli tahsilat özetini okuyamaz (başlangıç açığı)", async () => {
    const { GET } = await import("../../app/api/v1/tahsilat/roi/route");
    const cases = await import("../../app/api/v1/tahsilat/cases/route");
    for (const role of ["TEACHER", "STUDENT"] as const) {
      mockUser.value = { userId: "x", role, tenantId: DEFAULT_TENANT_ID };
      expect((await GET(req("/api/v1/tahsilat/roi"))).status, role).toBe(403);
      expect((await cases.GET(req("/api/v1/tahsilat/cases"))).status, role).toBe(403);
    }
    mockUser.value = { userId: "a", role: "SCHOOL_ADMIN", tenantId: DEFAULT_TENANT_ID };
    expect((await GET(req("/api/v1/tahsilat/roi"))).status).toBe(200);
  });
});

describe("oturum yenileme — rol yükseltme / tenant kaçışı yok", () => {
  it("refresh token'daki eski/sahte rol değil, güncel kullanıcı rolü basılır", async () => {
    __resetRateLimitForTests();
    // Ezgi gerçekte SCHOOL_ADMIN; token SUPER_ADMIN (kurum sahibi) iddia ediyor.
    const tokens = await issueTokenPair({ userId: "user_manager_ezgi", role: "SUPER_ADMIN", tenantId: DEFAULT_TENANT_ID });
    const { POST } = await import("../../app/api/v1/auth/refresh/route");
    const res = await POST(req("/api/v1/auth/refresh", "POST", { refreshToken: tokens.refreshToken }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.user.role).toBe("SCHOOL_ADMIN");
  });

  it("farklı tenant iddiası taşıyan refresh reddedilir (SUPER_ADMIN istisnası yok)", async () => {
    const tokens = await issueTokenPair({ userId: "user_owner_nilufer", role: "SUPER_ADMIN", tenantId: TENANT_B });
    const { POST } = await import("../../app/api/v1/auth/refresh/route");
    const res = await POST(req("/api/v1/auth/refresh", "POST", { refreshToken: tokens.refreshToken }));
    expect(res.status).toBe(401);
  });
});

// ───────────────────────── Rol ayrımı / atama ─────────────────────────

describe("platform sahibi / kurum sahibi / şube müdürü ayrımı", () => {
  it("tenantlar arası yetki yalnız HYPER_ADMIN'de; BRANCH_MANAGER hiçbir kurum geneli izne sahip değil", () => {
    expect(hasPermission("HYPER_ADMIN", "tenant:all")).toBe(true);
    expect(hasPermission("SUPER_ADMIN", "tenant:all")).toBe(false);
    expect(hasPermission("SUPER_ADMIN", "platform:write")).toBe(false);
    expect(hasPermission("BRANCH_MANAGER", "students:read")).toBe(false);
    expect(hasPermission("BRANCH_MANAGER", "payments:write")).toBe(false);
  });

  it("kurum geneli finans yalnız kurum sahibi (+legacy yönetici)", () => {
    expect(canSeeInstitutionFinance("SUPER_ADMIN")).toBe(true);
    expect(canSeeInstitutionFinance("SCHOOL_ADMIN")).toBe(true);
    expect(canSeeInstitutionFinance("BRANCH_MANAGER")).toBe(false);
    expect(canSeeInstitutionFinance("TEACHER")).toBe(false);
  });
});

describe("rol atama — server-side doğrulama", () => {
  it("HYPER_ADMIN / TEACHER / AI_AGENT rolü atanamaz (şema)", async () => {
    for (const role of ["HYPER_ADMIN", "TEACHER", "AI_AGENT", "STUDENT"]) {
      const res = await assignRole(hyper(), DEFAULT_TENANT_ID, { userId: "user_admin", role, confirm: true });
      expect(res.ok, role).toBe(false);
      if (!res.ok) expect(res.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("kurum sahibi rol atayamaz/önizleyemez (platform işlemi)", async () => {
    const res = await previewRoleChange(ctx("SUPER_ADMIN"), DEFAULT_TENANT_ID, { userId: "user_admin", role: "SUPER_ADMIN" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });

  it("etki önizlemesi izin farkını ve uyarıları döner; varlık bağlantılı rol ve başka tenant engellenir", async () => {
    const res = await previewRoleChange(hyper(), DEFAULT_TENANT_ID, { userId: "user_admin", role: "BRANCH_MANAGER" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.impact.removedPermissions).toContain("payments:write");
      expect(res.data.impact.warnings.join(" ")).toContain("fail-closed");
      expect(res.data.impact.blockers).toHaveLength(0);
    }
    const teacher = await previewRoleChange(hyper(), DEFAULT_TENANT_ID, { userId: "user_teacher_t1", role: "SCHOOL_ADMIN" });
    expect(teacher.ok && teacher.data.impact.blockers.length).toBeGreaterThan(0);
    const other = await previewRoleChange(hyper(), TENANT_B, { userId: "user_admin", role: "SUPER_ADMIN" });
    expect(!other.ok && other.error.code).toBe("NOT_FOUND");
  });

  it("onaysız atama reddedilir; json modunda kalıcı yazım db-only fail-closed", async () => {
    const noConfirm = await assignRole(hyper(), DEFAULT_TENANT_ID, { userId: "user_admin", role: "BRANCH_MANAGER" });
    expect(!noConfirm.ok && noConfirm.error.details).toMatchObject({ requiresConfirm: true });
    const json = await assignRole(hyper(), DEFAULT_TENANT_ID, { userId: "user_admin", role: "BRANCH_MANAGER", confirm: true });
    expect(!json.ok && json.error.message).toBe(DB_ONLY_USER_WRITE_MESSAGE);
  });

  it("davet ile platform rolü verilemez; şube müdürü şubesiz davet edilemez", async () => {
    const h = await inviteTenantUser(hyper(), DEFAULT_TENANT_ID, { name: "X Y", email: "x@y.test", role: "HYPER_ADMIN" });
    expect(!h.ok && h.error.code).toBe("VALIDATION_ERROR");
    const bm = await inviteTenantUser(hyper(), DEFAULT_TENANT_ID, { name: "X Y", email: "x@y.test", role: "BRANCH_MANAGER" });
    expect(!bm.ok && bm.error.code).toBe("VALIDATION_ERROR");
    const foreign = await inviteTenantUser(hyper(), DEFAULT_TENANT_ID, {
      name: "X Y",
      email: "x@y.test",
      role: "BRANCH_MANAGER",
      branchIds: ["baska_kurumun_subesi"],
    });
    expect(!foreign.ok && foreign.error.code).toBe("NOT_FOUND");
  });
});

// ───────────────────────── Şube izolasyonu ─────────────────────────

describe("şube kapsamı — fail-closed ve çoklu şube", () => {
  const bm = () => ctx("BRANCH_MANAGER", DEFAULT_TENANT_ID, "user_admin");

  it("atama yoksa kurum geneline düşmez, reddedilir", async () => {
    const scope = await resolveBranchScope(bm());
    expect(!scope.ok && scope.error.message).toBe(NO_BRANCH_SCOPE_MESSAGE);
    const view = await runWithTenantAsync(DEFAULT_TENANT_ID, () => getBranchManagerOverview(bm()));
    expect(view.ok).toBe(false);
  });

  it("yalnız atanan şubenin öğrencilerini görür; ikinci şube eklenince ikisini; kaldırınca geri fail-closed", async () => {
    const g = await grantUserBranchAccess(hyper(), DEFAULT_TENANT_ID, { userId: "user_admin", branchId: "erzene" });
    expect(g.ok).toBe(true);
    // İdempotent: aynı atama ikinci satır üretmez.
    await grantUserBranchAccess(hyper(), DEFAULT_TENANT_ID, { userId: "user_admin", branchId: "erzene" });
    const scope = await resolveBranchScope(bm());
    expect(scope.ok && scope.data).toEqual({ mode: "branches", branchIds: ["erzene"] });

    const all = await readData();
    const view = await runWithTenantAsync(DEFAULT_TENANT_ID, () => getBranchManagerOverview(bm()));
    expect(view.ok).toBe(true);
    if (view.ok) {
      expect(view.data.students.length).toBeGreaterThan(0);
      expect(view.data.students.every((s) => s.branchId === "erzene")).toBe(true);
      expect(view.data.students.length).toBeLessThan(all.students.length);
      expect(JSON.stringify(view.data)).not.toContain("monthlyFee");
    }

    await grantUserBranchAccess(hyper(), DEFAULT_TENANT_ID, { userId: "user_admin", branchId: "evka3" });
    const two = await resolveBranchScope(bm());
    expect(two.ok && two.data.mode === "branches" && two.data.branchIds.sort()).toEqual(["erzene", "evka3"]);

    await revokeUserBranchAccess(hyper(), DEFAULT_TENANT_ID, { userId: "user_admin", branchId: "erzene" });
    await revokeUserBranchAccess(hyper(), DEFAULT_TENANT_ID, { userId: "user_admin", branchId: "evka3" });
    expect((await resolveBranchScope(bm())).ok).toBe(false);
  });

  it("başka kurumun şubesi / kullanıcısı atanamaz (tenant izolasyonu)", async () => {
    const res = await grantUserBranchAccess(hyper(), DEFAULT_TENANT_ID, { userId: "user_admin", branchId: "yok_sube" });
    expect(!res.ok && res.error.code).toBe("NOT_FOUND");
    const cross = await grantUserBranchAccess(hyper(), TENANT_B, { userId: "user_admin", branchId: "erzene" });
    expect(!cross.ok && cross.error.code).toBe("NOT_FOUND");
    const byOwner = await grantUserBranchAccess(ctx("SUPER_ADMIN"), DEFAULT_TENANT_ID, { userId: "user_admin", branchId: "erzene" });
    expect(!byOwner.ok && byOwner.error.code).toBe("FORBIDDEN");
  });
});

// ───────────────── Paket / entitlement / feature / permission ─────────────────

describe("paket ≠ entitlement ≠ feature flag ≠ permission", () => {
  it("pakette olmayan modül feature flag ile açılamaz; eklenti ile açılır", async () => {
    const denied = await updateTenantFeature(hyper(), TENANT_B, { flag: "whatsapp", enabled: true, confirm: true });
    expect(!denied.ok && denied.error.code).toBe("FORBIDDEN");
    const addon = await updateTenantSetting(hyper(), TENANT_B, { key: "subscription.addons", value: ["whatsapp"], confirm: true });
    expect(addon.ok).toBe(true);
    const flags = await resolveAllFeatures(TENANT_B);
    const wa = flags.find((f) => f.key === "whatsapp")!;
    expect(wa.entitled).toBe(true);
    expect(wa.entitlementSource).toBe("addon");
    expect(wa.enabled).toBe(true);
  });

  it("entitlement override false paket modülünü backend'de de kapatır", async () => {
    const res = await updateTenantSetting(hyper(), DEFAULT_TENANT_ID, {
      key: "subscription.entitlementOverrides",
      value: { homework: false },
      confirm: true,
    });
    expect(res.ok).toBe(true);
    const hw = await createHomeworkTool(
      { role: "TEACHER", userId: "t1", tenantId: DEFAULT_TENANT_ID, teacherId: "t1", channel: "web" },
      { studentId: "s1", title: "x", dueDate: "2099-01-01" }
    );
    expect(!hw.ok && hw.error.code).toBe("FORBIDDEN");
    // Kurum sahibi entitlement'ı feature flag ile geri açamaz.
    const reopen = await updateTenantFeature(ctx("SUPER_ADMIN"), DEFAULT_TENANT_ID, { flag: "homework", enabled: true });
    expect(!reopen.ok && reopen.error.code).toBe("FORBIDDEN");
  });

  it("ticari hak kullanıcı iznini vermez: HYPER_ADMIN ödeme yazamaz", () => {
    expect(hasPermission("HYPER_ADMIN", "payments:write")).toBe(false);
  });

  it("platformOnly ayarları (paket, görünüm) kurum sahibi yazamaz ama okuyabilir", async () => {
    for (const key of ["subscription.addons", "appearance.mode", "institution.type", "auth.passwordMinLength"]) {
      const value = key === "subscription.addons" ? ["sms"] : key === "auth.passwordMinLength" ? 12 : key === "institution.type" ? "sports" : "dark_only";
      const res = await updateTenantSetting(ctx("SUPER_ADMIN"), DEFAULT_TENANT_ID, { key, value, confirm: true });
      expect(!res.ok && res.error.code, key).toBe("FORBIDDEN");
    }
    const read = await getTenantSettings(ctx("SUPER_ADMIN"), DEFAULT_TENANT_ID);
    expect(read.ok && read.data.settings.some((s) => s.key === "appearance.mode" && s.platformOnly)).toBe(true);
  });

  it("şemasız / geçersiz json ayar reddedilir", async () => {
    const bad = await updateTenantSetting(hyper(), DEFAULT_TENANT_ID, {
      key: "subscription.entitlementOverrides",
      value: { olmayanModul: true },
      confirm: true,
    });
    expect(!bad.ok && bad.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("limitler — veri silinmez, yalnız yeni kayıt engellenir", () => {
  it("starter paketi limitleri ve override", async () => {
    expect((await resolveTenantLimits(TENANT_B)).students).toBe(100);
    const until = new Date(Date.now() + 86_400_000).toISOString();
    await updateTenantSetting(hyper(), TENANT_B, {
      key: "subscription.limitOverrides",
      value: {
        students: { value: 150, reason: "Pilot dönem geçici artış", expiresAt: until },
        users: { value: null, reason: "Kurumsal anlaşma kapsamında", expiresAt: until },
      },
      confirm: true,
    });
    const l = await resolveTenantLimits(TENANT_B);
    expect(l.students).toBe(150);
    expect(l.users).toBeNull();
    const at = await assertWithinLimit(TENANT_B, "students", 150);
    expect(!at.ok && at.error.message).toContain("Mevcut veriler korunur");
  });

  it("personel limiti öğrenci/veli portal hesaplarını saymaz", async () => {
    const { getTenantSubscription } = await import("../platform/service");
    const sub = await getTenantSubscription(hyper(), DEFAULT_TENANT_ID);
    expect(sub.ok).toBe(true);
    if (sub.ok) {
      // Demo kurumu: 2 kurum sahibi + 2 yönetici + 1 şube müdürü (Nihal, tur 3) + 7 öğretmen = 12 personel (öğrenci/veli/AI hariç).
      expect(sub.data.usage.users).toBe(12);
    }
  });

  it("limit dolunca createStudentTool yeni kaydı reddeder, mevcut öğrenciler kalır", async () => {
    const before = await readData();
    const active = before.students.filter((s) => s.active !== false).length;
    await updateTenantSetting(hyper(), DEFAULT_TENANT_ID, {
      key: "subscription.limitOverrides",
      value: { students: { value: active, reason: "Limit testi için sabitlendi", expiresAt: new Date(Date.now() + 86_400_000).toISOString() } },
      confirm: true,
    });
    const res = await createStudentTool(ctx("SCHOOL_ADMIN"), studentInput());
    expect(!res.ok && res.error.code).toBe("FORBIDDEN");
    expect((await readData()).students.length).toBe(before.students.length);
  });
});

// ───────────────────────── Form konfigürasyonu ─────────────────────────

describe("Yeni Öğrenci Kaydı konfigürasyonu — sunucuda uygulanır", () => {
  it("çekirdek alan konfigüre edilemez; gizli alan zorunlu olamaz; bilinmeyen koşul reddedilir", () => {
    expect(studentFormConfigSchema.safeParse({ fields: [{ key: "name", visible: false, required: false, order: 0 }] }).success).toBe(false);
    expect(studentFormConfigSchema.safeParse({ fields: [{ key: "email", visible: false, required: true, order: 0 }] }).success).toBe(false);
    expect(
      studentFormConfigSchema.safeParse({
        fields: [{ key: "email", visible: true, required: false, order: 0, visibleWhen: { field: "yok", equals: "x" } }],
      }).success
    ).toBe(false);
  });

  it("zorunlu alan eksikse kayıt reddedilir; varsayılan uygulanır; gizli alan yazılamaz", async () => {
    const save = await updateTenantSetting(hyper(), DEFAULT_TENANT_ID, {
      key: "forms.studentRegistration",
      value: {
        fields: [
          { key: "birthDate", visible: true, required: true, order: 1 },
          { key: "level", visible: true, required: false, order: 2, defaultValue: "Başlangıç" },
          { key: "address", visible: false, required: false, order: 3 },
        ],
      },
      confirm: true,
    });
    expect(save.ok).toBe(true);
    const missing = await createStudentTool(ctx("SCHOOL_ADMIN"), studentInput());
    expect(!missing.ok && missing.error.message).toContain("Doğum tarihi");

    const created = await createStudentTool(ctx("SCHOOL_ADMIN"), studentInput({ birthDate: "2015-05-05", address: "Gizli adres" }));
    expect(created.ok).toBe(true);
    if (created.ok) {
      const st = (await readData()).students.find((s) => s.id === created.data.studentId)!;
      expect(st.level).toBe("Başlangıç");
      expect(st.address).toBeUndefined();
    }
  });

  it("rol bazlı düzenleme ve koşullu görünürlük", () => {
    const cfg = {
      fields: [
        { key: "specialNotes" as const, visible: true, required: false, order: 0, editableBy: ["SUPER_ADMIN" as const] },
        { key: "targetExam" as const, visible: true, required: true, order: 1, visibleWhen: { field: "level", equals: "İleri" } },
      ],
    };
    expect(applyStudentFormConfig(cfg, { specialNotes: "x" }, "SCHOOL_ADMIN").ok).toBe(false);
    expect(applyStudentFormConfig(cfg, { specialNotes: "x", level: "Başlangıç" }, "SUPER_ADMIN").ok).toBe(true);
    expect(applyStudentFormConfig(cfg, { level: "İleri" }, "SUPER_ADMIN").ok).toBe(false);
  });
});

// ───────────────────────── Appearance ─────────────────────────

describe("görünüm politikası", () => {
  it("light_only koyu profili düşürür, dark_only zorlar, sabit tema/font kilitler", () => {
    const req = { profile: "obsidian" as const, font: "inter" as const };
    expect(applyAppearancePolicy({ mode: "light_only", fixedTheme: "none", fontPolicy: "user_choice" }, req).profile).toBe("gold");
    expect(applyAppearancePolicy({ mode: "dark_only", fixedTheme: "none", fontPolicy: "user_choice" }, { ...req, profile: "atolye" }).profile).toBe("obsidian");
    const fixed = applyAppearancePolicy({ mode: "light_and_dark", fixedTheme: "atolye", fontPolicy: "playfair_display" }, req);
    expect(fixed).toMatchObject({ profile: "atolye", font: "playfair_display", profileLocked: true, fontLocked: true });
    expect(applyAppearancePolicy({ mode: "light_and_dark", fixedTheme: "none", fontPolicy: "user_choice" }, req).profile).toBe("obsidian");
  });

  it("çelişen politika (dark_only + açık sabit tema) sunucuda reddedilir", async () => {
    expect((await updateTenantSetting(hyper(), DEFAULT_TENANT_ID, { key: "appearance.mode", value: "dark_only" })).ok).toBe(true);
    const bad = await updateTenantSetting(hyper(), DEFAULT_TENANT_ID, { key: "appearance.fixedTheme", value: "gold" });
    expect(!bad.ok && bad.error.code).toBe("VALIDATION_ERROR");
  });

  it("override sıfırlanınca değer üst katmandan miras alınır ve audit yazılır", async () => {
    await updateTenantSetting(hyper(), DEFAULT_TENANT_ID, { key: "appearance.mode", value: "light_only" });
    const reset = await resetTenantSetting(hyper(), DEFAULT_TENANT_ID, { key: "appearance.mode" });
    expect(reset.ok && reset.data.setting?.effectiveValue).toBe("light_and_dark");
    const audit = await listPlatformAudit({ targetTenantId: DEFAULT_TENANT_ID });
    expect(audit.some((e) => e.action === "platform.setting.reset")).toBe(true);
  });
});

// ───────────────────────── Platform logosu ─────────────────────────

describe("platform logosu — yetki, doğrulama, fallback, bağımsızlık", () => {
  it("yalnız HYPER_ADMIN değiştirir", async () => {
    for (const role of ["SUPER_ADMIN", "SCHOOL_ADMIN"] as const) {
      const res = await setPlatformLogo(ctx(role), { mime: "image/png", dataBase64: PNG });
      expect(!res.ok && res.error.code, role).toBe("FORBIDDEN");
    }
  });

  it("SVG, tür/içerik uyuşmazlığı ve büyük dosya reddedilir", () => {
    expect(validateLogoUpload("image/svg+xml", Buffer.from("<svg onload=alert(1)>").toString("base64")).ok).toBe(false);
    expect(validateLogoUpload("image/png", Buffer.from("GIF89a....").toString("base64")).ok).toBe(false);
    expect(validateLogoUpload("image/png", Buffer.concat([Buffer.from(PNG, "base64"), Buffer.alloc(210 * 1024)]).toString("base64")).ok).toBe(false);
    expect(validateLogoUpload("image/png", PNG).ok).toBe(true);
  });

  it("yükle → public uç nosniff ile sunar; sıfırla → build-time fallback; audit yazılır", async () => {
    const { GET } = await import("../../app/api/v1/branding/platform-logo/route");
    expect((await GET(req("/api/v1/branding/platform-logo"))).status).toBe(302);

    const up = await setPlatformLogo(hyper(), { mime: "image/png", dataBase64: PNG });
    expect(up.ok).toBe(true);
    const res = await GET(req("/api/v1/branding/platform-logo"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");

    await resetPlatformLogo(hyper());
    expect(await getPlatformLogo()).toBeNull();
    const after = await GET(req("/api/v1/branding/platform-logo"));
    expect(after.status).toBe(302);
    expect(after.headers.get("location")).toContain(PLATFORM_LOGO_FALLBACK_PATH);

    const actions = (await listPlatformAudit({})).map((e) => e.action);
    expect(actions).toContain("platform.logo.update");
    expect(actions).toContain("platform.logo.reset");
  });

  it("kurum logosu ile platform logosu birbirini etkilemez", async () => {
    await updateTenantSetting(hyper(), DEFAULT_TENANT_ID, { key: "institution.logoUrl", value: "https://kurum.test/logo.png" });
    await setPlatformLogo(hyper(), { mime: "image/png", dataBase64: PNG });
    const s = await getTenantSettings(hyper(), DEFAULT_TENANT_ID);
    expect(s.ok && s.data.settings.find((x) => x.key === "institution.logoUrl")?.effectiveValue).toBe("https://kurum.test/logo.png");
    await resetPlatformLogo(hyper());
    const s2 = await getTenantSettings(hyper(), DEFAULT_TENANT_ID);
    expect(s2.ok && s2.data.settings.find((x) => x.key === "institution.logoUrl")?.effectiveValue).toBe("https://kurum.test/logo.png");
    expect(s2.ok && s2.data.settings.some((x) => x.key === "platform.logo")).toBe(false);
  });
});

// ───────────────────────── Provisioning ─────────────────────────

describe("kurum provisioning — idempotent, yarım veri yok", () => {
  const draft = {
    name: "Deneme Spor Okulu",
    idempotencyKey: "wiz_neviios_test_0001",
    firstBranch: { name: "Merkez", address: "Adres 1", phone: "0555 111 2233", workingDays: [1, 2, 3], lessonDurationMinutes: 45 },
    owner: { name: "Kurum Sahibi", email: "sahip@deneme.test" },
  };

  it("aynı idempotency anahtarı ikinci kurum üretmez; aynı slug çakışır", async () => {
    const a = await createTenantDraft(hyper(), draft);
    const b = await createTenantDraft(hyper(), draft);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(b.data.tenant.tenantId).toBe(a.data.tenant.tenantId);
      expect(b.data.replayed).toBe(true);
    }
    const dup = await createTenantDraft(hyper(), { ...draft, idempotencyKey: "wiz_neviios_test_0002" });
    expect(!dup.ok && dup.error.code).toBe("CONFLICT");
  });

  it("kurum sahibi taslak/kurulum yapamaz", async () => {
    const res = await createTenantDraft(ctx("SUPER_ADMIN"), draft);
    expect(!res.ok && res.error.code).toBe("FORBIDDEN");
  });

  it("json modunda kurulum fail-closed: taslakta kalır, 'denied' audit yazar", async () => {
    const a = await createTenantDraft(hyper(), draft);
    if (!a.ok) throw new Error("draft");
    const p = await provisionTenant(hyper(), a.data.tenant.tenantId);
    expect(!p.ok && p.error.message).toBe(JSON_PROVISION_BLOCKED_MESSAGE);
    const audit = await listPlatformAudit({ targetTenantId: a.data.tenant.tenantId });
    expect(audit.some((e) => e.action === "platform.tenant.provision" && e.outcome === "denied")).toBe(true);
    const { getPlatformTenant } = await import("../platform/store");
    expect((await getPlatformTenant(a.data.tenant.tenantId))?.lifecycle).toBe("draft");
  });

  it("json modunda davet kabulü daveti YAKMAZ", async () => {
    const { issueOwnerInvitation } = await import("../platform/provision");
    await upsertPlatformTenant({ tenantId: "tenant_inv", name: "Davet Kurum", lifecycle: "active" }, "seed");
    const inv = await issueOwnerInvitation(hyper(), "tenant_inv", { name: "Sahip", email: "sahip@davet.test" });
    expect(inv.ok).toBe(true);
    if (!inv.ok) return;
    expect(inv.data.invitation.role).toBe("SUPER_ADMIN");
    const acc = await acceptOwnerInvitation(inv.data.invitation.id, { token: inv.data.rawToken, password: "guclu-parola-123" });
    expect(acc.ok).toBe(false);
    expect((await getInvitation(inv.data.invitation.id))?.usedAt).toBeNull();
  });

  it("davet kaydındaki rol HYPER_ADMIN'e çevrilse bile kabul reddedilir", async () => {
    const { issueOwnerInvitation } = await import("../platform/provision");
    await upsertPlatformTenant({ tenantId: "tenant_inv2", name: "Davet Kurum 2", lifecycle: "active" }, "seed");
    const inv = await issueOwnerInvitation(hyper(), "tenant_inv2", { name: "Sahip", email: "sahip2@davet.test" });
    if (!inv.ok) throw new Error("invite");
    const row = (await getInvitation(inv.data.invitation.id))!;
    await saveInvitation({ ...row, role: "HYPER_ADMIN" });
    const acc = await acceptOwnerInvitation(row.id, { token: inv.data.rawToken, password: "guclu-parola-123" });
    expect(!acc.ok && acc.error.message).toBe("Davet rolü geçersiz.");
  });
});

// ───────────────────────── Destek erişimi + audit ─────────────────────────

describe("destek erişimi — süreli, gerekçeli, audit'li", () => {
  it("gerekçesiz / 4 saatten uzun oturum reddedilir; kurum rolü açamaz", async () => {
    expect((await openSupportSession(hyper(), DEFAULT_TENANT_ID, { reason: "kısa" })).ok).toBe(false);
    expect((await openSupportSession(hyper(), DEFAULT_TENANT_ID, { reason: "Destek talebi #1234 inceleme", durationMinutes: 600 })).ok).toBe(false);
    expect((await openSupportSession(ctx("SUPER_ADMIN"), DEFAULT_TENANT_ID, { reason: "Destek talebi #1234 inceleme" })).ok).toBe(false);
  });

  it("oturum yoksa veri görülemez; açık → görüntüleme audit'lenir; kapatınca yine kapalı", async () => {
    expect((await getSupportDataView(hyper(), DEFAULT_TENANT_ID)).ok).toBe(false);
    const open = await openSupportSession(hyper(), DEFAULT_TENANT_ID, { reason: "Destek talebi #1234 inceleme", durationMinutes: 30 });
    expect(open.ok).toBe(true);
    const dup = await openSupportSession(hyper(), DEFAULT_TENANT_ID, { reason: "Destek talebi #1234 inceleme" });
    expect(!dup.ok && dup.error.code).toBe("CONFLICT");
    const view = await getSupportDataView(hyper(), DEFAULT_TENANT_ID);
    expect(view.ok && view.data.counts.students).toBeGreaterThan(0);
    if (!open.ok) return;
    await endSupportSession(hyper(), DEFAULT_TENANT_ID, { sessionId: open.data.session.id });
    expect((await getSupportDataView(hyper(), DEFAULT_TENANT_ID)).ok).toBe(false);
    const actions = (await listPlatformAudit({ targetTenantId: DEFAULT_TENANT_ID })).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["platform.support.open", "platform.support.view", "platform.support.end"]));
  });

  it("süresi dolan oturum otomatik kapanır", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    await saveSupportSession({
      id: "sup_expired",
      tenantId: DEFAULT_TENANT_ID,
      actorUserId: "user_hyper_admin",
      reason: "Eski destek oturumu testi",
      startedAt: past,
      expiresAt: past,
      endedAt: null,
      endedBy: null,
    });
    expect((await getSupportDataView(hyper(), DEFAULT_TENANT_ID)).ok).toBe(false);
  });

  it("şube erişimi ve rol önizleme olayları audit'e hedef kurumla yazılır", async () => {
    await grantUserBranchAccess(hyper(), DEFAULT_TENANT_ID, { userId: "user_admin", branchId: "erzene" });
    const e = (await listPlatformAudit({ targetTenantId: DEFAULT_TENANT_ID })).find((x) => x.action === "platform.branch_access.grant");
    expect(e?.actorRole).toBe("HYPER_ADMIN");
    expect(e?.after).toMatchObject({ userId: "user_admin", branchId: "erzene" });
  });
});

// ───────────────────────── Dürüstlük / diğer ─────────────────────────

describe("entegrasyon durumu sahte başarı iddia etmez", () => {
  it("secret 'saklandı' denmez; bağlantı testi gerçek çağrı yapmadığı için 'connected' dönmez", async () => {
    const res = await updateIntegrationForScope(hyper(), "tenant", DEFAULT_TENANT_ID, { provider: "netgsm", secret: "abcdefgh1234", confirm: true });
    expect(res.ok && res.data.storedSecret).toBe(false);
    const t = await testIntegrationForScope(hyper(), "tenant", DEFAULT_TENANT_ID, { provider: "netgsm" });
    expect(t.ok && t.data.integration.status).not.toBe("connected");
  });
});

describe("politika snapshot ve şablon güvenliği", () => {
  it("snapshot derin kopyadır ve içerik parmak izi taşır", () => {
    const policy = { billingModel: "monthly", lateFeePercent: 5 };
    const snap = snapshotPolicy("policy.finance", policy);
    policy.lateFeePercent = 50;
    expect((snap.value as { lateFeePercent: number }).lateFeePercent).toBe(5);
    expect(snapshotPolicy("policy.finance", { lateFeePercent: 5, billingModel: "monthly" }).version).toBe(snap.version);
  });

  it("şablon değişkenleri HTML kaçışlı; bilinmeyen değişken reddedilir", () => {
    const out = renderMessageTemplate({ subject: "Merhaba {{adSoyad}}", body: "Kurum: {{kurumAdi}}" }, { kurumAdi: "<script>x</script>" });
    expect(out.html).not.toContain("<script>");
    expect(messageTemplateSchema.safeParse({ subject: "abc {{sifre}}", body: "0123456789 gövde" }).success).toBe(false);
  });
});

describe("marka yazımı", () => {
  it("platform markası NeviiHub; platform ekranlarında 'Nevii Hub' / 'NEVİİHUB' yok", async () => {
    expect(PLATFORM_BRAND.name).toBe("NeviiHub");
    const roots = ["src/app/platform", "src/components/platform", "src/lib/platform"];
    const offenders: string[] = [];
    async function walk(dir: string) {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(p);
        else if (/\.(ts|tsx)$/.test(entry.name)) {
          const src = await fs.readFile(p, "utf-8");
          if (/Nevii Hub|NEVİİHUB|NEVIIHUB/.test(src)) offenders.push(p);
          // lang="tr" + CSS uppercase → "NeviiHub" tarayıcıda "NEVİİHUB" olur.
          if (/uppercase[^>]*>\s*\{PLATFORM_BRAND\.name\}/.test(src)) offenders.push(`${p} (uppercase)`);
        }
      }
    }
    for (const r of roots) await walk(path.join(process.cwd(), r));
    expect(offenders).toEqual([]);
  });
});

describe("migration güvenliği", () => {
  it("NeviiOS migration'ı additive: DROP içermez, yeni kolonlar nullable", async () => {
    const sql = await fs.readFile(
      path.join(process.cwd(), "prisma/migrations/20260913140000_neviios_control_center/migration.sql"),
      "utf-8"
    );
    const code = sql
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    expect(code).not.toMatch(/\bDROP\b/i);
    // NeviiHub birleşiminde tek kanonik migration: OwnerInvitation yeni tablo, rol/şube kolonları nullable.
    const invite = code.slice(code.indexOf('CREATE TABLE IF NOT EXISTS "OwnerInvitation"'));
    expect(invite).toMatch(/"role" TEXT,/);
    expect(invite).toMatch(/"branchIds" JSONB,/);
  });
});
