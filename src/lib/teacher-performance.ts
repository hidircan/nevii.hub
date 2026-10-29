/**
 * Faz 2 — öğretmen performans skoru. KURAL (kesinlikle bozulmaz): skor
 * YALNIZCA öğretmen kaynaklı aksamalara (iptal/telafide "Öğretmen kaynaklı",
 * `teacherReliability` — lesson-disruption.ts) ve öğrenci geri bildirimine
 * (`TeacherFeedback`) bakar. Ayrı öğretmen yoklaması yok (2026-10-21). Öğrenci yoklaması
 * (`studentAttended`/`studentAbsent`/`studentExcused`) veya öğrenci
 * devamsızlığı BU DOSYADA HİÇ OKUNMAZ — bkz. src/lib/__tests__/
 * teacher-performance.test.ts, bu ayrımı açıkça doğrulayan test.
 *
 * Skor versiyonlanabilir (`TEACHER_PERFORMANCE_SCORE_VERSION`): formül
 * ileride değişirse eski raporlar yeniden hesaplanmaz gerektiğinde, çağıran
 * taraf versiyonu birlikte saklayabilir — bu modül kendisi hiçbir şey
 * kalıcı kılmaz (saf hesaplama, `TeacherPayout` snapshot mantığından farklı
 * olarak burada "donma" YOK, rapor her zaman GÜNCEL veriyle taze hesaplanır).
 */
import type { AppData } from "./types";
import { computeTeacherFeedbackSummary } from "./teacher-feedback";
import { teacherReliability } from "./lesson-disruption";

export const TEACHER_PERFORMANCE_SCORE_VERSION = "teacher-performance-v1.1";

const ATTENDANCE_WEIGHT = 0.6;
const FEEDBACK_WEIGHT = 0.4;

export type TeacherPerformanceReport = {
  version: string;
  teacherId: string;
  periodStart: string;
  periodEnd: string;
  /** Güvenilirlik tabanı: gerçekleşmiş dersler + öğretmen kaynaklı aksamalar. */
  plannedLessonCount: number;
  /** "Öğretmen kaynaklı" iptal/telafi sayısı. */
  teacherCausedCount: number;
  /** 0–1 (1 − öğretmen kaynaklı / taban); tabanda ders yoksa null. */
  attendanceRate: number | null;
  /** 1–5; yeterli sayıda (anonimlik eşiği) geri bildirim yoksa null. */
  feedbackAverage: number | null;
  feedbackCount: number;
  /** 0–100; hem katılım hem feedback verisi yoksa null ("yetersiz veri"). */
  score: number | null;
  components: {
    attendance: { weight: number; value: number | null; contribution: number | null };
    feedback: { weight: number; value: number | null; contribution: number | null };
  };
};

export async function computeTeacherPerformanceReport(
  data: AppData,
  tenantId: string,
  teacherId: string,
  periodStart: string,
  periodEnd: string
): Promise<TeacherPerformanceReport> {
  const reliability = teacherReliability(
    data.lessons,
    teacherId,
    new Date(periodStart).getTime(),
    new Date(periodEnd).getTime()
  );
  const attendanceRate = reliability.rate;

  const feedbackSummary = await computeTeacherFeedbackSummary(tenantId, teacherId);
  const feedbackAverage =
    feedbackSummary.eligible && feedbackSummary.criteriaAverages
      ? Math.round(
          (Object.values(feedbackSummary.criteriaAverages).reduce((s, v) => s + v, 0) /
            Object.values(feedbackSummary.criteriaAverages).length) *
            10
        ) / 10
      : null;

  const attendanceContribution = attendanceRate !== null ? attendanceRate * 100 * ATTENDANCE_WEIGHT : null;
  // 1–5 ölçeği 0–100'e taşınır ((x-1)/4 * 100) — 1 puan "en düşük" 0'a, 5 "en yüksek" 100'e denk gelir.
  const feedbackContribution =
    feedbackAverage !== null ? (((feedbackAverage - 1) / 4) * 100 * FEEDBACK_WEIGHT) : null;

  // Yalnızca MEVCUT bileşen(ler) üzerinden, ağırlıklar o alt-kümeye göre
  // yeniden normalize edilerek 0-100'e taşınır — tek bileşen eksikse skor
  // sessizce 0'a düşmez, var olan veri tam ağırlıkla değerlendirilir.
  let score: number | null = null;
  if (attendanceRate !== null && feedbackAverage !== null) {
    score = Math.round(attendanceContribution! + feedbackContribution!);
  } else if (attendanceRate !== null) {
    score = Math.round(attendanceRate * 100);
  } else if (feedbackAverage !== null) {
    score = Math.round(((feedbackAverage - 1) / 4) * 100);
  }

  return {
    version: TEACHER_PERFORMANCE_SCORE_VERSION,
    teacherId,
    periodStart,
    periodEnd,
    plannedLessonCount: reliability.counted.length,
    teacherCausedCount: reliability.teacherCaused.length,
    attendanceRate,
    feedbackAverage,
    feedbackCount: feedbackSummary.responseCount,
    score,
    components: {
      attendance: { weight: ATTENDANCE_WEIGHT, value: attendanceRate, contribution: attendanceContribution },
      feedback: { weight: FEEDBACK_WEIGHT, value: feedbackAverage, contribution: feedbackContribution },
    },
  };
}
