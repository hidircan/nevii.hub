import { z } from "zod";
import { fail, ok, type ServiceResult } from "../services/result";
import type { ServiceContext } from "../services/context";
import { requireHyperAdmin } from "./access";
import { FEATURE_CATALOG, PLAN_FEATURE_DEFAULTS, isFeatureFlagKey } from "./features";
import { PLAN_CATALOG } from "./entitlements";
import { appendPlatformAudit, getPlatformTenant, listPlatformTenants, upsertPlatformTenant } from "./store";
import { listPolicyVersions, newPolicyVersionId, savePolicyVersion } from "./store-ext";
import { resolveSetting } from "./resolve";
import { COMMERCIAL_CATALOG_KEY, PLATFORM_SCOPE_ID } from "./policy-version-log";
import {
  FEATURE_FLAGS,

  PLAN_KEYS,
  PLAN_KEY_PATTERN,
  type FeatureFlagKey,
  type JsonValue,
  type LimitKind,
  type PolicyVersion,
  type SubscriptionSnapshot,
} from "./types";
import {
  listSaasInvitations,
  listSaasPendingOrders,
  listSaasPurchaseRequests,
  listSaasSubscriptions,
} from "../saas-billing/store";

/**
 * NeviiOS paket + modül + fiyat kataloğu.
 *
 * Katalog platform kapsamında TEK sürümlü bir belgedir (PolicyVersion,
 * anahtar `commercial.catalog`): düzenlemeler taslakta birikir (internal),
 * etki önizlemesi + onayla yayınlanır (kullanıcıya görünen), her yayın yeni
 * sürüm, geri alma eski sürümü silmeden yeni sürüm üretir.
 *
 * Kurumun aboneliği `subscription.snapshot` ile dondurulur: yayınlanan
 * değişiklikler yalnız YENİ aboneliklere (kurulum / paket değişimi) uygulanır.
 * Snapshot'ı olmayan eski kurumlar koddaki yerleşik paket tanımıyla çözülür
 * (davranış değişmez).
 *
 * Para: TRY, kuruş cinsinden tam sayı (`*Minor`). Liste fiyatları KDV
 * HARİÇ tutulur ve "+ KDV" ile gösterilir. Oran `saas-billing/tax.ts`
 * üzerinden gelir; oran doğrulanmadan gerçek checkout kapalıdır.
 */

export const TAX_NOTE = "Tutarlar KDV hariçtir (+ KDV).";

export type CatalogModule = {
  key: FeatureFlagKey;
  label: string;
  description: string;
  active: boolean;
  monthlyPriceMinor: number;
  yearlyPriceMinor: number;
  /** null = sınırsız */
  usageLimit: number | null;
  usageUnit: string | null;
  sellableAsAddon: boolean;
};

export type CatalogPlan = {
  key: string;
  label: string;
  description: string;
  status: "active" | "inactive";
  /** Eski paket (standard/professional): mevcut kurumlarda korunur, yeni kurumda seçilemez. */
  legacy: boolean;
  /** Kodda tanımlı yerleşik paket — silinemez, yalnız pasifleştirilir. */
  builtin: boolean;
  limits: Record<LimitKind, number | null>;
  includedModules: FeatureFlagKey[];
  pricing: "list" | "custom_quote";
  basePriceMonthlyMinor: number;
  basePriceYearlyMinor: number;
  /** false → kullanıcıya "Yayınlanmadı" gösterilir (fiyat internal kalır). */
  pricePublished: boolean;
};

export type CommercialCatalog = { currency: "TRY"; plans: CatalogPlan[]; modules: CatalogModule[] };

