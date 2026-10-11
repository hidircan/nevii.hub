/**
 * 2026-10-10 — BRANŞ KAYIT FORMUNUN BAĞLAMI (saf; sunucu sayfaları kurar, istemci formu kullanır).
 *
 * Yeni öğrenci kaydı, öğrenci sayfasında "Branş ekle" ve "Branşı düzenle" AYNI `EnrollmentFormFields` bileşenini kullanır;
 * hepsine aynı bağlam verilir ki fiyat/ilk tahsilat önizlemesi üç yerde aynı sonucu versin (kopya hesap yok).
 */
import { resolveCampaignStack } from "./discount-campaigns";
import { resolveEnrollmentPricing, suggestFirstCollection, normalizeEnrollmentDraft } from "./enrollment-form";
import type { EnrollmentDraft, EnrollmentPricing, FirstCollectionSuggestion } from "./enrollment-form";
import { LESSON_DURATION_OPTIONS } from "./lesson-duration";
import type { LessonDurationMinutes } from "./lesson-duration";
import { resolveFirstCollectionMergeThreshold } from "./types";
import type { CampaignStackingRule, DiscountCampaign, Package, StudentTermType } from "./types";
import type { DayOverride, TermWeeklyClosedDaysOverride } from "./work-days";

export type EnrollmentFormPackage = {
  id: string;
  title: string;
  price30Min: number;
  price40Min: number;
  price50Min: number;
  defaultDurationMinutes?: number;
  defaultPaymentDueDay?: number;
  monthlyLessonCount?: number;
};

export type EnrollmentFormCampaign = {
  id: string;
  name: string;
  displayId?: string;
  discountPercent: number;
  stackingRule: CampaignStackingRule;
  priority: number;
  branchId?: string;
  applicableBranchIds?: string[];
  validFrom?: string;
  validTo?: string;
  active: boolean;
  maxUsageCount?: number;
  usageCount: number;
  createdAt: string;
};

export type EnrollmentFormTeacher = { id: string; name: string; active: boolean; instruments: string[] };

export type EnrollmentFormContext = {
  instrumentOptions: string[];
  teachers: EnrollmentFormTeacher[];
  branches: { id: string; name: string }[];
  /** Kişinin şubesi; branşın ayrı şubesi yoksa devralınır. */
  personBranchId: string;
  packages: EnrollmentFormPackage[];
  campaigns: EnrollmentFormCampaign[];
  workDayOverrides: DayOverride[];
  termWeeklyClosedDays?: TermWeeklyClosedDaysOverride;
  /** Kurumun "ders eşiği" kuralı (ilk tahsilata sonraki ayı ekleme varsayılanı). */
  mergeThresholdLessons: number;
  /** Kurum saatiyle bugün (YYYY-AA-GG). */
  todayYmd: string;
};

type ReferenceLike = {
  teachers: { id: string; name: string; active: boolean; instruments: readonly string[] }[];
  settings: {
    branches: { id: string; name: string; shortName?: string }[];
    termWeeklyClosedDays?: TermWeeklyClosedDaysOverride;
    /** "3 ders eşiği" kurum ayarı `collectionsSettings` içindedir (sunucu `prepareBranchRegistration` ile AYNI yerden okur). */
    collectionsSettings?: { firstCollectionMergeThresholdLessons?: number };
  };
  packages?: Pick<
    Package,
    "id" | "title" | "status" | "price30Min" | "price40Min" | "price50Min" | "defaultDurationMinutes" | "defaultPaymentDueDay" | "monthlyLessonCount"
  >[];
  discountCampaigns?: DiscountCampaign[];
  closedDayOverrides?: DayOverride[];
};

