import { z } from "zod";
import { fail, ok, type ServiceResult } from "../services/result";
import type { ServiceContext } from "../services/context";
import { requireHyperAdmin } from "./access";
import { SETTING_BY_KEY, parseSettingValue } from "./catalog";
import { FEATURE_BY_KEY, isFeatureFlagKey } from "./features";
import { appendPlatformAudit, deleteFeatureOverride, deleteSettingOverride, getPlatformTenant, listFeatureOverrides, upsertFeatureOverride, upsertSettingOverride } from "./store";
import { listPolicyVersions, newPolicyVersionId, savePolicyVersion } from "./store-ext";
import { COMMERCIAL_CATALOG_KEY, FEATURES_POLICY_KEY, PLATFORM_SCOPE_ID, isGovernedPolicyKey, recordPublishedVersion } from "./policy-version-log";
import { resolveAllFeatures, resolveEntitlement, resolveSetting, loadEntitlementInputs } from "./resolve";
import { invalidatePlatformBrand, PLATFORM_LOGO_KEY } from "./branding";
import { stableStringify } from "./policies";
import { builtinCatalog, catalogPublishImpact, validateCatalog } from "./commercial-catalog";
import { FEATURE_FLAGS, type FeatureFlagKey, type JsonValue, type PolicyVersion } from "./types";

/**
 * NeviiOS kritik politika yaşam döngüsü:
 *   Taslak → Etki önizleme → Yayınla (audit) → Geri al
 * Geri alma eski kaydı SİLMEZ: hedef sürümün değerini kopyalayan yeni bir
 * yayın sürümü üretir (rollbackOfVersion) ve gerekçesiyle audit'e yazar.
 */

async function gate(ctx: ServiceContext, scopeId: string): Promise<ServiceResult<true>> {
  const g = requireHyperAdmin(ctx);
  if (!g.ok) return g;
  if (scopeId !== PLATFORM_SCOPE_ID && !(await getPlatformTenant(scopeId))) return fail("NOT_FOUND", "Kurum bulunamadı");
  return ok(true);
}

async function audit(ctx: ServiceContext, scopeId: string, action: string, entityId: string, before: unknown, after: unknown) {
  await appendPlatformAudit({
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    actorTenantId: ctx.tenantId,
    targetTenantId: scopeId === PLATFORM_SCOPE_ID ? null : scopeId,
    action,
    entityType: "PolicyVersion",
    entityId,
    before: (before ?? null) as never,
    after: (after ?? null) as never,
    requestId: ctx.requestId || "n/a",
    outcome: "success",
  });
}

function validateCatalogValue(value: unknown): ServiceResult<JsonValue> {
  const res = validateCatalog(value);
  return res.ok ? ok(res.data as unknown as JsonValue) : res;
}

function validateValue(key: string, value: unknown): ServiceResult<JsonValue> {
  if (!isGovernedPolicyKey(key)) return fail("VALIDATION_ERROR", "Bu anahtar sürümlenen bir politika değil.");
  if (value === null) return ok(null);
  if (key === FEATURES_POLICY_KEY) {
    const parsed = z.record(z.string(), z.boolean()).safeParse(value);
    if (!parsed.success || Object.keys(parsed.data).some((k) => !isFeatureFlagKey(k))) {
      return fail("VALIDATION_ERROR", "Modül politikası {modülAnahtarı: true/false} olmalı.");
    }
    return ok(parsed.data);
  }
  if (key === COMMERCIAL_CATALOG_KEY) {
    return validateCatalogValue(value);
  }
  if (key === PLATFORM_LOGO_KEY) {
    return fail("VALIDATION_ERROR", "Logo taslakla değil, Platform Markası ekranından yüklenir.");
  }
  const def = SETTING_BY_KEY.get(key);
  if (!def) return fail("NOT_FOUND", "Bilinmeyen ayar anahtarı");
  const parsed = parseSettingValue(def, value);
  return parsed.ok ? ok(parsed.value) : fail("VALIDATION_ERROR", parsed.message);
}

async function currentValue(scopeId: string, key: string): Promise<JsonValue> {
  if (key === FEATURES_POLICY_KEY) {
    return Object.fromEntries((await listFeatureOverrides(scopeId)).map((o) => [o.flagKey, o.enabled]));
  }
  const published = (await listPolicyVersions(scopeId, key)).find((v) => v.status === "published");
  if (published) return published.value;
  if (key === COMMERCIAL_CATALOG_KEY) return builtinCatalog() as unknown as JsonValue;
  if (scopeId === PLATFORM_SCOPE_ID) return null;
  return (await resolveSetting({ tenantId: scopeId }, key))?.effectiveValue ?? null;
}

