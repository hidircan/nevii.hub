import type {
  FeatureFlagKey,
  JsonValue,
  PlanKey,
  ResolvedFeatureFlag,
  ResolvedSetting,
  SettingOverride,
  SettingScope,
} from "./types";
import { SETTING_BY_KEY, SETTING_CATALOG } from "./catalog";
import { FEATURE_BY_KEY, FEATURE_CATALOG, PLAN_FEATURE_DEFAULTS } from "./features";
import { getPlatformTenant, listFeatureOverrides, listSettingOverrides } from "./store";

export type ResolveContext = {
  tenantId: string;
  planKey?: PlanKey;
  branchId?: string;
  userId?: string;
};

function pickOverride(
  overrides: SettingOverride[],
  key: string,
  scopeType: SettingScope,
  scopeId: string
): SettingOverride | undefined {
  return overrides.find((o) => o.key === key && o.scopeType === scopeType && o.scopeId === scopeId);
}

/**
 * Öncelik: platform varsayılanı → paket/plan → kurum → şube → kullanıcı.
 */
export function resolveSettingFromOverrides(
  key: string,
  overrides: SettingOverride[],
  ctx: ResolveContext & { planKey: PlanKey }
): ResolvedSetting | null {
  const def = SETTING_BY_KEY.get(key);
  if (!def) return null;

  let effectiveValue: JsonValue = def.defaultValue;
  let sourceScope: SettingScope = "platform";
  let updatedAt: string | null = null;
  let updatedBy: string | null = null;

  const apply = (scope: SettingScope, scopeId: string) => {
    const hit = pickOverride(overrides, key, scope, scopeId);
    if (!hit) return;
    effectiveValue = hit.value;
    sourceScope = scope;
    updatedAt = hit.updatedAt;
    updatedBy = hit.updatedBy;
  };

  apply("platform", "*");
  apply("plan", ctx.planKey);
  apply("tenant", ctx.tenantId);
  if (ctx.branchId) apply("branch", ctx.branchId);
  if (ctx.userId && def.userPreference) apply("user", ctx.userId);

  return {
    key: def.key,
    category: def.category,
    type: def.type,
    defaultValue: def.defaultValue,
    effectiveValue,
    sourceScope,
    description: def.description,
    version: def.version,
    updatedAt,
    updatedBy,
    critical: def.critical,
    enumValues: def.enumValues,
    platformOnly: def.platformOnly,
  };
}

export async function resolvePlatformDefaults(): Promise<ResolvedSetting[]> {
  const overrides = (await listSettingOverrides()).filter((o) => o.scopeType === "platform");
  return SETTING_CATALOG.map((def) => {
    const plat = overrides.find((o) => o.key === def.key && o.scopeType === "platform" && o.scopeId === "*");
    return {
      key: def.key,
      category: def.category,
      type: def.type,
      defaultValue: def.defaultValue,
      effectiveValue: plat?.value ?? def.defaultValue,
      sourceScope: "platform" as const,
      description: def.description,
      version: def.version,
      updatedAt: plat?.updatedAt ?? null,
      updatedBy: plat?.updatedBy ?? null,
      critical: def.critical,
      enumValues: def.enumValues,
      platformOnly: def.platformOnly,
    };
  });
}

async function planOf(ctx: ResolveContext): Promise<PlanKey> {
  return ctx.planKey ?? (await getPlatformTenant(ctx.tenantId))?.planKey ?? "standard";
}

export async function resolveAllSettings(ctx: ResolveContext): Promise<ResolvedSetting[]> {
  const planKey = await planOf(ctx);
  const overrides = await listSettingOverrides({ ...ctx, planKey });
  return SETTING_CATALOG.map((def) =>
    resolveSettingFromOverrides(def.key, overrides, { ...ctx, planKey })
  ).filter((x): x is ResolvedSetting => x !== null);
}

export async function resolveSetting(ctx: ResolveContext, key: string): Promise<ResolvedSetting | null> {
  const planKey = await planOf(ctx);
  const overrides = await listSettingOverrides({ ...ctx, planKey });
  return resolveSettingFromOverrides(key, overrides, { ...ctx, planKey });
}

export type EntitlementInputs = {
  addons: FeatureFlagKey[];
  overrides: Partial<Record<FeatureFlagKey, boolean>>;
  /** Abonelik snapshot'ındaki paket modülleri; yoksa yerleşik paket tanımı kullanılır. */
  planModules?: FeatureFlagKey[] | null;
};

