import { z } from "zod";
import { createHash } from "node:crypto";
import { fail, ok, type ServiceResult } from "../services/result";
import type { ServiceContext } from "../services/context";
import { isDbMode } from "../config";
import { uid } from "../utils";
import { hashPasswordSync } from "../auth/password";
import { FEATURE_FLAGS, PLAN_KEY_PATTERN, type FeatureFlagKey, type PlanKey, type PlatformTenant } from "./types";
import { FEATURE_BY_KEY, PLAN_FEATURE_DEFAULTS, isFeatureFlagKey } from "./features";
import { requireHyperAdmin } from "./access";
import { assertWithinLimit, STAFF_SEAT_ROLES } from "./entitlements";
import { resolveSetting } from "./resolve";
import { tenantSlugSchema, suggestSlug } from "./slug";
import {
  generateInviteToken,
  hashInviteToken,
  inviteExpiresAt,
  inviteTokenMatches,
  invitationPublicStatus,
  toPublicInvitation,
  buildInviteAcceptPath,
} from "./invitation";
import { redactSecrets } from "./secrets";
import {
  appendPlatformAudit,
  grantBranchAccess,
  findTenantByIdempotencyKey,
  findTenantBySlug,
  getInvitation,
  getPlatformTenant,
  listInvitations,
  listPlatformTenants,
  listProvisionRuns,
  revokePendingInvitations,
  saveInvitation,
  saveProvisionRun,
  upsertFeatureOverride,
  upsertPlatformTenant,
  upsertSettingOverride,
} from "./store";
import type { ProvisionRun, PublicOwnerInvitation, TenantDraftPayload, TenantFirstBranchDraft } from "./types";

/** Davetle oluşturulabilen roller — HYPER_ADMIN asla. */
export const INVITE_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "BRANCH_MANAGER"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

export const JSON_PROVISION_BLOCKED_MESSAGE =
  "Gerçek tenant kurulumu yalnız STORE_MODE=db ile çalışır. JSON/memory modunda üretim kurumu oluşturulmaz.";

const firstBranchSchema = z.object({
  name: z.string().trim().min(2).max(80),
  address: z.string().trim().min(2).max(200),
  phone: z.string().trim().min(6).max(32),
  city: z.string().trim().max(80).optional(),
  workingDays: z.array(z.number().int().min(0).max(6)).min(1),
  lessonDurationMinutes: z.number().int().min(15).max(180),
});

const ownerDraftSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email("Geçerli bir e-posta girin"),
  phone: z.string().trim().max(32).optional(),
});

export const tenantDraftInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: tenantSlugSchema.optional(),
  shortName: z.string().trim().max(40).optional(),
  contactEmail: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(32).optional(),
  country: z.string().trim().max(8).optional(),
  timezone: z.string().trim().max(64).optional(),
  currency: z.enum(["TRY", "USD", "EUR"]).optional(),
  language: z.enum(["tr", "en"]).optional(),
  colorPrimary: z
    .string()
    .regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/)
    .optional(),
  logoUrl: z.string().trim().max(500).optional(),
  // Yeni kurum yalnız yayındaki katalogda aktif ve legacy olmayan paketi alır (createTenantDraft doğrular).
  planKey: z.string().regex(PLAN_KEY_PATTERN).optional(),
  features: z.record(z.string(), z.boolean()).optional(),
  firstBranch: firstBranchSchema.optional(),
  owner: ownerDraftSchema.optional(),
  idempotencyKey: z.string().trim().min(8).max(80).optional(),
});