/** Değeri gerçekten uygular (aynı doğrulama + audit + yeni yayın sürümü). */
async function applyValue(
  ctx: ServiceContext,
  scopeId: string,
  key: string,
  value: JsonValue,
  meta: { reason: string; rollbackOfVersion?: number | null; fromDraftId?: string }
): Promise<ServiceResult<{ version: PolicyVersion | null }>> {
  const now = new Date().toISOString();
  if (key === FEATURES_POLICY_KEY) {
    const map = (value ?? {}) as Record<string, boolean>;
    const current = await resolveAllFeatures(scopeId);
    for (const flag of FEATURE_FLAGS) {
      const def = FEATURE_BY_KEY.get(flag)!;
      if (map[flag] === undefined) {
        await deleteFeatureOverride(scopeId, flag);
        continue;
      }
      if (map[flag] && !current.find((f) => f.key === flag)?.entitled) {
        return fail("FORBIDDEN", `"${def.label}" kurumun paketinde yok; modül politikası ticari hak veremez.`);
      }
      if (def.required && map[flag] === false) return fail("VALIDATION_ERROR", `"${def.label}" zorunlu modül.`);
    }
    for (const [flag, enabled] of Object.entries(map)) {
      await upsertFeatureOverride({ tenantId: scopeId, flagKey: flag as FeatureFlagKey, enabled, updatedAt: now, updatedBy: ctx.userId });
    }
  } else if (key === COMMERCIAL_CATALOG_KEY) {
    // Katalog için tek kaynak PolicyVersion'dır (yayın = yeni "published" sürüm, aşağıda).
    if (scopeId !== PLATFORM_SCOPE_ID) return fail("VALIDATION_ERROR", "Paket kataloğu yalnız platform kapsamındadır.");
    if (value === null) return fail("VALIDATION_ERROR", "Katalog boşaltılamaz; önceki sürüme geri alın.");
  } else if (key === PLATFORM_LOGO_KEY) {
    if (value === null) await deleteSettingOverride("platform", "*", key);
    else await upsertSettingOverride({ scopeType: "platform", scopeId: "*", key, value, updatedAt: now, updatedBy: ctx.userId });
    invalidatePlatformBrand();
  } else if (key === "site.page" || key === "site.content") {
    // Katalog ayarı değildir (applySettingWrite tanımaz); geri alma satırı doğrudan yazar.
    if (value === null) await deleteSettingOverride("platform", "*", key);
    else await upsertSettingOverride({ scopeType: "platform", scopeId: "*", key, value, updatedAt: now, updatedBy: ctx.userId });
  } else if (value === null) {
    if (scopeId === PLATFORM_SCOPE_ID) await deleteSettingOverride("platform", "*", key);
    else await deleteSettingOverride("tenant", scopeId, key);
    if (key === "access.managerPreset") (await import("./manager-preset")).invalidateManagerPreset();
    if (key === "access.teacherEarningsAccess") (await import("./teacher-earnings-access")).invalidateTeacherEarningsAccess();
  } else {
    const { applySettingWrite } = await import("./service");
    const res = await applySettingWrite({
      ctx,
      scopeType: scopeId === PLATFORM_SCOPE_ID ? "platform" : "tenant",
      scopeId: scopeId === PLATFORM_SCOPE_ID ? "*" : scopeId,
      key,
      value,
      targetTenantId: scopeId === PLATFORM_SCOPE_ID ? null : scopeId,
      confirm: true,
      version: meta,
    });
    if (!res.ok) return res;
    const version = (await listPolicyVersions(scopeId, key)).find((v) => v.status === "published") ?? null;
    return ok({ version });
  }
  const version = await recordPublishedVersion(ctx, scopeId, key, value, meta);
  return ok({ version });
}

export async function listPolicyHistory(ctx: ServiceContext, scopeId: string) {
  const g = await gate(ctx, scopeId);
  if (!g.ok) return g;
  const versions = await listPolicyVersions(scopeId);
  // Logo baytları geçmiş listesinde taşınmaz.
  return ok({
    versions: versions.map((v) => (v.key === PLATFORM_LOGO_KEY && v.value ? { ...v, value: { mime: (v.value as { mime?: string }).mime ?? null } } : v)),
  });
}

const draftSchema = z.object({ key: z.string().min(1), value: z.unknown(), reason: z.string().trim().min(5, "Gerekçe en az 5 karakter").max(300) });

