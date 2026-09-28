import { z } from "zod";
import { LESSON_DURATION_OPTIONS, TRIAL_LESSON_DURATION_OPTIONS } from "./lesson-duration";
import { INSTRUMENTS, REFERRAL_SOURCES } from "./types";
import { isValidDateOnlyInput } from "./date-input";

/** Faz 1A — tek bir ödeme günü aralığı (1–31, dahil, start ≤ end). */
export const paymentDueRangeSchema = z
  .object({
    start: z.coerce.number().int().min(1).max(31),
    end: z.coerce.number().int().min(1).max(31),
  })
  .refine((v) => v.start <= v.end, { message: "Aralık başlangıcı bitişten büyük olamaz.", path: ["end"] });

/** En fazla 10 aralık — sınırsız çoğaltmayı engeller, gerçek ihtiyacı fazlasıyla karşılar. */
export const paymentDueRangesSchema = z.array(paymentDueRangeSchema).max(10).optional();

export const branchSchema = z.object({
  name: z.string().min(1),
  shortName: z.string().min(1),
  city: z.string().min(1),
  phone: z.string().min(1),
  address: z.string().min(1),
});

export const updateBranchSchema = branchSchema.partial().extend({
  branchId: z.string().min(1),
});

export const attendanceSchema = z.object({
  lessonId: z.string().min(1),
  status: z.enum(["present", "absent", "late", "cancelled_by_school"]),
  reason: z.string().optional(),
});

/** Faz 2 — öğretmenin KENDİ derse gelip gelmediği; öğrenci yoklamasından tamamen ayrı. */
export const markTeacherAttendanceSchema = z.object({
  lessonId: z.string().min(1),
  status: z.enum(["geldi", "gelmedi", "mazeretli"]),
  note: z.string().max(500).optional(),
});

/** Faz 13 — bir dersin öğretmeni ve/veya şubesi/odası değişimi. */
export const reassignLessonTeacherOrBranchSchema = z
  .object({
    lessonId: z.string().min(1),
    scope: z.enum(["single", "fromHereOnward", "entireSeries"]),
    newTeacherId: z.string().min(1).optional(),
    newBranchId: z.string().min(1).optional(),
    newRoomId: z.string().min(1).optional(),
  })
  .refine((v) => v.newTeacherId || v.newBranchId || v.newRoomId, {
    message: "En az öğretmen veya şube/oda değişikliği belirtin.",
    path: ["newTeacherId"],
  })
  .refine((v) => !v.newBranchId || v.newRoomId, {
    message: "Şube değişiyorsa yeni oda da belirtilmelidir.",
    path: ["newRoomId"],
  });

export const teacherPerformanceReportSchema = z.object({
  teacherId: z.string().min(1),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
});

/** teacher-performance-v2 için aynı şema (ayrı isim — çağıranlar arasında karışmasın). */
export const teacherPerformanceReportV2Schema = teacherPerformanceReportSchema;

const optionalEmail = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v : undefined))
  .pipe(z.string().email().optional());

const STUDENT_TYPE_ENUM = [
  "Hobi",
  "MEB",
  "London College of Music Hazırlık",
  "Konservatuvar Hazırlık",
  "Güzel Sanatlar Lisesi Hazırlık",
] as const;

/** Faz 1B — birden fazla öğrenci türü; tekrarsız, en fazla küme boyutu kadar. */
const studentTypesSchema = z.array(z.enum(STUDENT_TYPE_ENUM)).max(STUDENT_TYPE_ENUM.length).optional();

/** EPIC 4 — öğrenci profil alanları hepsi opsiyonel; boş bırakılırsa "" olarak değil undefined olarak normalize edilir. */
const optionalTrimmed = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

/**
 * Date-only (YYYY-MM-DD) opsiyonel alan — boş → undefined (`optionalTrimmed`
 * ile AYNI sözleşme); dolu ama biçimsiz/takvimde olmayan değer alan hatası
 * verir, Prisma'ya asla geçersiz tarih ulaşmaz.
 */
const optionalDateOnly = optionalTrimmed.refine((v) => v === undefined || isValidDateOnlyInput(v), {
  message: "Geçerli bir tarih seçin (YYYY-MM-DD).",
});