/** Sunucu sayfası: referans veriden serileştirilebilir form bağlamı. */
export function buildEnrollmentFormContext(
  data: ReferenceLike,
  opts: { instrumentOptions: string[]; personBranchId: string; todayYmd: string }
): EnrollmentFormContext {
  return {
    instrumentOptions: opts.instrumentOptions,
    teachers: data.teachers.map((t) => ({ id: t.id, name: t.name, active: t.active, instruments: [...t.instruments] })),
    branches: data.settings.branches.map((b) => ({ id: b.id, name: b.shortName || b.name })),
    personBranchId: opts.personBranchId,
    packages: (data.packages ?? [])
      .filter((p) => p.status === "active")
      .map((p) => ({
        id: p.id,
        title: p.title,
        price30Min: p.price30Min,
        price40Min: p.price40Min,
        price50Min: p.price50Min,
        defaultDurationMinutes: p.defaultDurationMinutes,
        defaultPaymentDueDay: p.defaultPaymentDueDay,
        monthlyLessonCount: p.monthlyLessonCount,
      })),
    campaigns: (data.discountCampaigns ?? [])
      .filter((c) => c.active)
      .map((c) => ({
        id: c.id,
        name: c.name,
        displayId: c.displayId,
        discountPercent: c.discountPercent,
        stackingRule: c.stackingRule ?? "none",
        priority: c.priority ?? 0,
        branchId: c.branchId,
        applicableBranchIds: c.applicableBranchIds,
        validFrom: c.validFrom,
        validTo: c.validTo,
        active: c.active,
        maxUsageCount: c.maxUsageCount,
        usageCount: c.usageCount ?? 0,
        createdAt: c.createdAt,
      })),
    workDayOverrides: data.closedDayOverrides ?? [],
    termWeeklyClosedDays: data.settings.termWeeklyClosedDays,
    mergeThresholdLessons: resolveFirstCollectionMergeThreshold(data.settings.collectionsSettings ?? {}),
    todayYmd: opts.todayYmd,
  };
}

export type EnrollmentDerived = {
  pricing: EnrollmentPricing | null;
  /** Seçilen kampanya yığınından uygulanan toplam yüzde (kampanya yoksa undefined). */
  campaignPercent?: number;
  excludedCampaignNotes: string[];
  suggestion: FirstCollectionSuggestion | null;
};

/**
 * Bir taslağın ücreti ve önerilen ilk tahsilatı. İstemci önizlemesi VE istemci doğrulaması aynı çıktıyı kullanır; sunucu
 * aynı saf fonksiyonlarla (`resolveEnrollmentPricing`/`suggestFirstCollection`) yeniden hesaplar ve asıl kapıdır.
 */
export function computeEnrollmentDerived(ctx: EnrollmentFormContext, d: EnrollmentDraft, termType: StudentTermType): EnrollmentDerived {
  const n = normalizeEnrollmentDraft(d);
  const duration = n.lessonDurationMinutes;
  const pkg = n.packageId ? ctx.packages.find((p) => p.id === n.packageId) : undefined;
  const selected = ctx.campaigns.filter((c) => d.campaignIds.includes(c.id));
  const stack = resolveCampaignStack(
    selected.map((c) => ({ ...c, kind: "sibling" as const, createdBy: "", updatedAt: c.createdAt }))
  );
  const campaignMode = selected.length > 0;
  const excludedCampaignNotes = stack.excluded.map((e) => `"${e.campaign.name}" uygulanmadı: ${e.reason}`);
  let pricing: EnrollmentPricing | null = null;
  if (duration && (LESSON_DURATION_OPTIONS as readonly number[]).includes(duration)) {
    if (n.packageId && !pkg) {
      pricing = null;
    } else if (!pkg && n.freeMonthlyFee === undefined) {
      pricing = null;
    } else {
      pricing = resolveEnrollmentPricing({
        pkg: pkg ?? null,
        durationMinutes: duration as LessonDurationMinutes,
        discountType: campaignMode ? undefined : (n.discountType as never),
        discountValue: campaignMode ? undefined : n.discountValue,
        campaignPercent: campaignMode ? stack.effectivePercent : undefined,
        overrideAmount: pkg && !campaignMode ? n.monthlyFeeOverrideAmount : undefined,
        freeMonthlyFee: n.freeMonthlyFee,
      });
    }
  }
  const suggestion =
    pricing && n.weeklyLessonCount >= 1
      ? suggestFirstCollection({
          monthlyFee: pricing.monthlyFee,
          weeklyLessonCount: n.weeklyLessonCount,
          lessonStartDate: n.lessonStartDate,
          enrollmentStartDate: n.startDate,
          fallbackToday: ctx.todayYmd,
          lessonDays: n.lessonDays,
          term: termType,
          overrides: ctx.workDayOverrides,
          weeklyClosedDays: ctx.termWeeklyClosedDays,
          includeNextMonth: d.firstPayment.includeNextMonth,
          mergeThresholdLessons: ctx.mergeThresholdLessons,
        })
      : null;
  return {
    pricing,
    campaignPercent: campaignMode ? stack.effectivePercent : undefined,
    excludedCampaignNotes,
    suggestion,
  };
}
