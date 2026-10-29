import { z } from "zod";
import { fail, ok, type ServiceResult } from "../services/result";
import type { ServiceContext } from "../services/context";
import { SETTING_BY_KEY, SETTING_CATALOG, parseSettingValue } from "./catalog";
import { FEATURE_BY_KEY, isFeatureFlagKey } from "./features";
import {
  appendPlatformAudit,
  getPlatformTenant,
  listPlatformAudit,
  listPlatformTenants,
  upsertFeatureOverride,
  upsertPlatformTenant,
  upsertSettingOverride,
} from "./store";
import { resolveAllFeatures, resolveAllSettings, resolvePlatformDefaults, resolveSetting } from "./resolve";
import {
  canManageInstitutionFeatures,
  isHyperAdmin,
  requireHyperAdmin,
  requireInstitutionAdmin,
  requireOwnTenant,
} from "./access";
import { collectHealthCards } from "./health";
import {
  listPublicIntegrations,
  saveIntegrationConfig,
  testIntegrationConnection,
} from "./integrations";
import { redactSecrets } from "./secrets";
import type { FeatureFlagKey, JsonValue, SettingScope } from "./types";
import { isTenantLifecycle } from "./lifecycle";
import { appearancePolicyConflict, normalizeAppearancePolicy } from "./policies";
import { deleteSettingOverride, listFeatureOverrides } from "./store";
import { FEATURES_POLICY_KEY, PLATFORM_SCOPE_ID, isGovernedPolicyKey, recordPublishedVersion } from "./policy-version-log";
import { PLAN_KEY_PATTERN } from "./types";
import { listAllInvoiceOrders, listSaasPendingOrders, listSaasPurchaseRequests, listSaasQuoteRequests, listSaasSubscriptions, listSaasTrialRequests, listSaasWebhookEvents } from "../saas-billing/store";
import { listFailedWebhookEvents } from "../saas-billing/webhooks";
import { PLAN_CATALOG, resolveTenantLimits, STAFF_SEAT_ROLES } from "./entitlements";
import {
  createTenantDraft,
  provisionTenant,
  issueOwnerInvitation,
  listOwnerInvitations,
  getProvisionHistory,
  acceptOwnerInvitation,
  dashboardLifecycleBuckets,
} from "./provision";
import { listBootstrapUsersForTenant } from "../auth/users";
import { isDbMode } from "../config";
import { runWithTenantAsync } from "../tenant-context";
import { readBranches, readData, readReferenceData } from "../store";

/** Değerin gerçek doğrulaması `parseSettingValue` (katalog şeması) ile yapılır. */
const settingValueSchema = z.unknown().refine((v) => v !== undefined, "Değer gerekli");

function auditSafe(value: unknown): JsonValue | null {
  if (value === undefined) return null;
  return redactSecrets(value) as JsonValue;
}

async function writeAudit(
  ctx: ServiceContext,
  action: string,
  entityType: string,
  entityId: string,
  targetTenantId: string | null,
  before: unknown,
  after: unknown,
  outcome: "success" | "denied" | "error" = "success"
) {
  await appendPlatformAudit({
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    actorTenantId: ctx.tenantId,
    targetTenantId,
    action,
    entityType,
    entityId,
    before: auditSafe(before),
    after: auditSafe(after),
    requestId: ctx.requestId || "n/a",
    outcome,
  });
}

