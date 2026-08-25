import { z } from "zod";
import { LESSON_DURATION_OPTIONS } from "./lesson-duration";
import { INSTRUMENTS } from "./types";

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

export const studentSchema = z.object({
  name: z.string().min(1),
  email: optionalEmail,
  phone: z.string().min(1),
  parentName: z.string().min(1),
  parentPhone: z.string().min(1),
  /** Paket 7 — TC kimlik alanından hemen sonra istenir; opsiyonel (legacy kayıtlar kırılmaz). */
  motherName: optionalTrimmed,
  fatherName: optionalTrimmed,
  branchId: z.string().min(1),
  instrument: z.enum(["Piyano", "Yan Flüt", "Gitar", "Bateri", "Keman", "Şan"]),
  teacherId: z.string().min(1),
  packageName: z.string().min(1),
  weeklyLessonCount: z.coerce.number().int().min(1),
  monthlyFee: z.coerce.number().int().min(0),
  notes: z.string().optional(),
  studentType: z.enum(STUDENT_TYPE_ENUM).optional(),
  /** Faz 1B — verilirse tekil studentType'ın YERİNE birincil kaynak olur. */
  studentTypes: studentTypesSchema,
  enrollmentStartDate: optionalTrimmed,
  enrollmentEndDate: optionalTrimmed,
  level: optionalTrimmed,
  targetExam: optionalTrimmed,
  specialNotes: optionalTrimmed,
  /** ÖNCELİK 4 (devam) — öğrencinin Yoklama Takvimi dönemi (Güz/Yaz). Verilmezse legacy (undefined) — kayıt akışı kırılmaz. */
  termType: z.enum(["guz", "yaz"]).optional(),
  /** ÖNCELİK 4 (devam) — Paket Yönetimi + ek profil alanları. Hepsi opsiyonel — legacy kayıt akışı kırılmaz. */
  packageId: z.string().optional(),
  birthDate: optionalTrimmed,
  birthPlace: optionalTrimmed,
  schoolOrOccupation: optionalTrimmed,
  address: optionalTrimmed,
  lessonDurationMinutes: z.coerce.number().int().refine((v) => [30, 40, 50].includes(v), {
    message: "Ders süresi yalnızca 30, 40 veya 50 dakika olabilir.",
  }).optional(),
  /** Package C — paket seçildiğinde uygulanacak indirim + ödeme profili. Hepsi opsiyonel — legacy akış kırılmaz. */
  discountType: z.enum(["percent", "amount"]).optional(),
  discountValue: z.coerce.number().min(0).optional(),
  paymentMethod: z.enum(["credit_card", "cash", "transfer"]).optional(),
  paymentDueDay: z.coerce.number().int().min(1).max(31).optional(),
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
}).refine((v) => v.monthlyFeeOverrideAmount === undefined || !!v.monthlyFeeOverrideReason, {
  message: "Manuel ücret girildiyse gerekçe zorunludur.",
  path: ["monthlyFeeOverrideReason"],
}).refine((v) => !v.createPortalAccess || !!v.email, {
  message: "Portal erişimi için e-posta zorunludur.",
  path: ["email"],
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
    enrollmentEndDate: optionalTrimmed,
    level: optionalTrimmed,
    targetExam: optionalTrimmed,
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
    birthDate: optionalTrimmed,
    birthPlace: optionalTrimmed,
    schoolOrOccupation: optionalTrimmed,
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

const TEACHER_INSTRUMENT_ENUM = ["Piyano", "Yan Flüt", "Gitar", "Bateri", "Keman", "Şan"] as const;
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
    instrument: z.enum(TEACHER_INSTRUMENT_ENUM),
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
     * (updateTeacherInstrumentsTool, proposeTeacherAvailabilityTool,
     * createFeeRuleTool/updateFeeRuleTool) — tekrarlanmaz.
     */
    name: z.string().min(1).optional(),
    email: optionalEmail,
    phone: optionalTrimmed,
    branchIds: z.array(z.string().min(1)).optional(),
    employmentType: z.enum(TEACHER_EMPLOYMENT_TYPE_ENUM).optional(),
    hireDate: optionalTrimmed,
    terminationDate: optionalTrimmed,
    contractStartDate: optionalTrimmed,
    contractEndDate: optionalTrimmed,
    birthDate: optionalTrimmed,
    address: optionalTrimmed,
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
  instruments: z
    .array(z.enum(["Piyano", "Yan Flüt", "Gitar", "Bateri", "Keman", "Şan"]))
    .min(1),
});

