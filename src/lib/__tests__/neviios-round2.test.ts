import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs, existsSync } from "fs";
import path from "path";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID, PLATFORM_TENANT_ID, DEV_HYPER_ADMIN_EMAIL, DEV_HYPER_ADMIN_PASSWORD } from "../auth/config";
import type { AppRole } from "../auth/types";
import type { ServiceContext } from "../services/context";

/**
 * NeviiOS tur 2 — gerçek JWT ile (authenticate mock'u YOK): API/route
 * bypass, oturum iptali, kullanıcı yaşam döngüsü, rol matrisi, şube
 * müdürü izinleri, mobil policy, paket limitleri, sürüm/geri alma, arama.
 */

// İstemci bileşeni SSR render'ı için router stub'ı (app router dışında).
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));

const { resetPlatformStoreForTests, listPlatformAudit, upsertPlatformTenant } = await import("../platform/store");
const { invalidateSessionValidity, isSessionClaimValid } = await import("../auth/session-validity");
const { issueTokenPair, verifyAccessToken } = await import("../auth/jwt");
const { authenticateUser, getUserById } = await import("../auth/users");
const { BRAND } = await import("../brand");
const { PLATFORM_LOGO_FALLBACK_PATH, setPlatformLogo, getPlatformLogo } = await import("../platform/branding");
const lifecycle = await import("../platform/user-lifecycle");
const { platformSearch, maskEmail } = await import("../platform/search");
const matrix = await import("../platform/permission-matrix");
const { resolveGrants, requireGrant } = await import("../platform/permissions");
const { grantUserBranchAccess } = await import("../platform/users-admin");
const { saveCustomRole } = await import("../platform/custom-roles");
const { updateTenantSetting, updateTenantFeature, getTenantSettings } = await import("../platform/service");
const { getMobilePolicy } = await import("../platform/mobile-policy");
const { PLAN_CATALOG, resolveTenantLimits } = await import("../platform/entitlements");
const policyVersions = await import("../platform/policy-versions");
const { listPolicyVersions, saveUserLifecycle } = await import("../platform/store-ext");
const { applyAppearancePolicy, isProfileAllowed } = await import("../platform/policies");
const tools = await import("../services/tools");
const { readData } = await import("../store");
const { runWithTenantAsync } = await import("../tenant-context");
const { __resetRateLimitForTests } = await import("../rate-limit");
const { PlatformUserMenu } = await import("../../components/platform/platform-user-menu");

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const ROOT = process.cwd();
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]).toString("base64");
const PNG2 = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(48, 2)]).toString("base64");
const FUTURE = () => new Date(Date.now() + 86_400_000).toISOString();

function ctx(role: AppRole, tenantId = DEFAULT_TENANT_ID, userId = "u1"): ServiceContext {
  return { role, userId, tenantId, channel: "web", requestId: "req_r2" };
}
const hyper = () => ctx("HYPER_ADMIN", PLATFORM_TENANT_ID, "user_hyper_admin");

