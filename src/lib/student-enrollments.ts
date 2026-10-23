/**
 * 2026-10-04 — tek öğrenci, birden fazla eğitim (saf yardımcılar; I/O yok).
 *
 * Kaynak: `Student.enrollments`. Alan yoksa (eski tek eğitimli kayıt) eğitimler öğrencinin eski alanlarından
 * TÜRETİLİR (kaydedilmez): her enstrüman bir eğitim, öğretmen yalnız o enstrümanı veriyorsa bağlanır — enstrüman
 * ile öğretmen birbirinden kopuk iki liste olarak yorumlanmaz. Veri birleştirme/taşıma yapılmaz.
 */
import type {
  Lesson,
  LessonSeries,
  Payment,
  Student,
  StudentClearableField,
  StudentContract,
  StudentEnrollment,
  StudentProfilePatch,
  StudentType,
  Teacher,
} from "./types";
import { effectiveStudentTypes } from "./student-types";

export type EnrollmentView = StudentEnrollment & { legacy?: boolean };

export const LEGACY_ENROLLMENT_PREFIX = "legacy:";

export function effectiveEnrollments(
  student: Pick<Student, "id" | "enrollments" | "instruments" | "teacherId" | "lessonDurationMinutes" | "branchId" | "weeklyLessonCount" | "createdAt">,
  teachers?: Pick<Teacher, "id" | "instruments">[]
): EnrollmentView[] {
  if (student.enrollments && student.enrollments.length > 0) return student.enrollments;
  const teacher = teachers?.find((t) => t.id === student.teacherId);
  return (student.instruments ?? []).map((instrument, i) => ({
    id: `${LEGACY_ENROLLMENT_PREFIX}${student.id}:${instrument}`,
    instrument,
    // Tek enstrümanlı eski kayıtta öğretmen o eğitimindir; çok enstrümanlıda yalnız o enstrümanı verebiliyorsa.
    teacherId:
      student.instruments.length === 1 || !teacher || teacher.instruments.includes(instrument) ? student.teacherId : undefined,
    branchId: student.branchId,
    lessonDurationMinutes: student.lessonDurationMinutes,
    weeklyLessonCount: i === 0 ? student.weeklyLessonCount : undefined,
    active: true,
    primary: i === 0,
    createdAt: student.createdAt ?? "",
    legacy: true,
  }));
}

/**
 * 2026-10-17 — öğrencinin bağlı olduğu TÜM şubeler: ana şube (`Student.branchId`, her zaman ilk) + aktif branş
 * kayıtlarının şubeleri. Branş kaydında şube boşsa ana şubeyi devralır. Liste/filtre/ders planlama bunu okur.
 */
export function studentBranchIds(student: Pick<Student, "branchId" | "enrollments">): string[] {
  const extra = (student.enrollments ?? []).filter((e) => e.active && e.branchId).map((e) => e.branchId as string);
  return Array.from(new Set([student.branchId, ...extra].filter(Boolean)));
}

/** Dersin eğitimi: önce açık bağ (`enrollmentId`), yoksa enstrüman (+ öğretmen) eşleşmesi. */
export function enrollmentForLesson(
  enrollments: EnrollmentView[],
  lesson: Pick<Lesson, "enrollmentId" | "instrument" | "teacherId">
): EnrollmentView | undefined {
  if (lesson.enrollmentId) {
    const hit = enrollments.find((e) => e.id === lesson.enrollmentId);
    if (hit) return hit;
  }
  const byInstrument = enrollments.filter((e) => e.instrument === lesson.instrument);
  return byInstrument.find((e) => e.teacherId === lesson.teacherId) ?? byInstrument[0];
}

/** Öğrenciye eğitim üzerinden atanmış öğretmenler (aktif eğitimler + eski tekil öğretmen). */
export function studentTeacherIds(student: Pick<Student, "teacherId" | "enrollments">): Set<string> {
  const ids = new Set<string>([student.teacherId]);
  for (const e of student.enrollments ?? []) if (e.active && e.teacherId) ids.add(e.teacherId);
  return ids;
}

/**
 * Eğitim listesinden öğrencinin eski tekil alanlarını üretir (eski ekranlar/raporlar çalışmaya devam etsin):
 * instruments = aktif eğitimlerin enstrümanları, teacherId/ders süresi = birincil eğitim.
 */
export function primaryFieldsFromEnrollments(
  enrollments: StudentEnrollment[],
  fallback: Pick<Student, "teacherId" | "instruments" | "lessonDurationMinutes">
): Pick<Student, "teacherId" | "instruments" | "lessonDurationMinutes"> {
  const active = enrollments.filter((e) => e.active);
  const primary = active.find((e) => e.primary) ?? active[0];
  const instruments = Array.from(new Set(active.map((e) => e.instrument)));
  return {
    teacherId: primary?.teacherId ?? fallback.teacherId,
    instruments: instruments.length ? instruments : fallback.instruments,
    lessonDurationMinutes: (primary?.lessonDurationMinutes as Student["lessonDurationMinutes"]) ?? fallback.lessonDurationMinutes,
  };
}

export function enrollmentLabel(e: Pick<StudentEnrollment, "instrument" | "teacherId">, teachers: Pick<Teacher, "id" | "name">[]): string {
  const t = e.teacherId ? teachers.find((x) => x.id === e.teacherId)?.name : undefined;
  return t ? `${e.instrument} · ${t}` : e.instrument;
}

/** 2026-10-09 — branşı belirlenemeyen eski kaydın görünen adı (tahmin YAPILMAZ). */
export const UNASSIGNED_ENROLLMENT_LABEL = "Branş belirtilmemiş";

/**
 * ANA KAYIT (2026-10-09): koşulları öğrenci satırındaki eski alanlarda duran kayıt — `primary` işaretli olan (kapalı
 * olsa bile). Ana kayıt kapanınca koşullar başka branşa TAŞINMAZ; aksi halde bir branşın ücreti diğerine geçerdi.
 */
export function primaryEnrollmentOf<T extends Pick<StudentEnrollment, "id" | "primary" | "active">>(list: T[]): T | undefined {
  return list.find((e) => e.primary) ?? list[0];
}

type TermsStudent = Pick<
  Student,
  | "id"
  | "enrollments"
  | "instruments"
  | "teacherId"
  | "lessonDurationMinutes"
  | "branchId"
  | "weeklyLessonCount"
  | "createdAt"
  | "studentTypes"
  | "studentType"
  | "packageId"
  | "packageName"
  | "monthlyFee"
  | "packageBaseMonthlyFee"
  | "discountType"
  | "discountValue"
  | "monthlyFeeManualOverride"
  | "monthlyFeeOverrideReason"
  | "derivedPerLessonAmount"
  | "paymentMethod"
  | "paymentDueDay"
  | "paymentDueRanges"
  | "enrollmentStartDate"
  | "lessonStartDate"
  | "lessonScheduleText"
  | "intendedDurationMonths"
  | "enrollmentEndDate"
  | "level"
  | "targetExam"
  | "mebLevelStartDate"
  | "mebLevelEndDate"
  | "mebExamDate"
  | "mebExamAttended"
  | "appliedCampaignIds"
