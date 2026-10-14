import { collectedAmountOf } from "./payment-profile";
import {
  applyLessonRevision,
  planLessonDeletion,
  planForcedLessonDeletion,
  type ForcedLessonDeletionPlan,
  type LessonDeletionPlan,
  type LessonEditScope,
  type LessonRevisionInput,
  type LessonRevisionResult,
} from "./lesson-scope-edit";
import {
  assertDemoSeedAllowed,
  newDemoLessonId,
  type DemoSeedInput,
  type DemoSeedResult,
} from "./demo-seed";
import { applyLessonOpsFlag, switchLessonOpsFlag, type LessonOpsFlag, type ApplyLessonOpsResult } from "./lesson-ops";
import { allocateSequenceValueDb, formatDisplayId } from "./entity-sequence";
import { toDateOnlyDbValue } from "./date-input";
import {
  applyEnrollmentChange,
  AUTO_LINK_PAYMENT_SOURCES,
  mergeStudentPatches,
  type ChangeStudentEnrollmentsInput,
  type ChangeStudentEnrollmentsResult,
  type RegisterStudentInput,
  type RegisterStudentResult,
  type RegistrationFirstPaymentRecord,
} from "./student-enrollments";
import { registrationFirstPaymentDescription, REGISTRATION_FIRST_PAYMENT_SOURCE } from "./registration-payment";
import { markTeacherAttendance, type TeacherAttendanceStatus } from "./teacher-attendance";
import { reassignLessonTeacherOrBranch, type ReassignLessonInput, type ReassignLessonResult } from "./lesson-reassignment";
import { prisma } from "./db";
import { Prisma } from "@prisma/client";
import type { MebStudentListResult, MebStudentQuery } from "./meb-list";
import {
  MAKEUP_QUOTA_COUNTING_STATUSES,
  MakeupQuotaExceededError,
  resolveMonthlyMakeupAllowance,
  formatEducationPeriodLabel,
} from "./makeup-quota";
import { logger } from "./logger";
import {
  parseTermCalendarJson,
  mergeTermCalendarJson,
  type AcademicTermDates,
} from "./academic-term-dates";
import { createSeedData, createEmptyTemplateData } from "./seed";
import type {
  AppData,
  AttendanceStatus,
  BranchId,
  CollectionsSettings,
  ConsentSettings,
  ContractInstallmentSnapshot,
  ContractInstallmentView,
  FeeRoundingMode,
  Instrument,
  Lesson,
  LessonSeriesStatus,
  MakeupSlot,
  Room,
  Student,
  StudentClearableField,
  StudentProfilePatch,
  StudentDeletionState,
  TeacherDeletionState,
  StudentPaymentPauseState,
  StudentType,
  Teacher,
  TeacherFeeRule,
  TeacherProfilePatch,
  TeacherPayout,
} from "./types";
import {
  suggestMakeupSlots,
  confirmMakeupSlot,
  computeSlaDeadline,
  validateLessonSlot,
  LessonSlotValidationError,
  type MakeupDecision,
} from "./makeup-engine";
import { findSlotConflict, type SlotResource } from "./lesson-occupancy";
import {
  MAKEUP_PLANNING_EXPIRED_REASON,
  type MakeupChangeEntry,
} from "./makeup-deadline";
import {
  applyMakeupLifecycle as applyMakeupLifecyclePure,
  MakeupLifecycleError,
  normalizeAttendanceNote,
  isLegacyMakeupExpiry,
  isPastMakeupPlanningDeadline,
  type MakeupLifecycleOp,
  type MakeupLifecycleResult,
} from "./makeup-lifecycle";
import {
  applyLessonScheduleUpdate,
  applyLessonCancel,
  type LessonScheduleUpdateOutcome,
} from "./lesson-update";
import { lessonScopeDays, type SlotScopeTarget } from "./lesson-scope";
import {
  narrowToDashboard,
  narrowToLessonWindow,
  narrowToPaymentsPage,
  narrowToPayoutWindow,
  narrowToStudentScope,
  toPaymentStatusRow,
  toReferenceData,
  type DashboardData,
  type LessonWindowData,
  type PaymentsPageData,
  type PayoutWindowData,
  type ReferenceData,
  type StudentListData,
  type StudentScopeData,
} from "./reference-data";
import {
  applyStartLesson,
  applyEndLesson,
  applyCorrectLessonTimes,
  type LessonTimeCorrection,
  type LessonLiveUpdateResult,
} from "./lesson-live-status";
import {
  createLessonSeriesData,
  cancelSeriesFromLesson,
  cancelEntireSeries,
  type SeriesParams,
  type CreateSeriesResult,
  type SeriesCancelResult,
} from "./lesson-series";
import {
  createTeacherFeeRuleData,
  updateTeacherFeeRuleData,
  createTeacherPayoutSnapshot,
  markTeacherPayoutPaidData,
  updateTeacherPayoutPaymentMethodData,
  type FeeRuleInput,
  type FeeRuleMutationResult,
  type CreateTeacherPayoutResult,
  type MarkPayoutPaidResult,
  type TeacherPayoutPaymentMethod,
  type UpdateTeacherPayoutPaymentMethodResult,
} from "./teacher-payout";
import {
  createPackageData,
  updatePackageData,
  type PackageInput,
  type PackagePatch,
  type PackageMutationResult,
} from "./packages";
import {
  createDiscountCampaignData,
  updateDiscountCampaignData,
  type DiscountCampaignInput,
  type DiscountCampaignPatch,
  type DiscountCampaignMutationResult,
} from "./discount-campaigns";
import type { BranchImportRow } from "./import/branches";
import type { TeacherImportRow } from "./import/teachers";
import type { RoomImportRow } from "./import/rooms";
import type { StudentImportRow } from "./import/students";
import type { ImportCommitResult } from "./import/commit-result";
import { addDays, endOfDay, startOfDay, subDays } from "date-fns";
import { requireTenantId, tryTenantId } from "./tenant-context";
import { listClosedDays } from "./closed-day-overrides";
import { DEFAULT_TENANT_ID } from "./auth/config";
import { getBootstrapUsersForSeed } from "./auth/users";
import { uid, isOutstandingPaymentStatus } from "./utils";

function tenantId(): string {
  return tryTenantId() ?? DEFAULT_TENANT_ID;
}

type PrismaSchoolWithRelations = Prisma.SchoolGetPayload<{
  include: {
    branches: true;
    teachers: true;
    students: true;
    rooms: true;
    lessons: true;
    lessonSeries: true;
    attendances: true;
    makeupRequests: true;
    payments: true;
    teacherFeeRules: true;
    teacherPayouts: true;
  };
}>;

function sleepMs(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

function isRetryablePrismaError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { message?: unknown; code?: unknown };
  const msg = typeof e.message === "string" ? e.message.toLowerCase() : "";
  const code = typeof e.code === "string" ? e.code.toLowerCase() : "";
  return (
    msg.includes("could not serialize") ||
    msg.includes("deadlock detected") ||
    msg.includes("sqlstate 40001") ||
    msg.includes("database is locked") ||
    code === "40001" ||
    code.includes("deadlock") ||
    code === "p2034"
  );
}

/** Telafi kotası/politika notu için gereken School alanları — satırın geri kalanı (ör. ~79 KB logo) okunmaz. */
const MAKEUP_POLICY_SCHOOL_FIELDS = { monthlyMakeupAllowance: true, makeupWindowDays: true } as const;

/** Serialize per tenant+student, then count counting-status makeups in the current education term. */
/**
 * P0 ürün kararı — hak TAKVİM AYI değil, aktif eğitim dönemi (`term` +
 * `academicYearStart`) başına sayılır. Güz ve Yaz ayrı sayaçlardır.
 * `sourceLessonId`'nin akademik yılı `resolveLessonAcademicPeriod`
 * (attendance-calendar.ts, Program ekranıyla PAYLAŞILAN tek kaynak) ile
 * çözülür; aynı öğrencinin diğer telafi taleplerinin kaynağı olan
 * derslerin akademik yılıyla karşılaştırılır. Advisory lock aynı öğrenci
 * için yarış koşulunu (üçüncü onayın sızmasını) engeller.
 */
async function assertStudentMakeupQuotaTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  studentId: string,
  schoolId: string,
  sourceLessonId: string
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${studentId}))`;
  const { resolveLessonAcademicPeriod } = await import("./attendance-calendar");
  const studentRow = await tx.student.findFirst({ where: { id: studentId, tenantId } });
  const termFallback = (studentRow?.termType as "guz" | "yaz" | null) ?? "guz";
  const sourceLesson = await tx.lesson.findFirst({
    where: { id: sourceLessonId, tenantId },
    select: { startAt: true, term: true, academicYearStart: true, disruptionSource: true, enrollmentId: true, instrument: true, teacherId: true },
  });
  // 2026-10-10 — telafi hakkı BRANŞ başınadır (json/memory `makeupEnrollmentKey` ile AYNI kural): kaynak dersin branşı açık
  // bağdan (yoksa tek branştan / enstrümandan) çözülür; yalnız aynı branşın talepleri sayılır. Tek branşlı öğrencide tüm
  // dersler aynı anahtara düşer (eski davranışla birebir aynı).
  const { lessonEnrollmentId } = await import("./student-enrollments");
  const studentModel = studentRow ? mapDbStudent(studentRow) : undefined;
  const enrollmentKeyOf = (l: { enrollmentId: string | null; instrument: string; teacherId: string }): string =>
    (studentModel
      ? lessonEnrollmentId(studentModel, { enrollmentId: l.enrollmentId ?? undefined, instrument: l.instrument as never, teacherId: l.teacherId })
      : undefined) ?? "__unassigned__";
  const sourceKey = sourceLesson ? enrollmentKeyOf(sourceLesson) : undefined;
  const { isQuotaExemptSource } = await import("./lesson-disruption");
  // 9. tur — öğretmen/kurum kaynaklı telafi kişisel hakka tabi değil (saf katmanla aynı kural).
  if (isQuotaExemptSource(sourceLesson?.disruptionSource)) {
    const school = await tx.school.findFirst({ where: { id: schoolId, tenantId }, select: MAKEUP_POLICY_SCHOOL_FIELDS });
    if (!school) throw new Error("Kurum bulunamadı");
    return school;
  }
  const period = resolveLessonAcademicPeriod(
    {
      startAt: (sourceLesson?.startAt ?? new Date()).toISOString(),
      term: (sourceLesson?.term as "guz" | "yaz" | null) ?? undefined,
      academicYearStart: sourceLesson?.academicYearStart ?? undefined,
    },
    termFallback
  );

  const candidates = await tx.makeupRequest.findMany({
    where: { tenantId, studentId, status: { in: [...MAKEUP_QUOTA_COUNTING_STATUSES] } },
    select: { sourceLessonId: true },
  });
  const candidateLessonIds = candidates.map((c) => c.sourceLessonId);
  const candidateLessons = candidateLessonIds.length
    ? await tx.lesson.findMany({
        where: { id: { in: candidateLessonIds }, tenantId },
        select: { id: true, startAt: true, term: true, academicYearStart: true, disruptionSource: true, enrollmentId: true, instrument: true, teacherId: true },
      })
    : [];
  const lessonById = new Map(candidateLessons.map((l) => [l.id, l]));
  const used = candidates.filter((c) => {
    const l = lessonById.get(c.sourceLessonId);
    if (!l || isQuotaExemptSource(l.disruptionSource)) return false;
    if (sourceKey !== undefined && enrollmentKeyOf(l) !== sourceKey) return false;
    const p = resolveLessonAcademicPeriod(
      { startAt: l.startAt.toISOString(), term: (l.term as "guz" | "yaz" | null) ?? undefined, academicYearStart: l.academicYearStart ?? undefined },
      termFallback
    );
    return p.academicYearStart === period.academicYearStart && p.term === period.term;
  }).length;

  const school = await tx.school.findFirst({ where: { id: schoolId, tenantId }, select: MAKEUP_POLICY_SCHOOL_FIELDS });
  if (!school) throw new Error("Kurum bulunamadı");
  const allowance = resolveMonthlyMakeupAllowance(school);
  const periodLabel = formatEducationPeriodLabel(period.term, period.academicYearStart);
  if (allowance === 0) {
    throw new MakeupQuotaExceededError("Bu kurumda telafi talebi kapalıdır (eğitim yılı başına hak: 0).");
  }
  if (used >= allowance) {
    throw new MakeupQuotaExceededError(`Bu öğrenci ${periodLabel} içinde ${allowance} telafi hakkını kullanmıştır.`);
  }
  return school;
}

/**
 * Prisma `Student` satırı → `AppData.students` öğesi. `readData()` ile dar okumalar
 * (ör. `readStudentById`) AYNI eşlemeyi kullanır — alan kaybı/parity farkı olmasın.
 */
export function mapDbStudent(student: Prisma.StudentGetPayload<object>): Student {
  return {
    id: student.id,
    displayId: (student as { displayId?: string | null }).displayId ?? undefined,
    name: student.name,
    email: student.email,
    phone: student.phone,
    parentName: student.parentName ?? "",
    parentPhone: student.parentPhone ?? "",
    accountResponsibility:
      ((student as { accountResponsibility?: string | null }).accountResponsibility as
        | "PARENT_MANAGED"
        | "SELF_MANAGED"
        | undefined) ?? "PARENT_MANAGED",
    motherName: (student as { motherName?: string | null }).motherName ?? undefined,
    fatherName: (student as { fatherName?: string | null }).fatherName ?? undefined,
    // P1 revizyonu — "Bizi nereden buldunuz?" (kolonlar migration ile
    // gelir; migration uygulanmamış DB'de undefined — davranış değişmez).
    referralSource: (student as { referralSource?: string | null }).referralSource as
      | import("./types").ReferralSource
      | undefined
      ?? undefined,
    referralSourceDetail: (student as { referralSourceDetail?: string | null }).referralSourceDetail ?? undefined,
    branchId: student.branchId as BranchId,
    instruments: student.instruments as Instrument[],
    enrollments: ((student as { enrollments?: unknown }).enrollments as import("./types").StudentEnrollment[] | null) ?? undefined,
    teacherId: student.teacherId,
    packageName: student.packageName,
    weeklyLessonCount: student.weeklyLessonCount,
    monthlyFee: student.monthlyFee,
    active: student.active,
    notes: student.notes,
    createdAt: student.createdAt.toISOString(),
    createdByUserId: (student as { createdByUserId?: string | null }).createdByUserId ?? undefined,
    convertedFromTrialId: student.convertedFromTrialId ?? undefined,
    convertedByUserId: student.convertedByUserId ?? undefined,
    studentType: (student.studentType as StudentType) ?? undefined,
    studentTypes:
      ((student as { studentTypes?: unknown }).studentTypes as StudentType[] | undefined) ?? undefined,
    enrollmentStartDate: student.enrollmentStartDate?.toISOString() ?? undefined,
    lessonStartDate: student.lessonStartDate?.toISOString() ?? undefined,
    intendedDurationMonths: student.intendedDurationMonths ?? undefined,
    lessonScheduleText: student.lessonScheduleText ?? undefined,
    enrollmentEndDate: student.enrollmentEndDate?.toISOString() ?? undefined,
    level: student.level ?? undefined,
    targetExam: student.targetExam ?? undefined,
    // MEB Paneli — okunmazsa detay/panel "Eklenmemiş" yerine BOŞ dönerdi
    // (önceki termType parity açığıyla AYNI sınıf). Tarihler ISO (UTC gün).
    mebLevelStartDate:
      (student as { mebLevelStartDate?: Date | null }).mebLevelStartDate?.toISOString() ?? undefined,
    mebLevelEndDate: (student as { mebLevelEndDate?: Date | null }).mebLevelEndDate?.toISOString() ?? undefined,
    mebExamDate: (student as { mebExamDate?: Date | null }).mebExamDate?.toISOString() ?? undefined,
    mebExamAttended: (student as { mebExamAttended?: boolean | null }).mebExamAttended ?? undefined,
    specialNotes: student.specialNotes ?? undefined,
    communicationOptOut: student.communicationOptOut,
    // ÖNCELİK 4 (devam) — bu satır eksikti: db modunda termType hiç
    // okunmuyordu (yalnızca yazılıyordu), bu yüzden dönem seçici her zaman
    // "guz" fallback'ine düşerdi. Bu turda fark edilip düzeltildi.
    termType: (student as { termType?: string | null }).termType as
      | import("./types").StudentTermType
      | undefined
      ?? undefined,
    // ÖNCELİK 4 (devam) — Paket Yönetimi + ek profil alanları.
    packageId: (student as { packageId?: string | null }).packageId ?? undefined,
    birthPlace: (student as { birthPlace?: string | null }).birthPlace ?? undefined,
    schoolOrOccupation: (student as { schoolOrOccupation?: string | null }).schoolOrOccupation ?? undefined,
    // Nilüfer Acar politikası §1E — pause durumu (bkz. setStudentPaymentPause).
    paymentPauseStatus:
      ((student as { paymentPauseStatus?: string | null }).paymentPauseStatus ?? undefined) as "paused" | undefined,
    paymentPausedAt: (student as { paymentPausedAt?: Date | null }).paymentPausedAt?.toISOString() ?? undefined,
    paymentPauseReason: (student as { paymentPauseReason?: string | null }).paymentPauseReason ?? undefined,
    paymentPausedBy: (student as { paymentPausedBy?: string | null }).paymentPausedBy ?? undefined,
    // Bu turda fark edildi: nationalIdCipher/nationalIdLast2/birthDate/
    // address/educationMethod/firstLessonAt/archivedAt Prisma şemasında
    // ZATEN vardı ama db-mode SELECT mapping'inde hiç okunmuyordu —
    // Student.monthlyFee gibi başka alanlar için daha önce düzeltilen
    // aynı sınıf parity açığı, burada da kapatıldı.
    nationalIdCipher: (student as { nationalIdCipher?: string | null }).nationalIdCipher ?? undefined,
    nationalIdLast2: (student as { nationalIdLast2?: string | null }).nationalIdLast2 ?? undefined,
    birthDate: (student as { birthDate?: Date | null }).birthDate?.toISOString() ?? undefined,
    address: (student as { address?: string | null }).address ?? undefined,
    educationMethod:
      ((student as { educationMethod?: string | null }).educationMethod as
        | import("./types").EducationMethod
        | undefined) ?? undefined,
    firstLessonAt: (student as { firstLessonAt?: Date | null }).firstLessonAt?.toISOString() ?? undefined,
    archivedAt: (student as { archivedAt?: Date | null }).archivedAt?.toISOString() ?? undefined,
    deletedAt: student.deletedAt?.toISOString() ?? undefined,
    deletedByUserId: student.deletedByUserId ?? undefined,
    deletionReason: student.deletionReason ?? undefined,
    // Package C — ödeme profili + paket fiyatlandırma. Bu alanlar
    // öncesinde db modunda hiç OKUNMUYORDU (yalnızca updateStudentProfile
    // parametresi olarak kabul ediliyordu, satıra hiç yazılmıyordu/geri
    // dönmüyordu) — parity için burada eklendi.
    lessonDurationMinutes:
      (student as { lessonDurationMinutes?: number | null }).lessonDurationMinutes as
        | import("./types").LessonDurationPreference
        | undefined ?? undefined,
    paymentMethod: (student as { paymentMethod?: string | null }).paymentMethod as
      | import("./types").StudentPaymentMethod
      | undefined ?? undefined,
    paymentAmount: (student as { paymentAmount?: number | null }).paymentAmount ?? undefined,
    paymentDueDay: (student as { paymentDueDay?: number | null }).paymentDueDay ?? undefined,
    paymentDueRanges:
      ((student as { paymentDueRanges?: unknown }).paymentDueRanges as
        | import("./types").PaymentDueRange[]
        | undefined) ?? undefined,
    packageBaseMonthlyFee:
      (student as { packageBaseMonthlyFee?: number | null }).packageBaseMonthlyFee ?? undefined,
    discountType: (student as { discountType?: string | null }).discountType as
      | import("./types").DiscountType
      | undefined ?? undefined,
    discountValue: (student as { discountValue?: number | null }).discountValue ?? undefined,
    monthlyFeeManualOverride:
      (student as { monthlyFeeManualOverride?: boolean | null }).monthlyFeeManualOverride ?? undefined,
    monthlyFeeOverrideReason:
      (student as { monthlyFeeOverrideReason?: string | null }).monthlyFeeOverrideReason ?? undefined,
    appliedCampaignIds:
      ((student as { appliedCampaignIds?: unknown }).appliedCampaignIds as string[] | undefined) ?? undefined,
    derivedPerLessonAmount:
      (student as { derivedPerLessonAmount?: number | null }).derivedPerLessonAmount ?? undefined,
  };
}

/** Prisma `Lesson` satırı → `AppData.lessons` öğesi (tam okuma ve hedefli okumalar AYNI eşlemeyi kullanır). */
function mapDbLesson(lesson: Prisma.LessonGetPayload<object>): import("./types").Lesson {
  return {
    id: lesson.id,
    studentId: lesson.studentId,
    teacherId: lesson.teacherId,
    roomId: lesson.roomId,
    branchId: lesson.branchId as BranchId,
    instrument: lesson.instrument as Instrument,
    startAt: lesson.startAt.toISOString(),
    endAt: lesson.endAt.toISOString(),
    type: lesson.type as import("./types").LessonType,
    status: lesson.status as "scheduled" | "in_progress" | "completed" | "cancelled" | "no_show",
    makeupRequestId: lesson.makeupRequestId ?? undefined,
    seriesId: lesson.seriesId ?? undefined,
    enrollmentId: (lesson as { enrollmentId?: string | null }).enrollmentId ?? undefined,
    clubId: (lesson as { clubId?: string | null }).clubId ?? undefined,
    clubSessionId: (lesson as { clubSessionId?: string | null }).clubSessionId ?? undefined,
    notes: lesson.notes ?? undefined,
    studentAttendanceNote: lesson.studentAttendanceNote ?? null,
    createdByUserId: (lesson as { createdByUserId?: string | null }).createdByUserId ?? undefined,
    studentAttended: (lesson as { studentAttended?: boolean }).studentAttended ?? undefined,
    studentAttendedAt: (lesson as { studentAttendedAt?: Date | null }).studentAttendedAt?.toISOString?.() ?? undefined,
    studentAttendedBy: (lesson as { studentAttendedBy?: string | null }).studentAttendedBy ?? undefined,
    lessonProcessed: (lesson as { lessonProcessed?: boolean }).lessonProcessed ?? undefined,
    lessonProcessedAt: (lesson as { lessonProcessedAt?: Date | null }).lessonProcessedAt?.toISOString?.() ?? undefined,
    lessonProcessedBy: (lesson as { lessonProcessedBy?: string | null }).lessonProcessedBy ?? undefined,
    lessonProcessedReason:
      (lesson as { lessonProcessedReason?: string | null }).lessonProcessedReason ?? undefined,
    opsMakeupFlag: (lesson as { opsMakeupFlag?: boolean }).opsMakeupFlag ?? undefined,
    opsMakeupFlagAt: (lesson as { opsMakeupFlagAt?: Date | null }).opsMakeupFlagAt?.toISOString?.() ?? undefined,
    opsMakeupFlagBy: (lesson as { opsMakeupFlagBy?: string | null }).opsMakeupFlagBy ?? undefined,
    studentAbsent: (lesson as { studentAbsent?: boolean }).studentAbsent ?? undefined,
    studentAbsentAt: (lesson as { studentAbsentAt?: Date | null }).studentAbsentAt?.toISOString?.() ?? undefined,
    studentAbsentBy: (lesson as { studentAbsentBy?: string | null }).studentAbsentBy ?? undefined,
    studentExcused: (lesson as { studentExcused?: boolean }).studentExcused ?? undefined,
    studentExcusedAt: (lesson as { studentExcusedAt?: Date | null }).studentExcusedAt?.toISOString?.() ?? undefined,
    studentExcusedBy: (lesson as { studentExcusedBy?: string | null }).studentExcusedBy ?? undefined,
    // ÖNCELİK 4 — bu satırlar eksikti (db modunda hiç map edilmiyordu); bu
    // turda term/academicYearStart eklerken fark edildi, aynı satırda düzeltildi.
    opsClosedFlag: (lesson as { opsClosedFlag?: boolean }).opsClosedFlag ?? undefined,
    opsClosedFlagAt: (lesson as { opsClosedFlagAt?: Date | null }).opsClosedFlagAt?.toISOString?.() ?? undefined,
    opsClosedFlagBy: (lesson as { opsClosedFlagBy?: string | null }).opsClosedFlagBy ?? undefined,
    term: (lesson as { term?: string | null }).term as import("./types").StudentTermType | undefined ?? undefined,
    academicYearStart: (lesson as { academicYearStart?: number | null }).academicYearStart ?? undefined,
    teacherAttendanceStatus:
      ((lesson as { teacherAttendanceStatus?: string | null }).teacherAttendanceStatus as
        | import("./teacher-attendance").TeacherAttendanceStatus
        | undefined) ?? undefined,
    teacherAttendanceAt:
      (lesson as { teacherAttendanceAt?: Date | null }).teacherAttendanceAt?.toISOString?.() ?? undefined,
    teacherAttendanceBy: (lesson as { teacherAttendanceBy?: string | null }).teacherAttendanceBy ?? undefined,
    teacherAttendanceNote: (lesson as { teacherAttendanceNote?: string | null }).teacherAttendanceNote ?? undefined,
    disruptionSource: (() => {
      const v = (lesson as { disruptionSource?: string | null }).disruptionSource;
      return v === "teacher" || v === "institution" || v === "student" || v === "other" ? v : undefined;
    })(),
    disruptionNote: (lesson as { disruptionNote?: string | null }).disruptionNote ?? undefined,
    disruptionAt: (lesson as { disruptionAt?: Date | null }).disruptionAt?.toISOString?.() ?? undefined,
    disruptionBy: (lesson as { disruptionBy?: string | null }).disruptionBy ?? undefined,
    availabilityOverride: (() => {
      const by = (lesson as { availabilityOverrideBy?: string | null }).availabilityOverrideBy;
      const at = (lesson as { availabilityOverrideAt?: Date | null }).availabilityOverrideAt;
      return by && at ? { by, at: at.toISOString() } : undefined;
    })(),
    actualStartAt: lesson.actualStartAt?.toISOString() ?? undefined,
    actualEndAt: lesson.actualEndAt?.toISOString() ?? undefined,
    startCorrectedBy: lesson.startCorrectedBy ?? undefined,
    startCorrectionNote: lesson.startCorrectionNote ?? undefined,
    endCorrectedBy: lesson.endCorrectedBy ?? undefined,
    endCorrectionNote: lesson.endCorrectionNote ?? undefined,
  };
}

/** Prisma `TeacherPayout` satırı → `AppData.teacherPayouts` öğesi (tam okuma ve hedefli okumalar AYNI eşleme). */
function mapDbTeacherPayout(payout: Prisma.TeacherPayoutGetPayload<object>): TeacherPayout {
  return {
    id: payout.id,
    teacherId: payout.teacherId,
    periodStart: payout.periodStart.toISOString().slice(0, 10),
    periodEnd: payout.periodEnd.toISOString().slice(0, 10),
    totalMinutes: payout.totalMinutes,
    totalAmount: payout.totalAmount,
    status: payout.status as TeacherPayout["status"],
    paidAt: payout.paidAt?.toISOString() ?? undefined,
    method: payout.method ?? undefined,
    generatedAt: payout.generatedAt.toISOString(),
    originalTotalMinutes: payout.originalTotalMinutes ?? undefined,
    originalTotalAmount: payout.originalTotalAmount ?? undefined,
    lineOverrides: (payout.lineOverrides as TeacherPayout["lineOverrides"] | null) ?? undefined,
    revisionCount: payout.revisionCount ?? 0,
    revisedAt: payout.revisedAt?.toISOString() ?? undefined,
    revisedByUserId: payout.revisedByUserId ?? undefined,
    revisionReason: payout.revisionReason ?? undefined,
    pricingPolicy: (payout.pricingPolicy as TeacherPayout["pricingPolicy"] | null) ?? undefined,
    pricingSnapshot: (payout.pricingSnapshot as TeacherPayout["pricingSnapshot"] | null) ?? undefined,
    cancelledAt: payout.cancelledAt?.toISOString() ?? undefined,
    cancelledByUserId: payout.cancelledByUserId ?? undefined,
    cancelReason: payout.cancelReason ?? undefined,
    lineSnapshot: (payout.lineSnapshot as TeacherPayout["lineSnapshot"] | null) ?? undefined,
    payments: (payout.payments as TeacherPayout["payments"] | null) ?? undefined,
    adjustments: (payout.adjustments as TeacherPayout["adjustments"] | null) ?? undefined,
    version: payout.version,
  };
}

function mapSchoolToAppData(school: PrismaSchoolWithRelations): AppData {
  return {
    settings: {
      tenantId: school.tenantId,
      name: school.name,
      shortName: school.shortName,
      city: school.city,
      website: school.website,
      email: school.email,
      phone: school.phone,
      logoUrl: school.logoUrl,
      makeupWindowDays: school.makeupWindowDays,
      monthlyMakeupAllowance: resolveMonthlyMakeupAllowance(school),
      lessonDurationMinutes: school.lessonDurationMinutes,
      workingHours: {
        start: school.workingHoursStart,
        end: school.workingHoursEnd,
      },
      workingDays: school.workingDays as number[],
      currency: school.currency,
      feeRoundingMode: school.feeRoundingMode as FeeRoundingMode,
      collectionsSettings: (school.collectionsSettings as CollectionsSettings | null) ?? undefined,
      termWeeklyClosedDays: parseTermCalendarJson(school.termWeeklyClosedDays).weekly,
      academicTermDates: parseTermCalendarJson(school.termWeeklyClosedDays).academicTermDates,
      consentSettings: (school.consentSettings as ConsentSettings | null) ?? undefined,
      performanceWeights:
        (school as { performanceWeights?: import("./performance-weights").PerformanceWeightsConfig | null })
          .performanceWeights ?? undefined,
      branches: school.branches.map((branch) => ({
        id: branch.id as BranchId,
        name: branch.name,
        shortName: branch.shortName,
        address: branch.address,
        phone: branch.phone,
        city: branch.city,
      })),
    },
    teachers: school.teachers.map((teacher) => ({
      id: teacher.id,
      displayId: (teacher as { displayId?: string | null }).displayId ?? undefined,
      name: teacher.name,
      email: teacher.email,
      phone: teacher.phone,
      branchId: teacher.branchId as BranchId,
      instruments: teacher.instruments as Instrument[],
      instrumentLevels:
        ((teacher as { instrumentLevels?: unknown }).instrumentLevels as Teacher["instrumentLevels"]) ?? undefined,
      availability: teacher.availability as Teacher["availability"],
      maxDailyLessons: teacher.maxDailyLessons,
      weeklyHoursThreshold: (teacher as { weeklyHoursThreshold?: number | null }).weeklyHoursThreshold ?? undefined,
      createdByUserId: (teacher as { createdByUserId?: string | null }).createdByUserId ?? undefined,
      active: teacher.active,
      archivedAt: (teacher as { archivedAt?: Date | null }).archivedAt?.toISOString() ?? undefined,
      deletedAt: (teacher as { deletedAt?: Date | null }).deletedAt?.toISOString() ?? undefined,
      deletedByUserId: (teacher as { deletedByUserId?: string | null }).deletedByUserId ?? undefined,
      deletionReason: (teacher as { deletionReason?: string | null }).deletionReason ?? undefined,
      color: teacher.color,
      // ÖNCELİK 4 (devam) — öğretmen CSV çoklu enstrüman revizyonu: bu 5 alan
      // db modunda daha önce hiç okunmuyordu (Prisma şemasında yoktu).
      highSchool: (teacher as { highSchool?: string | null }).highSchool ?? undefined,
      university: (teacher as { university?: string | null }).university ?? undefined,
      graduationYear: (teacher as { graduationYear?: number | null }).graduationYear ?? undefined,
      contractStartDate:
        (teacher as { contractStartDate?: Date | null }).contractStartDate?.toISOString() ?? undefined,
      contractEndDate: (teacher as { contractEndDate?: Date | null }).contractEndDate?.toISOString() ?? undefined,
      // Package D — özlük/idari alanlar + ek şube ataması. Bu alanlar
      // öncesinde db modunda hiç OKUNMUYORDU (nationalIdCipher/birthDate/
      // address TS tipinde vardı ama Prisma şemasında hiç yoktu) — parity
      // için burada eklendi.
      nationalIdCipher: (teacher as { nationalIdCipher?: string | null }).nationalIdCipher ?? undefined,
      nationalIdLast2: (teacher as { nationalIdLast2?: string | null }).nationalIdLast2 ?? undefined,
      birthDate: (teacher as { birthDate?: Date | null }).birthDate?.toISOString() ?? undefined,
      address: (teacher as { address?: string | null }).address ?? undefined,
      branchIds: ((teacher as { branchIds?: unknown }).branchIds as Teacher["branchIds"]) ?? undefined,
      employmentType:
        ((teacher as { employmentType?: string | null }).employmentType as Teacher["employmentType"]) ?? undefined,
      hireDate: (teacher as { hireDate?: Date | null }).hireDate?.toISOString() ?? undefined,
      terminationDate: (teacher as { terminationDate?: Date | null }).terminationDate?.toISOString() ?? undefined,
      emergencyContactName:
        (teacher as { emergencyContactName?: string | null }).emergencyContactName ?? undefined,
      emergencyContactPhone:
        (teacher as { emergencyContactPhone?: string | null }).emergencyContactPhone ?? undefined,
      personnelNotes: (teacher as { personnelNotes?: string | null }).personnelNotes ?? undefined,
    })),
    students: school.students.map(mapDbStudent),
    rooms: school.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      branchId: room.branchId as BranchId,
      capacity: room.capacity,
      instruments: room.instruments as Instrument[],
      active: (room as { active?: boolean }).active ?? true,
      archivedAt: (room as { archivedAt?: Date | null }).archivedAt?.toISOString() ?? undefined,
      deletedAt: (room as { deletedAt?: Date | null }).deletedAt?.toISOString() ?? undefined,
    })),
    lessons: school.lessons.map(mapDbLesson),
    lessonSeries: school.lessonSeries.map((series) => ({
      id: series.id,
      enrollmentId: (series as { enrollmentId?: string | null }).enrollmentId ?? undefined,
      studentId: series.studentId,
      teacherId: series.teacherId,
      roomId: series.roomId,
      branchId: series.branchId as BranchId,
      instrument: series.instrument as Instrument,
      weekday: series.weekday,
      startTime: series.startTime,
      durationMinutes: series.durationMinutes,
      startsOn: series.startsOn.toISOString(),
      endsOn: series.endsOn.toISOString(),
      status: series.status as LessonSeriesStatus,
      createdAt: series.createdAt.toISOString(),
      updatedAt: series.updatedAt.toISOString(),
      term: (series as { term?: string | null }).term as import("./types").StudentTermType | undefined ?? undefined,
      academicYearStart: (series as { academicYearStart?: number | null }).academicYearStart ?? undefined,
      demoTag: (series as { demoTag?: string | null }).demoTag ?? undefined,
      contractId: (series as { contractId?: string | null }).contractId ?? undefined,
    })),
    attendances: school.attendances.map((attendance) => ({
      id: attendance.id,
      lessonId: attendance.lessonId,
      studentId: attendance.studentId,
      status: attendance.status as import("./types").AttendanceStatus,
      reason: attendance.reason ?? undefined,
      markedAt: attendance.markedAt.toISOString(),
      createsMakeupCredit: attendance.createsMakeupCredit,
    })),
    makeupRequests: school.makeupRequests.map((request) => ({
      id: request.id,
      studentId: request.studentId,
      teacherId: request.teacherId,
      branchId: request.branchId as BranchId,
      instrument: request.instrument as Instrument,
      sourceLessonId: request.sourceLessonId,
      attendanceId: request.attendanceId,
      status: request.status as import("./types").MakeupStatus,
      reason: request.reason,
      expiresAt: request.expiresAt.toISOString(),
      suggestedSlots: JSON.parse(JSON.stringify(request.suggestedSlots)) as MakeupSlot[],
      confirmedLessonId: request.confirmedLessonId ?? undefined,
      createdAt: request.createdAt.toISOString(),
      policyNote: request.policyNote,
      decisionNote: request.decisionNote ?? undefined,
      decidedBy: request.decidedBy ?? undefined,
      decidedAt: request.decidedAt?.toISOString() ?? undefined,
      slaDeadline: request.slaDeadline?.toISOString() ?? undefined,
      slaEscalationLevel: request.slaEscalationLevel,
      changeLog: Array.isArray(request.changeLog) ? (request.changeLog as unknown as MakeupChangeEntry[]) : [],
    })),
    payments: school.payments.map(mapDbPayment),
    teacherFeeRules: school.teacherFeeRules.map((rule) => ({
      id: rule.id,
      teacherId: rule.teacherId,
      branchId: (rule.branchId as BranchId) ?? undefined,
      instrument: (rule.instrument as Instrument) ?? undefined,
      perMinuteRate: rule.perMinuteRate,
      effectiveFrom: rule.effectiveFrom.toISOString(),
      effectiveTo: rule.effectiveTo?.toISOString() ?? undefined,
      createdAt: rule.createdAt.toISOString(),
      deactivatedAt: rule.deactivatedAt?.toISOString() ?? undefined,
      deactivatedByUserId: rule.deactivatedByUserId ?? undefined,
      deactivationReason: rule.deactivationReason ?? undefined,
    })),
    teacherPayouts: school.teacherPayouts.map(mapDbTeacherPayout),
  };
}

export function getDashboardStats(data: AppData) {
  const pendingMakeup = data.makeupRequests.filter(
    (m) => m.status === "pending" || m.status === "suggested" || m.status === "awaiting_info"
  ).length;
  const confirmedMakeup = data.makeupRequests.filter((m) => m.status === "confirmed").length;
  const overduePayments = data.payments.filter((p) => p.status === "overdue" || p.status === "partial");
  const revenuePaid = data.payments.reduce((s, p) => s + collectedAmountOf(p), 0);
  const revenueDue = data.payments
    .filter((p) => isOutstandingPaymentStatus(p.status))
    .reduce((s, p) => s + (p.amount - p.paidAmount), 0);
  const today = new Date().toISOString().slice(0, 10);
  const todayLessons = data.lessons.filter((l) => l.startAt.startsWith(today));
  const activeStudents = data.students.filter((s) => s.active).length;
  const activeTeachers = data.teachers.filter((t) => t.active).length;

  return {
    pendingMakeup,
    confirmedMakeup,
    overdueCount: overduePayments.length,
    revenuePaid,
    revenueDue,
    todayLessonCount: todayLessons.length,
    activeStudents,
    activeTeachers,
  };
}

export async function seedDatabase(seed: AppData) {
  const tid = seed.settings.tenantId || tenantId();

  await prisma.$transaction([
    prisma.user.deleteMany({ where: { tenantId: tid } }),
    prisma.teacherPayout.deleteMany({ where: { tenantId: tid } }),
    prisma.teacherPayoutPolicyPeriod.deleteMany({ where: { tenantId: tid } }),
    prisma.teacherPayoutExclusion.deleteMany({ where: { tenantId: tid } }),
    prisma.teacherFeeRule.deleteMany({ where: { tenantId: tid } }),
    // KÖK NEDEN (2026-09-07, "Demo verisini sıfırla" -> React #441): bu iki
    // satır TERS SIRADAYDI. `MakeupRequest.attendanceId` ZORUNLU bir FK'dir
    // (`MakeupRequest_attendanceId_fkey`); `$transaction([...])` verilen
    // sırayla çalıştığı için Attendance önce silinince, hâlâ ona işaret eden
    // MakeupRequest satırları yüzünden PostgreSQL 23503 atıyordu. Yalnızca
    // telafi verisi OLAN tenant'larda (yani ilk seed'den sonra her zaman)
    // patlıyordu — bu yüzden boş bir tenant'ta "çalışıyor" görünüyordu.
    prisma.makeupRequest.deleteMany({ where: { tenantId: tid } }),
    prisma.attendance.deleteMany({ where: { tenantId: tid } }),
    prisma.payment.deleteMany({ where: { tenantId: tid } }),
    prisma.lesson.deleteMany({ where: { tenantId: tid } }),
    prisma.lessonSeries.deleteMany({ where: { tenantId: tid } }),
    prisma.student.deleteMany({ where: { tenantId: tid } }),
    prisma.teacher.deleteMany({ where: { tenantId: tid } }),
    prisma.room.deleteMany({ where: { tenantId: tid } }),
    prisma.branch.deleteMany({ where: { tenantId: tid } }),
    prisma.school.deleteMany({ where: { tenantId: tid } }),
    // ÖNCELİK 4 (devam) — Package Student'tan sonra silinir (FK), School'dan bağımsızdır (tenant-çapında).
    prisma.package.deleteMany({ where: { tenantId: tid } }),
  ]);

  await prisma.tenant.upsert({
    where: { id: tid },
    create: {
      id: tid,
      name: seed.settings.name,
      slug: tid,
      active: true,
    },
    update: { name: seed.settings.name, active: true },
  });

  const school = await prisma.school.create({
    data: {
      tenantId: tid,
      name: seed.settings.name,
      shortName: seed.settings.shortName,
      city: seed.settings.city,
      website: seed.settings.website,
      email: seed.settings.email,
      phone: seed.settings.phone,
      logoUrl: seed.settings.logoUrl,
      makeupWindowDays: seed.settings.makeupWindowDays,
      monthlyMakeupAllowance: resolveMonthlyMakeupAllowance(seed.settings),
      lessonDurationMinutes: seed.settings.lessonDurationMinutes,
      workingHoursStart: seed.settings.workingHours.start,
      workingHoursEnd: seed.settings.workingHours.end,
      workingDays: seed.settings.workingDays,
      currency: seed.settings.currency,
      feeRoundingMode: seed.settings.feeRoundingMode,
      branches: {
        create: seed.settings.branches.map((branch) => ({
          id: branch.id,
          tenantId: tid,
          name: branch.name,
          shortName: branch.shortName,
          address: branch.address,
          phone: branch.phone,
          city: branch.city,
        })),
      },
    },
  });

  await Promise.all(
    seed.teachers.map((teacher) =>
      prisma.teacher.create({
        data: {
          id: teacher.id,
      displayId: (teacher as { displayId?: string | null }).displayId ?? undefined,
          tenantId: tid,
          name: teacher.name,
          email: teacher.email,
          phone: teacher.phone,
          branchId: teacher.branchId,
          schoolId: school.id,
          instruments: teacher.instruments,
          instrumentLevels: teacher.instrumentLevels ?? undefined,
          availability: teacher.availability,
          maxDailyLessons: teacher.maxDailyLessons,
          active: teacher.active,
          color: teacher.color,
        },
      })
    )
  );

  // ÖNCELİK 4 (devam) — Package tenant-çapında (School'a bağlı değil).
  await Promise.all(
    (seed.packages ?? []).map((pkg) =>
      prisma.package.create({
        data: {
          id: pkg.id,
          tenantId: tid,
          title: pkg.title,
          description: pkg.description,
          status: pkg.status,
          price30Min: pkg.price30Min,
          price40Min: pkg.price40Min,
          price50Min: pkg.price50Min,
          termLabel: pkg.termLabel,
          createdBy: pkg.createdBy,
          createdAt: new Date(pkg.createdAt),
          updatedAt: new Date(pkg.updatedAt),
        },
      })
    )
  );

  await Promise.all(
    seed.rooms.map((room) =>
      prisma.room.create({
        data: {
          id: room.id,
          tenantId: tid,
          name: room.name,
          branchId: room.branchId,
          schoolId: school.id,
          capacity: room.capacity,
          instruments: room.instruments,
        },
      })
    )
  );

  await Promise.all(
    seed.students.map((student) =>
      prisma.student.create({
        data: {
          id: student.id,
      displayId: (student as { displayId?: string | null }).displayId ?? undefined,
          tenantId: tid,
          name: student.name,
          email: student.email,
          phone: student.phone,
          parentName: student.parentName,
          parentPhone: student.parentPhone,
          branchId: student.branchId,
          schoolId: school.id,
          instruments: student.instruments,
          teacherId: student.teacherId,
          packageName: student.packageName,
          weeklyLessonCount: student.weeklyLessonCount,
          monthlyFee: student.monthlyFee,
          active: student.active,
          notes: student.notes,
          createdAt: new Date(student.createdAt),
        },
      })
    )
  );

  await Promise.all(
    seed.lessons.map((lesson) =>
      prisma.lesson.create({
        data: {
          id: lesson.id,
          tenantId: tid,
          studentId: lesson.studentId,
          teacherId: lesson.teacherId,
          roomId: lesson.roomId,
          branchId: lesson.branchId,
          schoolId: school.id,
          instrument: lesson.instrument,
          startAt: new Date(lesson.startAt),
          endAt: new Date(lesson.endAt),
          type: lesson.type,
          status: lesson.status,
          makeupRequestId: lesson.makeupRequestId,
          notes: lesson.notes,
        },
      })
    )
  );

  await Promise.all(
    seed.attendances.map((attendance) =>
      prisma.attendance.create({
        data: {
          id: attendance.id,
          tenantId: tid,
          lessonId: attendance.lessonId,
          studentId: attendance.studentId,
          schoolId: school.id,
          status: attendance.status,
          reason: attendance.reason,
          markedAt: new Date(attendance.markedAt),
          createsMakeupCredit: attendance.createsMakeupCredit,
        },
      })
    )
  );

  await Promise.all(
    seed.payments.map((payment) =>
      prisma.payment.create({
        data: {
          id: payment.id,
          tenantId: tid,
          studentId: payment.studentId,
          schoolId: school.id,
          amount: payment.amount,
          paidAmount: payment.paidAmount,
          status: payment.status,
          dueDate: new Date(payment.dueDate),
          paidAt: payment.paidAt ? new Date(payment.paidAt) : undefined,
          description: payment.description,
          method: payment.method,
          lessonId: payment.lessonId,
          source: payment.source ?? "manual",
        },
      })
    )
  );

  await Promise.all(
    seed.makeupRequests.map((request) =>
      prisma.makeupRequest.create({
        data: {
          id: request.id,
          tenantId: tid,
          studentId: request.studentId,
          teacherId: request.teacherId,
          branchId: request.branchId,
          schoolId: school.id,
          instrument: request.instrument,
          sourceLessonId: request.sourceLessonId,
          attendanceId: request.attendanceId,
          status: request.status,
          reason: request.reason,
          expiresAt: new Date(request.expiresAt),
          suggestedSlots: JSON.parse(JSON.stringify(request.suggestedSlots)) as Prisma.JsonArray,
          confirmedLessonId: request.confirmedLessonId,
          createdAt: new Date(request.createdAt),
          policyNote: request.policyNote,
          decisionNote: request.decisionNote,
          decidedBy: request.decidedBy,
          decidedAt: request.decidedAt ? new Date(request.decidedAt) : undefined,
          slaDeadline: request.slaDeadline ? new Date(request.slaDeadline) : undefined,
          slaEscalationLevel: request.slaEscalationLevel ?? 0,
        },
      })
    )
  );

  await Promise.all(
    seed.teacherFeeRules.map((rule) =>
      prisma.teacherFeeRule.create({
        data: {
          id: rule.id,
          tenantId: tid,
          teacherId: rule.teacherId,
          schoolId: school.id,
          branchId: rule.branchId,
          instrument: rule.instrument,
          perMinuteRate: rule.perMinuteRate,
          effectiveFrom: new Date(rule.effectiveFrom),
          effectiveTo: rule.effectiveTo ? new Date(rule.effectiveTo) : undefined,
          createdAt: new Date(rule.createdAt),
        },
      })
    )
  );

  await Promise.all(
    seed.teacherPayouts.map((payout) =>
      prisma.teacherPayout.create({
        data: {
          id: payout.id,
          tenantId: tid,
          teacherId: payout.teacherId,
          schoolId: school.id,
          periodStart: new Date(payout.periodStart),
          periodEnd: new Date(payout.periodEnd),
          totalMinutes: payout.totalMinutes,
          totalAmount: payout.totalAmount,
          status: payout.status,
          paidAt: payout.paidAt ? new Date(payout.paidAt) : undefined,
          method: payout.method,
          generatedAt: new Date(payout.generatedAt),
        },
      })
    )
  );

  // Auth users for this tenant (bcrypt hashed). SUPER_ADMIN'in tek bir "ev"
  // kurumu vardır (bootstrap listesinde tenantId'si sabit) ama her tenant
  // seed edildiğinde de listeye dahil olur (platform genelinde erişimi
  // simgeler) — skipDuplicates olmadan ikinci bir kurum seed edilirken
  // SUPER_ADMIN satırı için birincil anahtar (id) çakışması oluşurdu.
  await prisma.user.createMany({
    data: getBootstrapUsersForSeed(tid).map((u) => ({
      ...u,
      email: u.email.toLowerCase(),
    })),
    skipDuplicates: true,
  });

  return school;
}

const schoolInclude = {
  branches: true,
  teachers: true,
  students: true,
  rooms: true,
  lessons: true,
  lessonSeries: true,
  attendances: true,
  makeupRequests: true,
  payments: true,
  teacherFeeRules: true,
  teacherPayouts: true,
} as const;

/**
 * ÖNCELİK 4 (devam) — Package tenant çapındadır (School'a değil Tenant'a
 * bağlı, `ClosedDay`/`SocialMediaConsent` ile aynı desen), bu yüzden
 * `schoolInclude`'a değil ayrı bir sorguya girer.
 */
/** 2026-09-29 — ay bazlı hakediş politikası (tenant geneli, Package ile aynı desen). */
async function readTeacherPayoutPolicies(tid: string): Promise<NonNullable<AppData["teacherPayoutPolicies"]>> {
  const rows = await prisma.teacherPayoutPolicyPeriod.findMany({ where: { tenantId: tid }, orderBy: { month: "asc" } });
  return rows.map((r) => ({
    id: r.id,
    month: r.month,
    policy: r.policy as import("./types").TeacherPayoutPricingPolicy,
    rate30: r.rate30 ?? undefined,
    rate40: r.rate40 ?? undefined,
    rate50: r.rate50 ?? undefined,
    setByUserId: r.setByUserId,
    setAt: r.setAt.toISOString(),
  }));
}

async function readPackages(tid: string): Promise<AppData["packages"]> {
  const rows = await prisma.package.findMany({ where: { tenantId: tid }, orderBy: { createdAt: "asc" } });
  return rows.map((p) => ({
    id: p.id,
    displayId: p.displayId ?? undefined,
    title: p.title,
    description: p.description ?? undefined,
    applicableBranchIds: (p.applicableBranchIds as import("./types").BranchId[] | null) ?? undefined,
    status: p.status as import("./types").PackageStatus,
    price30Min: p.price30Min,
    price40Min: p.price40Min,
    price50Min: p.price50Min,
    termLabel: (p.termLabel as import("./types").StudentTermType | null) ?? undefined,
    monthlyLessonCount: p.monthlyLessonCount ?? undefined,
    groupLessonCount: p.groupLessonCount ?? undefined,
    defaultDurationMinutes: (p.defaultDurationMinutes as import("./types").LessonDurationPreference | null) ?? undefined,
    defaultPaymentDueDay: p.defaultPaymentDueDay ?? undefined,
    notes: p.notes ?? undefined,
    createdBy: p.createdBy,
    createdByUserId: p.createdByUserId ?? undefined,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));
}

/** Paket 5 — DiscountCampaign de Package ile aynı tenant-çapında desen. */
async function readDiscountCampaigns(tid: string): Promise<AppData["discountCampaigns"]> {
  const rows = await prisma.discountCampaign.findMany({ where: { tenantId: tid }, orderBy: { createdAt: "asc" } });
  return rows.map((c) => ({
    id: c.id,
    displayId: c.displayId ?? undefined,
    name: c.name,
    description: c.description ?? undefined,
    kind: c.kind as import("./types").DiscountCampaignKind,
    discountPercent: c.discountPercent,
    active: c.active,
    validFrom: c.validFrom?.toISOString() ?? undefined,
    validTo: c.validTo?.toISOString() ?? undefined,
    branchId: (c.branchId as import("./types").BranchId | null) ?? undefined,
    applicableBranchIds: (c.applicableBranchIds as import("./types").BranchId[] | null) ?? undefined,
    stackingRule: (c.stackingRule as import("./types").CampaignStackingRule | null) ?? "none",
    priority: c.priority ?? 0,
    maxUsageCount: c.maxUsageCount ?? undefined,
    usageCount: c.usageCount ?? 0,
    conditions: (c.conditions as Record<string, unknown> | null) ?? undefined,
    createdBy: c.createdBy,
    createdByUserId: c.createdByUserId ?? undefined,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    deletedAt: c.deletedAt?.toISOString() ?? undefined,
    deletedByUserId: c.deletedByUserId ?? undefined,
    deletionReason: c.deletionReason ?? undefined,
  }));
}

/**
 * P0 performans (2026-09-07) — üç sorgu (School+ilişkiler, Package,
 * DiscountCampaign) BİRBİRİNDEN BAĞIMSIZ; eskiden ardışık `await`
 * ediliyorlardı, yani her `readData()` en az 3 ağ gidiş-dönüşü sürüyordu.
 * Uzak bir havuz (Supabase pooler) üzerinde ölçülen fark: ~830 ms → ~500 ms.
 * `readData()` neredeyse her sayfa render'ında ve her tool çağrısında
 * çalıştığı için bu tasarruf tüm panelde geçerlidir.
 */
/**
 * Prisma `Payment` satırı → `AppData.payments` öğesi. JSON/memory store'ların taşıdığı TÜM alanlar
 * burada da olmalı (mode parity) — bkz. `payment-db-mapping.test.ts`.
 */
export function mapDbPayment(payment: Prisma.PaymentGetPayload<object>): import("./types").Payment {
  return {
    id: payment.id,
    studentId: payment.studentId,
    amount: payment.amount,
    paidAmount: payment.paidAmount,
    status: payment.status as import("./types").PaymentStatus,
    dueDate: payment.dueDate.toISOString(),
    paidAt: payment.paidAt?.toISOString() ?? undefined,
    description: payment.description,
    method: payment.method ?? undefined,
    lessonId: payment.lessonId ?? undefined,
    source: (payment.source as import("./types").PaymentSource | undefined) ?? "manual",
    createdAt: (payment as { createdAt?: Date }).createdAt?.toISOString() ?? undefined,
    paymentNote: payment.paymentNote ?? undefined,
    receivedByUserId: payment.receivedByUserId ?? undefined,
    // UAT 2026-09-25 — bu iki alan eksikti: db modunda hiçbir ödeme sözleşmeye bağlı görünmüyor,
    // yoklama takvimi her ay "aktif ödeme planı yok" diyor, takvim tahsilatı ayrı satır açıyordu.
    contractId: payment.contractId ?? undefined,
    clubMembershipId: payment.clubMembershipId ?? undefined,
    enrollmentId: (payment as { enrollmentId?: string | null }).enrollmentId ?? undefined,
    installmentSequence: payment.installmentSequence ?? undefined,
    autoSuggestedAmount: payment.autoSuggestedAmount ?? undefined,
    firstCollectionIncludesNextMonth: payment.firstCollectionIncludesNextMonth ?? undefined,
    adjustmentReason: payment.adjustmentReason ?? undefined,
    adjustedBy: payment.adjustedBy ?? undefined,
    adjustedAt: payment.adjustedAt?.toISOString() ?? undefined,
    installmentKind: (payment.installmentKind as import("./types").ContractInstallmentKind | undefined) ?? undefined,
    installmentPeriodLabel: payment.installmentPeriodLabel ?? undefined,
    installmentBreakdown:
      (payment.installmentBreakdown as { periodLabel: string; amount: number }[] | undefined) ?? undefined,
    installmentComputationSource: (payment.installmentComputationSource as "auto" | "manual" | undefined) ?? undefined,
    installmentNote: payment.installmentNote ?? undefined,
  };
}

export async function readData(): Promise<AppData> {
  // Kota ölçümü (2026-10-13): tenant'ın TÜM verisini okuyan her çağrı tek sabit satır yazar (PII yok). Vercel runtime
  // log'larında `requestPath`'e göre sayılarak hangi ekranın tam okuma yaptığı bulunur (docs/performance/QUOTA_AUDIT_2026_10_12.md).
  logger.info("egress:readData:full");
  const tid = tenantId();
  const [school, packages, discountCampaigns, teacherPayoutPolicies, teacherPayoutExclusions, closedDayOverrides] = await Promise.all([
    prisma.school.findFirst({ where: { tenantId: tid }, include: schoolInclude }),
    readPackages(tid),
    readDiscountCampaigns(tid),
    readTeacherPayoutPolicies(tid),
    prisma.teacherPayoutExclusion
      .findMany({ where: { tenantId: tid } })
      .then((rows) => rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), tenantId: undefined }))),
    // Store içi doğrulama da zorla açık/kapalı günleri görsün (bkz. withClosedDayOverrides).
    listClosedDays(tid).catch(() => []),
  ]);

  if (!school) {
    // 2026-10-10: gece monthly-accrual cron'u okulsuz tenant'ta buraya düşüp sabit demo id'leriyle seed
    // ediyordu (P2002; seedDatabase'in silme transaction'ı create'ten ÖNCE commit olur). Canlıda asla seed yok.
    // Bütün dilim okuyucular okul yoksa buraya düştüğü için tek kapı burası.
    if (process.env.VERCEL_ENV === "production" || process.env.NEVII_DEPLOYMENT_TIER === "production") {
      throw new Error(
        `Kurum (${tid}) için okul kaydı bulunamadı. Canlı ortamda demo veri otomatik yazılmaz; ` +
          "kurumun okul kaydını Platform → Kurumlar ekranından oluşturun."
      );
    }
    logger.info("readData", "no school for tenant, seeding", tid);
    const seed = createSeedData();
    seed.settings.tenantId = tid;
    await seedDatabase(seed);
    const [seededSchool, seededPackages, seededCampaigns] = await Promise.all([
      prisma.school.findFirst({ where: { tenantId: tid }, include: schoolInclude }),
      readPackages(tid),
      readDiscountCampaigns(tid),
    ]);
    if (!seededSchool) throw new Error("Okul verisi bulunamadı");
    return {
      ...mapSchoolToAppData(seededSchool),
      packages: seededPackages,
      discountCampaigns: seededCampaigns,
      closedDayOverrides,
    };
  }

  return { ...mapSchoolToAppData(school), packages, discountCampaigns, teacherPayoutPolicies, teacherPayoutExclusions, closedDayOverrides };
}

/**
 * DB egress (2026-09-30) — tek öğrenci satırı. `readData().students.find(id)` ile AYNI sonuç
 * (okulun öğrencisi; arşivli/silinmiş dahil, aynı eşleme) ama tenant'ın tüm verisini okumaz.
 * Yalnız erişim kontrolü (`assertStudentAccess`) için tam okuma yapan tool'lar içindir.
 */
export async function readStudentById(studentId: string): Promise<Student | undefined> {
  // Boş id Prisma'da "filtre yok" demektir (ilk öğrenciyi döndürürdü) — `find` gibi undefined dön.
  if (!studentId) return undefined;
  const tid = tenantId();
  const row = await prisma.student.findFirst({ where: { id: studentId, tenantId: tid, school: { tenantId: tid } } });
  return row ? mapDbStudent(row) : undefined;
}

/** Portal daveti için tenant-scope'lu öğretmen/kurum alanları; ağır koleksiyonlar okunmaz. */
export async function readTeacherPortalDetails(teacherId: string) {
  if (!teacherId) return null;
  const tid = tenantId();
  const row = await prisma.teacher.findFirst({
    where: { id: teacherId, tenantId: tid, school: { tenantId: tid } },
    select: {
      id: true,
      name: true,
      email: true,
      school: { select: { name: true, phone: true, website: true, logoUrl: true } },
    },
  });
  if (!row) return null;
  return {
    teacherId: row.id,
    teacherName: row.name,
    contactEmail: row.email,
    institutionName: row.school.name,
    schoolPhone: row.school.phone,
    schoolWebsite: row.school.website,
    logoUrl: row.school.logoUrl,
  };
}

/**
 * DB egress (2026-10-10) — tek ders satırı. `readData().lessons.find(id)` ile AYNI sonuç (aynı eşleme,
 * okulun dersi) ama tenant'ın tüm ders/ödeme/öğrenci verisi okunmaz. Varlık/şube kontrolü ve bildirim
 * metni için tam okuma yapan tool'lar içindir.
 */
export async function readLessonById(lessonId: string): Promise<import("./types").Lesson | undefined> {
  // Boş id Prisma'da "filtre yok" demektir (ilk dersi döndürürdü) — `find` gibi undefined dön.
  if (!lessonId) return undefined;
  const tid = tenantId();
  const row = await prisma.lesson.findFirst({ where: { id: lessonId, tenantId: tid, school: { tenantId: tid } } });
  return row ? mapDbLesson(row) : undefined;
}

/** DB egress (2026-10-10) — tek ödeme satırı: `readData().payments.find(id)` ile aynı (makbuz). */
export async function readPaymentById(paymentId: string): Promise<import("./types").Payment | undefined> {
  if (!paymentId) return undefined;
  const tid = tenantId();
  const row = await prisma.payment.findFirst({ where: { id: paymentId, tenantId: tid, school: { tenantId: tid } } });
  return row ? mapDbPayment(row) : undefined;
}

/**
 * DB egress (2026-10-10) — bir öğretmenin TÜM kayıtlı hakedişleri (iptal dahil, readData ile aynı satırlar
 * ve eşleme). Yoklama değişikliğinin hakedişe etkisi önce yalnız bunlarla kontrol edilir.
 */
export async function readTeacherPayoutsForTeacher(teacherId: string): Promise<TeacherPayout[]> {
  if (!teacherId) return [];
  const tid = tenantId();
  const rows = await prisma.teacherPayout.findMany({ where: { tenantId: tid, teacherId, school: { tenantId: tid } } });
  return rows.map(mapDbTeacherPayout);
}

/** Referans dilimi için School ilişkileri — ders/seri/yoklama/telafi/ödeme/hakediş satırları YOK. */
const referenceSchoolInclude = {
  branches: true,
  teachers: true,
  students: true,
  rooms: true,
  teacherFeeRules: true,
} as const;

/**
 * DB egress (2026-09-30) — bkz. src/lib/reference-data.ts. `readData()` ile aynı eşleme, ama
 * ağır koleksiyonlar ve ~79 KB logo okunmaz. Okul yoksa `readData()`'nın seed davranışı korunur.
 */
export async function readReferenceData(): Promise<ReferenceData> {
  const tid = tenantId();
  const [school, packages, discountCampaigns, teacherPayoutPolicies, closedDayOverrides] = await Promise.all([
    prisma.school.findFirst({ where: { tenantId: tid }, omit: { logoUrl: true }, include: referenceSchoolInclude }),
    readPackages(tid),
    readDiscountCampaigns(tid),
    readTeacherPayoutPolicies(tid),
    listClosedDays(tid).catch(() => []),
  ]);
  if (!school) return toReferenceData(await readData());
  const mapped = mapSchoolToAppData({
    ...school,
    logoUrl: "",
    lessons: [],
    lessonSeries: [],
    attendances: [],
    makeupRequests: [],
    payments: [],
    teacherPayouts: [],
  });
  return toReferenceData({ ...mapped, packages, discountCampaigns, teacherPayoutPolicies, closedDayOverrides });
}

/**
 * DB egress (2026-09-30) — tek öğrenci dilimi (bkz. src/lib/reference-data.ts
 * `narrowToStudentScope`): referans veri + yalnız bu öğrencinin ders/seri/yoklama/telafi/ödeme
 * satırları. Her ilişki filtresine `tenantId` de yazılır (savunma derinliği, readLessonScope gibi).
 */
export async function readStudentScope(studentId: string): Promise<StudentScopeData> {
  const tid = tenantId();
  const own = { tenantId: tid, studentId };
  const [school, packages, discountCampaigns, teacherPayoutPolicies, closedDayOverrides] = await Promise.all([
    prisma.school.findFirst({
      where: { tenantId: tid },
      omit: { logoUrl: true },
      include: {
        ...referenceSchoolInclude,
        students: { where: { tenantId: tid, id: studentId } },
        lessons: { where: own },
        lessonSeries: { where: own },
        attendances: { where: own },
        makeupRequests: { where: own },
        payments: { where: own },
      },
    }),
    readPackages(tid),
    readDiscountCampaigns(tid),
    readTeacherPayoutPolicies(tid),
    listClosedDays(tid).catch(() => []),
  ]);
  if (!school) return narrowToStudentScope(await readData(), studentId);
  const mapped = mapSchoolToAppData({ ...school, logoUrl: "", teacherPayouts: [] });
  return narrowToStudentScope({ ...mapped, packages, discountCampaigns, teacherPayoutPolicies, closedDayOverrides }, studentId);
}

/** DB egress (2026-09-30) — Ders Programı haftası: referans veri + penceredeki dersler (bkz. reference-data.ts). */
export async function readLessonWindow(fromIso: string, toIso: string): Promise<LessonWindowData> {
  const tid = tenantId();
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const [school, packages, discountCampaigns, teacherPayoutPolicies, closedDayOverrides] = await Promise.all([
    prisma.school.findFirst({
      where: { tenantId: tid },
      omit: { logoUrl: true },
      include: { ...referenceSchoolInclude, lessons: { where: { tenantId: tid, startAt: { gte: from, lte: to } } } },
    }),
    readPackages(tid),
    readDiscountCampaigns(tid),
    readTeacherPayoutPolicies(tid),
    listClosedDays(tid).catch(() => []),
  ]);
  if (!school) return narrowToLessonWindow(await readData(), from, to);
  const mapped = mapSchoolToAppData({
    ...school,
    logoUrl: "",
    lessonSeries: [],
    attendances: [],
    makeupRequests: [],
    payments: [],
    teacherPayouts: [],
  });
  return narrowToLessonWindow({ ...mapped, packages, discountCampaigns, teacherPayoutPolicies, closedDayOverrides }, from, to);
}

/** readData ile aynı hariç tutma eşlemesi (hakediş penceresi / panel özeti dilimleri). */
async function readPayoutExclusions(tid: string): Promise<NonNullable<AppData["teacherPayoutExclusions"]>> {
  const rows = await prisma.teacherPayoutExclusion.findMany({ where: { tenantId: tid } });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), tenantId: undefined }));
}

/**
 * DB egress (2026-09-30) — Hakedişler / ay hakediş özeti: referans veri + [from, to] penceresindeki
 * TÜM dersler + TÜM kayıtlı hakedişler + hariç tutmalar (bkz. reference-data.ts `PayoutWindowData`).
 */
export async function readPayoutWindow(fromIso: string, toIso: string): Promise<PayoutWindowData> {
  const tid = tenantId();
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const [school, packages, discountCampaigns, teacherPayoutPolicies, teacherPayoutExclusions, closedDayOverrides] =
    await Promise.all([
      prisma.school.findFirst({
        where: { tenantId: tid },
        omit: { logoUrl: true },
        include: {
          ...referenceSchoolInclude,
          lessons: { where: { tenantId: tid, startAt: { gte: from, lte: to } } },
          teacherPayouts: true,
        },
      }),
      readPackages(tid),
      readDiscountCampaigns(tid),
      readTeacherPayoutPolicies(tid),
      readPayoutExclusions(tid),
      listClosedDays(tid).catch(() => []),
    ]);
  if (!school) return narrowToPayoutWindow(await readData(), from, to);
  const mapped = mapSchoolToAppData({
    ...school,
    logoUrl: "",
    lessonSeries: [],
    attendances: [],
    makeupRequests: [],
    payments: [],
  });
  return narrowToPayoutWindow(
    { ...mapped, packages, discountCampaigns, teacherPayoutPolicies, teacherPayoutExclusions, closedDayOverrides },
    from,
    to
  );
}

/**
 * DB egress (2026-09-30) — Panel özeti: hakediş penceresi + tüm ödemelerin özet alanları + telafi
 * talepleri + gelecekte planlı ders var mı (bkz. reference-data.ts `DashboardData`).
 */
export async function readDashboardData(fromIso: string, toIso: string, nowIso: string): Promise<DashboardData> {
  const tid = tenantId();
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const now = new Date(nowIso);
  const [school, packages, discountCampaigns, teacherPayoutPolicies, teacherPayoutExclusions, closedDayOverrides, futureLesson] =
    await Promise.all([
      prisma.school.findFirst({
        where: { tenantId: tid },
        omit: { logoUrl: true },
        include: {
          ...referenceSchoolInclude,
          lessons: { where: { tenantId: tid, startAt: { gte: from, lte: to } } },
          teacherPayouts: true,
          makeupRequests: true,
          payments: {
            select: { id: true, studentId: true, amount: true, paidAmount: true, status: true, dueDate: true, paidAt: true, contractId: true },
          },
        },
      }),
      readPackages(tid),
      readDiscountCampaigns(tid),
      readTeacherPayoutPolicies(tid),
      readPayoutExclusions(tid),
      listClosedDays(tid).catch(() => []),
      prisma.lesson.findFirst({
        where: { tenantId: tid, school: { tenantId: tid }, status: "scheduled", startAt: { gt: now } },
        select: { id: true },
      }),
    ]);
  if (!school) return narrowToDashboard(await readData(), from, to, now);
  const { payments, ...rest } = school;
  const mapped = mapSchoolToAppData({ ...rest, logoUrl: "", lessonSeries: [], attendances: [], payments: [] });
  return {
    ...narrowToPayoutWindow(
      { ...mapped, packages, discountCampaigns, teacherPayoutPolicies, teacherPayoutExclusions, closedDayOverrides },
      from,
      to
    ),
    makeupRequests: mapped.makeupRequests,
    // mapDbPayment ile aynı dönüşümler (ISO tarih, null → undefined).
    payments: payments.map((p) => ({
      id: p.id,
      studentId: p.studentId,
      amount: p.amount,
      paidAmount: p.paidAmount,
      status: p.status as import("./types").PaymentStatus,
      dueDate: p.dueDate.toISOString(),
      paidAt: p.paidAt?.toISOString() ?? undefined,
      contractId: p.contractId ?? undefined,
    })),
    hasFutureScheduledLesson: Boolean(futureLesson),
  };
}

/** DB egress (2026-09-30) — Ödemeler: referans veri + tüm ödemeler + yalnız ödemelere bağlı dersler. */
export async function readPaymentsPageData(): Promise<PaymentsPageData> {
  const tid = tenantId();
  const [school, packages, discountCampaigns, teacherPayoutPolicies, closedDayOverrides] = await Promise.all([
    prisma.school.findFirst({
      where: { tenantId: tid },
      omit: { logoUrl: true },
      include: { ...referenceSchoolInclude, payments: true },
    }),
    readPackages(tid),
    readDiscountCampaigns(tid),
    readTeacherPayoutPolicies(tid),
    listClosedDays(tid).catch(() => []),
  ]);
  if (!school) return narrowToPaymentsPage(await readData());
  const lessonIds = [...new Set(school.payments.map((p) => p.lessonId).filter((id): id is string => Boolean(id)))];
  const lessons = lessonIds.length
    ? await prisma.lesson.findMany({ where: { tenantId: tid, schoolId: school.id, id: { in: lessonIds } } })
    : [];
  const mapped = mapSchoolToAppData({
    ...school,
    logoUrl: "",
    lessons,
    lessonSeries: [],
    attendances: [],
    makeupRequests: [],
    teacherPayouts: [],
  });
  return narrowToPaymentsPage({ ...mapped, packages, discountCampaigns, teacherPayoutPolicies, closedDayOverrides });
}

/** DB egress (2026-09-30) — Öğrenciler listesi: referans veri + tüm ödemelerin yalnız durum alanları. */
export async function readStudentListData(): Promise<StudentListData> {
  const tid = tenantId();
  const [school, packages, discountCampaigns, teacherPayoutPolicies, closedDayOverrides] = await Promise.all([
    prisma.school.findFirst({
      where: { tenantId: tid },
      omit: { logoUrl: true },
      include: {
        ...referenceSchoolInclude,
        payments: { select: { studentId: true, status: true, contractId: true, amount: true, paidAmount: true } },
      },
    }),
    readPackages(tid),
    readDiscountCampaigns(tid),
    readTeacherPayoutPolicies(tid),
    listClosedDays(tid).catch(() => []),
  ]);
  if (!school) {
    const full = await readData();
    return { ...toReferenceData(full), payments: full.payments.map(toPaymentStatusRow) };
  }
  const { payments, ...rest } = school;
  const mapped = mapSchoolToAppData({
    ...rest,
    logoUrl: "",
    lessons: [],
    lessonSeries: [],
    attendances: [],
    makeupRequests: [],
    payments: [],
    teacherPayouts: [],
  });
  return {
    ...toReferenceData({ ...mapped, packages, discountCampaigns, teacherPayoutPolicies, closedDayOverrides }),
    // mapDbPayment ile aynı dönüşüm (status tipi, contractId null → undefined).
    payments: payments.map((p) =>
      toPaymentStatusRow({
        studentId: p.studentId,
        status: p.status as import("./types").PaymentStatus,
        contractId: p.contractId ?? undefined,
        amount: p.amount,
        paidAmount: p.paidAmount,
      })
    ),
  };
}

export async function resetData(): Promise<void> {
  logger.info("resetData", "resetting tenant demo data");
  const seed = createSeedData();
  seed.settings.tenantId = tenantId();
  await seedDatabase(seed);
  return;
}

/** Kurulum Merkezi — boş şablona sıfırla (bkz. store.ts resetToCleanTemplate). */
export async function resetToCleanTemplate(): Promise<void> {
  logger.info("resetToCleanTemplate", "resetting tenant to clean template");
  const tid = tenantId();
  const current = await readData();
  const template = createEmptyTemplateData();
  template.settings.tenantId = tid;
  template.settings.name = current.settings.name;
  template.settings.shortName = current.settings.shortName;
  await seedDatabase(template);
  return;
}

/** Platform genelindeki tüm aktif kurumları (tenant) listeler — yalnız db modunda gerçek çokluluk vardır. */
export async function listTenants(): Promise<{ tenantId: string; name: string }[]> {
  // Yalnız ad: `include: { schools: true }` her panel isteğinde (kurum seçici) ~79 KB logo taşıyordu.
  const tenants = await prisma.tenant.findMany({
    where: { active: true },
    select: { id: true, name: true, schools: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  return tenants.map((t) => ({ tenantId: t.id, name: t.schools[0]?.name ?? t.name }));
}

export async function markAttendance(input: {
  lessonId: string;
  status: AttendanceStatus;
  reason?: string;
}): Promise<void> {
  logger.info("markAttendance", input.lessonId, input.status);

  const tid = requireTenantId();
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await prisma.$transaction(
        async (tx) => {
          const lesson = await tx.lesson.findFirst({ where: { id: input.lessonId, tenantId: tid } });
          if (!lesson) throw new Error("Ders bulunamadı");

          // Nilüfer Acar politikası §3.5 — bilinçli olarak UYGULANMADI, bkz. store-json.ts aynı satır için yorum.
          const createsMakeupCredit =
            input.status === "absent" || input.status === "cancelled_by_school";

          const lessonStatus =
            input.status === "absent"
              ? "no_show"
              : input.status === "cancelled_by_school"
              ? "cancelled"
              : lesson.status;

          await tx.lesson.updateMany({ where: { id: input.lessonId, tenantId: tid }, data: { status: lessonStatus } });

          let attendanceId: string;
          const existingAttendance = await tx.attendance.findFirst({ where: { lessonId: input.lessonId, tenantId: tid } });
          if (existingAttendance) {
            const updated = await tx.attendance.update({ where: { id: existingAttendance.id }, data: { status: input.status, reason: input.reason, markedAt: new Date(), createsMakeupCredit } });
            attendanceId = updated.id;
          } else {
            const created = await tx.attendance.create({ data: { tenantId: tid, lessonId: input.lessonId, studentId: lesson.studentId, schoolId: lesson.schoolId, status: input.status, reason: input.reason, markedAt: new Date(), createsMakeupCredit } });
            attendanceId = created.id;
          }

          await tx.makeupRequest.deleteMany({ where: { sourceLessonId: input.lessonId, tenantId: tid } });

          if (createsMakeupCredit) {
            const school = await assertStudentMakeupQuotaTx(tx, tid, lesson.studentId, lesson.schoolId, lesson.id);
            const branch = await tx.branch.findFirst({ where: { id: lesson.branchId, tenantId: tid } });
            const allowance = resolveMonthlyMakeupAllowance(school);
            const policyNote =
              input.status === "cancelled_by_school"
                ? `Okul kaynaklı iptal — öncelikli yerleştirme · ${branch?.shortName ?? ""}`
                : `${school.makeupWindowDays} gün pencere · ${allowance}/dönem hak · aynı öğretmen · ${branch?.shortName ?? ""}`;

            await tx.makeupRequest.create({
              data: {
                tenantId: tid,
                studentId: lesson.studentId,
                teacherId: lesson.teacherId,
                branchId: lesson.branchId,
                schoolId: lesson.schoolId,
                instrument: lesson.instrument,
                sourceLessonId: lesson.id,
                attendanceId,
                status: "pending",
                reason: input.reason || (input.status === "cancelled_by_school" ? "Okul iptali" : "Devamsızlık"),
                // §3.4 — 30 günlük telafi süresi ORİJİNAL kayıp ders tarihinden başlar, admin onay anından DEĞİL.
                expiresAt: addDays(lesson.startAt, school?.makeupWindowDays ?? 0),
                suggestedSlots: [],
                createdAt: new Date(),
                policyNote,
              },
            });
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      return;
    } catch (err: unknown) {
      if (isRetryablePrismaError(err) && attempt < maxRetries) {
        logger.warn("markAttendance: transient DB error, retrying", attempt, (err as Error).message);
        await sleepMs(50 * attempt);
        continue;
      }
      throw err;
    }
  }
  throw new Error("markAttendance failed after retries");
}

export async function generateSuggestions(
  requestId: string,
  options?: { maxSlots?: number }
): Promise<AppData> {
  logger.info("generateSuggestions", requestId);
  const tid = requireTenantId();
  const data = await readData();
  const request = data.makeupRequests.find((m) => m.id === requestId);
  if (!request) throw new Error("Telafi talebi bulunamadı");

  const slots = suggestMakeupSlots(data, request, options);
  const slotsJson = JSON.parse(JSON.stringify(slots)) as Prisma.JsonArray;
  const existing = await prisma.makeupRequest.findFirst({
    where: { id: requestId, tenantId: tid },
  });
  if (!existing) throw new Error("Telafi talebi bulunamadı");
  await prisma.makeupRequest.update({
    where: { id: existing.id },
    data: { status: "suggested", suggestedSlots: slotsJson },
  });
  return readData();
}

export async function confirmSlot(
  requestId: string,
  slot: MakeupSlot,
  decision: MakeupDecision
): Promise<void> {
  logger.info("confirmSlot", requestId, slot.startAt, slot.teacherId, slot.roomId);
  const tid = requireTenantId();
  const data = await readData();
  const request = data.makeupRequests.find((m) => m.id === requestId);
  if (!request) throw new Error("Telafi talebi bulunamadı");

  const { lessonId, slot: validatedSlot } = confirmMakeupSlot(data, requestId, slot, decision);

  const branch = await prisma.branch.findFirst({
    where: { id: request.branchId, tenantId: tid },
  });
  if (!branch) throw new Error("Şube bulunamadı");

  const decidedAt = new Date();
  const slaDeadline = computeSlaDeadline(decidedAt.toISOString());
  await prisma.$transaction(async (tx) => {
    await assertSlotFreeLockedTx(tx, tid, { teacherId: validatedSlot.teacherId, roomId: validatedSlot.roomId, studentId: request.studentId, startAt: validatedSlot.startAt, endAt: validatedSlot.endAt });
    await tx.lesson.create({
      data: {
        id: lessonId,
        tenantId: tid,
        studentId: request.studentId,
        teacherId: validatedSlot.teacherId,
        roomId: validatedSlot.roomId,
        branchId: validatedSlot.branchId,
        schoolId: branch.schoolId,
        instrument: request.instrument,
        startAt: new Date(validatedSlot.startAt),
        endAt: new Date(validatedSlot.endAt),
        type: "makeup",
        status: "scheduled",
        makeupRequestId: requestId,
        notes: `Telafi · kaynak ders ${request.sourceLessonId}`,
        enrollmentId: data.lessons.find((l) => l.id === request.sourceLessonId)?.enrollmentId,
        // 2026-10-04 — müsaitlik dışı onaylı telafi: normal dersle aynı iz (kim, ne zaman).
        availabilityOverrideBy: validatedSlot.availabilityOverridden ? decision.decidedBy : undefined,
        availabilityOverrideAt: validatedSlot.availabilityOverridden ? decidedAt : undefined,
      },
    });
    // 2026-10-04 — koşullu: talep hâlâ açıksa onaylanır. Aynı talep iki kez (çift tıklama / iki sekme, farklı
    // saatlerle) gönderilirse ikincisi burada durur ve işlem (yazılan ders dahil) geri alınır — mükerrer ders olmaz.
    const claimed = await tx.makeupRequest.updateMany({
      where: { id: requestId, tenantId: tid, status: { in: ["pending", "suggested"] } },
      data: {
        status: "confirmed",
        confirmedLessonId: lessonId,
        decisionNote: decision.decisionNote,
        decidedBy: decision.decidedBy,
        decidedAt,
        slaDeadline: new Date(slaDeadline),
        slaEscalationLevel: 0,
      },
    });
    if (claimed.count === 0) {
      throw new LessonSlotValidationError(
        "REQUEST_NOT_OPEN",
        "Bu telafi talebi az önce başka bir işlemle planlandı veya kapatıldı; ikinci ders yazılmadı. Sayfayı yenileyin."
      );
    }
  });

  return;
}

export async function cancelMakeup(requestId: string, decision: MakeupDecision): Promise<void> {
  logger.info("cancelMakeup", requestId);
  const tid = requireTenantId();
  const updated = await prisma.makeupRequest.updateMany({
    where: { id: requestId, tenantId: tid },
    data: {
      status: "cancelled",
      decisionNote: decision.decisionNote,
      decidedBy: decision.decidedBy,
      decidedAt: new Date(),
    },
  });
  if (updated.count === 0) throw new Error("Telafi talebi bulunamadı");
  return;
}

export async function updateMakeupSlaEscalation(requestId: string, level: number): Promise<void> {
  const tid = requireTenantId();
  const updated = await prisma.makeupRequest.updateMany({
    where: { id: requestId, tenantId: tid },
    data: { slaEscalationLevel: level },
  });
  if (updated.count === 0) throw new Error("Telafi talebi bulunamadı");
  return;
}

/**
 * `addStudent` ve `registerStudent` AYNI satır verisini yazar (tek tanım → alan kaybı/parity farkı olmasın).
 * `student` içindeki girdi-dışı alanlar (ör. `enrollments` dizisi) burada JSON'a güvenle çevrilir.
 */
function studentCreateData(
  student: Omit<Student, "id" | "createdAt" | "active">,
  ids: { tenantId: string; schoolId: string; id: string; displayId: string }
) {
  return {
    ...student,
    enrollments: student.enrollments === undefined ? undefined : (student.enrollments as unknown as Prisma.InputJsonValue),
    // Faz 12 doğrulaması sırasında bulunan kök neden düzeltmesi: salt
    // `Date.now()` tabanlı id, gerçek eşzamanlı isteklerde (ör. Promise.all
    // ile 10 öğrenci) AYNI milisaniyede çakışıp `id` primary key ihlaliyle
    // isteği tamamen reddedebiliyordu — `uid()` (json/memory modda zaten
    // kullanılan, rastgelelik içeren) ile aynı çarpışma-güvenli desene
    // getirildi.
    id: ids.id,
    tenantId: ids.tenantId,
    schoolId: ids.schoolId,
    active: true,
    createdAt: new Date(),
    displayId: ids.displayId,
    instruments: student.instruments,
    // Kök neden düzeltmesi: `...student` spread'i birthDate'i ham
    // "YYYY-MM-DD" olarak geçiriyordu; Prisma DateTime bunu reddettiği için
    // doğum tarihi girilen HER öğrenci kaydı db modunda başarısız oluyordu.
    // (369606b'deki `${v}T00:00:00.000Z` kalıbı tam ISO girdide Invalid Date
    // üretiyordu — geri alındı; burada date-input.ts'in UTC-öğlen kuralı.)
    birthDate: toDateOnlyDbValue(student.birthDate),
    enrollmentStartDate: student.enrollmentStartDate ? new Date(student.enrollmentStartDate) : undefined,
    lessonStartDate: student.lessonStartDate ? new Date(student.lessonStartDate) : undefined,
    // MEB Paneli — date-only UTC-öğlen kuralı (birthDate ile AYNI desen;
    // ham "YYYY-MM-DD" Prisma DateTime'ı kırardı). Genel kayıt/ders
    // tarihlerine DOKUNULMAZ.
    mebLevelStartDate: toDateOnlyDbValue(student.mebLevelStartDate),
    mebLevelEndDate: toDateOnlyDbValue(student.mebLevelEndDate),
    mebExamDate: toDateOnlyDbValue(student.mebExamDate),
    intendedDurationMonths: student.intendedDurationMonths,
    lessonScheduleText: student.lessonScheduleText,
    enrollmentEndDate: student.enrollmentEndDate ? new Date(student.enrollmentEndDate) : undefined,
  };
}

export async function addStudent(
  student: Omit<Student, "id" | "createdAt" | "active">
): Promise<void> {
  // Kişisel veri (ad) Vercel loglarına yazılmaz — yalnız şube bağlamı.
  logger.info("addStudent", student.branchId);
  const tid = requireTenantId();
  const branch = await prisma.branch.findFirst({
    where: { id: student.branchId, tenantId: tid },
  });
  if (!branch) throw new Error("Şube bulunamadı");
  const displayId = formatDisplayId("student", await allocateSequenceValueDb(tid, "student"));
  await prisma.student.create({
    data: studentCreateData(student, { tenantId: tid, schoolId: branch.schoolId, id: uid("stu"), displayId }),
  });
  return;
}

type RegistrationDbClient = { student: Prisma.TransactionClient["student"]; payment: Prisma.TransactionClient["payment"] };

/** Aynı gönderimin (registrationId) daha önce oluşturduğu öğrenci — branş kaydındaki JSON içerme araması. */
async function studentIdByRegistration(client: RegistrationDbClient, tenantId: string, registrationId: string): Promise<string | undefined> {
  const row = await client.student.findFirst({
    where: { tenantId, enrollments: { array_contains: [{ registrationId }] as unknown as Prisma.InputJsonValue } },
    select: { id: true },
  });
  return row?.id;
}

async function registrationPaymentIdMap(client: RegistrationDbClient, tenantId: string, studentId: string): Promise<Record<string, string>> {
  const rows = await client.payment.findMany({
    where: { tenantId, studentId, source: REGISTRATION_FIRST_PAYMENT_SOURCE, enrollmentId: { not: null } },
    select: { id: true, enrollmentId: true },
  });
  const out: Record<string, string> = {};
  for (const r of rows) if (r.enrollmentId) out[r.enrollmentId] = r.id;
  return out;
}

function registrationPaymentCreateData(id: string, tenantId: string, studentId: string, schoolId: string, fp: RegistrationFirstPaymentRecord) {
  return {
    id,
    tenantId,
    studentId,
    schoolId,
    amount: fp.amount,
    paidAmount: fp.amount,
    status: "paid",
    dueDate: new Date(fp.collectedAt),
    paidAt: new Date(fp.collectedAt),
    description: registrationFirstPaymentDescription(fp),
    method: fp.method,
    source: REGISTRATION_FIRST_PAYMENT_SOURCE,
    receivedByUserId: fp.receivedByUserId,
    paymentNote: fp.note,
    autoSuggestedAmount: fp.autoSuggestedAmount,
    firstCollectionIncludesNextMonth: fp.firstCollectionIncludesNextMonth,
    adjustmentReason: fp.adjustmentReason,
    adjustedBy: fp.adjustedBy,
    adjustedAt: fp.adjustedAt ? new Date(fp.adjustedAt) : undefined,
    enrollmentId: fp.enrollmentId,
  };
}

/**
 * 2026-10-10 — YENİ ÖĞRENCİ KAYDI TEK TRANSACTION'DA: öğrenci + tüm branş kayıtları + her branşın ilk tahsilatı.
 * Yarım kayıt/yetim ödeme bırakmaz; aynı `registrationId` (çift tık/yeniden deneme) advisory kilit altında ikinci
 * öğrenci/ödeme yaratmaz. Transaction içinde iş hatası `throw` ile geri alınır (dönen değer COMMIT eder).
 */
export async function registerStudent(input: RegisterStudentInput): Promise<RegisterStudentResult> {
  logger.info("registerStudent", input.student.branchId);
  const tid = requireTenantId();
  const branch = await prisma.branch.findFirst({ where: { id: input.student.branchId, tenantId: tid } });
  if (!branch) throw new Error("Şube bulunamadı");
  if (input.registrationId) {
    const existingId = await studentIdByRegistration(prisma, tid, input.registrationId);
    if (existingId) {
      return { studentId: existingId, duplicate: true, paymentIds: await registrationPaymentIdMap(prisma, tid, existingId) };
    }
  }
  const displayId = formatDisplayId("student", await allocateSequenceValueDb(tid, "student"));
  const studentId = uid("stu");
  return prisma.$transaction(async (tx): Promise<RegisterStudentResult> => {
    if (input.registrationId) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tid}), hashtext(${`reg:${input.registrationId}`}))`;
      const again = await studentIdByRegistration(tx, tid, input.registrationId);
      if (again) return { studentId: again, duplicate: true, paymentIds: await registrationPaymentIdMap(tx, tid, again) };
    }
    await tx.student.create({ data: studentCreateData(input.student, { tenantId: tid, schoolId: branch.schoolId, id: studentId, displayId }) });
    const paymentIds: Record<string, string> = {};
    for (const fp of input.firstPayments) {
      const id = uid("pay");
      await tx.payment.create({ data: registrationPaymentCreateData(id, tid, studentId, branch.schoolId, fp) });
      paymentIds[fp.enrollmentId] = id;
    }
    return { studentId, duplicate: false, paymentIds };
  });
}