const minor = z.number().int().min(0).max(1_000_000_000);
const limitValue = z.number().int().min(0).max(1_000_000).nullable();
const moduleSchema = z.object({
  key: z.enum(FEATURE_FLAGS),
  label: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300),
  active: z.boolean(),
  monthlyPriceMinor: minor,
  yearlyPriceMinor: minor,
  usageLimit: z.number().int().min(0).max(100_000_000).nullable(),
  usageUnit: z.string().trim().max(30).nullable(),
  sellableAsAddon: z.boolean(),
});
const planSchema = z.object({
  key: z.string().regex(PLAN_KEY_PATTERN, "Paket anahtarı küçük harf/rakam/alt çizgi, 2-32 karakter"),
  label: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300),
  status: z.enum(["active", "inactive"]),
  legacy: z.boolean(),
  builtin: z.boolean(),
  limits: z.object({ students: limitValue, users: limitValue, branches: limitValue }),
  includedModules: z.array(z.enum(FEATURE_FLAGS)),
  pricing: z.enum(["list", "custom_quote"]),
  basePriceMonthlyMinor: minor,
  basePriceYearlyMinor: minor,
  pricePublished: z.boolean(),
});
export const commercialCatalogSchema = z.object({
  currency: z.literal("TRY"),
  plans: z.array(planSchema).min(1).max(50),
  modules: z.array(moduleSchema),
});

/** Yapısal bütünlük (şema dışı): tekil anahtarlar, yerleşik paketler korunur, modül listesi tam. */
export function validateCatalog(value: unknown): ServiceResult<CommercialCatalog> {
  const parsed = commercialCatalogSchema.safeParse(value);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Geçersiz katalog");
  const c = parsed.data as CommercialCatalog;
  const keys = c.plans.map((p) => p.key);
  if (new Set(keys).size !== keys.length) return fail("VALIDATION_ERROR", "Paket anahtarları tekil olmalı.");
  for (const k of PLAN_KEYS) {
    const p = c.plans.find((x) => x.key === k);
    // Yerleşik ESKİ (legacy) paket kullanım yoksa katalogdan kaldırılabilir;
    // güncel yerleşik paketler korunur.
    if (!p && !PLAN_CATALOG[k]?.legacy) return fail("VALIDATION_ERROR", `Yerleşik paket "${k}" silinemez; satıştan kaldırın.`);
    if (p && !p.builtin) return fail("VALIDATION_ERROR", `"${k}" yerleşik paket olarak kalmalı.`);
  }
  if (c.plans.some((p) => p.builtin && !(PLAN_KEYS as readonly string[]).includes(p.key))) {
    return fail("VALIDATION_ERROR", "Yeni paket 'yerleşik' işaretlenemez.");
  }
  const mkeys = new Set(c.modules.map((m) => m.key));
  if (mkeys.size !== c.modules.length || FEATURE_FLAGS.some((f) => !mkeys.has(f))) {
    return fail("VALIDATION_ERROR", "Her modül katalogda tam bir kez bulunmalı.");
  }
  return ok(c);
}

export function builtinCatalog(): CommercialCatalog {
  return {
    currency: "TRY",
    plans: PLAN_KEYS.map((key) => {
      const def = PLAN_CATALOG[key]!;
      return {
        key,
        label: def.label,
        description: "",
        status: "active" as const,
        legacy: Boolean(def.legacy),
        builtin: true,
        limits: { ...def.limits },
        includedModules: FEATURE_FLAGS.filter((f) => PLAN_FEATURE_DEFAULTS[key]?.[f]),
        pricing: def.price === "custom_quote" ? ("custom_quote" as const) : ("list" as const),
        basePriceMonthlyMinor: 0,
        basePriceYearlyMinor: 0,
        pricePublished: false,
      };
    }),
    modules: FEATURE_CATALOG.map((f) => ({
      key: f.key,
      label: f.label,
      description: f.description,
      active: true,
      monthlyPriceMinor: 0,
      yearlyPriceMinor: 0,
      usageLimit: null,
      usageUnit: null,
      sellableAsAddon: !f.required,
    })),
  };
}

// ───────────── Okuma ─────────────

async function versions(): Promise<PolicyVersion[]> {
  return listPolicyVersions(PLATFORM_SCOPE_ID, COMMERCIAL_CATALOG_KEY);
}

