import { z } from "zod";
import { fail, ok } from "../services/result";
import type { ServiceContext } from "../services/context";
import { PLATFORM_TENANT_ID } from "../auth/config";
import { requireHyperAdmin } from "./access";
import { appendPlatformAudit, getPlatformTenant, listPlatformTenants } from "./store";
import { listRoleAssignments, listTenantRoles } from "./store-ext";
import {
  FEATURE_RESOURCE_MAP,
  OWNER_ONLY_RESOURCES,
  PERM_RESOURCES,
  PLATFORM_ONLY_RESOURCES,
  SCREEN_REGISTRY,
  SYSTEM_ROLE_KEYS,
  SYSTEM_ROLE_META,
  canAccessScreen,
  diffGrants,
  effectiveSystemGrants,
  type Grant,
  type ScreenDef,
  type SystemRoleKey,
} from "./permission-matrix";
import { FEATURE_CATALOG } from "./features";
import { listPlatformUsers, type PlatformUserRow } from "./user-lifecycle";
import { maskEmail } from "./search";
import { ASSIGNABLE_ROLES } from "./users-admin";
import { MANAGER_PRESET_KEY, OWNER_UNIFIED_MANAGER_TENANTS, invalidateManagerPreset, resolveManagerPreset } from "./manager-preset";
import { saveCustomRole } from "./custom-roles";
import { MANAGER_PRESETS, type ManagerPreset } from "./types";

/**
 * NeviiOS rol dizini — /platform/roller. Yalnız HYPER_ADMIN.
 *
 * Rol başına: kullanıcı sayısı ve listesi (e-posta maskeli), efektif grant'ler,
 * erişilen ekranlar (SCREEN_REGISTRY), atanabilirlik. Kurum seçiliyse yönetici
 * preset'i ve özel roller. Sistem rollerinin grant'leri kodda sabittir (HYPER_ADMIN
 * temel izinleri dahil) — UI yalnız kullanıcı atamasını ve kurum preset'ini değiştirir.
 */

export type RoleDirectoryUser = {
  id: string;
  name: string | null;
  emailMasked: string;
  tenantId: string;
  tenantName: string;
  status: PlatformUserRow["status"];
  branchIds: string[];
};

function screensFor(grants: Grant[], role: string): ScreenDef[] {
  return SCREEN_REGISTRY.filter(
    (s) => (role === "HYPER_ADMIN" ? s.area === "platform" : s.area !== "platform") && canAccessScreen({ grants }, s)
  );
}

const toUser = (u: PlatformUserRow): RoleDirectoryUser => ({
  id: u.id,
  name: u.displayName,
  emailMasked: maskEmail(u.email),
  tenantId: u.tenantId,
  tenantName: u.tenantName,
  status: u.status,
  branchIds: u.branchIds,
});