export const studentSchema = z.object({
  name: z.string().min(1),
  email: optionalEmail,
  /**
   * P0 (2026-09-05) — kök neden: hem `phone` hem `parentPhone` KOŞULSUZ
   * zorunluydu; `accountResponsibility` (ödeme/iletişim muhatabı) hangi
   * tarafın telefonunun asıl gerekli olduğunu zaten belirtiyordu ama bu
   * bilgi doğrulamada HİÇ kullanılmıyordu — personel muhatap olmayan tarafın
   * telefonunu da uydurmak zorunda kalıyordu. Aşağıdaki iki `.refine()`
   * asıl zorunluluğu `accountResponsibility`'e göre uygular (bkz. dosya
   * sonu); `createStudentTool` eksik kalan tarafı diğerinin numarasıyla
   * doldurur (bildirim akışları için `Student.phone`/`parentPhone` HÂLÂ
   * her zaman dolu kalır — tip/model DEĞİŞMEDİ, yalnız GİRDİ zorunluluğu).
   */
  phone: optionalTrimmed,
  /**
   * P0 (2026-09-05, ikinci tur) — `parentPhone` zaten koşullu hale gelmişti
   * ama `parentName` KOŞULSUZ zorunlu kalmıştı: ödeme/iletişim muhatabı
   * "Öğrencinin kendisi" (SELF_MANAGED) seçildiğinde personel, var olmayan
   * bir veli adı UYDURMAK zorunda kalıyordu. Artık ikisi de aynı kurala
   * bağlı (bkz. dosya sonundaki `.refine`'lar); PARENT_MANAGED'de veli adı
   * ZORUNLU, SELF_MANAGED'de OPSİYONEL (girilebilir, dayatılmaz).
   */
  parentName: optionalTrimmed,
  parentPhone: optionalTrimmed,
  /** Paket 7 — TC kimlik alanından hemen sonra istenir; opsiyonel (legacy kayıtlar kırılmaz). */
  motherName: optionalTrimmed,
  fatherName: optionalTrimmed,
  /**
   * P1 revizyonu — "Bizi nereden buldunuz?" Opsiyonel, zorunlu değil;
   * `diger` seçilirse serbest metin `referralSourceDetail` dolar (o da
   * opsiyonel — açıklama dayatılmaz, yalnızca gösterilir).
   */
  referralSource: z.enum(REFERRAL_SOURCES).optional(),
  referralSourceDetail: optionalTrimmed,
  branchId: z.string().min(1),
  /**
   * KÖK NEDEN DÜZELTMESİ (2026-08-29, P0-1 "Invalid input" runtime hatası) —
   * enstrüman kataloğu (`instrument-catalog.json`, bkz. `createInstrumentCatalogTool`)
   * yönetici tarafından SERBESTÇE genişletilebilir ("Bas Gitar"/"Ukulele" gibi
   * yeni girişler eklenebilir) ama bu alan SABİT 8'li bir enum'a kilitliydi —
   * kayıt formu (yeni/page.tsx) dropdown'ı kataloğun GÜNCEL/aktif listesini
   * gösterdiğinden, katalogda olup enum'da OLMAYAN bir enstrüman seçilince
   * (gerçek, geçerli bir kullanıcı eylemi) sunucu tarafı doğrulama jenerik
   * "Invalid input" ile REDDEDİYOR ve bu, `<form action=...>` (useActionState
   * YOK) deseninde yakalanmamış bir sunucu hatası olarak istemciye sızıyordu.
   * Asıl anlamlı doğrulama zaten `createStudentTool`'da GERÇEK veriyle
   * yapılıyor (öğretmen var mı/aktif mi/bu enstrümanı biliyor mu) — statik
   * enum burada YALNIZCA kataloğu YOK SAYAN, gereksiz ve şimdi zararlı bir
   * ikinci kapıydı.
   */
  instrument: z.string().min(1),
  teacherId: z.string().min(1),
  packageName: z.string().min(1),
  weeklyLessonCount: z.coerce.number().int().min(1).max(2),
  monthlyFee: z.coerce.number().int().min(0),
  notes: z.string().optional(),
  studentType: z.enum(STUDENT_TYPE_ENUM).optional(),
  /** Faz 1B — verilirse tekil studentType'ın YERİNE birincil kaynak olur. */
  studentTypes: studentTypesSchema,
  /**
   * P0-C (2026-09-02) — ÖNCEDEN opsiyoneldi (`optionalTrimmed`); ilk dönem
   * tahsilatı/ders planı bu tarihe bağlı olduğundan artık ZORUNLU — sunucu
   * (buradaki zod mesajı, yalnız istemcinin `required` attribute'una
   * GÜVENMEDEN) SPESİFİK bir Türkçe alan hatası üretir.
   */
  enrollmentStartDate: z.string().trim().min(1, "Kayıt tarihi zorunludur."),
  /**
   * P0 (2026-09-05) — DERS BAŞLANGIÇ TARİHİ, kayıt tarihinden BAĞIMSIZ.
   * Opsiyonel: gönderilmezse kayıt tarihi kullanılır (eski çağıranlar/CSV/AI
   * için davranış aynen korunur). İlk tahsilat bu tarihten itibaren sayar.
   */
  lessonStartDate: optionalTrimmed,
  intendedDurationMonths: z.coerce.number().int().min(1, "Kayıt süresi 1-12 ay olmalıdır.").max(12, "Kayıt süresi 1-12 ay olmalıdır.").optional(),
  /** K — kayıtta seçilen ders gün/saatleri ("Salı 15:00, Perşembe 16:00"). Kalıcı; sözleşme ve program üretimi bunu okur. */
  lessonScheduleText: z.string().max(300).optional(),
  enrollmentEndDate: optionalTrimmed,
  /**
   * P0-C (2026-09-02) — haftalık ders sıklığına karşılık gelen GERÇEK ders
   * günleri (`Date.getUTCDay()` ile aynı 0=Pazar..6=Cumartesi kodlaması,
   * kodda zaten yaygın `dayOfWeek` konvansiyonu). Tam sayı/tekrarsızlık şema
   * seviyesinde; `weeklyLessonCount`e göre TAM SAYI eşleşmesi (ör. haftada 2
   * ders için 2 FARKLI gün) `createStudentTool`da iş kuralı olarak
   * doğrulanır (schema burada yalnız şekil kontrolü yapar).
   */
  lessonDays: z.array(z.coerce.number().int().min(0).max(6)).optional(),
  level: optionalTrimmed,
  targetExam: optionalTrimmed,
  /**
   * MEB Paneli — MEB seviye dönemi + sınav. Biçim kontrolü burada
   * (date-only); MEB-ise-zorunlu + tutarlılık `createStudentTool`'daki
   * `validateMebFields` kapısında (birleştirilmiş görünüm gerekir).
   * MEB seçili değilse tool katmanı bu değerleri STRIP eder (yazılmaz).
   */
  mebLevelStartDate: optionalDateOnly,
  mebLevelEndDate: optionalDateOnly,
  mebExamDate: optionalDateOnly,
  mebExamAttended: z.boolean().optional(),
  specialNotes: optionalTrimmed,
  /** ÖNCELİK 4 (devam) — öğrencinin Yoklama Takvimi dönemi (Güz/Yaz). Verilmezse legacy (undefined) — kayıt akışı kırılmaz. */
  termType: z.enum(["guz", "yaz"]).optional(),
  /** ÖNCELİK 4 (devam) — Paket Yönetimi + ek profil alanları. Hepsi opsiyonel — legacy kayıt akışı kırılmaz. */
  packageId: z.string().optional(),
  birthDate: optionalDateOnly,
  birthPlace: optionalTrimmed,
  schoolOrOccupation: optionalTrimmed,
  address: optionalTrimmed,
  lessonDurationMinutes: z.coerce.number().int().refine((v) => [30, 40, 50].includes(v), {
    message: "Ders süresi yalnızca 30, 40 veya 50 dakika olabilir.",
  }).optional(),
  /** Package C — paket seçildiğinde uygulanacak indirim + ödeme profili. Hepsi opsiyonel — legacy akış kırılmaz. */
  discountType: z.enum(["percent", "amount"]).optional(),
  discountValue: z.coerce.number().min(0).optional(),
  /**
   * Paket & Kampanya Motoru — kayıtta uygulanacak kampanya id'leri (çoklu seçim).
   * Sunucu her birini (aktif + tarih + şube) doğrular, `resolveCampaignStack`
   * ile nihai yüzdeyi türetir. Manuel indirim (discountType/discountValue) ile
   * BİRLİKTE gönderilemez — tek indirim kaynağı kuralı (createStudentTool kapısı).
   */
  campaignIds: z.array(z.string().min(1)).max(10).optional(),
  paymentMethod: z.enum(["credit_card", "cash", "transfer"]).optional(),
  paymentDueDay: z.coerce.number().int().min(1).max(31).optional(),
  /** Verilirse tekil `paymentDueDay`'in YERİNE birincil kaynak olur (bkz. actionUpdateStudentProfile). */
  paymentDueRanges: paymentDueRangesSchema,
  /** Yalnız yetkili yönetici (tool RBAC'ı) elle nihai ücret girebilir — verilirse gerekçe zorunludur. */
  monthlyFeeOverrideAmount: z.coerce.number().int().min(0).optional(),
  monthlyFeeOverrideReason: optionalTrimmed,
  /**
   * Karma Öğrenci Portalı — ödeme/iletişimde muhatap kararı (rol değil).
   * Verilmezse "PARENT_MANAGED" (mevcut varsayılan davranış korunur).
   */
  accountResponsibility: z.enum(["PARENT_MANAGED", "SELF_MANAGED"]).optional(),
  /**
   * Yönetici bilinçli olarak işaretlerse (checkbox) VE `email` doluysa,
   * öğrenci kaydı oluşturulurken aynı anda portal girişi + StudentPortalAccess
   * (status=active) sağlanır. İşaretlenmezse yalnızca öğrenci kaydı oluşur —
   * hiçbir hesap otomatik açılmaz (bkz. PROJECT kapsam dışı kuralı).
   */
  createPortalAccess: z.boolean().optional(),
  portalAccessType: z.enum(["GUARDIAN", "SELF"]).optional(),
  /**
   * Owner policy (2026-08-30) — "İlk ödeme her zaman kayıt esnasında alınacaktır."
   * `createContract`'taki (contracts.ts) AYNI şekil (method/amount/collectedAt/
   * reference/note) — kasıtlı olarak burada TEKRARLANIYOR: bu, kayıt TAMAMLANMA
   * anındaki (createStudentTool) tahsilat, sözleşme oluşturmadan (ayrı, sonraki
   * bir adım) BAĞIMSIZ ve ondan ÖNCE gelen bir zorunluluk.
   */
  firstPaymentCollected: z
    .object({
      method: z.enum(["credit_card", "cash", "transfer"]),
      amount: z.coerce.number().int().positive(),
      collectedAt: z.string().min(1),
      reference: optionalTrimmed,
      note: optionalTrimmed,
    })
    .optional(),
  /** Yalnızca gerçekten istisnai/gecikmeli ilk tahsilat için — yetkili personel gerekçesi zorunlu, gün-of-ay tetiklemez (bkz. createStudentTool). */
  firstPaymentExceptionReason: optionalTrimmed,
  /**
   * P0-1 (2026-09-02 düzeltme) — "ders başı ücret" yöneticinin girdiği bir
   * alan DEĞİLDİR ve ücretlendirme modeli SEÇİLEMEZ; sistem her yeni
   * kayıtta aylık ücret + haftalık sıklıktan otomatik türetir (bkz.
   * `derivePerLessonAmount`, period-lesson-billing.ts). Bilinçli olarak bu
   * şemada `pricingModel`/`perLessonNetFee` alanı YOK — zod bilinmeyen
   * alanları sessizce ATAR (strip), yani bir istemci sahte bir
   * `perLessonNetFee` gönderse bile `createStudentTool`'a hiç ulaşmaz.
   *
   * İlk tahsilat, motorun ürettiği otomatik ilk dönem tutarından FARKLI
   * girildiyse gerekçe zorunlu (bkz. `first-payment-adjustment.ts`) —
   * serbest, izsiz bir istisna alanı DEĞİL, `createStudentTool` otomatik
   * tutarla karşılaştırıp reddeder/kabul eder, asla sessizce geçmez.
   */
  firstPaymentAdjustmentReason: optionalTrimmed,
  /** Sahip kararı (2026-09-16) — ilk tahsilata takip eden ayın tam ücreti de eklendi mi (kayıt ekranındaki AÇIK seçim). */
  firstCollectionIncludesNextMonth: z.boolean().optional(),
  /** H — deneme dersinden dönüşüm: kaynak TrialLesson.id (sunucu doğrular, dönüşümü yapan = oturum). */
  convertedFromTrialId: z.string().min(1).max(80).optional(),
}).refine((v) => v.monthlyFeeOverrideAmount === undefined || !!v.monthlyFeeOverrideReason, {
  message: "Manuel ücret girildiyse gerekçe zorunludur.",
  path: ["monthlyFeeOverrideReason"],
}).refine((v) => !v.createPortalAccess || !!v.email, {
  message: "Portal erişimi için e-posta zorunludur.",
  path: ["email"],
}).refine((v) => v.accountResponsibility === "SELF_MANAGED" || !!v.parentName, {
  message: "Veli adı soyadı zorunludur — ödeme/iletişim muhatabı veli olarak seçili.",
  path: ["parentName"],
}).refine((v) => v.accountResponsibility === "SELF_MANAGED" || !!v.parentPhone, {
  message: "Veli telefonu zorunludur — ödeme/iletişim muhatabı veli olarak seçili.",
  path: ["parentPhone"],
}).refine((v) => v.accountResponsibility !== "SELF_MANAGED" || !!v.phone, {
  message: "Öğrenci telefonu zorunludur — ödeme/iletişim muhatabı öğrencinin kendisi olarak seçili.",
  path: ["phone"],
});

/** Öğrenci düzenleme ekranından SONRADAN portal erişimi/davet oluşturma — task #34. */
export const provisionStudentPortalAccessSchema = z.object({
  studentId: z.string().min(1),
  email: z.string().email(),
  accessType: z.enum(["GUARDIAN", "SELF"]),
});

export const updateStudentProfileSchema = z
  .object({
    studentId: z.string().min(1),
    studentType: z.enum(STUDENT_TYPE_ENUM).optional(),
    /** Faz 1B — verilirse tekil studentType'ın YERİNE birincil kaynak olur. */
    studentTypes: studentTypesSchema,
    enrollmentStartDate: optionalTrimmed,
    lessonStartDate: optionalTrimmed,
    intendedDurationMonths: z.coerce.number().int().min(1, "Kayıt süresi 1-12 ay olmalıdır.").max(12, "Kayıt süresi 1-12 ay olmalıdır.").optional(),
  /** K — kayıtta seçilen ders gün/saatleri ("Salı 15:00, Perşembe 16:00"). Kalıcı; sözleşme ve program üretimi bunu okur. */
  lessonScheduleText: z.string().max(300).optional(),
    enrollmentEndDate: optionalTrimmed,
    level: optionalTrimmed,
    targetExam: optionalTrimmed,
    /**
     * MEB Paneli — MEB seviye dönemi + sınav (biçim: date-only). MEB-ise-
     * zorunlu + tutarlılık `updateStudentProfileTool`'daki `validateMebFields`
     * kapısında (mevcut kayıtla birleştirilmiş görünüm gerekir). Tür
     * kaldırılınca kayıtlı değerler SİLİNMEZ (kolonlar korunur).
     */
    mebLevelStartDate: optionalDateOnly,
    mebLevelEndDate: optionalDateOnly,
    mebExamDate: optionalDateOnly,
    mebExamAttended: z.boolean().optional(),
    specialNotes: optionalTrimmed,
    /** ÖNCELİK 4 (devam) — öğrencinin Yoklama Takvimi dönemi (Güz/Yaz varsayılanı). */
    termType: z.enum(["guz", "yaz"]).optional(),
    /**
     * Bu sprint — temel iletişim/kişisel alanlar (T.C. kimlik hariç; o ayrı
     * `setNationalIdSchema`/`setNationalIdTool`'dan, mevcut şifreleme/audit
     * yoluyla değişir). `teacherId`/`instruments` bilinçli olarak BU şemaya
     * dahil edilmedi — MT-003 ürün kararı: bu ekranda öğretmen/enstrüman
     * DEĞİŞTİRİLEMEZ (kayıt oluşturmada seçilir, sonradan değişimin ders/
     * hakediş etkisi ayrı bir akış gerektirir).
     */
    phone: optionalTrimmed,
    parentName: optionalTrimmed,
    parentPhone: optionalTrimmed,
    motherName: optionalTrimmed,
    fatherName: optionalTrimmed,
    address: optionalTrimmed,
    birthDate: optionalDateOnly,
    birthPlace: optionalTrimmed,
    schoolOrOccupation: optionalTrimmed,
    /** P1 revizyonu — "Bizi nereden buldunuz?" sonradan düzeltilebilir (detay ekranı). */
    referralSource: z.enum(REFERRAL_SOURCES).optional(),
    referralSourceDetail: optionalTrimmed,
    communicationOptOut: z.boolean().optional(),
    /** Karma Öğrenci Portalı — ödeme/iletişim muhatabı kararı (rol değil, iş kararı). */
    accountResponsibility: z.enum(["PARENT_MANAGED", "SELF_MANAGED"]).optional(),
    /** Bu sprint — kayıt kimliği/eğitim profili düzenlemesi eklendi. */
    name: z.string().min(1).optional(),
    email: optionalEmail,
    /** Tenant-scoped: tools.ts içinde `data.settings.branches`'ta var mı diye doğrulanır. */
    branchId: optionalTrimmed,
    educationMethod: z.enum(["Suzuki", "Klasik", "LCM", "MEB", "Kurum İçi", "Diğer"]).optional(),
    /**
     * ÖNCELİK 4 (devam) — Paket Yönetimi + Ödeme profili: paket, süre,
     * indirim, ödeme günü/türü, override. `computeStudentMonthlyAmount`
     * (src/lib/student-payment-profile.ts) bu alanları okur; Yoklama
     * Takvimi ve Ödemeler ekranı AYNI hesaba göre varsayılan tutar gösterir.
     * discountType burada BİLİNÇLİ OLARAK "percentage"/"fixed" — Package C'nin
     * ayrı `updateStudentPaymentProfileSchema`'sındaki "percent"/"amount"
     * İLE KARIŞMAZ (bkz. types.ts DiscountType yorumu, iki ayrı yazma yolu).
     */
    packageId: z.string().optional(),
    lessonDurationMinutes: z.coerce.number().int().refine((v) => [30, 40, 50].includes(v), {
      message: "Ders süresi yalnızca 30, 40 veya 50 dakika olabilir.",
    }).optional(),
    paymentMethod: z.enum(["credit_card", "cash", "transfer"]).optional(),
    paymentDueDay: z.coerce.number().int().min(1).max(28).optional(),
    /** Faz 1A — verilirse tekil `paymentDueDay`'in YERİNE birincil kaynak olur (bkz. updateStudentProfileTool senkron kuralı). */
    paymentDueRanges: paymentDueRangesSchema,
    discountType: z.enum(["percentage", "fixed"]).optional(),
    discountValue: z.coerce.number().int().min(0).optional(),
    /** Öğrenciye özel override tutar (TL) — set edilirse paket/indirim hesabının yerine geçer. */
    paymentAmount: z.coerce.number().int().min(0).optional(),
  })
  .refine((v) => (v.discountType === undefined) === (v.discountValue === undefined), {
    message: "İndirim türü ve değeri birlikte belirtilmeli.",
    path: ["discountValue"],
  })
  .refine((v) => v.discountType !== "percentage" || v.discountValue === undefined || v.discountValue <= 100, {
    message: "Yüzde indirim 100'ü geçemez.",
    path: ["discountValue"],
  });

