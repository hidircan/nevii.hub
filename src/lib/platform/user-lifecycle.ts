import { z } from "zod";
import { fail, ok, type ServiceResult } from "../services/result";
import type { ServiceContext } from "../services/context";
import type { AppRole } from "../auth/types";
import { isDbMode } from "../config";
import { uid } from "../utils";
import { PLATFORM_TENANT_ID } from "../auth/config";
import { hashPasswordSync } from "../auth/password";
import { listBootstrapUsersForTenant } from "../auth/users";
import { invalidateSessionValidity } from "../auth/session-validity";
import { requireHyperAdmin } from "./access";
import {
  appendPlatformAudit,
  getInvitation,
  getPlatformTenant,
  listBranchAccess,
  listInvitations,
  listPlatformAudit,
  listPlatformTenants,
  saveInvitation,
} from "./store";
import { getPasswordReset, getUserLifecycle, listRoleAssignments, listUserLifecycles, savePasswordReset, saveUserLifecycle } from "./store-ext";
import { generateInviteToken, hashInviteToken, inviteTokenMatches, toPublicInvitation } from "./invitation";
import { resolveSetting } from "./resolve";
import type { PublicOwnerInvitation, UserLifecycleState } from "./types";

/**
 * NeviiOS kullanıcı yaşam döngüsü (yalnız HYPER_ADMIN, platform API).
 *
 * - Varsayılan silme SOFT'tur: kayıt, audit, tahsilat, sözleşme, yoklama
 *   ilişkileri korunur; giriş ve açık oturumlar hemen kesilir
 *   (sessionsRevokedAt + isSessionClaimValid).
 * - Hard delete yalnız hiç giriş yapmamış, varlık bağlantısı ve audit izi
 *   olmayan kullanıcıda ve yalnız db modunda.
 * - Kullanıcı kendini pasifleştiremez/silemez; son aktif HYPER_ADMIN ve bir
 *   kurumun son aktif kurum sahibi korunur.
 */

export type PlatformUserRow = {
  id: string;
  email: string;
  displayName: string | null;
  tenantId: string;
  tenantName: string;
  role: AppRole;
  status: UserLifecycleState["status"];
  branchIds: string[];
  customRoleCount: number;
  lastLoginAt: string | null;
  /** STUDENT (öğrenci/veli) portal erişimi; diğer roller için null. */
  portalAccess: "active" | "revoked" | "none" | null;
  kind: "user";
};

export type PlatformInviteRow = PublicOwnerInvitation & { tenantName: string; kind: "invitation" };

async function audit(ctx: ServiceContext, action: string, tenantId: string | null, entityId: string, before: unknown, after: unknown) {
  await appendPlatformAudit({
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    actorTenantId: ctx.tenantId,
    targetTenantId: tenantId,
    action,
    entityType: "User",
    entityId,
    before: (before ?? null) as never,
    after: (after ?? null) as never,
    requestId: ctx.requestId || "n/a",
    outcome: "success",
  });
}

type RawUser = {
  id: string;
  email: string;
  tenantId: string;
  role: AppRole;
  displayName: string | null;
  status: UserLifecycleState["status"];
  lastLoginAt: string | null;
  teacherId?: string | null;
  studentId?: string | null;
};

async function loadAllUsers(): Promise<RawUser[]> {
  if (isDbMode) {
    const { getPrisma } = await import("../db");
    const rows = await getPrisma().user.findMany({
      select: { id: true, email: true, tenantId: true, role: true, displayName: true, active: true, deletedAt: true, lastLoginAt: true, teacherId: true, studentId: true },
      orderBy: { email: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      tenantId: r.tenantId,
      role: r.role as AppRole,
      displayName: r.displayName,
      status: r.deletedAt ? "deleted" : r.active ? "active" : "deactivated",
      lastLoginAt: r.lastLoginAt?.toISOString() ?? null,
      teacherId: r.teacherId,
      studentId: r.studentId,
    }));
  }
  const tenants = [PLATFORM_TENANT_ID, ...(await listPlatformTenants()).map((t) => t.tenantId)];
  const states = new Map((await listUserLifecycles()).map((s) => [s.userId, s]));
  return tenants.flatMap((tid) =>
    listBootstrapUsersForTenant(tid).map((u) => ({
      id: u.id,
      email: u.email,
      tenantId: tid,
      role: u.role,
      displayName: states.get(u.id)?.displayName ?? null,
      status: states.get(u.id)?.status ?? "active",
      lastLoginAt: null,
      teacherId: u.teacherId,
      studentId: u.studentId,
    }))
  );
}

