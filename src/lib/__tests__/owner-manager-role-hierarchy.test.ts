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
 * P0 — rol hiyerarşisi: Nilüfer Acar kurum sahibidir (SCHOOL_ADMIN, SUPER_ADMIN
 * değil). Ezgi Güçlü kurum müdürüdür (SCHOOL_ADMIN). Platform sahibi ayrıdır.
 */
describe("Nilüfer Acar (kurum sahibi) ve Ezgi Güçlü (kurum müdürü) bootstrap kimlikleri", () => {
  it("Nilüfer Acar SCHOOL_ADMIN olarak giriş yapar — SUPER_ADMIN değildir", async () => {
    const user = await authenticateUser("nilufer.acar@niluferacar.com.tr", "demo-owner-nilufer");
    expect(user).not.toBeNull();
    expect(user?.role).toBe("SCHOOL_ADMIN");
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

describe("Nilüfer'in kendi kurumu vs. platform sahibinin tüm kurumları", () => {
  it("SCHOOL_ADMIN (Nilüfer) listAvailableKurumlar'da YALNIZ kendi tenant'ını görür", async () => {
    const ownerCtx = ctx({ role: "SCHOOL_ADMIN", userId: "user_owner_nilufer", tenantId: DEFAULT_TENANT_ID });
    const kurumlar = await listAvailableKurumlar(ownerCtx);
    expect(kurumlar).toHaveLength(1);
    expect(kurumlar[0]!.tenantId).toBe(DEFAULT_TENANT_ID);
  });

  it("SUPER_ADMIN platform rolü listAvailableKurumlar'da tenant filtresi uygulamadan kurum listesini görür", async () => {
    const superCtx = ctx({ role: "SUPER_ADMIN", userId: "user_super", tenantId: "herhangi-bir-tenant" });
    const kurumlar = await listAvailableKurumlar(superCtx);
    expect(kurumlar.length).toBeGreaterThan(0);
    expect(kurumlar.some((k) => k.tenantId !== superCtx.tenantId)).toBe(true);
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

  it("hem SUPER_ADMIN hem SCHOOL_ADMIN Personel/Bordro/Finans'a erişebilir", async () => {
    for (const role of ["SUPER_ADMIN", "SCHOOL_ADMIN"] as const) {
      const adminCtx = ctx({ role });
      const staff = await listStaffTool(adminCtx, {});
      expect(staff.ok, `${role} listStaffTool`).toBe(true);
      const finance = await getFinanceSummaryTool(adminCtx, {});
      expect(finance.ok, `${role} getFinanceSummaryTool`).toBe(true);
    }
  });
});