async function bearer(userId: string, role: AppRole, tenantId: string) {
  return (await issueTokenPair({ userId, role, tenantId })).accessToken;
}
function req(url: string, token: string | null, method = "GET", body?: unknown) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new Request(`http://localhost${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const seg = (params: Record<string, string>) => ({ params: Promise.resolve(params) });

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await resetPlatformStoreForTests();
  invalidateSessionValidity();
  __resetRateLimitForTests();
});
afterEach(async () => {
  await resetPlatformStoreForTests();
  invalidateSessionValidity();
});

// ───────────────────────── Logo / marka ─────────────────────────

describe("logo ve marka", () => {
  it("BRAND varlıklarının hepsi diskte var; maestron-* referansı kalmadı; canonical /brand/logo.png (NeviiHub marka seti)", async () => {
    expect(BRAND.logoPath).toBe("/brand/logo.png");
    expect(BRAND.name).toBe("NeviiHub");
    for (const v of Object.values(BRAND)) {
      if (typeof v === "string" && v.startsWith("/brand/")) expect(existsSync(path.join(ROOT, "public", v)), v).toBe(true);
    }
    const offenders: string[] = [];
    async function walk(dir: string) {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (!p.includes("__tests__")) await walk(p);
        } else if (/\.(tsx?|css)$/.test(e.name)) {
          const src = await fs.readFile(p, "utf-8");
          if (/\/brand\/maestron-/.test(src)) offenders.push(p);
          // Yazım ("NeviiHub") ve uppercase kuralının kanonik sahibi brand-spelling.test.ts'tir
          // (yorum satırlarını ayırt eder); burada yinelenmez.
        }
      }
    }
    await walk(path.join(ROOT, "src"));
    expect(offenders).toEqual([]);
  });

  it("platform logo ayarı yoksa görünür logo /brand/logo.png'e döner; favicon ayrı build-time varlık", async () => {
    expect(PLATFORM_LOGO_FALLBACK_PATH).toBe("/brand/logo.png");
    expect(BRAND.faviconPath).toBe("/icon.png");
    expect(existsSync(path.join(ROOT, "src/app/icon.png"))).toBe(true);
    const { GET } = await import("../../app/api/v1/branding/platform-logo/route");
    const res = await GET(req("/api/v1/branding/platform-logo", null));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toMatch(/\/brand\/logo\.png$/);
  });

  it("kurum logosu ile platform logosu bağımsız", async () => {
    await updateTenantSetting(hyper(), DEFAULT_TENANT_ID, { key: "institution.logoUrl", value: "https://kurum.test/l.png" });
    await setPlatformLogo(hyper(), { mime: "image/png", dataBase64: PNG });
    const s = await getTenantSettings(hyper(), DEFAULT_TENANT_ID);
    expect(s.ok && s.data.settings.find((x) => x.key === "institution.logoUrl")?.effectiveValue).toBe("https://kurum.test/l.png");
  });
});

// ───────────────────────── Kullanıcı menüsü / görünüm ─────────────────────────

describe("sağ üst kullanıcı menüsü", () => {
  const props = { email: "hyper@nevii-hub.test", displayName: "Hıdırcan Yağız", roleLabel: "Platform Yöneticisi", profile: "gold" as const, font: "inter" as const };

  it("erişilebilir tetikleyici: aria-haspopup=menu, aria-expanded, etiket", () => {
    const html = renderToString(createElement(PlatformUserMenu, { ...props, policy: { mode: "light_and_dark", fixedTheme: "none", fontPolicy: "user_choice" } }));
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Kullanıcı menüsü"');
  });

  it("klavye ve politika davranışı kaynakta tanımlı (Escape odak iadesi, ok tuşları, kilitli font)", async () => {
    const src = await fs.readFile(path.join(ROOT, "src/components/platform/platform-user-menu.tsx"), "utf-8");
    expect(src).toMatch(/e\.key === "Escape"[\s\S]*triggerRef\.current\?\.focus\(\)/);
    expect(src).toContain("ArrowDown");
    expect(src).toContain("disabled={effective.fontLocked}");
    expect(src).toContain('role="menu"');
  });

  it("appearance policy sınırları: dark_only açık temayı, sabit font font seçimini kilitler", () => {
    const dark = { mode: "dark_only" as const, fixedTheme: "none" as const, fontPolicy: "noto_sans" as const };
    expect(isProfileAllowed(dark, "gold")).toBe(false);
    expect(applyAppearancePolicy(dark, { profile: "gold", font: "inter" })).toMatchObject({ profile: "obsidian", font: "noto_sans", fontLocked: true });
    expect(isProfileAllowed({ mode: "light_only", fixedTheme: "none", fontPolicy: "user_choice" }, "obsidian")).toBe(false);
  });
});

// ───────────────────────── Navigasyon ─────────────────────────

describe("Kurumlar menüsü", () => {
  it("'Yeni kurum' navigasyonda yok; route registry'de gizli kayıtlı; Kurumlar ekranında HYPER aksiyonu var", async () => {
    const grants = matrix.systemGrantsForLoginRole("HYPER_ADMIN");
    const nav = matrix.screensFor({ grants }, "platform").map((s) => s.path);
    expect(nav).not.toContain("/platform/kurumlar/yeni");
    expect(nav).toContain("/platform/kurumlar");
    expect(matrix.screensFor({ grants }, "platform", { includeHidden: true }).map((s) => s.path)).toContain("/platform/kurumlar/yeni");
    const page = await fs.readFile(path.join(ROOT, "src/app/platform/kurumlar/page.tsx"), "utf-8");
    expect(page).toContain("Yeni kurum oluştur");
    const yeni = await fs.readFile(path.join(ROOT, "src/app/platform/kurumlar/yeni/page.tsx"), "utf-8");
    expect(yeni).toContain("requireHyperAdminPage");
  });

  it("kurum rolleri platform ekranı görmez", () => {
    for (const role of ["SUPER_ADMIN", "SCHOOL_ADMIN", "BRANCH_MANAGER", "TEACHER"]) {
      expect(matrix.screensFor({ grants: matrix.systemGrantsForLoginRole(role) }, "platform"), role).toEqual([]);
    }
  });
});

// ───────────────────────── Global arama ─────────────────────────

describe("global arama — yetki ve sızıntı", () => {
  it("kurum sahibi servis ve API'de reddedilir", async () => {
    const res = await platformSearch(ctx("SUPER_ADMIN"), "nil");
    expect(!res.ok && res.error.code).toBe("FORBIDDEN");
    const { GET } = await import("../../app/api/v1/platform/search/route");
    const token = await bearer("user_owner_nilufer", "SUPER_ADMIN", DEFAULT_TENANT_ID);
    expect((await GET(req("/api/v1/platform/search?q=nil", token))).status).toBe(403);
  });

  it("HYPER sonuçları: e-posta maskeli, telefon yok; kısa sorgu reddedilir", async () => {
    expect((await platformSearch(hyper(), "a")).ok).toBe(false);
    const res = await platformSearch(hyper(), "nilufer");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const json = JSON.stringify(res.data);
    expect(json).not.toContain("nilufer.acar@niluferacar.com.tr");
    expect(res.data.results.some((r) => r.group === "Kurumlar" || r.group === "Kullanıcılar")).toBe(true);
    expect(maskEmail("nilufer.acar@x.test")).toBe("ni******@x.test");
    const phone = await platformSearch(hyper(), "0555");
    expect(phone.ok && phone.data.results.filter((r) => r.group === "Kullanıcılar")).toEqual([]);
  });
});

// ───────────────────────── Oturum / yaşam döngüsü ─────────────────────────

describe("soft delete / pasifleştirme giriş ve oturumu keser", () => {
  it("pasif kullanıcı giriş yapamaz, mevcut token API'de 401, audit korunur; yeniden aktifleştirme eski token'ı diriltmez", async () => {
    const token = await bearer("user_manager_ezgi", "SCHOOL_ADMIN", DEFAULT_TENANT_ID);
    const { GET } = await import("../../app/api/v1/tahsilat/roi/route");
    expect((await GET(req("/api/v1/tahsilat/roi", token))).status).toBe(200);

    const before = (await listPlatformAudit({})).length;
    const res = await lifecycle.deactivateUser(hyper(), { userId: "user_manager_ezgi", reason: "Ayrılan personel", confirm: true });
    expect(res.ok).toBe(true);
    expect(await authenticateUser("ezgi.guclu@niluferacar.com.tr", "demo-manager-ezgi")).toBeNull();
    expect(await getUserById("user_manager_ezgi")).toBeNull();
    expect((await GET(req("/api/v1/tahsilat/roi", token))).status).toBe(401);
    expect((await listPlatformAudit({})).length).toBeGreaterThan(before);

    await lifecycle.reactivateUser(hyper(), { userId: "user_manager_ezgi", reason: "Geri döndü", confirm: true });
    expect(await authenticateUser("ezgi.guclu@niluferacar.com.tr", "demo-manager-ezgi")).not.toBeNull();
    expect((await GET(req("/api/v1/tahsilat/roi", token))).status).toBe(401);
  });

  it("soft delete kaydı korur: 'Silinmiş' filtresinde listelenir, audit geçmişi kalır", async () => {
    await lifecycle.softDeleteUser(hyper(), { userId: "user_manager_ezgi", reason: "Kurumdan ayrıldı", confirm: true });
    const del = await lifecycle.listPlatformUsers(hyper(), { status: "deleted", tenantId: DEFAULT_TENANT_ID });
    expect(del.ok && del.data.users.map((u) => u.id)).toEqual(["user_manager_ezgi"]);
    const audit = await listPlatformAudit({ targetTenantId: DEFAULT_TENANT_ID });
    expect(audit.some((e) => e.action === "platform.user.soft_delete" && e.entityId === "user_manager_ezgi")).toBe(true);
  });

  it("sessionsRevokedAt öncesi token geçersiz, sonrası geçerli", async () => {
    await saveUserLifecycle({
      userId: "user_manager_ezgi",
      tenantId: DEFAULT_TENANT_ID,
      status: "active",
      sessionsRevokedAt: new Date(Date.now() - 5_000).toISOString(),
      displayName: null,
      updatedAt: new Date().toISOString(),
      updatedBy: "t",
    });
    invalidateSessionValidity();
    const claims = await verifyAccessToken(await bearer("user_manager_ezgi", "SCHOOL_ADMIN", DEFAULT_TENANT_ID));
    expect(await isSessionClaimValid(claims)).toBe(true);
    expect(await isSessionClaimValid({ ...claims, iat: (claims.iat ?? 0) - 60 })).toBe(false);
  });

  it("kullanıcı kendini silemez; son aktif HYPER_ADMIN ve son aktif kurum sahibi korunur", async () => {
    const self = await lifecycle.deactivateUser(hyper(), { userId: "user_hyper_admin", reason: "kendimi kapat", confirm: true });
    expect(!self.ok && self.error.message).toContain("kendi hesabını");
    const other = await lifecycle.softDeleteUser(ctx("HYPER_ADMIN", PLATFORM_TENANT_ID, "hyper_2"), { userId: "user_hyper_admin", reason: "deneme silme", confirm: true });
    expect(!other.ok && other.error.message).toContain("Son aktif platform sahibi");
    // 2026-09-12: Nilüfer Acar tenant'ın TEK aktif kurum sahibi (user_super ve admin@ emekli).
    const last = await lifecycle.deactivateUser(hyper(), { userId: "user_owner_nilufer", reason: "son sahip", confirm: true });
    expect(!last.ok && last.error.message).toContain("son aktif kurum sahibi");
  });

  it("HYPER_ADMIN kurum kullanıcısı tarafından yönetilemez (servis + API)", async () => {
    const res = await lifecycle.deactivateUser(ctx("SUPER_ADMIN"), { userId: "user_hyper_admin", reason: "yetkisiz deneme", confirm: true });
    expect(!res.ok && res.error.code).toBe("FORBIDDEN");
    const { POST } = await import("../../app/api/v1/platform/users/route");
    const token = await bearer("user_owner_nilufer", "SUPER_ADMIN", DEFAULT_TENANT_ID);
    const api = await POST(req("/api/v1/platform/users", token, "POST", { op: "deactivate", userId: "user_hyper_admin", reason: "yetkisiz deneme", confirm: true }));
    expect(api.status).toBe(403);
  });

  it("hard delete json'da reddedilir; şifre sıfırlama json'da bağlantıyı yakmaz", async () => {
    const hd = await lifecycle.hardDeleteUser(hyper(), { userId: "user_admin", reason: "taslak temizliği", confirm: true });
    expect(hd.ok).toBe(false);
    const start = await lifecycle.startPasswordReset(hyper(), { userId: "user_admin" });
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    const params = new URLSearchParams(start.data.resetPath.split("?")[1]);
    const wrong = await lifecycle.completePasswordReset({ resetId: params.get("reset"), token: "x".repeat(40), password: "yeni-parola-123" });
    expect(!wrong.ok && wrong.error.message).toBe("Bağlantı geçersiz.");
    const res = await lifecycle.completePasswordReset({ resetId: params.get("reset"), token: params.get("token"), password: "yeni-parola-123" });
    expect(res.ok).toBe(false);
    const again = await lifecycle.completePasswordReset({ resetId: params.get("reset"), token: params.get("token"), password: "yeni-parola-123" });
    expect(!again.ok && again.error.message).not.toContain("zaten kullanıldı");
  });

  it("davet yeniden gönderme eskisini iptal eder; iptal audit'lenir", async () => {
    const { issueOwnerInvitation } = await import("../platform/provision");
    const inv = await issueOwnerInvitation(hyper(), DEFAULT_TENANT_ID, { name: "Yeni Kişi", email: "yeni@kisi.test" }, { role: "SCHOOL_ADMIN" });
    if (!inv.ok) throw new Error("invite");
    const resend = await lifecycle.resendInvitation(hyper(), { invitationId: inv.data.invitation.id });
    expect(resend.ok && resend.data.invitation.id).not.toBe(inv.data.invitation.id);
    const list = await lifecycle.listPlatformUsers(hyper(), { invite: "all" });
    const old = list.ok && list.data.invitations.find((i) => i.id === inv.data.invitation.id);
    expect(old && old.status).toBe("revoked");
    if (resend.ok) await lifecycle.revokeInvitation(hyper(), { invitationId: resend.data.invitation.id });
    const actions = (await listPlatformAudit({ targetTenantId: DEFAULT_TENANT_ID })).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["platform.user.invite_resend", "platform.user.invite_revoke"]));
  });
});

// ───────────────────────── Rol matrisi ─────────────────────────

describe("rol / permission matrix", () => {
  it("tenant rolüne platform izni atanamaz; sistem rol adıyla çakışamaz", async () => {
    expect(matrix.validateCustomRole({ key: "danisma", grants: [{ resource: "students", action: "read", scope: "platform" }] })).toContain("platform");
    expect(matrix.validateCustomRole({ key: "danisma", grants: [{ resource: "packages", action: "read", scope: "tenant" }] })).toContain("platform");
    expect(matrix.validateCustomRole({ key: "super_admin", grants: [] })).toContain("sistem rolü");
    expect(matrix.validateCustomRole({ key: "danisma", grants: [{ resource: "students", action: "read", scope: "branch" }] })).toBeNull();
    const res = await saveCustomRole(hyper(), DEFAULT_TENANT_ID, {
      key: "gizli_platform",
      label: "Gizli",
      grants: [{ resource: "audit", action: "read", scope: "platform" }],
      confirm: true,
    });
    expect(!res.ok && res.error.code).toBe("VALIDATION_ERROR");
  });

  it("özel rol etki önizlemesi + audit; resolver ek grant'i uygular", async () => {
    const grants = [{ resource: "reports", action: "read", scope: "tenant" }];
    const noConfirm = await saveCustomRole(hyper(), DEFAULT_TENANT_ID, { key: "raporcu", label: "Raporcu", grants });
    expect(!noConfirm.ok && noConfirm.error.details).toMatchObject({ requiresConfirm: true });
    const saved = await saveCustomRole(hyper(), DEFAULT_TENANT_ID, { key: "raporcu", label: "Raporcu", grants, confirm: true });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const { assignCustomRole } = await import("../platform/custom-roles");
    await assignCustomRole(hyper(), DEFAULT_TENANT_ID, { userId: "user_teacher_t1", roleId: saved.data.role.id });
    const teacher = { ...ctx("TEACHER", DEFAULT_TENANT_ID, "user_teacher_t1"), teacherId: "t1" };
    expect((await requireGrant(teacher, "reports", "read", "tenant")).ok).toBe(true);
    expect((await requireGrant(ctx("TEACHER", DEFAULT_TENANT_ID, "user_teacher_t2"), "reports", "read", "tenant")).ok).toBe(false);
    const actions = (await listPlatformAudit({ targetTenantId: DEFAULT_TENANT_ID })).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["platform.role.create", "platform.role.assign"]));
  });

  it("rol matrisi API'si kurum rolleri ve şube müdürüyle atlatılamaz", async () => {
    const { POST } = await import("../../app/api/v1/platform/tenants/[tenantId]/roles/route");
    for (const [uid, role] of [["user_owner_nilufer", "SUPER_ADMIN"], ["user_manager_ezgi", "BRANCH_MANAGER"]] as const) {
      const token = await bearer(uid, role, DEFAULT_TENANT_ID);
      const res = await POST(req("/api/v1/platform/tenants/x/roles", token, "POST", { op: "save", key: "x_rol", label: "X", grants: [], confirm: true }), seg({ tenantId: DEFAULT_TENANT_ID }));
      expect(res.status, role).toBe(403);
    }
  });

  it("HYPER_ADMIN temel platform izinleri sistem tanımında sabittir", () => {
    const hyperGrants = matrix.SYSTEM_ROLE_GRANTS.HYPER_ADMIN;
    for (const r of matrix.PERM_RESOURCE_KEYS) expect(matrix.hasGrant(hyperGrants, r, "manage", "platform")).toBe(true);
    for (const role of ["SUPER_ADMIN", "SCHOOL_ADMIN", "BRANCH_MANAGER", "TEACHER", "STUDENT", "PARENT", "STAFF"] as const) {
      expect(matrix.SYSTEM_ROLE_GRANTS[role].some((g) => g.scope === "platform"), role).toBe(false);
    }
  });
});

// ───────────────────────── BRANCH_MANAGER V1 ─────────────────────────

// Tur 3: Nilüfer Acar kurumunun owner varsayılanı "unified" (BRANCH_MANAGER ≡
// SCHOOL_ADMIN). Aşağıdaki tur 2 şube-kapsamlı garantiler, kurum preset'i
// açıkça "branch_scoped" yapılarak (gelecekteki ayrıştırma yolu) korunur.
describe("BRANCH_MANAGER — yalnız atanmış şubede izinli operasyonlar (branch_scoped preset)", () => {
  const bm = () => ctx("BRANCH_MANAGER", DEFAULT_TENANT_ID, "user_manager_ezgi");
  beforeEach(async () => {
    const r = await updateTenantSetting(hyper(), DEFAULT_TENANT_ID, { key: "access.managerPreset", value: "branch_scoped", confirm: true, reason: "tur 2 şube kapsamı testi" });
    expect(r.ok).toBe(true);
  });

  async function lessonIn(branch: string) {
    const d = await readData();
    return d.lessons.find((l) => l.branchId === branch && l.status === "scheduled")!;
  }

  it("atama yoksa yoklama bile reddedilir (fail-closed)", async () => {
    const l = await lessonIn("erzene");
    const res = await tools.markAttendanceTool(bm(), { lessonId: l.id, status: "present" });
    expect(!res.ok && res.error.code).toBe("FORBIDDEN");
  });

  it("atanan şubede yoklama/öğrenci/duyuru; başka şubede ve kısıtlı alanlarda red", async () => {
    await grantUserBranchAccess(hyper(), DEFAULT_TENANT_ID, { userId: "user_manager_ezgi", branchId: "erzene" });
    const ok1 = await tools.markAttendanceTool(bm(), { lessonId: (await lessonIn("erzene")).id, status: "present" });
    expect(ok1.ok).toBe(true);
    const other = await tools.markAttendanceTool(bm(), { lessonId: (await lessonIn("evka3")).id, status: "present" });
    expect(!other.ok && other.error.code).toBe("FORBIDDEN");

    const d = await readData();
    const erz = d.students.find((s) => s.branchId === "erzene")!;
    const evk = d.students.find((s) => s.branchId === "evka3")!;
    expect((await tools.updateStudentProfileTool(bm(), { studentId: erz.id, phone: "0555 111 1111" })).ok).toBe(true);
    const name = await tools.updateStudentProfileTool(bm(), { studentId: erz.id, name: "Değişik Ad" });
    expect(!name.ok && name.error.message).toContain("name");
    const move = await tools.updateStudentProfileTool(bm(), { studentId: erz.id, branchId: "evka3" });
    expect(move.ok).toBe(false);
    expect((await tools.updateStudentProfileTool(bm(), { studentId: evk.id, phone: "0" })).ok).toBe(false);

    const all = await tools.createAnnouncementTool(bm(), { title: "T", body: "B", audienceType: "all" });
    expect(!all.ok && all.error.code).toBe("FORBIDDEN");
    const branch = await tools.createAnnouncementTool(bm(), { title: "Şube", body: "Duyuru", audienceType: "branch", audienceRef: { branchId: "erzene" } });
    expect(branch.ok).toBe(true);
    const foreign = await tools.createAnnouncementTool(bm(), { title: "Şube", body: "Duyuru", audienceType: "branch", audienceRef: { branchId: "evka3" } });
    expect(foreign.ok).toBe(false);
  });

  it("finans / personel / rol / export / platform grant'i yok; API'ler 403", async () => {
    const grants = await resolveGrants(bm());
    for (const [res, action] of [
      ["finance_summary", "read"],
      ["collections", "read"],
      ["contracts", "read"],
      ["staff", "read"],
      ["users", "delete"],
      ["roles", "manage"],
      ["export", "export"],
      ["packages", "read"],
      ["support_access", "read"],
      ["institution_settings", "update"],
    ] as const) {
      expect(matrix.hasGrant(grants, res, action, "branch"), `${res}:${action}`).toBe(false);
    }
    const token = await bearer("user_manager_ezgi", "BRANCH_MANAGER", DEFAULT_TENANT_ID);
    const roi = await import("../../app/api/v1/tahsilat/roi/route");
    expect((await roi.GET(req("/api/v1/tahsilat/roi", token))).status).toBe(403);
    const dash = await import("../../app/api/v1/platform/dashboard/route");
    expect((await dash.GET(req("/api/v1/platform/dashboard", token))).status).toBe(403);
  });

  it("/api/v1/sube uçları gerçek token ile yalnız şube müdürüne ve kapsam içine açık", async () => {
    await grantUserBranchAccess(hyper(), DEFAULT_TENANT_ID, { userId: "user_manager_ezgi", branchId: "erzene" });
    const { POST, GET } = await import("../../app/api/v1/sube/[action]/route");
    const token = await bearer("user_manager_ezgi", "BRANCH_MANAGER", DEFAULT_TENANT_ID);
    const overview = await GET(req("/api/v1/sube/overview", token), seg({ action: "overview" }));
    expect(overview.status).toBe(200);
    const body = await overview.json();
    expect(body.data.branches.map((b: { id: string }) => b.id)).toEqual(["erzene"]);
    const out = await POST(req("/api/v1/sube/attendance", token, "POST", { lessonId: (await lessonIn("evka3")).id, status: "present" }), seg({ action: "attendance" }));
    expect(out.status).toBe(403);
    const owner = await bearer("user_owner_nilufer", "SUPER_ADMIN", DEFAULT_TENANT_ID);
    expect((await GET(req("/api/v1/sube/overview", owner), seg({ action: "overview" }))).status).toBe(403);
  });

  it("entitlement AND feature AND permission AND scope birlikte: ticari hak kapanınca izin tek başına açmaz", async () => {
    await grantUserBranchAccess(hyper(), DEFAULT_TENANT_ID, { userId: "user_manager_ezgi", branchId: "erzene" });
    await updateTenantSetting(hyper(), DEFAULT_TENANT_ID, { key: "subscription.entitlementOverrides", value: { announcements: false }, confirm: true });
    const res = await tools.createAnnouncementTool(bm(), { title: "Şube", body: "Duyuru", audienceType: "branch", audienceRef: { branchId: "erzene" } });
    expect(!res.ok && res.error.code).toBe("FORBIDDEN");
    const screen = matrix.SCREEN_REGISTRY.find((s) => s.id === "sube.announcements")!;
    expect(matrix.canAccessScreen({ grants: await resolveGrants(bm()), enabledFeatures: new Set() }, screen)).toBe(false);
  });
});

// ───────────────────────── Mobil policy ─────────────────────────

describe("mobil platform policy", () => {
  it("entitlement + flag + policy + platform + rol birlikte; push asla 'aktif' değil", async () => {
    const off = await getMobilePolicy(ctx("SUPER_ADMIN"), { platform: "ios" });
    expect(off.ok && off.data.allowed).toBe(false);
    await updateTenantSetting(hyper(), DEFAULT_TENANT_ID, { key: "subscription.addons", value: ["mobileApp"], confirm: true });
    await updateTenantSetting(hyper(), DEFAULT_TENANT_ID, { key: "mobile.appEnabled", value: true, confirm: true });
    await updateTenantSetting(hyper(), DEFAULT_TENANT_ID, { key: "mobile.adminPortalEnabled", value: true, confirm: true });
    const on = await getMobilePolicy(ctx("SUPER_ADMIN"), { platform: "ios", appVersion: "0.9.0" });
    expect(on.ok && on.data.allowed).toBe(true);
    expect(on.ok && on.data.updateRequired).toBe(true);
    expect(on.ok && on.data.push.active).toBe(false);
    await updateTenantSetting(hyper(), DEFAULT_TENANT_ID, { key: "mobile.iosEnabled", value: false, confirm: true });
    const ios = await getMobilePolicy(ctx("SUPER_ADMIN"), { platform: "ios" });
    expect(ios.ok && ios.data.reasons).toContain("iOS uygulaması kapalı.");
  });

  it("değişiklik audit + sürüm üretir; kurum sahibi mobil policy yazamaz", async () => {
    await updateTenantSetting(hyper(), DEFAULT_TENANT_ID, { key: "mobile.maintenanceMessage", value: "Bakımdayız" });
    const audit = await listPlatformAudit({ targetTenantId: DEFAULT_TENANT_ID });
    expect(audit.some((e) => e.action === "platform.setting.update" && e.entityId === "mobile.maintenanceMessage")).toBe(true);
    expect((await listPolicyVersions(DEFAULT_TENANT_ID, "mobile.maintenanceMessage")).length).toBe(1);
    const denied = await updateTenantSetting(ctx("SUPER_ADMIN"), DEFAULT_TENANT_ID, { key: "mobile.appEnabled", value: true, confirm: true });
    expect(!denied.ok && denied.error.code).toBe("FORBIDDEN");
  });
});

// ───────────────────────── Paketler ─────────────────────────

describe("paket ve limit policy", () => {
  it("Starter/Core/Pro/Scale/Enterprise limitleri; fiyat yayınlanmadı", () => {
    expect(PLAN_CATALOG.starter.limits).toEqual({ students: 100, users: 3, branches: 1 });
    expect(PLAN_CATALOG.core.limits).toEqual({ students: 300, users: 10, branches: 2 });
    expect(PLAN_CATALOG.pro.limits).toEqual({ students: 750, users: 25, branches: 5 });
    expect(PLAN_CATALOG.scale.limits).toEqual({ students: 2000, users: 75, branches: 15 });
    expect(PLAN_CATALOG.enterprise.limits.students).toBeNull();
    expect(PLAN_CATALOG.starter.price).toBe("unpublished");
    expect(PLAN_CATALOG.enterprise.price).toBe("custom_quote");
  });

  it("override gerekçesiz reddedilir; süresi dolan override yok sayılır", async () => {
    await upsertPlatformTenant({ tenantId: "tenant_core", name: "Core Kurum", planKey: "core" }, "seed");
    const bad = await updateTenantSetting(hyper(), "tenant_core", { key: "subscription.limitOverrides", value: { students: { value: 500, reason: "x", expiresAt: FUTURE() } }, confirm: true });
    expect(!bad.ok && bad.error.code).toBe("VALIDATION_ERROR");
    await updateTenantSetting(hyper(), "tenant_core", {
      key: "subscription.limitOverrides",
      value: { students: { value: 500, reason: "Geçmiş kampanya artışı", expiresAt: new Date(Date.now() - 1000).toISOString() } },
      confirm: true,
    });
    expect((await resolveTenantLimits("tenant_core")).students).toBe(300);
  });

  it("şube limiti yeni şube açılışını durdurur, mevcutlar kalır", async () => {
    const d = await readData();
    await updateTenantSetting(hyper(), DEFAULT_TENANT_ID, {
      key: "subscription.limitOverrides",
      value: { branches: { value: d.settings.branches.length, reason: "Şube limiti testi", expiresAt: FUTURE() } },
      confirm: true,
    });
    const res = await tools.createBranchTool(ctx("SUPER_ADMIN"), { name: "Yeni Şube", shortName: "Yeni", address: "Adres", phone: "0555", city: "İzmir" });
    expect(!res.ok && res.error.message).toContain("Paket limiti");
    expect((await readData()).settings.branches.length).toBe(d.settings.branches.length);
  });
});

// ───────────────────────── Taslak / yayın / geri al ─────────────────────────

describe("kritik politika: taslak → önizleme → yayın → geri al", () => {
  it("görünüm politikası taslakla yayınlanır, geri alma yeni sürüm üretir ve eskisini korur", async () => {
    await updateTenantSetting(hyper(), DEFAULT_TENANT_ID, { key: "appearance.mode", value: "light_only", reason: "İlk kurulum" });
    const draft = await policyVersions.createPolicyDraft(hyper(), DEFAULT_TENANT_ID, { key: "appearance.mode", value: "dark_only", reason: "Gece kullanımı" });
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    const preview = await policyVersions.previewPolicyDraft(hyper(), DEFAULT_TENANT_ID, draft.data.draft.id);
    expect(preview.ok && preview.data.before).toBe("light_only");
    expect(preview.ok && preview.data.blockers).toEqual([]);
    const noConfirm = await policyVersions.publishPolicyDraft(hyper(), DEFAULT_TENANT_ID, { draftId: draft.data.draft.id });
    expect(noConfirm.ok).toBe(false);
    expect((await policyVersions.publishPolicyDraft(hyper(), DEFAULT_TENANT_ID, { draftId: draft.data.draft.id, confirm: true })).ok).toBe(true);
    const s1 = await getTenantSettings(hyper(), DEFAULT_TENANT_ID);
    expect(s1.ok && s1.data.settings.find((x) => x.key === "appearance.mode")?.effectiveValue).toBe("dark_only");

    const shortReason = await policyVersions.rollbackPolicy(hyper(), DEFAULT_TENANT_ID, { key: "appearance.mode", reason: "kısa", confirm: true });
    expect(shortReason.ok).toBe(false);
    const rb = await policyVersions.rollbackPolicy(hyper(), DEFAULT_TENANT_ID, { key: "appearance.mode", reason: "Kullanıcı şikayeti nedeniyle geri alındı", confirm: true });
    expect(rb.ok && rb.data.restoredFrom).toBe(1);
    const s2 = await getTenantSettings(hyper(), DEFAULT_TENANT_ID);
    expect(s2.ok && s2.data.settings.find((x) => x.key === "appearance.mode")?.effectiveValue).toBe("light_only");
    const history = await listPolicyVersions(DEFAULT_TENANT_ID, "appearance.mode");
    expect(history.map((h) => [h.version, h.status])).toEqual([
      [3, "published"],
      [2, "superseded"],
      [1, "superseded"],
    ]);
    expect(history[0]!.rollbackOfVersion).toBe(1);
    const audit = await listPlatformAudit({ targetTenantId: DEFAULT_TENANT_ID });
    const e = audit.find((x) => x.action === "platform.policy.rollback");
    expect(e?.after).toMatchObject({ reason: "Kullanıcı şikayeti nedeniyle geri alındı", restoredFromVersion: 1 });
  });

  it("çelişen taslak yayınlanamaz; modül politikası geri alınabilir; kurum sahibi erişemez", async () => {
    await updateTenantSetting(hyper(), DEFAULT_TENANT_ID, { key: "appearance.mode", value: "dark_only" });
    const bad = await policyVersions.createPolicyDraft(hyper(), DEFAULT_TENANT_ID, { key: "appearance.fixedTheme", value: "gold", reason: "Açık tema sabitle" });
    if (!bad.ok) throw new Error("draft");
    const pub = await policyVersions.publishPolicyDraft(hyper(), DEFAULT_TENANT_ID, { draftId: bad.data.draft.id, confirm: true });
    expect(pub.ok).toBe(false);

    await updateTenantFeature(hyper(), DEFAULT_TENANT_ID, { flag: "homework", enabled: false });
    await updateTenantFeature(hyper(), DEFAULT_TENANT_ID, { flag: "tasks", enabled: false });
    const rb = await policyVersions.rollbackPolicy(hyper(), DEFAULT_TENANT_ID, { key: "features.overrides", reason: "İş takibi geri açılsın", confirm: true });
    expect(rb.ok).toBe(true);
    const { resolveAllFeatures } = await import("../platform/resolve");
    const f = await resolveAllFeatures(DEFAULT_TENANT_ID);
    expect(f.find((x) => x.key === "tasks")?.enabled).toBe(true);
    expect(f.find((x) => x.key === "homework")?.enabled).toBe(false);

    expect((await policyVersions.listPolicyHistory(ctx("SUPER_ADMIN"), DEFAULT_TENANT_ID)).ok).toBe(false);
  });

  it("platform logosu sürümlenir ve önceki logoya geri alınır", async () => {
    await setPlatformLogo(hyper(), { mime: "image/png", dataBase64: PNG });
    const first = (await getPlatformLogo())!.sha256;
    await setPlatformLogo(hyper(), { mime: "image/png", dataBase64: PNG2 });
    expect((await getPlatformLogo())!.sha256).not.toBe(first);
    const rb = await policyVersions.rollbackPolicy(hyper(), "platform", { key: "platform.logo", reason: "Yeni logo onaylanmadı", confirm: true });
    expect(rb.ok).toBe(true);
    expect((await getPlatformLogo())!.sha256).toBe(first);
  });
});

// ───────────────────────── Migration ─────────────────────────

describe("tur 2 migration güvenliği", () => {
  it("additive: DROP yok, yeni User kolonları nullable", async () => {
    const sql = await fs.readFile(path.join(ROOT, "prisma/migrations/20260913140000_neviios_control_center/migration.sql"), "utf-8");
    const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(code).not.toMatch(/\bDROP\b/i);
    for (const col of ["displayName", "deletedAt", "lastLoginAt", "sessionsRevokedAt"]) {
      expect(code).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS "${col}" (TEXT|TIMESTAMP\\(3\\))[,;]`));
    }
  });
});

// Hyper login regresyonu — oturum geçerlilik katmanı bootstrap girişini bozmamalı.
describe("HYPER_ADMIN girişi", () => {
  it("dev bootstrap hesabı giriş yapar", async () => {
    const u = await runWithTenantAsync(PLATFORM_TENANT_ID, () => authenticateUser(DEV_HYPER_ADMIN_EMAIL, DEV_HYPER_ADMIN_PASSWORD));
    expect(u?.role).toBe("HYPER_ADMIN");
  });
});