/**
 * 2026-10-10 — branş listesinde ATOMİK değişiklik. Öğrenci başına advisory kilit altında TAZE okuma → saf çekirdek
 * (`applyEnrollmentChange`) → yazım: eşzamanlı iki ekleme/düzenleme birbirinin değişikliğini (JSON dizisi) ezmez.
 * Branş koşulu, öğrenci satırı aynası ve (eklemede) ilk tahsilat TEK transaction'dadır. İş reddi yazımdan ÖNCE döner
 * (commit zararsız); yazım başladıktan sonraki her hata fırlatır ve geri alınır.
 */
export async function changeStudentEnrollments(input: ChangeStudentEnrollmentsInput): Promise<ChangeStudentEnrollmentsResult> {
  const tid = requireTenantId();
  return prisma.$transaction(async (tx): Promise<ChangeStudentEnrollmentsResult> => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tid}), hashtext(${`enr:${input.studentId}`}))`;
    const row = await tx.student.findFirst({ where: { id: input.studentId, tenantId: tid } });
    if (!row) return { ok: false, code: "NOT_FOUND", message: "Öğrenci bulunamadı. Sayfayı yenileyip tekrar deneyin." };
    const applied = applyEnrollmentChange(mapDbStudent(row), input.change, input.teachers);
    if (!applied.ok) return applied;
    const patch = mergeStudentPatches(input.person, applied.mirror);
    const updated = await tx.student.updateMany({
      where: { id: input.studentId, tenantId: tid },
      data: { ...studentProfileUpdateData(patch), enrollments: applied.enrollments as unknown as Prisma.InputJsonValue },
    });
    if (updated.count === 0) throw new Error("Öğrenci bulunamadı");
    let paymentId: string | undefined;
    const fp = input.firstPayment;
    if (fp && input.change.kind === "add") {
      const existing = await tx.payment.findFirst({
        where: { tenantId: tid, studentId: input.studentId, source: REGISTRATION_FIRST_PAYMENT_SOURCE, enrollmentId: fp.enrollmentId },
        select: { id: true },
      });
      if (existing) {
        paymentId = existing.id;
      } else {
        paymentId = uid("pay");
        await tx.payment.create({ data: registrationPaymentCreateData(paymentId, tid, input.studentId, row.schoolId, fp) });
      }
    }
    return { ok: true, enrollments: applied.enrollments, changed: applied.changed, ...(paymentId ? { paymentId } : {}) };
  });
}

/** Geri alınabilir öğrenci silme — bkz. store-json.ts aynı adlı fonksiyon. */
export async function setStudentDeletion(studentId: string, state: StudentDeletionState): Promise<void> {
  const tid = requireTenantId();
  const existing = await prisma.student.findFirst({ where: { id: studentId, tenantId: tid }, select: { archivedAt: true } });
  if (!existing) throw new Error("Öğrenci bulunamadı");
  await prisma.student.updateMany({
    where: { id: studentId, tenantId: tid },
    data: state
      ? {
          deletedAt: new Date(state.deletedAt),
          deletedByUserId: state.deletedByUserId,
          deletionReason: state.deletionReason,
          active: false,
          archivedAt: existing.archivedAt ?? new Date(state.deletedAt),
        }
      : { deletedAt: null, deletedByUserId: null, deletionReason: null },
  });
  return;
}

/** Kalıcı silme — yalnız bağlı kaydı olmayan öğrenci (FK ilişkileri boş olmalı). */
export async function hardDeleteStudent(studentId: string): Promise<void> {
  const tid = requireTenantId();
  const counts = await prisma.student.findFirst({
    where: { id: studentId, tenantId: tid },
    select: {
      _count: { select: { payments: true, lessons: true, lessonSeries: true, attendances: true, makeupRequests: true, contracts: true } },
    },
  });
  if (!counts) throw new Error("Öğrenci bulunamadı");
  if (Object.values(counts._count).some((n) => n > 0)) throw new Error("STUDENT_HAS_LINKED_RECORDS");
  await prisma.student.deleteMany({ where: { id: studentId, tenantId: tid } });
  return;
}

const JSON_COLUMNS_TO_CLEAR = new Set<string>(["paymentDueRanges", "appliedCampaignIds", "studentTypes"]);

/** `clearFields` → Prisma verisi: Json kolonları `Prisma.DbNull` ister (düz `null` reddedilir), diğerleri `null`. */
function studentClearData(fields: StudentClearableField[] | undefined): Record<string, null | typeof Prisma.DbNull> {
  return Object.fromEntries((fields ?? []).map((k) => [k, JSON_COLUMNS_TO_CLEAR.has(k) ? Prisma.DbNull : null]));
}

/** `updateStudentProfile` ve `changeStudentEnrollments` AYNI yazım eşlemesini kullanır (tek tanım → parity). */
function studentProfileUpdateData(patch: StudentProfilePatch) {
  return {
      // Bu turda eklendi — kayıt kimliği/eğitim profili alanları (öğretmen/
      // enstrüman MT-003 kararı gereği bilinçli olarak burada YOK).
      name: patch.name,
      email: patch.email,
      branchId: patch.branchId,
      // Toplu işlem (E) — sunucu öğretmen/enstrüman uyumunu doğruladıktan sonra yazar.
      teacherId: patch.teacherId,
      instruments: patch.instruments,
      educationMethod: patch.educationMethod,
      studentType: patch.studentType,
      studentTypes: patch.studentTypes,
      enrollmentStartDate: patch.enrollmentStartDate ? new Date(patch.enrollmentStartDate) : undefined,
      lessonStartDate: patch.lessonStartDate ? new Date(patch.lessonStartDate) : undefined,
      intendedDurationMonths: patch.intendedDurationMonths,
      lessonScheduleText: patch.lessonScheduleText,
      enrollmentEndDate: patch.enrollmentEndDate ? new Date(patch.enrollmentEndDate) : undefined,
      level: patch.level,
      targetExam: patch.targetExam,
      // MEB Paneli — allowlist'e eklenmezse bu alanlar db modunda sessizce
      // kaybolurdu (önceki parity açıklarıyla AYNI sınıf). Tarihler UTC-öğlen.
      mebLevelStartDate: toDateOnlyDbValue(patch.mebLevelStartDate),
      mebLevelEndDate: toDateOnlyDbValue(patch.mebLevelEndDate),
      mebExamDate: toDateOnlyDbValue(patch.mebExamDate),
      mebExamAttended: patch.mebExamAttended,
      specialNotes: patch.specialNotes,
      communicationOptOut: patch.communicationOptOut,
      termType: patch.termType,
      packageId: patch.packageId,
      birthPlace: patch.birthPlace,
      schoolOrOccupation: patch.schoolOrOccupation,
      // Bu turda eklendi — iletişim/kişisel alanlar (StudentProfilePatch'te
      // zaten vardı ama db-mode yazma yolu yoktu; T.C. kimlik ayrı
      // setNationalIdTool'dan, burada değil).
      phone: patch.phone,
      parentName: patch.parentName,
      parentPhone: patch.parentPhone,
      motherName: patch.motherName,
      fatherName: patch.fatherName,
      // P1 revizyonu — "Bizi nereden buldunuz?" (migration dosyası eklendi,
      // henüz hiçbir DB'ye uygulanmadı — bkz. PROJECT_STATE).
      referralSource: patch.referralSource,
      referralSourceDetail: patch.referralSourceDetail,
      address: patch.address,
      birthDate: toDateOnlyDbValue(patch.birthDate),
      // Package C / Paket Yönetimi — ödeme profili + paket fiyatlandırma
      // alanları. Bu mapping öncesinde lessonDurationMinutes/paymentMethod/
      // paymentAmount/paymentDueDay hiçbir DB-mode yazma yoluna sahip
      // değildi (JSON/memory store generic spread ile zaten destekliyordu)
      // — burada eklenerek parity kapatıldı.
      lessonDurationMinutes: patch.lessonDurationMinutes,
      enrollments: patch.enrollments === undefined ? undefined : (patch.enrollments as unknown as Prisma.InputJsonValue),
      paymentMethod: patch.paymentMethod,
      paymentAmount: patch.paymentAmount,
      paymentDueDay: patch.paymentDueDay,
      paymentDueRanges: patch.paymentDueRanges,
      monthlyFee: patch.monthlyFee,
      packageBaseMonthlyFee: patch.packageBaseMonthlyFee,
      discountType: patch.discountType,
      discountValue: patch.discountValue,
      monthlyFeeManualOverride: patch.monthlyFeeManualOverride,
      monthlyFeeOverrideReason: patch.monthlyFeeOverrideReason,
      accountResponsibility: patch.accountResponsibility,
      // 2026-10-09 — branş formu (ilk branşın koşulları öğrenci satırında).
      packageName: patch.packageName,
      weeklyLessonCount: patch.weeklyLessonCount,
      derivedPerLessonAmount: patch.derivedPerLessonAmount,
      appliedCampaignIds: patch.appliedCampaignIds === undefined ? undefined : (patch.appliedCampaignIds as unknown as Prisma.InputJsonValue),
      ...studentClearData(patch.clearFields),
      // 2026-09-17 — archiveStudentTool/setNationalIdTool bu alanları
      // gönderiyordu ama db modunda hiç yazılmıyordu: "Pasife Al" başarılı
      // dönüp öğrenci aktif kalıyordu (sessiz no-op). Aktifleştirmede
      // archivedAt undefined gelir → active verildiyse null'a çekilir.
      active: patch.active,
      archivedAt:
        patch.archivedAt !== undefined
          ? new Date(patch.archivedAt)
          : patch.active !== undefined
            ? null
            : undefined,
      firstLessonAt: patch.firstLessonAt ? new Date(patch.firstLessonAt) : undefined,
      nationalIdCipher: patch.nationalIdCipher,
      nationalIdLast2: patch.nationalIdLast2,
  };
}

export async function updateStudentProfile(
  studentId: string,
  patch: StudentProfilePatch
): Promise<void> {
  logger.info("updateStudentProfile", studentId);
  const tid = requireTenantId();
  const result = await prisma.student.updateMany({
    where: { id: studentId, tenantId: tid },
    data: studentProfileUpdateData(patch),
  });
  if (result.count === 0) throw new Error("Öğrenci bulunamadı");
  return;
}

/**
 * MEB Paneli listesi (db yolu) — GERÇEK sunucu-taraflı sayfalama
 * (`where` + `count` + `skip/take`; istemciye yalnız sayfa gider).
 * MEB'lik `effectiveStudentTypes` ile BİREBİR aynı semantik: tür LİSTESİ
 * doluysa liste, boş/null ise legacy tekil alan (bkz. student-types.ts).
 * Silinmiş kayıtlar dışlanır; bilinmeyen tarihler HER YÖNDE sona atılır
 * (`nulls: "last"` — memory yoluyla AYNI kural).
 */
export async function listMebStudents(query: MebStudentQuery): Promise<MebStudentListResult> {
  const { applyMebRowQuery, mebRowsForStudent } = await import("./meb-list");
  const tid = requireTenantId();

  // 2026-10-10 — MEB bilgisi branş kaydına aittir: ADAY öğrenciler (mirror türü ya da aktif MEB branşı olanlar) çekilir;
  // satırlara açma + branş düzeyi filtre/sıralama/sayfalama json/memory ile AYNI saf fonksiyondan geçer (mod paritesi).
  // Aday kümesi yalnız MEB'li öğrencilerdir (küçük); sonlandırılmış MEB branşı olan ama şu an hiç MEB'siz öğrenci pasif
  // geçmiş sayılır ve bu listede aranmaz (önceki davranışla aynı).
  const where: Prisma.StudentWhereInput = {
    tenantId: tid,
    deletedAt: null,
    OR: [
      { studentTypes: { array_contains: "MEB" } },
      { studentType: "MEB", studentTypes: { equals: Prisma.DbNull } },
      { studentType: "MEB", studentTypes: { equals: [] as unknown as Prisma.InputJsonValue } },
      { enrollments: { array_contains: [{ studentTypes: ["MEB"] }] as unknown as Prisma.InputJsonValue } },
    ],
  };
  const found = await prisma.student.findMany({ where });
  const students = found.map(mapDbStudent);
  return applyMebRowQuery(students.flatMap((s) => mebRowsForStudent(s)), query);
}

/** Nilüfer Acar politikası §1E — bkz. store-json.ts aynı adlı fonksiyon; `state=null` reaktivasyonda alanları null'lar. */
export async function setStudentPaymentPause(studentId: string, state: StudentPaymentPauseState): Promise<void> {
  logger.info("setStudentPaymentPause", studentId);
  const tid = requireTenantId();
  const result = await prisma.student.updateMany({
    where: { id: studentId, tenantId: tid },
    data: {
      paymentPauseStatus: state ? "paused" : null,
      paymentPausedAt: state ? new Date(state.pausedAt) : null,
      paymentPauseReason: state ? state.reason : null,
      paymentPausedBy: state ? state.pausedBy : null,
    },
  });
  if (result.count === 0) throw new Error("Öğrenci bulunamadı");
  return;
}

export async function addTeacher(
  teacher: Omit<Teacher, "id" | "active" | "color">
): Promise<void> {
  logger.info("addTeacher", teacher.branchId);
  const tid = requireTenantId();
  const branch = await prisma.branch.findFirst({
    where: { id: teacher.branchId, tenantId: tid },
  });
  if (!branch) throw new Error("Şube bulunamadı");
  const colors = ["#7c3aed", "#0891b2", "#db2777", "#ea580c", "#059669", "#4f46e5"];
  const displayId = formatDisplayId("teacher", await allocateSequenceValueDb(tid, "teacher"));
  // Paket 7 — kayıt anında da girilebilen tarih alanları: `...teacher` blind
  // spread bunları HAM ISO STRING olarak geçirirdi (Prisma DateTime kolonu
  // bir Date nesnesi bekler, updateTeacherProfile'daki AYNI dönüşüm kuralı
  // burada da uygulanır) — aksi halde runtime hata verirdi.
  await prisma.teacher.create({
    data: {
      ...teacher,
      // Faz 12 doğrulaması — bkz. addStudent'taki aynı kök neden düzeltmesi.
      id: uid("tch"),
      tenantId: tid,
      schoolId: branch.schoolId,
      active: true,
      displayId,
      color: colors[Math.floor(Math.random() * colors.length)],
      instruments: teacher.instruments,
      instrumentLevels: teacher.instrumentLevels ?? undefined,
      availability: teacher.availability,
      birthDate: teacher.birthDate ? new Date(teacher.birthDate) : undefined,
      contractStartDate: teacher.contractStartDate ? new Date(teacher.contractStartDate) : undefined,
      contractEndDate: teacher.contractEndDate ? new Date(teacher.contractEndDate) : undefined,
      hireDate: teacher.hireDate ? new Date(teacher.hireDate) : undefined,
    },
  });
  return;
}

/**
 * EPIC 9 (IMPLEMENTATION_PLAN.md) — yalnızca onaylanmış bir
 * TeacherAvailabilityRequest uygulanırken çağrılır; doğrudan bir yazma
 * yolu değildir (bkz. reviewTeacherAvailabilityRequestTool).
 */
export async function updateTeacherAvailability(
  teacherId: string,
  availability: Teacher["availability"]
): Promise<Teacher | null> {
  logger.info("updateTeacherAvailability", teacherId);
  const tid = requireTenantId();
  const result = await prisma.teacher.updateMany({
    where: { id: teacherId, tenantId: tid },
    data: { availability: availability === undefined ? undefined : (availability as unknown as Prisma.InputJsonValue) },
  });
  if (result.count === 0) return null;
  const data = await readData();
  return data.teachers.find((t) => t.id === teacherId) ?? null;
}

/** ÖNCELİK 4 (devam) — çoklu enstrüman+seviye düzenleme (öğretmen detayı). */
export async function updateTeacherInstruments(
  teacherId: string,
  instruments: Teacher["instruments"],
  instrumentLevels: Teacher["instrumentLevels"]
): Promise<Teacher | null> {
  logger.info("updateTeacherInstruments", teacherId);
  const tid = requireTenantId();
  const result = await prisma.teacher.updateMany({
    where: { id: teacherId, tenantId: tid },
    data: {
      instruments: instruments as unknown as Prisma.InputJsonValue,
      instrumentLevels:
        instrumentLevels === undefined
          ? undefined
          : instrumentLevels === null
          ? Prisma.JsonNull
          : (instrumentLevels as unknown as Prisma.InputJsonValue),
    },
  });
  if (result.count === 0) return null;
  const data = await readData();
  return data.teachers.find((t) => t.id === teacherId) ?? null;
}

/** Package D — özlük/idari alanlar + ek şube ataması. `updateStudentProfile` ile aynı desen. */
export async function updateTeacherProfile(
  teacherId: string,
  patch: TeacherProfilePatch
): Promise<Teacher | null> {
  logger.info("updateTeacherProfile", teacherId);
  const tid = requireTenantId();
  const result = await prisma.teacher.updateMany({
    where: { id: teacherId, tenantId: tid },
    data: {
      // Bu turda eklendi — kayıt kimliği alanları (enstrüman/müsaitlik/ders
      // ücreti kasıtlı olarak burada YOK, kendi özel araçları var).
      name: patch.name,
      email: patch.email,
      phone: patch.phone,
      branchId: patch.branchId,
      nationalIdCipher: patch.nationalIdCipher,
      nationalIdLast2: patch.nationalIdLast2,
      birthDate: toDateOnlyDbValue(patch.birthDate),
      address: patch.address,
      highSchool: patch.highSchool,
      university: patch.university,
      graduationYear: patch.graduationYear,
      maxDailyLessons: patch.maxDailyLessons,
      weeklyHoursThreshold: patch.weeklyHoursThreshold,
      branchIds:
        patch.branchIds !== undefined
          ? patch.branchIds === null
            ? Prisma.JsonNull
            : (patch.branchIds as unknown as Prisma.InputJsonValue)
          : undefined,
      contractStartDate: patch.contractStartDate ? new Date(patch.contractStartDate) : undefined,
      contractEndDate: patch.contractEndDate ? new Date(patch.contractEndDate) : undefined,
      employmentType: patch.employmentType,
      hireDate: patch.hireDate ? new Date(patch.hireDate) : undefined,
      terminationDate: patch.terminationDate ? new Date(patch.terminationDate) : undefined,
      emergencyContactName: patch.emergencyContactName,
      emergencyContactPhone: patch.emergencyContactPhone,
      personnelNotes: patch.personnelNotes,
    },
  });
  if (result.count === 0) return null;
  const data = await readData();
  return data.teachers.find((t) => t.id === teacherId) ?? null;
}

export type MarkPaymentPaidOptions = {
  method?: string;
  /** Yönetici tarafından elle girilen tahsil edilen tutar — verilmezse ödemenin tam tutarı kullanılır. */
  amount?: number;
  /** ISO tarih — verilmezse şimdi. */
  paidAt?: string;
  paymentNote?: string;
  /** Tahsilatı alan kullanıcı — bkz. Payment.receivedByUserId yorumu (schema.prisma). */
  receivedByUserId?: string;
};

export async function markPaymentPaid(paymentId: string, opts?: string | MarkPaymentPaidOptions): Promise<AppData> {
  logger.info("markPaymentPaid", paymentId);
  const normalized: MarkPaymentPaidOptions = typeof opts === "string" ? { method: opts } : opts ?? {};
  const { collectPayment } = await import("./payments/collect");
  await collectPayment(paymentId, normalized);
  return readData();
}

/**
 * 2026-10-03 — yanlışlıkla oluşturulmuş BAĞIMSIZ ödeme satırını kaldırır (sözleşme taksidi asla). Tahsilat takip
 * kaydı veya online ödeme denemesi olan satır silinmez (iptal edilir) — FK cascade ile takip geçmişi gitmesin.
 */
export async function deletePaymentRow(paymentId: string): Promise<AppData> {
  const tid = requireTenantId();
  await prisma.$transaction(async (tx) => {
    const row = await tx.payment.findFirst({
      where: { id: paymentId, tenantId: tid },
      select: { contractId: true, _count: { select: { followUps: true } } },
    });
    if (!row) throw new Error("Ödeme bulunamadı");
    if (row.contractId) throw new Error("PAYMENT_IS_CONTRACT_INSTALLMENT");
    const attempts = await tx.paymentCheckoutAttempt.count({ where: { tenantId: tid, paymentId } });
    if (row._count.followUps > 0 || attempts > 0) throw new Error("PAYMENT_HAS_HISTORY");
    await tx.payment.deleteMany({ where: { id: paymentId, tenantId: tid } });
  });
  return readData();
}

export type UpdatePaymentPatch = {
  method?: string;
  paidAmount?: number;
  paymentNote?: string;
  paidAt?: string;
};

/** Zaten "paid" bir ödemenin yöntem/tutar/not/tahsilat-anı alanlarını düzenler. */
export async function updatePayment(paymentId: string, patch: UpdatePaymentPatch): Promise<AppData> {
  const tid = requireTenantId();
  const payment = await prisma.payment.findFirst({ where: { id: paymentId, tenantId: tid } });
  if (!payment) throw new Error("Ödeme bulunamadı");

  await prisma.payment.updateMany({
    where: { id: paymentId, tenantId: tid },
    data: {
      ...(patch.method !== undefined ? { method: patch.method } : {}),
      ...(patch.paidAmount !== undefined ? { paidAmount: patch.paidAmount } : {}),
      ...(patch.paymentNote !== undefined ? { paymentNote: patch.paymentNote } : {}),
      ...(patch.paidAt !== undefined ? { paidAt: new Date(patch.paidAt) } : {}),
    },
  });

  return readData();
}

export async function addBranch(branch: {
  name: string;
  shortName: string;
  address: string;
  phone: string;
  city: string;
}): Promise<void> {
  logger.info("addBranch", branch.name);
  const tid = requireTenantId();
  const school = await prisma.school.findFirst({ where: { tenantId: tid }, select: { id: true } });
  if (!school) throw new Error("Okul bulunamadı");
  await prisma.branch.create({
    data: {
      id: `branch_${Date.now().toString(36)}`,
      tenantId: tid,
      schoolId: school.id,
      name: branch.name,
      shortName: branch.shortName,
      address: branch.address,
      phone: branch.phone,
      city: branch.city,
    },
  });
  return;
}

export async function updateBranch(
  branchId: string,
  patch: Partial<{ name: string; shortName: string; address: string; phone: string; city: string }>
): Promise<void> {
  logger.info("updateBranch", branchId);
  const tid = requireTenantId();
  const result = await prisma.branch.updateMany({
    where: { id: branchId, tenantId: tid },
    data: patch,
  });
  if (result.count === 0) throw new Error("Şube bulunamadı");
  return;
}

/**
 * Dört import fonksiyonu da tüm satırları TEK bir `$transaction` içinde
 * işler — kısmi bir hata durumunda hiçbir satır kalıcı olmaz. Şema
 * değişikliği gerektirmeyen manuel upsert: benzersiz kısıt olmadığı için
 * Prisma'nın `upsert()`'ü kullanılamıyor, bunun yerine `findFirst` + `update`
 * ya da `create` uygulanır. Eşitlik karşılaştırmaları MySQL'in varsayılan
 * (case-insensitive) collation'ına güvenir — Postgres'e özgü `mode:
 * "insensitive"` seçeneği bu MySQL şemasında mevcut değildir.
 */
export async function importBranches(rows: BranchImportRow[]): Promise<ImportCommitResult> {
  logger.info("importBranches", rows.length);
  const tid = requireTenantId();
  const school = await prisma.school.findFirst({ where: { tenantId: tid }, select: { id: true } });
  if (!school) throw new Error("Okul bulunamadı");

  let created = 0;
  let updated = 0;
  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const existing = await tx.branch.findFirst({
        where: { tenantId: tid, shortName: row.shortName },
      });
      if (existing) {
        await tx.branch.update({
          where: { id: existing.id },
          data: { name: row.name, shortName: row.shortName, address: row.address, phone: row.phone, city: row.city },
        });
        updated++;
      } else {
        await tx.branch.create({
          data: {
            id: uid("branch"),
            tenantId: tid,
            schoolId: school.id,
            name: row.name,
            shortName: row.shortName,
            address: row.address,
            phone: row.phone,
            city: row.city,
          },
        });
        created++;
      }
    }
  });

  return { data: await readData(), created, updated };
}

export async function importTeachers(rows: TeacherImportRow[]): Promise<ImportCommitResult> {
  logger.info("importTeachers", rows.length);
  const tid = requireTenantId();

  let created = 0;
  let updated = 0;
  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const branch = await tx.branch.findFirst({ where: { id: row.branchId, tenantId: tid } });
      if (!branch) throw new Error(`Şube bulunamadı: ${row.branchId}`);

      const existing = await tx.teacher.findFirst({
        where: { tenantId: tid, email: row.email },
      });
      // ÖNCELİK 4 (devam) — çoklu enstrüman: instrumentLevels verilmişse
      // instruments listesi bundan türetilir (benzersiz), yoksa legacy
      // tek-enstrüman davranışı ([row.instrument]) korunur.
      const instruments = row.instrumentLevels?.length
        ? Array.from(new Set(row.instrumentLevels.map((r) => r.instrument)))
        : [row.instrument];

      if (existing) {
        await tx.teacher.update({
          where: { id: existing.id },
          data: {
            name: row.name,
            phone: row.phone,
            branchId: row.branchId,
            instruments,
                instrumentLevels:
                  row.instrumentLevels === undefined
                    ? undefined
                    : row.instrumentLevels === null
                    ? Prisma.JsonNull
                    : (row.instrumentLevels as unknown as Prisma.InputJsonValue),
            highSchool: row.highSchool,
            university: row.university,
            graduationYear: row.graduationYear,
            contractStartDate: row.contractStartDate ? new Date(row.contractStartDate) : undefined,
            contractEndDate: row.contractEndDate ? new Date(row.contractEndDate) : undefined,
          },
        });
        updated++;
      } else {
        await tx.teacher.create({
          data: {
            id: uid("tch"),
            tenantId: tid,
            schoolId: branch.schoolId,
            name: row.name,
            email: row.email,
            phone: row.phone,
            branchId: row.branchId,
            instruments,
            instrumentLevels:
              row.instrumentLevels === undefined
                ? undefined
                : row.instrumentLevels === null
                ? Prisma.JsonNull
                : (row.instrumentLevels as unknown as Prisma.InputJsonValue),
            availability: [
              { dayOfWeek: 1, start: "10:00", end: "18:00" },
              { dayOfWeek: 2, start: "10:00", end: "18:00" },
              { dayOfWeek: 3, start: "10:00", end: "18:00" },
              { dayOfWeek: 4, start: "10:00", end: "18:00" },
              { dayOfWeek: 5, start: "10:00", end: "16:00" },
            ],
            maxDailyLessons: 8,
            active: true,
            color: "#7c3aed",
            highSchool: row.highSchool,
            university: row.university,
            graduationYear: row.graduationYear,
            contractStartDate: row.contractStartDate ? new Date(row.contractStartDate) : undefined,
            contractEndDate: row.contractEndDate ? new Date(row.contractEndDate) : undefined,
          },
        });
        created++;
      }
    }
  });

  return { data: await readData(), created, updated };
}

export async function importRooms(rows: RoomImportRow[]): Promise<ImportCommitResult> {
  logger.info("importRooms", rows.length);
  const tid = requireTenantId();

  let created = 0;
  let updated = 0;
  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const branch = await tx.branch.findFirst({ where: { id: row.branchId, tenantId: tid } });
      if (!branch) throw new Error(`Şube bulunamadı: ${row.branchId}`);

      const existing = await tx.room.findFirst({
        where: { tenantId: tid, branchId: row.branchId, name: row.name },
      });
      if (existing) {
        await tx.room.update({
          where: { id: existing.id },
          data: { capacity: row.capacity, instruments: row.instruments },
        });
        updated++;
      } else {
        await tx.room.create({
          data: {
            id: uid("room"),
            tenantId: tid,
            schoolId: branch.schoolId,
            name: row.name,
            branchId: row.branchId,
            capacity: row.capacity,
            instruments: row.instruments,
          },
        });
        created++;
      }
    }
  });

  return { data: await readData(), created, updated };
}

export async function importStudents(rows: StudentImportRow[]): Promise<ImportCommitResult> {
  logger.info("importStudents", rows.length);
  const tid = requireTenantId();

  let created = 0;
  let updated = 0;
  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const branch = await tx.branch.findFirst({ where: { id: row.branchId, tenantId: tid } });
      if (!branch) throw new Error(`Şube bulunamadı: ${row.branchId}`);
      const teacher = await tx.teacher.findFirst({ where: { id: row.teacherId, tenantId: tid } });
      if (!teacher) throw new Error(`Öğretmen bulunamadı: ${row.teacherId}`);

      const existing = await tx.student.findFirst({
        where: { tenantId: tid, phone: row.phone.trim() },
      });
      if (existing) {
        // 2026-10-10 — kalıcı BRANŞ KAYDI olan öğrencide branşa özgü koşullar kayıtlarda durur; CSV satırı onları ezmez
        // (bkz. import/student-merge.ts — json/memory ile aynı kural).
        const hasPersistedEnrollments = Array.isArray(existing.enrollments) && (existing.enrollments as unknown[]).length > 0;
        await tx.student.update({
          where: { id: existing.id },
          data: {
            name: row.name,
            email: row.email || existing.email,
            parentName: row.parentName,
            parentPhone: row.parentPhone,
            branchId: row.branchId,
            notes: row.notes || existing.notes,
            birthDate: toDateOnlyDbValue(row.birthDate) ?? existing.birthDate,
            birthPlace: row.birthPlace ?? existing.birthPlace,
            schoolOrOccupation: row.schoolOrOccupation ?? existing.schoolOrOccupation,
            address: row.address ?? existing.address,
            nationalIdCipher: row.nationalIdCipher ?? existing.nationalIdCipher,
            nationalIdLast2: row.nationalIdLast2 ?? existing.nationalIdLast2,
            accountResponsibility: existing.accountResponsibility ?? row.accountResponsibility,
            displayId: existing.displayId ?? formatDisplayId("student", await allocateSequenceValueDb(tid, "student")),
            ...(hasPersistedEnrollments
              ? {}
              : {
                  instruments: [row.instrument],
                  teacherId: row.teacherId,
                  packageName: row.packageName,
                  weeklyLessonCount: row.weeklyLessonCount,
                  monthlyFee: row.monthlyFee,
                  lessonDurationMinutes: row.lessonDurationMinutes ?? existing.lessonDurationMinutes,
                  enrollmentStartDate: row.enrollmentStartDate ? new Date(row.enrollmentStartDate) : existing.enrollmentStartDate,
                  derivedPerLessonAmount: row.derivedPerLessonAmount ?? existing.derivedPerLessonAmount,
                }),
          },
        });
        updated++;
      } else {
        await tx.student.create({
          data: {
            id: uid("stu"),
            tenantId: tid,
            schoolId: branch.schoolId,
            name: row.name,
            email: row.email,
            phone: row.phone,
            parentName: row.parentName,
            parentPhone: row.parentPhone,
            branchId: row.branchId,
            instruments: [row.instrument],
            teacherId: row.teacherId,
            packageName: row.packageName,
            weeklyLessonCount: row.weeklyLessonCount,
            monthlyFee: row.monthlyFee,
            active: true,
            notes: row.notes,
            createdAt: new Date(),
            lessonDurationMinutes: row.lessonDurationMinutes,
            birthDate: toDateOnlyDbValue(row.birthDate),
            birthPlace: row.birthPlace,
            schoolOrOccupation: row.schoolOrOccupation,
            address: row.address,
            nationalIdCipher: row.nationalIdCipher,
            nationalIdLast2: row.nationalIdLast2,
            enrollmentStartDate: row.enrollmentStartDate ? new Date(row.enrollmentStartDate) : undefined,
            // Normal kayıtla aynı sözleşmeye hazır alanlar (bkz. withContractReadyFields).
            derivedPerLessonAmount: row.derivedPerLessonAmount,
            accountResponsibility: row.accountResponsibility,
            monthlyFeeManualOverride: false,
            createdByUserId: row.createdByUserId,
            displayId: formatDisplayId("student", await allocateSequenceValueDb(tid, "student")),
          },
        });
        created++;
      }
    }
  });

  return { data: await readData(), created, updated };
}

export async function addRoom(room: Omit<Room, "id">): Promise<void> {
  logger.info("addRoom", room.name);
  const tid = requireTenantId();
  const branch = await prisma.branch.findFirst({
    where: { id: room.branchId, tenantId: tid },
  });
  if (!branch) throw new Error("Şube bulunamadı");
  await prisma.room.create({
    data: {
      id: `room_${Date.now().toString(36)}`,
      tenantId: tid,
      schoolId: branch.schoolId,
      name: room.name,
      branchId: room.branchId,
      capacity: room.capacity,
      instruments: room.instruments,
    },
  });
  return;
}

/** ÖNCELİK 4 (devam) — oda düzenleme (ad/kapasite/şube/enstrüman/aktiflik). */
export async function updateRoom(
  roomId: string,
  patch: Partial<Pick<Room, "name" | "capacity" | "branchId" | "instruments" | "active" | "archivedAt" | "deletedAt">>
): Promise<Room | null> {
  logger.info("updateRoom", roomId);
  const tid = requireTenantId();
  const result = await prisma.room.updateMany({
    where: { id: roomId, tenantId: tid },
      data: {
      name: patch.name,
      capacity: patch.capacity,
      branchId: patch.branchId,
      instruments:
        patch.instruments === undefined
          ? undefined
          : patch.instruments === null
          ? Prisma.JsonNull
          : (patch.instruments as unknown as Prisma.InputJsonValue),
      active: patch.active,
      archivedAt: patch.archivedAt ? new Date(patch.archivedAt) : patch.archivedAt === undefined ? undefined : null,
      deletedAt: patch.deletedAt ? new Date(patch.deletedAt) : undefined,
    },
  });
  if (result.count === 0) return null;
  const data = await readData();
  return data.rooms.find((r) => r.id === roomId) ?? null;
}

/** ÖNCELİK 4 (devam) — öğretmen arşivleme/geri alma (hard delete YOK). */
export async function archiveTeacher(teacherId: string, archived: boolean): Promise<Teacher | null> {
  logger.info("archiveTeacher", teacherId, archived);
  const tid = requireTenantId();
  const result = await prisma.teacher.updateMany({
    where: { id: teacherId, tenantId: tid },
    data: { active: !archived, archivedAt: archived ? new Date() : null },
  });
  if (result.count === 0) return null;
  const data = await readData();
  return data.teachers.find((t) => t.id === teacherId) ?? null;
}

/** 2026-10-03 — öğretmeni listeden kaldırma (geri alınabilir); kaldırmada pasife alınır. `null` = geri al. */
export async function setTeacherDeletion(teacherId: string, state: TeacherDeletionState): Promise<void> {
  const tid = requireTenantId();
  const existing = await prisma.teacher.findFirst({ where: { id: teacherId, tenantId: tid }, select: { archivedAt: true } });
  if (!existing) throw new Error("Öğretmen bulunamadı");
  await prisma.teacher.updateMany({
    where: { id: teacherId, tenantId: tid },
    data: state
      ? {
          deletedAt: new Date(state.deletedAt),
          deletedByUserId: state.deletedByUserId,
          deletionReason: state.deletionReason,
          active: false,
          archivedAt: existing.archivedAt ?? new Date(state.deletedAt),
        }
      : { deletedAt: null, deletedByUserId: null, deletionReason: null },
  });
}

/** Kalıcı silme — yalnız hiçbir bağlı kaydı olmayan öğretmen (FK ilişkileri boş olmalı). */
export async function hardDeleteTeacher(teacherId: string): Promise<void> {
  const tid = requireTenantId();
  const row = await prisma.teacher.findFirst({
    where: { id: teacherId, tenantId: tid },
    select: {
      _count: { select: { students: true, lessons: true, lessonSeries: true, makeupRequests: true, teacherFeeRules: true, teacherPayouts: true } },
    },
  });
  if (!row) throw new Error("Öğretmen bulunamadı");
  if (Object.values(row._count).some((n) => n > 0)) throw new Error("TEACHER_HAS_LINKED_RECORDS");
  // 2026-10-10 — branş kaydında (JSON) öğretmen olarak geçen kişi de "bağlı kayıt"tır (geçmişte kalan sonlandırılmış branş dahil).
  const viaEnrollment = await prisma.student.count({
    where: { tenantId: tid, enrollments: { array_contains: [{ teacherId }] as unknown as Prisma.InputJsonValue } },
  });
  if (viaEnrollment > 0) throw new Error("TEACHER_HAS_LINKED_RECORDS");
  await prisma.teacher.deleteMany({ where: { id: teacherId, tenantId: tid } });
}

const SLOT_CONFLICT_CODE: Record<SlotResource, "TEACHER_CONFLICT" | "ROOM_CONFLICT" | "STUDENT_CONFLICT"> = {
  teacher: "TEACHER_CONFLICT",
  room: "ROOM_CONFLICT",
  student: "STUDENT_CONFLICT",
};

/**
 * 2026-10-03 — eşzamanlı iki yazım (iki sekme/iki yönetici) aynı boş saati anlık görüntüde "boş" görüp
 * ikisi de ders yazabiliyordu (çift rezervasyon). Kurum içi ders-saati yazımları advisory kilitle
 * sıralanır; kilit altında DB'deki güncel derslerle merkezi kural (`findSlotConflict`) yeniden uygulanır.
 * ponytail: kurum geneli tek kilit — yoğunluk artarsa öğretmen/oda anahtarlı kilide geçin.
 */
async function assertSlotFreeLockedTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  candidate: { teacherId: string; roomId: string; studentId: string; startAt: string; endAt: string }
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext('lesson-slot'))`;
  const rows = await tx.lesson.findMany({
    where: {
      tenantId,
      status: { not: "cancelled" },
      startAt: { lt: new Date(candidate.endAt) },
      endAt: { gt: new Date(candidate.startAt) },
      OR: [{ teacherId: candidate.teacherId }, { roomId: candidate.roomId }, { studentId: candidate.studentId }],
    },
    select: {
      id: true,
      teacherId: true,
      roomId: true,
      studentId: true,
      startAt: true,
      endAt: true,
      status: true,
      opsMakeupFlag: true,
      lessonProcessed: true,
      lessonProcessedReason: true,
      studentAttended: true,
      actualStartAt: true,
    },
  });
  const conflict = findSlotConflict(
    rows.map((r) => ({
      ...r,
      startAt: r.startAt.toISOString(),
      endAt: r.endAt.toISOString(),
      status: r.status as Lesson["status"],
      lessonProcessedReason: r.lessonProcessedReason ?? undefined,
      actualStartAt: r.actualStartAt?.toISOString(),
    })),
    candidate
  );
  if (conflict) {
    throw new LessonSlotValidationError(
      SLOT_CONFLICT_CODE[conflict.resource],
      "Bu saat az önce başka bir derse verildi (aynı anda iki kayıt yapıldı). Ders oluşturulmadı; sayfayı yenileyip başka bir saat seçin."
    );
  }
}