/** Yayındaki katalog (kullanıcıya görünen). Hiç yayın yoksa yerleşik katalog, sürüm null. */
export async function getPublishedCatalog(): Promise<{ catalog: CommercialCatalog; version: number | null }> {
  const pub = (await versions()).find((v) => v.status === "published");
  if (pub) {
    const valid = validateCatalog(pub.value);
    if (valid.ok) return { catalog: valid.data, version: pub.version };
  }
  return { catalog: builtinCatalog(), version: null };
}

async function getDraftVersion(): Promise<PolicyVersion | null> {
  return (await versions()).find((v) => v.status === "draft") ?? null;
}

/**
 * Yayındaki katalogdan paket anahtarı → görünen ad eşlemesi.
 * Kurum/abonelik/başvuru listeleri bu kaynaktan ad çözer; yayında olmayan
 * anahtar için senkron `planLabel` yedeği kullanılır.
 */
export async function getPlanNameMap(): Promise<Map<string, string>> {
  try {
    const { catalog } = await getPublishedCatalog();
    return new Map(catalog.plans.map((p) => [p.key, p.label]));
  } catch {
    return new Map();
  }
}

/** Aktif abonelik sayısı = paketi kullanan, arşivlenmemiş kurum. */
export async function planUsage(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of await listPlatformTenants()) {
    if (t.lifecycle === "archived") continue;
    out[t.planKey] = (out[t.planKey] ?? 0) + 1;
  }
  return out;
}

export async function getCatalogOverview(ctx: ServiceContext) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const [published, draft, usage, history] = await Promise.all([getPublishedCatalog(), getDraftVersion(), planUsage(), versions()]);
  const draftCatalog = draft ? validateCatalog(draft.value) : null;
  return ok({
    published: published.catalog,
    publishedVersion: published.version,
    draft: draftCatalog?.ok ? draftCatalog.data : null,
    draftId: draft?.id ?? null,
    draftVersion: draft?.version ?? null,
    usage,
    history: history
      .filter((v) => v.status !== "draft")
      .map((v) => ({ id: v.id, version: v.version, status: v.status, reason: v.reason, publishedAt: v.publishedAt, publishedBy: v.publishedBy, rollbackOfVersion: v.rollbackOfVersion })),
    taxNote: TAX_NOTE,
  });
}

// ───────────── Fiyat motoru (saf) ─────────────

export type PriceLine = { kind: "base" | "included_module" | "addon" | "adjustment"; key: string; label: string; amountMinor: number };
export type PriceQuote = {
  currency: "TRY";
  cycle: "monthly" | "yearly";
  planKey: string;
  customQuote: boolean;
  lines: PriceLine[];
  subtotalMinor: number;
  adjustmentMinor: number;
  /** custom_quote paketlerde null ("Özel teklif"). */
  totalMinor: number | null;
  taxIncluded: false;
  taxNote: string;
};

export const priceInputSchema = z.object({
  planKey: z.string().min(1),
  cycle: z.enum(["monthly", "yearly"]),
  addons: z.array(z.enum(FEATURE_FLAGS)).max(FEATURE_FLAGS.length).default([]),
  adjustment: z
    .object({
      type: z.enum(["discount_percent", "discount_amount", "override_total"]),
      value: z.number().int().min(0).max(1_000_000_000),
      reason: z.string().trim().min(5).max(200),
    })
    .nullable()
    .optional(),
});
export type PriceInput = z.input<typeof priceInputSchema>;

/**
 * basePrice + dahil modüller + seçili eklentiler ± override/indirim = toplam.
 * Pasif modül fiyata girmez; pakette zaten dahil olan modül eklenti olamaz.
 */
