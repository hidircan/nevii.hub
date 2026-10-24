/**
 * İş 4 (yönetici bildirim merkezi sprint'i) — bildirim kategori kataloğu.
 * TEK kaynak: hem tercih ekranı (`/panel/ayarlar/bildirimler`) hem de olay
 * üreten köprüler (`notifyAdmins`, `notifyTaskAssigned` vb.) buradan okur.
 * `implemented: false` olan kategoriler UI'da dürüstçe "henüz etkin değil"
 * olarak gösterilir — arka planda sahte bildirim üretilmez.
 */
import type { AppRole } from "./auth/types";

export type NotificationCategory =
  // Ders — zamanlı/scheduler gerektirenler henüz etkin değil.
  | "lesson_started"
  | "lesson_upcoming"
  | "lesson_reminder_1d"
  | "lesson_reminder_1h"
  | "lesson_reminder_15m"
  | "push_include_student_name"
  | "lesson_cancelled"
  | "lesson_rescheduled"
  | "lesson_reassigned"
  | "homework_missing_for_lesson"
  | "homework_due_date_changed"
  // Ödeme ve finans
  | "payment_overdue"
  | "payment_failed_or_pending"
  | "payment_received"
  | "collections_approval_pending"
  | "collections_send_failed"
  // İş takip — atama burada; DUE_TODAY/OVERDUE ayrı TaskReminderPreferences.
  | "task_new_assignment"
  | "task_due_today"
  | "task_overdue"
  // Personel ve izin
  | "leave_new_request"
  | "leave_pending_approval"
  // İK / işe alım
  | "recruitment_new_application"
  // Öğrenci operasyonları
  | "student_new_registration"
  | "trial_new_application"
  | "club_new_application"
  | "attendance_exception"
  | "student_attendance_risk"
  | "student_contract_expiring"
  | "portal_request"
  | "teacher_feedback_submitted"
  | "lesson_assessment_submitted"
  | "periodic_assessment_submitted"
  | "student_feedback_submitted"
  | "teacher_feedback_shared"
  | "announcement_published";

export type NotificationCategoryGroup = "lessons" | "finance" | "tasks" | "staff" | "students" | "announcements";

export type NotificationCategoryDef = {
  category: NotificationCategory;
  group: NotificationCategoryGroup;
  label: string;
  description: string;
  /** false ise gerçek olay üretici yok — UI'da bilgilendirici, tercih kilitli. */
  implemented: boolean;
  /**
   * Bu kategori için gerçekten bir event producer'ın bildirim gönderdiği
   * roller (bkz. lesson-notifications.ts/manager-notifications.ts/tools.ts
   * — her satır kod-kanıtlı doğrulandı). Ayarlar ekranı yalnızca çağıranın
   * rolü bu listede varsa kategoriyi gösterir — aksi halde etkisi olmayan
   * bir toggle sunmuş oluruz (dürüstlük ilkesi, bkz. CLAUDE.md).
   */
  roles: AppRole[];
  /** Kullanıcı kapatamaz (kritik/güvenlik) — bu sprintte yok. */
  criticalLocked?: boolean;
  /** Kayıt yokken varsayılan in-app açık/kapalı. */
  defaultInAppEnabled: boolean;
  /** Ayar ekranında ek dürüst not (scheduler eksikliği vb.). */
  deferralNote?: string;
};

export const NOTIFICATION_CATEGORY_GROUPS: Record<NotificationCategoryGroup, string> = {
  lessons: "Ders operasyonları",
  finance: "Ödeme ve finans",
  tasks: "İş takip",
  staff: "Personel ve izin",
  students: "Öğrenci operasyonları",
  announcements: "Duyurular",
};

/** Grup sırası — ayarlar ekranı ve toplu aksiyonlar için. */
export const NOTIFICATION_GROUP_ORDER: NotificationCategoryGroup[] = [
  "lessons",
  "finance",
  "tasks",
  "staff",
  "students",
  "announcements",
];