/**
 * 2026-10-06 — kulüp oturumu satırlarını TOPLU yazar (üye başına bir satır). Çakışma kontrolü çağıranda
 * (clubs.ts, merkezi `findSlotConflict`) yapılmıştır; burada yalnız tek işlemde yazım.
 */
export async function addClubSessionLessons(rows: import("./types").Lesson[]): Promise<void> {
  const tid = requireTenantId();
  if (rows.length === 0) return;
  const school = await prisma.school.findFirst({ where: { tenantId: tid }, select: { id: true } });
  if (!school) throw new Error("Okul kaydı bulunamadı");
  await prisma.lesson.createMany({
    data: rows.map((l) => ({
      id: l.id,
      tenantId: tid,
      schoolId: school.id,
      studentId: l.studentId,
      teacherId: l.teacherId,
      roomId: l.roomId,
      branchId: l.branchId,
      instrument: l.instrument,
      startAt: new Date(l.startAt),
      endAt: new Date(l.endAt),
      type: l.type,
      status: l.status,
      clubId: l.clubId ?? null,
      clubSessionId: l.clubSessionId ?? null,
      notes: l.notes ?? null,
      createdByUserId: l.createdByUserId ?? null,
      term: l.term ?? null,
      academicYearStart: l.academicYearStart ?? null,
    })),
  });
}