/**
 * Package C — öğrenci paket/süre/indirim/ödeme günü/türü ve (yetkili
 * yöneticiyse) manuel nihai ücret override'ı TEK bu şema/tool üzerinden
 * güncellenir — RBAC (SCHOOL_ADMIN/SUPER_ADMIN) tool katmanında.
 */
export const updateStudentPaymentProfileSchema = z
  .object({
    studentId: z.string().min(1),
    packageId: z.string().min(1).optional(),
    lessonDurationMinutes: z.coerce.number().int().refine((v) => [30, 40, 50].includes(v), {
      message: "Ders süresi yalnızca 30, 40 veya 50 dakika olabilir.",
    }).optional(),
    discountType: z.enum(["percent", "amount"]).optional(),
    discountValue: z.coerce.number().min(0).optional(),
    paymentMethod: z.enum(["credit_card", "cash", "transfer"]).optional(),
    paymentDueDay: z.coerce.number().int().min(1).max(31).optional(),
    monthlyFeeOverrideAmount: z.coerce.number().int().min(0).optional(),
    monthlyFeeOverrideReason: optionalTrimmed,
  })
  .refine((v) => v.monthlyFeeOverrideAmount === undefined || !!v.monthlyFeeOverrideReason, {
    message: "Manuel ücret girildiyse gerekçe zorunludur.",
    path: ["monthlyFeeOverrideReason"],
  });

const INSTRUMENT_LEVEL_ENUM = ["Başlangıç", "Orta", "İleri"] as const;

/**
 * ÖNCELİK 4 (devam) — çoklu enstrüman satırı: {enstrüman, seviye}.
 * `instrument` BİLİNÇLİ OLARAK sabit enum değil, serbest string — kurumun
 * Enstrümanlar kataloğundaki ek enstrümanları (ör. Bas Gitar) da kabul
 * edebilmesi için. Gerçek doğrulama (istemci enum'una güvenilmez) tools.ts
 * içinde tenant-scoped `resolveActiveInstrumentNames` ile yapılır — bkz.
 * createTeacherTool/updateTeacherInstrumentsTool.
 */
export const teacherInstrumentSkillSchema = z.object({
  instrument: z.string().min(1),
  level: z.enum(INSTRUMENT_LEVEL_ENUM),
});

const teacherAvailabilityWindowSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Saat HH:mm biçiminde olmalı"),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Saat HH:mm biçiminde olmalı"),
    /** Package D — verilmezse "tüm şubeler" (açık, dokümante edilmiş fallback — bkz. src/lib/teacher-branches.ts). */
    branchId: z.string().min(1).optional(),
  })
  .refine((w) => w.start < w.end, { message: "Bitiş saati başlangıçtan sonra olmalı" });

export const teacherSchema = z
  .object({
    name: z.string().min(1),
    email: optionalEmail,
    phone: z.string().min(1),
    branchId: z.string().min(1),
    /**
     * Ek atanmış şubeler (`Teacher.branchIds` — birincil `branchId` HER ZAMAN
     * dahildir, bkz. teacher-branches.ts). Kayıt anında da seçilebilsin diye
     * eklendi; verilmezse yalnız birincil şube (eski davranış).
     */
    branchIds: z.array(z.string().min(1)).optional(),
    /**
     * P0-1 (2026-08-29) — `instrumentLevels[].instrument` gibi BİLİNÇLİ
     * OLARAK serbest string (yukarıdaki yorum) — bu tekil (legacy) alan da
     * AYNI sabit-enum/katalog senkron-dışılığı yaşıyordu (bkz.
     * studentSchema.instrument yorumu). Gerçek doğrulama artık
     * `createTeacherTool`'da `resolveActiveInstrumentNames` ile yapılır.
     */
    instrument: z.string().min(1),
    /**
     * ÖNCELİK 4 (devam) — çoklu enstrüman+seviye. Verilmezse legacy tek
     * enstrüman davranışı (yalnızca `instrument`) korunur — geriye dönük
     * uyumluluk için zorunlu değil.
     */
    instrumentLevels: z.array(teacherInstrumentSkillSchema).optional(),
    /**
     * Oluşturma anında haftalık müsaitlik. Verilmezse mevcut varsayılan
     * (Pzt–Cum 10:00–18:00/16:00) korunur — geriye dönük uyumlu, zorunlu
     * değil. Boş dizi de geçerlidir (hiç müsaitlik yok).
     */
    availability: z.array(teacherAvailabilityWindowSchema).optional(),
    /**
     * Paket 7 — kayıt sırasında da girilebilsin diye eklenen özlük/eğitim/
     * acil durum alanları. Hepsi opsiyonel — daha önce yalnızca öğretmen
     * detay ekranından (updateTeacherProfileTool) girilebiliyordu; artık
     * kayıt anında da girilebilir, kayıt sonrası zorunlu ek bilgi girişi
     * gerekmez.
     */
    highSchool: optionalTrimmed,
    university: optionalTrimmed,
    graduationYear: z.coerce.number().int().min(1950).max(2100).optional(),
    birthDate: optionalTrimmed,
    address: optionalTrimmed,
    contractStartDate: optionalTrimmed,
    contractEndDate: optionalTrimmed,
    employmentType: z.enum(["tam_zamanli", "yari_zamanli", "serbest"]).optional(),
    hireDate: optionalTrimmed,
    emergencyContactName: optionalTrimmed,
    emergencyContactPhone: optionalTrimmed,
    weeklyHoursThreshold: z.coerce.number().int().min(1).max(80).optional(),
    personnelNotes: optionalTrimmed,
  })
  .refine(
    (v) => {
      if (!v.instrumentLevels || v.instrumentLevels.length === 0) return true;
      const seen = new Set(v.instrumentLevels.map((r) => r.instrument));
      return seen.size === v.instrumentLevels.length;
    },
    { message: "Aynı enstrüman birden fazla kez eklenemez.", path: ["instrumentLevels"] }
  );

const TEACHER_EMPLOYMENT_TYPE_ENUM = ["tam_zamanli", "yari_zamanli", "serbest"] as const;

/**
 * Package D — öğretmen özlük/idari alanları + ek şube ataması. T.C. kimlik
 * BU şemada YOK — ayrı `setNationalIdSchema`/`setNationalIdTool` üzerinden
 * (mevcut öğrenci deseniyle aynı, tek doğrulama/şifreleme yolu).
 */
export const updateTeacherProfileSchema = z
  .object({
    teacherId: z.string().min(1),
    /**
     * Bu sprint — kayıt kimliği alanları eklendi. Enstrüman/müsaitlik/ders
     * ücreti bilinçli olarak burada YOK — kendi özel akışları var
     * (updateTeacherInstrumentsTool, updateTeacherAvailabilityTool,
     * createFeeRuleTool/updateFeeRuleTool) — tekrarlanmaz.
     */
    name: z.string().min(1).optional(),
    email: optionalEmail,
    phone: optionalTrimmed,
    /** 8. tur — birincil şube de düzenlenebilir (ek şubeler `branchIds`). */
    branchId: z.string().min(1).optional(),
    branchIds: z.array(z.string().min(1)).optional(),
    employmentType: z.enum(TEACHER_EMPLOYMENT_TYPE_ENUM).optional(),
    hireDate: optionalTrimmed,
    terminationDate: optionalTrimmed,
    contractStartDate: optionalTrimmed,
    contractEndDate: optionalTrimmed,
    birthDate: optionalTrimmed,
    address: optionalTrimmed,
    highSchool: optionalTrimmed,
    university: optionalTrimmed,
    graduationYear: z.coerce.number().int().min(1950, "Mezuniyet yılı 1950'den önce olamaz.").max(2100, "Mezuniyet yılı geçerli değil.").optional(),
    maxDailyLessons: z.coerce.number().int().min(1, "Günlük ders limiti en az 1 olmalı.").max(20, "Günlük ders limiti en fazla 20 olabilir.").optional(),
    weeklyHoursThreshold: z.coerce.number().int().min(1, "Eşik en az 1 saat olmalı.").max(80, "Eşik en fazla 80 saat olabilir.").optional(),
    emergencyContactName: optionalTrimmed,
    emergencyContactPhone: optionalTrimmed,
    personnelNotes: optionalTrimmed,
  })
  .refine((v) => !v.contractStartDate || !v.contractEndDate || v.contractEndDate >= v.contractStartDate, {
    message: "Sözleşme bitiş tarihi başlangıçtan önce olamaz.",
    path: ["contractEndDate"],
  })
  .refine((v) => !v.hireDate || !v.terminationDate || v.terminationDate >= v.hireDate, {
    message: "Ayrılış tarihi işe girişten önce olamaz.",
    path: ["terminationDate"],
  });

