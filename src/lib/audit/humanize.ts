/**
 * Denetim kaydını insan okunur Türkçeye çevirir — saf, I/O yok.
 *
 * Ham `action` ("student.profile_update") ekranda asla tek başına gösterilmez;
 * katalogda cümle kalıbı yoksa varlık türü + fiil ile genel bir cümle kurulur.
 * Alan-düzeyi değişiklikler `meta.changes` ([{field, from, to}]) içinde taşınır
 * ve `FIELD_LABELS` ile Türkçe alan adına çevrilir.
 */

export type AuditFieldChange = { field: string; from: unknown; to: unknown };

/** Varlık türü → Türkçe ad (cümle içinde "öğrenci", "ödeme" …). */
export const ENTITY_LABELS: Record<string, string> = {
  Student: "öğrenci",
  Teacher: "öğretmen",
  Lesson: "ders",
  Payment: "ödeme",
  TeacherPayout: "hakediş",
  StudentContract: "sözleşme",
  DocumentInstance: "evrak",
  DocumentTemplate: "evrak şablonu",
  TrialLesson: "deneme dersi",
  MakeupRequest: "telafi",
  Task: "görev",
  StaffMember: "personel",
  Package: "paket",
  School: "kurum ayarı",
  Tenant: "kurum",
  User: "kullanıcı",
  UserSession: "oturum",
  Auth: "oturum",
  Announcement: "duyuru",
  TeacherFeeRule: "öğretmen ücret kuralı",
  StudentListView: "öğrenci liste görünümü",
  LeaveRequest: "izin talebi",
  PayrollRecord: "bordro",
  ExpenseRecord: "gider",
};

/** Alan anahtarı → Türkçe etiket (değişiklik geçmişi satırları). */
export const FIELD_LABELS: Record<string, string> = {
  name: "Ad soyad",
  phone: "Telefon",
  parentName: "Veli adı",
  parentPhone: "Veli telefonu",
  email: "E-posta",
  branchId: "Şube",
  teacherId: "Öğretmen",
  instruments: "Enstrüman",
  instrument: "Enstrüman",
  packageId: "Paket",
  packageName: "Paket",
  monthlyFee: "Aylık ücret",
  lessonDurationMinutes: "Ders süresi (dk)",
  weeklyLessonCount: "Haftalık ders",
  paymentMethod: "Ödeme yöntemi",
  paymentDueDay: "Ödeme günü",
  paymentDueRanges: "Ödeme günü aralığı",
  discountType: "İndirim türü",
  discountValue: "İndirim",
  active: "Durum",
  notes: "Not",
  resultNotes: "Sonuç notu",
  startAt: "Başlangıç",
  endAt: "Bitiş",
  durationMinutes: "Süre (dk)",
  address: "Adres",
  birthDate: "Doğum tarihi",
  enrollmentStartDate: "Kayıt tarihi",
  lessonStartDate: "Ders başlangıcı",
  intendedDurationMonths: "Kayıt süresi (ay)",
  educationMethod: "Eğitim metodu",
  level: "Seviye",
  studentType: "Öğrenci türü",
  studentTypes: "Öğrenci türü",
  amount: "Tutar",
  paidAmount: "Ödenen tutar",
  dueDate: "Vade",
  status: "Durum",
  method: "Yöntem",
  totalAmount: "Toplam tutar",
  totalMinutes: "Toplam süre (dk)",
  minutes: "Süre (dk)",
  hourlyRate: "Saatlik ücret",
  accountResponsibility: "Hesap sorumlusu",
  communicationOptOut: "İletişim tercihi",
  referralSource: "Bizi nereden buldunuz",
  termType: "Dönem",
  paidAt: "Tahsilat tarihi",
  paymentNote: "Ödeme notu",
  archivedAt: "Arşiv tarihi",
};