/** Yerleşik paket modülleri; katalogda oluşturulmuş (snapshot'sız) anahtar için hiçbiri (fail-closed). */
function builtinPlanHas(planKey: PlanKey, flag: FeatureFlagKey): boolean {
  return Boolean(PLAN_FEATURE_DEFAULTS[planKey]?.[flag]);
}

/**
 * Ticari hak: platform override (true/false) > eklenti > paket. Kullanıcı
 * rolü/izni burada YOK — permission ayrı katmandır (src/lib/auth/rbac.ts).
 */
export function resolveEntitlement(
  flag: FeatureFlagKey,
  planKey: PlanKey,
  inputs: EntitlementInputs
): { entitled: boolean; source: ResolvedFeatureFlag["entitlementSource"] } {
  const ov = inputs.overrides[flag];
  if (ov !== undefined) return { entitled: ov, source: ov ? "override" : "none" };
  const inPlan = inputs.planModules ? inputs.planModules.includes(flag) : builtinPlanHas(planKey, flag);
  if (inPlan) return { entitled: true, source: "plan" };
  if (inputs.addons.includes(flag)) return { entitled: true, source: "addon" };
  return { entitled: false, source: "none" };
}

export function resolveFeatureFromState(
  flag: FeatureFlagKey,
  planKey: PlanKey,
  tenantOverride: { enabled: boolean; updatedAt: string; updatedBy: string } | undefined,
  entitlement: EntitlementInputs = { addons: [], overrides: {} }
): ResolvedFeatureFlag {
  const def = FEATURE_BY_KEY.get(flag)!;
  const ent = resolveEntitlement(flag, planKey, entitlement);
  // Açık = zorunlu VEYA (ticari hak var VE kurum bayrağı kapatmamış).
  const enabled = def.required || (ent.entitled && (tenantOverride ? tenantOverride.enabled : true));
  return {
    ...def,
    enabled,
    entitled: def.required || ent.entitled,
    entitlementSource: def.required ? "plan" : ent.source,
    sourceScope: tenantOverride ? "tenant" : "plan",
    locked: def.required,
    updatedAt: tenantOverride?.updatedAt ?? null,
    updatedBy: tenantOverride?.updatedBy ?? null,
  };
}

export async function loadEntitlementInputs(tenantId: string, planKey: PlanKey): Promise<EntitlementInputs> {
  const ctx = { tenantId, planKey };
  const overrides = await listSettingOverrides(ctx);
  const addons = resolveSettingFromOverrides("subscription.addons", overrides, ctx)?.effectiveValue;
  const ent = resolveSettingFromOverrides("subscription.entitlementOverrides", overrides, ctx)?.effectiveValue;
  const snap = resolveSettingFromOverrides("subscription.snapshot", overrides, ctx)?.effectiveValue as
    | { planKey?: string; includedModules?: string[] }
    | null
    | undefined;
  const planModules =
    snap && snap.planKey === planKey && Array.isArray(snap.includedModules)
      ? snap.includedModules.filter((x): x is FeatureFlagKey => FEATURE_BY_KEY.has(x as FeatureFlagKey))
      : null;
  return {
    addons: (Array.isArray(addons) ? addons : []).filter((x): x is FeatureFlagKey => FEATURE_BY_KEY.has(x as FeatureFlagKey)),
    overrides: (ent && typeof ent === "object" && !Array.isArray(ent) ? ent : {}) as EntitlementInputs["overrides"],
    planModules,
  };
}

export async function resolveAllFeatures(tenantId: string, planKey?: PlanKey): Promise<ResolvedFeatureFlag[]> {
  const [tenant, overrides] = await Promise.all([getPlatformTenant(tenantId), listFeatureOverrides(tenantId)]);
  const plan = planKey ?? tenant?.planKey ?? "standard";
  const entitlement = await loadEntitlementInputs(tenantId, plan);
  const byKey = new Map(overrides.map((o) => [o.flagKey, o]));
  return FEATURE_CATALOG.map((f) => {
    const ov = byKey.get(f.key);
    return resolveFeatureFromState(
      f.key,
      plan,
      ov ? { enabled: ov.enabled, updatedAt: ov.updatedAt, updatedBy: ov.updatedBy } : undefined,
      entitlement
    );
  });
}

export async function isFeatureEnabled(tenantId: string, flag: FeatureFlagKey): Promise<boolean> {
  const all = await resolveAllFeatures(tenantId);
  return all.find((f) => f.key === flag)?.enabled ?? true;
}