>;

/** 2026-10-09 — bir branş kaydının TÜM işletim koşulları (tür, öğretmen, paket/ücret, ödeme, tarih, program, seviye/MEB). */
export type EnrollmentTerms = {
  enrollmentId: string;
  /**
   * UYUMLULUK İŞARETİ (ayrıcalık DEĞİL): öğrenci satırı aynasının kaynağı olan branş. v2'de hiçbir okuma kuralını
   * değiştirmez; yalnız eski (v1) ana kaydın koşullarının öğrenci satırında durduğunu gösterir.
   */
  primary: boolean;
  /** Koşulların okunduğu yer: "enrollment" (v2 ve v1 ek kayıt) | "student-row" (yalnız eski, henüz kalıcılaştırılmamış ana kayıt). */
  source: "enrollment" | "student-row";
  active: boolean;
  instrument: string;
  teacherId?: string;
  branchId: string;
  lessonDurationMinutes?: number;
  weeklyLessonCount: number;
  studentTypes: StudentType[];
  packageId?: string;
  packageName?: string;
  monthlyFee: number;
  packageBaseMonthlyFee?: number;
  discountType?: Student["discountType"];
  discountValue?: number;
  monthlyFeeManualOverride?: boolean;
  monthlyFeeOverrideReason?: string;
  derivedPerLessonAmount?: number;
  paymentMethod?: Student["paymentMethod"];
  paymentDueDay?: number;
  paymentDueRanges?: Student["paymentDueRanges"];
  /** Branş kayıt tarihi. */
  startDate?: string;
  lessonStartDate?: string;
  lessonScheduleText?: string;
  intendedDurationMonths?: number;
  endDate?: string;
  /** Seviye (MEB'de 1–8) ve MEB dönem/sınav bilgileri — BRANŞA özgüdür. */
  level?: string;
  targetExam?: string;
  mebLevelStartDate?: string;
  mebLevelEndDate?: string;
  mebExamDate?: string;
  mebExamAttended?: boolean;
  appliedCampaignIds?: string[];
  /** 2026-10-23 — grup dersi katılımı (koşul değil, kimlik bağı; düzenlemede değişmez). */
  groupLessonId?: string;
};

/** v2: koşullar kayıtta tam ve bağımsızdır. */
export function hasOwnTerms(e: Pick<StudentEnrollment, "termsVersion">): boolean {
  return e.termsVersion === 2;
}

function dueRangesOf(day: number | undefined, ranges: StudentEnrollment["paymentDueRanges"]): StudentEnrollment["paymentDueRanges"] {
  if (ranges && ranges.length > 0) return ranges;
  return day ? [{ start: day, end: day }] : undefined;
}

/** Kaydın kendi koşulları (v2 ve v1 ek kayıtlar). Öğrenci satırından HİÇBİR değer ödünç alınmaz (tek istisna: şube kimliği). */
function termsFromRecord(student: Pick<Student, "branchId">, enrollment: EnrollmentView, primary: boolean): EnrollmentTerms {
  return {
    enrollmentId: enrollment.id,
    primary,
    source: "enrollment",
    active: enrollment.active,
    instrument: enrollment.instrument,
    // Şube: branşın kendi şubesi; yoksa kişinin kayıt şubesi (kişi düzeyinde konum bilgisi, başka branşın değeri DEĞİL).
    branchId: enrollment.branchId ?? student.branchId,
    teacherId: enrollment.teacherId,
    lessonDurationMinutes: enrollment.lessonDurationMinutes,
    weeklyLessonCount: enrollment.weeklyLessonCount ?? 1,
    studentTypes: enrollment.studentTypes ?? [],
    packageId: enrollment.packageId,
    packageName: enrollment.packageName,
    monthlyFee: enrollment.monthlyFee ?? 0,
    packageBaseMonthlyFee: enrollment.packageBaseMonthlyFee,
    discountType: enrollment.discountType,
    discountValue: enrollment.discountValue,
    monthlyFeeManualOverride: enrollment.monthlyFeeManualOverride,
    monthlyFeeOverrideReason: enrollment.monthlyFeeOverrideReason,
    derivedPerLessonAmount: enrollment.derivedPerLessonAmount,
    paymentMethod: enrollment.paymentMethod,
    paymentDueDay: enrollment.paymentDueDay,
    paymentDueRanges: dueRangesOf(enrollment.paymentDueDay, enrollment.paymentDueRanges),
    startDate: enrollment.startDate ?? (enrollment.createdAt ? enrollment.createdAt.slice(0, 10) : undefined),
    lessonStartDate: enrollment.lessonStartDate,
    lessonScheduleText: enrollment.lessonScheduleText,
    intendedDurationMonths: enrollment.intendedDurationMonths,
    endDate: enrollment.endDate,
    level: enrollment.level,
    targetExam: enrollment.targetExam,
    mebLevelStartDate: enrollment.mebLevelStartDate,
    mebLevelEndDate: enrollment.mebLevelEndDate,
    mebExamDate: enrollment.mebExamDate,
    mebExamAttended: enrollment.mebExamAttended,
    appliedCampaignIds: enrollment.appliedCampaignIds,
    groupLessonId: enrollment.groupLessonId,
  };
}

/**
 * TEK okuma kapısı. Üç durum:
 * 1) v2 kayıt (`termsVersion: 2`) ve v1 ek kayıt: koşullar YALNIZ kendi kaydından gelir — hiçbir branş diğerinin
 *    ücretini/türünü/MEB bilgisini miras almaz.
 * 2) Eski ana kayıt (v1/legacy, henüz kalıcılaştırılmamış): koşulları öğrenci satırındaki eski alanlardadır; bu o
 *    kaydın KENDİ verisidir (başka branşın değil). İlk branş yazımında kayda kopyalanır (`materializeEnrollmentTerms`).
 */
