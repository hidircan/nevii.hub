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
  /** Kaydı açan kullanıcı. Eski kayıtlarda yok. */
  createdByUserId?: string;
  /** ÖNCELİK 4 (devam) — arşivleme (hard delete YOK); `active:false` ile birlikte set edilir. */
  archivedAt?: string;
  /** 2026-10-03 — listeden kaldırıldı (geri alınabilir silme). Satır geçmiş kayıtlar için kalır; bkz. deleteTeacherTool. */
  deletedAt?: string;
  deletedByUserId?: string;
  deletionReason?: string;
  /** 2026-10-15 — kalıcı silindi; korunan geçmiş için anonimleştirilerek tutuluyor (bkz. person-purge.ts). Geri alınamaz. */
  purgedAt?: string;
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
    | "branchId"
    | "branchIds"
    | "birthDate"
    | "nationalIdCipher"
    | "nationalIdLast2"
    | "address"
    | "highSchool"
    | "university"
    | "graduationYear"
    | "maxDailyLessons"
    | "contractStartDate"
    | "contractEndDate"
    | "employmentType"
    | "hireDate"
    | "terminationDate"
    | "emergencyContactName"
    | "emergencyContactPhone"
    | "personnelNotes"
    | "weeklyHoursThreshold"
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

/**
 * 2026-10-04 — öğrencinin bir EĞİTİM kaydı (tek öğrenci kimliği, N eğitim). Enstrüman ile öğretmen aynı
 * kayıtta tutulur — hangi öğretmenin hangi eğitimi verdiği açıktır. Öğretmen değişince yalnız bu kayıt
 * değişir; geçmiş derslerin `teacherId`'si DEĞİŞMEZ. Eğitim silinmez, `active=false` ile kapanır.
 */
export interface StudentEnrollment {
  id: string;
  instrument: Instrument;
  teacherId?: string;
  branchId?: BranchId;
  lessonDurationMinutes?: number;
  weeklyLessonCount?: number;
  active: boolean;
  /** Birincil eğitim — öğrencinin eski tekil alanları (teacherId/lessonDurationMinutes) bunu yansıtır. */
  primary?: boolean;
  startDate?: string;
  endDate?: string;
  createdAt: string;
  updatedAt?: string;
  /**
   * 2026-10-09 — BRANŞ KOŞULLARI (ek branş kayıtları için). Birincil kaydın koşulları ÖĞRENCİ satırındaki eski
   * alanlarda durur (studentTypes, monthlyFee, packageId…); ek kaydın koşulları yalnız burada — birinin değişmesi
   * diğerini ezmez. Okuma TEK kapıdan: `enrollmentTerms` (student-enrollments.ts).
   */
  studentTypes?: StudentType[];
  packageId?: string;
  packageName?: string;
  monthlyFee?: number;
  packageBaseMonthlyFee?: number;
  discountType?: DiscountType;
  discountValue?: number;
  monthlyFeeManualOverride?: boolean;
  monthlyFeeOverrideReason?: string;
  derivedPerLessonAmount?: number;
  paymentMethod?: StudentPaymentMethod;
  paymentDueDay?: number;
  lessonStartDate?: string;
  lessonScheduleText?: string;
  intendedDurationMonths?: number;
  /** Sonlandırma izi (kayıt silinmez; `active:false` + `endDate`). */
  endReason?: string;
  endedByUserId?: string;
  /**
   * 2026-10-10 — SÜRÜM 2: bu kayıt KENDİ koşullarının tek sahibidir (öğrenci türü, ücret, ödeme, tarih, program, seviye
   * ve MEB bilgileri). Öğrenci satırındaki aynı adlı alanlar yalnız UYUMLULUK AYNASIDIR (bkz. student-enrollments.ts
   * `mirrorPatchFromEnrollments`) ve hiçbir branşın koşulunun kaynağı değildir. Alan yoksa kayıt eski (v1/legacy)
   * düzendedir: ana kaydın koşulları öğrenci satırında durur ve okuma tek kapıdan (`enrollmentTerms`) yapılır.
   */
  termsVersion?: 2;
  /** Ödeme günü aralıkları (v2) — tekil `paymentDueDay` geriye uyum için korunur. */
  paymentDueRanges?: PaymentDueRange[];
  /** Kayıtta uygulanan kampanya kimlikleri (kampanya raporu branş başına sayar). */
  appliedCampaignIds?: string[];
  /** Seviye: MEB branşında 1–8, diğerlerinde serbest metin. Branşa özgüdür (aynı kişi Piyano 3., Keman 1. seviyede olabilir). */
  level?: string;
  targetExam?: string;
  /** MEB dönem/sınav bilgileri — BRANŞA özgüdür; kişi düzeyindeki kimlik/belgelerle karıştırılmaz. */
  mebLevelStartDate?: string;
  mebLevelEndDate?: string;
  mebExamDate?: string;
  mebExamAttended?: boolean;
  /** Yeni öğrenci kaydını oluşturan gönderimin kimliği — çift tık/yeniden deneme koruması (bkz. store.registerStudent). */
  registrationId?: string;
}