/** 2026-10-06 — kulüp satırlarına (yalnız `type: "group"`) sınırlı yama: durum, telafi bayrağı, öğretmen yoklaması, not. */
export async function patchClubLessons(ids: string[], patch: import("./clubs").ClubLessonPatch): Promise<number> {
  const tid = requireTenantId();
  if (ids.length === 0) return 0;
  const toDate = (v: string | undefined) => (v ? new Date(v) : undefined);
  const res = await prisma.lesson.updateMany({
    where: { tenantId: tid, id: { in: ids }, type: "group" },
    data: {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.opsMakeupFlag !== undefined
        ? { opsMakeupFlag: patch.opsMakeupFlag, opsMakeupFlagAt: toDate(patch.opsMakeupFlagAt) ?? null, opsMakeupFlagBy: patch.opsMakeupFlagBy ?? null }
        : {}),
      ...(patch.teacherAttendanceStatus !== undefined
        ? {
            teacherAttendanceStatus: patch.teacherAttendanceStatus,
            teacherAttendanceAt: toDate(patch.teacherAttendanceAt) ?? null,
            teacherAttendanceBy: patch.teacherAttendanceBy ?? null,
          }
        : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      // 2026-10-07 — yoklamasız oturumun tarih/oda/öğretmen düzeltmesi (rescheduleClubSessionTool).
      ...(patch.startAt ? { startAt: new Date(patch.startAt) } : {}),
      ...(patch.endAt ? { endAt: new Date(patch.endAt) } : {}),
      ...(patch.roomId ? { roomId: patch.roomId } : {}),
      ...(patch.branchId ? { branchId: patch.branchId } : {}),
      ...(patch.teacherId ? { teacherId: patch.teacherId } : {}),
    },
  });
  return res.count;
}

export async function addLesson(input: {
  studentId: string;
  teacherId: string;
  roomId: string;
  instrument: Instrument;
  startAt: string;
  durationMinutes?: number;
  term?: import("./types").StudentTermType;
  academicYearStart?: number;
  /** İş 3 — bkz. validateLessonSlot allowAvailabilityOverride yorumu. */
  allowAvailabilityOverride?: boolean;
  /** Override uygulanırsa Lesson.availabilityOverride.by'a yazılan aktör. */
  overriddenByUserId?: string;
  createdByUserId?: string;
  /** 2026-10-04 — dersin ait olduğu eğitim. */
  enrollmentId?: string;
}): Promise<string> {
  const tid = requireTenantId();
  // DB egress (2026-10-10): doğrulama yalnız bu öğretmen/oda/öğrenci ve gün penceresine bakar — tam okuma yok.
  const data =
    (await readSlotScope(tid, { studentId: input.studentId, teacherId: input.teacherId, roomId: input.roomId, startAt: input.startAt })) ??
    (await readData());
  const validation = validateLessonSlot(
    data,
    // `term` verilmişse haftalık kapalı gün kuralı DERSİN dönemine göre
    // çözülür (öğrencinin varsayılan dönemine göre değil) — bkz. work-days.ts.
    { instrument: input.instrument, studentId: input.studentId, term: input.term },
    { teacherId: input.teacherId, roomId: input.roomId, startAt: input.startAt },
    { durationMinutes: input.durationMinutes, allowAvailabilityOverride: input.allowAvailabilityOverride }
  );
  if (!validation.ok) throw new LessonSlotValidationError(validation.code, validation.message);
  const slot = validation.slot;

  const branch = await prisma.branch.findFirst({
    where: { id: slot.branchId, tenantId: tid },
  });
  if (!branch) throw new Error("Şube bulunamadı");

  const override = slot.availabilityOverridden && input.overriddenByUserId;
  const lessonId = `les_${Date.now().toString(36)}`;
  await prisma.$transaction(async (tx) => {
    await assertSlotFreeLockedTx(tx, tid, { teacherId: slot.teacherId, roomId: slot.roomId, studentId: input.studentId, startAt: slot.startAt, endAt: slot.endAt });
    await tx.lesson.create({
      select: { id: true },
      data: {
        enrollmentId: input.enrollmentId,
        id: lessonId,
        tenantId: tid,
        studentId: input.studentId,
        teacherId: slot.teacherId,
        roomId: slot.roomId,
        branchId: slot.branchId,
        schoolId: branch.schoolId,
        instrument: input.instrument,
        startAt: new Date(slot.startAt),
        endAt: new Date(slot.endAt),
        type: "regular",
        status: "scheduled",
        createdByUserId: input.createdByUserId,
        term: input.term,
        academicYearStart: input.academicYearStart,
        availabilityOverrideBy: override ? input.overriddenByUserId : undefined,
        availabilityOverrideAt: override ? new Date() : undefined,
      },
    });
  });
  return lessonId;
}

/** Dilimin ders kapsamı (bkz. lesson-scope.ts `isLessonInScope`): ders ∪ öğrencinin tüm dersleri ∪ öğretmen/oda gün penceresi. */
function scopeLessonsWhere(
  tid: string,
  anchor: { id?: string; studentId: string; teacherId: string; roomId: string },
  days: Date[]
): Prisma.LessonWhereInput {
  const windows = days.map((d) => ({
    startAt: { gte: subDays(startOfDay(d), 1), lte: addDays(endOfDay(d), 1) },
  }));
  return {
    tenantId: tid,
    OR: [
      ...(anchor.id ? [{ id: anchor.id }] : []),
      { studentId: anchor.studentId },
      ...windows.map((w) => ({ teacherId: anchor.teacherId, ...w })),
      ...windows.map((w) => ({ roomId: anchor.roomId, ...w })),
    ],
  };
}

/**
 * DB egress (2026-10-10) — YENİ ders doğrulaması için dar dilim (bkz. lesson-scope.ts `narrowSlotScope`;
 * json/memory aynı dilimi tam veriden türetir). Okul yoksa null (çağıran tam okumaya düşer).
 */
export async function readSlotScope(tid: string, target: SlotScopeTarget): Promise<AppData | null> {
  const school = await prisma.school.findFirst({
    where: { tenantId: tid },
    omit: { logoUrl: true },
    include: {
      branches: true,
      teachers: { where: { tenantId: tid, id: target.teacherId } },
      students: { where: { tenantId: tid, id: target.studentId } },
      rooms: { where: { tenantId: tid, id: target.roomId } },
      lessons: { where: scopeLessonsWhere(tid, target, lessonScopeDays(target)) },
      makeupRequests: { where: { tenantId: tid, studentId: target.studentId } },
    },
  });
  if (!school) return null;
  return {
    ...mapSchoolToAppData({
      ...school,
      logoUrl: "",
      lessonSeries: [],
      attendances: [],
      payments: [],
      teacherFeeRules: [],
      teacherPayouts: [],
    }),
    packages: [],
    discountCampaigns: [],
    closedDayOverrides: await listClosedDays(tid).catch(() => []),
  };
}

/**
 * P0 mutasyon performansı (2026-09-07) — DAR OKUMA.
 *
 * Dilimin tanımı ve gerekçesi `src/lib/lesson-scope.ts`'te (TEK kaynak);
 * burada aynı dilim, tenant'ın tamamını çekmek yerine FİLTRELENMİŞ Prisma
 * `include`'larıyla üretilir. `mapSchoolToAppData` aynen yeniden kullanılır —
 * mapper tamamen varlık-başına çalışır, çapraz referans içermez.
 *
 * Bu yolda HİÇ kullanılmayan koleksiyonlar (`lessonSeries`, `teacherFeeRules`,
 * `teacherPayouts`, `packages`, `discountCampaigns`) sorgulanmaz; boş dizi
 * olarak verilir — her biri ayrı bir gidiş-dönüştür.
 *
 * Tenant kapsamı: `School` zaten `tenantId` ile bulunur, buna EK OLARAK her
 * ilişki filtresine de `tenantId` yazılır (savunma derinliği).
 */
export async function readLessonScope(
  lessonId: string,
  targetStartAt?: string
): Promise<AppData | null> {
  const tid = requireTenantId();
  const lessonRow = await prisma.lesson.findFirst({ where: { id: lessonId, tenantId: tid } });
  if (!lessonRow) return null;

  const days = lessonScopeDays({ startAt: lessonRow.startAt.toISOString() }, targetStartAt);

  const school = await prisma.school.findFirst({
    where: { tenantId: tid },
    // Dilim tüketicileri (ders doğrulama/statü kuralları) logoyu okumaz — ~79 KB data-URI her
    // yoklama/taşıma işleminde taşınmasın (json/memory de `narrowLessonScope`'ta boşaltır).
    omit: { logoUrl: true },
    include: {
      branches: true,
      teachers: { where: { tenantId: tid, id: lessonRow.teacherId } },
      students: { where: { tenantId: tid, id: lessonRow.studentId } },
      rooms: { where: { tenantId: tid, id: lessonRow.roomId } },
      lessons: { where: scopeLessonsWhere(tid, lessonRow, days) },
      attendances: { where: { tenantId: tid, lessonId: lessonRow.id } },
      makeupRequests: { where: { tenantId: tid, studentId: lessonRow.studentId } },
      payments: { where: { tenantId: tid, lessonId: lessonRow.id } },
    },
  });
  if (!school) return null;

  return {
    ...mapSchoolToAppData({ ...school, logoUrl: "", lessonSeries: [], teacherFeeRules: [], teacherPayouts: [] }),
    packages: [],
    discountCampaigns: [],
    // Taşıma doğrulaması da zorla açık/kapalı günleri görsün.
    closedDayOverrides: await listClosedDays(tid).catch(() => []),
  };
}

const CONCURRENT_UPDATE_MESSAGE =
  "Bu ders bu sırada başka bir işlemle değiştirildi. Lütfen sayfayı yenileyip tekrar deneyin.";

/**
 * Şema değişikliği (versiyon kolonu) olmadan iyimser eşzamanlılık kontrolü:
 * WHERE koşulu son okuduğumuz startAt/endAt/status değerlerini de içerir —
 * araya başka bir işlem girip dersi değiştirmişse `updateMany` hiçbir satırı
 * eşleştirmez ve biz bunu çakışma olarak raporlarız (sessizce üzerine yazmayız).
 */
