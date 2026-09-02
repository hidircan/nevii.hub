/**
 * P0-2D — aynı öğrenci için, aynı takvim ayı içinde, aynı tenant
 * kapsamında ÜÇÜNCÜ "İşlendi" statülü ders oluştuğunda tenant
 * admin/superadmin kullanıcılarına BİR KEZ risk bildirimi üretilir.
 * Eşik (2 — yani 3. ders tetikler) v1'de SABİTTİR, kurum ayarına
 * TAŞINMAZ (spec'in kendi notu, kapsam genişletilmedi).
 *
 * `notifyAdmins()`'in kendi `dedupeKey` mekanizması yalnız 24 saatlik bir
 * pencereye bakıyor — aylık idempotency için YETERSİZ. Bunun yerine
 * `TaskReminderLog`/`LessonHomeworkReminderLog` ile AYNI desende kalıcı bir
 * `StudentAttendanceRiskLog` kaydı kullanılır (bkz. types.ts) — yeni,
 * paralel, zayıf bir dedupe sistemi İCAT EDİLMEDİ.
 *
 * Ay hesabı, dersin KENDİ tarihine göredir (işaretleme anına göre DEĞİL) —
 * `LESSONS_LEARNED.md` kural #1'deki "aynı-gün iptal ASLA işaretleme
 * timestamp'inden türetilmez" ilkesiyle aynı disiplin: ders NE ZAMAN
 * gerçekleştiyse risk sayacı O aya yazılır.
 */

import type { Lesson } from "./types";
import { toZonedYmd, DEFAULT_APP_TIMEZONE } from "./timezone";

export const STUDENT_ATTENDANCE_RISK_THRESHOLD = 2;

export function buildAttendanceRiskDedupeKey(
  tenantId: string,
  studentId: string,
  calendarMonth: string
): string {
  return `attendance-processed-risk:${tenantId}:${studentId}:${calendarMonth}`;
}

function lessonCalendarMonth(lesson: Pick<Lesson, "startAt">): string {
  return toZonedYmd(new Date(lesson.startAt), DEFAULT_APP_TIMEZONE).slice(0, 7);
}

export interface AttendanceRiskEvaluation {
  /** Eşik aşıldı mı (>threshold) — ASIL idempotency kararı bu DEĞİL, bkz. not. */
  crossedThreshold: boolean;
  processedCountInMonth: number;
  calendarMonth: string;
}

/**
 * Bir ders "İşlendi" olarak işaretlendikten SONRA çağrılır — saf, yalnız
 * `lessons` listesini OKUR. `crossedThreshold` true dönse bile bildirim
 * GÖNDERİLMEMELİDİR — asıl idempotency kararı
 * `student-attendance-risk-log.ts`'teki `recordAttendanceRiskLogIfNew`'in
 * dönüş değeridir (yalnız o `true` dönerse bildirim gönderilir); bu ayrım,
 * 4./5. "İşlendi" derste de `crossedThreshold` true olacağı ama log zaten
 * var olduğu için duplicate bildirim üretilmemesi gerektiği içindir.
 */
export function evaluateAttendanceRisk(
  lessons: Pick<Lesson, "studentId" | "lessonProcessed" | "startAt">[],
  studentId: string,
  triggeringLesson: Pick<Lesson, "startAt">,
  threshold: number = STUDENT_ATTENDANCE_RISK_THRESHOLD
): AttendanceRiskEvaluation {
  const calendarMonth = lessonCalendarMonth(triggeringLesson);
  const processedCountInMonth = lessons.filter(
    (l) => l.studentId === studentId && l.lessonProcessed === true && lessonCalendarMonth(l) === calendarMonth
  ).length;
  return {
    crossedThreshold: processedCountInMonth > threshold,
    processedCountInMonth,
    calendarMonth,
  };
}

/** Bildirim başlığı/gövdesi — öğrenci adı, ay, işlenmiş ders sayısı, güvenli detay linki. */
export function buildAttendanceRiskNotificationText(input: {
  studentName: string;
  calendarMonth: string; // yyyy-MM
  processedCountInMonth: number;
  detailHref: string;
}): { title: string; body: string } {
  return {
    title: `Devam riski: ${input.studentName}`,
    body: `${input.studentName} için ${input.calendarMonth} ayında ${input.processedCountInMonth}. "İşlendi" ders kaydedildi. Detay: ${input.detailHref}`,
  };
}
