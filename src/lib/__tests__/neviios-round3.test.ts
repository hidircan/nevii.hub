import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs, existsSync } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID, PLATFORM_TENANT_ID, DEV_HYPER_ADMIN_EMAIL, DEV_HYPER_ADMIN_PASSWORD } from "../auth/config";
import type { AppRole } from "../auth/types";
import type { ServiceContext } from "../services/context";

/**
 * NeviiOS tur 3 — gerçek JWT + route handler'larıyla (authenticate mock'u YOK):
 * SCHOOL_ADMIN ≡ BRANCH_MANAGER efektif izin eşitliği, personel/finans
 * kısıtı, rol dizini, canlı oturum sonlandırma, release sözleşmesi, paket
 * fiyat motoru, log retention, config sürümü/ETag.
 */

const { resetPlatformStoreForTests, listPlatformAudit } = await import("../platform/store");
const { invalidateSessionValidity } = await import("../auth/session-validity");
const { __resetPresenceForTests } = await import("../auth/session-registry");
const { issueTokenPair } = await import("../auth/jwt");
const { authenticateRequest } = await import("../auth/authenticate");
const { buildServiceContext } = await import("../api/context");
const { permissionsForRole } = await import("../auth/rbac");
const { invalidateManagerPreset, resolveEffectiveRole } = await import("../platform/manager-preset");
const { resolveGrants } = await import("../platform/permissions");
const matrix = await import("../platform/permission-matrix");
const roleDir = await import("../platform/role-directory");
const liveOps = await import("../platform/live-ops");
const releases = await import("../platform/releases");
const catalog = await import("../platform/commercial-catalog");
const retention = await import("../platform/retention");
const { buildConfigSnapshot, computeConfigVersion } = await import("../platform/config-snapshot");
const { updateTenantSetting, patchInstitution } = await import("../platform/service");
const { listPolicyVersions, saveUserSession, listUserSessions } = await import("../platform/store-ext");
const { resolveTenantLimits } = await import("../platform/entitlements");
const policyVersions = await import("../platform/policy-versions");
const tools = await import("../services/tools");
const { readData } = await import("../store");
const { __resetRateLimitForTests } = await import("../rate-limit");
const { BRAND } = await import("../brand");
const { PLATFORM_LOGO_FALLBACK_PATH } = await import("../platform/branding");
const { subscriptionSnapshotSchema, SETTING_BY_KEY, parseSettingValue } = await import("../platform/catalog");

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const ROOT = process.cwd();

function ctx(role: AppRole, tenantId = DEFAULT_TENANT_ID, userId = "u1"): ServiceContext {
  return { role, userId, tenantId, channel: "web", requestId: "req_r3" };
}
const hyper = () => ctx("HYPER_ADMIN", PLATFORM_TENANT_ID, "user_hyper_admin");

