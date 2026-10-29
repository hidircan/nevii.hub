import { promises as fs } from "fs";
import { Prisma } from "@prisma/client";
import path from "path";
import { resolveDataDir, isDbMode } from "../config";
import { withFileLock, writeJsonFileAtomic } from "../atomic-json-file";
import { uid } from "../utils";
import { listTenants } from "../store";
import { DEFAULT_TENANT_ID, PLATFORM_TENANT_ID } from "../auth/config";
import { runWithTenantAsync } from "../tenant-context";
import type {
  FeatureFlagKey,
  FeatureFlagOverride,
  IntegrationConnection,
  JsonValue,
  OwnerInvitationRecord,
  PlatformAuditEvent,
  PlatformState,
  PlatformTenant,
  PlanKey,
  ProvisionRun,
  SettingOverride,
  SettingScope,
  SupportAccessSession,
  TenantDraftPayload,
  TenantLifecycle,
  UserBranchAccess,
} from "./types";
import { PLAN_KEYS, PLAN_KEY_PATTERN } from "./types";
import { normalizeLifecycle } from "./lifecycle";

export const PLATFORM_STORE_FILE = path.join(
  resolveDataDir(path.join(process.cwd(), "data")),
  "platform-control.json"
);

const EMPTY: PlatformState = {
  version: 1,
  tenants: [],
  settingOverrides: [],
  featureOverrides: [],
  auditEvents: [],
  integrations: [],
  invitations: [],
  provisionRuns: [],
};

let memoryState: PlatformState | null = null;

/**
 * STORE_MODE=db iken Prisma hatası JSON dosyasına SESSİZCE düşmez: platform
 * ayarı/audit/davet kaybolmasın, mode parity bozulmasın diye fail-closed.
 */
export function dbFailClosed(e: unknown): never {
  console.error("[neviios] platform store db error", e instanceof Error ? e.message : e);
  throw e instanceof Error ? e : new Error("Platform veritabanı işlemi başarısız");
}

/** Yerleşik veya katalogda oluşturulmuş paket anahtarı biçimi (katalog varlığı yazımda doğrulanır). */
function isPlanKey(v: string): v is PlanKey {
  return (PLAN_KEYS as readonly string[]).includes(v) || PLAN_KEY_PATTERN.test(v);
}

