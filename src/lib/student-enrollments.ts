/**
 * 2026-10-04 — tek öğrenci, birden fazla eğitim (saf yardımcılar; I/O yok).
 *
 * Kaynak: `Student.enrollments`. Alan yoksa (eski tek eğitimli kayıt) eğitimler öğrencinin eski alanlarından
 * TÜRETİLİR (kaydedilmez): her enstrüman bir eğitim, öğretmen yalnız o enstrümanı veriyorsa bağlanır — enstrüman
 * ile öğretmen birbirinden kopuk iki liste olarak yorumlanmaz. Veri birleştirme/taşıma yapılmaz.
 */
import type { Lesson, LessonSeries, Payment, Student, StudentContract, StudentEnrollment, StudentType, Teacher } from "./types";
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
>;

/** 2026-10-09 — bir branş kaydının TÜM işletim koşulları (tür, öğretmen, paket/ücret, ödeme, tarih, program). */
export type EnrollmentTerms = {
  enrollmentId: string;
  primary: boolean;
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
};

/**
 * TEK okuma kapısı: birincil kaydın koşulları öğrenci satırındaki (eski) alanlardan, ek kaydın koşulları yalnız
 * kendi kaydından gelir — ek branş ASLA birincilin ücretini/türünü miras almaz (yanlış borç/sözleşme olmasın).
 */
export function enrollmentTerms(student: TermsStudent, enrollment: EnrollmentView, teachers?: Pick<Teacher, "id" | "instruments">[]): EnrollmentTerms {
  const isPrimary = primaryEnrollmentOf(effectiveEnrollments(student, teachers))?.id === enrollment.id;
  const common = {
    enrollmentId: enrollment.id,
    primary: isPrimary,
    active: enrollment.active,
    instrument: enrollment.instrument,
    branchId: enrollment.branchId ?? student.branchId,
  };
  if (isPrimary) {
    return {
      ...common,
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
    };
  }
  return {
    ...common,
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
    paymentDueRanges: enrollment.paymentDueDay ? [{ start: enrollment.paymentDueDay, end: enrollment.paymentDueDay }] : undefined,
    startDate: enrollment.startDate ?? (enrollment.createdAt ? enrollment.createdAt.slice(0, 10) : undefined),
    lessonStartDate: enrollment.lessonStartDate,
    lessonScheduleText: enrollment.lessonScheduleText,
    intendedDurationMonths: enrollment.intendedDurationMonths,
    endDate: enrollment.endDate,
  };
}

/**
 * Öğrenci şekilli eski yardımcılara (sözleşme ön doldurma, ders başı faturalama…) branşın koşullarıyla verilecek
 * görünüm. Kimlik, iletişim ve veli bilgileri PAYLAŞILIR; yalnız branşa özgü alanlar branştan gelir.
 */
export function studentWithEnrollmentTerms<S extends Student>(student: S, terms: EnrollmentTerms): S {
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
      input.scope === "student" || (!!p.contractId && contractIds.has(p.contractId)) || paymentIds.has(p.id);
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
  students: Student[];
  teachers: Pick<Teacher, "id" | "name" | "instruments">[];
  lessons?: Pick<Lesson, "id" | "enrollmentId" | "instrument" | "teacherId">[];
  contracts?: Pick<StudentContract, "id" | "enrollmentId">[];
}): (p: Pick<Payment, "studentId" | "enrollmentId" | "contractId" | "lessonId" | "source" | "clubMembershipId">) => string | undefined {
  const byStudent = new Map<string, { student: Student; list: EnrollmentView[] }>();
  for (const st of input.students) byStudent.set(st.id, { student: st, list: effectiveEnrollments(st, input.teachers) });
  return (p) => {
    const hit = byStudent.get(p.studentId);
    if (!hit || hit.list.length < 2 || p.source === "club" || p.clubMembershipId) return undefined;
    const id = paymentEnrollmentId(hit.student, p, { contracts: input.contracts, lessons: input.lessons }, input.teachers);
    const e = id ? hit.list.find((x) => x.id === id) : undefined;
    return e ? enrollmentDisplayName(e, hit.list, input.teachers) : UNASSIGNED_ENROLLMENT_LABEL;
  };
}
