import { differenceInCalendarDays, differenceInMinutes, format, parseISO } from "date-fns";
import type {
  AppData,
  BranchId,
  Lesson,
  Instrument,
  TeacherFeeRule,
  TeacherPayout,
  TeacherPayoutLineOverride,
  TeacherPayoutPolicyPeriod,
  TeacherPayoutPolicyTerms,
  TeacherPayoutPricingPolicy,
  TeacherPayoutSnapshotLine,
} from "./types";
import { addPaymentData } from "./payout-ledger";
import { uid } from "./utils";
import { isLessonProcessedForPayout } from "./lesson-ops";
import { DEFAULT_APP_TIMEZONE, toZonedYmd } from "./timezone";

/**
 * DB egress (2026-09-30) — hakediş hesabının OKUDUĞU alanlar. Dönem hesabı yalnız bu koleksiyonlara
 * bakar ve dersleri dönemin gün anahtarlarıyla süzer; bu yüzden tam `AppData` yerine dönem penceresi
 * dilimi (bkz. reference-data.ts `PayoutWindowData`) verilebilir — tip, fazlasını okumayı derletmez.
 */
export type PayoutComputationData = Pick<
  AppData,
  "settings" | "lessons" | "teacherFeeRules" | "teacherPayoutPolicies" | "teacherPayoutExclusions"
> & { students: import("./types").StudentRef[] };
/** Kayıtlı hakedişlerle (donmuş satırlar / fark) birlikte hesap. */
export type PayoutLedgerData = PayoutComputationData & Pick<AppData, "teacherPayouts">;

/**
 * ISO tarih/saat girdisinden gün anahtarı (yyyy-MM-dd) — Europe/Istanbul takvimi.
 * 2026-10-06: önceden sunucu yerel saatiyle biçimleniyordu; Vercel UTC çalıştığı için İstanbul 00:00–03:00
 * arasındaki bir ders bir önceki güne/aya düşebilirdi. Kural:
 * - "yyyy-MM-dd" ve UTC gece yarısı (tarih alanlarının DB biçimi) → yazılı gün (tarih semantiği).
 * - Ofsetli/Z'li an → İstanbul takvim günü.
 * - Ofsetsiz duvar saati → yazılı gün (sunucu yerel biçimiyle aynı sonuç).
 */
export function toDayKey(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  if (/^\d{4}-\d{2}-\d{2}T00:00(:00(\.0+)?)?(Z|[+-]00:?00)$/.test(iso)) return iso.slice(0, 10);
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(iso)) return toZonedYmd(parseISO(iso), DEFAULT_APP_TIMEZONE);
  return format(parseISO(iso), "yyyy-MM-dd");
}

/** Kuruş hassasiyeti float yuvarlama hatalarına karşı güvenli para yuvarlama. */
function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isRuleEffectiveOn(rule: Pick<TeacherFeeRule, "effectiveFrom" | "effectiveTo">, dateIso: string): boolean {
  const dayKey = toDayKey(dateIso);
  if (toDayKey(rule.effectiveFrom) > dayKey) return false;
  if (rule.effectiveTo && toDayKey(rule.effectiveTo) < dayKey) return false;
  return true;
}

/**
 * Bir derse uygulanacak ücret kuralını en spesifikten genele çözer:
 * 1) teacherId+branchId+instrument  2) teacherId+branchId
 * 3) teacherId+instrument           4) yalnızca teacherId
 * Her kademede yalnızca `lessonDateIso` tarihinde geçerli (effectiveFrom/To
 * aralığında) kurallar aday olur. `Teacher.branchId` bu fonksiyona hiç
 * girmez — yalnızca dersin KENDİ branchId'si kullanılır.
 */
export function resolveFeeRule(
  rules: TeacherFeeRule[],
  params: { teacherId: string; branchId: BranchId; instrument: Instrument; lessonDateIso: string }
): TeacherFeeRule | null {
  const candidates = rules.filter(
    (r) => r.teacherId === params.teacherId && isRuleEffectiveOn(r, params.lessonDateIso)
  );

  const tiers: ((r: TeacherFeeRule) => boolean)[] = [
    (r) => r.branchId === params.branchId && r.instrument === params.instrument,
    (r) => r.branchId === params.branchId && r.instrument === undefined,
    (r) => r.branchId === undefined && r.instrument === params.instrument,
    (r) => r.branchId === undefined && r.instrument === undefined,
  ];

  for (const matchesTier of tiers) {
    const found = candidates.find(matchesTier);
    if (found) return found;
  }
  return null;
}

export type FeeRuleInput = {
  teacherId: string;
  branchId?: BranchId;
  instrument?: Instrument;
  perMinuteRate: number;
  effectiveFrom: string;
  effectiveTo?: string;
};

export type FeeRuleMutationResult =
  | { ok: true; data: AppData; rule: TeacherFeeRule }
  | {
      ok: false;
      code: "INVALID_RATE" | "INVALID_DATE_RANGE" | "OVERLAPPING_RULE" | "NOT_FOUND";
      message: string;
    };

/**
 * İki tarih aralığının (bitişsiz = açık uçlu) kesişip kesişmediğini kontrol
 * eder. Yalnızca AYNI kapsamdaki (teacherId+branchId+instrument) kurallar
 * karşılaştırılır — farklı spesifiklik kademeleri (örn. yalnızca teacherId
 * genel kuralıyla teacherId+branchId özel kuralı) kasıtlı olarak aynı anda
 * var olabilir; öncelik `resolveFeeRule` ile çözülür.
 */
function rangesOverlap(
  aFrom: string,
  aTo: string | undefined,
  bFrom: string,
  bTo: string | undefined
): boolean {
  const aFromKey = toDayKey(aFrom);
  const aToKey = aTo ? toDayKey(aTo) : null;
  const bFromKey = toDayKey(bFrom);
  const bToKey = bTo ? toDayKey(bTo) : null;

  const aStartsBeforeBEnds = bToKey === null || aFromKey <= bToKey;
  const aEndsAfterBStarts = aToKey === null || aToKey >= bFromKey;
  return aStartsBeforeBEnds && aEndsAfterBStarts;
}

function scopeMatches(a: Pick<TeacherFeeRule, "teacherId" | "branchId" | "instrument">, b: FeeRuleInput): boolean {
  return a.teacherId === b.teacherId && a.branchId === b.branchId && a.instrument === b.instrument;
}

/**
 * Ücret kuralı girdisini doğrular: pozitif oran, tutarlı tarih aralığı ve
 * aynı kapsamda (teacherId+branchId+instrument) tarih çakışması olmaması.
 * `excludeRuleId` güncellemede kuralın kendisiyle çakışma sanılmasını önler.
 */
export function validateFeeRuleInput(
  existingRules: TeacherFeeRule[],
  candidate: FeeRuleInput,
  excludeRuleId?: string
): FeeRuleMutationResult | { ok: true } {
  if (!(candidate.perMinuteRate > 0)) {
    return { ok: false, code: "INVALID_RATE", message: "Dakika başı ücret sıfırdan büyük olmalıdır." };
  }
  if (candidate.effectiveTo && toDayKey(candidate.effectiveTo) < toDayKey(candidate.effectiveFrom)) {
    return {
      ok: false,
      code: "INVALID_DATE_RANGE",
      message: "Bitiş tarihi başlangıç tarihinden önce olamaz.",
    };
  }

  const sameScope = existingRules.filter((r) => r.id !== excludeRuleId && scopeMatches(r, candidate));
  const overlaps = sameScope.some((r) =>
    rangesOverlap(candidate.effectiveFrom, candidate.effectiveTo, r.effectiveFrom, r.effectiveTo)
  );
  if (overlaps) {
    return {
      ok: false,
      code: "OVERLAPPING_RULE",
      message:
        "Bu öğretmen/şube/enstrüman kapsamında aynı tarih aralığında zaten bir ücret kuralı tanımlı.",
    };
  }

  return { ok: true };
}

/** Yeni ücret kuralı ekler — `AppData`'yı saf biçimde dönüştürür, hiçbir I/O yapmaz. */
export function createTeacherFeeRuleData(
  data: AppData,
  input: FeeRuleInput,
  now: Date = new Date()
): FeeRuleMutationResult {
  const validation = validateFeeRuleInput(data.teacherFeeRules, input);
  if (!validation.ok) return validation;

  const rule: TeacherFeeRule = {
    id: uid("fee"),
    teacherId: input.teacherId,
    branchId: input.branchId,
    instrument: input.instrument,
    perMinuteRate: input.perMinuteRate,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo,
    createdAt: now.toISOString(),
  };

  return { ok: true, data: { ...data, teacherFeeRules: [...data.teacherFeeRules, rule] }, rule };
}

