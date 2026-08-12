/**
 * İş 4 (yönetici bildirim merkezi sprint'i) — bildirim kategori kataloğu.
 * TEK kaynak: hem tercih ekranı (`/panel/ayarlar/bildirimler`) hem de olay
 * üreten köprüler (`notifyAdmins`, `notifyTaskAssigned` vb.) buradan okur.
 * `implemented: false` olan kategoriler UI'da dürüstçe "henüz etkin değil"
 * olarak gösterilir — arka planda sahte bildirim üretilmez.
 */
export type NotificationCategory =
  // Ders — zamanlı/scheduler gerektirenler henüz etkin değil.
  | "lesson_started"
  | "lesson_upcoming"
  | "lesson_cancelled"
  | "lesson_rescheduled"
  // Ödeme ve finans
  | "payment_overdue"
  | "payment_failed_or_pending"
  | "payment_received"
  // İş takip — atama burada; DUE_TODAY/OVERDUE ayrı TaskReminderPreferences.
  | "task_new_assignment"
  | "task_due_today"
  | "task_overdue"
  // Personel ve izin
  | "leave_new_request"
  | "leave_pending_approval"
  // Öğrenci operasyonları
  | "student_new_registration"
  | "attendance_exception"
  | "portal_request";

export type NotificationCategoryGroup = "lessons" | "finance" | "tasks" | "staff" | "students";

export type NotificationCategoryDef = {
  category: NotificationCategory;
  group: NotificationCategoryGroup;
  label: string;
  description: string;
  /** false ise gerçek olay üretici yok — UI'da bilgilendirici, tercih kilitli. */
  implemented: boolean;
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
};

/** Grup sırası — ayarlar ekranı ve toplu aksiyonlar için. */
export const NOTIFICATION_GROUP_ORDER: NotificationCategoryGroup[] = [
  "lessons",
  "finance",
  "tasks",
  "staff",
  "students",
];

export const NOTIFICATION_CATEGORIES: NotificationCategoryDef[] = [
  {
    category: "lesson_started",
    group: "lessons",
    label: "Ders başladı",
    description: "Planlanan bir ders fiilen başladığında.",
    implemented: false,
    defaultInAppEnabled: false,
    deferralNote: "Zamanlanmış kontrol altyapısı gerektiği için henüz etkin değil.",
  },
  {
    category: "lesson_upcoming",
    group: "lessons",
    label: "Yaklaşan ders",
    description: "Ders saati yaklaştığında hatırlatma.",
    implemented: false,
    defaultInAppEnabled: false,
    deferralNote: "Zamanlanmış kontrol altyapısı gerektiği için henüz etkin değil.",
  },
  {
    category: "lesson_cancelled",
    group: "lessons",
    label: "Ders iptal edildi",
    description: "Bir ders iptal edildiğinde (yönetici özeti).",
    implemented: false,
    defaultInAppEnabled: true,
    deferralNote:
      "Öğretmen ders planlama bildirimi zaten çalışıyor; yönetici iptal özeti bu sprintte bağlanmadı.",
  },
  {
    category: "lesson_rescheduled",
    group: "lessons",
    label: "Ders ertelendi / telafiye alındı",
    description: "Bir ders telafiye alındığında veya taşındığında.",
    implemented: false,
    defaultInAppEnabled: true,
    deferralNote: "Güvenli yönetici özeti bağlanana kadar etkin değil.",
  },
  {
    category: "payment_overdue",
    group: "finance",
    label: "Vadesi geçmiş ödeme",
    description: "Gecikmiş ödeme taraması veliye hatırlatma açtığında yöneticilere de düşer.",
    implemented: true,
    defaultInAppEnabled: true,
  },
  {
    category: "payment_failed_or_pending",
    group: "finance",
    label: "Başarısız / bekleyen ödeme",
    description: "Ödeme başarısız veya uzun süredir beklemede olduğunda.",
    implemented: false,
    defaultInAppEnabled: false,
    deferralNote: "Ayrı bir olay üretici henüz yok.",
  },
  {
    category: "payment_received",
    group: "finance",
    label: "Ödeme alındı",
    description: "Bir tahsilat kaydedildiğinde.",
    implemented: false,
    defaultInAppEnabled: false,
    deferralNote: "Ayrı bir olay üretici henüz yok (makbuz akışı etkilenmez).",
  },
  {
    category: "task_new_assignment",
    group: "tasks",
    label: "Kendisine atanan yeni iş",
    description: "Size yeni bir görev atandığında.",
    implemented: true,
    defaultInAppEnabled: true,
  },
  {
    category: "task_due_today",
    group: "tasks",
    label: "Son tarihi bugün olan iş",
    description: "Görev son tarihi bugün olduğunda (hatırlatma motoru).",
    implemented: false,
    defaultInAppEnabled: true,
    deferralNote:
      "İş Takip hatırlatmaları ayrı tercihlerden yönetilir (Hatırlatma tercihleri modalı / tick endpoint).",
  },
  {
    category: "task_overdue",
    group: "tasks",
    label: "Gecikmiş iş",
    description: "Görev son tarihi geçtiğinde (hatırlatma motoru).",
    implemented: false,
    defaultInAppEnabled: true,
    deferralNote:
      "İş Takip hatırlatmaları ayrı tercihlerden yönetilir (Hatırlatma tercihleri modalı / tick endpoint).",
  },
  {
    category: "leave_new_request",
    group: "staff",
    label: "Yeni izin talebi",
    description: "Bir personel izin talebi oluşturduğunda (onay bekliyor).",
    implemented: true,
    defaultInAppEnabled: true,
  },
  {
    category: "leave_pending_approval",
    group: "staff",
    label: "Bekleyen izin onayı",
    description: "Onay bekleyen izinler için periyodik hatırlatma.",
    implemented: false,
    defaultInAppEnabled: false,
    deferralNote: "Zamanlanmış tarama altyapısı gerektiği için henüz etkin değil.",
  },
  {
    category: "student_new_registration",
    group: "students",
    label: "Yeni öğrenci kaydı",
    description: "Yeni bir öğrenci kaydedildiğinde.",
    implemented: false,
    defaultInAppEnabled: true,
    deferralNote: "Kayıt akışına yönetici bildirimi bu sprintte bağlanmadı.",
  },
  {
    category: "attendance_exception",
    group: "students",
    label: "Devamsızlık istisnası",
    description: "Beklenmedik bir devamsızlık/yoklama istisnası oluştuğunda.",
    implemented: false,
    defaultInAppEnabled: false,
    deferralNote: "Olay üretici henüz yok.",
  },
  {
    category: "portal_request",
    group: "students",
    label: "Portal talebi",
    description: "Veli/öğrenci portalından gelen bir talep oluştuğunda.",
    implemented: false,
    defaultInAppEnabled: false,
    deferralNote: "Portal talep kanalı henüz tanımlı değil.",
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