export async function updateLessonSchedule(input: {
  lessonId: string;
  startAt?: string;
  durationMinutes?: number;
}): Promise<LessonScheduleUpdateOutcome> {
  logger.info("updateLessonSchedule", input.lessonId);
  const tid = requireTenantId();
  // Tam tenant okuması yerine DAR dilim (bkz. readLessonScope).
  const data = await readLessonScope(input.lessonId, input.startAt);
  if (!data) return { ok: false, code: "LESSON_NOT_FOUND", message: "Ders bulunamadı." };
  const original = data.lessons.find((l) => l.id === input.lessonId);
  if (!original) return { ok: false, code: "LESSON_NOT_FOUND", message: "Ders bulunamadı." };
  const result = applyLessonScheduleUpdate(data, input);
  if (!result.ok) return result;

  const updateResult = await prisma.lesson.updateMany({
    where: {
      id: input.lessonId,
      tenantId: tid,
      startAt: new Date(original.startAt),
      endAt: new Date(original.endAt),
      status: original.status,
    },
    data: {
      startAt: new Date(result.lesson.startAt),
      endAt: new Date(result.lesson.endAt),
    },
  });
  if (updateResult.count === 0) throw new Error(CONCURRENT_UPDATE_MESSAGE);
  // Yazma sonrası tam `AppData` okuması KALDIRILDI — çağıranın tek ihtiyacı
  // güncellenmiş ders ve bildirim için önceki başlangıç saati.
  return { ok: true, lesson: result.lesson, previousStartAt: original.startAt };
}

export async function cancelLesson(lessonId: string): Promise<void> {
  logger.info("cancelLesson", lessonId);
  const tid = requireTenantId();
  // DB egress (2026-10-10): kural yalnız dersi + aynı öğretmen/oda/öğrencinin gün penceresini okur — dar dilim (lesson-scope.ts).
  const data = await readLessonScope(lessonId);
  if (!data) throw new Error("Ders bulunamadı.");
  const original = data.lessons.find((l) => l.id === lessonId);
  const result = applyLessonCancel(data, lessonId);
  if (!result.ok) throw new Error(result.message);

  const updateResult = await prisma.lesson.updateMany({
    where: { id: lessonId, tenantId: tid, status: original!.status },
    data: { status: "cancelled" },
  });
  if (updateResult.count === 0) throw new Error(CONCURRENT_UPDATE_MESSAGE);

  // Ödenmemiş, ders bazlı otomatik tahsilatı iptal et (bkz. applyLessonCancel).
  await prisma.payment.updateMany({
    where: { lessonId, tenantId: tid, source: "lesson_ops", paidAmount: 0, status: { notIn: ["paid", "voided"] } },
    data: { status: "voided" },
  });

  return;
}

async function reloadLessonLiveResult(lessonId: string): Promise<LessonLiveUpdateResult> {
  // Çağıranlar (start/end/correct tool'ları) yalnız `lesson`'ı kullanır — tam veri yeniden okunmaz.
  const next = await readLessonScope(lessonId);
  if (!next) return { ok: false, message: "Ders bulunamadı." };
  const nextLesson = next.lessons.find((l) => l.id === lessonId);
  if (!nextLesson) return { ok: false, message: "Ders bulunamadı." };
  return { ok: true, data: next, lesson: nextLesson };
}

export async function startLessonLive(lessonId: string): Promise<LessonLiveUpdateResult> {
  logger.info("startLessonLive", lessonId);
  const tid = requireTenantId();
  // DB egress (2026-10-10): kural yalnız dersi + aynı öğretmen/oda/öğrencinin gün penceresini okur — dar dilim (lesson-scope.ts).
  const data = await readLessonScope(lessonId);
  if (!data) return { ok: false, message: "Ders bulunamadı." };
  const original = data.lessons.find((l) => l.id === lessonId);
  const result = applyStartLesson(data, lessonId);
  if (!result.ok) return result;

  const updateResult = await prisma.lesson.updateMany({
    where: { id: lessonId, tenantId: tid, status: original!.status },
    data: { status: "in_progress", actualStartAt: new Date(result.lesson.actualStartAt!) },
  });
  if (updateResult.count === 0) throw new Error(CONCURRENT_UPDATE_MESSAGE);
  return reloadLessonLiveResult(lessonId);
}

export async function endLessonLive(lessonId: string): Promise<LessonLiveUpdateResult> {
  logger.info("endLessonLive", lessonId);
  const tid = requireTenantId();
  // DB egress (2026-10-10): kural yalnız dersi + aynı öğretmen/oda/öğrencinin gün penceresini okur — dar dilim (lesson-scope.ts).
  const data = await readLessonScope(lessonId);
  if (!data) return { ok: false, message: "Ders bulunamadı." };
  const original = data.lessons.find((l) => l.id === lessonId);
  const result = applyEndLesson(data, lessonId);
  if (!result.ok) return result;

  const updateResult = await prisma.lesson.updateMany({
    where: { id: lessonId, tenantId: tid, status: original!.status },
    data: { status: "completed", actualEndAt: new Date(result.lesson.actualEndAt!) },
  });
  if (updateResult.count === 0) throw new Error(CONCURRENT_UPDATE_MESSAGE);
  return reloadLessonLiveResult(lessonId);
}