export const roomSchema = z.object({
  name: z.string().min(1),
  branchId: z.string().min(1),
  capacity: z.coerce.number().int().min(1),
  /** Bkz. studentSchema.instrument yorumu — sabit enum yerine katalog-uyumlu serbest metin. */
  instruments: z.array(z.string().min(1)).min(1),
});

export const lessonSchema = z.object({
  studentId: z.string().min(1),
  teacherId: z.string().min(1),
  roomId: z.string().min(1),
  /** Bkz. studentSchema.instrument yorumu — sabit enum yerine katalog-uyumlu serbest metin; gerçek eşleşme kontrolü makeup-engine.ts'te yapılır. */
  instrument: z.string().min(1),
  startAt: z.string().min(1),
  durationMinutes: z.coerce.number().refine((v) => (LESSON_DURATION_OPTIONS as readonly number[]).includes(v), {
    message: "Ders süresi yalnızca 30, 40 veya 50 dakika olabilir.",
  }).optional(),
  /** ÖNCELİK 4 (devam) — opsiyonel akademik dönem etiketi; verilmezse legacy (undefined). */
  term: z.enum(["guz", "yaz"]).optional(),
  academicYearStart: z.coerce.number().int().min(2000).max(2100).optional(),
  /**
   * İş 3 — kullanıcı "Öğretmen bu saatte müsait görünmüyor, yine de
   * planlansın mı?" uyarısını AÇIKÇA onayladıysa true. Yalnızca
   * TEACHER_UNAVAILABLE'ı atlatır; varsayılan false/undefined — onay
   * olmadan hiçbir uyarı otomatik bypass edilmez.
   */
  overrideAvailability: z.coerce.boolean().optional(),
});

export const paymentRecordSchema = z.object({
  studentId: z.string().min(1),
  description: z.string().min(1),
  amount: z.coerce.number().int().min(1),
  dueDate: z.string().min(1),
});

export const updateLessonScheduleSchema = z
  .object({
    lessonId: z.string().min(1),
    startAt: z.string().min(1).optional(),
    durationMinutes: z.coerce.number().int().min(30).max(240).optional(),
  })
  .refine((d) => d.startAt !== undefined || d.durationMinutes !== undefined, {
    message: "startAt veya durationMinutes gerekli",
  });

export const cancelLessonSchema = z.object({
  lessonId: z.string().min(1),
});

export const suggestLessonSlotsSchema = z.object({
  studentId: z.string().min(1),
  /** Bkz. studentSchema.instrument yorumu — sabit enum yerine katalog-uyumlu serbest metin; gerçek eşleşme kontrolü makeup-engine.ts'te yapılır. */
  instrument: z.string().min(1),
  teacherId: z.string().min(1).optional(),
  daysAhead: z.coerce.number().int().positive().max(60).optional(),
  maxSlots: z.coerce.number().int().positive().max(50).optional(),
});

/** Nesne tabanı — `.extend()` gerektiren `createLessonSeriesSchema` bundan türer. */
export const lessonSeriesParamsBaseSchema = z.object({
  studentId: z.string().min(1),
  teacherId: z.string().min(1),
  roomId: z.string().min(1),
  branchId: z.string().min(1),
  /** Bkz. studentSchema.instrument yorumu — sabit enum yerine katalog-uyumlu serbest metin; gerçek eşleşme kontrolü makeup-engine.ts'te yapılır. */
  instrument: z.string().min(1),
  weekday: z.coerce.number().int().min(0).max(6),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Saat HH:mm biçiminde olmalı"),
  durationMinutes: z.coerce.number().int().min(15).max(240),
  startsOn: z.string().min(1),
  endsOn: z.string().min(1),
  /** ÖNCELİK 4 (devam) — opsiyonel akademik dönem etiketi; verilmezse legacy (undefined). */
  term: z.enum(["guz", "yaz"]).optional(),
  academicYearStart: z.coerce.number().int().min(2000).max(2100).optional(),
  /** Faz 6 — demo/test amaçlı otomatik üretim etiketi (bkz. scripts/seed-demo-schedule.ts). */
  demoTag: z.string().min(1).optional(),
});

/**
 * ÖNCELİK 4 (devam) — dönem seçiliyse o dönemin haftalık kapalı gün kuralı
 * (Güz: Pazartesi, Yaz: Cts/Paz); term verilmemişse LEGACY davranış
 * (yalnızca Pazartesi) korunur — object-level çünkü karar `term`'e bağlı.
 */
function refineWeekdayAgainstTerm<T extends z.ZodType<{ weekday: number; term?: "guz" | "yaz" }>>(schema: T) {
  return schema.superRefine((v, ctx) => {
    const closed = v.term ? (v.term === "yaz" ? [0, 6] : [1]) : [1];
    if (closed.includes(v.weekday)) {
      ctx.addIssue({
        code: "custom",
        path: ["weekday"],
        message: v.term
          ? `${v.term === "yaz" ? "Cumartesi/Pazar" : "Pazartesi"} bu dönemde okul kapalıdır — bu gün için ders serisi oluşturulamaz.`
          : "Pazartesi okul kapalıdır — bu gün için ders serisi oluşturulamaz.",
      });
    }
  });
}

export const lessonSeriesParamsSchema = refineWeekdayAgainstTerm(lessonSeriesParamsBaseSchema);

export const createLessonSeriesSchema = refineWeekdayAgainstTerm(
  lessonSeriesParamsBaseSchema.extend({
    skipConflicts: z.coerce.boolean().optional(),
  })
);

export const cancelSeriesFromLessonSchema = z.object({
  lessonId: z.string().min(1),
});

const lessonEditScopeSchema = z.enum(["single", "fromHereOnward", "entireSeries"]);

export const deleteLessonsSchema = z.object({
  lessonId: z.string().min(1),
  scope: lessonEditScopeSchema,
  /** Opsiyonel silme gerekçesi — denetim kaydına yazılır. */
  reason: z.string().trim().max(500).optional(),
});

export const reviseLessonsSchema = z.object({
  lessonId: z.string().min(1),
  scope: lessonEditScopeSchema,
  startAt: z.string().min(1).optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Saat SS:DD biçiminde olmalı (ör. 15:50).").optional(),
  weekday: z.coerce.number().int().min(0).max(6).optional(),
  durationMinutes: z.coerce.number().int().min(30, "Ders süresi en az 30 dakika olmalı.").max(240).optional(),
  allowAvailabilityOverride: z.boolean().optional(),
});

export const cancelEntireSeriesSchema = z.object({
  seriesId: z.string().min(1),
});

export const makeupSlotSchema = z.object({
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  teacherId: z.string().min(1),
  roomId: z.string().min(1),
  branchId: z.string().min(1),
  score: z.number(),
  reasons: z.array(z.string()),
});

const INSTRUMENT_ENUM = ["Piyano", "Yan Flüt", "Gitar", "Bateri", "Keman", "Şan", "Bağlama", "Elektro Gitar"] as const;

export const createFeeRuleSchema = z.object({
  teacherId: z.string().min(1),
  branchId: z.string().min(1).optional(),
  instrument: z.enum(INSTRUMENT_ENUM).optional(),
  perMinuteRate: z.coerce.number().positive(),
  effectiveFrom: z.string().min(1),
  effectiveTo: z.string().min(1).optional(),
});

export const updateFeeRuleSchema = z.object({
  ruleId: z.string().min(1),
  teacherId: z.string().min(1).optional(),
  branchId: z.string().min(1).optional(),
  instrument: z.enum(INSTRUMENT_ENUM).optional(),
  perMinuteRate: z.coerce.number().positive().optional(),
  effectiveFrom: z.string().min(1).optional(),
  effectiveTo: z.string().min(1).optional(),
});

export const computeTeacherPayoutSchema = z.object({
  teacherId: z.string().min(1),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
});

/** PRODUCT_BACKLOG §3.4 — oluşturma anında yönetici açıkça nakit/havale seçerek varsayılan eşiği ezebilir. */
export const createTeacherPayoutSchema = computeTeacherPayoutSchema.extend({
  paymentMethod: z.enum(["cash", "transfer"]).optional(),
});

export const markTeacherPayoutPaidSchema = z.object({
  payoutId: z.string().min(1),
  method: z.string().min(1).optional(),
});

/** PRODUCT_BACKLOG §3.4 — yönetici override: mevcut bir hakediş kaydının ödeme yöntemini (nakit/havale) değiştirir. */
export const updateTeacherPayoutPaymentMethodSchema = z.object({
  payoutId: z.string().min(1),
  method: z.enum(["cash", "transfer"]),
});

export const updateFeeRoundingModeSchema = z.object({
  feeRoundingMode: z.enum(["exact_minutes", "round_30", "fixed_package"]),
});

/** Telafi Merkezi politika penceresi — 1-365 gün arası, yalnız ileri yönlü etkilidir. */
export const updateMakeupWindowDaysSchema = z.object({
  makeupWindowDays: z.number().int().min(1).max(365),
});

export const updateSchoolLogoSchema = z.object({
  fileMimeType: z.string().min(1),
  fileData: z.string().min(1),
});

/** Aylık öğrenci telafi hakkı — 0 = kapalı, max 31. */
export const updateMonthlyMakeupAllowanceSchema = z.object({
  monthlyMakeupAllowance: z.number().int().min(0).max(31),
});

const weekdayArray = z.array(z.number().int().min(0).max(6)).max(7);

/** Paket 6 — dönem bazlı haftalık çalışma takvimi (0=Pazar..6=Cumartesi). */
export const updateTermWeeklyClosedDaysSchema = z.object({
  guz: weekdayArray,
  yaz: weekdayArray,
});

/** EPIC 1 — veli kendi çocuğu için, admin herkes için değiştirebilir (bkz. updateCommunicationPreferenceTool). */
export const updateCommunicationPreferenceSchema = z.object({
  studentId: z.string().min(1),
  communicationOptOut: z.boolean(),
});

/** PRODUCT_BACKLOG §2.2 — TR ile başlayan, boşluksuz 26 karakter IBAN. */
const optionalIban = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim().toUpperCase().replace(/\s+/g, "") : undefined))
  .refine((v) => v === undefined || /^TR\d{24}$/.test(v), {
    message: "IBAN, TR ile başlayan 26 karakterlik geçerli bir IBAN olmalıdır.",
  });

/** EPIC 1 — okulun gecikmiş tahsilat otomasyon ayarları. */
export const updateCollectionsSettingsSchema = z.object({
  frequencyLimitDays: z.number().int().min(1).max(30),
  autoSendEnabled: z.boolean(),
  /** PRODUCT_BACKLOG §2.2 — MEB → VakıfBank, diğer → Halkbank */
  vakifbankIban: optionalIban,
  halkbankIban: optionalIban,
  /** Faz 2 — kayıt sözleşmesi ödeme penceresi (yalnız gelecek sözleşmeleri etkiler). */
  contractCardWindowEndDay: z.number().int().min(1).max(28).optional(),
  contractBankCashDueDay: z.number().int().min(1).max(28).optional(),
});

