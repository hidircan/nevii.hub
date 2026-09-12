import { fail, ok, type ServiceResult } from "../services/result";
import type { ServiceContext } from "../services/context";
import { hasGrant, systemGrantsForLoginRole, type Grant, type PermAction, type PermResource, type PermScope } from "./permission-matrix";
import { listRoleAssignments, listTenantRoles } from "./store-ext";
import { inBranchScope, resolveBranchScope } from "./branch-scope";

/**
 * Oturumun efektif grant'leri: sistem rolü + (yalnız tenant rolleri için)
 * aktif özel rol atamaları. Özel rol grant'leri kaydedilirken platform
 * kapsamı reddedilir; burada ayrıca filtrelenir (derinlemesine savunma).
 */
export async function resolveGrants(ctx: ServiceContext): Promise<Grant[]> {
  const base = systemGrantsForLoginRole(ctx.role);
  if (ctx.role === "HYPER_ADMIN" || ctx.role === "AI_AGENT") return base;
  const assignments = await listRoleAssignments(ctx.tenantId, { userId: ctx.userId });
  if (assignments.length === 0) return base;
  const roles = (await listTenantRoles(ctx.tenantId)).filter(
    (r) => !r.archivedAt && assignments.some((a) => a.roleId === r.id)
  );
  const custom = roles.flatMap((r) => r.grants as Grant[]).filter((x) => x.scope !== "platform");
  return [...base, ...custom];
}

export async function requireGrant(
  ctx: ServiceContext,
  resource: PermResource,
  action: PermAction,
  scope: PermScope
): Promise<ServiceResult<true>> {
  if (hasGrant(await resolveGrants(ctx), resource, action, scope)) return ok(true);
  return fail("FORBIDDEN", "Bu işlem için yetkiniz yok.", { resource, action, scope });
}

/**
 * BRANCH_MANAGER tool kapısı. Diğer rollerde davranış DEĞİŞMEZ (legacy
 * requireRole geçerli). Şube müdürü için: matrix grant'i (şube kapsamı) +
 * aktif UserBranchAccess + hedef kaydın şubesi kapsam içinde olmalı.
 */
export async function assertBranchOperation(
  ctx: ServiceContext,
  resource: PermResource,
  action: PermAction,
  branchId: string | null | undefined
): Promise<ServiceResult<true>> {
  if (ctx.role !== "BRANCH_MANAGER") return ok(true);
  const grant = await requireGrant(ctx, resource, action, "branch");
  if (!grant.ok) return grant;
  const scope = await resolveBranchScope(ctx);
  if (!scope.ok) return scope;
  if (!inBranchScope(scope.data, branchId)) return fail("FORBIDDEN", "Bu kayıt size atanmış şubelerin dışında.");
  return ok(true);
}