/**
 * Mevcut bir ücret kuralını günceller. Var olan geçmiş `TeacherPayout`
 * snapshot'larına hiç dokunmaz — onlar oluşturuldukları andaki tutarı
 * kalıcı olarak korur.
 */
export function updateTeacherFeeRuleData(
  data: AppData,
  ruleId: string,
  patch: Partial<Omit<TeacherFeeRule, "id" | "createdAt">>
): FeeRuleMutationResult {
  const existing = data.teacherFeeRules.find((r) => r.id === ruleId);
  if (!existing) return { ok: false, code: "NOT_FOUND", message: "Ücret kuralı bulunamadı." };

  const candidate: TeacherFeeRule = { ...existing, ...patch };
  const validation = validateFeeRuleInput(data.teacherFeeRules, candidate, ruleId);
  if (!validation.ok) return validation;

  const teacherFeeRules = data.teacherFeeRules.map((r) => (r.id === ruleId ? candidate : r));
  return { ok: true, data: { ...data, teacherFeeRules }, rule: candidate };
}

// ─── Ücret kuralı kaldırma önizlemesi (saf) ──────────────────────────────────

export type FeeRuleRemovalMode = "delete" | "deactivate";

export type FeeRuleRemovalLessonRow = {
  lessonId: string;
  date: string;
  studentName?: string;
  instrument: Instrument;
  branchName?: string;
  minutes: number;
  before: number;
  /** Silme/deaktivasyon sonrası tutar; kural kalmıyorsa tanımsız ("ücret kuralı eksik"). */
  after?: number;
  /** Dersin düşeceği halef kural (yoksa tanımsız). */
  successorRuleId?: string;
};

export type FeeRuleRemovalPendingRow = {
  payoutId: string;
  periodStart: string;
  periodEnd: string;
  before: number;
  /** Yeniden hesaplanamazsa tanımsız + blocked gerekçesi. */
  after?: number;
  blocked?: string;
};

export type FeeRuleRemovalRecordedRow = {
  payoutId: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  totalAmount: number;
};

export type FeeRuleRemovalPreview = {
  rule: {
    id: string;
    teacherId: string;
    teacherName: string;
    branchId?: BranchId;
    instrument?: Instrument;
    perMinuteRate: number;
    effectiveFrom: string;
    effectiveTo?: string;
  };
  mode: FeeRuleRemovalMode;
  fromDate?: string;
  /** deactivate: hesaplanan yeni bitiş (fromDate'in bir önceki günü). */
  effectiveTo?: string;
  /** Bu işlemde DEĞİŞMEYECEK kayıtlı hakedişler (donmuş kalemi bu kurala ait). */
  recordedUnchanged: FeeRuleRemovalRecordedRow[];
  /** Canlı hesabı bu kurala dayanan bekleyen kayıtlar: otomatik yeniden hesap (before/after). */
  pendingRecomputed: FeeRuleRemovalPendingRow[];
  /** Kayda geçmemiş, güncel hesabı bu kuralla yapılan dersler (satırlar ilk N; toplamlar tümü). */
  openLessons: {
    total: number;
    months: string[];
    beforeTotal: number;
    afterTotal: number;
    withoutRule: number;
    rows: FeeRuleRemovalLessonRow[];
    truncated: boolean;
  };
  /** Aynı öğretmenin diğer kuralları (otomatik halef adayları). */
  replacementRules: {
    id: string;
    branchId?: BranchId;
    instrument?: Instrument;
    perMinuteRate: number;
    effectiveFrom: string;
    effectiveTo?: string;
  }[];
  /** Kayıtlı referans veya açık hesap varsa silme açık onay ister. */
  confirmRequired: boolean;
};

/** Önizlemede gösterilen en fazla açık ders satırı (toplamlar her zaman tüm derslerden). */
export const FEE_RULE_REMOVAL_PREVIEW_ROW_LIMIT = 50;

/**
 * Devre dışı bırakmanın tarih kuralı — TEK kaynak (önizleme ve uygulama aynı
 * fonksiyonu kullanır, mesaj da buradan gelir): fromDate ilk GEÇERSİZ gündür,
 * yeni bitiş onun bir öncesi; kuralın en az bir geçerli günü kalmalıdır.
 */
export function deactivateEffectiveToForRule(
  rule: Pick<TeacherFeeRule, "effectiveFrom">,
  fromDate: string
): { ok: true; effectiveTo: string } | { ok: false; message: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
    return { ok: false, message: "Devre dışı tarihi geçersiz (gün seçin). Kural değişmedi." };
  }
  const effectiveTo = new Date(Date.parse(`${fromDate}T12:00:00.000Z`) - 86_400_000).toISOString().slice(0, 10);
  if (effectiveTo < rule.effectiveFrom.slice(0, 10)) {
    return {
      ok: false,
      message: `Devre dışı tarihi (ilk geçersiz gün) kuralın başlangıcından (${rule.effectiveFrom.slice(0, 10)}) sonraki bir gün olmalı; aksi halde kuralın hiç geçerli günü kalmaz. Kuralın tamamını kaldırmak için "Kalıcı sil"i kullanın.`,
    };
  }
  return { ok: true, effectiveTo };
}

function feeRuleRemovalDataAfter(
  data: AppData,
  rule: TeacherFeeRule,
  mode: FeeRuleRemovalMode,
  effectiveTo?: string
): AppData {
  return {
    ...data,
    teacherFeeRules:
      mode === "delete"
        ? data.teacherFeeRules.filter((r) => r.id !== rule.id)
        : data.teacherFeeRules.map((r) => (r.id === rule.id ? { ...r, effectiveTo } : r)),
  };
}

/** Ders günü, öğretmenin iptal edilmemiş bir hakediş dönemine giriyor mu (kayda geçmiş sayılır). */
function feeRuleLessonCoveredByPayout(payouts: TeacherPayout[], teacherId: string, day: string): boolean {
  return payouts.some(
    (p) =>
      p.teacherId === teacherId &&
      p.status !== "cancelled" &&
      payoutPeriodDayKey(p.periodStart) <= day &&
      payoutPeriodDayKey(p.periodEnd) >= day
  );
}

function feeRuleFrozenReferencesRule(payout: TeacherPayout, ruleId: string): boolean {
  return (payout.lineSnapshot ?? []).some((l) => l.feeRuleId === ruleId);
}

/**
 * Ücret kuralı kaldırma ETKİSİ (saf — yazmaz). Önizleme ve uygulama (onay anında
 * taze hesap) aynı fonksiyonu kullanır; ikisi de aynı sayıları görür.
 *
 * Kural yalnız öğretmen-bazlı (`per_teacher_rule`) aylarda hesaba girer:
 * sabit-ücret aylarındaki dersler kurala "çözümlense" bile tutarı ondan almaz,
 * bu yüzden açık ders sayımına girmez (eski sayaç politika körüydü).
 */