export interface Student {
  /** 2026-10-04 — eğitim kayıtları; yoksa eski tek eğitim (bkz. student-enrollments.ts effectiveEnrollments). */
  enrollments?: StudentEnrollment[];
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
  /**
   * P1 revizyonu — "Bizi nereden buldunuz?" Öğrenci kaydıyla kalıcı
   * saklanır, detay ekranında görüntülenir. Opsiyonel; `diger` seçilirse
   * serbest metin `referralSourceDetail` dolar. Kanonik değerler
   * REFERRAL_SOURCES (aşağıda) — DB'de ham değer saklanır.
   */
  referralSource?: ReferralSource;
  referralSourceDetail?: string;
  branchId: BranchId;
  instruments: Instrument[];
  teacherId: string;
  packageName: string;
  weeklyLessonCount: number;
  monthlyFee: number;
  active: boolean;
  notes: string;
  createdAt: string;
  /** Kaydı açan kullanıcı. Eski kayıtlarda yok — audit'ten backfill edilebilir. */
  createdByUserId?: string;
  /** Denemeden dönüştüyse kaynak TrialLesson.id ve dönüşümü onaylayan kullanıcı. */
  convertedFromTrialId?: string;
  convertedByUserId?: string;
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
  /**
   * ISO tarih — KAYIT tarihi (öğrencinin sisteme kaydedildiği gün).
   *
   * P0 (2026-09-05) — DİKKAT: bu alan artık ders başlangıcı DEĞİLDİR.
   * Öğrenci bugün kaydolup dersleri ileri bir tarihte başlatabilir; ders
   * başlangıcı ayrı `lessonStartDate` alanıdır ve ilk tahsilat/ders sayımı
   * O tarihten itibaren hesaplanır (bkz. resolveLessonStartDay).
   */
  enrollmentStartDate?: string;
  /**
   * ISO tarih — DERSLERİN fiilen başladığı gün. Kayıt tarihinden BAĞIMSIZ
   * seçilir. Verilmezse kayıt tarihi kullanılır (eski kayıtlar ve bu alanı
   * hiç göndermeyen çağıranlar için geriye dönük uyum — davranış değişmez).
   * İlk tahsilat, YALNIZCA bu tarihten itibaren gerçekleşen planlı dersleri
   * sayar; bu tarihten ÖNCEKİ günler asla faturalandırılmaz.
   */
  lessonStartDate?: string;
  /** Kayıtta seçilen sözleşme süresi (ay, 1-12) — Sözleşme Merkezi ön-doldurmasının kalıcı kaynağı. */
  intendedDurationMonths?: number;
  /**
   * K (2026-09-20) — KAYITTA SEÇİLEN DERS GÜN/SAATLERİ, kalıcı.
   *
   * KÖK NEDEN: Yeni öğrenci kaydında ders günü (ve artık saati) soruluyordu,
   * ilk tahsilat tutarı bundan hesaplanıyordu — ama değer HİÇBİR YERE
   * YAZILMIYORDU (`createStudentTool` içinde `lessonDays: _ignoredLessonDays`
   * ile bilinçli olarak süzülüyordu). Sonuç: kullanıcı aynı bilgiyi önce
   * kayıtta, sonra sözleşmede, sonra Ders Programı'nda ÜÇ KEZ giriyordu ve
   * üçü birbirini doğrulamıyordu.
   *
   * Artık tek kaynak burasıdır: Sözleşme Merkezi'nin "Ders günü/saati" alanı
   * ve sözleşmeden ders programı üretme akışı bunu okur.
   * Biçim: `"Salı 15:00, Perşembe 16:00"` (bkz. lesson-schedule-text.ts —
   * `composeLessonScheduleText`; kurum saat dilimindeki DUVAR saatidir).
   */
  lessonScheduleText?: string;
  /** ISO tarih — verilmezse açık uçlu (hâlâ kayıtlı) */
  enrollmentEndDate?: string;
  level?: string;
  /** Hedef sınav / performans dönemi — serbest metin */
  targetExam?: string;
  /**
   * MEB Paneli — MEB seviye dönemi başlangıç/bitiş (ISO date-only
   * "YYYY-MM-DD"). Genel `enrollmentStartDate`/`lessonStartDate`/
   * `enrollmentEndDate` alanlarından AYRI iş bilgisidir; oraya ASLA
   * yazılmaz. MEB seçili değilse yazılmaz; tür kaldırılınca SİLİNMEZ
   * (kolon korunur, UI gizler — tekrar seçilince geri gelir).
   */
  mebLevelStartDate?: string;
  mebLevelEndDate?: string;
  /**
   * MEB sınav tarihi (opsiyonel) + tri-state katılım: undefined =
   * "Bilinmiyor", false = "Girmedi", true = "Girdi". Geçmiş kayıtlara
   * "Girdi" varsayımı YOK; "Girdi" tarih ister, gelecek tarihi reddeder
   * (bkz. src/lib/meb.ts).
   */
  mebExamDate?: string;
  mebExamAttended?: boolean;
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
  /**
   * Paket & Kampanya Motoru — kayıtta uygulanan kampanyaların id'leri
   * (`resolveCampaignStack` çıktısı). Kampanya raporu ve kullanım sayacı bu
   * alandan beslenir. Eski kayıtlarda undefined — rapor "kampanyasız" gösterir.
   */
  appliedCampaignIds?: string[];
  /**
   * P0-1 (2026-09-02 düzeltme) — yöneticinin girmediği, SİSTEMİN
   * `derivePerLessonAmount(monthlyFee, weeklyLessonCount)` ile ürettiği
   * hesaplama snapshot'ı (tam sayı TL). Yoksa (undefined) bu öğrenci
   * ESKİ/legacy kayıttır — `monthlyFee` düz aylık ücret olarak kullanılmaya
   * devam eder, hiçbir dönemsel oran uygulanmaz. Bu alan asla client
   * girdisi DEĞİLDİR (bkz. validation.ts studentSchema notu) — yalnız
   * `createStudentTool` her yeni kayıtta otomatik yazar.
   */
  derivedPerLessonAmount?: number;
  firstLessonAt?: string;
  /** Soft-archive; hard delete yok */
  archivedAt?: string;
  /**
   * Geri alınabilir silme (2026-09-22, yalnız SUPER_ADMIN). Doluysa öğrenci
   * varsayılan listelerden kaybolur; finansal/hukuki kayıtlar ve audit korunur.
   */
  deletedAt?: string;
  deletedByUserId?: string;
  deletionReason?: string;
  /** 2026-10-15 — kalıcı silindi; korunan finans/hakediş geçmişi için anonimleştirilerek tutuluyor. Geri alınamaz. */
  purgedAt?: string;
  /** ÖNCELİK 4 — Yoklama Takvimi dönemi. Boşsa "guz" varsayılır. */
  termType?: StudentTermType;
  /**
   * ÖNCELİK 4 (devam) — Paket Yönetimi. Additive: yoksa (legacy) `packageName`
   * serbest metniyle görünmeye devam eder — bkz. src/lib/packages.ts.
   */
  packageId?: string;
  birthPlace?: string;
  schoolOrOccupation?: string;
  /**
   * Nilüfer Acar politikası §1E — yetkili personelin gecikmiş ödeme nedeniyle
   * bilinçli kararıyla ders programını geçici durdurması. Otomatik SET
   * EDİLMEZ — yalnızca pauseStudentLessonScheduleTool/reactivate...Tool
   * yazar. `active` (kayıt/enrollment durumu) İLE AYNI ALAN DEĞİLDİR.
   */
  paymentPauseStatus?: "paused";
  paymentPausedAt?: string;
  paymentPauseReason?: string;
  paymentPausedBy?: string;
}

/**
 * DB egress (2026-10-18) — çok-öğrencili dilimlerin (referans/ders penceresi/telafi/panel özeti) öğrenci satırı:
 * yalnız tek-öğrenci ekranlarının (detay, sözleşme, düzenleme) okuduğu kolonlar SQL'de okunmaz (prod'da satırın
 * ~%25'i). `notes` zorunlu alan olduğu için `StudentRef` → `Student` ATANAMAZ (tam öğrenci bekleyen yardımcı derlenmez).
 * AMA `Pick<Student, …>` gibi opsiyonel alan kabul eden parametreler bunu YAKALAMAZ (eksik opsiyonel alan geçerlidir):
 * listeye kolon eklemeden önce `StudentRef`'i geçici olarak `& { readonly [P in Omitted]-?: { __omitted: true } }` ile
 * değiştirip `tsc` çalıştırın; dilim üreticileri dışındaki her hata gerçek bir okumadır (2026-10-18: TermsStudent
 * indirim/MEB alanlarını okuduğu için onlar listede DEĞİL). Bu alanlardan birine ihtiyaç varsa tek satır okuyun.
 */
export const REFERENCE_STUDENT_OMIT = [
  "notes", "address", "nationalIdCipher", "nationalIdLast2", "motherName", "fatherName", "referralSource",
  "referralSourceDetail", "specialNotes", "deletedByUserId", "deletionReason", "birthPlace", "schoolOrOccupation",
  "paymentPauseReason", "paymentPausedBy", "paymentPausedAt",
] as const satisfies readonly (keyof Student)[];
export type StudentRef = Omit<Student, (typeof REFERENCE_STUDENT_OMIT)[number]>;
/** `students` alanı `StudentRef[]` olan veri şekli — dar dilimleri kabul eden yardımcıların parametresi. */
export type WithStudentRefs<T extends { students?: unknown }> = Omit<T, "students"> & { students: StudentRef[] };

/** null = reactivate (tüm alanlar temizlenir). */
export type StudentPaymentPauseState = { reason: string; pausedBy: string; pausedAt: string } | null;

/** ÖNCELİK 4 — Yoklama Takvimi'nin gösterdiği ay aralığını belirler. */
export type StudentTermType = "guz" | "yaz";

/**
 * P1 revizyonu — "Bizi nereden buldunuz?" kanonik kaynak listesi.
 * TEK kaynak: kayıt formu seçenekleri, doğrulama ve detay görünümü
 * buradan beslenir (etiketler REFERRAL_SOURCE_LABELS).
 */
export const REFERRAL_SOURCES = ["instagram", "google", "tavsiye", "referans", "afis_etkinlik", "diger"] as const;
export type ReferralSource = (typeof REFERRAL_SOURCES)[number];
export const REFERRAL_SOURCE_LABELS: Record<ReferralSource, string> = {
  instagram: "Instagram",
  google: "Google/İnternet araması",
  tavsiye: "Veli/öğrenci tavsiyesi",
  referans: "Referans",
  afis_etkinlik: "Afiş/etkinlik",
  diger: "Diğer",
};

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
  /** Paket & Kampanya Motoru — kurum bazında okunabilir numara (ör. "PKT-001"). NULL = motor öncesi eski kayıt. */
  displayId?: string;
  title: string;
  description?: string;
  /** Boş/undefined = tüm şubelerde geçerli. */
  applicableBranchIds?: BranchId[];
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
  /** Paket & Kampanya Motoru — oluşturan kullanıcı (User.id). Eski kayıtlarda undefined. */
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