export const markNotificationReadSchema = z.object({
  notificationId: z.string().min(1),
});

function isValidNotificationsCursor(cursor: string): boolean {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64").toString("utf8"));
    return typeof parsed?.createdAt === "string" && typeof parsed?.id === "string";
  } catch {
    return false;
  }
}

export const listNotificationsSchema = z.object({
  cursor: z
    .string()
    .min(1)
    .refine(isValidNotificationsCursor, { message: "Geçersiz cursor" })
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const STUDENT_TYPE_FOR_AUDIENCE = [
  "Hobi",
  "MEB",
  "London College of Music Hazırlık",
  "Konservatuvar Hazırlık",
  "Güzel Sanatlar Lisesi Hazırlık",
] as const;

/**
 * EPIC 5 — audienceRef, audienceType'a göre farklı şekiller alır; hangi
 * anahtarların dolu olması gerektiği createAnnouncementTool içinde değil
 * burada, şema seviyesinde zorlanır (branch→branchId, studentType→
 * studentType, selected→userIds; diğerleri ref gerektirmez).
 */
const announcementAttachmentInputSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  /** data URL veya ham base64 — sunucuda doğrulanır. */
  fileData: z.string().min(1).max(4_000_000),
});

const ANNOUNCEMENT_AUDIENCE_TYPES = [
  "all",
  "branch",
  "teachers",
  "parents",
  "students",
  "studentType",
  "instrument",
  "selected",
] as const;

const announcementAudienceRefSchema = z.union([
  z.object({ branchId: z.string().min(1) }),
  z.object({ studentType: z.enum(STUDENT_TYPE_FOR_AUDIENCE) }),
  z.object({ instrument: z.array(z.enum(INSTRUMENTS as [string, ...string[]])).min(1) }),
  z.object({ userIds: z.array(z.string().min(1)).min(1) }),
]);

function audienceRefMatchesType(audienceType: string, audienceRef: unknown): boolean {
  if (audienceType === "branch") return !!audienceRef && "branchId" in (audienceRef as object);
  if (audienceType === "studentType") return !!audienceRef && "studentType" in (audienceRef as object);
  if (audienceType === "instrument") return !!audienceRef && "instrument" in (audienceRef as object);
  if (audienceType === "selected") return !!audienceRef && "userIds" in (audienceRef as object);
  return true;
}

/** Faz 4 — çoklu segment (OR). En az 1, en fazla 10 kural. */
const audienceRuleSchema = z
  .object({
    audienceType: z.enum(ANNOUNCEMENT_AUDIENCE_TYPES),
    audienceRef: announcementAudienceRefSchema.optional(),
  })
  .refine((r) => audienceRefMatchesType(r.audienceType, r.audienceRef), {
    message: "audienceType için gerekli audienceRef alanı eksik",
  });

export const createAnnouncementSchema = z
  .object({
    title: z.string().min(1),
    body: z.string().min(1),
    attachmentUrl: z.string().url().optional(),
    attachments: z.array(announcementAttachmentInputSchema).max(3).optional(),
    audienceType: z.enum(ANNOUNCEMENT_AUDIENCE_TYPES),
    audienceRef: announcementAudienceRefSchema.optional(),
    rules: z.array(audienceRuleSchema).min(1).max(10).optional(),
    status: z.enum(["draft", "published", "archived"]).optional(),
    pinned: z.boolean().optional(),
    publishAt: z.string().min(1).optional(),
    expireAt: z.string().min(1).optional(),
  })
  .refine((d) => audienceRefMatchesType(d.audienceType, d.audienceRef), {
    message: "audienceType için gerekli audienceRef alanı eksik",
  });

export const updateAnnouncementStatusSchema = z.object({
  announcementId: z.string().min(1),
  status: z.enum(["draft", "published", "archived"]),
});

export const markAnnouncementReadSchema = z.object({
  announcementId: z.string().min(1),
});

const scoreItem = () => z.number().int().min(1).max(5);

/** EPIC 7 — A–E bölümlerinin her maddesi 1–5 puan; not alanları zorunlu (boş bırakılamaz). */
export const createAssessmentSchema = z.object({
  lessonId: z.string().min(1),
  studentId: z.string().min(1),
  teknikBecerisi: scoreItem(),
  notaOkuma: scoreItem(),
  muzikalite: scoreItem(),
  ritimDuyusu: scoreItem(),
  calismaDuzeni: scoreItem(),
  evOdeviTamamlama: scoreItem(),
  dersKatilimi: scoreItem(),
  motivasyon: scoreItem(),
  genelIlerleme: scoreItem(),
  hedefeUlasma: scoreItem(),
  /** Faz 3A — "çalışılan konular", hepsi opsiyonel. */
  piecesWorked: z.string().max(2000).optional(),
  etudesWorked: z.string().max(2000).optional(),
  technicalWork: z.string().max(2000).optional(),
  theoryWork: z.string().max(2000).optional(),
  strengthNote: z.string().min(1),
  nextStepsNote: z.string().min(1),
  improvementNote: z.string().min(1),
  parentPrivateNote: z.string().optional(),
  parentNoteVisibleToStudent: z.boolean().optional(),
  teacherSignedName: z.string().min(1),
});

/** Faz 3B — dört haftalık genel gelişim değerlendirmesi. */
export const createPeriodicAssessmentSchema = z.object({
  studentId: z.string().min(1),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  overallProgressNote: z.string().min(1).max(4000),
  strengthsNote: z.string().max(2000).optional(),
  areasForImprovementNote: z.string().max(2000).optional(),
  recommendationNote: z.string().max(2000).optional(),
});

export const startLessonSchema = z.object({
  lessonId: z.string().min(1),
});

export const endLessonSchema = z.object({
  lessonId: z.string().min(1),
});

/** EPIC 8 — düzeltme yalnızca admin + zorunlu notla; en az bir zaman alanı gerekir. */
export const correctLessonTimesSchema = z
  .object({
    lessonId: z.string().min(1),
    actualStartAt: z.string().min(1).optional(),
    actualEndAt: z.string().min(1).optional(),
    note: z.string().min(1, "Düzeltme notu zorunludur"),
  })
  .refine((d) => d.actualStartAt !== undefined || d.actualEndAt !== undefined, {
    message: "actualStartAt veya actualEndAt gerekli",
  });

const availabilityWindowSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Saat HH:mm biçiminde olmalı"),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Saat HH:mm biçiminde olmalı"),
    /** Package D — verilmezse "tüm şubeler" (açık, dokümante edilmiş fallback — bkz. src/lib/teacher-branches.ts). */
    branchId: z.string().min(1).optional(),
  })
  .refine((w) => w.start < w.end, { message: "Bitiş saati başlangıçtan sonra olmalı" });

/** EPIC 9 — TEACHER kendi müsaitliği için öneri oluşturur, doğrudan yazmaz. */
export const proposeTeacherAvailabilitySchema = z.object({
  proposedAvailability: z.array(availabilityWindowSchema),
  exceptions: z.unknown().optional(),
});

/** 2026-09-17 — müsaitlik yalnız yönetici tarafından doğrudan düzenlenir (öğretmen öneri gönderemez). */
export const updateTeacherAvailabilitySchema = z
  .object({
    teacherId: z.string().min(1),
    availability: z.array(availabilityWindowSchema).min(1, "En az bir müsaitlik aralığı girin."),
  })
  .refine(
    (v) =>
      !v.availability.some((a, i) =>
        v.availability.some(
          (b, j) => j > i && a.dayOfWeek === b.dayOfWeek && a.branchId === b.branchId && a.start < b.end && b.start < a.end
        )
      ),
    { message: "Aynı gün ve şubede çakışan müsaitlik aralıkları var; saatleri düzeltin.", path: ["availability"] }
  );

/** EPIC 9 — yalnızca SCHOOL_ADMIN/SUPER_ADMIN; not opsiyonel. */
export const reviewTeacherAvailabilityRequestSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
  reviewNote: z.string().optional(),
});

const STUDENT_TYPE_FOR_HOMEWORK = [
  "Hobi",
  "MEB",
  "London College of Music Hazırlık",
  "Konservatuvar Hazırlık",
  "Güzel Sanatlar Lisesi Hazırlık",
] as const;
const INSTRUMENT_FOR_HOMEWORK = ["Piyano", "Yan Flüt", "Gitar", "Bateri", "Keman", "Şan", "Bağlama", "Elektro Gitar"] as const;

/**
 * EPIC 6B — küçük dosya/foto/kısa video için base64; ~2MB ham veri sınırı
 * (base64 şişmesiyle ~2.7M karakter) — yeni bir obje depolama bağımlılığı
 * eklemeden DB/JSON'da taşınabilir kalması için (bkz. IMPLEMENTATION_PLAN.md
 * EPIC 6 "Dosya/video erişimi" bölümü, "(A) seçeneği").
 */
const fileUploadSchema = z.object({
  fileName: z.string().min(1).max(200).optional(),
  fileMimeType: z.string().min(1).max(100).optional(),
  fileData: z.string().max(2_800_000).optional(),
});

/** EPIC 6B — TEACHER kendi öğrencisi için ödev oluşturur. Paket 7 — isteğe bağlı dosya/foto/video eki. */
export const createHomeworkSchema = z
  .object({
    studentId: z.string().min(1),
    /** Faz 3C — bu ödevin verildiği ders (opsiyonel, "ders başına ödev zorunluluğu" takibi için). */
    lessonId: z.string().min(1).optional(),
    title: z.string().min(1),
    description: z.string().min(1),
    dueDate: z.string().min(1),
  })
  .extend(fileUploadSchema.shape);

/** EPIC 6B — STUDENT kendi ödevine teslim yükler. */
export const submitHomeworkSchema = z
  .object({
    homeworkId: z.string().min(1),
    note: z.string().max(2000).optional(),
  })
  .extend(fileUploadSchema.shape);

/** EPIC 6D — TEACHER bir teslime geri bildirim yazar. */
export const reviewHomeworkSubmissionSchema = z.object({
  submissionId: z.string().min(1),
  teacherFeedback: z.string().min(1),
});

/** EPIC 6B — TEACHER materyal/pratik videosu paylaşır. */
export const createTeachingMaterialSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1),
    targetStudentType: z.enum(STUDENT_TYPE_FOR_HOMEWORK).optional(),
    targetInstrument: z.enum(INSTRUMENT_FOR_HOMEWORK).optional(),
    targetLevel: z.string().min(1).max(100).optional(),
  })
  .extend(fileUploadSchema.shape);

/**
 * EPIC 6C — veli/öğrenci öğretmen hakkında yapılandırılmış geri bildirim
 * gönderir. Beş kriter ZORUNLU ve sabit (bkz. TEACHER_FEEDBACK_CRITERIA) —
 * rastgele anahtarlı bir Record değil, tam olarak bu beş alan.
 */
