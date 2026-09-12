import { createHash } from "crypto";
import { fail, ok, type ServiceResult } from "../services/result";
import type { ServiceContext } from "../services/context";
import { permissionsForRole } from "../auth/rbac";
import { getAppearancePolicy, getStudentFormConfig } from "./access";
import { resolveAllFeatures, resolveAllSettings } from "./resolve";
import { resolveTenantLimits } from "./entitlements";
import { getPlatformTenant } from "./store";
import { listPolicyVersions } from "./store-ext";
import { PLATFORM_SCOPE_ID } from "./policy-version-log";
import { stableStringify } from "./policies";
import { resolveManagerPreset } from "./manager-preset";
import { resolveGrants } from "./permissions";
import { SCREEN_REGISTRY, canAccessScreen } from "./permission-matrix";
import { PLATFORM_LOGO_FALLBACK_PATH } from "./branding";
import { PLATFORM_BRAND } from "./brand";
import type { FeatureFlagKey, ManagerPreset } from "./types";

/**
 * NeviiOS → NeviiHub config senkron sözleşmesi (contractVersion 1).
 *
 * İlke: NeviiOS config/policy'nin TEK sahibi; NeviiHub günlük operasyon
 * verisinin tek sahibi. Çift yönlü tam DB senkronu YOK — NeviiHub bu
 * snapshot'ı okur (pull), ETag ile koşullu ister, kendi tarafında yazmaz.
 *
 * `configVersion`: platform + kurum kapsamındaki sürümlenen politika
 * anahtarlarının en yüksek sürüm numaralarının toplamı. Her yayın/geri alma
 * bir anahtarın sürümünü artırdığından monoton artar (geri alma da yeni
 * sürümdür). `etag`: içeriğin (sürüm dahil) SHA-256 özeti — sürümlenmeyen
 * ayar değişikliklerini de yakalar.
 */
export const CONFIG_CONTRACT_VERSION = 1 as const;

export type ConfigSnapshot = {
  contractVersion: typeof CONFIG_CONTRACT_VERSION;
  tenantId: string;
  configVersion: number;
  etag: string;
  generatedAt: string;
  appearance: Awaited<ReturnType<typeof getAppearancePolicy>>;
  branding: {
    platform: { name: string; logoUrl: string; fallbackLogoUrl: string };
    institution: { name: string; logoUrl: string; colorPrimary: string; colorAccent: string; loginMessage: string };
  };
  mobile: {
    appEnabled: boolean;
    iosEnabled: boolean;
    androidEnabled: boolean;
    studentPortalEnabled: boolean;
    teacherPortalEnabled: boolean;
    adminPortalEnabled: boolean;
    maintenanceMessage: string;
    minVersion: { ios: string; android: string };
    pushPolicy: "disabled" | "allowed";
    pushProviderConfigured: false;
  };
  features: { key: FeatureFlagKey; enabled: boolean; entitled: boolean; source: string }[];
  subscription: { planKey: string; limits: Record<"students" | "users" | "branches", number | null> };
  forms: { studentRegistration: Awaited<ReturnType<typeof getStudentFormConfig>> };
  access: { managerPreset: ManagerPreset };
  viewer: {
    userId: string;
    role: string;
    loginRole: string;
    permissions: string[];
    screens: { id: string; path: string }[];
  } | null;
};

async function versionSum(scopeId: string): Promise<number> {
  const max = new Map<string, number>();
  for (const v of await listPolicyVersions(scopeId)) {
    if (v.status !== "published" && v.status !== "superseded") continue;
    max.set(v.key, Math.max(max.get(v.key) ?? 0, v.version));
  }
  return [...max.values()].reduce((n, x) => n + x, 0);
}

export async function computeConfigVersion(tenantId: string): Promise<number> {
  const [p, t] = await Promise.all([versionSum(PLATFORM_SCOPE_ID), versionSum(tenantId)]);
  return p + t;
}

