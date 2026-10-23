import type { BadgeTone } from "../../components/ui/status-badge";
import type { IconName } from "../../components/ui/icon";
import type { Lesson } from "../../types/api";

/**
 * Yoklama statü renkleri/etiketleri — TEK kaynak.
 *
 * Yönetici ders programı ve öğretmen ders programı AYNI modülü kullanır; iki
 * rolün gördüğü renk ve etiket birbirinden ayrışamaz. Renkler tema
 * token'larından gelir (`StatusBadge` tonları) — açık/koyu temada WCAG AA
 * (≥ 4.5:1) sağlanır (bkz. __tests__/attendance-status.test.ts).
 *
 * Renk TEK BAŞINA anlam taşımaz: her statü ayrıca ikon + kısa etiket taşır
 * (renk körlüğü erişilebilirliği).
 */
export type AttendanceStatusCode = "attended" | "absent" | "excused" | "unmarked" | "cancelled";

export type AttendanceStatusStyle = {
  code: AttendanceStatusCode;
  /** i18n anahtarı (`attStatus.*` — tr/en). */
  labelKey: string;
  tone: BadgeTone;
  icon: IconName;
};

export const ATTENDANCE_STATUS_STYLES: Record<AttendanceStatusCode, AttendanceStatusStyle> = {
  attended: { code: "attended", labelKey: "attStatus.present", tone: "success", icon: "checkmark-circle-outline" },
  absent: { code: "absent", labelKey: "attStatus.absent", tone: "danger", icon: "close-circle-outline" },
  excused: { code: "excused", labelKey: "attStatus.excused", tone: "info", icon: "shield-checkmark-outline" },
  unmarked: { code: "unmarked", labelKey: "attStatus.unmarked", tone: "neutral", icon: "ellipse-outline" },
  cancelled: { code: "cancelled", labelKey: "attStatus.cancelled", tone: "neutral", icon: "ban-outline" },
};

/** Legend sırası — iptal edilen ders yoklama statüsü değildir, listede yer almaz. */
export const ATTENDANCE_LEGEND_CODES: AttendanceStatusCode[] = ["attended", "absent", "excused", "unmarked"];

type LessonAttendanceFields = Pick<
  Lesson,
  "status" | "studentAttended" | "studentAbsent" | "studentExcused" | "lessonProcessed"
>;

/**
 * Dersin yoklama statüsü — sunucunun döndürdüğü bayraklardan türetilir
 * (salt okunur; istemci yoklama YAZMAZ). Öncelik:
 * iptal > işlendi/katıldı > gelmedi > izinli > işaretlenmedi.
 */
export function attendanceStatusForLesson(lesson: LessonAttendanceFields): AttendanceStatusCode {
  if (lesson.status === "cancelled") return "cancelled";
  if (lesson.lessonProcessed || lesson.studentAttended) return "attended";
  if (lesson.studentAbsent || lesson.status === "no_show") return "absent";
  if (lesson.studentExcused) return "excused";
  return "unmarked";
}

export function attendanceStatusStyle(code: AttendanceStatusCode): AttendanceStatusStyle {
  return ATTENDANCE_STATUS_STYLES[code];
}
