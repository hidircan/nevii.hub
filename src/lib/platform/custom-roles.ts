import { z } from "zod";
import { fail, ok } from "../services/result";
import type { ServiceContext } from "../services/context";
import { uid } from "../utils";
import { requireHyperAdmin } from "./access";
import { appendPlatformAudit, getPlatformTenant, listBranchAccess } from "./store";
import { listRoleAssignments, listTenantRoles, saveRoleAssignment, saveTenantRole } from "./store-ext";
import { diffGrants, validateCustomRole, type Grant } from "./permission-matrix";
import { listTenantMembers } from "./users-admin";
import type { TenantCustomRole } from "./types";

/**
 * Kurum özel rolleri — yalnız HYPER_ADMIN yönetir (V1). Grant'ler tenant /
 * branch / assigned / own kapsamlıdır; platform kapsamı ve platform-only
 * kaynaklar reddedilir. Özel rol, kullanıcının sistem rolüne EK grant verir
 * ve NeviiOS resolver'ı (`resolveGrants`) üzerinden uygulanır.
 */

async function audit(ctx: ServiceContext, tenantId: string, action: string, entityId: string, before: unknown, after: unknown) {
  await appendPlatformAudit({
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    actorTenantId: ctx.tenantId,
    targetTenantId: tenantId,
    action,
    entityType: "TenantCustomRole",
    entityId,
    before: (before ?? null) as never,
    after: (after ?? null) as never,
    requestId: ctx.requestId || "n/a",
    outcome: "success",
  });
}

async function gate(ctx: ServiceContext, tenantId: string) {
  const g = requireHyperAdmin(ctx);
  if (!g.ok) return g;
  if (!(await getPlatformTenant(tenantId))) return fail("NOT_FOUND", "Kurum bulunamadı");
  return ok(true as const);
}

const grantSchema = z.object({ resource: z.string(), action: z.string(), scope: z.string() });
const roleSchema = z.object({
  id: z.string().optional(),
  key: z.string().trim(),
  label: z.string().trim().min(2).max(60),
  grants: z.array(grantSchema).max(300),
  confirm: z.boolean().optional(),
});

export async function listCustomRoles(ctx: ServiceContext, tenantId: string) {
  const g = await gate(ctx, tenantId);
  if (!g.ok) return g;
  const [roles, assignments] = await Promise.all([listTenantRoles(tenantId), listRoleAssignments(tenantId)]);
  return ok({
    roles: roles.map((r) => ({ ...r, assignedUsers: assignments.filter((a) => a.roleId === r.id).map((a) => a.userId) })),
  });
}

export async function previewCustomRole(ctx: ServiceContext, tenantId: string, input: unknown) {
  const g = await gate(ctx, tenantId);
  if (!g.ok) return g;
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Geçersiz rol", parsed.error.flatten());
  const grants = parsed.data.grants as Grant[];
  const invalid = validateCustomRole({ key: parsed.data.key, grants });
  if (invalid) return fail("VALIDATION_ERROR", invalid);
  const roles = await listTenantRoles(tenantId);
  const existing = parsed.data.id ? roles.find((r) => r.id === parsed.data.id) : undefined;
  if (parsed.data.id && !existing) return fail("NOT_FOUND", "Rol bulunamadı");
  if (roles.some((r) => r.key === parsed.data.key && r.id !== parsed.data.id)) return fail("CONFLICT", "Bu anahtarla bir rol zaten var.");
  const assignments = existing ? await listRoleAssignments(tenantId, { roleId: existing.id }) : [];
  const access = await listBranchAccess(tenantId);
  const diff = diffGrants((existing?.grants as Grant[]) ?? [], grants);
  return ok({
    impact: {
      affectedUsers: assignments.length,
      affectedBranches: [...new Set(access.filter((a) => assignments.some((x) => x.userId === a.userId)).map((a) => a.branchId))],
      added: diff.added,
      removed: diff.removed,
      screensOpened: diff.opened,
      screensClosed: diff.closed,
      risks: diff.risks,
    },
  });
}