export function enrollmentTerms(student: TermsStudent, enrollment: EnrollmentView, teachers?: Pick<Teacher, "id" | "instruments">[]): EnrollmentTerms {
  const list = effectiveEnrollments(student, teachers);
  const anchorId = primaryEnrollmentOf(list)?.id;
  const isAnchor = anchorId === enrollment.id;
  if (hasOwnTerms(enrollment) || !isAnchor) {
    return termsFromRecord(student, enrollment, enrollment.id === (mirrorSourceOf(list)?.id ?? anchorId));
  }
  return {
    enrollmentId: enrollment.id,
    primary: true,
    source: "student-row",
    active: enrollment.active,
    instrument: enrollment.instrument,
    branchId: enrollment.branchId ?? student.branchId,
    teacherId: enrollment.teacherId ?? student.teacherId,
    lessonDurationMinutes: enrollment.lessonDurationMinutes ?? student.lessonDurationMinutes,
    weeklyLessonCount: enrollment.weeklyLessonCount ?? student.weeklyLessonCount,
    studentTypes: effectiveStudentTypes(student),
    packageId: student.packageId,
    packageName: student.packageName,
    monthlyFee: student.monthlyFee,
    packageBaseMonthlyFee: student.packageBaseMonthlyFee,
    discountType: student.discountType,
    discountValue: student.discountValue,
    monthlyFeeManualOverride: student.monthlyFeeManualOverride,
    monthlyFeeOverrideReason: student.monthlyFeeOverrideReason,
    derivedPerLessonAmount: student.derivedPerLessonAmount,
    paymentMethod: student.paymentMethod,
    paymentDueDay: student.paymentDueDay,
    paymentDueRanges: student.paymentDueRanges,
    startDate: student.enrollmentStartDate ?? enrollment.startDate,
    lessonStartDate: student.lessonStartDate,
    lessonScheduleText: student.lessonScheduleText,
    intendedDurationMonths: student.intendedDurationMonths,
    endDate: enrollment.endDate ?? student.enrollmentEndDate,
    level: student.level,
    targetExam: student.targetExam,
    mebLevelStartDate: student.mebLevelStartDate,
    mebLevelEndDate: student.mebLevelEndDate,
    mebExamDate: student.mebExamDate,
    mebExamAttended: student.mebExamAttended,
    appliedCampaignIds: student.appliedCampaignIds,
    groupLessonId: enrollment.groupLessonId,
  };
}

/**
 * Öğrenci şekilli eski yardımcılara (sözleşme ön doldurma, ders başı faturalama…) branşın koşullarıyla verilecek
 * görünüm. Kimlik, iletişim ve veli bilgileri PAYLAŞILIR; yalnız branşa özgü alanlar branştan gelir.
 */
export function studentWithEnrollmentTerms<S extends import("./types").StudentRef>(student: S, terms: EnrollmentTerms): S {
  return {
    ...student,
    instruments: [terms.instrument],
    teacherId: terms.teacherId ?? student.teacherId,
    branchId: terms.branchId,
    lessonDurationMinutes: terms.lessonDurationMinutes as Student["lessonDurationMinutes"],
    weeklyLessonCount: terms.weeklyLessonCount,
    studentTypes: terms.studentTypes,
    studentType: terms.studentTypes[0],
    packageId: terms.packageId,
    packageName: terms.packageName ?? "",
    monthlyFee: terms.monthlyFee,
    packageBaseMonthlyFee: terms.packageBaseMonthlyFee,
    discountType: terms.discountType,
    discountValue: terms.discountValue,
    monthlyFeeManualOverride: terms.monthlyFeeManualOverride,
    monthlyFeeOverrideReason: terms.monthlyFeeOverrideReason,
    derivedPerLessonAmount: terms.derivedPerLessonAmount,
    paymentMethod: terms.paymentMethod,
    paymentDueDay: terms.paymentDueDay,
    paymentDueRanges: terms.paymentDueRanges,
    enrollmentStartDate: terms.startDate,
    lessonStartDate: terms.lessonStartDate,
    lessonScheduleText: terms.lessonScheduleText,
    intendedDurationMonths: terms.intendedDurationMonths,
    enrollmentEndDate: terms.endDate,
    // 2026-10-10 — seviye ve MEB bilgileri de branşındır (belge/sözleşme ön doldurma başka branşınkini görmesin).
    level: terms.level,
    targetExam: terms.targetExam,
    mebLevelStartDate: terms.mebLevelStartDate,
    mebLevelEndDate: terms.mebLevelEndDate,
    mebExamDate: terms.mebExamDate,
    mebExamAttended: terms.mebExamAttended,
    appliedCampaignIds: terms.appliedCampaignIds,
  };
}

/** Öğrencinin TEK branş kaydı varsa kimliği (eski, bağsız kayıtlar ona aittir); birden fazlaysa undefined. */
export function soleEnrollmentId(
  student: Parameters<typeof effectiveEnrollments>[0],
  teachers?: Pick<Teacher, "id" | "instruments">[]
): string | undefined {
  const list = effectiveEnrollments(student, teachers);
  return list.length === 1 ? list[0]!.id : undefined;
}

/**
 * Dersin branşı — açık bağ; yoksa tek branşlı öğrencide o branş; yoksa enstrümanı (gerekirse öğretmeni) TEK kayıtla
 * eşleşen branş. Birden fazla aday kalırsa undefined: "ilk bulunan" seçilmez.
 */
export function lessonEnrollmentId(
  student: Parameters<typeof effectiveEnrollments>[0],
  lesson: Pick<Lesson, "enrollmentId" | "instrument" | "teacherId">,
  teachers?: Pick<Teacher, "id" | "instruments">[]
): string | undefined {
  if (lesson.enrollmentId) return lesson.enrollmentId;
  const list = effectiveEnrollments(student, teachers);
  if (list.length === 1) return list[0]!.id;
  const byInstrument = list.filter((e) => e.instrument === lesson.instrument);
  if (byInstrument.length === 1) return byInstrument[0]!.id;
  const byTeacher = byInstrument.filter((e) => e.teacherId === lesson.teacherId);
  return byTeacher.length === 1 ? byTeacher[0]!.id : undefined;
}

/** Sözleşmenin branşı — açık bağ; yoksa yalnız tek branşlı öğrencide o branş. */
export function contractEnrollmentId(
  student: Parameters<typeof effectiveEnrollments>[0],
  contract: Pick<StudentContract, "enrollmentId">,
  teachers?: Pick<Teacher, "id" | "instruments">[]
): string | undefined {
  return contract.enrollmentId ?? soleEnrollmentId(student, teachers);
}

/**
 * Ödeme satırının branşı — açık bağ → sözleşmesinin branşı → ders bazlıysa dersin branşı → tek branşlı öğrencide o
 * branş. Kulüp ücreti branş kaydı değildir (undefined). Belirlenemiyorsa undefined ("Branş belirtilmemiş").
 */
export function paymentEnrollmentId(
  student: Parameters<typeof effectiveEnrollments>[0],
  p: Pick<Payment, "enrollmentId" | "contractId" | "lessonId" | "source" | "clubMembershipId">,
  refs: {
    contracts?: Pick<StudentContract, "id" | "enrollmentId">[];
    lessons?: Pick<Lesson, "id" | "enrollmentId" | "instrument" | "teacherId">[];
  },
  teachers?: Pick<Teacher, "id" | "instruments">[]
): string | undefined {
  if (p.source === "club" || p.clubMembershipId) return undefined;
  if (p.enrollmentId) return p.enrollmentId;
  if (p.contractId) {
    const c = refs.contracts?.find((x) => x.id === p.contractId);
    if (c?.enrollmentId) return c.enrollmentId;
  }
  if (p.lessonId) {
    const l = refs.lessons?.find((x) => x.id === p.lessonId);
    const id = l ? lessonEnrollmentId(student, l, teachers) : undefined;
    if (id) return id;
  }
  return soleEnrollmentId(student, teachers);
}