const filterSchema = z.object({
  q: z.string().trim().max(80).optional(),
  tenantId: z.string().optional(),
  role: z.string().optional(),
  branchId: z.string().optional(),
  status: z.enum(["active", "deactivated", "deleted", "all"]).optional(),
  invite: z.enum(["pending", "expired", "revoked", "used", "all", "none"]).optional(),
});

export async function listPlatformUsers(ctx: ServiceContext, rawFilter: unknown) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const filter = filterSchema.safeParse(rawFilter ?? {});
  if (!filter.success) return fail("VALIDATION_ERROR", "Geçersiz filtre");
  const f = filter.data;
  const tenants = await listPlatformTenants();
  const tenantName = new Map<string, string>([[PLATFORM_TENANT_ID, "NeviiHub Platform"], ...tenants.map((t) => [t.tenantId, t.name] as [string, string])]);
  const q = f.q?.toLocaleLowerCase("tr");
  const users = (await loadAllUsers()).filter((u) => !f.tenantId || u.tenantId === f.tenantId);
  const tenantIds = [...new Set(users.map((u) => u.tenantId))];
  const access = (await Promise.all(tenantIds.map((t) => listBranchAccess(t)))).flat();
  const customs = (await Promise.all(tenantIds.map((t) => listRoleAssignments(t)))).flat();
  const { listAccessForUser } = await import("../student-portal-access");

  const rows: PlatformUserRow[] = [];
  for (const u of users) {
    const branchIds = access.filter((a) => a.userId === u.id && a.tenantId === u.tenantId).map((a) => a.branchId);
    let portalAccess: PlatformUserRow["portalAccess"] = null;
    if (u.role === "STUDENT") {
      const list = await listAccessForUser(u.tenantId, u.id).catch(() => []);
      portalAccess = list.length === 0 ? "none" : list.some((r) => r.status !== "revoked") ? "active" : "revoked";
    }
    rows.push({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      tenantId: u.tenantId,
      tenantName: tenantName.get(u.tenantId) ?? u.tenantId,
      role: u.role,
      status: u.status,
      branchIds,
      customRoleCount: customs.filter((c) => c.userId === u.id).length,
      lastLoginAt: u.lastLoginAt,
      portalAccess,
      kind: "user",
    });
  }
  const status = f.status ?? "active";
  const filtered = rows.filter(
    (r) =>
      (status === "all" || r.status === status) &&
      (!f.role || r.role === f.role) &&
      (!f.branchId || r.branchIds.includes(f.branchId)) &&
      (!q || r.email.toLocaleLowerCase("tr").includes(q) || (r.displayName ?? "").toLocaleLowerCase("tr").includes(q))
  );
  const invites: PlatformInviteRow[] =
    f.invite === "none"
      ? []
      : (await listInvitations())
          .filter((i) => !f.tenantId || i.tenantId === f.tenantId)
          .map((i) => ({ ...toPublicInvitation(i), tenantName: tenantName.get(i.tenantId) ?? i.tenantId, kind: "invitation" as const }))
          // Varsayılan: yalnız bekleyen davetler; "all" hepsi; aksi halde istenen durum.
          .filter((i) => (f.invite === "all" ? true : i.status === (f.invite ?? "pending")))
          .filter((i) => !f.role || i.role === f.role)
          .filter((i) => !q || i.email.toLocaleLowerCase("tr").includes(q) || i.name.toLocaleLowerCase("tr").includes(q));
  return ok({
    users: filtered,
    invitations: invites,
    tenants: [{ tenantId: PLATFORM_TENANT_ID, name: "NeviiHub Platform" }, ...tenants.map((t) => ({ tenantId: t.tenantId, name: t.name }))],
    writable: isDbMode,
  });
}

// ───────────── Koruma kuralları ─────────────

async function findUser(userId: string): Promise<RawUser | null> {
  return (await loadAllUsers()).find((u) => u.id === userId) ?? null;
}

