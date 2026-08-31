import type { Lesson } from "../types/api";
import type { BadgeTone } from "../components/ui/status-badge";

/**
 * Web tarafındaki effectiveLessonOpsStatus önceliğiyle aynı sıra: işlendi > katıldı >
 * telafi > gelmedi > izinli > (geçmişse) yoklama bekliyor > planlandı.
 */
export function lessonStatusBadge(lesson: Lesson): { label: string; tone: BadgeTone } {
  if (lesson.status === "cancelled") return { label: "İptal edildi", tone: "neutral" };
  if (lesson.status === "no_show") return { label: "Gelmedi", tone: "danger" };
  if (lesson.lessonProcessed) return { label: "İşlendi", tone: "success" };
  if (lesson.studentAttended) return { label: "Katıldı", tone: "success" };
  if (lesson.opsMakeupFlag) return { label: "Telafi bekliyor", tone: "warning" };
  if (lesson.studentAbsent) return { label: "Gelmedi", tone: "danger" };
  if (lesson.studentExcused) return { label: "İzinli", tone: "info" };
  if (lesson.status === "in_progress") return { label: "Devam ediyor", tone: "info" };
  if (new Date(lesson.endAt).getTime() < Date.now()) return { label: "Yoklama bekliyor", tone: "warning" };
  return { label: "Planlandı", tone: "primary" };
}
