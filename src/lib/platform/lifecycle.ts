import type { PlatformTenant, TenantLifecycle } from "./types";
import { TENANT_LIFECYCLES } from "./types";

export const LIFECYCLE_LABELS: Record<TenantLifecycle, string> = {
  draft: "Taslak",
  provisioning: "Kurulum bekliyor",
  active: "Aktif",
  suspended: "Askıya alınmış",
  archived: "Arşiv",
};

export function isTenantLifecycle(value: string): value is TenantLifecycle {
  return (TENANT_LIFECYCLES as readonly string[]).includes(value);
}

export function normalizeLifecycle(input: { lifecycle?: string; active?: boolean }): TenantLifecycle {
  if (input.lifecycle && isTenantLifecycle(input.lifecycle)) return input.lifecycle;
  if (input.active === false) return "suspended";
  return "active";
}

export function lifecycleIsLoginAllowed(lifecycle: TenantLifecycle): boolean {
  return lifecycle === "active";
}

export function tenantAllowsSchoolLogin(tenant: Pick<PlatformTenant, "lifecycle">): boolean {
  return lifecycleIsLoginAllowed(tenant.lifecycle);
}

export function emptyDraft(): NonNullable<PlatformTenant["draft"]> {
  return {
    shortName: "",
    contactEmail: "",
    phone: "",
    country: "TR",
    timezone: "Europe/Istanbul",
    currency: "TRY",
    language: "tr",
    colorPrimary: "#6d28d9",
    logoUrl: "",
    features: {},
    firstBranch: null,
    owner: null,
  };
}
