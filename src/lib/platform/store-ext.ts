import { isDbMode } from "../config";
import { uid } from "../utils";
import { dbFailClosed, mutatePlatformState, readPlatformState } from "./store";
import type {
  DeploymentRecord,
  JsonValue,
  PasswordResetRecord,
  ReleaseManifest,
  UserSessionRecord,
  PolicyVersion,
  TenantCustomRole,
  UserLifecycleState,
  UserRoleAssignment,
} from "./types";

/**
 * NeviiOS tur 2 koleksiyonları — json/memory ve PostgreSQL parity.
 * db modunda Prisma hatası JSON'a düşmez (dbFailClosed).
 */

async function prisma() {
  const { getPrisma } = await import("../db");
  return getPrisma();
}
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

// ───────────── Kullanıcı yaşam döngüsü ─────────────

export async function getUserLifecycle(userId: string): Promise<UserLifecycleState | null> {
  if (isDbMode) {
    try {
      const row = await (await prisma()).user.findUnique({
        where: { id: userId },
        select: { id: true, tenantId: true, active: true, deletedAt: true, sessionsRevokedAt: true, displayName: true, updatedAt: true },
      });
      if (!row) return null;
      return {
        userId: row.id,
        tenantId: row.tenantId,
        status: row.deletedAt ? "deleted" : row.active ? "active" : "deactivated",
        sessionsRevokedAt: iso(row.sessionsRevokedAt),
        displayName: row.displayName,
        updatedAt: row.updatedAt.toISOString(),
        updatedBy: "db",
      };
    } catch (e) {
      dbFailClosed(e);
    }
  }
  return (await readPlatformState()).userStates?.find((u) => u.userId === userId) ?? null;
}

export async function listUserLifecycles(tenantId?: string): Promise<UserLifecycleState[]> {
  const all = (await readPlatformState()).userStates ?? [];
  return tenantId ? all.filter((u) => u.tenantId === tenantId) : all;
}