export function previewFeeRuleRemovalData(
  data: AppData,
  ruleId: string,
  mode: FeeRuleRemovalMode,
  fromDate?: string,
  now: Date = new Date()
): { ok: true; preview: FeeRuleRemovalPreview } | { ok: false; code: "NOT_FOUND" | "INVALID_DATE"; message: string } {
  const rule = data.teacherFeeRules.find((r) => r.id === ruleId);
  if (!rule) return { ok: false, code: "NOT_FOUND", message: "Ücret kuralı bulunamadı. Sayfayı yenileyip tekrar deneyin." };
  let effectiveTo: string | undefined;
  let from: string | undefined;
  if (mode === "deactivate") {
    from = fromDate ?? now.toISOString().slice(0, 10);
    const eff = deactivateEffectiveToForRule(rule, from);
    if (!eff.ok) return { ok: false, code: "INVALID_DATE", message: eff.message };
    effectiveTo = eff.effectiveTo;
  }
  const after = feeRuleRemovalDataAfter(data, rule, mode, effectiveTo);

  const teacherName = data.teachers.find((t) => t.id === rule.teacherId)?.name ?? "Öğretmen";
  const active = data.teacherPayouts.filter((p) => p.teacherId === rule.teacherId && p.status !== "cancelled");

  // Bekleyen kayıtlar: canlı hesabı bu kurala dayanıyorsa işlem sonrası otomatik yeniden hesaplanır.
  const pendingRecomputed: FeeRuleRemovalPendingRow[] = [];
  const pendingLiveAffected = new Set<string>();
  for (const p of active) {
    if (p.status !== "pending") continue;
    const liveUsesRule = computeTeacherEarningsForPeriod(data, rule.teacherId, p.periodStart, p.periodEnd).lines.some(
      (l) => l.feeRuleId === rule.id
    );
    if (!liveUsesRule) continue;
    pendingLiveAffected.add(p.id);
    const next = recomputePayoutData(after, p);
    if ("error" in next) {
      pendingRecomputed.push({
        payoutId: p.id,
        periodStart: payoutPeriodDayKey(p.periodStart),
        periodEnd: payoutPeriodDayKey(p.periodEnd),
        before: p.totalAmount,
        blocked: next.error,
      });
    } else {
      pendingRecomputed.push({
        payoutId: p.id,
        periodStart: payoutPeriodDayKey(p.periodStart),
        periodEnd: payoutPeriodDayKey(p.periodEnd),
        before: p.totalAmount,
        after: next.totalAmount,
      });
    }
  }

  // Değişmeyecek kayıtlı hakedişler: donmuş kalemi bu kurala ait, yeniden hesaplanmayacak kayıtlar.
  const recordedUnchanged: FeeRuleRemovalRecordedRow[] = active
    .filter((p) => !pendingLiveAffected.has(p.id) && feeRuleFrozenReferencesRule(p, rule.id))
    .map((p) => ({
      payoutId: p.id,
      periodStart: payoutPeriodDayKey(p.periodStart),
      periodEnd: payoutPeriodDayKey(p.periodEnd),
      status: p.status,
      totalAmount: p.totalAmount,
    }));

  // Açık dersler: işlenmiş + kayda geçmemiş + bu ay öğretmen-bazlı + güncel çözüm bu kural.
  const rows: FeeRuleRemovalLessonRow[] = [];
  const months = new Set<string>();
  let beforeTotal = 0;
  let afterTotal = 0;
  let withoutRule = 0;
  for (const l of data.lessons) {
    if (l.teacherId !== rule.teacherId || !isLessonProcessedForPayout(l)) continue;
    const day = toDayKey(l.startAt);
    if (feeRuleLessonCoveredByPayout(active, rule.teacherId, day)) continue;
    if (resolvePayoutPolicy(data, rule.teacherId, day.slice(0, 7)).policy !== "per_teacher_rule") continue;
    const current = resolveFeeRule(data.teacherFeeRules, {
      teacherId: l.teacherId,
      branchId: l.branchId,
      instrument: l.instrument,
      lessonDateIso: l.startAt,
    });
    if (current?.id !== rule.id) continue;
    const minutes = differenceInMinutes(parseISO(l.endAt), parseISO(l.startAt));
    const before = roundCurrency(payableMinutesFor(data, minutes) * rule.perMinuteRate);
    const successor = resolveFeeRule(after.teacherFeeRules, {
      teacherId: l.teacherId,
      branchId: l.branchId,
      instrument: l.instrument,
      lessonDateIso: l.startAt,
    });
    const afterAmount = successor ? roundCurrency(payableMinutesFor(data, minutes) * successor.perMinuteRate) : undefined;
    months.add(day.slice(0, 7));
    beforeTotal = roundCurrency(beforeTotal + before);
    if (afterAmount !== undefined) afterTotal = roundCurrency(afterTotal + afterAmount);
    else withoutRule += 1;
    rows.push({
      lessonId: l.id,
      date: l.startAt,
      studentName: data.students.find((s) => s.id === l.studentId)?.name,
      instrument: l.instrument,
      branchName: data.settings.branches.find((b) => b.id === l.branchId)?.shortName,
      minutes,
      before,
      after: afterAmount,
      successorRuleId: successor?.id,
    });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.lessonId.localeCompare(b.lessonId));

  const replacementRules = data.teacherFeeRules
    .filter((r) => r.id !== rule.id && r.teacherId === rule.teacherId)
    .map((r) => ({
      id: r.id,
      branchId: r.branchId,
      instrument: r.instrument,
      perMinuteRate: r.perMinuteRate,
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
    }));

  const confirmRequired =
    recordedUnchanged.length > 0 || pendingRecomputed.length > 0 || rows.length > 0;
  return {
    ok: true,
    preview: {
      rule: {
        id: rule.id,
        teacherId: rule.teacherId,
        teacherName,
        branchId: rule.branchId,
        instrument: rule.instrument,
        perMinuteRate: rule.perMinuteRate,
        effectiveFrom: rule.effectiveFrom,
        effectiveTo: rule.effectiveTo,
      },
      mode,
      fromDate: from,
      effectiveTo,
      recordedUnchanged,
      pendingRecomputed,
      openLessons: {
        total: rows.length,
        months: [...months].sort(),
        beforeTotal,
        afterTotal,
        withoutRule,
        rows: rows.slice(0, FEE_RULE_REMOVAL_PREVIEW_ROW_LIMIT),
        truncated: rows.length > FEE_RULE_REMOVAL_PREVIEW_ROW_LIMIT,
      },
      replacementRules,
      confirmRequired,
    },
  };
}

// ─── Hakediş politikası (2026-09-29) ─────────────────────────────────────────

export const PAYOUT_POLICY_LABELS: Record<TeacherPayoutPricingPolicy, string> = {
  per_teacher_rule: "Mevcut politika (öğretmen bazlı dakika ücreti)",
  fixed_duration: "Süreye göre sabit ücret (30/40/50 dk, tüm öğretmenler)",
};

/** Sabit ücret politikasının tanıdığı ders süreleri — başka süre bu politikada ücretlendirilmez. */
export const FIXED_DURATION_MINUTES = [30, 40, 50] as const;
const MAX_FIXED_RATE = 100_000;

const DEFAULT_TERMS: TeacherPayoutPolicyTerms = { policy: "per_teacher_rule" };

/** "yyyy-MM" — dersin/dönemin hangi ay politikasına tabi olduğu (gün anahtarından, saat dilimi güvenli). */
export function payoutMonthKey(iso: string): string {
  return toDayKey(iso).slice(0, 7);
}

export type PayoutPolicyResolution = {
  terms: TeacherPayoutPolicyTerms;
  /** explicit: bu ay için seçildi · inherited: önceki bir aydaki seçimden yürürlükte · default: hiç seçim yok. */
  source: "explicit" | "inherited" | "default";
  /** inherited ise politikanın yürürlüğe girdiği ay ("yyyy-MM"). */
  fromMonth?: string;
};

/**
 * Bir öğretmenin bir aydaki politikası — YÜRÜRLÜK TARİHLİ model (2026-10-04, owner: "varsayılan yeni aylarda ve
 * eksik aylık ayarlarda 30/40/50 olsun"): bir ay için açık seçim varsa o; yoksa o aydan ÖNCEKİ en son açık seçim
 * (yürürlük ayından itibaren devam eder — ör. Eylül'de seçilen 30/40/50 Ekim'de de geçerlidir); hiç seçim yoksa
 * eski davranış (öğretmen dakika ücreti). Geçmiş ayların hesabı değişmez: ilk seçimden önceki aylar varsayılanda
 * kalır, kayıtlı hakedişler kendi `pricingSnapshot`'ını taşır ve toplu yeniden hesaplanmaz.
 * `teacherIds` yalnız birleşik ("Tüm kurumlar") görünümde doludur — başka kurumun kaydı uygulanmaz.
 */
export function resolvePayoutPolicyWithSource(
  data: Pick<AppData, "teacherPayoutPolicies">,
  teacherId: string,
  month: string
): PayoutPolicyResolution {
  const applicable = (data.teacherPayoutPolicies ?? []).filter((p) => !p.teacherIds || p.teacherIds.includes(teacherId));
  const exact = applicable.find((p) => p.month === month);
  if (exact) return { terms: termsOf(exact), source: "explicit" };
  const prior = applicable.filter((p) => p.month < month).sort((a, b) => b.month.localeCompare(a.month))[0];
  if (prior) return { terms: termsOf(prior), source: "inherited", fromMonth: prior.month };
  return { terms: DEFAULT_TERMS, source: "default" };
}

export function resolvePayoutPolicy(data: Pick<AppData, "teacherPayoutPolicies">, teacherId: string, month: string): TeacherPayoutPolicyTerms {
  return resolvePayoutPolicyWithSource(data, teacherId, month).terms;
}