export async function getPlatformDashboard(ctx: ServiceContext) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;

  const [tenants, health, audit] = await Promise.all([
    listPlatformTenants(),
    collectHealthCards(),
    listPlatformAudit({ limit: 8 }),
  ]);

  const planDist: Record<string, number> = {};
  for (const t of tenants) {
    planDist[t.planKey] = (planDist[t.planKey] ?? 0) + 1;
  }

  const featureDist: Record<string, { on: number; off: number }> = {};
  for (const t of tenants) {
    const flags = await resolveAllFeatures(t.tenantId, t.planKey);
    for (const f of flags) {
      const bucket = featureDist[f.key] ?? { on: 0, off: 0 };
      if (f.enabled) bucket.on += 1;
      else bucket.off += 1;
      featureDist[f.key] = bucket;
    }
  }

  const integrations = await listPublicIntegrations("platform", "*");
  const problemIntegrations = integrations.filter((i) => i.status === "error" || i.status === "not_configured");

  // Satış bekleyen işleri — sınırlı okuma (sayfa başına tek render, polling yok).
  const [trials, purchases, subs, quotes, webhooks, failedWebhooks, pendingOrders, invoiceOrders] = await Promise.all([
    listSaasTrialRequests(50).catch(() => []),
    listSaasPurchaseRequests(50).catch(() => []),
    listSaasSubscriptions(100).catch(() => []),
    listSaasQuoteRequests(50).catch(() => []),
    listSaasWebhookEvents(8).catch(() => []),
    listFailedWebhookEvents(100).catch(() => []),
    listSaasPendingOrders(50).catch(() => []),
    listAllInvoiceOrders(100).catch(() => []),
  ]);
  const tenantName = new Map(tenants.map((t) => [t.tenantId, t.name]));
  const weekAhead = Date.now() + 7 * 24 * 3600 * 1000;
  const pendingTrials = trials.filter((r) => r.status === "pending");
  const pendingPurchases = purchases.filter((r) => r.status === "pending");
  const pendingQuotes = quotes.filter((r) => r.status === "pending");
  const troubledSubs = subs.filter((s) => s.status === "past_due" || s.status === "suspended");
  const trialsEnding = subs.filter(
    (s) => s.status === "trialing" && s.trialEndsAt && new Date(s.trialEndsAt).getTime() <= weekAhead
  );
  const awaitingOrders = pendingOrders.filter((o) => o.status === "awaiting_payment");
  const docTrouble = invoiceOrders.filter((o) => o.status === "document_failed" || o.status === "manual_pending");

  const buckets = await dashboardLifecycleBuckets();
  return ok({
    totals: {
      tenants: tenants.length,
      active: buckets.active.length,
      inactive: tenants.length - buckets.active.length,
      draft: buckets.draft.length,
      provisioning: buckets.provisioning.length,
      suspended: buckets.suspended.length,
      archived: buckets.archived.length,
    },
    buckets,
    recentTenants: tenants.slice(0, 8),
    planDistribution: planDist,
    featureDistribution: featureDist,
    problemIntegrations,
    recentAudit: audit,
    tenantNames: Object.fromEntries(tenantName),
    health,
    provisioningCapable: isDbMode,
    billing: {
      activeSubs: subs.filter((s) => s.status === "active").length,
      trialingSubs: subs.filter((s) => s.status === "trialing").length,
      pendingTrials: pendingTrials.map((r) => ({
        id: r.id,
        institutionName: r.institutionName,
        ownerName: r.ownerName,
        createdAt: r.createdAt,
      })),
      pendingTrialsTotal: pendingTrials.length,
      pendingPurchases: pendingPurchases.map((r) => ({
        id: r.id,
        institutionName: r.institutionName,
        planKey: r.planKey,
        interval: r.interval,
        createdAt: r.createdAt,
      })),
      pendingPurchasesTotal: pendingPurchases.length,
      pendingQuotes: pendingQuotes.map((r) => ({
        id: r.id,
        institutionName: r.institutionName,
        ownerName: r.ownerName,
        createdAt: r.createdAt,
      })),
      pendingQuotesTotal: pendingQuotes.length,
      paymentEvents: webhooks.map((w) => ({
        id: w.id,
        provider: w.provider,
        tenantId: w.tenantId,
        tenant: w.tenantId ? (tenantName.get(w.tenantId) ?? w.tenantId) : null,
        status: w.status,
        createdAt: w.createdAt,
      })),
      failedPaymentsTotal: failedWebhooks.length,
      troubledSubs: troubledSubs.slice(0, 8).map((s) => ({
        id: s.id,
        tenantId: s.tenantId,
        tenant: tenantName.get(s.tenantId) ?? s.tenantId,
        status: s.status,
        planKey: s.planKey,
      })),
      troubledSubsTotal: troubledSubs.length,
      trialsEnding: trialsEnding.slice(0, 8).map((s) => ({
        id: s.id,
        tenantId: s.tenantId,
        tenant: tenantName.get(s.tenantId) ?? s.tenantId,
        trialEndsAt: s.trialEndsAt,
      })),
      trialsEndingTotal: trialsEnding.length,
      awaitingOrders: awaitingOrders.slice(0, 8).map((o) => ({
        id: o.id,
        institutionName: o.institutionName,
        planKey: o.planKey,
        interval: o.interval,
        createdAt: o.createdAt,
      })),
      awaitingOrdersTotal: awaitingOrders.length,
      docTrouble: docTrouble.slice(0, 8).map((o) => ({
        id: o.id,
        tenantId: o.tenantId,
        tenant: tenantName.get(o.tenantId) ?? o.tenantId,
        status: o.status,
        createdAt: o.createdAt,
      })),
      docTroubleTotal: docTrouble.length,
    },
  });
}

export async function listInstitutions(ctx: ServiceContext, query?: string, lifecycle?: string) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const q = (query ?? "").trim().toLowerCase();
  let tenants = await listPlatformTenants();
  if (q) {
    tenants = tenants.filter(
      (t) => t.name.toLowerCase().includes(q) || t.tenantId.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q)
    );
  }
  if (lifecycle && isTenantLifecycle(lifecycle)) {
    tenants = tenants.filter((t) => t.lifecycle === lifecycle);
  }
  const ids = tenants.map((t) => t.tenantId);
  const [owners, phones] = await Promise.all([resolveTenantOwners(ids), resolveTenantPhones(ids)]);
  return ok({
    tenants: tenants.map((t) => ({
      ...t,
      ownerEmail: owners.get(t.tenantId) ?? null,
      schoolPhone: phones.get(t.tenantId) ?? null,
    })),
  });
}

/**
 * Kurum yetkilisi = o kurumun SUPER_ADMIN rolündeki kullanıcısı (RBAC'taki
 * tek sahiplik kavramı; "ilk kullanıcı" değil). Birden çoksa en eski kayıt.
 * Tek toplu okuma — kurum başına sorgu yok.
 */