/** EPIC 4 — öğrenci eğitim profili alanları, tek bir yerden güncellenir. */
export type StudentProfilePatch = Partial<
  Pick<
    Student,
    /** 2026-10-04 — yalnız upsertStudentEnrollmentTool yazar (birincil alanlarla birlikte senkron). */
    | "enrollments"
    | "lessonDurationMinutes"
    /** Yalnız toplu işlem (bulkStudentActionTool) yazar — tekil detay ekranı MT-003 gereği değiştirmez. */
    | "teacherId"
    | "instruments"
    | "name"
    | "email"
    | "branchId"
    | "studentType"
    | "studentTypes"
    | "enrollmentStartDate"
    | "lessonStartDate"
    | "intendedDurationMonths"
    | "lessonScheduleText"
    | "enrollmentEndDate"
    | "level"
    | "targetExam"
    | "mebLevelStartDate"
    | "mebLevelEndDate"
    | "mebExamDate"
    | "mebExamAttended"
    | "specialNotes"
    | "communicationOptOut"
    | "phone"
    | "parentName"
    | "parentPhone"
    | "motherName"
    | "fatherName"
    | "referralSource"
    | "referralSourceDetail"
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
    /** 2026-10-09 — branş formu (ilk branşın koşulları öğrenci satırında) yazar. */
    | "packageName"
    | "weeklyLessonCount"
    | "derivedPerLessonAmount"
    /** 2026-10-10 — uyumluluk aynası (bkz. student-enrollments.ts mirrorPatchFromEnrollments) yazar. */
    | "appliedCampaignIds"
  >
> & {
  /** 2026-10-09 — açıkça TEMİZLENECEK alanlar (db: NULL, json/memory: anahtar silinir); `undefined` "dokunma" demektir. */
  clearFields?: StudentClearableField[];
  /**
   * 2026-10-10 — YALNIZ girdi: branşa özgü bir alan (tür, ücret, tarih, MEB…) hangi BRANŞ kaydına yazılacak.
   * Satıra YAZILMAZ (store facade ayıklar). Çok branşlı öğrencide verilmezse yazım reddedilir (tahmin yok).
   */
  enrollmentId?: string;
};

export type StudentClearableField =
  | "packageId"
  | "packageBaseMonthlyFee"
  | "discountType"
  | "discountValue"
  | "monthlyFeeOverrideReason"
  | "lessonScheduleText"
  // 2026-10-10 — uyumluluk aynası: kaynak branşta olmayan değer, önceki kaynaktan kalmasın.
  | "studentType"
  | "studentTypes"
  | "level"
  | "targetExam"
  | "mebLevelStartDate"
  | "mebLevelEndDate"
  | "mebExamDate"
  | "mebExamAttended"
  | "paymentMethod"
  | "paymentDueDay"
  | "paymentDueRanges"
  | "lessonStartDate"
  | "intendedDurationMonths"
  | "enrollmentEndDate"
  | "derivedPerLessonAmount"
  | "appliedCampaignIds"
  | "lessonDurationMinutes";

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
  /**
   * Kayıt sözleşmesi ödeme politikası (Faz 2) — YALNIZCA yeni/gelecek
   * sözleşmeleri etkiler, mevcut sözleşmelerin immutable
   * `contractDataSnapshot`'ı asla geriye dönük değişmez (bkz.
   * src/lib/contracts.ts resolveContractPaymentDueRule). undefined ise
   * kurumun varsayılan politikası uygulanır: kredi kartı 1–5, havale/
   * EFT/nakit en geç 15.
   */
  contractCardWindowEndDay?: number;
  contractBankCashDueDay?: number;
  /**
   * 2026-2027 sözleşme kaynağı Madde 4 — "KDV: Dahil/Hariç" işareti. Kurumun
   * güncel vergi/fiyatlandırma uygulaması BİLİNMEDEN varsayılan tahmin
   * YAPILMAZ; undefined ise şablon "Dahil" gösterir (yaygın kurs ücreti
   * uygulaması) ve bu varsayım ACTIVE_TEMPLATE_RECOVERY_REPORT.md'de sahibi
   * onayı gereken bir madde olarak işaretlenir.
   */
  contractVatInclusive?: boolean;
  /**
   * P0 (2026-09-03) — "3 ders eşiği": kayıt ayında kalan GERÇEK planlı ders
   * sayısı bu değerden AZSA (bkz. `shouldMergeFirstCollection`), kayıt ayı tutarı sonraki ayın TAM
   * dönem ücretiyle TEK bir "birleştirilmiş ilk tahsilat" satırında toplanır
   * (bkz. `resolveFirstCollectionMergeThreshold`, `period-lesson-billing.ts`
   * `computeFirstCollectionPlan`). undefined ise varsayılan 3 kullanılır —
   * kurum bunu kendi ürün kararına göre özelleştirebilir; kod içinde magic
   * number olarak TEKRARLANMAZ.
   */
  firstCollectionMergeThresholdLessons?: number;
}

export const DEFAULT_COLLECTIONS_SETTINGS: CollectionsSettings = {
  frequencyLimitDays: 3,
  autoSendEnabled: false,
};

/** `firstCollectionMergeThresholdLessons` ayarlanmamışsa uygulanan varsayılan eşik. */
export const DEFAULT_FIRST_COLLECTION_MERGE_THRESHOLD_LESSONS = 3;

export function resolveFirstCollectionMergeThreshold(settings: {
  firstCollectionMergeThresholdLessons?: number;
}): number {
  const v = settings.firstCollectionMergeThresholdLessons;
  if (typeof v === "number" && Number.isInteger(v) && v >= 0) return v;
  return DEFAULT_FIRST_COLLECTION_MERGE_THRESHOLD_LESSONS;
}

/**
 * "3 ders eşiği" TEK kuralı (2026-09-15): kayıt ayında kalan planlı ders sayısı
 * eşikten AZSA ilk tahsilat = kayıt ayı + sonraki ayın tam ücreti. Kayıt anı
 * önerisi (createStudentTool, new-student-form) ve sözleşme planı
 * (buildPerLessonInstallmentSchedule) bunu çağırır — önceden kayıt `< 3`,
 * sözleşme `<= 3` kullanıyordu: tam 3 derste kayıt yalnız kayıt ayını tahsil
 * ederken sözleşme sonraki ayı da tahsil edilmiş sayıp faturalamıyordu.
 */
export function shouldMergeFirstCollection(firstPeriodLessonCount: number, threshold: number): boolean {
  return firstPeriodLessonCount < threshold;
}

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
  | "instrument"
  | "selected";

export type AnnouncementAudienceRef =
  | { branchId: string }
  | { studentType: StudentType }
  | { instrument: Instrument[] }
  | { userIds: string[] }
  | Record<string, never>;

/**
 * Faz 4 — bir duyuru BİRDEN FAZLA hedef segmentini OR'layarak kapsayabilir
 * (ör. "erzene şubesi" VEYA "piyano çalanlar"). `rules` verilmemişse (eski
 * kayıtlar, tekil segment) `audienceType`/`audienceRef` tek kurallı bir
 * dizi gibi davranır — bkz. `matchesAudience` (src/lib/announcements/audience.ts).
 */
export type AudienceRule = {
  audienceType: AnnouncementAudienceType;
  audienceRef?: AnnouncementAudienceRef;
};

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
  /** Faz 4 — çoklu segment (OR). Verilmemişse `audienceType`/`audienceRef` tek kural sayılır. */
  rules?: AudienceRule[];
  status: AnnouncementStatus;
  pinned: boolean;
  /** ISO tarih — verilmezse hemen yayında sayılır (status published ise) */
  publishAt?: string;
  /** ISO tarih — verilmezse süresiz */
  expireAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Faz 4 — yayınlanma anında hedef kitleye materyalize edilen Notification sayısı (benzersiz kullanıcı). */
  recipientCount?: number;
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
  /**
   * Faz 3A — "çalışılan konular". Hepsi opsiyonel serbest metin — mevcut
   * skorlu alanların YANINA eklendi, onları değiştirmez. Boşsa UI
   * "Belirtilmemiş" gösterir, hata vermez (geçmiş kayıtlarda hiçbiri yok).
   */
  piecesWorked?: string;
  etudesWorked?: string;
  technicalWork?: string;
  theoryWork?: string;
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