/**
 * Bir öğretmenin ücret kuralına ihtiyacı var mı — TEK karar noktası.
 * Sabit ücret (`fixed_duration`) aylarında öğretmen dakika-ücreti kuralı
 * KULLANILMAZ; bu yüzden "Hakediş ücreti tanımlı değil" uyarısı da
 * üretilmemelidir (Şevval vakası: güncel politika sabitken eski kural
 * yokluğu yanlış alarm veriyordu).
 */
export function teacherFeeRuleRequired(
  data: Pick<AppData, "teacherPayoutPolicies">,
  teacherId: string,
  month: string
): boolean {
  return resolvePayoutPolicy(data, teacherId, month).policy !== "fixed_duration";
}

/** Bir dönemin kapsadığı ayların politika + kaynak bilgisi (ekran açıklaması için). */
export function resolvePayoutPolicySources(
  data: Pick<AppData, "teacherPayoutPolicies">,
  teacherId: string,
  periodStart: string,
  periodEnd: string
): Record<string, PayoutPolicyResolution> {
  const out: Record<string, PayoutPolicyResolution> = {};
  for (let m = toDayKey(periodStart).slice(0, 7); m <= toDayKey(periodEnd).slice(0, 7); m = nextMonthKey(m)) {
    out[m] = resolvePayoutPolicyWithSource(data, teacherId, m);
  }
  return out;
}

function termsOf(p: TeacherPayoutPolicyTerms): TeacherPayoutPolicyTerms {
  return p.policy === "fixed_duration"
    ? { policy: p.policy, rate30: p.rate30, rate40: p.rate40, rate50: p.rate50 }
    : { policy: "per_teacher_rule" };
}

/**
 * Sabit ücret: 30/40/50 dk tam tarife. Diğer süreler (2026-09-30 owner kararı) BLOKLAMAZ:
 * en yakın ÜST tarifenin dakika oranıyla orantılı önerilir (45 dk = 50 dk ücreti × 45/50; 50+ dk için 50 dk oranı)
 * ve satır "süre istisnası" olarak işaretlenir — yönetici kayıttan sonra revizyonla değiştirebilir.
 */
function fixedRateFor(
  terms: TeacherPayoutPolicyTerms,
  minutes: number
): { amount: number; exception: boolean; tariffMinutes?: number; tariffRate?: number } | undefined {
  if (minutes === 30 && terms.rate30 !== undefined) return { amount: terms.rate30, exception: false };
  if (minutes === 40 && terms.rate40 !== undefined) return { amount: terms.rate40, exception: false };
  if (minutes === 50 && terms.rate50 !== undefined) return { amount: terms.rate50, exception: false };
  if (!(minutes > 0)) return undefined;
  const tariff = minutes < 30 ? 30 : minutes < 40 ? 40 : 50;
  const rate = tariff === 30 ? terms.rate30 : tariff === 40 ? terms.rate40 : terms.rate50;
  if (rate === undefined) return undefined;
  return { amount: roundCurrency((rate * minutes) / tariff), exception: true, tariffMinutes: tariff, tariffRate: rate };
}

/** Ayla (gün bazında) kesişen AKTİF (iptal edilmemiş) hakediş kayıtları. */
export function payoutsOverlappingMonth(payouts: TeacherPayout[], month: string): TeacherPayout[] {
  const first = `${month}-01`;
  const last = `${month}-31`; // gün anahtarı karşılaştırması: ayın son günü ≤ "-31"
  return payouts.filter(
    (p) => p.status !== "cancelled" && payoutPeriodDayKey(p.periodStart) <= last && payoutPeriodDayKey(p.periodEnd) >= first
  );
}

export type SetPayoutPolicyInput = {
  month: string;
  policy: TeacherPayoutPricingPolicy;
  rate30?: number;
  rate40?: number;
  rate50?: number;
};

export type SetPayoutPolicyResult =
  | { ok: true; data: AppData; record: TeacherPayoutPolicyPeriod; previous: TeacherPayoutPolicyTerms; changed: boolean }
  | { ok: false; code: "VALIDATION_ERROR" | "PERIOD_LOCKED"; message: string };

/**
 * Bir ayın politikasını seçer/günceller (saf). Kurallar:
 * - Sabit ücret politikasında üç tutar da zorunlu, 0'dan büyük, en fazla 100.000 TL (kuruş hassasiyeti).
 * - 2026-09-30: kayıt KİLİDİ YOK. Ödemesiz kayıtlar tool katmanında yeni politikayla yeniden hesaplanır;
 *   ödemesi olan kayıtlar değişmez, fark "düzeltme kaydı" önerisi olarak gösterilir (bkz. payoutDrift).
 */
export function setPayoutPolicyForMonthData(
  data: AppData,
  input: SetPayoutPolicyInput,
  actorUserId: string,
  now: Date = new Date()
): SetPayoutPolicyResult {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Dönem ayı geçersiz. Hakedişler ekranında ayı seçip tekrar deneyin." };
  }
  let terms: TeacherPayoutPolicyTerms = { policy: "per_teacher_rule" };
  if (input.policy === "fixed_duration") {
    const rates = { rate30: input.rate30, rate40: input.rate40, rate50: input.rate50 };
    for (const minutes of FIXED_DURATION_MINUTES) {
      const v = rates[`rate${minutes}` as keyof typeof rates];
      if (v === undefined || !Number.isFinite(v) || v <= 0 || v > MAX_FIXED_RATE) {
        return {
          ok: false,
          code: "VALIDATION_ERROR",
          message: `${minutes} dakikalık ders ücreti eksik veya geçersiz. 0'dan büyük ve en fazla 100.000 TL bir tutar girin.`,
        };
      }
    }
    terms = {
      policy: "fixed_duration",
      rate30: roundCurrency(rates.rate30!),
      rate40: roundCurrency(rates.rate40!),
      rate50: roundCurrency(rates.rate50!),
    };
  }

  const policies = data.teacherPayoutPolicies ?? [];
  const existing = policies.find((p) => p.month === input.month);
  // Önceki politika = bu ay fiilen geçerli olan (açık seçim yoksa yürürlükteki devralınan seçim).
  const previous = existing ? termsOf(existing) : resolvePayoutPolicy({ teacherPayoutPolicies: policies.filter((p) => !p.teacherIds) }, "", input.month);
  const changed = JSON.stringify(previous) !== JSON.stringify(terms);

  const record: TeacherPayoutPolicyPeriod = {
    id: existing?.id ?? uid("ppol"),
    month: input.month,
    ...terms,
    setByUserId: actorUserId,
    setAt: now.toISOString(),
  };
  if (!changed && existing) return { ok: true, data, record: existing, previous, changed: false };
  const teacherPayoutPolicies = existing ? policies.map((p) => (p.id === existing.id ? record : p)) : [...policies, record];
  return { ok: true, data: { ...data, teacherPayoutPolicies }, record, previous, changed };
}

/** "duration-exception" bloklamaz (orantılı tutar); "missing-fee-rule" kayıt oluşturmayı engeller. */
export type TeacherEarningsLineIssue = "missing-fee-rule" | "missing-student" | "missing-branch" | "duration-exception";

export type TeacherEarningsLine = {
  lessonId: string;
  lessonDate: string;
  studentId: string;
  studentName?: string;
  branchName?: string;
  instrument: Instrument;
  durationMinutes: number;
  perMinuteRate?: number;
  amount: number;
  feeRuleId?: string;
  issue?: TeacherEarningsLineIssue;
  /** Bu satıra uygulanan politika (ay bazlı). */
  pricingPolicy?: TeacherPayoutPricingPolicy;
  /** Süre istisnasında uygulanan üst tarife (orantı açıklaması; kayda da donar). */
  exceptionDetail?: { tariffMinutes: number; tariffRate: number };
};

export type TeacherEarningsResult = {
  lines: TeacherEarningsLine[];
  totalLessons: number;
  totalMinutes: number;
  totalAmount: number;
  missingFeeRuleLessonIds: string[];
  /** Sabit ücret politikasında 30/40/50 dışı süreli dersler — orantılı tutarla gelir, BLOKLAMAZ. */
  unsupportedDurationLessonIds: string[];
  /** Hakedişten hariç tutulmuş dersler (gerekçeli; sayılmaz, geri alınabilir). */
  excludedLessons?: { lessonId: string; lessonDate: string; studentName?: string; reason: string }[];
  /** Dönemin kapsadığı her ay için uygulanan politika + tutarlar. */
  pricingByMonth: Record<string, TeacherPayoutPolicyTerms>;
  canCreatePayout: boolean;
};

