/**
 * Faz 3C — bir ders "İşlendi" olarak işaretlendiğinde, o ders için ödev
 * verilmemişse (bkz. Homework.lessonId) öğretmene TEK SEFERLİK (idempotent,
 * bkz. lesson-homework-reminder-log.ts) bir hatırlatma bildirimi üretir.
 * Mevcut ders/yoklama akışını asla bloklamaz — best-effort, hata fırlatmaz.
 */
import type { Lesson } from "./types";
import { hasHomeworkForLesson } from "./homework";
import { recordHomeworkReminderIfNew } from "./lesson-homework-reminder-log";
import { getUserIdByTeacherId } from "./auth/users";
import { notifyUserIfEnabled } from "./notification-dispatch";

export async function checkAndNotifyMissingHomework(tenantId: string, lesson: Lesson): Promise<void> {
  try {
    const hasHomework = await hasHomeworkForLesson(tenantId, lesson.id);
    if (hasHomework) return;

    const isNew = await recordHomeworkReminderIfNew(tenantId, lesson.id);
    if (!isNew) return; // Daha önce hatırlatılmış — spam yok.

    const teacherUserId = await getUserIdByTeacherId(tenantId, lesson.teacherId);
    if (!teacherUserId) return;

    await notifyUserIfEnabled({
      tenantId,
      userId: teacherUserId,
      category: "homework_missing_for_lesson",
      title: "Ödev eksik",
      body: `"${lesson.instrument}" dersi işlendi olarak işaretlendi ama bu ders için ödev verilmedi.`,
      dedupeKey: `${lesson.id}:homework_missing`,
    });
  } catch {
    // best-effort — ders işleme akışını asla bloklamaz.
  }
}
