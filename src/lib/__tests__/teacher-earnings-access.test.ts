import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID, PLATFORM_TENANT_ID } from "../auth/config";
import type { AppRole } from "../auth/types";
import type { ServiceContext } from "../services/context";

/**
 * Nilüfer Acar'a özel Öğretmen Hakedişleri erişimi (owner kararı 2026-09-12):
 * SUPER_ADMIN + SCHOOL_ADMIN + BRANCH_MANAGER (unified). Kurum politikası
 * `access.teacherEarningsAccess` — sürümlü + audit'li; genel finans yetkisi DEĞİL.
 */

const { resetPlatformStoreForTests, listPlatformAudit } = await import("../platform/store");
const { invalidateSessionValidity } = await import("../auth/session-validity");
const { issueTokenPair } = await import("../auth/jwt");
const { authenticateRequest } = await import("../auth/authenticate");
const { buildServiceContext } = await import("../api/context");
const { invalidateManagerPreset } = await import("../platform/manager-preset");
const { canAccessTeacherEarnings, invalidateTeacherEarningsAccess, resolveTeacherEarningsAccess } = await import(
  "../platform/teacher-earnings-access"
);
const { updateTenantSetting } = await import("../platform/service");
const { listPolicyVersions } = await import("../platform/store-ext");
const tools = await import("../services/tools");

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const PERIOD = { teacherId: "t1", periodStart: "2026-09-01", periodEnd: "2026-09-30" };
const OTHER_TENANT = "tenant_baska_kurum";

const hyper = (): ServiceContext => ({ role: "HYPER_ADMIN", userId: "user_hyper_admin", tenantId: PLATFORM_TENANT_ID, channel: "web", requestId: "req_te" });

async function authCtx(userId: string, role: AppRole, tenantId = DEFAULT_TENANT_ID) {
  const token = (await issueTokenPair({ userId, role, tenantId })).accessToken;
  const r = new Request("http://localhost/api/v1/x", { headers: { authorization: `Bearer ${token}` } });
  const auth = await authenticateRequest(r, "req_te");
  if (!auth.ok) throw new Error("auth failed");
  return buildServiceContext(auth.user, r, "req_te");
}
const isGateDenied = (r: { ok: boolean; error?: { code: string; message: string } }) =>
  !r.ok && r.error?.code === "FORBIDDEN";

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await resetPlatformStoreForTests();
  invalidateSessionValidity();
  invalidateManagerPreset();
  invalidateTeacherEarningsAccess();
});
afterEach(async () => {
  await resetPlatformStoreForTests();
  invalidateManagerPreset();
  invalidateTeacherEarningsAccess();
});