/**
 * EPIC 3 (IMPLEMENTATION_PLAN.md) — kesirli sürenin ödenecek dakikaya
 * çevrilmesi. `data.settings.feeRoundingMode`'a göre dallanır; hiçbiri
 * `TeacherFeeRule.perMinuteRate`'i değiştirmez, yalnızca hangi dakika
 * sayısının bu oranla çarpılacağını belirler.
 */
function payableMinutesFor(data: Pick<AppData, "settings">, actualMinutes: number): number {
  switch (data.settings.feeRoundingMode) {
    case "round_30":
      // Öğretmen lehine: dilimin herhangi bir kısmı tam dilim sayılır.
      return Math.ceil(actualMinutes / 30) * 30;
    case "fixed_package":
      // Gerçek süre yok sayılır — okulun standart ders süresi esas alınır.
      return data.settings.lessonDurationMinutes;
    case "exact_minutes":
    default:
      return actualMinutes;
  }
}

/**
 * Bir öğretmenin verilen dönem için hakediş dökümünü hesaplar. Yalnızca
 * `lesson.teacherId === teacherId` ile filtreler — `Teacher.branchId` ile
 * İKİNCİ bir filtre UYGULANMAZ (çok şubeli öğretmen dersleri sessizce
 * düşmesin diye kasıtlı tasarım kararı). Yalnızca fiilen verilmiş dersler
 * (İşlendi / Geldi / tamamlandı — `isLessonProcessedForPayout`) sayılır;
 * Telafi/Gelmedi/Mazeretli ve `cancelled`/`no_show` hariç tutulur. Aynı `lesson.id`
 * ikinci kez gelirse yalnızca ilk geçerli kayıt hesaplanır.
 *
 * Ders tipine göre AÇIK politika (EPIC 3):
 * - `regular`/`makeup`: tam oranla sayılır — öğretmen telafi dersini de
 *   fiilen verdiği için hakedişten düşülmez.
 * - `trial`: bugün için tam oranla sayılır (ayrı bir deneme-dersi ücreti
 *   altyapısı yok — bkz. IMPLEMENTATION_PLAN.md EPIC 3 "Açık kararlar").
 *   Bu bilinçli bir varsayılan, testle kilitlenmiştir.
 * - `status: "cancelled" | "no_show"`: hakedişe hiç girmez (yalnızca
 *   `"completed"` sayılır) — öğretmenin dersi FİİLEN vermediği tek durum bu.
 * - Yoklamada "Gelmedi"/"Mazeretli"/"Telafi" işaretli ders hakedişe girmez
 *   (tek statü; owner kararı 2026-09-30 bu davranışı korudu). Yalnız
 *   `Attendance` satırı "absent" olup ders "Dersi bitir" ile tamamlandıysa
 *   ve bu bayraklar yoksa ders sayılır.
 */
/**
 * 2026-10-23 — grup dersi oturumları (öğretmen bazında): temsilci satır = oturumun EN KÜÇÜK kimlikli satırı (iptal dahil;
 * yeni katılımcı yalnız gelecek oturumlara eklendiği için kayıtlı dönemlerde değişmez), `payable` = iptal edilmemiş
 * satırlardan en az biri `isLessonProcessedForPayout`. Bireysel ders kuralıyla aynı: kimse gelmediyse/işlenmediyse sayılmaz.
 */
export function groupSessionPayoutIndex(
  lessons: readonly Lesson[],
  teacherId: string
): Map<string, { representativeId: string; payable: boolean; participants: number }> {
  const out = new Map<string, { representativeId: string; payable: boolean; participants: number }>();
  for (const l of lessons) {
    if (l.teacherId !== teacherId || !l.groupSessionId || l.type === "group") continue;
    const cur = out.get(l.groupSessionId) ?? { representativeId: l.id, payable: false, participants: 0 };
    if (l.id < cur.representativeId) cur.representativeId = l.id;
    if (l.status !== "cancelled") {
      cur.participants += 1;
      if (isLessonProcessedForPayout(l)) cur.payable = true;
    }
    out.set(l.groupSessionId, cur);
  }
  return out;
}

export function computeTeacherEarningsForPeriod(
  data: PayoutComputationData,
  teacherId: string,
  periodStart: string,
  periodEnd: string
): TeacherEarningsResult {
  const startKey = toDayKey(periodStart);
  const endKey = toDayKey(periodEnd);

  const seen = new Set<string>();
  const lines: TeacherEarningsLine[] = [];
  const missingFeeRuleLessonIds: string[] = [];
  const unsupportedDurationLessonIds: string[] = [];
  const pricingByMonth: Record<string, TeacherPayoutPolicyTerms> = {};
  for (let m = startKey.slice(0, 7); m <= endKey.slice(0, 7); m = nextMonthKey(m)) {
    pricingByMonth[m] = resolvePayoutPolicy(data, teacherId, m);
  }

  const exclusions = new Map((data.teacherPayoutExclusions ?? []).map((x) => [x.lessonId, x]));
  const excludedLessons: NonNullable<TeacherEarningsResult["excludedLessons"]> = [];

  const seenClubSessions = new Set<string>();
  // 2026-10-21 — kulüp oturumunda ayrı öğretmen yoklaması kaldırıldı: oturum, saati geçmiş, iptal edilmemiş ve
  // ertelenmemişse (tüm canlı satırlar Telafi değilse) yapılmış sayılır. Öğretmen gelmediyse oturum ertelenir.
  const nowMs = Date.now();
  const heldClubSessions = new Set<string>();
  {
    const live = new Map<string, boolean>(); // sessionId → tüm canlı satırlar Telafi mi
    for (const l of data.lessons) {
      if (l.teacherId !== teacherId || l.type !== "group" || !l.clubSessionId || l.status === "cancelled") continue;
      live.set(l.clubSessionId, (live.get(l.clubSessionId) ?? true) && l.opsMakeupFlag === true);
      if (Date.parse(l.startAt) <= nowMs) heldClubSessions.add(l.clubSessionId);
    }
    for (const [id, postponed] of live) if (postponed) heldClubSessions.delete(id);
  }
  const groupPayout = groupSessionPayoutIndex(data.lessons, teacherId);
  for (const lesson of data.lessons) {
    if (lesson.teacherId !== teacherId) continue;
    if (lesson.type === "group") {
      // 2026-10-06 (owner) — kulüp oturumu: üye satırı sayısından bağımsız, yapılmış her oturum TEK ders (süresine
      // göre mevcut kural). Öğrenci statüsü (Geldi/Gelmedi/Telafi) etkilemez.
      if (!lesson.clubSessionId || lesson.status === "cancelled" || !heldClubSessions.has(lesson.clubSessionId)) continue;
      if (seenClubSessions.has(lesson.clubSessionId)) continue;
      seenClubSessions.add(lesson.clubSessionId);
    } else if (lesson.groupSessionId) {
      // 2026-10-23 — grup dersi: NORMAL ders kuralı (yalnız fiilen verilmiş ders) oturum düzeyinde — satırlardan en az
      // biri hakedişe uygunsa oturum TEK ders sayılır; temsilci satır sabittir (hariç tutma/revizyon anahtarı kaymasın).
      if (groupPayout.get(lesson.groupSessionId)?.representativeId !== lesson.id) continue;
      if (!groupPayout.get(lesson.groupSessionId)?.payable) continue;
    } else if (!isLessonProcessedForPayout(lesson)) continue;
    const dayKey = toDayKey(lesson.startAt);
    if (dayKey < startKey || dayKey > endKey) continue;
    if (seen.has(lesson.id)) continue;
    seen.add(lesson.id);
    const ex = exclusions.get(lesson.id);
    if (ex) {
      excludedLessons.push({
        lessonId: lesson.id,
        lessonDate: lesson.startAt,
        studentName: data.students.find((s) => s.id === lesson.studentId)?.name,
        reason: ex.reason,
      });
      continue;
    }

    const student = data.students.find((s) => s.id === lesson.studentId);
    const branch = data.settings.branches.find((b) => b.id === lesson.branchId);
    const durationMinutes = differenceInMinutes(parseISO(lesson.endAt), parseISO(lesson.startAt));
    const terms = pricingByMonth[dayKey.slice(0, 7)] ?? DEFAULT_TERMS;

    let issue: TeacherEarningsLineIssue | undefined;
    let amount = 0;
    let perMinuteRate: number | undefined;
    let feeRuleId: string | undefined;
    let exceptionDetail: TeacherEarningsLine["exceptionDetail"];
    if (terms.policy === "fixed_duration") {
      // Sabit ücret: ders başı tutar; yuvarlama modu ve öğretmen kuralı KULLANILMAZ.
      const fixed = fixedRateFor(terms, durationMinutes);
      if (fixed) {
        amount = fixed.amount;
        perMinuteRate = durationMinutes > 0 ? fixed.amount / durationMinutes : undefined; // saatlik birim gösterimi
        if (fixed.exception) {
          issue = "duration-exception";
          unsupportedDurationLessonIds.push(lesson.id);
          if (fixed.tariffMinutes !== undefined && fixed.tariffRate !== undefined) {
            exceptionDetail = { tariffMinutes: fixed.tariffMinutes, tariffRate: fixed.tariffRate };
          }
        }
      }
    } else {
      const rule = resolveFeeRule(data.teacherFeeRules, {
        teacherId,
        branchId: lesson.branchId,
        instrument: lesson.instrument,
        lessonDateIso: lesson.startAt,
      });
      if (!rule) {
        issue = "missing-fee-rule";
        missingFeeRuleLessonIds.push(lesson.id);
      } else {
        amount = roundCurrency(payableMinutesFor(data, durationMinutes) * rule.perMinuteRate);
        perMinuteRate = rule.perMinuteRate;
        feeRuleId = rule.id;
      }
    }
    if (!issue && !student && !lesson.groupSessionId) issue = "missing-student";
    else if (!issue && !branch) issue = "missing-branch";

    lines.push({
      lessonId: lesson.id,
      lessonDate: lesson.startAt,
      studentId: lesson.studentId,
      studentName:
        lesson.type === "group"
          ? "Kulüp oturumu"
          : lesson.groupSessionId
            ? `Grup dersi · ${groupPayout.get(lesson.groupSessionId)?.participants ?? 1} öğrenci`
            : student?.name,
      branchName: branch?.name,
      instrument: lesson.instrument,
      durationMinutes,
      perMinuteRate,
      amount,
      feeRuleId,
      issue,
      pricingPolicy: terms.policy,
      exceptionDetail,
    });
  }

  const totalMinutes = lines.reduce((sum, l) => sum + l.durationMinutes, 0);
  const totalAmount = roundCurrency(lines.reduce((sum, l) => sum + l.amount, 0));

  return {
    lines,
    totalLessons: lines.length,
    totalMinutes,
    totalAmount,
    missingFeeRuleLessonIds,
    unsupportedDurationLessonIds,
    excludedLessons,
    pricingByMonth,
    canCreatePayout: missingFeeRuleLessonIds.length === 0,
  };
}

