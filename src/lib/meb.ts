/**
 * MEB öğrenci alanları — TEK iş-kuralı kaynağı.
 *
 * Kural özeti:
 * - MEB'lik `studentTypes` (çoklu) içinde "MEB" bulunmasına bakılır; eski
 *   tekil `studentType` geriye dönük uyumluluk için fallback'tir (bkz.
 *   `effectiveStudentTypes`).
 * - MEB seviyesi mevcut `level` alanıdır (1–8, `validateStudentLevel`
 *   yeniden kullanılır — ayrı bir seviye kolonu YOK).
 * - MEB seviye başlangıç/bitiş tarihleri ile sınav bilgileri AYRI
 *   kolonlardır; genel `enrollmentStartDate`/`lessonStartDate`/
 *   `enrollmentEndDate` alanlarına ASLA yazılmaz (ayrı iş bilgisidir).
 * - MEB seçili değilse gelen MEB değerleri STRIP edilir (yazılmaz); kayıtlı
 *   eski MEB verisi tür kaldırılınca SİLİNMEZ (kolonlar korunur, UI gizler).
 * - Sınav tri-state: bilgi yok (Bilinmiyor) / Girmedi / Girdi. Geçmişe
 *   "Girdi" varsayımı YOK; "Girdi" tarih ister ve gelecek tarihi reddeder.
 * - Tüm tarihler `date-input.ts` UTC-öğlen kuralıyla işlenir (saat dilimi
 *   kayması imkansız); takvimde olmayan gün (ör. 2026-02-30) reddedilir.
 */

import { parseDateOnlyInput } from "./date-input";
import { effectiveStudentTypes } from "./student-types";
import { hasMebStudentType } from "./types";
import type { Student, StudentType } from "./types";
import { validateStudentLevel } from "./student-level-rules";

/** MEB sınav katılım durumu — ürün-dili etiketleriyle birlikte. */
export type MebExamStatus = "unknown" | "not_attended" | "attended";

export const MEB_EXAM_STATUS_LABELS: Record<MebExamStatus, string> = {
  unknown: "Bilinmiyor",
  not_attended: "Girmedi",
  attended: "Girdi",
};

export const MEB_EXAM_STATUS_VALUES: MebExamStatus[] = ["unknown", "not_attended", "attended"];

/**
 * Öğrenci MEB'li mi? Tür LİSTESİNE bakılır (tekil legacy alan yalnız
 * fallback). `studentTypes` boş + `studentType` boşsa MEB değildir.
 */
/** 2026-10-09 — ek branşı (kendi kaydında türü tutulan) aktif ve MEB olan öğrenci de MEB öğrencisidir. */
export function isMebStudent(input: Pick<Student, "studentTypes" | "studentType"> & { enrollments?: Student["enrollments"] }): boolean {
  return (
    hasMebStudentType(effectiveStudentTypes(input)) ||
    Boolean(input.enrollments?.some((e) => e.active && hasMebStudentType(e.studentTypes ?? [])))
  );
}

/** Sınav tarihi + katılım bayrağından ürün-dili durum türetir. */
export function resolveMebExamStatus(input: {
  mebExamDate?: string | null;
  mebExamAttended?: boolean | null;
}): MebExamStatus {
  if (input.mebExamAttended === true) return "attended";
  if (input.mebExamAttended === false) return "not_attended";
  return "unknown";
}

/** "YYYY-MM-DD" gün çözünürlüğünde karşılaştırma için UTC-öğlen millis. */
function dateOnlyMillis(value: string): number | null {
  const dt = parseDateOnlyInput(value);
  return dt ? dt.getTime() : null;
}

/** Bugünün UTC-öğlen millis'i ("gelecekte mi?" kontrolü saat diliminden bağımsız). */
function todayUtcNoonMillis(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0);
}

export interface MebInput {
  studentTypes: StudentType[];
  level?: string | null;
  mebLevelStartDate?: string | null;
  mebLevelEndDate?: string | null;
  mebExamDate?: string | null;
  mebExamAttended?: boolean | null;
}

export type MebFieldErrors = Partial<
  Record<"level" | "mebLevelStartDate" | "mebLevelEndDate" | "mebExamDate" | "mebExamAttended", string[]>
>;

export type MebValidationResult = { ok: true } | { ok: false; fieldErrors: MebFieldErrors };

function err(errors: MebFieldErrors, field: keyof MebFieldErrors, message: string): void {
  errors[field] = [...(errors[field] ?? []), message];
}

/**
 * MEB alan kapısı. MEB değilse `{ ok: true }` döner (çağıran MEB
 * değerlerini STRIP eder). MEB ise alanlar OPSİYONELDİR (2026-09-29); girilen
 * seviye/dönem tarihlerinin biçimini ve sınav tutarlılığını doğrular; mesajlar Türkçe, alan-bazlıdır (ham Prisma hatası
 * ve kişisel veri İÇERMEZ).
 */
