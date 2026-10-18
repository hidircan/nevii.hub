/**
 * Paket 5 — yüzde tabanlı kampanya/indirim hesaplama yardımcıları. Saf
 * fonksiyonlar (store/tenant bağımlılığı yok) — unit test edilebilir.
 *
 * "Kardeş" ilişkisi veri modelinde ayrı bir alan olarak YOK; burada aynı
 * `Student.parentPhone`'a kayıtlı aktif öğrenci sayısı pratik vekil olarak
 * kullanılır. Bu bilinçli bir basitleştirme — gerçek bir aile/kardeş
 * modeli (ör. `familyId`) eklenmesi ayrı bir karardır.
 */
import { enrollmentTermsList } from "./student-enrollments";
import type { AppData, BranchId, CampaignStackingRule, DiscountCampaign, Student, StudentRef } from "./types";
import { uid } from "./utils";

/** Aynı veli telefonuna kayıtlı AKTİF öğrenci sayısı (kendisi dahil). */
export function countActiveHouseholdMembers(students: Student[], studentId: string): number {
  const student = students.find((s) => s.id === studentId);
  if (!student || !student.parentPhone?.trim()) return 1;
  return students.filter((s) => s.active && s.parentPhone === student.parentPhone).length;
}

function isWithinWindow(campaign: DiscountCampaign, now: Date): boolean {
  if (campaign.validFrom && now < new Date(campaign.validFrom)) return false;
  if (campaign.validTo && now > new Date(campaign.validTo)) return false;
  return true;
}

/** Bu şube/kurum kapsamında şu an geçerli, aktif bir "sibling" kampanyası var mı? */
export function findApplicableSiblingCampaign(
  campaigns: DiscountCampaign[],
  branchId: string | undefined,
  now: Date = new Date()
): DiscountCampaign | undefined {
  return campaigns.find(
    (c) => c.kind === "sibling" && c.active && (!c.branchId || c.branchId === branchId) && isWithinWindow(c, now)
  );
}

/** Yüzde indirim uygulanmış fiyat — TL, tam sayıya yuvarlanır (Payment.amount ile aynı kural). */
export function applyPercentDiscount(basePrice: number, discountPercent: number): number {
  const clamped = Math.min(100, Math.max(0, discountPercent));
  return Math.round(basePrice * (1 - clamped / 100));
}

/**
 * Bir öğrenci için, aktif bir "sibling" kampanyası ve ≥2 hane üyesi varsa
 * indirimli fiyatı döner; aksi halde `undefined` (kampanya uygulanamaz).
 */
export function previewSiblingDiscount(
  students: Student[],
  studentId: string,
  branchId: string | undefined,
  basePrice: number,
  campaigns: DiscountCampaign[],
  now: Date = new Date()
): { campaign: DiscountCampaign; discountedPrice: number } | undefined {
  const campaign = findApplicableSiblingCampaign(campaigns, branchId, now);
  if (!campaign) return undefined;
  const householdSize = countActiveHouseholdMembers(students, studentId);
  if (householdSize < 2) return undefined;
  return { campaign, discountedPrice: applyPercentDiscount(basePrice, campaign.discountPercent) };
}

export type DiscountCampaignInput = {
  name: string;
  description?: string;
  kind: DiscountCampaign["kind"];
  discountPercent: number;
  validFrom?: string;
  validTo?: string;
  branchId?: string;
  applicableBranchIds?: BranchId[];
  stackingRule?: CampaignStackingRule;
  priority?: number;
  maxUsageCount?: number;
  conditions?: Record<string, unknown>;
  createdBy: string;
  createdByUserId?: string;
};

export const STACKING_RULE_LABELS: Record<CampaignStackingRule, string> = {
  none: "Bu kampanya diğerleriyle toplanamaz",
  additive: "Bu kampanya diğerleriyle toplanır",
  override: "Bu kampanya diğerlerini ezer",
  yield: "Başka kampanya varsa devreye girmez",
};

export type DiscountCampaignMutationResult =
  | { ok: true; data: AppData; campaign: DiscountCampaign }
  | { ok: false; message: string };