/** action → cümle kalıbı. {actor} ve {entity} yer tutucuları doldurulur. */
const ACTION_SENTENCES: Record<string, string> = {
  "student.create": "{actor}, {entity} öğrencisini oluşturdu.",
  "student.create_from_trial": "{actor}, {entity} deneme öğrencisini kayda dönüştürdü.",
  "student.profile_update": "{actor}, {entity} öğrencisinin bilgilerini güncelledi.",
  "student.payment_profile_update": "{actor}, {entity} öğrencisinin ödeme profilini güncelledi.",
  "student.archive": "{actor}, {entity} öğrencisinin durumunu değiştirdi (arşiv/aktif).",
  "student.delete_soft": "{actor}, {entity} öğrencisini silinenlere taşıdı (geri alınabilir).",
  "student.delete_hard": "{actor}, {entity} öğrencisini kalıcı olarak sildi.",
  "student.delete_restore": "{actor}, silinen {entity} öğrencisini geri aldı.",
  "student.bulk_update": "{actor}, {entity} için toplu güncelleme yaptı.",
  "student.csv_import": "{actor}, CSV ile öğrenci içe aktardı.",
  "student.first_payment_collected": "{actor}, kayıt ilk tahsilatını aldı.",
  "student.first_payment_adjusted": "{actor}, kayıt ilk tahsilat tutarını düzeltti.",
  "student.payment_pause": "{actor}, {entity} öğrencisinin ders programını durdurdu.",
  "student.payment_reactivate": "{actor}, {entity} öğrencisinin ders programını yeniden başlattı.",
  "student.portal_access_granted": "{actor}, {entity} için portal erişimi açtı.",
  "student.portal_access_revoked": "{actor}, {entity} için portal erişimini kapattı.",
  "payment.mark_paid": "{actor}, ödemeyi tahsil edildi olarak işaretledi.",
  "payment.update": "{actor}, ödeme kaydını düzeltti.",
  "payment.revise": "{actor}, ödeme kaydını revize etti.",
  "lesson.delete": "{actor}, ders(ler)i programdan kaldırdı.",
  "lesson.delete_protected": "{actor}, statüsü girilmiş dersi kritik şifreyle tamamen sildi.",
  "lesson.revise": "{actor}, ders tarih/saat/süresini değiştirdi.",
  "lesson.reassign": "{actor}, dersin öğretmen/şubesini değiştirdi.",
  "lesson.start": "{actor}, dersi başlattı.",
  "lesson.end": "{actor}, dersi bitirdi.",
  "lesson.time_correction": "{actor}, ders saatini düzeltti.",
  "trial.create": "{actor}, {entity} için deneme dersi planladı.",
  "trial.status": "{actor}, deneme dersinin durumunu güncelledi.",
  "trial.update": "{actor}, {entity} deneme dersini düzenledi.",
  "trial.converted": "{actor}, deneme öğrencisini kayda dönüştürdü.",
  "contract.cancel": "{actor}, sözleşmeyi iptal etti.",
  "contract.print": "{actor}, sözleşmeyi yazdırdı.",
  "contract.upload_signed": "{actor}, imzalı sözleşmeyi yükledi.",
  "teacher_payout.create": "{actor}, hakediş kaydı oluşturdu.",
  "teacher_payout.mark_paid": "{actor}, hakedişi ödendi olarak işaretledi.",
  "teacher_payout.revise": "{actor}, hakedişi revize etti.",
  "teacher_payout.reset": "{actor}, hakediş revizyonunu geri aldı (orijinal hesaba dönüldü).",
  "teacher_payout.unpay": "{actor}, hakedişin ödendi işaretini geri aldı.",
  "teacher.create": "{actor}, {entity} öğretmenini oluşturdu.",
  "teacher.profile_update": "{actor}, {entity} öğretmeninin bilgilerini güncelledi.",
  "staff.create": "{actor}, {entity} personel kaydını oluşturdu.",
  "staff.update": "{actor}, {entity} personel kaydını güncelledi.",
  "task.create": "{actor}, görev oluşturdu.",
  "task.update": "{actor}, görevi güncelledi.",
  "makeup.confirm": "{actor}, telafi dersini onayladı.",
  "makeup.cancel": "{actor}, telafi talebini iptal etti.",
  "security.critical_password_set": "{actor}, kritik işlem şifresini belirledi.",
  "security.critical_password_change": "{actor}, kritik işlem şifresini değiştirdi.",
  "auth.session_takeover": "{actor}, başka cihazdaki oturumunu kapatıp yeni cihazdan giriş yaptı.",
  "auth.login_success": "{actor} sisteme giriş yaptı.",
  "auth.login_failed": "Hatalı şifreyle giriş denemesi yapıldı.",
  "auth.login_rate_limited": "Çok fazla giriş denemesi nedeniyle giriş geçici olarak engellendi.",
  "auth.logout": "{actor} oturumu kapattı.",
  "auth.refresh_failed": "{actor} için oturum yenilenemedi (süresi dolmuş veya kapatılmış oturum).",
  "authz.denied": "{actor} yetkisi olmayan bir işlemi denedi; işlem engellendi.",
  "api.error": "{actor} işlem yaparken beklenmeyen bir sunucu hatası oluştu.",
  "student.restore": "{actor}, {entity} öğrencisini yeniden aktifleştirdi.",
  "school.fee_rounding_mode.update": "{actor}, hakediş süre yuvarlama kuralını değiştirdi.",
  "setup.reset_clean_template": "{actor}, kurumu boş şablona sıfırladı.",
  "setup.reset_demo_data": "{actor}, demo verilerini sıfırladı.",
};