function nextMonthKey(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export type CreateTeacherPayoutResult =
  | { ok: true; data: AppData; payout: TeacherPayout; reusedCancelledId?: string }
  | { ok: false; code: "MISSING_FEE_RULE"; message: string; missingFeeRuleLessonIds: string[] }
  | { ok: false; code: "OVERLAPPING_PAYOUT"; message: string; existingPayoutId: string }
  | { ok: false; code: "PAYOUT_ALREADY_EXISTS"; message: string; existingPayoutId: string };

/** Hakediş dönemi kimliği gün bazındadır. DB ISO datetime ile formun yyyy-MM-dd değeri aynı dönemdir. */
/**
 * 2026-10-04 — dersin gününü kapsayan AKTİF (iptal edilmemiş) hakediş kaydı (aynı öğretmen). Gün anahtarı,
 * hakediş hesabının (`computeTeacherEarningsForPeriod`) kullandığı anahtarla aynıdır.
 */
export function findPayoutCoveringLesson(
  payouts: TeacherPayout[],
  lesson: Pick<Lesson, "teacherId" | "startAt">
): TeacherPayout | undefined {
  const day = toDayKey(lesson.startAt);
  return payouts.find(
    (p) =>
      p.teacherId === lesson.teacherId &&
      p.status !== "cancelled" &&
      payoutPeriodDayKey(p.periodStart) <= day &&
      payoutPeriodDayKey(p.periodEnd) >= day
  );
}

export function payoutPeriodDayKey(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match?.[1] ?? value.slice(0, 10);
}

/** Hakediş ödeme yöntemi eşiği (nakit/havale). */
export type TeacherPayoutPaymentMethod = "cash" | "transfer";

export type TeacherPayoutPaymentMethodInfo = {
  /** Dönem boyunca gerçekleşen (hakedişe giren) toplam ders saati, dönemin kapsadığı takvim haftası sayısına bölünmüş ortalama. */
  weeklyHours: number;
  /** `Teacher.weeklyHoursThreshold` — tanımlı değilse `defaultMethod` de üretilmez. */
  threshold?: number;
  /** Eşik ÜSTÜNDE nakit, eşiğe EŞİT veya ALTINDA havale. Eşik yoksa `undefined`. */
  defaultMethod?: TeacherPayoutPaymentMethod;
};

/**
 * Bir dönemin kapsadığı takvim haftası sayısı — kestirme "sabit 4 hafta"
 * VARSAYILMAZ, dönemin gerçek gün sayısı (dahil) 7'ye bölünerek kesirli
 * hesaplanır (ör. 31 günlük bir ay ≈ 4.43 hafta). Bu, haftalık ortalama
 * ders saatinin dönem uzunluğundan (28/30/31 gün) bağımsız, tutarlı ve
 * test edilebilir olmasını sağlar.
 */
function calendarWeeksInPeriod(periodStart: string, periodEnd: string): number {
  const days = differenceInCalendarDays(parseISO(periodEnd), parseISO(periodStart)) + 1;
  return days > 0 ? days / 7 : 0;
}

/**
 * PRODUCT_BACKLOG §3.4 — öğretmenin `weeklyHoursThreshold` değeriyle, verilen
 * dönemdeki GERÇEK (hakedişe giren) ders saatini karşılaştırır. Süre kaynağı
 * `computeTeacherEarningsForPeriod`'un ZATEN hesapladığı `totalMinutes`'tır
 * (lesson start/end farkı) — burada yeni bir süre varsayımı ÜRETİLMEZ, mevcut
 * hakediş motorunun davranışı (hangi dersler sayılır/sayılmaz) aynen korunur.
 * Öğretmen bulunamazsa `null` döner.
 */
export function computeTeacherPayoutPaymentMethodInfo(
  data: PayoutComputationData & Pick<AppData, "teachers">,
  teacherId: string,
  periodStart: string,
  periodEnd: string
): TeacherPayoutPaymentMethodInfo | null {
  const teacher = data.teachers.find((t) => t.id === teacherId);
  if (!teacher) return null;

  const earnings = computeTeacherEarningsForPeriod(data, teacherId, periodStart, periodEnd);
  const weeks = calendarWeeksInPeriod(periodStart, periodEnd);
  const weeklyHours = weeks > 0 ? earnings.totalMinutes / 60 / weeks : 0;
  const threshold = teacher.weeklyHoursThreshold;
  const defaultMethod: TeacherPayoutPaymentMethod | undefined =
    threshold === undefined ? undefined : weeklyHours > threshold ? "cash" : "transfer";

  return { weeklyHours, threshold, defaultMethod };
}

/**
 * Bir dönem için hakediş snapshot'ı oluşturur. `totalMinutes`/`totalAmount`
 * bu anda donar — `TeacherFeeRule` sonradan değişse bile bu kayıt bir daha
 * yeniden hesaplanmaz. Aynı teacherId+periodStart+periodEnd için ikinci kez
 * çağrılırsa reddedilir. Eksik ücret kurallı ders varsa oluşturulmaz.
 *
 * Ödeme yöntemi (`method`): yönetici `paymentMethodOverride` verdiyse AYNEN
 * kullanılır; vermediyse `computeTeacherPayoutPaymentMethodInfo`'nun ürettiği
 * varsayım (`defaultMethod`, eşik yoksa `undefined`) ile ÖN-DOLDURULUR. Bu
 * yalnızca kayıt oluşturma ANINDA olur — kayıt oluştuktan sonra `method`
 * yalnızca `updateTeacherPayoutPaymentMethodData`/`markTeacherPayoutPaidData`
 * ile DEĞİŞTİRİLEBİLİR; bu fonksiyon bir daha ÇAĞRILMAZ (idempotent create),
 * dolayısıyla bir override sonraki hesaplamalarda asla ezilmez.
 */
export function createTeacherPayoutSnapshot(
  data: AppData,
  teacherId: string,
  periodStart: string,
  periodEnd: string,
  now: Date = new Date(),
  paymentMethodOverride?: TeacherPayoutPaymentMethod
): CreateTeacherPayoutResult {
  const startKey = payoutPeriodDayKey(periodStart);
  const endKey = payoutPeriodDayKey(periodEnd);
  const existing = data.teacherPayouts.find(
    (p) =>
      p.teacherId === teacherId &&
      payoutPeriodDayKey(p.periodStart) === startKey &&
      payoutPeriodDayKey(p.periodEnd) === endKey
  );
  // İptal edilmiş aynı dönem kaydı YENİDEN KULLANILIR (aynı id; tekillik korunur, iz audit'te).
  if (existing && existing.status !== "cancelled") {
    return {
      ok: false,
      code: "PAYOUT_ALREADY_EXISTS",
      message: "Bu öğretmen ve dönem için zaten bir hakediş kaydı oluşturulmuş.",
      existingPayoutId: existing.id,
    };
  }
  // Çift hakediş koruması: aynı derse iki kayıt girmesin — kesişen farklı aralıklı AKTİF kayıt reddedilir.
  const overlapping = data.teacherPayouts.find(
    (p) =>
      p.teacherId === teacherId &&
      p.status !== "cancelled" &&
      p.id !== existing?.id &&
      payoutPeriodDayKey(p.periodStart) <= endKey &&
      payoutPeriodDayKey(p.periodEnd) >= startKey
  );
  if (overlapping) {
    return {
      ok: false,
      code: "OVERLAPPING_PAYOUT",
      message: `Bu dönem, öğretmenin ${payoutPeriodDayKey(overlapping.periodStart)} – ${payoutPeriodDayKey(overlapping.periodEnd)} hakediş kaydıyla kesişiyor; aynı ders iki kez sayılmasın diye oluşturulmadı. Önce o kaydı iptal edin veya dönemi değiştirin.`,
      existingPayoutId: overlapping.id,
    };
  }

  const earnings = computeTeacherEarningsForPeriod(data, teacherId, periodStart, periodEnd);
  if (!earnings.canCreatePayout) {
    return {
      ok: false,
      code: "MISSING_FEE_RULE",
      message: "Bazı derslerde geçerli ücret kuralı bulunamadığı için hakediş oluşturulamıyor.",
      missingFeeRuleLessonIds: earnings.missingFeeRuleLessonIds,
    };
  }

  const methodInfo = computeTeacherPayoutPaymentMethodInfo(data, teacherId, periodStart, periodEnd);
  const method = paymentMethodOverride ?? methodInfo?.defaultMethod;

  const payout: TeacherPayout = {
    id: existing?.id ?? uid("payout"),
    teacherId,
    periodStart,
    periodEnd,
    totalMinutes: earnings.totalMinutes,
    totalAmount: earnings.totalAmount,
    status: "pending",
    generatedAt: now.toISOString(),
    method,
    ...pricingFields(earnings.pricingByMonth),
    lineSnapshot: toSnapshotLines(earnings.lines),
    payments: [],
    adjustments: [],
    revisionCount: 0,
    version: existing?.version ?? 0,
  };

  const teacherPayouts = existing
    ? data.teacherPayouts.map((p) => (p.id === existing.id ? payout : p))
    : [...data.teacherPayouts, payout];
  return { ok: true, data: { ...data, teacherPayouts }, payout, reusedCancelledId: existing?.id };
}

function toSnapshotLines(lines: TeacherEarningsLine[]): TeacherPayoutSnapshotLine[] {
  return lines.map((l) => ({
    lessonId: l.lessonId,
    lessonDate: l.lessonDate,
    studentId: l.studentId,
    studentName: l.studentName,
    branchName: l.branchName,
    instrument: l.instrument,
    durationMinutes: l.durationMinutes,
    perMinuteRate: l.perMinuteRate,
    amount: l.amount,
    feeRuleId: l.feeRuleId,
    pricingPolicy: l.pricingPolicy,
    issue: l.issue,
    exceptionDetail: l.exceptionDetail,
  }));
}

/** Kayıtlı hakedişin donmuş dökümü (kalemler kayıttan); eski kayıtta canlı hesap. */
export function payoutBaseEarnings(data: PayoutComputationData, payout: TeacherPayout): TeacherEarningsResult {
  if (!payout.lineSnapshot) return computeTeacherEarningsForPeriod(data, payout.teacherId, payout.periodStart, payout.periodEnd);
  const lines: TeacherEarningsLine[] = payout.lineSnapshot.map((l) => ({
    ...l,
    issue: l.issue as TeacherEarningsLineIssue | undefined,
  }));
  return {
    lines,
    totalLessons: lines.length,
    totalMinutes: lines.reduce((s, l) => s + l.durationMinutes, 0),
    totalAmount: roundCurrency(lines.reduce((s, l) => s + l.amount, 0)),
    missingFeeRuleLessonIds: lines.filter((l) => l.issue === "missing-fee-rule").map((l) => l.lessonId),
    unsupportedDurationLessonIds: lines.filter((l) => l.issue === "duration-exception").map((l) => l.lessonId),
    excludedLessons: computeTeacherEarningsForPeriod(data, payout.teacherId, payout.periodStart, payout.periodEnd).excludedLessons,
    pricingByMonth: payout.pricingSnapshot ?? {},
    canCreatePayout: true,
  };
}

/**
 * Kayıt ile güncel hesap arasındaki fark (politika/kural/hariç tutma/ders değişikliği sonrası).
 * = güncel hesap (satır düzeltmeleri uygulanmış) − (kayıttaki hesap + "recalc" düzeltmeleri).
 * Ödemesiz kayıtta `recomputePayoutData` ile sıfırlanır; ödemeli kayıtta düzeltme kaydıyla kapatılır.
 */
export function payoutDrift(data: PayoutComputationData, payout: TeacherPayout): number {
  if (payout.status === "cancelled" || !payout.lineSnapshot) return 0;
  const live = applyPayoutLineOverrides(
    computeTeacherEarningsForPeriod(data, payout.teacherId, payout.periodStart, payout.periodEnd),
    payout.lineOverrides
  );
  const recalc = (payout.adjustments ?? []).filter((a) => !a.reversedAt && a.kind === "recalc").reduce((s, a) => s + a.amount, 0);
  return roundCurrency(live.totalAmount - payout.totalAmount - recalc);
}

/**
 * Ödemesiz (pending) kaydı güncel hesapla yeniden donurur: kalemler, politika izi, toplam.
 * Artık dökümde olmayan dersin satır düzeltmesi düşer; kalanlar korunur.
 */
export function recomputePayoutData(data: AppData, payout: TeacherPayout): TeacherPayout | { error: string } {
  if (payout.status !== "pending") return { error: "Yalnız ödemesi olmayan (bekleyen) hakediş yeniden hesaplanır; ödemeli kayıtta farkı düzeltme kaydıyla kapatın." };
  const base = computeTeacherEarningsForPeriod(data, payout.teacherId, payout.periodStart, payout.periodEnd);
  if (!base.canCreatePayout) {
    return { error: `${base.missingFeeRuleLessonIds.length} derste geçerli ücret kuralı yok; önce kuralı tanımlayın veya dersi hakedişten hariç tutun.` };
  }
  const overrides = payout.lineOverrides
    ? Object.fromEntries(Object.entries(payout.lineOverrides).filter(([id]) => base.lines.some((l) => l.lessonId === id)))
    : undefined;
  const revised = applyPayoutLineOverrides(base, overrides);
  const hasOverrides = overrides && Object.keys(overrides).length > 0;
  return {
    ...payout,
    lineSnapshot: toSnapshotLines(base.lines),
    lineOverrides: hasOverrides ? overrides : undefined,
    totalAmount: revised.totalAmount,
    totalMinutes: revised.totalMinutes,
    originalTotalAmount: hasOverrides ? base.totalAmount : undefined,
    originalTotalMinutes: hasOverrides ? base.totalMinutes : undefined,
    ...pricingFields(base.pricingByMonth),
  };
}

/** Kayıt anındaki politika izi: tek politika ise o, aylar farklıysa "mixed" + ay bazlı döküm. */
function pricingFields(byMonth: Record<string, TeacherPayoutPolicyTerms>): Pick<TeacherPayout, "pricingPolicy" | "pricingSnapshot"> {
  const policies = new Set(Object.values(byMonth).map((t) => t.policy));
  const pricingPolicy = policies.size === 1 ? [...policies][0] : "mixed";
  return { pricingPolicy, pricingSnapshot: byMonth };
}

export type UpdateTeacherPayoutPaymentMethodResult =
  | { ok: true; data: AppData; payout: TeacherPayout }
  | { ok: false; code: "NOT_FOUND"; message: string };

/**
 * Yönetici override'ı — mevcut bir hakediş kaydının ödeme yöntemini (nakit/
 * havale) açıkça değiştirir. Tutarı/ders sayısını/statüyü ASLA değiştirmez;
 * yalnızca `method` alanını yazar. `markTeacherPayoutPaidData` sonrasında da
 * çağrılabilir (ödendi işaretlenmiş bir kaydın yöntemi düzeltilebilir).
 */
export function updateTeacherPayoutPaymentMethodData(
  data: AppData,
  payoutId: string,
  method: TeacherPayoutPaymentMethod
): UpdateTeacherPayoutPaymentMethodResult {
  const existing = data.teacherPayouts.find((p) => p.id === payoutId);
  if (!existing) return { ok: false, code: "NOT_FOUND", message: "Hakediş kaydı bulunamadı." };

  const updated: TeacherPayout = { ...existing, method };
  const teacherPayouts = data.teacherPayouts.map((p) => (p.id === payoutId ? updated : p));
  return { ok: true, data: { ...data, teacherPayouts }, payout: updated };
}

export type MarkPayoutPaidResult =
  | { ok: true; data: AppData; payout: TeacherPayout }
  | { ok: false; code: "NOT_FOUND" | "ALREADY_PAID"; message: string };

/**
 * Bekleyen bir hakedişi ödendi olarak işaretler. Tutarı asla değiştirmez.
 * `method` verilmezse (madde 3 — override korunmalı) mevcut kayıttaki
 * (oluşturma anında ön-doldurulmuş varsayım VEYA yönetici override'ı) değer
 * AYNEN korunur — `undefined` geçilmesi onu SİLMEZ.
 */
export function markTeacherPayoutPaidData(
  data: AppData,
  payoutId: string,
  method?: string,
  now: Date = new Date()
): MarkPayoutPaidResult {
  const existing = data.teacherPayouts.find((p) => p.id === payoutId);
  if (!existing) return { ok: false, code: "NOT_FOUND", message: "Hakediş kaydı bulunamadı." };
  if (existing.status === "paid") {
    return { ok: false, code: "ALREADY_PAID", message: "Bu hakediş zaten ödendi olarak işaretlenmiş." };
  }
  // 2026-09-30 — "Öde" = kalan bakiye kadar bir ödeme satırı (defter; kısmi ödeme ayrı tool).
  const res = addPaymentData(existing, { method: method ?? existing.method, paidAt: now.toISOString() }, "", now);
  if (!res.ok) return { ok: false, code: "ALREADY_PAID", message: res.message };
  const updated: TeacherPayout = res.payout;
  const teacherPayouts = data.teacherPayouts.map((p) => (p.id === payoutId ? updated : p));
  return { ok: true, data: { ...data, teacherPayouts }, payout: updated };
}

// ─── K · Hakediş revizyonu (2026-09-23) ─────────────────────────────────────

export type RevisedEarningsLine = TeacherEarningsLine & {
  /** Saatlik ücret (dakika ücreti × 60) — dökümde gösterilen/düzenlenen birim. */
  hourlyRate?: number;
  /** Elle düzeltildiyse hesaplanan orijinal değerler. */
  original?: { durationMinutes: number; hourlyRate?: number; amount: number };
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Satır düzeltmelerini hesaplanan dökümün üstüne uygular ve toplamları yeniden
 * hesaplar. Kural: tutar elle girildiyse o geçerlidir; yalnız süre ve/veya
 * saatlik ücret girildiyse tutar = süre × saatlik ücret / 60; hiçbiri yoksa
 * hesaplanan satır aynen kalır. Dökümde artık olmayan derse ait düzeltme yok sayılır.
 */
export function applyPayoutLineOverrides(
  result: TeacherEarningsResult,
  overrides: Record<string, TeacherPayoutLineOverride> | undefined
): Omit<TeacherEarningsResult, "lines"> & { lines: RevisedEarningsLine[] } {
  const lines: RevisedEarningsLine[] = result.lines.map((line) => {
    const hourlyRate = line.perMinuteRate !== undefined ? round2(line.perMinuteRate * 60) : undefined;
    const o = overrides?.[line.lessonId];
    if (!o) return { ...line, hourlyRate };
    const minutes = o.minutes ?? line.durationMinutes;
    const rate = o.hourlyRate ?? hourlyRate;
    const amount =
      o.amount !== undefined
        ? roundCurrency(o.amount)
        : o.minutes !== undefined || o.hourlyRate !== undefined
          ? rate !== undefined
            ? roundCurrency((minutes * rate) / 60)
            : line.amount
          : line.amount;
    return {
      ...line,
      durationMinutes: minutes,
      hourlyRate: rate,
      amount,
      original: { durationMinutes: line.durationMinutes, hourlyRate, amount: line.amount },
    };
  });
  return {
    ...result,
    lines,
    totalMinutes: lines.reduce((s, l) => s + l.durationMinutes, 0),
    totalAmount: roundCurrency(lines.reduce((s, l) => s + l.amount, 0)),
  };
}

/**
 * İstemciden gelen düzeltmeleri doğrular: yalnız dökümdeki dersler, makul
 * sınırlar, hesaplanan değerle aynı olan alanlar düşer (boş düzeltme saklanmaz).
 */
export function sanitizePayoutLineOverrides(
  result: TeacherEarningsResult,
  raw: Record<string, TeacherPayoutLineOverride>
): { ok: true; overrides: Record<string, TeacherPayoutLineOverride> } | { ok: false; message: string } {
  const out: Record<string, TeacherPayoutLineOverride> = {};
  for (const [lessonId, o] of Object.entries(raw)) {
    const line = result.lines.find((l) => l.lessonId === lessonId);
    if (!line) continue;
    const hourly = line.perMinuteRate !== undefined ? round2(line.perMinuteRate * 60) : undefined;
    const next: TeacherPayoutLineOverride = {};
    if (o.minutes !== undefined) {
      if (!Number.isInteger(o.minutes) || o.minutes < 0 || o.minutes > 600) {
        return { ok: false, message: `${formatLineLabel(line)}: süre 0–600 dakika arasında tam sayı olmalı.` };
      }
      if (o.minutes !== line.durationMinutes) next.minutes = o.minutes;
    }
    if (o.hourlyRate !== undefined) {
      if (!Number.isFinite(o.hourlyRate) || o.hourlyRate < 0 || o.hourlyRate > 100_000) {
        return { ok: false, message: `${formatLineLabel(line)}: saatlik ücret 0 ile 100.000 TL arasında olmalı.` };
      }
      if (round2(o.hourlyRate) !== hourly) next.hourlyRate = round2(o.hourlyRate);
    }
    if (o.amount !== undefined) {
      if (!Number.isFinite(o.amount) || o.amount < 0 || o.amount > 1_000_000) {
        return { ok: false, message: `${formatLineLabel(line)}: tutar 0 ile 1.000.000 TL arasında olmalı.` };
      }
      if (roundCurrency(o.amount) !== line.amount) next.amount = roundCurrency(o.amount);
    }
    if (Object.keys(next).length > 0) out[lessonId] = next;
  }
  return { ok: true, overrides: out };
}

function formatLineLabel(line: TeacherEarningsLine): string {
  return `${line.lessonDate.slice(0, 10).split("-").reverse().join(".")} ${line.studentName ?? "ders"}`;
}

/**
 * Ekran/baskı için döküm: dönemin hakediş kaydı revize edilmişse satır düzeltmeleri
 * uygulanır (öğretmen portalı, hakediş özeti ve baskı aynı rakamı gösterir).
 * Snapshot oluşturma ve revizyonun kendisi ham `computeTeacherEarningsForPeriod` kullanır.
 */
export function computeTeacherEarningsWithRevisions(
  data: PayoutLedgerData,
  teacherId: string,
  periodStart: string,
  periodEnd: string
): Omit<TeacherEarningsResult, "lines"> & { lines: RevisedEarningsLine[] } {
  const payout = data.teacherPayouts.find(
    (p) =>
      p.teacherId === teacherId &&
      p.status !== "cancelled" &&
      payoutPeriodDayKey(p.periodStart) === payoutPeriodDayKey(periodStart) &&
      payoutPeriodDayKey(p.periodEnd) === payoutPeriodDayKey(periodEnd)
  );
  // Kayıt varsa ekran = kayıt (donmuş kalemler); yoksa canlı hesap.
  const base = payout ? payoutBaseEarnings(data, payout) : computeTeacherEarningsForPeriod(data, teacherId, periodStart, periodEnd);
  return applyPayoutLineOverrides(base, payout?.lineOverrides);
}
