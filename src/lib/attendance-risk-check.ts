/**
 * P0-2D — bir ders "İşlendi" olarak işaretlendiğinde, aynı öğrencinin aynı
 * takvim ayındaki "İşlendi" ders sayısı eşiği (varsayılan 2, yani 3. ders)
 * aştıysa tenant admin/superadmin kullanıcılarına TEK SEFERLİK (idempotent,
 * bkz. student-attendance-risk-log.ts) bir risk bildirimi üretir. Mevcut
 * ders/yoklama akışını asla bloklamaz — best-effort, hata fırlatmaz (bkz.
 * homework-lesson-check.ts — AYNI desen).
 */
import type { Lesson } from "./types";
import { readData } from "./store";
import {
  evaluateAttendanceRisk,
  buildAttendanceRiskNotificationText,
  STUDENT_ATTENDANCE_RISK_THRESHOLD,
} from "./attendance-risk";
import { recordAttendanceRiskLogIfNew } from "./student-attendance-risk-log";
import { notifyAdmins } from "./manager-notifications";

export async function notifyAttendanceRiskIfThresholdCrossed(tenantId: string, lesson: Lesson): Promise<void> {
  try {
    if (!lesson.lessonProcessed) return;

    const data = await readData();
    const evaluation = evaluateAttendanceRisk(data.lessons, lesson.studentId, lesson);
    if (!evaluation.crossedThreshold) return;

    const isNew = await recordAttendanceRiskLogIfNew({
      tenantId,
      studentId: lesson.studentId,
      calendarMonth: evaluation.calendarMonth,
      threshold: STUDENT_ATTENDANCE_RISK_THRESHOLD,
      triggeredByLessonId: lesson.id,
    });
    if (!isNew) return; // Bu (öğrenci, ay) için zaten bildirilmiş — duplicate yok.

    const student = data.students.find((s) => s.id === lesson.studentId);
    const { title, body } = buildAttendanceRiskNotificationText({
      studentName: student?.name ?? "Öğrenci",
      calendarMonth: evaluation.calendarMonth,
      processedCountInMonth: evaluation.processedCountInMonth,
      detailHref: `/panel/ogrenciler/${lesson.studentId}`,
    });
    await notifyAdmins(tenantId, "student_attendance_risk", { title, body });
  } catch {
    // best-effort — ders işleme akışını asla bloklamaz.
  }
}