async function resolveTenantOwners(tenantIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (tenantIds.length === 0) return out;
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const rows = await getPrisma().user.findMany({
        where: { tenantId: { in: tenantIds }, role: "SUPER_ADMIN", active: true },
        select: { tenantId: true, email: true },
        orderBy: { createdAt: "asc" },
      });
      for (const r of rows) {
        if (!out.has(r.tenantId) && r.email) out.set(r.tenantId, r.email);
      }
      return out;
    } catch {
      return out;
    }
  }
  const { listDynamicUsers } = await import("../auth/dynamic-users");
  const rows = (await listDynamicUsers())
    .filter((u) => u.active && u.role === "SUPER_ADMIN")
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  for (const r of rows) {
    if (!out.has(r.tenantId) && r.email) out.set(r.tenantId, r.email);
  }
  for (const id of tenantIds) {
    if (out.has(id)) continue;
    const seed = listBootstrapUsersForTenant(id).find((u) => u.role === "SUPER_ADMIN");
    if (seed?.email) out.set(id, seed.email);
  }
  return out;
}

/** Kurum telefonu = okul kaydının telefonu (tek yetkili kaynak). */
async function resolveTenantPhones(tenantIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (tenantIds.length === 0) return out;
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const rows = await getPrisma().school.findMany({
        where: { tenantId: { in: tenantIds } },
        select: { tenantId: true, phone: true },
      });
      for (const r of rows) {
        if (r.phone?.trim()) out.set(r.tenantId, r.phone.trim());
      }
      return out;
    } catch {
      return out;
    }
  }
  const settled = await Promise.all(
    tenantIds.map((id) =>
      runWithTenantAsync(id, () => readData())
        .then((d) => ({ id, phone: (d.settings.phone ?? "").trim() || null }))
        .catch(() => ({ id, phone: null as string | null }))
    )
  );
  for (const r of settled) {
    if (r.phone) out.set(r.id, r.phone);
  }
  return out;
}

export async function getInstitutionOverview(ctx: ServiceContext, tenantId: string) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const tenant = await getPlatformTenant(tenantId);
  if (!tenant) return fail("NOT_FOUND", "Kurum bulunamadı");

  const [settings, features, integrations, audit, users] = await Promise.all([
    resolveAllSettings({ tenantId }),
    resolveAllFeatures(tenantId, tenant.planKey),
    listPublicIntegrations("tenant", tenantId),
    listPlatformAudit({ targetTenantId: tenantId, limit: 20 }),
    listTenantUsersInternal(tenantId),
  ]);

  let branches: { id: string; name: string; city: string; address: string; phone: string }[] = [];
  let school: {
    name: string;
    shortName: string;
    city: string;
    email: string;
    phone: string;
    website: string;
    currency: string;
    logoUrl: string;
  } | null = null;
  try {
    const { withLogoVersion } = await import("../institution-logo");
    // DB egress (2026-10-18): yalnız okul satırı + şubeler — eskiden kurumun TAM readData()'sı (canlı logda kalan son
    // tam okuma kaynağı). Okul satırı yoksa readData()'nın seed davranışı korunur.
    const row = isDbMode
      ? await (await import("../db")).getPrisma().school.findFirst({
          where: { tenantId },
          select: { name: true, shortName: true, city: true, email: true, phone: true, website: true, currency: true, logoUrl: true, updatedAt: true },
        })
      : null;
    const version = row ? String(row.updatedAt.getTime()) : "";
    const data = row
      ? { settings: { ...row, branches: await runWithTenantAsync(tenantId, () => readBranches()) } }
      : await runWithTenantAsync(tenantId, () => readData());
    branches = data.settings.branches.map((b) => ({
      id: b.id,
      name: b.name,
      city: b.city,
      address: b.address,
      phone: b.phone,
    }));
    const logo = data.settings.logoUrl?.trim() ?? "";
    school = {
      name: data.settings.name ?? "",
      shortName: data.settings.shortName ?? "",
      city: data.settings.city ?? "",
      email: data.settings.email ?? "",
      phone: data.settings.phone ?? "",
      website: data.settings.website ?? "",
      currency: data.settings.currency ?? "",
      logoUrl: withLogoVersion(logo, version || logo) ?? "",
    };
  } catch {
    branches = [];
    school = null;
  }

  return ok({
    tenant,
    school,
    settingsPreview: settings.slice(0, 8),
    features,
    integrations,
    users,
    branches,
    audit,
  });
}

async function listTenantUsersInternal(tenantId: string) {
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const prisma = getPrisma();
      const rows = await prisma.user.findMany({
        where: { tenantId, active: true },
        select: { id: true, email: true, role: true },
      });
      return rows.map((r) => ({ id: r.id, email: r.email, role: r.role }));
    } catch {
      // json
    }
  }
  return listBootstrapUsersForTenant(tenantId)
    .filter((u) => u.role !== "HYPER_ADMIN")
    .map((u) => ({ id: u.id, email: u.email, role: u.role }));
}

export async function listInstitutionUsers(ctx: ServiceContext, tenantId: string) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const tenant = await getPlatformTenant(tenantId);
  if (!tenant) return fail("NOT_FOUND", "Kurum bulunamadı");
  const users = await listTenantUsersInternal(tenantId);
  await writeAudit(ctx, "platform.users.list", "Tenant", tenantId, tenantId, null, { count: users.length });
  return ok({ tenant, users });
}

