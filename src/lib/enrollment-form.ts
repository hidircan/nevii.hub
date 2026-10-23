/**
 * 2026-10-10 — BRANŞ KAYDI FORMU: tek model, tek doğrulama (saf; I/O yok, istemci + sunucu ortak).
 *
 * Eskiden üç ayrı uygulama vardı: yeni öğrenci kaydında ilk branşın tam formu, aynı formda ek branşın 6 alanlık
 * satırı ve öğrenci sayfasındaki "Branş kaydı ekle/Düzenle" kartı. Hangi alanın hangi koşulda görüneceği/zorunlu olacağı
 * üç yerde farklıydı (ör. ek MEB branşı MEB alanlarını hiç göstermiyordu). Artık:
 * - `EnrollmentDraft`  : bir branşın TÜM kayıt ayarları (metin alanlarıyla; form durumu = tel biçimi),
 * - `validateEnrollmentDraft` : istemci satır içi hata + sunucu asıl kapı AYNI fonksiyondur,
 * - `resolveEnrollmentPricing` / `suggestFirstCollection` : ücret ve önerilen ilk tahsilat TEK hesaptır
 *   (önizleme = oluşturma; eskiden `new-student-form` ile `createStudentTool` iki ayrı kopyaydı).
 *
 * Kararlı kimlik: her taslağın `key`'i vardır (dizideki SIRA değil). Ekleme/silme/yeniden sıralama bir branşın değerini
 * diğerine taşımaz; hatalar `key` + alan adıyla adreslenir.
 */
import { computeDiscountAmount, computeMonthlyFee } from "./packages";
import { DEFAULT_LESSON_DURATION_MINUTES, LESSON_DURATION_OPTIONS, type LessonDurationMinutes } from "./lesson-duration";
import { lessonWeekdaysFromText, parseLessonScheduleText } from "./lesson-schedule-text";
import { validateMebFields } from "./meb";
import { isValidDateOnlyInput } from "./date-input";
import { parseRegistrationFirstPaymentForm } from "./first-payment-adjustment";
import {
  computePeriodAmount,
  countExactWeekdayLessons,
  derivePerLessonAmount,
  estimatePeriodBillingLines,
  referenceMonthlyLessonCount,
  resolveLessonStartDay,
} from "./period-lesson-billing";
import { hasMebStudentType, shouldMergeFirstCollection, STUDENT_TYPES } from "./types";
import type { DiscountType, Package, StudentPaymentMethod, StudentTermType, StudentType } from "./types";
import type { DayOverride, TermWeeklyClosedDaysOverride } from "./work-days";
import type { EnrollmentTerms } from "./student-enrollments";

/** Formun çalışma kipi: yeni öğrenci kaydı | mevcut öğrenciye branş ekleme | mevcut branşı düzenleme. */
export type EnrollmentFormMode = "register" | "add" | "edit";

export type EnrollmentFirstPaymentDraft = {
  method: "" | "cash" | "transfer" | "credit_card";
  /** Ham metin: boş ("" = girilmedi) ile "0" (tahsilat yok / burslu) AYRI durumlardır. */
  amount: string;
  collectedAt: string;
  reference: string;
  note: string;
  adjustmentReason: string;
  /** null = kullanıcı dokunmadı → kurumun "ders eşiği" kuralı varsayılanı uygulanır. */
  includeNextMonth: boolean | null;
};

export type EnrollmentDraft = {
  /** İstemci kararlı anahtarı (sıra değil). Hata eşleme + React `key`. */
  key: string;
  /** Mevcut branşı düzenlerken kalıcı branş kimliği. */
  id?: string;
  instrument: string;
  teacherId: string;
  /** "" = kişinin şubesini devral (ayrı bir şube yalnız bilinçli seçilirse yazılır). */
  branchId: string;
  lessonDurationMinutes: string;
  weeklyLessonCount: string;
  studentTypes: string[];
  level: string;
  targetExam: string;
  mebLevelStartDate: string;
  mebLevelEndDate: string;
  mebExamDate: string;
  mebExamStatus: "" | "not_attended" | "attended";
  startDate: string;
  lessonStartDate: string;
  lessonScheduleText: string;
  intendedDurationMonths: string;
  packageId: string;
  /** Paketsiz serbest aylık ücret (ham metin; boş ≠ 0). */
  monthlyFee: string;
  discountType: "" | "percent" | "amount";
  discountValue: string;
  campaignIds: string[];
  overrideAmount: string;
  overrideReason: string;
  paymentMethod: "" | "cash" | "transfer" | "credit_card";
  paymentDueDay: string;
  firstPayment: EnrollmentFirstPaymentDraft;
  /** 2026-10-23 — "" = bireysel ders; doluysa bu branş kaydı bir grup dersine katılımdır (koşullar gruptan gelir). */
  groupLessonId: string;
};

/** Alan hataları: anahtar = taslak alan adı; ilk tahsilat alanları `firstPayment.<alan>`. */
export type EnrollmentFieldErrors = Record<string, string>;