/** Bir branş seçimi için kayıt filtresi (`enrollmentId` yoksa filtre yok — tek branşlı/tümü görünümü). */
export function isPersistedEnrollmentId(id: string | undefined): id is string {
  return !!id && !id.startsWith(LEGACY_ENROLLMENT_PREFIX);
}

/**
 * 2026-10-09 — bir sorgunun BRANŞ kapsamı: `enrollmentId` verilen branş; `includeUnlinked` ile branşı belirtilmemiş
 * (NULL, eski) satırlar da dahil edilir — YALNIZ öğrencinin tek branş kaydı varken (eski satır ona aittir).
 * `enrollmentId` yoksa (kalıcı branş kaydı açılmamış eski öğrenci) yalnız NULL satırlar.
 */
export type EnrollmentScope = { enrollmentId?: string; includeUnlinked?: boolean };

export function matchesEnrollmentScope(recordEnrollmentId: string | null | undefined, scope?: EnrollmentScope): boolean {
  if (!scope) return true;
  if (recordEnrollmentId) return recordEnrollmentId === scope.enrollmentId;
  return !scope.enrollmentId || scope.includeUnlinked === true;
}

/**
 * 2026-10-09 — json/memory store için saf bağlama (db karşılığı: store-db.ts `linkRecordsToEnrollment`, AYNI kural):
 * yalnız branş bağı OLMAYAN (NULL) satırlar yazılır; kulüp satırı / grup (kulüp) dersi branş kaydı değildir.
 */
/**
 * 2026-10-10 — "tek branşlı öğrencide bağsız kayıt o branşındır" varsayımı YALNIZ yapısal olarak sahibi belli satırlar için
 * geçerlidir: sözleşme taksidi, kayıt ilk tahsilatı, aylık plan, derse bağlı tahsilat. Elle girilmiş GENEL satırlar
 * (kitap, kira, cezai işlem…) bir branşa ait olmayabilir; otomatik bağlanmaz, "Branş belirtilmemiş / genel" olarak kalır
 * ve yönetici "Branşa bağla" ile AÇIKÇA bağlar (finansal tahmin yok).
 */
export const AUTO_LINK_PAYMENT_SOURCES = ["registration_first_payment", "monthly_plan", "contract", "lesson_ops"] as const;

export function isAutoLinkablePaymentSource(source: Payment["source"] | undefined): boolean {
  return (AUTO_LINK_PAYMENT_SOURCES as readonly string[]).includes(source ?? "manual");
}

export function linkRecordsInData<
  D extends { payments: Payment[]; lessons: Lesson[]; lessonSeries: LessonSeries[] },
>(
  data: D,
  input: { studentId: string; enrollmentId: string; instrument?: string; scope?: "student"; contractIds?: string[]; paymentIds?: string[] }
): { data: D; counts: { payments: number; lessons: number; series: number } } {
  const counts = { payments: 0, lessons: 0, series: 0 };
  const contractIds = new Set(input.contractIds ?? []);
  const paymentIds = new Set(input.paymentIds ?? []);
  const seriesIds = new Set(
    data.lessonSeries.filter((s) => s.studentId === input.studentId && s.contractId && contractIds.has(s.contractId)).map((s) => s.id)
  );
  const payments = data.payments.map((p) => {
    if (p.studentId !== input.studentId || p.enrollmentId || p.source === "club" || p.clubMembershipId) return p;
    const hit =
      (input.scope === "student" && isAutoLinkablePaymentSource(p.source)) ||
      (!!p.contractId && contractIds.has(p.contractId)) ||
      paymentIds.has(p.id);
    if (!hit) return p;
    counts.payments++;
    return { ...p, enrollmentId: input.enrollmentId };
  });
  const lessonSeries = data.lessonSeries.map((s) => {
    if (s.studentId !== input.studentId || s.enrollmentId) return s;
    const hit = (input.scope === "student" && !!input.instrument && s.instrument === input.instrument) || seriesIds.has(s.id);
    if (!hit) return s;
    counts.series++;
    return { ...s, enrollmentId: input.enrollmentId };
  });
  const lessons = data.lessons.map((l) => {
    if (l.studentId !== input.studentId || l.enrollmentId || l.type === "group" || l.clubSessionId) return l;
    const hit =
      (input.scope === "student" && !!input.instrument && l.instrument === input.instrument) || (!!l.seriesId && seriesIds.has(l.seriesId));
    if (!hit) return l;
    counts.lessons++;
    return { ...l, enrollmentId: input.enrollmentId };
  });
  return { data: { ...data, payments, lessons, lessonSeries }, counts };
}

/** Branş kaydının kısa adı — aynı enstrümanda birden fazla kayıt varsa öğretmenle ayrılır. */
export function enrollmentDisplayName(
  e: Pick<StudentEnrollment, "id" | "instrument" | "teacherId">,
  siblings: Pick<StudentEnrollment, "id" | "instrument">[],
  teachers: Pick<Teacher, "id" | "name">[]
): string {
  return siblings.some((x) => x.id !== e.id && x.instrument === e.instrument) ? enrollmentLabel(e, teachers) : e.instrument;
}

/**
 * 2026-10-09 — ödeme satırı → branş etiketi (çok branşlı öğrencide; tek branşlıda sade görünüm için undefined).
 * Belirlenemeyen eski satır "Branş belirtilmemiş" — tahmin yapılmaz. Kulüp ücreti branş değildir (undefined).
 */
export function makePaymentBranchLabeler(input: {
  students: import("./types").StudentRef[];
  teachers: Pick<Teacher, "id" | "name" | "instruments">[];
  lessons?: Pick<Lesson, "id" | "enrollmentId" | "instrument" | "teacherId">[];
  contracts?: Pick<StudentContract, "id" | "enrollmentId">[];
}): (p: Pick<Payment, "studentId" | "enrollmentId" | "contractId" | "lessonId" | "source" | "clubMembershipId">) => string | undefined {
  const byStudent = new Map<string, { student: import("./types").StudentRef; list: EnrollmentView[] }>();
  for (const st of input.students) byStudent.set(st.id, { student: st, list: effectiveEnrollments(st, input.teachers) });
  return (p) => {
    const hit = byStudent.get(p.studentId);
    if (!hit || hit.list.length < 2 || p.source === "club" || p.clubMembershipId) return undefined;
    const id = paymentEnrollmentId(hit.student, p, { contracts: input.contracts, lessons: input.lessons }, input.teachers);
    const e = id ? hit.list.find((x) => x.id === id) : undefined;
    return e ? enrollmentDisplayName(e, hit.list, input.teachers) : UNASSIGNED_ENROLLMENT_LABEL;
  };
}