/**
 * Faz 3B — dört haftalık genel gelişim değerlendirmesi. Bu tabloda YALNIZCA
 * gönderilmiş (submitted) kayıtlar bulunur — "bekliyor" durumu her zaman
 * TAZE hesaplanır (bkz. src/lib/periodic-assessment/index.ts
 * computePendingPeriodicAssessmentPeriods), ayrı bir "pending" satırı YOK.
 */
export interface PeriodicAssessment {
  id: string;
  studentId: string;
  teacherId: string;
  /** ISO tarih (dahil) — dönemin ilk günü. */
  periodStart: string;
  /** ISO tarih (dahil) — dönemin son günü. */
  periodEnd: string;
  relatedLessonIds: string[];
  overallProgressNote: string;
  strengthsNote?: string;
  areasForImprovementNote?: string;
  recommendationNote?: string;
  submittedBy: string;
  submittedAt: string;
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
  /** 8. tur — silinmiş (yalnız pasif oda silinebilir). Satır kalır: geçmiş dersler oda adını gösterir. */
  deletedAt?: string;
}

export interface Lesson {
  id: string;
  /** 2026-10-04 — dersin ait olduğu eğitim (Student.enrollments[].id); yoksa enstrümandan çözülür. */
  enrollmentId?: string;
  /** 2026-10-06 — kulüp oturumu satırı (`type: "group"`); aynı oturumun satırları `clubSessionId` ile bağlı. */
  clubId?: string;
  clubSessionId?: string;
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
   * Geldi yoklamasının isteğe bağlı notu. Boş bırakılabilir; statü değişince
   * silinmez. Hakediş/ücret hesabına girmez. Planlama notu (`notes`) değildir.
   */
  studentAttendanceNote?: string | null;
  /** Dersi planlayan kullanıcı. Eski derslerde yok. */
  createdByUserId?: string;
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
  /**
   * P0-2 — "İşlendi" işaretlenirken zorunlu, kullanıcı girdisi gerekçe.
   * Boş/undefined kayıt YOK — `switchLessonOpsFlag`/`applyLessonOpsFlag`
   * flag==="processed" için bunu zorunlu kılar (bkz. lesson-ops.ts).
   */
  lessonProcessedReason?: string;
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
  /**
   * 9. tur — İptal/Telafi kararının kaynağı (bkz. src/lib/lesson-disruption.ts).
   * Öğretmen katılımından ve `status`/`opsMakeupFlag`'den AYRI; undefined = belirtilmemiş.
   */
  disruptionSource?: import("./lesson-disruption").DisruptionSource;
  disruptionNote?: string;
  disruptionAt?: string;
  disruptionBy?: string;
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
  enrollmentId?: string;
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
  /**
   * K (2026-09-20) — bu seri bir SÖZLEŞMEDEN üretildiyse o sözleşmenin
   * kimliği. Yaşam döngüsü bağlantısıdır:
   *   - üretildi → seri `contractId` taşır
   *   - kullanıcı dersleri elle düzenlerse → seri/dersler AYNEN kalır
   *     (bağlantı bir kilit DEĞİL, izlenebilirliktir)
   *   - sözleşme iptal edilirse → dersler OTOMATİK SİLİNMEZ; Sözleşme
   *     Merkezi "bu sözleşmeden üretilmiş N gelecek ders var" uyarısını
   *     gösterir ve kullanıcı açıkça onaylarsa iptal eder. Sessiz silme
   *     yapılmaz: yoklama/telafi/ücret kayıtları o derslere bağlı olabilir.
   */
  contractId?: string;
}

/** Madde 8 — kim bildirdi. UI/mantık HENÜZ bağlanmadı (bkz. Attendance alanları altındaki not). */
export type CancellationSource = "student" | "guardian" | "teacher" | "institution" | "other";