export function validateMebFields(input: MebInput): MebValidationResult {
  if (!hasMebStudentType(input.studentTypes)) return { ok: true };

  const errors: MebFieldErrors = {};

  // 2026-09-29 (owner): MEB bilgileri ZORUNLU DEĞİL — boş bırakılabilir; girilmişse biçim/tutarlılık korunur.
  const levelRaw = input.level?.trim() || undefined;
  const levelError = levelRaw ? validateStudentLevel(input.studentTypes, levelRaw) : null;
  if (levelError) err(errors, "level", "MEB seviyesi 1–8 arasında olmalı (boş bırakılabilir).");

  const startRaw = input.mebLevelStartDate?.trim() || undefined;
  const endRaw = input.mebLevelEndDate?.trim() || undefined;
  if (startRaw && parseDateOnlyInput(startRaw) === null) {
    err(errors, "mebLevelStartDate", "MEB seviye başlangıç tarihi için takvimden geçerli bir gün seçin.");
  }
  if (endRaw && parseDateOnlyInput(endRaw) === null) {
    err(errors, "mebLevelEndDate", "MEB seviye bitiş tarihi için takvimden geçerli bir gün seçin.");
  }
  const startMs = startRaw ? dateOnlyMillis(startRaw) : null;
  const endMs = endRaw ? dateOnlyMillis(endRaw) : null;
  if (startMs !== null && endMs !== null && endMs < startMs) {
    err(errors, "mebLevelEndDate", "MEB seviye bitiş tarihi, başlangıç tarihinden önce olamaz.");
  }

  const examRaw = input.mebExamDate?.trim() || undefined;
  if (examRaw && parseDateOnlyInput(examRaw) === null) {
    err(errors, "mebExamDate", "Sınav tarihi için takvimden geçerli bir gün seçin.");
  }
  if (input.mebExamAttended === true) {
    if (!examRaw) {
      err(errors, "mebExamDate", "“Sınava girdi” olarak işaretlemek için sınav tarihi zorunludur.");
    } else {
      const examMs = dateOnlyMillis(examRaw);
      if (examMs !== null && examMs > todayUtcNoonMillis()) {
        err(errors, "mebExamAttended", "Gelecekteki bir sınav “Girdi” olarak işaretlenemez.");
      }
    }
  }

  return Object.keys(errors).length > 0 ? { ok: false, fieldErrors: errors } : { ok: true };
}

function sameTypeSet(a: StudentType[], b: StudentType[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((t) => set.has(t));
}

function fieldChanged(patchValue: string | boolean | null | undefined, currentValue: string | boolean | null | undefined): boolean {
  // `undefined` = "gönderilmedi" (dokunma DEĞİL); "" ve undefined aynı
  // sayılır (formlar boş girişi undefined'a normalize eder).
  const p = patchValue === "" ? undefined : (patchValue ?? undefined);
  const c = currentValue === "" ? undefined : (currentValue ?? undefined);
  return p !== undefined && p !== c;
}

/**
 * Güncelleme birleştirmesi: sonuç türler + sonuç MEB alanları (patch,
 * verilmediyse mevcut kayıt). Dönen `touchesMebSurface`, patch'in MEB
 * yüzeyine GERÇEKTEN dokunup dokunmadığını söyler — DEĞER karşılaştırmalı:
 * detay editörü gibi `studentTypes`'ı her kayıtta aynen geri gönderen
 * çağıranlar "dokunmuş" sayılmaz. Böylece eski, eksik MEB kayıtlarında
 * alakasız düzenlemeler (telefon vb.) engellenmez; MEB yüzeyini DEĞİŞTİREN
 * ilk ilgili düzenleme tamamlamayı zorunlu kılar.
 */
export function mergeMebForUpdate(
  current: Pick<
    Student,
    "studentTypes" | "studentType" | "level" | "mebLevelStartDate" | "mebLevelEndDate" | "mebExamDate" | "mebExamAttended"
  >,
  patch: Partial<
    Pick<
      Student,
      "studentTypes" | "studentType" | "level" | "mebLevelStartDate" | "mebLevelEndDate" | "mebExamDate" | "mebExamAttended"
    >
  >
): { merged: MebInput; touchesMebSurface: boolean; resultingIsMeb: boolean } {
  const currentEffective = effectiveStudentTypes(current);

  let mergedTypes: StudentType[] = currentEffective;
  let typesTouched = false;
  if (patch.studentTypes !== undefined) {
    mergedTypes = patch.studentTypes;
    typesTouched = !sameTypeSet(patch.studentTypes, currentEffective);
  } else if (patch.studentType !== undefined) {
    mergedTypes = patch.studentType ? [patch.studentType] : [];
    typesTouched = !sameTypeSet(mergedTypes, currentEffective);
  }

  const touchesMebSurface =
    typesTouched ||
    fieldChanged(patch.level, current.level) ||
    fieldChanged(patch.mebLevelStartDate, current.mebLevelStartDate) ||
    fieldChanged(patch.mebLevelEndDate, current.mebLevelEndDate) ||
    fieldChanged(patch.mebExamDate, current.mebExamDate) ||
    fieldChanged(patch.mebExamAttended, current.mebExamAttended);

  const merged: MebInput = {
    studentTypes: mergedTypes,
    level: patch.level !== undefined ? (patch.level ?? undefined) : (current.level ?? undefined),
    mebLevelStartDate:
      patch.mebLevelStartDate !== undefined ? (patch.mebLevelStartDate ?? undefined) : (current.mebLevelStartDate ?? undefined),
    mebLevelEndDate:
      patch.mebLevelEndDate !== undefined ? (patch.mebLevelEndDate ?? undefined) : (current.mebLevelEndDate ?? undefined),
    mebExamDate: patch.mebExamDate !== undefined ? (patch.mebExamDate ?? undefined) : (current.mebExamDate ?? undefined),
    mebExamAttended:
      patch.mebExamAttended !== undefined ? (patch.mebExamAttended ?? undefined) : (current.mebExamAttended ?? undefined),
  };
  return { merged, touchesMebSurface, resultingIsMeb: hasMebStudentType(mergedTypes) };
}