/* ======================================================================================================================
 * 2026-10-10 — SÜRÜM 2: branş koşulları KAYITTA; öğrenci satırı yalnız UYUMLULUK AYNASI
 *
 * Neden: önceki düzende ilk branşın koşulları öğrenci satırında, diğerlerininki kayıtta duruyordu; satırdaki değerler
 * (ücret, tür, MEB…) fiilen "ilk branşın" verisiydi ve ilk branş kapanınca/değişince karışıyordu. Artık her branş kendi
 * koşullarının tek sahibidir (`termsVersion: 2`). Öğrenci satırındaki aynı adlı alanlar, henüz dönüştürülmemiş eski
 * okuyucular (liste sütunları, dışa aktarımlar, AI araçları…) çalışmaya devam etsin diye `mirrorPatchFromEnrollments`
 * ile TEK yerden üretilir; hiçbir branşın koşulunun KAYNAĞI değildir ve okunarak başka branşa uygulanmamalıdır.
 *
 * Geçiş: yeni yazım her zaman v2 üretir; eski kayıtlar ilk branş yazımında (veya `scripts/reconcile-enrollment-terms.ts`
 * ile toplu ve önce kuru çalıştırmayla) dönüştürülür. Kalıcı branş kaydı olmayan TEK branşlı öğrenci dönüştürülmeden
 * çalışmaya devam eder (satır = tek branşın kendisi).
 * ==================================================================================================================== */

/** `{...a, ...b}` içinde `undefined` mevcut veriyi SİLER (2026-09-28 dersi) — yalnız tanımlı değerleri taşır. */
function definedOnly<T extends object>(o: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as Partial<T>;
}

/** Koşulların kayıt alanlarına dökümü (yalnız tanımlı değerler). Şube kimliği KOPYALANMAZ: kişinin şubesini devralmaya devam eder. */
export function termsToRecordFields(t: EnrollmentTerms): Partial<StudentEnrollment> {
  return definedOnly<Partial<StudentEnrollment>>({
    teacherId: t.teacherId,
    lessonDurationMinutes: t.lessonDurationMinutes,
    weeklyLessonCount: t.weeklyLessonCount,
    studentTypes: t.studentTypes,
    packageId: t.packageId,
    packageName: t.packageName,
    monthlyFee: t.monthlyFee,
    packageBaseMonthlyFee: t.packageBaseMonthlyFee,
    discountType: t.discountType,
    discountValue: t.discountValue,
    monthlyFeeManualOverride: t.monthlyFeeManualOverride,
    monthlyFeeOverrideReason: t.monthlyFeeOverrideReason,
    derivedPerLessonAmount: t.derivedPerLessonAmount,
    paymentMethod: t.paymentMethod,
    paymentDueDay: t.paymentDueDay,
    paymentDueRanges: t.paymentDueRanges,
    startDate: t.startDate,
    lessonStartDate: t.lessonStartDate,
    lessonScheduleText: t.lessonScheduleText,
    intendedDurationMonths: t.intendedDurationMonths,
    endDate: t.endDate,
    level: t.level,
    targetExam: t.targetExam,
    mebLevelStartDate: t.mebLevelStartDate,
    mebLevelEndDate: t.mebLevelEndDate,
    mebExamDate: t.mebExamDate,
    mebExamAttended: t.mebExamAttended,
    appliedCampaignIds: t.appliedCampaignIds,
  });
}

/**
 * Öğrencinin TÜM branş kayıtlarını v2'ye çıkarır (ya hep ya hiç): eski ana kaydın koşulları öğrenci satırından o kayda
 * KOPYALANIR, ek kayıtlar kendi değerlerini korur. Zaten v2 olan liste aynen döner. Girdi değiştirilmez.
 */
export function materializeEnrollmentTerms(
  student: TermsStudent,
  list: StudentEnrollment[],
  teachers?: Pick<Teacher, "id" | "instruments">[]
): StudentEnrollment[] {
  if (list.every(hasOwnTerms)) return list;
  const view = { ...student, enrollments: list };
  return list.map((e) => {
    if (hasOwnTerms(e)) return e;
    const terms = enrollmentTerms(view, e, teachers);
    return { ...e, ...termsToRecordFields(terms), termsVersion: 2 as const };
  });
}

function byCreated(a: Pick<StudentEnrollment, "id" | "createdAt">, b: Pick<StudentEnrollment, "id" | "createdAt">): number {
  return (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id);
}

/**
 * Öğrenci satırı aynasının kaynağı: `primary` işaretli AKTİF kayıt; yoksa en eski aktif kayıt. Hiçbir aktif kayıt yoksa
 * undefined (ayna değişmez). Bu bir ayrıcalık değil, eski okuyucular için tek bir tutarlı değer seçme kuralıdır.
 */
export function mirrorSourceOf<T extends Pick<StudentEnrollment, "id" | "active" | "primary" | "createdAt">>(list: T[]): T | undefined {
  const active = list.filter((e) => e.active);
  return active.find((e) => e.primary) ?? [...active].sort(byCreated)[0];
}

/**
 * Öğrenci satırının uyumluluk aynası. Tüm koşullar TEK kaynak branştan gelir (tutarlı bir bütün); `instruments` ve
 * `studentTypes` ise kişi düzeyi özet olarak AKTİF branşların birleşimidir. Kaynakta olmayan isteğe bağlı değerler
 * `clearFields` ile temizlenir — önceki kaynaktan artakalan değer kalmaz.
 */
