import {
  assertDemoSeedAllowed,
  newDemoLessonId,
  type DemoSeedInput,
  type DemoSeedResult,
} from "./demo-seed";
import { applyLessonOpsFlag, switchLessonOpsFlag, type LessonOpsFlag, type ApplyLessonOpsResult } from "./lesson-ops";
import { allocateSequenceValueDb, formatDisplayId } from "./entity-sequence";
import { toDateOnlyDbValue } from "./date-input";
import { markTeacherAttendance, type TeacherAttendanceStatus } from "./teacher-attendance";
import { reassignLessonTeacherOrBranch, type ReassignLessonInput, type ReassignLessonResult } from "./lesson-reassignment";
import { prisma } from "./db";
import { Prisma } from "@prisma/client";
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
  LessonSeriesStatus,
  MakeupSlot,
  Room,
  Student,
  StudentProfilePatch,
  StudentPaymentPauseState,
  StudentType,
  Teacher,
  TeacherFeeRule,
  TeacherProfilePatch,
} from "./types";
import {
  suggestMakeupSlots,
  confirmMakeupSlot,
  computeSlaDeadline,
  validateLessonSlot,
  LessonSlotValidationError,
  type MakeupDecision,
} from "./makeup-engine";
import {
  applyLessonScheduleUpdate,
  applyLessonCancel,
  type LessonScheduleUpdateOutcome,
} from "./lesson-update";
import { lessonScopeDays } from "./lesson-scope";
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
  const student = await tx.student.findFirst({ where: { id: studentId, tenantId }, select: { termType: true } });
  const termFallback = (student?.termType as "guz" | "yaz" | null) ?? "guz";
  const sourceLesson = await tx.lesson.findFirst({
    where: { id: sourceLessonId, tenantId },
    select: { startAt: true, term: true, academicYearStart: true },
  });
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
        select: { id: true, startAt: true, term: true, academicYearStart: true },
      })
    : [];
  const lessonById = new Map(candidateLessons.map((l) => [l.id, l]));
  const used = candidates.filter((c) => {
    const l = lessonById.get(c.sourceLessonId);
    if (!l) return false;
    const p = resolveLessonAcademicPeriod(
      { startAt: l.startAt.toISOString(), term: (l.term as "guz" | "yaz" | null) ?? undefined, academicYearStart: l.academicYearStart ?? undefined },
      termFallback
    );
    return p.academicYearStart === period.academicYearStart && p.term === period.term;
  }).length;

  const school = await tx.school.findFirst({ where: { id: schoolId, tenantId } });
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
      active: teacher.active,
      archivedAt: (teacher as { archivedAt?: Date | null }).archivedAt?.toISOString() ?? undefined,
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
    students: school.students.map((student) => ({
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
      teacherId: student.teacherId,
      packageName: student.packageName,
      weeklyLessonCount: student.weeklyLessonCount,
      monthlyFee: student.monthlyFee,
      active: student.active,
      notes: student.notes,
      createdAt: student.createdAt.toISOString(),
      studentType: (student.studentType as StudentType) ?? undefined,
      studentTypes:
        ((student as { studentTypes?: unknown }).studentTypes as StudentType[] | undefined) ?? undefined,
      enrollmentStartDate: student.enrollmentStartDate?.toISOString() ?? undefined,
      lessonStartDate: student.lessonStartDate?.toISOString() ?? undefined,
      enrollmentEndDate: student.enrollmentEndDate?.toISOString() ?? undefined,
      level: student.level ?? undefined,
      targetExam: student.targetExam ?? undefined,
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
      derivedPerLessonAmount:
        (student as { derivedPerLessonAmount?: number | null }).derivedPerLessonAmount ?? undefined,
    })),
    rooms: school.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      branchId: room.branchId as BranchId,
      capacity: room.capacity,
      instruments: room.instruments as Instrument[],
      active: (room as { active?: boolean }).active ?? true,
      archivedAt: (room as { archivedAt?: Date | null }).archivedAt?.toISOString() ?? undefined,
    })),
    lessons: school.lessons.map((lesson) => ({
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
      notes: lesson.notes ?? undefined,
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
    })),
    lessonSeries: school.lessonSeries.map((series) => ({
      id: series.id,
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
    })),
    payments: school.payments.map((payment) => ({
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
    })),
    teacherFeeRules: school.teacherFeeRules.map((rule) => ({
      id: rule.id,
      teacherId: rule.teacherId,
      branchId: (rule.branchId as BranchId) ?? undefined,
      instrument: (rule.instrument as Instrument) ?? undefined,
      perMinuteRate: rule.perMinuteRate,
      effectiveFrom: rule.effectiveFrom.toISOString(),
      effectiveTo: rule.effectiveTo?.toISOString() ?? undefined,
      createdAt: rule.createdAt.toISOString(),
    })),
    teacherPayouts: school.teacherPayouts.map((payout) => ({
      id: payout.id,
      teacherId: payout.teacherId,
      periodStart: payout.periodStart.toISOString(),
      periodEnd: payout.periodEnd.toISOString(),
      totalMinutes: payout.totalMinutes,
      totalAmount: payout.totalAmount,
      status: payout.status as "pending" | "paid",
      paidAt: payout.paidAt?.toISOString() ?? undefined,
      method: payout.method ?? undefined,
      generatedAt: payout.generatedAt.toISOString(),
    })),
  };
}