export function computePlanPrice(catalog: CommercialCatalog, raw: PriceInput): ServiceResult<PriceQuote> {
  const parsed = priceInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Geçersiz fiyat girdisi");
  const input = parsed.data;
  const plan = catalog.plans.find((p) => p.key === input.planKey);
  if (!plan) return fail("NOT_FOUND", "Paket katalogda yok");
  const yearly = input.cycle === "yearly";
  const priceOf = (m: CatalogModule) => (yearly ? m.yearlyPriceMinor : m.monthlyPriceMinor);
  const modules = new Map(catalog.modules.map((m) => [m.key, m]));
  const lines: PriceLine[] = [
    { kind: "base", key: plan.key, label: `${plan.label} temel ücret`, amountMinor: yearly ? plan.basePriceYearlyMinor : plan.basePriceMonthlyMinor },
  ];
  for (const k of plan.includedModules) {
    const m = modules.get(k);
    if (m?.active) lines.push({ kind: "included_module", key: k, label: `${m.label} (dahil)`, amountMinor: priceOf(m) });
  }
  for (const k of new Set(input.addons)) {
    const m = modules.get(k);
    if (!m) return fail("NOT_FOUND", `Modül yok: ${k}`);
    if (plan.includedModules.includes(k)) return fail("VALIDATION_ERROR", `"${m.label}" pakette zaten dahil; eklenti olarak eklenemez.`);
    if (!m.active || !m.sellableAsAddon) return fail("VALIDATION_ERROR", `"${m.label}" eklenti olarak satılamaz.`);
    lines.push({ kind: "addon", key: k, label: `${m.label} (eklenti)`, amountMinor: priceOf(m) });
  }
  const subtotal = lines.reduce((n, l) => n + l.amountMinor, 0);
  let adjustment = 0;
  const adj = input.adjustment;
  if (adj) {
    if (adj.type === "discount_percent") {
      if (adj.value > 100) return fail("VALIDATION_ERROR", "İndirim yüzdesi 0-100 olmalı.");
      adjustment = -Math.round((subtotal * adj.value) / 100);
    } else if (adj.type === "discount_amount") {
      adjustment = -Math.min(adj.value, subtotal);
    } else {
      adjustment = adj.value - subtotal;
    }
    lines.push({ kind: "adjustment", key: adj.type, label: `Düzeltme: ${adj.reason}`, amountMinor: adjustment });
  }
  const customQuote = plan.pricing === "custom_quote";
  return ok({
    currency: "TRY",
    cycle: input.cycle,
    planKey: plan.key,
    customQuote,
    lines,
    subtotalMinor: subtotal,
    adjustmentMinor: adjustment,
    totalMinor: customQuote && !adj ? null : Math.max(0, subtotal + adjustment),
    taxIncluded: false,
    taxNote: TAX_NOTE,
  });
}

/** Kullanıcıya görünen fiyatlar: yalnız yayındaki katalog + fiyatı yayınlanmış aktif, yeni kurumda seçilebilir paketler. */
export async function getPublicPriceList() {
  const { catalog, version } = await getPublishedCatalog();
  return {
    currency: "TRY" as const,
    catalogVersion: version,
    taxNote: TAX_NOTE,
    plans: catalog.plans
      .filter((p) => p.status === "active" && !p.legacy)
      .map((p) => {
        const monthly = computePlanPrice(catalog, { planKey: p.key, cycle: "monthly", addons: [] });
        const yearly = computePlanPrice(catalog, { planKey: p.key, cycle: "yearly", addons: [] });
        const visible = p.pricePublished && p.pricing === "list";
        return {
          key: p.key,
          label: p.label,
          description: p.description,
          limits: p.limits,
          includedModules: p.includedModules,
          price:
            p.pricing === "custom_quote"
              ? { status: "custom_quote" as const, label: "Özel teklif" }
              : visible && monthly.ok && yearly.ok
                ? { status: "published" as const, monthlyMinor: monthly.data.totalMinor, yearlyMinor: yearly.data.totalMinor }
                : { status: "unpublished" as const, label: "Yayınlanmadı" },
        };
      }),
    addons: catalog.modules
      .filter((m) => m.active && m.sellableAsAddon)
      .map((m) => ({ key: m.key, label: m.label, description: m.description, usageLimit: m.usageLimit, usageUnit: m.usageUnit })),
  };
}