async function bearer(userId: string, role: AppRole, tenantId: string, sid?: string) {
  return (await issueTokenPair({ userId, role, tenantId, sid })).accessToken;
}
function req(url: string, token: string | null, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  const h: Record<string, string> = { ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  if (body !== undefined) h["content-type"] = "application/json";
  return new Request(`http://localhost${url}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function authCtx(userId: string, role: AppRole) {
  const token = await bearer(userId, role, DEFAULT_TENANT_ID);
  const r = new Request("http://localhost/api/v1/x", { headers: { authorization: `Bearer ${token}` } });
  const auth = await authenticateRequest(r, "req_r3");
  if (!auth.ok) throw new Error("auth failed");
  return buildServiceContext(auth.user, r, "req_r3");
}
async function login(email: string, password: string) {
  const { POST } = await import("../../app/api/v1/auth/login/route");
  const res = await POST(req("/api/v1/auth/login", null, "POST", { email, password }, { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0" }));
  const json = await res.json();
  if (!json.ok) throw new Error(`login failed: ${JSON.stringify(json)}`);
  return json.data as { accessToken: string; refreshToken: string };
}
const sorted = (xs: string[]) => [...xs].sort();
const gkey = (g: { resource: string; action: string; scope: string }) => `${g.resource}:${g.action}:${g.scope}`;

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await resetPlatformStoreForTests();
  invalidateSessionValidity();
  invalidateManagerPreset();
  __resetPresenceForTests();
  __resetRateLimitForTests();
});
afterEach(async () => {
  await resetPlatformStoreForTests();
  invalidateSessionValidity();
  invalidateManagerPreset();
});

// ───────────────────── SCHOOL_ADMIN ≡ BRANCH_MANAGER (Nilüfer Acar) ─────────────────────

describe("yönetici preset'i — SCHOOL_ADMIN ve BRANCH_MANAGER aynı efektif izin seti", () => {
  it("Ezgi (SCHOOL_ADMIN) ve Nihal (BRANCH_MANAGER) Nilüfer Acar'da aynı rbac + matris izinlerini alır; rol adları ayrı kalır", async () => {
    const ezgi = await authCtx("user_manager_ezgi", "SCHOOL_ADMIN");
    const nihal = await authCtx("user_manager_nihal", "BRANCH_MANAGER");
    expect(nihal.role).toBe("SCHOOL_ADMIN");
    expect(nihal.loginRole).toBe("BRANCH_MANAGER");
    expect(ezgi.loginRole).toBeUndefined();
    expect(sorted(permissionsForRole(nihal.role))).toEqual(sorted(permissionsForRole(ezgi.role)));
    expect(sorted((await resolveGrants(nihal)).map(gkey))).toEqual(sorted((await resolveGrants(ezgi)).map(gkey)));
    // Başka (owner kararı olmayan) kurumda şube müdürü şube kapsamlı kalır.
    expect(await resolveEffectiveRole("BRANCH_MANAGER", "tenant_baska_kurum")).toBe("BRANCH_MANAGER");
  });

  it("ikisi de öğrenci / tahsilat / ders programı / yoklama / telafi operasyonlarına gerçek token ile erişir", async () => {
    const { GET } = await import("../../app/api/v1/tahsilat/roi/route");
    for (const [id, role] of [
      ["user_manager_ezgi", "SCHOOL_ADMIN"],
      ["user_manager_nihal", "BRANCH_MANAGER"],
    ] as const) {
      expect((await GET(req("/api/v1/tahsilat/roi", await bearer(id, role, DEFAULT_TENANT_ID)))).status, id).toBe(200);
      const c = await authCtx(id, role);
      const lesson = (await readData()).lessons.find((l) => l.status === "scheduled")!;
      expect((await tools.markAttendanceTool(c, { lessonId: lesson.id, status: "present" })).ok, `${id} yoklama`).toBe(true);
      const grants = await resolveGrants(c);
      for (const [res, action] of [
        ["students", "update"],
        ["contracts", "update"],
        ["collections", "create"],
        ["schedule", "update"],
        ["attendance", "update"],
        ["makeup", "approve"],
      ] as const) {
        expect(matrix.hasGrant(grants, res, action, "tenant"), `${id} ${res}:${action}`).toBe(true);
      }
    }
  });

  it("ikisi de personel ve kurum geneli finans özetine ERİŞEMEZ (tool + API + matris); SUPER_ADMIN erişir", async () => {
    for (const [id, role] of [
      ["user_manager_ezgi", "SCHOOL_ADMIN"],
      ["user_manager_nihal", "BRANCH_MANAGER"],
    ] as const) {
      const c = await authCtx(id, role);
      const staff = await tools.listStaffTool(c, {});
      expect(!staff.ok && staff.error.code, `${id} personel`).toBe("FORBIDDEN");
      const fin = await tools.getFinanceSummaryTool(c, {});
      expect(!fin.ok && fin.error.code, `${id} finans`).toBe("FORBIDDEN");
      expect(!(await tools.listPayrollTool(c, {})).ok).toBe(true);
      expect(!(await tools.listExpensesTool(c, {})).ok).toBe(true);
      expect(!(await tools.createLeaveRequestTool(c, { staffId: "x", type: "annual", startDate: "2026-09-01", endDate: "2026-09-02" })).ok).toBe(true);
      const grants = await resolveGrants(c);
      expect(matrix.hasGrant(grants, "staff", "read", "tenant")).toBe(false);
      expect(matrix.hasGrant(grants, "finance_summary", "read", "tenant")).toBe(false);
      const iban = await import("../../app/api/v1/people/reveal-staff-iban/route");
      expect((await iban.POST(req("/api/v1/people/reveal-staff-iban", await bearer(id, role, DEFAULT_TENANT_ID), "POST", { staffId: "x" }))).status).toBe(403);
    }
    const owner = await authCtx("user_owner_nilufer", "SUPER_ADMIN");
    expect((await tools.listStaffTool(owner, {})).ok).toBe(true);
    expect((await tools.getFinanceSummaryTool(owner, {})).ok).toBe(true);
    expect(matrix.hasGrant(await resolveGrants(owner), "finance_summary", "read", "tenant")).toBe(true);
  });

  it("route düzeyi: /panel/personel/* ve /panel/finans-ozeti yalnız SUPER_ADMIN'e; menü aynı kural", async () => {
    for (const p of ["personel/page.tsx", "personel/bordrolar/page.tsx", "personel/izinler/page.tsx", "personel/[staffId]/page.tsx", "finans-ozeti/page.tsx"]) {
      const src = await fs.readFile(path.join(ROOT, "src/app/panel", p), "utf-8");
      expect(src, p).toMatch(/session\.role !== "SUPER_ADMIN"/);
      expect(src, p).not.toMatch(/session\.role !== "SCHOOL_ADMIN"/);
    }
    const nav = await fs.readFile(path.join(ROOT, "src/lib/nav/panel-nav.ts"), "utf-8");
    for (const href of ["/panel/personel", "/panel/finans-ozeti", "/panel/personel/bordrolar", "/panel/personel/izinler"]) {
      expect(nav).toMatch(new RegExp(`href: "${href}",[^}]*roles: \\["SUPER_ADMIN"\\]`));
    }
  });

  it("preset 'branch_scoped' yapılınca ayrışır (önizleme + onay + audit + sürüm); kurum sahibi preset'i değiştiremez", async () => {
    const denied = await roleDir.setManagerPreset(ctx("SUPER_ADMIN"), DEFAULT_TENANT_ID, { preset: "branch_scoped", reason: "yetkisiz deneme 123", confirm: true });
    expect(!denied.ok && denied.error.code).toBe("FORBIDDEN");
    const preview = await roleDir.previewManagerPreset(hyper(), DEFAULT_TENANT_ID, { preset: "branch_scoped" });
    expect(preview.ok && preview.data.before).toBe("unified");
    expect(preview.ok && preview.data.affectedUsers.map((u) => u.id)).toEqual(["user_manager_nihal"]);
    expect(preview.ok && preview.data.screensClosed.length).toBeGreaterThan(0);
    const noConfirm = await roleDir.setManagerPreset(hyper(), DEFAULT_TENANT_ID, { preset: "branch_scoped", reason: "Şube bazlı ayrıştırma" });
    expect(!noConfirm.ok && (noConfirm.error.details as Record<string, unknown> | undefined)?.requiresConfirm).toBe(true);
    const applied = await roleDir.setManagerPreset(hyper(), DEFAULT_TENANT_ID, { preset: "branch_scoped", reason: "Şube bazlı ayrıştırma", confirm: true });
    expect(applied.ok).toBe(true);
    const nihal = await authCtx("user_manager_nihal", "BRANCH_MANAGER");
    expect(nihal.role).toBe("BRANCH_MANAGER");
    const audit = await listPlatformAudit({ targetTenantId: DEFAULT_TENANT_ID });
    const ev = audit.find((e) => e.action === "platform.role.preset_change");
    expect(ev?.before).toEqual({ preset: "unified" });
    expect((ev?.after as { preset: string }).preset).toBe("branch_scoped");
    expect((await listPolicyVersions(DEFAULT_TENANT_ID, "access.managerPreset")).some((v) => v.status === "published")).toBe(true);
  });
});

// ───────────────────── Platform erişimi + rol matrisi ─────────────────────

describe("platform alanı ve rol matrisi — URL/API bypass yok", () => {
  it("HYPER_ADMIN rol dizinine erişir; kurum rolleri (sahip, yönetici, şube müdürü, öğretmen) 403", async () => {
    const { GET, POST } = await import("../../app/api/v1/platform/roles/route");
    const ok = await GET(req(`/api/v1/platform/roles?tenantId=${DEFAULT_TENANT_ID}`, await bearer("user_hyper_admin", "HYPER_ADMIN", PLATFORM_TENANT_ID)));
    expect(ok.status).toBe(200);
    for (const [id, role] of [
      ["user_owner_nilufer", "SUPER_ADMIN"],
      ["user_manager_ezgi", "SCHOOL_ADMIN"],
      ["user_manager_nihal", "BRANCH_MANAGER"],
      ["user_teacher_t1", "TEACHER"],
    ] as const) {
      const token = await bearer(id, role, DEFAULT_TENANT_ID);
      expect((await GET(req("/api/v1/platform/roles", token))).status, id).toBe(403);
      const write = await POST(req("/api/v1/platform/roles", token, "POST", { op: "preset_apply", tenantId: DEFAULT_TENANT_ID, preset: "branch_scoped", reason: "bypass denemesi", confirm: true }));
      expect(write.status, id).toBe(403);
    }
    for (const route of ["sessions", "catalog", "releases", "retention"]) {
      const mod = await import(`../../app/api/v1/platform/${route}/route`);
      expect((await mod.GET(req(`/api/v1/platform/${route}`, await bearer("user_owner_nilufer", "SUPER_ADMIN", DEFAULT_TENANT_ID)))).status, route).toBe(403);
    }
  });

  it("rol detayında atanmış kullanıcılar ve sayılar görünür; e-posta maskeli", async () => {
    const dir = await roleDir.getRoleDirectory(hyper(), { tenantId: DEFAULT_TENANT_ID });
    expect(dir.ok).toBe(true);
    if (!dir.ok) return;
    const role = (k: string) => dir.data.systemRoles.find((r) => r.key === k)!;
    expect(role("SCHOOL_ADMIN").users.map((u) => u.id)).toEqual(expect.arrayContaining(["user_manager_ezgi"]));
    expect(role("BRANCH_MANAGER").users.map((u) => u.id)).toEqual(["user_manager_nihal"]);
    expect(role("BRANCH_MANAGER").userCount).toBe(1);
    expect(role("BRANCH_MANAGER").effectiveAs).toBe("SCHOOL_ADMIN");
    expect(role("SUPER_ADMIN").users.map((u) => u.id)).toEqual(expect.arrayContaining(["user_owner_nilufer"]));
    expect(role("TEACHER").userCount).toBe(7);
    expect(role("SUPER_ADMIN").screens.map((s) => s.id)).toEqual(expect.arrayContaining(["panel.staff", "panel.finance_summary"]));
    expect(role("SCHOOL_ADMIN").screens.map((s) => s.id)).not.toContain("panel.finance_summary");
    expect(role("BRANCH_MANAGER").screens.map((s) => s.id)).not.toContain("panel.staff");
    expect(JSON.stringify(dir.data)).not.toContain("ezgi.guclu@niluferacar.com.tr");
    expect(role("HYPER_ADMIN").assignable).toBe(false);
    expect(role("HYPER_ADMIN").editableGrants).toBe(false);
  });

  it("özel role platform ekranı, platform izni veya personel/finans verilemez; ekran registry id'siyle eklenir + audit", async () => {
    const { saveCustomRole } = await import("../platform/custom-roles");
    const staff = await saveCustomRole(hyper(), DEFAULT_TENANT_ID, { key: "ik_rolu", label: "İK", grants: [{ resource: "staff", action: "read", scope: "tenant" }], confirm: true });
    expect(!staff.ok && staff.error.message).toContain("Kurum Sahibi");
    const created = await saveCustomRole(hyper(), DEFAULT_TENANT_ID, { key: "raporcu", label: "Raporcu", grants: [], confirm: true });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const plat = await roleDir.toggleCustomRoleScreen(hyper(), DEFAULT_TENANT_ID, { roleId: created.data.role.id, screenId: "platform.audit", enabled: true, confirm: true });
    expect(!plat.ok && plat.error.code).toBe("FORBIDDEN");
    const needsConfirm = await roleDir.toggleCustomRoleScreen(hyper(), DEFAULT_TENANT_ID, { roleId: created.data.role.id, screenId: "sube.attendance", enabled: true });
    expect(!needsConfirm.ok && (needsConfirm.error.details as Record<string, unknown> | undefined)?.requiresConfirm).toBe(true);
    const added = await roleDir.toggleCustomRoleScreen(hyper(), DEFAULT_TENANT_ID, { roleId: created.data.role.id, screenId: "sube.attendance", enabled: true, confirm: true });
    expect(added.ok && added.data.role.grants).toEqual([{ resource: "attendance", action: "update", scope: "branch" }]);
    const audit = await listPlatformAudit({ targetTenantId: DEFAULT_TENANT_ID });
    const upd = audit.find((e) => e.action === "platform.role.update" && e.entityId === created.data.role.id);
    expect(upd?.before).toBeTruthy();
    expect(matrix.validateCustomRole({ key: "x_rol", grants: [{ resource: "users", action: "read", scope: "platform" }] })).toContain("platform");
  });
});

// ───────────────────── Canlı oturumlar ─────────────────────

describe("canlı operasyon — oturum kaydı ve sonlandırma", () => {
  it("girişte sid'li oturum açılır; tekil sonlandırma kullanıcının SONRAKİ isteğini reddeder; audit yazılır", async () => {
    const { accessToken } = await login("ezgi.guclu@niluferacar.com.tr", "demo-manager-ezgi");
    const { GET } = await import("../../app/api/v1/tahsilat/roi/route");
    expect((await GET(req("/api/v1/tahsilat/roi", accessToken))).status).toBe(200);
    const list = await liveOps.listLiveOperations(hyper(), { tenantId: DEFAULT_TENANT_ID, only: "online" });
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    const row = list.data.users.find((u) => u.userId === "user_manager_ezgi")!;
    expect(row.activeSessions).toBe(1);
    expect(row.emailMasked).not.toContain("ezgi.guclu@");
    expect(row.device).toBe("Chrome · macOS");
    expect(row.lastAction).toBe("GET /api/v1/tahsilat/roi");
    const sid = row.sessions[0]!.id;

    const res = await liveOps.revokeSession(hyper(), { sessionId: sid, reason: "Şüpheli cihaz" });
    expect(res.ok).toBe(true);
    expect((await GET(req("/api/v1/tahsilat/roi", accessToken))).status).toBe(401);
    const audit = await listPlatformAudit({ targetTenantId: DEFAULT_TENANT_ID });
    expect(audit.some((e) => e.action === "platform.session.revoke" && e.entityId === sid)).toBe(true);
    // Refresh de reddedilir (oturum kapalı).
    const refresh = await import("../../app/api/v1/auth/refresh/route");
    const { refreshToken } = await login("ezgi.guclu@niluferacar.com.tr", "demo-manager-ezgi");
    const second = (await listUserSessions({ userId: "user_manager_ezgi", openOnly: true }))[0]!;
    await liveOps.revokeSession(hyper(), { sessionId: second.id, reason: "İkinci test oturumu" });
    expect((await refresh.POST(req("/api/v1/auth/refresh", null, "POST", { refreshToken }))).status).toBe(401);
  });

  it("tüm oturumları kapat: hesap aktif kalır, tüm token'lar düşer, yeni giriş çalışır; kendi oturumları kapatılamaz", async () => {
    const a = await login("nihal.gedikli@niluferacar.com.tr", "demo-manager-nihal");
    const { GET } = await import("../../app/api/v1/tahsilat/roi/route");
    expect((await GET(req("/api/v1/tahsilat/roi", a.accessToken))).status).toBe(200);
    // 2026-09-23 tek aktif oturum: ikinci giriş ilk oturumu kapatır (devralma).
    const b = await login("nihal.gedikli@niluferacar.com.tr", "demo-manager-nihal");
    expect((await GET(req("/api/v1/tahsilat/roi", a.accessToken))).status).toBe(401);
    expect((await GET(req("/api/v1/tahsilat/roi", b.accessToken))).status).toBe(200);
    await new Promise((r) => setTimeout(r, 5));
    const res = await liveOps.revokeAllSessions(hyper(), { userId: "user_manager_nihal", reason: "Cihaz kaybı bildirimi", confirm: true });
    expect(res.ok && res.data.closedSessions).toBe(1);
    expect((await GET(req("/api/v1/tahsilat/roi", b.accessToken))).status).toBe(401);
    await new Promise((r) => setTimeout(r, 1100));
    const c = await login("nihal.gedikli@niluferacar.com.tr", "demo-manager-nihal");
    expect((await GET(req("/api/v1/tahsilat/roi", c.accessToken))).status).toBe(200);
    const self = await liveOps.revokeAllSessions(hyper(), { userId: "user_hyper_admin", reason: "kendimi kapatma", confirm: true });
    expect(!self.ok && self.error.code).toBe("FORBIDDEN");
  });

  it("tek aktif oturum: onay destekleyen istemci 409 alır; devralma eski oturumu 'takeover' ile kapatır ve durum uç noktası bunu bildirir", async () => {
    const a = await login("ezgi.guclu@niluferacar.com.tr", "demo-manager-ezgi");
    const { POST } = await import("../../app/api/v1/auth/login/route");
    const creds = { email: "ezgi.guclu@niluferacar.com.tr", password: "demo-manager-ezgi", clientSupportsTakeover: true };
    const blocked = await POST(req("/api/v1/auth/login", null, "POST", creds));
    expect(blocked.status).toBe(409);
    const blockedJson = await blocked.json();
    expect(blockedJson.error.code).toBe("SESSION_ACTIVE_ELSEWHERE");
    expect(blockedJson.error.message).toContain("başka bir cihazda aktif");
    const { GET: ROI } = await import("../../app/api/v1/tahsilat/roi/route");
    expect((await ROI(req("/api/v1/tahsilat/roi", a.accessToken))).status).toBe(200); // vazgeçilirse A etkilenmez
    const taken = await POST(req("/api/v1/auth/login", null, "POST", { ...creds, takeover: true }));
    expect(taken.status).toBe(200);
    expect((await ROI(req("/api/v1/tahsilat/roi", a.accessToken))).status).toBe(401);
    const { GET: STATUS } = await import("../../app/api/v1/auth/session-status/route");
    const st = await STATUS(new Request("http://localhost/api/v1/auth/session-status", { headers: { cookie: `np_refresh=${a.refreshToken}` } }));
    expect((await st.json()).data.state).toBe("taken_over");
  });

  it("pasifleştirme oturum kayıtlarını da kapatır; son aktif HYPER_ADMIN ve son kurum sahibi korunur; API bypass 403", async () => {
    await login("ezgi.guclu@niluferacar.com.tr", "demo-manager-ezgi");
    const lifecycle = await import("../platform/user-lifecycle");
    expect((await lifecycle.deactivateUser(hyper(), { userId: "user_manager_ezgi", reason: "Ayrılan yönetici", confirm: true })).ok).toBe(true);
    expect(await listUserSessions({ userId: "user_manager_ezgi", openOnly: true })).toHaveLength(0);
    const other = await lifecycle.deactivateUser(ctx("HYPER_ADMIN", PLATFORM_TENANT_ID, "hyper_2"), { userId: "user_hyper_admin", reason: "son hyper", confirm: true });
    expect(!other.ok && other.error.message).toContain("Son aktif platform sahibi");
    // 2026-09-12: Nilüfer Acar tenant'ın TEK aktif kurum sahibi (user_super ve admin@ emekli).
    const last = await lifecycle.deactivateUser(hyper(), { userId: "user_owner_nilufer", reason: "son sahip", confirm: true });
    expect(!last.ok && last.error.message).toContain("son aktif kurum sahibi");
    const { POST } = await import("../../app/api/v1/platform/sessions/route");
    const token = await bearer("user_owner_nilufer", "SUPER_ADMIN", DEFAULT_TENANT_ID);
    expect((await POST(req("/api/v1/platform/sessions", token, "POST", { op: "revoke_all", userId: "user_hyper_admin", reason: "bypass", confirm: true }))).status).toBe(403);
  });

  it("sonlandırılmış oturum presence flush'ı veya refresh uzatmasıyla yeniden AÇILMAZ (koşullu kısmi yazım)", async () => {
    const reg = await import("../auth/session-registry");
    const { getUserSession } = await import("../platform/store-ext");
    const sid = (await reg.startUserSession({ userId: "user_manager_ezgi", tenantId: DEFAULT_TENANT_ID, role: "SCHOOL_ADMIN" }))!;
    await reg.revokeUserSession(sid, "user_hyper_admin", "yarış testi");
    reg.touchSessionPresence(sid, { action: "GET /x" }); // ilk dokunuş arka planda satıra yazmayı dener
    await new Promise((r) => setTimeout(r, 50));
    expect(await reg.extendUserSession(sid)).toBe(false);
    expect((await getUserSession(sid))?.revokedAt).not.toBeNull();
  });

  it("çıkış (logout) oturum kaydını kapatır; kayıt yoksa sid'li token fail-closed", async () => {
    const { refreshToken, accessToken } = await login("ezgi.guclu@niluferacar.com.tr", "demo-manager-ezgi");
    const { POST } = await import("../../app/api/v1/auth/logout/route");
    const out = await POST(new Request("http://localhost/api/v1/auth/logout", { method: "POST", headers: { cookie: `np_refresh=${refreshToken}`, origin: "http://localhost" } }));
    expect(out.status).toBe(200);
    const { GET } = await import("../../app/api/v1/tahsilat/roi/route");
    expect((await GET(req("/api/v1/tahsilat/roi", accessToken))).status).toBe(401);
    const ghost = await bearer("user_manager_ezgi", "SCHOOL_ADMIN", DEFAULT_TENANT_ID, "sess_yok");
    expect((await GET(req("/api/v1/tahsilat/roi", ghost))).status).toBe(401);
  });
});

// ───────────────────── Release merkezi ─────────────────────

describe("release merkezi — canlı GitHub/Vercel verisi taklit edilmez", () => {
  it("runtime bilgisi yalnız sağlayıcı env'inden; yoksa commit 'bilinmiyor'; sağlayıcı bağlı değil", () => {
    const local = releases.getRuntimeBuildInfo({ NODE_ENV: "production" } as NodeJS.ProcessEnv);
    expect(local.provider).toBe("unknown");
    expect(local.commitSha).toBeNull();
    const vercel = releases.getRuntimeBuildInfo({ VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_SHA: "abc1234", VERCEL_GIT_COMMIT_REF: "feat" } as unknown as NodeJS.ProcessEnv);
    expect(vercel.commitSha).toBe("abc1234");
    expect(releases.getDeploymentProviderStatus().configured).toBe(false);
  });

  it("elle release: commit ≠ release ≠ deployment; kaynak 'manual'; audit; kurum rolü yazamaz", async () => {
    const input = {
      product: "neviihub",
      name: "Tahsilat iyileştirmeleri",
      version: "1.5.0",
      commit: { sha: "8dfb929", branch: "main" },
      environment: "test",
      summary: "Tahsilat ekranında gecikme filtresi eklendi.",
      migrations: [{ name: "20260913140000_neviios_control_center", status: "pending" }],
    };
    expect(!(await releases.createRelease(ctx("SUPER_ADMIN"), input)).ok).toBe(true);
    const bad = await releases.createRelease(hyper(), { ...input, commit: { sha: "not-a-sha", branch: "main" } });
    expect(!bad.ok && bad.error.code).toBe("VALIDATION_ERROR");
    const r = await releases.createRelease(hyper(), input);
    expect(r.ok && r.data.release.source).toBe("manual");
    const center = await releases.getReleaseCenter(hyper());
    expect(center.ok && center.data.releases).toHaveLength(1);
    expect(center.ok && center.data.deployments).toHaveLength(0); // release otomatik deployment üretmez
    expect(center.ok && center.data.migrations.rows.some((m) => m.name === "20260913140000_neviios_control_center")).toBe(true);
    expect(center.ok && center.data.migrations.rows.every((m) => m.applied === null)).toBe(true); // json: uygulanma bilinmiyor
    expect((await listPlatformAudit({})).some((e) => e.action === "platform.release.create")).toBe(true);
  });

  it("imzalı CI olayı: secret yoksa 503, yanlış imza 401, doğru imza 'signed_ci_event' kaydı", async () => {
    const { POST } = await import("../../app/api/v1/platform/releases/events/route");
    const event = { type: "deployment.reported", eventId: "evt_12345678", deployment: { product: "neviios", environment: "preview", commitSha: "abcdef1", branch: "main", status: "ready" } };
    const raw = JSON.stringify(event);
    const prev = process.env.RELEASE_EVENT_SECRET;
    delete process.env.RELEASE_EVENT_SECRET;
    expect((await POST(new Request("http://localhost/x", { method: "POST", body: raw }))).status).toBe(503);
    process.env.RELEASE_EVENT_SECRET = "test-secret-release-events";
    try {
      expect((await POST(new Request("http://localhost/x", { method: "POST", body: raw, headers: { "x-neviios-signature": "t=1,v1=00" } }))).status).toBe(401);
      const sig = releases.signReleaseEvent(raw, "test-secret-release-events");
      const ok = await POST(new Request("http://localhost/x", { method: "POST", body: raw, headers: { "x-neviios-signature": sig } }));
      expect(ok.status).toBe(200);
      const center = await releases.getReleaseCenter(hyper());
      expect(center.ok && center.data.deployments[0]?.source).toBe("signed_ci_event");
      expect(releases.verifyReleaseEventSignature(raw, sig, "test-secret-release-events", Math.floor(Date.now() / 1000) + 3600)).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.RELEASE_EVENT_SECRET;
      else process.env.RELEASE_EVENT_SECRET = prev;
    }
  });
});

// ───────────────────── Paket ve fiyat motoru ─────────────────────

describe("paket kataloğu ve fiyat motoru", () => {
  const priced = () => {
    const c = catalog.builtinCatalog();
    const pro = c.plans.find((p) => p.key === "pro")!;
    pro.basePriceMonthlyMinor = 150_000;
    pro.basePriceYearlyMinor = 1_500_000;
    pro.includedModules = ["homework", "payments"];
    for (const m of c.modules) {
      m.monthlyPriceMinor = m.key === "homework" ? 10_000 : m.key === "payments" ? 20_000 : m.key === "sms" ? 5_050 : 1_000;
      m.yearlyPriceMinor = m.monthlyPriceMinor * 10;
    }
    c.modules.find((m) => m.key === "crm")!.active = false;
    return c;
  };

  it("temel + dahil modüller + eklentiler ± indirim/override = toplam (kuruş, TRY, KDV hariç)", () => {
    const c = priced();
    const q = catalog.computePlanPrice(c, { planKey: "pro", cycle: "monthly", addons: ["sms"] });
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(q.data.subtotalMinor).toBe(150_000 + 10_000 + 20_000 + 5_050);
    expect(q.data.totalMinor).toBe(185_050);
    expect(q.data.currency).toBe("TRY");
    expect(q.data.taxIncluded).toBe(false);
    const disc = catalog.computePlanPrice(c, { planKey: "pro", cycle: "monthly", addons: ["sms"], adjustment: { type: "discount_percent", value: 10, reason: "Erken kayıt" } });
    expect(disc.ok && disc.data.totalMinor).toBe(185_050 - Math.round(185_050 * 0.1));
    const over = catalog.computePlanPrice(c, { planKey: "pro", cycle: "yearly", addons: [], adjustment: { type: "override_total", value: 1_000_000, reason: "Kurumsal anlaşma" } });
    expect(over.ok && over.data.totalMinor).toBe(1_000_000);
    expect(!catalog.computePlanPrice(c, { planKey: "pro", cycle: "monthly", addons: ["homework"] }).ok).toBe(true); // dahil modül eklenti olamaz
    expect(!catalog.computePlanPrice(c, { planKey: "pro", cycle: "monthly", addons: ["crm"] }).ok).toBe(true); // pasif modül
    const ent = catalog.computePlanPrice(c, { planKey: "enterprise", cycle: "monthly", addons: [] });
    expect(ent.ok && ent.data.totalMinor).toBeNull(); // özel teklif
  });

  it("taslak fiyat internal kalır; public liste yalnız yayındaki katalog + yayınlanmış fiyat; legacy paket seçilemez", async () => {
    const up = await catalog.upsertCatalogPlan(hyper(), { ...catalog.builtinCatalog().plans.find((p) => p.key === "core")!, basePriceMonthlyMinor: 99_900, basePriceYearlyMinor: 999_000, pricePublished: true, reason: "Core fiyatı" });
    expect(up.ok).toBe(true);
    const { GET } = await import("../../app/api/v1/catalog/plans/route");
    const pub = await (await GET(req("/api/v1/catalog/plans", null))).json();
    const core = pub.data.plans.find((p: { key: string }) => p.key === "core");
    expect(core.price.status).toBe("unpublished"); // taslak yayınlanmadı
    expect(pub.data.plans.some((p: { key: string }) => p.key === "standard" || p.key === "professional")).toBe(false);
    const overview = await catalog.getCatalogOverview(hyper());
    const draftId = overview.ok ? overview.data.draftId! : "";
    const publish = await policyVersions.publishPolicyDraft(hyper(), "platform", { draftId, confirm: true });
    expect(publish.ok).toBe(true);
    const pub2 = await (await GET(req("/api/v1/catalog/plans", null))).json();
    expect(pub2.data.plans.find((p: { key: string }) => p.key === "core").price.monthlyMinor).toBeGreaterThanOrEqual(99_900);
    expect((await listPlatformAudit({})).some((e) => e.action === "platform.catalog.plan_upsert")).toBe(true);
  });

  it("aktif aboneliği olan paket hard delete edilemez; yerleşik paket silinemez; kullanılmayan özel paket silinir", async () => {
    const base = catalog.builtinCatalog().plans.find((p) => p.key === "starter")!;
    expect((await catalog.upsertCatalogPlan(hyper(), { ...base, key: "studio", label: "Studio", limits: { students: 1, users: 5, branches: 1 }, reason: "Yeni butik paket" })).ok).toBe(true);
    expect((await catalog.upsertCatalogPlan(hyper(), { ...base, key: "bos_paket", label: "Boş", reason: "Silinecek paket" })).ok).toBe(true);
    const ov = await catalog.getCatalogOverview(hyper());
    expect((await policyVersions.publishPolicyDraft(hyper(), "platform", { draftId: ov.ok ? ov.data.draftId! : "", confirm: true })).ok).toBe(true);

    const sub = await patchInstitution(hyper(), DEFAULT_TENANT_ID, { planKey: "studio", confirm: true, reason: "Studio aboneliği" });
    expect(sub.ok).toBe(true);
    const del = await catalog.deleteCatalogPlan(hyper(), { key: "studio", reason: "Silme denemesi" });
    expect(!del.ok && del.error.code).toBe("FORBIDDEN");
    expect(!del.ok && (del.error.details as Record<string, unknown> | undefined)?.activeSubscriptions).toBe(1);
    const builtin = await catalog.deleteCatalogPlan(hyper(), { key: "starter", reason: "Silme denemesi" });
    expect(!builtin.ok && builtin.error.message).toContain("Yerleşik");
    expect((await catalog.deleteCatalogPlan(hyper(), { key: "bos_paket", reason: "Kullanılmıyor" })).ok).toBe(true);
    // Legacy pakete yeni abonelik yok.
    const legacy = await patchInstitution(hyper(), DEFAULT_TENANT_ID, { planKey: "standard", confirm: true });
    expect(legacy.ok).toBe(false);
  });

  it("abonelik snapshot'ı korur: katalog sonradan değişse de limit değişmez; limit aşımı veri silmez, yalnız yeni kaydı durdurur", async () => {
    const base = catalog.builtinCatalog().plans.find((p) => p.key === "starter")!;
    const active = (await readData()).students.filter((s) => s.active !== false).length;
    await catalog.upsertCatalogPlan(hyper(), { ...base, key: "mini", label: "Mini", limits: { students: active, users: 50, branches: 5 }, reason: "Limit testi paketi" });
    let ov = await catalog.getCatalogOverview(hyper());
    await policyVersions.publishPolicyDraft(hyper(), "platform", { draftId: ov.ok ? ov.data.draftId! : "", confirm: true });
    expect((await patchInstitution(hyper(), DEFAULT_TENANT_ID, { planKey: "mini", confirm: true, reason: "Mini aboneliği" })).ok).toBe(true);
    const snap = (await (await import("../platform/resolve")).resolveSetting({ tenantId: DEFAULT_TENANT_ID }, "subscription.snapshot"))?.effectiveValue;
    expect(subscriptionSnapshotSchema.safeParse(snap).success).toBe(true);
    expect((await resolveTenantLimits(DEFAULT_TENANT_ID)).students).toBe(active);

    // Katalogda Mini'nin limiti yükseltilir ve yayınlanır → mevcut abonelik ETKİLENMEZ.
    await catalog.upsertCatalogPlan(hyper(), { ...base, key: "mini", label: "Mini", limits: { students: 9999, users: 50, branches: 5 }, reason: "Limit artışı" });
    ov = await catalog.getCatalogOverview(hyper());
    const preview = await policyVersions.previewPolicyDraft(hyper(), "platform", ov.ok ? ov.data.draftId! : "");
    expect(preview.ok && preview.data.notes.join(" ")).toContain("snapshot");
    await policyVersions.publishPolicyDraft(hyper(), "platform", { draftId: ov.ok ? ov.data.draftId! : "", confirm: true });
    expect((await resolveTenantLimits(DEFAULT_TENANT_ID)).students).toBe(active);

    const before = (await readData()).students.length;
    const res = await tools.createStudentTool(ctx("SCHOOL_ADMIN"), {
      name: "Limit Test Öğrenci",
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
    });
    expect(!res.ok && res.error.message).toContain("Paket limiti");
    expect((await readData()).students.length).toBe(before);
  });
});

// ───────────────────── Mobil policy + config sürümü ─────────────────────

describe("mobil policy ve NeviiHub config senkronu", () => {
  it("mobil policy değişikliği yeni politika sürümü + audit üretir; configVersion artar, ETag değişir; kurum sahibi yazamaz", async () => {
    const v0 = await computeConfigVersion(DEFAULT_TENANT_ID);
    const s0 = await buildConfigSnapshot(DEFAULT_TENANT_ID, null);
    const denied = await updateTenantSetting(ctx("SUPER_ADMIN"), DEFAULT_TENANT_ID, { key: "mobile.appEnabled", value: true, confirm: true });
    expect(denied.ok).toBe(false);
    const r = await updateTenantSetting(hyper(), DEFAULT_TENANT_ID, { key: "mobile.appEnabled", value: true, confirm: true, reason: "Mobil pilot" });
    expect(r.ok).toBe(true);
    expect(await computeConfigVersion(DEFAULT_TENANT_ID)).toBe(v0 + 1);
    const s1 = await buildConfigSnapshot(DEFAULT_TENANT_ID, null);
    expect(s1.etag).not.toBe(s0.etag);
    expect(s1.mobile.appEnabled).toBe(true);
    expect(s1.mobile.pushProviderConfigured).toBe(false);
    const audit = await listPlatformAudit({ targetTenantId: DEFAULT_TENANT_ID });
    expect(audit.some((e) => e.action === "platform.setting.update" && e.entityId === "mobile.appEnabled")).toBe(true);
    // Geri alma eski kaydı silmez, yeni sürüm üretir ve configVersion yine artar.
    await updateTenantSetting(hyper(), DEFAULT_TENANT_ID, { key: "mobile.appEnabled", value: false, confirm: true, reason: "Pilot bitti" });
    const rb = await policyVersions.rollbackPolicy(hyper(), DEFAULT_TENANT_ID, { key: "mobile.appEnabled", reason: "Pilotu yeniden açıyoruz", confirm: true });
    expect(rb.ok).toBe(true);
    const hist = await listPolicyVersions(DEFAULT_TENANT_ID, "mobile.appEnabled");
    expect(hist).toHaveLength(3);
    expect(await computeConfigVersion(DEFAULT_TENANT_ID)).toBe(v0 + 3);
  });

  it("GET /api/v1/config/snapshot: tenant JWT'den, If-None-Match → 304, başka kurum → 403, şube müdürü okuyabilir", async () => {
    const { GET } = await import("../../app/api/v1/config/snapshot/route");
    const token = await bearer("user_manager_nihal", "BRANCH_MANAGER", DEFAULT_TENANT_ID);
    const first = await GET(req("/api/v1/config/snapshot", token));
    expect(first.status).toBe(200);
    const etag = first.headers.get("etag")!;
    const body = await first.json();
    expect(body.data.contractVersion).toBe(1);
    expect(body.data.viewer.loginRole).toBe("BRANCH_MANAGER");
    expect(body.data.viewer.role).toBe("SCHOOL_ADMIN");
    expect(body.data.access.managerPreset).toBe("unified");
    expect((await GET(req("/api/v1/config/snapshot", token, "GET", undefined, { "if-none-match": etag }))).status).toBe(304);
    expect((await GET(req("/api/v1/config/snapshot?tenantId=tenant_baska", token))).status).toBe(403);
    const hyperNoTenant = await GET(req("/api/v1/config/snapshot", await bearer("user_hyper_admin", "HYPER_ADMIN", PLATFORM_TENANT_ID)));
    expect(hyperNoTenant.status).toBe(400);
  });
});

// ───────────────────── Log retention ─────────────────────

describe("log retention — kritik audit asla silinmez", () => {
  it("allowlist yalnız silinebilir kategorileri içerir; finans/sözleşme/tahsilat/rol aksiyonları kritik sınıflanır", () => {
    for (const cat of Object.keys(retention.AUDITLOG_DELETE_ALLOWLIST)) expect(retention.isCriticalCategory(cat as never)).toBe(false);
    for (const a of ["payment.create", "tahsilat.message_approved", "contract.update", "platform.role.update", "platform.support.open", "bilinmeyen.aksiyon"]) {
      expect(retention.isCriticalCategory(retention.classifyAuditLogAction(a)), a).toBe(true);
    }
    expect(retention.classifyAuditLogAction("auth.success")).toBe("api_telemetry");
    const def = SETTING_BY_KEY.get("retention.days")!;
    expect(parseSettingValue(def, { finance_audit: 30 }).ok).toBe(false); // kritik kategori ayarlanamaz
    expect(parseSettingValue(def, { api_telemetry: 3 }).ok).toBe(false); // alt sınır 7 gün
    expect(parseSettingValue(def, { api_telemetry: 14 }).ok).toBe(true);
  });

  it("dry-run hiçbir şey silmez ve rapor audit'e yazılır; uygula yalnız kapanmış eski oturumları siler, platform audit korunur", async () => {
    const old = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const base = { userId: "user_admin", tenantId: DEFAULT_TENANT_ID, role: "SCHOOL_ADMIN", device: null, lastPath: null, lastAction: null, revokedBy: "t", revokeReason: "t" };
    await saveUserSession({ ...base, id: "sess_old_closed", createdAt: old, lastSeenAt: old, expiresAt: old, revokedAt: old });
    await saveUserSession({ ...base, id: "sess_open", createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString(), revokedAt: null, revokedBy: null, revokeReason: null });
    await updateTenantSetting(hyper(), DEFAULT_TENANT_ID, { key: "appearance.mode", value: "dark_only", confirm: true, reason: "kritik audit üret" });
    const auditBefore = (await listPlatformAudit({ limit: 5000 })).length;

    const dry = await retention.runRetentionCleanup(hyper(), { dryRun: true });
    expect(dry.totalDeleted).toBe(0);
    expect(dry.categories.find((c) => c.category === "session_presence")!.affected).toBe(1);
    expect(dry.categories.filter((c) => c.critical).every((c) => c.affected === 0 && c.deleted === 0)).toBe(true);
    expect(await listUserSessions({})).toHaveLength(2);

    const run = await retention.runRetentionCleanup(hyper(), { dryRun: false });
    expect(run.totalDeleted).toBe(1);
    expect((await listUserSessions({})).map((s) => s.id)).toEqual(["sess_open"]);
    const auditAfter = await listPlatformAudit({ limit: 5000 });
    expect(auditAfter.length).toBe(auditBefore + 2); // hiç silinmedi; iki temizlik raporu eklendi
    expect(auditAfter.some((e) => e.action === "platform.retention.dry_run")).toBe(true);
    expect(auditAfter.some((e) => e.action === "platform.retention.cleanup")).toBe(true);
    expect(auditAfter.some((e) => e.action === "platform.setting.update" && e.entityId === "appearance.mode")).toBe(true);
  });

  it("panelden gerçek silme onay ister; cron ucu secret yoksa 503, yanlış secret 401, varsayılan dry-run", async () => {
    const noConfirm = await retention.runRetentionFromPanel(hyper(), { dryRun: false });
    expect(!noConfirm.ok && (noConfirm.error.details as Record<string, unknown> | undefined)?.requiresConfirm).toBe(true);
    expect(!(await retention.runRetentionFromPanel(ctx("SUPER_ADMIN"), { dryRun: true })).ok).toBe(true);
    const { POST } = await import("../../app/api/v1/platform/jobs/retention/route");
    const prev = process.env.RETENTION_CRON_SECRET;
    delete process.env.RETENTION_CRON_SECRET;
    expect((await POST(req("/api/v1/platform/jobs/retention", "x", "POST"))).status).toBe(503);
    process.env.RETENTION_CRON_SECRET = "cron-secret-for-tests";
    try {
      expect((await POST(req("/api/v1/platform/jobs/retention", "yanlis", "POST"))).status).toBe(401);
      const okRes = await POST(req("/api/v1/platform/jobs/retention", "cron-secret-for-tests", "POST"));
      expect(okRes.status).toBe(200);
      expect((await okRes.json()).data.dryRun).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.RETENTION_CRON_SECRET;
      else process.env.RETENTION_CRON_SECRET = prev;
    }
  });

  it("Vercel Cron: GET + CRON_SECRET kabul edilir, ?apply=1 gerçek temizlik; secret yoksa 503", async () => {
    const { GET } = await import("../../app/api/v1/platform/jobs/retention/route");
    const prevR = process.env.RETENTION_CRON_SECRET;
    const prevC = process.env.CRON_SECRET;
    delete process.env.RETENTION_CRON_SECRET;
    delete process.env.CRON_SECRET;
    expect((await GET(req("/api/v1/platform/jobs/retention?apply=1", "x"))).status).toBe(503);
    process.env.CRON_SECRET = "vercel-cron-secret-123";
    try {
      expect((await GET(req("/api/v1/platform/jobs/retention?apply=1", "yanlis"))).status).toBe(401);
      const res = await GET(req("/api/v1/platform/jobs/retention?apply=1", "vercel-cron-secret-123"));
      expect(res.status).toBe(200);
      expect((await res.json()).data.dryRun).toBe(false);
    } finally {
      if (prevR === undefined) delete process.env.RETENTION_CRON_SECRET;
      else process.env.RETENTION_CRON_SECRET = prevR;
      if (prevC === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prevC;
    }
  });
});

// ───────────────────── Marka / logo + migration ─────────────────────

describe("marka varlıkları ve migration güvenliği", () => {
  it("logo/brand varlıkları 404 vermez: BRAND yolları ve platform logo fallback'i diskte var", async () => {
    expect(existsSync(path.join(ROOT, "public", PLATFORM_LOGO_FALLBACK_PATH))).toBe(true);
    for (const v of Object.values(BRAND)) {
      if (typeof v === "string" && v.startsWith("/brand/")) expect(existsSync(path.join(ROOT, "public", v)), v).toBe(true);
    }
    const { GET } = await import("../../app/api/v1/branding/platform-logo/route");
    const res = await GET(new Request("http://localhost/api/v1/branding/platform-logo"));
    expect([200, 302, 307]).toContain(res.status);
    if (res.status !== 200) expect(res.headers.get("location")).toContain(PLATFORM_LOGO_FALLBACK_PATH);
  });

  it("yeni platform ekranları registry'de ve dosya olarak var", () => {
    for (const id of ["platform.ops.sessions", "platform.ops.retention", "platform.packages", "platform.release", "platform.release.versions", "platform.release.deployments"]) {
      const s = matrix.SCREEN_REGISTRY.find((x) => x.id === id)!;
      expect(s, id).toBeTruthy();
      expect(existsSync(path.join(ROOT, "src/app", s.path, "page.tsx")), s.path).toBe(true);
    }
  });

  it("tur 3 migration additive: DROP yok, kolon değiştirme yok, yeni tablolar var", async () => {
    const sql = await fs.readFile(path.join(ROOT, "prisma/migrations/20260913140000_neviios_control_center/migration.sql"), "utf-8");
    const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(code).not.toMatch(/\bDROP\b|ALTER COLUMN|\bUPDATE\b|\bDELETE\b/i);
    // Birleşik migration'daki ALTER TABLE'lar yalnız additive "ADD COLUMN IF NOT EXISTS" içerir.
    for (const stmt of code.split(";").filter((x) => /ALTER TABLE/i.test(x))) {
      expect(stmt.replace(/ALTER TABLE "\w+"/, "").split(",").every((c) => /ADD COLUMN IF NOT EXISTS/.test(c))).toBe(true);
    }
    for (const t of ["UserSession", "PlatformRelease", "PlatformDeployment"]) expect(code).toContain(`CREATE TABLE IF NOT EXISTS "${t}"`);
  });

  it("HYPER_ADMIN girişi oturum kaydıyla çalışır", async () => {
    const { accessToken } = await login(DEV_HYPER_ADMIN_EMAIL, DEV_HYPER_ADMIN_PASSWORD);
    const { GET } = await import("../../app/api/v1/platform/roles/route");
    expect((await GET(req("/api/v1/platform/roles", accessToken))).status).toBe(200);
  });
});