function auditSafe(value: unknown) {
  return redactSecrets(value) as never;
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

function sanitizeFeatures(
  planKey: PlanKey,
  incoming?: Record<string, boolean>
): Partial<Record<FeatureFlagKey, boolean>> {
  // Katalogda oluşturulmuş paket: bayraklar açık başlar; ticari hakkı abonelik snapshot'ı belirler.
  const defaults: Partial<Record<FeatureFlagKey, boolean>> =
    PLAN_FEATURE_DEFAULTS[planKey] ?? Object.fromEntries(FEATURE_FLAGS.map((f) => [f, true]));
  const out: Partial<Record<FeatureFlagKey, boolean>> = {};
  for (const key of FEATURE_FLAGS) {
    const def = FEATURE_BY_KEY.get(key)!;
    const wanted = incoming && key in incoming ? Boolean(incoming[key]) : defaults[key];
    out[key] = def.required ? true : wanted;
  }
  return out;
}

function asDraftPayload(parsed: z.infer<typeof tenantDraftInputSchema>, planKey: PlanKey): TenantDraftPayload {
  return {
    shortName: parsed.shortName ?? parsed.name.slice(0, 24),
    contactEmail: parsed.contactEmail ?? "",
    phone: parsed.phone ?? "",
    country: parsed.country ?? "TR",
    timezone: parsed.timezone ?? "Europe/Istanbul",
    currency: parsed.currency ?? "TRY",
    language: parsed.language ?? "tr",
    colorPrimary: parsed.colorPrimary ?? "#6d28d9",
    logoUrl: parsed.logoUrl ?? "",
    features: sanitizeFeatures(planKey, parsed.features),
    firstBranch: parsed.firstBranch ?? null,
    owner: parsed.owner ?? null,
  };
}

export function defaultFeaturesForPlan(planKey: PlanKey): Record<FeatureFlagKey, boolean> {
  return Object.fromEntries(FEATURE_FLAGS.map((f) => [f, Boolean(PLAN_FEATURE_DEFAULTS[planKey]?.[f])])) as Record<FeatureFlagKey, boolean>;
}

export async function createTenantDraft(ctx: ServiceContext, input: unknown) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const parsed = tenantDraftInputSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Geçersiz kurum taslağı", parsed.error.flatten());

  if (parsed.data.idempotencyKey) {
    const existing = await findTenantByIdempotencyKey(parsed.data.idempotencyKey);
    if (existing) {
      return ok({ tenant: existing, replayed: true as const, provisioningCapable: isDbMode });
    }
  }

  const slug = parsed.data.slug || suggestSlug(parsed.data.name);
  const slugCheck = tenantSlugSchema.safeParse(slug);
  if (!slugCheck.success) return fail("VALIDATION_ERROR", "Geçersiz slug", slugCheck.error.flatten());
  const taken = await findTenantBySlug(slugCheck.data);
  if (taken) return fail("CONFLICT", "Bu slug başka bir kuruma ait.");

  const planKey = (parsed.data.planKey ?? "starter") as PlanKey;
  const { getPublishedCatalog, subscribeTenantToPlan } = await import("./commercial-catalog");
  const catalogPlan = (await getPublishedCatalog()).catalog.plans.find((p) => p.key === planKey);
  if (!catalogPlan || catalogPlan.status !== "active" || catalogPlan.legacy) {
    return fail("VALIDATION_ERROR", "Paket yeni kurum için seçilemez (katalogda yok, pasif veya eski paket).");
  }
  const draft = asDraftPayload(parsed.data, planKey);
  const tenant = await upsertPlatformTenant(
    {
      name: parsed.data.name,
      slug: slugCheck.data,
      lifecycle: "draft",
      active: false,
      planKey,
      shortName: draft.shortName,
      contactEmail: draft.contactEmail,
      phone: draft.phone,
      country: draft.country,
      timezone: draft.timezone,
      currency: draft.currency,
      language: draft.language,
      colorPrimary: draft.colorPrimary,
      logoUrl: draft.logoUrl,
      idempotencyKey: parsed.data.idempotencyKey ?? null,
      draft,
    },
    ctx.userId
  );
  await writeAudit(ctx, "platform.tenant.draft", "Tenant", tenant.tenantId, tenant.tenantId, null, {
    name: tenant.name,
    slug: tenant.slug,
    planKey: tenant.planKey,
    lifecycle: tenant.lifecycle,
  });
  // Abonelik snapshot'ı: sonraki katalog değişiklikleri bu kurumu etkilemez.
  const sub = await subscribeTenantToPlan(ctx, tenant.tenantId, planKey, "Yeni kurum aboneliği");
  if (!sub.ok) return sub;
  return ok({ tenant, replayed: false as const, provisioningCapable: isDbMode });
}