export async function createPolicyDraft(ctx: ServiceContext, scopeId: string, input: unknown) {
  const g = await gate(ctx, scopeId);
  if (!g.ok) return g;
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Geçersiz taslak");
  if (parsed.data.key === PLATFORM_LOGO_KEY) return fail("VALIDATION_ERROR", "Logo doğrudan yüklenir; taslak yerine geri alma kullanın.");
  const value = validateValue(parsed.data.key, parsed.data.value);
  if (!value.ok) return value;
  const history = await listPolicyVersions(scopeId, parsed.data.key);
  const draft = await savePolicyVersion({
    id: newPolicyVersionId(),
    scopeId,
    key: parsed.data.key,
    version: Math.max(0, ...history.map((h) => h.version)) + 1,
    status: "draft",
    value: value.data,
    reason: parsed.data.reason,
    createdBy: ctx.userId,
    createdAt: new Date().toISOString(),
    publishedBy: null,
    publishedAt: null,
    rollbackOfVersion: null,
  });
  await audit(ctx, scopeId, "platform.policy.draft", draft.id, null, { key: draft.key, version: draft.version, reason: draft.reason });
  return ok({ draft });
}

async function findDraft(scopeId: string, draftId: string) {
  return (await listPolicyVersions(scopeId)).find((v) => v.id === draftId && v.status === "draft") ?? null;
}

/** Etki önizlemesi — hiçbir şey yazmaz. */
export async function previewPolicyDraft(ctx: ServiceContext, scopeId: string, draftId: string) {
  const g = await gate(ctx, scopeId);
  if (!g.ok) return g;
  const draft = await findDraft(scopeId, draftId);
  if (!draft) return fail("NOT_FOUND", "Taslak bulunamadı");
  const before = await currentValue(scopeId, draft.key);
  const after = draft.value;
  const notes: string[] = [];
  const blockers: string[] = [];
  const top = (v: JsonValue) => (v && typeof v === "object" && !Array.isArray(v) ? Object.keys(v) : []);
  const changedKeys = [...new Set([...top(before), ...top(after)])].filter(
    (k) => stableStringify((before as Record<string, unknown> | null)?.[k]) !== stableStringify((after as Record<string, unknown> | null)?.[k])
  );
  if (scopeId !== PLATFORM_SCOPE_ID && (draft.key === "subscription.addons" || draft.key === "subscription.entitlementOverrides")) {
    const tenant = await getPlatformTenant(scopeId);
    const inputs = await loadEntitlementInputs(scopeId, tenant!.planKey);
    const next = {
      addons: draft.key === "subscription.addons" ? ((after as string[] | null) ?? []) as FeatureFlagKey[] : inputs.addons,
      overrides: draft.key === "subscription.entitlementOverrides" ? ((after ?? {}) as typeof inputs.overrides) : inputs.overrides,
    };
    for (const flag of FEATURE_FLAGS) {
      const was = resolveEntitlement(flag, tenant!.planKey, inputs).entitled;
      const will = resolveEntitlement(flag, tenant!.planKey, next).entitled;
      if (was !== will) notes.push(`${FEATURE_BY_KEY.get(flag)!.label}: ticari hak ${will ? "açılır" : "kapanır (modül backend'de de kapanır)"}`);
    }
  }
  if (draft.key === FEATURES_POLICY_KEY && scopeId !== PLATFORM_SCOPE_ID) {
    const current = await resolveAllFeatures(scopeId);
    for (const [flag, enabled] of Object.entries((after ?? {}) as Record<string, boolean>)) {
      const f = current.find((x) => x.key === flag);
      if (enabled && f && !f.entitled) blockers.push(`${f.label} pakette yok.`);
      else if (f && f.enabled !== enabled) notes.push(`${f.label}: ${enabled ? "açılır" : "kapanır"}`);
    }
  }
  if (draft.key.startsWith("appearance.") && scopeId !== PLATFORM_SCOPE_ID) {
    const { appearancePolicyConflict, normalizeAppearancePolicy } = await import("./policies");
    const pick = async (k: string) => (k === draft.key ? after : (await resolveSetting({ tenantId: scopeId }, k))?.effectiveValue);
    const conflict = appearancePolicyConflict(
      normalizeAppearancePolicy({ mode: await pick("appearance.mode"), fixedTheme: await pick("appearance.fixedTheme"), fontPolicy: await pick("appearance.fontPolicy") })
    );
    if (conflict) blockers.push(conflict);
    notes.push("Kurum kullanıcılarının tema/font seçimi bir sonraki sayfa yüklemesinde politikaya uyar.");
  }
  if (draft.key === COMMERCIAL_CATALOG_KEY) {
    const impact = await catalogPublishImpact(before, after);
    notes.push(...impact.notes);
    blockers.push(...impact.blockers);
  }
  if (draft.key === "access.managerPreset") notes.push("Şube müdürlerinin efektif izin seti değişir (rol adı ve token aynı kalır).");
  if (draft.key === "access.teacherEarningsAccess") notes.push("Yalnız Öğretmen Hakedişleri erişimi değişir; finans özeti / personel / bordro / IBAN kısıtı (yalnız kurum sahibi) değişmez.");
  if (draft.key.startsWith("retention.")) notes.push("Kritik audit kategorileri (finans, rol, destek erişimi, platform ayar) bu ayardan etkilenmez — asla silinmez.");
  if (draft.key.startsWith("mobile.")) notes.push("Mobil uygulama bir sonraki /api/v1/mobile/policy çağrısında yeni kararı alır.");
  if (draft.key.startsWith("policy.")) notes.push("Yalnız yeni kayıtlar etkilenir; mevcut sözleşme/tahsilat snapshot ile korunur.");
  if (draft.key === "forms.studentRegistration") notes.push("Yeni öğrenci kaydında zorunlu/gizli alan kuralları hemen sunucuda uygulanır.");
  return ok({ draft, before, after, changedKeys, notes, blockers });
}