export async function saveCustomRole(ctx: ServiceContext, tenantId: string, input: unknown) {
  const preview = await previewCustomRole(ctx, tenantId, input);
  if (!preview.ok) return preview;
  const parsed = roleSchema.parse(input);
  if (parsed.confirm !== true) return fail("VALIDATION_ERROR", "Rol değişikliği için etki önizlemesini onaylayın.", { requiresConfirm: true, impact: preview.data.impact });
  const roles = await listTenantRoles(tenantId);
  const existing = parsed.id ? roles.find((r) => r.id === parsed.id) : undefined;
  const now = new Date().toISOString();
  const row: TenantCustomRole = {
    id: existing?.id ?? uid("trole"),
    tenantId,
    key: parsed.key,
    label: parsed.label,
    grants: parsed.grants,
    createdBy: existing?.createdBy ?? ctx.userId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    archivedAt: null,
  };
  await saveTenantRole(row);
  await audit(ctx, tenantId, existing ? "platform.role.update" : "platform.role.create", row.id, existing ?? null, { ...row, impact: preview.data.impact });
  return ok({ role: row, impact: preview.data.impact });
}

export async function archiveCustomRole(ctx: ServiceContext, tenantId: string, input: unknown) {
  const g = await gate(ctx, tenantId);
  if (!g.ok) return g;
  const id = z.object({ id: z.string().min(1) }).safeParse(input);
  if (!id.success) return fail("VALIDATION_ERROR", "Rol gerekli");
  const role = (await listTenantRoles(tenantId)).find((r) => r.id === id.data.id);
  if (!role) return fail("NOT_FOUND", "Rol bulunamadı");
  const archived = { ...role, archivedAt: new Date().toISOString() };
  await saveTenantRole(archived);
  await audit(ctx, tenantId, "platform.role.archive", role.id, role, archived);
  return ok({ role: archived });
}

const assignSchema = z.object({ userId: z.string().min(1), roleId: z.string().min(1) });

export async function assignCustomRole(ctx: ServiceContext, tenantId: string, input: unknown) {
  const g = await gate(ctx, tenantId);
  if (!g.ok) return g;
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Kullanıcı ve rol gerekli");
  const role = (await listTenantRoles(tenantId)).find((r) => r.id === parsed.data.roleId && !r.archivedAt);
  if (!role) return fail("NOT_FOUND", "Rol bu kurumda bulunamadı");
  const member = (await listTenantMembers(tenantId)).find((m) => m.id === parsed.data.userId);
  if (!member) return fail("NOT_FOUND", "Kullanıcı bu kurumda bulunamadı");
  const existing = await listRoleAssignments(tenantId, parsed.data);
  if (existing.length) return ok({ assignment: existing[0] });
  const row = await saveRoleAssignment({
    id: uid("ura"),
    tenantId,
    userId: parsed.data.userId,
    roleId: role.id,
    createdBy: ctx.userId,
    createdAt: new Date().toISOString(),
    revokedAt: null,
  });
  await audit(ctx, tenantId, "platform.role.assign", row.id, null, { userId: row.userId, roleKey: role.key });
  return ok({ assignment: row });
}

export async function unassignCustomRole(ctx: ServiceContext, tenantId: string, input: unknown) {
  const g = await gate(ctx, tenantId);
  if (!g.ok) return g;
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Kullanıcı ve rol gerekli");
  const rows = await listRoleAssignments(tenantId, parsed.data);
  if (!rows.length) return fail("NOT_FOUND", "Atama yok");
  for (const r of rows) await saveRoleAssignment({ ...r, revokedAt: new Date().toISOString() });
  await audit(ctx, tenantId, "platform.role.unassign", rows[0]!.id, { userId: parsed.data.userId, roleId: parsed.data.roleId }, null);
  return ok({ revoked: rows.length });
}