export const ENROLLMENT_FIELD_LABELS: Record<string, string> = {
  instrument: "Enstrüman",
  teacherId: "Öğretmen",
  branchId: "Şube",
  lessonDurationMinutes: "Ders süresi",
  weeklyLessonCount: "Haftalık ders",
  studentTypes: "Öğrenci türü",
  level: "Seviye",
  targetExam: "Hedef sınav",
  mebLevelStartDate: "MEB seviye başlangıç tarihi",
  mebLevelEndDate: "MEB seviye bitiş tarihi",
  mebExamDate: "MEB sınav tarihi",
  mebExamStatus: "Sınava girdi mi?",
  startDate: "Kayıt tarihi",
  lessonStartDate: "Ders başlangıç tarihi",
  lessonScheduleText: "Ders günü ve saati",
  intendedDurationMonths: "Kayıt süresi",
  packageId: "Paket",
  monthlyFee: "Aylık ücret",
  discountType: "İndirim türü",
  discountValue: "İndirim değeri",
  campaignIds: "Kampanya",
  overrideAmount: "Elle aylık ücret",
  overrideReason: "Elle ücret gerekçesi",
  groupLessonId: "Grup dersi",
  paymentMethod: "Ödeme türü",
  paymentDueDay: "Ödeme günü",
  "firstPayment.method": "Ödeme yöntemi",
  "firstPayment.amount": "Tahsil edilen tutar",
  "firstPayment.collectedAt": "Tahsilat tarihi",
  "firstPayment.adjustmentReason": "Düzeltme gerekçesi",
};

const WEEKLY_OPTIONS = [1, 2] as const;
export const ENROLLMENT_WEEKLY_OPTIONS: readonly number[] = WEEKLY_OPTIONS;
const PAYMENT_METHODS = ["cash", "transfer", "credit_card"] as const;

