import { z } from "zod";
import { fail, ok, type ServiceResult } from "../services/result";
import type { ServiceContext } from "../services/context";
import type { AppRole } from "../auth/types";
import { permissionsForRole, type Permission } from "../auth/rbac";
import { listBootstrapUsersForTenant } from "../auth/users";
import { isDbMode } from "../config";
import { runWithTenantAsync } from "../tenant-context";
import { readData } from "../store";
import { requireHyperAdmin } from "./access";
import { appendPlatformAudit, getPlatformTenant, grantBranchAccess, listBranchAccess, revokeBranchAccess } from "./store";
import { redactSecrets } from "./secrets";

/**
 * NeviiOS kurum kullanıcı yönetimi — yalnız HYPER_ADMIN (platform API).
 * Kurumlar arası işlem her zaman açık `tenantId` ile yapılır; hedef kullanıcı
 * o tenant'a ait değilse NOT_FOUND (varlık sızdırılmaz).
 */

/** NeviiOS'tan atanabilen roller. HYPER_ADMIN / AI_AGENT / TEACHER / STUDENT ASLA. */
export const ASSIGNABLE_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "BRANCH_MANAGER"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const DB_ONLY_USER_WRITE_MESSAGE =
  "Kullanıcı rolü yalnız STORE_MODE=db ile kalıcı değiştirilir. json/memory modunda demo hesapları koddadır.";

export type TenantMember = {
  id: string;
  email: string;
  role: AppRole;
  active: boolean;
  branchIds: string[];
};

async function audit(
  ctx: ServiceContext,
  action: string,
  entityType: string,
  entityId: string,
  tenantId: string,
  before: unknown,
  after: unknown
) {
  await appendPlatformAudit({
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    actorTenantId: ctx.tenantId,
    targetTenantId: tenantId,
    action,
    entityType,
    entityId,
    before: redactSecrets(before ?? null) as never,
    after: redactSecrets(after ?? null) as never,
    requestId: ctx.requestId || "n/a",
    outcome: "success",
  });
}

export async function listTenantMembers(tenantId: string): Promise<TenantMember[]> {
  const access = await listBranchAccess(tenantId);
  const branchesOf = (userId: string) => access.filter((a) => a.userId === userId).map((a) => a.branchId);
  if (isDbMode) {
    const { getPrisma } = await import("../db");
    const rows = await getPrisma().user.findMany({
      where: { tenantId },
      select: { id: true, email: true, role: true, active: true },
      orderBy: { email: "asc" },
    });
    return rows
      .filter((r) => r.role !== "HYPER_ADMIN")
      .map((r) => ({ id: r.id, email: r.email, role: r.role as AppRole, active: r.active, branchIds: branchesOf(r.id) }));
  }
  return listBootstrapUsersForTenant(tenantId)
    .filter((u) => u.role !== "HYPER_ADMIN")
    .map((u) => ({ id: u.id, email: u.email, role: u.role, active: true, branchIds: branchesOf(u.id) }));
}

async function tenantBranchIds(tenantId: string): Promise<string[]> {
  try {
    const data = await runWithTenantAsync(tenantId, () => readData());
    return data.settings.branches.map((b) => b.id);
  } catch {
    return [];
  }
}

async function loadTarget(tenantId: string, userId: string): Promise<ServiceResult<TenantMember>> {
  const member = (await listTenantMembers(tenantId)).find((m) => m.id === userId);
  if (!member) return fail("NOT_FOUND", "Kullanıcı bu kurumda bulunamadı");
  return ok(member);
}

const FINANCE_PERMISSIONS: Permission[] = ["payments:write", "export:institution"];

export type RoleImpact = {
  userId: string;
  fromRole: AppRole;
  toRole: AssignableRole;
  addedPermissions: Permission[];
  removedPermissions: Permission[];
  warnings: string[];
  blockers: string[];
};