const teacherFeedbackScoreSchema = z.number().int().min(1).max(5);

export const submitTeacherFeedbackSchema = z.object({
  studentId: z.string().min(1),
  scores: z.object({
    clarity: teacherFeedbackScoreSchema,
    communication: teacherFeedbackScoreSchema,
    effectiveness: teacherFeedbackScoreSchema,
    motivation: teacherFeedbackScoreSchema,
    punctuality: teacherFeedbackScoreSchema,
  }),
  continueWithTeacher: z.enum(["yes", "unsure", "no"]).optional(),
  /** Güvenli düz metin; HTML asla render edilmez (bkz. UI katmanı). */
  comment: z.string().max(1000).optional(),
});

/**
 * Karşılıklı Değerlendirmeler sprinti — öğretmenin öğrenciyi yapılandırılmış
 * değerlendirmesi. TeacherFeedback'in ters yönü, aynı "sabit beş kriter" ilkesi.
 */
const studentFeedbackScoreSchema = z.number().int().min(1).max(5);

export const submitStudentFeedbackSchema = z.object({
  studentId: z.string().min(1),
  scores: z.object({
    attendance: studentFeedbackScoreSchema,
    practice: studentFeedbackScoreSchema,
    progress: studentFeedbackScoreSchema,
    attitude: studentFeedbackScoreSchema,
    preparedness: studentFeedbackScoreSchema,
  }),
  /** Güvenli düz metin; HTML asla render edilmez (bkz. UI katmanı). */
  comment: z.string().max(1000).optional(),
});

/** Müfredat konu durumu */
export const curriculumTopicStatusSchema = z.enum([
  "planned",
  "in_progress",
  "mastered",
  "deferred",
]);

/** TEACHER — öğrenciye müfredat konusu ekler */
export const createCurriculumTopicSchema = z.object({
  studentId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  status: curriculumTopicStatusSchema.optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  notes: z.string().max(2000).optional(),
});

/** TEACHER — konu günceller (durum/not). İlerleme yüzdesi artık manuel girilmez, durumdan otomatik hesaplanır. */
export const updateCurriculumTopicSchema = z.object({
  topicId: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: curriculumTopicStatusSchema.optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  notes: z.string().max(2000).nullable().optional(),
  changeNote: z.string().max(500).optional(),
});


/** TEACHER/SCHOOL_ADMIN/SUPER_ADMIN — seçilen öğrencilere toplu müfredat konusu atar. */
export const bulkAssignCurriculumTopicsSchema = z.object({
  studentIds: z.array(z.string().min(1)).min(1).max(200),
  topics: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        description: z.string().max(2000).optional(),
        sortOrder: z.number().int().min(0).max(10_000).optional(),
      })
    )
    .min(1)
    .max(100),
});

export const EDUCATION_METHOD_ENUM = ["Suzuki","Klasik","LCM","MEB","Kurum İçi","Diğer"] as const;
export const LESSON_DURATION_PREF_ENUM = [30, 40, 50] as const;

export const createTrialLessonSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().min(7).max(30),
  instrument: z.string().min(1),
  branchId: z.string().min(1),
  teacherId: z.string().min(1),
  startAt: z.string().min(1),
  /**
   * KESİN İŞ KURALI (2026-09-01 revizyonu) — deneme dersleri öğretmenlerin
   * ders araları için planlanır ve yalnızca 10, 15 veya 20 dakika olabilir
   * (bkz. `src/lib/lesson-duration.ts` TRIAL_LESSON_DURATION_OPTIONS).
   * Normal ders serisinin sabit 30/40/50 dk kısıtıyla (LESSON_DURATION_OPTIONS)
   * KARIŞTIRILMAMALI — bu iki küme birbirinden bağımsızdır. 20 dakikadan
   * uzun bir deneme dersi ASLA kabul edilmez; istemci yalnızca 10/15/20
   * sunsa bile sunucu bu kuralı bağımsız olarak doğrular.
   */
  durationMinutes: z.coerce
    .number()
    .refine((v) => (TRIAL_LESSON_DURATION_OPTIONS as readonly number[]).includes(v), {
      message: "Deneme dersi süresi yalnızca 10, 15 veya 20 dakika olabilir.",
    }),
  notes: z.string().max(2000).optional(),
  /** 8. tur — düzenlemedeki gibi: müsaitlik dışı planlama yalnız açık onayla. */
  allowAvailabilityOverride: z.boolean().optional(),
});

/**
 * Deneme dersi düzenleme (2026-09-26). Tüm alanlar opsiyonel (kısmi). Hazırlık
 * notu (`notes`) ile ders sonrası not (`resultNotes`) AYRI alanlardır.
 */
export const updateTrialLessonSchema = z.object({
  trialId: z.string().min(1),
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().min(7).max(30).optional(),
  instrument: z.string().min(1).optional(),
  branchId: z.string().min(1).optional(),
  teacherId: z.string().min(1).optional(),
  startAt: z.string().min(1).optional(),
  // 11. tur iş #1 (kayıp revize kök nedeni): 2026-09-01 öncesi 30/45/60 dk
  // denemeler tarihsel kayıttır; düzenleme formu mevcut süreyi aynen geri
  // gönderir. Burada refine YOK — 10/15/20 kuralı YALNIZCA süre gerçekten
  // DEĞİŞTİRİLİRKEN `updateTrialLessonTool` içinde uygulanır (dede kuralı);
  // aksi halde eski süreli hiçbir deneme kaydedilemezdi.
  durationMinutes: z.coerce.number().int().min(1).max(240).optional(),
  notes: z.string().max(2000).optional(),
  resultNotes: z.string().max(4000).optional(),
  allowAvailabilityOverride: z.boolean().optional(),
});

export const updateTrialLessonStatusSchema = z.object({
  trialId: z.string().min(1),
  status: z.enum([
    "planned","attended","considering","awaiting_enrollment",
    "will_continue","will_not_continue","cancelled",
  ]),
  convertToStudent: z.boolean().optional(),
});

export const archiveStudentSchema = z.object({
  studentId: z.string().min(1),
  archived: z.boolean(),
});

/** ÖNCELİK 4 (devam) — öğretmen arşivleme (hard delete YOK). */
export const archiveTeacherStudentsSchema = z.object({ teacherId: z.string().min(1) });

export const archiveTeacherSchema = z.object({
  teacherId: z.string().min(1),
  archived: z.boolean(),
});

/** ÖNCELİK 4 (devam) — oda düzenleme/pasife alma. */
export const updateRoomSchema = z.object({
  roomId: z.string().min(1),
  name: z.string().min(1).optional(),
  capacity: z.coerce.number().int().min(1).optional(),
  branchId: z.string().min(1).optional(),
  /** 9. tur — oda düzenlemede enstrüman listesi de revize edilebilir (en az bir). */
  instruments: z.array(z.string().min(1)).min(1, "Odada en az bir enstrüman seçili olmalı.").optional(),
  active: z.boolean().optional(),
});

export const setNationalIdSchema = z.object({
  entity: z.enum(["student","teacher"]),
  entityId: z.string().min(1),
  nationalId: z.string().min(11).max(20),
});

/**
 * Evraklar — şablon-bağımsız doğrudan dosya yükleme (kategori seçip dosya
 * yüklemek için; "Yeni Evrak Oluştur" akışının aksine bir form doldurmayı
 * gerektirmez). Dosya kuralları uploadSignedDocumentSchema ile AYNI
 * (tools.ts'teki validateSignedDocumentFilePayload tekrar kullanılır).
 */
export const uploadDocumentDirectSchema = z.object({
  kind: z.enum([
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
  ]),
  fileName: z
    .string()
    .min(1)
    .max(200)
    .refine((v) => !v.includes("/") && !v.includes("\\") && !v.includes(".."), "Geçersiz dosya adı"),
  fileMimeType: z.string().min(1).max(100),
  fileData: z.string().min(1).max(2_800_000),
  studentId: z.string().optional(),
  teacherId: z.string().optional(),
});

export const createDocumentInstanceSchema = z.object({
  templateId: z.string().min(1),
  studentId: z.string().optional(),
  teacherId: z.string().optional(),
  trialLessonId: z.string().optional(),
  branchId: z.string().optional(),
  fieldValues: z.record(z.string(), z.string()).default({}),
  /** Aynı isteğin tekrarında (ör. çift tıklama) duplicate belge üretmemek için opsiyonel istemci anahtarı. */
  idempotencyKey: z.string().max(200).optional(),
});

/** Evraklar — şablon oluşturma/düzenleme. `bodyHtml` burada değil, tools.ts'te (createTemplate/updateTemplate) sanitize edilir. */
export const createDocumentTemplateSchema = z.object({
  kind: z.enum([
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
  ]),
  name: z.string().min(1).max(200),
  bodyHtml: z.string().min(1).max(200_000),
});

export const updateDocumentTemplateSchema = z.object({
  templateId: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  bodyHtml: z.string().min(1).max(200_000).optional(),
});

export const archiveDocumentTemplateSchema = z.object({
  templateId: z.string().min(1),
  active: z.boolean(),
});

/** P0 (2026-08-30) — DOCX-öncelikli şablon yükleme. Yalnızca .docx kabul edilir; .doc/.pdf tools.ts'te ayrı, dostane mesajlarla reddedilir. */
export const uploadDocumentTemplateDocxSchema = z.object({
  kind: z.enum([
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
  ]),
  name: z.string().min(1).max(200),
  fileName: z.string().min(1).max(255),
  fileMimeType: z.string().min(1).max(200),
  fileData: z.string().min(1).max(14_000_000),
});

export const getDocumentTemplateSourceFileSchema = z.object({
  templateId: z.string().min(1),
});

export const deleteSignedDocumentVersionSchema = z.object({
  documentId: z.string().min(1),
  versionId: z.string().min(1),
});

export const socialMediaConsentSchema = z.object({
  studentId: z.string().min(1),
  status: z.enum(["granted","denied","withdrawn","expired"]),
  representativeName: z.string().min(1),
  relationship: z.string().min(1),
  scopes: z.array(z.enum(["photo","video","name","voice","website","instagram","other","print_materials","digital_ads","in_house_board"])).min(1),
  sourceDocumentRef: z.string().optional(),
});

export const closedDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(1).max(120),
});

/** ÖNCELİK 4 (devam) — Paket Yönetimi. */
/** ÖNCELİK 4 (devam) — Yönetilebilir Enstrüman Kataloğu. */
export const createInstrumentCatalogSchema = z.object({
  name: z.string().min(1),
});

export const updateInstrumentCatalogSchema = z.object({
  entryId: z.string().min(1),
  name: z.string().min(1).optional(),
  status: z.enum(["active", "archived"]).optional(),
});