function mapPrismaTenant(
  row: {
    id: string;
    name: string;
    slug: string;
    active: boolean;
    planKey: string;
    lifecycle?: string;
    shortName?: string;
    contactEmail?: string;
    phone?: string;
    country?: string;
    timezone?: string;
    currency?: string;
    language?: string;
    colorPrimary?: string;
    logoUrl?: string;
    provisionError?: string | null;
    idempotencyKey?: string | null;
    draftJson?: unknown;
    createdAt: Date;
    updatedAt: Date;
  },
  displayName?: string
): PlatformTenant {
  return normalizePlatformTenant({
    tenantId: row.id,
    name: displayName ?? row.name,
    slug: row.slug,
    active: row.active,
    lifecycle: row.lifecycle as TenantLifecycle | undefined,
    planKey: isPlanKey(row.planKey) ? row.planKey : "standard",
    shortName: row.shortName,
    contactEmail: row.contactEmail,
    phone: row.phone,
    country: row.country,
    timezone: row.timezone,
    currency: row.currency,
    language: row.language,
    colorPrimary: row.colorPrimary,
    logoUrl: row.logoUrl,
    provisionError: row.provisionError ?? null,
    idempotencyKey: row.idempotencyKey ?? null,
    draft: (row.draftJson as TenantDraftPayload | null) ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export function emptyPlatformState(): PlatformState {
  return {
    version: 1,
    tenants: [],
    settingOverrides: [],
    featureOverrides: [],
    auditEvents: [],
    integrations: [],
    invitations: [],
    provisionRuns: [],
  };
}

export function normalizePlatformTenant(partial: Partial<PlatformTenant> & Pick<PlatformTenant, "tenantId" | "name">): PlatformTenant {
  const now = new Date().toISOString();
  const lifecycle = normalizeLifecycle(partial);
  return {
    tenantId: partial.tenantId,
    name: partial.name,
    slug: partial.slug || partial.tenantId,
    active: lifecycle === "active",
    lifecycle,
    planKey: partial.planKey && isPlanKey(partial.planKey) ? partial.planKey : "standard",
    shortName: partial.shortName ?? "",
    contactEmail: partial.contactEmail ?? "",
    phone: partial.phone ?? "",
    country: partial.country ?? "TR",
    timezone: partial.timezone ?? "Europe/Istanbul",
    currency: partial.currency ?? "TRY",
    language: partial.language ?? "tr",
    colorPrimary: partial.colorPrimary ?? "#6d28d9",
    logoUrl: partial.logoUrl ?? "",
    provisionError: partial.provisionError ?? null,
    idempotencyKey: partial.idempotencyKey ?? null,
    draft: partial.draft ?? null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

async function readFileState(): Promise<PlatformState> {
  try {
    const raw = await fs.readFile(PLATFORM_STORE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as PlatformState;
    if (!parsed || parsed.version !== 1) return emptyPlatformState();
    return {
      // Tur 3+ koleksiyonları (sessions, releases, deployments …) olduğu gibi taşınır.
      ...parsed,
      version: 1,
      tenants: (parsed.tenants ?? []).map((t) => normalizePlatformTenant(t)),
      settingOverrides: parsed.settingOverrides ?? [],
      featureOverrides: parsed.featureOverrides ?? [],
      auditEvents: parsed.auditEvents ?? [],
      integrations: parsed.integrations ?? [],
      invitations: parsed.invitations ?? [],
      provisionRuns: parsed.provisionRuns ?? [],
      branchAccess: parsed.branchAccess ?? [],
      supportSessions: parsed.supportSessions ?? [],
      userStates: parsed.userStates ?? [],
      policyVersions: parsed.policyVersions ?? [],
      tenantRoles: parsed.tenantRoles ?? [],
      roleAssignments: parsed.roleAssignments ?? [],
      passwordResets: parsed.passwordResets ?? [],
    };
  } catch {
    return emptyPlatformState();
  }
}

async function writeFileState(state: PlatformState): Promise<void> {
  await writeJsonFileAtomic(PLATFORM_STORE_FILE, state);
}

async function loadState(): Promise<PlatformState> {
  if (process.env.STORE_MODE === "memory") {
    if (!memoryState) memoryState = emptyPlatformState();
    return memoryState;
  }
  return readFileState();
}

async function saveState(state: PlatformState): Promise<PlatformState> {
  if (process.env.STORE_MODE === "memory") {
    memoryState = state;
    return state;
  }
  await writeFileState(state);
  return state;
}

/** store-ext.ts gibi ek koleksiyonlar için (json/memory kilitli okuma-yazma). */
export async function readPlatformState(): Promise<PlatformState> {
  return loadState();
}

export async function mutatePlatformState<T>(fn: (state: PlatformState) => T | Promise<T>): Promise<T> {
  return mutate(fn);
}

async function mutate<T>(fn: (state: PlatformState) => T | Promise<T>): Promise<T> {
  if (isDbMode) {
    // DB path is handled by dedicated functions; json/memory lock below.
    return fn(await loadState());
  }
  return withFileLock(PLATFORM_STORE_FILE, async () => {
    const state = await loadState();
    const result = await fn(state);
    await saveState(state);
    return result;
  });
}

async function hydrateTenantsFromSchoolStore(state: PlatformState): Promise<void> {
  const listed = await runWithTenantAsync(DEFAULT_TENANT_ID, () => listTenants());
  const now = new Date().toISOString();
  for (const t of listed) {
    if (t.tenantId === PLATFORM_TENANT_ID) continue;
    if (state.tenants.some((x) => x.tenantId === t.tenantId)) continue;
    state.tenants.push(
      normalizePlatformTenant({
        tenantId: t.tenantId,
        name: t.name,
        slug: t.tenantId,
        active: true,
        lifecycle: "active",
        planKey: "standard",
        createdAt: now,
        updatedAt: now,
      })
    );
  }
}

export async function resetPlatformStoreForTests(): Promise<void> {
  memoryState = emptyPlatformState();
  try {
    await fs.rm(PLATFORM_STORE_FILE, { force: true });
  } catch {
    // ignore
  }
}

/**
 * DB egress (2026-09-30): kurum görünen adı için School'dan YALNIZ `name` okunur.
 * `include: { schools: true }` her satırda ~79 KB data-URI `School.logoUrl`'i de
 * taşıyordu; `getPlatformTenant` ayar çözümlemesi (rol preset'i, hakediş erişimi)
 * üzerinden neredeyse her panel isteğinde birkaç kez çalışıyordu.
 */
const TENANT_SCHOOL_NAME = { schools: { select: { name: true } } } as const;

export async function listPlatformTenants(): Promise<PlatformTenant[]> {
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const prisma = getPrisma();
      const rows = await prisma.tenant.findMany({
        where: { id: { not: PLATFORM_TENANT_ID } },
        include: TENANT_SCHOOL_NAME,
        orderBy: { createdAt: "desc" },
      });
      return rows.map((row) =>
        mapPrismaTenant(row, row.schools[0]?.name ?? row.name)
      );
    } catch (e) {
      dbFailClosed(e);
    }
  }
  // Okuma yolu yazmaz; yalnız okul deposunda yeni kurum görünürse kalıcılaştırır.
  const state = await loadState();
  const known = state.tenants.length;
  await hydrateTenantsFromSchoolStore(state);
  if (state.tenants.length !== known && process.env.STORE_MODE !== "memory") {
    await mutate((s) => hydrateTenantsFromSchoolStore(s));
  }
  return [...state.tenants].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getPlatformTenant(tenantId: string): Promise<PlatformTenant | null> {
  // db: tüm kurumları listeleyip aramak yerine tek satır (platform tenant'ı listede yoktu → null).
  if (isDbMode) {
    if (tenantId === PLATFORM_TENANT_ID) return null;
    try {
      const { getPrisma } = await import("../db");
      const row = await getPrisma().tenant.findUnique({ where: { id: tenantId }, include: TENANT_SCHOOL_NAME });
      return row ? mapPrismaTenant(row, row.schools[0]?.name ?? row.name) : null;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const all = await listPlatformTenants();
  return all.find((t) => t.tenantId === tenantId) ?? null;
}

export type UpsertTenantInput = {
  tenantId?: string;
  name: string;
  slug?: string;
  active?: boolean;
  lifecycle?: TenantLifecycle;
  planKey?: PlanKey;
  shortName?: string;
  contactEmail?: string;
  phone?: string;
  country?: string;
  timezone?: string;
  currency?: string;
  language?: string;
  colorPrimary?: string;
  logoUrl?: string;
  provisionError?: string | null;
  idempotencyKey?: string | null;
  draft?: TenantDraftPayload | null;
};

/** Yalnız `Tenant.language`. Başka kurum alanını yazmaz. Kayıt yoksa no-op. */
export async function setTenantLanguage(tenantId: string, language: "tr" | "en"): Promise<void> {
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      await getPrisma().tenant.update({ where: { id: tenantId }, data: { language } });
      return;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  await mutate((state) => {
    const existing = state.tenants.find((t) => t.tenantId === tenantId);
    if (!existing) return;
    existing.language = language;
    existing.updatedAt = new Date().toISOString();
  });
}

export async function upsertPlatformTenant(
  input: UpsertTenantInput,
  actorUserId: string
): Promise<PlatformTenant> {
  const now = new Date().toISOString();
  const tenantId = input.tenantId || uid("tenant");
  const slug =
    (input.slug || input.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || tenantId;
  const lifecycle = normalizeLifecycle({
    lifecycle: input.lifecycle,
    active: input.active,
  });

  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const prisma = getPrisma();
      const row = await prisma.tenant.upsert({
        where: { id: tenantId },
        create: {
          id: tenantId,
          name: input.name,
          slug,
          active: lifecycle === "active",
          planKey: input.planKey ?? "standard",
          lifecycle,
          shortName: input.shortName ?? "",
          contactEmail: input.contactEmail ?? "",
          phone: input.phone ?? "",
          country: input.country ?? "TR",
          timezone: input.timezone ?? "Europe/Istanbul",
          currency: input.currency ?? "TRY",
          language: input.language ?? "tr",
          colorPrimary: input.colorPrimary ?? "#6d28d9",
          logoUrl: input.logoUrl ?? "",
          provisionError: input.provisionError ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
          draftJson: input.draft ?? undefined,
        },
        update: {
          name: input.name,
          slug,
          active: lifecycle === "active",
          planKey: input.planKey,
          lifecycle,
          shortName: input.shortName,
          contactEmail: input.contactEmail,
          phone: input.phone,
          country: input.country,
          timezone: input.timezone,
          currency: input.currency,
          language: input.language,
          colorPrimary: input.colorPrimary,
          logoUrl: input.logoUrl,
          provisionError: input.provisionError,
          idempotencyKey: input.idempotencyKey,
          draftJson: input.draft === undefined ? undefined : input.draft === null ? Prisma.JsonNull : input.draft,
        },
      });
      void actorUserId;
      return mapPrismaTenant(row);
    } catch (e) {
      dbFailClosed(e);
    }
  }

  return mutate((state) => {
    const existing = state.tenants.find((t) => t.tenantId === tenantId);
    if (existing) {
      Object.assign(
        existing,
        normalizePlatformTenant({
          ...existing,
          ...input,
          tenantId,
          slug,
          lifecycle,
          updatedAt: now,
        })
      );
      return existing;
    }
    const created = normalizePlatformTenant({
      ...input,
      tenantId,
      slug,
      lifecycle,
      createdAt: now,
      updatedAt: now,
    });
    state.tenants.push(created);
    void actorUserId;
    return created;
  });
}

export async function findTenantBySlug(slug: string): Promise<PlatformTenant | null> {
  const all = await listPlatformTenants();
  return all.find((t) => t.slug === slug) ?? null;
}

export async function findTenantByIdempotencyKey(key: string): Promise<PlatformTenant | null> {
  const all = await listPlatformTenants();
  return all.find((t) => t.idempotencyKey === key) ?? null;
}

export async function setTenantPlan(tenantId: string, planKey: PlanKey): Promise<PlatformTenant | null> {
  const tenant = await getPlatformTenant(tenantId);
  if (!tenant) return null;
  return upsertPlatformTenant({ tenantId, name: tenant.name, planKey, active: tenant.active }, "system");
}

export async function setTenantActive(tenantId: string, active: boolean): Promise<PlatformTenant | null> {
  const tenant = await getPlatformTenant(tenantId);
  if (!tenant) return null;
  return upsertPlatformTenant({ tenantId, name: tenant.name, planKey: tenant.planKey, active }, "system");
}

/** Çözümleme için yalnız ilgili kapsamlar (platform + plan + kurum + şube + kullanıcı). */
export type OverrideScopeFilter = { tenantId: string; planKey?: string; branchId?: string; userId?: string };

function scopePairs(f: OverrideScopeFilter): { scopeType: string; scopeId: string }[] {
  const pairs = [
    { scopeType: "platform", scopeId: "*" },
    { scopeType: "tenant", scopeId: f.tenantId },
  ];
  if (f.planKey) pairs.push({ scopeType: "plan", scopeId: f.planKey });
  if (f.branchId) pairs.push({ scopeType: "branch", scopeId: f.branchId });
  if (f.userId) pairs.push({ scopeType: "user", scopeId: f.userId });
  return pairs;
}

export async function listSettingOverrides(filter?: OverrideScopeFilter): Promise<SettingOverride[]> {
  const pairs = filter ? scopePairs(filter) : null;
  const inScope = (o: { scopeType: string; scopeId: string }) =>
    !pairs || pairs.some((p) => p.scopeType === o.scopeType && p.scopeId === o.scopeId);
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const prisma = getPrisma();
      const rows = await prisma.settingOverride.findMany(pairs ? { where: { OR: pairs } } : undefined);
      return rows.map((r) => ({
        scopeType: r.scopeType as SettingScope,
        scopeId: r.scopeId,
        key: r.key,
        value: r.value as JsonValue,
        updatedAt: r.updatedAt.toISOString(),
        updatedBy: r.updatedBy,
      }));
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const state = await loadState();
  return state.settingOverrides.filter(inScope);
}

export async function upsertSettingOverride(row: SettingOverride): Promise<SettingOverride> {
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const prisma = getPrisma();
      const saved = await prisma.settingOverride.upsert({
        where: {
          scopeType_scopeId_key: { scopeType: row.scopeType, scopeId: row.scopeId, key: row.key },
        },
        create: {
          id: uid("setov"),
          scopeType: row.scopeType,
          scopeId: row.scopeId,
          key: row.key,
          value: row.value as object,
          updatedBy: row.updatedBy,
        },
        update: { value: row.value as object, updatedBy: row.updatedBy },
      });
      return {
        ...row,
        updatedAt: saved.updatedAt.toISOString(),
      };
    } catch (e) {
      dbFailClosed(e);
    }
  }
  return mutate((state) => {
    const idx = state.settingOverrides.findIndex(
      (o) => o.scopeType === row.scopeType && o.scopeId === row.scopeId && o.key === row.key
    );
    if (idx >= 0) state.settingOverrides[idx] = row;
    else state.settingOverrides.push(row);
    return row;
  });
}

export async function deleteSettingOverride(scopeType: SettingScope, scopeId: string, key: string): Promise<void> {
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const prisma = getPrisma();
      await prisma.settingOverride.deleteMany({ where: { scopeType, scopeId, key } });
      return;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  await mutate((state) => {
    state.settingOverrides = state.settingOverrides.filter(
      (o) => !(o.scopeType === scopeType && o.scopeId === scopeId && o.key === key)
    );
  });
}

export async function listFeatureOverrides(tenantId?: string): Promise<FeatureFlagOverride[]> {
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const prisma = getPrisma();
      const rows = await prisma.featureFlagOverride.findMany({
        where: tenantId ? { tenantId } : undefined,
      });
      return rows.map((r) => ({
        tenantId: r.tenantId,
        flagKey: r.flagKey as FeatureFlagKey,
        enabled: r.enabled,
        updatedAt: r.updatedAt.toISOString(),
        updatedBy: r.updatedBy,
      }));
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const state = await loadState();
  return tenantId ? state.featureOverrides.filter((f) => f.tenantId === tenantId) : state.featureOverrides;
}

export async function upsertFeatureOverride(row: FeatureFlagOverride): Promise<FeatureFlagOverride> {
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const prisma = getPrisma();
      const saved = await prisma.featureFlagOverride.upsert({
        where: { tenantId_flagKey: { tenantId: row.tenantId, flagKey: row.flagKey } },
        create: {
          id: uid("ffov"),
          tenantId: row.tenantId,
          flagKey: row.flagKey,
          enabled: row.enabled,
          updatedBy: row.updatedBy,
        },
        update: { enabled: row.enabled, updatedBy: row.updatedBy },
      });
      return { ...row, updatedAt: saved.updatedAt.toISOString() };
    } catch (e) {
      dbFailClosed(e);
    }
  }
  return mutate((state) => {
    const idx = state.featureOverrides.findIndex(
      (o) => o.tenantId === row.tenantId && o.flagKey === row.flagKey
    );
    if (idx >= 0) state.featureOverrides[idx] = row;
    else state.featureOverrides.push(row);
    return row;
  });
}

export async function deleteFeatureOverride(tenantId: string, flagKey: FeatureFlagKey): Promise<void> {
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      await getPrisma().featureFlagOverride.deleteMany({ where: { tenantId, flagKey } });
      return;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  await mutate((state) => {
    state.featureOverrides = state.featureOverrides.filter((o) => !(o.tenantId === tenantId && o.flagKey === flagKey));
  });
}

export async function appendPlatformAudit(event: Omit<PlatformAuditEvent, "id" | "createdAt">): Promise<PlatformAuditEvent> {
  const full: PlatformAuditEvent = {
    ...event,
    id: uid("paudit"),
    createdAt: new Date().toISOString(),
  };
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const prisma = getPrisma();
      await prisma.platformAuditEvent.create({
        data: {
          id: full.id,
          actorUserId: full.actorUserId,
          actorRole: full.actorRole,
          actorTenantId: full.actorTenantId,
          targetTenantId: full.targetTenantId,
          action: full.action,
          entityType: full.entityType,
          entityId: full.entityId,
          before: full.before as object | undefined,
          after: full.after as object | undefined,
          requestId: full.requestId,
          outcome: full.outcome,
        },
      });
      return full;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  return mutate((state) => {
    state.auditEvents.unshift(full);
    if (state.auditEvents.length > 2000) state.auditEvents.length = 2000;
    return full;
  });
}

export async function listPlatformAudit(filter?: {
  targetTenantId?: string;
  limit?: number;
  actionPrefix?: string;
  actorUserId?: string;
  outcome?: string;
  entityType?: string;
  after?: string;
  before?: string;
}): Promise<PlatformAuditEvent[]> {
  const limit = filter?.limit ?? 100;
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const prisma = getPrisma();
      const rows = await prisma.platformAuditEvent.findMany({
        where: {
          ...(filter?.targetTenantId ? { targetTenantId: filter.targetTenantId } : {}),
          ...(filter?.actionPrefix ? { action: { startsWith: filter.actionPrefix } } : {}),
          ...(filter?.actorUserId ? { actorUserId: filter.actorUserId } : {}),
          ...(filter?.outcome ? { outcome: filter.outcome } : {}),
          ...(filter?.entityType ? { entityType: filter.entityType } : {}),
          ...(filter?.after || filter?.before
            ? { createdAt: { ...(filter.after ? { gte: new Date(filter.after) } : {}), ...(filter.before ? { lte: new Date(filter.before) } : {}) } }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return rows.map((r) => ({
        id: r.id,
        actorUserId: r.actorUserId,
        actorRole: r.actorRole,
        actorTenantId: r.actorTenantId,
        targetTenantId: r.targetTenantId,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        before: (r.before as JsonValue) ?? null,
        after: (r.after as JsonValue) ?? null,
        requestId: r.requestId,
        outcome: r.outcome as PlatformAuditEvent["outcome"],
        createdAt: r.createdAt.toISOString(),
      }));
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const state = await loadState();
  let rows = state.auditEvents;
  if (filter?.targetTenantId) {
    rows = rows.filter((e) => e.targetTenantId === filter.targetTenantId);
  }
  if (filter?.actionPrefix) rows = rows.filter((e) => e.action.startsWith(filter.actionPrefix!));
  if (filter?.actorUserId) rows = rows.filter((e) => e.actorUserId === filter.actorUserId);
  if (filter?.outcome) rows = rows.filter((e) => e.outcome === filter.outcome);
  if (filter?.entityType) rows = rows.filter((e) => e.entityType === filter.entityType);
  if (filter?.after) rows = rows.filter((e) => e.createdAt >= filter.after!);
  if (filter?.before) rows = rows.filter((e) => e.createdAt <= filter.before!);
  return rows.slice(0, limit);
}

export async function listIntegrations(scopeType?: "platform" | "tenant", scopeId?: string): Promise<IntegrationConnection[]> {
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const prisma = getPrisma();
      const rows = await prisma.integrationConnection.findMany({
        where: {
          ...(scopeType ? { scopeType } : {}),
          ...(scopeId ? { scopeId } : {}),
        },
      });
      return rows.map(mapIntegrationRow);
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const state = await loadState();
  return state.integrations.filter((i) => {
    if (scopeType && i.scopeType !== scopeType) return false;
    if (scopeId && i.scopeId !== scopeId) return false;
    return true;
  });
}

function mapIntegrationRow(r: {
  id: string;
  scopeType: string;
  scopeId: string;
  provider: string;
  kind: string;
  status: string;
  lastVerifiedAt: Date | null;
  secretLast4: string | null;
  secretStored: boolean;
  config: unknown;
  updatedAt: Date;
  updatedBy: string;
}): IntegrationConnection {
  return {
    id: r.id,
    scopeType: r.scopeType as IntegrationConnection["scopeType"],
    scopeId: r.scopeId,
    provider: r.provider,
    kind: r.kind as IntegrationConnection["kind"],
    status: r.status as IntegrationConnection["status"],
    lastVerifiedAt: r.lastVerifiedAt?.toISOString() ?? null,
    secretLast4: r.secretLast4,
    secretStored: r.secretStored,
    config: (r.config as Record<string, JsonValue>) ?? {},
    updatedAt: r.updatedAt.toISOString(),
    updatedBy: r.updatedBy,
  };
}

export async function upsertIntegration(row: IntegrationConnection): Promise<IntegrationConnection> {
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const prisma = getPrisma();
      const saved = await prisma.integrationConnection.upsert({
        where: {
          scopeType_scopeId_provider: {
            scopeType: row.scopeType,
            scopeId: row.scopeId,
            provider: row.provider,
          },
        },
        create: {
          id: row.id || uid("intg"),
          scopeType: row.scopeType,
          scopeId: row.scopeId,
          provider: row.provider,
          kind: row.kind,
          status: row.status,
          lastVerifiedAt: row.lastVerifiedAt ? new Date(row.lastVerifiedAt) : null,
          secretLast4: row.secretLast4,
          secretStored: row.secretStored,
          config: row.config as object,
          updatedBy: row.updatedBy,
        },
        update: {
          status: row.status,
          lastVerifiedAt: row.lastVerifiedAt ? new Date(row.lastVerifiedAt) : null,
          secretLast4: row.secretLast4,
          secretStored: row.secretStored,
          config: row.config as object,
          updatedBy: row.updatedBy,
        },
      });
      return mapIntegrationRow(saved);
    } catch (e) {
      dbFailClosed(e);
    }
  }
  return mutate((state) => {
    const idx = state.integrations.findIndex(
      (i) => i.scopeType === row.scopeType && i.scopeId === row.scopeId && i.provider === row.provider
    );
    const saved = { ...row, id: row.id || uid("intg") };
    if (idx >= 0) state.integrations[idx] = saved;
    else state.integrations.push(saved);
    return saved;
  });
}

function mapInviteRow(r: {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  phone: string | null;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  createdBy: string;
  role?: string | null;
  branchIds?: unknown;
}): OwnerInvitationRecord {
  return {
    id: r.id,
    tenantId: r.tenantId,
    email: r.email,
    name: r.name,
    phone: r.phone,
    tokenHash: r.tokenHash,
    expiresAt: r.expiresAt.toISOString(),
    usedAt: r.usedAt?.toISOString() ?? null,
    revokedAt: r.revokedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    createdBy: r.createdBy,
    role: r.role ?? null,
    branchIds: Array.isArray(r.branchIds) ? (r.branchIds as string[]) : null,
  };
}

export async function listInvitations(tenantId?: string): Promise<OwnerInvitationRecord[]> {
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const prisma = getPrisma();
      const rows = await prisma.ownerInvitation.findMany({
        where: tenantId ? { tenantId } : undefined,
        orderBy: { createdAt: "desc" },
      });
      return rows.map(mapInviteRow);
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const state = await loadState();
  const rows = tenantId ? state.invitations.filter((i) => i.tenantId === tenantId) : state.invitations;
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getInvitation(id: string): Promise<OwnerInvitationRecord | null> {
  const all = await listInvitations();
  return all.find((i) => i.id === id) ?? null;
}

export async function saveInvitation(row: OwnerInvitationRecord): Promise<OwnerInvitationRecord> {
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const prisma = getPrisma();
      const saved = await prisma.ownerInvitation.upsert({
        where: { id: row.id },
        create: {
          id: row.id,
          tenantId: row.tenantId,
          email: row.email,
          name: row.name,
          phone: row.phone,
          tokenHash: row.tokenHash,
          expiresAt: new Date(row.expiresAt),
          usedAt: row.usedAt ? new Date(row.usedAt) : null,
          revokedAt: row.revokedAt ? new Date(row.revokedAt) : null,
          createdBy: row.createdBy,
          role: row.role ?? null,
          branchIds: row.branchIds ?? undefined,
        },
        update: {
          tokenHash: row.tokenHash,
          expiresAt: new Date(row.expiresAt),
          usedAt: row.usedAt ? new Date(row.usedAt) : null,
          revokedAt: row.revokedAt ? new Date(row.revokedAt) : null,
        },
      });
      return mapInviteRow(saved);
    } catch (e) {
      dbFailClosed(e);
    }
  }
  return mutate((state) => {
    const idx = state.invitations.findIndex((i) => i.id === row.id);
    if (idx >= 0) state.invitations[idx] = row;
    else state.invitations.unshift(row);
    return row;
  });
}

export async function revokePendingInvitations(
  tenantId: string,
  match: (row: OwnerInvitationRecord) => boolean = () => true
): Promise<void> {
  const now = new Date().toISOString();
  const rows = await listInvitations(tenantId);
  for (const row of rows) {
    if (row.usedAt || row.revokedAt || !match(row)) continue;
    await saveInvitation({ ...row, revokedAt: now });
  }
}

export async function listProvisionRuns(tenantId: string): Promise<ProvisionRun[]> {
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const prisma = getPrisma();
      const rows = await prisma.provisioningRun.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
      });
      return rows.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        status: r.status as ProvisionRun["status"],
        steps: (r.steps as ProvisionRun["steps"]) ?? [],
        error: r.error,
        actorUserId: r.actorUserId,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }));
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const state = await loadState();
  return state.provisionRuns.filter((r) => r.tenantId === tenantId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveProvisionRun(row: ProvisionRun): Promise<ProvisionRun> {
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const prisma = getPrisma();
      const saved = await prisma.provisioningRun.upsert({
        where: { id: row.id },
        create: {
          id: row.id,
          tenantId: row.tenantId,
          status: row.status,
          steps: row.steps as object,
          error: row.error,
          actorUserId: row.actorUserId,
        },
        update: {
          status: row.status,
          steps: row.steps as object,
          error: row.error,
        },
      });
      return {
        ...row,
        updatedAt: saved.updatedAt.toISOString(),
      };
    } catch (e) {
      dbFailClosed(e);
    }
  }
  return mutate((state) => {
    const idx = state.provisionRuns.findIndex((r) => r.id === row.id);
    if (idx >= 0) state.provisionRuns[idx] = row;
    else state.provisionRuns.unshift(row);
    return row;
  });
}