function requireBranch(draft: TenantDraftPayload | null): ServiceResult<TenantFirstBranchDraft> {
  if (!draft?.firstBranch) {
    return fail("VALIDATION_ERROR", "İlk şube olmadan kurulum yapılamaz.");
  }
  const parsed = firstBranchSchema.safeParse(draft.firstBranch);
  if (!parsed.success) return fail("VALIDATION_ERROR", "İlk şube bilgisi geçersiz", parsed.error.flatten());
  return ok(parsed.data);
}

async function applyDraftSettings(tenant: PlatformTenant, actorUserId: string) {
  const draft = tenant.draft;
  if (!draft) return;
  const now = new Date().toISOString();
  const pairs: [string, string | number][] = [
    ["institution.name", tenant.name],
    ["institution.theme", "default"],
    ["institution.colorPrimary", draft.colorPrimary],
    ["locale.language", draft.language],
    ["locale.timezone", draft.timezone],
    ["locale.currency", draft.currency],
    ["contact.email", draft.contactEmail],
    ["contact.phone", draft.phone],
    ["lessons.defaultDurationMinutes", draft.firstBranch?.lessonDurationMinutes ?? 40],
    ["lessons.closedDays", ""],
  ];
  for (const [key, value] of pairs) {
    if (key === "lessons.closedDays") {
      const working = new Set(draft.firstBranch?.workingDays ?? [1, 2, 3, 4, 5]);
      const closed = [0, 1, 2, 3, 4, 5, 6].filter((d) => !working.has(d));
      await upsertSettingOverride({
        scopeType: "tenant",
        scopeId: tenant.tenantId,
        key,
        value: closed.map(String),
        updatedAt: now,
        updatedBy: actorUserId,
      });
      continue;
    }
    await upsertSettingOverride({
      scopeType: "tenant",
      scopeId: tenant.tenantId,
      key,
      value,
      updatedAt: now,
      updatedBy: actorUserId,
    });
  }
  const features = sanitizeFeatures(tenant.planKey, draft.features as Record<string, boolean>);
  for (const [flag, enabled] of Object.entries(features)) {
    if (!isFeatureFlagKey(flag)) continue;
    await upsertFeatureOverride({
      tenantId: tenant.tenantId,
      flagKey: flag,
      enabled: Boolean(enabled),
      updatedAt: now,
      updatedBy: actorUserId,
    });
  }
}

async function provisionInDatabase(tenant: PlatformTenant, branch: TenantFirstBranchDraft): Promise<ServiceResult<true>> {
  const { getPrisma } = await import("../db");
  const prisma = getPrisma();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: tenant.tenantId },
        data: {
          lifecycle: "provisioning",
          active: false,
          name: tenant.name,
          slug: tenant.slug,
          planKey: tenant.planKey,
        },
      });
      let school = await tx.school.findFirst({ where: { tenantId: tenant.tenantId } });
      if (!school) {
        school = await tx.school.create({
          data: {
            tenantId: tenant.tenantId,
            name: tenant.name,
            shortName: tenant.shortName || tenant.name.slice(0, 24),
            city: branch.city || "",
            website: "",
            email: tenant.contactEmail,
            phone: tenant.phone || branch.phone,
            logoUrl: tenant.logoUrl,
            makeupWindowDays: 14,
            monthlyMakeupAllowance: 2,
            lessonDurationMinutes: branch.lessonDurationMinutes,
            workingHoursStart: "09:00",
            workingHoursEnd: "21:00",
            workingDays: branch.workingDays,
            currency: tenant.currency,
          },
        });
      }
      const existingBranch = await tx.branch.findFirst({ where: { tenantId: tenant.tenantId } });
      if (!existingBranch) {
        await tx.branch.create({
          data: {
            id: uid("br"),
            tenantId: tenant.tenantId,
            schoolId: school.id,
            name: branch.name,
            shortName: branch.name.slice(0, 16),
            address: branch.address,
            phone: branch.phone,
            city: branch.city || "",
          },
        });
      }
    });
    return ok(true);
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "Kurulum veritabanı hatası");
  }
}

