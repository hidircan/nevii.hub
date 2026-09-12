import { fail, ok, type ServiceResult } from "../services/result";
import type { LimitKind, PlanKey, SubscriptionSnapshot } from "./types";
import { subscriptionSnapshotSchema } from "./catalog";
import { LIMIT_KINDS } from "./types";
import { getPlatformTenant, listSettingOverrides } from "./store";
import { resolveSettingFromOverrides } from "./resolve";

/**
 * NeviiOS paket kataloğu. Entitlement (hangi modüller) `PLAN_FEATURE_DEFAULTS`
 * (features.ts) ile, limitler burada tanımlanır. `null` = sınırsız/özel.
 * Fiyatlar V1'de kullanıcıya gösterilmez ("Yayınlanmadı" / "Özel teklif").
 *
 * ponytail: paketler kodda sabit — fiyat/sürümleme kesinleşince
 * Plan/PlanVersion tablosuna taşınır. `standard` ve `professional` legacy
 * kurumların davranışı değişmesin diye korunur (yeni kurumda seçilemez).
 */
export const PLAN_CATALOG: Record<
  PlanKey,
  { label: string; limits: Record<LimitKind, number | null>; price: "unpublished" | "custom_quote"; legacy?: boolean }
> = {
  starter: { label: "Starter", limits: { students: 100, users: 3, branches: 1 }, price: "unpublished" },
  core: { label: "Core", limits: { students: 300, users: 10, branches: 2 }, price: "unpublished" },
  pro: { label: "Pro", limits: { students: 750, users: 25, branches: 5 }, price: "unpublished" },
  scale: { label: "Scale", limits: { students: 2000, users: 75, branches: 15 }, price: "unpublished" },
  enterprise: { label: "Enterprise", limits: { students: null, users: null, branches: null }, price: "custom_quote" },
  standard: { label: "Standard (legacy)", limits: { students: null, users: null, branches: null }, price: "unpublished", legacy: true },
  professional: { label: "Professional (legacy)", limits: { students: 750, users: 25, branches: 5 }, price: "unpublished", legacy: true },
};

export const PRICE_LABELS = { unpublished: "Yayınlanmadı", custom_quote: "Özel teklif" } as const;

/** "users" limiti personel koltuğudur — öğrenci/veli portal hesapları ve AI ajanı sayılmaz. */
export const STAFF_SEAT_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "BRANCH_MANAGER", "TEACHER"] as const;

export const LIMIT_LABELS: Record<LimitKind, string> = {
  students: "Aktif öğrenci",
  users: "Personel kullanıcısı",
  branches: "Şube",
};

/** Limit override: süreli, gerekçeli (audit: platform.setting.update / policy.publish). */
export type LimitOverrideEntry = { value: number | null; reason: string; expiresAt: string };

/** Görünen paket adı — katalogda oluşturulmuş anahtarlar için anahtarın kendisi (senkron yardımcı). */
export function planLabel(key: string): string {
  return PLAN_CATALOG[key]?.label ?? key;
}

/** Kurumun aktif abonelik snapshot'ı (paket anahtarı eşleşmiyorsa bayat sayılır → null). */
export function snapshotFor(
  overrides: Awaited<ReturnType<typeof listSettingOverrides>>,
  tenantId: string,
  plan: PlanKey
): SubscriptionSnapshot | null {
  const raw = resolveSettingFromOverrides("subscription.snapshot", overrides, { tenantId, planKey: plan })?.effectiveValue;
  const parsed = subscriptionSnapshotSchema.safeParse(raw);
  return parsed.success && parsed.data.planKey === plan ? (parsed.data as SubscriptionSnapshot) : null;
}

/**
 * Limit kaynağı: abonelik snapshot'ı → yerleşik paket tanımı → yayındaki
 * katalog → (hiçbiri yoksa) 0 = yeni kayıt kapalı (fail-closed; veri silinmez).
 */
export async function resolveTenantLimits(
  tenantId: string,
  planKey?: PlanKey
): Promise<Record<LimitKind, number | null>> {
  const tenant = planKey ? null : await getPlatformTenant(tenantId);
  const plan: PlanKey = planKey ?? tenant?.planKey ?? "standard";
  const overrides = await listSettingOverrides({ tenantId, planKey: plan });
  const snapshot = snapshotFor(overrides, tenantId, plan);
  let baseLimits = snapshot?.limits ?? PLAN_CATALOG[plan]?.limits ?? null;
  if (!baseLimits) {
    const { getPublishedCatalog } = await import("./commercial-catalog");
    baseLimits = (await getPublishedCatalog()).catalog.plans.find((p) => p.key === plan)?.limits ?? { students: 0, users: 0, branches: 0 };
  }
  const base = { ...baseLimits };
  const raw = resolveSettingFromOverrides("subscription.limitOverrides", overrides, { tenantId, planKey: plan })
    ?.effectiveValue as Partial<Record<LimitKind, LimitOverrideEntry>> | undefined;
  const now = Date.now();
  for (const k of LIMIT_KINDS) {
    const entry = raw?.[k];
    // Süresi dolmuş override yok sayılır → paket limitine dönülür.
    if (entry && new Date(entry.expiresAt).getTime() > now) base[k] = entry.value;
  }
  return base;
}

/**
 * Yalnız YENİ kayıt/davet/şube işlemini engeller; mevcut veri asla silinmez
 * veya pasifleştirilmez (paket düşürme dahil).
 */
export async function assertWithinLimit(
  tenantId: string,
  kind: LimitKind,
  currentCount: number
): Promise<ServiceResult<true>> {
  const limits = await resolveTenantLimits(tenantId);
  const max = limits[kind];
  if (max === null || currentCount < max) return ok(true);
  return fail(
    "FORBIDDEN",
    `Paket limiti doldu: ${LIMIT_LABELS[kind]} (${currentCount}/${max}). Mevcut veriler korunur; yeni kayıt için paket yükseltin.`,
    { limit: kind, max, current: currentCount }
  );
}