// ───────────── Taslak düzenleme (internal) ─────────────

async function audit(ctx: ServiceContext, action: string, entityId: string, before: unknown, after: unknown, targetTenantId: string | null = null) {
  await appendPlatformAudit({
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    actorTenantId: ctx.tenantId,
    targetTenantId,
    action,
    entityType: "CommercialCatalog",
    entityId,
    before: (before ?? null) as never,
    after: (after ?? null) as never,
    requestId: ctx.requestId || "n/a",
    outcome: "success",
  });
}

/** Taslağı (yoksa yayındakinin kopyası) değiştirir; her değişiklik audit'e önceki/yeni değerle yazılır. */
async function mutateDraft(
  ctx: ServiceContext,
  action: string,
  entityId: string,
  reason: string,
  fn: (c: CommercialCatalog) => ServiceResult<{ before: unknown; after: unknown }>
) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const existing = await getDraftVersion();
  const base = existing ? validateCatalog(existing.value) : ok((await getPublishedCatalog()).catalog);
  if (!base.ok) return base;
  const catalog = structuredClone(base.data);
  const change = fn(catalog);
  if (!change.ok) return change;
  const valid = validateCatalog(catalog);
  if (!valid.ok) return valid;
  const history = await versions();
  const draft = await savePolicyVersion(
    existing
      ? { ...existing, value: valid.data as unknown as JsonValue, reason }
      : {
          id: newPolicyVersionId(),
          scopeId: PLATFORM_SCOPE_ID,
          key: COMMERCIAL_CATALOG_KEY,
          version: Math.max(0, ...history.map((h) => h.version)) + 1,
          status: "draft",
          value: valid.data as unknown as JsonValue,
          reason,
          createdBy: ctx.userId,
          createdAt: new Date().toISOString(),
          publishedBy: null,
          publishedAt: null,
          rollbackOfVersion: null,
        }
  );
  await audit(ctx, action, entityId, change.data.before, { ...(change.data.after as object), draftVersion: draft.version, reason });
  return ok({ draftId: draft.id, draftVersion: draft.version, catalog: valid.data });
}

const reasonField = z.string().trim().min(5, "Gerekçe en az 5 karakter").max(300);
const planInputSchema = planSchema.omit({ builtin: true, legacy: true }).extend({ reason: reasonField });

export async function upsertCatalogPlan(ctx: ServiceContext, input: unknown) {
  const parsed = planInputSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Geçersiz paket");
  const { reason, ...p } = parsed.data;
  return mutateDraft(ctx, "platform.catalog.plan_upsert", p.key, reason, (c) => {
    const idx = c.plans.findIndex((x) => x.key === p.key);
    const before = idx >= 0 ? c.plans[idx]! : null;
    const next: CatalogPlan = { ...p, builtin: before?.builtin ?? false, legacy: before?.legacy ?? false };
    if (idx >= 0) c.plans[idx] = next;
    else c.plans.push(next);
    return ok({ before, after: next });
  });
}

export async function setCatalogPlanStatus(ctx: ServiceContext, input: unknown) {
  const parsed = z.object({ key: z.string().min(1), status: z.enum(["active", "inactive"]), reason: reasonField }).safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Geçersiz istek");
  return mutateDraft(ctx, "platform.catalog.plan_status", parsed.data.key, parsed.data.reason, (c) => {
    const plan = c.plans.find((x) => x.key === parsed.data.key);
    if (!plan) return fail("NOT_FOUND", "Paket bulunamadı");
    const before = { status: plan.status };
    plan.status = parsed.data.status;
    return ok({ before, after: { status: plan.status, note: "Pasif paket yeni kurumda seçilemez; mevcut abonelikler snapshot ile sürer." } });
  });
}

/**
 * Kalıcı silme — YALNIZ canlı kaydı olmayan paket: özel paketler her zaman
 * adaydır; yerleşik ESKİ (legacy) paketler de kullanım yoksa silinebilir.
 * Yerleşik güncel paketler korunur (plan anahtarları kod varsayılanlarında
 * ve sağlayıcı eşleşmelerinde kullanılır).
 */