export function getDashboardStats(data: AppData) {
  const pendingMakeup = data.makeupRequests.filter(
    (m) => m.status === "pending" || m.status === "suggested" || m.status === "awaiting_info"
  ).length;
  const confirmedMakeup = data.makeupRequests.filter((m) => m.status === "confirmed").length;
  const overduePayments = data.payments.filter((p) => p.status === "overdue" || p.status === "partial");
  const revenuePaid = data.payments
    .filter((p) => p.status === "paid")
    .reduce((s, p) => s + p.paidAmount, 0);
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
async function readPackages(tid: string): Promise<AppData["packages"]> {
  const rows = await prisma.package.findMany({ where: { tenantId: tid }, orderBy: { createdAt: "asc" } });
  return rows.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description ?? undefined,
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
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));
}

/** Paket 5 — DiscountCampaign de Package ile aynı tenant-çapında desen. */
async function readDiscountCampaigns(tid: string): Promise<AppData["discountCampaigns"]> {
  const rows = await prisma.discountCampaign.findMany({ where: { tenantId: tid }, orderBy: { createdAt: "asc" } });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind as import("./types").DiscountCampaignKind,
    discountPercent: c.discountPercent,
    active: c.active,
    validFrom: c.validFrom?.toISOString() ?? undefined,
    validTo: c.validTo?.toISOString() ?? undefined,
    branchId: (c.branchId as import("./types").BranchId | null) ?? undefined,
    createdBy: c.createdBy,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
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
export async function readData(): Promise<AppData> {
  const tid = tenantId();
  const [school, packages, discountCampaigns] = await Promise.all([
    prisma.school.findFirst({ where: { tenantId: tid }, include: schoolInclude }),
    readPackages(tid),
    readDiscountCampaigns(tid),
  ]);

  if (!school) {
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
    };
  }

  return { ...mapSchoolToAppData(school), packages, discountCampaigns };
}

export async function resetData(): Promise<AppData> {
  logger.info("resetData", "resetting tenant demo data");
  const seed = createSeedData();
  seed.settings.tenantId = tenantId();
  await seedDatabase(seed);
  return readData();
}

/** Kurulum Merkezi — boş şablona sıfırla (bkz. store.ts resetToCleanTemplate). */
export async function resetToCleanTemplate(): Promise<AppData> {
  logger.info("resetToCleanTemplate", "resetting tenant to clean template");
  const tid = tenantId();
  const current = await readData();
  const template = createEmptyTemplateData();
  template.settings.tenantId = tid;
  template.settings.name = current.settings.name;
  template.settings.shortName = current.settings.shortName;
  await seedDatabase(template);
  return readData();
}

/** Platform genelindeki tüm aktif kurumları (tenant) listeler — yalnız db modunda gerçek çokluluk vardır. */
export async function listTenants(): Promise<{ tenantId: string; name: string }[]> {
  const tenants = await prisma.tenant.findMany({
    where: { active: true },
    include: { schools: true },
    orderBy: { name: "asc" },
  });
  return tenants.map((t) => ({ tenantId: t.id, name: t.schools[0]?.name ?? t.name }));
}