export function mirrorPatchFromEnrollments(list: StudentEnrollment[]): StudentProfilePatch {
  const src = mirrorSourceOf(list);
  if (!src) return {};
  const active = list.filter((e) => e.active);
  const types = Array.from(new Set(active.flatMap((e) => e.studentTypes ?? [])));
  const patch: StudentProfilePatch = {
    instruments: Array.from(new Set(active.map((e) => e.instrument))),
    weeklyLessonCount: src.weeklyLessonCount ?? 1,
    monthlyFee: src.monthlyFee ?? 0,
    packageName: src.packageName ?? "",
    monthlyFeeManualOverride: src.monthlyFeeManualOverride ?? false,
  };
  const clear: StudentClearableField[] = [];
  function put<K extends keyof StudentProfilePatch>(key: K, value: StudentProfilePatch[K] | undefined, clearKey?: StudentClearableField): void {
    if (value !== undefined) patch[key] = value;
    else if (clearKey) clear.push(clearKey);
  }
  if (src.teacherId) patch.teacherId = src.teacherId;
  put("lessonDurationMinutes", src.lessonDurationMinutes as Student["lessonDurationMinutes"] | undefined, "lessonDurationMinutes");
  // Tür yoksa kolon TEMİZLENİR ([] yazılmaz): eski kayıtlarla aynı "tür belirtilmemiş" gösterimi.
  put("studentTypes", types.length > 0 ? types : undefined, "studentTypes");
  put("studentType", types[0], "studentType");
  put("packageId", src.packageId, "packageId");
  put("packageBaseMonthlyFee", src.packageBaseMonthlyFee, "packageBaseMonthlyFee");
  put("discountType", src.discountType, "discountType");
  put("discountValue", src.discountValue, "discountValue");
  put("monthlyFeeOverrideReason", src.monthlyFeeOverrideReason, "monthlyFeeOverrideReason");
  put("derivedPerLessonAmount", src.derivedPerLessonAmount, "derivedPerLessonAmount");
  put("paymentMethod", src.paymentMethod, "paymentMethod");
  put("paymentDueDay", src.paymentDueDay, "paymentDueDay");
  put("paymentDueRanges", dueRangesOf(src.paymentDueDay, src.paymentDueRanges), "paymentDueRanges");
  put("enrollmentStartDate", src.startDate);
  put("lessonStartDate", src.lessonStartDate, "lessonStartDate");
  put("lessonScheduleText", src.lessonScheduleText, "lessonScheduleText");
  put("intendedDurationMonths", src.intendedDurationMonths, "intendedDurationMonths");
  put("enrollmentEndDate", src.endDate, "enrollmentEndDate");
  put("level", src.level, "level");
  put("targetExam", src.targetExam, "targetExam");
  put("mebLevelStartDate", src.mebLevelStartDate, "mebLevelStartDate");
  put("mebLevelEndDate", src.mebLevelEndDate, "mebLevelEndDate");
  put("mebExamDate", src.mebExamDate, "mebExamDate");
  put("mebExamAttended", src.mebExamAttended, "mebExamAttended");
  put("appliedCampaignIds", src.appliedCampaignIds, "appliedCampaignIds");
  if (clear.length > 0) patch.clearFields = clear;
  return patch;
}

/** Öğrenci satırı yamasındaki alan → kayıt alanı eşlemesi (branşa özgü koşullar). Listede olmayan alan KİŞİ düzeyidir. */
const ROW_TO_RECORD_KEY: Partial<Record<string, keyof StudentEnrollment>> = {
  studentTypes: "studentTypes",
  enrollmentStartDate: "startDate",
  lessonStartDate: "lessonStartDate",
  intendedDurationMonths: "intendedDurationMonths",
  lessonScheduleText: "lessonScheduleText",
  enrollmentEndDate: "endDate",
  level: "level",
  targetExam: "targetExam",
  mebLevelStartDate: "mebLevelStartDate",
  mebLevelEndDate: "mebLevelEndDate",
  mebExamDate: "mebExamDate",
  mebExamAttended: "mebExamAttended",
  lessonDurationMinutes: "lessonDurationMinutes",
  teacherId: "teacherId",
  paymentMethod: "paymentMethod",
  paymentDueDay: "paymentDueDay",
  paymentDueRanges: "paymentDueRanges",
  packageId: "packageId",
  packageName: "packageName",
  packageBaseMonthlyFee: "packageBaseMonthlyFee",
  discountType: "discountType",
  discountValue: "discountValue",
  monthlyFee: "monthlyFee",
  monthlyFeeManualOverride: "monthlyFeeManualOverride",
  monthlyFeeOverrideReason: "monthlyFeeOverrideReason",
  derivedPerLessonAmount: "derivedPerLessonAmount",
  weeklyLessonCount: "weeklyLessonCount",
  appliedCampaignIds: "appliedCampaignIds",
};

/** Yama bir BRANŞ koşuluna dokunuyor mu? (`enrollmentId` ve boş `clearFields` sayılmaz.) */
export function patchTouchesEnrollmentTerms(patch: StudentProfilePatch): boolean {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (k === "studentType" || ROW_TO_RECORD_KEY[k]) return true;
  }
  return (patch.clearFields ?? []).some((f) => !!ROW_TO_RECORD_KEY[f] || f === "studentType");
}

/** Yamayı kişi düzeyi + branş koşulu olarak ayırır. `studentType` (tekil, eski) `studentTypes`'a dönüştürülür. */
export function splitTermPatch(patch: StudentProfilePatch): {
  person: StudentProfilePatch;
  terms: Partial<StudentEnrollment>;
  clear: (keyof StudentEnrollment)[];
} {
  const person: Record<string, unknown> = {};
  const terms: Record<string, unknown> = {};
  const clear: (keyof StudentEnrollment)[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || k === "clearFields" || k === "enrollmentId" || k === "studentType") continue;
    const recordKey = ROW_TO_RECORD_KEY[k];
    if (recordKey) terms[recordKey] = v;
    else person[k] = v;
  }
  if (terms.studentTypes === undefined && patch.studentType !== undefined) terms.studentTypes = [patch.studentType];
  const personClear: StudentClearableField[] = [];
  for (const f of patch.clearFields ?? []) {
    const recordKey = ROW_TO_RECORD_KEY[f];
    if (recordKey) clear.push(recordKey);
    else if (f !== "studentType") personClear.push(f);
  }
  if (personClear.length > 0) person.clearFields = personClear;
  return { person: person as StudentProfilePatch, terms: terms as Partial<StudentEnrollment>, clear };
}

export type EnrollmentTargetResult =
  | { ok: true; enrollment: EnrollmentView }
  | { ok: false; code: "AMBIGUOUS" | "NOT_FOUND" | "NO_ENROLLMENT"; message: string };

/**
 * Bir branşa yazılacak işlemin HEDEFİ. Açık kimlik verilmişse o branş; verilmemişse yalnız belirsizlik yoksa (tek branş
 * ya da tek AKTİF branş). Çok branşlı öğrencide "ilk bulunan" ASLA seçilmez.
 */
export function resolveEnrollmentTarget(
  student: Parameters<typeof effectiveEnrollments>[0],
  enrollmentId: string | undefined,
  teachers?: Pick<Teacher, "id" | "name" | "instruments">[]
): EnrollmentTargetResult {
  const list = effectiveEnrollments(student, teachers);
  if (list.length === 0) return { ok: false, code: "NO_ENROLLMENT", message: "Öğrencinin branş kaydı yok." };
  if (enrollmentId) {
    const hit = list.find((e) => e.id === enrollmentId);
    return hit
      ? { ok: true, enrollment: hit }
      : { ok: false, code: "NOT_FOUND", message: "Seçilen branş kaydı bu öğrenciye ait değil. Sayfayı yenileyip branşı yeniden seçin." };
  }
  if (list.length === 1) return { ok: true, enrollment: list[0]! };
  const active = list.filter((e) => e.active);
  if (active.length === 1) return { ok: true, enrollment: active[0]! };
  const names = active.map((e) => enrollmentDisplayName(e, list, teachers ?? [])).join(", ");
  return {
    ok: false,
    code: "AMBIGUOUS",
    message: `Bu öğrencinin birden fazla aktif branşı var (${names}). Değişiklik hangi branşa uygulanacak? Öğrenci sayfasının üstündeki "Branş" seçicisinden branşı seçip işlemi tekrarlayın.`,
  };
}