export interface Attendance {
  id: string;
  lessonId: string;
  studentId: string;
  status: AttendanceStatus;
  reason?: string;
  markedAt: string;
  createsMakeupCredit: boolean;
  /**
   * 2026-2027 sözleşme kaynağı Madde 8 — "aynı gün bildirilen iptal" kuralını
   * `markedAt`'tan (personelin yoklamayı İŞLEME zamanı) AYRI, güvenilir bir
   * bildirim kaydıyla uygulamak için forward-compatible alanlar. Şema/tip
   * düzeyinde eklendi; store/tool/UI katmanlarında henüz OKUNMUYOR/YAZILMIYOR
   * (bkz. docs/roadmap/NEVIIHUB_ADMIN_CONTRACTS_POLICY_REMAINING_WORK.md §5) —
   * bilinçli olarak heuristic/tahmin ile doldurulmadı.
   */
  cancellationSource?: CancellationSource;
  cancellationNoticeAt?: string;
  cancellationReason?: string;
  cancellationEvidenceDocumentId?: string;
  telafiEligible?: boolean;
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
  /** Süre uzatma, revizyon, plan silme ve hak iptali — kim, ne zaman, eski/yeni. */
  changeLog?: import("./makeup-deadline").MakeupChangeEntry[];
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

/** "club" (2026-10-05) — kulüp aylık ücreti; sözleşmeye hiçbir koşulda bağlanmaz/taşınmaz. */
export type PaymentSource = "manual" | "lesson_ops" | "monthly_plan" | "contract" | "registration_first_payment" | "club";

export interface Payment {
  id: string;
  /** 2026-10-05 — kulüp ücreti satırının üyeliği (`source: "club"`). */
  clubMembershipId?: string;
  /**
   * 2026-10-09 — satırın ait olduğu branş kaydı (Student.enrollments[].id). Sözleşme taksidinde sözleşmenin eğitimi;
   * sözleşmesiz satırda tek açık bağ. Yoksa (eski kayıt) bkz. student-enrollments.ts `paymentEnrollmentId`.
   */
  enrollmentId?: string;
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
  /** FEATURE A — bu ödeme bir `StudentContract` taksit planının parçasıysa dolu. */
  contractId?: string;
  /** 1-tabanlı taksit sırası — yalnızca contractId doluyken anlamlı. */
  installmentSequence?: number;
  /**
   * P0-1B — bu ödeme, motorun ürettiği otomatik tutardan MANUEL olarak
   * farklı girildiyse dolu (bkz. `first-payment-adjustment.ts`). `amount`
   * HER ZAMAN fiilen tahsil edilen net tutardır — bu alanlar yalnızca
   * "otomatik hesaplananla farkı" audit için ayrıca taşır, `amount`'ı
   * gizlemez/değiştirmez. Dördü de yoksa (undefined) düzeltme YAPILMAMIŞ
   * demektir — normal, otomatik tutarla birebir eşleşen bir ödeme.
   */
  autoSuggestedAmount?: number;
  adjustmentReason?: string;
  adjustedBy?: string;
  adjustedAt?: string;
  /**
   * Sahip kararı (2026-09-16) — kayıt anı ilk tahsilatı, takip eden ayın TAM
   * ücretini de kapsıyor mu? Kullanıcının kayıt ekranındaki AÇIK seçimidir;
   * sözleşme ekranı bunu ders sayısından YENİDEN TÜRETMEZ, okur. Eski
   * kayıtlarda undefined — o zaman sözleşme ekranı varsayılanı kapalıdır.
   */
  firstCollectionIncludesNextMonth?: boolean;
  /**
   * P0 (2026-09-03) — bkz. `ContractInstallmentSnapshot`. Yalnız
   * `contractId` dolu (taksit) satırlarda anlamlıdır; eski/legacy Payment
   * kayıtlarında YOK — `undefined` her yerde güvenle ele alınır.
   */
  installmentKind?: ContractInstallmentKind;
  installmentPeriodLabel?: string;
  installmentBreakdown?: { periodLabel: string; amount: number }[];
  installmentComputationSource?: "auto" | "manual";
  installmentNote?: string;
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
   * P0 (2026-09-03) — DÖNEM BAŞINA öğrenci başına telafi hakkı (varsayılan
   * 2), TAKVİM AYI DEĞİL (bkz. src/lib/makeup-quota.ts — dönem, ay içinde
   * değişse bile sıfırlanmaz, yalnız yeni eğitim döneminde yeniden dolar).
   * Alan adı ("monthlyMakeupAllowance") geriye dönük DB uyumluluğu için
   * DEĞİŞTİRİLMEDİ — anlamı artık "dönem başına hak"tır, kod/UI her yerde
   * bu şekilde ele alınır. 0 = telafi kapalı. confirmed="kullanıldı";
   * pending/suggested/awaiting_info="rezerve edildi"; cancelled/expired
   * sayılmaz.
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
  /**
   * Kurumun Güz/Yaz dönem tarihleri (yyyy-MM-dd). Boşsa attendance-calendar
   * belgelenmiş varsayılanı kullanılır (Güz 1 Eyl–30 Haz, Yaz 1 Tem–31 Ağu).
   * Geçersiz değer sessizce varsayılana düşmez — kayıt anında reddedilir.
   */
  academicTermDates?: {
    guzStart: string;
    guzEnd: string;
    yazStart: string;
    yazEnd: string;
  };
  /** Faz 8 (KVKK) — boşsa DEFAULT_CONSENT_SETTINGS uygulanır (veri minimizasyonu: recordDeviceInfo=false). */
  consentSettings?: ConsentSettings;
  /** Kurum sahibi performans ağırlıkları. Boşsa ürün varsayılanı. */
  performanceWeights?: import("./performance-weights").PerformanceWeightsConfig;
}

/**
 * Faz 8 (KVKK) — tenant düzeyinde yönetilen rıza ayarları.
 * `restrictedFeatures`: geçerli rızası olmayan bir kişi için hangi
 * özellikler kısıtlanır (ör. "whatsapp_messaging", "photo_sharing" — serbest
 * metin anahtar, sabit bir enum'a KİLİTLENMEZ, kurumun kendi tanımladığı bir
 * liste). `recordDeviceInfo`: KvkkConsent.deviceInfo'nun doldurulup
 * doldurulmayacağı — varsayılan false (spec'in "veri minimizasyonu" talebi).
 */
export type ConsentSettings = {
  restrictedFeatures: string[];
  recordDeviceInfo: boolean;
};

export const DEFAULT_CONSENT_SETTINGS: ConsentSettings = {
  restrictedFeatures: [],
  recordDeviceInfo: false,
};

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
  /** 2026-09-30 — devre dışı bırakma izi (effectiveTo bu işlemle kısaltılır). */
  deactivatedAt?: string;
  deactivatedByUserId?: string;
  deactivationReason?: string;
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
  /**
   * 2026-09-30 — ödeme defterinden TÜRETİLİR (bkz. payout-ledger.ts `derivePayoutStatus`):
   * pending (ödeme yok) · partial (kısmi) · paid (bakiye ≤ 0) · cancelled (iptal; toplam/kilit dışı).
   */
  status: TeacherPayoutStatus;
  /** Son (ters kaydı olmayan) ödemenin tarihi. */
  paidAt?: string;
  method?: string;
  generatedAt: string;
  cancelledAt?: string;
  cancelledByUserId?: string;
  cancelReason?: string;
  /** Kayıt anındaki ders kalemleri (hangi kural/politika, hangi tutar) — sonradan kural silinse de okunur. */
  lineSnapshot?: TeacherPayoutSnapshotLine[];
  /** Ödeme defteri. `undefined` = eski kayıt: status "paid" ise tüm tutar tek ödemede ödenmiş sayılır. */
  payments?: TeacherPayoutPaymentEntry[];
  /** Düzeltme (fark) kayıtları: +/− tutar, gerekçe; silinmez, ters kayıtla geri alınır. */
  adjustments?: TeacherPayoutAdjustmentEntry[];
  /** İyimser eşzamanlılık sayacı — her yazmada +1; eski sürümle yazma reddedilir. */
  version?: number;
  /** Revizyon (K): ilk revizyonda donan orijinal hesap ve satır düzeltmeleri. */
  originalTotalMinutes?: number;
  originalTotalAmount?: number;
  lineOverrides?: Record<string, TeacherPayoutLineOverride>;
  revisionCount?: number;
  revisedAt?: string;
  revisedByUserId?: string;
  revisionReason?: string;
  /**
   * 2026-09-29 — kayıt ANINDA kullanılan hakediş politikası. `undefined` = eski kayıt (öğretmen bazlı
   * dakika ücreti). "mixed" = dönem birden çok ayı ve farklı politikaları kapsıyor.
   */
  pricingPolicy?: TeacherPayoutPricingPolicy | "mixed";
  /** Kayıt anındaki ay → politika + sabit tutarlar (izlenebilirlik; sonradan değişmez). */
  pricingSnapshot?: Record<string, TeacherPayoutPolicyTerms>;
}

export type TeacherPayoutStatus = "pending" | "partial" | "paid" | "cancelled";

export interface TeacherPayoutSnapshotLine {
  lessonId: string;
  lessonDate: string;
  studentId: string;
  studentName?: string;
  branchName?: string;
  instrument: Instrument;
  durationMinutes: number;
  perMinuteRate?: number;
  amount: number;
  feeRuleId?: string;
  pricingPolicy?: TeacherPayoutPricingPolicy;
  issue?: string;
}

/** Ters kaydı olan satır toplamlara girmez ama silinmez (muhasebe izi). */
export interface TeacherPayoutPaymentEntry {
  id: string;
  amount: number;
  paidAt: string;
  method?: string;
  note?: string;
  createdByUserId: string;
  createdAt: string;
  reversedAt?: string;
  reversedByUserId?: string;
  reverseReason?: string;
}

export interface TeacherPayoutAdjustmentEntry {
  id: string;
  /** + öğretmene ek ödeme, − öğretmenden düşülecek. */
  amount: number;
  reason: string;
  /** manual: elle · recalc: kayıt sonrası değişen hesap farkı (politika/kural/hariç tutma). */
  kind: "manual" | "recalc";
  createdByUserId: string;
  createdAt: string;
  reversedAt?: string;
  reversedByUserId?: string;
  reverseReason?: string;
}

/** 2026-09-30 — kaynak dersi silmeden hakedişten hariç tutma (gerekçeli, geri alınabilir). */
export interface TeacherPayoutExclusion {
  id: string;
  lessonId: string;
  teacherId: string;
  reason: string;
  createdByUserId: string;
  createdAt: string;
}

/** Öğretmen hakediş politikası: mevcut (öğretmen bazlı dakika ücreti) veya süreye göre ortak sabit ücret. */
export type TeacherPayoutPricingPolicy = "per_teacher_rule" | "fixed_duration";

export interface TeacherPayoutPolicyTerms {
  policy: TeacherPayoutPricingPolicy;
  /** Yalnız `fixed_duration`: tüm öğretmenler için ders başı TL (30/40/50 dk). */
  rate30?: number;
  rate40?: number;
  rate50?: number;
}

/**
 * 2026-09-29 — bir takvim ayı için seçilen hakediş politikası (kurum geneli, öğretmen bazlı DEĞİL).
 * Kayıt yoksa o ay mevcut politika geçerlidir. O ayla kesişen bir hakediş kaydı oluşunca kilitlenir.
 */
export interface TeacherPayoutPolicyPeriod extends TeacherPayoutPolicyTerms {
  id: string;
  /** "yyyy-MM" */
  month: string;
  setByUserId: string;
  setAt: string;
  /** Yalnız "Tüm kurumlar" birleşik görünümünde: kaydın ait olduğu kurumun öğretmenleri. */
  teacherIds?: string[];
}