export async function publishPolicyDraft(ctx: ServiceContext, scopeId: string, input: unknown) {
  const g = await gate(ctx, scopeId);
  if (!g.ok) return g;
  const parsed = z.object({ draftId: z.string().min(1), confirm: z.boolean().optional() }).safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Taslak gerekli");
  const preview = await previewPolicyDraft(ctx, scopeId, parsed.data.draftId);
  if (!preview.ok) return preview;
  if (preview.data.blockers.length) return fail("VALIDATION_ERROR", preview.data.blockers.join(" "), { blockers: preview.data.blockers });
  if (parsed.data.confirm !== true) return fail("VALIDATION_ERROR", "Yayın için etki önizlemesini onaylayın.", { requiresConfirm: true });
  const draft = preview.data.draft;
  const res = await applyValue(ctx, scopeId, draft.key, draft.value, { reason: draft.reason, fromDraftId: draft.id });
  if (!res.ok) return res;
  await audit(ctx, scopeId, "platform.policy.publish", draft.id, preview.data.before, { key: draft.key, value: draft.value, reason: draft.reason });
  return ok({ version: res.data.version });
}

export async function discardPolicyDraft(ctx: ServiceContext, scopeId: string, input: unknown) {
  const g = await gate(ctx, scopeId);
  if (!g.ok) return g;
  const parsed = z.object({ draftId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Taslak gerekli");
  const draft = await findDraft(scopeId, parsed.data.draftId);
  if (!draft) return fail("NOT_FOUND", "Taslak bulunamadı");
  await savePolicyVersion({ ...draft, status: "discarded" });
  await audit(ctx, scopeId, "platform.policy.discard", draft.id, null, { key: draft.key, version: draft.version });
  return ok({ discarded: true });
}

const rollbackSchema = z.object({
  key: z.string().min(1),
  toVersion: z.number().int().min(1).optional(),
  reason: z.string().trim().min(10, "Geri alma gerekçesi en az 10 karakter olmalı").max(300),
  confirm: z.boolean().optional(),
});

/** Önceki yayına (veya belirtilen sürüme) döner — yeni sürüm üretir, eskisi kalır. */
export async function rollbackPolicy(ctx: ServiceContext, scopeId: string, input: unknown) {
  const g = await gate(ctx, scopeId);
  if (!g.ok) return g;
  const parsed = rollbackSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Geçersiz geri alma");
  const history = (await listPolicyVersions(scopeId, parsed.data.key)).filter((v) => v.status === "published" || v.status === "superseded");
  const current = history.find((v) => v.status === "published");
  if (!current) return fail("NOT_FOUND", "Bu politikanın yayınlanmış sürümü yok.");
  const target = parsed.data.toVersion
    ? history.find((v) => v.version === parsed.data.toVersion)
    : history.filter((v) => v.version < current.version).sort((a, b) => b.version - a.version)[0];
  if (!target) return fail("NOT_FOUND", "Dönülecek önceki sürüm yok.");
  if (target.id === current.id) return fail("VALIDATION_ERROR", "Zaten yayındaki sürüm.");
  if (parsed.data.confirm !== true) {
    return fail("VALIDATION_ERROR", "Geri alma için onay gerekir.", { requiresConfirm: true, from: current.version, to: target.version });
  }
  const res = await applyValue(ctx, scopeId, parsed.data.key, target.value, {
    reason: parsed.data.reason,
    rollbackOfVersion: target.version,
  });
  if (!res.ok) return res;
  await audit(ctx, scopeId, "platform.policy.rollback", res.data.version?.id ?? parsed.data.key, { version: current.version }, {
    key: parsed.data.key,
    restoredFromVersion: target.version,
    newVersion: res.data.version?.version ?? null,
    reason: parsed.data.reason,
  });
  return ok({ version: res.data.version, restoredFrom: target.version });
}