export type TermPatchRoute =
  | { mode: "row" }
  | { mode: "record"; enrollmentId: string; needsPersist: boolean }
  | { mode: "error"; code: "AMBIGUOUS" | "NOT_FOUND"; message: string };

/**
 * Branş koşulu yazımı nereye gider?
 * - "row": kalıcı branş kaydı olmayan TEK branşlı eski öğrenci — satır o branşın kendisidir (davranış değişmez).
 * - "record": kalıcı kayıt var (veya çok branşlı eski öğrenci) — yazım hedef branşın kaydına gider ve ayna yenilenir.
 * - "error": çok branşlı öğrencide hedef belirsiz/yanlış.
 */
export function routeTermPatch(
  student: Parameters<typeof effectiveEnrollments>[0],
  enrollmentId: string | undefined,
  teachers?: Pick<Teacher, "id" | "name" | "instruments">[]
): TermPatchRoute {
  const target = resolveEnrollmentTarget(student, enrollmentId, teachers);
  if (!target.ok) {
    return target.code === "NO_ENROLLMENT" ? { mode: "row" } : { mode: "error", code: target.code, message: target.message };
  }
  const persisted = (student.enrollments?.length ?? 0) > 0;
  if (!persisted) {
    return effectiveEnrollments(student, teachers).length <= 1
      ? { mode: "row" }
      : { mode: "record", enrollmentId: target.enrollment.id, needsPersist: true };
  }
  return { mode: "record", enrollmentId: target.enrollment.id, needsPersist: false };
}

/** Seçici parametresi (`?brans=`) → öğrencinin branşı; öğrenciye ait olmayan kimlik YOK SAYILIR (undefined). */
export function selectEnrollmentParam(list: EnrollmentView[], raw: string | undefined | null): EnrollmentView | undefined {
  if (!raw) return undefined;
  return list.find((e) => e.id === raw);
}

export type EnrollmentChange =
  | { kind: "add"; record: StudentEnrollment }
  | { kind: "replace"; enrollmentId: string; next: StudentEnrollment; expectedUpdatedAt?: string }
  | { kind: "patchTerms"; enrollmentId: string; terms: Partial<StudentEnrollment>; clear?: (keyof StudentEnrollment)[]; expectedUpdatedAt?: string };

export type EnrollmentChangeResult =
  | { ok: true; enrollments: StudentEnrollment[]; mirror: StudentProfilePatch; changed: StudentEnrollment }
  | {
      ok: false;
      code: "NOT_FOUND" | "STALE" | "DUPLICATE" | "NO_ACTIVE";
      message: string;
      /** DUPLICATE: aynı enstrüman + öğretmenle zaten aktif olan branş kaydının kimliği. */
      existingId?: string;
    };

/**
 * Branş listesine bir değişiklik uygular (SAF; store'lar aynı çekirdeği kullanır → json/memory/db paritesi).
 * Önce liste v2'ye çıkarılır (eski ana kaydın koşulları satırdan kopyalanır), sonra değişiklik uygulanır, ayna kaynağı
 * (`primary` bayrağı) yeniden belirlenir ve öğrenci satırı aynası hesaplanır. En az bir aktif branş kalmalıdır.
 */
export function applyEnrollmentChange(
  student: TermsStudent,
  change: EnrollmentChange,
  teachers?: Pick<Teacher, "id" | "instruments">[]
): EnrollmentChangeResult {
  const base = materializeEnrollmentTerms(student, student.enrollments ?? [], teachers);
  let list: StudentEnrollment[];
  let changedId: string;
  if (change.kind === "add") {
    if (base.some((e) => e.id === change.record.id)) {
      return { ok: false, code: "DUPLICATE", message: "Bu branş kaydı zaten var. Sayfayı yenileyip tekrar deneyin." };
    }
    // Aynı enstrüman + aynı öğretmenle ikinci AKTİF kayıt açılamaz. Kontrol KİLİT ALTINDA da yapılır: eşzamanlı iki
    // "ekle" isteği (çift tık) ön kontrolü birlikte geçse bile ikincisi burada reddedilir — ikinci branş/tahsilat oluşmaz.
    if (change.record.active) {
      // 2026-10-23 — aynı öğretmenle bireysel + grup dersi (veya iki farklı grup) ayrı kayıtlardır; engellenmez.
      const dup = base.find(
        (e) =>
          e.active &&
          e.instrument === change.record.instrument &&
          e.teacherId === change.record.teacherId &&
          (e.groupLessonId ?? "") === (change.record.groupLessonId ?? "")
      );
      if (dup) {
        return {
          ok: false,
          code: "DUPLICATE",
          existingId: dup.id,
          message: `Bu öğrencinin aynı öğretmenle aktif bir ${change.record.instrument} branş kaydı zaten var. Mevcut kaydı düzenleyin.`,
        };
      }
    }
    list = [...base, { ...change.record, termsVersion: 2 }];
    changedId = change.record.id;
  } else {
    const idx = base.findIndex((e) => e.id === change.enrollmentId);
    if (idx < 0) return { ok: false, code: "NOT_FOUND", message: "Branş kaydı bulunamadı. Sayfayı yenileyip tekrar deneyin." };
    const current = base[idx]!;
    if (change.expectedUpdatedAt !== undefined && (current.updatedAt ?? "") !== change.expectedUpdatedAt) {
      return {
        ok: false,
        code: "STALE",
        message: "Bu branş kaydı siz düzenlerken başka bir işlemle değişti. Sayfayı yenileyip güncel değerlerle tekrar deneyin.",
      };
    }
    let next: StudentEnrollment;
    if (change.kind === "replace") {
      next = { ...change.next, id: current.id, termsVersion: 2 };
    } else {
      const merged: Record<string, unknown> = { ...current, ...definedOnly(change.terms) };
      for (const k of change.clear ?? []) delete merged[k];
      next = { ...(merged as unknown as StudentEnrollment), updatedAt: new Date().toISOString(), termsVersion: 2 };
    }
    list = base.map((e, i) => (i === idx ? next : e));
    changedId = current.id;
  }
  if (!list.some((e) => e.active)) {
    return {
      ok: false,
      code: "NO_ACTIVE",
      message: "Öğrencinin en az bir aktif branş kaydı kalmalı. Öğrenci kurumdan tamamen ayrılıyorsa öğrenciyi pasife alın.",
    };
  }
  const source = mirrorSourceOf(list);
  list = list.map((e) => ({ ...e, primary: source ? e.id === source.id : e.primary }));
  return { ok: true, enrollments: list, mirror: mirrorPatchFromEnrollments(list), changed: list.find((e) => e.id === changedId)! };
}

