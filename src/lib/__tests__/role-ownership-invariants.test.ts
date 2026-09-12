import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID, PLATFORM_TENANT_ID } from "../auth/config";
import type { AppRole } from "../auth/types";

/**
 * 2026-09-12 nihai hesap/rol sahipliği — gerçek JWT + route handler'larıyla:
 * tek HYPER_ADMIN (platform sahibi), Nilüfer Acar = SUPER_ADMIN (kurum sahibi),
 * Ezgi = SCHOOL_ADMIN, Nihal = BRANCH_MANAGER (unified → efektif SCHOOL_ADMIN),
 * eski admin@ = emekli (giriş kapalı, açık token geçersiz, kayıt korunur).
 */

const { resetPlatformStoreForTests } = await import("../platform/store");
const { invalidateSessionValidity } = await import("../auth/session-validity");
const { __resetPresenceForTests } = await import("../auth/session-registry");
const { issueTokenPair, verifyAccessToken } = await import("../auth/jwt");
const { authenticateRequest } = await import("../auth/authenticate");
const { buildServiceContext } = await import("../api/context");
const { invalidateManagerPreset } = await import("../platform/manager-preset");
const { authenticateUser, getUserById, tenantAllowsLogin, listAdminUserIdsForTenant } = await import("../auth/users");
const { listStaffTool, getFinanceSummaryTool } = await import("../services/tools");
const { __resetRateLimitForTests } = await import("../rate-limit");

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

const NILUFER = { id: "user_owner_nilufer", email: "nilufer.acar@niluferacar.com.tr", pw: "demo-owner-nilufer" };
const EZGI = { id: "user_manager_ezgi", email: "ezgi.guclu@niluferacar.com.tr", pw: "demo-manager-ezgi" };
const NIHAL = { id: "user_manager_nihal", email: "nihal.gedikli@niluferacar.com.tr", pw: "demo-manager-nihal" };
const OLD_ADMIN = { id: "user_admin", email: "admin@niluferacar.com.tr", pw: "demo-admin" };
const OLD_SUPER = { id: "user_super", email: "super@notaplan.app", pw: "demo-super" };