// ───────────── NeviiOS: şube erişimi ─────────────

function mapBranchAccess(r: {
  id: string;
  tenantId: string;
  userId: string;
  branchId: string;
  grantedBy: string;
  createdAt: Date;
  revokedAt: Date | null;
}): UserBranchAccess {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    revokedAt: r.revokedAt?.toISOString() ?? null,
  };
}

/** Yalnız aktif (revoke edilmemiş) satırlar. tenantId zorunlu — kurumlar arası sorgu yok. */
export async function listBranchAccess(tenantId: string, userId?: string): Promise<UserBranchAccess[]> {
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const rows = await getPrisma().userBranchAccess.findMany({
        where: { tenantId, revokedAt: null, ...(userId ? { userId } : {}) },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(mapBranchAccess);
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const state = await loadState();
  return (state.branchAccess ?? []).filter(
    (a) => a.tenantId === tenantId && !a.revokedAt && (!userId || a.userId === userId)
  );
}

/** İdempotent: aynı (tenant, user, branch) aktif satır varsa onu döner. */
export async function grantBranchAccess(row: Omit<UserBranchAccess, "id" | "createdAt" | "revokedAt">): Promise<UserBranchAccess> {
  const existing = (await listBranchAccess(row.tenantId, row.userId)).find((a) => a.branchId === row.branchId);
  if (existing) return existing;
  const full: UserBranchAccess = { ...row, id: uid("uba"), createdAt: new Date().toISOString(), revokedAt: null };
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      return mapBranchAccess(
        await getPrisma().userBranchAccess.create({
          data: { id: full.id, tenantId: full.tenantId, userId: full.userId, branchId: full.branchId, grantedBy: full.grantedBy },
        })
      );
    } catch (e) {
      dbFailClosed(e);
    }
  }
  return mutate((state) => {
    state.branchAccess = [...(state.branchAccess ?? []), full];
    return full;
  });
}