/** Personel Modülü — bkz. src/lib/staff.ts / src/lib/types.ts StaffMember. */
const staffMemberBaseFields = {
  name: z.string().min(1),
  position: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  /** P0 personel onboarding revizyonu — il/ilçe (nullable/additive, hepsi opsiyonel). */
  city: z.string().optional(),
  district: z.string().optional(),
  birthDate: z.string().optional(),
  photoUrl: z.string().optional(),
  nationalId: z.string().optional(),
  employeeNumber: z.string().optional(),
  hireDate: z.string().optional(),
  terminationDate: z.string().optional(),
  department: z.string().optional(),
  reportsToStaffId: z.string().optional(),
  employmentType: z.enum(["full_time", "part_time", "contract", "intern"]).optional(),
  branchId: z.string().optional(),
  /** P0 personel onboarding revizyonu — yeni kayıtta aktif/pasif durumu (verilmezse "active"). */
  status: z.enum(["active", "on_leave", "passive", "terminated"]).optional(),
  annualLeaveAllowanceDays: z.coerce.number().int().min(0).optional(),
  personnelNotes: z.string().optional(),
  notes: z.string().optional(),
  monthlySalary: z.coerce.number().int().min(0).optional(),
  hourlyRate: z.coerce.number().int().min(0).optional(),
  defaultBonus: z.coerce.number().int().min(0).optional(),
  defaultAllowances: z.coerce.number().int().min(0).optional(),
  defaultDeductions: z.coerce.number().int().min(0).optional(),
  /** Faz 9A — özlük genişletmesi. */
  emergencyContactName: z.string().optional(),
  /** P0 personel onboarding revizyonu — yakınlık derecesi. */
  emergencyContactRelationship: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  contractStartDate: z.string().optional(),
  contractEndDate: z.string().optional(),
  sgkStatus: z.string().optional(),
  /** Ham IBAN — şifrelenmeden ASLA saklanmaz (bkz. src/lib/pii/iban.ts). */
  iban: z.string().optional(),
  /** Faz 9B — yıllık avans üst sınırı. */
  annualAdvanceLimit: z.coerce.number().int().min(0).optional(),
};

export const createStaffMemberSchema = z.object(staffMemberBaseFields);

/**
 * P0 personel onboarding revizyonu — yeni kayıtta portal erişimi/davet
 * seçenekleri. `portalRole` SADECE burada doğrulanır (server-side allowlist
 * `STAFF_PORTAL_ALLOWED_ROLES`, bkz. tools.ts) — UI'daki select'e
 * GÜVENİLMEZ. `portalUserId` ham girdiden ASLA alınmaz (araç katmanı yazar).
 */
export const staffPortalOptionsSchema = z.object({
  createPortalAccess: z.boolean().optional(),
  portalRole: z.string().optional(),
  sendInvitation: z.boolean().optional(),
});

export const createStaffMemberWithPortalSchema = z.object({
  ...staffMemberBaseFields,
  createPortalAccess: z.boolean().optional(),
  portalRole: z.string().optional(),
  sendInvitation: z.boolean().optional(),
});

export const updateStaffMemberSchema = z
  .object({ staffId: z.string().min(1), status: z.enum(["active", "on_leave", "passive", "terminated"]).optional() })
  .extend({
    ...staffMemberBaseFields,
    name: z.string().min(1).optional(),
    position: z.string().min(1).optional(),
  });

/** Faz 9B — Avans modülü. */
export const createStaffAdvanceSchema = z.object({
  staffId: z.string().min(1),
  amount: z.coerce.number().int().positive(),
  requestDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().optional(),
});

export const decideStaffAdvanceSchema = z.object({
  advanceId: z.string().min(1),
  status: z.enum(["approved", "rejected"]),
});

export const markStaffAdvancePaidSchema = z.object({
  advanceId: z.string().min(1),
  paymentMethod: z.string().optional(),
});

export const cancelStaffAdvanceSchema = z.object({
  advanceId: z.string().min(1),
});

/** İş 3B — Bordro. */
export const createPayrollRecordSchema = z.object({
  staffId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Ay "yyyy-aa" biçiminde olmalı.'),
  grossAmount: z.coerce.number().int().min(0),
  netAmount: z.coerce.number().int().min(0),
  extraPayment: z.coerce.number().int().min(0).optional(),
  deduction: z.coerce.number().int().min(0).optional(),
  paymentMethod: z.string().optional(),
  note: z.string().optional(),
});

export const updatePayrollStatusSchema = z.object({
  payrollId: z.string().min(1),
  status: z.enum(["draft", "pending_approval", "approved", "paid", "cancelled"]),
  paymentDate: z.string().optional(),
  paymentMethod: z.string().optional(),
  note: z.string().optional(),
});

/** İş 3C — İzin. */
export const createLeaveRequestSchema = z.object({
  staffId: z.string().min(1),
  type: z.enum(["annual", "sick", "unpaid", "other"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().optional(),
});

export const decideLeaveRequestSchema = z.object({
  leaveId: z.string().min(1),
  status: z.enum(["approved", "rejected"]),
});

/** İş 3D — Gider (yalnızca kira/fatura/sarf/diğer — bordro/hakediş burada YOK, bkz. expense.ts). */
const EXPENSE_CATEGORY = ["rent", "utilities", "supplies", "other"] as const;
export const createExpenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORY),
  amount: z.coerce.number().int().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().optional(),
  /** Faz 10 — genişletme. */
  subcategory: z.string().optional(),
  supplier: z.string().optional(),
  branchId: z.string().optional(),
  currency: z.string().optional(),
  taxAmount: z.coerce.number().int().min(0).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  paymentStatus: z.enum(["pending", "paid"]).optional(),
  paymentMethod: z.string().optional(),
});

export const markExpensePaidSchema = z.object({
  expenseId: z.string().min(1),
  paymentMethod: z.string().optional(),
});

export const createRecurringExpenseRuleSchema = z.object({
  category: z.enum(EXPENSE_CATEGORY),
  subcategory: z.string().optional(),
  supplier: z.string().optional(),
  branchId: z.string().optional(),
  amount: z.coerce.number().int().min(1),
  frequency: z.enum(["monthly", "quarterly", "yearly"]),
  nextRunDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().optional(),
});

export const setRecurringExpenseRuleActiveSchema = z.object({
  ruleId: z.string().min(1),
  active: z.boolean(),
});

export const upsertBudgetSchema = z.object({
  category: z.enum(EXPENSE_CATEGORY),
  branchId: z.string().optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  targetAmount: z.coerce.number().int().min(1),
});

const packageDurationSchema = z.coerce.number().int().refine((v) => [30, 40, 50].includes(v), {
  message: "Varsayılan ders süresi yalnızca 30, 40 veya 50 dakika olabilir.",
});
const packageDueDaySchema = z.coerce.number().int().min(1).max(28);
const packageLessonCountSchema = z.coerce.number().int().min(0);

export const createPackageSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  price30Min: z.coerce.number().int().min(0),
  price40Min: z.coerce.number().int().min(0),
  price50Min: z.coerce.number().int().min(0),
  termLabel: z.enum(["guz", "yaz"]).optional(),
  monthlyLessonCount: packageLessonCountSchema.optional(),
  groupLessonCount: packageLessonCountSchema.optional(),
  defaultDurationMinutes: packageDurationSchema.optional(),
  defaultPaymentDueDay: packageDueDaySchema.optional(),
  applicableBranchIds: z.array(z.string().min(1)).optional(),
  notes: z.string().optional(),
});

export const updatePackageSchema = z.object({
  packageId: z.string().min(1),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  price30Min: z.coerce.number().int().min(0).optional(),
  price40Min: z.coerce.number().int().min(0).optional(),
  price50Min: z.coerce.number().int().min(0).optional(),
  termLabel: z.enum(["guz", "yaz"]).optional(),
  status: z.enum(["active", "archived"]).optional(),
  monthlyLessonCount: packageLessonCountSchema.optional(),
  groupLessonCount: packageLessonCountSchema.optional(),
  defaultDurationMinutes: packageDurationSchema.optional(),
  defaultPaymentDueDay: packageDueDaySchema.optional(),
  applicableBranchIds: z.array(z.string().min(1)).optional(),
  notes: z.string().optional(),
});

/** Paket 5 — yüzde tabanlı kampanya/indirim (ör. "Kardeş Kampanyası"). Paket & Kampanya Motoru ile genişletildi. */
export const createDiscountCampaignSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  kind: z.enum(["sibling"]),
  discountPercent: z.coerce.number().int().min(1).max(100),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
  branchId: z.string().optional(),
  applicableBranchIds: z.array(z.string().min(1)).optional(),
  stackingRule: z.enum(["none", "additive", "override", "yield"]).optional(),
  priority: z.coerce.number().int().min(0).optional(),
  maxUsageCount: z.coerce.number().int().min(1).optional(),
  conditions: z.record(z.string(), z.unknown()).optional(),
});

export const updateDiscountCampaignSchema = z.object({
  campaignId: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  discountPercent: z.coerce.number().int().min(1).max(100).optional(),
  active: z.boolean().optional(),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
  branchId: z.string().optional().nullable(),
  applicableBranchIds: z.array(z.string().min(1)).optional(),
  stackingRule: z.enum(["none", "additive", "override", "yield"]).optional(),
  priority: z.coerce.number().int().min(0).optional(),
  maxUsageCount: z.coerce.number().int().min(1).optional().nullable(),
  usageCount: z.coerce.number().int().min(0).optional(),
  conditions: z.record(z.string(), z.unknown()).optional(),
});

/** ÖNCELİK 4 (devam) — öğretmen çoklu enstrüman+seviye düzenleme (öğretmen detayı). */
export const updateTeacherInstrumentsSchema = z.object({
  teacherId: z.string().min(1),
  instrumentLevels: z.array(teacherInstrumentSkillSchema).min(1),
}).refine(
  (v) => new Set(v.instrumentLevels.map((r) => r.instrument)).size === v.instrumentLevels.length,
  { message: "Aynı enstrüman birden fazla kez eklenemez.", path: ["instrumentLevels"] }
);

// ─── İş Takip (Task) modülü — /panel/is-takip, /ogretmen/is-takip ────────
// /panel/workflows (AI otomasyonu) ile İLGİSİZ, ayrı bir modül.

export const TASK_STATUS_ENUM = ["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED", "ARCHIVED"] as const;
export const TASK_PRIORITY_ENUM = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const TASK_CATEGORY_ENUM = [
  "Kayıt",
  "Eğitim",
  "Tahsilat",
  "Veli İletişimi",
  "Öğretmen",
  "Program",
  "Evrak",
  "Teknik",
] as const;

export const RELATED_ENTITY_TYPE_ENUM = [
  "student",
  "teacher",
  "payment",
  "document",
  "makeup",
  "lessonCorrection",
  "branch",
] as const;