export async function markAttendance(input: {
  lessonId: string;
  status: AttendanceStatus;
  reason?: string;
}): Promise<AppData> {
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
      return await readData();
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
): Promise<AppData> {
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

  await prisma.lesson.create({
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
    },
  });

  const decidedAt = new Date();
  const slaDeadline = computeSlaDeadline(decidedAt.toISOString());

  await prisma.makeupRequest.updateMany({
    where: { id: requestId, tenantId: tid },
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

  return readData();
}

export async function cancelMakeup(requestId: string, decision: MakeupDecision): Promise<AppData> {
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
  return readData();
}

export async function updateMakeupSlaEscalation(requestId: string, level: number): Promise<AppData> {
  const tid = requireTenantId();
  const updated = await prisma.makeupRequest.updateMany({
    where: { id: requestId, tenantId: tid },
    data: { slaEscalationLevel: level },
  });
  if (updated.count === 0) throw new Error("Telafi talebi bulunamadı");
  return readData();
}

export async function addStudent(
  student: Omit<Student, "id" | "createdAt" | "active">
): Promise<AppData> {
  logger.info("addStudent", student.name);
  const tid = requireTenantId();
  const branch = await prisma.branch.findFirst({
    where: { id: student.branchId, tenantId: tid },
  });
  if (!branch) throw new Error("Şube bulunamadı");
  const displayId = formatDisplayId("student", await allocateSequenceValueDb(tid, "student"));
  await prisma.student.create({
    data: {
      ...student,
      // Faz 12 doğrulaması sırasında bulunan kök neden düzeltmesi: salt
      // `Date.now()` tabanlı id, gerçek eşzamanlı isteklerde (ör. Promise.all
      // ile 10 öğrenci) AYNI milisaniyede çakışıp `id` primary key ihlaliyle
      // isteği tamamen reddedebiliyordu — `uid()` (json/memory modda zaten
      // kullanılan, rastgelelik içeren) ile aynı çarpışma-güvenli desene
      // getirildi.
      id: uid("stu"),
      tenantId: tid,
      schoolId: branch.schoolId,
      active: true,
      createdAt: new Date(),
      displayId,
      instruments: student.instruments,
      // Kök neden düzeltmesi: `...student` spread'i birthDate'i ham
      // "YYYY-MM-DD" olarak geçiriyordu; Prisma DateTime bunu reddettiği için
      // doğum tarihi girilen HER öğrenci kaydı db modunda başarısız oluyordu.
      // (369606b'deki `${v}T00:00:00.000Z` kalıbı tam ISO girdide Invalid Date
      // üretiyordu — geri alındı; burada date-input.ts'in UTC-öğlen kuralı.)
      birthDate: toDateOnlyDbValue(student.birthDate),
      enrollmentStartDate: student.enrollmentStartDate ? new Date(student.enrollmentStartDate) : undefined,
      lessonStartDate: student.lessonStartDate ? new Date(student.lessonStartDate) : undefined,
      enrollmentEndDate: student.enrollmentEndDate ? new Date(student.enrollmentEndDate) : undefined,
    },
  });
  return readData();
}

export async function updateStudentProfile(
  studentId: string,
  patch: StudentProfilePatch
): Promise<AppData> {
  logger.info("updateStudentProfile", studentId);
  const tid = requireTenantId();
  const result = await prisma.student.updateMany({
    where: { id: studentId, tenantId: tid },
    data: {
      // Bu turda eklendi — kayıt kimliği/eğitim profili alanları (öğretmen/
      // enstrüman MT-003 kararı gereği bilinçli olarak burada YOK).
      name: patch.name,
      email: patch.email,
      branchId: patch.branchId,
      educationMethod: patch.educationMethod,
      studentType: patch.studentType,
      studentTypes: patch.studentTypes,
      enrollmentStartDate: patch.enrollmentStartDate ? new Date(patch.enrollmentStartDate) : undefined,
      lessonStartDate: patch.lessonStartDate ? new Date(patch.lessonStartDate) : undefined,
      enrollmentEndDate: patch.enrollmentEndDate ? new Date(patch.enrollmentEndDate) : undefined,
      level: patch.level,
      targetExam: patch.targetExam,
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
    },
  });
  if (result.count === 0) throw new Error("Öğrenci bulunamadı");
  return readData();
}

/** Nilüfer Acar politikası §1E — bkz. store-json.ts aynı adlı fonksiyon; `state=null` reaktivasyonda alanları null'lar. */
export async function setStudentPaymentPause(studentId: string, state: StudentPaymentPauseState): Promise<AppData> {
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
  return readData();
}

export async function addTeacher(
  teacher: Omit<Teacher, "id" | "active" | "color">
): Promise<AppData> {
  logger.info("addTeacher", teacher.name);
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
  return readData();
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
      nationalIdCipher: patch.nationalIdCipher,
      nationalIdLast2: patch.nationalIdLast2,
      birthDate: toDateOnlyDbValue(patch.birthDate),
      address: patch.address,
      highSchool: patch.highSchool,
      university: patch.university,
      graduationYear: patch.graduationYear,
      maxDailyLessons: patch.maxDailyLessons,
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
  const { data } = await collectPayment(paymentId, normalized);
  return data;
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
}): Promise<AppData> {
  logger.info("addBranch", branch.name);
  const tid = requireTenantId();
  const school = await prisma.school.findFirst({ where: { tenantId: tid } });
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
  return readData();
}