/** `applyLessonOpsFlagLive`/`switchLessonOpsFlagLive` ortak DB senkron mantığı. */
async function persistLessonOpsResult(
  lessonId: string,
  flag: LessonOpsFlag,
  result: ApplyLessonOpsResult
): Promise<ApplyLessonOpsResult> {
  if (!result.ok || result.alreadySet) return result;
  const tid = requireTenantId();

  const L = result.lesson;
  const lessonPatch = {
    studentAttended: L.studentAttended ?? false,
    studentAttendedAt: L.studentAttendedAt ? new Date(L.studentAttendedAt) : null,
    studentAttendedBy: L.studentAttendedBy ?? null,
    lessonProcessed: L.lessonProcessed ?? false,
    lessonProcessedAt: L.lessonProcessedAt ? new Date(L.lessonProcessedAt) : null,
    lessonProcessedBy: L.lessonProcessedBy ?? null,
    lessonProcessedReason: L.lessonProcessedReason ?? null,
    opsMakeupFlag: L.opsMakeupFlag ?? false,
    opsMakeupFlagAt: L.opsMakeupFlagAt ? new Date(L.opsMakeupFlagAt) : null,
    opsMakeupFlagBy: L.opsMakeupFlagBy ?? null,
    studentAbsent: L.studentAbsent ?? false,
    studentAbsentAt: L.studentAbsentAt ? new Date(L.studentAbsentAt) : null,
    studentAbsentBy: L.studentAbsentBy ?? null,
    studentExcused: L.studentExcused ?? false,
    studentExcusedAt: L.studentExcusedAt ? new Date(L.studentExcusedAt) : null,
    studentExcusedBy: L.studentExcusedBy ?? null,
    status: L.status,
    actualEndAt: L.actualEndAt ? new Date(L.actualEndAt) : undefined,
    studentAttendanceNote: L.studentAttendanceNote ?? null,
    // 9. tur — Telafi ile birlikte gelen kaynak AYNI transaction'da yazılır; kota
    // kontrolü (assertStudentMakeupQuotaTx) bu satırdan sonra okur.
    ...(L.disruptionSource
      ? {
          disruptionSource: L.disruptionSource,
          disruptionNote: L.disruptionNote ?? null,
          disruptionAt: L.disruptionAt ? new Date(L.disruptionAt) : null,
          disruptionBy: L.disruptionBy ?? null,
        }
      : {}),
  };

  if (flag === "makeup") {
    const mk = result.data.makeupRequests.find((m) => m.sourceLessonId === lessonId);
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await prisma.$transaction(
          async (tx) => {
            await tx.lesson.updateMany({ where: { id: lessonId, tenantId: tid }, data: lessonPatch });
            if (!mk) return;
            const exists = await tx.makeupRequest.findFirst({
              where: { sourceLessonId: lessonId, tenantId: tid },
            });
            if (exists) return;
            const les = await tx.lesson.findFirst({ where: { id: lessonId, tenantId: tid } });
            if (!les) throw new Error("Ders bulunamadı");
            await assertStudentMakeupQuotaTx(tx, tid, mk.studentId, les.schoolId, lessonId);
            // `MakeupRequest.attendanceId` zorunlu bir FK — saf fonksiyon
            // (lesson-ops.ts) yoklama kaydı yoksa onu da üretir, burada AYNI
            // transaction içinde yazılmazsa `MakeupRequest_attendanceId_fkey`
            // ihlal edilir (json/memory modda tüm `data` topluca yazıldığı için
            // bu adım gerekmiyor — parite yalnız db modunda elle kuruluyor).
            const att = result.data.attendances.find((a) => a.id === mk.attendanceId);
            if (att && !(await tx.attendance.findFirst({ where: { id: att.id, tenantId: tid } }))) {
              await tx.attendance.create({
                data: {
                  id: att.id,
                  tenantId: tid,
                  lessonId: att.lessonId,
                  studentId: att.studentId,
                  schoolId: les.schoolId,
                  status: att.status,
                  reason: att.reason,
                  markedAt: new Date(att.markedAt),
                  createsMakeupCredit: att.createsMakeupCredit,
                },
              });
            }
            await tx.makeupRequest.create({
              data: {
                id: mk.id,
                tenantId: tid,
                studentId: mk.studentId,
                teacherId: mk.teacherId,
                branchId: mk.branchId,
                schoolId: les.schoolId,
                instrument: mk.instrument,
                sourceLessonId: mk.sourceLessonId,
                attendanceId: mk.attendanceId,
                status: mk.status,
                reason: mk.reason,
                expiresAt: new Date(mk.expiresAt),
                suggestedSlots: mk.suggestedSlots as object,
                createdAt: new Date(mk.createdAt),
                policyNote: mk.policyNote,
              },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
        break;
      } catch (err: unknown) {
        if (isRetryablePrismaError(err) && attempt < maxRetries) {
          logger.warn("persistLessonOps makeup: transient DB error, retrying", attempt);
          await sleepMs(50 * attempt);
          continue;
        }
        throw err;
      }
    }
  } else {
    await prisma.lesson.updateMany({
      where: { id: lessonId, tenantId: tid },
      data: lessonPatch,
    });
  }

  // Sync attendance from pure result data for this lesson
  const att = result.data.attendances.find((a) => a.lessonId === lessonId);
  if (att && flag === "attended") {
    const existing = await prisma.attendance.findFirst({ where: { lessonId, tenantId: tid } });
    if (!existing) {
      await prisma.attendance.create({
        data: {
          id: att.id,
          tenantId: tid,
          lessonId,
          studentId: att.studentId,
          status: att.status,
          reason: att.reason,
          markedAt: new Date(att.markedAt),
          createsMakeupCredit: att.createsMakeupCredit,
          // Tenant kapsamı: bu sorgu daha önce tenantId taşımıyordu (bkz. CLAUDE.md
          // "Multi-tenancy — the security boundary"); eklendi.
          schoolId: (await prisma.lesson.findFirst({ where: { id: lessonId, tenantId: tid } }))!.schoolId,
        },
      });
    }
  }

  // Package B — yoklama (Geldi/İşlendi/Telafi) artık Payment üretmez, bu
  // yüzden `result.data.payments`'ta bu lessonId için normalde yeni bir satır
  // OLMAZ. Genel amaçlı kalır (ör. gelecekte tool başka bir yoldan pure
  // sonuca bir Payment eklerse burada yine DB'ye yazılır); yalnızca DB'de
  // henüz yoksa yazar.
  const payment = result.data.payments.find((p) => p.lessonId === lessonId);
  if (payment) {
    const exists = await prisma.payment.findFirst({ where: { lessonId, tenantId: tid } });
    if (!exists) {
      const les = await prisma.lesson.findFirst({ where: { id: lessonId, tenantId: tid } });
      const student = await prisma.student.findFirst({ where: { id: payment.studentId, tenantId: tid } });
      if (les && student) {
        await prisma.payment.create({
          data: {
            id: payment.id,
            tenantId: tid,
            studentId: payment.studentId,
            schoolId: student.schoolId,
            amount: payment.amount,
            paidAmount: payment.paidAmount,
            status: payment.status,
            dueDate: new Date(payment.dueDate),
            description: payment.description,
            lessonId: payment.lessonId,
            source: payment.source ?? "lesson_ops",
          },
        });
      }
    }
  }

  /**
   * P0 mutasyon performansı (2026-09-07) — burada eskiden tam `AppData`
   * yeniden okunuyordu (14 sorgu) yalnızca "güncellenmiş dersi" döndürmek
   * için. Saf sonuç (`result`) DB'ye az önce yazdığımız değerlerin ta
   * kendisidir; yeniden okumaya gerek yok.
   */
  return { ok: true, alreadySet: false, data: result.data, lesson: result.lesson, message: result.message };
}

export async function applyLessonOpsFlagLive(
  lessonId: string,
  flag: LessonOpsFlag,
  actorUserId: string,
  reason?: string
): Promise<ApplyLessonOpsResult> {
  logger.info("applyLessonOpsFlagLive", lessonId, flag);
  // Tam tenant okuması yerine DAR dilim (bkz. readLessonScope / lesson-scope.ts).
  const data = await readLessonScope(lessonId);
  if (!data) return { ok: false, message: "Ders bulunamadı." };
  const result = applyLessonOpsFlag(data, lessonId, flag, actorUserId, undefined, reason);
  return persistLessonOpsResult(lessonId, flag, result);
}

/** ÖNCELİK 4 (devam) — onaylı statü DEĞİŞİMİ (bkz. lesson-ops.ts switchLessonOpsFlag). */
export async function switchLessonOpsFlagLive(
  lessonId: string,
  flag: LessonOpsFlag,
  actorUserId: string,
  reason?: string,
  disruption?: import("./lesson-disruption").LessonDisruptionInput,
  attendanceNote?: string | null
): Promise<ApplyLessonOpsResult> {
  logger.info("switchLessonOpsFlagLive", lessonId, flag);
  // Tam tenant okuması yerine DAR dilim (bkz. readLessonScope / lesson-scope.ts).
  const data = await readLessonScope(lessonId);
  if (!data) return { ok: false, message: "Ders bulunamadı." };
  const result = switchLessonOpsFlag(data, lessonId, flag, actorUserId, undefined, reason, disruption, attendanceNote);
  return persistLessonOpsResult(lessonId, flag, result);
}

/**
 * 2026-09-29 — yoklama statüsünü geri alma. Saf kural dar dilimde çalışır; yazma TEK transaction'da ve
 * ders satırı "beklenen statü hâlâ bu mu" koşuluyla güncellenir (eşzamanlı ikinci istek/başka kullanıcı
 * arada değiştirdiyse 0 satır → STALE, telafi/yoklama yazımı da geri alınır).
 */
export async function clearLessonOpsFlagLive(
  lessonId: string,
  expected: LessonOpsFlag,
  actorUserId: string
): Promise<import("./lesson-ops").ClearLessonOpsResult> {
  const { clearLessonOpsFlag } = await import("./lesson-ops");
  const tid = requireTenantId();
  const data = await readLessonScope(lessonId);
  if (!data) return { ok: false, code: "NOT_FOUND", message: "Ders bulunamadı. Sayfayı yenileyip tekrar deneyin." };
  const result = clearLessonOpsFlag(data, lessonId, expected, actorUserId);
  if (!result.ok || result.alreadyClear) return result;
  const L = result.lesson;
  const expectedWhere: Prisma.LessonWhereInput =
    expected === "makeup"
      ? { opsMakeupFlag: true }
      : expected === "processed"
        ? { opsMakeupFlag: false, lessonProcessed: true }
        : expected === "attended"
          ? { opsMakeupFlag: false, lessonProcessed: false, studentAttended: true }
          : expected === "absent"
            ? { opsMakeupFlag: false, lessonProcessed: false, studentAttended: false, studentAbsent: true }
            : { opsMakeupFlag: false, lessonProcessed: false, studentAttended: false, studentAbsent: false, studentExcused: true };
  const stale = await prisma.$transaction(async (tx) => {
    const res = await tx.lesson.updateMany({
      where: { id: lessonId, tenantId: tid, ...expectedWhere },
      data: {
        studentAttended: false,
        studentAttendedAt: null,
        studentAttendedBy: null,
        lessonProcessed: false,
        lessonProcessedAt: null,
        lessonProcessedBy: null,
        lessonProcessedReason: null,
        opsMakeupFlag: false,
        opsMakeupFlagAt: null,
        opsMakeupFlagBy: null,
        studentAbsent: false,
        studentAbsentAt: null,
        studentAbsentBy: null,
        studentExcused: false,
        studentExcusedAt: null,
        studentExcusedBy: null,
        status: L.status,
        actualEndAt: L.actualEndAt ? new Date(L.actualEndAt) : null,
      },
    });
    if (res.count === 0) return true;
    if (result.cancelledMakeupIds.length > 0) {
      await tx.makeupRequest.updateMany({
        where: { id: { in: result.cancelledMakeupIds }, tenantId: tid, status: { in: ["pending", "suggested", "awaiting_info"] } },
        data: { status: "cancelled", decisionNote: "Yoklama statüsü geri alındı", decidedBy: actorUserId, decidedAt: new Date() },
      });
    }
    if (result.removedAttendanceIds.length > 0) {
      await tx.attendance.deleteMany({ where: { id: { in: result.removedAttendanceIds }, tenantId: tid, makeupRequest: null } });
    }
    return false;
  });
  if (stale) {
    return {
      ok: false,
      code: "STALE",
      message: "Bu dersin yoklama statüsü az önce değişti. Sayfayı yenileyip güncel statüyü kontrol edin.",
    };
  }
  return result;
}

/** Faz 2 — öğretmen yoklaması, öğrenci ops bayraklarından tamamen ayrı bir yol/tablo alanı. */
export async function markTeacherAttendanceLive(
  lessonId: string,
  status: TeacherAttendanceStatus,
  actorUserId: string,
  note: string | undefined
): Promise<ReturnType<typeof markTeacherAttendance>> {
  logger.info("markTeacherAttendanceLive", lessonId, status);
  const tid = requireTenantId();
  // DB egress (2026-10-10): kural yalnız dersi + aynı öğretmen/oda/öğrencinin gün penceresini okur — dar dilim (lesson-scope.ts).
  const data = await readLessonScope(lessonId);
  if (!data) return { ok: false, message: "Ders bulunamadı." };
  const result = markTeacherAttendance(data, lessonId, status, actorUserId, note);
  if (!result.ok || result.alreadySet) return result;

  const updateResult = await prisma.lesson.updateMany({
    where: { id: lessonId, tenantId: tid },
    data: {
      teacherAttendanceStatus: status,
      teacherAttendanceAt: result.lesson.teacherAttendanceAt ? new Date(result.lesson.teacherAttendanceAt) : null,
      teacherAttendanceBy: actorUserId,
      teacherAttendanceNote: note ?? null,
    },
  });
  if (updateResult.count === 0) return { ok: false, message: "Ders bulunamadı." };
  // 11. tur iş #3 — sondaki `data: await readData()` TAM veri setini yeniden
  // okuyordu; iki çağrıcı da (markTeacherAttendanceTool,
  // recordTeacherAttendanceForDisruption) `.data` kullanmıyor (yalnız
  // ok/alreadySet/message). Her yoklama tıklamasında bir tam okuma silindi.
  return result;
}

/**
 * Faz 13 — ders öğretmeni/şube değişimi. Çakışma hesabı `reassignLessonTeacherOrBranch`
 * (saf fonksiyon) ile yapılır; burada yalnızca sonucun TEK `$transaction` içinde
 * (kısmi yazım riski olmadan) Prisma'ya yazılması vardır.
 */
export async function reassignLessonTeacherOrBranchLive(input: ReassignLessonInput): Promise<ReassignLessonResult> {
  logger.info("reassignLessonTeacherOrBranchLive", input.lessonId, input.scope);
  const tid = requireTenantId();
  const data = await readData();
  const result = reassignLessonTeacherOrBranch(data, input);
  if (!result.ok) return result;

  await prisma.$transaction(async (tx) => {
    await tx.lesson.updateMany({
      where: { id: { in: result.preview.affectedLessonIds }, tenantId: tid },
      data: {
        teacherId: result.preview.newTeacherId,
        branchId: result.preview.newBranchId,
        roomId: result.preview.newRoomId,
      },
    });
    if (input.scope !== "single") {
      const lesson = data.lessons.find((l) => l.id === input.lessonId);
      if (lesson?.seriesId) {
        await tx.lessonSeries.updateMany({
          where: { id: lesson.seriesId, tenantId: tid },
          data: {
            teacherId: result.preview.newTeacherId,
            branchId: result.preview.newBranchId,
            roomId: result.preview.newRoomId,
          },
        });
      }
    }
  });

  return { ...result, data: await readData() };
}

export async function correctLessonTimesLive(
  lessonId: string,
  correction: LessonTimeCorrection
): Promise<LessonLiveUpdateResult> {
  logger.info("correctLessonTimesLive", lessonId);
  const tid = requireTenantId();
  // DB egress (2026-10-10): kural yalnız dersi + aynı öğretmen/oda/öğrencinin gün penceresini okur — dar dilim (lesson-scope.ts).
  const data = await readLessonScope(lessonId);
  if (!data) return { ok: false, message: "Ders bulunamadı." };
  const result = applyCorrectLessonTimes(data, lessonId, correction);
  if (!result.ok) return result;

  const updateResult = await prisma.lesson.updateMany({
    where: { id: lessonId, tenantId: tid },
    data: {
      actualStartAt: result.lesson.actualStartAt ? new Date(result.lesson.actualStartAt) : undefined,
      actualEndAt: result.lesson.actualEndAt ? new Date(result.lesson.actualEndAt) : undefined,
      startCorrectedBy: result.lesson.startCorrectedBy,
      startCorrectionNote: result.lesson.startCorrectionNote,
      endCorrectedBy: result.lesson.endCorrectedBy,
      endCorrectionNote: result.lesson.endCorrectionNote,
    },
  });
  if (updateResult.count === 0) throw new Error("Ders bulunamadı.");
  return reloadLessonLiveResult(lessonId);
}

/**
 * Seri + tüm ürettiği Lesson kayıtları TEK `$transaction` içinde yazılır —
 * kısmi bir hata durumunda hiçbir kayıt kalıcı olmaz. Çakışma/uygunluk
 * hesabı `createLessonSeriesData` (saf fonksiyon) ile yapılır; burada
 * yalnızca sonucun Prisma'ya yazılması vardır.
 */
export async function addLessonSeries(
  params: SeriesParams,
  options?: { skipConflicts?: boolean; allowAvailabilityOverride?: boolean; overriddenByUserId?: string; createdByUserId?: string }
): Promise<CreateSeriesResult> {
  logger.info("addLessonSeries", params.studentId, params.teacherId);
  const tid = requireTenantId();
  const data = await readData();

  if (!data.students.some((s) => s.id === params.studentId)) throw new Error("Öğrenci bulunamadı");
  if (!data.teachers.some((t) => t.id === params.teacherId)) throw new Error("Öğretmen bulunamadı");
  if (!data.rooms.some((r) => r.id === params.roomId)) throw new Error("Oda bulunamadı");
  const branch = await prisma.branch.findFirst({ where: { id: params.branchId, tenantId: tid } });
  if (!branch) throw new Error("Şube bulunamadı");

  const result = createLessonSeriesData(data, params, options);
  if (!result.ok) return result;

  const newLessons = result.data.lessons.filter((l) => l.seriesId === result.seriesId);

  await prisma.$transaction(async (tx) => {
    await tx.lessonSeries.create({
      data: {
        id: result.seriesId,
        tenantId: tid,
        schoolId: branch.schoolId,
        studentId: params.studentId,
        teacherId: params.teacherId,
        roomId: params.roomId,
        branchId: params.branchId,
        instrument: params.instrument,
        weekday: params.weekday,
        startTime: params.startTime,
        durationMinutes: params.durationMinutes,
        startsOn: new Date(params.startsOn),
        endsOn: new Date(params.endsOn),
        status: "active",
        term: params.term,
        academicYearStart: params.academicYearStart,
        demoTag: params.demoTag,
        contractId: params.contractId,
        enrollmentId: params.enrollmentId,
      },
    });
    for (const lesson of newLessons) {
      await assertSlotFreeLockedTx(tx, tid, lesson);
      await tx.lesson.create({
        data: {
          id: lesson.id,
          tenantId: tid,
          schoolId: branch.schoolId,
          studentId: lesson.studentId,
          teacherId: lesson.teacherId,
          roomId: lesson.roomId,
          branchId: lesson.branchId,
          instrument: lesson.instrument,
          startAt: new Date(lesson.startAt),
          endAt: new Date(lesson.endAt),
          type: lesson.type,
          status: lesson.status,
          seriesId: result.seriesId,
          enrollmentId: lesson.enrollmentId,
          createdByUserId: lesson.createdByUserId,
          term: lesson.term,
          academicYearStart: lesson.academicYearStart,
          availabilityOverrideBy: lesson.availabilityOverride?.by,
          availabilityOverrideAt: lesson.availabilityOverride ? new Date(lesson.availabilityOverride.at) : undefined,
        },
      });
    }
  });

  return {
    ok: true,
    data: await readData(),
    seriesId: result.seriesId,
    createdLessonIds: result.createdLessonIds,
    skippedOccurrences: result.skippedOccurrences,
  };
}

/** "Bu ders ve sonrası": geçmiş dersler dokunulmadan, gelecekteki seri dersleri iptal edilir. */
export async function cancelLessonSeriesFromLesson(lessonId: string): Promise<SeriesCancelResult> {
  logger.info("cancelLessonSeriesFromLesson", lessonId);
  const tid = requireTenantId();
  const data = await readData();
  const result = cancelSeriesFromLesson(data, lessonId);
  if (!result.ok) return result;

  const updatedSeries = result.data.lessonSeries.find(
    (s) => s.id === data.lessons.find((l) => l.id === lessonId)?.seriesId
  );
  if (!updatedSeries) throw new Error("Seri bulunamadı");

  await prisma.$transaction(async (tx) => {
    if (result.cancelledLessonIds.length > 0) {
      await tx.lesson.updateMany({
        where: { id: { in: result.cancelledLessonIds }, tenantId: tid },
        data: { status: "cancelled" },
      });
    }
    await tx.lessonSeries.updateMany({
      where: { id: updatedSeries.id, tenantId: tid },
      data: { status: updatedSeries.status, endsOn: new Date(updatedSeries.endsOn) },
    });
  });

  return { ok: true, data: await readData(), cancelledLessonIds: result.cancelledLessonIds };
}

/** 2026-09-17 — bkz. lesson-scope-edit.ts planLessonDeletion; korunan dersler (yoklama FK dahil) plana hiç girmez. */
/** M — kritik şifreyle statülü tek ders silme; yoklama satırı aynı transaction'da silinir. */
export async function forceDeleteLesson(lessonId: string): Promise<ForcedLessonDeletionPlan> {
  const tid = requireTenantId();
  const data = await readData();
  const result = planForcedLessonDeletion(data, lessonId);
  if (!result.ok) return result;
  const seriesClosed = result.data.lessonSeries.find((s) => s.id === result.lesson.seriesId && s.status === "cancelled");
  await prisma.$transaction(async (tx) => {
    await tx.attendance.deleteMany({ where: { lessonId, tenantId: tid } });
    await tx.lesson.deleteMany({ where: { id: lessonId, tenantId: tid } });
    if (seriesClosed) {
      await tx.lessonSeries.updateMany({ where: { id: seriesClosed.id, tenantId: tid }, data: { status: "cancelled" } });
    }
  });
  return { ...result, data: await readData() };
}

export async function deleteLessonsScoped(lessonId: string, scope: LessonEditScope): Promise<LessonDeletionPlan> {
  logger.info("deleteLessonsScoped", lessonId, scope);
  const tid = requireTenantId();
  const data = await readData();
  const result = planLessonDeletion(data, lessonId, scope);
  if (!result.ok) return result;
  const seriesClosed = result.data.lessonSeries.find((s) => s.id === result.seriesId && s.status === "cancelled");
  await prisma.$transaction(async (tx) => {
    await tx.lesson.deleteMany({ where: { id: { in: result.deletedLessonIds }, tenantId: tid } });
    if (seriesClosed) {
      await tx.lessonSeries.updateMany({ where: { id: seriesClosed.id, tenantId: tid }, data: { status: "cancelled" } });
    }
  });
  return { ...result, data: await readData() };
}

/** 2026-09-17 — bkz. lesson-scope-edit.ts applyLessonRevision. */
export async function reviseLessonsScoped(input: LessonRevisionInput): Promise<LessonRevisionResult> {
  logger.info("reviseLessonsScoped", input.lessonId, input.scope);
  const tid = requireTenantId();
  const data = await readData();
  const result = applyLessonRevision(data, input);
  if (!result.ok) return result;
  await prisma.$transaction(async (tx) => {
    for (const l of result.updatedLessons) {
      await tx.lesson.updateMany({
        where: { id: l.id, tenantId: tid },
        data: { startAt: new Date(l.startAt), endAt: new Date(l.endAt) },
      });
    }
    if (result.seriesPatch) {
      const { id, ...patch } = result.seriesPatch;
      await tx.lessonSeries.updateMany({ where: { id, tenantId: tid }, data: patch });
    }
    // ponytail: ders başına tek UPDATE; dönemlik seri (~40 ders) için yeterli, yüzlerce derste toplu SQL'e geçilir.
  }, { timeout: 30_000 });
  return { ...result, data: await readData() };
}

/** "Tüm seri": geçmiş dersler korunur, gelecekteki tüm seri dersleri iptal edilir, seri cancelled olur. */
export async function cancelEntireLessonSeries(seriesId: string): Promise<SeriesCancelResult> {
  logger.info("cancelEntireLessonSeries", seriesId);
  const tid = requireTenantId();
  const data = await readData();
  const result = cancelEntireSeries(data, seriesId);
  if (!result.ok) return result;

  await prisma.$transaction(async (tx) => {
    if (result.cancelledLessonIds.length > 0) {
      await tx.lesson.updateMany({
        where: { id: { in: result.cancelledLessonIds }, tenantId: tid },
        data: { status: "cancelled" },
      });
    }
    await tx.lessonSeries.updateMany({
      where: { id: seriesId, tenantId: tid },
      data: { status: "cancelled" },
    });
  });

  return { ok: true, data: await readData(), cancelledLessonIds: result.cancelledLessonIds };
}

async function requireTeacherSchoolId(tid: string, teacherId: string): Promise<string> {
  const teacher = await prisma.teacher.findFirst({ where: { id: teacherId, tenantId: tid } });
  if (!teacher) throw new Error("Öğretmen bulunamadı");
  return teacher.schoolId;
}

export async function addPackage(input: PackageInput): Promise<PackageMutationResult> {
  logger.info("addPackage", input.title);
  const tid = requireTenantId();
  const data = await readData();
  const result = createPackageData(data, input);
  if (!result.ok) return result;

  // displayId db yolunda atomik sayaçtan gelir (tenant-kapsamlı, çakışmasız).
  const displayId = formatDisplayId("package", await allocateSequenceValueDb(tid, "package"));
  await prisma.package.create({
    data: {
      id: result.pkg.id,
      tenantId: tid,
      displayId,
      title: result.pkg.title,
      description: result.pkg.description,
      applicableBranchIds: result.pkg.applicableBranchIds ?? undefined,
      status: result.pkg.status,
      price30Min: result.pkg.price30Min,
      price40Min: result.pkg.price40Min,
      price50Min: result.pkg.price50Min,
      termLabel: result.pkg.termLabel,
      monthlyLessonCount: result.pkg.monthlyLessonCount,
      groupLessonCount: result.pkg.groupLessonCount,
      defaultDurationMinutes: result.pkg.defaultDurationMinutes,
      defaultPaymentDueDay: result.pkg.defaultPaymentDueDay,
      notes: result.pkg.notes,
      createdBy: result.pkg.createdBy,
      createdByUserId: result.pkg.createdByUserId,
      createdAt: new Date(result.pkg.createdAt),
      updatedAt: new Date(result.pkg.updatedAt),
    },
  });
  return { ok: true, data: await readData(), pkg: { ...result.pkg, displayId } };
}

export async function updatePackage(packageId: string, patch: PackagePatch): Promise<PackageMutationResult> {
  logger.info("updatePackage", packageId);
  const tid = requireTenantId();
  const data = await readData();
  const result = updatePackageData(data, packageId, patch);
  if (!result.ok) return result;

  const updateResult = await prisma.package.updateMany({
    where: { id: packageId, tenantId: tid },
    data: {
      title: patch.title,
      description: patch.description,
      status: patch.status,
      price30Min: patch.price30Min,
      price40Min: patch.price40Min,
      price50Min: patch.price50Min,
      termLabel: patch.termLabel,
      monthlyLessonCount: patch.monthlyLessonCount,
      groupLessonCount: patch.groupLessonCount,
      defaultDurationMinutes: patch.defaultDurationMinutes,
      defaultPaymentDueDay: patch.defaultPaymentDueDay,
      applicableBranchIds: patch.applicableBranchIds,
      notes: patch.notes,
    },
  });
  if (updateResult.count === 0) return { ok: false, message: "Paket bulunamadı." };
  return { ok: true, data: await readData(), pkg: result.pkg };
}

export async function addDiscountCampaign(input: DiscountCampaignInput): Promise<DiscountCampaignMutationResult> {
  logger.info("addDiscountCampaign", input.name);
  const tid = requireTenantId();
  const data = await readData();
  const result = createDiscountCampaignData(data, input);
  if (!result.ok) return result;

  // displayId db yolunda atomik sayaçtan gelir (tenant-kapsamlı, çakışmasız).
  const displayId = formatDisplayId("campaign", await allocateSequenceValueDb(tid, "campaign"));
  await prisma.discountCampaign.create({
    data: {
      id: result.campaign.id,
      tenantId: tid,
      displayId,
      name: result.campaign.name,
      description: result.campaign.description,
      kind: result.campaign.kind,
      discountPercent: result.campaign.discountPercent,
      active: result.campaign.active,
      validFrom: result.campaign.validFrom ? new Date(result.campaign.validFrom) : null,
      validTo: result.campaign.validTo ? new Date(result.campaign.validTo) : null,
      branchId: result.campaign.branchId ?? null,
      applicableBranchIds: result.campaign.applicableBranchIds ?? undefined,
      stackingRule: result.campaign.stackingRule,
      priority: result.campaign.priority,
      maxUsageCount: result.campaign.maxUsageCount,
      usageCount: result.campaign.usageCount,
      conditions: (result.campaign.conditions as import("@prisma/client").Prisma.InputJsonValue | undefined) ?? undefined,
      createdBy: result.campaign.createdBy,
      createdByUserId: result.campaign.createdByUserId,
      createdAt: new Date(result.campaign.createdAt),
      updatedAt: new Date(result.campaign.updatedAt),
    },
  });
  return { ok: true, data: await readData(), campaign: { ...result.campaign, displayId } };
}

export async function updateDiscountCampaign(
  campaignId: string,
  patch: DiscountCampaignPatch
): Promise<DiscountCampaignMutationResult> {
  logger.info("updateDiscountCampaign", campaignId);
  const tid = requireTenantId();
  const data = await readData();
  const result = updateDiscountCampaignData(data, campaignId, patch);
  if (!result.ok) return result;

  const updateResult = await prisma.discountCampaign.updateMany({
    // Silinmiş satır hiçbir yamayla değişmez; eşzamanlı ikinci silme 0 satır günceller.
    where: { id: campaignId, tenantId: tid, deletedAt: null },
    data: {
      deletedAt: patch.deletedAt ? new Date(patch.deletedAt) : undefined,
      deletedByUserId: patch.deletedByUserId,
      deletionReason: patch.deletionReason,
      name: patch.name,
      description: patch.description,
      discountPercent: patch.discountPercent,
      active: patch.active,
      validFrom: patch.validFrom !== undefined ? (patch.validFrom ? new Date(patch.validFrom) : null) : undefined,
      validTo: patch.validTo !== undefined ? (patch.validTo ? new Date(patch.validTo) : null) : undefined,
      branchId: patch.branchId === null ? null : patch.branchId,
      applicableBranchIds: patch.applicableBranchIds,
      stackingRule: patch.stackingRule,
      priority: patch.priority,
      maxUsageCount: patch.maxUsageCount === null ? null : patch.maxUsageCount,
      usageCount: patch.usageCount,
      conditions: (patch.conditions as import("@prisma/client").Prisma.InputJsonValue | undefined) ?? undefined,
    },
  });
  if (updateResult.count === 0) return { ok: false, message: "Kampanya bulunamadı." };
  return { ok: true, data: await readData(), campaign: result.campaign };
}

export async function addTeacherFeeRule(input: FeeRuleInput): Promise<FeeRuleMutationResult> {
  logger.info("addTeacherFeeRule", input.teacherId);
  const tid = requireTenantId();
  const data = await readData();
  const result = createTeacherFeeRuleData(data, input);
  if (!result.ok) return result;

  const schoolId = await requireTeacherSchoolId(tid, input.teacherId);
  await prisma.teacherFeeRule.create({
    data: {
      id: result.rule.id,
      tenantId: tid,
      teacherId: result.rule.teacherId,
      schoolId,
      branchId: result.rule.branchId,
      instrument: result.rule.instrument,
      perMinuteRate: result.rule.perMinuteRate,
      effectiveFrom: new Date(result.rule.effectiveFrom),
      effectiveTo: result.rule.effectiveTo ? new Date(result.rule.effectiveTo) : undefined,
      createdAt: new Date(result.rule.createdAt),
    },
  });

  return { ok: true, data: await readData(), rule: result.rule };
}

export async function updateTeacherFeeRule(
  ruleId: string,
  patch: Partial<Omit<TeacherFeeRule, "id" | "createdAt">>
): Promise<FeeRuleMutationResult> {
  logger.info("updateTeacherFeeRule", ruleId);
  const tid = requireTenantId();
  const data = await readData();
  const result = updateTeacherFeeRuleData(data, ruleId, patch);
  if (!result.ok) return result;

  await prisma.teacherFeeRule.updateMany({
    where: { id: ruleId, tenantId: tid },
    data: {
      teacherId: result.rule.teacherId,
      branchId: result.rule.branchId ?? null,
      instrument: result.rule.instrument ?? null,
      perMinuteRate: result.rule.perMinuteRate,
      effectiveFrom: new Date(result.rule.effectiveFrom),
      effectiveTo: result.rule.effectiveTo ? new Date(result.rule.effectiveTo) : null,
      deactivatedAt: result.rule.deactivatedAt ? new Date(result.rule.deactivatedAt) : null,
      deactivatedByUserId: result.rule.deactivatedByUserId ?? null,
      deactivationReason: result.rule.deactivationReason ?? null,
    },
  });

  return { ok: true, data: await readData(), rule: result.rule };
}

export const STALE_PAYOUT_ERROR = "STALE_PAYOUT";

/** 2026-09-30 — kullanılmamış ücret kuralının kalıcı silinmesi (kullanım kontrolü tool katmanında). */
export async function deleteTeacherFeeRule(ruleId: string): Promise<boolean> {
  const res = await prisma.teacherFeeRule.deleteMany({ where: { id: ruleId, tenantId: requireTenantId() } });
  return res.count === 1;
}

/** 2026-09-30 — iptal edilmiş + hiç ödemesi olmamış kaydın kalıcı silinmesi (kural tool katmanında). */
export async function deleteTeacherPayout(payoutId: string): Promise<boolean> {
  const res = await prisma.teacherPayout.deleteMany({ where: { id: payoutId, tenantId: requireTenantId(), status: "cancelled" } });
  return res.count === 1;
}

export async function addTeacherPayoutExclusion(x: import("./types").TeacherPayoutExclusion): Promise<void> {
  const tid = requireTenantId();
  await prisma.teacherPayoutExclusion.upsert({
    where: { tenantId_lessonId: { tenantId: tid, lessonId: x.lessonId } },
    create: { ...x, tenantId: tid, createdAt: new Date(x.createdAt) },
    update: { reason: x.reason, createdByUserId: x.createdByUserId, createdAt: new Date(x.createdAt) },
  });
}

export async function removeTeacherPayoutExclusion(lessonId: string): Promise<boolean> {
  const res = await prisma.teacherPayoutExclusion.deleteMany({ where: { lessonId, tenantId: requireTenantId() } });
  return res.count === 1;
}

/** TeacherPayout → Prisma alanları (create/update ortak; tenant/teacher/school hariç). */
function payoutWriteFields(p: TeacherPayout) {
  const json = (v: unknown) => (v === undefined ? Prisma.DbNull : (v as Prisma.InputJsonValue));
  return {
    status: p.status,
    paidAt: p.paidAt ? new Date(p.paidAt) : null,
    method: p.method ?? null,
    totalMinutes: Math.round(p.totalMinutes),
    totalAmount: p.totalAmount,
    originalTotalMinutes: p.originalTotalMinutes ?? null,
    originalTotalAmount: p.originalTotalAmount ?? null,
    lineOverrides: p.lineOverrides && Object.keys(p.lineOverrides).length > 0 ? json(p.lineOverrides) : Prisma.DbNull,
    revisionCount: p.revisionCount ?? 0,
    revisedAt: p.revisedAt ? new Date(p.revisedAt) : null,
    revisedByUserId: p.revisedByUserId ?? null,
    revisionReason: p.revisionReason ?? null,
    pricingPolicy: p.pricingPolicy ?? null,
    pricingSnapshot: json(p.pricingSnapshot),
    cancelledAt: p.cancelledAt ? new Date(p.cancelledAt) : null,
    cancelledByUserId: p.cancelledByUserId ?? null,
    cancelReason: p.cancelReason ?? null,
    lineSnapshot: json(p.lineSnapshot),
    payments: json(p.payments),
    adjustments: json(p.adjustments),
  };
}

export async function createTeacherPayout(
  teacherId: string,
  periodStart: string,
  periodEnd: string,
  paymentMethodOverride?: TeacherPayoutPaymentMethod
): Promise<CreateTeacherPayoutResult> {
  logger.info("createTeacherPayout", teacherId, periodStart, periodEnd);
  const tid = requireTenantId();
  const data = await readData();
  const result = createTeacherPayoutSnapshot(data, teacherId, periodStart, periodEnd, new Date(), paymentMethodOverride);
  if (!result.ok) return result;

  if (result.reusedCancelledId) {
    // İptal edilmiş aynı dönem kaydı yerinde yeniden oluşturulur (sürüm kontrollü).
    const res = await prisma.teacherPayout.updateMany({
      where: { id: result.reusedCancelledId, tenantId: tid, status: "cancelled", version: result.payout.version ?? 0 },
      data: { ...payoutWriteFields(result.payout), generatedAt: new Date(result.payout.generatedAt), version: { increment: 1 } },
    });
    if (res.count === 0) {
      return { ok: false, code: "PAYOUT_ALREADY_EXISTS", message: "Bu dönemin kaydı az önce değişti; sayfayı yenileyip tekrar deneyin.", existingPayoutId: result.reusedCancelledId };
    }
    return { ok: true, data: await readData(), payout: { ...result.payout, version: (result.payout.version ?? 0) + 1 } };
  }
  const schoolId = await requireTeacherSchoolId(tid, teacherId);
  try {
    await prisma.teacherPayout.create({
      data: {
        id: result.payout.id,
        tenantId: tid,
        teacherId: result.payout.teacherId,
        schoolId,
        periodStart: new Date(`${result.payout.periodStart.slice(0, 10)}T00:00:00.000Z`),
        periodEnd: new Date(`${result.payout.periodEnd.slice(0, 10)}T00:00:00.000Z`),
        totalMinutes: Math.round(result.payout.totalMinutes),
        totalAmount: result.payout.totalAmount,
        status: result.payout.status,
        method: result.payout.method,
        generatedAt: new Date(result.payout.generatedAt),
        pricingPolicy: result.payout.pricingPolicy ?? null,
        pricingSnapshot: result.payout.pricingSnapshot
          ? (result.payout.pricingSnapshot as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
        lineSnapshot: result.payout.lineSnapshot as unknown as Prisma.InputJsonValue,
        payments: [],
        adjustments: [],
      },
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2002") {
      return {
        ok: false,
        code: "PAYOUT_ALREADY_EXISTS",
        message: "Bu öğretmen ve dönem için zaten bir hakediş kaydı var. Sayfayı yenileyip mevcut kaydı ödeyebilirsiniz.",
        existingPayoutId: result.payout.id,
      };
    }
    throw error;
  }

  return { ok: true, data: await readData(), payout: result.payout };
}

export async function updateTeacherPayoutPaymentMethod(
  payoutId: string,
  method: TeacherPayoutPaymentMethod
): Promise<UpdateTeacherPayoutPaymentMethodResult> {
  logger.info("updateTeacherPayoutPaymentMethod", payoutId, method);
  const tid = requireTenantId();
  const data = await readData();
  const result = updateTeacherPayoutPaymentMethodData(data, payoutId, method);
  if (!result.ok) return result;

  await prisma.teacherPayout.updateMany({
    where: { id: payoutId, tenantId: tid },
    data: { method },
  });

  return { ok: true, data: await readData(), payout: result.payout };
}

/** 2026-09-29/30 — ay bazlı hakediş politikası (kilit yok; kayıtların yeniden hesabı tool katmanında). */
export async function setTeacherPayoutPolicy(
  input: import("./teacher-payout").SetPayoutPolicyInput,
  actorUserId: string
): Promise<import("./teacher-payout").SetPayoutPolicyResult> {
  const tid = requireTenantId();
  const { setPayoutPolicyForMonthData } = await import("./teacher-payout");
  const result = setPayoutPolicyForMonthData(await readData(), input, actorUserId);
  if (!result.ok || !result.changed) return result;
  const r = result.record;
  const fields = {
    policy: r.policy,
    rate30: r.rate30 ?? null,
    rate40: r.rate40 ?? null,
    rate50: r.rate50 ?? null,
    setByUserId: r.setByUserId,
    setAt: new Date(r.setAt),
  };
  await prisma.teacherPayoutPolicyPeriod.upsert({
    where: { tenantId_month: { tenantId: tid, month: r.month } },
    create: { id: r.id, tenantId: tid, month: r.month, ...fields },
    update: fields,
  });
  return result;
}

/** K — hakediş revizyonu/ödeme geri alma (bkz. store-json.ts aynı adlı fonksiyon). */
export async function replaceTeacherPayout(payout: TeacherPayout): Promise<void> {
  const tid = requireTenantId();
  // İyimser kilit: yalnız okunduğu sürümdeyse yazılır (eşzamanlı ikinci ödeme/düzeltme çift kayıt üretmez).
  const res = await prisma.teacherPayout.updateMany({
    where: { id: payout.id, tenantId: tid, version: payout.version ?? 0 },
    data: { ...payoutWriteFields(payout), version: { increment: 1 } },
  });
  if (res.count === 0) throw new Error(STALE_PAYOUT_ERROR);
  return;
}

export async function markTeacherPayoutPaid(
  payoutId: string,
  method?: string
): Promise<MarkPayoutPaidResult> {
  logger.info("markTeacherPayoutPaid", payoutId);
  const tid = requireTenantId();
  const data = await readData();
  const result = markTeacherPayoutPaidData(data, payoutId, method);
  if (!result.ok) return result;

  await prisma.teacherPayout.updateMany({
    where: { id: payoutId, tenantId: tid },
    data: { status: "paid", paidAt: new Date(result.payout.paidAt!), method },
  });

  return { ok: true, data: await readData(), payout: result.payout };
}

export async function updatePerformanceWeights(
  performanceWeights: import("./performance-weights").PerformanceWeightsConfig
): Promise<AppData> {
  const tid = requireTenantId();
  await prisma.school.update({
    where: { tenantId: tid },
    data: { performanceWeights: performanceWeights as unknown as Prisma.InputJsonValue },
  });
  return readData();
}

export async function updateFeeRoundingMode(feeRoundingMode: FeeRoundingMode): Promise<AppData> {
  const tid = requireTenantId();
  await prisma.school.update({ where: { tenantId: tid }, data: { feeRoundingMode } });
  return readData();
}

export async function updateMonthlyMakeupAllowance(monthlyMakeupAllowance: number): Promise<AppData> {
  const tid = requireTenantId();
  await prisma.school.update({
    where: { tenantId: tid },
    data: { monthlyMakeupAllowance },
  });
  return readData();
}

export async function updateMakeupWindowDays(makeupWindowDays: number): Promise<AppData> {
  const tid = requireTenantId();
  await prisma.school.update({ where: { tenantId: tid }, data: { makeupWindowDays } });
  return readData();
}

export async function updateCollectionsSettings(
  collectionsSettings: CollectionsSettings
): Promise<void> {
  const tid = requireTenantId();
  await prisma.school.update({
    where: { tenantId: tid },
    data: { collectionsSettings: collectionsSettings as unknown as Prisma.InputJsonValue },
  });
  return;
}

export async function updateTermWeeklyClosedDays(
  termWeeklyClosedDays: { guz: number[]; yaz: number[] }
): Promise<AppData> {
  const tid = requireTenantId();
  const current = await prisma.school.findUnique({
    where: { tenantId: tid },
    select: { termWeeklyClosedDays: true },
  });
  const merged = mergeTermCalendarJson(current?.termWeeklyClosedDays, { weekly: termWeeklyClosedDays });
  await prisma.school.update({
    where: { tenantId: tid },
    data: { termWeeklyClosedDays: merged as unknown as Prisma.InputJsonValue },
  });
  return readData();
}

export async function updateAcademicTermDates(academicTermDates: AcademicTermDates): Promise<void> {
  const tid = requireTenantId();
  const current = await prisma.school.findUnique({
    where: { tenantId: tid },
    select: { termWeeklyClosedDays: true },
  });
  const merged = mergeTermCalendarJson(current?.termWeeklyClosedDays, { academicTermDates });
  await prisma.school.update({
    where: { tenantId: tid },
    data: { termWeeklyClosedDays: merged as unknown as Prisma.InputJsonValue },
  });
  return;
}

export async function updateConsentSettings(consentSettings: ConsentSettings): Promise<void> {
  const tid = requireTenantId();
  await prisma.school.update({
    where: { tenantId: tid },
    data: { consentSettings: consentSettings as unknown as Prisma.InputJsonValue },
  });
  return;
}

export async function updateSchoolLogoUrl(logoUrl: string): Promise<AppData> {
  const tid = requireTenantId();
  await prisma.school.update({ where: { tenantId: tid }, data: { logoUrl } });
  return readData();
}

export async function addPayment(input: {
  studentId: string;
  description: string;
  amount: number;
  dueDate: string;
  /** 2026-10-05 — kulüp ücreti satırı için (opsiyonel; yoksa eski davranış). */
  id?: string;
  source?: import("./types").PaymentSource;
  clubMembershipId?: string;
  installmentPeriodLabel?: string;
  /** 2026-10-09 — satırın branş kaydı (yoksa eski davranış: NULL). */
  enrollmentId?: string;
}): Promise<void> {
  logger.info("addPayment", input.studentId, input.amount);
  const tid = requireTenantId();
  const student = await prisma.student.findFirst({
    where: { id: input.studentId, tenantId: tid },
  });
  if (!student) throw new Error("Öğrenci bulunamadı");
  const isOverdue = new Date(input.dueDate).getTime() < Date.now();
  await prisma.payment.create({
    data: {
      id: input.id ?? `pay_${Date.now().toString(36)}`,
      tenantId: tid,
      studentId: input.studentId,
      schoolId: student.schoolId,
      amount: input.amount,
      paidAmount: 0,
      status: isOverdue ? "overdue" : "pending",
      dueDate: new Date(input.dueDate),
      description: input.description,
      ...(input.source ? { source: input.source } : {}),
      ...(input.clubMembershipId ? { clubMembershipId: input.clubMembershipId } : {}),
      ...(input.installmentPeriodLabel ? { installmentPeriodLabel: input.installmentPeriodLabel } : {}),
      ...(input.enrollmentId ? { enrollmentId: input.enrollmentId } : {}),
    },
  });
  return;
}

/** FEATURE A — bkz. store.ts yorumu. `createMany` — tek toplu yazma, id çakışma riski yok (uid() rastgele). */
export async function addContractInstallments(input: {
  contractId: string;
  studentId: string;
  installments: ContractInstallmentSnapshot[];
  firstPaymentCollected?: { method: string; amount: number; collectedAt: string; reference?: string; note?: string };
  reuseFirstPaymentId?: string;
  /** 2026-10-09 — sözleşmenin branş kaydı; taksit satırlarına (ve bağlanan kayıt ödemesine) aynen yazılır. */
  enrollmentId?: string;
}): Promise<{ data: AppData; installments: ContractInstallmentView[] }> {
  const tid = requireTenantId();
  const student = await prisma.student.findFirst({ where: { id: input.studentId, tenantId: tid } });
  if (!student) throw new Error("Öğrenci bulunamadı");
  const fp = input.firstPaymentCollected;
  const reuseId = input.reuseFirstPaymentId;
  const rows = input.installments
    .filter((inst) => !(inst.sequence === 1 && reuseId))
    .map((inst) => {
      const isFirstCollected = inst.sequence === 1 && !!fp;
      const noteSuffix = fp?.reference || fp?.note
        ? ` (${[fp.reference && `ref:${fp.reference}`, fp.note].filter(Boolean).join(" · ")})`
        : "";
      return {
        id: uid("pay"),
        tenantId: tid,
        studentId: input.studentId,
        schoolId: student.schoolId,
        amount: inst.amount,
        paidAmount: isFirstCollected ? fp!.amount : 0,
        status: isFirstCollected ? "paid" : "pending",
        dueDate: new Date(inst.dueDate),
        paidAt: isFirstCollected ? new Date(fp!.collectedAt) : null,
        description: `Sözleşme taksiti ${inst.sequence}/${input.installments.at(-1)?.sequence ?? input.installments.length}${isFirstCollected ? ` — Kayıt anında tahsil edildi${noteSuffix}` : ""}`,
        method: isFirstCollected ? fp!.method : inst.paymentMethod,
        source: "contract",
        contractId: input.contractId,
        enrollmentId: input.enrollmentId ?? null,
        installmentSequence: inst.sequence,
        installmentKind: inst.kind,
        installmentPeriodLabel: inst.periodLabel,
        installmentBreakdown: inst.breakdown as unknown as import("@prisma/client").Prisma.InputJsonValue | undefined,
        installmentComputationSource: inst.computationSource,
        installmentNote: inst.note,
      };
    });
  if (rows.length > 0) {
    await prisma.payment.createMany({ data: rows });
  }
  let reusedRow:
    | {
        id: string;
        sequence: number;
        dueDate: Date;
        amount: number;
        paidAmount: number;
        status: string;
        method: string | null;
        installmentKind: string | null;
        installmentPeriodLabel: string | null;
        installmentBreakdown: unknown;
        installmentComputationSource: string | null;
        installmentNote: string | null;
      }
    | undefined;
  if (reuseId) {
    const firstInst = input.installments.find((i) => i.sequence === 1);
    const updated = await prisma.payment.update({
      where: { id: reuseId },
      data: {
        amount: firstInst?.amount,
        contractId: input.contractId,
        ...(input.enrollmentId ? { enrollmentId: input.enrollmentId } : {}),
        installmentSequence: 1,
        description: `Sözleşme taksiti 1/${input.installments.at(-1)?.sequence ?? input.installments.length} — Kayıt anında tahsil edildi (kayıt ödemesi)`,
        installmentKind: firstInst?.kind,
        installmentPeriodLabel: firstInst?.periodLabel,
        installmentBreakdown: firstInst?.breakdown as unknown as import("@prisma/client").Prisma.InputJsonValue | undefined,
        installmentComputationSource: firstInst?.computationSource,
        installmentNote: firstInst?.note,
      },
    });
    reusedRow = {
      id: updated.id,
      sequence: 1,
      dueDate: updated.dueDate,
      amount: updated.amount,
      paidAmount: updated.paidAmount,
      status: updated.status,
      method: updated.method,
      installmentKind: updated.installmentKind,
      installmentPeriodLabel: updated.installmentPeriodLabel,
      installmentBreakdown: updated.installmentBreakdown,
      installmentComputationSource: updated.installmentComputationSource,
      installmentNote: updated.installmentNote,
    };
  }
  const data = await readData();
  const installmentRows = reusedRow
    ? [reusedRow, ...rows.map((r) => ({ ...r, sequence: r.installmentSequence }))]
    : rows.map((r) => ({ ...r, sequence: r.installmentSequence }));
  const installments: ContractInstallmentView[] = installmentRows.map((r) => ({
    paymentId: r.id,
    sequence: r.sequence,
    dueDate: r.dueDate.toISOString(),
    amount: r.amount,
    paidAmount: r.paidAmount,
    status: r.status,
    paymentMethod: r.method ?? undefined,
    kind: (r.installmentKind as import("./types").ContractInstallmentKind | null | undefined) ?? undefined,
    periodLabel: r.installmentPeriodLabel ?? undefined,
    breakdown: (r.installmentBreakdown as { periodLabel: string; amount: number }[] | null | undefined) ?? undefined,
    computationSource: (r.installmentComputationSource as "auto" | "manual" | null | undefined) ?? undefined,
    note: r.installmentNote ?? undefined,
  }));
  return { data, installments };
}

/** P0 dedup fix (2026-08-30) — bkz. store.ts StoreApi.getRegistrationFirstPayment. */
export async function getRegistrationFirstPayment(
  studentId: string,
  scope?: import("./student-enrollments").EnrollmentScope
): Promise<import("./types").Payment | null> {
  const tid = requireTenantId();
  const row = await prisma.payment.findFirst({
    where: { tenantId: tid, studentId, source: "registration_first_payment", ...enrollmentScopeWhere(scope) },
    orderBy: { createdAt: "asc" },
  });
  if (!row) return null;
  return {
    id: row.id,
    studentId: row.studentId,
    amount: row.amount,
    paidAmount: row.paidAmount,
    status: row.status as import("./types").PaymentStatus,
    dueDate: row.dueDate.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? undefined,
    description: row.description,
    method: row.method ?? undefined,
    lessonId: row.lessonId ?? undefined,
    source: (row.source as import("./types").PaymentSource | undefined) ?? "manual",
    createdAt: (row as { createdAt?: Date }).createdAt?.toISOString() ?? undefined,
    paymentNote: row.paymentNote ?? undefined,
    receivedByUserId: row.receivedByUserId ?? undefined,
    autoSuggestedAmount: row.autoSuggestedAmount ?? undefined,
    firstCollectionIncludesNextMonth: row.firstCollectionIncludesNextMonth ?? undefined,
    adjustmentReason: row.adjustmentReason ?? undefined,
    adjustedBy: row.adjustedBy ?? undefined,
    adjustedAt: row.adjustedAt?.toISOString() ?? undefined,
    contractId: row.contractId ?? undefined,
    enrollmentId: (row as { enrollmentId?: string | null }).enrollmentId ?? undefined,
  };
}

/** 2026-10-09 — branş kapsamı → Prisma `where` parçası (bkz. student-enrollments.ts `matchesEnrollmentScope`). */
function enrollmentScopeWhere(scope?: import("./student-enrollments").EnrollmentScope): Prisma.PaymentWhereInput {
  if (!scope) return {};
  if (!scope.enrollmentId) return { enrollmentId: null };
  return scope.includeUnlinked ? { OR: [{ enrollmentId: scope.enrollmentId }, { enrollmentId: null }] } : { enrollmentId: scope.enrollmentId };
}

/** Bkz. store-json.ts upsertMonthlyPlanPayment — dönem ayı başına tek satır; tahsilat tarihi vadeye yazılmaz. */
export async function upsertMonthlyPlanPayment(input: {
  studentId: string;
  month: string;
  amount: number;
  method?: string;
  /** 2026-10-09 — branş kaydı: dönem ayı satırı BRANŞ başınadır (Keman Ekim ≠ Piyano Ekim). */
  enrollmentId?: string;
  includeUnlinked?: boolean;
}): Promise<{ data: AppData; paymentId: string }> {
  logger.info("upsertMonthlyPlanPayment", input.studentId, input.month, input.amount);
  const tid = requireTenantId();
  const student = await prisma.student.findFirst({
    where: { id: input.studentId, tenantId: tid },
  });
  if (!student) throw new Error("Öğrenci bulunamadı");
  const { isMonthlyPlanRowForMonth, monthlyPlanPeriodLabel } = await import("./attendance-calendar-plan");
  // Öğrencinin sözleşmesiz aylık plan satırları azdır; dönem ayı tek kuralla (etiket → açıklama → vade) seçilir.
  const candidates = await prisma.payment.findMany({
    where: {
      tenantId: tid,
      studentId: input.studentId,
      source: "monthly_plan",
      contractId: null,
      ...enrollmentScopeWhere({ enrollmentId: input.enrollmentId, includeUnlinked: input.includeUnlinked }),
    },
    select: { id: true, description: true, dueDate: true, installmentPeriodLabel: true, source: true, amount: true, paidAmount: true, status: true },
  });
  const existing = candidates.find((p) =>
    isMonthlyPlanRowForMonth(
      {
        id: p.id,
        source: p.source,
        description: p.description,
        dueDate: p.dueDate.toISOString(),
        installmentPeriodLabel: p.installmentPeriodLabel ?? undefined,
        amount: p.amount,
        paidAmount: p.paidAmount,
        status: p.status,
      },
      input.month
    )
  );
  const description = `Aylık plan — ${input.month} (${input.amount} TL)`;
  let paymentId: string;
  if (existing) {
    paymentId = existing.id;
    await prisma.payment.update({
      where: { id: existing.id },
      data: {
        amount: input.amount,
        description,
        ...(existing.installmentPeriodLabel ? {} : { installmentPeriodLabel: monthlyPlanPeriodLabel(input.month) }),
        method: input.method,
      },
    });
  } else {
    paymentId = `pay_${Date.now().toString(36)}`;
    await prisma.payment.create({
      data: {
        id: paymentId,
        tenantId: tid,
        studentId: input.studentId,
        schoolId: student.schoolId,
        amount: input.amount,
        paidAmount: 0,
        status: "pending",
        dueDate: new Date(`${input.month}-01T12:00:00.000Z`),
        description,
        installmentPeriodLabel: monthlyPlanPeriodLabel(input.month),
        source: "monthly_plan",
        method: input.method,
        ...(input.enrollmentId ? { enrollmentId: input.enrollmentId } : {}),
      },
    });
  }
  const data = await readData();
  return { data, paymentId };
}

/** Bkz. store-json.ts addRegistrationFirstPayment — aynı davranış/idempotency (mode parity). */
export async function addRegistrationFirstPayment(input: {
  studentId: string;
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
  /** Bkz. Payment.firstCollectionIncludesNextMonth. */
  firstCollectionIncludesNextMonth?: boolean;
  /** 2026-10-09 — branş kaydı; idempotency öğrenci + branş başınadır (ikinci branşın ilk tahsilatı ayrı satır). */
  enrollmentId?: string;
}): Promise<{ data: AppData; paymentId: string }> {
  const tid = requireTenantId();
  const student = await prisma.student.findFirst({ where: { id: input.studentId, tenantId: tid } });
  if (!student) throw new Error("Öğrenci bulunamadı");
  const existing = await prisma.payment.findFirst({
    where: { tenantId: tid, studentId: input.studentId, source: "registration_first_payment", enrollmentId: input.enrollmentId ?? null },
  });
  let paymentId: string;
  if (existing) {
    paymentId = existing.id;
  } else {
    const noteSuffix = input.reference || input.note
      ? ` (${[input.reference && `ref:${input.reference}`, input.note].filter(Boolean).join(" · ")})`
      : "";
    paymentId = uid("pay");
    await prisma.payment.create({
      data: {
        id: paymentId,
        tenantId: tid,
        studentId: input.studentId,
        schoolId: student.schoolId,
        amount: input.amount,
        paidAmount: input.amount,
        status: "paid",
        dueDate: new Date(input.collectedAt),
        paidAt: new Date(input.collectedAt),
        description: `İlk Ödeme — Kayıt Anında Tahsil Edildi${noteSuffix}`,
        method: input.method,
        source: "registration_first_payment",
        receivedByUserId: input.receivedByUserId,
        paymentNote: input.note,
        autoSuggestedAmount: input.autoSuggestedAmount,
        firstCollectionIncludesNextMonth: input.firstCollectionIncludesNextMonth,
        adjustmentReason: input.adjustmentReason,
        adjustedBy: input.adjustedBy,
        adjustedAt: input.adjustedAt ? new Date(input.adjustedAt) : undefined,
        ...(input.enrollmentId ? { enrollmentId: input.enrollmentId } : {}),
      },
    });
  }
  const data = await readData();
  return { data, paymentId };
}

/**
 * 2026-10-09 — branş bağı olmayan (NULL) kayıtları TEK bir branş kaydına bağlar; yalnız NULL satırlar yazılır,
 * başka branşa bağlı satıra DOKUNULMAZ. Kulüp satırları ve grup (kulüp) dersleri branş kaydı değildir, atlanır.
 * - `scope: "student"`: öğrencinin tüm bağsız ödemeleri + enstrümanı eşleşen ders/serileri (tek branşlı öğrenci).
 * - `contractIds`: yalnız bu sözleşmelerin taksitleri, serileri ve o serilerin dersleri ("Branşa bağla").
 * - `paymentIds`: yalnız bu ödemeler.
 */
export async function linkRecordsToEnrollment(input: {
  studentId: string;
  enrollmentId: string;
  instrument?: string;
  scope?: "student";
  contractIds?: string[];
  paymentIds?: string[];
}): Promise<{ payments: number; lessons: number; series: number }> {
  const tid = requireTenantId();
  const base = { tenantId: tid, studentId: input.studentId, enrollmentId: null };
  let payments = 0;
  let lessons = 0;
  let series = 0;
  await prisma.$transaction(async (tx) => {
    if (input.scope === "student") {
      payments += (
        await tx.payment.updateMany({
          // Yalnız yapısal olarak sahibi belli kaynaklar (bkz. student-enrollments.ts AUTO_LINK_PAYMENT_SOURCES);
          // elle girilmiş genel satırlar bağlanmaz.
          where: { ...base, clubMembershipId: null, source: { in: [...AUTO_LINK_PAYMENT_SOURCES] } },
          data: { enrollmentId: input.enrollmentId },
        })
      ).count;
      if (input.instrument) {
        lessons += (
          await tx.lesson.updateMany({
            where: { ...base, instrument: input.instrument, clubSessionId: null, type: { not: "group" } },
            data: { enrollmentId: input.enrollmentId },
          })
        ).count;
        series += (
          await tx.lessonSeries.updateMany({ where: { ...base, instrument: input.instrument }, data: { enrollmentId: input.enrollmentId } })
        ).count;
      }
    }
    if (input.contractIds?.length) {
      payments += (
        await tx.payment.updateMany({ where: { ...base, contractId: { in: input.contractIds } }, data: { enrollmentId: input.enrollmentId } })
      ).count;
      const seriesRows = await tx.lessonSeries.findMany({
        where: { tenantId: tid, studentId: input.studentId, contractId: { in: input.contractIds } },
        select: { id: true },
      });
      const seriesIds = seriesRows.map((r) => r.id);
      if (seriesIds.length) {
        series += (
          await tx.lessonSeries.updateMany({ where: { ...base, id: { in: seriesIds } }, data: { enrollmentId: input.enrollmentId } })
        ).count;
        lessons += (
          await tx.lesson.updateMany({ where: { ...base, seriesId: { in: seriesIds } }, data: { enrollmentId: input.enrollmentId } })
        ).count;
      }
    }
    if (input.paymentIds?.length) {
      payments += (
        await tx.payment.updateMany({
          where: { ...base, id: { in: input.paymentIds }, clubMembershipId: null },
          data: { enrollmentId: input.enrollmentId },
        })
      ).count;
    }
  });
  return { payments, lessons, series };
}

/**
 * Demo/QA seed kapısı — bkz. `demo-seed.ts`. PostgreSQL uygulaması.
 * Production'da fail-closed; tüm yazımlar aktif tenant'a scope'lanır.
 */
export async function seedDemoRecords(input: DemoSeedInput): Promise<DemoSeedResult> {
  assertDemoSeedAllowed();
  const tid = requireTenantId();
  const lessonIds: string[] = [];

  for (const l of input.lessons ?? []) {
    const branch = await prisma.branch.findFirst({ where: { id: l.branchId, tenantId: tid } });
    if (!branch) throw new Error("Şube bulunamadı");
    const id = newDemoLessonId();
    await prisma.lesson.create({
      data: {
        id,
        tenantId: tid,
        studentId: l.studentId,
        teacherId: l.teacherId,
        roomId: l.roomId,
        branchId: l.branchId,
        schoolId: branch.schoolId,
        instrument: l.instrument,
        startAt: new Date(l.startAt),
        endAt: new Date(l.endAt),
        type: l.type,
        status: l.status,
        makeupRequestId: l.makeupRequestId,
        notes: l.notes,
      },
    });
    lessonIds.push(id);
  }

  for (const d of input.makeupDecisions ?? []) {
    const updated = await prisma.makeupRequest.updateMany({
      where: { id: d.requestId, tenantId: tid },
      data: {
        status: d.status,
        decidedBy: d.decidedBy,
        decidedAt: new Date(),
        decisionNote: d.decisionNote,
      },
    });
    if (updated.count === 0) throw new Error(`Telafi talebi bulunamadı: ${d.requestId}`);
  }

  return { lessonIds };
}

const MAKEUP_LIFECYCLE_CONFLICT =
  "Bu telafi kaydı az önce değişti. Telafi Merkezi'ni yenileyip güncel durumu kontrol edin.";

function makeupRequestPersistData(request: import("./types").MakeupRequest): Prisma.MakeupRequestUncheckedUpdateManyInput {
  return {
    status: request.status,
    expiresAt: new Date(request.expiresAt),
    confirmedLessonId: request.confirmedLessonId ?? null,
    decisionNote: request.decisionNote ?? null,
    decidedBy: request.decidedBy ?? null,
    decidedAt: request.decidedAt ? new Date(request.decidedAt) : null,
    slaDeadline: request.slaDeadline ? new Date(request.slaDeadline) : null,
    slaEscalationLevel: request.slaEscalationLevel ?? 0,
    teacherId: request.teacherId,
    changeLog: (request.changeLog ?? []) as unknown as Prisma.InputJsonValue,
  };
}

function lessonLifecycleData(after: Lesson): Prisma.LessonUncheckedUpdateManyInput {
  return {
    status: after.status,
    teacherId: after.teacherId,
    roomId: after.roomId,
    branchId: after.branchId,
    startAt: new Date(after.startAt),
    endAt: new Date(after.endAt),
    lessonProcessed: after.lessonProcessed ?? false,
    lessonProcessedAt: after.lessonProcessedAt ? new Date(after.lessonProcessedAt) : null,
    lessonProcessedBy: after.lessonProcessedBy ?? null,
    lessonProcessedReason: after.lessonProcessedReason ?? null,
    opsMakeupFlag: after.opsMakeupFlag ?? false,
    opsMakeupFlagAt: after.opsMakeupFlagAt ? new Date(after.opsMakeupFlagAt) : null,
    opsMakeupFlagBy: after.opsMakeupFlagBy ?? null,
    studentAbsent: after.studentAbsent ?? false,
    studentExcused: after.studentExcused ?? false,
  };
}

/** Telafi yaşam döngüsü için dar dilim: talep, bağlı dersler ve hedef öğretmen/oda gün penceresi. */
async function readMakeupBundleDb(op: MakeupLifecycleOp): Promise<AppData | null> {
  const tid = requireTenantId();
  const request = await prisma.makeupRequest.findFirst({
    where: { id: op.requestId, tenantId: tid },
    select: { id: true, studentId: true, teacherId: true, sourceLessonId: true, confirmedLessonId: true, expiresAt: true },
  });
  if (!request) return null;
  const slot = op.kind === "revise" ? { teacherId: op.teacherId, roomId: op.roomId, startAt: op.startAt } : undefined;
  const related = await prisma.lesson.findMany({
    where: {
      tenantId: tid,
      OR: [
        { id: { in: [request.sourceLessonId, request.confirmedLessonId].filter((id): id is string => !!id) } },
        { makeupRequestId: request.id },
      ],
    },
    select: { id: true, teacherId: true, roomId: true, startAt: true },
  });
  const teacherIds = [...new Set([request.teacherId, ...related.map((row) => row.teacherId), slot?.teacherId].filter((id): id is string => !!id))];
  const roomIds = [...new Set([...related.map((row) => row.roomId), slot?.roomId].filter((id): id is string => !!id))];
  const anchors = [request.expiresAt, ...related.map((row) => row.startAt), slot?.startAt ? new Date(slot.startAt) : undefined].filter(
    (value): value is Date => value instanceof Date && !Number.isNaN(value.getTime())
  );
  const lessonOr: Prisma.LessonWhereInput[] = [{ makeupRequestId: request.id }];
  if (related.length) lessonOr.push({ id: { in: related.map((row) => row.id) } });
  for (const anchor of anchors) {
    const gte = new Date(anchor.getTime() - 36 * 3_600_000);
    const lte = new Date(anchor.getTime() + 36 * 3_600_000);
    lessonOr.push({ teacherId: { in: teacherIds }, startAt: { gte, lte } });
    if (roomIds.length) lessonOr.push({ roomId: { in: roomIds }, startAt: { gte, lte } });
    lessonOr.push({ studentId: request.studentId, startAt: { gte, lte } });
  }
  const school = await prisma.school.findFirst({
    where: { tenantId: tid },
    omit: { logoUrl: true },
    include: {
      branches: true,
      teachers: { where: { tenantId: tid, id: { in: teacherIds } } },
      students: { where: { tenantId: tid, id: request.studentId } },
      rooms: { where: { tenantId: tid, id: { in: roomIds.length ? roomIds : ["__none__"] } } },
      lessons: { where: { tenantId: tid, OR: lessonOr } },
      makeupRequests: { where: { tenantId: tid, studentId: request.studentId } },
      attendances: { where: { tenantId: tid, lesson: { studentId: request.studentId } } },
      lessonSeries: { where: { id: "__none__" } },
      payments: { where: { id: "__none__" } },
      teacherFeeRules: { where: { id: "__none__" } },
      teacherPayouts: { where: { id: "__none__" } },
    },
  });
  if (!school) return null;
  return {
    ...mapSchoolToAppData({ ...school, logoUrl: "" }),
    packages: [],
    discountCampaigns: [],
    closedDayOverrides: await listClosedDays(tid).catch(() => []),
  };
}

async function persistMakeupLifecycleResult(
  before: AppData,
  result: Extract<MakeupLifecycleResult, { ok: true }>
): Promise<void> {
  const tid = requireTenantId();
  const beforeRequest = before.makeupRequests.find((row) => row.id === result.requestId);
  const afterRequest = result.data.makeupRequests.find((row) => row.id === result.requestId);
  if (!beforeRequest || !afterRequest) {
    throw new MakeupLifecycleError("NOT_FOUND", "Telafi talebi bulunamadı. Telafi Merkezi'ni yenileyip kaydın durduğunu kontrol edin.");
  }
  await prisma.$transaction(async (tx) => {
    const reqRes = await tx.makeupRequest.updateMany({
      where: {
        id: beforeRequest.id,
        tenantId: tid,
        status: beforeRequest.status,
        expiresAt: new Date(beforeRequest.expiresAt),
      },
      data: makeupRequestPersistData(afterRequest),
    });
    if (reqRes.count === 0) throw new MakeupLifecycleError("CONFLICT", MAKEUP_LIFECYCLE_CONFLICT);
    for (const change of result.changedLessons) {
      const lesRes = await tx.lesson.updateMany({
        where: {
          id: change.before.id,
          tenantId: tid,
          status: change.before.status,
          startAt: new Date(change.before.startAt),
        },
        data: lessonLifecycleData(change.after),
      });
      if (lesRes.count === 0) throw new MakeupLifecycleError("CONFLICT", MAKEUP_LIFECYCLE_CONFLICT);
    }
  });
}

/** Süresi dolmuş planlanmamış telafi. Dar sorgu; değişiklik yoksa yazılmaz. */
export async function commitMakeupPlanningExpiry(now: Date = new Date()): Promise<void> {
  const tid = requireTenantId();
  const rows = await prisma.makeupRequest.findMany({
    where: {
      tenantId: tid,
      status: { in: ["pending", "suggested", "awaiting_info"] },
      confirmedLessonId: null,
      expiresAt: { lte: now },
    },
    select: {
      id: true,
      sourceLessonId: true,
      expiresAt: true,
      decisionNote: true,
      decidedBy: true,
      decidedAt: true,
      changeLog: true,
    },
  });
  const due = rows.filter(
    (row) => isPastMakeupPlanningDeadline(row.expiresAt.toISOString(), now) && !isLegacyMakeupExpiry(row.expiresAt.toISOString())
  );
  if (due.length === 0) return;
  const lessons = await prisma.lesson.findMany({
    where: { tenantId: tid, id: { in: due.map((row) => row.sourceLessonId) } },
  });
  const byId = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  await prisma.$transaction(async (tx) => {
    for (const row of due) {
      const existingLog = Array.isArray(row.changeLog) ? (row.changeLog as unknown as MakeupChangeEntry[]) : [];
      const updated = await tx.makeupRequest.updateMany({
        where: {
          id: row.id,
          tenantId: tid,
          status: { in: ["pending", "suggested", "awaiting_info"] },
          confirmedLessonId: null,
        },
        data: {
          status: "expired",
          decisionNote: row.decisionNote?.trim() ? row.decisionNote : MAKEUP_PLANNING_EXPIRED_REASON,
          decidedBy: row.decidedBy ?? "system",
          decidedAt: row.decidedAt ?? now,
          changeLog: [
            ...existingLog,
            { action: "planning_expired", at: now.toISOString(), by: "system", to: MAKEUP_PLANNING_EXPIRED_REASON },
          ] as Prisma.InputJsonValue,
        },
      });
      if (updated.count === 0) continue;
      const lesson = byId.get(row.sourceLessonId);
      if (!lesson || lesson.status === "cancelled" || lesson.studentAttended === true) continue;
      const human =
        lesson.lessonProcessed === true &&
        !!lesson.lessonProcessedReason &&
        lesson.lessonProcessedReason !== MAKEUP_PLANNING_EXPIRED_REASON;
      if (human) continue;
      const already = lesson.lessonProcessedReason === MAKEUP_PLANNING_EXPIRED_REASON;
      await tx.lesson.updateMany({
        where: {
          id: lesson.id,
          tenantId: tid,
          status: { not: "cancelled" },
          NOT: { studentAttended: true },
          OR: [{ lessonProcessed: false }, { lessonProcessedReason: null }, { lessonProcessedReason: MAKEUP_PLANNING_EXPIRED_REASON }],
        },
        data: {
          lessonProcessed: true,
          lessonProcessedAt: already && lesson.lessonProcessedAt ? lesson.lessonProcessedAt : now,
          lessonProcessedBy: already && lesson.lessonProcessedBy ? lesson.lessonProcessedBy : "system",
          lessonProcessedReason: MAKEUP_PLANNING_EXPIRED_REASON,
          opsMakeupFlag: false,
          opsMakeupFlagAt: null,
          opsMakeupFlagBy: null,
          studentAbsent: false,
          studentExcused: false,
        },
      });
    }
  });
}

export async function previewMakeupLifecycle(op: MakeupLifecycleOp): Promise<MakeupLifecycleResult> {
  const bundle = await readMakeupBundleDb(op);
  if (!bundle) {
    return { ok: false, code: "NOT_FOUND", message: "Telafi talebi bulunamadı. Telafi Merkezi'ni yenileyip kaydın durduğunu kontrol edin." };
  }
  return applyMakeupLifecyclePure(bundle, op);
}

export async function applyMakeupLifecycle(op: MakeupLifecycleOp): Promise<MakeupLifecycleResult> {
  const bundle = await readMakeupBundleDb(op);
  if (!bundle) {
    return { ok: false, code: "NOT_FOUND", message: "Telafi talebi bulunamadı. Telafi Merkezi'ni yenileyip kaydın durduğunu kontrol edin." };
  }
  const result = applyMakeupLifecyclePure(bundle, op);
  if (!result.ok) return result;
  try {
    await persistMakeupLifecycleResult(bundle, result);
  } catch (error) {
    if (error instanceof MakeupLifecycleError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
  return result;
}

/** Yalnız Geldi dersinin notunu yazar. Statü ve hakediş alanlarına dokunmaz. */
export async function setLessonAttendanceNoteLive(
  lessonId: string,
  note: string | null
): Promise<{ ok: true } | { ok: false; message: string }> {
  const tid = requireTenantId();
  const stored = normalizeAttendanceNote(note) ?? null;
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, tenantId: tid },
    select: { id: true, studentAttended: true },
  });
  if (!lesson) return { ok: false, message: "Ders bulunamadı. Sayfayı yenileyip tekrar deneyin." };
  if (lesson.studentAttended !== true) {
    return { ok: false, message: "Not yalnız Geldi yoklamasına yazılır. Önce Geldi'yi işaretleyin, sonra notu kaydedin." };
  }
  const updated = await prisma.lesson.updateMany({
    where: { id: lessonId, tenantId: tid, studentAttended: true },
    data: { studentAttendanceNote: stored },
  });
  if (updated.count === 0) {
    return { ok: false, message: "Dersin yoklaması az önce değişti. Sayfayı yenileyip Geldi durumunu kontrol edin." };
  }
  return { ok: true };
}

/** 9. tur — İptal/Telafi kaynağını sonradan belirleme/düzeltme. */
export async function setLessonDisruptionLive(
  lessonId: string,
  patch: import("./lesson-disruption").LessonDisruptionPatch
): Promise<import("./types").Lesson | null> {
  const tid = requireTenantId();
  const res = await prisma.lesson.updateMany({
    where: { id: lessonId, tenantId: tid },
    data: {
      disruptionSource: patch.disruptionSource ?? null,
      disruptionNote: patch.disruptionNote ?? null,
      disruptionAt: patch.disruptionAt ? new Date(patch.disruptionAt) : null,
      disruptionBy: patch.disruptionBy ?? null,
    },
  });
  if (res.count === 0) return null;
  const data = await readLessonScope(lessonId);
  return data?.lessons.find((l) => l.id === lessonId) ?? null;
}

/**
 * 9. tur — kullanılmamış paketi kalıcı siler. Karar packages.ts'deki saf kuralla, TEK
 * transaction içinde güncel veriden verilir; `updatedAt` eşleşmesi eşzamanlı düzenlemeyi,
 * Student.packageId FK'sı ise karar ile silme arasındaki yarışı (P2003) yakalar.
 */
export async function deletePackage(packageId: string, expectedUpdatedAt: string): Promise<import("./packages").PackageDeleteResult> {
  const tid = requireTenantId();
  const { computePackageDeletionImpact } = await import("./packages");
  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const pkg = await tx.package.findFirst({ where: { id: packageId, tenantId: tid } });
      if (!pkg) return { ok: false as const, code: "NOT_FOUND" as const, message: "Paket bulunamadı; başka biri silmiş olabilir. Listeyi yenileyin." };
      if (pkg.updatedAt.toISOString() !== new Date(expectedUpdatedAt).toISOString()) {
        return {
          ok: false as const,
          code: "CHANGED" as const,
          message: "Paket, siz onaylarken başka biri tarafından değiştirildi. Silinmedi; sayfayı yenileyip yeniden inceleyin.",
        };
      }
      const students = await tx.student.findMany({
        where: { tenantId: tid, OR: [{ packageId }, { packageId: null }] },
        select: { id: true, packageId: true, packageName: true, active: true, deletedAt: true },
      });
      const impact = computePackageDeletionImpact(
        {
          packages: [{ id: pkg.id, title: pkg.title, status: pkg.status, updatedAt: pkg.updatedAt.toISOString() } as never],
          students: students.map((st) => ({
            ...st,
            packageId: st.packageId ?? undefined,
            deletedAt: st.deletedAt?.toISOString(),
          })) as never,
        },
        packageId
      );
      if (!impact?.hardDeleteEligible) {
        return { ok: false as const, code: "IN_USE" as const, message: impact?.blockReason ?? "Paket kullanımda; silinemez." };
      }
      await tx.package.deleteMany({ where: { id: packageId, tenantId: tid } });
      return { ok: true as const };
    });
    return outcome.ok ? { ok: true, data: await readData() } : outcome;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return { ok: false, code: "IN_USE", message: "Paket bu sırada bir öğrenciye atandı; silinmedi. Arşivlemeyi kullanın." };
    }
    throw e;
  }
}