export async function createInstitution(ctx: ServiceContext, input: unknown) {
  return createTenantDraft(ctx, input);
}

export async function patchInstitution(
  ctx: ServiceContext,
  tenantId: string,
  input: unknown
) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const tenant = await getPlatformTenant(tenantId);
  if (!tenant) return fail("NOT_FOUND", "Kurum bulunamadı");
  const parsed = z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      active: z.boolean().optional(),
      lifecycle: z.enum(["draft", "provisioning", "active", "suspended", "archived"]).optional(),
      planKey: z.string().regex(PLAN_KEY_PATTERN).optional(),
      reason: z.string().trim().max(300).optional(),
      confirm: z.boolean().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Geçersiz güncelleme", parsed.error.flatten());

  const lifecycle =
    parsed.data.lifecycle && isTenantLifecycle(parsed.data.lifecycle)
      ? parsed.data.lifecycle
      : parsed.data.active === false
        ? "suspended"
        : parsed.data.active === true
          ? "active"
          : undefined;
  const critical =
    parsed.data.active === false ||
    parsed.data.planKey !== undefined ||
    lifecycle === "suspended" ||
    lifecycle === "archived";
  if (critical && parsed.data.confirm !== true) {
    return fail("VALIDATION_ERROR", "Kritik kurum değişikliği için onay gerekir.", { requiresConfirm: true });
  }
  if (tenant.lifecycle === "archived" && lifecycle && lifecycle !== "archived") {
    return fail("FORBIDDEN", "Arşivlenmiş kurum bu sürümde geri alınamaz.");
  }

  // Paket değişimi = yeni abonelik: yayındaki katalogdan snapshot (aktif, legacy olmayan paket).
  if (parsed.data.planKey !== undefined && parsed.data.planKey !== tenant.planKey) {
    const { subscribeTenantToPlan } = await import("./commercial-catalog");
    const sub = await subscribeTenantToPlan(ctx, tenantId, parsed.data.planKey, parsed.data.reason || "Paket değişikliği");
    if (!sub.ok) return sub;
  }

  const next = await upsertPlatformTenant(
    {
      ...tenant,
      tenantId,
      name: parsed.data.name ?? tenant.name,
      planKey: parsed.data.planKey ?? tenant.planKey,
      lifecycle: lifecycle ?? tenant.lifecycle,
      active: (lifecycle ?? tenant.lifecycle) === "active",
    },
    ctx.userId
  );
  await writeAudit(ctx, "platform.tenant.update", "Tenant", tenantId, tenantId, tenant, next);
  return ok({ tenant: next });
}

export type PolicyVersionMeta = { reason?: string; rollbackOfVersion?: number | null; fromDraftId?: string };

export async function applySettingWrite(opts: {
  ctx: ServiceContext;
  scopeType: SettingScope;
  scopeId: string;
  key: string;
  value: unknown;
  targetTenantId: string | null;
  confirm?: boolean;
  version?: PolicyVersionMeta;
}): Promise<ServiceResult<{ setting: NonNullable<Awaited<ReturnType<typeof resolveSetting>>> }>> {
  const def = SETTING_BY_KEY.get(opts.key);
  if (!def) return fail("NOT_FOUND", "Bilinmeyen ayar anahtarı");
  const parsed = parseSettingValue(def, opts.value);
  if (!parsed.ok) return fail("VALIDATION_ERROR", parsed.message, { key: opts.key });
  if (def.critical && opts.confirm !== true) {
    return fail("VALIDATION_ERROR", "Kritik ayar değişikliği için onay gerekir.", {
      requiresConfirm: true,
      key: opts.key,
    });
  }
  if (opts.key.startsWith("appearance.") && opts.targetTenantId) {
    const current = await resolveAllSettings({ tenantId: opts.targetTenantId });
    const pick = (k: string) => (k === opts.key ? parsed.value : current.find((r) => r.key === k)?.effectiveValue);
    const conflict = appearancePolicyConflict(
      normalizeAppearancePolicy({
        mode: pick("appearance.mode"),
        fixedTheme: pick("appearance.fixedTheme"),
        fontPolicy: pick("appearance.fontPolicy"),
      })
    );
    if (conflict) return fail("VALIDATION_ERROR", conflict, { key: opts.key });
  }
  const before =
    opts.targetTenantId != null
      ? await resolveSetting({ tenantId: opts.targetTenantId }, opts.key)
      : SETTING_CATALOG.find((s) => s.key === opts.key)?.defaultValue ?? null;
  const now = new Date().toISOString();
  await upsertSettingOverride({
    scopeType: opts.scopeType,
    scopeId: opts.scopeId,
    key: opts.key,
    value: parsed.value,
    updatedAt: now,
    updatedBy: opts.ctx.userId,
  });
  if (opts.key === "access.managerPreset") {
    const { invalidateManagerPreset } = await import("./manager-preset");
    invalidateManagerPreset();
  }
  if (opts.key === "access.teacherEarningsAccess") {
    const { invalidateTeacherEarningsAccess } = await import("./teacher-earnings-access");
    invalidateTeacherEarningsAccess();
  }
  if (opts.key === "locale.language" && opts.scopeType === "tenant" && (parsed.value === "tr" || parsed.value === "en")) {
    const { setTenantLanguage } = await import("./store");
    await setTenantLanguage(opts.scopeId, parsed.value);
  }
  const after =
    opts.targetTenantId != null
      ? await resolveSetting({ tenantId: opts.targetTenantId }, opts.key)
      : parsed.value;
  await writeAudit(
    opts.ctx,
    "platform.setting.update",
    "Setting",
    opts.key,
    opts.targetTenantId,
    before,
    { value: after, reason: opts.version?.reason ?? null } as never
  );
  // Kritik politika: her yayın yeni sürüm (kurum veya platform kapsamı; şube override sürümlenmez).
  if (isGovernedPolicyKey(opts.key) && (opts.scopeType === "tenant" || opts.scopeType === "platform")) {
    await recordPublishedVersion(
      opts.ctx,
      opts.scopeType === "platform" ? PLATFORM_SCOPE_ID : opts.scopeId,
      opts.key,
      parsed.value,
      opts.version
    );
  }
  if (opts.targetTenantId) {
    const resolved = await resolveSetting({ tenantId: opts.targetTenantId }, opts.key);
    if (!resolved) return fail("INTERNAL_ERROR", "Ayar çözümlenemedi");
    return ok({ setting: resolved });
  }
  const platform = await resolvePlatformDefaults();
  const resolved = platform.find((s) => s.key === opts.key);
  if (!resolved) return fail("INTERNAL_ERROR", "Ayar çözümlenemedi");
  return ok({ setting: resolved });
}