export async function updateBranch(
  branchId: string,
  patch: Partial<{ name: string; shortName: string; address: string; phone: string; city: string }>
): Promise<AppData> {
  logger.info("updateBranch", branchId);
  const tid = requireTenantId();
  const result = await prisma.branch.updateMany({
    where: { id: branchId, tenantId: tid },
    data: patch,
  });
  if (result.count === 0) throw new Error("Şube bulunamadı");
  return readData();
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
  const school = await prisma.school.findFirst({ where: { tenantId: tid } });
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
        await tx.student.update({
          where: { id: existing.id },
          data: {
            name: row.name,
            email: row.email || existing.email,
            parentName: row.parentName,
            parentPhone: row.parentPhone,
            branchId: row.branchId,
            instruments: [row.instrument],
            teacherId: row.teacherId,
            packageName: row.packageName,
            weeklyLessonCount: row.weeklyLessonCount,
            monthlyFee: row.monthlyFee,
            notes: row.notes || existing.notes,
            lessonDurationMinutes: row.lessonDurationMinutes ?? existing.lessonDurationMinutes,
            birthDate: toDateOnlyDbValue(row.birthDate) ?? existing.birthDate,
            birthPlace: row.birthPlace ?? existing.birthPlace,
            schoolOrOccupation: row.schoolOrOccupation ?? existing.schoolOrOccupation,
            address: row.address ?? existing.address,
            nationalIdCipher: row.nationalIdCipher ?? existing.nationalIdCipher,
            nationalIdLast2: row.nationalIdLast2 ?? existing.nationalIdLast2,
            enrollmentStartDate: row.enrollmentStartDate ? new Date(row.enrollmentStartDate) : existing.enrollmentStartDate,
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
          },
        });
        created++;
      }
    }
  });

  return { data: await readData(), created, updated };
}

export async function addRoom(room: Omit<Room, "id">): Promise<AppData> {
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
  return readData();
}