export async function provisionTenant(ctx: ServiceContext, tenantId: string, opts?: { retry?: boolean }) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const tenant = await getPlatformTenant(tenantId);
  if (!tenant) return fail("NOT_FOUND", "Kurum bulunamadı");
  if (tenant.lifecycle === "archived") {
    return fail("FORBIDDEN", "Arşivlenmiş kurum yeniden kurulamaz.");
  }

  const branchRes = requireBranch(tenant.draft);
  if (!branchRes.ok) return branchRes;
  if (!tenant.draft?.owner?.email) {
    return fail("VALIDATION_ERROR", "Kurum sahibi e-postası gerekli.");
  }
  const ownerParsed = ownerDraftSchema.safeParse(tenant.draft.owner);
  if (!ownerParsed.success) {
    return fail("VALIDATION_ERROR", "Kurum sahibi e-postası geçersiz", ownerParsed.error.flatten());
  }

  if (tenant.lifecycle === "active") {
    const runs = await listProvisionRuns(tenantId);
    return ok({
      tenant,
      replayed: true,
      invitation: null as PublicOwnerInvitation | null,
      rawInviteToken: undefined as string | undefined,
      invitePath: undefined as string | undefined,
      provisioningCapable: isDbMode,
      run: runs[0] ?? null,
    });
  }

  const run: ProvisionRun = {
    id: uid("prun"),
    tenantId,
    status: "running",
    steps: [],
    error: null,
    actorUserId: ctx.userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await upsertPlatformTenant(
    { ...tenant, lifecycle: "provisioning", active: false, provisionError: null },
    ctx.userId
  );

  if (!isDbMode) {
    run.status = "blocked";
    run.error = JSON_PROVISION_BLOCKED_MESSAGE;
    run.steps = [
      { id: "mode", label: "STORE_MODE kontrolü", ok: false, detail: JSON_PROVISION_BLOCKED_MESSAGE },
    ];
    run.updatedAt = new Date().toISOString();
    await saveProvisionRun(run);
    await upsertPlatformTenant(
      { ...tenant, lifecycle: "draft", active: false, provisionError: JSON_PROVISION_BLOCKED_MESSAGE },
      ctx.userId
    );
    await writeAudit(
      ctx,
      opts?.retry ? "platform.tenant.retry_provision" : "platform.tenant.provision",
      "Tenant",
      tenantId,
      tenantId,
      { lifecycle: tenant.lifecycle },
      { lifecycle: "draft", blocked: true, mode: process.env.STORE_MODE ?? "json" },
      "denied"
    );
    return fail("FORBIDDEN", JSON_PROVISION_BLOCKED_MESSAGE, {
      tenantId,
      provisioningCapable: false,
      run,
    });
  }

  const dbRes = await provisionInDatabase(tenant, branchRes.data);
  if (!dbRes.ok) {
    run.status = "failed";
    run.error = dbRes.error.message;
    run.steps.push({ id: "db", label: "Veritabanı kaynakları", ok: false, detail: dbRes.error.message });
    await saveProvisionRun(run);
    await upsertPlatformTenant(
      { ...tenant, lifecycle: "draft", active: false, provisionError: dbRes.error.message },
      ctx.userId
    );
    await writeAudit(ctx, "platform.tenant.provision", "Tenant", tenantId, tenantId, tenant.lifecycle, run, "error");
    return dbRes;
  }

  run.steps.push({ id: "db", label: "Tenant, okul, ilk şube", ok: true });
  try {
    await applyDraftSettings({ ...tenant, lifecycle: "provisioning" }, ctx.userId);
  } catch (e) {
    // Yarım kurulum "provisioning"de asılı kalmaz: taslağa döner, hata görünür;
    // tekrar deneme idempotenttir (okul/şube findFirst, ayarlar upsert).
    const message = e instanceof Error ? e.message : "Ayarlar uygulanamadı";
    run.status = "failed";
    run.error = message;
    run.steps.push({ id: "settings", label: "Ayarlar ve özellikler", ok: false, detail: message });
    run.updatedAt = new Date().toISOString();
    await saveProvisionRun(run);
    await upsertPlatformTenant({ ...tenant, lifecycle: "draft", active: false, provisionError: message }, ctx.userId);
    await writeAudit(ctx, "platform.tenant.provision", "Tenant", tenantId, tenantId, { lifecycle: tenant.lifecycle }, run, "error");
    return fail("INTERNAL_ERROR", message, { tenantId, run });
  }
  run.steps.push({ id: "settings", label: "Ayarlar ve özellikler", ok: true });

  const invited = await issueOwnerInvitation(ctx, tenantId, ownerParsed.data, { skipAuth: true });
  let rawInviteToken: string | undefined;
  let invitePath: string | undefined;
  let invitation: PublicOwnerInvitation | null = null;
  if (invited.ok) {
    rawInviteToken = invited.data.rawToken;
    invitePath = invited.data.invitePath;
    invitation = invited.data.invitation;
    run.steps.push({ id: "invite", label: "Kurum sahibi daveti", ok: true });
  } else {
    run.steps.push({ id: "invite", label: "Kurum sahibi daveti", ok: false, detail: invited.error.message });
  }

  const next = await upsertPlatformTenant(
    { ...tenant, lifecycle: "active", active: true, provisionError: null },
    ctx.userId
  );
  run.status = "succeeded";
  run.updatedAt = new Date().toISOString();
  await saveProvisionRun(run);
  await writeAudit(
    ctx,
    opts?.retry ? "platform.tenant.retry_provision" : "platform.tenant.provision",
    "Tenant",
    tenantId,
    tenantId,
    { lifecycle: tenant.lifecycle },
    { lifecycle: "active", runId: run.id }
  );

  return ok({
    tenant: next,
    replayed: false,
    invitation,
    rawInviteToken,
    invitePath,
    provisioningCapable: true,
    run,
  });
}