export async function deleteCatalogPlan(ctx: ServiceContext, input: unknown) {
  const parsed = z.object({ key: z.string().min(1), reason: reasonField }).safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Geçersiz istek");
  const refs = await planReferences(parsed.data.key);
  const blocked =
    refs.tenants +
    refs.subscriptions +
    refs.pendingInvitations +
    refs.awaitingOrders +
    refs.pendingPurchaseRequests +
    refs.trialSetting;
  if (blocked > 0) {
    const parts = [
      refs.tenants ? `${refs.tenants} kurum` : "",
      refs.subscriptions ? `${refs.subscriptions} abonelik` : "",
      refs.pendingInvitations ? `${refs.pendingInvitations} bekleyen davet` : "",
      refs.awaitingOrders ? `${refs.awaitingOrders} ödeme bekleyen sipariş` : "",
      refs.pendingPurchaseRequests ? `${refs.pendingPurchaseRequests} bekleyen başvuru` : "",
      refs.trialSetting ? "deneme paketi ayarı" : "",
    ].filter(Boolean);
    return fail(
      "FORBIDDEN",
      `Bu paket kullanımda (${parts.join(", ")}); kalıcı silinemez. Önce satıştan kaldırın ve kayıtları başka pakete taşıyın.`,
      // activeSubscriptions: eski adla korunan kurum sayısı (geriye uyumluluk).
      { activeSubscriptions: refs.tenants, references: refs }
    );
  }
  return mutateDraft(ctx, "platform.catalog.plan_delete", parsed.data.key, parsed.data.reason, (c) => {
    const plan = c.plans.find((x) => x.key === parsed.data.key);
    if (!plan) return fail("NOT_FOUND", "Paket bulunamadı");
    if (plan.builtin && !plan.legacy) return fail("FORBIDDEN", "Yerleşik paket silinemez; satıştan kaldırın.");
    c.plans = c.plans.filter((x) => x.key !== plan.key);
    return ok({ before: plan, after: { deleted: true } });
  });
}

export type PlanReferenceCounts = {
  tenants: number;
  subscriptions: number;
  pendingInvitations: number;
  awaitingOrders: number;
  pendingPurchaseRequests: number;
  trialSetting: number;
};

/**
 * Paket anahtarını kullanan CANLI kayıtlar. Silme/anahtar değişimi öncesi
 * engel kontrolü; geçmiş (tüketilmiş/süresi dolmuş) kayıtlar engel değildir
 * çünkü tarihsel belgeler snapshot taşır.
 */
export async function planReferences(key: string): Promise<PlanReferenceCounts> {
  const usage = await planUsage();
  const [subs, invitations, orders, purchases, trial] = await Promise.all([
    listSaasSubscriptions(200).catch(() => []),
    listSaasInvitations(200).catch(() => []),
    listSaasPendingOrders(200).catch(() => []),
    listSaasPurchaseRequests(200).catch(() => []),
    resolveSetting({ tenantId: "platform" }, "billing.trialPlanKey").catch(() => null),
  ]);
  return {
    tenants: usage[key] ?? 0,
    subscriptions: subs.filter((s) => s.planKey === key).length,
    pendingInvitations: invitations.filter((i) => i.planKey === key && i.status === "pending").length,
    awaitingOrders: orders.filter((o) => o.planKey === key && o.status === "awaiting_payment").length,
    pendingPurchaseRequests: purchases.filter((r) => r.planKey === key && r.status === "pending").length,
    trialSetting: trial?.effectiveValue === key ? 1 : 0,
  };
}

const renameInputSchema = z.object({ key: z.string().min(1), newKey: z.string().regex(PLAN_KEY_PATTERN), reason: reasonField });