export const lessonSchema = z.object({
  studentId: z.string().min(1),
  teacherId: z.string().min(1),
  roomId: z.string().min(1),
  instrument: z.enum(["Piyano", "Yan Flüt", "Gitar", "Bateri", "Keman", "Şan"]),
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
  instrument: z.enum(["Piyano", "Yan Flüt", "Gitar", "Bateri", "Keman", "Şan"]),
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
  instrument: z.enum(["Piyano", "Yan Flüt", "Gitar", "Bateri", "Keman", "Şan"]),
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

const INSTRUMENT_ENUM = ["Piyano", "Yan Flüt", "Gitar", "Bateri", "Keman", "Şan"] as const;

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

export const createTeacherPayoutSchema = computeTeacherPayoutSchema;

export const markTeacherPayoutPaidSchema = z.object({
  payoutId: z.string().min(1),
  method: z.string().min(1).optional(),
});

export const updateFeeRoundingModeSchema = z.object({
  feeRoundingMode: z.enum(["exact_minutes", "round_30", "fixed_package"]),
});

/** Telafi Merkezi politika penceresi — 1-365 gün arası, yalnız ileri yönlü etkilidir. */
export const updateMakeupWindowDaysSchema = z.object({
  makeupWindowDays: z.number().int().min(1).max(365),
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
});

export const markNotificationReadSchema = z.object({
  notificationId: z.string().min(1),
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

export const createAnnouncementSchema = z
  .object({
    title: z.string().min(1),
    body: z.string().min(1),
    attachmentUrl: z.string().url().optional(),
    attachments: z.array(announcementAttachmentInputSchema).max(3).optional(),
    audienceType: z.enum(["all", "branch", "teachers", "parents", "students", "studentType", "selected"]),
    audienceRef: z
      .union([
        z.object({ branchId: z.string().min(1) }),
        z.object({ studentType: z.enum(STUDENT_TYPE_FOR_AUDIENCE) }),
        z.object({ userIds: z.array(z.string().min(1)).min(1) }),
      ])
      .optional(),
    status: z.enum(["draft", "published", "archived"]).optional(),
    pinned: z.boolean().optional(),
    publishAt: z.string().min(1).optional(),
    expireAt: z.string().min(1).optional(),
  })
  .refine(
    (d) => {
      if (d.audienceType === "branch") return !!d.audienceRef && "branchId" in d.audienceRef;
      if (d.audienceType === "studentType") return !!d.audienceRef && "studentType" in d.audienceRef;
      if (d.audienceType === "selected") return !!d.audienceRef && "userIds" in d.audienceRef;
      return true;
    },
    { message: "audienceType için gerekli audienceRef alanı eksik" }
  );

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
  strengthNote: z.string().min(1),
  nextStepsNote: z.string().min(1),
  improvementNote: z.string().min(1),
  parentPrivateNote: z.string().optional(),
  parentNoteVisibleToStudent: z.boolean().optional(),
  teacherSignedName: z.string().min(1),
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
const INSTRUMENT_FOR_HOMEWORK = ["Piyano", "Yan Flüt", "Gitar", "Bateri", "Keman", "Şan"] as const;

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
  progressPercent: z.number().int().min(0).max(100).optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  notes: z.string().max(2000).optional(),
});

/** TEACHER — konu günceller (durum/ilerleme/not) */
export const updateCurriculumTopicSchema = z.object({
  topicId: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: curriculumTopicStatusSchema.optional(),
  progressPercent: z.number().int().min(0).max(100).optional(),
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
   * Deneme dersi normal ders serisi/paket planlamasından AYRI bir akıştır —
   * bu yüzden normal derslerin sabit 30/40/50 dk kısıtına (bkz.
   * `src/lib/lesson-duration.ts` LESSON_DURATION_OPTIONS) tabi DEĞİLDİR.
   * Yalnızca makul bir aralıkla (1 dk – 4 saat) sınırlanır; kayıt öncesi
   * tanıtım dersi olduğu için süresi okulun kendi takdirine bırakılmıştır.
   */
  durationMinutes: z.coerce.number().int().min(1).max(240),
  notes: z.string().max(2000).optional(),
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

export const deleteSignedDocumentVersionSchema = z.object({
  documentId: z.string().min(1),
  versionId: z.string().min(1),
});

export const socialMediaConsentSchema = z.object({
  studentId: z.string().min(1),
  status: z.enum(["granted","denied","withdrawn","expired"]),
  representativeName: z.string().min(1),
  relationship: z.string().min(1),
  scopes: z.array(z.enum(["photo","video","name","voice","website","instagram","other"])).min(1),
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
  annualLeaveAllowanceDays: z.coerce.number().int().min(0).optional(),
  personnelNotes: z.string().optional(),
  notes: z.string().optional(),
  monthlySalary: z.coerce.number().int().min(0).optional(),
  hourlyRate: z.coerce.number().int().min(0).optional(),
  defaultBonus: z.coerce.number().int().min(0).optional(),
  defaultAllowances: z.coerce.number().int().min(0).optional(),
  defaultDeductions: z.coerce.number().int().min(0).optional(),
};

export const createStaffMemberSchema = z.object(staffMemberBaseFields);

export const updateStaffMemberSchema = z
  .object({ staffId: z.string().min(1), status: z.enum(["active", "on_leave", "passive", "terminated"]).optional() })
  .extend({
    ...staffMemberBaseFields,
    name: z.string().min(1).optional(),
    position: z.string().min(1).optional(),
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
export const createExpenseSchema = z.object({
  category: z.enum(["rent", "utilities", "supplies", "other"]),
  amount: z.coerce.number().int().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().optional(),
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
  notes: z.string().optional(),
});

/** Paket 5 — yüzde tabanlı kampanya/indirim (ör. "Kardeş Kampanyası"). */
export const createDiscountCampaignSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["sibling"]),
  discountPercent: z.coerce.number().int().min(1).max(100),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
  branchId: z.string().optional(),
});

export const updateDiscountCampaignSchema = z.object({
  campaignId: z.string().min(1),
  name: z.string().min(1).optional(),
  discountPercent: z.coerce.number().int().min(1).max(100).optional(),
  active: z.boolean().optional(),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
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