/** ÖNCELİK 4 (devam) — oda düzenleme (ad/kapasite/şube/enstrüman/aktiflik). */
export async function updateRoom(
  roomId: string,
  patch: Partial<Pick<Room, "name" | "capacity" | "branchId" | "instruments" | "active" | "archivedAt">>
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
}): Promise<AppData> {
  const data = await readData();
  const tid = requireTenantId();
  const validation = validateLessonSlot(
    data,
    { instrument: input.instrument, studentId: input.studentId },
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
  await prisma.lesson.create({
    data: {
      id: `les_${Date.now().toString(36)}`,
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
      term: input.term,
      academicYearStart: input.academicYearStart,
      availabilityOverrideBy: override ? input.overriddenByUserId : undefined,
      availabilityOverrideAt: override ? new Date() : undefined,
    },
  });
  return readData();
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
  const windows = days.map((d) => ({
    startAt: { gte: subDays(startOfDay(d), 1), lte: addDays(endOfDay(d), 1) },
  }));

  const school = await prisma.school.findFirst({
    where: { tenantId: tid },
    include: {
      branches: true,
      teachers: { where: { tenantId: tid, id: lessonRow.teacherId } },
      students: { where: { tenantId: tid, id: lessonRow.studentId } },
      rooms: { where: { tenantId: tid, id: lessonRow.roomId } },
      lessons: {
        where: {
          tenantId: tid,
          OR: [
            { id: lessonRow.id },
            { studentId: lessonRow.studentId },
            ...windows.map((w) => ({ teacherId: lessonRow.teacherId, ...w })),
            ...windows.map((w) => ({ roomId: lessonRow.roomId, ...w })),
          ],
        },
      },
      attendances: { where: { tenantId: tid, lessonId: lessonRow.id } },
      makeupRequests: { where: { tenantId: tid, studentId: lessonRow.studentId } },
      payments: { where: { tenantId: tid, lessonId: lessonRow.id } },
    },
  });
  if (!school) return null;

  return {
    ...mapSchoolToAppData({ ...school, lessonSeries: [], teacherFeeRules: [], teacherPayouts: [] }),
    packages: [],
    discountCampaigns: [],
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

export async function cancelLesson(lessonId: string): Promise<AppData> {
  logger.info("cancelLesson", lessonId);
  const tid = requireTenantId();
  const data = await readData();
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

  return readData();
}

async function reloadLessonLiveResult(lessonId: string): Promise<LessonLiveUpdateResult> {
  const next = await readData();
  const nextLesson = next.lessons.find((l) => l.id === lessonId);
  if (!nextLesson) return { ok: false, message: "Ders bulunamadı." };
  return { ok: true, data: next, lesson: nextLesson };
}

export async function startLessonLive(lessonId: string): Promise<LessonLiveUpdateResult> {
  logger.info("startLessonLive", lessonId);
  const tid = requireTenantId();
  const data = await readData();
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
  const data = await readData();
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
  reason?: string
): Promise<ApplyLessonOpsResult> {
  logger.info("switchLessonOpsFlagLive", lessonId, flag);
  // Tam tenant okuması yerine DAR dilim (bkz. readLessonScope / lesson-scope.ts).
  const data = await readLessonScope(lessonId);
  if (!data) return { ok: false, message: "Ders bulunamadı." };
  const result = switchLessonOpsFlag(data, lessonId, flag, actorUserId, undefined, reason);
  return persistLessonOpsResult(lessonId, flag, result);
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
  const data = await readData();
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
  return { ...result, data: await readData() };
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
  const data = await readData();
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
  options?: { skipConflicts?: boolean; allowAvailabilityOverride?: boolean; overriddenByUserId?: string }
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
      },
    });
    for (const lesson of newLessons) {
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

  await prisma.package.create({
    data: {
      id: result.pkg.id,
      tenantId: tid,
      title: result.pkg.title,
      description: result.pkg.description,
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
      createdAt: new Date(result.pkg.createdAt),
      updatedAt: new Date(result.pkg.updatedAt),
    },
  });
  return { ok: true, data: await readData(), pkg: result.pkg };
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

  await prisma.discountCampaign.create({
    data: {
      id: result.campaign.id,
      tenantId: tid,
      name: result.campaign.name,
      kind: result.campaign.kind,
      discountPercent: result.campaign.discountPercent,
      active: result.campaign.active,
      validFrom: result.campaign.validFrom ? new Date(result.campaign.validFrom) : null,
      validTo: result.campaign.validTo ? new Date(result.campaign.validTo) : null,
      branchId: result.campaign.branchId ?? null,
      createdBy: result.campaign.createdBy,
      createdAt: new Date(result.campaign.createdAt),
      updatedAt: new Date(result.campaign.updatedAt),
    },
  });
  return { ok: true, data: await readData(), campaign: result.campaign };
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
    where: { id: campaignId, tenantId: tid },
    data: {
      name: patch.name,
      discountPercent: patch.discountPercent,
      active: patch.active,
      validFrom: patch.validFrom !== undefined ? (patch.validFrom ? new Date(patch.validFrom) : null) : undefined,
      validTo: patch.validTo !== undefined ? (patch.validTo ? new Date(patch.validTo) : null) : undefined,
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
    },
  });

  return { ok: true, data: await readData(), rule: result.rule };
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

  const schoolId = await requireTeacherSchoolId(tid, teacherId);
  await prisma.teacherPayout.create({
    data: {
      id: result.payout.id,
      tenantId: tid,
      teacherId: result.payout.teacherId,
      schoolId,
      periodStart: new Date(result.payout.periodStart),
      periodEnd: new Date(result.payout.periodEnd),
      totalMinutes: result.payout.totalMinutes,
      totalAmount: result.payout.totalAmount,
      status: result.payout.status,
      method: result.payout.method,
      generatedAt: new Date(result.payout.generatedAt),
    },
  });

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
): Promise<AppData> {
  const tid = requireTenantId();
  await prisma.school.update({
    where: { tenantId: tid },
    data: { collectionsSettings: collectionsSettings as unknown as Prisma.InputJsonValue },
  });
  return readData();
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

export async function updateAcademicTermDates(academicTermDates: AcademicTermDates): Promise<AppData> {
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
  return readData();
}

export async function updateConsentSettings(consentSettings: ConsentSettings): Promise<AppData> {
  const tid = requireTenantId();
  await prisma.school.update({
    where: { tenantId: tid },
    data: { consentSettings: consentSettings as unknown as Prisma.InputJsonValue },
  });
  return readData();
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
}): Promise<AppData> {
  logger.info("addPayment", input.studentId, input.amount);
  const tid = requireTenantId();
  const student = await prisma.student.findFirst({
    where: { id: input.studentId, tenantId: tid },
  });
  if (!student) throw new Error("Öğrenci bulunamadı");
  const isOverdue = new Date(input.dueDate).getTime() < Date.now();
  await prisma.payment.create({
    data: {
      id: `pay_${Date.now().toString(36)}`,
      tenantId: tid,
      studentId: input.studentId,
      schoolId: student.schoolId,
      amount: input.amount,
      paidAmount: 0,
      status: isOverdue ? "overdue" : "pending",
      dueDate: new Date(input.dueDate),
      description: input.description,
    },
  });
  return readData();
}