/**
 * Kurum/şube override'ını kaldırır → değer üst katmandan (paket/platform)
 * miras alınır. Aynı yetki kuralları + audit.
 */
export async function resetTenantSetting(ctx: ServiceContext, tenantId: string, input: unknown) {
  const parsed = z
    .object({ key: z.string().min(1), branchId: z.string().min(1).optional(), confirm: z.boolean().optional() })
    .safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Geçersiz sıfırlama yükü", parsed.error.flatten());
  const def = SETTING_BY_KEY.get(parsed.data.key);
  if (!def) return fail("NOT_FOUND", "Bilinmeyen ayar anahtarı");
  if (isHyperAdmin(ctx)) {
    if (!(await getPlatformTenant(tenantId))) return fail("NOT_FOUND", "Kurum bulunamadı");
  } else {
    const inst = requireInstitutionAdmin(ctx);
    if (!inst.ok) return inst;
    const own = requireOwnTenant(ctx, tenantId);
    if (!own.ok) return own;
    if (def.platformOnly) return fail("FORBIDDEN", "Bu ayar yalnız NeviiOS (platform sahibi) tarafından yönetilir.");
    if (ctx.role === "SCHOOL_ADMIN" && def.critical) {
      return fail("FORBIDDEN", "Kurum müdürü kritik kurum ayarını değiştiremez.");
    }
  }
  if (def.critical && parsed.data.confirm !== true) {
    return fail("VALIDATION_ERROR", "Kritik ayar değişikliği için onay gerekir.", { requiresConfirm: true, key: def.key });
  }
  const scopeType = parsed.data.branchId ? "branch" : "tenant";
  const scopeId = parsed.data.branchId ?? tenantId;
  const before = await resolveSetting({ tenantId, branchId: parsed.data.branchId }, def.key);
  await deleteSettingOverride(scopeType, scopeId, def.key);
  if (def.key === "access.managerPreset") (await import("./manager-preset")).invalidateManagerPreset();
  if (def.key === "access.teacherEarningsAccess") (await import("./teacher-earnings-access")).invalidateTeacherEarningsAccess();
  const after = await resolveSetting({ tenantId, branchId: parsed.data.branchId }, def.key);
  await writeAudit(ctx, "platform.setting.reset", "Setting", def.key, tenantId, before, after);
  if (isGovernedPolicyKey(def.key) && scopeType === "tenant") {
    // null = "üst katmandan miras" — geri alma bu sürüme de dönebilir.
    await recordPublishedVersion(ctx, tenantId, def.key, null, { reason: "Kurum override'ı kaldırıldı (miras)" });
  }
  return ok({ setting: after });
}

export async function getPlatformDefaultSettings(ctx: ServiceContext) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const settings = await resolvePlatformDefaults();
  return ok({ settings });
}