/** Hakediş dökümünde tek dersin elle düzeltilmiş değerleri; boş alan = hesaplanan değer. */
export interface TeacherPayoutLineOverride {
  minutes?: number;
  hourlyRate?: number;
  amount?: number;
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
  /** 2026-09-29 — ay bazlı hakediş politikası (opsiyonel: yoksa her ay mevcut politika). */
  teacherPayoutPolicies?: TeacherPayoutPolicyPeriod[];
  /** 2026-09-30 — hakedişten hariç tutulan dersler (ders/takvim/yoklama kaydı değişmez). */
  teacherPayoutExclusions?: TeacherPayoutExclusion[];
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
  /**
   * ÇALIŞMA GÜNÜ İSTİSNALARI (2026-09-20) — yöneticinin "zorla açık" /
   * "zorla kapalı" işaretlediği günler. `readData()` bunu HER ZAMAN doldurur;
   * elle kurulan test fixture'ları için opsiyoneldir (yokluğunda istisna yok
   * sayılır, yani resmî tatil + dönem kuralı geçerli olur).
   *
   * Ders planlama doğrulaması (`validateLessonSlot`), Ders Programı ızgarası,
   * seri planlama, ödeme önizlemesi ve Yoklama Takvimi AYNI listeyi okur —
   * bkz. src/lib/work-days.ts.
   */
  closedDayOverrides?: ClosedDay[];
}

/** Faz 12 — bkz. src/lib/entity-sequence.ts. */
export type EntityTypeForSequence = "student" | "teacher" | "staff" | "package" | "campaign";
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
/**
 * Paket & Kampanya Motoru — bir öğrenciye birden fazla kampanya uygulanmak
 * istendiğinde çakışma kuralı (bkz. `resolveCampaignStack`, discount-campaigns.ts):
 * - "none": başka hiçbir kampanyayla birleşemez; birden fazla "none" varsa en yüksek öncelikli kazanır.
 * - "additive": diğer additive kampanyalarla toplanır (toplam %100'ü geçemez).
 * - "override": en yüksek öncelikli override kampanyası diğerlerini ezer.
 * - "yield": başka herhangi bir aktif kampanya varsa devreye girmez.
 */
export type CampaignStackingRule = "none" | "additive" | "override" | "yield";