describe("Nilüfer Acar — Hakediş: SUPER_ADMIN + SCHOOL_ADMIN + BRANCH_MANAGER (unified)", () => {
  it("owner varsayılanı school_admin_and_branch_manager; diğer kurumlar platform varsayılanı school_admin", async () => {
    expect(await resolveTeacherEarningsAccess(DEFAULT_TENANT_ID)).toBe("school_admin_and_branch_manager");
    expect(await resolveTeacherEarningsAccess(OTHER_TENANT)).toBe("school_admin");
  });

  it("Nilüfer, Ezgi ve Nihal hakediş listesini ve hesaplamasını çalıştırır (gerçek token, efektif rol)", async () => {
    for (const [id, role] of [
      ["user_owner_nilufer", "SUPER_ADMIN"],
      ["user_manager_ezgi", "SCHOOL_ADMIN"],
      ["user_manager_nihal", "BRANCH_MANAGER"],
    ] as const) {
      const c = await authCtx(id, role);
      expect(await canAccessTeacherEarnings(c), id).toBe(true);
      expect((await tools.listTeacherPayoutsTool(c, { teacherId: "t1" })).ok, id).toBe(true);
      expect(isGateDenied(await tools.computeTeacherPayoutTool(c, PERIOD)), id).toBe(false);
    }
  });

  it("hakediş yetkisi genel finans/personel yetkisi DEĞİLDİR: Ezgi ve Nihal finans özeti + personelde FORBIDDEN", async () => {
    for (const [id, role] of [["user_manager_ezgi", "SCHOOL_ADMIN"], ["user_manager_nihal", "BRANCH_MANAGER"]] as const) {
      const c = await authCtx(id, role);
      expect(isGateDenied(await tools.getFinanceSummaryTool(c, {})), id).toBe(true);
      expect(isGateDenied(await tools.listStaffTool(c, {})), id).toBe(true);
    }
  });

  it("HYPER_ADMIN kurum hakedişine erişmez; öğretmen yalnız kendi hakedişini görür", async () => {
    expect(await canAccessTeacherEarnings(hyper())).toBe(false);
    expect(isGateDenied(await tools.computeTeacherPayoutTool(hyper(), PERIOD))).toBe(true);
    const teacher: ServiceContext = { role: "TEACHER", userId: "user_teacher_t1", teacherId: "t1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    expect((await tools.listTeacherPayoutsTool(teacher, { teacherId: "t1" })).ok).toBe(true);
    expect((await tools.listTeacherPayoutsTool(teacher, { teacherId: "t2" })).ok).toBe(false);
  });
});

describe("tenant bazlı ve sürümlü politika", () => {
  it("başka kurumda BRANCH_MANAGER (unified olsa bile) açık izin olmadan hakedişe erişemez; SCHOOL_ADMIN erişir", async () => {
    const bmUnified = { role: "SCHOOL_ADMIN" as const, loginRole: "BRANCH_MANAGER" as const, tenantId: OTHER_TENANT };
    expect(await canAccessTeacherEarnings(bmUnified)).toBe(false);
    expect(await canAccessTeacherEarnings({ role: "SCHOOL_ADMIN", tenantId: OTHER_TENANT })).toBe(true);
  });

  it("branch_scoped BRANCH_MANAGER fail-closed reddedilir (şube-filtreli hakediş yüzeyi yok)", async () => {
    expect(await canAccessTeacherEarnings({ role: "BRANCH_MANAGER", loginRole: undefined, tenantId: DEFAULT_TENANT_ID })).toBe(false);
    const res = await updateTenantSetting(hyper(), DEFAULT_TENANT_ID, { key: "access.managerPreset", value: "branch_scoped", confirm: true });
    expect(res.ok).toBe(true);
    const nihal = await authCtx("user_manager_nihal", "BRANCH_MANAGER");
    expect(nihal.role).toBe("BRANCH_MANAGER");
    expect(isGateDenied(await tools.listTeacherPayoutsTool(nihal, { teacherId: "t1" }))).toBe(true);
  });

  it("owner_only yapılınca SCHOOL_ADMIN ve BRANCH_MANAGER kaybeder, kurum sahibi korur; değişiklik sürümlenir + audit'lenir", async () => {
    const res = await updateTenantSetting(hyper(), DEFAULT_TENANT_ID, { key: "access.teacherEarningsAccess", value: "owner_only", confirm: true });
    expect(res.ok).toBe(true);
    expect(await canAccessTeacherEarnings(await authCtx("user_manager_ezgi", "SCHOOL_ADMIN"))).toBe(false);
    expect(await canAccessTeacherEarnings(await authCtx("user_manager_nihal", "BRANCH_MANAGER"))).toBe(false);
    expect(await canAccessTeacherEarnings(await authCtx("user_owner_nilufer", "SUPER_ADMIN"))).toBe(true);
    expect((await listPolicyVersions(DEFAULT_TENANT_ID, "access.teacherEarningsAccess")).some((v) => v.status === "published")).toBe(true);
    const audit = await listPlatformAudit({ targetTenantId: DEFAULT_TENANT_ID });
    expect(audit.some((e) => e.action === "platform.setting.update" && JSON.stringify(e).includes("access.teacherEarningsAccess"))).toBe(true);
  });

  it("kurum sahibi kendi politikasını değiştiremez (platformOnly)", async () => {
    const owner: ServiceContext = { role: "SUPER_ADMIN", userId: "user_owner_nilufer", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    const res = await updateTenantSetting(owner, DEFAULT_TENANT_ID, { key: "access.teacherEarningsAccess", value: "school_admin", confirm: true });
    expect(res.ok).toBe(false);
  });
});