async function protectionError(ctx: ServiceContext, target: RawUser, op: "deactivate" | "delete"): Promise<string | null> {
  if (target.id === ctx.userId) return "Kullanıcı kendi hesabını pasifleştiremez veya silemez.";
  const all = await loadAllUsers();
  if (target.role === "HYPER_ADMIN") {
    // Yalnız HYPER_ADMIN buraya gelebilir (requireHyperAdmin); yine de son aktif platform sahibi korunur.
    const activeHyper = all.filter((u) => u.role === "HYPER_ADMIN" && u.status === "active");
    if (activeHyper.length <= 1) return "Son aktif platform sahibi (HYPER_ADMIN) pasifleştirilemez veya silinemez.";
  }
  if (target.role === "SUPER_ADMIN") {
    const owners = all.filter((u) => u.tenantId === target.tenantId && u.role === "SUPER_ADMIN" && u.status === "active");
    if (owners.length <= 1) return "Kurumun son aktif kurum sahibi pasifleştirilemez veya silinemez.";
  }
  void op;
  return null;
}

const reasonSchema = z.object({ userId: z.string().min(1), reason: z.string().trim().min(5, "Gerekçe en az 5 karakter").max(300), confirm: z.boolean().optional() });

async function setStatus(
  ctx: ServiceContext,
  input: unknown,
  status: UserLifecycleState["status"],
  action: string
): Promise<ServiceResult<{ userId: string; status: string }>> {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const parsed = reasonSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Geçersiz istek");
  const target = await findUser(parsed.data.userId);
  if (!target) return fail("NOT_FOUND", "Kullanıcı bulunamadı");
  if (status !== "active") {
    const blocked = await protectionError(ctx, target, status === "deleted" ? "delete" : "deactivate");
    if (blocked) return fail("FORBIDDEN", blocked);
  }
  if (parsed.data.confirm !== true) return fail("VALIDATION_ERROR", "İşlemi onaylayın.", { requiresConfirm: true });
  const prev = await getUserLifecycle(target.id);
  const now = new Date().toISOString();
  // JWT iat saniye hassasiyetinde: kesme anı bir sonraki saniye sınırına
  // yuvarlanır → bu ana kadar üretilmiş TÜM token'lar (aynı saniye dahil)
  // geçersiz. Yeniden aktifleştirme kesme anını geri almaz (eski token dirilmez).
  const cutoff = new Date(Math.ceil(Date.now() / 1000) * 1000).toISOString();
  await saveUserLifecycle({
    userId: target.id,
    tenantId: target.tenantId,
    status,
    sessionsRevokedAt: status === "active" ? (prev?.sessionsRevokedAt ?? null) : cutoff,
    displayName: prev?.displayName ?? target.displayName,
    updatedAt: now,
    updatedBy: ctx.userId,
  });
  if (status !== "active") {
    // Oturum kayıtları da kapanır (canlı operasyon listesi doğru sayar); token'lar zaten kesme anıyla geçersiz.
    const { closeAllUserSessions } = await import("../auth/session-registry");
    await closeAllUserSessions(target.id, ctx.userId, `status:${status}`).catch(() => 0);
  }
  invalidateSessionValidity(target.id);
  await audit(ctx, action, target.tenantId, target.id, { status: target.status }, { status, reason: parsed.data.reason });
  return ok({ userId: target.id, status });
}

export const deactivateUser = (ctx: ServiceContext, input: unknown) => setStatus(ctx, input, "deactivated", "platform.user.deactivate");
export const softDeleteUser = (ctx: ServiceContext, input: unknown) => setStatus(ctx, input, "deleted", "platform.user.soft_delete");
export const reactivateUser = (ctx: ServiceContext, input: unknown) => setStatus(ctx, input, "active", "platform.user.reactivate");