/**
 * Paket anahtarı değişimi — YALNIZ hiç kullanılmayan, yerleşik olmayan paket.
 * Anahtar; kurum, abonelik, davet, sipariş ve sağlayıcı eşleşmelerinin teknik
 * kimliğidir: kullanımdayken değişirse geçmiş kayıtlar çözülemez. Görünen
 * paket adı (label) her zaman serbestçe değiştirilebilir; anahtar değişimi
 * bu güvenli sınır içinde yapılır.
 */
export async function renameCatalogPlan(ctx: ServiceContext, input: unknown) {
  const parsed = renameInputSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Geçersiz istek");
  const { key, newKey, reason } = parsed.data;
  if (key === newKey) return fail("VALIDATION_ERROR", "Yeni anahtar eskisiyle aynı.");
  const refs = await planReferences(key);
  const blocked =
    refs.tenants +
    refs.subscriptions +
    refs.pendingInvitations +
    refs.awaitingOrders +
    refs.pendingPurchaseRequests +
    refs.trialSetting;
  if (blocked > 0) {
    const parts = [
      refs.tenants ? `${refs.tenants} kurum` : "",
      refs.subscriptions ? `${refs.subscriptions} abonelik` : "",
      refs.pendingInvitations ? `${refs.pendingInvitations} bekleyen davet` : "",
      refs.awaitingOrders ? `${refs.awaitingOrders} ödeme bekleyen sipariş` : "",
      refs.pendingPurchaseRequests ? `${refs.pendingPurchaseRequests} bekleyen başvuru` : "",
      refs.trialSetting ? "deneme paketi ayarı" : "",
    ].filter(Boolean);
    return fail(
      "FORBIDDEN",
      `Bu anahtar kullanımda (${parts.join(", ")}); değiştirilemez. Görünen paket adını değiştirebilirsiniz.`,
      { references: refs }
    );
  }
  return mutateDraft(ctx, "platform.catalog.plan_rename", key, reason, (c) => {
    const plan = c.plans.find((x) => x.key === key);
    if (!plan) return fail("NOT_FOUND", "Paket bulunamadı");
    if (plan.builtin)
      return fail(
        "FORBIDDEN",
        "Yerleşik paketin anahtarı sistemin sabit kimliğidir (katalog bütünlüğü, deneme ve kurulum varsayılanları); değişmez. Müşterinin gördüğü paket adını değiştirip yayınlayabilirsiniz — anasayfaya yansır."
      );
    if (c.plans.some((x) => x.key === newKey)) return fail("CONFLICT", "Bu anahtar başka pakette kullanılıyor.");
    plan.key = newKey;
    return ok({ before: { key }, after: { key: newKey } });
  });
}

const moduleInputSchema = moduleSchema.extend({ reason: reasonField });

export async function upsertCatalogModule(ctx: ServiceContext, input: unknown) {
  const parsed = moduleInputSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Geçersiz modül");
  const { reason, ...m } = parsed.data;
  return mutateDraft(ctx, "platform.catalog.module_upsert", m.key, reason, (c) => {
    const idx = c.modules.findIndex((x) => x.key === m.key);
    if (idx < 0) return fail("NOT_FOUND", "Modül bulunamadı");
    const before = c.modules[idx]!;
    c.modules[idx] = m as CatalogModule;
    return ok({ before, after: m });
  });
}

/** Yayın önizlemesi için: kaldırılan paketlerin aktif aboneliği = engel; korunan abonelik sayısı = not. */
export async function catalogPublishImpact(before: unknown, after: unknown): Promise<{ notes: string[]; blockers: string[] }> {
  const notes: string[] = [];
  const blockers: string[] = [];
  const next = validateCatalog(after);
  if (!next.ok) return { notes, blockers: [next.error.message] };
  const prev = validateCatalog(before);
  const prevPlans = prev.ok ? prev.data.plans : builtinCatalog().plans;
  const usage = await planUsage();
  for (const p of prevPlans) {
    if (!next.data.plans.some((x) => x.key === p.key) && (usage[p.key] ?? 0) > 0) {
      blockers.push(`"${p.label}" paketinin ${usage[p.key]} aktif aboneliği var; silinemez.`);
    }
  }
  const affected = next.data.plans.filter((p) => {
    const old = prevPlans.find((x) => x.key === p.key);
    return old && JSON.stringify(old) !== JSON.stringify(p);
  });
  for (const p of affected) {
    const n = usage[p.key] ?? 0;
    notes.push(`${p.label}: değişti — ${n} mevcut abonelik snapshot ile korunur; yalnız yeni aboneliklere uygulanır.`);
  }
  const newly = next.data.plans.filter((p) => !prevPlans.some((x) => x.key === p.key));
  if (newly.length) notes.push(`Yeni paket: ${newly.map((p) => p.label).join(", ")}`);
  notes.push(TAX_NOTE);
  return { notes, blockers };
}

