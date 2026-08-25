/**
 * Faz 2 — öğretmen performans skoru. KURAL (kesinlikle bozulmaz): skor
 * YALNIZCA öğretmenin KENDİ ders katılımına (`Lesson.teacherAttendanceStatus`)
 * ve öğrenci geri bildirimine (`TeacherFeedback`) bakar. Öğrenci yoklaması
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

export const TEACHER_PERFORMANCE_SCORE_VERSION = "teacher-performance-v1";

const ATTENDANCE_WEIGHT = 0.6;
const FEEDBACK_WEIGHT = 0.4;

export type TeacherPerformanceReport = {
  version: string;
  teacherId: string;
  periodStart: string;
  periodEnd: string;
  plannedLessonCount: number;
  attendedCount: number;
  absentCount: number;
  excusedCount: number;
  pendingCount: number;
  /** 0–1; işaretlenmiş (geldi+gelmedi+mazeretli) hiç ders yoksa null. */
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
  const rangeStart = new Date(periodStart).getTime();
  const rangeEnd = new Date(periodEnd).getTime();

  const lessons = data.lessons.filter((l) => {
    if (l.teacherId !== teacherId) return false;
    if (l.status === "cancelled") return false;
    const t = new Date(l.startAt).getTime();
    return t >= rangeStart && t <= rangeEnd;
  });

  const attendedCount = lessons.filter((l) => l.teacherAttendanceStatus === "geldi").length;
  const absentCount = lessons.filter((l) => l.teacherAttendanceStatus === "gelmedi").length;
  const excusedCount = lessons.filter((l) => l.teacherAttendanceStatus === "mazeretli").length;
  const markedCount = attendedCount + absentCount + excusedCount;
  const pendingCount = lessons.length - markedCount;
  const attendanceRate = markedCount > 0 ? attendedCount / markedCount : null;

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
    plannedLessonCount: lessons.length,
    attendedCount,
    absentCount,
    excusedCount,
    pendingCount,
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