function computeImpact(member: TenantMember, toRole: AssignableRole, members: TenantMember[]): RoleImpact {
  const from = new Set(permissionsForRole(member.role));
  const to = new Set(permissionsForRole(toRole));
  const added = [...to].filter((p) => !from.has(p)).sort();
  const removed = [...from].filter((p) => !to.has(p)).sort();
  const warnings: string[] = [];
  const blockers: string[] = [];
  if (!(ASSIGNABLE_ROLES as readonly string[]).includes(member.role)) {
    blockers.push(`${member.role} rolü varlık bağlantılıdır (öğretmen/öğrenci/sistem); NeviiOS'tan değiştirilemez.`);
  }
  if (member.role === "SUPER_ADMIN" && toRole !== "SUPER_ADMIN") {
    const owners = members.filter((m) => m.role === "SUPER_ADMIN" && m.active);
    if (owners.length <= 1) blockers.push("Kurumun son aktif kurum sahibi düşürülemez.");
  }
  if (FINANCE_PERMISSIONS.some((p) => added.includes(p))) warnings.push("Kurum geneli finans ve dışa aktarma erişimi kazanır.");
  if (FINANCE_PERMISSIONS.some((p) => removed.includes(p))) warnings.push("Kurum geneli finans ve dışa aktarma erişimini kaybeder.");
  if (toRole === "BRANCH_MANAGER" && member.branchIds.length === 0) {
    warnings.push("Şube ataması yok: şube müdürü hiçbir veri göremez (fail-closed). Şube erişimi atayın.");
  }
  if (toRole !== "BRANCH_MANAGER" && member.branchIds.length > 0) {
    warnings.push("Mevcut şube atamaları korunur ama kurum geneli rolde etkisizdir.");
  }
  warnings.push("Açık oturumlar en geç erişim token süresi (15 dk) sonunda yeni rolle yenilenir.");
  return { userId: member.id, fromRole: member.role, toRole, addedPermissions: added, removedPermissions: removed, warnings, blockers };
}

const roleChangeSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(ASSIGNABLE_ROLES),
  confirm: z.boolean().optional(),
});

export async function previewRoleChange(ctx: ServiceContext, tenantId: string, input: unknown) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  // HYPER_ADMIN atanamaz: şema yalnız ASSIGNABLE_ROLES kabul eder.
  const parsed = roleChangeSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Geçersiz rol (atanabilir: kurum sahibi, kurum yöneticisi, şube müdürü)", parsed.error.flatten());
  if (!(await getPlatformTenant(tenantId))) return fail("NOT_FOUND", "Kurum bulunamadı");
  const members = await listTenantMembers(tenantId);
  const member = members.find((m) => m.id === parsed.data.userId);
  if (!member) return fail("NOT_FOUND", "Kullanıcı bu kurumda bulunamadı");
  return ok({ impact: computeImpact(member, parsed.data.role, members) });
}

export async function assignRole(ctx: ServiceContext, tenantId: string, input: unknown) {
  const preview = await previewRoleChange(ctx, tenantId, input);
  if (!preview.ok) return preview;
  const { impact } = preview.data;
  const parsed = roleChangeSchema.parse(input);
  if (impact.blockers.length > 0) return fail("FORBIDDEN", impact.blockers.join(" "), { impact });
  if (impact.fromRole === impact.toRole) return ok({ impact, changed: false });
  if (parsed.confirm !== true) {
    return fail("VALIDATION_ERROR", "Rol değişikliği için etki önizlemesini onaylayın.", { requiresConfirm: true, impact });
  }
  if (!isDbMode) return fail("FORBIDDEN", DB_ONLY_USER_WRITE_MESSAGE);
  const { getPrisma } = await import("../db");
  // tenantId koşulu: yanlış tenant'taki aynı id asla güncellenmez.
  const res = await getPrisma().user.updateMany({
    where: { id: impact.userId, tenantId, role: impact.fromRole },
    data: { role: impact.toRole },
  });
  if (res.count !== 1) return fail("CONFLICT", "Kullanıcı eşzamanlı değişti; önizlemeyi yenileyin.");
  await audit(ctx, "platform.user.role_change", "User", impact.userId, tenantId, { role: impact.fromRole }, { role: impact.toRole, impact });
  return ok({ impact, changed: true });
}

const branchAccessSchema = z.object({ userId: z.string().min(1), branchId: z.string().min(1) });

