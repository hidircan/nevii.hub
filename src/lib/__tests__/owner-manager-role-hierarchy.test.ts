import { describe, it, expect } from "vitest";
import { authenticateUser } from "../auth/users";
import { listAvailableKurumlar } from "../institution/context";
import { listStaffTool, listPayrollTool, getFinanceSummaryTool } from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

/**
 * Rol hiyerarşisi (2026-09-12 nihai): Nilüfer Acar kurum sahibidir (SUPER_ADMIN).
 * Ezgi Güçlü kurum yöneticisidir (SCHOOL_ADMIN). Platform sahibi ayrıdır (HYPER_ADMIN).
 */
describe("Nilüfer Acar (kurum sahibi) ve Ezgi Güçlü (kurum müdürü) bootstrap kimlikleri", () => {
  it("Nilüfer Acar kurum sahibi olarak SUPER_ADMIN ile giriş yapar (HYPER_ADMIN değildir)", async () => {
    const user = await authenticateUser("nilufer.acar@niluferacar.com.tr", "demo-owner-nilufer");
    expect(user).not.toBeNull();
    expect(user?.role).toBe("SUPER_ADMIN");
    expect(user?.tenantId).toBe(DEFAULT_TENANT_ID);
  });

  it("Ezgi Güçlü kendi e-posta/şifresiyle SCHOOL_ADMIN olarak, tenant_nilufer_acar ile sınırlı giriş yapar", async () => {
    const user = await authenticateUser("ezgi.guclu@niluferacar.com.tr", "demo-manager-ezgi");
    expect(user).not.toBeNull();
    expect(user?.role).toBe("SCHOOL_ADMIN");
    expect(user?.tenantId).toBe(DEFAULT_TENANT_ID);
    expect(user?.tenantId).toBe("tenant_nilufer_acar");
  });

  it("yanlış şifreyle her iki hesap da reddedilir", async () => {
    expect(await authenticateUser("nilufer.acar@niluferacar.com.tr", "wrong")).toBeNull();
    expect(await authenticateUser("ezgi.guclu@niluferacar.com.tr", "wrong")).toBeNull();
  });
});

describe("Kurum sahibi (SUPER_ADMIN) ve kurum yöneticisi (SCHOOL_ADMIN) yalnız kendi kurumunu görür", () => {
  it("SUPER_ADMIN (Nilüfer) listAvailableKurumlar'da YALNIZ kendi tenant'ını görür", async () => {
    const ownerCtx = ctx({ role: "SUPER_ADMIN", userId: "user_owner_nilufer", tenantId: DEFAULT_TENANT_ID });
    const kurumlar = await listAvailableKurumlar(ownerCtx);
    expect(kurumlar).toHaveLength(1);
    expect(kurumlar[0]!.tenantId).toBe(DEFAULT_TENANT_ID);
  });

  it("SUPER_ADMIN (kurum sahibi) listAvailableKurumlar'da YALNIZ kendi tenant'ını görür", async () => {
    const superCtx = ctx({ role: "SUPER_ADMIN", tenantId: "herhangi-bir-tenant" });
    const kurumlar = await listAvailableKurumlar(superCtx);
    expect(kurumlar).toHaveLength(1);
    expect(kurumlar[0]!.tenantId).toBe("herhangi-bir-tenant");
  });

  it("SCHOOL_ADMIN (Ezgi) rolü listAvailableKurumlar'da YALNIZ kendi tenant'ını görür", async () => {
    const schoolAdminCtx = ctx({ role: "SCHOOL_ADMIN", tenantId: DEFAULT_TENANT_ID });
    const kurumlar = await listAvailableKurumlar(schoolAdminCtx);
    expect(kurumlar).toHaveLength(1);
    expect(kurumlar[0]!.tenantId).toBe(DEFAULT_TENANT_ID);
  });

  it("SCHOOL_ADMIN başka bir tenantId ile çağrılsa bile YALNIZ o tenant'a düşer (gerçek veri yoksa fallback tek-öğeli liste, asla başka kurum sızmaz)", async () => {
    const otherTenantCtx = ctx({ role: "SCHOOL_ADMIN", tenantId: "tenant_baska_okul" });
    const kurumlar = await listAvailableKurumlar(otherTenantCtx);
    expect(kurumlar).toHaveLength(1);
    expect(kurumlar[0]!.tenantId).toBe("tenant_baska_okul");
  });
});

describe("Öğretmen rolü Personel/Bordro/Finans ekranlarına erişemez", () => {
  it("TEACHER listStaffTool/listPayrollTool/getFinanceSummaryTool çağıramaz (FORBIDDEN)", async () => {
    const teacherCtx = ctx({ role: "TEACHER" });
    const staff = await listStaffTool(teacherCtx, {});
    expect(staff.ok).toBe(false);
    if (!staff.ok) expect(staff.error.code).toBe("FORBIDDEN");

    const payroll = await listPayrollTool(teacherCtx, {});
    expect(payroll.ok).toBe(false);
    if (!payroll.ok) expect(payroll.error.code).toBe("FORBIDDEN");

    const finance = await getFinanceSummaryTool(teacherCtx, {});
    expect(finance.ok).toBe(false);
    if (!finance.ok) expect(finance.error.code).toBe("FORBIDDEN");
  });

  it("NeviiOS tur 3 owner kararı: Personel/Bordro/Finans özeti YALNIZ SUPER_ADMIN; SCHOOL_ADMIN reddedilir", async () => {
    const owner = ctx({ role: "SUPER_ADMIN" });
    expect((await listStaffTool(owner, {})).ok).toBe(true);
    expect((await getFinanceSummaryTool(owner, {})).ok).toBe(true);
    const manager = ctx({ role: "SCHOOL_ADMIN" });
    const staff = await listStaffTool(manager, {});
    expect(!staff.ok && staff.error.code).toBe("FORBIDDEN");
    const finance = await getFinanceSummaryTool(manager, {});
    expect(!finance.ok && finance.error.code).toBe("FORBIDDEN");
  });
});