const taskLinksSchema = z.object({
  studentId: z.string().min(1).optional(),
  teacherId: z.string().min(1).optional(),
  branchId: z.string().min(1).optional(),
  lessonId: z.string().min(1).optional(),
  paymentId: z.string().min(1).optional(),
  documentId: z.string().min(1).optional(),
  /**
   * Genel bağlamsal ilişki — yukarıdaki özel FK alanlarının kapsamadığı
   * ilişki tipleri (telafi, ders düzeltme, şube-context) için. Üçü birlikte
   * ya hep ya hiç sağlanır (tool katmanında da doğrulanır).
   */
  relatedEntityType: z.enum(RELATED_ENTITY_TYPE_ENUM).optional(),
  relatedEntityId: z.string().min(1).optional(),
  relatedEntityLabel: z.string().min(1).max(200).optional(),
});

export const createTaskSchema = z
  .object({
    title: z.string().min(1, "Başlık zorunludur"),
    description: z.string().optional(),
    priority: z.enum(TASK_PRIORITY_ENUM).default("MEDIUM"),
    category: z.enum(TASK_CATEGORY_ENUM),
    assigneeId: z.string().min(1).optional(),
    followerIds: z.array(z.string().min(1)).optional(),
    startDate: z.string().optional(),
    dueDate: z.string().optional(),
    tags: z.array(z.string().min(1)).optional(),
  })
  .merge(taskLinksSchema)
  .refine((v) => !v.startDate || !v.dueDate || v.startDate <= v.dueDate, {
    message: "Son tarih başlangıç tarihinden önce olamaz.",
    path: ["dueDate"],
  })
  .refine((v) => !v.relatedEntityType === !v.relatedEntityId, {
    message: "İlişkili kayıt tipi ve kimliği birlikte verilmelidir.",
    path: ["relatedEntityId"],
  });

/**
 * Admin tam alan seti günceller; TEACHER (çalışan) yalnızca kısıtlı bir alt
 * kümeyi (status/progressPercent) — bu ayrım şemada değil, tool katmanında
 * (updateTaskTool) uygulanır çünkü kısıt ROL'e bağlıdır, girdi şekline değil.
 */
export const updateTaskSchema = z
  .object({
    taskId: z.string().min(1),
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    status: z.enum(TASK_STATUS_ENUM).optional(),
    priority: z.enum(TASK_PRIORITY_ENUM).optional(),
    category: z.enum(TASK_CATEGORY_ENUM).optional(),
    assigneeId: z.string().min(1).nullable().optional(),
    followerIds: z.array(z.string().min(1)).optional(),
    startDate: z.string().nullable().optional(),
    dueDate: z.string().nullable().optional(),
    progressPercent: z.coerce.number().int().min(0).max(100).optional(),
    tags: z.array(z.string().min(1)).optional(),
  })
  .merge(taskLinksSchema)
  .refine((v) => !v.startDate || !v.dueDate || v.startDate <= v.dueDate, {
    message: "Son tarih başlangıç tarihinden önce olamaz.",
    path: ["dueDate"],
  });

export const resolveRelatedEntitySchema = z.object({
  relatedEntityType: z.enum(RELATED_ENTITY_TYPE_ENUM),
  relatedEntityId: z.string().min(1),
});

export const changeTaskStatusSchema = z.object({
  taskId: z.string().min(1),
  action: z.enum(["complete", "cancel", "archive", "reopen", "set_status"]),
  /** yalnızca action:"set_status" için — TEACHER'ın izinli statüler arası geçişi. */
  status: z.enum(TASK_STATUS_ENUM).optional(),
});

export const addTaskChecklistItemSchema = z.object({
  taskId: z.string().min(1),
  title: z.string().min(1),
});

export const setTaskChecklistItemCompletedSchema = z.object({
  taskId: z.string().min(1),
  itemId: z.string().min(1),
  isCompleted: z.boolean(),
});

export const archiveTaskChecklistItemSchema = z.object({
  taskId: z.string().min(1),
  itemId: z.string().min(1),
});

export const addTaskCommentSchema = z.object({
  taskId: z.string().min(1),
  body: z.string().min(1),
});

export const updateTaskCommentSchema = z.object({
  taskId: z.string().min(1),
  commentId: z.string().min(1),
  body: z.string().min(1),
});

export const deleteTaskCommentSchema = z.object({
  taskId: z.string().min(1),
  commentId: z.string().min(1),
});

/**
 * İş Takip Faz 3B-2A — dosya eki. `fileName` bilinçli olarak `/`, `\` veya
 * `..` içeremez (path traversal — bu uygulamada dosya ASLA disk yoluna
 * yazılmıyor, base64 olarak DB'ye gidiyor, ama savunma katmanı olarak
 * yine de reddedilir). Boyut/MIME/uzantı allowlist kontrolü tools.ts'te
 * (zod'un ötesinde, tıpkı instrument katalog doğrulaması gibi) yapılır —
 * zod burada yalnızca biçim/uzunluk sınırlarını uygular.
 */
export const addTaskFileAttachmentSchema = z.object({
  taskId: z.string().min(1),
  title: z.string().min(1).max(200),
  fileName: z
    .string()
    .min(1)
    .max(200)
    .refine((v) => !v.includes("/") && !v.includes("\\") && !v.includes(".."), "Geçersiz dosya adı"),
  fileMimeType: z.string().min(1).max(100),
  fileData: z.string().min(1).max(2_800_000),
});

export const addTaskLinkAttachmentSchema = z.object({
  taskId: z.string().min(1),
  title: z.string().min(1).max(200),
  url: z.string().min(1).max(2000),
});

export const deleteTaskAttachmentSchema = z.object({
  taskId: z.string().min(1),
  attachmentId: z.string().min(1),
});

export const updateTaskReminderPreferenceSchema = z.object({
  dueSoonEnabled: z.boolean(),
  dueTodayEnabled: z.boolean(),
  overdueEnabled: z.boolean(),
});

/** Bildirim ayarları — yalnız kendi tercihi; userId input'ta yok. */
export const setNotificationPreferencesSchema = z.object({
  updates: z
    .array(
      z.object({
        category: z.string().min(1).max(64),
        inAppEnabled: z.boolean(),
      })
    )
    .min(1)
    .max(40),
});

export const listTasksFilterSchema = z.object({
  status: z.array(z.enum(TASK_STATUS_ENUM)).optional(),
  priority: z.enum(TASK_PRIORITY_ENUM).optional(),
  category: z.enum(TASK_CATEGORY_ENUM).optional(),
  assigneeId: z.string().optional(),
  followerId: z.string().optional(),
  branchId: z.string().optional(),
  createdById: z.string().optional(),
  tag: z.string().optional(),
  search: z.string().optional(),
  dueBefore: z.string().optional(),
  dueAfter: z.string().optional(),
  quickFilter: z.enum(["all", "mine", "today", "week", "overdue", "completed", "archived"]).optional(),
});

// Faz 11 — CRM (arama/mesaj günlüğü). `contactType`/`contactId` create
// şemalarında YOK — otomatik telefon eşleştirme `createCallLogTool`/
// `createMessageLogTool` içinde (crm-contact-matching.ts) yapılır, manuel
// atama ayrı bir tool/schema (`assign*ContactSchema`) ile yapılır.
const CRM_CONTACT_TYPE_ENUM = ["student", "parent", "lead"] as const;

/** Manuel arama günlüğü — telefoni entegrasyonu yok, serbest metin numara (kısa dahili numaralar da geçerli). */
export const createCallLogSchema = z.object({
  callerNumber: z.string().min(3).max(32),
  callerName: z.string().min(1).max(200).optional(),
  direction: z.enum(["inbound", "outbound"]),
  answered: z.boolean(),
  durationSeconds: z.coerce.number().int().min(0).max(24 * 60 * 60).optional(),
  occurredAt: z.string().datetime(),
  note: z.string().max(2000).optional(),
});

export const assignCallContactSchema = z.object({
  callId: z.string().min(1),
  contactType: z.enum(CRM_CONTACT_TYPE_ENUM),
  contactId: z.string().min(1),
});

export const markCallbackDoneSchema = z.object({
  callId: z.string().min(1),
});

/** `senderIdentifier` telefon VEYA e-posta olabilir (channel="email"), bu yüzden serbest metin. */
export const createMessageLogSchema = z.object({
  channel: z.enum(["sms", "whatsapp", "email", "other"]),
  senderIdentifier: z.string().min(3).max(320),
  occurredAt: z.string().datetime(),
  contentOrSummary: z.string().min(1).max(10000),
});

export const assignMessageContactSchema = z.object({
  messageId: z.string().min(1),
  contactType: z.enum(CRM_CONTACT_TYPE_ENUM),
  contactId: z.string().min(1),
});

/**
 * "unread" yalnızca `createMessageLog` tarafından oluşturuşta atanan başlangıç
 * durumudur — bir kullanıcı eylemiyle geri DÖNÜLEMEZ; bu yüzden hedef durum
 * kümesi kasıtlı olarak "read"/"replied" ile sınırlıdır.
 */
export const setMessageStatusSchema = z.object({
  messageId: z.string().min(1),
  status: z.enum(["read", "replied"]),
});

// Faz 8 — KVKK rıza yönetimi.
const CONSENT_SUBJECT_TYPE_ENUM = ["student", "parent", "user"] as const;

/** Yeni hukuki metin versiyonu — append-only, mevcut versiyonlar hiç düzenlenmez. */
export const createConsentTextVersionSchema = z.object({
  consentType: z.string().min(1).max(100),
  bodyText: z.string().min(1).max(50000),
  effectiveFrom: z.string().datetime(),
});

export const grantKvkkConsentSchema = z.object({
  subjectType: z.enum(CONSENT_SUBJECT_TYPE_ENUM),
  subjectId: z.string().min(1),
  consentType: z.string().min(1).max(100),
  channel: z.string().min(1).max(100),
  deviceInfo: z.object({ ip: z.string().max(64).optional(), userAgent: z.string().max(500).optional() }).optional(),
});

export const withdrawKvkkConsentSchema = z.object({
  consentId: z.string().min(1),
  reason: z.string().max(2000).optional(),
});

export const updateConsentSettingsSchema = z.object({
  restrictedFeatures: z.array(z.string().min(1).max(100)).max(100),
  recordDeviceInfo: z.boolean(),
});

/**
 * Profil fotoğrafı — `fileData` üst sınırı BİLİNÇLİ olarak dostane domain
 * limitinden (2 MB, bkz. profile-photo-validation.ts) geniştir; aksi halde
 * gerçek dünya boyutundaki normal fotoğraflar burada jenerik "Invalid input"
 * hatasına takılır, hiçbir zaman dostane boyut mesajına ulaşamaz.
 */
export const uploadProfilePhotoSchema = z.object({
  ownerType: z.enum(["student", "teacher", "user"]),
  ownerId: z.string().min(1),
  fileMimeType: z.string().min(1).max(100),
  fileData: z.string().min(1).max(10_000_000),
});

export const deleteProfilePhotoSchema = z.object({
  ownerType: z.enum(["student", "teacher", "user"]),
  ownerId: z.string().min(1),
});
