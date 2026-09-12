import { describe, it, expect } from "vitest";
import {
  canSeeAllKurumlar,
  canViewFinanceAndStaffSummary,
  isInstitutionOwner,
  isPlatformOwner,
  INSTITUTION_MANAGER_USER_ID,
  INSTITUTION_OWNER_USER_ID,
} from "../auth/platform-access";
import { pickInstitutionSelection, ALL_KURUMLAR } from "../institution/scope";

const TWO = [
  { tenantId: "tenant_a", name: "A" },
  { tenantId: "tenant_b", name: "B" },
];

/**
 * 2026-09-12 rol sözleşmesi: HYPER_ADMIN = platform sahibi, SUPER_ADMIN =
 * kurum sahibi, SCHOOL_ADMIN = kurum yöneticisi, BRANCH_MANAGER = şube
 * yöneticisi. Kararlar yalnız role bakar (userId listesi yok).
 */
describe("merkezi erişim sözleşmesi", () => {
  it("platform sahibi yalnız HYPER_ADMIN; SUPER_ADMIN artık platform sahibi DEĞİL", () => {
    expect(isPlatformOwner({ userId: "user_hyper_admin", role: "HYPER_ADMIN" })).toBe(true);
    expect(isPlatformOwner({ userId: "user_super", role: "SUPER_ADMIN" })).toBe(false);
    expect(isPlatformOwner({ userId: INSTITUTION_OWNER_USER_ID, role: "SUPER_ADMIN" })).toBe(false);
  });

  it("kurum sahibi SUPER_ADMIN'dir; SCHOOL_ADMIN ve BRANCH_MANAGER değildir", () => {
    expect(isInstitutionOwner({ userId: INSTITUTION_OWNER_USER_ID, role: "SUPER_ADMIN" })).toBe(true);
    expect(isInstitutionOwner({ userId: INSTITUTION_MANAGER_USER_ID, role: "SCHOOL_ADMIN" })).toBe(false);
    expect(isInstitutionOwner({ userId: "user_manager_nihal", role: "BRANCH_MANAGER" })).toBe(false);
    expect(isInstitutionOwner({ userId: "user_hyper_admin", role: "HYPER_ADMIN" })).toBe(false);
  });

  it("Tüm kurumlar yalnız HYPER_ADMIN; kurum sahibi kendi kurumuna düşer", () => {
    expect(canSeeAllKurumlar({ userId: "user_hyper_admin", role: "HYPER_ADMIN" })).toBe(true);
    expect(canSeeAllKurumlar({ userId: INSTITUTION_OWNER_USER_ID, role: "SUPER_ADMIN" })).toBe(false);
    expect(pickInstitutionSelection("SUPER_ADMIN", "tenant_a", TWO, ALL_KURUMLAR)).toBe("tenant_a");
    expect(pickInstitutionSelection("HYPER_ADMIN", "tenant_a", TWO, ALL_KURUMLAR)).toBe(ALL_KURUMLAR);
    expect(
      pickInstitutionSelection("SCHOOL_ADMIN", "tenant_a", [{ tenantId: "tenant_a", name: "A" }], "tenant_b")
    ).toBe("tenant_a");
  });

  it("personel/finans özeti yalnız kurum sahibi (SUPER_ADMIN)", () => {
    expect(canViewFinanceAndStaffSummary({ userId: INSTITUTION_OWNER_USER_ID, role: "SUPER_ADMIN" })).toBe(true);
    expect(canViewFinanceAndStaffSummary({ userId: INSTITUTION_MANAGER_USER_ID, role: "SCHOOL_ADMIN" })).toBe(false);
    expect(canViewFinanceAndStaffSummary({ userId: "user_owner_nilufer", role: "SCHOOL_ADMIN" })).toBe(false);
    expect(canViewFinanceAndStaffSummary({ userId: "user_manager_nihal", role: "BRANCH_MANAGER" })).toBe(false);
    expect(canViewFinanceAndStaffSummary({ userId: "user_hyper_admin", role: "HYPER_ADMIN" })).toBe(false);
  });

  it("login rolleri: Nilüfer SUPER_ADMIN, Ezgi SCHOOL_ADMIN, Nihal BRANCH_MANAGER (tek kimlik); eski admin@ kapalı", async () => {
    const { authenticateUser } = await import("../auth/users");
    const nilufer = await authenticateUser("nilufer.acar@niluferacar.com.tr", "demo-owner-nilufer");
    expect(nilufer?.role).toBe("SUPER_ADMIN");
    expect(nilufer?.tenantId).toBe("tenant_nilufer_acar");
    expect(await authenticateUser("admin@niluferacar.com.tr", "demo-admin")).toBeNull();
    expect((await authenticateUser("ezgi.guclu@niluferacar.com.tr", "demo-manager-ezgi"))?.role).toBe("SCHOOL_ADMIN");
    const nihal = await authenticateUser("nihal.gedikli@niluferacar.com.tr", "demo-manager-nihal");
    expect(nihal?.role).toBe("BRANCH_MANAGER");
    expect(nihal?.userId).toBe("user_manager_nihal");
  });
});