export const NOTIFICATION_CATEGORIES: NotificationCategoryDef[] = [
  {
    category: "lesson_started",
    group: "lessons",
    label: "Ders başladı",
    description: "Planlanan bir ders fiilen başladığında.",
    implemented: true,
    roles: ["STUDENT"],
    defaultInAppEnabled: true,
  },
  {
    category: "lesson_upcoming",
    group: "lessons",
    label: "Yaklaşan ders",
    description: "Ders saati yaklaştığında hatırlatma.",
    implemented: true,
    roles: ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER", "STUDENT"],
    defaultInAppEnabled: true,
  },
  {
    category: "lesson_reminder_1d",
    group: "lessons",
    label: "Ders hatırlatması: 1 gün önce",
    description: "Her ders için 1 gün önce ayrı hatırlatma (iptal/geçmiş derslere gitmez).",
    implemented: true,
    roles: ["STUDENT"],
    defaultInAppEnabled: true,
  },
  {
    category: "lesson_reminder_1h",
    group: "lessons",
    label: "Ders hatırlatması: 1 saat önce",
    description: "Her ders için 1 saat önce ayrı hatırlatma (iptal/geçmiş derslere gitmez).",
    implemented: true,
    roles: ["STUDENT", "TEACHER"],
    defaultInAppEnabled: true,
  },
  {
    category: "lesson_reminder_15m",
    group: "lessons",
    label: "Ders hatırlatması: 15 dakika önce",
    description: "Her ders için 15 dakika önce ayrı hatırlatma (iptal/geçmiş derslere gitmez).",
    implemented: true,
    roles: ["STUDENT", "TEACHER"],
    defaultInAppEnabled: true,
  },
  {
    category: "push_include_student_name",
    group: "lessons",
    label: "Bildirimde öğrenci adını göster",
    description: "Kapalıysa (varsayılan) push metni PII-minimize edilir, çocuk adı yer almaz.",
    implemented: true,
    roles: ["STUDENT"],
    defaultInAppEnabled: false,
  },
  {
    category: "lesson_cancelled",
    group: "lessons",
    label: "Ders iptal edildi",
    description: "Bir ders iptal edildiğinde (yönetici özeti).",
    implemented: true,
    roles: ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER", "STUDENT"],
    defaultInAppEnabled: true,
  },
  {
    category: "lesson_rescheduled",
    group: "lessons",
    label: "Ders ertelendi / telafiye alındı",
    description: "Bir ders telafiye alındığında veya taşındığında.",
    implemented: true,
    roles: ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER", "STUDENT"],
    defaultInAppEnabled: true,
  },
  {
    category: "lesson_reassigned",
    group: "lessons",
    label: "Ders öğretmeni/şubesi değişti",
    description: "Bir dersin öğretmeni veya şubesi değiştirildiğinde (Faz 13).",
    implemented: true,
    roles: ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER", "STUDENT"],
    defaultInAppEnabled: true,
  },
  {
    category: "homework_missing_for_lesson",
    group: "lessons",
    label: "Ödev eksik",
    description: "Bir ders işlendi olarak işaretlendiğinde ödev verilmemişse (Faz 3C).",
    implemented: true,
    roles: ["TEACHER"],
    defaultInAppEnabled: true,
  },
  {
    category: "homework_due_date_changed",
    group: "lessons",
    label: "Ödev son teslim tarihi değişti",
    description: "Öğretmen, verilen bir ödevin son teslim tarihini değiştirdiğinde.",
    implemented: true,
    roles: ["STUDENT"],
    defaultInAppEnabled: true,
  },
  {
    category: "payment_overdue",
    group: "finance",
    label: "Vadesi geçmiş ödeme",
    description: "Gecikmiş ödeme taraması veliye hatırlatma açtığında yöneticilere de düşer.",
    implemented: true,
    roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
    defaultInAppEnabled: true,
  },
  {
    category: "payment_failed_or_pending",
    group: "finance",
    label: "Başarısız / bekleyen ödeme",
    description: "Ödeme başarısız veya uzun süredir beklemede olduğunda.",
    implemented: true,
    roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
    defaultInAppEnabled: true,
  },
  {
    category: "payment_received",
    group: "finance",
    label: "Ödeme alındı",
    description: "Bir tahsilat kaydedildiğinde.",
    implemented: true,
    roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
    defaultInAppEnabled: true,
  },
  {
    category: "collections_approval_pending",
    group: "finance",
    label: "Onay bekleyen tahsilat mesajı",
    description: "Tahsilat taslağı onaylandığında veya gönderime hazır olduğunda.",
    implemented: true,
    roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
    defaultInAppEnabled: true,
  },
  {
    category: "collections_send_failed",
    group: "finance",
    label: "Tahsilat gönderimi başarısız",
    description: "WhatsApp veya SMS gönderim denemesi başarısız olduğunda.",
    implemented: true,
    roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
    defaultInAppEnabled: true,
  },
  {
    category: "task_new_assignment",
    group: "tasks",
    label: "Kendisine atanan yeni iş",
    description: "Size yeni bir görev atandığında.",
    implemented: true,
    roles: ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"],
    defaultInAppEnabled: true,
  },
  {
    category: "task_due_today",
    group: "tasks",
    label: "Son tarihi bugün olan iş",
    description: "Görev son tarihi bugün olduğunda (hatırlatma motoru).",
    implemented: true,
    roles: ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"],
    defaultInAppEnabled: true,
  },
  {
    category: "task_overdue",
    group: "tasks",
    label: "Gecikmiş iş",
    description: "Görev son tarihi geçtiğinde (hatırlatma motoru).",
    implemented: true,
    roles: ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"],
    defaultInAppEnabled: true,
  },
  {
    category: "leave_new_request",
    group: "staff",
    label: "Yeni izin talebi",
    description: "Bir personel izin talebi oluşturduğunda (onay bekliyor).",
    implemented: true,
    roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
    defaultInAppEnabled: true,
  },
  {
    category: "recruitment_new_application",
    group: "staff",
    label: "Yeni iş başvurusu",
    description: "Kariyer sayfasından yeni bir aday başvurusu geldiğinde (İK ayarlarından da kapatılabilir).",
    implemented: true,
    roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
    defaultInAppEnabled: true,
  },
  {
    category: "leave_pending_approval",
    group: "staff",
    label: "Bekleyen izin onayı",
    description: "Onay bekleyen izinler için periyodik hatırlatma.",
    implemented: true,
    roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
    defaultInAppEnabled: true,
  },
  {
    category: "student_new_registration",
    group: "students",
    label: "Yeni öğrenci kaydı",
    description: "Yeni bir öğrenci kaydedildiğinde.",
    implemented: true,
    roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
    defaultInAppEnabled: true,
  },
  {
    category: "trial_new_application",
    group: "students",
    label: "Yeni deneme dersi başvurusu",
    description: "Aday, herkese açık başvuru formundan deneme dersi başvurusu yaptığında.",
    implemented: true,
    roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
    defaultInAppEnabled: true,
  },
  {
    category: "club_new_application",
    group: "students",
    label: "Yeni grup dersi (kulüp) başvurusu",
    description: "Aday, herkese açık grup dersi başvuru portalından bir kulübe başvurduğunda.",
    implemented: true,
    roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
    defaultInAppEnabled: true,
  },
  {
    category: "attendance_exception",
    group: "students",
    label: "Devamsızlık istisnası",
    description: "Beklenmedik bir devamsızlık/yoklama istisnası oluştuğunda.",
    implemented: true,
    roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
    defaultInAppEnabled: true,
  },
  {
    // P0-2D — bu tenant'ın SCHOOL_ADMIN/SUPER_ADMIN kullanıcıları DIŞINDA
    // (öğretmen/veli/başka tenant) KİMSE görmemeli — bkz. attendance-risk-check.ts.
    category: "student_attendance_risk",
    group: "students",
    label: "Öğrenci devam riski",
    description: "Aynı öğrenci, aynı ay içinde 2'den fazla 'İşlendi' ders aldığında.",
    implemented: true,
    roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
    defaultInAppEnabled: true,
  },
  {
    // 2026-09-30 — yalnız uygulama içi, yalnız bu kurumun yöneticileri; öğrenciye/veliye SMS/e-posta YOK.
    category: "student_contract_expiring",
    group: "students",
    label: "Öğrenci sözleşmesi bitiyor",
    description: "Öğrencinin güncel sözleşmesinin bitişine, aşağıda seçilen gün sayısı kadar süre kaldığında (öğrenci başına bir kez).",
    implemented: true,
    roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
    defaultInAppEnabled: true,
  },
  {
    category: "portal_request",
    group: "students",
    label: "Portal talebi",
    description: "Veli/öğrenci portalından gelen bir talep oluştuğunda.",
    implemented: true,
    roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
    defaultInAppEnabled: true,
  },
  {
    category: "lesson_assessment_submitted",
    group: "students",
    label: "Ders gelişim raporu",
    description: "Bir öğretmen öğrencisi için ders gelişim raporu gönderdiğinde yöneticilere bildirim gönderilir.",
    implemented: true,
    roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
    defaultInAppEnabled: true,
  },
  {
    category: "periodic_assessment_submitted",
    group: "students",
    label: "4 haftalık gelişim raporu",
    description: "Bir öğretmen 4 haftalık genel değerlendirme gönderdiğinde yöneticilere bildirim gönderilir.",
    implemented: true,
    roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
    defaultInAppEnabled: true,
  },
  {
    category: "teacher_feedback_submitted",
    group: "students",
    label: "Öğretmen değerlendirmesi",
    description: "Öğrenci veya veli bir öğretmeni değerlendirdiğinde yöneticilere bildirim gönderilir.",
    implemented: true,
    roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
    defaultInAppEnabled: true,
  },
  {
    category: "student_feedback_submitted",
    group: "students",
    label: "Öğrenci değerlendirmesi",
    description: "Öğretmen bir öğrenci için değerlendirme oluşturduğunda yöneticilere bildirim gönderilir.",
    implemented: true,
    roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
    defaultInAppEnabled: true,
  },
  {
    category: "teacher_feedback_shared",
    group: "students",
    label: "Hakkımdaki değerlendirme paylaşıldı",
    description: "Yönetici, hakkınızdaki bir değerlendirmeyi anonim özetinizde görünür kıldığında.",
    implemented: true,
    roles: ["TEACHER"],
    defaultInAppEnabled: true,
  },
  {
    category: "announcement_published",
    group: "announcements",
    label: "Yeni duyuru",
    description: "Hedef kitlenizde olduğunuz bir duyuru yayınlandığında (Faz 4).",
    implemented: true,
    roles: ["TEACHER", "STUDENT"],
    defaultInAppEnabled: true,
  },
];

export const NOTIFICATION_CATEGORY_VALUES: readonly NotificationCategory[] = NOTIFICATION_CATEGORIES.map(
  (c) => c.category
);

export function isNotificationCategory(value: string): value is NotificationCategory {
  return (NOTIFICATION_CATEGORY_VALUES as readonly string[]).includes(value);
}

export function defaultInAppEnabled(category: NotificationCategory): boolean {
  return NOTIFICATION_CATEGORIES.find((c) => c.category === category)?.defaultInAppEnabled ?? false;
}

export function getCategoryDef(category: NotificationCategory): NotificationCategoryDef | undefined {
  return NOTIFICATION_CATEGORIES.find((c) => c.category === category);
}