export async function updatePlatformDefaultSetting(ctx: ServiceContext, input: unknown) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const parsed = z
    .object({
      key: z.string().min(1),
      value: settingValueSchema,
      confirm: z.boolean().optional(),
      reason: z.string().trim().max(300).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Geçersiz ayar yükü", parsed.error.flatten());
  return applySettingWrite({
    ctx,
    scopeType: "platform",
    scopeId: "*",
    key: parsed.data.key,
    value: parsed.data.value,
    targetTenantId: null,
    confirm: parsed.data.confirm,
    version: { reason: parsed.data.reason },
  });
}

export async function getTenantSettings(ctx: ServiceContext, tenantId: string, branchId?: string) {
  if (isHyperAdmin(ctx)) {
    const tenant = await getPlatformTenant(tenantId);
    if (!tenant) return fail("NOT_FOUND", "Kurum bulunamadı");
    const settings = await resolveAllSettings({ tenantId, planKey: tenant.planKey, branchId });
    return ok({ tenant, settings });
  }
  const inst = requireInstitutionAdmin(ctx);
  if (!inst.ok) return inst;
  const own = requireOwnTenant(ctx, tenantId);
  if (!own.ok) return own;
  const tenant = await getPlatformTenant(tenantId);
  const settings = await resolveAllSettings({ tenantId, planKey: tenant?.planKey, branchId });
  return ok({ tenant, settings });
}

export async function updateTenantSetting(
  ctx: ServiceContext,
  tenantId: string,
  input: unknown,
  opts?: { branchId?: string }
) {
  const parsed = z
    .object({
      key: z.string().min(1),
      value: settingValueSchema,
      confirm: z.boolean().optional(),
      branchId: z.string().min(1).optional(),
      reason: z.string().max(300).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Geçersiz ayar yükü", parsed.error.flatten());

  if (isHyperAdmin(ctx)) {
    const tenant = await getPlatformTenant(tenantId);
    if (!tenant) return fail("NOT_FOUND", "Kurum bulunamadı");
    const branchId = opts?.branchId ?? parsed.data.branchId;
    return applySettingWrite({
      ctx,
      scopeType: branchId ? "branch" : "tenant",
      scopeId: branchId ?? tenantId,
      key: parsed.data.key,
      value: parsed.data.value,
      targetTenantId: tenantId,
      confirm: parsed.data.confirm,
      version: { reason: parsed.data.reason },
    });
  }

  const inst = requireInstitutionAdmin(ctx);
  if (!inst.ok) return inst;
  const own = requireOwnTenant(ctx, tenantId);
  if (!own.ok) return own;
  if (SETTING_BY_KEY.get(parsed.data.key)?.platformOnly) {
    return fail("FORBIDDEN", "Bu ayar yalnız NeviiOS (platform sahibi) tarafından yönetilir.");
  }
  if (ctx.role === "SCHOOL_ADMIN") {
    const def = SETTING_BY_KEY.get(parsed.data.key);
    if (def?.critical) {
      return fail("FORBIDDEN", "Kurum müdürü kritik kurum ayarını değiştiremez.");
    }
  }
  const branchId = opts?.branchId ?? parsed.data.branchId;
  return applySettingWrite({
    ctx,
    scopeType: branchId ? "branch" : "tenant",
    scopeId: branchId ?? tenantId,
    key: parsed.data.key,
    value: parsed.data.value,
    targetTenantId: tenantId,
    confirm: parsed.data.confirm,
  });
}

export async function getTenantFeatures(ctx: ServiceContext, tenantId: string) {
  if (isHyperAdmin(ctx)) {
    const tenant = await getPlatformTenant(tenantId);
    if (!tenant) return fail("NOT_FOUND", "Kurum bulunamadı");
    const features = await resolveAllFeatures(tenantId, tenant.planKey);
    return ok({ tenant, features });
  }
  const inst = requireInstitutionAdmin(ctx);
  if (!inst.ok) return inst;
  const own = requireOwnTenant(ctx, tenantId);
  if (!own.ok) return own;
  const tenant = await getPlatformTenant(tenantId);
  const features = await resolveAllFeatures(tenantId, tenant?.planKey);
  return ok({ tenant, features });
}

export async function updateTenantFeature(ctx: ServiceContext, tenantId: string, input: unknown) {
  const parsed = z
    .object({
      flag: z.string().min(1),
      enabled: z.boolean(),
      confirm: z.boolean().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Geçersiz özellik yükü", parsed.error.flatten());
  if (!isFeatureFlagKey(parsed.data.flag)) return fail("VALIDATION_ERROR", "Bilinmeyen özellik anahtarı");

  const flag = parsed.data.flag as FeatureFlagKey;
  const def = FEATURE_BY_KEY.get(flag)!;
  if (def.required && parsed.data.enabled === false) {
    return fail("VALIDATION_ERROR", "Bu modül sistem için zorunludur ve kapatılamaz.");
  }
  if (parsed.data.enabled) {
    // Feature flag ticari hak VERMEZ: paket/eklenti/entitlement override olmadan açılamaz.
    const current = (await resolveAllFeatures(tenantId)).find((f) => f.key === flag);
    if (current && !current.entitled) {
      return fail(
        "FORBIDDEN",
        "Bu modül kurumun paketinde yok. Önce NeviiOS'tan paket, eklenti veya entitlement override tanımlanmalı.",
        { flag, entitled: false }
      );
    }
  }

  if (isHyperAdmin(ctx)) {
    const tenant = await getPlatformTenant(tenantId);
    if (!tenant) return fail("NOT_FOUND", "Kurum bulunamadı");
    if (def.critical && parsed.data.confirm !== true) {
      return fail("VALIDATION_ERROR", "Kritik özellik değişikliği için onay gerekir.", {
        requiresConfirm: true,
        flag,
      });
    }
    const before = await resolveAllFeatures(tenantId, tenant.planKey);
    const now = new Date().toISOString();
    await upsertFeatureOverride({
      tenantId,
      flagKey: flag,
      enabled: parsed.data.enabled,
      updatedAt: now,
      updatedBy: ctx.userId,
    });
    const after = await resolveAllFeatures(tenantId, tenant.planKey);
    await writeAudit(
      ctx,
      "platform.feature.update",
      "FeatureFlag",
      flag,
      tenantId,
      before.find((f) => f.key === flag) ?? null,
      after.find((f) => f.key === flag) ?? null
    );
    await recordFeaturePolicyVersion(ctx, tenantId);
    return ok({ feature: after.find((f) => f.key === flag) });
  }

  const inst = requireInstitutionAdmin(ctx);
  if (!inst.ok) return inst;
  const own = requireOwnTenant(ctx, tenantId);
  if (!own.ok) return own;
  if (!canManageInstitutionFeatures(ctx.role, def.critical, def.institutionManageable)) {
    return fail("FORBIDDEN", "Bu özelliği değiştirme yetkiniz yok.");
  }
  if (def.critical && parsed.data.confirm !== true) {
    return fail("VALIDATION_ERROR", "Kritik özellik değişikliği için onay gerekir.", {
      requiresConfirm: true,
      flag,
    });
  }
  const tenant = await getPlatformTenant(tenantId);
  const before = await resolveAllFeatures(tenantId, tenant?.planKey);
  const now = new Date().toISOString();
  await upsertFeatureOverride({
    tenantId,
    flagKey: flag,
    enabled: parsed.data.enabled,
    updatedAt: now,
    updatedBy: ctx.userId,
  });
  const after = await resolveAllFeatures(tenantId, tenant?.planKey);
  await writeAudit(
    ctx,
    "institution.feature.update",
    "FeatureFlag",
    flag,
    tenantId,
    before.find((f) => f.key === flag) ?? null,
    after.find((f) => f.key === flag) ?? null
  );
  await recordFeaturePolicyVersion(ctx, tenantId);
  return ok({ feature: after.find((f) => f.key === flag) });
}

/** Modül politikası sürümü: kurumun tüm bayrak override haritası. */
async function recordFeaturePolicyVersion(ctx: ServiceContext, tenantId: string) {
  const map = Object.fromEntries((await listFeatureOverrides(tenantId)).map((o) => [o.flagKey, o.enabled]));
  await recordPublishedVersion(ctx, tenantId, FEATURES_POLICY_KEY, map);
}

export async function getIntegrationsForScope(
  ctx: ServiceContext,
  scopeType: "platform" | "tenant",
  scopeId: string
) {
  if (scopeType === "platform") {
    const gate = requireHyperAdmin(ctx);
    if (!gate.ok) return gate;
  } else if (isHyperAdmin(ctx)) {
    const tenant = await getPlatformTenant(scopeId);
    if (!tenant) return fail("NOT_FOUND", "Kurum bulunamadı");
  } else {
    const inst = requireInstitutionAdmin(ctx);
    if (!inst.ok) return inst;
    const own = requireOwnTenant(ctx, scopeId);
    if (!own.ok) return own;
    if (ctx.role !== "SUPER_ADMIN") {
      return fail("FORBIDDEN", "Kurum entegrasyonlarını yalnız kurum sahibi görür.");
    }
  }
  const integrations = await listPublicIntegrations(scopeType, scopeId);
  return ok({ integrations, encryptionAvailable: integrations[0]?.encryptionAvailable ?? false });
}

export async function updateIntegrationForScope(
  ctx: ServiceContext,
  scopeType: "platform" | "tenant",
  scopeId: string,
  input: unknown
) {
  if (scopeType === "platform") {
    const gate = requireHyperAdmin(ctx);
    if (!gate.ok) return gate;
  } else if (!isHyperAdmin(ctx)) {
    const inst = requireInstitutionAdmin(ctx);
    if (!inst.ok) return inst;
    const own = requireOwnTenant(ctx, scopeId);
    if (!own.ok) return own;
    if (ctx.role !== "SUPER_ADMIN") {
      return fail("FORBIDDEN", "Kurum entegrasyonlarını yalnız kurum sahibi yönetir.");
    }
  }
  const parsed = z
    .object({
      provider: z.string().min(1),
      config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
      secret: z.string().optional(),
      confirm: z.boolean().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Geçersiz entegrasyon yükü", parsed.error.flatten());
  if (parsed.data.secret && parsed.data.confirm !== true) {
    return fail("VALIDATION_ERROR", "Gizli anahtar kaydı için onay gerekir.", { requiresConfirm: true });
  }
  try {
    const result = await saveIntegrationConfig({
      scopeType,
      scopeId,
      provider: parsed.data.provider,
      config: parsed.data.config ?? {},
      secret: parsed.data.secret,
      actorUserId: ctx.userId,
    });
    await writeAudit(
      ctx,
      "platform.integration.update",
      "Integration",
      parsed.data.provider,
      scopeType === "tenant" ? scopeId : null,
      null,
      {
        provider: parsed.data.provider,
        secretLast4: result.public.secretLast4,
        storedSecret: result.storedSecret,
        encryptionMissing: result.encryptionMissing,
      }
    );
    return ok({
      integration: result.public,
      storedSecret: result.storedSecret,
      encryptionMissing: result.encryptionMissing,
      notice: result.encryptionMissing
        ? "PLATFORM_ENCRYPTION_KEY tanımlı değil; gizli anahtar kaydedilmedi. Env secret kullanın."
        : result.storedSecret
          ? undefined
          : "Gizli anahtar bu sürümde veritabanına yazılmaz; yalnız son 4 hane izlenir. Gerçek credential env'de kalır.",
    });
  } catch {
    return fail("NOT_FOUND", "Bilinmeyen sağlayıcı");
  }
}

export async function testIntegrationForScope(
  ctx: ServiceContext,
  scopeType: "platform" | "tenant",
  scopeId: string,
  input: unknown
) {
  if (scopeType === "platform") {
    const gate = requireHyperAdmin(ctx);
    if (!gate.ok) return gate;
  } else if (!isHyperAdmin(ctx)) {
    const inst = requireInstitutionAdmin(ctx);
    if (!inst.ok) return inst;
    const own = requireOwnTenant(ctx, scopeId);
    if (!own.ok) return own;
  }
  const parsed = z.object({ provider: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Sağlayıcı gerekli");
  try {
    const integration = await testIntegrationConnection({
      scopeType,
      scopeId,
      provider: parsed.data.provider,
      actorUserId: ctx.userId,
    });
    await writeAudit(
      ctx,
      "platform.integration.test",
      "Integration",
      parsed.data.provider,
      scopeType === "tenant" ? scopeId : null,
      null,
      { status: integration.status }
    );
    return ok({ integration });
  } catch {
    return fail("NOT_FOUND", "Bilinmeyen sağlayıcı");
  }
}

export async function getPlatformAuditLog(
  ctx: ServiceContext,
  targetTenantId?: string,
  filter?: {
    action?: string;
    actorUserId?: string;
    outcome?: string;
    entityType?: string;
    after?: string;
    before?: string;
    page?: number;
    pageSize?: number;
  }
) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  // Tarih seçiciler gün verir; bitiş günü sonuna kadar dahil edilir.
  const endOfDay = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T23:59:59.999Z` : d);
  const events = await listPlatformAudit({
    targetTenantId,
    limit: 500,
    actionPrefix: filter?.action || undefined,
    actorUserId: filter?.actorUserId || undefined,
    outcome: filter?.outcome || undefined,
    entityType: filter?.entityType || undefined,
    after: filter?.after || undefined,
    before: filter?.before ? endOfDay(filter.before) : undefined,
  });
  const pageSize = [10, 25, 50, 100].includes(filter?.pageSize ?? 0) ? filter!.pageSize! : 25;
  const pages = Math.max(1, Math.ceil(events.length / pageSize));
  const page = Math.min(Math.max(1, filter?.page ?? 1), pages);
  const slice = events.slice((page - 1) * pageSize, page * pageSize);
  return ok({ events: redactSecrets(slice), total: events.length, page, pages, pageSize });
}

/** Paket, entitlement, limit ve kullanım özeti (limit aşımı veri silmez — yalnız yeni işlem kısıtlanır). */
export async function getTenantSubscription(ctx: ServiceContext, tenantId: string) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const tenant = await getPlatformTenant(tenantId);
  if (!tenant) return fail("NOT_FOUND", "Kurum bulunamadı");
  const [limits, features, members] = await Promise.all([
    resolveTenantLimits(tenantId, tenant.planKey),
    resolveAllFeatures(tenantId, tenant.planKey),
    listTenantUsersInternal(tenantId),
  ]);
  let students: number | null = null;
  let branches: number | null = null;
  try {
    const data = await runWithTenantAsync(tenantId, () => readReferenceData());
    students = data.students.filter((s) => s.active !== false).length;
    branches = data.settings.branches.length;
  } catch {
    // Operasyon verisi bu depoda yok (json modunda yalnız demo kurumu).
  }
  return ok({
    tenant,
    plans: Object.entries(PLAN_CATALOG).map(([key, p]) => ({ key, label: p.label, limits: p.limits })),
    limits,
    usage: {
      students,
      users: members.filter((m) => (STAFF_SEAT_ROLES as readonly string[]).includes(m.role)).length,
      branches,
    },
    entitlements: features.map((f) => ({ key: f.key, label: f.label, entitled: f.entitled, source: f.entitlementSource, enabled: f.enabled })),
  });
}

export async function getPlatformHealth(ctx: ServiceContext) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const cards = await collectHealthCards();
  return ok({ cards });
}

export async function getOwnInstitutionSettings(ctx: ServiceContext) {
  return getTenantSettings(ctx, ctx.tenantId);
}

export async function updateOwnInstitutionSetting(ctx: ServiceContext, input: unknown) {
  return updateTenantSetting(ctx, ctx.tenantId, input);
}

export async function getOwnInstitutionFeatures(ctx: ServiceContext) {
  return getTenantFeatures(ctx, ctx.tenantId);
}

export async function updateOwnInstitutionFeature(ctx: ServiceContext, input: unknown) {
  return updateTenantFeature(ctx, ctx.tenantId, input);
}

export async function getOwnInstitutionIntegrations(ctx: ServiceContext) {
  return getIntegrationsForScope(ctx, "tenant", ctx.tenantId);
}

export {
  createTenantDraft,
  provisionTenant,
  issueOwnerInvitation,
  listOwnerInvitations,
  getProvisionHistory,
  acceptOwnerInvitation,
};