/* ------------------------------------------------------------------------------------------------------------------
 * Store sözleşmeleri (tipler saf; üç store aynı çekirdeği kullanır)
 * ---------------------------------------------------------------------------------------------------------------- */

/** Kayıt anında bir BRANŞ için tahsil edilen ilk ödeme (Payment.source = "registration_first_payment"). */
export type RegistrationFirstPaymentRecord = {
  enrollmentId: string;
  method: string;
  amount: number;
  collectedAt: string;
  reference?: string;
  note?: string;
  receivedByUserId: string;
  autoSuggestedAmount?: number;
  adjustmentReason?: string;
  adjustedBy?: string;
  adjustedAt?: string;
  firstCollectionIncludesNextMonth?: boolean;
  /**
   * 2026-10-14 — sözleşmesiz ilk tahsilatın dönem(ler)i (`registrationFirstCollectionPeriods`).
   * 2026-10-22 — ZORUNLU: etiketsiz satırın dönemi vadeden (= tahsilat günü) okunuyordu; Eylül'de alınan Ekim ödemesi
   * takvimde Eylül'e düşüyor, gece tahakkuku Ekim'i ikinci kez borçlandırıyordu. Eski satırlar:
   * `scripts/backfill-first-collection-periods.ts`.
   */
  installmentPeriodLabel: string;
  installmentBreakdown?: { periodLabel: string; amount: number }[];
};

export type RegisterStudentInput = {
  student: Omit<Student, "id" | "createdAt" | "active">;
  /** Branş başına en fazla bir ilk tahsilat (tahsilatsız/burslu branş için satır YOK). */
  firstPayments: RegistrationFirstPaymentRecord[];
  /** Aynı gönderimin yeniden denenmesini (çift tık, ağ yeniden denemesi) tek kayda bağlar. */
  registrationId?: string;
};

export type RegisterStudentResult = {
  studentId: string;
  /** true: aynı `registrationId` ile kayıt ZATEN vardı — ikinci öğrenci/ödeme yaratılmadı. */
  duplicate: boolean;
  /** enrollmentId → ödeme kimliği (yalnız tahsilat satırı olan branşlar). */
  paymentIds: Record<string, string>;
};

export type ChangeStudentEnrollmentsInput = {
  studentId: string;
  change: EnrollmentChange;
  /** Aynı işlemde yazılacak KİŞİ düzeyi alanlar (branş koşulu içermemeli; varsa ayna değeri kazanır). */
  person?: StudentProfilePatch;
  /** Eski (türetilmiş) kayıtların kalıcılaştırılması için öğretmen-enstrüman eşlemesi. */
  teachers?: Pick<Teacher, "id" | "instruments">[];
  /** Yalnız `add`: yeni branşın kayıt anı ilk tahsilatı AYNI işlemde yazılır (branş başına idempotent). */
  firstPayment?: RegistrationFirstPaymentRecord;
};

export type ChangeStudentEnrollmentsResult =
  | { ok: true; enrollments: StudentEnrollment[]; changed: StudentEnrollment; paymentId?: string }
  | { ok: false; code: "NOT_FOUND" | "STALE" | "DUPLICATE" | "NO_ACTIVE"; message: string; existingId?: string };

/**
 * Yamayı öğrenci nesnesine uygular — `undefined` mevcut değeri SİLMEZ (yalnız `clearFields` siler). json/memory
 * store'ların yeni ilkelleri kullanır; `enrollmentId` girdisi satıra YAZILMAZ.
 */
export function applyProfilePatchToStudent<S extends Student>(student: S, patch: StudentProfilePatch): S {
  const { clearFields, enrollmentId, ...rest } = patch;
  void enrollmentId;
  const next = { ...student, ...definedOnly(rest) } as unknown as Record<string, unknown>;
  for (const k of clearFields ?? []) delete next[k];
  return next as unknown as S;
}

/** İki yama listesindeki `clearFields`'i birleştirir (kişi yaması + ayna). */
export function mergeStudentPatches(a: StudentProfilePatch | undefined, b: StudentProfilePatch | undefined): StudentProfilePatch {
  const clear = [...(a?.clearFields ?? []), ...(b?.clearFields ?? [])];
  const merged: StudentProfilePatch = { ...definedOnly(a ?? {}), ...definedOnly(b ?? {}) };
  delete merged.clearFields;
  if (clear.length > 0) merged.clearFields = Array.from(new Set(clear));
  return merged;
}


/**
 * 2026-10-10 — bir ödeme satırının BANKA kararı için öğrenci türleri (MEB → VakıfBank, diğer → Halkbank).
 * Tür BRANŞA özgüdür: ödeme açıkça bir branşa bağlıysa (veya öğrencinin tek branşı varsa) yalnız o branşın türleri esas alınır;
 * bağsız çok branşlı satırda belirsizlik vardır ve temkinli davranılır (aktif branşların birleşimi — herhangi biri MEB ise
 * VakıfBank). Bu yalnızca mesaj TASLAĞINDaki banka/IBAN seçimidir; gönderim insan onayındadır.
 */
export function studentTypesForPaymentBank(
  student: TermsStudent,
  payment: Pick<Payment, "enrollmentId">,
  teachers?: Pick<Teacher, "id" | "instruments">[]
): StudentType[] {
  const list = effectiveEnrollments(student, teachers);
  if (list.length === 0) return effectiveStudentTypes(student);
  const target = payment.enrollmentId ? list.find((e) => e.id === payment.enrollmentId) : list.length === 1 ? list[0] : undefined;
  if (target) return enrollmentTerms(student, target, teachers).studentTypes;
  return [...new Set(list.filter((e) => e.active).flatMap((e) => enrollmentTerms(student, e, teachers).studentTypes))];
}


/** Öğrencinin tüm branş kayıtlarının koşulları (kalıcı kayıt yoksa eski satırdan türeyen görünüm). */
export function enrollmentTermsList(student: TermsStudent, teachers?: Pick<Teacher, "id" | "name" | "instruments">[]): { enrollment: EnrollmentView; terms: EnrollmentTerms }[] {
  return effectiveEnrollments(student, teachers).map((e) => ({ enrollment: e, terms: enrollmentTerms(student, e, teachers) }));
}

/**
 * 2026-10-10 — paket kullanımı BRANŞ başınadır: öğrenci satırındaki `packageId` yalnız bir aynadır (başka bir branşın paketi
 * olabilir). `activeOnly` ile yalnız aktif branşlar sayılır. Branş kaydı olmayan öğrencide satırdaki paket esas alınır.
 */
export function studentUsesPackage(student: TermsStudent, packageId: string, opts: { activeOnly?: boolean } = {}, teachers?: Pick<Teacher, "id" | "name" | "instruments">[]): boolean {
  if (!student.enrollments?.length) return student.packageId === packageId;
  return enrollmentTermsList(student, teachers).some(({ enrollment, terms }) => terms.packageId === packageId && (!opts.activeOnly || enrollment.active));
}