/** json/memory overlay yazımı; db modunda User kolonları güncellenir. */
export async function saveUserLifecycle(state: UserLifecycleState): Promise<void> {
  if (isDbMode) {
    try {
      await (await prisma()).user.update({
        where: { id: state.userId },
        data: {
          active: state.status === "active",
          deletedAt: state.status === "deleted" ? new Date(state.updatedAt) : null,
          sessionsRevokedAt: state.sessionsRevokedAt ? new Date(state.sessionsRevokedAt) : null,
          displayName: state.displayName,
        },
      });
      return;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  await mutatePlatformState((s) => {
    const list = s.userStates ?? [];
    const idx = list.findIndex((u) => u.userId === state.userId);
    if (idx >= 0) list[idx] = state;
    else list.push(state);
    s.userStates = list;
  });
}

// ───────────── Politika sürümleri ─────────────

function mapPolicy(r: {
  id: string;
  scopeId: string;
  key: string;
  version: number;
  status: string;
  value: unknown;
  reason: string;
  createdBy: string;
  createdAt: Date;
  publishedBy: string | null;
  publishedAt: Date | null;
  rollbackOfVersion: number | null;
}): PolicyVersion {
  return {
    ...r,
    status: r.status as PolicyVersion["status"],
    value: r.value as JsonValue,
    createdAt: r.createdAt.toISOString(),
    publishedAt: iso(r.publishedAt),
  };
}

export async function listPolicyVersions(scopeId: string, key?: string): Promise<PolicyVersion[]> {
  if (isDbMode) {
    try {
      const rows = await (await prisma()).policyVersion.findMany({
        where: { scopeId, ...(key ? { key } : {}) },
        orderBy: [{ key: "asc" }, { version: "desc" }],
      });
      return rows.map(mapPolicy);
    } catch (e) {
      dbFailClosed(e);
    }
  }
  return ((await readPlatformState()).policyVersions ?? [])
    .filter((v) => v.scopeId === scopeId && (!key || v.key === key))
    .sort((a, b) => a.key.localeCompare(b.key) || b.version - a.version);
}

export async function savePolicyVersion(row: PolicyVersion): Promise<PolicyVersion> {
  if (isDbMode) {
    try {
      const data = {
        scopeId: row.scopeId,
        key: row.key,
        version: row.version,
        status: row.status,
        value: row.value as object,
        reason: row.reason,
        createdBy: row.createdBy,
        publishedBy: row.publishedBy,
        publishedAt: row.publishedAt ? new Date(row.publishedAt) : null,
        rollbackOfVersion: row.rollbackOfVersion,
      };
      return mapPolicy(
        await (await prisma()).policyVersion.upsert({ where: { id: row.id }, create: { id: row.id, ...data }, update: data })
      );
    } catch (e) {
      dbFailClosed(e);
    }
  }
  return mutatePlatformState((s) => {
    const list = s.policyVersions ?? [];
    const idx = list.findIndex((v) => v.id === row.id);
    if (idx >= 0) list[idx] = row;
    else list.push(row);
    s.policyVersions = list;
    return row;
  });
}

export function newPolicyVersionId(): string {
  return uid("pver");
}

// ───────────── Kurum özel rolleri ─────────────

function mapRole(r: {
  id: string;
  tenantId: string;
  key: string;
  label: string;
  grants: unknown;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}): TenantCustomRole {
  return {
    ...r,
    grants: (Array.isArray(r.grants) ? r.grants : []) as TenantCustomRole["grants"],
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    archivedAt: iso(r.archivedAt),
  };
}

export async function listTenantRoles(tenantId: string): Promise<TenantCustomRole[]> {
  if (isDbMode) {
    try {
      return (await (await prisma()).tenantCustomRole.findMany({ where: { tenantId }, orderBy: { key: "asc" } })).map(mapRole);
    } catch (e) {
      dbFailClosed(e);
    }
  }
  return ((await readPlatformState()).tenantRoles ?? []).filter((r) => r.tenantId === tenantId);
}

export async function saveTenantRole(row: TenantCustomRole): Promise<TenantCustomRole> {
  if (isDbMode) {
    try {
      const data = {
        tenantId: row.tenantId,
        key: row.key,
        label: row.label,
        grants: row.grants as object,
        createdBy: row.createdBy,
        archivedAt: row.archivedAt ? new Date(row.archivedAt) : null,
      };
      return mapRole(
        await (await prisma()).tenantCustomRole.upsert({ where: { id: row.id }, create: { id: row.id, ...data }, update: data })
      );
    } catch (e) {
      dbFailClosed(e);
    }
  }
  return mutatePlatformState((s) => {
    const list = s.tenantRoles ?? [];
    const idx = list.findIndex((r) => r.id === row.id);
    if (idx >= 0) list[idx] = row;
    else list.push(row);
    s.tenantRoles = list;
    return row;
  });
}

export async function listRoleAssignments(tenantId: string, filter?: { userId?: string; roleId?: string }): Promise<UserRoleAssignment[]> {
  if (isDbMode) {
    try {
      const rows = await (await prisma()).userRoleAssignment.findMany({
        where: { tenantId, revokedAt: null, ...(filter?.userId ? { userId: filter.userId } : {}), ...(filter?.roleId ? { roleId: filter.roleId } : {}) },
      });
      return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), revokedAt: iso(r.revokedAt) }));
    } catch (e) {
      dbFailClosed(e);
    }
  }
  return ((await readPlatformState()).roleAssignments ?? []).filter(
    (a) =>
      a.tenantId === tenantId &&
      !a.revokedAt &&
      (!filter?.userId || a.userId === filter.userId) &&
      (!filter?.roleId || a.roleId === filter.roleId)
  );
}

