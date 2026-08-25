/** Şimdilik aktif enstrümanlar; ileride genişletilecek */
export type Instrument =
  | "Piyano"
  | "Yan Flüt"
  | "Gitar"
  | "Bateri"
  | "Keman"
  | "Şan"
  | "Bağlama"
  | "Elektro Gitar";

export const INSTRUMENTS: Instrument[] = [
  "Piyano",
  "Yan Flüt",
  "Gitar",
  "Bateri",
  "Keman",
  "Şan",
  "Bağlama",
  "Elektro Gitar"
];

/**
 * Artık kapalı bir küme değil — okul admini `/panel/subeler`den istediği
 * kadar şube ekleyebilir. Demo şubeleri ("erzene", "evka3") sabit id'lerle
 * seed'de yaşamaya devam eder, ama tip düzeyinde özel bir anlamları yoktur.
 */
export type BranchId = string;

export interface Branch {
  id: BranchId;
  name: string;
  shortName: string;
  address: string;
  phone: string;
  city: string;
}

export type AttendanceStatus = "present" | "absent" | "late" | "cancelled_by_school";
/**
 * EPIC 10 (IMPLEMENTATION_PLAN.md) — "awaiting_info" eklendi: AI, WhatsApp
 * mesajından telafi sebebini düşük güvenle çıkarırsa (veya hiç çıkaramazsa)
 * talep bu durumda oluşturulur — asla doğrudan "pending"e düşmez. Yönetici
 * netleştirene kadar açık sayılır (bkz. src/lib/utils.ts statusLabel/statusColor,
 * src/app/panel/telafi/page.tsx açık/kapalı ayrımı).
 */
export type MakeupStatus =
  | "pending"
  | "suggested"
  | "awaiting_info"
  | "confirmed"
  | "completed"
  | "expired"
  | "cancelled";
export type PaymentStatus = "paid" | "pending" | "overdue" | "partial" | "voided";
export type LessonType = "regular" | "makeup" | "trial" | "group";

/**
 * Haftalık müsaitlik penceresi: 0=Pazar ... 6=Cumartesi. Package D —
 * `branchId` verilirse pencere YALNIZ o şube için geçerlidir; verilmezse
 * (legacy kayıtlar dahil) "tüm şubeler" olarak — açık, dokümante edilmiş bir
 * fallback ile — değerlendirilir (bkz. src/lib/teacher-branches.ts
 * `availabilityForBranch`). Sessiz/örtük bir eşleşme değildir.
 */
export type AvailabilityWindow = { dayOfWeek: number; start: string; end: string; branchId?: BranchId };

/** Faz 1A — öğrencinin ay-içi ödeme günü tercih aralığı (dahil): 1 ≤ start ≤ end ≤ 31. */
export type PaymentDueRange = { start: number; end: number };

/** Package D — öğretmenin çalışma biçimi. Serbest metin değil, sabit küme. */
export type TeacherEmploymentType = "tam_zamanli" | "yari_zamanli" | "serbest";

export interface Teacher {
  id: string;
  /** Faz 12 — insan-okunur, değişmez kurum numarası (ör. "T00001"). */
  displayId?: string;
  name: string;
  email: string;
  phone: string;
  /** Birincil/varsayılan şube — geriye dönük uyumluluk için korunur. */
  branchId: BranchId;
  /**
   * Package D — öğretmenin fiilen ders verdiği TÜM şubeler. `branchId`
   * (birincil) her zaman dahil sayılır (ayrıca listelenmesi gerekmez).
   * Boş/undefined ise yalnızca `branchId` şubesine atanmış demektir —
   * `teacherServesBranch` bu iki alanı birlikte değerlendirir.
   */
  branchIds?: BranchId[];
  instruments: Instrument[];
  availability: AvailabilityWindow[];
  maxDailyLessons: number;
  active: boolean;
  color: string;
  highSchool?: string;
  university?: string;
  graduationYear?: number;
  birthDate?: string;
  nationalIdCipher?: string;
  nationalIdLast2?: string;
  address?: string;
  contractStartDate?: string;
  contractEndDate?: string;
  instrumentLevels?: TeacherInstrumentSkill[];
  /** Haftalık ders saati eşiği — üstü nakit varsayılan, altı havale */
  weeklyHoursThreshold?: number;
  /** ÖNCELİK 4 (devam) — arşivleme (hard delete YOK); `active:false` ile birlikte set edilir. */
  archivedAt?: string;
  /** Package D — özlük alanları. Hepsi opsiyonel; legacy kayıtlar kırılmaz. */
  employmentType?: TeacherEmploymentType;
  /** ISO tarih — işe giriş. */
  hireDate?: string;
  /** ISO tarih — işten ayrılış. Set edilmişse `hireDate`'ten önce olamaz (validation.ts). */
  terminationDate?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  /** Özlük notu — serbest metin, PII değil ama yalnız admin/SUPER_ADMIN görür (mevcut UI kuralı). */
  personnelNotes?: string;
}

/** Package D — mevcut updateStudentProfile deseniyle aynı: tek patch tipi, tüm store backend'leri destekler. */
export type TeacherProfilePatch = Partial<
  Pick<
    Teacher,
    | "name"
    | "email"
    | "phone"
    | "branchIds"
    | "birthDate"
    | "nationalIdCipher"
    | "nationalIdLast2"
    | "address"
    | "contractStartDate"
    | "contractEndDate"
    | "employmentType"
    | "hireDate"
    | "terminationDate"
    | "emergencyContactName"
    | "emergencyContactPhone"
    | "personnelNotes"
  >
>;

/**
 * EPIC 9 (IMPLEMENTATION_PLAN.md) — öğretmenin müsaitlik değişikliği önerisi.
 * `Teacher.availability` DOĞRUDAN değişmez; bu kayıt onaylanınca uygulanır.
 */
export type TeacherAvailabilityRequestStatus = "pending" | "approved" | "rejected";

