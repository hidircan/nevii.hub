import { fail, ok, type ServiceResult } from "../services/result";
import type { ServiceContext } from "../services/context";
import type { AppRole } from "../auth/types";
import { hasPermission, type Permission } from "../auth/rbac";
import { FEATURE_DISABLED_MESSAGE, FEATURE_BY_KEY } from "./features";
import type { FeatureFlagKey } from "./types";
import { isFeatureEnabled, resolveAllSettings, resolveSetting } from "./resolve";
import {
  DEFAULT_APPEARANCE_POLICY,
  DEFAULT_STUDENT_FORM_CONFIG,
  normalizeAppearancePolicy,
  studentFormConfigSchema,
  type AppearancePolicy,
  type StudentFormConfig,
} from "./policies";
import { PLATFORM_TENANT_ID } from "../auth/config";

export function isHyperAdmin(ctx: { role: AppRole }): boolean {
  return ctx.role === "HYPER_ADMIN";
}

export function requireHyperAdmin(ctx: ServiceContext): ServiceResult<true> {
  if (ctx.role !== "HYPER_ADMIN") {
    return fail("FORBIDDEN", "Bu alan yalnız NeviiHub platform yöneticisine açıktır.");
  }
  return ok(true);
}

export function requireInstitutionAdmin(ctx: ServiceContext): ServiceResult<true> {
  if (ctx.role === "HYPER_ADMIN") {
    return fail(
      "FORBIDDEN",
      "Platform yöneticisi kurum paneli üzerinden işlem yapamaz. Hedef kurumu /platform içinden seçin."
    );
  }
  if (ctx.role === "SUPER_ADMIN" || ctx.role === "SCHOOL_ADMIN") return ok(true);
  return fail("FORBIDDEN", "Bu işlem için kurum yöneticisi yetkisi gerekir.");
}

export function requireOwnTenant(ctx: ServiceContext, tenantId: string): ServiceResult<true> {
  if (ctx.role === "HYPER_ADMIN") {
    return fail("FORBIDDEN", "Cross-tenant işlem açık hedef tenant ile platform API'sinden yapılmalıdır.");
  }
  if (ctx.tenantId !== tenantId) {
    return fail("FORBIDDEN", "Başka bir kurumun verisine erişemezsiniz.");
  }
  return ok(true);
}

export function canManageInstitutionFeatures(role: AppRole, critical: boolean, institutionManageable: boolean): boolean {
  if (role === "HYPER_ADMIN") return true;
  if (role === "SUPER_ADMIN") return institutionManageable;
  if (role === "SCHOOL_ADMIN") return institutionManageable && !critical;
  return false;
}

export function assertPermissionResult(role: AppRole, permission: Permission): ServiceResult<true> {
  if (hasPermission(role, permission)) return ok(true);
  return fail("FORBIDDEN", `Role ${role} lacks permission ${permission}`);
}

export function isPlatformTenantId(tenantId: string): boolean {
  return tenantId === PLATFORM_TENANT_ID;
}

export async function assertFeatureEnabled(
  tenantId: string,
  flag: FeatureFlagKey
): Promise<ServiceResult<true>> {
  const def = FEATURE_BY_KEY.get(flag);
  if (!def) return ok(true);
  const enabled = await isFeatureEnabled(tenantId, flag);
  if (enabled) return ok(true);
  return fail("FORBIDDEN", FEATURE_DISABLED_MESSAGE, { feature: flag });
}

/**
 * Kurumun Yeni Öğrenci Kaydı konfigürasyonu. Kayıtlı değer şemaya uymuyorsa
 * (elle bozulmuş veri) kısıtsız varsayılana düşer — çekirdek zorunlu alanlar
 * zaten studentSchema'da korunur.
 */
export async function getStudentFormConfig(tenantId: string): Promise<StudentFormConfig> {
  const raw = (await resolveSetting({ tenantId }, "forms.studentRegistration"))?.effectiveValue;
  const parsed = studentFormConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_STUDENT_FORM_CONFIG;
}

/** Kurumun görünüm politikası (tema modu, sabit tema, font). Okunamazsa serbest varsayılan. */
export async function getAppearancePolicy(tenantId: string): Promise<AppearancePolicy> {
  try {
    const all = await resolveAllSettings({ tenantId });
    const v = (k: string) => all.find((s) => s.key === k)?.effectiveValue;
    return normalizeAppearancePolicy({
      mode: v("appearance.mode"),
      fixedTheme: v("appearance.fixedTheme"),
      fontPolicy: v("appearance.fontPolicy"),
    });
  } catch {
    return DEFAULT_APPEARANCE_POLICY;
  }
}

/** Oturumdaki kullanıcının kurum görünüm politikası (platform/oturumsuz → serbest). */
export async function getSessionAppearancePolicy(): Promise<AppearancePolicy> {
  const { getSessionContext } = await import("../auth/session");
  const session = await getSessionContext().catch(() => null);
  if (!session || session.role === "HYPER_ADMIN") return DEFAULT_APPEARANCE_POLICY;
  return getAppearancePolicy(session.tenantId);
}