export async function buildConfigSnapshot(tenantId: string, viewer: ServiceContext | null): Promise<ConfigSnapshot> {
  const [settings, features, appearance, form, limits, preset, version, tenant] = await Promise.all([
    resolveAllSettings({ tenantId }),
    resolveAllFeatures(tenantId),
    getAppearancePolicy(tenantId),
    getStudentFormConfig(tenantId),
    resolveTenantLimits(tenantId),
    resolveManagerPreset(tenantId),
    computeConfigVersion(tenantId),
    getPlatformTenant(tenantId),
  ]);
  const v = (k: string) => settings.find((s) => s.key === k)?.effectiveValue;
  const str = (k: string) => String(v(k) ?? "");
  let viewerBlock: ConfigSnapshot["viewer"] = null;
  if (viewer) {
    const grants = await resolveGrants(viewer);
    viewerBlock = {
      userId: viewer.userId,
      role: viewer.role,
      loginRole: viewer.loginRole ?? viewer.role,
      permissions: permissionsForRole(viewer.role),
      screens: SCREEN_REGISTRY.filter((s) => s.area !== "platform" && canAccessScreen({ grants, enabledFeatures: new Set(features.filter((f) => f.enabled).map((f) => f.key)) }, s)).map((s) => ({ id: s.id, path: s.path })),
    };
  }
  const body = {
    contractVersion: CONFIG_CONTRACT_VERSION,
    tenantId,
    configVersion: version,
    appearance,
    branding: {
      platform: { name: PLATFORM_BRAND.name, logoUrl: "/api/v1/branding/platform-logo", fallbackLogoUrl: PLATFORM_LOGO_FALLBACK_PATH },
      institution: {
        name: str("institution.name") || tenant?.name || "",
        logoUrl: str("institution.logoUrl"),
        colorPrimary: str("institution.colorPrimary"),
        colorAccent: str("institution.colorAccent"),
        loginMessage: str("institution.loginMessage"),
      },
    },
    mobile: {
      appEnabled: v("mobile.appEnabled") === true,
      iosEnabled: v("mobile.iosEnabled") === true,
      androidEnabled: v("mobile.androidEnabled") === true,
      studentPortalEnabled: v("mobile.studentPortalEnabled") === true,
      teacherPortalEnabled: v("mobile.teacherPortalEnabled") === true,
      adminPortalEnabled: v("mobile.adminPortalEnabled") === true,
      maintenanceMessage: str("mobile.maintenanceMessage"),
      minVersion: (v("mobile.minVersion") as { ios: string; android: string } | undefined) ?? { ios: "1.0.0", android: "1.0.0" },
      pushPolicy: v("mobile.pushPolicy") === "allowed" ? ("allowed" as const) : ("disabled" as const),
      pushProviderConfigured: false as const,
    },
    features: features.map((f) => ({ key: f.key, enabled: f.enabled, entitled: f.entitled, source: f.entitlementSource })),
    subscription: { planKey: tenant?.planKey ?? "standard", limits },
    forms: { studentRegistration: form },
    access: { managerPreset: preset },
    viewer: viewerBlock,
  };
  const etag = createHash("sha256").update(stableStringify(body)).digest("hex").slice(0, 32);
  return { ...body, etag, generatedAt: new Date().toISOString() };
}

/**
 * Kurum rolleri yalnız KENDİ tenant'ının snapshot'ını alır (tenant JWT'den).
 * HYPER_ADMIN açık `tenantId` ile (viewer bloğu yok — kurum kullanıcısı gibi davranmaz).
 */
export async function getConfigSnapshot(ctx: ServiceContext, requestedTenantId?: string | null): Promise<ServiceResult<ConfigSnapshot>> {
  if (ctx.role === "HYPER_ADMIN") {
    if (!requestedTenantId) return fail("VALIDATION_ERROR", "Platform sahibi için tenantId gerekli.");
    if (!(await getPlatformTenant(requestedTenantId))) return fail("NOT_FOUND", "Kurum bulunamadı");
    return ok(await buildConfigSnapshot(requestedTenantId, null));
  }
  if (requestedTenantId && requestedTenantId !== ctx.tenantId) return fail("FORBIDDEN", "Başka bir kurumun yapılandırmasına erişemezsiniz.");
  return ok(await buildConfigSnapshot(ctx.tenantId, ctx));
}