/** Store-agnostic saf veri dönüşümü — aynı desen `packages.ts` createPackageData. */
export function createDiscountCampaignData(
  data: AppData,
  input: DiscountCampaignInput,
  now: Date = new Date()
): DiscountCampaignMutationResult {
  if (!input.name.trim()) return { ok: false, message: "Kampanya adı boş olamaz." };
  if (!Number.isInteger(input.discountPercent) || input.discountPercent < 1 || input.discountPercent > 100) {
    return { ok: false, message: "İndirim oranı 1-100 arası tam sayı olmalı." };
  }
  if (input.priority !== undefined && (!Number.isInteger(input.priority) || input.priority < 0)) {
    return { ok: false, message: "Öncelik negatif olmayan bir tam sayı olmalı." };
  }
  if (input.maxUsageCount !== undefined && (!Number.isInteger(input.maxUsageCount) || input.maxUsageCount < 1)) {
    return { ok: false, message: "Kullanım limiti 1 veya üzeri bir tam sayı olmalı (boş = sınırsız)." };
  }
  if (input.validFrom && input.validTo && input.validFrom > input.validTo) {
    return { ok: false, message: "Geçerlilik başlangıcı bitişten sonra olamaz." };
  }
  const nowIso = now.toISOString();
  // displayId burada atanmaz — store katmanı atar (bu dosya istemci paketine
  // de girer, sunucu-only `entity-sequence` import YASAK).
  const campaign: DiscountCampaign = {
    id: uid("campaign"),
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    kind: input.kind,
    discountPercent: input.discountPercent,
    active: true,
    validFrom: input.validFrom,
    validTo: input.validTo,
    branchId: input.branchId as DiscountCampaign["branchId"],
    applicableBranchIds: input.applicableBranchIds?.length ? [...input.applicableBranchIds] : undefined,
    stackingRule: input.stackingRule ?? "none",
    priority: input.priority ?? 0,
    maxUsageCount: input.maxUsageCount,
    usageCount: 0,
    conditions: input.conditions,
    createdBy: input.createdBy,
    createdByUserId: input.createdByUserId,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  return {
    ok: true,
    data: { ...data, discountCampaigns: [...(data.discountCampaigns ?? []), campaign] },
    campaign,
  };
}

export type DiscountCampaignPatch = Partial<
  Pick<
    DiscountCampaign,
    | "name"
    | "description"
    | "discountPercent"
    | "active"
    | "validFrom"
    | "validTo"
    | "applicableBranchIds"
    | "stackingRule"
    | "priority"
    | "usageCount"
    | "conditions"
    | "deletedAt"
    | "deletedByUserId"
    | "deletionReason"
  >
> & {
  /** null = tekil şube kapsamını temizle (tüm şubeler). */
  branchId?: DiscountCampaign["branchId"] | null;
  /** null = limiti kaldır (sınırsız). */
  maxUsageCount?: number | null;
};

export function updateDiscountCampaignData(
  data: AppData,
  campaignId: string,
  patch: DiscountCampaignPatch,
  now: Date = new Date()
): DiscountCampaignMutationResult {
  const existing = (data.discountCampaigns ?? []).find((c) => c.id === campaignId);
  if (!existing) return { ok: false, message: "Kampanya bulunamadı." };
  if (existing.deletedAt) {
    return { ok: false, message: "Bu kampanya silinmiş; düzenlenemez veya yeniden etkinleştirilemez. Gerekirse yeni kampanya oluşturun." };
  }
  if (
    patch.discountPercent !== undefined &&
    (!Number.isInteger(patch.discountPercent) || patch.discountPercent < 1 || patch.discountPercent > 100)
  ) {
    return { ok: false, message: "İndirim oranı 1-100 arası tam sayı olmalı." };
  }
  if (patch.name !== undefined && !patch.name.trim()) {
    return { ok: false, message: "Kampanya adı boş olamaz." };
  }
  if (patch.priority !== undefined && (!Number.isInteger(patch.priority) || patch.priority < 0)) {
    return { ok: false, message: "Öncelik negatif olmayan bir tam sayı olmalı." };
  }
  if (
    patch.maxUsageCount !== undefined &&
    patch.maxUsageCount !== null &&
    (!Number.isInteger(patch.maxUsageCount) || (patch.maxUsageCount as number) < 1)
  ) {
    return { ok: false, message: "Kullanım limiti 1 veya üzeri bir tam sayı olmalı (boş = sınırsız)." };
  }
  if (patch.usageCount !== undefined && (!Number.isInteger(patch.usageCount) || patch.usageCount < 0)) {
    return { ok: false, message: "Kullanım sayısı negatif olamaz." };
  }
  if (
    patch.stackingRule !== undefined &&
    patch.stackingRule !== "none" &&
    patch.stackingRule !== "additive" &&
    patch.stackingRule !== "override" &&
    patch.stackingRule !== "yield"
  ) {
    return { ok: false, message: "Geçersiz çakışma kuralı." };
  }
  const validFrom = patch.validFrom !== undefined ? patch.validFrom : existing.validFrom;
  const validTo = patch.validTo !== undefined ? patch.validTo : existing.validTo;
  if (validFrom && validTo && validFrom > validTo) {
    return { ok: false, message: "Geçerlilik başlangıcı bitişten sonra olamaz." };
  }
  const updated: DiscountCampaign = {
    ...existing,
    ...patch,
    // null = temizle (json/memory yolu; db yolunda Prisma null yazar).
    branchId: patch.branchId === null ? undefined : (patch.branchId ?? existing.branchId),
    maxUsageCount: patch.maxUsageCount === null ? undefined : (patch.maxUsageCount ?? existing.maxUsageCount),
    // Eski kayıtlar motor alanlarını taşımaz — okuma uyumu için varsayılanlar burada dolar.
    stackingRule: patch.stackingRule ?? existing.stackingRule ?? "none",
    priority: patch.priority ?? existing.priority ?? 0,
    usageCount: patch.usageCount ?? existing.usageCount ?? 0,
    name: patch.name !== undefined ? patch.name.trim() : existing.name,
    updatedAt: now.toISOString(),
  };
  const discountCampaigns = (data.discountCampaigns ?? []).map((c) => (c.id === campaignId ? updated : c));
  return { ok: true, data: { ...data, discountCampaigns }, campaign: updated };
}

// ─── Paket & Kampanya Motoru: uygulanabilirlik + çakışma çözümü (saf, I/O yok) ───

/** Şube kapsamı: hem `branchId` hem `applicableBranchIds` boşsa tüm şubeler. Biri doluysa öğrencinin şubesi içlerinden birinde olmalı. */
export function isCampaignInBranchScope(campaign: DiscountCampaign, branchId: string | undefined): boolean {
  const multi = campaign.applicableBranchIds?.filter(Boolean) ?? [];
  if (!campaign.branchId && multi.length === 0) return true;
  if (!branchId) return false;
  return campaign.branchId === branchId || multi.includes(branchId as BranchId);
}

/** Tek kampanya bu öğrenci/zaman için aday mı? (aktif + tarih penceresi + şube kapsamı). Limit SOFT — adaylığı engellemez. */
export function isCampaignApplicable(
  campaign: DiscountCampaign,
  branchId: string | undefined,
  now: Date = new Date()
): boolean {
  if (!campaign.active || campaign.deletedAt) return false;
  if (!isWithinWindow(campaign, now)) return false;
  return isCampaignInBranchScope(campaign, branchId);
}

/** Seçili kampanyalar arasından o an uygulanabilir olanlar (aktif + tarih + şube). */
export function applicableCampaigns(
  campaigns: DiscountCampaign[],
  branchId: string | undefined,
  now: Date = new Date()
): DiscountCampaign[] {
  return campaigns.filter((c) => isCampaignApplicable(c, branchId, now));
}

export type CampaignStackExclusion = { campaign: DiscountCampaign; reason: string };

export type CampaignStackResolution = {
  /** Uygulanacak kampanyalar (çakışma kurallarından geçenler). */
  applied: DiscountCampaign[];
  /** Elenenler ve gerekçeleri (denetim/açıklanabilirlik için). */
  excluded: CampaignStackExclusion[];
  /** Nihai indirim yüzdesi — 0..100 (additive toplamı %100'de kesilir, negatif ücret imkânsız). */
  effectivePercent: number;
};

function stackingOf(c: DiscountCampaign): CampaignStackingRule {
  return c.stackingRule ?? "none";
}

function priorityOf(c: DiscountCampaign): number {
  return c.priority ?? 0;
}

/** Deterministik sıralama: öncelik ↓, indirim ↓, oluşturma ↑, id ↑. */
function byPrecedence(a: DiscountCampaign, b: DiscountCampaign): number {
  if (priorityOf(b) !== priorityOf(a)) return priorityOf(b) - priorityOf(a);
  if (b.discountPercent !== a.discountPercent) return b.discountPercent - a.discountPercent;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : 1;
}

/**
 * Kampanya çakışma motoru — saf fonksiyon (I/O yok, store/DB yazmaz).
 * Sıra: override (en yüksek öncelikli tek başına) → none (varsayılan; birleşemez,
 * birden fazlaysa en yüksek öncelikli) → additive (toplanır, %100 tavan) →
 * yield (başka aday varsa elenir). Limit dolumu elemeye NEDEN OLMAZ (soft uyarı
 * çağıran katmanda üretilir).
 */
export function resolveCampaignStack(candidates: DiscountCampaign[]): CampaignStackResolution {
  if (candidates.length === 0) return { applied: [], excluded: [], effectivePercent: 0 };
  const sorted = [...candidates].sort(byPrecedence);

  const overrides = sorted.filter((c) => stackingOf(c) === "override");
  if (overrides.length > 0) {
    const winner = overrides[0]!;
    return {
      applied: [winner],
      excluded: sorted
        .filter((c) => c.id !== winner.id)
        .map((c) => ({ campaign: c, reason: `"${winner.name}" kampanyası diğerlerini ezdi (override).` })),
      effectivePercent: Math.min(100, Math.max(0, winner.discountPercent)),
    };
  }

  const nonYield = sorted.filter((c) => stackingOf(c) !== "yield");
  const yields = sorted.filter((c) => stackingOf(c) === "yield");
  const yieldExcluded: CampaignStackExclusion[] =
    nonYield.length > 0
      ? yields.map((c) => ({ campaign: c, reason: "Başka aktif kampanya varken devreye girmez (yield)." }))
      : [];

  const pool = nonYield.length > 0 ? nonYield : yields;
  const poolYieldExcluded: CampaignStackExclusion[] = nonYield.length > 0 ? yieldExcluded : [];

  const nones = pool.filter((c) => stackingOf(c) === "none");
  if (nones.length > 0) {
    const winner = nones[0]!;
    const rest = pool.filter((c) => c.id !== winner.id);
    return {
      applied: [winner],
      excluded: [
        ...poolYieldExcluded,
        ...rest.map((c) => ({
          campaign: c,
          reason:
            stackingOf(c) === "none"
              ? `"${winner.name}" daha yüksek öncelikli (birden fazla none birleşemez).`
              : `"${winner.name}" başka kampanyayla birleşemez (none).`,
        })),
      ],
      effectivePercent: Math.min(100, Math.max(0, winner.discountPercent)),
    };
  }

  const additives = pool.filter((c) => stackingOf(c) === "additive" || stackingOf(c) === "yield");
  const total = additives.reduce((sum, c) => sum + Math.max(0, c.discountPercent), 0);
  return {
    applied: additives,
    excluded: poolYieldExcluded,
    effectivePercent: Math.min(100, total),
  };
}

/** Limiti dolmuş kampanya için soft uyarı metni (hard engel DEĞİL — kayıt devam eder). */
export function campaignLimitWarning(campaign: DiscountCampaign): string | null {
  if (campaign.maxUsageCount == null) return null;
  if ((campaign.usageCount ?? 0) < campaign.maxUsageCount) return null;
  return `"${campaign.name}" kampanyasının kullanım limiti doldu (${campaign.usageCount}/${campaign.maxUsageCount}) — kayıt engellenmedi, yalnızca bilgilendirme.`;
}

// ─── Kampanya raporu: hangi kampanyadan kimler faydalanmış (saf seçici) ───

export type CampaignBeneficiaryRow = {
  studentId: string;
  studentDisplayId?: string;
  studentName: string;
  branchId: string;
  branchName: string;
  packageTitle?: string;
  baseMonthlyFee?: number;
  discountPercent: number;
  finalMonthlyFee: number;
  appliedAt: string;
};

export type CampaignReportEntry = {
  campaign: DiscountCampaign;
  /** Bu kampanyadan faydalanmış öğrenciler (uygulama tarihine göre yeniden eskiye). */
  beneficiaries: CampaignBeneficiaryRow[];
  /** Dağıtılan toplam indirim tutarı (TL, taban − nihai farklarının toplamı; tabanı bilinmeyenlerde 0 sayılır). */
  totalDiscountAmount: number;
};

export type CampaignReportFilter = {
  campaignId?: string;
  branchId?: string;
  fromDate?: string;
  toDate?: string;
};

/**
 * Kampanya raporu — `Student.appliedCampaignIds` + `Package` + şube adlarından
 * türetilir. Saf seçici: I/O yok. Eski/kampanyasız kayıtlar hiçbir kampanyada
 * listelenmez (sessizce atlanır, raporu bozmaz).
 */
export function buildCampaignReport(
  students: StudentRef[],
  campaigns: DiscountCampaign[],
  packages: AppData["packages"],
  branchNameOf: (branchId: string) => string,
  filter: CampaignReportFilter = {}
): CampaignReportEntry[] {
  const byId = new Map(campaigns.map((c) => [c.id, c]));
  const entries = new Map<string, CampaignReportEntry>();
  const ensure = (id: string): CampaignReportEntry | null => {
    const campaign = byId.get(id);
    if (!campaign) return null;
    let entry = entries.get(id);
    if (!entry) {
      entry = { campaign, beneficiaries: [], totalDiscountAmount: 0 };
      entries.set(id, entry);
    }
    return entry;
  };

  // 2026-10-10 — kampanya BRANŞ kaydına uygulanır: branşlı öğrencide her branşın kendi kampanya kimlikleri, paketi ve nihai
  // ücreti raporlanır (öğrenci satırı yalnız bir aynadır). Branş kaydı olmayan eski öğrenci tek satırdır.
  for (const s of students) {
    const rows: { appliedCampaignIds: string[]; packageId?: string; packageName?: string; packageBaseMonthlyFee?: number; monthlyFee: number; label?: string }[] =
      s.enrollments?.length
        ? enrollmentTermsList(s).map(({ enrollment, terms }) => ({
            appliedCampaignIds: terms.appliedCampaignIds ?? [],
            packageId: terms.packageId,
            packageName: terms.packageName,
            packageBaseMonthlyFee: terms.packageBaseMonthlyFee,
            monthlyFee: terms.monthlyFee,
            label: enrollment.instrument,
          }))
        : [
            {
              appliedCampaignIds: s.appliedCampaignIds ?? [],
              packageId: s.packageId,
              packageName: s.packageName,
              packageBaseMonthlyFee: s.packageBaseMonthlyFee,
              monthlyFee: s.monthlyFee,
            },
          ];
    for (const row of rows) {
      for (const cid of row.appliedCampaignIds) {
        if (filter.campaignId && cid !== filter.campaignId) continue;
        if (filter.branchId && s.branchId !== filter.branchId) continue;
        const appliedAt = s.createdAt.slice(0, 10);
        if (filter.fromDate && appliedAt < filter.fromDate) continue;
        if (filter.toDate && appliedAt > filter.toDate) continue;
        const entry = ensure(cid);
        if (!entry) continue;
        const pkg = (packages ?? []).find((p) => p.id === row.packageId);
        const base = row.packageBaseMonthlyFee;
        entry.beneficiaries.push({
          studentId: s.id,
          studentDisplayId: s.displayId,
          studentName: row.label ? `${s.name} (${row.label})` : s.name,
          branchId: s.branchId,
          branchName: branchNameOf(s.branchId),
          packageTitle: pkg?.title ?? (row.packageName || undefined),
          baseMonthlyFee: base,
          discountPercent: entry.campaign.discountPercent,
          finalMonthlyFee: row.monthlyFee,
          appliedAt: s.createdAt,
        });
        if (base != null) entry.totalDiscountAmount += Math.max(0, base - row.monthlyFee);
      }
    }
  }

  const list = [...entries.values()];
  for (const e of list) e.beneficiaries.sort((a, b) => (a.appliedAt < b.appliedAt ? 1 : -1));
  list.sort((a, b) => (a.campaign.name < b.campaign.name ? -1 : 1));
  // Filtreye uyan ama henüz yararlanıcısı olmayan kampanyalar da (boş) listelenir.
  if (filter.campaignId) {
    const single = byId.get(filter.campaignId);
    if (single && !entries.has(single.id)) list.unshift({ campaign: single, beneficiaries: [], totalDiscountAmount: 0 });
  }
  return list;
}