export async function revokeBranchAccess(tenantId: string, userId: string, branchId: string): Promise<number> {
  const now = new Date();
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const res = await getPrisma().userBranchAccess.updateMany({
        where: { tenantId, userId, branchId, revokedAt: null },
        data: { revokedAt: now },
      });
      return res.count;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  return mutate((state) => {
    let n = 0;
    for (const a of state.branchAccess ?? []) {
      if (a.tenantId === tenantId && a.userId === userId && a.branchId === branchId && !a.revokedAt) {
        a.revokedAt = now.toISOString();
        n += 1;
      }
    }
    return n;
  });
}

// ───────────── NeviiOS: destek erişimi ─────────────

function mapSupport(r: {
  id: string;
  tenantId: string;
  actorUserId: string;
  reason: string;
  startedAt: Date;
  expiresAt: Date;
  endedAt: Date | null;
  endedBy: string | null;
}): SupportAccessSession {
  return {
    ...r,
    startedAt: r.startedAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    endedAt: r.endedAt?.toISOString() ?? null,
  };
}

export async function listSupportSessions(filter: { tenantId?: string; limit?: number }): Promise<SupportAccessSession[]> {
  const limit = filter.limit ?? 50;
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const rows = await getPrisma().supportAccessSession.findMany({
        where: filter.tenantId ? { tenantId: filter.tenantId } : undefined,
        orderBy: { startedAt: "desc" },
        take: limit,
      });
      return rows.map(mapSupport);
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const state = await loadState();
  return (state.supportSessions ?? [])
    .filter((x) => !filter.tenantId || x.tenantId === filter.tenantId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit);
}

export async function saveSupportSession(row: SupportAccessSession): Promise<SupportAccessSession> {
  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const data = {
        tenantId: row.tenantId,
        actorUserId: row.actorUserId,
        reason: row.reason,
        startedAt: new Date(row.startedAt),
        expiresAt: new Date(row.expiresAt),
        endedAt: row.endedAt ? new Date(row.endedAt) : null,
        endedBy: row.endedBy,
      };
      return mapSupport(
        await getPrisma().supportAccessSession.upsert({ where: { id: row.id }, create: { id: row.id, ...data }, update: data })
      );
    } catch (e) {
      dbFailClosed(e);
    }
  }
  return mutate((state) => {
    const list = state.supportSessions ?? [];
    const idx = list.findIndex((x) => x.id === row.id);
    if (idx >= 0) list[idx] = row;
    else list.unshift(row);
    state.supportSessions = list;
    return row;
  });
}

export { EMPTY as EMPTY_PLATFORM_STATE };