/** FEATURE A — bkz. store.ts yorumu. `createMany` — tek toplu yazma, id çakışma riski yok (uid() rastgele). */
export async function addContractInstallments(input: {
  contractId: string;
  studentId: string;
  installments: ContractInstallmentSnapshot[];
  firstPaymentCollected?: { method: string; amount: number; collectedAt: string; reference?: string; note?: string };
  reuseFirstPaymentId?: string;
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
export async function getRegistrationFirstPayment(studentId: string): Promise<import("./types").Payment | null> {
  const tid = requireTenantId();
  const row = await prisma.payment.findFirst({
    where: { tenantId: tid, studentId, source: "registration_first_payment" },
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
  };
}

export async function upsertMonthlyPlanPayment(input: {
  studentId: string;
  month: string;
  amount: number;
  dueDate?: string;
  method?: string;
}): Promise<{ data: AppData; paymentId: string }> {
  logger.info("upsertMonthlyPlanPayment", input.studentId, input.month, input.amount);
  const tid = requireTenantId();
  const student = await prisma.student.findFirst({
    where: { id: input.studentId, tenantId: tid },
  });
  if (!student) throw new Error("Öğrenci bulunamadı");
  const rangeStart = new Date(`${input.month}-01T00:00:00.000Z`);
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setUTCMonth(rangeEnd.getUTCMonth() + 1);
  const existing = await prisma.payment.findFirst({
    where: {
      tenantId: tid,
      studentId: input.studentId,
      source: "monthly_plan",
      dueDate: { gte: rangeStart, lt: rangeEnd },
    },
  });
  const description = `Aylık plan — ${input.month} (${input.amount} TL)`;
  const explicitDueDate = input.dueDate ? new Date(`${input.dueDate}T12:00:00.000Z`) : undefined;
  let paymentId: string;
  if (existing) {
    paymentId = existing.id;
    await prisma.payment.update({
      where: { id: existing.id },
      data: {
        amount: input.amount,
        description,
        dueDate: explicitDueDate,
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
        dueDate: explicitDueDate ?? new Date(`${input.month}-01T12:00:00.000Z`),
        description,
        source: "monthly_plan",
        method: input.method,
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
}): Promise<{ data: AppData; paymentId: string }> {
  const tid = requireTenantId();
  const student = await prisma.student.findFirst({ where: { id: input.studentId, tenantId: tid } });
  if (!student) throw new Error("Öğrenci bulunamadı");
  const existing = await prisma.payment.findFirst({
    where: { tenantId: tid, studentId: input.studentId, source: "registration_first_payment" },
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
      },
    });
  }
  const data = await readData();
  return { data, paymentId };
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