// ───────────── Abonelik (snapshot) ─────────────

export function snapshotFromPlan(
  catalog: CommercialCatalog,
  plan: CatalogPlan,
  catalogVersion: number | null,
  by: string
): SubscriptionSnapshot {
  const mod = new Map(catalog.modules.map((m) => [m.key, m]));
  const pick = (yearly: boolean) =>
    Object.fromEntries(
      plan.includedModules.filter((k) => mod.get(k)?.active).map((k) => [k, yearly ? mod.get(k)!.yearlyPriceMinor : mod.get(k)!.monthlyPriceMinor])
    ) as Partial<Record<FeatureFlagKey, number>>;
  return {
    planKey: plan.key,
    planLabel: plan.label,
    catalogVersion,
    limits: { ...plan.limits },
    includedModules: [...plan.includedModules],
    pricing: {
      currency: "TRY",
      mode: plan.pricing,
      basePriceMonthlyMinor: plan.basePriceMonthlyMinor,
      basePriceYearlyMinor: plan.basePriceYearlyMinor,
      modulePricesMonthlyMinor: pick(false),
      modulePricesYearlyMinor: pick(true),
      published: plan.pricePublished,
    },
    subscribedAt: new Date().toISOString(),
    subscribedBy: by,
  };
}

/**
 * Kurumu yayındaki katalogdaki pakete abone eder: paket anahtarı + snapshot.
 * Yeni abonelik yalnız aktif, legacy olmayan pakete; mevcut legacy paket
 * yerinde kalabilir (snapshot yenilenmez).
 */
export async function subscribeTenantToPlan(
  ctx: ServiceContext,
  tenantId: string,
  planKey: string,
  reason: string
): Promise<ServiceResult<{ snapshot: SubscriptionSnapshot }>> {
  const tenant = await getPlatformTenant(tenantId);
  if (!tenant) return fail("NOT_FOUND", "Kurum bulunamadı");
  const { catalog, version } = await getPublishedCatalog();
  const plan = catalog.plans.find((p) => p.key === planKey);
  if (!plan) return fail("NOT_FOUND", "Paket yayındaki katalogda yok.");
  if (plan.status !== "active" || plan.legacy) {
    return fail("VALIDATION_ERROR", `"${plan.label}" yeni abonelik için seçilemez (pasif veya eski paket).`);
  }
  const snapshot = snapshotFromPlan(catalog, plan, version, ctx.userId);
  // Tam kayıtla upsert: yaşam döngüsü/profil alanları korunur.
  if (tenant.planKey !== planKey) await upsertPlatformTenant({ ...tenant, planKey }, ctx.userId);
  const { applySettingWrite } = await import("./service");
  const res = await applySettingWrite({
    ctx,
    scopeType: "tenant",
    scopeId: tenantId,
    key: "subscription.snapshot",
    value: snapshot,
    targetTenantId: tenantId,
    confirm: true,
    version: { reason },
  });
  if (!res.ok) return res;
  await audit(ctx, "platform.subscription.snapshot", tenantId, { planKey: tenant.planKey }, { planKey, catalogVersion: version, reason }, tenantId);
  return ok({ snapshot });
}

export function isKnownModule(k: string): k is FeatureFlagKey {
  return isFeatureFlagKey(k);
}
