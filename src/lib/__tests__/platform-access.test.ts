import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  canSeeAllKurumlar,
  canViewFinanceAndStaffSummary,
  isPlatformOwner,
  INSTITUTION_MANAGER_USER_ID,
  INSTITUTION_OWNER_USER_ID,
  PLATFORM_OWNER_USER_ID,
} from "../auth/platform-access";
import { pickInstitutionSelection, ALL_KURUMLAR } from "../institution/scope";

const TWO = [
  { tenantId: "tenant_a", name: "A" },
  { tenantId: "tenant_b", name: "B" },
];

describe("platform sahibi / kurum sahibi", () => {
  it("SCHOOL_ADMIN platform sahibi değildir; SUPER_ADMIN platform erişimidir", () => {
    expect(isPlatformOwner({ userId: PLATFORM_OWNER_USER_ID, role: "SUPER_ADMIN" })).toBe(true);
    expect(isPlatformOwner({ userId: INSTITUTION_OWNER_USER_ID, role: "SCHOOL_ADMIN" })).toBe(false);
    expect(isPlatformOwner({ userId: "super1", role: "SUPER_ADMIN" })).toBe(true);
  });

  it("Nilüfer Acar başka kurum / Tüm kurumlar seçemez", () => {
    expect(canSeeAllKurumlar({ userId: INSTITUTION_OWNER_USER_ID, role: "SCHOOL_ADMIN" })).toBe(false);
    expect(
      pickInstitutionSelection("SCHOOL_ADMIN", "tenant_a", TWO, ALL_KURUMLAR, { canSeeAllKurumlar: false })
    ).toBe("tenant_a");
    expect(
      pickInstitutionSelection(
        "SCHOOL_ADMIN",
        "tenant_a",
        [{ tenantId: "tenant_a", name: "A" }],
        "tenant_b",
        { canSeeAllKurumlar: false }
      )
    ).toBe("tenant_a");
  });

  it("Hıdırcan Yağız platform kimliği tüm kurumları görür", () => {
    expect(canSeeAllKurumlar({ userId: PLATFORM_OWNER_USER_ID, role: "SUPER_ADMIN" })).toBe(true);
    expect(
      pickInstitutionSelection("SUPER_ADMIN", "tenant_a", TWO, ALL_KURUMLAR, { canSeeAllKurumlar: true })
    ).toBe(ALL_KURUMLAR);
  });

  it("Ezgi Güçlü finans/personel özetine erişemez; Nilüfer Acar erişir", () => {
    expect(
      canViewFinanceAndStaffSummary({ userId: INSTITUTION_MANAGER_USER_ID, role: "SCHOOL_ADMIN" })
    ).toBe(false);
    expect(
      canViewFinanceAndStaffSummary({ userId: INSTITUTION_OWNER_USER_ID, role: "SCHOOL_ADMIN" })
    ).toBe(true);
    expect(canViewFinanceAndStaffSummary({ userId: PLATFORM_OWNER_USER_ID, role: "SUPER_ADMIN" })).toBe(true);
  });

  it("Nihal Gedikli için gerçek hesap/parola bootstrap'ta yoktur", () => {
    const src = readFileSync(path.join(process.cwd(), "src/lib/auth/users.ts"), "utf8");
    expect(src).not.toMatch(/nihal\.gedikli/i);
    expect(src).not.toMatch(/user_manager_nihal/);
  });
});