const VERB_FALLBACK: Record<string, string> = {
  create: "oluşturdu",
  update: "güncelledi",
  delete: "sildi",
  archive: "arşivledi",
  cancel: "iptal etti",
  print: "yazdırdı",
  import: "içe aktardı",
  status: "durumunu güncelledi",
  upload: "yükledi",
};

const OUTCOME_SUFFIX: Record<string, string> = {
  denied: " (reddedildi)",
  error: " (hata ile sonuçlandı)",
};

/**
 * Tek bir denetim kaydını cümleye çevirir.
 * `entityName`: varlığın okunur adı (öğrenci adı vb.) bilinmiyorsa varlık türü adı kullanılır.
 */
export function describeAuditEvent(input: {
  action: string;
  entityType: string;
  outcome?: string;
  actorName: string;
  entityName?: string | null;
  /** 2026-10-15 — kayıtlı alan değişiklikleri: güncellemede "hangi bilgi" somut yazılır (değer değil, alan adı). */
  changes?: AuditFieldChange[];
}): string {
  const entityWord = ENTITY_LABELS[input.entityType] ?? "kayıt";
  const entity = input.entityName?.trim() || entityWord;
  const template = ACTION_SENTENCES[input.action];
  const verbKey = input.action.split(".").pop()?.split("_")[0] ?? "";
  let sentence: string;
  if (input.changes?.length && (verbKey === "update" || verbKey === "profile" || !template)) {
    const fields = Array.from(new Set(input.changes.map((c) => fieldLabel(c.field).toLocaleLowerCase("tr"))));
    const list = fields.length > 3 ? `${fields.slice(0, 3).join(", ")} ve ${fields.length - 3} alan daha` : fields.join(", ");
    sentence = `${input.actorName}, ${entity}${input.entityName ? ` (${entityWord})` : ""} kaydında ${list} bilgisini güncelledi.`;
  } else if (template) {
    sentence = template.replace("{actor}", input.actorName).replace("{entity}", entity);
    // "{entity} öğrencisini" kalıbında ad yoksa "öğrenci öğrencisini" olmasın.
    if (!input.entityName) sentence = sentence.replace(`${entityWord} ${entityWord}`, entityWord);
  } else {
    const verb = VERB_FALLBACK[verbKey] ?? "üzerinde işlem yaptı";
    sentence = `${input.actorName}, ${entity}${input.entityName ? ` (${entityWord})` : ""} kaydını ${verb}.`;
  }
  const suffix = input.outcome ? OUTCOME_SUFFIX[input.outcome] : undefined;
  return suffix ? sentence.replace(/\.$/, `${suffix}.`) : sentence;
}