export interface TeacherAvailabilityRequest {
  id: string;
  teacherId: string;
  proposedAvailability: AvailabilityWindow[];
  exceptions?: unknown;
  status: TeacherAvailabilityRequestStatus;
  reviewNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * EPIC 4 (IMPLEMENTATION_PLAN.md) — öğrencinin eğitim programı türü. Sabit
 * bir kapalı küme (kurum admini yeni tür ekleyemez — ileride gerekirse
 * `Branch` gibi kurum-tanımlı bir modele taşınır).
 */
export type StudentType =
  | "Hobi"
  | "MEB"
  | "London College of Music Hazırlık"
  | "Konservatuvar Hazırlık"
  | "Güzel Sanatlar Lisesi Hazırlık";

export const STUDENT_TYPES: StudentType[] = [
  "Hobi",
  "MEB",
  "London College of Music Hazırlık",
  "Konservatuvar Hazırlık",
  "Güzel Sanatlar Lisesi Hazırlık",
];

export interface Student {
  id: string;
  /** Faz 12 — insan-okunur, değişmez kurum numarası (ör. "S00001"). */
  displayId?: string;
  name: string;
  email: string;
  phone: string;
  parentName: string;
  parentPhone: string;
  /**
   * Karma Öğrenci Portalı — bu, veli/öğrenci ROLÜ değildir (o artık
   * StudentPortalAccess.accessType); bu tamamen iş/faturalama kararıdır:
   * ödeme/iletişimde kimin muhatap alınacağı. Yoksa (eski kayıtlar)
   * "PARENT_MANAGED" varsayılır — bkz. migration backfill.
   */
  accountResponsibility?: "PARENT_MANAGED" | "SELF_MANAGED";
  /** Paket 7 — TC kimlik alanından hemen sonra istenir; opsiyonel. */
  motherName?: string;
  fatherName?: string;
  branchId: BranchId;
  instruments: Instrument[];
  teacherId: string;
  packageName: string;
  weeklyLessonCount: number;
  monthlyFee: number;
  active: boolean;
  notes: string;
  createdAt: string;
  /** EPIC 4 — hepsi opsiyonel; boşsa UI "Belirtilmemiş" gösterir, hata vermez. */
  studentType?: StudentType;
  /**
   * Faz 1B — öğrenci aynı anda birden fazla türde olabilir (ör. hem "MEB"
   * hem "London College of Music Hazırlık"). `studentType` (tekil) geriye
   * dönük uyumluluk için KORUNUR ve bu alan güncellenince ilk türle senkron
   * tutulur (bkz. src/lib/student-types.ts effectiveStudentTypes) — eski
   * okuyucular hâlâ anlamlı bir değer görür.
   */
  studentTypes?: StudentType[];
  /** ISO tarih */
  enrollmentStartDate?: string;
  /** ISO tarih — verilmezse açık uçlu (hâlâ kayıtlı) */
  enrollmentEndDate?: string;
  level?: string;
  /** Hedef sınav / performans dönemi — serbest metin */
  targetExam?: string;
  specialNotes?: string;
  /** EPIC 1 — true ise veli otomatik tahsilat hatırlatmalarından çıkmıştır. */
  communicationOptOut?: boolean;
  /** PRODUCT_BACKLOG — ISO date yyyy-MM-dd */
  birthDate?: string;
  address?: string;
  /** AES-GCM cipher (base64); asla listede yok */
  nationalIdCipher?: string;
  nationalIdLast2?: string;
  educationMethod?: EducationMethod;
  lessonDurationMinutes?: LessonDurationPreference;
  paymentMethod?: StudentPaymentMethod;
  /**
   * ÖNCELİK 4 (devam) — Ödeme profili override. Set edilmişse hesaplanan
   * paket/indirim tutarının yerine GEÇER (liste fiyatı + indirim yok
   * sayılır). Boşsa aylık tutar paket+süre+indirimden hesaplanır — bkz.
   * src/lib/student-payment-profile.ts.
   */
  paymentAmount?: number;
  /** Ayın günü (1–31) vade hedefi — ay sonu taşması mevcut ödeme motoru (dueWindowForPaymentMethod) davranışıyla çözülür. */
  paymentDueDay?: number;
  /**
   * Faz 1A — birden fazla ödeme günü/aralık tercihi (ör. "1–5" ve "4–15"
   * birlikte). `paymentDueDay` (tekil) geriye dönük uyumluluk için KORUNUR
   * ve bu alan güncellenince ilk aralığın başlangıcıyla senkron tutulur
   * (bkz. src/lib/payment-due-ranges.ts) — eski okuyucular (belge şablonu
   * vb.) hâlâ anlamlı bir değer görür. Boş/undefined = yalnızca legacy
   * tekil gün (varsa) geçerlidir.
   */
  paymentDueRanges?: PaymentDueRange[];
  /**
   * Package C — paket+süre indirim öncesi liste fiyatı (Package.priceXMin,
   * `computeMonthlyFee` ile hesaplanır). Yalnız bilgi/audit amaçlı; paket
   * seçilmemişse (legacy serbest ücret) set edilmez. `monthlyFee` HER ZAMAN
   * nihai (indirim/override uygulanmış) ücrettir — tek gerçek kaynak odur.
   */
  packageBaseMonthlyFee?: number;
  discountType?: DiscountType;
  /**
   * discountType="percent"/"percentage" ise 0–100 arası yüzde, "amount"/
   * "fixed" ise TL tutar — bkz. DiscountType yorumu (iki ayrı yazma yolu).
   */
  discountValue?: number;
  /** true ise `monthlyFee` hesaplanan (taban - indirim) değerden FARKLI, admin tarafından elle girilmiştir. */
  monthlyFeeManualOverride?: boolean;
  /** Override yapıldıysa zorunlu gerekçe metni — audit'te de ayrıca saklanır. */
  monthlyFeeOverrideReason?: string;
  firstLessonAt?: string;
  /** Soft-archive; hard delete yok */
  archivedAt?: string;
  /** ÖNCELİK 4 — Yoklama Takvimi dönemi. Boşsa "guz" varsayılır. */
  termType?: StudentTermType;
  /**
   * ÖNCELİK 4 (devam) — Paket Yönetimi. Additive: yoksa (legacy) `packageName`
   * serbest metniyle görünmeye devam eder — bkz. src/lib/packages.ts.
   */
  packageId?: string;
  birthPlace?: string;
  schoolOrOccupation?: string;
}

/** ÖNCELİK 4 — Yoklama Takvimi'nin gösterdiği ay aralığını belirler. */
export type StudentTermType = "guz" | "yaz";

export type PackageStatus = "active" | "archived";

/**
 * ÖNCELİK 4 (devam) — Paket Yönetimi. Fiyatlar TL, tam sayı (Payment.amount
 * ile aynı kural — asla float/kuruş ondalığı). Hard delete yok; `status`
 * ile pasife alınır. Fiyat/açıklama revizyonu GEÇMİŞ Payment kayıtlarını
 * asla değiştirmez — Payment.amount oluşturma anında donmuş bir tam sayıdır,
 * Package'a canlı referans vermez.
 */
export interface Package {
  id: string;
  title: string;
  description?: string;
  status: PackageStatus;
  price30Min: number;
  price40Min: number;
  price50Min: number;
  /** "guz" | "yaz" | undefined (Genel — her iki dönemde de geçerli). */
  termLabel?: StudentTermType;
  /** Aylık (bireysel) ders adedi. */
  monthlyLessonCount?: number;
  /** Grup solfej / ek ders adedi (aylık). */
  groupLessonCount?: number;
  /** Öğrenci kaydında önerilen varsayılan ders süresi. */
  defaultDurationMinutes?: LessonDurationPreference;
  /** Öğrenci kaydında önerilen varsayılan ödeme günü (1–28). */
  defaultPaymentDueDay?: number;
  /** Paket kapsamını açıklayan serbest metin not. */
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** EPIC 4 — öğrenci eğitim profili alanları, tek bir yerden güncellenir. */
export type StudentProfilePatch = Partial<
  Pick<
    Student,
    | "name"
    | "email"
    | "branchId"
    | "studentType"
    | "studentTypes"
    | "enrollmentStartDate"
    | "enrollmentEndDate"
    | "level"
    | "targetExam"
    | "specialNotes"
    | "communicationOptOut"
    | "phone"
    | "parentName"
    | "parentPhone"
    | "motherName"
    | "fatherName"
    | "birthDate"
    | "address"
    | "educationMethod"
    | "lessonDurationMinutes"
    | "paymentMethod"
    | "paymentAmount"
    | "paymentDueDay"
    | "paymentDueRanges"
    | "firstLessonAt"
    | "archivedAt"
    | "active"
    | "nationalIdCipher"
    | "nationalIdLast2"
    | "educationMethod"
    | "termType"
    | "packageId"
    | "birthPlace"
    | "schoolOrOccupation"
    | "monthlyFee"
    | "packageBaseMonthlyFee"
    | "discountType"
    | "discountValue"
    | "monthlyFeeManualOverride"
    | "monthlyFeeOverrideReason"
    | "accountResponsibility"
  >
>;

/**
 * EPIC 1 (IMPLEMENTATION_PLAN.md) — okulun gecikmiş tahsilat otomasyon
 * ayarları. `frequencyLimitDays`: aynı ödeme için iki hatırlatma arasında
 * geçmesi gereken en az gün sayısı. `autoSendEnabled`: true olsa bile
 * wa.me üzerinden GERÇEK gönderim her zaman bir insanın linke tıklamasını
 * gerektirir — bu ayar yalnızca taslağın "approved" durumuna otomatik
 * geçip geçmeyeceğini belirler (varsayılan: false, admin onayı zorunlu).
 */
export interface CollectionsSettings {
  frequencyLimitDays: number;
  autoSendEnabled: boolean;
  /** PRODUCT_BACKLOG §2.2 — MEB → VakıfBank, diğer → Halkbank */
  vakifbankIban?: string;
  halkbankIban?: string;
}

export const DEFAULT_COLLECTIONS_SETTINGS: CollectionsSettings = {
  frequencyLimitDays: 3,
  autoSendEnabled: false,
};

/** EPIC 1 — uygulama içi bildirim (veli portalı, admin panel bildirim çanı). */
export interface Notification {
  id: string;
  targetUserId?: string;
  targetStudentId?: string;
  kind: string;
  title: string;
  body: string;
  readAt?: string;
  createdAt: string;
}

/**
 * EPIC 5 (IMPLEMENTATION_PLAN.md) — duyuru merkezi. Hedef kitle eşleşmesi
 * SUNUCU tarafında yapılır (bkz. src/lib/announcements/audience.ts) — asla
 * client'a hedef-dışı duyuru verisi gönderilmez. `students` şu an `parents`
 * ile aynı alıcı kümesine eşlenir çünkü ayrı bir STUDENT rolü henüz yok
 * (EPIC 6A); rol eklendiğinde bu eşleme güncellenecek.
 */
export type AnnouncementAudienceType =
  | "all"
  | "branch"
  | "teachers"
  | "parents"
  | "students"
  | "studentType"
  | "selected";

export type AnnouncementAudienceRef =
  | { branchId: string }
  | { studentType: StudentType }
  | { userIds: string[] }
  | Record<string, never>;

export type AnnouncementStatus = "draft" | "published" | "archived";

/** Duyuru eki meta (max 3). `storageKey` yalnızca sunucu tarafında tutulur; client'a gönderilmez. */
export type AnnouncementAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Tenant-scoped storage object key. Omit from public/API payloads. */
  storageKey?: string;
  uploadedAt: string;
};

export interface Announcement {
  id: string;
  title: string;
  body: string;
  /** Legacy tek ek URL — geriye uyumlu. */
  attachmentUrl?: string;
  /** En fazla 3 ek. */
  attachments?: AnnouncementAttachment[];
  audienceType: AnnouncementAudienceType;
  audienceRef?: AnnouncementAudienceRef;
  status: AnnouncementStatus;
  pinned: boolean;
  /** ISO tarih — verilmezse hemen yayında sayılır (status published ise) */
  publishAt?: string;
  /** ISO tarih — verilmezse süresiz */
  expireAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * EPIC 7 (IMPLEMENTATION_PLAN.md) — öğretmen gelişim değerlendirme formu.
 * Her madde 1–5 puan; bkz. src/lib/assessment/score.ts için bölüm/genel
 * ortalama hesaplaması.
 */
export interface AssessmentScores {
  teknikBecerisi: number;
  notaOkuma: number;
  muzikalite: number;
  ritimDuyusu: number;
  calismaDuzeni: number;
  evOdeviTamamlama: number;
  dersKatilimi: number;
  motivasyon: number;
  genelIlerleme: number;
  hedefeUlasma: number;
}

export interface LessonAssessment extends AssessmentScores {
  id: string;
  lessonId: string;
  studentId: string;
  teacherId: string;
  strengthNote: string;
  nextStepsNote: string;
  improvementNote: string;
  /** Yalnızca veli/yönetici görür — bkz. parentNoteVisibleToStudent. */
  parentPrivateNote?: string;
  /** Varsayılan false: parentPrivateNote öğrenciye (EPIC 6A sonrası) gösterilmez. */
  parentNoteVisibleToStudent: boolean;
  teacherSignedName: string;
  /** ISO tarih — sunucu saatiyle damgalanır, client'tan gelen tarihe güvenilmez. */
  teacherSignedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Room {
  id: string;
  name: string;
  branchId: BranchId;
  capacity: number;
  instruments: Instrument[];
  /** ÖNCELİK 4 (devam) — pasife alma (hard delete YOK). Verilmezse (legacy) true varsayılır. */
  active?: boolean;
  archivedAt?: string;
}

export interface Lesson {
  id: string;
  studentId: string;
  teacherId: string;
  roomId: string;
  branchId: BranchId;
  instrument: Instrument;
  startAt: string;
  endAt: string;
  type: LessonType;
  status: "scheduled" | "in_progress" | "completed" | "cancelled" | "no_show";
  makeupRequestId?: string;
  /** Bu ders bir tekrarlayan seriden üretildiyse ait olduğu LessonSeries.id */
  seriesId?: string;
  /**
   * EPIC 8 (IMPLEMENTATION_PLAN.md) — "Dersi başlat"/"Dersi bitir" ile
   * damgalanan GERÇEK zaman damgaları (planlanan startAt/endAt'tan
   * bağımsız). Düzeltme yalnızca admin + zorunlu notla yapılabilir.
   */
  actualStartAt?: string;
  actualEndAt?: string;
  startCorrectedBy?: string;
  startCorrectionNote?: string;
  endCorrectedBy?: string;
  endCorrectionNote?: string;
  notes?: string;
  /**
   * Operasyonel bayraklar (Geldi / İşlendi / Telafi) — tek enum değil;
   * birlikte işaretlenebilir. Geldi dersi otomatik tamamlamaz.
   * İşlendi hakediş/rapor için tamamlanmış ders kaynağıdır.
   */
  studentAttended?: boolean;
  studentAttendedAt?: string;
  studentAttendedBy?: string;
  lessonProcessed?: boolean;
  lessonProcessedAt?: string;
  lessonProcessedBy?: string;
  opsMakeupFlag?: boolean;
  opsMakeupFlagAt?: string;
  opsMakeupFlagBy?: string;
  /**
   * Yoklama kapanışı — Gelmedi (mazeretsiz) / Mazeretli. Geldi/İşlendi/
   * Telafi ile AYNI birbirini dışlayan tek-statü mekanizmasının parçası
   * (bkz. switchLessonOpsFlag) — hiçbiri mali sonuç doğurmaz (Package B).
   */
  studentAbsent?: boolean;
  studentAbsentAt?: string;
  studentAbsentBy?: string;
  studentExcused?: boolean;
  studentExcusedAt?: string;
  studentExcusedBy?: string;
  /**
   * ÖNCELİK 4 — Yoklama Takvimi'nin 4. statüsü ("Kapalı", siyah). Telafi
   * gibi hiçbir mali sonuç doğurmaz. Yalnız Yoklama Takvimi ekranından set
   * edilir — Program/Yoklama'nın mevcut 3 butonlu hızlı aksiyonuna eklenmez.
   */
  opsClosedFlag?: boolean;
  opsClosedFlagAt?: string;
  opsClosedFlagBy?: string;
  /**
   * ÖNCELİK 4 (devam) — akademik dönem etiketi. undefined = legacy kayıt
   * (alan eklenmeden önce oluşturuldu); bkz. `resolveLessonAcademicPeriod`
   * (src/lib/attendance-calendar.ts) tarih tabanlı fallback için.
   */
  term?: StudentTermType;
  /** Akademik yılın başlangıç takvim yılı (ör. 2026 => "2026–2027 Güz"). */
  academicYearStart?: number;
  /**
   * İş 3 — bu ders, öğretmenin kendi bildirdiği çalışma saatleri DIŞINDA,
   * kullanıcının "Yine de planla" onayıyla oluşturuldu (bkz.
   * validateLessonSlot/OVERRIDABLE_SLOT_CODES). Yalnızca bu TEK durum için
   * geçerli — diğer tüm çakışma/uyumsuzluk türleri asla override edilemez,
   * bu yüzden bu bayrak "planlama onaylı ama riskli" anlamına gelir,
   * "herhangi bir kural atlandı" anlamına gelmez. Raporlanabilir olsun diye
   * kalıcı tutulur (ders taşınsa/güncellense bile geçmişte override
   * edildiği bilgisi silinmez — yalnızca yeni bir override olursa üzerine
   * yazılır).
   */
  availabilityOverride?: {
    by: string;
    at: string;
  };
  /**
   * Faz 2 — öğretmenin KENDİ derse gelip gelmediği. Öğrenci yoklamasından
   * (studentAttended/studentAbsent/studentExcused) TAMAMEN BAĞIMSIZ bir alan
   * kümesi — öğretmen performans skoru YALNIZCA buna bakar, öğrenci
   * yoklamasına asla bakmaz (bkz. src/lib/teacher-performance.ts). undefined
   * = "Bekliyor" (henüz işaretlenmedi); ayrı bir enum değeri gerekmez.
   */
  teacherAttendanceStatus?: "geldi" | "gelmedi" | "mazeretli";
  teacherAttendanceAt?: string;
  teacherAttendanceBy?: string;
  teacherAttendanceNote?: string;
}

export type LessonSeriesStatus = "active" | "ended" | "cancelled";

/**
 * Haftalık tekrarlayan ders serisi — "Ece her Salı 17:00'de piyano dersi
 * alacak" gibi dönemlik bir kaydın kaynağı. Dönem boyunca üretilen her
 * Lesson, `seriesId` ile bu kayda bağlanır. Seri asla fiziksel silinmez;
 * yalnızca `status` ile pasifleştirilir (ended/cancelled).
 */
export interface LessonSeries {
  id: string;
  studentId: string;
  teacherId: string;
  roomId: string;
  branchId: BranchId;
  instrument: Instrument;
  /** 0=Pazar ... 6=Cumartesi — Teacher.availability ile aynı kural */
  weekday: number;
  /** "HH:mm" */
  startTime: string;
  durationMinutes: number;
  /** ISO tarih — dönemin ilk günü */
  startsOn: string;
  /** ISO tarih — dönemin son günü (dahil) */
  endsOn: string;
  status: LessonSeriesStatus;
  createdAt: string;
  updatedAt: string;
  /** ÖNCELİK 4 (devam) — bkz. Lesson.term; seriden üretilen her Lesson bunu miras alır. */
  term?: StudentTermType;
  academicYearStart?: number;
  /** Faz 6 — demo/test amaçlı otomatik üretilmiş serileri işaretler. NULL = gerçek seri. */
  demoTag?: string;
}

export interface Attendance {
  id: string;
  lessonId: string;
  studentId: string;
  status: AttendanceStatus;
  reason?: string;
  markedAt: string;
  createsMakeupCredit: boolean;
}

export interface MakeupRequest {
  id: string;
  studentId: string;
  teacherId: string;
  branchId: BranchId;
  instrument: Instrument;
  sourceLessonId: string;
  attendanceId: string;
  status: MakeupStatus;
  reason: string;
  expiresAt: string;
  suggestedSlots: MakeupSlot[];
  confirmedLessonId?: string;
  createdAt: string;
  policyNote: string;
  /** EPIC 10 — onay/iptal/ret kararında zorunlu (uygulama katmanında), şemada opsiyonel. */
  decisionNote?: string;
  /** Kararı veren kullanıcının id'si */
  decidedBy?: string;
  /** ISO tarih */
  decidedAt?: string;
  /** ISO tarih — yalnızca onaylandığında set edilir (30 gün, onay anından itibaren) */
  slaDeadline?: string;
  /** 0=yok 1=15gün 2=7gün 3=3gün 4=1gün 5=aşıldı */
  slaEscalationLevel?: number;
}

export interface MakeupSlot {
  startAt: string;
  endAt: string;
  teacherId: string;
  roomId: string;
  branchId: BranchId;
  score: number;
  reasons: string[];
}

export type PaymentSource = "manual" | "lesson_ops" | "monthly_plan";

export interface Payment {
  id: string;
  studentId: string;
  amount: number;
  paidAmount: number;
  status: PaymentStatus;
  dueDate: string;
  paidAt?: string;
  description: string;
  method?: string;
  /** Otomatik ders bazlı tahsilatın kaynak dersi — manuel/paket ödemelerde yok. */
  lessonId?: string;
  /** "manual" (varsayılan) | "lesson_ops" (Geldi/İşlendi otomatik oluşturdu) */
  source?: PaymentSource;
  /**
   * ÖNCELİK 4 (devam) — bu kaydın SİSTEME kaydedildiği an ("Tutar kayıt
   * tarihi"). Opsiyonel: alan eklenmeden önce oluşturulmuş legacy kayıtlarda
   * yok — UI bu durumda dueDate'e düşer (bkz. attendance-calendar-panel.tsx).
   */
  createdAt?: string;
  /**
   * Paket 5 — "Ödendi işaretle" modalında yönetici tarafından girilen
   * isteğe bağlı açıklama/referans notu (dekont no, kim aldı vb.).
   * `description`'dan AYRI — description ödemenin AMACINI (ör. "Ekim
   * taksiti"), bu alan ise tahsilat ANINA dair serbest metni taşır.
   */
  paymentNote?: string;
  /**
   * Tahsilatı ALAN kullanıcının kalıcı kimliği — `markPaymentPaid` her
   * "ödendi" geçişinde (Ödemeler ekranı "Ödendi işaretle", Yoklama Takvimi
   * "Tahsil Et" VE ay kutusu Kaydet — TEK ortak yol) `ctx.userId`'den yazar.
   * Ödeme henüz tahsil edilmemişse (pending/overdue) veya bu alan
   * eklenmeden önce tahsil edilmişse (legacy) `undefined` olabilir — UI bu
   * durumda satırı hiç göstermez, hata vermez.
   */
  receivedByUserId?: string;
}

/**
 * EPIC 3 (IMPLEMENTATION_PLAN.md) — kesirli ders süresinin ödenecek dakikaya
 * nasıl çevrileceği:
 * - "exact_minutes" (varsayılan): gerçek dakika üzerinden.
 * - "round_30": her dersin süresi, öğretmen lehine 30 dakikalık dilime
 *   YUKARI yuvarlanır (ör. 35dk → 60dk, 65dk → 90dk).
 * - "fixed_package": gerçek süre yok sayılır, okulun standart ders süresi
 *   (`lessonDurationMinutes`) esas alınır.
 */
export type FeeRoundingMode = "exact_minutes" | "round_30" | "fixed_package";

export interface SchoolSettings {
  /** Multi-tenant id — set at seed / DB; never from client */
  tenantId: string;
  name: string;
  shortName: string;
  city: string;
  website: string;
  email: string;
  phone: string;
  logoUrl: string;
  makeupWindowDays: number;
  /**
   * Aylık öğrenci başına telafi hakkı (varsayılan 2). 0 = telafi kapalı.
   * pending/suggested/awaiting_info/confirmed sayılır; cancelled/expired sayılmaz.
   */
  monthlyMakeupAllowance?: number;
  lessonDurationMinutes: number;
  workingHours: { start: string; end: string };
  workingDays: number[];
  currency: string;
  branches: Branch[];
  feeRoundingMode: FeeRoundingMode;
  /** EPIC 1 — boşsa DEFAULT_COLLECTIONS_SETTINGS uygulanır. */
  collectionsSettings?: CollectionsSettings;
  /**
   * Paket 6 — dönem bazlı haftalık kapalı gün kuralı (ör. "Yazın Pazartesi
   * açık, hafta sonu kapalı; Güzün Pazartesi kapalı, hafta sonu açık").
   * Boşsa `src/lib/attendance-calendar.ts`'teki sabit varsayılanlar
   * (FALL_WEEKLY_CLOSED_DAYS/SUMMER_WEEKLY_CLOSED_DAYS — Güz: yalnız
   * Pazartesi, Yaz: Cts/Paz) kullanılır — mevcut okulların davranışı
   * DEĞİŞMEZ, yalnız artık yönetici tarafından özelleştirilebilir.
   * 0=Pazar..6=Cumartesi.
   */
  termWeeklyClosedDays?: { guz: number[]; yaz: number[] };
}

/**
 * Öğretmenin dakika başı ücreti. `branchId`/`instrument` verilmezse o alan
 * için "tüm şubeler"/"tüm enstrümanlar" anlamına gelir — bkz.
 * `resolveFeeRule` (src/lib/teacher-payout.ts) için spesifiklik önceliği.
 * Aynı kapsamda (teacherId+branchId+instrument) tarihi çakışan iki kural
 * aynı anda var olamaz.
 */
export interface TeacherFeeRule {
  id: string;
  teacherId: string;
  branchId?: BranchId;
  instrument?: Instrument;
  perMinuteRate: number;
  /** ISO tarih — bu tarihten itibaren (dahil) geçerli */
  effectiveFrom: string;
  /** ISO tarih — verilmezse açık uçlu; verilirse bu tarih dahil geçerli */
  effectiveTo?: string;
  createdAt: string;
}

/**
 * Bir dönem için öğretmene ödenecek/ödenen tutarın donmuş kaydı.
 * `totalMinutes`/`totalAmount` oluşturma anında hesaplanır ve `TeacherFeeRule`
 * sonradan değişse bile bir daha yeniden hesaplanmaz. `Payment` (öğrenci →
 * okul tahsilatı) ile hiçbir ilişkisi yoktur — bilinçli olarak ayrı bir
 * varlıktır.
 */
export interface TeacherPayout {
  id: string;
  teacherId: string;
  /** ISO tarih — dönemin ilk günü */
  periodStart: string;
  /** ISO tarih — dönemin son günü (dahil) */
  periodEnd: string;
  totalMinutes: number;
  totalAmount: number;
  status: "pending" | "paid";
  paidAt?: string;
  method?: string;
  generatedAt: string;
}

export interface AppData {
  settings: SchoolSettings;
  teachers: Teacher[];
  students: Student[];
  rooms: Room[];
  lessons: Lesson[];
  lessonSeries: LessonSeries[];
  attendances: Attendance[];
  makeupRequests: MakeupRequest[];
  payments: Payment[];
  teacherFeeRules: TeacherFeeRule[];
  teacherPayouts: TeacherPayout[];
  /**
   * ÖNCELİK 4 (devam) — Paket Yönetimi. Opsiyonel (required değil) —
   * mevcut birçok test fixture'ı elle AppData nesnesi kurar ve bu alanı
   * içermez; zorunlu yapmak ilgisiz onlarca dosyayı kırar. readData()
   * her zaman `data.packages ?? []` ile güvenli varsayılan uygular.
   */
  packages?: Package[];
  /**
   * Paket 5 — yüzde tabanlı kampanya/indirim kuralları (ör. "Kardeş
   * Kampanyası"). Opsiyonel — bkz. `packages?` üstteki not, aynı gerekçe.
   */
  discountCampaigns?: DiscountCampaign[];
  /** Faz 12 — insan-okunur numara sayaçları (öğrenci/öğretmen). Opsiyonel, aynı gerekçe (üstteki not). */
  entitySequences?: EntitySequenceRecord[];
}

/** Faz 12 — bkz. src/lib/entity-sequence.ts. */
export type EntityTypeForSequence = "student" | "teacher" | "staff";
export type EntitySequenceRecord = { tenantId: string; entityType: EntityTypeForSequence; nextValue: number };

export type DiscountCampaignKind = "sibling";

/**
 * Paket 5 — Paketler ekranındaki yüzde tabanlı kampanya/indirim kural
 * motoru. İlk tür: "sibling" (aynı veli telefonuna kayıtlı ikinci ve
 * sonraki öğrenciler). Aile/kardeş ilişkisi veri modelinde AYRI bir alan
 * olarak tutulmuyor — `Student.parentPhone` eşleşmesi pratik vekil (proxy)
 * olarak kullanılır (bkz. src/lib/discount-campaigns.ts).
 *
 * Kampanya şu an İÇİN otomatik olarak `monthlyFee`/Payment hesaplama
 * hattına bağlanmaz — mevcut per-student `discountType`/`discountValue`
 * (manuel, admin onaylı) mekanizmasının ÜZERİNE, adlandırılmış/denetlenebilir
 * bir referans kural ve önizleme sağlar. Otomatik uygulama, tüm ücret
 * motorunu (computeMonthlyFee, ödeme oluşturma) etkileyecek daha büyük ve
 * ayrı bir karar/iş kalemidir.
 */
export interface DiscountCampaign {
  id: string;
  name: string;
  kind: DiscountCampaignKind;
  /** 0-100 arası yüzde. */
  discountPercent: number;
  active: boolean;
  /** ISO tarih — verilmezse hemen başlar. */
  validFrom?: string;
  /** ISO tarih — verilmezse süresiz. */
  validTo?: string;
  /** Kurum/şube kapsamı — verilmezse tüm şubelerde geçerli. */
  branchId?: BranchId;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * EPIC 6B (IMPLEMENTATION_PLAN.md) — öğretmenin bir öğrenciye verdiği ödev.
 * `AppData`'nın dışında, standalone modül olarak tutulur (bkz.
 * src/lib/homework.ts) — Notification/Announcement/LessonAssessment ile
 * aynı desen.
 */
export interface Homework {
  id: string;
  teacherId: string;
  studentId: string;
  title: string;
  description: string;
  /** ISO tarih */
  dueDate: string;
  createdAt: string;
  updatedAt: string;
  /**
   * Paket 7 — öğretmenin ödevi verirken eklediği isteğe bağlı dosya/foto/
   * video (base64, `HomeworkSubmission` ile aynı desen). Liste/özet
   * fonksiyonları `fileData`'yı "1" ile değiştirip yalnızca "dosya var mı"
   * bilgisini taşır — indirme için ayrı, yetki kontrollü bir uç nokta
   * (getHomeworkFileTool) kullanılır.
   */
  fileName?: string;
  fileMimeType?: string;
  fileData?: string;
}

/**
 * Dosya içeriği küçük dosya/foto/kısa video için base64 olarak taşınır
 * (bkz. Homework modelinin şema yorumu). Erişim yalnızca oturum + sahiplik
 * kontrolüyle yapılan bir API rotası üzerinden yapılır, asla ham bir
 * herkese açık URL ile değil.
 */
export interface HomeworkSubmission {
  id: string;
  homeworkId: string;
  studentId: string;
  note?: string;
  fileName?: string;
  fileMimeType?: string;
  /** Yalnızca base64 gövde — yanıtlarda genelde eksiltilip yalnızca "dosya var mı" bilgisi taşınır. */
  fileData?: string;
  submittedAt: string;
  teacherFeedback?: string;
  reviewedAt?: string;
}

/**
 * EPIC 6B — öğretmenin öğrenci türü/enstrüman/seviyeye (EPIC 4 alanları)
 * hedefleyerek paylaştığı materyal/pratik videosu. Hedefleme alanlarının
 * HEPSİ undefined ise öğretmenin TÜM öğrencilerine görünür.
 */
export interface TeachingMaterial {
  id: string;
  teacherId: string;
  title: string;
  description: string;
  targetStudentType?: StudentType;
  targetInstrument?: Instrument;
  targetLevel?: string;
  fileName?: string;
  fileMimeType?: string;
  fileData?: string;
  createdAt: string;
}

/**
 * EPIC 6C (IMPLEMENTATION_PLAN.md) — veli/öğrencinin öğretmen hakkında
 * yapılandırılmış geri bildirimi. Kamuya açık ortalama/sıralama YOK.
 */
export type TeacherFeedbackStatus = "pending" | "reviewed" | "actioned" | "archived";

/** Zorunlu 1–5 kriterler — sabit anahtar seti (bkz. TEACHER_FEEDBACK_CRITERIA). */
export type TeacherFeedbackCriterionKey =
  | "clarity"
  | "communication"
  | "effectiveness"
  | "motivation"
  | "punctuality";

export type TeacherFeedbackContinuePreference = "yes" | "unsure" | "no";

export type TeacherFeedbackSourceType = "STUDENT" | "PARENT";

export interface TeacherFeedback {
  id: string;
  teacherId: string;
  studentId: string;
  submittedBy: string;
  /** Kaynak türü ayrımı — mevcut modelin submitterRole'ünden türetilir (STUDENT/PARENT). */
  submitterRole: string;
  scores: Record<TeacherFeedbackCriterionKey, number>;
  continueWithTeacher?: TeacherFeedbackContinuePreference;
  comment?: string;
  status: TeacherFeedbackStatus;
  /** Yönetici bu yorumu öğretmenin anonim özetinde paylaşmayı SEÇTİYSE true. */
  sharedWithTeacher: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Karşılıklı Değerlendirmeler sprinti — TeacherFeedback'in TERSİ yönü:
 * öğretmen öğrenciyi değerlendirir. Ham kayıt yalnızca yönetici ve ilgili
 * öğretmene açık (bkz. student-feedback.ts gizlilik notu).
 */
export type StudentFeedbackStatus = "pending" | "reviewed" | "actioned" | "archived";

export type StudentFeedbackCriterionKey = "attendance" | "practice" | "progress" | "attitude" | "preparedness";

export interface StudentFeedback {
  id: string;
  teacherId: string;
  studentId: string;
  submittedBy: string;
  scores: Record<StudentFeedbackCriterionKey, number>;
  comment?: string;
  status: StudentFeedbackStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Öğrenci müfredat/konu ilerleme (production follow-up).
 * Öğretmen konu hedefleri tanımlar; durum + 0–100 ilerleme.
 * overallPercent = konuların progressPercent ortalaması (eşit ağırlık).
 */
export type CurriculumTopicStatus = "planned" | "in_progress" | "mastered" | "deferred";

export type CurriculumTopicEvent = {
  at: string;
  byUserId: string;
  action: "created" | "updated" | "status_changed";
  note?: string;
  fromStatus?: CurriculumTopicStatus;
  toStatus?: CurriculumTopicStatus;
  fromProgress?: number;
  toProgress?: number;
};

export interface StudentCurriculumTopic {
  id: string;
  studentId: string;
  teacherId: string;
  title: string;
  description?: string;
  status: CurriculumTopicStatus;
  /** 0–100; overall student progress = average of topics */
  progressPercent: number;
  sortOrder: number;
  notes?: string;
  history: CurriculumTopicEvent[];
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}


// ─── PRODUCT_BACKLOG expansions ───────────────────────────

export type EducationMethod =
  | "Suzuki"
  | "Klasik"
  | "LCM"
  | "MEB"
  | "Kurum İçi"
  | "Diğer";

export const EDUCATION_METHODS: EducationMethod[] = [
  "Suzuki",
  "Klasik",
  "LCM",
  "MEB",
  "Kurum İçi",
  "Diğer",
];

export type LessonDurationPreference = 30 | 40 | 50;

export type StudentPaymentMethod = "credit_card" | "cash" | "transfer";

/**
 * Package C (`updateStudentPaymentProfileTool`, eski editör) "percent"/
 * "amount" yazar; Paket Yönetimi (`updateStudentProfileTool` genişletmesi,
 * `computeStudentMonthlyAmount`) "percentage"/"fixed" yazar — İKİ ayrı,
 * halen çalışan yazma yolu AYNI `Student.discountType` alanını paylaşıyor.
 * Birini diğerinin yerine koymak yerine (ikisi de test edilmiş/kullanımda)
 * kabul edilen değer kümesi BİLEREK birleştirildi (union); her yol yalnızca
 * KENDİ yazdığı sözlüğü okur/yorumlar, karışmaz.
 */
export type DiscountType = "percent" | "amount" | "percentage" | "fixed";

export type InstrumentLevel = "Başlangıç" | "Orta" | "İleri";

export type TeacherInstrumentSkill = {
  instrument: Instrument;
  level: InstrumentLevel;
};

export type SocialMediaConsentStatus =
  | "granted"
  | "denied"
  | "withdrawn"
  | "expired";

export type SocialMediaScope =
  | "photo"
  | "video"
  | "name"
  | "voice"
  | "website"
  | "instagram"
  | "other";

export interface SocialMediaConsentEvent {
  at: string;
  byUserId: string;
  action: string;
  note?: string;
}

/** PRODUCT_BACKLOG §1.4 — sosyal medya izni + audit tarihçesi */
export interface SocialMediaConsent {
  id: string;
  studentId: string;
  status: SocialMediaConsentStatus;
  representativeName: string;
  relationship: string;
  grantedAt: string;
  scopes: SocialMediaScope[];
  sourceDocumentRef?: string;
  withdrawnAt?: string;
  history: SocialMediaConsentEvent[];
  createdAt: string;
  updatedAt: string;
}

/**
 * ÖNCELİK 4 (devam) — Yönetilebilir Enstrüman Kataloğu. Sabit `Instrument`
 * TS union'ının (yukarıda) yerini almaz — kurumun o kümenin ÜSTÜNE
 * ekleyebileceği ek enstrümanları tutar (ör. Bas Gitar, Ukulele). Hard
 * delete yok; `status:"archived"` ile pasife alınır.
 */
export type InstrumentCatalogStatus = "active" | "archived";

export interface InstrumentCatalogEntry {
  id: string;
  name: string;
  status: InstrumentCatalogStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Personel Modülü — öğretmen DIŞI personel (idari, muhasebe, resepsiyon vb.)
 * için genel amaçlı bir kayıt. Bilinçli olarak Teacher'dan AYRI: Teacher
 * zaten kendi ders/hakediş/enstrüman iş akışına sahip, bunu genişletmek
 * yerine ayrı, sade bir "kişi + rol + iletişim + şube + durum" modeli
 * kuruldu — ileride ör. bir muhasebe modülü StaffMember.id'yi foreign key
 * olarak referans alabilir (bkz. instrument-catalog.ts ile aynı desen:
 * atomic JSON dosyası json/memory modda, Prisma tablosu db modda). Hard
 * delete yok; `status:"passive"` ile pasife alınır.
 */
/**
 * İş 3 — "active" öğretmen modelindeki gibi tek bir "aktif" bayrağı değil,
 * gerçek özlük durumu (izinliyken listede görünür kalmalı ama farklı
 * işaretlenmeli). Hard delete hâlâ yok: "terminated" (ayrıldı) de bir
 * silme değil, kalıcı bir durumdur — audit/bordro geçmişi korunur.
 */
export type StaffMemberStatus = "active" | "on_leave" | "passive" | "terminated";
export type StaffEmploymentType = "full_time" | "part_time" | "contract" | "intern";

export interface StaffMember {
  id: string;
  /** Faz 12 — insan-okunur, değişmez kurum numarası (ör. "P00001"). */
  displayId?: string;
  name: string;
  /** Serbest metin — "Muhasebe", "Resepsiyon", "İdari İşler" vb. Sabit bir enum'a kilitlenmez. */
  position: string;
  phone?: string;
  email?: string;
  address?: string;
  birthDate?: string;
  photoUrl?: string;
  /** AES-GCM şifreli — bkz. src/lib/pii/tc-identity.ts, Student.nationalIdCipher ile AYNI mekanizma. */
  nationalIdCipher?: string;
  nationalIdLast2?: string;
  employeeNumber?: string;
  hireDate?: string;
  terminationDate?: string;
  department?: string;
  /** Başka bir StaffMember.id — raporlama/yönetici ilişkisi. Döngü kontrolü UI/tool katmanında yapılır. */
  reportsToStaffId?: string;
  employmentType?: StaffEmploymentType;
  branchId?: BranchId;
  status: StaffMemberStatus;
  /**
   * Yıllık izin bakiyesi (gün) — yasal hesaplama motoru DEĞİL, kurumun
   * kendi belirlediği/güncellediği basit bir sayı (bkz. LeaveRequest).
   */
  annualLeaveAllowanceDays?: number;
  /** Yalnız admin/super admin görünürlüğünde — bkz. canViewStaffSensitive. */
  personnelNotes?: string;
  notes?: string;
  /**
   * Maaş yapısı — öğretmen hakedişinden (Teacher/TeacherFeeRule) BİLİNÇLİ
   * olarak ayrı (bkz. PayrollRecord yorumu). Yalnızca hassas bordro
   * yetkisi olan roller (bkz. canViewStaffPayroll) görebilir/düzenleyebilir.
   */
  monthlySalary?: number;
  hourlyRate?: number;
  defaultBonus?: number;
  defaultAllowances?: number;
  defaultDeductions?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type PayrollStatus = "draft" | "pending_approval" | "approved" | "paid" | "cancelled";

/**
 * Aylık bordro kaydı — TEK kaynak StaffMember bordrosu için; öğretmenlerin
 * ders bazlı hakedişi (TeacherPayout) burada YOK, kasıtlı olarak ayrı
 * tutulur (bkz. dosya başı yorumu — "öğretmenlerin ders bazlı
 * hakedişlerini otomatik olarak genel personel maaşına yanlışlıkla dahil
 * etme"). staffId bir öğretmene karşılık gelen bir StaffMember DEĞİLDİR —
 * öğretmenler bu modülde ayrı bir kayıt olarak temsil edilmez.
 */
export interface PayrollRecord {
  id: string;
  staffId: string;
  /** yyyy-MM */
  month: string;
  grossAmount: number;
  netAmount: number;
  extraPayment?: number;
  deduction?: number;
  status: PayrollStatus;
  paymentDate?: string;
  paymentMethod?: string;
  note?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type LeaveType = "annual" | "sick" | "unpaid" | "other";
export type LeaveStatus = "draft" | "pending_approval" | "approved" | "rejected";

export interface LeaveRequest {
  id: string;
  staffId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  /** Saf hesaplama — hafta sonu/tatil düşülmez (bilinçli basit tutuldu, bkz. dosya başı yorumu). */
  dayCount: number;
  description?: string;
  status: LeaveStatus;
  approvedBy?: string;
  approvedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Kurum sahibi mali dashboard'u — henüz izlenmeyen gider türleri (kira,
 * fatura, sarf malzemesi, diğer). Bordro (PayrollRecord) ve öğretmen
 * hakedişi (TeacherPayout) BURADA TEKRARLANMAZ — dashboard bu ikisini
 * kendi tablolarından toplar, ExpenseRecord yalnızca ÖNCEDEN HİÇBİR
 * YERDE tutulmayan gider türleri içindir.
 */
export type ExpenseCategory = "rent" | "utilities" | "supplies" | "other";

export interface ExpenseRecord {
  id: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  note?: string;
  createdBy: string;
  createdAt: string;
}

export type ClosedDayKind = "public_holiday" | "custom";

/** PRODUCT_BACKLOG §4.2 — kapalı gün (resmî tatil veya özel) */
export interface ClosedDay {
  id: string;
  date: string; // yyyy-MM-dd
  name: string;
  kind: ClosedDayKind;
  /** false (varsayılan) = bu tarihi KAPALI yapar; true = zorla AÇIK yapar. */
  isOpen: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type TrialLessonStatus =
  | "planned"
  | "attended"
  | "considering"
  | "awaiting_enrollment"
  | "will_continue"
  | "will_not_continue"
  | "cancelled";

/** PRODUCT_BACKLOG §5 — deneme dersi (öğrenciden ayrı pipeline) */
export interface TrialLesson {
  id: string;
  name: string;
  phone: string;
  instrument: Instrument;
  branchId: BranchId;
  teacherId: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  status: TrialLessonStatus;
  convertedStudentId?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type DocumentTemplateKind =
  | "student_enrollment_contract"
  | "parent_social_media_consent"
  | "kvkk"
  | "teacher_contract"
  | "teacher_info_form"
  | "trial_form"
  | "makeup_request"
  | "payment_commitment"
  | "petition"
  | "custom";

/** Evraklar — kategori (kind) seçenekleri, tek kaynak (belge yükleme/filtre UI'ları buradan besler). */
export const DOCUMENT_TEMPLATE_KINDS: DocumentTemplateKind[] = [
  "student_enrollment_contract",
  "parent_social_media_consent",
  "kvkk",
  "teacher_contract",
  "teacher_info_form",
  "trial_form",
  "makeup_request",
  "payment_commitment",
  "petition",
  "custom",
];

export type DocumentInstanceStatus =
  | "draft"
  | "printed"
  | "sent_for_signature"
  | "signed"
  | "uploaded"
  | "cancelled"
  | "expired";

export interface DocumentTemplate {
  id: string;
  kind: DocumentTemplateKind;
  name: string;
  bodyHtml: string;
  active: boolean;
  /** Şablonu oluşturan yönetici — varsayılan (otomatik seed) şablonlarda yok. */
  createdById?: string;
  /** Her güncellemede +1 — "oluşturma/versiyon bilgisi" gereksinimi. */
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** PRODUCT_BACKLOG §6 — evrak örneği; aynı basımda referans korunur */
export interface DocumentInstance {
  id: string;
  templateId: string;
  kind: DocumentTemplateKind;
  /** Benzersiz referans — yeniden basımda aynı kalır */
  reference: string;
  status: DocumentInstanceStatus;
  studentId?: string;
  teacherId?: string;
  trialLessonId?: string;
  branchId?: BranchId;
  /** Otomatik + elle alanlar */
  fieldValues: Record<string, string>;
  renderedHtml?: string;
  printCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** İmzalı/taranmış sürüm (GÜNCEL/aktif olan) — yüklenince status "uploaded" olur. */
  fileName?: string;
  fileMimeType?: string;
  fileData?: string;
  fileSize?: number;
  signedUploadedAt?: string;
  /** İmzalı sürümü yükleyen sorumlu (kural E — "imzalanma tarihi/sorumlusu kaydedilsin"). */
  signedBy?: string;
  /**
   * İmzalı sürüm YÜKLEME geçmişi (metadata) — her yükleme yeni bir kayıt
   * ekler, ÜZERİNE YAZMAZ. `deletedAt` set edilmiş kayıt soft-delete'tir.
   * Yalnızca METADATA tutulur (fileName/fileMimeType/fileSize/uploadedAt/
   * uploadedBy) — eski sürümlerin ham dosya baytı AYRICA saklanmaz (yeni
   * ağır depolama katmanı eklememek için bilinçli sınır); "güncel" sürümün
   * ham verisi yukarıdaki `fileData` alanındadır.
   */
  signedVersions?: DocumentSignedVersion[];
}

export type DocumentSignedVersion = {
  id: string;
  fileName: string;
  fileMimeType: string;
  fileSize: number;
  uploadedAt: string;
  uploadedBy: string;
  deletedAt?: string;
};

/** MEB seviye 1–8; LCM serbest; diğer türlerde yok */
export function isMebStudentType(t?: StudentType): boolean {
  return t === "MEB";
}

export function isLcmStudentType(t?: StudentType): boolean {
  return t === "London College of Music Hazırlık";
}

/**
 * Faz 1B — öğrenci artık BİRDEN FAZLA türe sahip olabilir; bu fonksiyonlar
 * "atanmış türlerden HERHANGİ biri X mi?" sorusunu yanıtlar. Bir öğrenci
 * MEB + başka bir tür taşıyorsa MEB'in daha KATI kuralı (seviye zorunlu)
 * her zaman kazanır — bkz. studentLevelRequired.
 */
export function hasMebStudentType(types: StudentType[]): boolean {
  return types.some(isMebStudentType);
}

export function hasLcmStudentType(types: StudentType[]): boolean {
  return types.some(isLcmStudentType);
}

export function studentLevelVisible(types: StudentType[]): boolean {
  return hasMebStudentType(types) || hasLcmStudentType(types);
}

export function studentLevelRequired(types: StudentType[]): boolean {
  return hasMebStudentType(types);
}

/**
 * İş Takip modülü (insan-odaklı operasyon görev takibi — `/panel/is-takip`,
 * `/ogretmen/is-takip`). `/panel/workflows` (AI otomasyonu) ile İLGİSİZ,
 * tamamen ayrı bir modül. Kalıcılık `src/lib/tasks.ts`'te (AppData'nın
 * DIŞINDA, `teacher-availability.ts` ile aynı desende: STORE_MODE=db →
 * Prisma Task/TaskChecklistItem/TaskComment/TaskActivity, json/memory →
 * dosya tabanlı store) — additive, mevcut AppData şemasına dokunmaz.
 */
export type TaskStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED" | "CANCELLED" | "ARCHIVED";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TaskCategory =
  | "Kayıt"
  | "Eğitim"
  | "Tahsilat"
  | "Veli İletişimi"
  | "Öğretmen"
  | "Program"
  | "Evrak"
  | "Teknik";

export const TASK_STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED", "ARCHIVED"];
export const TASK_PRIORITIES: TaskPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
/** İş Takip önceliklerinin Türkçe görünen adı — enum değeri (LOW/MEDIUM/...) hiçbir UI'da ham gösterilmemeli. */
export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: "Düşük",
  MEDIUM: "Orta",
  HIGH: "Yüksek",
  URGENT: "Acil",
};
export const TASK_CATEGORIES: TaskCategory[] = [
  "Kayıt",
  "Eğitim",
  "Tahsilat",
  "Veli İletişimi",
  "Öğretmen",
  "Program",
  "Evrak",
  "Teknik",
];

/** Görevin "hâlâ açık" (kapanmamış) sayılan statüleri — KPI/filtre için tek kaynak. */
export const OPEN_TASK_STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "BLOCKED"];

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  category: TaskCategory;
  /**
   * Sorumlu/takipçi kimliği: bir Teacher.id (öğretmen personel) VEYA bir
   * ctx.userId (admin/yönetici) olabilir — bu sistemde bağımsız, listelenebilir
   * bir "personel/kullanıcı dizini" henüz yok (yalnızca Teacher kayıtları +
   * sabit bootstrap kimlikleri var, bkz. src/lib/auth/users.ts). "Bu görev
   * bana mı ait" kontrolü bu yüzden `assigneeId === ctx.teacherId ||
   * assigneeId === ctx.userId` ile yapılır (bkz. tasks.ts isTaskOwnedByActor).
   */
  assigneeId?: string;
  followerIds: string[];
  createdById: string;
  startDate?: string;
  dueDate?: string;
  completedAt?: string;
  cancelledAt?: string;
  archivedAt?: string;
  progressPercent: number;
  tags: string[];
  studentId?: string;
  teacherId?: string;
  branchId?: BranchId;
  lessonId?: string;
  paymentId?: string;
  documentId?: string;
  /**
   * Genel ilişkili-kayıt bağlantısı — yukarıdaki özel FK alanlarının (studentId
   * vb.) kapsamadığı ilişki tipleri için (örn. "makeup", "lessonCorrection").
   * `relatedEntityLabel` oluşturma anında alınan denormalize bir görüntü
   * etiketidir; kayıt sonradan silinse/değişse bile bağlam kaybolmaz.
   */
  relatedEntityType?: RelatedEntityType;
  relatedEntityId?: string;
  relatedEntityLabel?: string;
  createdAt: string;
  updatedAt: string;
}

/** Bağlamsal "Görev oluştur" aksiyonunun desteklediği ilişkili kayıt tipleri. */
export type RelatedEntityType =
  | "student"
  | "teacher"
  | "payment"
  | "document"
  | "makeup"
  | "lessonCorrection"
  | "branch";

export interface TaskChecklistItem {
  id: string;
  taskId: string;
  title: string;
  isCompleted: boolean;
  sortOrder: number;
  completedAt?: string;
  completedById?: string;
  /** Soft-archive — hard delete yok (bkz. modül gereksinimi). */
  archivedAt?: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
  authorId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  /** Soft delete — hard delete yok. */
  deletedAt?: string;
}

/** İş Takip Faz 3B-2A — göreve dosya veya link eki. */
export type TaskAttachmentType = "FILE" | "LINK";

export interface TaskAttachment {
  id: string;
  taskId: string;
  type: TaskAttachmentType;
  /** Görünen ad — kullanıcı tarafından girilir, dosya adından bağımsız. */
  title: string;
  /** Yalnızca `type === "LINK"` — http/https, doğrulanmış. */
  url?: string;
  /** Yalnızca `type === "FILE"` — ham dosya baytı ASLA bu tipte yer almaz (bkz. getTaskAttachmentFileTool). */
  fileName?: string;
  fileMimeType?: string;
  fileSize?: number;
  createdById: string;
  createdAt: string;
  /** Soft delete — hard delete yok (yorum deseniyle aynı). */
  deletedAt?: string;
}

export type TaskActivityAction =
  | "created"
  | "field_updated"
  | "status_changed"
  | "priority_changed"
  | "category_changed"
  | "assignee_changed"
  | "follower_added"
  | "follower_removed"
  | "date_changed"
  | "checklist_added"
  | "checklist_updated"
  | "checklist_removed"
  | "comment_added"
  | "comment_updated"
  | "attachment_added"
  | "attachment_removed"
  | "completed"
  | "cancelled"
  | "archived"
  | "reopened";

export interface TaskActivity {
  id: string;
  taskId: string;
  actorId: string;
  action: TaskActivityAction;
  /** İnsan-okur Türkçe özet, ör. "Durum: TODO → IN_PROGRESS" — ham/hassas veri yok. */
  summary: string;
  createdAt: string;
}

