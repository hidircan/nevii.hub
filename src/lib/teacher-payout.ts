import { differenceInCalendarDays, differenceInMinutes, format, parseISO } from "date-fns";
import type { AppData, BranchId, Instrument, TeacherFeeRule, TeacherPayout } from "./types";
import { uid } from "./utils";
import { isLessonProcessedForPayout } from "./lesson-ops";

/** ISO tarih/saat girdisinden gün-hassasiyetli, yerel takvim anahtarı üretir — saat dilimi kaymasına karşı güvenli. */
function toDayKey(iso: string): string {
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

export type TeacherEarningsLineIssue = "missing-fee-rule" | "missing-student" | "missing-branch";

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
};

export type TeacherEarningsResult = {
  lines: TeacherEarningsLine[];
  totalLessons: number;
  totalMinutes: number;
  totalAmount: number;
  missingFeeRuleLessonIds: string[];
  canCreatePayout: boolean;
};

/**
 * EPIC 3 (IMPLEMENTATION_PLAN.md) — kesirli sürenin ödenecek dakikaya
 * çevrilmesi. `data.settings.feeRoundingMode`'a göre dallanır; hiçbiri
 * `TeacherFeeRule.perMinuteRate`'i değiştirmez, yalnızca hangi dakika
 * sayısının bu oranla çarpılacağını belirler.
 */
function payableMinutesFor(data: AppData, actualMinutes: number): number {
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
 * düşmesin diye kasıtlı tasarım kararı). Yalnızca `status === "completed"`
 * dersler sayılır; `cancelled`/`no_show` hariç tutulur. Aynı `lesson.id`
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
 * - Devamsızlık (`Attendance.status: "absent"`): `Lesson.status` yine de
 *   `"completed"` olabilir (öğretmen dersi bekledi/verdi, öğrenci gelmedi)
 *   — bu durumda hakediş ETKİLENMEZ; öğretmen zamanını ayırdığı için
 *   ödenir. Devamsızlığın sonucu (telafi hakkı) öğrenci tarafında oluşur,
 *   öğretmen hakedişini düşürmez.
 */
export function computeTeacherEarningsForPeriod(
  data: AppData,
  teacherId: string,
  periodStart: string,
  periodEnd: string
): TeacherEarningsResult {
  const startKey = toDayKey(periodStart);
  const endKey = toDayKey(periodEnd);

  const seen = new Set<string>();
  const lines: TeacherEarningsLine[] = [];
  const missingFeeRuleLessonIds: string[] = [];

  for (const lesson of data.lessons) {
    if (lesson.teacherId !== teacherId) continue;
    if (!isLessonProcessedForPayout(lesson)) continue;
    const dayKey = toDayKey(lesson.startAt);
    if (dayKey < startKey || dayKey > endKey) continue;
    if (seen.has(lesson.id)) continue;
    seen.add(lesson.id);

    const student = data.students.find((s) => s.id === lesson.studentId);
    const branch = data.settings.branches.find((b) => b.id === lesson.branchId);
    const durationMinutes = differenceInMinutes(parseISO(lesson.endAt), parseISO(lesson.startAt));
    const payableMinutes = payableMinutesFor(data, durationMinutes);
    const rule = resolveFeeRule(data.teacherFeeRules, {
      teacherId,
      branchId: lesson.branchId,
      instrument: lesson.instrument,
      lessonDateIso: lesson.startAt,
    });

    let issue: TeacherEarningsLineIssue | undefined;
    if (!rule) {
      issue = "missing-fee-rule";
      missingFeeRuleLessonIds.push(lesson.id);
    } else if (!student) {
      issue = "missing-student";
    } else if (!branch) {
      issue = "missing-branch";
    }

    const amount = rule ? roundCurrency(payableMinutes * rule.perMinuteRate) : 0;

    lines.push({
      lessonId: lesson.id,
      lessonDate: lesson.startAt,
      studentId: lesson.studentId,
      studentName: student?.name,
      branchName: branch?.name,
      instrument: lesson.instrument,
      durationMinutes,
      perMinuteRate: rule?.perMinuteRate,
      amount,
      feeRuleId: rule?.id,
      issue,
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
    canCreatePayout: missingFeeRuleLessonIds.length === 0,
  };
}

export type CreateTeacherPayoutResult =
  | { ok: true; data: AppData; payout: TeacherPayout }
  | { ok: false; code: "MISSING_FEE_RULE"; message: string; missingFeeRuleLessonIds: string[] }
  | { ok: false; code: "PAYOUT_ALREADY_EXISTS"; message: string; existingPayoutId: string };

/** PRODUCT_BACKLOG §3.4 — hakediş ödeme yöntemi eşiği (nakit/havale). */
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
  data: AppData,
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
  const existing = data.teacherPayouts.find(
    (p) => p.teacherId === teacherId && p.periodStart === periodStart && p.periodEnd === periodEnd
  );
  if (existing) {
    return {
      ok: false,
      code: "PAYOUT_ALREADY_EXISTS",
      message: "Bu öğretmen ve dönem için zaten bir hakediş kaydı oluşturulmuş.",
      existingPayoutId: existing.id,
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
    id: uid("payout"),
    teacherId,
    periodStart,
    periodEnd,
    totalMinutes: earnings.totalMinutes,
    totalAmount: earnings.totalAmount,
    status: "pending",
    generatedAt: now.toISOString(),
    method,
  };

  return { ok: true, data: { ...data, teacherPayouts: [...data.teacherPayouts, payout] }, payout };
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

  const updated: TeacherPayout = {
    ...existing,
    status: "paid",
    paidAt: now.toISOString(),
    method: method ?? existing.method,
  };
  const teacherPayouts = data.teacherPayouts.map((p) => (p.id === payoutId ? updated : p));
  return { ok: true, data: { ...data, teacherPayouts }, payout: updated };
}