/** Yalnız hiç aktive olmamış, bağlantısız ve iz bırakmamış kullanıcı. */
export async function hardDeleteUser(ctx: ServiceContext, input: unknown) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const parsed = reasonSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Geçersiz istek");
  const target = await findUser(parsed.data.userId);
  if (!target) return fail("NOT_FOUND", "Kullanıcı bulunamadı");
  const blocked = await protectionError(ctx, target, "delete");
  if (blocked) return fail("FORBIDDEN", blocked);
  if (!isDbMode) return fail("FORBIDDEN", "json/memory demo hesapları koddadır; kalıcı silme yalnız STORE_MODE=db ile.");
  const reasons: string[] = [];
  if (target.lastLoginAt) reasons.push("kullanıcı en az bir kez giriş yapmış");
  if (target.teacherId || target.studentId) reasons.push("öğretmen/öğrenci kaydına bağlı");
  if (target.role === "HYPER_ADMIN") reasons.push("platform hesabı");
  if ((await listPlatformAudit({ limit: 2000 })).some((e) => e.actorUserId === target.id || e.entityId === target.id)) reasons.push("platform audit izi var");
  const { getPrisma: prismaForChecks } = await import("../db");
  // Finans/sözleşme/tahsilat/yoklama işlemleri kurum AuditLog'una aktör olarak yazılır.
  if ((await prismaForChecks().auditLog.count({ where: { actorUserId: target.id } })) > 0) reasons.push("kurum audit izi (finans/sözleşme/tahsilat/yoklama) var");
  const { listUserSessions } = await import("./store-ext");
  if ((await listUserSessions({ userId: target.id })).length > 0) reasons.push("oturum kaydı var (aktive olmuş)");
  if (reasons.length) return fail("FORBIDDEN", `Kalıcı silinemez (${reasons.join(", ")}). Soft delete kullanın.`);
  if (parsed.data.confirm !== true) return fail("VALIDATION_ERROR", "Kalıcı silmeyi onaylayın.", { requiresConfirm: true });
  const { getPrisma } = await import("../db");
  const prisma = getPrisma();
  await prisma.$transaction([
    prisma.userBranchAccess.deleteMany({ where: { userId: target.id, tenantId: target.tenantId } }),
    prisma.userRoleAssignment.deleteMany({ where: { userId: target.id, tenantId: target.tenantId } }),
    prisma.user.deleteMany({ where: { id: target.id, tenantId: target.tenantId, lastLoginAt: null } }),
  ]);
  invalidateSessionValidity(target.id);
  await audit(ctx, "platform.user.hard_delete", target.tenantId, target.id, { email: target.email, role: target.role }, { reason: parsed.data.reason });
  return ok({ deleted: true });
}

export async function setPortalAccess(ctx: ServiceContext, input: unknown) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const parsed = z.object({ userId: z.string().min(1), enabled: z.boolean() }).safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Geçersiz istek");
  const target = await findUser(parsed.data.userId);
  if (!target) return fail("NOT_FOUND", "Kullanıcı bulunamadı");
  if (target.role !== "STUDENT") return fail("VALIDATION_ERROR", "Portal erişimi yalnız öğrenci/veli hesaplarında yönetilir.");
  const { listAccessForUser, revokeStudentPortalAccess, activateStudentPortalAccess } = await import("../student-portal-access");
  const rows = await listAccessForUser(target.tenantId, target.id);
  if (rows.length === 0) return fail("NOT_FOUND", "Bu hesabın öğrenci bağlantısı yok.");
  for (const r of rows) {
    if (parsed.data.enabled) await activateStudentPortalAccess(target.tenantId, target.id, r.studentId);
    else await revokeStudentPortalAccess(target.tenantId, target.id, r.studentId);
  }
  await audit(ctx, parsed.data.enabled ? "platform.user.portal_enable" : "platform.user.portal_disable", target.tenantId, target.id, null, {
    students: rows.length,
  });
  return ok({ enabled: parsed.data.enabled, students: rows.length });
}

// ───────────── Davetler ─────────────