export async function grantUserBranchAccess(ctx: ServiceContext, tenantId: string, input: unknown) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const parsed = branchAccessSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Geçersiz şube erişimi", parsed.error.flatten());
  if (!(await getPlatformTenant(tenantId))) return fail("NOT_FOUND", "Kurum bulunamadı");
  const target = await loadTarget(tenantId, parsed.data.userId);
  if (!target.ok) return target;
  // Başka kurumun şubesi atanamaz: şube hedef tenant'ın kendi verisinde olmalı.
  if (!(await tenantBranchIds(tenantId)).includes(parsed.data.branchId)) {
    return fail("NOT_FOUND", "Şube bu kurumda bulunamadı");
  }
  const row = await grantBranchAccess({ tenantId, userId: parsed.data.userId, branchId: parsed.data.branchId, grantedBy: ctx.userId });
  await audit(ctx, "platform.branch_access.grant", "UserBranchAccess", row.id, tenantId, null, {
    userId: row.userId,
    branchId: row.branchId,
  });
  return ok({ access: row });
}

export async function revokeUserBranchAccess(ctx: ServiceContext, tenantId: string, input: unknown) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const parsed = branchAccessSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Geçersiz şube erişimi", parsed.error.flatten());
  const target = await loadTarget(tenantId, parsed.data.userId);
  if (!target.ok) return target;
  const n = await revokeBranchAccess(tenantId, parsed.data.userId, parsed.data.branchId);
  if (n === 0) return fail("NOT_FOUND", "Aktif şube erişimi yok");
  await audit(ctx, "platform.branch_access.revoke", "UserBranchAccess", `${parsed.data.userId}:${parsed.data.branchId}`, tenantId, {
    userId: parsed.data.userId,
    branchId: parsed.data.branchId,
  }, null);
  return ok({ revoked: n });
}

export async function getTenantMembers(ctx: ServiceContext, tenantId: string) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const tenant = await getPlatformTenant(tenantId);
  if (!tenant) return fail("NOT_FOUND", "Kurum bulunamadı");
  const [members, branches] = await Promise.all([listTenantMembers(tenantId), tenantBranchNames(tenantId)]);
  return ok({ tenant, members, branches, writable: isDbMode });
}

async function tenantBranchNames(tenantId: string): Promise<{ id: string; name: string }[]> {
  try {
    const data = await runWithTenantAsync(tenantId, () => readData());
    return data.settings.branches.map((b) => ({ id: b.id, name: b.name }));
  } catch {
    return [];
  }
}

const inviteSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email("Geçerli bir e-posta girin"),
  phone: z.string().trim().max(32).optional(),
  role: z.enum(ASSIGNABLE_ROLES),
  branchIds: z.array(z.string().min(1)).max(50).optional(),
});

/**
 * Kurum kullanıcısı daveti (kurum sahibi / kurum yöneticisi / şube müdürü).
 * Şube müdürü en az bir şube ister; şubeler hedef kurumun kendi şubeleri
 * olmalı. Gerçek e-posta GÖNDERİLMEZ — tek seferlik bağlantı döner.
 */
export async function inviteTenantUser(ctx: ServiceContext, tenantId: string, input: unknown) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Geçersiz davet", parsed.error.flatten());
  const tenant = await getPlatformTenant(tenantId);
  if (!tenant) return fail("NOT_FOUND", "Kurum bulunamadı");
  if (tenant.lifecycle !== "active") return fail("FORBIDDEN", "Yalnız aktif kuruma kullanıcı davet edilir.");
  const branchIds = [...new Set(parsed.data.branchIds ?? [])];
  if (parsed.data.role === "BRANCH_MANAGER") {
    if (branchIds.length === 0) return fail("VALIDATION_ERROR", "Şube müdürü için en az bir şube seçin.");
    const own = await tenantBranchIds(tenantId);
    if (branchIds.some((b) => !own.includes(b))) return fail("NOT_FOUND", "Şube bu kurumda bulunamadı");
  }
  const { issueOwnerInvitation } = await import("./provision");
  return issueOwnerInvitation(
    ctx,
    tenantId,
    { name: parsed.data.name, email: parsed.data.email, phone: parsed.data.phone },
    { role: parsed.data.role, branchIds: parsed.data.role === "BRANCH_MANAGER" ? branchIds : undefined }
  );
}