export async function getRoleDirectory(ctx: ServiceContext, input: { tenantId?: string | null }) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const tenantId = input.tenantId || null;
  if (tenantId && !(await getPlatformTenant(tenantId))) return fail("NOT_FOUND", "Kurum bulunamadı");
  const usersRes = await listPlatformUsers(ctx, { status: "all", invite: "none", ...(tenantId ? { tenantId } : {}) });
  if (!usersRes.ok) return usersRes;
  const users = usersRes.data.users;
  const preset: ManagerPreset | null = tenantId ? await resolveManagerPreset(tenantId) : null;

  const systemRoles = SYSTEM_ROLE_KEYS.map((key: SystemRoleKey) => {
    const meta = SYSTEM_ROLE_META[key];
    // PARENT ve STUDENT aynı giriş rolünü (STUDENT) paylaşır; STAFF V1'de giriş rolü değil.
    const members = key === "STAFF" || key === "PARENT" ? [] : users.filter((u) => u.role === key);
    const grants = effectiveSystemGrants(key, preset ?? "branch_scoped");
    return {
      key,
      label: meta.label,
      loginRole: meta.loginRole,
      note: meta.note,
      assignable: (ASSIGNABLE_ROLES as readonly string[]).includes(key),
      editableGrants: false,
      userCount: members.length,
      activeCount: members.filter((u) => u.status === "active").length,
      users: members.map(toUser),
      grants,
      screens: screensFor(grants, key).map((s) => ({ id: s.id, label: s.label, path: s.path, area: s.area, feature: s.feature ?? null })),
      effectiveAs: key === "BRANCH_MANAGER" && preset === "unified" ? "SCHOOL_ADMIN" : null,
    };
  });

  let customRoles: {
    id: string;
    key: string;
    label: string;
    grants: Grant[];
    archived: boolean;
    userCount: number;
    users: RoleDirectoryUser[];
    screens: { id: string; label: string; path: string; area: string }[];
  }[] = [];
  if (tenantId) {
    const [roles, assignments] = await Promise.all([listTenantRoles(tenantId), listRoleAssignments(tenantId)]);
    customRoles = roles.map((r) => {
      const ids = new Set(assignments.filter((a) => a.roleId === r.id).map((a) => a.userId));
      const members = users.filter((u) => ids.has(u.id));
      const grants = r.grants as Grant[];
      return {
        id: r.id,
        key: r.key,
        label: r.label,
        grants,
        archived: Boolean(r.archivedAt),
        userCount: members.length,
        users: members.map(toUser),
        screens: screensFor(grants, "custom").map((s) => ({ id: s.id, label: s.label, path: s.path, area: s.area })),
      };
    });
  }

  const tenants = await listPlatformTenants();
  return ok({
    tenantId,
    tenants: tenants.map((t) => ({ tenantId: t.tenantId, name: t.name })),
    managerPreset: tenantId
      ? { preset, ownerDefault: OWNER_UNIFIED_MANAGER_TENANTS.has(tenantId), options: [...MANAGER_PRESETS] }
      : null,
    systemRoles,
    customRoles,
    screens: SCREEN_REGISTRY.map((s) => ({
      id: s.id,
      label: s.label,
      path: s.path,
      area: s.area,
      requires: s.requires,
      feature: s.feature ?? null,
      enforcement: (s.area === "panel" ? "system_role" : "matrix") as "system_role" | "matrix",
      grantableToCustomRole:
        s.area !== "platform" && !PLATFORM_ONLY_RESOURCES.includes(s.requires.resource) && !OWNER_ONLY_RESOURCES.includes(s.requires.resource),
    })),
    features: FEATURE_CATALOG.map((f) => ({
      key: f.key,
      label: f.label,
      resources: (FEATURE_RESOURCE_MAP[f.key] ?? []).map((r) => PERM_RESOURCES[r]),
      screens: SCREEN_REGISTRY.filter((s) => s.feature === f.key).map((s) => s.label),
    })),
    writable: usersRes.data.writable,
    platformTenantId: PLATFORM_TENANT_ID,
  });
}

// ───────────── Yönetici preset'i: önizleme → onay → audit + sürüm ─────────────

const presetSchema = z.object({
  preset: z.enum(MANAGER_PRESETS),
  reason: z.string().trim().min(10, "Gerekçe en az 10 karakter").max(300).optional(),
  confirm: z.boolean().optional(),
});

export async function previewManagerPreset(ctx: ServiceContext, tenantId: string, input: unknown) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const parsed = presetSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Geçersiz preset");
  if (!(await getPlatformTenant(tenantId))) return fail("NOT_FOUND", "Kurum bulunamadı");
  const before = await resolveManagerPreset(tenantId);
  const after = parsed.data.preset;
  const usersRes = await listPlatformUsers(ctx, { tenantId, role: "BRANCH_MANAGER", status: "active", invite: "none" });
  const managers = usersRes.ok ? usersRes.data.users : [];
  const diff = diffGrants(effectiveSystemGrants("BRANCH_MANAGER", before), effectiveSystemGrants("BRANCH_MANAGER", after));
  const notes: string[] = [];
  if (after === "unified") {
    notes.push("Şube Müdürü kurum genelinde Kurum Yöneticisi ile aynı işlemleri yapar (/panel). Personel ve finans özeti yine kapalıdır.");
  } else {
    notes.push("Şube Müdürü yalnız atanmış şubelerinde /sube yüzeyini kullanır; ataması olmayan hiçbir veri göremez (fail-closed).");
    const unassigned = managers.filter((m) => m.branchIds.length === 0);
    if (unassigned.length) notes.push(`${unassigned.length} şube müdürünün şube ataması yok — ayrıştırma sonrası veri göremez.`);
  }
  notes.push("Açık oturumlar en geç 5 sn içinde yeni izin setiyle değerlendirilir (rol adı ve token değişmez).");
  return ok({
    before,
    after,
    changed: before !== after,
    affectedUsers: managers.map(toUser),
    added: diff.added,
    removed: diff.removed,
    screensOpened: diff.opened,
    screensClosed: diff.closed,
    risks: diff.risks,
    notes,
  });
}