export interface DiscountCampaign {
  id: string;
  /** Paket & Kampanya Motoru — kurum bazında okunabilir numara (ör. "KMP-001"). NULL = motor öncesi eski kayıt. */
  displayId?: string;
  name: string;
  /** Uzun açıklama (opsiyonel). */
  description?: string;
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
  /** Çoklu şube kapsamı — boş/undefined = tüm şubeler (branchId tekil kapsamla birlikte değerlendirilir). */
  applicableBranchIds?: BranchId[];
  stackingRule: CampaignStackingRule;
  /** Aynı anda birden fazla kampanya aktifse yüksek öncelikli önce uygulanır. */
  priority: number;
  /** NULL = sınırsız; dolunca kampanya kapanmaz, yalnız uyarı üretilir (soft). */
  maxUsageCount?: number;
  /** Her uygulamada artırılır. */
  usageCount: number;
  /** İleride genişletilebilir kural alanı (şimdilik serbest JSON). */
  conditions?: Record<string, unknown>;
  createdBy: string;
  /** Oluşturan kullanıcı (User.id). Eski kayıtlarda undefined. */
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
  /** 2026-09-29 — soft delete: dolu = silinmiş (yeni kayıtta seçilemez, düzenlenemez; geçmiş korunur). */
  deletedAt?: string;
  deletedByUserId?: string;
  deletionReason?: string;
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
  /**
   * Faz 3C — bu ödevin verildiği DERS. Opsiyonel (geçmiş kayıtlar + ders
   * dışı/genel ödevler için) — dolu olduğunda "bu ders için ödev verildi mi"
   * kontrolü (bkz. src/lib/homework-lesson-check.ts) bu alana bakar.
   */
  lessonId?: string;
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
  | "other"
  /**
   * 2026-2027 Fotoğraf/Video Açık Rıza Formu — kalan 3 kanal. Formun 5
   * kanalının HER BİRİ ayrı ayrı değerlendirilir (bkz. kaynak belge madde
   * "Aşağıdaki seçeneklerden her biri ayrı ayrı değerlendirilir"); "website"
   * ve "instagram" zaten mevcuttu.
   */
  | "print_materials"
  | "digital_ads"
  | "in_house_board";

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
 * Faz 8 (KVKK) — hukuki metnin versiyonlu geçmişi (append-only, bkz.
 * prisma/schema.prisma ConsentTextVersion yorumu). `consentType` serbest
 * metin (ör. "kvkk_general", "photo_sharing") — kurum kendi rıza türlerini
 * tanımlar, sabit bir enum'a kilitlenmez.
 */
export interface ConsentTextVersion {
  id: string;
  consentType: string;
  version: number;
  bodyText: string;
  effectiveFrom: string;
  createdBy: string;
  createdAt: string;
}

export type ConsentSubjectType = "student" | "parent" | "user";

/** Faz 8 (KVKK) — `SocialMediaConsent` ile AYNI iskelet (grant/withdraw). */
export interface KvkkConsent {
  id: string;
  subjectType: ConsentSubjectType;
  subjectId: string;
  consentType: string;
  textVersionId: string;
  acceptedAt: string;
  channel: string;
  withdrawnAt?: string;
  withdrawalReason?: string;
  /** Yalnızca ConsentSettings.recordDeviceInfo=true iken dolu. */
  deviceInfo?: { ip?: string; userAgent?: string };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Faz 8 (KVKK) — bir konu+tür için geçerli rızanın efektif durumu (okuma anında hesaplanır, kalıcı yazılmaz). */
export type ConsentEffectiveStatus = "valid" | "missing" | "outdated" | "withdrawn";

/** Faz 11 — CRM arama/mesaj altyapısı. */
export type CrmContactType = "student" | "parent" | "lead";
export type CallDirection = "inbound" | "outbound";

export interface CallLog {
  id: string;
  callerNumber: string;
  callerName?: string;
  contactType?: CrmContactType;
  contactId?: string;
  direction: CallDirection;
  answered: boolean;
  durationSeconds?: number;
  occurredAt: string;
  callbackDone: boolean;
  callbackAt?: string;
  callbackByUserId?: string;
  note?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type MessageChannel = "sms" | "whatsapp" | "email" | "other";
export type MessageLogStatus = "unread" | "read" | "replied";

/**
 * `contentOrSummary` her zaman TAM içeriği taşır (tek alan — ayrı bir
 * "summary" kolonu İCAT EDİLMEDİ); erişimi sınırlandırma LİSTE fonksiyonu
 * seviyesinde yapılır (`toPublicMessageLogSummary` — Homework.fileData'nın
 * listede "1" ile değiştirilmesiyle AYNI desen). Tam içerik yalnızca
 * `getMessageLogTool` (audit'li) ile görülür.
 */
export interface MessageLog {
  id: string;
  channel: MessageChannel;
  senderIdentifier: string;
  occurredAt: string;
  contentOrSummary: string;
  status: MessageLogStatus;
  contactType?: CrmContactType;
  contactId?: string;
  responderUserId?: string;
  createdBy: string;
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
  /**
   * P0 personel onboarding revizyonu — il/ilçe, açık adresten AYRI
   * nullable alanlar (eski kayıtlar kırılmaz; `address` serbest metin
   * olarak korunur). Özel nitelikli veri DEĞİLDİR.
   */
  city?: string;
  district?: string;
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
  /** Yalnız admin/super admin görünürlüğünde — bkz. requireStaffSensitiveAccess (tools.ts). */
  personnelNotes?: string;
  notes?: string;
  /**
   * Maaş yapısı — öğretmen hakedişinden (Teacher/TeacherFeeRule) BİLİNÇLİ
   * olarak ayrı (bkz. PayrollRecord yorumu). Yalnızca hassas bordro
   * yetkisi olan roller (bkz. requireStaffSensitiveAccess) görebilir/düzenleyebilir.
   */
  monthlySalary?: number;
  hourlyRate?: number;
  defaultBonus?: number;
  defaultAllowances?: number;
  defaultDeductions?: number;
  /** Faz 9A — özlük genişletmesi. */
  emergencyContactName?: string;
  /** P0 personel onboarding revizyonu — yakınlık derecesi (örn. "Eşi", "Babası"). Serbest metin, opsiyonel. */
  emergencyContactRelationship?: string;
  emergencyContactPhone?: string;
  /**
   * P0 personel onboarding revizyonu — portal kullanıcı bağlantısı.
   * `portalUserId`: bu personele bağlı SCHOOL_ADMIN User satırı (yoksa
   * portal erişimi oluşturulmamış demektir). `portalInvitedAt`: son davet
   * e-postasının ISO zamanı. İkisi de nullable/additive — eski kayıtlar
   * "erişim yok" olarak okunur. Rol, User satırından canlı okunur
   * (ayrı bir `portalRole` kolonu YOK — tek gerçek kaynak User.role).
   */
  portalUserId?: string;
  portalInvitedAt?: string;
  contractStartDate?: string;
  contractEndDate?: string;
  /** SGK/iş ilişkisi — serbest metin, hukuki kesinlik gerektirmeyen bilgi alanı. */
  sgkStatus?: string;
  /** AES-GCM şifreli — bkz. src/lib/pii/iban.ts, nationalIdCipher ile AYNI mekanizma. */
  ibanCipher?: string;
  ibanLast4?: string;
  /** Faz 9B — yıllık avans üst sınırı (kuruş/tam sayı). Tanımsızsa kontrol edilmez. */
  annualAdvanceLimit?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type StaffAdvanceStatus = "pending_approval" | "approved" | "rejected" | "paid" | "cancelled";

/**
 * Faz 9B — personel maaş avansı talebi. `leave.ts`'in durum-geçiş desenini
 * izler ama ayrıca `StaffMember.annualAdvanceLimit` karşısında yıl içi
 * kullanım toplamıyla sınırlandırılır (bkz. src/lib/staff-advance.ts).
 */
export interface StaffAdvance {
  id: string;
  staffId: string;
  /** Tam sayı (kuruş değil TL — mevcut Payment/PayrollRecord ile AYNI para kuralı: her zaman Int). */
  amount: number;
  /** yyyy-MM-dd */
  requestDate: string;
  status: StaffAdvanceStatus;
  approvedBy?: string;
  approvedAt?: string;
  paidAt?: string;
  paymentMethod?: string;
  description?: string;
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
export type ExpensePaymentStatus = "pending" | "paid" | "overdue";
export type ExpenseApprovalStatus = "pending" | "approved" | "rejected";

export interface ExpenseRecord {
  id: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  note?: string;
  createdBy: string;
  createdAt: string;
  /** Faz 10 — genişletme (hepsi additive/opsiyonel, eski kayıtları etkilemez). */
  subcategory?: string;
  supplier?: string;
  branchId?: BranchId;
  /** Varsayılan "TRY" — sunucu tarafında set edilir. */
  currency?: string;
  taxAmount?: number;
  dueDate?: string;
  /** Tanımsızsa "paid" sayılır (eski kayıtlarla geriye uyumlu). */
  paymentStatus?: ExpensePaymentStatus;
  paymentMethod?: string;
  approvalStatus?: ExpenseApprovalStatus;
  approvedBy?: string;
  /** Bu kaydı üreten RecurringExpenseRule (varsa) — bkz. src/lib/recurring-expense.ts. */
  recurringRuleId?: string;
}

/** Faz 10 — periyodik olarak otomatik ExpenseRecord üreten kural. */
export type RecurringExpenseFrequency = "monthly" | "quarterly" | "yearly";

export interface RecurringExpenseRule {
  id: string;
  category: ExpenseCategory;
  subcategory?: string;
  supplier?: string;
  branchId?: BranchId;
  amount: number;
  frequency: RecurringExpenseFrequency;
  /** yyyy-MM-dd — bu tarihte (ve sonrasında ilk tick'te) bir ExpenseRecord üretilir. */
  nextRunDate: string;
  note?: string;
  active: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Faz 10 — kategori/şube/dönem bazlı hedef gider tutarı; dashboard'da gerçekleşenle karşılaştırılır. */
export interface Budget {
  id: string;
  category: ExpenseCategory;
  branchId?: BranchId;
  /** yyyy-MM */
  period: string;
  targetAmount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
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
  /** Veli adı (opsiyonel). */
  parentName?: string;
  instrument: Instrument;
  branchId: BranchId;
  teacherId: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  status: TrialLessonStatus;
  convertedStudentId?: string;
  /** Dönüşüm anı ve dönüşümü yapan kullanıcı (performans/rapor). */
  convertedAt?: string;
  convertedByUserId?: string;
  /** Hazırlık notu (ders öncesi). */
  notes?: string;
  /** Ders sonrası sonuç/görüşme notu — hazırlık notundan ayrı alan. */
  resultNotes?: string;
  resultNotesAt?: string;
  resultNotesByUserId?: string;
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
  /**
   * LEGACY (2026-09-20 öncesi kayıtlar). Üretilmiş, referans numarası almış,
   * arşivde kalıcı bir belge hiçbir zaman gerçek bir "taslak" değildi —
   * `createDocumentInstance`ın varsayılanı olduğu için öyle görünüyordu ve
   * kullanıcıda "bu belge sonradan kaybolur mu?" endişesi yaratıyordu.
   * Artık YAZILMAZ; yerine "issued" kullanılır. Okumada "Düzenlendi" gösterilir.
   */
  | "draft"
  /** Belge üretildi, referans numarası verildi, arşivde kalıcı. Varsayılan. */
  | "issued"
  | "printed"
  | "sent_for_signature"
  | "signed"
  | "uploaded"
  | "cancelled"
  | "expired"
  /** 2026-09-29 — arşivlenmiş evrak kritik şifre + gerekçeyle silindi (soft delete; satır/dosya DB'de kalır). */
  | "deleted";

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
  /**
   * P0 (2026-08-30, DOCX-öncelikli şablon iş akışı) — admin bir .docx
   * yüklediğinde, ORİJİNAL dosya baytları (base64) burada değişmeden
   * saklanır ve yetkili admin'e AYNEN geri indirilebilir. `bodyHtml`
   * mammoth ile üretilen bir HTML ÖNİZLEMESİDİR — DOCX biçimlendirmesinin
   * bire bir/kayıpsız karşılığı OLDUĞU İDDİA EDİLMEZ (bkz.
   * docs/contracts/TEMPLATE_EDITOR_AND_DOCX_WORKFLOW_REPORT.md). Bu alanlar
   * yalnızca DOCX'ten yüklenen şablonlarda dolu olur; eski/manuel HTML
   * şablonlarında hepsi undefined kalır.
   */
  sourceFileData?: string;
  sourceFileName?: string;
  sourceMimeType?: string;
  sourceUploadedAt?: string;
  sourceUploadedById?: string;
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

/** FEATURE A — versiyonlu öğrenci kayıt sözleşmesi. */
export type ContractType = "initial" | "renewal" | "amendment";

export const CONTRACT_TYPES: ContractType[] = ["initial", "renewal", "amendment"];

/**
 * Sözleşme İŞ SÜRECİ yaşam döngüsü — bağlı `DocumentInstance.status` (belge-
 * dosyası yaşam döngüsü: draft/printed/uploaded/...) İLE AYNI ALAN DEĞİLDİR,
 * bkz. prisma/schema.prisma StudentContract yorumu.
 */
export type ContractStatus =
  | "draft"
  | "generated"
  | "printed"
  | "wet_signature_pending"
  | "signed"
  | "recorded"
  | "superseded"
  | "cancelled";

export const CONTRACT_STATUSES: ContractStatus[] = [
  "draft",
  "generated",
  "printed",
  "wet_signature_pending",
  "signed",
  "recorded",
  "superseded",
  "cancelled",
];

/**
 * P0 (2026-09-03) — bir taksit satırının GÖRÜNÜR anlamı: "hangi tahsilat
 * türü". `first_collection`: normal ilk tahsilat (yalnız kayıt ayı).
 * `first_collection_combined`: 3-ders eşiği altına düşünce kayıt ayı +
 * takip eden ayın TAM ücretinin BİRLEŞTİĞİ ilk tahsilat.
 * `period_fee`: normal dönem ücreti. `deposit`: kaparo (varsa, sıra 0).
 */
export type ContractInstallmentKind = "deposit" | "first_collection" | "first_collection_combined" | "period_fee";

/** Sözleşme oluşturma anında SUNULAN, sonradan Student değişse bile sabit kalan taksit satırı. */
export interface ContractInstallmentSnapshot {
  sequence: number;
  dueDate: string;
  amount: number;
  paymentMethod?: string;
  /**
   * P0 (2026-09-03) — geriye dönük UYUMLU alanlar (hepsi opsiyonel): eski
   * sözleşmelerin `contractDataSnapshot.installments`'ında bu alanlar YOK —
   * UI bunları `undefined` gördüğünde eski, sade satır görünümüne düşer,
   * hata vermez. Yalnız YENİ (per-lesson) sözleşme akışı bunları doldurur.
   */
  kind?: ContractInstallmentKind;
  /** Kapsanan dönem(ler)in okunabilir etiketi, ör. "17–30 Eylül 2026 + Ekim 2026". */
  periodLabel?: string;
  /** `kind==="first_collection_combined"` iken tutarın dönem bazlı kırılımı. */
  breakdown?: { periodLabel: string; amount: number }[];
  /** Bu satırın tutarı otomatik mi hesaplandı yoksa personel/veli tarafından mı manuel belirlendi. */
  computationSource?: "auto" | "manual";
  /** `computationSource==="manual"` ise personelin girdiği gerekçe. */
  note?: string;
  /** 2026-09-19 — vade tarihi önizlemede elle değiştirildiyse "manual"; yoksa otomatik kuraldan gelir. */
  dueDateSource?: "auto" | "manual";
}

/** `contractDataSnapshot` JSON alanının şekli — üretim anındaki DEĞİŞMEZ görüntü. */
/** Sözleşme çıktısının hukuken ayrı EK bölümü (KVKK / fotoğraf-video açık rıza). */
export interface ContractAnnexSnapshot {
  kind: "kvkk" | "parent_social_media_consent";
  title: string;
  reference: string;
  html: string;
}

export interface ContractDataSnapshot {
  studentName: string;
  programmeName: string;
  enrollmentStartDate: string;
  enrollmentEndDate: string;
  durationMonths: number;
  monthlyAmount: number;
  installmentCount: number;
  totalContractAmount: number;
  depositAmount?: number;
  paymentMethod?: string;
  signatoryFullName: string;
  signatoryNationalId?: string;
  signatoryAddress?: string;
  signatoryRelationship?: string;
  isMinor: boolean;
  installments: ContractInstallmentSnapshot[];
  /**
   * K (2026-09-20) — sözleşme anında dondurulmuş ders gün/saati
   * ("Salı 15:00, Perşembe 16:00", kurum saat diliminde duvar saati).
   * Sözleşme metninde ZATEN gösteriliyordu ama yalnız `fieldValues` içinde,
   * makine tarafından okunamaz biçimde duruyordu; ders programı üretimi bunu
   * TEK kaynak olarak okur. Eski sözleşmelerde undefined'dır — o durumda
   * öğrencinin güncel `lessonScheduleText` alanına düşülür.
   */
  lessonScheduleText?: string;
  photoVideoConsent?: { granted: boolean; representativeName: string; relationship: string; scopes?: SocialMediaScope[] };
  /**
   * P0-E (2026-09-02) — sözleşme oluşturulduğu ANDA aktif olan kurum logosu
   * (`School.logoUrl`), immutable snapshot — AYNI desen: kurum daha sonra
   * logosunu değiştirse/kaldırsa bile bu sözleşme sürümünde gösterilen logo
   * SESSİZCE değişmez. Yeni sözleşmeler her zaman o anki güncel logoyu alır.
   */
  logoUrl?: string;
  /**
   * Faz 2 — sözleşme anında GEÇERLİ olan ödeme kuralı, immutable snapshot.
   * Kurum politikası sonradan değişse bile bu sözleşme sürümü ETKİLENMEZ.
   */
  paymentDueRuleText?: string;
  paymentDueWindowStartDay?: number;
  paymentDueWindowEndDay?: number;
  /** İlk taksit tarihi ödeme penceresi DIŞINDAysa zorunlu personel gerekçesi (audit'lenir). */
  firstPaymentExceptionReason?: string;
  /**
   * 2026-2027 sözleşme kaynağı, KAYIT VE İMZA BİLGİLERİ bölümü — "KVKK
   * Aydınlatma Metni ayrıca teslim edilmiş/bilgilendirme yapılmıştır: Evet/
   * Hayır" işareti. Bu SADECE bir TESLİMAT/bilgilendirme kaydıdır, açık rıza
   * DEĞİLDİR (bkz. KvkkConsent — ayrı ve gerektiğinde kullanılan bir
   * mekanizma). Bilinçli olarak KvkkConsent/ConsentTextVersion modelleri
   * ÜZERİNDEN YÜRÜTÜLMEDİ: o modeller versiyonlu HUKUKİ METNE onay içindir,
   * burada sadece "personel metni teslim etti mi" ikili işareti gerekir.
   */
  kvkkNoticeDelivered?: boolean;
  /** Fotoğraf/Video Açık Rıza Formu personel tarafından SUNULDU mu (izin verilsin/verilmesin) — "Evet/Hayır" işareti. */
  photoVideoConsentFormPresented?: boolean;
  /**
   * P0 (2026-09-05) — TEK BİRLEŞİK ÇIKTI. Sözleşme oluşturulduğu ANDA aktif
   * olan KVKK ve Fotoğraf/Video şablonlarından render edilmiş EK bölümleri,
   * immutable snapshot (logoUrl/paymentDueRuleText ile AYNI desen). Ana
   * sözleşme, KVKK, fotoğraf/video sırasıyla TEK bir çıktı olarak basılır —
   * bkz. src/lib/contract-annexes.ts. Bu alan olmadan üretilmiş ESKİ
   * sözleşmelerde okuma anında aktif şablonlardan canlı üretilir.
   */
  annexes?: ContractAnnexSnapshot[];
}

/** İş katmanı dönüş görünümü — taksitler `Payment` satırlarından türetilir, ayrı bir tablo DEĞİLDİR. */
export interface ContractInstallmentView {
  paymentId: string;
  sequence: number;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: string;
  paidAt?: string;
  paymentMethod?: string;
  /** Bkz. `ContractInstallmentSnapshot` — canlı görünüm, snapshot'la AYNI opsiyonel alanlar. */
  kind?: ContractInstallmentKind;
  periodLabel?: string;
  breakdown?: { periodLabel: string; amount: number }[];
  computationSource?: "auto" | "manual";
  note?: string;
}

export interface StudentContract {
  id: string;
  /** 2026-10-04 — sözleşmenin ait olduğu eğitim; yoksa birincil/eski eğitim. */
  enrollmentId?: string;
  studentId: string;
  contractNumber: string;
  versionNumber: number;
  contractType: ContractType;
  previousContractId?: string;
  /** 1-2 aylık trial kayıtlarda (status="recorded") YOK — formal belge üretilmedi. */
  documentInstanceId?: string;
  templateVersion?: number;
  status: ContractStatus;
  contractDataSnapshot: ContractDataSnapshot;
  programmeName: string;
  enrollmentStartDate: string;
  enrollmentEndDate: string;
  durationMonths: number;
  monthlyAmount: number;
  installmentCount: number;
  totalContractAmount: number;
  depositAmount?: number;
  paymentMethod?: string;
  signatoryFullName: string;
  signatoryNationalId?: string;
  signatoryAddress?: string;
  signatoryRelationship?: string;
  createdBy: string;
  generatedBy: string;
  printedBy?: string;
  printedAt?: string;
  signedAt?: string;
  createdAt: string;
  updatedAt: string;
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
  /** 9. tur — geri alınabilir silme. Dolu = hiçbir listede/raporda/hatırlatmada yok; "Silinen işler"den geri alınır. */
  deletedAt?: string;
  deletedByUserId?: string;
  deletionReason?: string;
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


/** Öğrenci silme/geri alma — store'ların dar yazma yolu. `null` = geri al. */
export type StudentDeletionState = { deletedAt: string; deletedByUserId: string; deletionReason: string } | null;
export type TeacherDeletionState = StudentDeletionState;