export function newEnrollmentKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return `enrd_${c.randomUUID()}`;
  return `enrd_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyFirstPaymentDraft(): EnrollmentFirstPaymentDraft {
  return { method: "", amount: "", collectedAt: "", reference: "", note: "", adjustmentReason: "", includeNextMonth: null };
}

/** Yeni, boş bir branş taslağı. Varsayılanlar eski ilk-branş formuyla aynıdır (40 dk, haftada 1, 3 aylık kayıt). */
export function emptyEnrollmentDraft(defaults: Partial<EnrollmentDraft> = {}): EnrollmentDraft {
  return {
    key: newEnrollmentKey(),
    instrument: "",
    teacherId: "",
    branchId: "",
    lessonDurationMinutes: String(DEFAULT_LESSON_DURATION_MINUTES),
    weeklyLessonCount: "1",
    studentTypes: [],
    level: "",
    targetExam: "",
    mebLevelStartDate: "",
    mebLevelEndDate: "",
    mebExamDate: "",
    mebExamStatus: "",
    startDate: "",
    lessonStartDate: "",
    lessonScheduleText: "",
    intendedDurationMonths: "3",
    packageId: "",
    monthlyFee: "",
    discountType: "",
    discountValue: "",
    campaignIds: [],
    overrideAmount: "",
    overrideReason: "",
    paymentMethod: "",
    paymentDueDay: "",
    firstPayment: emptyFirstPaymentDraft(),
    groupLessonId: "",
    ...defaults,
  };
}

/** Taslağın kullanıcıya görünen adı: "Piyano" ya da seçilmemişse "Branş 2". */
export function draftLabel(d: Pick<EnrollmentDraft, "instrument">, index: number): string {
  return d.instrument.trim() || `Branş ${index + 1}`;
}

export function draftIsMeb(d: Pick<EnrollmentDraft, "studentTypes">): boolean {
  return hasMebStudentType(d.studentTypes as StudentType[]);
}

/* ---------------------------------------------------------------------------------------------------------------
 * Tel biçimi → güvenli taslak (sunucu istemciye GÜVENMEZ: her alan tür/uzunluk sınırıyla yeniden kurulur)
 * ------------------------------------------------------------------------------------------------------------- */

function str(v: unknown, max = 300): string {
  return typeof v === "string" ? v.slice(0, max) : typeof v === "number" && Number.isFinite(v) ? String(v) : "";
}
function strList(v: unknown, maxItems: number, maxLen = 100): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, maxItems).map((x) => x.slice(0, maxLen)) : [];
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

export function coerceEnrollmentDraft(raw: unknown): EnrollmentDraft {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const fp = (o.firstPayment && typeof o.firstPayment === "object" ? o.firstPayment : {}) as Record<string, unknown>;
  const base = emptyEnrollmentDraft();
  return {
    key: str(o.key, 80) || base.key,
    id: str(o.id, 100) || undefined,
    instrument: str(o.instrument, 100),
    teacherId: str(o.teacherId, 100),
    branchId: str(o.branchId, 100),
    lessonDurationMinutes: str(o.lessonDurationMinutes, 4),
    weeklyLessonCount: str(o.weeklyLessonCount, 2),
    studentTypes: strList(o.studentTypes, STUDENT_TYPES.length, 60),
    level: str(o.level, 60),
    targetExam: str(o.targetExam, 200),
    mebLevelStartDate: str(o.mebLevelStartDate, 12),
    mebLevelEndDate: str(o.mebLevelEndDate, 12),
    mebExamDate: str(o.mebExamDate, 12),
    mebExamStatus: oneOf(o.mebExamStatus, ["", "not_attended", "attended"] as const, ""),
    startDate: str(o.startDate, 12),
    lessonStartDate: str(o.lessonStartDate, 12),
    lessonScheduleText: str(o.lessonScheduleText, 300),
    intendedDurationMonths: str(o.intendedDurationMonths, 2),
    packageId: str(o.packageId, 100),
    monthlyFee: str(o.monthlyFee, 12),
    discountType: oneOf(o.discountType, ["", "percent", "amount"] as const, ""),
    discountValue: str(o.discountValue, 10),
    campaignIds: strList(o.campaignIds, 10),
    overrideAmount: str(o.overrideAmount, 12),
    overrideReason: str(o.overrideReason, 300),
    paymentMethod: oneOf(o.paymentMethod, ["", ...PAYMENT_METHODS] as const, ""),
    paymentDueDay: str(o.paymentDueDay, 2),
    groupLessonId: str(o.groupLessonId, 100),
    firstPayment: {
      method: oneOf(fp.method, ["", ...PAYMENT_METHODS] as const, ""),
      amount: str(fp.amount, 14),
      collectedAt: str(fp.collectedAt, 12),
      reference: str(fp.reference, 120),
      note: str(fp.note, 300),
      adjustmentReason: str(fp.adjustmentReason, 300),
      includeNextMonth: typeof fp.includeNextMonth === "boolean" ? fp.includeNextMonth : null,
    },
  };
}

export const MAX_ENROLLMENT_DRAFTS = 6;

/** Gizli `enrollments` alanındaki JSON → taslak listesi. Biçim bozuksa kullanıcıya açıklayıcı Türkçe hata. */
export function parseEnrollmentDraftsJson(raw: string): { ok: true; drafts: EnrollmentDraft[] } | { ok: false; message: string } {
  if (!raw.trim()) return { ok: false, message: "Branş bilgileri gönderilemedi. Sayfayı yenileyip en az bir branş ekleyin." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: "Branş bilgileri okunamadı. Sayfayı yenileyip formu yeniden doldurun." };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return { ok: false, message: "En az bir branş kaydı gerekli." };
  if (parsed.length > MAX_ENROLLMENT_DRAFTS) {
    return { ok: false, message: `Bir kayıtta en fazla ${MAX_ENROLLMENT_DRAFTS} branş eklenebilir.` };
  }
  const drafts = parsed.map(coerceEnrollmentDraft);
  const keys = new Set<string>();
  for (const d of drafts) {
    if (keys.has(d.key)) d.key = newEnrollmentKey();
    keys.add(d.key);
  }
  return { ok: true, drafts };
}

/* ---------------------------------------------------------------------------------------------------------------
 * Tipli (normalize) görünüm
 * ------------------------------------------------------------------------------------------------------------- */

export type NormalizedEnrollment = {
  key: string;
  id?: string;
  instrument: string;
  teacherId: string;
  branchId?: string;
  lessonDurationMinutes?: LessonDurationMinutes;
  weeklyLessonCount: number;
  studentTypes: StudentType[];
  level?: string;
  targetExam?: string;
  mebLevelStartDate?: string;
  mebLevelEndDate?: string;
  mebExamDate?: string;
  mebExamAttended?: boolean;
  startDate?: string;
  lessonStartDate?: string;
  lessonScheduleText?: string;
  intendedDurationMonths?: number;
  packageId?: string;
  /** Paketsiz serbest ücret (tam TL); paketliyse sunucu hesaplar. */
  freeMonthlyFee?: number;
  discountType?: Exclude<DiscountType, "percentage" | "fixed">;
  discountValue?: number;
  campaignIds: string[];
  monthlyFeeOverrideAmount?: number;
  monthlyFeeOverrideReason?: string;
  paymentMethod?: StudentPaymentMethod;
  paymentDueDay?: number;
  lessonDays: number[];
  groupLessonId?: string;
};

const trimOrUndef = (s: string): string | undefined => (s.trim() ? s.trim() : undefined);
const intOrUndef = (s: string): number | undefined => {
  const digits = s.replace(/[^\d]/g, "");
  return s.trim() && digits ? Number(digits) : undefined;
};

export function normalizeEnrollmentDraft(d: EnrollmentDraft): NormalizedEnrollment {
  const duration = Number(d.lessonDurationMinutes);
  const weekly = Number(d.weeklyLessonCount);
  const isMeb = draftIsMeb(d);
  const dv = d.discountValue.trim() ? Number(d.discountValue.replace(",", ".")) : undefined;
  return {
    key: d.key,
    id: d.id,
    instrument: d.instrument.trim(),
    teacherId: d.teacherId.trim(),
    branchId: trimOrUndef(d.branchId),
    lessonDurationMinutes: (LESSON_DURATION_OPTIONS as readonly number[]).includes(duration) ? (duration as LessonDurationMinutes) : undefined,
    weeklyLessonCount: Number.isInteger(weekly) ? weekly : 0,
    studentTypes: d.studentTypes as StudentType[],
    level: trimOrUndef(d.level),
    targetExam: trimOrUndef(d.targetExam),
    // MEB değilse MEB alanları KAYDA YAZILMAZ (gizli/kurcalanmış alan) — MEB türü sonradan kaldırılırsa kayıtlı eski değer silinmez.
    mebLevelStartDate: isMeb ? trimOrUndef(d.mebLevelStartDate) : undefined,
    mebLevelEndDate: isMeb ? trimOrUndef(d.mebLevelEndDate) : undefined,
    mebExamDate: isMeb ? trimOrUndef(d.mebExamDate) : undefined,
    mebExamAttended: isMeb ? (d.mebExamStatus === "attended" ? true : d.mebExamStatus === "not_attended" ? false : undefined) : undefined,
    startDate: trimOrUndef(d.startDate),
    lessonStartDate: trimOrUndef(d.lessonStartDate),
    lessonScheduleText: trimOrUndef(d.lessonScheduleText),
    intendedDurationMonths: intOrUndef(d.intendedDurationMonths),
    packageId: trimOrUndef(d.packageId),
    freeMonthlyFee: intOrUndef(d.monthlyFee),
    discountType: d.discountType || undefined,
    discountValue: dv !== undefined && Number.isFinite(dv) ? dv : undefined,
    campaignIds: d.campaignIds,
    monthlyFeeOverrideAmount: intOrUndef(d.overrideAmount),
    monthlyFeeOverrideReason: trimOrUndef(d.overrideReason),
    paymentMethod: d.paymentMethod || undefined,
    paymentDueDay: intOrUndef(d.paymentDueDay),
    lessonDays: lessonWeekdaysFromText(d.lessonScheduleText),
    groupLessonId: trimOrUndef(d.groupLessonId),
  };
}

/* ---------------------------------------------------------------------------------------------------------------
 * Doğrulama — istemci satır içi hata + sunucu asıl kapı AYNI fonksiyon
 * ------------------------------------------------------------------------------------------------------------- */

export type ValidateEnrollmentOptions = {
  mode: EnrollmentFormMode;
  /** Önizlemeden/sunucudan bilinen önerilen ilk tahsilat; farklı tutar için gerekçe şartını belirler. */
  suggestedFirstPayment?: number;
};

function validDate(s: string): boolean {
  return isValidDateOnlyInput(s.trim());
}

export function validateEnrollmentDraft(d: EnrollmentDraft, opts: ValidateEnrollmentOptions): EnrollmentFieldErrors {
  const e: EnrollmentFieldErrors = {};
  const n = normalizeEnrollmentDraft(d);
  const creating = opts.mode !== "edit";

  if (!n.instrument) e.instrument = "Enstrüman seçin.";
  if (!n.teacherId) e.teacherId = "Bu enstrümanı veren aktif bir öğretmen seçin.";
  if (!n.lessonDurationMinutes) e.lessonDurationMinutes = "Ders süresini seçin (30, 40 veya 50 dakika).";
  if (!n.weeklyLessonCount || n.weeklyLessonCount < 1 || n.weeklyLessonCount > 3) e.weeklyLessonCount = "Haftalık ders sayısını seçin.";

  // Ders günü/saati: kayıtta haftalık ders sayısı kadar FARKLI gün zorunlu (ilk tahsilat planı buna dayanır).
  const slots = parseLessonScheduleText(d.lessonScheduleText);
  if (creating) {
    if (n.weeklyLessonCount >= 1 && (n.lessonDays.length !== n.weeklyLessonCount || slots.length !== n.weeklyLessonCount)) {
      e.lessonScheduleText = `Haftalık ${n.weeklyLessonCount} ders için ${n.weeklyLessonCount} farklı ders günü ve saati seçin.`;
    }
  } else if (d.lessonScheduleText.trim() && slots.length === 0) {
    e.lessonScheduleText = 'Ders gün/saati okunamadı. "Salı 15:00, Perşembe 16:00" biçiminde seçin.';
  }

  if (creating) {
    if (!d.startDate.trim()) e.startDate = "Kayıt tarihi zorunludur.";
    else if (!validDate(d.startDate)) e.startDate = "Kayıt tarihi için takvimden geçerli bir gün seçin.";
  } else if (d.startDate.trim() && !validDate(d.startDate)) {
    e.startDate = "Kayıt tarihi için takvimden geçerli bir gün seçin.";
  }
  if (d.lessonStartDate.trim() && !validDate(d.lessonStartDate)) {
    e.lessonStartDate = "Ders başlangıç tarihi için takvimden geçerli bir gün seçin.";
  }
  if (d.intendedDurationMonths.trim()) {
    const m = Number(d.intendedDurationMonths);
    if (!Number.isInteger(m) || m < 1 || m > 12) e.intendedDurationMonths = "Kayıt süresi 1–12 ay olmalı.";
  } else if (creating) {
    e.intendedDurationMonths = "Kayıt süresini seçin (1–12 ay).";
  }

  // MEB: mevcut sahip kuralı — alanlar zorunlu DEĞİL (2026-09-29), girilenin biçimi/tutarlılığı korunur.
  if (draftIsMeb(d)) {
    const meb = validateMebFields({
      studentTypes: n.studentTypes,
      level: n.level,
      mebLevelStartDate: n.mebLevelStartDate,
      mebLevelEndDate: n.mebLevelEndDate,
      mebExamDate: n.mebExamDate,
      mebExamAttended: n.mebExamAttended,
    });
    if (!meb.ok) {
      const f = meb.fieldErrors;
      if (f.level?.[0]) e.level = f.level[0];
      if (f.mebLevelStartDate?.[0]) e.mebLevelStartDate = f.mebLevelStartDate[0];
      if (f.mebLevelEndDate?.[0]) e.mebLevelEndDate = f.mebLevelEndDate[0];
      if (f.mebExamDate?.[0]) e.mebExamDate = f.mebExamDate[0];
      if (f.mebExamAttended?.[0]) e.mebExamStatus = f.mebExamAttended[0];
    }
  }

  // Ücret: paketliyse sunucu hesaplar; paketsizse aylık ücret AÇIKÇA yazılmalı (boş ≠ 0; burslu için 0 yazılır).
  const hasCampaign = d.campaignIds.length > 0;
  if (!n.packageId) {
    if (n.freeMonthlyFee === undefined) {
      e.monthlyFee = "Aylık ücreti yazın ya da bir paket seçin. %100 burslu kayıt için 0 yazın.";
    }
    if (n.discountType || n.discountValue !== undefined || n.monthlyFeeOverrideAmount !== undefined) {
      e.discountValue = "İndirim ve elle ücret yalnızca bir paket seçildiğinde uygulanır. Paket seçin ya da indirimi kaldırın.";
    }
  } else {
    if ((n.discountType && n.discountValue === undefined) || (!n.discountType && n.discountValue !== undefined)) {
      e.discountValue = "İndirim türü ve değeri birlikte girilmeli.";
    } else if (n.discountType === "percent" && n.discountValue !== undefined && (n.discountValue < 0 || n.discountValue > 100)) {
      e.discountValue = "Yüzde indirim 0–100 arasında olmalı.";
    } else if (n.discountValue !== undefined && n.discountValue < 0) {
      e.discountValue = "İndirim değeri negatif olamaz.";
    }
    if (hasCampaign && (n.discountType || n.discountValue !== undefined)) {
      e.campaignIds = "Kampanya seçiliyken manuel indirim girilemez. Kampanyayı kaldırın ya da manuel indirimi silin.";
    }
    if (n.monthlyFeeOverrideAmount !== undefined && (n.monthlyFeeOverrideReason ?? "").length < 3) {
      e.overrideReason = "Aylık ücreti elle değiştirirken gerekçe yazın (en az 3 karakter).";
    }
  }
  if (d.paymentDueDay.trim()) {
    const day = Number(d.paymentDueDay);
    if (!Number.isInteger(day) || day < 1 || day > 31) e.paymentDueDay = "Ödeme günü 1–31 arasında olmalı.";
  }

  // İlk tahsilat (yeni kayıt ve branş ekleme): her branş, ayrı kaydedilmiş bir öğrenci gibi kayıt anında tahsilat ister.
  if (creating) {
    const parsed = parseRegistrationFirstPaymentForm({
      method: d.firstPayment.method,
      amount: d.firstPayment.amount,
      collectedAt: d.firstPayment.collectedAt,
      reference: d.firstPayment.reference,
      note: d.firstPayment.note,
    });
    if (!parsed.ok) {
      const f = parsed.fieldErrors;
      if (f.firstPaymentAmount?.[0]) e["firstPayment.amount"] = f.firstPaymentAmount[0];
      if (f.firstPaymentMethod?.[0]) e["firstPayment.method"] = f.firstPaymentMethod[0];
      if (f.firstPaymentDate?.[0]) e["firstPayment.collectedAt"] = f.firstPaymentDate[0];
    } else {
      if (parsed.value.collectedAt && !validDate(parsed.value.collectedAt)) {
        e["firstPayment.collectedAt"] = "Tahsilat tarihi için takvimden geçerli bir gün seçin.";
      }
      if (
        opts.suggestedFirstPayment !== undefined &&
        parsed.value.amount !== opts.suggestedFirstPayment &&
        !d.firstPayment.adjustmentReason.trim()
      ) {
        e["firstPayment.adjustmentReason"] =
          "Tahsil edilen tutar sistem önerisinden farklı — düzeltme gerekçesini yazın (fark denetim kaydına işlenir).";
      }
    }
  }
  return e;
}

/** Birden çok taslak: her biri kendi alan hatalarıyla + kayıt içi çakışma (aynı enstrüman + aynı öğretmen iki kez). */
export function validateEnrollmentDrafts(
  drafts: EnrollmentDraft[],
  opts: { mode: EnrollmentFormMode; suggestedByKey?: Record<string, number | undefined> }
): Record<string, EnrollmentFieldErrors> {
  const out: Record<string, EnrollmentFieldErrors> = {};
  const seen = new Map<string, string>();
  for (const d of drafts) {
    const errs = validateEnrollmentDraft(d, { mode: opts.mode, suggestedFirstPayment: opts.suggestedByKey?.[d.key] });
    const sig = `${d.instrument.trim()}::${d.teacherId.trim()}`;
    if (d.instrument.trim() && d.teacherId.trim()) {
      if (seen.has(sig)) {
        errs.teacherId = `Aynı öğretmenle ikinci bir ${d.instrument.trim()} branş kaydı eklenemez. Farklı bir öğretmen seçin ya da bu branşı kaldırın.`;
      } else {
        seen.set(sig, d.key);
      }
    }
    if (Object.keys(errs).length > 0) out[d.key] = errs;
  }
  return out;
}

/** Hata özeti: "Piyano — MEB seviye başlangıç tarihi: …" biçiminde, hangi branş + hangi alan olduğunu söyler. */
export function summarizeEnrollmentErrors(
  drafts: EnrollmentDraft[],
  errors: Record<string, EnrollmentFieldErrors>,
  limit = 6
): string[] {
  const lines: string[] = [];
  drafts.forEach((d, i) => {
    const errs = errors[d.key];
    if (!errs) return;
    for (const [field, message] of Object.entries(errs)) {
      lines.push(`${draftLabel(d, i)} — ${ENROLLMENT_FIELD_LABELS[field] ?? field}: ${message}`);
    }
  });
  return lines.slice(0, limit);
}

/* ---------------------------------------------------------------------------------------------------------------
 * Ücret ve önerilen ilk tahsilat — TEK hesap (önizleme = oluşturma)
 * ------------------------------------------------------------------------------------------------------------- */

export type EnrollmentPricing = {
  monthlyFee: number;
  packageBaseMonthlyFee?: number;
  discountType?: DiscountType;
  discountValue?: number;
  monthlyFeeManualOverride: boolean;
};

export function resolveEnrollmentPricing(input: {
  pkg?: Pick<Package, "price30Min" | "price40Min" | "price50Min"> | null;
  durationMinutes: LessonDurationMinutes;
  discountType?: DiscountType;
  discountValue?: number;
  /** Kampanya yığınının nihai yüzdesi; verilirse manuel indirimin YERİNE geçer. */
  campaignPercent?: number;
  overrideAmount?: number;
  /** Paketsiz serbest ücret (taban). */
  freeMonthlyFee?: number;
}): EnrollmentPricing {
  if (input.pkg) {
    const discountType: DiscountType | undefined = input.campaignPercent !== undefined ? "percent" : input.discountType;
    const discountValue = input.campaignPercent ?? input.discountValue;
    const c = computeMonthlyFee({
      pkg: input.pkg,
      durationMinutes: input.durationMinutes,
      discountType,
      discountValue,
      overrideAmount: input.overrideAmount,
    });
    return {
      monthlyFee: c.finalMonthlyFee,
      packageBaseMonthlyFee: c.baseMonthlyFee,
      discountType,
      discountValue,
      monthlyFeeManualOverride: c.source === "override",
    };
  }
  const base = input.freeMonthlyFee ?? 0;
  if (input.campaignPercent !== undefined) {
    const discountAmount = computeDiscountAmount(base, "percent", input.campaignPercent);
    return {
      monthlyFee: Math.max(base - discountAmount, 0),
      packageBaseMonthlyFee: base,
      discountType: "percent",
      discountValue: input.campaignPercent,
      monthlyFeeManualOverride: false,
    };
  }
  return { monthlyFee: base, monthlyFeeManualOverride: false };
}

export type FirstCollectionSuggestion = {
  startDay: string;
  firstPeriodEnd: string;
  plannedLessons: number;
  /** Planlanan ders sayısı seçilen GERÇEK ders günlerinden kesin sayıldı (projeksiyon değil). */
  exact: boolean;
  referenceCount: number;
  derivedPerLessonAmount: number;
  firstPeriodAmount: number;
  includesNextMonth: boolean;
  suggestedAmount: number;
};

export function suggestFirstCollection(input: {
  monthlyFee: number;
  weeklyLessonCount: number;
  lessonStartDate?: string;
  enrollmentStartDate?: string;
  fallbackToday: string;
  enrollmentEndDate?: string;
  /** 0=Pazar..6=Cumartesi; haftalık ders sayısıyla birebir eşleşiyorsa kesin sayım yapılır. */
  lessonDays?: number[];
  term: StudentTermType;
  overrides: DayOverride[];
  weeklyClosedDays?: TermWeeklyClosedDaysOverride;
  /** Kullanıcının açık seçimi; yoksa kurumun ders eşiği kuralı varsayılanı. */
  includeNextMonth?: boolean | null;
  mergeThresholdLessons: number;
}): FirstCollectionSuggestion | null {
  const { monthlyFee, weeklyLessonCount } = input;
  if (!Number.isInteger(monthlyFee) || monthlyFee < 0 || !Number.isInteger(weeklyLessonCount) || weeklyLessonCount <= 0) return null;
  const startDay = resolveLessonStartDay({
    lessonStartDate: input.lessonStartDate,
    enrollmentStartDate: input.enrollmentStartDate,
    fallbackToday: input.fallbackToday,
  });
  const [sy, sm] = startDay.slice(0, 7).split("-").map(Number) as [number, number];
  const monthEnd = `${startDay.slice(0, 7)}-${String(new Date(Date.UTC(sy, sm, 0)).getUTCDate()).padStart(2, "0")}`;
  const firstPeriodEnd = input.enrollmentEndDate && input.enrollmentEndDate < monthEnd ? input.enrollmentEndDate : monthEnd;
  const days = input.lessonDays ?? [];
  const exact = days.length === weeklyLessonCount && new Set(days).size === weeklyLessonCount;
  let plannedLessons: number;
  try {
    plannedLessons = exact
      ? countExactWeekdayLessons(startDay, firstPeriodEnd, days, { term: input.term, overrides: input.overrides, weeklyClosedDays: input.weeklyClosedDays })
      : estimatePeriodBillingLines({ enrollmentStartDay: startDay, enrollmentEndDay: firstPeriodEnd, monthlyFee, weeklyLessonCount })[0]!.billableLessonCount;
  } catch {
    return null;
  }
  const firstPeriodAmount = computePeriodAmount(monthlyFee, weeklyLessonCount, plannedLessons);
  const includesNextMonth = input.includeNextMonth ?? shouldMergeFirstCollection(plannedLessons, input.mergeThresholdLessons);
  return {
    startDay,
    firstPeriodEnd,
    plannedLessons,
    exact,
    referenceCount: referenceMonthlyLessonCount(weeklyLessonCount),
    derivedPerLessonAmount: derivePerLessonAmount(monthlyFee, weeklyLessonCount),
    firstPeriodAmount,
    includesNextMonth,
    suggestedAmount: includesNextMonth ? firstPeriodAmount + monthlyFee : firstPeriodAmount,
  };
}

/* ---------------------------------------------------------------------------------------------------------------
 * Kayıttan taslak (düzenleme kipi)
 * ------------------------------------------------------------------------------------------------------------- */

const ymd = (iso?: string): string => (iso ? iso.slice(0, 10) : "");

export function draftFromTerms(t: EnrollmentTerms, opts: { personBranchId: string; key?: string }): EnrollmentDraft {
  const discountType: EnrollmentDraft["discountType"] =
    t.discountType === "amount" || t.discountType === "fixed" ? "amount" : t.discountType ? "percent" : "";
  const types = t.studentTypes.filter((x) => (STUDENT_TYPES as string[]).includes(x));
  const mebStatus: EnrollmentDraft["mebExamStatus"] = t.mebExamAttended === true ? "attended" : t.mebExamAttended === false ? "not_attended" : "";
  return emptyEnrollmentDraft({
    ...(opts.key ? { key: opts.key } : {}),
    id: t.enrollmentId,
    instrument: t.instrument,
    teacherId: t.teacherId ?? "",
    // Kişinin şubesiyle aynıysa "devral" olarak bırak (kişinin şubesi sonradan değişirse branş onu izlemeye devam eder).
    branchId: t.branchId && t.branchId !== opts.personBranchId ? t.branchId : "",
    lessonDurationMinutes: t.lessonDurationMinutes ? String(t.lessonDurationMinutes) : String(DEFAULT_LESSON_DURATION_MINUTES),
    weeklyLessonCount: String(t.weeklyLessonCount),
    studentTypes: types,
    level: t.level ?? "",
    targetExam: t.targetExam ?? "",
    mebLevelStartDate: ymd(t.mebLevelStartDate),
    mebLevelEndDate: ymd(t.mebLevelEndDate),
    mebExamDate: ymd(t.mebExamDate),
    mebExamStatus: mebStatus,
    startDate: ymd(t.startDate),
    lessonStartDate: ymd(t.lessonStartDate),
    lessonScheduleText: t.lessonScheduleText ?? "",
    intendedDurationMonths: t.intendedDurationMonths ? String(t.intendedDurationMonths) : "",
    packageId: t.packageId ?? "",
    monthlyFee: t.packageId ? "" : String(t.monthlyFee),
    discountType,
    discountValue: t.discountValue !== undefined ? String(t.discountValue) : "",
    overrideAmount: t.monthlyFeeManualOverride ? String(t.monthlyFee) : "",
    overrideReason: t.monthlyFeeManualOverride ? (t.monthlyFeeOverrideReason ?? "") : "",
    paymentMethod: t.paymentMethod ?? "",
    paymentDueDay: t.paymentDueDay ? String(t.paymentDueDay) : "",
    groupLessonId: t.groupLessonId ?? "",
  });
}

/* ---------------------------------------------------------------------------------------------------------------
 * Taslak → `upsertStudentEnrollmentTool` girdisi (öğrenci sayfasından branş ekle/düzenle; sunucu yine asıl kapıdır)
 * ------------------------------------------------------------------------------------------------------------- */

export type EnrollmentUpsertPayload = Record<string, unknown> & { instrument: string; teacherId: string; lessonDurationMinutes: number };

/**
 * `mode: "add"` → yeni branş (ilk tahsilat dahil, kayıtla AYNI kurallar). `mode: "edit"` → yalnız bu branşın koşulları
 * (diğer branşlar etkilenmez). MEB türü kalktıysa MEB alanları GÖNDERİLMEZ: kayıttaki eski değerler silinmez, MEB tekrar
 * işaretlenirse yeniden görünür (sessiz veri kaybı yok).
 */
export function enrollmentUpsertPayload(d: EnrollmentDraft, mode: "add" | "edit", expectedUpdatedAt?: string): EnrollmentUpsertPayload {
  const n = normalizeEnrollmentDraft(d);
  const isMeb = draftIsMeb(d);
  const base: EnrollmentUpsertPayload = {
    ...(mode === "edit" && d.id ? { id: d.id } : {}),
    instrument: n.instrument,
    teacherId: n.teacherId,
    lessonDurationMinutes: n.lessonDurationMinutes ?? Number(d.lessonDurationMinutes),
    weeklyLessonCount: n.weeklyLessonCount,
    branchId: n.branchId ?? "",
    studentTypes: n.studentTypes,
    level: n.level ?? "",
    targetExam: n.targetExam ?? "",
    ...(n.startDate ? { startDate: n.startDate } : {}),
    lessonStartDate: n.lessonStartDate ?? "",
    lessonScheduleText: n.lessonScheduleText ?? "",
    ...(n.intendedDurationMonths ? { intendedDurationMonths: n.intendedDurationMonths } : {}),
    ...(n.paymentMethod ? { paymentMethod: n.paymentMethod } : {}),
    ...(n.paymentDueDay ? { paymentDueDay: n.paymentDueDay } : {}),
    ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
    ...(mode === "add" && n.groupLessonId ? { groupLessonId: n.groupLessonId } : {}),
  };
  if (isMeb) {
    base.mebLevelStartDate = n.mebLevelStartDate ?? "";
    base.mebLevelEndDate = n.mebLevelEndDate ?? "";
    base.mebExamDate = n.mebExamDate ?? "";
    base.mebExamAttended = n.mebExamAttended ?? null;
  }
  if (n.packageId) {
    base.packageId = n.packageId;
    if (n.monthlyFeeOverrideAmount !== undefined) {
      base.monthlyFeeOverrideAmount = n.monthlyFeeOverrideAmount;
      base.monthlyFeeOverrideReason = n.monthlyFeeOverrideReason ?? "";
    } else if (mode === "edit") {
      base.dropFeeOverride = true;
    }
    if (mode === "add") {
      if (n.campaignIds.length > 0) base.campaignIds = n.campaignIds;
      else if (n.discountType && n.discountValue !== undefined) {
        base.discountType = n.discountType;
        base.discountValue = n.discountValue;
      }
    } else if (n.discountType && n.discountValue !== undefined) {
      base.discountType = n.discountType;
      base.discountValue = n.discountValue;
    } else {
      base.discountType = "none";
    }
  } else {
    base.packageId = "";
    base.monthlyFee = n.freeMonthlyFee ?? 0;
    if (mode === "add" && n.campaignIds.length > 0) base.campaignIds = n.campaignIds;
  }
  if (mode === "add") {
    const fp = parseRegistrationFirstPaymentForm({
      method: d.firstPayment.method,
      amount: d.firstPayment.amount,
      collectedAt: d.firstPayment.collectedAt,
      reference: d.firstPayment.reference,
      note: d.firstPayment.note,
    });
    if (fp.ok) {
      base.firstPayment = {
        ...(fp.value.method ? { method: fp.value.method } : {}),
        amount: fp.value.amount,
        ...(fp.value.collectedAt ? { collectedAt: fp.value.collectedAt } : {}),
        ...(fp.value.reference ? { reference: fp.value.reference } : {}),
        ...(fp.value.note ? { note: fp.value.note } : {}),
        ...(d.firstPayment.adjustmentReason.trim() ? { adjustmentReason: d.firstPayment.adjustmentReason.trim() } : {}),
        ...(d.firstPayment.includeNextMonth !== null ? { includeNextMonth: d.firstPayment.includeNextMonth } : {}),
      };
    }
  }
  return base;
}