export async function revokeInvitation(ctx: ServiceContext, input: unknown) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const parsed = z.object({ invitationId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Davet gerekli");
  const inv = await getInvitation(parsed.data.invitationId);
  if (!inv) return fail("NOT_FOUND", "Davet bulunamadı");
  if (inv.usedAt) return fail("VALIDATION_ERROR", "Kullanılmış davet iptal edilemez.");
  if (inv.revokedAt) return ok({ invitation: toPublicInvitation(inv) });
  const next = { ...inv, revokedAt: new Date().toISOString() };
  await saveInvitation(next);
  await audit(ctx, "platform.user.invite_revoke", inv.tenantId, inv.id, null, { email: inv.email });
  return ok({ invitation: toPublicInvitation(next) });
}

/** Aynı kişi/rol/şubeyle yeni tek seferlik bağlantı üretir; eskisi iptal olur. E-posta gönderilmez. */
export async function resendInvitation(ctx: ServiceContext, input: unknown) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const parsed = z.object({ invitationId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Davet gerekli");
  const inv = await getInvitation(parsed.data.invitationId);
  if (!inv) return fail("NOT_FOUND", "Davet bulunamadı");
  if (inv.usedAt) return fail("VALIDATION_ERROR", "Kullanılmış davet yeniden gönderilemez.");
  const { issueOwnerInvitation } = await import("./provision");
  const role = (inv.role ?? "SUPER_ADMIN") as "SUPER_ADMIN" | "SCHOOL_ADMIN" | "BRANCH_MANAGER";
  const res = await issueOwnerInvitation(
    ctx,
    inv.tenantId,
    { name: inv.name, email: inv.email, phone: inv.phone ?? undefined },
    { role, branchIds: inv.branchIds ?? undefined }
  );
  if (!res.ok) return res;
  if (!inv.revokedAt) await saveInvitation({ ...inv, revokedAt: new Date().toISOString() });
  await audit(ctx, "platform.user.invite_resend", inv.tenantId, res.data.invitation.id, { previous: inv.id }, { email: inv.email });
  return res;
}

// ───────────── Şifre sıfırlama ─────────────

const RESET_TTL_MS = 60 * 60 * 1000;

/** Yönetici başlatır; tek kullanımlık, 1 saatlik bağlantı bir kez döner. Gönderim YAPILMAZ. */
export async function startPasswordReset(ctx: ServiceContext, input: unknown) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const parsed = z.object({ userId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Kullanıcı gerekli");
  const target = await findUser(parsed.data.userId);
  if (!target) return fail("NOT_FOUND", "Kullanıcı bulunamadı");
  if (target.status !== "active") return fail("VALIDATION_ERROR", "Pasif veya silinmiş kullanıcının şifresi sıfırlanamaz.");
  const raw = generateInviteToken();
  const id = uid("pwr");
  await savePasswordReset({
    id,
    tenantId: target.tenantId,
    userId: target.id,
    tokenHash: hashInviteToken(raw),
    expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString(),
    usedAt: null,
    createdBy: ctx.userId,
    createdAt: new Date().toISOString(),
  });
  await audit(ctx, "platform.user.password_reset_start", target.tenantId, target.id, null, { resetId: id });
  const params = new URLSearchParams({ reset: id, token: raw });
  return ok({ resetPath: `/sifre-sifirla?${params.toString()}`, expiresInMinutes: 60 });
}

/** Public — token hash + süre + tek kullanım; başarıda tüm oturumlar düşer. Şifre yanıt/audit'e yazılmaz. */
export async function completePasswordReset(input: unknown) {
  const parsed = z.object({ resetId: z.string().min(1), token: z.string().min(16), password: z.string().min(8).max(200) }).safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Geçersiz istek");
  const row = await getPasswordReset(parsed.data.resetId);
  if (!row || !inviteTokenMatches(parsed.data.token, row.tokenHash)) return fail("FORBIDDEN", "Bağlantı geçersiz.");
  if (row.usedAt) return fail("FORBIDDEN", "Bu bağlantı zaten kullanıldı.");
  if (new Date(row.expiresAt).getTime() <= Date.now()) return fail("FORBIDDEN", "Bağlantının süresi doldu.");
  const minLen = Number((await resolveSetting({ tenantId: row.tenantId }, "auth.passwordMinLength"))?.effectiveValue ?? 8);
  if (parsed.data.password.length < minLen) return fail("VALIDATION_ERROR", `Parola en az ${minLen} karakter olmalı.`);
  if (!isDbMode) return fail("FORBIDDEN", "json/memory modunda parola kalıcı değiştirilemez; bağlantı kullanılmadı.");
  const { getPrisma } = await import("../db");
  const prisma = getPrisma();
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.passwordResetToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
    if (claimed.count !== 1) throw new Error("reset_already_used");
    await tx.user.update({
      where: { id: row.userId },
      data: { passwordHash: hashPasswordSync(parsed.data.password), sessionsRevokedAt: now },
    });
  });
  invalidateSessionValidity(row.userId);
  await appendPlatformAudit({
    actorUserId: row.userId,
    actorRole: "self",
    actorTenantId: row.tenantId,
    targetTenantId: row.tenantId,
    action: "platform.user.password_reset_complete",
    entityType: "User",
    entityId: row.userId,
    before: null,
    after: { resetId: row.id },
    requestId: "password-reset",
    outcome: "success",
  });
  return ok({ reset: true });
}

export async function getTenantName(tenantId: string) {
  return (await getPlatformTenant(tenantId))?.name ?? tenantId;
}