/** Değeri ekranda okunur hale getirir (boş → "—", boolean → Evet/Hayır, dizi → virgüllü). */
export function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Evet" : "Hayır";
  if (typeof value === "number") return value.toLocaleString("tr-TR");
  if (Array.isArray(value)) return value.map(formatAuditValue).join(", ") || "—";
  if (typeof value === "object") return JSON.stringify(value);
  const s = String(value);
  // ISO tarih → gg.aa.yyyy
  const m = /^(\d{4})-(\d{2})-(\d{2})(T|$)/.exec(s);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
}

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

/**
 * Yama ile önceki kaydı karşılaştırır; yalnız gerçekten değişen alanları döner.
 * Kimlik/teknik alanlar ve kişisel veri şifreleri (…Cipher) asla yazılmaz.
 */
export function diffRecordFields(before: Record<string, unknown>, patch: Record<string, unknown>): AuditFieldChange[] {
  const out: AuditFieldChange[] = [];
  for (const [field, to] of Object.entries(patch)) {
    if (to === undefined || field === "studentId" || field === "id" || /Cipher|password|Hash/i.test(field)) continue;
    const from = before[field];
    if (JSON.stringify(from ?? null) === JSON.stringify(to ?? null)) continue;
    out.push({ field, from: from ?? null, to });
  }
  return out;
}

/** meta.changes'i güvenle okur (eski kayıtlarda yok). */
export function readAuditChanges(meta: Record<string, unknown> | null | undefined): AuditFieldChange[] {
  const raw = meta?.changes;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c): c is AuditFieldChange => !!c && typeof c === "object" && typeof (c as { field?: unknown }).field === "string"
  );
}

export const ROLE_LABELS_TR: Record<string, string> = {
  SUPER_ADMIN: "Kurum sahibi",
  SCHOOL_ADMIN: "Kurum yöneticisi",
  BRANCH_MANAGER: "Şube yöneticisi",
  TEACHER: "Öğretmen",
  PARENT: "Veli",
  STUDENT: "Öğrenci",
  AI_AGENT: "Yapay zekâ asistanı",
  HYPER_ADMIN: "Platform yöneticisi",
};

/**
 * 8. tur (F) — Türkçe işlem kategorileri. Eski kayıtlar bozulmaz: kategori
 * saklanmaz, `entityType` (ve oturum için `action` öneki) üzerinden SUNUMDA
 * eşlenir. "Sistem işlemleri" = diğer kategorilere girmeyen her şey.
 */
export type AuditCategory = "student" | "contract" | "payment" | "lesson" | "user" | "system";

export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  student: "Öğrenci işlemleri",
  contract: "Sözleşme işlemleri",
  payment: "Ödeme işlemleri",
  lesson: "Ders işlemleri",
  user: "Kullanıcı işlemleri",
  system: "Sistem işlemleri",
};

export const AUDIT_CATEGORY_ENTITY_TYPES: Record<Exclude<AuditCategory, "system">, string[]> = {
  student: ["Student", "StudentListView", "StudentFeedback", "StudentCurriculumTopic", "KvkkConsent", "Homework", "HomeworkSubmission"],
  contract: ["StudentContract", "DocumentInstance", "DocumentTemplate"],
  payment: ["Payment", "PaymentFollowUpCase", "TeacherPayout", "TeacherFeeRule", "PayrollRecord", "ExpenseRecord", "StaffAdvance", "DiscountCampaign", "Package"],
  lesson: ["Lesson", "LessonSeries", "TrialLesson", "MakeupRequest", "ClosedDay", "Room", "LessonAssessment", "PeriodicAssessment"],
  user: ["User", "UserSession", "Auth", "Teacher", "StaffMember", "LeaveRequest"],
};

export function auditCategoryOf(entityType: string): AuditCategory {
  for (const [cat, types] of Object.entries(AUDIT_CATEGORY_ENTITY_TYPES)) {
    if (types.includes(entityType)) return cat as AuditCategory;
  }
  return "system";
}