export async function setManagerPreset(ctx: ServiceContext, tenantId: string, input: unknown) {
  const preview = await previewManagerPreset(ctx, tenantId, input);
  if (!preview.ok) return preview;
  const parsed = presetSchema.parse(input);
  if (!preview.data.changed) return ok({ ...preview.data, applied: false });
  if (!parsed.reason) return fail("VALIDATION_ERROR", "Gerekçe en az 10 karakter");
  if (parsed.confirm !== true) return fail("VALIDATION_ERROR", "Etki önizlemesini onaylayın.", { requiresConfirm: true, impact: preview.data });
  const { applySettingWrite } = await import("./service");
  const res = await applySettingWrite({
    ctx,
    scopeType: "tenant",
    scopeId: tenantId,
    key: MANAGER_PRESET_KEY,
    value: parsed.preset,
    targetTenantId: tenantId,
    confirm: true,
    version: { reason: parsed.reason },
  });
  if (!res.ok) return res;
  invalidateManagerPreset(tenantId);
  await appendPlatformAudit({
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    actorTenantId: ctx.tenantId,
    targetTenantId: tenantId,
    action: "platform.role.preset_change",
    entityType: "RolePreset",
    entityId: `${tenantId}:BRANCH_MANAGER`,
    before: { preset: preview.data.before },
    after: {
      preset: parsed.preset,
      reason: parsed.reason,
      affectedUsers: preview.data.affectedUsers.length,
      screensOpened: preview.data.screensOpened,
      screensClosed: preview.data.screensClosed,
    },
    requestId: ctx.requestId || "n/a",
    outcome: "success",
  });
  return ok({ ...preview.data, applied: true });
}

// ───────────── Özel rol: ekran registry'si üzerinden ekran ekle/çıkar ─────────────

const screenToggleSchema = z.object({
  roleId: z.string().min(1),
  screenId: z.string().min(1),
  enabled: z.boolean(),
  confirm: z.boolean().optional(),
});

/**
 * Ekran yetkisi serbest route ile değil registry kimliğiyle verilir: ekranın
 * `requires` grant'i özel role eklenir/çıkarılır; kayıt `saveCustomRole`
 * (doğrulama + etki önizlemesi + onay + audit) üzerinden geçer.
 */
export async function toggleCustomRoleScreen(ctx: ServiceContext, tenantId: string, input: unknown) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const parsed = screenToggleSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Rol, ekran ve durum gerekli");
  const screen = SCREEN_REGISTRY.find((s) => s.id === parsed.data.screenId);
  if (!screen) return fail("NOT_FOUND", "Ekran registry'de yok");
  if (screen.area === "platform") return fail("FORBIDDEN", "Platform ekranı kurum rolüne verilemez.");
  const role = (await listTenantRoles(tenantId)).find((r) => r.id === parsed.data.roleId && !r.archivedAt);
  if (!role) return fail("NOT_FOUND", "Rol bu kurumda bulunamadı");
  const grants = (role.grants as Grant[]).filter(
    (g) => !(g.resource === screen.requires.resource && g.action === screen.requires.action && g.scope === screen.requires.scope)
  );
  if (parsed.data.enabled) grants.push(screen.requires);
  return saveCustomRole(ctx, tenantId, { id: role.id, key: role.key, label: role.label, grants, confirm: parsed.data.confirm });
}