export async function issueOwnerInvitation(
  ctx: ServiceContext,
  tenantId: string,
  ownerInput?: unknown,
  opts?: { skipAuth?: boolean; role?: InviteRole; branchIds?: string[] }
) {
  if (!opts?.skipAuth) {
    const gate = requireHyperAdmin(ctx);
    if (!gate.ok) return gate;
  }
  const tenant = await getPlatformTenant(tenantId);
  if (!tenant) return fail("NOT_FOUND", "Kurum bulunamadı");
  const parsed = ownerDraftSchema.safeParse(ownerInput ?? tenant.draft?.owner);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Kurum sahibi e-postası geçersiz", parsed.error.flatten());
  const role: InviteRole = opts?.role ?? "SUPER_ADMIN";

  const members = isDbMode ? await countActiveTenantUsers(tenantId) : 0;
  const limit = await assertWithinLimit(tenantId, "users", members);
  if (!limit.ok) return limit;

  // Kurum sahibi daveti tektir (öncekiler iptal); diğer davetlerde yalnız aynı e-posta.
  await revokePendingInvitations(tenantId, (r) =>
    role === "SUPER_ADMIN" ? (r.role ?? "SUPER_ADMIN") === "SUPER_ADMIN" : r.email === parsed.data.email
  );
  const ttlDays = Number((await resolveSetting({ tenantId }, "auth.inviteTtlDays"))?.effectiveValue ?? 7);
  const rawToken = generateInviteToken();
  const row = {
    id: uid("inv"),
    tenantId,
    email: parsed.data.email,
    name: parsed.data.name,
    phone: parsed.data.phone ?? null,
    tokenHash: hashInviteToken(rawToken),
    expiresAt: inviteExpiresAt(new Date(), ttlDays),
    usedAt: null,
    revokedAt: null,
    createdAt: new Date().toISOString(),
    createdBy: ctx.userId,
    role: role === "SUPER_ADMIN" ? null : role,
    branchIds: opts?.branchIds?.length ? opts.branchIds : null,
  };
  await saveInvitation(row);
  if (role !== "SUPER_ADMIN") {
    await writeAudit(ctx, "platform.user.invite", "OwnerInvitation", row.id, tenantId, null, {
      invitationId: row.id,
      email: parsed.data.email,
      role,
      branchIds: row.branchIds,
    });
    return ok({ invitation: toPublicInvitation(row), rawToken, invitePath: buildInviteAcceptPath(row.id, rawToken) });
  }
  const draft = tenant.draft ?? {
    shortName: tenant.shortName,
    contactEmail: tenant.contactEmail,
    phone: tenant.phone,
    country: tenant.country,
    timezone: tenant.timezone,
    currency: tenant.currency,
    language: tenant.language,
    colorPrimary: tenant.colorPrimary,
    logoUrl: tenant.logoUrl,
    features: {},
    firstBranch: null,
    owner: parsed.data,
  };
  await upsertPlatformTenant({ ...tenant, draft: { ...draft, owner: parsed.data } }, ctx.userId);
  await writeAudit(ctx, "platform.tenant.invite_owner", "OwnerInvitation", row.id, tenantId, null, {
    invitationId: row.id,
    email: parsed.data.email,
  });
  return ok({
    invitation: toPublicInvitation(row),
    rawToken,
    invitePath: buildInviteAcceptPath(row.id, rawToken),
  });
}