/** Varlık türü → kaydın yapıldığı ekran/bölüm. */
export const AUDIT_SCREEN_LABELS: Record<string, string> = {
  Student: "Öğrenciler",
  StudentListView: "Öğrenciler",
  StudentFeedback: "Öğrenciler",
  StudentCurriculumTopic: "Öğrenciler",
  KvkkConsent: "Öğrenciler",
  StudentContract: "Sözleşme Merkezi",
  DocumentInstance: "Evraklar",
  DocumentTemplate: "Evrak Şablonları",
  Payment: "Ödemeler",
  PaymentFollowUpCase: "Tahsilat Takibi",
  TeacherPayout: "Hakediş",
  TeacherFeeRule: "Öğretmen Ücretleri",
  PayrollRecord: "Bordro",
  ExpenseRecord: "Giderler",
  Lesson: "Ders Programı",
  TrialLesson: "Deneme Dersleri",
  MakeupRequest: "Telafi Merkezi",
  ClosedDay: "Yoklama Takvimi",
  Room: "Odalar",
  Teacher: "Öğretmenler",
  StaffMember: "Personel",
  User: "Kullanıcılar",
  UserSession: "Oturum",
  Auth: "Oturum",
  School: "Kurum Ayarları",
  Tenant: "Kurum Ayarları",
  Task: "Görevler",
  Announcement: "Duyurular",
  Package: "Paketler",
};

/** Önceki → sonraki değer özetini kompakt tek satır yapar (en çok `max` alan). */
export function compactAuditDiff(changes: AuditFieldChange[], max = 3): string {
  if (changes.length === 0) return "";
  const head = changes
    .slice(0, max)
    .map((c) => `${fieldLabel(c.field)}: ${formatAuditValue(c.from)} → ${formatAuditValue(c.to)}`)
    .join(" · ");
  return changes.length > max ? `${head} · +${changes.length - max} alan` : head;
}

/**
 * Tam bağlam satırı: "Öğrenciler → Gülce Özalp → Sözleşme #C-2024-041 → <cümle>".
 * Parçalar bilinmiyorsa atlanır (uydurulmaz).
 */
export function auditBreadcrumb(parts: Array<string | undefined | null>): string {
  return parts.filter((p): p is string => !!p && p.trim() !== "").join(" → ");
}

/** meta'dan istemci IP/cihaz bilgisi (varsa). */
export function auditClientInfo(meta: Record<string, unknown> | null | undefined): string | undefined {
  const ip = typeof meta?.ip === "string" ? meta.ip : undefined;
  const ua = typeof meta?.userAgent === "string" ? meta.userAgent : typeof meta?.device === "string" ? meta.device : undefined;
  const device = ua ? (/(iphone|android|mobile)/i.test(ua) ? "Mobil" : /expo|okhttp/i.test(ua) ? "Mobil uygulama" : "Tarayıcı") : undefined;
  return [ip, device].filter(Boolean).join(" · ") || undefined;
}

/** Eski kayıtta ekran bilgisi yoksa uydurulmaz. */
export const AUDIT_SCREEN_UNKNOWN = "Kaynak ekran kaydedilmemiş";

function actionLabelFromTemplate(template: string): string {
  const s = template.replace(/^\{actor\},?\s*/, "").replace(/\{entity\}\s*/g, "").replace(/\.$/, "").trim();
  return s.charAt(0).toLocaleUpperCase("tr") + s.slice(1);
}

/**
 * "İşlem" filtresi: bilinen işlem kodları Türkçe adla; aynı adı taşıyan kodlar tek seçenekte (virgülle) birleşir.
 * Teknik kod kullanıcıya gösterilmez; listede olmayan eski kodlar "Ara" ile bulunur.
 */
export function auditActionOptions(): { value: string; label: string }[] {
  const byLabel = new Map<string, string[]>();
  for (const [code, template] of Object.entries(ACTION_SENTENCES)) {
    const label = actionLabelFromTemplate(template);
    byLabel.set(label, [...(byLabel.get(label) ?? []), code]);
  }
  return Array.from(byLabel, ([label, codes]) => ({ label, value: codes.join(",") })).sort((a, b) =>
    a.label.localeCompare(b.label, "tr")
  );
}
