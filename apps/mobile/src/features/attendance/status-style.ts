import type { BadgeTone } from "../../components/ui/status-badge";
import type { IconName } from "../../components/ui/icon";
import type { Lesson } from "../../types/api";

/**
 * Yoklama statüsü — TEK KAYNAK (İş 2, 2026-10-30; 2026-10-30 revizyon).
 *
 * Ana referans WEB YÖNETİCİ PANELİDİR:
 *   `resolveLessonFinalStatus` (web/src/lib/lesson-live-status.ts)
 *   `LessonStatusBadge` PRESENTATION (web/src/components/lesson-status-badge.tsx)
 *   Yoklama Raporu `STATUS_LABEL` (web/src/app/panel/yoklama-raporu/page.tsx)
 *
 * Panelin görünen statüsü YALNIZCA altı tanedir:
 *
 *   attended        Geldi           (web #15803d yeşil; web ikon CheckCircle2)
 *   processed       İşlendi         (web #b91c1c KIRMIZI; web ikon ClipboardCheck)
 *   makeup          Telafi          (web #ca8a04 sarı;  web ikon RefreshCcw)
 *   makeup_planned  Planlanan telafi (web #e5fb57; Telafi Merkezi'nden planlanan ders, yoklaması henüz girilmemiş)
 *   cancelled       İptal           (web #475569 slate; web ikon XCircle)
 *   planned         Planlandı       (nötr; işaretsiz/eskiden sonuçlanmamış)
 *
 * "Mazeretli" diye bir yoklama statüsü YOKTUR (2026-10-30 owner düzeltmesi):
 * panelin statute setinde Mazeretli yerine Telafi vardır. `studentExcused`
 * eski bir veri bayrağıdır; web rozetleri/takvimi de bu bayrağı görünür
 * statü yapmaz — `planned`e indirger (bkz. resolveLessonFinalStatus).
 * Aynı uygulama AĞIR veri bayrağı `studentAbsent`/`status: "no_show"` için
 * de geçerlidir: resolver bunları OKUMAZ; yalnız ledger (displayKey) onları
 * sunucudan "absent" anahtarıyla taşır ve bu dosyanın nötr "Gelmedi"
 * stiliyle etiketlenir (statü SOZLÜĞÜNE girmez, legend'da YOK).
 *
 * ESKİ mobil eşlemesinde `lessonProcessed → Katıldı` birleştirmesi vardı;
 * webde yanlış: "İşlendi" dersin fiilen işlendiği (gerekçe ZORUNLU,
 * hakediş kaynağı), "Geldi" öğrencinin katıldığı AYRI statülerdir
 * (İşlendi KIRMIZI, Geldi YEŞİL).
 *
 * Renk TEK BAŞINA anlam taşımaz: her statü ayrıca ikon + kısa etiket taşır
 * (renk körlüğü erişilebilirliği). Tono haritası mobilin AA testli
 * `BadgeTone` token'larına eğilir — açık/koyu temada kontrast korunur:
 * web kırmızısı → danger, sarısı → warning, yeşili → success, slate → neutral.
 */
export type AttendanceStatusCode =
  | "attended"
  | "processed"
  | "makeup"
  | "makeup_planned"
  | /** Statü DEĞİL — yalnız ledger'in legacy `absent`/no_show gösterimi. */ "absent"
  | "cancelled"
  | "planned";

export type AttendanceStatusStyle = {
  code: AttendanceStatusCode;
  /** i18n anahtarı (`attStatus.*` — tr/en). */
  labelKey: string;
  tone: BadgeTone;
  icon: IconName;
};

export const ATTENDANCE_STATUS_STYLES: Record<AttendanceStatusCode, AttendanceStatusStyle> = {
  attended: { code: "attended", labelKey: "attStatus.present", tone: "success", icon: "checkmark-circle-outline" },
  processed: { code: "processed", labelKey: "attStatus.processed", tone: "danger", icon: "clipboard-outline" },
  makeup: { code: "makeup", labelKey: "attStatus.makeup", tone: "warning", icon: "repeat-outline" },
  makeup_planned: { code: "makeup_planned", labelKey: "attStatus.makeupPlanned", tone: "warning", icon: "hourglass-outline" },
  absent: { code: "absent", labelKey: "attStatus.absent", tone: "neutral", icon: "close-circle-outline" },
  cancelled: { code: "cancelled", labelKey: "attStatus.cancelled", tone: "neutral", icon: "ban-outline" },
  planned: { code: "planned", labelKey: "attStatus.planned", tone: "neutral", icon: "ellipse-outline" },
};

/**
 * Legend — web Yoklama Takvimi'nde karşılaştır: Geldi, İşlendi,
 * "Telafi (kaçırılan ders)", "Planlanan telafi", "Açık / işaretsiz".
 * `cancelled` ve legacy `absent` web legend'ında da YOKTUR; burada da yok.
 */
export const ATTENDANCE_LEGEND_CODES: AttendanceStatusCode[] = [
  "attended",
  "processed",
  "makeup",
  "makeup_planned",
  "planned",
];

/**
 * Resolver girişi — sunucu ders kaydının yalnız statü üretimine giren
 * alanları. Grup dersleri sunucuda KATILIMCI BAŞINA ayrı satırdır (aynı
 * `groupSessionId`, öğrenci başına kendi bayrakları), bu yüzden resolver
 * daima SATIR bazında çalışır — bütün grup tek satırla boyanamaz.
 */
export type LessonAttendanceFields = Pick<
  Lesson,
  "status" | "studentAttended" | "lessonProcessed" | "opsMakeupFlag" | "startAt"
> & {
  /** Sunucu ders tipi — `makeup` = Telafi Merkezi'nden planlanan telafi dersi. */
  type?: "regular" | "makeup" | "trial" | "group" | string | null;
  now?: Date;
};

/**
 * Dersin yoklama statüsü — web `resolveLessonFinalStatus`'un 1:1 port'u.
 * ÇÖZÜMLEYİCİ `studentAbsent`/`studentExcused`/`no_show` OKUMAZ (web aynen
 * böyle): legacy bayraklar çözümden geçer ve zaman/karar kurallarına
 * düşer — geçmiş işaresiz ders `planned`, `completed` olan `attended`.
 *
 * Öncelik: iptal > telafi > işlendi > geldi > planlanan telafi >
 * (geçmişse) sonuçlanmış-türev > planlandı.
 *
 * BİLİNMEYEN/EKSİK VERİ asla "Geldi" yorumlanmaz: tüm bayrak undefined ise
 * nötr "planned" döner (webin güvenli nötr fallback'i).
 */
export function attendanceStatusForLesson(lesson: LessonAttendanceFields, now: Date = new Date()): AttendanceStatusCode {
  if (lesson.status === "cancelled") return "cancelled";
  if (lesson.opsMakeupFlag) return "makeup";
  if (lesson.lessonProcessed) return "processed";
  if (lesson.studentAttended) return "attended";
  if (lesson.type === "makeup") return "makeup_planned";
  if (new Date(lesson.startAt).getTime() > now.getTime()) return "planned";
  // ÇIKARIM yoluyla gelen "completed" yalnızca GEÇMİŞ derste Geldi sayılır
  // (web: gelecekteki ders eski bir "completed" değeri yüzünden kendiliğinden
  // Geldi görünmez — web testi lesson-marked-status.test.ts:51-54).
  if (lesson.status === "completed") return "attended";
  return "planned";
}

export function attendanceStatusStyle(code: AttendanceStatusCode): AttendanceStatusStyle {
  return ATTENDANCE_STATUS_STYLES[code];
}