export async function listOwnerInvitations(ctx: ServiceContext, tenantId: string) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const rows = await listInvitations(tenantId);
  return ok({ invitations: rows.map((r) => toPublicInvitation(r)) });
}

export async function getProvisionHistory(ctx: ServiceContext, tenantId: string) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const tenant = await getPlatformTenant(tenantId);
  if (!tenant) return fail("NOT_FOUND", "Kurum bulunamadı");
  const runs = await listProvisionRuns(tenantId);
  const invitations = (await listInvitations(tenantId)).map((r) => toPublicInvitation(r));
  return ok({ tenant, runs, invitations, provisioningCapable: isDbMode });
}

const acceptSchema = z.object({
  token: z.string().min(16),
  password: z.string().min(8, "Parola en az 8 karakter olmalı").max(200),
});

export async function acceptOwnerInvitation(inviteId: string, input: unknown) {
  const parsed = acceptSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Geçersiz davet kabulü", parsed.error.flatten());
  const invite = await getInvitation(inviteId);
  if (!invite) return fail("NOT_FOUND", "Davet bulunamadı");
  if (!inviteTokenMatches(parsed.data.token, invite.tokenHash)) {
    return fail("FORBIDDEN", "Davet geçersiz.");
  }
  const status = invitationPublicStatus(invite);
  if (status === "revoked") return fail("FORBIDDEN", "Bu davet iptal edildi.");
  if (status === "used") return fail("FORBIDDEN", "Bu davet zaten kullanıldı.");
  if (status === "expired") return fail("FORBIDDEN", "Davet süresi doldu.");

  // Davetle asla platform rolü üretilmez; bilinmeyen rol fail-closed reddedilir.
  const role = (invite.role ?? "SUPER_ADMIN") as string;
  if (!(INVITE_ROLES as readonly string[]).includes(role)) return fail("FORBIDDEN", "Davet rolü geçersiz.");

  const tenant = await getPlatformTenant(invite.tenantId);
  if (!tenant) return fail("NOT_FOUND", "Kurum bulunamadı");
  if (tenant.lifecycle !== "active") return fail("FORBIDDEN", "Kurum aktif değil; davet şu an kabul edilemez.");

  const minLen = Number((await resolveSetting({ tenantId: invite.tenantId }, "auth.passwordMinLength"))?.effectiveValue ?? 8);
  if (parsed.data.password.length < minLen) {
    return fail("VALIDATION_ERROR", `Parola en az ${minLen} karakter olmalı.`);
  }

  // json/memory: kalıcı kullanıcı yazılamaz → davet YAKILMAZ (db'de tekrar kullanılabilir kalır).
  if (!isDbMode) return fail("FORBIDDEN", JSON_PROVISION_BLOCKED_MESSAGE);

  const { getPrisma } = await import("../db");
  const prisma = getPrisma();
  // Login e-postayı GLOBAL arar (authenticateUser findFirst) → aynı e-posta
  // başka kurumda varsa belirsiz/yanlış tenant oturumu olur. Global tekillik.
  const existing = await prisma.user.findFirst({ where: { email: invite.email } });
  if (existing) return fail("CONFLICT", "Bu e-posta platformda zaten kayıtlı.");

  const userId = uid("user");
  const usedAt = new Date();
  await prisma.$transaction(async (tx) => {
    // Yarış koşulu: davet yalnız bir kez kullanılabilir (usedAt null koşulu).
    const claimed = await tx.ownerInvitation.updateMany({
      where: { id: invite.id, usedAt: null, revokedAt: null },
      data: { usedAt },
    });
    if (claimed.count !== 1) throw new Error("invite_already_used");
    await tx.user.create({
      data: {
        id: userId,
        tenantId: invite.tenantId,
        email: invite.email,
        passwordHash: hashPasswordSync(parsed.data.password),
        role,
        active: true,
      },
    });
  });
  if (role === "BRANCH_MANAGER") {
    for (const branchId of invite.branchIds ?? []) {
      await grantBranchAccess({ tenantId: invite.tenantId, userId, branchId, grantedBy: invite.createdBy });
    }
  }
  await appendPlatformAudit({
    actorUserId: userId,
    actorRole: role,
    actorTenantId: invite.tenantId,
    targetTenantId: invite.tenantId,
    action: "platform.invitation.accept",
    entityType: "OwnerInvitation",
    entityId: invite.id,
    before: null,
    after: { invitationId: invite.id, email: invite.email, role, branchIds: invite.branchIds ?? [] },
    requestId: "invite-accept",
    outcome: "success",
  });
  return ok({ accepted: true, tenantId: invite.tenantId, email: invite.email, role });
}

async function countActiveTenantUsers(tenantId: string): Promise<number> {
  const { getPrisma } = await import("../db");
  return getPrisma().user.count({ where: { tenantId, active: true, role: { in: [...STAFF_SEAT_ROLES] } } });
}

export async function dashboardLifecycleBuckets() {
  const tenants = await listPlatformTenants();
  return {
    draft: tenants.filter((t) => t.lifecycle === "draft"),
    provisioning: tenants.filter((t) => t.lifecycle === "provisioning"),
    active: tenants.filter((t) => t.lifecycle === "active"),
    suspended: tenants.filter((t) => t.lifecycle === "suspended"),
    archived: tenants.filter((t) => t.lifecycle === "archived"),
  };
}

export function inviteFingerprint(tokenHash: string): string {
  return createHash("sha256").update(tokenHash).digest("hex").slice(0, 8);
}