export async function saveRoleAssignment(row: UserRoleAssignment): Promise<UserRoleAssignment> {
  if (isDbMode) {
    try {
      const data = { tenantId: row.tenantId, userId: row.userId, roleId: row.roleId, createdBy: row.createdBy, revokedAt: row.revokedAt ? new Date(row.revokedAt) : null };
      const saved = await (await prisma()).userRoleAssignment.upsert({ where: { id: row.id }, create: { id: row.id, ...data }, update: data });
      return { ...saved, createdAt: saved.createdAt.toISOString(), revokedAt: iso(saved.revokedAt) };
    } catch (e) {
      dbFailClosed(e);
    }
  }
  return mutatePlatformState((s) => {
    const list = s.roleAssignments ?? [];
    const idx = list.findIndex((a) => a.id === row.id);
    if (idx >= 0) list[idx] = row;
    else list.push(row);
    s.roleAssignments = list;
    return row;
  });
}

// ───────────── Şifre sıfırlama ─────────────

export async function savePasswordReset(row: PasswordResetRecord): Promise<void> {
  if (isDbMode) {
    try {
      const data = {
        tenantId: row.tenantId,
        userId: row.userId,
        tokenHash: row.tokenHash,
        expiresAt: new Date(row.expiresAt),
        usedAt: row.usedAt ? new Date(row.usedAt) : null,
        createdBy: row.createdBy,
      };
      await (await prisma()).passwordResetToken.upsert({ where: { id: row.id }, create: { id: row.id, ...data }, update: data });
      return;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  await mutatePlatformState((s) => {
    const list = s.passwordResets ?? [];
    const idx = list.findIndex((r) => r.id === row.id);
    if (idx >= 0) list[idx] = row;
    else list.push(row);
    s.passwordResets = list;
  });
}

export async function getPasswordReset(id: string): Promise<PasswordResetRecord | null> {
  if (isDbMode) {
    try {
      const r = await (await prisma()).passwordResetToken.findUnique({ where: { id } });
      return r ? { ...r, expiresAt: r.expiresAt.toISOString(), usedAt: iso(r.usedAt), createdAt: r.createdAt.toISOString() } : null;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  return ((await readPlatformState()).passwordResets ?? []).find((r) => r.id === id) ?? null;
}

// ───────────── Oturumlar (NeviiOS tur 3) ─────────────

function mapSession(r: {
  id: string;
  userId: string;
  tenantId: string;
  role: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedBy: string | null;
  revokeReason: string | null;
  device: string | null;
  lastPath: string | null;
  lastAction: string | null;
}): UserSessionRecord {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    lastSeenAt: r.lastSeenAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    revokedAt: iso(r.revokedAt),
  };
}

export async function getUserSession(id: string): Promise<UserSessionRecord | null> {
  if (isDbMode) {
    try {
      const r = await (await prisma()).userSession.findUnique({ where: { id } });
      return r ? mapSession(r) : null;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  return ((await readPlatformState()).sessions ?? []).find((s) => s.id === id) ?? null;
}

export async function listUserSessions(filter?: { userId?: string; openOnly?: boolean }): Promise<UserSessionRecord[]> {
  const now = new Date();
  if (isDbMode) {
    try {
      const rows = await (await prisma()).userSession.findMany({
        where: {
          ...(filter?.userId ? { userId: filter.userId } : {}),
          ...(filter?.openOnly ? { revokedAt: null, expiresAt: { gt: now } } : {}),
        },
        orderBy: { lastSeenAt: "desc" },
        take: 2000,
      });
      return rows.map(mapSession);
    } catch (e) {
      dbFailClosed(e);
    }
  }
  return ((await readPlatformState()).sessions ?? [])
    .filter(
      (s) =>
        (!filter?.userId || s.userId === filter.userId) &&
        (!filter?.openOnly || (!s.revokedAt && new Date(s.expiresAt) > now))
    )
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

export async function saveUserSession(row: UserSessionRecord): Promise<void> {
  if (isDbMode) {
    try {
      const data = {
        userId: row.userId,
        tenantId: row.tenantId,
        role: row.role,
        lastSeenAt: new Date(row.lastSeenAt),
        expiresAt: new Date(row.expiresAt),
        revokedAt: row.revokedAt ? new Date(row.revokedAt) : null,
        revokedBy: row.revokedBy,
        revokeReason: row.revokeReason,
        device: row.device,
        lastPath: row.lastPath,
        lastAction: row.lastAction,
      };
      await (await prisma()).userSession.upsert({
        where: { id: row.id },
        create: { id: row.id, createdAt: new Date(row.createdAt), ...data },
        update: data,
      });
      return;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  await mutatePlatformState((s) => {
    const list = s.sessions ?? [];
    const idx = list.findIndex((x) => x.id === row.id);
    if (idx >= 0) list[idx] = row;
    else list.push(row);
    s.sessions = list;
  });
}

/**
 * Yalnız AÇIK (revokedAt=null) satırı kısmen günceller — presence/refresh
 * yazımı eşzamanlı bir sonlandırmayı asla ezmez (oku-yaz yarışı yok).
 */
export async function patchOpenUserSession(
  id: string,
  patch: Partial<Pick<UserSessionRecord, "lastSeenAt" | "expiresAt" | "lastPath" | "lastAction">>
): Promise<boolean> {
  if (isDbMode) {
    try {
      const data = {
        ...(patch.lastSeenAt ? { lastSeenAt: new Date(patch.lastSeenAt) } : {}),
        ...(patch.expiresAt ? { expiresAt: new Date(patch.expiresAt) } : {}),
        ...(patch.lastPath !== undefined ? { lastPath: patch.lastPath } : {}),
        ...(patch.lastAction !== undefined ? { lastAction: patch.lastAction } : {}),
      };
      return (await (await prisma()).userSession.updateMany({ where: { id, revokedAt: null }, data })).count === 1;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  return mutatePlatformState((s) => {
    const row = (s.sessions ?? []).find((x) => x.id === id);
    if (!row || row.revokedAt) return false;
    Object.assign(row, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
    return true;
  });
}

/** Satırı iptal eder (zaten iptalse dokunmaz). Önceki durumu döner. */
export async function revokeUserSessionRow(id: string, by: string, reason: string): Promise<UserSessionRecord | null> {
  const now = new Date();
  if (isDbMode) {
    try {
      const p = await prisma();
      const before = await p.userSession.findUnique({ where: { id } });
      if (!before) return null;
      await p.userSession.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: now, revokedBy: by, revokeReason: reason } });
      return mapSession(before);
    } catch (e) {
      dbFailClosed(e);
    }
  }
  return mutatePlatformState((s) => {
    const row = (s.sessions ?? []).find((x) => x.id === id);
    if (!row) return null;
    const before = { ...row };
    if (!row.revokedAt) Object.assign(row, { revokedAt: now.toISOString(), revokedBy: by, revokeReason: reason });
    return before;
  });
}

/** Retention: yalnız kapanmış (iptal/süresi dolmuş) ve kesme tarihinden eski oturum kayıtları. */
export async function deleteClosedSessionsBefore(cutoff: Date, dryRun: boolean): Promise<number> {
  const now = new Date();
  if (isDbMode) {
    try {
      const where = {
        lastSeenAt: { lt: cutoff },
        OR: [{ revokedAt: { not: null } }, { expiresAt: { lt: now } }],
      };
      const p = await prisma();
      return dryRun ? p.userSession.count({ where }) : (await p.userSession.deleteMany({ where })).count;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const match = (s: UserSessionRecord) =>
    new Date(s.lastSeenAt) < cutoff && (s.revokedAt !== null || new Date(s.expiresAt) < now);
  if (dryRun) return ((await readPlatformState()).sessions ?? []).filter(match).length;
  return mutatePlatformState((s) => {
    const before = (s.sessions ?? []).length;
    s.sessions = (s.sessions ?? []).filter((x) => !match(x));
    return before - s.sessions.length;
  });
}

/** Retention: kullanılmış/süresi dolmuş şifre sıfırlama bağlantıları. */
export async function deleteStalePasswordResetsBefore(cutoff: Date, dryRun: boolean): Promise<number> {
  if (isDbMode) {
    try {
      const where = { createdAt: { lt: cutoff }, OR: [{ usedAt: { not: null } }, { expiresAt: { lt: new Date() } }] };
      const p = await prisma();
      return dryRun ? p.passwordResetToken.count({ where }) : (await p.passwordResetToken.deleteMany({ where })).count;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  const now = Date.now();
  const match = (r: PasswordResetRecord) => new Date(r.createdAt) < cutoff && (r.usedAt !== null || new Date(r.expiresAt).getTime() < now);
  if (dryRun) return ((await readPlatformState()).passwordResets ?? []).filter(match).length;
  return mutatePlatformState((s) => {
    const before = (s.passwordResets ?? []).length;
    s.passwordResets = (s.passwordResets ?? []).filter((x) => !match(x));
    return before - s.passwordResets.length;
  });
}

// ───────────── Release / deployment kayıtları ─────────────

export async function listReleases(): Promise<ReleaseManifest[]> {
  if (isDbMode) {
    try {
      const rows = await (await prisma()).platformRelease.findMany({ orderBy: { publishedAt: "desc" }, take: 500 });
      return rows.map((r) => r.manifest as unknown as ReleaseManifest);
    } catch (e) {
      dbFailClosed(e);
    }
  }
  return [...((await readPlatformState()).releases ?? [])].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export async function saveRelease(row: ReleaseManifest): Promise<ReleaseManifest> {
  if (isDbMode) {
    try {
      const data = {
        product: row.product,
        version: row.version,
        environment: row.environment,
        commitSha: row.commit.sha,
        publishedAt: new Date(row.publishedAt),
        manifest: row as unknown as object,
      };
      await (await prisma()).platformRelease.upsert({ where: { id: row.id }, create: { id: row.id, ...data }, update: data });
      return row;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  return mutatePlatformState((s) => {
    const list = s.releases ?? [];
    const idx = list.findIndex((x) => x.id === row.id);
    if (idx >= 0) list[idx] = row;
    else list.push(row);
    s.releases = list;
    return row;
  });
}

export async function listDeployments(): Promise<DeploymentRecord[]> {
  if (isDbMode) {
    try {
      const rows = await (await prisma()).platformDeployment.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
      return rows.map((r) => ({
        id: r.id,
        product: r.product as DeploymentRecord["product"],
        provider: r.provider as DeploymentRecord["provider"],
        environment: r.environment as DeploymentRecord["environment"],
        url: r.url,
        commitSha: r.commitSha,
        branch: r.branch,
        status: r.status as DeploymentRecord["status"],
        releaseId: r.releaseId,
        createdAt: r.createdAt.toISOString(),
        recordedBy: r.recordedBy,
        source: r.source as DeploymentRecord["source"],
      }));
    } catch (e) {
      dbFailClosed(e);
    }
  }
  return [...((await readPlatformState()).deployments ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveDeployment(row: DeploymentRecord): Promise<DeploymentRecord> {
  if (isDbMode) {
    try {
      const { id, createdAt, ...rest } = row;
      await (await prisma()).platformDeployment.upsert({
        where: { id },
        create: { id, createdAt: new Date(createdAt), ...rest },
        update: rest,
      });
      return row;
    } catch (e) {
      dbFailClosed(e);
    }
  }
  return mutatePlatformState((s) => {
    const list = s.deployments ?? [];
    const idx = list.findIndex((x) => x.id === row.id);
    if (idx >= 0) list[idx] = row;
    else list.push(row);
    s.deployments = list;
    return row;
  });
}