async function bearer(userId: string, role: AppRole, tenantId = DEFAULT_TENANT_ID) {
  return (await issueTokenPair({ userId, role, tenantId })).accessToken;
}
function req(url: string, token: string | null) {
  return new Request(`http://localhost${url}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
}
async function authCtx(userId: string, role: AppRole) {
  const r = req("/api/v1/x", await bearer(userId, role));
  const auth = await authenticateRequest(r, "req_inv");
  if (!auth.ok) throw new Error("auth failed");
  return buildServiceContext(auth.user, r, "req_inv");
}

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
});

describe("HYPER_ADMIN tekilliği (platform sahibi)", () => {
  it("fixture'da HYPER_ADMIN yalnız hyperAdminBootstrapUsers içindeki user_hyper_admin / platform tenant'ıdır", async () => {
    const src = await fs.readFile(path.join(process.cwd(), "src/lib/auth/users.ts"), "utf8");
    const fnStart = src.indexOf("function hyperAdminBootstrapUsers");
    const fnBody = src.slice(fnStart, src.indexOf("\n}\n", fnStart));
    const outside = src.slice(0, fnStart) + src.slice(fnStart + fnBody.length);
    expect(outside).not.toMatch(/role:\s*"HYPER_ADMIN"/);
    expect(fnBody.match(/role:\s*"HYPER_ADMIN"/g)).toHaveLength(2); // prod + dev dalı, aynı kimlik
    expect(fnBody.match(/userId:\s*"([^"]+)"/g)?.every((m) => m.includes("user_hyper_admin"))).toBe(true);
    expect(fnBody.match(/tenantId:\s*([A-Z_]+)/g)?.every((m) => m.includes("PLATFORM_TENANT_ID"))).toBe(true);
  });

  it("kurum kullanıcıları ve kurum sahibi HYPER_ADMIN değildir; HYPER_ADMIN kurum tenant'ından giriş yapamaz", async () => {
    for (const u of [NILUFER, EZGI, NIHAL]) {
      const a = await authenticateUser(u.email, u.pw);
      expect(a, u.email).not.toBeNull();
      expect(a?.role, u.email).not.toBe("HYPER_ADMIN");
      expect(a?.tenantId, u.email).toBe(DEFAULT_TENANT_ID);
    }
    expect(await tenantAllowsLogin(DEFAULT_TENANT_ID, "HYPER_ADMIN")).toBe(false);
    expect(await tenantAllowsLogin(PLATFORM_TENANT_ID, "SUPER_ADMIN")).toBe(false);
  });

  it("/platform API'si yalnız HYPER_ADMIN'e açık; diğer tüm roller 403", async () => {
    const { GET } = await import("../../app/api/v1/platform/roles/route");
    const url = `/api/v1/platform/roles?tenantId=${DEFAULT_TENANT_ID}`;
    expect((await GET(req(url, await bearer("user_hyper_admin", "HYPER_ADMIN", PLATFORM_TENANT_ID)))).status).toBe(200);
    const others: [string, AppRole][] = [
      [NILUFER.id, "SUPER_ADMIN"],
      [EZGI.id, "SCHOOL_ADMIN"],
      [NIHAL.id, "BRANCH_MANAGER"],
      ["user_teacher_t1", "TEACHER"],
      ["user_student_s1", "STUDENT"],
      ["user_agent", "AI_AGENT"],
    ];
    for (const [id, role] of others) {
      expect((await GET(req(url, await bearer(id, role)))).status, `${id}/${role}`).toBe(403);
    }
  });
});

describe("Nilüfer Acar — kurum sahibi (SUPER_ADMIN)", () => {
  it("hassas personel ve finans özetine erişir; efektif rol = giriş rolü", async () => {
    const c = await authCtx(NILUFER.id, "SUPER_ADMIN");
    expect(c.role).toBe("SUPER_ADMIN");
    expect(c.loginRole).toBeUndefined();
    expect((await listStaffTool(c, {})).ok).toBe(true);
    expect((await getFinanceSummaryTool(c, {})).ok).toBe(true);
  });

  it("kurum operasyonuna erişir, /platform'a erişemez", async () => {
    const token = await bearer(NILUFER.id, "SUPER_ADMIN");
    const { GET: roi } = await import("../../app/api/v1/tahsilat/roi/route");
    expect((await roi(req("/api/v1/tahsilat/roi", token))).status).toBe(200);
    const { GET: plat } = await import("../../app/api/v1/platform/roles/route");
    expect((await plat(req("/api/v1/platform/roles", token))).status).toBe(403);
  });
});

describe("Ezgi (SCHOOL_ADMIN) ve Nihal (BRANCH_MANAGER) — hassas alan yok", () => {
  it("personel/finans özeti ikisine de FORBIDDEN", async () => {
    for (const [id, role] of [[EZGI.id, "SCHOOL_ADMIN"], [NIHAL.id, "BRANCH_MANAGER"]] as const) {
      const c = await authCtx(id, role);
      const staff = await listStaffTool(c, {});
      const fin = await getFinanceSummaryTool(c, {});
      expect(!staff.ok && staff.error.code, id).toBe("FORBIDDEN");
      expect(!fin.ok && fin.error.code, id).toBe("FORBIDDEN");
    }
  });

  it("Nihal: login rolü BRANCH_MANAGER (JWT değişmez), unified preset ile efektif SCHOOL_ADMIN → günlük operasyon açık", async () => {
    const token = await bearer(NIHAL.id, "BRANCH_MANAGER");
    expect((await verifyAccessToken(token)).role).toBe("BRANCH_MANAGER");
    const c = await authCtx(NIHAL.id, "BRANCH_MANAGER");
    expect(c.role).toBe("SCHOOL_ADMIN");
    expect(c.loginRole).toBe("BRANCH_MANAGER");
    const { GET } = await import("../../app/api/v1/tahsilat/roi/route");
    expect((await GET(req("/api/v1/tahsilat/roi", token))).status).toBe(200);
    expect((await getUserById(NIHAL.id))?.role).toBe("BRANCH_MANAGER");
  });
});

describe("eski admin@niluferacar.com.tr — emekli (duplicate) hesap", () => {
  it("giriş reddedilir, kurum sahibi yetkisi yoktur, yönetici bildirim listesinde yoktur", async () => {
    expect(await authenticateUser(OLD_ADMIN.email, OLD_ADMIN.pw)).toBeNull();
    expect(await getUserById(OLD_ADMIN.id)).toBeNull();
    expect(await listAdminUserIdsForTenant(DEFAULT_TENANT_ID, ["SUPER_ADMIN"])).not.toContain(OLD_ADMIN.id);
    expect(await listAdminUserIdsForTenant(DEFAULT_TENANT_ID)).not.toContain(OLD_ADMIN.id);
    expect(await listAdminUserIdsForTenant(DEFAULT_TENANT_ID, ["SUPER_ADMIN"])).toContain(NILUFER.id);
  });

  it("önceden alınmış token (eski SUPER_ADMIN iddiası dahil) API'de 401; refresh de 401", async () => {
    const pair = await issueTokenPair({ userId: OLD_ADMIN.id, role: "SUPER_ADMIN", tenantId: DEFAULT_TENANT_ID });
    const { GET } = await import("../../app/api/v1/tahsilat/roi/route");
    expect((await GET(req("/api/v1/tahsilat/roi", pair.accessToken))).status).toBe(401);
    const { POST } = await import("../../app/api/v1/auth/refresh/route");
    const r = await POST(
      new Request("http://localhost/api/v1/auth/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: pair.refreshToken }),
      })
    );
    expect(r.status).toBe(401);
  });
});

describe("eski super@notaplan.app (user_super) — emekli demo/bootstrap hesabı", () => {
  it("giriş reddedilir; kurum sahibi / platform yetkisi yok; eski token + refresh 401; /platform 401", async () => {
    expect(await authenticateUser(OLD_SUPER.email, OLD_SUPER.pw)).toBeNull();
    expect(await getUserById(OLD_SUPER.id)).toBeNull();
    const pair = await issueTokenPair({ userId: OLD_SUPER.id, role: "SUPER_ADMIN", tenantId: DEFAULT_TENANT_ID });
    const { GET } = await import("../../app/api/v1/tahsilat/roi/route");
    expect((await GET(req("/api/v1/tahsilat/roi", pair.accessToken))).status).toBe(401);
    const { GET: plat } = await import("../../app/api/v1/platform/roles/route");
    expect((await plat(req("/api/v1/platform/roles", pair.accessToken))).status).toBe(401);
    const { POST } = await import("../../app/api/v1/auth/refresh/route");
    const r = await POST(
      new Request("http://localhost/api/v1/auth/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: pair.refreshToken }),
      })
    );
    expect(r.status).toBe(401);
  });
});

describe("Nilüfer Acar — tek aktif kurum sahibi", () => {
  it("tenant'taki aktif SUPER_ADMIN listesi yalnız Nilüfer'dir (admin@ ve super@ emekli)", async () => {
    expect(await listAdminUserIdsForTenant(DEFAULT_TENANT_ID, ["SUPER_ADMIN"])).toEqual([NILUFER.id]);
  });
});

describe("tenant izolasyonu", () => {
  it("Tenant A kurum sahibi Tenant B config'ini okuyamaz; Tenant B token'ı A'nın /platform verisine de ulaşamaz", async () => {
    const { GET } = await import("../../app/api/v1/config/snapshot/route");
    const token = await bearer(NILUFER.id, "SUPER_ADMIN");
    expect((await GET(req("/api/v1/config/snapshot?tenantId=tenant_baska", token))).status).toBe(403);
    const { GET: plat } = await import("../../app/api/v1/platform/roles/route");
    const ownerB = await bearer("owner_b", "SUPER_ADMIN", "tenant_baska");
    expect((await plat(req(`/api/v1/platform/roles?tenantId=${DEFAULT_TENANT_ID}`, ownerB))).status).toBe(403);
  });
});
