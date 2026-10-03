/**
 * AI Tool Layer — single source of business operations.
 * Reuses existing store + makeup-engine + whatsapp templates.
 * Consumable by Web actions, future Mobile API, and AI agents.
 */

import { z } from "zod";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { prisma } from "../db";
import { foldTurkishForSearch } from "../normalize";
import { checkFileMagicBytes } from "../storage/file-guards";
import { computeStudentScore, type StudentScoreReport } from "../student-score";
import { provisionEntityLogin, provisionStaffLogin, getUserIdByTeacherId, getUserById, getUserAccountStatus, getUserAccountStatusForTeacher, setUserActive } from "../auth/users";
import { isRateLimited, getLatestPasswordResetRequestAt } from "../auth/password-reset";
import { logger } from "../logger";
import { isLocalDevTooling } from "../config";
import { studentUsesPerLessonBilling } from "../contract-prefill";
import { resolvePerformanceWeights, validateWeightMap, type PerformanceWeightsConfig } from "../performance-weights";
import {
  addBranch,
  addLesson,
  addLessonSeries,
  addPayment,
  addRoom,
  updateRoom,
  archiveTeacher,
  addStudent,
  addTeacher,
  addTeacherFeeRule,
  cancelEntireLessonSeries,
  deleteLessonsScoped,
  reviseLessonsScoped,
  cancelLesson,
  cancelLessonSeriesFromLesson,
  cancelMakeup,
  confirmSlot,
  correctLessonTimesLive,
  createTeacherPayout,
  replaceTeacherPayout,
  removeTeacherPayoutExclusion,
  addTeacherPayoutExclusion,
  deleteTeacherFeeRule,
  deleteTeacherPayout,
  clearLessonOpsFlagLive,
  setTeacherPayoutPolicy,
  forceDeleteLesson,
  endLessonLive,
  generateSuggestions,
  importBranches,
  importRooms,
  importStudents,
  importTeachers,
  markAttendance,

  markTeacherPayoutPaid,
  updateTeacherPayoutPaymentMethod,
  readData,
  readLessonScope,
  readStudentById,
  readReferenceData,
  readStudentScope,
  resetData,
  resetToCleanTemplate,
  startLessonLive,
  updateBranch,
  updateCollectionsSettings,
  updateConsentSettings,
  updateFeeRoundingMode,
  updatePerformanceWeights,
  updateMakeupWindowDays,
  updateMonthlyMakeupAllowance,
  updateSchoolLogoUrl,
  updateTermWeeklyClosedDays,
  updateAcademicTermDates,
  updateLessonSchedule,
  updateMakeupSlaEscalation,
  updateStudentProfile,
  listMebStudents,
  setStudentDeletion,
  hardDeleteStudent,
  setTeacherDeletion,
  hardDeleteTeacher,
  setStudentPaymentPause,
  updateTeacherAvailability,
  updateTeacherInstruments,
  updateTeacherProfile,
  updateTeacherFeeRule,
  switchLessonOpsFlagLive,
  upsertMonthlyPlanPayment,
  addRegistrationFirstPayment,
  getRegistrationFirstPayment,
  addPackage,
  updatePackage,
  deletePackage,
  addDiscountCampaign,
  updateDiscountCampaign,
} from "../store";
import { normalizePaymentDueRanges, effectivePaymentDueRanges, formatPaymentDueRanges } from "../payment-due-ranges";
import { effectiveStudentTypes } from "../student-types";
import { isMebStudent, mergeMebForUpdate, validateMebFields } from "../meb";
import { markTeacherAttendanceLive, setLessonDisruptionLive } from "../store";
import { computeTeacherPerformanceReport, type TeacherPerformanceReport } from "../teacher-performance";
import { computeTeacherPerformanceReportV2, type TeacherPerformanceReportV2 } from "../teacher-performance-v2";
import {
  markTeacherAttendanceSchema,
  teacherPerformanceReportSchema,
  teacherPerformanceReportV2Schema,
  reassignLessonTeacherOrBranchSchema,
} from "../validation";
import { reassignLessonTeacherOrBranchLive } from "../store";
import { notifyLessonReassigned } from "../lesson-notifications";
import {
  createPeriodicAssessment,
  listPeriodicAssessmentsForStudent,
  listPeriodicAssessmentsForTeacher,
  computePendingPeriodicAssessmentPeriods,
  type PendingPeriod,
} from "../periodic-assessment";
import { createPeriodicAssessmentSchema } from "../validation";
import type { PeriodicAssessment } from "../types";
import type { ClosedDay } from "../types";
import type { Lesson } from "../types";
import { checkAndNotifyMissingHomework } from "../homework-lesson-check";
import { notifyAttendanceRiskIfThresholdCrossed } from "../attendance-risk-check";
import { setClosedDay, listClosedDays } from "../closed-day-overrides";
import { resolveDayStatus } from "../attendance-calendar";
import { assertWorkDaySchedulable } from "../work-days";
import {
  setSocialMediaConsent,
  getLatestSocialMediaConsent,
  listSocialMediaConsentHistory,
} from "../social-media-consent";
import {
  listConsentTextVersions,
  getCurrentConsentTextVersion,
  createConsentTextVersion,
  grantKvkkConsent,
  withdrawKvkkConsent,
  getKvkkConsentById,
  listKvkkConsentHistory,
  getEffectiveConsentStatus,
} from "../kvkk-consent";
import { listCallLogs, createCallLog, assignCallContact, markCallbackDone } from "../call-log";
import { listMessageLogs, getMessageLog, createMessageLog, assignMessageContact, setMessageStatus, toPublicSummary } from "../message-log";
import { matchContactByPhone } from "../crm-contact-matching";
import {
  createInstrumentCatalogEntry,
  updateInstrumentCatalogEntry,
  listInstrumentCatalog,
  resolveActiveInstrumentNames,
} from "../instrument-catalog";
import { listStaff, createStaffMember, updateStaffMember, getStaffMember } from "../staff";
import {
  computeStaffPerformanceReport,
  currentYearMonth,
  type StaffPerformanceReport,
} from "../staff-performance";
import {
  listStaffAdvances,
  createStaffAdvance,
  decideStaffAdvance,
  markStaffAdvancePaid,
  cancelStaffAdvance,
  sumApprovedOrPaidForYear,
} from "../staff-advance";
import { listPayroll, createPayrollRecord, updatePayrollStatus } from "../payroll";
import { listLeave, createLeaveRequest, decideLeaveRequest } from "../leave";
import { listExpenses, createExpense, markExpensePaid } from "../expense";
import {
  listRecurringExpenseRules,
  createRecurringExpenseRule,
  setRecurringExpenseRuleActive,
  tickRecurringExpenseRules,
} from "../recurring-expense";
import { listBudgets, upsertBudget } from "../budget";
import {
  upsertProfilePhoto,
  getProfilePhoto,
  deleteProfilePhoto as deleteProfilePhotoRow,
  listProfilePhotoMeta,
  type ProfilePhotoOwnerType,
} from "../profile-photos";
import { validateProfilePhoto } from "../profile-photo-validation";
import { uploadProfilePhotoSchema, deleteProfilePhotoSchema } from "../validation";
import { getActiveAccessType } from "../student-portal-access";
import { ownStudents, ownPayouts } from "../teacher-portal-scope";
import { effectiveLessonOpsStatus, isLessonProcessedForPayout } from "../lesson-ops";
import { resolveLessonFinalStatus, type LessonFinalStatus } from "../lesson-live-status";
import { resolveContractPlanForMonth, type CalendarMonthPlan, type CalendarPlanContract } from "../attendance-calendar-plan";
import {
  academicTermMonths,
  isYmdWithinAcademicTerm,
  monthOverlapsAcademicTerm,
  resolveAcademicTermDatesForAnchor,
  validateAcademicTermDates,
} from "../academic-term-dates";
import { canViewFinanceAndStaffSummary } from "../auth/platform-access";
import {
  computeTeacherEarningsForPeriod,
  applyPayoutLineOverrides,
  sanitizePayoutLineOverrides,
  computeTeacherPayoutPaymentMethodInfo,
  payoutBaseEarnings,
  payoutDrift,
  recomputePayoutData,
  resolveFeeRule,
  setPayoutPolicyForMonthData,
  payoutPeriodDayKey,
  payoutsOverlappingMonth,
  type TeacherEarningsResult,
  type TeacherPayoutPaymentMethodInfo,
} from "../teacher-payout";
import {
  activeAdjustments,
  addAdjustmentData,
  addPaymentData,
  cancelPayoutData,
  payoutBalance,
  payoutNetAmount,
  payoutPaidAmount,
  reverseAdjustmentData,
  reversePaymentData,
  PAYOUT_STATUS_LABEL,
} from "../payout-ledger";
import {
  resolveSlaEscalationLevel,
  LessonSlotValidationError,
  isOverridableSlotCode,
  type MakeupSlaEscalation,
} from "../makeup-engine";
import { suggestLessonSlots, type LessonSlotSuggestion } from "../lesson-scheduling";
import { DEFAULT_LESSON_DURATION_MINUTES, TRIAL_LESSON_DURATION_OPTIONS } from "../lesson-duration";
import { computeDiscountAmount, computeMonthlyFee } from "../packages";
import type { LessonDurationMinutes } from "../lesson-duration";
import { isTeacherSchedulable, teacherServesBranch } from "../teacher-branches";
import {
  buildSeriesPreviewText,
  checkSeriesOccurrences,
  computeSeriesOccurrences,
  type SeriesOccurrenceCheck,
} from "../lesson-series";
import { clearFollowUpCases, listFollowUpCases, upsertFollowUpCase } from "../tahsilat/cases";
import {
  clearNotifications,
  createNotification,
  listNotificationsForUser,
  listNotificationsPageForUser,
  markNotificationRead,
} from "../notifications";
import {
  buildAnnouncementRecipientCandidates,
  clearAnnouncements,
  createAnnouncement,
  listAnnouncements,
  listReadUserIds,
  markAnnouncementRead,
  setAnnouncementRecipientCount,
  updateAnnouncementStatus,
} from "../announcements";
import { isVisibleNow, matchesAudience, resolveAudienceRecipients } from "../announcements/audience";
import {
  clearAssessments,
  createAssessment,
  getAssessment,
  listAssessmentsForStudent,
} from "../assessment";
import {
  computeTrend,
  stripPrivateNoteForRecipient,
  type AssessmentTrendPoint,
} from "../assessment/score";
import {
  clearAvailabilityRequests,
  getAvailabilityRequest,
  listAvailabilityRequestsForTeacher,
  reviewAvailabilityRequest,
} from "../teacher-availability";
import {
  clearHomework,
  createHomework,
  getHomework,
  getSubmission,
  listHomeworkForStudent,
  listHomeworkForTeacher,
  listSubmissionsForHomework,
  reviewSubmission,
  submitHomework,
  updateHomeworkDueDate,
} from "../homework";
import {
  clearTeachingMaterials,
  createTeachingMaterial,
  getTeachingMaterial,
  listTeachingMaterialsForTeacher,
} from "../teaching-materials";
import { matchesMaterialAudience } from "../teaching-materials-audience";
import {
  clearTeacherFeedback,
  listTeacherFeedback,
  submitTeacherFeedback,
  findTeacherFeedbackThisMonth,
  getTeacherFeedbackById,
  updateTeacherFeedbackStatus,
  setTeacherFeedbackShared,
  computeTeacherFeedbackSummary,
} from "../teacher-feedback";
import {
  clearStudentFeedback,
  listStudentFeedback,
  submitStudentFeedback,
  findStudentFeedbackThisMonth,
  updateStudentFeedbackStatus,
} from "../student-feedback";
import { formatMoney, formatDate, formatTime, uid, computeAge, paymentMethodLabelTr } from "../utils";
import type { AppRole } from "../auth/types";
import { parseCsv, rowsToRecords } from "../import/csv";
import { validateBranchRows, type BranchImportRow } from "../import/branches";
import { validateTeacherRows, type TeacherImportRow } from "../import/teachers";
import { validateRoomRows, type RoomImportRow } from "../import/rooms";
import { validateStudentRows, type StudentImportRow } from "../import/students";
import { validateLessonRows, type LessonImportRow } from "../import/lessons";
import { validateLessonScheduleRows, type LessonScheduleImportPreview } from "../import/lesson-schedule";
import type { HistoricalContractImportRow } from "../import/historical-contracts";
import type { ImportPreview } from "../import/types";
import type { ImportCommitResult } from "../import/commit-result";
import {
  templateMakeupConfirmed,
  templateMakeupCreated,
  templateTeacherMakeupAssigned,
  type WaMessage,
} from "../whatsapp-templates";
import {
  attendanceSchema,
  branchSchema,
  cancelEntireSeriesSchema,
  cancelLessonSchema,
  cancelSeriesFromLessonSchema,
  computeTeacherPayoutSchema,
  correctLessonTimesSchema,
  createAnnouncementSchema,
  createAssessmentSchema,
  createFeeRuleSchema,
  createLessonSeriesSchema,
  createTeacherPayoutSchema,
  endLessonSchema,
  lessonSchema,
  lessonSeriesParamsSchema,
  makeupSlotSchema,
  markAnnouncementReadSchema,
  listNotificationsSchema,
  markNotificationReadSchema,
  markTeacherPayoutPaidSchema,
  createHomeworkSchema,
  createTeachingMaterialSchema,
  paymentRecordSchema,
  updateTeacherAvailabilitySchema,
  deleteLessonsSchema,
  reviseLessonsSchema,
  archiveTeacherStudentsSchema,
  reviewHomeworkSubmissionSchema,
  reviewTeacherAvailabilityRequestSchema,
  roomSchema,
  submitHomeworkSchema,
  submitTeacherFeedbackSchema,
  submitStudentFeedbackSchema,
  createCurriculumTopicSchema,
  updateCurriculumTopicSchema,
  bulkAssignCurriculumTopicsSchema,
  createTrialLessonSchema,
  updateTrialLessonStatusSchema,
  updateTrialLessonSchema,
  archiveStudentSchema,
  archiveTeacherSchema,
  updateRoomSchema,
  setNationalIdSchema,
  createDocumentInstanceSchema,
  uploadDocumentDirectSchema,
  createDocumentTemplateSchema,
  updateDocumentTemplateSchema,
  archiveDocumentTemplateSchema,
  uploadDocumentTemplateDocxSchema,
  getDocumentTemplateSourceFileSchema,
  deleteSignedDocumentVersionSchema,
  startLessonSchema,
  studentSchema,
  suggestLessonSlotsSchema,
  teacherSchema,
  updateAnnouncementStatusSchema,
  updateBranchSchema,
  updateCollectionsSettingsSchema,
  updateCommunicationPreferenceSchema,
  updateFeeRoundingModeSchema,
  updateMakeupWindowDaysSchema,
  updateMonthlyMakeupAllowanceSchema,
  updateTermWeeklyClosedDaysSchema,
  updateFeeRuleSchema,
  updateLessonScheduleSchema,
  updateStudentProfileSchema,
  provisionStudentPortalAccessSchema,
  updateStudentPaymentProfileSchema,
  updateTeacherInstrumentsSchema,
  updateTeacherProfileSchema,
  updateTeacherPayoutPaymentMethodSchema,
  createPackageSchema,
  updatePackageSchema,
  createDiscountCampaignSchema,
  updateDiscountCampaignSchema,
  socialMediaConsentSchema,
  createConsentTextVersionSchema,
  grantKvkkConsentSchema,
  withdrawKvkkConsentSchema,
  updateConsentSettingsSchema,
  createCallLogSchema,
  assignCallContactSchema,
  markCallbackDoneSchema,
  createMessageLogSchema,
  assignMessageContactSchema,
  setMessageStatusSchema,
  createInstrumentCatalogSchema,
  updateInstrumentCatalogSchema,
  createStaffMemberWithPortalSchema,
  updateStaffMemberSchema,
  createPayrollRecordSchema,
  updatePayrollStatusSchema,
  createLeaveRequestSchema,
  decideLeaveRequestSchema,
  createStaffAdvanceSchema,
  decideStaffAdvanceSchema,
  markStaffAdvancePaidSchema,
  cancelStaffAdvanceSchema,
  createExpenseSchema,
  markExpensePaidSchema,
  createRecurringExpenseRuleSchema,
  setRecurringExpenseRuleActiveSchema,
  upsertBudgetSchema,
  createTaskSchema,
  resolveRelatedEntitySchema,
  updateTaskSchema,
  changeTaskStatusSchema,
  addTaskChecklistItemSchema,
  setTaskChecklistItemCompletedSchema,
  archiveTaskChecklistItemSchema,
  addTaskCommentSchema,
  updateTaskCommentSchema,
  deleteTaskCommentSchema,
  addTaskFileAttachmentSchema,
  addTaskLinkAttachmentSchema,
  deleteTaskAttachmentSchema,
  updateTaskReminderPreferenceSchema,
  setNotificationPreferencesSchema,
  listTasksFilterSchema,
} from "../validation";
import {
  DEFAULT_COLLECTIONS_SETTINGS,
  DEFAULT_CONSENT_SETTINGS,
  type ConsentSubjectType,
  INSTRUMENTS,
  type Announcement,
  type AnnouncementAudienceRef,
  type AnnouncementStatus,
  type AudienceRule,
  type BranchId,
  type CollectionsSettings,
  type FeeRoundingMode,
  type Homework,
  type AppData,
  type HomeworkSubmission,
  type Instrument,
  type LessonAssessment,
  type LessonDurationPreference,
  type MakeupSlot,
  type Notification,
  type Student,
  type StudentProfilePatch,
  type StudentFeedback,
  type StudentFeedbackStatus,
  type StudentType,
  type Teacher,
  type TeacherAvailabilityRequest,
  type TeacherFeedback,
  type TeacherFeeRule,
  type TeacherPayout,
  type TeacherPayoutLineOverride,
  type TeachingMaterial,
  type Task,
  type TaskStatus,
  type TaskChecklistItem,
  type TaskComment,
  type TaskActivity,
  type TaskActivityAction,
  type TaskAttachment,
  OPEN_TASK_STATUSES,
  resolveFirstCollectionMergeThreshold,
  shouldMergeFirstCollection,
} from "../types";
import {
  createTask,
  getTask,
  listDeletedTasks,
  setTaskDeletion,
  listTasks,
  updateTask,
  addChecklistItem,
  listChecklistItems,
  setChecklistItemCompleted,
  archiveChecklistItem,
  addComment,
  listComments,
  updateComment,
  softDeleteComment,
  getCommentById,
  addActivity,
  listActivity,
  clearTasks,
  addFileAttachment,
  addLinkAttachment,
  listAttachments,
  getAttachmentById,
  softDeleteAttachment,
  type TaskFilter,
} from "../tasks";
import { buildTaskReport, defaultTaskReportRange, type TaskReport, type TaskReportRange } from "../task-report";
import { resolveAppTimezone, toZonedYmd, formatDateTr, wallDateTimeInputToIso } from "../timezone";
import { clearTaskReminderLog } from "../task-reminder-log";
import { getReminderPreference, setReminderPreference, clearReminderPreferences } from "../task-reminder-preferences";
import {
  assertStudentAccess,
  canAccessStudent,
  canAccessTeacher,
  requireRole,
  type ServiceContext,
  type ActorRole,
} from "./context";
import { fail, fromZodError, ok, type ServiceErrorCode, type ServiceFailure, type ServiceResult } from "./result";
import { assertFeatureEnabled, getStudentFormConfig } from "../platform/access";
import { assertBranchOperation } from "../platform/permissions";
import { inBranchScope, resolveBranchScope } from "../platform/branch-scope";
import { assertTeacherEarningsAccess } from "../platform/teacher-earnings-access";

/** NeviiOS — şube müdürünün öğrenci kaydında değiştirebileceği temel operasyonel alanlar. */
const BRANCH_MANAGER_STUDENT_FIELDS = new Set([
  "phone",
  "parentName",
  "parentPhone",
  "level",
  "targetExam",
  // MEB Paneli — `level`/`targetExam`/kayıt tarihleriyle AYNI sınıf
  // operasyonel alanlar; şube kapsamı + rol kapısı aynen korunur (yeni
  // rol/izin YOK, panelin kendisi yalnız SCHOOL_ADMIN/SUPER_ADMIN).
  "mebLevelStartDate",
  "mebLevelEndDate",
  "mebExamDate",
  "mebExamAttended",
  "specialNotes",
  "termType",
  "communicationOptOut",
  "enrollmentStartDate",
  "enrollmentEndDate",
]);
import { applyStudentFormConfig } from "../platform/policies";
import { assertWithinLimit } from "../platform/entitlements";
import { recordAuditLog } from "../audit/log";
import { diffRecordFields } from "../audit/humanize";
import {
  createCurriculumTopic,
  updateCurriculumTopic,
  listCurriculumTopicsForStudent,
  computeOverallCurriculumProgress,
  toCurriculumSummary,
  getCurriculumTopic,
  bulkCreateCurriculumTopics,
} from "../curriculum";
import type {
  StudentCurriculumTopic,
  DocumentInstance,
  TeacherFeedbackStatus,
  StudentContract,
  ContractInstallmentView,
} from "../types";
import { createTrialLesson, listTrialLessons, updateTrialLessonStatus, getTrialLesson, updateTrialLesson, type TrialLessonPatch } from "../trial-lessons";
import {
  listTemplates,
  listAllTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  archiveTemplate,
  createDocumentInstance,
  markDocumentPrinted,
  listDocumentsForStudent,
  listDocumentInstances,
  archiveDocumentInstance,
  uploadSignedDocumentFile,
  softDeleteSignedVersion,
  softDeleteArchivedDocumentInstance,
  createContractTemplateDraftFromCanonicalSource,
  activateTemplateExclusive,
  getContractTemplateDiagnostics,
  type DocumentInstanceFilters,
} from "../documents";
import {
  createContract,
  getContract,
  listContractsForStudent,
  getLatestContractForStudent,
  listInstallmentsForContract,
  markContractPrinted,
  markContractWetSignaturePending,
  uploadContractSignedScan,
  cancelContract,
  buildInstallmentSchedule,
  buildPerLessonInstallmentSchedule,
  computeContractEndDate,
  foldBillingLinesIntoContractMonths,
  applyInstallmentAmountOverrides,
  applyInstallmentDueDateOverrides,
  isFormalContractDuration,
  TrialContractHasNoDocumentError,
  ContractTemplateIncompleteError,
  RenewalDebtBlockedError,
  computeOutstandingContractBalance,
  contractTitleFields,
  resolveContractPaymentDueRule,
} from "../contracts";
import { selectActiveTemplateOfKind, findMissingRequiredContractPlaceholders } from "../contract-template-schema";
import { encryptNationalId, maskNationalId, canViewFullNationalId, normalizeNationalId } from "../pii";
import { validateUploadedFile } from "../file-upload-validation";
import { assertSchedulableDate } from "../lesson-scheduling";
import { resolveCollectionsIban } from "../collections-due";


/** Fire-and-forget critical-action audit write — never awaited, never blocks the tool's return. */
function audit(
  ctx: ServiceContext,
  action: string,
  entityType: string,
  entityId: string,
  meta?: Record<string, unknown>
) {
  void recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action,
    entityType,
    entityId,
    outcome: "success",
    meta,
  });
}

/**
 * Kritik işlem şifresi kapısı — öğrenci silme, statülü ders silme, toplu silme ve
 * ödenmiş hakediş revizyonu TEK bu fonksiyondan geçer. Kurum sahibinin belirlediği
 * şifre dışında hiçbir şifre kabul edilmez; kullanıcı başına 15 dakikada 10 deneme.
 */
async function checkCriticalPassword(
  ctx: ServiceContext,
  plain: string
): Promise<{ ok: true } | { ok: false; reasonCode: string; message: string }> {
  const { getCriticalActionPasswordStatus, verifyCriticalActionPassword } = await import("../critical-action-password");
  const status = await getCriticalActionPasswordStatus(ctx.tenantId);
  if (!status.configured) {
    return {
      ok: false,
      reasonCode: "no_critical_password",
      message: "Kritik işlem şifresi belirlenmemiş. Kurum sahibi Ayarlar → Güvenlik ekranından şifreyi belirlemeden bu işlem yapılamaz.",
    };
  }
  const { consumeRateLimit } = await import("../rate-limit");
  if (!consumeRateLimit("critical-password", `${ctx.tenantId}:${ctx.userId}`, { windowMs: 15 * 60_000, max: 10 })) {
    return {
      ok: false,
      reasonCode: "rate_limited",
      message: "Kritik işlem şifresi çok kez denendi. Güvenlik için 15 dakika bekleyip tekrar deneyin.",
    };
  }
  if (!(await verifyCriticalActionPassword(ctx.tenantId, plain))) {
    return {
      ok: false,
      reasonCode: "wrong_critical_password",
      message: "Kritik işlem şifresi yanlış; işlem yapılmadı. Şifreyi kurum sahibinden teyit edin.",
    };
  }
  return { ok: true };
}

const CRITICAL_ROLES_FOR_TOOLS: ActorRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN"];

/**
 * 2026-09-29 owner kuralı — kullanıcıya "Sil" olarak sunulan HER eylem (soft delete dahil)
 * sunucuda: yetkili rol + kurum kritik işlem şifresi + boş olmayan gerekçe ister.
 * Şema alanları her silme tool'unun girdisine eklenir; şifre asla loglanmaz/audit'e yazılmaz.
 */
export const criticalDeleteFields = {
  criticalPassword: z.string(),
  reason: z.string().trim().min(5, "Silme gerekçesi en az 5 karakter olmalı.").max(500),
};

/**
 * Ortak silme kapısı: rol → kritik şifre. Reddedilen her deneme denetim kaydına
 * (`outcome: "denied"`, yalnız reasonCode) yazılır. `null` = devam edilebilir.
 */
export async function guardCriticalDelete(
  ctx: ServiceContext,
  target: { action: string; entityType: string; entityId: string; entityName?: string },
  criticalPassword: string
): Promise<ServiceFailure | null> {
  const deny = async (reasonCode: string, message: string) => {
    await recordAuditLog({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      action: target.action,
      entityType: target.entityType,
      entityId: target.entityId,
      outcome: "denied",
      meta: { reasonCode, ...(target.entityName ? { entityName: target.entityName } : {}) },
    });
    return fail("FORBIDDEN", message);
  };
  if (!requireRole(ctx, CRITICAL_ROLES_FOR_TOOLS).ok) {
    return deny("role_forbidden", "Silme yalnız kurum sahibi ve kurum yöneticileri tarafından, kritik işlem şifresiyle yapılabilir.");
  }
  const gate = await checkCriticalPassword(ctx, criticalPassword);
  return gate.ok ? null : deny(gate.reasonCode, gate.message);
}

/**
 * Karma Öğrenci Portalı — çağıranın BU öğrenciye erişim türü (GUARDIAN/SELF).
 * STAFF/AI_AGENT için her zaman `undefined` (rol bazlı tam erişimleri zaten
 * ayrıca kontrol edilir). Yalnızca STUDENT rolü + geçerli studentId'de
 * StudentPortalAccess'e bakar — `canViewParentPrivateNote`/audience eşleştirmesi
 * gibi eski "PARENT rolü her zaman görür" davranışını korumak için kullanılır.
 */
async function resolveCallerAccessType(
  ctx: ServiceContext,
  studentId: string
): Promise<"GUARDIAN" | "SELF" | undefined> {
  if (ctx.role !== "STUDENT") return undefined;
  const { getActiveAccessType } = await import("../student-portal-access");
  return (await getActiveAccessType(ctx.tenantId, ctx.userId, studentId)) ?? undefined;
}

// ─── helpers ───────────────────────────────────────────────

function parseOrFail<T>(schema: z.ZodType<T>, input: unknown): ServiceResult<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error.flatten());
  return ok(parsed.data);
}

// ─── tools ─────────────────────────────────────────────────

async function notifyAttendanceExceptionBestEffort(
  ctx: ServiceContext,
  lessonId: string,
  status: string
): Promise<void> {
  try {
    const data = await readData();
    const lesson = data.lessons.find((l) => l.id === lessonId);
    if (!lesson) return;
    const { getUserIdByTeacherId } = await import("../auth/users");
    const { isCategoryEnabledForUser } = await import("../notification-preferences");
    const teacherUserId = await getUserIdByTeacherId(ctx.tenantId, lesson.teacherId);
    if (teacherUserId && teacherUserId !== ctx.userId) {
      const enabled = await isCategoryEnabledForUser(ctx.tenantId, teacherUserId, "attendance_exception");
      if (enabled) {
        await createNotification({
          tenantId: ctx.tenantId,
          targetUserId: teacherUserId,
          kind: "attendance_exception",
          title: "Devamsızlık bildirimi",
          body: `"${lesson.instrument}" dersinde ${
            status === "absent" ? "devamsızlık" : "okul iptali"
          } kaydedildi. Detay: /panel/yoklama`,
        });
      }
    }
    try {
      const { notifyAdmins } = await import("../manager-notifications");
      await notifyAdmins(
        ctx.tenantId,
        "attendance_exception",
        {
          title: "Devamsızlık/iptal kaydı",
          body: `"${lesson.instrument}" dersi için ${
            status === "absent" ? "devamsızlık" : "okul iptali"
          } kaydı yapıldı. Detay: /panel/yoklama`,
        },
        { excludeUserId: ctx.userId, dedupeKey: lesson.id }
      );
    } catch {
      // best-effort
    }
  } catch {
    // best-effort
  }
}

/** 2026-09-17 owner kararı — yoklama (öğrenci geldi/gelmedi/işlendi/telafi) yalnız yöneticide. */
const TEACHER_ATTENDANCE_FORBIDDEN_MESSAGE =
  "Yoklama yalnız kurum yöneticileri tarafından alınır. Yoklama düzeltmesi için yöneticinizle iletişime geçin.";

export async function markAttendanceTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ lessonId: string; status: string }>> {
  if (ctx.role === "TEACHER") return fail("FORBIDDEN", TEACHER_ATTENDANCE_FORBIDDEN_MESSAGE);
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "AI_AGENT", "SUPER_ADMIN", "BRANCH_MANAGER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(attendanceSchema, input);
  if (!v.ok) return v;

  // NeviiOS — şube müdürü yalnız atanmış şubesindeki dersin yoklamasını alır.
  if (ctx.role === "BRANCH_MANAGER") {
    const lesson = (await readData()).lessons.find((l) => l.id === v.data.lessonId);
    if (!lesson) return fail("NOT_FOUND", "Ders bulunamadı");
    const gate = await assertBranchOperation(ctx, "attendance", "update", lesson.branchId);
    if (!gate.ok) return gate;
  }

  try {
    await markAttendance(v.data);
    if (v.data.status === "absent" || v.data.status === "cancelled_by_school") {
      await notifyAttendanceExceptionBestEffort(ctx, v.data.lessonId, v.data.status);
    }
    return ok({ lessonId: v.data.lessonId, status: v.data.status });
  } catch (e) {
    const { isMakeupQuotaExceededError } = await import("../makeup-quota");
    if (isMakeupQuotaExceededError(e)) {
      return fail("VALIDATION_ERROR", e instanceof Error ? e.message : "Telafi kotası aşıldı");
    }
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "markAttendance failed");
  }
}

export async function findAvailableSlotsTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ requestId: string; slots: MakeupSlot[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "TEACHER", "AI_AGENT", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(
    z.object({
      requestId: z.string().min(1),
      maxSlots: z.number().int().positive().max(50).optional(),
    }),
    input
  );
  if (!v.ok) return v;

  try {
    // 8. tur (G) — öneriler eskiden İKİ kez hesaplanıyordu (burada + generateSuggestions
    // içinde) ve veri üç kez okunuyordu. Artık tek hesap: store kaydeder, sonuç ondan okunur.
    // Ölçüm (6000 ders, 8 öğretmen, 6 oda): 41 sn → ~150 ms (bkz. makeup-engine indeksi).
    const t0 = performance.now();
    const options = v.data.maxSlots ? { maxSlots: v.data.maxSlots } : undefined;
    let after: AppData;
    try {
      after = await generateSuggestions(v.data.requestId, options);
    } catch {
      return fail("NOT_FOUND", "Telafi talebi bulunamadı; sayfayı yenileyip tekrar deneyin.");
    }
    const slots = after.makeupRequests.find((m) => m.id === v.data.requestId)?.suggestedSlots ?? [];
    logger.info("findAvailableSlotsTool", {
      requestId: v.data.requestId,
      slotCount: slots.length,
      durationMs: Math.round(performance.now() - t0),
    });
    return ok({ requestId: v.data.requestId, slots });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "findAvailableSlots failed");
  }
}

/**
 * EPIC 10 — onay 30 günlük SLA sayacını başlatır (bkz. `confirmMakeupSlot`/`computeSlaDeadline`).
 * 2026-09-30 (owner) — ONAYDA planlama gerekçesi (`decisionNote`) isteğe bağlı; iptal/ret notu zorunlu kalır.
 * Geçmiş tarih kabul edilir (üst sınır talebin son kullanım günü; kural validateLessonSlot'ta).
 */
export async function confirmMakeupLessonTool(
  ctx: ServiceContext,
  input: unknown
): Promise<
  ServiceResult<{
    requestId: string;
    lessonId?: string;
    communication?: import("../whatsapp-templates").MakeupLessonCommunicationDraft | null;
  }>
> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "AI_AGENT", "SUPER_ADMIN", "BRANCH_MANAGER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(
    z.object({
      requestId: z.string().min(1),
      slot: makeupSlotSchema,
      // 2026-09-30 — planlama gerekçesi isteğe bağlı; boş/yalnız boşluk → kaydedilmez (sahte metin yok).
      decisionNote: z
        .string()
        .max(1000, "Planlama gerekçesi en fazla 1000 karakter olabilir.")
        .optional()
        .transform((s) => (s?.trim() ? s.trim() : undefined)),
    }),
    input
  );
  if (!v.ok) return v;

  if (ctx.role === "BRANCH_MANAGER") {
    const req = (await readData()).makeupRequests.find((m) => m.id === v.data.requestId);
    if (!req) return fail("NOT_FOUND", "Telafi talebi bulunamadı");
    const gate = await assertBranchOperation(ctx, "makeup", "update", req.branchId);
    if (!gate.ok) return gate;
    const slotBranch = (v.data.slot as { branchId?: string }).branchId;
    if (slotBranch) {
      const slotGate = await assertBranchOperation(ctx, "makeup", "update", slotBranch);
      if (!slotGate.ok) return slotGate;
    }
  }

  try {
    await confirmSlot(v.data.requestId, v.data.slot as MakeupSlot, {
      decisionNote: v.data.decisionNote,
      decidedBy: ctx.userId,
    });
    const data = await readData();
    const req = data.makeupRequests.find((m) => m.id === v.data.requestId);
    const lesson = req?.confirmedLessonId
      ? data.lessons.find((l) => l.id === req.confirmedLessonId)
      : undefined;
    audit(ctx, "makeup.confirm", "MakeupRequest", v.data.requestId, {
      lessonId: req?.confirmedLessonId,
      decisionNote: v.data.decisionNote,
    });
    let communication: import("../whatsapp-templates").MakeupLessonCommunicationDraft | null = null;
    try {
      if (lesson) {
        const { notifyMakeupLessonScheduled } = await import("../lesson-notifications");
        await notifyMakeupLessonScheduled({
          tenantId: ctx.tenantId,
          lesson,
          actorUserId: ctx.userId,
        });
        const student = data.students.find((s) => s.id === lesson.studentId);
        const teacher = data.teachers.find((t) => t.id === lesson.teacherId);
        const branch = data.settings.branches.find((b) => b.id === lesson.branchId);
        if (student && teacher) {
          const { buildMakeupLessonScheduledDraft } = await import("../whatsapp-templates");
          communication = buildMakeupLessonScheduledDraft(
            data.settings.name,
            student,
            teacher,
            lesson,
            branch?.shortName ?? ""
          );
          const { createMakeupLessonCommunicationDrafts } = await import("../communications/service");
          await createMakeupLessonCommunicationDrafts({
            tenantId: ctx.tenantId,
            lessonId: lesson.id,
            createdBy: ctx.userId,
            parent: {
              name: student.parentName,
              phone: student.parentPhone,
              studentId: student.id,
              optOut: student.communicationOptOut,
              smsBody: communication.smsBody,
              whatsappBody: communication.parent.body,
            },
          });
        }
      }
    } catch {
      // best-effort — ders kaydı geri alınmaz; İletişim Merkezi taslağı oluşmasa da telafi kaydı kalıcıdır
    }
    return ok({
      requestId: v.data.requestId,
      lessonId: req?.confirmedLessonId,
      communication,
    });
  } catch (e) {
    // Kilit altındaki yeniden kontrol: saat az önce başka derse verildi (bkz. store-db assertSlotFreeLockedTx).
    if (e instanceof LessonSlotValidationError) return fail("CONFLICT", e.message);
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "confirmMakeupLesson failed");
  }
}

export async function createMakeupLessonTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ requestId: string }>> {
  /** Creates makeup credit via attendance (absent / school cancel) — reuses store */
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "TEACHER", "AI_AGENT", "SUPER_ADMIN", "BRANCH_MANAGER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(
    attendanceSchema.extend({
      status: z.enum(["absent", "cancelled_by_school"]),
    }),
    input
  );
  if (!v.ok) return v;

  if (ctx.role === "BRANCH_MANAGER") {
    const lesson = (await readData()).lessons.find((l) => l.id === v.data.lessonId);
    if (!lesson) return fail("NOT_FOUND", "Ders bulunamadı");
    const gate = await assertBranchOperation(ctx, "makeup", "create", lesson.branchId);
    if (!gate.ok) return gate;
  }

  if (ctx.role === "TEACHER") {
    const data = await readData();
    const lesson = data.lessons.find((l) => l.id === v.data.lessonId);
    if (!lesson) return fail("NOT_FOUND", "Ders bulunamadı");
    if (!canAccessTeacher(ctx, lesson.teacherId)) {
      return fail("FORBIDDEN", "Yalnızca kendi dersiniz için telafi oluşturabilirsiniz.");
    }
  }

  try {
    // Kota (pending/suggested/awaiting_info/confirmed sayılır) — store da korur.
    const before = await readData();
    const lesson = before.lessons.find((l) => l.id === v.data.lessonId);
    if (!lesson) return fail("NOT_FOUND", "Ders bulunamadı");
    const { assertCanCreateMakeup } = await import("../makeup-quota");
    const quota = assertCanCreateMakeup(before, lesson.studentId, new Date(), lesson.id);
    if (!quota.ok) return fail("VALIDATION_ERROR", quota.message);

    await markAttendance(v.data);
    const data = await readData();
    const req = data.makeupRequests.find((m) => m.sourceLessonId === v.data.lessonId);
    if (!req) return fail("CONFLICT", "Makeup request was not created");
    await notifyAttendanceExceptionBestEffort(ctx, v.data.lessonId, v.data.status);
    return ok({ requestId: req.id });
  } catch (e) {
    const { isMakeupQuotaExceededError } = await import("../makeup-quota");
    if (isMakeupQuotaExceededError(e)) {
      return fail("VALIDATION_ERROR", e instanceof Error ? e.message : "Telafi kotası aşıldı");
    }
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "createMakeupLesson failed");
  }
}

/** EPIC 10 — `decisionNote` ZORUNLU; hem iptal hem ret akışı bu tek yolu kullanır. */
export async function cancelMakeupLessonTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ requestId: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "AI_AGENT", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(
    z.object({
      requestId: z.string().min(1),
      decisionNote: z.string().min(1, "Karar notu zorunludur"),
    }),
    input
  );
  if (!v.ok) return v;

  try {
    await cancelMakeup(v.data.requestId, { decisionNote: v.data.decisionNote, decidedBy: ctx.userId });
    audit(ctx, "makeup.cancel", "MakeupRequest", v.data.requestId, {
      decisionNote: v.data.decisionNote,
    });
    return ok({ requestId: v.data.requestId });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "cancelMakeup failed");
  }
}

/**
 * EPIC 10 — SLA eskalasyon taraması. Yalnızca `slaDeadline` set edilmiş
 * (yani onaylanmış) talepleri kontrol eder; seviyesi YÜKSELEN her talep için
 * kaydı günceller + audit log yazar — aynı eşik için tekrar bildirim
 * ÜRETMEZ (idempotent). Bildirim KANALI (WhatsApp/uygulama-içi) bu turda
 * kapsam dışı bırakıldı — EPIC 1'in genel bildirim altyapısı henüz yok;
 * eskalasyon `slaEscalationLevel` alanında ve audit log'da görünür kalır.
 */
export async function checkMakeupSlaTool(
  ctx: ServiceContext
): Promise<ServiceResult<{ checked: number; escalated: MakeupSlaEscalation[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "AI_AGENT"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const data = await readData();
  const now = new Date().toISOString();
  const escalated: MakeupSlaEscalation[] = [];

  for (const request of data.makeupRequests) {
    if (!request.slaDeadline) continue;
    const previousLevel = request.slaEscalationLevel ?? 0;
    const newLevel = resolveSlaEscalationLevel(request.slaDeadline, now);
    if (newLevel <= previousLevel) continue;

    await updateMakeupSlaEscalation(request.id, newLevel);
    audit(ctx, "makeup.sla_escalation", "MakeupRequest", request.id, {
      previousLevel,
      newLevel,
      slaDeadline: request.slaDeadline,
    });
    escalated.push({
      requestId: request.id,
      studentId: request.studentId,
      previousLevel,
      newLevel,
      slaDeadline: request.slaDeadline,
    });
  }

  return ok({ checked: data.makeupRequests.length, escalated });
}

/**
 * 8. tur (B) — ders ekleme/seri pop-up'ının müsaitlik kartı. TEK okuma
 * (readData + denemeler paralel) ile şubedeki tüm uygun öğretmenlerin o
 * günkü pencere/meşgul aralıklarını döner; istemci (tarih, şube) başına
 * önbelleğe alır. Kural `validateLessonSlot` ile aynı yardımcılardan gelir.
 */
export async function teacherDayAvailabilityTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ date: string; branchId: string; teachers: import("../teacher-day-availability").TeacherDayAvailability[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "AI_AGENT", "SUPER_ADMIN", "BRANCH_MANAGER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih yyyy-aa-gg biçiminde olmalı."),
      branchId: z.string().min(1, "Önce şube seçin."),
    }),
    input
  );
  if (!v.ok) return v;
  const [data, trials] = await Promise.all([readData(), listTrialLessons(ctx.tenantId)]);
  const { buildTeacherDayAvailability } = await import("../teacher-day-availability");
  return ok({ ...v.data, teachers: buildTeacherDayAvailability(data, trials, v.data) });
}

export async function findAvailableTeachersTool(
  ctx: ServiceContext,
  input: unknown
): Promise<
  ServiceResult<{
    teachers: Array<{ id: string; name: string; branchId: string; instruments: string[] }>;
  }>
> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "AI_AGENT", "SUPER_ADMIN", "TEACHER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(
    z.object({
      instrument: z.string().optional(),
      branchId: z.string().min(1).optional(),
    }),
    input ?? {}
  );
  if (!v.ok) return v;

  const data = await readData();
  // Package D — pasif/işten ayrılmış öğretmen aday olarak asla dönmez;
  // şube filtresi (verildiyse) birincil + ek atanmış şubeleri birlikte
  // değerlendirir (teacherServesBranch), yalnız tek `branchId` alanına değil.
  let teachers = data.teachers.filter((t) => isTeacherSchedulable(t));
  if (v.data.instrument) {
    teachers = teachers.filter((t) =>
      t.instruments.includes(v.data.instrument as Instrument)
    );
  }
  if (v.data.branchId) {
    teachers = teachers.filter((t) => teacherServesBranch(t, v.data.branchId as string));
  }

  return ok({
    teachers: teachers.map((t) => ({
      id: t.id,
      name: t.name,
      branchId: t.branchId,
      instruments: t.instruments,
    })),
  });
}

/**
 * Tek öğrenci profili — mobil `(teacher)/ogrencilerim/:studentId` detay
 * ekranının ana çağrısı. Web tarafında bu bir server component + doğrudan
 * `readData()` filtrelemesiyle üretiliyor (ayrı bir tool hiç yoktu); mobil
 * için REST'e ihtiyaç var, bu yüzden AYNI erişim kuralı (`assertStudentAccess`
 * — öğretmen yalnızca kendi öğrencisi, admin herkes, veli/öğrenci kendi
 * erişimli kaydı) burada tool katmanına taşınıyor. Yeni bir yetkilendirme
 * kuralı İCAT EDİLMEDİ.
 */
export async function getStudentProfileTool(
  ctx: ServiceContext,
  input: unknown
): Promise<
  ServiceResult<{
    id: string;
    name: string;
    instruments: Instrument[];
    teacherId: string;
    teacherName?: string;
    packageName: string;
    weeklyLessonCount: number;
    phone: string;
    parentName: string;
    parentPhone: string;
    communicationOptOut: boolean;
    studentType?: StudentType;
    photoPath: string | null;
  }>
> {
  const v = parseOrFail(z.object({ studentId: z.string().min(1) }), input);
  if (!v.ok) return v;

  const data = await readReferenceData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  const access = await assertStudentAccess(ctx, student, v.data.studentId);
  if (!access.ok) return fail(access.code, access.message);

  const teacher = data.teachers.find((t) => t.id === student!.teacherId);
  const photo = await getProfilePhoto(ctx.tenantId, "student", student!.id);

  return ok({
    id: student!.id,
    name: student!.name,
    instruments: student!.instruments,
    teacherId: student!.teacherId,
    teacherName: teacher?.name,
    packageName: student!.packageName,
    weeklyLessonCount: student!.weeklyLessonCount,
    phone: student!.phone,
    parentName: student!.parentName,
    parentPhone: student!.parentPhone,
    communicationOptOut: !!student!.communicationOptOut,
    studentType: student!.studentType,
    photoPath: photo ? `/api/v1/students/${student!.id}/photo` : null,
  });
}

export async function getStudentScheduleTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ studentId: string; lessons: unknown[] }>> {
  const auth = requireRole(ctx, [
    "SCHOOL_ADMIN",
    "TEACHER",
    "STUDENT",
    "AI_AGENT",
    "SUPER_ADMIN",
  ]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(
    z.object({
      studentId: z.string().min(1),
      from: z.string().optional(),
      to: z.string().optional(),
    }),
    input
  );
  if (!v.ok) return v;

  const data = await readData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  const access = await assertStudentAccess(ctx, student, v.data.studentId);
  if (!access.ok) return fail(access.code, access.message);

  // Mobil `Lesson.teacherName` gösterim alanını doldurur — ham depo kaydı
  // yalnızca `teacherId` taşır, isim BURADA denormalize edilir (bkz.
  // getTeacherScheduleTool'daki simetrik studentName zenginleştirmesi).
  const teacherNameById = new Map(data.teachers.map((t) => [t.id, t.name]));
  const { from, to } = v.data;
  // Kök neden: `from`/`to` ve depodaki `startAt` farklı UTC ofset gösterimleri
  // taşıyabiliyor (mobil istemci her zaman `.toISOString()` ile "Z" gönderirken,
  // JSON store'daki kayıtlar "+03:00" yerel ofsetle saklanıyor) — ham string
  // karşılaştırması (`>=`/`<=`) bu durumda hafta sınırlarına yakın gerçek
  // dersleri yanlışça dışarıda bırakıyordu (örn. haftanın son günü akşam
  // dersleri). Karşılaştırma gerçek zaman damgası (epoch ms) üzerinden yapılmalı.
  const fromTs = from ? new Date(from).getTime() : undefined;
  const toTs = to ? new Date(to).getTime() : undefined;
  const lessons = data.lessons
    .filter((l) => l.studentId === v.data.studentId)
    .filter((l) => {
      const startTs = new Date(l.startAt).getTime();
      return (fromTs === undefined || startTs >= fromTs) && (toTs === undefined || startTs <= toTs);
    })
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .map((l) => ({ ...l, teacherName: teacherNameById.get(l.teacherId) }));

  return ok({ studentId: v.data.studentId, lessons });
}

/**
 * Mobil Gelişim ekranındaki "Ders devam özeti" — kök neden: bu uç nokta hiç
 * yoktu (`GET /api/v1/students/:studentId/attendance-summary` sadece
 * client'ta çağrılıyordu, sunucuda ne route ne tool vardı → ham Next.js HTML
 * 404). Tek doğruluk kaynağı `effectiveLessonOpsStatus` (lesson-ops.ts) —
 * burada YENİDEN hesaplanmıyor, yalnızca sayılıyor. Erişim kuralı diğer
 * öğrenci tool'larıyla AYNI (`assertStudentAccess`).
 */
export async function getStudentAttendanceSummaryTool(
  ctx: ServiceContext,
  input: unknown
): Promise<
  ServiceResult<{
    studentId: string;
    totalLessons: number;
    attended: number;
    absent: number;
    excused: number;
    makeup: number;
    pending: number;
  }>
> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "TEACHER", "STUDENT", "AI_AGENT", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(z.object({ studentId: z.string().min(1) }), input);
  if (!v.ok) return v;

  const data = await readData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  const access = await assertStudentAccess(ctx, student, v.data.studentId);
  if (!access.ok) return fail(access.code, access.message);

  const studentLessons = data.lessons.filter((l) => l.studentId === v.data.studentId);
  let attended = 0;
  let absent = 0;
  let excused = 0;
  let makeup = 0;
  let pending = 0;
  for (const lesson of studentLessons) {
    const status = effectiveLessonOpsStatus(lesson);
    if (status === "processed" || status === "attended") attended++;
    else if (status === "absent") absent++;
    else if (status === "excused") excused++;
    else if (status === "makeup") makeup++;
    else pending++;
  }

  return ok({
    studentId: v.data.studentId,
    totalLessons: studentLessons.length,
    attended,
    absent,
    excused,
    makeup,
    pending,
  });
}

/**
 * Mobil öğrenci detay ekranındaki "Genel gelişim skoru" — `computeStudentScore`
 * (bkz. student-score.ts) motorunun REST'e açılışı. Erişim kuralı
 * `getStudentScheduleTool` ile AYNI (`assertStudentAccess`) — kendi
 * öğrencisi olmayan bir öğretmen FORBIDDEN alır, var olmayan öğrenci
 * NOT_FOUND alır. periodStart/periodEnd verilmezse son 90 gün varsayılan.
 */
export async function getStudentScoreTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<StudentScoreReport>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "TEACHER", "STUDENT", "AI_AGENT", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(
    z.object({
      studentId: z.string().min(1),
      periodStart: z.string().optional(),
      periodEnd: z.string().optional(),
    }),
    input
  );
  if (!v.ok) return v;

  const data = await readData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  const access = await assertStudentAccess(ctx, student, v.data.studentId);
  if (!access.ok) return fail(access.code, access.message);

  const periodEnd = v.data.periodEnd ?? new Date().toISOString().slice(0, 10);
  const periodStart = v.data.periodStart ?? new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);

  const report = await computeStudentScore(data, ctx.tenantId, v.data.studentId, periodStart, periodEnd);
  return ok(report);
}

export async function getTeacherScheduleTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ teacherId: string; lessons: unknown[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "TEACHER", "AI_AGENT", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(z.object({ teacherId: z.string().min(1) }), input);
  if (!v.ok) return v;
  if (!canAccessTeacher(ctx, v.data.teacherId)) {
    return fail("FORBIDDEN", "Cannot access this teacher's schedule");
  }

  const data = await readData();
  const teacher = data.teachers.find((t) => t.id === v.data.teacherId);
  if (!teacher) return fail("NOT_FOUND", "Teacher not found");

  // Mobil `Lesson.studentName` gösterim alanını doldurur — ham depo kaydı
  // yalnızca `studentId` taşır, isim BURADA denormalize edilir (kök neden:
  // mobil haftalık program kartları isim yerine "Öğrenci" jenerik metnine
  // düşüyordu, bkz. getStudentScheduleTool'daki simetrik teacherName
  // zenginleştirmesi).
  const studentNameById = new Map(data.students.map((s) => [s.id, s.name]));
  const lessons = data.lessons
    .filter((l) => l.teacherId === v.data.teacherId)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .map((l) => ({ ...l, studentName: studentNameById.get(l.studentId) }));

  return ok({ teacherId: v.data.teacherId, lessons });
}

export type TeacherStudentListItem = {
  id: string;
  name: string;
  instruments: Instrument[];
  studentType?: StudentType;
  nextLessonAt: string | null;
  homeworkPendingCount: number;
  score: number | null;
  photoPath: string | null;
};

/**
 * Öğretmenin kendi öğrenci listesi — mobil `(teacher)/ogrencilerim` ekranı.
 * `ownStudents` web öğretmen portalıyla AYNI sahiplik yardımcısı (bkz.
 * src/lib/teacher-portal-scope.ts, src/app/ogretmen/*). `nextLessonAt`/
 * `homeworkPendingCount`/`score` bilinçli olarak hesaplanmıyor — bu liste
 * uç noktasının kapsamı yalnızca "kendi öğrencilerim" 404'ünü gidermek
 * (bkz. Mobil Baseline Hotfix Bölüm B); tam skor/özet hesaplaması her
 * öğrenci için pahalı (bkz. computeStudentScore, çoklu store okuması) ve
 * ayrı bir iş kapsamı — mobil `StudentCard` bu alanları zaten opsiyonel
 * gösterir (bkz. student-card.tsx), eksikliği ekranı kırmaz.
 */
export async function listTeacherStudentsTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ students: TeacherStudentListItem[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "TEACHER", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(z.object({ teacherId: z.string().min(1) }), input);
  if (!v.ok) return v;
  if (!canAccessTeacher(ctx, v.data.teacherId)) {
    return fail("FORBIDDEN", "Bu öğretmenin öğrenci listesine erişiminiz yok.");
  }

  const data = await readReferenceData();
  const students = ownStudents(data.students, v.data.teacherId).filter((s) => s.active);
  const photoMeta = await listProfilePhotoMeta(
    ctx.tenantId,
    "student",
    students.map((s) => s.id)
  );

  return ok({
    students: students.map((s) => ({
      id: s.id,
      name: s.name,
      instruments: s.instruments,
      studentType: s.studentType,
      nextLessonAt: null,
      homeworkPendingCount: 0,
      score: null,
      photoPath: photoMeta.has(s.id) ? `/api/v1/students/${s.id}/photo` : null,
    })),
  });
}

export type FindPersonScheduleResult =
  | { matchType: "none"; query: string }
  | {
      matchType: "ambiguous";
      query: string;
      candidates: Array<{ kind: "student" | "teacher"; id: string; name: string }>;
    }
  | {
      matchType: "student" | "teacher";
      id: string;
      name: string;
      upcomingLessons: unknown[];
    };

/**
 * Free-text name → schedule. TEACHER only matches own students (ownership via
 * canAccessStudent + teacherId) and self among teachers.
 */
export async function findPersonScheduleTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<FindPersonScheduleResult>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "TEACHER", "STUDENT", "AI_AGENT", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(z.object({ query: z.string().min(1).max(120) }), input);
  if (!v.ok) return v;

  const needle = v.data.query.trim().toLocaleLowerCase("tr");
  if (!needle) return fail("VALIDATION_ERROR", "query boş olamaz");

  const data = await readData();
  const nameMatchedStudents = data.students.filter(
    (s) => s.active && s.name.toLocaleLowerCase("tr").includes(needle)
  );
  const studentAccessFlags = await Promise.all(
    nameMatchedStudents.map((s) => canAccessStudent(ctx, s.id, { teacherId: s.teacherId }))
  );
  const students = nameMatchedStudents.filter((_s, i) => studentAccessFlags[i]);
  const teachers = data.teachers.filter(
    (t) => t.active && t.name.toLocaleLowerCase("tr").includes(needle) && canAccessTeacher(ctx, t.id)
  );

  const total = students.length + teachers.length;
  if (total === 0) return ok({ matchType: "none", query: v.data.query });

  if (total > 1) {
    return ok({
      matchType: "ambiguous",
      query: v.data.query,
      candidates: [
        ...students.map((s) => ({ kind: "student" as const, id: s.id, name: s.name })),
        ...teachers.map((t) => ({ kind: "teacher" as const, id: t.id, name: t.name })),
      ].slice(0, 8),
    });
  }

  const now = Date.now();
  if (students.length === 1) {
    const s = students[0];
    const upcomingLessons = data.lessons
      .filter((l) => l.studentId === s.id && l.status === "scheduled" && new Date(l.startAt).getTime() >= now)
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
      .slice(0, 5);
    return ok({ matchType: "student", id: s.id, name: s.name, upcomingLessons });
  }

  const t = teachers[0];
  const upcomingLessons = data.lessons
    .filter((l) => l.teacherId === t.id && l.status === "scheduled" && new Date(l.startAt).getTime() >= now)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .slice(0, 5);
  return ok({ matchType: "teacher", id: t.id, name: t.name, upcomingLessons });
}

export type GlobalSearchResultItem = {
  kind: "student" | "teacher" | "staff";
  id: string;
  label: string;
  description?: string;
};

/**
 * Panel command palette'in varlık araması — öğrenci/öğretmen/personel.
 * `findPersonScheduleTool` ile AYNI RBAC kapsamlama deseni (canAccessStudent/
 * canAccessTeacher, TEACHER yalnız kendi öğrencilerini/kendini görür) ama
 * "tam eşleşmeyi çöz" değil "ilk N eşleşmeyi listele" amaçlı — arama kutusu
 * içindir, tek bir sonuca zorlamaz. Personel yalnız SCHOOL_ADMIN/SUPER_ADMIN
 * için döner (listStaffTool ile AYNI yetki sınırı). Türkçe/ASCII toleranslı
 * arama TEK kaynak `foldTurkishForSearch` ile yapılır (StudentAttendancePicker
 * ile aynı fonksiyon, ikinci bir normalize mantığı yazılmadı).
 */
export async function globalSearchTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ items: GlobalSearchResultItem[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "TEACHER", "SUPER_ADMIN", "AI_AGENT"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(z.object({ query: z.string().min(1).max(120) }), input);
  if (!v.ok) return v;

  const needle = foldTurkishForSearch(v.data.query);
  if (!needle) return ok({ items: [] });
  // Faz 12 — insan-okunur numaradan da (ör. "S00012") aranabilsin.
  const displayIdNeedle = v.data.query.trim().toUpperCase();
  const matchesDisplayId = (displayId?: string) => !!displayId && displayId.toUpperCase().includes(displayIdNeedle);

  const data = await readReferenceData();
  const branchShortName = (branchId?: string) =>
    branchId ? data.settings.branches.find((b) => b.id === branchId)?.shortName : undefined;

  const nameMatchedStudents = data.students.filter(
    (s) => s.active && (foldTurkishForSearch(s.name).includes(needle) || matchesDisplayId(s.displayId))
  );
  const studentAccessFlags = await Promise.all(
    nameMatchedStudents.map((s) => canAccessStudent(ctx, s.id, { teacherId: s.teacherId }))
  );
  const students: GlobalSearchResultItem[] = nameMatchedStudents
    .filter((_s, i) => studentAccessFlags[i])
    .slice(0, 6)
    .map((s) => ({
      kind: "student" as const,
      id: s.id,
      label: s.name,
      description: [s.displayId, branchShortName(s.branchId)].filter(Boolean).join(" · ") || undefined,
    }));

  const teachers: GlobalSearchResultItem[] = data.teachers
    .filter(
      (t) =>
        t.active &&
        (foldTurkishForSearch(t.name).includes(needle) || matchesDisplayId(t.displayId)) &&
        canAccessTeacher(ctx, t.id)
    )
    .slice(0, 6)
    .map((t) => ({
      kind: "teacher" as const,
      id: t.id,
      label: t.name,
      description: [t.displayId, t.instruments?.join(", ")].filter(Boolean).join(" · ") || undefined,
    }));

  let staff: GlobalSearchResultItem[] = [];
  // Personel sonuçları yalnız kurum sahibine (requireStaffSensitiveAccess ile aynı kural).
  if (requireStaffSensitiveAccess(ctx).ok) {
    const staffList = await listStaff(ctx.tenantId);
    staff = staffList
      .filter(
        (p) =>
          p.status !== "terminated" &&
          (foldTurkishForSearch(p.name).includes(needle) || matchesDisplayId(p.displayId))
      )
      .slice(0, 6)
      .map((p) => ({
        kind: "staff" as const,
        id: p.id,
        label: p.name,
        description: [p.displayId, p.position].filter(Boolean).join(" · ") || undefined,
      }));
  }

  return ok({ items: [...students, ...teachers, ...staff] });
}

export async function getParentBalanceTool(
  ctx: ServiceContext,
  input: unknown
): Promise<
  ServiceResult<{
    studentId: string;
    payments: unknown[];
    outstanding: number;
  }>
> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "STUDENT", "AI_AGENT", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(z.object({ studentId: z.string().min(1) }), input);
  if (!v.ok) return v;

  const data = await readData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  const access = await assertStudentAccess(ctx, student, v.data.studentId);
  if (!access.ok) return fail(access.code, access.message);

  const payments = data.payments.filter((p) => p.studentId === v.data.studentId);
  const outstanding = payments
    .filter((p) => p.status !== "paid")
    .reduce((s, p) => s + (p.amount - p.paidAmount), 0);

  return ok({ studentId: v.data.studentId, payments, outstanding });
}

export async function createPaymentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ paymentId: string; status: string }>> {
  /** Marks existing payment as paid — create-new not in store yet */
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "AI_AGENT", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const moduleGate = await assertFeatureEnabled(ctx.tenantId, "payments");
  if (!moduleGate.ok) return moduleGate;

  const v = parseOrFail(
    z.object({
      paymentId: z.string().min(1),
      method: z.enum(["credit_card", "cash", "transfer"]).optional(),
      /** Paket 5 — modal üzerinden elle girilen tahsil edilen tutar. Verilmezse ödemenin tam tutarı kullanılır. */
      amount: z.number().positive().optional(),
      /** ISO tarih (yyyy-MM-dd) — verilmezse şimdi. */
      paidAt: z.string().optional(),
      paymentNote: z.string().max(500).optional(),
    }),
    input
  );
  if (!v.ok) return v;

  try {
    const data = await readData();
    const existing = data.payments.find((p) => p.id === v.data.paymentId);
    if (!existing) return fail("NOT_FOUND", "Ödeme bulunamadı");
    // İdempotency: zaten "paid" ise sessizce mevcut durumu döner — çift tık/tekrar istek yeni bir yan etki yaratmaz.
    if (existing.status === "paid") {
      return ok({ paymentId: v.data.paymentId, status: "paid" });
    }
    // paidAt bilinçli verilmezse fiili tahsil anı = şimdi (vade/createdAt kullanılmaz).
    let paidAt = v.data.paidAt;
    if (!paidAt) paidAt = new Date().toISOString();
    else if (/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) {
      paidAt = new Date(`${paidAt}T12:00:00`).toISOString();
    }
    const { collectPayment } = await import("../payments/collect");
    const collected = await collectPayment(v.data.paymentId, {
      method: v.data.method,
      amount: v.data.amount,
      paidAt,
      paymentNote: v.data.paymentNote,
      receivedByUserId: ctx.userId,
      actorUserId: ctx.userId,
      tenantId: ctx.tenantId,
    });
    // Notify admins and the student about the payment received.
    try {
      const { notifyAdmins } = await import("../manager-notifications");
      const { resolveActorLabel } = await import("../contract-payment-plan-view");
      const actorName = await resolveActorLabel({ tenantId: ctx.tenantId, userId: ctx.userId, teachers: data.teachers });
      const studentName = data.students.find((s) => s.id === existing.studentId)?.name ?? "Öğrenci";
      const collectedAmount = v.data.amount ?? existing.amount - (existing.paidAmount ?? 0);
      await notifyAdmins(ctx.tenantId, "payment_received", {
        title: "Ödeme alındı",
        body: `${studentName} için ${formatMoney(collectedAmount)} tahsilat ${actorName} tarafından alındı. Detay: /panel/odemeler/${v.data.paymentId}`,
      }, { excludeUserId: ctx.userId, dedupeKey: v.data.paymentId });
    } catch {
      // best-effort
    }
    try {
      const { getUserIdByStudentId } = await import("../auth/users");
      const { isCategoryEnabledForUser } = await import("../notification-preferences");
      const { createNotification, listNotificationsForUser } = await import("../notifications");
      const data = await readData();
      const payment = data.payments.find((p) => p.id === v.data.paymentId);
      const studentUserId = payment ? await getUserIdByStudentId(ctx.tenantId, payment.studentId) : null;
      if (studentUserId) {
        const enabled = await isCategoryEnabledForUser(ctx.tenantId, studentUserId, "payment_received");
        if (enabled) {
          const since = Date.now() - 24 * 60 * 60 * 1000;
          const existing = await listNotificationsForUser({ tenantId: ctx.tenantId, userId: studentUserId });
          const dup = existing.some((n) => n.kind === "payment_received" && n.body.includes(v.data.paymentId) && new Date(n.createdAt).getTime() >= since);
          if (!dup && payment) {
            await createNotification({
              tenantId: ctx.tenantId,
              targetUserId: studentUserId,
              kind: "payment_received",
              title: "Ödemeniz alındı",
              body: `Ödeme (${payment.amount} TL) kaydedildi. Detay: /panel/odemeler/${payment.id}`,
            });
          }
        }
      }
    } catch {
      // best-effort
    }
    audit(ctx, "payment.mark_paid", "Payment", v.data.paymentId, {
      method: v.data.method,
      amount: collected.payment.paidAmount,
      status: collected.payment.status,
      paidAt,
      receivedByUserId: ctx.userId,
    });
    return ok({ paymentId: v.data.paymentId, status: collected.payment.status });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "createPayment failed");
  }
}

export async function updatePaymentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ paymentId: string }>> {
  /** Zaten "paid" bir ödemenin yöntem/tutar/not/tahsilat anı alanlarını düzenler. */
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(
    z.object({
      paymentId: z.string().min(1),
      method: z.enum(["credit_card", "cash", "transfer"]).optional(),
      amount: z.number().positive().optional(),
      paymentNote: z.string().max(500).optional(),
      /** ISO datetime veya yyyy-MM-dd — tahsilat anı. */
      paidAt: z.string().min(1).optional(),
    }),
    input
  );
  if (!v.ok) return v;

  try {
    const data = await readData();
    const existing = data.payments.find((p) => p.id === v.data.paymentId);
    if (!existing) return fail("NOT_FOUND", "Ödeme bulunamadı");
    if (existing.status !== "paid" && existing.status !== "partial") {
      return fail("VALIDATION_ERROR", "Yalnızca tahsil edilmiş (paid/partial) ödemeler düzenlenebilir.");
    }

    let paidAt = v.data.paidAt;
    if (paidAt && /^\d{4}-\d{2}-\d{2}$/.test(paidAt)) {
      // Yalnız tarih geldiyse mevcut saati (veya öğlen) koru.
      const prev = existing.paidAt ? new Date(existing.paidAt) : new Date();
      const [y, m, d] = paidAt.split("-").map(Number);
      prev.setFullYear(y!, m! - 1, d);
      paidAt = prev.toISOString();
    }

    // Fatura tutarı revizyonu: kayıt anı ilk tahsilatı veya tam ödenmiş
    // kayıtlarda amount+paidAmount birlikte güncellenir. Kısmi ödemede
    // (paidAmount < amount) yalnız tahsilat tutarı değişir — taksit anaparası
    // korunur.
    const reviseBilledAmount =
      v.data.amount !== undefined &&
      (existing.source === "registration_first_payment" || existing.paidAmount === existing.amount);

    const { collectPayment } = await import("../payments/collect");
    await collectPayment(v.data.paymentId, {
      method: v.data.method,
      amount: v.data.amount,
      paymentNote: v.data.paymentNote,
      paidAt,
      actorUserId: ctx.userId,
      tenantId: ctx.tenantId,
      voided: v.data.amount === 0,
      reviseBilledAmount,
    });
    const studentName = data.students.find((st) => st.id === existing.studentId)?.name;
    audit(ctx, "payment.update", "Payment", v.data.paymentId, {
      method: v.data.method,
      amount: v.data.amount,
      paidAt,
      reviseBilledAmount,
      studentId: existing.studentId,
      entityName: studentName ? `${studentName} ödemesi` : undefined,
      changes: diffRecordFields(
        { method: existing.method, paidAmount: existing.paidAmount, amount: existing.amount, paidAt: existing.paidAt, paymentNote: existing.paymentNote },
        {
          method: v.data.method,
          paidAmount: v.data.amount,
          amount: reviseBilledAmount ? v.data.amount : undefined,
          paidAt,
          paymentNote: v.data.paymentNote,
        }
      ),
    });
    return ok({ paymentId: v.data.paymentId });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "updatePayment failed");
  }
}

/**
 * Karma Öğrenci Portalı — task #35. Sağlayıcı-barındırmalı (hosted) online
 * kredi kartı checkout'u BAŞLATIR; asla kart/CVV verisi almaz/saklamaz
 * (bkz. `src/lib/payment-provider/types.ts`). Gerçek bir sağlayıcı
 * bağlanmadıkça (`getPaymentProvider().isConfigured()` false) FAIL-CLOSED
 * döner — hiçbir sahte checkout URL'i üretilmez, hiçbir
 * `PaymentCheckoutAttempt`/`Payment` durumu "pending"/"succeeded"e taşınmaz.
 */
export async function initiateStudentPaymentCheckoutTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ checkoutUrl: string }>> {
  const auth = requireRole(ctx, ["STUDENT", "SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  // successUrl/cancelUrl/buyerIp BİLİNÇLİ OLARAK client body'sinden DEĞİL —
  // route katmanında sunucu tarafında (request.url origin + clientIp)
  // hesaplanıp buraya geçirilir; yalnızca kullanıcı deneyimi (ödeme sonrası
  // nereye döneceği) içindir, hiçbir yetkilendirme/ödeme kararına girmez —
  // "paid" durumuna geçiş SADECE doğrulanmış webhook'la olur (bkz. webhook route).
  const v = parseOrFail(
    z.object({
      paymentId: z.string().min(1),
      successUrl: z.string().url(),
      cancelUrl: z.string().url(),
      buyerIp: z.string().min(1),
    }),
    input
  );
  if (!v.ok) return v;

  const data = await readData();
  const payment = data.payments.find((p) => p.id === v.data.paymentId);
  if (!payment) return fail("NOT_FOUND", "Ödeme bulunamadı");

  // Öğrenci sahipliği + AKTİF StudentPortalAccess (GUARDIAN veya SELF) —
  // tek gerçek kaynak assertStudentAccess/canAccessStudent (async).
  const student = data.students.find((s) => s.id === payment.studentId);
  const access = await assertStudentAccess(ctx, student, payment.studentId);
  if (!access.ok) return fail(access.code, access.message);

  // Fail-closed: yalnızca gerçekten TAHSİL EDİLEBİLİR durumdaki ödemeler için
  // checkout başlatılabilir. "voided" bir ödemenin amount/paidAmount farkı
  // pozitif KALABİLİR (void, ödemeyi 0'a çekmez, yalnızca statüsünü
  // değiştirir) — yalnızca kalan tutara bakmak "voided"/"paid" bir ödeme
  // için checkout'a izin verebilirdi; status'u AYRICA açıkça doğrularız.
  if (payment.status === "paid" || payment.status === "voided") {
    return fail("VALIDATION_ERROR", "Bu ödeme için online tahsilat başlatılamaz (ödeme kapalı).");
  }
  const remaining = Math.max(payment.amount - payment.paidAmount, 0);
  if (remaining <= 0) return fail("VALIDATION_ERROR", "Bu ödeme için kalan bakiye yok.");
  if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı");

  const { getPaymentProvider } = await import("../payment-provider/provider-factory");
  const provider = getPaymentProvider();
  // Fail-closed: sağlayıcı yapılandırılmadıysa hiçbir DB kaydı OLUŞTURULMAZ.
  if (!provider.isConfigured()) {
    return fail("CONFLICT", "Online ödeme sağlayıcısı henüz yapılandırılmadı.");
  }

  const {
    findPendingCheckoutAttempt,
    createCheckoutAttempt,
    setCheckoutAttemptProviderDetails,
    markCheckoutAttemptFailed,
  } = await import("../payment-checkout");

  // İdempotency — double-click/retry: hâlâ geçerli (pending, süresi
  // geçmemiş) VE zaten bir checkoutUrl'i olan bir deneme varsa, sağlayıcıyı
  // TEKRAR ÇAĞIRMADAN AYNI URL'i döneriz (ikinci bir sağlayıcı işlemi asla
  // açılmaz).
  const existingPending = await findPendingCheckoutAttempt(ctx.tenantId, v.data.paymentId);
  if (existingPending?.checkoutUrl) {
    audit(ctx, "payment.checkout_reused", "Payment", v.data.paymentId, { provider: existingPending.provider });
    return ok({ checkoutUrl: existingPending.checkoutUrl });
  }
  const idempotencyKey = existingPending?.idempotencyKey ?? uid("checkout");

  const branch = data.settings.branches.find((b) => b.id === student.branchId);
  const [buyerName, ...buyerSurnameParts] = student.name.trim().split(/\s+/);
  const result = await provider.createCheckout({
    tenantId: ctx.tenantId,
    paymentId: v.data.paymentId,
    amount: remaining,
    currency: "TRY",
    description: payment.description,
    successUrl: v.data.successUrl,
    cancelUrl: v.data.cancelUrl,
    idempotencyKey,
    buyer: {
      id: student.id,
      name: buyerName || student.name,
      surname: buyerSurnameParts.join(" ") || "-",
      email: student.email || "odeme@neviihub.app",
      phone: student.phone || student.parentPhone || "",
      ip: v.data.buyerIp,
      addressLine: branch?.address || data.settings.name || "-",
      city: branch?.city || "İstanbul",
      country: "Turkey",
    },
  });

  const attempt =
    existingPending ??
    (await createCheckoutAttempt({
      tenantId: ctx.tenantId,
      paymentId: v.data.paymentId,
      studentId: payment.studentId,
      initiatedByUserId: ctx.userId,
      provider: provider.name,
      amount: remaining,
      currency: "TRY",
      idempotencyKey,
    }));

  if (!result.ok) {
    await markCheckoutAttemptFailed(ctx.tenantId, attempt.id);
    audit(ctx, "payment.checkout_failed", "Payment", v.data.paymentId, { errorCode: result.errorCode });
    return fail("INTERNAL_ERROR", result.error);
  }

  await setCheckoutAttemptProviderDetails(ctx.tenantId, attempt.id, {
    providerReference: result.providerReference,
    checkoutUrl: result.checkoutUrl,
  });
  audit(ctx, "payment.checkout_initiated", "Payment", v.data.paymentId, { provider: provider.name });
  return ok({ checkoutUrl: result.checkoutUrl });
}

export async function sendParentMessageTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ message: WaMessage }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "AI_AGENT", "SUPER_ADMIN", "TEACHER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(
    z.object({
      studentId: z.string().min(1),
      kind: z.enum(["makeup_created", "makeup_confirmed"]).default("makeup_created"),
      makeupRequestId: z.string().optional(),
    }),
    input
  );
  if (!v.ok) return v;

  const data = await readData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  const access = await assertStudentAccess(ctx, student, v.data.studentId);
  if (!access.ok) return fail(access.code, access.message);
  if (!student) return fail("NOT_FOUND", "Student not found");

  let message: WaMessage | null = null;
  if (v.data.kind === "makeup_created") {
    const req = data.makeupRequests.find(
      (m) =>
        m.id === v.data.makeupRequestId ||
        (m.studentId === student.id &&
          (m.status === "pending" || m.status === "suggested" || m.status === "awaiting_info"))
    );
    if (!req) return fail("NOT_FOUND", "Makeup request not found for parent message");
    const branch = data.settings.branches.find((b) => b.id === req.branchId);
    message = templateMakeupCreated(data.settings.name, student, req, branch?.shortName ?? "");
  } else {
    const req = data.makeupRequests.find(
      (m) => m.id === v.data.makeupRequestId && m.status === "confirmed"
    );
    if (!req?.confirmedLessonId) {
      return fail("NOT_FOUND", "Confirmed makeup lesson not found");
    }
    const lesson = data.lessons.find((l) => l.id === req.confirmedLessonId);
    const teacher = data.teachers.find((t) => t.id === lesson?.teacherId);
    const branch = data.settings.branches.find((b) => b.id === lesson?.branchId);
    if (!lesson || !teacher) return fail("NOT_FOUND", "Lesson or teacher missing");
    message = templateMakeupConfirmed(
      data.settings.name,
      student,
      lesson,
      teacher,
      branch?.shortName || ""
    );
  }

  return ok({ message });
}

export async function sendTeacherMessageTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ message: WaMessage }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "AI_AGENT", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(
    z.object({
      makeupRequestId: z.string().min(1),
    }),
    input
  );
  if (!v.ok) return v;

  const data = await readData();
  const req = data.makeupRequests.find((m) => m.id === v.data.makeupRequestId);
  if (!req?.confirmedLessonId) return fail("NOT_FOUND", "Confirmed makeup not found");
  const lesson = data.lessons.find((l) => l.id === req.confirmedLessonId);
  const teacher = data.teachers.find((t) => t.id === lesson?.teacherId);
  const student = data.students.find((s) => s.id === req.studentId);
  const branch = data.settings.branches.find((b) => b.id === lesson?.branchId);
  if (!lesson || !teacher || !student) return fail("NOT_FOUND", "Related entities missing");

  const message = templateTeacherMakeupAssigned(
    data.settings.name,
    teacher,
    student,
    lesson,
    branch?.shortName || ""
  );
  return ok({ message });
}

export async function createStudentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ studentId: string; tempLoginPassword?: string; warnings?: string[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "AI_AGENT", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  // NeviiOS — kurumun Yeni Öğrenci Kaydı konfigürasyonu SUNUCUDA uygulanır
  // (zorunluluk, gizli alan, rol bazlı düzenleme, varsayılan). Varsayılan
  // konfigürasyon boştur → davranış değişmez.
  const shaped = applyStudentFormConfig(
    await getStudentFormConfig(ctx.tenantId),
    input && typeof input === "object" ? (input as Record<string, unknown>) : {},
    ctx.role
  );
  if (!shaped.ok) return fail("VALIDATION_ERROR", shaped.message);

  const v = parseOrFail(studentSchema, shaped.value);
  if (!v.ok) return v;

  try {
    const before = await readData();
    // Paket limiti yalnız YENİ kaydı engeller; mevcut öğrenciler etkilenmez.
    const limit = await assertWithinLimit(
      ctx.tenantId,
      "students",
      before.students.filter((st) => st.active !== false).length
    );
    if (!limit.ok) return limit;
    // MT-003 — seçilen öğretmenin AKTİF, AYNI TENANT'ta (`before.teachers`
    // zaten tenant-scoped — cross-tenant bir ID burada asla bulunamaz) ve
    // seçilen enstrümana yetkin olduğu sunucuda doğrulanır; filtre yalnız
    // UI'da kalmaz. Öğretmenin birden fazla enstrümanı varsa eşleşen
    // herhangi biri yeterlidir.
    // P0-A — enstrüman TEK gerçek kaynak: tenant'ın aktif kataloğu
    // (`resolveActiveInstrumentNames` — CSV import/öğretmen formlarının
    // ZATEN kullandığı AYNI merkez fonksiyon, öğrenci kaydında eksikti).
    // Bu, öğretmenin `instruments` listesinden BAĞIMSIZ bir kontroldür:
    // pasife alınmış veya hiç var olmayan bir enstrüman, bir öğretmenin
    // eski/tutarsız `instruments` verisinde görünse bile reddedilir.
    const activeInstrumentNames = await resolveActiveInstrumentNames(ctx.tenantId);
    if (!activeInstrumentNames.includes(v.data.instrument)) {
      return fail(
        "VALIDATION_ERROR",
        `"${v.data.instrument}" bu kurumda aktif bir enstrüman değil. Enstrüman kataloğundan aktif bir enstrüman seçin.`
      );
    }
    const teacher = before.teachers.find((t) => t.id === v.data.teacherId);
    if (!teacher) {
      return fail("VALIDATION_ERROR", "Seçilen öğretmen bulunamadı veya bu kuruma ait değil.");
    }
    if (!isTeacherSchedulable(teacher)) {
      return fail("VALIDATION_ERROR", `"${teacher.name}" pasif/işten ayrılmış — aktif bir öğretmen seçin.`);
    }
    if (!teacher.instruments.includes(v.data.instrument as Instrument)) {
      return fail(
        "VALIDATION_ERROR",
        `"${teacher.name}" "${v.data.instrument}" enstrümanını öğretmiyor. Bu enstrümanı öğreten aktif bir öğretmen seçin.`
      );
    }

    // P0-C (2026-09-02) — `lessonDays` GÖNDERİLDİYSE (boş dizi/undefined
    // ise bu kontrol atlanır — geriye dönük uyum: mevcut çağıranlar/testler
    // bu alanı hiç bilmiyordu), `weeklyLessonCount` ile TAM ve TEKİL
    // eşleşmesi sunucuda zorunlu kılınır — istemcinin `required` işaretine
    // GÜVENİLMEZ. Gerçek kayıt formu akışında (`actionAddStudent`) bu alan
    // AYRICA kesin zorunlu kılınır (bkz. actions.ts) — burada yalnız
    // GÖNDERİLDİĞİNDE şekli doğru mu diye bakılır.
    if (v.data.lessonDays && v.data.lessonDays.length > 0) {
      const uniqueLessonDays = new Set(v.data.lessonDays);
      if (v.data.lessonDays.length !== v.data.weeklyLessonCount || uniqueLessonDays.size !== v.data.lessonDays.length) {
        const msg = `Haftalık ${v.data.weeklyLessonCount} ders için ${v.data.weeklyLessonCount} farklı ders günü seçmelisiniz.`;
        return fail("VALIDATION_ERROR", msg, { fieldErrors: { lessonDays: [msg] } });
      }
    }

    // MEB Paneli (2026-09-28) — "MEB ise zorunlu" TEK sunucu kapısı (bkz.
    // src/lib/meb.ts). Tür LİSTESİNE bakılır (legacy tekil `studentType`
    // yalnız fallback). Deneme-dönüşüm/içe aktarma/AI-agent dahil TÜM
    // kayıt yolları buradan geçer — istemcinin `required` işaretine
    // GÜVENİLMEZ. MEB dönemi genel kayıt/ders tarihlerine ASLA yazılmaz.
    const mebTypes = effectiveStudentTypes({ studentTypes: v.data.studentTypes, studentType: v.data.studentType });
    const mebIsMeb = isMebStudent({ studentTypes: v.data.studentTypes, studentType: v.data.studentType });
    const mebCheck = validateMebFields({
      studentTypes: mebTypes,
      level: v.data.level,
      mebLevelStartDate: v.data.mebLevelStartDate,
      mebLevelEndDate: v.data.mebLevelEndDate,
      mebExamDate: v.data.mebExamDate,
      mebExamAttended: v.data.mebExamAttended,
    });
    if (!mebCheck.ok) {
      return fail("VALIDATION_ERROR", "MEB alanlarını kontrol edin — işaretli alanlarda eksik veya hatalı bilgi var.", {
        fieldErrors: mebCheck.fieldErrors,
      });
    }

    // Package C — paket seçildiyse aylık ücret HER ZAMAN sunucuda, tek
    // merkez helper (computeMonthlyFee) ile hesaplanır; istemciden gelen
    // `monthlyFee` paket akışında YOK SAYILIR (iki çelişkili fiyat kaynağı
    // olmasın diye). Paket seçilmediyse legacy serbest `monthlyFee` girişi
    // aynen korunur.
    let pricing: {
      monthlyFee: number;
      packageBaseMonthlyFee?: number;
      discountType?: Student["discountType"];
      discountValue?: number;
      monthlyFeeManualOverride: boolean;
      monthlyFeeOverrideReason?: string;
      appliedCampaignIds?: string[];
    } = { monthlyFee: v.data.monthlyFee, monthlyFeeManualOverride: false };
    // Paket & Kampanya Motoru — soft uyarılar (limit dolumu vb., hard engel DEĞİL).
    const registrationWarnings: string[] = [];

    if (!v.data.packageId && (v.data.discountType || v.data.discountValue !== undefined || v.data.monthlyFeeOverrideAmount !== undefined)) {
      return fail("VALIDATION_ERROR", "İndirim/manuel ücret yalnızca bir paket seçildiğinde uygulanabilir.");
    }

    // Paket & Kampanya Motoru — kampanya indirimi TEK indirim kaynağı kuralı:
    // campaignIds + manuel discountType/discountValue BİRLİKTE gönderilemez.
    // Sunucu her kampanyayı (aktif + tarih + şube) yeniden doğrular, çakışmayı
    // `resolveCampaignStack` ile çözer; istemcinin gönderdiği yüzdeye GÜVENİLMEZ.
    // Kampanya PAKETTEN BAĞIMSIZ seçilebilir: paketliyse paket tabanına,
    // paketsiz (legacy) ise serbest aylık ücrete uygulanır.
    let appliedCampaignIds: string[] | undefined;
    let campaignDiscountPercent: number | undefined;
    if ((v.data.campaignIds?.length ?? 0) > 0) {
      if (v.data.discountType || v.data.discountValue !== undefined) {
        return fail(
          "VALIDATION_ERROR",
          "Kampanya seçildiğinde manuel indirim girilemez — indirimi kampanya belirler, ya kampanyayı kaldırın ya manuel indirimi silin."
        );
      }
      const { applicableCampaigns, resolveCampaignStack, campaignLimitWarning } = await import(
        "../discount-campaigns"
      );
      const selected = (v.data.campaignIds ?? [])
        .map((id) => (before.discountCampaigns ?? []).find((c) => c.id === id))
        .filter((c): c is NonNullable<typeof c> => !!c);
      if (selected.length !== (v.data.campaignIds ?? []).length) {
        return fail("VALIDATION_ERROR", "Seçilen kampanyalardan biri bulunamadı veya bu kuruma ait değil.");
      }
      const now = new Date();
      const applicable = applicableCampaigns(selected, v.data.branchId, now);
      if (applicable.length !== selected.length) {
        const bad = selected.find((c) => !applicable.some((a) => a.id === c.id));
        return fail(
          "VALIDATION_ERROR",
          `"${bad?.name ?? "Seçilen kampanya"}" şu an bu öğrenci için geçerli değil (pasif, süresi dışında veya şube kapsamı dışında).`
        );
      }
      const resolution = resolveCampaignStack(applicable);
      appliedCampaignIds = resolution.applied.map((c) => c.id);
      campaignDiscountPercent = resolution.effectivePercent;
      for (const c of resolution.applied) {
        const warning = campaignLimitWarning(c);
        if (warning) registrationWarnings.push(warning);
      }
      for (const e of resolution.excluded) {
        registrationWarnings.push(`"${e.campaign.name}" uygulanmadı: ${e.reason}`);
      }
    }

    if (v.data.packageId) {
      const pkg = before.packages?.find((p) => p.id === v.data.packageId && p.status === "active");
      if (!pkg) return fail("VALIDATION_ERROR", "Seçilen paket bulunamadı veya aktif değil.");
      if (!v.data.lessonDurationMinutes) {
        return fail("VALIDATION_ERROR", "Paket seçildiğinde ders süresi (30/40/50 dk) zorunludur.");
      }
      if (v.data.monthlyFeeOverrideAmount !== undefined && ctx.role !== "SCHOOL_ADMIN" && ctx.role !== "SUPER_ADMIN") {
        return fail("FORBIDDEN", "Aylık ücreti yalnızca yetkili yönetici elle değiştirebilir.");
      }
      const effectiveDiscountType = campaignDiscountPercent !== undefined ? "percent" : v.data.discountType;
      const effectiveDiscountValue = campaignDiscountPercent ?? v.data.discountValue;
      const computation = computeMonthlyFee({
        pkg,
        durationMinutes: v.data.lessonDurationMinutes as LessonDurationMinutes,
        discountType: effectiveDiscountType,
        discountValue: effectiveDiscountValue,
        overrideAmount: v.data.monthlyFeeOverrideAmount,
      });
      pricing = {
        monthlyFee: computation.finalMonthlyFee,
        packageBaseMonthlyFee: computation.baseMonthlyFee,
        discountType: effectiveDiscountType,
        discountValue: effectiveDiscountValue,
        monthlyFeeManualOverride: computation.source === "override",
        monthlyFeeOverrideReason: computation.source === "override" ? v.data.monthlyFeeOverrideReason : undefined,
        appliedCampaignIds,
      };
    } else if (campaignDiscountPercent !== undefined) {
      // Paketsiz (legacy) + kampanya: indirim serbest aylık ücrete uygulanır.
      // Formül paket yoluyla AYNI tek kaynaktır (`computeDiscountAmount`):
      // nihai = taban − yuvarlanmış indirim, asla negatif değil.
      const base = v.data.monthlyFee;
      const discountAmount = computeDiscountAmount(base, "percent", campaignDiscountPercent);
      pricing = {
        monthlyFee: Math.max(base - discountAmount, 0),
        packageBaseMonthlyFee: base,
        discountType: "percent",
        discountValue: campaignDiscountPercent,
        monthlyFeeManualOverride: false,
        appliedCampaignIds,
      };
    }

    // Owner policy (2026-08-30, final) — "İlk ödeme her zaman KAYIT ESNASINDA alınır."
    // İlk ödeme NORMALDİR, istisna değildir: kayıt hangi gün yapılırsa yapılsın o gün
    // alınabilir, ve kayıt tarihi ile ders/eğitim başlangıç tarihi (enrollmentStartDate)
    // farklı olabilir — bu FARK ASLA bir istisna/gerekçe gerektirmez (P0 fix — eski
    // `collectedDay !== registrationDay` karşılaştırması ve `firstPaymentExceptionReason`
    // zorunluluğu KALDIRILDI; normal kayıt ekranında bu alan artık hiç gösterilmez).
    // Bu, ASIL kayıt tamamlanma sınırıdır — `createContract`'taki (contracts.ts) ayrı
    // kontrolden BAĞIMSIZDIR ve ondan önce gelir (kayıt burada, sözleşme daha sonra ayrı
    // bir adımda oluşturulur, ve o adım bu ödemeyi YENİDEN YARATMAZ — bkz. contracts.ts
    // reuseFirstPaymentId).
    const firstPaymentCollected = v.data.firstPaymentCollected;
    if (!firstPaymentCollected) {
      const msg = "İlk ödeme kayıt sırasında tahsil edilmeden kayıt tamamlanamaz.";
      return fail("VALIDATION_ERROR", msg, { fieldErrors: { firstPaymentAmount: [msg] } });
    }

    // P0-1B (2026-09-02 düzeltme) — ders başı ücret yöneticinin girdiği bir
    // alan DEĞİL; HER yeni kayıtta otomatik ve KOŞULSUZ türetilir (aylık
    // ücret ÷ referans ders adedi = haftalık×4, bkz. `derivePerLessonAmount`).
    // Bu artık bir "opsiyonel model" değil — yeni kayıtların TAMAMI için
    // geçerli, tek yol. Otomatik önerilen ilk dönem tutarı, henüz gerçek
    // ders programı yokken `estimatePeriodBillingLines` PROJEKSİYONUYLA
    // (bkz. o dosyadaki `estimated` bayrağı notu) hesaplanır.
    const {
      estimatePeriodBillingLines,
      derivePerLessonAmount,
      computePeriodAmount,
      countExactWeekdayLessons,
      resolveLessonStartDay,
    } = await import("../period-lesson-billing");
    const derivedPerLessonAmount = derivePerLessonAmount(pricing.monthlyFee, v.data.weeklyLessonCount);
    // P0 (2026-09-05) — ilk tahsilat KAYIT tarihinden değil, DERS BAŞLANGIÇ
    // tarihinden itibaren sayar (öğrenci bugün kaydolup ileri bir tarihte
    // derse başlayabilir). `lessonStartDate` yoksa kayıt tarihine düşülür —
    // eski kayıtlar/CSV/AI çağrıları için davranış AYNEN korunur.
    const startDay = resolveLessonStartDay({
      lessonStartDate: v.data.lessonStartDate,
      enrollmentStartDate: v.data.enrollmentStartDate,
      fallbackToday: toZonedYmd(new Date(), resolveAppTimezone()),
    });
    const [sy, sm] = startDay.slice(0, 7).split("-").map(Number) as [number, number];
    const monthEndDay = `${startDay.slice(0, 7)}-${String(new Date(Date.UTC(sy, sm, 0)).getUTCDate()).padStart(2, "0")}`;
    const firstPeriodEnd =
      v.data.enrollmentEndDate && v.data.enrollmentEndDate < monthEndDay ? v.data.enrollmentEndDate : monthEndDay;
    // P0 fix (2026-09-03) — `lessonDays` GÖNDERİLDİYSE ve haftalık sıklıkla
    // TAM eşleşiyorsa (üstteki doğrulama zaten bunu zorunlu kılıyor),
    // ilk dönem tutarı ARTIK gün-oranlı PROJEKSİYONDAN değil, o dönemde
    // seçilen günlerin KAÇ KEZ geçtiğinin TAM sayımından türetilir —
    // UI'da (`new-student-form.tsx`) "kesin" olarak gösterilen sayı ile
    // burada Payment/audit'e yazılan tutar artık AYNI kaynaktan gelir.
    // `lessonDays` yoksa (geriye dönük çağıranlar) eski projeksiyon kalır.
    const hasExactLessonDays =
      v.data.lessonDays && v.data.lessonDays.length === v.data.weeklyLessonCount;
    const firstPeriodBillableCount = hasExactLessonDays
      ? countExactWeekdayLessons(startDay, firstPeriodEnd, v.data.lessonDays!, {
          // Çalışma günü tek kaynağı — kapalı gün ücretlendirilmez, açılan gün ücretlendirilir.
          term: v.data.termType ?? "guz",
          overrides: before.closedDayOverrides ?? [],
          weeklyClosedDays: before.settings.termWeeklyClosedDays,
        })
      : estimatePeriodBillingLines({
          enrollmentStartDay: startDay,
          enrollmentEndDay: firstPeriodEnd,
          monthlyFee: pricing.monthlyFee,
          weeklyLessonCount: v.data.weeklyLessonCount,
        })[0]!.billableLessonCount;
    // P0 (2026-09-03) — "3 ders eşiği": kayıt ayında kalan GERÇEK ders sayısı
    // 3'ten azsa, o kadar az bir ilk tahsilat nakit akışı açısından yetersiz
    // sayılır — sonraki takvim ayının TAM aylık ücreti de öneriye eklenir.
    // 3 veya daha fazlaysa yalnız kayıt ayı kalan dersleri önerilir. Bu bir
    // ZORUNLULUK değil (kullanıcı farklı tutar girebilir, bkz. aşağıdaki
    // `resolveFirstPaymentAdjustment`) — yalnız öneri hesabını etkiler.
    // P0-1 (2026-09-09) — `count * derivedPerLessonAmount` ÇİFT YUVARLAMAYDI:
    // ders başı tutar zaten yuvarlanmış olduğu için artık ders sayısı kadar
    // büyüyordu (5.950 TL aylık → tam ayda 5.952 TL). Tutar artık onaylı
    // AYLIK ÜCRETTEN tek yuvarlamayla oranlanır — istemci önizlemesi
    // (`new-student-form.tsx`) ve sözleşme planı ile AYNI fonksiyon.
    const firstPeriodAutoAmount = computePeriodAmount(
      pricing.monthlyFee,
      v.data.weeklyLessonCount,
      firstPeriodBillableCount
    );
    // Sözleşme planıyla (buildPerLessonInstallmentSchedule) AYNI kural ve AYNI
    // kurum eşiği — kayıtta tahsil edilen ile sözleşmenin "tahsil edildi"
    // saydığı aylar birbirinden ayrışmaz.
    // Sahip kararı (2026-09-16): takip eden ayın ücretini ilk tahsilata eklemek
    // artık OTOMATİK DEĞİL, kullanıcının AÇIK seçimi. Seçim gönderilmezse eski
    // "3 ders eşiği" yalnız VARSAYILAN olarak uygulanır. Seçim ödemeye yazılır
    // (Payment.firstCollectionIncludesNextMonth); sözleşme planı onu OKUR, ders
    // sayısından yeniden türetmez — iki ekranın ayı farklı sayması hatasının kökü buydu.
    const includesNextMonth =
      v.data.firstCollectionIncludesNextMonth ??
      shouldMergeFirstCollection(
        firstPeriodBillableCount,
        resolveFirstCollectionMergeThreshold({
          firstCollectionMergeThresholdLessons: before.settings.collectionsSettings?.firstCollectionMergeThresholdLessons,
        })
      );
    const autoSuggestedAmount = includesNextMonth ? firstPeriodAutoAmount + pricing.monthlyFee : firstPeriodAutoAmount;

    // 2026-09-30 — %100 indirimli/burslu kayıt: önerilen ilk tahsilat 0 ise 0 TL geçerlidir ve
    // GERÇEK para alınmadığı için Payment satırı YAZILMAZ (sahte "ödendi" kaydı yok). Ücret
    // borcu olan kayıtta 0 TL "tahsilat alınmadı" demektir — owner politikası gereği reddedilir.
    const noFirstCollection = firstPaymentCollected.amount === 0;
    if (noFirstCollection && autoSuggestedAmount > 0) {
      const msg = `Tahsil edilen tutar 0 TL olamaz: bu kayıt için önerilen ilk tahsilat ${new Intl.NumberFormat("tr-TR").format(autoSuggestedAmount)} TL. 0 TL yalnız ücret %100 indirimli/burslu olduğunda girilebilir — fiilen tahsil edilen tutarı yazın.`;
      return fail("VALIDATION_ERROR", msg, { fieldErrors: { firstPaymentAmount: [msg] } });
    }
    const { resolveFirstPaymentAdjustment } = await import("../first-payment-adjustment");
    const adjustment = resolveFirstPaymentAdjustment({
      autoSuggestedAmount,
      manualNetAmount: firstPaymentCollected.amount,
      reason: v.data.firstPaymentAdjustmentReason,
    });
    // P0-B — bu hata ÖNCEDEN yalnız üstteki genel `formError` özetinde
    // görünüyordu; `firstPaymentAdjustmentReason` alanının ALTINDA (bkz.
    // new-student-form.tsx `<FieldError message={fieldErrors.firstPaymentAdjustmentReason} />`)
    // hiç gösterilmiyordu — `actionAddStudent`'ın `fieldErrorsFromZodFlatten`
    // yardımcı fonksiyonuyla AYNI `{fieldErrors: {alan: [mesaj]}}` şeklini
    // taşıyarak alan bazlı gösterime bağlanır.
    if (!adjustment.ok) {
      return fail("VALIDATION_ERROR", adjustment.message, {
        fieldErrors: { firstPaymentAdjustmentReason: [adjustment.message] },
      });
    }

    // Çift gönderim/retry koruması — aynı personel aynı öğrenciyi (ad+telefon+
    // veli telefonu+öğretmen+şube+tutar) 60sn içinde tekrar gönderirse (ör. çift
    // tıklama, ağ zaman aşımı sonrası otomatik retry) İKİNCİ bir öğrenci/ödeme
    // YARATILMAZ, ilk oluşturulan kaydın id'si döner.
    // ponytail: doğal-anahtar + zaman penceresi (yeni alan/migration gerektirmez);
    // gerçek çakışan aynı isimli farklı öğrenci senaryosu 60sn içinde aynı personel
    // tarafından bilinçli olarak yapılırsa (nadir), bu pencere dışına çıkılıp
    // tekrar denenmelidir — ölçek sorun olursa açık bir idempotencyKey alanına geçin.
    // H — deneme dersinden dönüşüm: kaynak deneme aynı tenant'ta olmalı ve daha önce
    // dönüştürülmemiş olmalı (ikinci kayıt/yanlış atıf yok).
    let sourceTrial: Awaited<ReturnType<typeof getTrialLesson>> = null;
    if (v.data.convertedFromTrialId) {
      sourceTrial = await getTrialLesson(ctx.tenantId, v.data.convertedFromTrialId);
      if (!sourceTrial) {
        return fail("NOT_FOUND", "Dönüştürülmek istenen deneme dersi bulunamadı. Deneme Dersleri ekranından tekrar başlatın.");
      }
      if (sourceTrial.convertedStudentId) {
        return fail(
          "CONFLICT",
          `${sourceTrial.name} deneme kaydı zaten öğrenciye dönüştürülmüş. Mevcut öğrenci kaydını Öğrenciler ekranından açın.`
        );
      }
    }

    const RETRY_DEDUPE_WINDOW_MS = 60_000;
    const retryDupe = before.students.find(
      (s) =>
        s.name === v.data.name &&
        s.phone === v.data.phone &&
        s.parentPhone === v.data.parentPhone &&
        s.teacherId === v.data.teacherId &&
        s.branchId === v.data.branchId &&
        s.monthlyFee === pricing.monthlyFee &&
        Date.now() - new Date(s.createdAt).getTime() <= RETRY_DEDUPE_WINDOW_MS
    );
    if (retryDupe) {
      return ok({ studentId: retryDupe.id });
    }

    // `instrument` (tekil) yalnızca giriş şemasının alanı — model karşılığı
    // `instruments` (dizi). STORE_MODE=db'de `addStudent`'ın Prisma
    // `student.create` çağrısı `...student` ile geniş bir spread yapıyor;
    // `instrument` burada süzülmezse Prisma'ya bilinmeyen bir alan olarak
    // gider ve "Unknown argument `instrument`" hatasıyla TÜM öğrenci
    // oluşturma db-modunda kırılır (json/memory modda sessizce yutulduğu
    // için bu hata testlerde hiç görünmüyordu — STORE_MODE=json'da çalışır).
    // ponytail: bu bir DENYLIST — `studentSchema`'ya `Student` kolonu olmayan
    // yeni bir alan eklenip buraya yazılmazsa db-modu YİNE kırılır. Kalıcı
    // çözüm payload'ı allowlist'ten kurmaktır; kolon listesi ile şema alan
    // listesini karşılaştıran bir test bu boşluğu erken yakalar.
    const {
      monthlyFeeOverrideAmount: _ignoredOverrideAmount,
      instrument: _ignoredInstrument,
      createPortalAccess: _ignoredCreatePortalAccess,
      portalAccessType: _ignoredPortalAccessType,
      firstPaymentCollected: _ignoredFirstPaymentCollected,
      firstPaymentExceptionReason: _ignoredFirstPaymentExceptionReason,
      // Paket & Kampanya Motoru — girdi-only alan: çözümü `appliedCampaignIds`
      // (pricing üzerinden) yazılır, ham seçim Prisma'ya gitmez.
      campaignIds: _ignoredCampaignIds,
      // `Student` kolonu DEĞİL, yalnız girdi alanları:
      // - `firstPaymentAdjustmentReason` → resolveFirstPaymentAdjustment (yukarıda)
      // - `lessonDays` → period-lesson-billing (ilk dönem ders sayısı hesabı)
      // Süzülmezlerse Prisma'ya bilinmeyen alan olarak gider ve öğrenci
      // oluşturma db-modunda "Unknown argument" ile kırılır.
      firstPaymentAdjustmentReason: _ignoredFirstPaymentAdjustmentReason,
      lessonDays: _ignoredLessonDays,
      // Payment'a yazılır (Payment.firstCollectionIncludesNextMonth) — Student KOLONU YOK,
      // süzülmezse `...studentInput` ile Prisma'ya gidip db modunu kırar.
      firstCollectionIncludesNextMonth: _ignoredIncludesNextMonth,
      ...studentInput
    } = v.data;
    const ids = new Set(before.students.map((s) => s.id));
    await addStudent({
      ...studentInput,
      instruments: [v.data.instrument as Instrument],
      // P0 (2026-09-05) — `accountResponsibility`e göre yalnız BİR taraf
      // (veli/öğrenci) telefon girmek zorunda (bkz. validation.ts studentSchema
      // .refine'ları); diğeri boş bırakılabilir. `Student.phone`/`parentPhone`
      // modeli hâlâ HER ZAMAN dolu olmalı (SMS/WhatsApp bildirimleri buna
      // güvenir) — eksik kalan taraf, GİRİLEN diğer numarayla doldurulur.
      phone: v.data.phone ?? v.data.parentPhone ?? "",
      parentPhone: v.data.parentPhone ?? v.data.phone ?? "",
      // Aynı gerekçe `parentName` için: SELF_MANAGED'de veli adı girilmesi
      // ZORUNLU değildir, ama `Student.parentName` modeli her zaman dolu
      // kalmalıdır (bildirim/sözleşme imza alanları buna güvenir) — boş
      // kalırsa muhatap zaten öğrencinin kendisidir, kendi adı yazılır.
      parentName: v.data.parentName ?? v.data.name,
      email: v.data.email ?? "",
      notes: v.data.notes ?? "",
      lessonDurationMinutes: v.data.lessonDurationMinutes as Student["lessonDurationMinutes"],
      // Faz 1A — kayıt formu artık bir aralık (start-end) da alabilir;
      // verilirse tekil `paymentDueDay`'in yerine birincil kaynaktır. Yalnız
      // tekil gün girildiyse geriye dönük tek-elemanlı aralık üretilir.
      paymentDueRanges: v.data.paymentDueRanges?.length
        ? v.data.paymentDueRanges
        : v.data.paymentDueDay
          ? [{ start: v.data.paymentDueDay, end: v.data.paymentDueDay }]
          : undefined,
      // Faz 1B — explicit studentTypes yoksa legacy tekil studentType'tan türetilir.
      studentTypes: v.data.studentTypes?.length ? v.data.studentTypes : v.data.studentType ? [v.data.studentType] : undefined,
      // MEB Paneli — MEB seçili DEĞİLSE gelen MEB değerleri STRIP edilir:
      // gizli/kurcalanmış alan yanlışlıkla MEB-dışı kayda yazılmaz (`level`
      // mevcut davranışıyla aynen korunur — sessiz kayıp yok).
      ...(mebIsMeb
        ? {}
        : {
            mebLevelStartDate: undefined,
            mebLevelEndDate: undefined,
            mebExamDate: undefined,
            mebExamAttended: undefined,
          }),
      ...pricing,
      // P0-1B — client'tan ASLA gelmez, yalnız sunucunun kendi hesabı.
      derivedPerLessonAmount,
      createdByUserId: ctx.userId,
      ...(sourceTrial ? { convertedFromTrialId: sourceTrial.id, convertedByUserId: ctx.userId } : {}),
    });
    const after = await readData();
    const created = after.students.find((s) => !ids.has(s.id));
    if (created) {
      audit(ctx, "student.create", "Student", created.id, {
        ...(v.data.packageId ? { pricing } : {}),
        entityName: created.name,
        ...(sourceTrial ? { convertedFromTrialId: sourceTrial.id } : {}),
      });
      // Paket & Kampanya Motoru — uygulanan kampanyaların kullanım sayacı HER
      // uygulamada artırılır (store katmanından doğrudan — bu, kampanya YÖNETİM
      // yetkisi değil kayıt akışının parçasıdır, SUPER_ADMIN kapısından geçmez).
      // Sayaç artışı kaydı ASLA engellemez; hata olursa audit'e düşer, kayıt korunur.
      if (appliedCampaignIds?.length) {
        for (const cid of appliedCampaignIds) {
          try {
            const latest = (await readData()).discountCampaigns?.find((c) => c.id === cid);
            if (!latest) continue;
            const next = (latest.usageCount ?? 0) + 1;
            await updateDiscountCampaign(cid, { usageCount: next });
            audit(ctx, "discount_campaign.applied", "DiscountCampaign", cid, {
              studentId: created.id,
              entityName: latest.name,
              usageCount: next,
              maxUsageCount: latest.maxUsageCount ?? null,
            });
          } catch (e) {
            logger.warn("createStudentTool — kampanya sayacı artırılamadı (kayıt korundu)", {
              campaignId: cid,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
      }
      if (sourceTrial) {
        const { markTrialConverted } = await import("../trial-lessons");
        await markTrialConverted(ctx.tenantId, sourceTrial.id, { studentId: created.id, userId: ctx.userId });
        audit(ctx, "trial.converted", "TrialLesson", sourceTrial.id, { studentId: created.id, entityName: sourceTrial.name });
      }
      if (noFirstCollection) {
        // Burslu kayıt — tahsilat yok, ödeme satırı yok; iz yalnız audit'te.
        audit(ctx, "student.first_payment_waived", "Student", created.id, {
          studentId: created.id,
          autoSuggestedAmount,
          monthlyFee: pricing.monthlyFee,
        });
      } else {
        // Owner policy (2026-08-30) — kayıt tamamlanma anında tahsil edilen ilk
        // ödeme, öğrenci oluşturulur oluşturulmaz `paid` bir Payment satırı olarak
        // yazılır (`addRegistrationFirstPayment` idempotent — çift gönderim/retry
        // ikinci bir satır YARATMAZ, mevcut olan döner). Actor/audit ile bağlanır.
        const fp = await addRegistrationFirstPayment({
          studentId: created.id,
          method: firstPaymentCollected.method!,
          amount: firstPaymentCollected.amount,
          collectedAt: firstPaymentCollected.collectedAt!,
          reference: firstPaymentCollected.reference,
          note: firstPaymentCollected.note,
          receivedByUserId: ctx.userId,
          firstCollectionIncludesNextMonth: includesNextMonth,
          // P0-1B — yalnız GERÇEK bir manuel düzeltme varsa dolu; otomatik
          // tutarla birebir eşleşen normal bir ilk ödemede bu dört alan da
          // undefined kalır (bkz. Payment.autoSuggestedAmount yorumu).
          ...(adjustment.result.isManualOverride
            ? {
                autoSuggestedAmount: adjustment.result.autoSuggestedAmount,
                adjustmentReason: adjustment.result.reason,
                adjustedBy: ctx.userId,
                adjustedAt: new Date().toISOString(),
              }
            : {}),
        });
        audit(ctx, "student.first_payment_collected", "Payment", fp.paymentId, {
          studentId: created.id,
          method: firstPaymentCollected.method!,
          amount: firstPaymentCollected.amount,
        });
        if (adjustment.result.isManualOverride) {
          const { buildFirstPaymentAdjustmentAuditEntry } = await import("../first-payment-adjustment");
          audit(
            ctx,
            "student.first_payment_adjusted",
            "Payment",
            fp.paymentId,
            { ...buildFirstPaymentAdjustmentAuditEntry(adjustment.result, {
                tenantId: ctx.tenantId,
                studentId: created.id,
                paymentId: fp.paymentId,
                adjustedBy: ctx.userId,
              }) }
          );
        }
      }
      // Notify admins about new student registration
      try {
        const { notifyAdmins } = await import("../manager-notifications");
        const { resolveActorLabel } = await import("../contract-payment-plan-view");
        const actorName = await resolveActorLabel({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          teachers: before.teachers,
        });
        await notifyAdmins(ctx.tenantId, "student_new_registration", {
          title: sourceTrial ? "Deneme öğrencisi kayda dönüştü" : "Yeni öğrenci kaydı",
          body: sourceTrial
            ? `${created.name} deneme öğrencisi, ${actorName} tarafından kayda dönüştürüldü. Detay: /panel/ogrenciler/${created.id}`
            : `${created.name} öğrencisi, ${actorName} tarafından oluşturuldu. Detay: /panel/ogrenciler/${created.id}`,
        });
      } catch {
        // best-effort
      }
    }

    // Karma Öğrenci Portalı — hesap (User + StudentPortalAccess) YALNIZCA
    // yönetici "Portal erişimi oluştur / davet gönder" kutusunu bilinçli
    // olarak işaretlediyse oluşturulur. Eskiden (EPIC 6A) yalnızca `email`
    // alanı doluysa örtük/otomatik bir hesap açılıyordu — bu, "veli
    // telefonu/adı (veya e-postası) girmek asla otomatik hesap açmaz"
    // kuralını ihlal ediyordu; kaldırıldı. `createPortalAccess`
    // işaretlenmezse hiçbir User/StudentPortalAccess kaydı oluşmaz.
    let tempLoginPassword: string | undefined;
    if (created && v.data.email && v.data.createPortalAccess) {
      const provisioned = await provisionEntityLogin({
        tenantId: ctx.tenantId,
        email: v.data.email,
        role: "STUDENT",
        studentId: created.id,
      });
      if (provisioned) {
        audit(ctx, "student.login_provisioned", "Student", created.id);
        // Geçici şifre yalnızca doğrudan insan yönetici çağrısında dönüş
        // değerine dahil edilir — AI_AGENT rolüyle (sohbet/otonom akış)
        // oluşturulduysa dönmez, çünkü LLM tool-result'ı sohbette anlatabilir
        // ve şifre bu yolla sızabilir. Yalnızca BİR KEZ, bu çağrının dönüş
        // değerinde döner — hiçbir yerde kalıcı olarak saklanmaz/loglanmaz.
        if (ctx.role === "SCHOOL_ADMIN" || ctx.role === "SUPER_ADMIN") {
          tempLoginPassword = provisioned.tempPassword;
        }
      }

      // Hesabın YANINDA StudentPortalAccess da anında active olarak
      // sağlanır — invite akışında ayrı bir "daveti kabul et" ekranı
      // bilinçli olarak yok (bkz. provisionStudentPortalAccessTool yorumu).
      if (provisioned) {
        const { grantActiveStudentPortalAccess } = await import("../student-portal-access");
        await grantActiveStudentPortalAccess({
          tenantId: ctx.tenantId,
          userId: provisioned.userId,
          studentId: created.id,
          accessType: v.data.portalAccessType ?? "SELF",
          invitedBy: ctx.userId,
        });
        audit(ctx, "student.portal_access_granted", "Student", created.id, {
          accessType: v.data.portalAccessType ?? "SELF",
        });
      }
    }

    return ok({
      studentId: created?.id ?? "unknown",
      tempLoginPassword,
      ...(registrationWarnings.length > 0 ? { warnings: registrationWarnings } : {}),
    });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "createStudent failed");
  }
}

/**
 * Öğrencinin eğitim profilini günceller (EPIC 4): tür, kayıt dönemi,
 * seviye, hedef sınav, özel not. Öğrencinin temel iletişim/paket bilgilerini
 * değiştirmez — o alanlar için ayrı bir yol yok (mevcut kapsam dışı).
 */
export async function updateStudentProfileTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ studentId: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "BRANCH_MANAGER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(updateStudentProfileSchema, input);
  if (!v.ok) return v;

  // NeviiOS — şube müdürü: yalnız kendi şubesindeki öğrencinin temel
  // operasyonel alanları; kimlik/ücret/sorumluluk/şube taşıma YOK.
  if (ctx.role === "BRANCH_MANAGER") {
    const student = await readStudentById(v.data.studentId);
    if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı");
    const gate = await assertBranchOperation(ctx, "students", "update", student.branchId);
    if (!gate.ok) return gate;
    const provided = Object.keys(input && typeof input === "object" ? (input as object) : {}).filter((k) => k !== "studentId");
    const blocked = provided.filter((k) => !BRANCH_MANAGER_STUDENT_FIELDS.has(k));
    if (blocked.length > 0) {
      return fail("FORBIDDEN", `Şube müdürü bu alanları değiştiremez: ${blocked.join(", ")}`);
    }
  }

  if (v.data.branchId) {
    const data = await readReferenceData();
    if (!data.settings.branches.some((b) => b.id === v.data.branchId)) {
      return fail("VALIDATION_ERROR", `Geçersiz şube: "${v.data.branchId}".`);
    }
  }

  // MEB Paneli (2026-09-28) — "MEB ise zorunlu" güncelleme kapısı. Mevcut
  // kayıtla BİRLEŞTİRİLMİŞ görünüm doğrulanır (bkz. src/lib/meb.ts
  // `mergeMebForUpdate`): sonuç MEB + MEB yüzeyine dokunan ilk ilgili
  // düzenleme tamamlamayı zorunlu kılar; alakasız düzenlemeler (telefon
  // vb.) eski eksik kayıtları KIRMAZ. Sonuç MEB-değilse gelen MEB
  // değerleri STRIP edilir — gizli alan yazılmaz, kayıtlı eski MEB verisi
  // SİLİNMEZ (tür tekrar seçilince geri gelir).
  // DB egress: öğrenci kaydetme başına 4 tam okuma yapılıyordu — hepsi tek öğrenci/şube listesi içindi.
  const mebCurrent = await readStudentById(v.data.studentId);
  if (!mebCurrent) return fail("NOT_FOUND", "Öğrenci bulunamadı");
  const mebMerged = mergeMebForUpdate(mebCurrent, v.data);
  let mebStrip = false;
  if (mebMerged.resultingIsMeb) {
    if (mebMerged.touchesMebSurface) {
      const mebUpdateCheck = validateMebFields(mebMerged.merged);
      if (!mebUpdateCheck.ok) {
        return fail("VALIDATION_ERROR", "MEB alanlarını kontrol edin — işaretli alanlarda eksik veya hatalı bilgi var.", {
          fieldErrors: mebUpdateCheck.fieldErrors,
        });
      }
    }
  } else {
    mebStrip = true;
  }

  try {
    const { studentId, ...patch } = v.data;
    // Faz 1A — aralıklar verildiyse (boş dizi dahil, "tümünü temizle" anlamına
    // gelir) sistematik birleştirilir ve tekil `paymentDueDay` ilk aralığın
    // başlangıcıyla senkron tutulur — eski okuyucular (belge şablonu vb.)
    // hâlâ anlamlı bir değer görür. Ranges verilmediyse legacy tekil alan
    // (varsa) DOKUNULMADAN kendi başına güncellenmeye devam eder.
    const normalizedRanges = patch.paymentDueRanges ? normalizePaymentDueRanges(patch.paymentDueRanges) : undefined;
    // Faz 1B — aynı desen: studentTypes verildiyse (boş dizi dahil) birincil
    // kaynak olur, tekil `studentType` ilk türle senkron tutulur.
    const profilePatch: StudentProfilePatch = {
      ...patch,
      lessonDurationMinutes: patch.lessonDurationMinutes as LessonDurationPreference | undefined,
      ...(normalizedRanges
        ? { paymentDueRanges: normalizedRanges, paymentDueDay: normalizedRanges[0]?.start ?? patch.paymentDueDay }
        : {}),
      ...(patch.studentTypes
        ? { studentTypes: patch.studentTypes, studentType: patch.studentTypes[0] ?? patch.studentType }
        : {}),
    };
    // MEB Paneli — sonuç MEB-değilse STRIP (yukarıdaki kapı): MEB anahtarları
    // patch'ten SİLİNİR (anahtar `undefined` ile bırakılmaz — json/memory
    // spread'i `undefined` değeri saklı verinin ÜSTÜNE yazar ve sessizce
    // SİLERDİ; Prisma atlardı — iki mod ayrışırdı). Silinen anahtar hiçbir
    // moda yazılmaz, kayıtlı eski MEB verisi korunur.
    if (mebStrip) {
      delete profilePatch.mebLevelStartDate;
      delete profilePatch.mebLevelEndDate;
      delete profilePatch.mebExamDate;
      delete profilePatch.mebExamAttended;
    }
    const before = await readStudentById(studentId);
    await updateStudentProfile(studentId, profilePatch);
    // Ders süresi TEK kanonik alandır (Student.lessonDurationMinutes). Paketli öğrencide
    // aylık ücret süreye bağlı olduğu için süre hangi ekrandan değişirse değişsin ücret
    // aynı sunucu kuralıyla (updateStudentPaymentProfileTool) yeniden hesaplanır.
    if (
      before?.packageId &&
      patch.lessonDurationMinutes !== undefined &&
      patch.lessonDurationMinutes !== before.lessonDurationMinutes
    ) {
      const repriced = await updateStudentPaymentProfileTool(ctx, {
        studentId,
        lessonDurationMinutes: patch.lessonDurationMinutes,
        ...(before.monthlyFeeManualOverride
          ? { monthlyFeeOverrideAmount: before.monthlyFee, monthlyFeeOverrideReason: before.monthlyFeeOverrideReason }
          : {}),
      });
      if (!repriced.ok) return repriced;
    }
    audit(ctx, "student.profile_update", "Student", studentId, {
      ...patch,
      changes: before ? diffRecordFields(before as unknown as Record<string, unknown>, patch as Record<string, unknown>) : [],
    });
    return ok({ studentId });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "updateStudentProfile failed");
  }
}

// ---------------------------------------------------------------------------
// MEB Paneli (2026-09-28) — yalnız MEB öğrencilerinin tablosu + revizyonu.
// Liste GERÇEK sunucu-taraflı sayfalamalıdır (istemciye yalnız sayfa gider).
// Yazma TEK kapı `updateStudentProfileTool`'a delege eder (MEB kapısı, audit,
// ders-süresi repricing aynen çalışır); şube değişiminde öğretmen-şube uyumu
// + gelecek planlı ders etkisi sunucuda zorunlu kontrol edilir, riskli toplu
// değişiklik OTOMATİK yapılmaz. Öğretmen/enstrüman değişimi bu panelde YOK
// (MT-003) — güvenli akış `bulkStudentActionTool`'dur (Öğrenciler › toplu
// işlem; gelecek derslerin devri açık onay ister).
// ---------------------------------------------------------------------------

const mebStudentQuerySchema = z.object({
  search: z.string().max(120).optional(),
  branchId: z.string().min(1).max(80).optional(),
  teacherId: z.string().min(1).max(80).optional(),
  instrument: z.string().min(1).max(80).optional(),
  active: z.enum(["active", "passive", "all"]).optional(),
  examStatus: z.enum(["unknown", "not_attended", "attended"]).optional(),
  sort: z.enum(["name", "level", "mebLevelStartDate", "mebLevelEndDate", "mebExamDate"]).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).max(100000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export interface MebPanelRow {
  id: string;
  displayId?: string;
  name: string;
  branchId: string;
  branchName?: string;
  instruments: Student["instruments"];
  teacherId: string;
  teacherName?: string;
  active: boolean;
  studentTypes: import("../types").StudentType[];
  level?: string;
  mebLevelStartDate?: string;
  mebLevelEndDate?: string;
  mebExamDate?: string;
  mebExamAttended?: boolean;
  examStatus: import("../meb").MebExamStatus;
  examStatusLabel: string;
}

export async function listMebStudentsTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ rows: MebPanelRow[]; total: number; page: number; pageSize: number }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(mebStudentQuerySchema, input);
  if (!v.ok) return v;

  try {
    const result = await listMebStudents({
      search: v.data.search,
      branchId: v.data.branchId,
      teacherId: v.data.teacherId,
      instrument: v.data.instrument,
      active: v.data.active === undefined || v.data.active === "all" ? undefined : v.data.active === "active",
      examStatus: v.data.examStatus,
      sort: v.data.sort,
      sortDir: v.data.sortDir,
      page: v.data.page,
      pageSize: v.data.pageSize,
    });
    // Şube/öğretmen ADLARI salt-görüntü zenginleştirmesidir (tenant-kapsamlı
    // readData'dan; istemciye ham kimlik DEĞİL ad gider).
    const data = await readReferenceData();
    const { resolveMebExamStatus, MEB_EXAM_STATUS_LABELS } = await import("../meb");
    const rows: MebPanelRow[] = result.rows.map((r) => {
      const examStatus = resolveMebExamStatus(r);
      return {
        ...r,
        branchName: data.settings.branches.find((b) => b.id === r.branchId)?.name,
        teacherName: data.teachers.find((t) => t.id === r.teacherId)?.name,
        examStatus,
        examStatusLabel: MEB_EXAM_STATUS_LABELS[examStatus],
      };
    });
    return ok({ rows, total: result.total, page: result.page, pageSize: result.pageSize });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "listMebStudents failed");
  }
}

const mebEditImpactSchema = z.object({
  studentId: z.string().min(1),
  /** Değiştirilmek istenen şube (yoksa mevcut) — etki ÖNİZLEMESİ içindir, yazmaz. */
  branchId: z.string().min(1).max(80).optional(),
});

export interface MebEditImpact {
  studentId: string;
  studentName: string;
  currentBranchId: string;
  targetBranchId: string;
  teacherName?: string;
  /** Şube değişiminde mevcut öğretmenin hedef şubede görevli olup olmadığı (değişim yoksa null). */
  teacherServesTargetBranch: boolean | null;
  /** İptal edilmemiş, başlangıcı gelecekte olan planlı ders sayısı (şube değişimi bunları OTOMATİK taşımaz). */
  futureLessonCount: number;
}

export async function getMebStudentEditImpactTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<MebEditImpact>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(mebEditImpactSchema, input);
  if (!v.ok) return v;

  const data = await readData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı.");
  const teacher = data.teachers.find((t) => t.id === student.teacherId);
  const targetBranchId = v.data.branchId ?? student.branchId;
  const now = Date.now();
  const futureLessonCount = data.lessons.filter(
    (l) => l.studentId === student.id && l.status !== "cancelled" && new Date(l.startAt).getTime() > now
  ).length;
  return ok({
    studentId: student.id,
    studentName: student.name,
    currentBranchId: student.branchId,
    targetBranchId,
    teacherName: teacher?.name,
    teacherServesTargetBranch: targetBranchId === student.branchId ? null : teacher ? teacherServesBranch(teacher, targetBranchId as BranchId) : false,
    futureLessonCount,
  });
}

const updateMebStudentSchema = updateStudentProfileSchema.extend({
  /** Şube değişiminde etki özetini gördüğünü açık onaylar (istemci zorunlu kılar, sunucu doğrular). */
  branchChangeConfirmed: z.boolean().optional(),
});

export async function updateMebStudentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ studentId: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  // MT-003 — öğretmen/enstrüman değişimi bu panelde YOK: zod sessizce
  // atardı; burada AÇIKÇA reddedilir + güvenli akışa yönlendirilir.
  const raw = input as Record<string, unknown> | null;
  if (raw && (raw.teacherId !== undefined || raw.instruments !== undefined)) {
    return fail(
      "VALIDATION_ERROR",
      "Öğretmen/enstrüman değişimi MEB Panelinden yapılamaz — ders ve hakediş etkisi nedeniyle Öğrenciler › toplu işlem akışını kullanın."
    );
  }
  const v = parseOrFail(updateMebStudentSchema, input);
  if (!v.ok) return v;

  const data = await readReferenceData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı.");

  // Şube değişiminde: mevcut öğretmenin hedef şubede görevli OLMAMASI hard
  // block'tur (ilişkisel tutarlılık — sessiz öğretmen değişimi ASLA
  // yapılmaz); etki özeti onayı olmadan yazılmaz. Mevcut planlı dersler
  // OTOMATİK taşınmaz — onay metni bunu açıkça söyler.
  if (v.data.branchId && v.data.branchId !== student.branchId) {
    const teacher = data.teachers.find((t) => t.id === student.teacherId);
    if (teacher && !teacherServesBranch(teacher, v.data.branchId as BranchId)) {
      const branchName = data.settings.branches.find((b) => b.id === v.data.branchId)?.name ?? v.data.branchId;
      return fail(
        "VALIDATION_ERROR",
        `"${teacher.name}" ${branchName} şubesinde ders vermiyor. Şube değişimi yapılmadı — önce öğretmeni bu şubede görevli bir öğretmenle değiştirin (Öğrenciler › toplu işlem) veya şube değişiminden vazgeçin.`
      );
    }
    if (!v.data.branchChangeConfirmed) {
      return fail(
        "VALIDATION_ERROR",
        "Şube değişiminin etki özetini (öğretmen uyumu + planlı dersler) onaylamadan kaydedilemez."
      );
    }
  }

  const { branchChangeConfirmed: _confirmed, ...profileInput } = v.data;
  // Asıl yazı + MEB kapısı + audit + ders-süresi repricing TEK kapıdan
  // (`updateStudentProfileTool`) — çift yazma yolu YOK.
  return updateStudentProfileTool(ctx, profileInput);
}

// ---------------------------------------------------------------------------
// Nilüfer Acar politikası §1E — gecikmiş ödeme nedeniyle ders programının
// GEÇİCİ, YETKİLİ ve GEREKÇELİ durdurulması. Otomatik tetikleyici YOK — bu
// araçlar yalnızca insan kararıyla çağrılır (ör. tahsilat ekranından "Ders
// Programını Duraklat" aksiyonu). Ders/yoklama/ödeme geçmişi silinmez;
// yalnızca Student.paymentPauseStatus bayrağı değişir, `active` (kayıt/
// enrollment durumu) İLE KARIŞTIRILMAZ.
// ---------------------------------------------------------------------------

const pauseStudentPaymentScheduleSchema = z.object({
  studentId: z.string().min(1),
  reason: z.string().min(1).max(1000),
  effectiveDate: z.string().min(1).optional(),
});

export async function pauseStudentLessonScheduleTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ studentId: string; paymentPauseStatus: "paused"; pausedAt: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(pauseStudentPaymentScheduleSchema, input);
  if (!v.ok) return v;

  const student = await readStudentById(v.data.studentId);
  if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı.");
  // Yinelenen/çift tık aksiyonu sessizce engellenir — mevcut duraklatma korunur, yeni bir yan etki yaratılmaz.
  if (student.paymentPauseStatus === "paused") {
    return fail("CONFLICT", "Bu öğrencinin ders programı zaten duraklatılmış durumda.");
  }

  const pausedAt = v.data.effectiveDate ?? new Date().toISOString();
  try {
    await setStudentPaymentPause(v.data.studentId, {
      reason: v.data.reason,
      pausedBy: ctx.userId,
      pausedAt,
    });
    audit(ctx, "student.payment_pause", "Student", v.data.studentId, {
      reason: v.data.reason,
      effectiveDate: pausedAt,
    });
    return ok({ studentId: v.data.studentId, paymentPauseStatus: "paused", pausedAt });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "pauseStudentLessonSchedule failed");
  }
}

export async function reactivateStudentLessonScheduleTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ studentId: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(z.object({ studentId: z.string().min(1) }), input);
  if (!v.ok) return v;

  const student = await readStudentById(v.data.studentId);
  if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı.");
  if (student.paymentPauseStatus !== "paused") {
    return fail("CONFLICT", "Bu öğrencinin ders programı zaten aktif — duraklatılmış değil.");
  }

  try {
    await setStudentPaymentPause(v.data.studentId, null);
    audit(ctx, "student.payment_reactivate", "Student", v.data.studentId, {
      previousReason: student.paymentPauseReason,
      pausedSince: student.paymentPausedAt,
    });
    return ok({ studentId: v.data.studentId });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "reactivateStudentLessonSchedule failed");
  }
}

/**
 * Karma Öğrenci Portalı — öğrenci düzenleme ekranından SONRADAN "Portal
 * erişimi oluştur / davet gönder" aksiyonu (task #34). Kayıt oluşturma
 * anındaki `createStudentTool`'un yanına, ikinci bir bilinçli admin
 * tetikleyicisi olarak eklendi — hiçbir yerde otomatik/örtük çağrılmaz.
 * Login hesabı yoksa oluşturur (provisionEntityLogin, idempotent), StudentPortalAccess'i
 * anında active yapar (ayrı bir "daveti kabul et" ekranı BİLİNÇLİ OLARAK
 * yok — minimal, güvenli kapsam; admin zaten kimlik doğrulanmış kişiye
 * elden/WhatsApp ile geçici şifreyi iletir).
 */
export async function provisionStudentPortalAccessTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ studentId: string; tempLoginPassword?: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(provisionStudentPortalAccessSchema, input);
  if (!v.ok) return v;

  const student = await readStudentById(v.data.studentId);
  if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı");

  // Portal erişim yönetimi görevi — `inviteStudentPortalAccessTool` ile AYNI çakışma
  // kuralı: bu e-posta ZATEN farklı bir ROLE (öğretmen/admin) bağlıysa engelle, hesap
  // eşlemesini bozma. Aynı velinin e-postasını ikinci bir çocuğa bağlamak (aynı rol —
  // STUDENT) BİLİNÇLİ OLARAK serbest bırakılır (yukarıdaki yorum).
  {
    const { getUserIdByEmail, getUserById } = await import("../auth/users");
    const existingUserId = await getUserIdByEmail(ctx.tenantId, v.data.email);
    if (existingUserId) {
      const existingUser = await getUserById(existingUserId);
      if (existingUser && existingUser.role !== "STUDENT") {
        return fail(
          "VALIDATION_ERROR",
          "Bu e-posta adresi zaten farklı bir rolde (öğretmen/yönetici) aktif bir portal hesabına bağlı. Hesap eşlemesini bozmamak için erişim verilmedi — lütfen e-postayı kontrol edin."
        );
      }
    }
  }

  try {
    const provisioned = await provisionEntityLogin({
      tenantId: ctx.tenantId,
      email: v.data.email,
      role: "STUDENT",
      studentId: v.data.studentId,
    });

    const { getUserIdByEmail } = await import("../auth/users");
    const { grantActiveStudentPortalAccess } = await import("../student-portal-access");

    // provisioned === null anlamı: bu e-posta zaten bir User'a bağlı
    // (idempotent create) — o kullanıcının id'sini e-postadan bulup erişimi
    // YİNE DE bu öğrenciye bağlarız (ör. aynı veli ikinci çocuğa erişim
    // istiyor olabilir). Deprecated `User.studentId` alanı BİLİNÇLİ OLARAK
    // burada okunmaz — StudentPortalAccess tek gerçek kaynaktır.
    const userId = provisioned?.userId ?? (await getUserIdByEmail(ctx.tenantId, v.data.email));
    if (!userId) return fail("INTERNAL_ERROR", "Kullanıcı hesabı oluşturulamadı/bulunamadı");

    await grantActiveStudentPortalAccess({
      tenantId: ctx.tenantId,
      userId,
      studentId: v.data.studentId,
      accessType: v.data.accessType,
      invitedBy: ctx.userId,
    });
    audit(ctx, "student.portal_access_granted", "Student", v.data.studentId, { accessType: v.data.accessType });

    return ok({
      studentId: v.data.studentId,
      tempLoginPassword: provisioned?.tempPassword,
    });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "provisionStudentPortalAccess failed");
  }
}

/**
 * Faz 4 — GERÇEK e-posta davet akışı. `provisionStudentPortalAccessTool`'un
 * (geçici şifre admin'e gösterilir, elden iletilir) yanına eklenen İKİNCİ,
 * bağımsız bir aksiyon — admin ikisinden birini seçer. Bu yol: hiçbir şifre
 * admin'e/e-postaya AÇIK METİN gösterilmez; kullanıcı, tek kullanımlık
 * "Şifrenizi Oluşturun" linkiyle KENDİ şifresini belirler
 * (`POST /api/v1/auth/accept-invitation`). Erişim `invited` durumunda kalır,
 * link tıklanıp kabul edilene kadar `active` OLMAZ (bkz. `inviteStudentPortalAccess`
 * — önceden yalnızca `grantActiveStudentPortalAccess` kullanılıyordu, bu iki
 * primitif tam olarak bunun için `@deprecated` işaretiyle korunmuştu).
 *
 * 10. tur iş #1 — MEVCUT HESAP BAĞLAMA: aynı tenant'ta bu e-postaya ait
 * KULLANILABİLİR (aktif + en az bir aktif portal erişimli) bir STUDENT
 * hesabı ZATEN varsa, YENİ bir şifre-belirleme daveti gönderilip mevcut
 * şifrenin sıfırlanması ZORUNLU TUTULMAZ. Bunun yerine erişim bu öğrenciye
 * DOĞRUDAN bağlanır (`grantActiveStudentPortalAccess`, idempotent) ve
 * `linkedExistingAccount: true` dönülür — admin'e "Bu e-postaya ait portal
 * hesabı mevcut; bu öğrenciye erişim bağlandı" mesajı gösterilir. Aynı
 * e-posta KULLANICISI = aynı kişi olduğundan (e-posta hesabın kimliğidir)
 * bu bağlama güvenlidir; admin zaten portal erişimi vermeye yetkilidir.
 * Hesap HENÜZ hiç aktive edilmemişse (aktif erişimi yok) normal davet akışı
 * çalışır — kullanıcı ilk şifresini linkle belirler.
 */
export async function inviteStudentPortalAccessTool(
  ctx: ServiceContext,
  input: unknown
): Promise<
  ServiceResult<{
    studentId: string;
    delivered: boolean;
    blocked?: boolean;
    activationLink?: string;
    linkedExistingAccount: boolean;
  }>
> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(provisionStudentPortalAccessSchema, input);
  if (!v.ok) return v;

  const data = await readData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı");

  if (isRateLimited(`invite:${ctx.tenantId}:${v.data.email.toLowerCase()}`, 5, 60 * 60 * 1000)) {
    return fail("RATE_LIMITED", "Bu e-posta adresine çok fazla davet gönderildi. Lütfen bir süre sonra tekrar deneyin.");
  }

  // Portal erişim yönetimi görevi — "aynı e-posta başka aktif kullanıcı hesabına
  // bağlıysa hesap eşlemesini bozmadan net bir yönetici uyarısı ver". AYNI velinin
  // e-postasını İKİNCİ bir çocuğa bağlamak BEKLENEN/İZİN VERİLEN bir durumdur (bkz.
  // yukarıdaki yorum) — bu yüzden burada yalnızca rol UYUŞMAZLIĞI (ör. bu e-posta
  // aslında bir öğretmen/admin hesabına ait) ENGELLENİR, aynı-rol paylaşımı serbest.
  {
    const { getUserIdByEmail } = await import("../auth/users");
    const existingUserId = await getUserIdByEmail(ctx.tenantId, v.data.email);
    if (existingUserId) {
      const existingUser = await getUserById(existingUserId);
      if (existingUser && existingUser.role !== "STUDENT") {
        return fail(
          "VALIDATION_ERROR",
          "Bu e-posta adresi zaten farklı bir rolde (öğretmen/yönetici) aktif bir portal hesabına bağlı. Hesap eşlemesini bozmamak için davet gönderilmedi — lütfen e-postayı kontrol edin."
        );
      }
    }
  }

  try {
    const { getUserIdByEmail, getUserIdByEmailIncludingInactive, getUserAccountStatus, bindUserStudentIdIfEmpty } =
      await import("../auth/users");
    const { grantActiveStudentPortalAccess, inviteStudentPortalAccess, listAccessForStudent, listAccessForUser, revokeStudentPortalAccess } =
      await import("../student-portal-access");

    // Mevcut hesap kontrolü — tenant kapsamlı. Kapalı (inactive) bir hesap
    // varsa kopya kullanıcı YARATILMAZ, net bir yönlendirme verilir.
    const preExistingUserId = await getUserIdByEmail(ctx.tenantId, v.data.email);
    if (!preExistingUserId) {
      const inactiveUserId = await getUserIdByEmailIncludingInactive(ctx.tenantId, v.data.email);
      if (inactiveUserId) {
        const status = await getUserAccountStatus(inactiveUserId);
        if (status && !status.active) {
          return fail(
            "VALIDATION_ERROR",
            "Bu e-postaya ait portal hesabı kapalı durumda. Önce hesap erişimini açın, sonra daveti tekrar gönderin — kapalı hesaba davet gönderilmedi."
          );
        }
      }
    }

    const provisioned = await provisionEntityLogin({
      tenantId: ctx.tenantId,
      email: v.data.email,
      role: "STUDENT",
      // GUARDIAN erişiminde User.studentId KASITLI OLARAK bağlanmaz — erişim
      // yalnızca StudentPortalAccess ile çözülür (bkz. inviteStudentPortalAccess).
      studentId: v.data.accessType === "SELF" ? v.data.studentId : undefined,
    });
    const userId = provisioned?.userId ?? (await getUserIdByEmail(ctx.tenantId, v.data.email));
    if (!userId) return fail("INTERNAL_ERROR", "Kullanıcı hesabı oluşturulamadı/bulunamadı");

    // Bozuk/eski ilişki onarımı — additive, idempotent (bkz. görev talebi #5).
    // Bu öğrenci için DAHA ÖNCE oluşturulmuş, artık HİÇBİR User'a karşılık
    // gelmeyen (ör. eski bir hata yüzünden User hiç oluşturulamamışken
    // StudentPortalAccess satırı yazılmışsa) satırlar varsa, veri
    // SİLİNMEDEN "revoked" olarak işaretlenir — böylece admin ekranında
    // aynı öğrenci için hayalet/kopya kartlar birikmez. Yalnızca ŞİMDİ
    // eklenecek satırdan FARKLI bir userId'ye sahip, henüz revoked
    // OLMAYAN satırlar dokunulur.
    try {
      const existingRows = await listAccessForStudent(ctx.tenantId, v.data.studentId);
      for (const row of existingRows) {
        if (row.userId === userId || row.status === "revoked") continue;
        const rowAccount = await getUserAccountStatus(row.userId);
        if (!rowAccount) {
          await revokeStudentPortalAccess(ctx.tenantId, row.userId, v.data.studentId);
          audit(ctx, "student.portal_access_orphan_repaired", "Student", v.data.studentId, { staleUserId: row.userId });
        }
      }
    } catch {
      // Onarım en iyi çaba (best-effort) — başarısız olsa bile asıl davet akışını durdurmaz.
    }

    // MEVCUT kullanılabilir hesap → şifre sıfırlatmadan doğrudan bağla.
    // "Kullanılabilir" = bu davetten ÖNCE de vardı VE en az bir AKTİF portal
    // erişimi var (şifresini biliyor/kullanıyor demektir). Hiç aktive
    // edilmemiş hesap (yalnızca `invited` satırlar) bu dala GİRMEZ —
    // aşağıda normal davet akışı çalışır, ilk şifresini linkle belirler.
    if (!provisioned && preExistingUserId) {
      const priorRows = await listAccessForUser(ctx.tenantId, userId);
      const hasEstablishedAccess = priorRows.some((r) => r.status === "active");
      if (hasEstablishedAccess) {
        if (v.data.accessType === "SELF") {
          // Boşsa doldur, doluysa ASLA üzerine yazma (ilk bağ korunur).
          await bindUserStudentIdIfEmpty(userId, v.data.studentId);
        }
        await grantActiveStudentPortalAccess({
          tenantId: ctx.tenantId,
          userId,
          studentId: v.data.studentId,
          accessType: v.data.accessType,
          invitedBy: ctx.userId,
        });
        audit(ctx, "student.portal_access_linked_existing", "Student", v.data.studentId, {
          accessType: v.data.accessType,
        });
        return ok({ studentId: v.data.studentId, delivered: false, linkedExistingAccount: true });
      }
    }

    await inviteStudentPortalAccess({
      tenantId: ctx.tenantId,
      userId,
      studentId: v.data.studentId,
      accessType: v.data.accessType,
      invitedBy: ctx.userId,
    });

    const { sendAccountInvitationEmail } = await import("../auth/invitation");
    const result = await sendAccountInvitationEmail({
      tenantId: ctx.tenantId,
      userId,
      email: v.data.email,
      recipientName: v.data.accessType === "SELF" ? student.name : `${student.name} velisi`,
      institutionName: data.settings.name ?? "NeviiHub",
      role: "STUDENT",
      portalAccessType: v.data.accessType,
      schoolPhone: data.settings.phone || undefined,
      schoolWebsite: data.settings.website || undefined,
      logoUrl: data.settings.logoUrl || undefined,
    });

    audit(ctx, "student.portal_invitation_sent", "Student", v.data.studentId, {
      accessType: v.data.accessType,
      delivered: result.delivered,
    });

    // E-posta teslim edilemediyse yetkili admin'e (bu tool yalnız SCHOOL_ADMIN/SUPER_ADMIN)
    // "davet linkini kopyala" fallback'i — link loglanmaz/audit'e yazılmaz.
    return ok({
      studentId: v.data.studentId,
      delivered: result.delivered,
      blocked: result.delivered ? undefined : result.blocked,
      activationLink: result.delivered ? undefined : result.activationLink,
      linkedExistingAccount: false,
    });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "inviteStudentPortalAccess failed");
  }
}

const inviteTeacherAccountSchema = z.object({ teacherId: z.string().min(1) });

/** Faz 4 — öğretmen için GERÇEK e-posta davet akışı, `inviteStudentPortalAccessTool` ile AYNI desen. */
export async function inviteTeacherAccountTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ teacherId: string; delivered: boolean; blocked?: boolean }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(inviteTeacherAccountSchema, input);
  if (!v.ok) return v;

  const data = await readData();
  const teacher = data.teachers.find((t) => t.id === v.data.teacherId);
  if (!teacher) return fail("NOT_FOUND", "Öğretmen bulunamadı");
  if (!teacher.email) return fail("VALIDATION_ERROR", "Öğretmenin e-posta adresi tanımlı değil.");

  if (isRateLimited(`invite:${ctx.tenantId}:${teacher.email.toLowerCase()}`, 5, 60 * 60 * 1000)) {
    return fail("RATE_LIMITED", "Bu e-posta adresine çok fazla davet gönderildi. Lütfen bir süre sonra tekrar deneyin.");
  }

  // Portal erişim yönetimi görevi — "aynı e-posta başka aktif kullanıcı hesabına
  // bağlıysa hesap eşlemesini bozmadan net bir yönetici uyarısı ver". Öğretmenler
  // (öğrenci/veli'nin aksine — orada aynı e-postanın birden çok çocuğa bağlanması
  // BEKLENEN bir durumdur) birbirinden AYRI hesaplara sahip olmalı; bu e-posta
  // ZATEN BAŞKA bir öğretmene/kullanıcıya bağlıysa engelleriz — hesap eşlemesini
  // BOZMADAN (hiçbir yazma işlemi yapılmadan) net bir hata döneriz.
  {
    const { getUserIdByEmail } = await import("../auth/users");
    const existingUserId = await getUserIdByEmail(ctx.tenantId, teacher.email);
    if (existingUserId) {
      const existingUser = await getUserById(existingUserId);
      if (existingUser && existingUser.teacherId && existingUser.teacherId !== teacher.id) {
        return fail(
          "VALIDATION_ERROR",
          "Bu e-posta adresi zaten BAŞKA bir öğretmenin portal hesabına bağlı. Hesap eşlemesini bozmamak için davet gönderilmedi — lütfen e-postayı kontrol edin."
        );
      }
    }
  }

  try {
    const provisioned = await provisionEntityLogin({
      tenantId: ctx.tenantId,
      email: teacher.email,
      role: "TEACHER",
      teacherId: teacher.id,
    });
    const { getUserIdByEmail } = await import("../auth/users");
    const userId = provisioned?.userId ?? (await getUserIdByEmail(ctx.tenantId, teacher.email));
    if (!userId) return fail("INTERNAL_ERROR", "Kullanıcı hesabı oluşturulamadı/bulunamadı");

    const { sendAccountInvitationEmail } = await import("../auth/invitation");
    const result = await sendAccountInvitationEmail({
      tenantId: ctx.tenantId,
      userId,
      email: teacher.email,
      recipientName: teacher.name,
      institutionName: data.settings.name ?? "NeviiHub",
      role: "TEACHER",
      schoolPhone: data.settings.phone || undefined,
      schoolWebsite: data.settings.website || undefined,
      logoUrl: data.settings.logoUrl || undefined,
    });

    audit(ctx, "teacher.invitation_sent", "Teacher", teacher.id, { delivered: result.delivered });

    return ok({ teacherId: teacher.id, delivered: result.delivered, blocked: result.delivered ? undefined : result.blocked });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "inviteTeacherAccount failed");
  }
}

/* ------------------------------------------------------------------ */
/* Portal erişim yönetimi (öğrenci/öğretmen detay ekranı — "aç/kapat/   */
/* davet/yeniden gönder/şifre sıfırla" kartı). Mevcut StudentPortalAccess/ */
/* PasswordResetToken/User.active altyapısı üzerine ince bir Tool Layer   */
/* katmanı — yeni bir tablo/mekanizma EKLEMEZ.                            */
/* ------------------------------------------------------------------ */

const studentIdOnlySchema = z.object({ studentId: z.string().min(1) });
const studentAccessTargetSchema = z.object({ studentId: z.string().min(1), userId: z.string().min(1) });
const teacherIdOnlySchema = z.object({ teacherId: z.string().min(1) });

export type StudentPortalAccessSummaryRow = {
  userId: string;
  email: string;
  accessType: "GUARDIAN" | "SELF";
  status: "invited" | "active" | "revoked";
  invitedAt: string;
  activatedAt: string | null;
  revokedAt: string | null;
  lastPasswordResetRequestedAt: string | null;
};

/** Öğrenci detay ekranındaki "Portal erişimi" kartının okuma tarafı — RBAC: admin. */
export async function getStudentPortalAccessTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ studentId: string; accounts: StudentPortalAccessSummaryRow[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(studentIdOnlySchema, input);
  if (!v.ok) return v;

  const { listAccessForStudent } = await import("../student-portal-access");
  const rows = await listAccessForStudent(ctx.tenantId, v.data.studentId);

  const accounts: StudentPortalAccessSummaryRow[] = [];
  for (const row of rows) {
    const account = await getUserAccountStatus(row.userId);
    const lastPasswordResetRequestedAt = await getLatestPasswordResetRequestAt(row.userId);
    accounts.push({
      userId: row.userId,
      email: account?.email ?? "",
      accessType: row.accessType,
      status: row.status,
      invitedAt: row.invitedAt,
      activatedAt: row.activatedAt,
      revokedAt: row.revokedAt,
      lastPasswordResetRequestedAt,
    });
  }

  return ok({ studentId: v.data.studentId, accounts });
}

/**
 * Erişimi kapatır — kullanıcının girişini bir sonraki istekten itibaren
 * engeller (bkz. `hasActiveStudentAccess`, her istekte async kontrol
 * edilir, JWT'de cache'lenmez). Öğrenci/ders/ödeme/sözleşme/KVKK verisi
 * SİLİNMEZ — yalnızca `StudentPortalAccess.status` "revoked" olur.
 */
export async function revokeStudentPortalAccessTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ studentId: string; userId: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(studentAccessTargetSchema, input);
  if (!v.ok) return v;

  const { revokeStudentPortalAccess } = await import("../student-portal-access");
  const updated = await revokeStudentPortalAccess(ctx.tenantId, v.data.userId, v.data.studentId);
  if (!updated) return fail("NOT_FOUND", "Portal erişim kaydı bulunamadı.");

  audit(ctx, "student.portal_access_revoked", "Student", v.data.studentId, { userId: v.data.userId });
  return ok({ studentId: v.data.studentId, userId: v.data.userId });
}

/**
 * Erişimi yeniden açar — MEVCUT hesabı yeniden etkinleştirir, yeni bir
 * kopya kullanıcı OLUŞTURMAZ (`grantActiveStudentPortalAccess` idempotent:
 * kayıt zaten varsa güncelleştirir). `accessType` değiştirilmez, mevcut
 * kayıttan korunur.
 */
export async function reactivateStudentPortalAccessTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ studentId: string; userId: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(studentAccessTargetSchema, input);
  if (!v.ok) return v;

  const { listAccessForStudent, grantActiveStudentPortalAccess } = await import("../student-portal-access");
  const rows = await listAccessForStudent(ctx.tenantId, v.data.studentId);
  const existing = rows.find((r) => r.userId === v.data.userId);
  if (!existing) return fail("NOT_FOUND", "Portal erişim kaydı bulunamadı.");

  await grantActiveStudentPortalAccess({
    tenantId: ctx.tenantId,
    userId: v.data.userId,
    studentId: v.data.studentId,
    accessType: existing.accessType,
    invitedBy: ctx.userId,
  });

  audit(ctx, "student.portal_access_reactivated", "Student", v.data.studentId, { userId: v.data.userId });
  return ok({ studentId: v.data.studentId, userId: v.data.userId });
}

const inspectPortalAccessSchema = z.object({
  /** Tek e-posta kapsamı (önerilen) — verilmezse tenant genelinde tarama yapılır (üst sınırlı). */
  email: z.string().email().optional(),
  /** Tek öğrenci kapsamı — e-posta ile birlikte de verilebilir. */
  studentId: z.string().min(1).max(128).optional(),
});

export type PortalAccessFinding =
  | { kind: "orphan_access"; userId: string; studentId: string; status: string; detail: string }
  | { kind: "stale_student_binding"; userId: string; email: string; boundStudentId: string; detail: string }
  | { kind: "duplicate_email_students"; email: string; studentIds: string[]; detail: string }
  | { kind: "invited_stale"; userId: string; email: string; studentId: string; invitedAt: string; detail: string };

/**
 * 10. tur iş #1 — eski hatalı davet/erişim ilişkileri için SALT-OKUNUR
 * inceleme (dry-run). HİÇBİR şeyi değiştirmez; bulguları onarım için
 * GEREKLİ açık kimliklerle (userId/studentId) döner. Toplu onarım YOKTUR —
 * her onarım `repairPortalAccessTool` ile TEK hedefe, admin onayıyla yapılır.
 */
export async function inspectPortalAccessTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ findings: PortalAccessFinding[]; scannedAccessRows: number; truncated: boolean }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(inspectPortalAccessSchema, input);
  if (!v.ok) return v;

  const { listActiveAccessForTenant, listAccessForStudent, listAccessForUser } =
    await import("../student-portal-access");
  const { getUserById, getUserAccountStatus, getUserIdByEmailIncludingInactive } = await import("../auth/users");
  const data = await readReferenceData();
  const findings: PortalAccessFinding[] = [];
  const MAX_ROWS = 500;
  let scanned = 0;
  let truncated = false;

  const emailFilter = v.data.email?.trim().toLowerCase() ?? null;
  const studentFilter = v.data.studentId ?? null;

  // Kapsam: öğrenci filtresi varsa o öğrencinin satırları, yoksa tenant'ın aktif satırları.
  let rows = studentFilter
    ? await listAccessForStudent(ctx.tenantId, studentFilter)
    : await listActiveAccessForTenant(ctx.tenantId);
  if (emailFilter) {
    const scopedUserId = await getUserIdByEmailIncludingInactive(ctx.tenantId, emailFilter);
    rows = scopedUserId ? rows.filter((r) => r.userId === scopedUserId) : [];
  }
  if (rows.length > MAX_ROWS) {
    rows = rows.slice(0, MAX_ROWS);
    truncated = true;
  }
  scanned = rows.length;
  const byStudentId = new Map(data.students.map((s) => [s.id, s]));

  // 1) Yetim erişim satırı: User karşılığı yok (davet akışı bunları
  // best-effort revoke eder; burada rapor + açık onarım hedefi).
  for (const row of rows) {
    if (row.status === "revoked") continue;
    const account = await getUserAccountStatus(row.userId);
    if (!account) {
      findings.push({
        kind: "orphan_access",
        userId: row.userId,
        studentId: row.studentId,
        status: row.status,
        detail: `User kaydı bulunamayan ${row.status} erişim satırı (öğrenci: ${byStudentId.get(row.studentId)?.name ?? row.studentId}).`,
      });
    }
  }

  // 2) Bayat User.studentId bağlaması: kayıp/silinmiş/pasif öğrenciye işaret
  // ediyorsa (kullanıcının BAŞKA aktif erişimleri varken) JWT pasif kilitlenmesinin kaynağıdır.
  const userIds = [...new Set(rows.map((r) => r.userId))];
  for (const userId of userIds) {
    const user = await getUserById(userId);
    if (!user?.studentId) continue;
    const bound = byStudentId.get(user.studentId);
    const boundMissing = !bound || !!bound.deletedAt;
    const boundPassive = !!bound && !bound.active;
    if (!boundMissing && !boundPassive) continue;
    const accessRows = await listAccessForUser(ctx.tenantId, userId);
    const otherActive = accessRows.filter((r) => r.status === "active" && r.studentId !== user.studentId);
    if (otherActive.length === 0 && !boundMissing) continue; // tek-pasif: kilitlenme değil, gerçek pasif durumu
    findings.push({
      kind: "stale_student_binding",
      userId,
      email: user.email ?? "",
      boundStudentId: user.studentId,
      detail: boundMissing
        ? `User.studentId silinmiş/kayıp bir öğrenciye (${user.studentId}) işaret ediyor.`
        : `User.studentId pasif bir öğrenciye (${bound!.name}) işaret ediyor; kullanıcının ${otherActive.length} başka aktif erişimi var.`,
    });
  }

  // 3) Aynı e-posta birden fazla öğrenci kaydında — HATA DEĞİLDİR (ortak
  // veli desteklenir), yalnızca bilgi amaçlı listelenir.
  if (emailFilter) {
    const matches = data.students.filter((s) => s.email.trim().toLowerCase() === emailFilter && !s.deletedAt);
    if (matches.length > 1) {
      findings.push({
        kind: "duplicate_email_students",
        email: emailFilter,
        studentIds: matches.map((s) => s.id),
        detail: `Bu e-posta ${matches.length} öğrenci kaydında yazılı (${matches.map((s) => `${s.name}${s.active ? "" : " (pasif)"}`).join(", ")}). Ortak veli hesabı desteklenir — bu tek başına bir sorun değildir.`,
      });
    }
  }

  // 4) Kabul edilmemiş eski davetler (30 günden eski `invited`) — bilgi amaçlı.
  if (studentFilter || emailFilter) {
    const targets = studentFilter ? [studentFilter] : [...new Set(rows.map((r) => r.studentId))];
    for (const sid of targets.slice(0, 50)) {
      const srows = await listAccessForStudent(ctx.tenantId, sid);
      for (const r of srows) {
        if (r.status !== "invited") continue;
        const ageMs = Date.now() - new Date(r.invitedAt).getTime();
        if (Number.isFinite(ageMs) && ageMs > 30 * 24 * 60 * 60 * 1000) {
          const account = await getUserAccountStatus(r.userId);
          findings.push({
            kind: "invited_stale",
            userId: r.userId,
            email: account?.email ?? "",
            studentId: sid,
            invitedAt: r.invitedAt,
            detail: "30 günden eski kabul edilmemiş davet — yeniden davet gönderilebilir veya erişim kapatılabilir.",
          });
        }
      }
    }
  }

  return ok({ findings, scannedAccessRows: scanned, truncated });
}

const repairPortalAccessSchema = z.object({
  action: z.enum(["revoke_orphan_access", "clear_stale_student_binding"]),
  userId: z.string().min(1).max(128),
  /** `revoke_orphan_access` için ZORUNLU; bağ temizliğinde yok sayılır. */
  studentId: z.string().min(1).max(128).optional(),
});

/**
 * 10. tur iş #1 — TEK hedefli, idempotent onarım. `inspectPortalAccessTool`
 * bulgularındaki AÇIK kimliklerle çağrılır; toplu/kör onarım YOKTUR.
 * Her dal onarım ANINDA koşulu yeniden doğrular (fail-closed): koşul
 * değişmişse işlem YAPILMAZ, hata dönülür. Tüm onarımlar audit'lenir.
 */
export async function repairPortalAccessTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ repaired: boolean; action: string; userId: string; studentId?: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(repairPortalAccessSchema, input);
  if (!v.ok) return v;

  const { action, userId } = v.data;
  if (action === "revoke_orphan_access") {
    const studentId = v.data.studentId;
    if (!studentId) return fail("VALIDATION_ERROR", "Yetim erişim onarımı için studentId zorunludur.");
    const { listAccessForStudent, revokeStudentPortalAccess } = await import("../student-portal-access");
    const { getUserAccountStatus } = await import("../auth/users");
    const rows = await listAccessForStudent(ctx.tenantId, studentId);
    const target = rows.find((r) => r.userId === userId);
    if (!target || target.status === "revoked") return ok({ repaired: false, action, userId, studentId });
    // Fail-closed: User VARSA bu yetim değildir — dokunma.
    const account = await getUserAccountStatus(userId);
    if (account) {
      return fail("VALIDATION_ERROR", "Bu kullanıcı kaydı mevcut — yetim değil, onarım yapılmadı. Erişimi kapatmak için normal 'Portal erişimini kapat' akışını kullanın.");
    }
    await revokeStudentPortalAccess(ctx.tenantId, userId, studentId);
    audit(ctx, "student.portal_access_orphan_repaired", "Student", studentId, { staleUserId: userId, via: "repair_tool" });
    return ok({ repaired: true, action, userId, studentId });
  }

  // clear_stale_student_binding
  const { getUserById, clearUserStudentBinding } = await import("../auth/users");
  const { listAccessForUser } = await import("../student-portal-access");
  const user = await getUserById(userId);
  if (!user) return fail("NOT_FOUND", "Kullanıcı bulunamadı.");
  if (!user.studentId) return ok({ repaired: false, action, userId });
  const bound = await readStudentById(user.studentId);
  const boundMissing = !bound || !!bound.deletedAt;
  const boundPassive = !!bound && !bound.active;
  if (!boundMissing && !boundPassive) {
    return fail("VALIDATION_ERROR", "Bağlı öğrenci kaydı aktif — bayat bağ değil, onarım yapılmadı.");
  }
  if (!boundMissing) {
    // Pasif bağ: kullanıcının BAŞKA aktif erişimi yoksa bu gerçek pasif
    // durumdur — temizlemek "kayıt yok" ekranına düşürür, dokunma.
    const accessRows = await listAccessForUser(ctx.tenantId, userId);
    const otherActive = accessRows.filter((r) => r.status === "active" && r.studentId !== user.studentId);
    if (otherActive.length === 0) {
      return fail(
        "VALIDATION_ERROR",
        "Kullanıcının başka aktif erişimi yok — bu gerçek bir pasif durumdur, bağ temizlenmedi."
      );
    }
  }
  const cleared = await clearUserStudentBinding(userId);
  if (!cleared) {
    return fail("INTERNAL_ERROR", "Bağ temizlenemedi (sistem hesabı olabilir).");
  }
  audit(ctx, "student.portal_stale_binding_cleared", "User", userId, { boundStudentId: user.studentId });
  return ok({ repaired: true, action, userId });
}

/**
 * Admin-tetikli "şifre sıfırlama bağlantısı gönder" — erişim kapalıyken
 * (revoked) ÇALIŞMAZ (görev kuralı: "erişim kapalıyken davet veya sıfırlama
 * bağlantısı gönderilmemeli"). E-posta yoksa/gönderilemezse net bir hata
 * döner, admin'e AÇIK biçimde gösterilir (bkz. görev kuralı).
 */
export async function sendStudentPortalPasswordResetTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ studentId: string; userId: string; delivered: boolean; blocked?: boolean }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(studentAccessTargetSchema, input);
  if (!v.ok) return v;

  const { listAccessForStudent } = await import("../student-portal-access");
  const rows = await listAccessForStudent(ctx.tenantId, v.data.studentId);
  const target = rows.find((r) => r.userId === v.data.userId);
  if (!target) return fail("NOT_FOUND", "Portal erişim kaydı bulunamadı.");
  if (target.status === "revoked") {
    return fail("VALIDATION_ERROR", "Erişim kapalıyken şifre sıfırlama bağlantısı gönderilemez. Önce erişimi açın.");
  }

  const account = await getUserAccountStatus(v.data.userId);
  if (!account || !account.email) {
    return fail("VALIDATION_ERROR", "Önce geçerli bir e-posta adresi ekleyin.");
  }

  if (isRateLimited(`admin-pwreset:${ctx.tenantId}:${account.email.toLowerCase()}`, 5, 60 * 60 * 1000)) {
    return fail("RATE_LIMITED", "Bu hesaba çok fazla şifre sıfırlama isteği gönderildi. Lütfen bir süre sonra tekrar deneyin.");
  }

  const data = await readData();
  const student = data.students.find((s) => s.id === v.data.studentId);

  try {
    const { sendPasswordResetEmail } = await import("../auth/invitation");
    const result = await sendPasswordResetEmail({
      tenantId: ctx.tenantId,
      userId: v.data.userId,
      email: account.email,
      recipientName: student?.name ?? "",
      institutionName: data.settings.name ?? "NeviiHub",
      logoUrl: data.settings.logoUrl || undefined,
    });
    audit(ctx, "student.portal_password_reset_sent", "Student", v.data.studentId, { userId: v.data.userId, delivered: result.delivered });
    return ok({ studentId: v.data.studentId, userId: v.data.userId, delivered: result.delivered, blocked: result.delivered ? undefined : result.blocked });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "sendStudentPortalPasswordReset failed");
  }
}

export type TeacherAccountStatusSummary = {
  exists: boolean;
  userId: string | null;
  email: string;
  active: boolean;
  lastPasswordResetRequestedAt: string | null;
};

/** Öğretmen detay ekranındaki "Portal erişimi" kartının okuma tarafı — RBAC: admin. */
export async function getTeacherAccountStatusTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<TeacherAccountStatusSummary>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(teacherIdOnlySchema, input);
  if (!v.ok) return v;

  const account = await getUserAccountStatusForTeacher(ctx.tenantId, v.data.teacherId);
  if (!account) {
    return ok({ exists: false, userId: null, email: "", active: false, lastPasswordResetRequestedAt: null });
  }
  const lastPasswordResetRequestedAt = await getLatestPasswordResetRequestAt(account.userId);
  return ok({ exists: true, userId: account.userId, email: account.email, active: account.active, lastPasswordResetRequestedAt });
}

/**
 * Öğretmen portal erişimini aç/kapat — `User.active` alanını değiştirir.
 * Kapatmak girişi (bir sonraki istekten itibaren, `authenticateUser`
 * HER istekte `active` kontrol eder) engeller; ders/program/yoklama/geçmiş
 * veri SİLİNMEZ. Açmak (yeniden etkinleştirme) MEVCUT hesabı geri açar,
 * yeni bir hesap OLUŞTURMAZ.
 */
export async function setTeacherAccountActiveTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ teacherId: string; active: boolean }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(z.object({ teacherId: z.string().min(1), active: z.boolean() }), input);
  if (!v.ok) return v;

  const account = await getUserAccountStatusForTeacher(ctx.tenantId, v.data.teacherId);
  if (!account) return fail("NOT_FOUND", "Bu öğretmen için portal hesabı bulunamadı — önce davet gönderin.");

  const updated = await setUserActive(account.userId, v.data.active);
  if (!updated) return fail("INTERNAL_ERROR", "Hesap durumu güncellenemedi.");

  audit(ctx, v.data.active ? "teacher.portal_access_reactivated" : "teacher.portal_access_revoked", "Teacher", v.data.teacherId, {
    userId: account.userId,
  });
  return ok({ teacherId: v.data.teacherId, active: v.data.active });
}

/** Admin-tetikli öğretmen şifre sıfırlama e-postası — erişim kapalıyken ÇALIŞMAZ. */
export async function sendTeacherPasswordResetTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ teacherId: string; delivered: boolean; blocked?: boolean }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(teacherIdOnlySchema, input);
  if (!v.ok) return v;

  const account = await getUserAccountStatusForTeacher(ctx.tenantId, v.data.teacherId);
  if (!account) return fail("NOT_FOUND", "Bu öğretmen için portal hesabı bulunamadı — önce davet gönderin.");
  if (!account.active) {
    return fail("VALIDATION_ERROR", "Erişim kapalıyken şifre sıfırlama bağlantısı gönderilemez. Önce erişimi açın.");
  }
  if (!account.email) {
    return fail("VALIDATION_ERROR", "Önce geçerli bir e-posta adresi ekleyin.");
  }

  if (isRateLimited(`admin-pwreset:${ctx.tenantId}:${account.email.toLowerCase()}`, 5, 60 * 60 * 1000)) {
    return fail("RATE_LIMITED", "Bu hesaba çok fazla şifre sıfırlama isteği gönderildi. Lütfen bir süre sonra tekrar deneyin.");
  }

  const data = await readData();
  const teacher = data.teachers.find((t) => t.id === v.data.teacherId);

  try {
    const { sendPasswordResetEmail } = await import("../auth/invitation");
    const result = await sendPasswordResetEmail({
      tenantId: ctx.tenantId,
      userId: account.userId,
      email: account.email,
      recipientName: teacher?.name ?? "",
      institutionName: data.settings.name ?? "NeviiHub",
      logoUrl: data.settings.logoUrl || undefined,
    });
    audit(ctx, "teacher.portal_password_reset_sent", "Teacher", v.data.teacherId, { delivered: result.delivered });
    return ok({ teacherId: v.data.teacherId, delivered: result.delivered, blocked: result.delivered ? undefined : result.blocked });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "sendTeacherPasswordReset failed");
  }
}

/**
 * Package C — öğrencinin paket/süre/indirim/ödeme günü/ödeme türünü ve
 * (yalnızca yetkili yönetici) nihai aylık ücretin manuel override'ını TEK
 * bu tooldan günceller. Aylık ücret HER ZAMAN sunucuda `computeMonthlyFee`
 * ile yeniden hesaplanır — istemciden gelen bir "final tutar" asla doğrudan
 * güvenilip kaydedilmez (override hariç, o da yalnızca bu RBAC ile).
 */
export async function updateStudentPaymentProfileTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ studentId: string; monthlyFee: number }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(updateStudentPaymentProfileSchema, input);
  if (!v.ok) return v;

  try {
    const data = await readReferenceData();
    const student = data.students.find((s) => s.id === v.data.studentId);
    if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı.");

    const effectivePackageId = v.data.packageId ?? student.packageId;
    const effectiveDuration = v.data.lessonDurationMinutes ?? student.lessonDurationMinutes;
    const effectiveDiscountType = v.data.discountType ?? student.discountType;
    const effectiveDiscountValue = v.data.discountValue ?? student.discountValue;

    if (!effectivePackageId && (v.data.discountType || v.data.discountValue !== undefined)) {
      return fail("VALIDATION_ERROR", "İndirim yalnızca bir paket seçildiğinde uygulanabilir.");
    }

    const patch: StudentProfilePatch = {};
    if (v.data.paymentMethod !== undefined) patch.paymentMethod = v.data.paymentMethod;
    if (v.data.paymentDueDay !== undefined) patch.paymentDueDay = v.data.paymentDueDay;
    if (v.data.lessonDurationMinutes !== undefined) {
      patch.lessonDurationMinutes = v.data.lessonDurationMinutes as Student["lessonDurationMinutes"];
    }
    if (v.data.packageId !== undefined) patch.packageId = v.data.packageId;

    const before = {
      monthlyFee: student.monthlyFee,
      discountType: student.discountType,
      discountValue: student.discountValue,
      monthlyFeeManualOverride: student.monthlyFeeManualOverride ?? false,
    };

    if (effectivePackageId) {
      // Paket değiştiriliyorsa yeni paket aktif olmalı; öğrencide zaten
      // atanmış (ve sonradan arşivlenmiş olabilecek) bir paket dokunulmadan
      // korunuyorsa (v.data.packageId verilmediyse) durum sorgulanmaz —
      // geçmiş fiyatlandırma bozulmaz.
      const pkg = v.data.packageId
        ? data.packages?.find((p) => p.id === v.data.packageId && p.status === "active")
        : data.packages?.find((p) => p.id === effectivePackageId);
      if (!pkg) return fail("VALIDATION_ERROR", "Seçilen paket bulunamadı veya aktif değil.");
      if (!effectiveDuration) {
        return fail("VALIDATION_ERROR", "Paket için ders süresi (30/40/50 dk) zorunludur.");
      }
      const computation = computeMonthlyFee({
        pkg,
        durationMinutes: effectiveDuration as LessonDurationMinutes,
        discountType: effectiveDiscountType,
        discountValue: effectiveDiscountValue,
        overrideAmount: v.data.monthlyFeeOverrideAmount,
      });
      patch.monthlyFee = computation.finalMonthlyFee;
      patch.packageBaseMonthlyFee = computation.baseMonthlyFee;
      patch.discountType = effectiveDiscountType;
      patch.discountValue = effectiveDiscountValue;
      patch.monthlyFeeManualOverride = computation.source === "override";
      patch.monthlyFeeOverrideReason = computation.source === "override" ? v.data.monthlyFeeOverrideReason : undefined;
    } else if (v.data.monthlyFeeOverrideAmount !== undefined) {
      // Paketsiz (legacy serbest ücret) öğrenci — manuel tutar doğrudan nihai ücrettir.
      patch.monthlyFee = v.data.monthlyFeeOverrideAmount;
      patch.monthlyFeeManualOverride = true;
      patch.monthlyFeeOverrideReason = v.data.monthlyFeeOverrideReason;
    }

    await updateStudentProfile(v.data.studentId, patch);
    audit(ctx, "student.payment_profile_update", "Student", v.data.studentId, {
      before,
      after: {
        monthlyFee: patch.monthlyFee ?? before.monthlyFee,
        discountType: patch.discountType,
        discountValue: patch.discountValue,
        monthlyFeeManualOverride: patch.monthlyFeeManualOverride ?? before.monthlyFeeManualOverride,
      },
      reason: v.data.monthlyFeeOverrideReason,
    });
    return ok({ studentId: v.data.studentId, monthlyFee: patch.monthlyFee ?? student.monthlyFee });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "updateStudentPaymentProfile failed");
  }
}

export async function createTeacherTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ teacherId: string; tempLoginPassword?: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "AI_AGENT", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(teacherSchema, input);
  if (!v.ok) return v;

  // ÖNCELİK 4 (devam) — `instrumentLevels[].instrument` zod'da serbest
  // string (kataloğu destekleyebilmek için) — bu yüzden gerçek doğrulama
  // burada, tenant-scoped aktif enstrüman listesine karşı yapılır. Yalnızca
  // istemci enum'una güvenilmez.
  if (v.data.instrumentLevels && v.data.instrumentLevels.length > 0) {
    const active = await resolveActiveInstrumentNames(ctx.tenantId);
    const invalid = v.data.instrumentLevels.find(
      (r) => !active.some((n) => n.toLocaleLowerCase("tr") === r.instrument.toLocaleLowerCase("tr"))
    );
    if (invalid) {
      return fail("VALIDATION_ERROR", `Geçersiz veya pasif enstrüman: "${invalid.instrument}".`);
    }
  } else {
    // P0-1 (2026-08-29) — `instrument` (tekil, legacy) alanı da artık zod'da
    // serbest string; `instrumentLevels` verilmediği (legacy tek-enstrüman)
    // yolda AYNI tenant-scoped katalog kontrolü burada yapılır.
    const active = await resolveActiveInstrumentNames(ctx.tenantId);
    if (!active.some((n) => n.toLocaleLowerCase("tr") === v.data.instrument.toLocaleLowerCase("tr"))) {
      return fail("VALIDATION_ERROR", `Geçersiz veya pasif enstrüman: "${v.data.instrument}".`);
    }
  }

  // Ek şubeler — updateTeacherProfileTool ile AYNI tenant-scoped kontrol.
  // Birincil şube `branchIds`'e yazılmaz (her zaman dahildir), tekrarlar atılır.
  let extraBranchIds: BranchId[] | undefined;
  if (v.data.branchIds && v.data.branchIds.length > 0) {
    const branches = (await readData()).settings.branches;
    const invalid = [v.data.branchId, ...v.data.branchIds].find((bId) => !branches.some((b) => b.id === bId));
    if (invalid) return fail("VALIDATION_ERROR", `Geçersiz şube: "${invalid}".`);
    const extras = Array.from(new Set(v.data.branchIds)).filter((bId) => bId !== v.data.branchId) as BranchId[];
    if (extras.length > 0) extraBranchIds = extras;
  }

  try {
    // ÖNCELİK 4 (devam) — çoklu enstrüman verilmişse `instruments` bundan
    // türetilir (benzersiz enstrüman listesi); yoksa legacy tek-enstrüman
    // davranışı ([instrument]) aynen korunur.
    const instruments =
      v.data.instrumentLevels && v.data.instrumentLevels.length > 0
        ? Array.from(new Set(v.data.instrumentLevels.map((r) => r.instrument as Instrument)))
        : [v.data.instrument as Instrument];

    const before = await readData();
    const ids = new Set(before.teachers.map((t) => t.id));
    await addTeacher({
      name: v.data.name,
      email: v.data.email ?? "",
      phone: v.data.phone,
      branchId: v.data.branchId as BranchId,
      branchIds: extraBranchIds,
      instruments,
      instrumentLevels: v.data.instrumentLevels as Teacher["instrumentLevels"],
      // Oluşturma anında müsaitlik belirtilmişse (v.data.availability) onu
      // kullan; belirtilmemişse geriye dönük uyumlu varsayılana düş.
      availability: v.data.availability ?? [
        { dayOfWeek: 1, start: "10:00", end: "18:00" },
        { dayOfWeek: 2, start: "10:00", end: "18:00" },
        { dayOfWeek: 3, start: "10:00", end: "18:00" },
        { dayOfWeek: 4, start: "10:00", end: "18:00" },
        { dayOfWeek: 5, start: "10:00", end: "16:00" },
      ],
      maxDailyLessons: 8,
      createdByUserId: ctx.userId,
      highSchool: v.data.highSchool,
      university: v.data.university,
      graduationYear: v.data.graduationYear,
      birthDate: v.data.birthDate,
      address: v.data.address,
      contractStartDate: v.data.contractStartDate,
      contractEndDate: v.data.contractEndDate,
      employmentType: v.data.employmentType,
      hireDate: v.data.hireDate,
      emergencyContactName: v.data.emergencyContactName,
      emergencyContactPhone: v.data.emergencyContactPhone,
      weeklyHoursThreshold: v.data.weeklyHoursThreshold,
      personnelNotes: v.data.personnelNotes,
    });
    const after = await readData();
    const created = after.teachers.find((t) => !ids.has(t.id));
    if (created) audit(ctx, "teacher.create", "Teacher", created.id, { instrumentCount: instruments.length });

    // EPIC 6A gap — bkz. createStudentTool'daki aynı desen/yorum.
    let tempLoginPassword: string | undefined;
    if (created && v.data.email) {
      const provisioned = await provisionEntityLogin({
        tenantId: ctx.tenantId,
        email: v.data.email,
        role: "TEACHER",
        teacherId: created.id,
      });
      if (provisioned) {
        audit(ctx, "teacher.login_provisioned", "Teacher", created.id);
        // bkz. createStudentTool — AI_AGENT çağrısında şifre döndürülmez.
        if (ctx.role === "SCHOOL_ADMIN" || ctx.role === "SUPER_ADMIN") {
          tempLoginPassword = provisioned.tempPassword;
        }
      }
    }

    return ok({ teacherId: created?.id ?? "unknown", tempLoginPassword });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "createTeacher failed");
  }
}

/** ÖNCELİK 4 (devam) — öğretmen çoklu enstrüman+seviye düzenleme (admin only). */
export async function updateTeacherInstrumentsTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ teacherId: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(updateTeacherInstrumentsSchema, input);
  if (!v.ok) return v;

  const data = await readReferenceData();
  if (!data.teachers.some((t) => t.id === v.data.teacherId)) return fail("NOT_FOUND", "Öğretmen bulunamadı");

  const active = await resolveActiveInstrumentNames(ctx.tenantId);
  const invalid = v.data.instrumentLevels.find(
    (r) => !active.some((n) => n.toLocaleLowerCase("tr") === r.instrument.toLocaleLowerCase("tr"))
  );
  if (invalid) {
    return fail("VALIDATION_ERROR", `Geçersiz veya pasif enstrüman: "${invalid.instrument}".`);
  }

  try {
    const instruments = Array.from(new Set(v.data.instrumentLevels.map((r) => r.instrument as Instrument)));
    const updated = await updateTeacherInstruments(
      v.data.teacherId,
      instruments,
      v.data.instrumentLevels as Teacher["instrumentLevels"]
    );
    if (!updated) return fail("NOT_FOUND", "Öğretmen bulunamadı");
    audit(ctx, "teacher.instruments_update", "Teacher", v.data.teacherId, { instrumentCount: instruments.length });
    return ok({ teacherId: v.data.teacherId });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "updateTeacherInstruments failed");
  }
}

/**
 * Package D — öğretmen özlük/idari alanları + ek şube ataması. T.C. kimlik
 * ayrı `setNationalIdTool`'dan (mevcut tek doğrulama/şifreleme/audit yolu).
 * Yalnız SCHOOL_ADMIN/SUPER_ADMIN — özlük verisi hassas, TEACHER kendi
 * kaydını bile bu yoldan değiştiremez.
 */
export async function updateTeacherProfileTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ teacherId: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(updateTeacherProfileSchema, input);
  if (!v.ok) return v;

  const data = await readReferenceData();
  const teacher = data.teachers.find((t) => t.id === v.data.teacherId);
  if (!teacher) return fail("NOT_FOUND", "Öğretmen bulunamadı");

  const requested = [...(v.data.branchId ? [v.data.branchId] : []), ...(v.data.branchIds ?? [])];
  const invalid = requested.find((bId) => !data.settings.branches.some((b) => b.id === bId));
  if (invalid) {
    return fail("VALIDATION_ERROR", `Seçilen şube ("${invalid}") bu kurumda bulunamadı. Sayfayı yenileyip şubeyi listeden yeniden seçin.`);
  }

  try {
    const { teacherId, ...patch } = v.data;
    // 8. tur — birincil şube değişebilir; ek şubeler listesi birincili asla
    // tekrar içermez (teacherServesBranch birincili zaten dahil sayar).
    if (patch.branchId !== undefined || patch.branchIds !== undefined) {
      const primary = patch.branchId ?? teacher.branchId;
      patch.branchIds = Array.from(new Set(patch.branchIds ?? teacher.branchIds ?? [])).filter((b) => b !== primary);
    }
    const updated = await updateTeacherProfile(teacherId, patch);
    if (!updated) return fail("NOT_FOUND", "Öğretmen bulunamadı");
    audit(ctx, "teacher.profile_update", "Teacher", teacherId, patch);
    return ok({ teacherId });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "updateTeacherProfile failed");
  }
}

/** ÖNCELİK 4 (devam) — Paket Yönetimi: yeni paket (admin only, tenant-scoped, audit'li). */
/**
 * ÖNCELİK 4 (devam) — Yönetilebilir Enstrüman Kataloğu. Salt okuma tüm
 * personel rollerine açık (ders planlama/formlar bunu okuyabilmeli); yazma
 * (ekleme/düzenleme/pasife alma) yalnız SCHOOL_ADMIN/SUPER_ADMIN.
 */
export async function listInstrumentCatalogTool(
  ctx: ServiceContext,
  _input: unknown
): Promise<ServiceResult<{ entries: import("../types").InstrumentCatalogEntry[]; staticInstruments: string[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "TEACHER", "SUPER_ADMIN", "AI_AGENT"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const entries = await listInstrumentCatalog(ctx.tenantId);
  return ok({ entries, staticInstruments: [...INSTRUMENTS] });
}

export async function createInstrumentCatalogTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ entryId: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(createInstrumentCatalogSchema, input);
  if (!v.ok) return v;

  // Katalog hiç görüntülenmemişse (seed hiç çalışmamışsa) önce seed'i
  // tetikler — aksi halde "Piyano" gibi eski sabit isimlerle çakışma
  // kontrolü, henüz hiç satır yokken yanlışlıkla geçer.
  await listInstrumentCatalog(ctx.tenantId);
  const result = await createInstrumentCatalogEntry({ tenantId: ctx.tenantId, name: v.data.name, createdBy: ctx.userId });
  if (!result.ok) return fail("VALIDATION_ERROR", result.message);
  audit(ctx, "instrument.create", "InstrumentCatalogEntry", result.entry.id, { name: result.entry.name });
  return ok({ entryId: result.entry.id });
}

export async function updateInstrumentCatalogTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ entryId: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(updateInstrumentCatalogSchema, input);
  if (!v.ok) return v;

  const result = await updateInstrumentCatalogEntry(ctx.tenantId, v.data.entryId, {
    name: v.data.name,
    status: v.data.status,
  });
  if (!result.ok) return fail("VALIDATION_ERROR", result.message);
  audit(ctx, "instrument.update", "InstrumentCatalogEntry", v.data.entryId, {
    name: v.data.name,
    status: v.data.status,
  });
  return ok({ entryId: v.data.entryId });
}

/**
 * Personel Modülü — öğretmen dışı personel (idari/muhasebe/resepsiyon).
 * Salt okuma SCHOOL_ADMIN/SUPER_ADMIN'e açık (öğretmen kendi kadrosunu
 * yönetmez); yazma da aynı ikisiyle sınırlı — ayrı bir "yalnızca okuma"
 * rolü şimdilik yok, ihtiyaç olursa requireRole listesi genişletilebilir.
 */
export async function listStaffTool(
  ctx: ServiceContext,
  _input: unknown
): Promise<ServiceResult<{ staff: import("../types").StaffMember[] }>> {
  const auth = requireStaffSensitiveAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const staff = await listStaff(ctx.tenantId);
  return ok({ staff });
}

/**
 * İş 3E — hassas bordro/finans/T.C. kimlik alanları için ayrı yetki
 * kontrolü. SUPER_ADMIN her zaman; SCHOOL_ADMIN yalnızca kendi TEK
 * tenant'ında (birleşik "tüm kurumlar" görünümünde asla — aynı ilke
 * `kurum.scope.mode==="single"` UI kontrolüyle, burada sunucu tarafı
 * eşdeğeri: merged-view context'te zaten ayrı bir tenantId çözülmüyor).
 * NOT — bu şu an kaba roldür (SCHOOL_ADMIN hepsi ya hepsi yok); "bazı
 * SCHOOL_ADMIN'lere özel yetkilendirme" için ayrı bir izin/ACL tablosu
 * gerekir, bu turda YOK (final raporda açık risk olarak belirtildi).
 */
function requireStaffSensitiveAccess(ctx: ServiceContext): { ok: true } | { ok: false; message: string } {
  const role = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!role.ok) return role;
  if (!canViewFinanceAndStaffSummary(ctx)) {
    return { ok: false, message: "Bu alan yalnız kurum sahibi tarafından görülebilir." };
  }
  return { ok: true };
}

function staffFieldsFromInput(v: {
  name?: string;
  position?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  district?: string;
  birthDate?: string;
  photoUrl?: string;
  nationalId?: string;
  employeeNumber?: string;
  hireDate?: string;
  terminationDate?: string;
  department?: string;
  reportsToStaffId?: string;
  employmentType?: "full_time" | "part_time" | "contract" | "intern";
  branchId?: string;
  status?: import("../types").StaffMemberStatus;
  annualLeaveAllowanceDays?: number;
  personnelNotes?: string;
  notes?: string;
  monthlySalary?: number;
  hourlyRate?: number;
  defaultBonus?: number;
  defaultAllowances?: number;
  defaultDeductions?: number;
  emergencyContactName?: string;
  emergencyContactRelationship?: string;
  emergencyContactPhone?: string;
  contractStartDate?: string;
  contractEndDate?: string;
  sgkStatus?: string;
  iban?: string;
  annualAdvanceLimit?: number;
}) {
  return {
    name: v.name,
    position: v.position,
    phone: v.phone,
    email: v.email || undefined,
    address: v.address,
    city: v.city,
    district: v.district,
    birthDate: v.birthDate,
    photoUrl: v.photoUrl,
    nationalId: v.nationalId,
    employeeNumber: v.employeeNumber,
    hireDate: v.hireDate,
    terminationDate: v.terminationDate,
    department: v.department,
    reportsToStaffId: v.reportsToStaffId,
    employmentType: v.employmentType,
    branchId: v.branchId,
    status: v.status,
    annualLeaveAllowanceDays: v.annualLeaveAllowanceDays,
    personnelNotes: v.personnelNotes,
    notes: v.notes,
    monthlySalary: v.monthlySalary,
    hourlyRate: v.hourlyRate,
    defaultBonus: v.defaultBonus,
    defaultAllowances: v.defaultAllowances,
    defaultDeductions: v.defaultDeductions,
    emergencyContactName: v.emergencyContactName,
    emergencyContactRelationship: v.emergencyContactRelationship,
    emergencyContactPhone: v.emergencyContactPhone,
    contractStartDate: v.contractStartDate,
    contractEndDate: v.contractEndDate,
    sgkStatus: v.sgkStatus,
    iban: v.iban,
    annualAdvanceLimit: v.annualAdvanceLimit,
  };
}

/**
 * P0 personel onboarding revizyonu — personel için portalda GERÇEKTEN
 * desteklenen roller. `SUPER_ADMIN` (platform sahibi), `TEACHER` (ayrı
 * Teacher kaydına bağlı), `STUDENT` (veli/öğrenci portalı) ve `AI_AGENT`
 * bu formdan SEÇİLEMEZ — server-side zorunlu (UI filtresine güvenilmez).
 */
export const STAFF_PORTAL_ALLOWED_ROLES = ["SCHOOL_ADMIN"] as const;
export type StaffPortalAllowedRole = (typeof STAFF_PORTAL_ALLOWED_ROLES)[number];

const STAFF_PORTAL_BLOCKED_MESSAGE =
  "Bu rol personel portal daveti için desteklenmiyor. Personel yalnız yönetim paneli (SCHOOL_ADMIN) rolüyle davet edilebilir; platform sahibi (SUPER_ADMIN), öğretmen, veli/öğrenci veya AI rolleri bu ekrandan atanamaz.";

export type StaffPortalOutcome =
  | { status: "created"; userId: string; delivered?: boolean; blocked?: boolean }
  | { status: "linked"; userId: string; delivered?: boolean; blocked?: boolean }
  | { status: "duplicate_blocked"; message: string }
  | { status: "skipped"; message: string };

async function linkStaffToUser(
  ctx: ServiceContext,
  staffId: string,
  userId: string,
  auditAction: string
): Promise<void> {
  await updateStaffMember(ctx.tenantId, staffId, { portalUserId: userId });
  audit(ctx, auditAction, "StaffMember", staffId, { userId });
}

/**
 * E-posta çakışması kuralı (öğretmen akışıyla AYNI ilke): bu e-posta ZATEN
 * bir kullanıcıya bağlıysa duplicate hesap AÇILMAZ. Güvenli ilişkilendirme
 * YALNIZCA mevcut hesap aynı tenant'ta, SCHOOL_ADMIN rolünde ve hiçbir
 * öğretmen/öğrenci/personel kaydına bağlı DEĞİLSE yapılır; aksi halde
 * kullanıcı dostu bir uyarı döner (personel kaydı KORUNUR — oluşturma
 * başarılı sayılır, yalnız portal adımı atlanır).
 */
async function resolveStaffPortalUser(
  ctx: ServiceContext,
  email: string
): Promise<{ userId: string; linked: boolean } | { blocked: string }> {
  const { getUserIdByEmail } = await import("../auth/users");
  const existingUserId = await getUserIdByEmail(ctx.tenantId, email);
  if (existingUserId) {
    const existingUser = await getUserById(existingUserId);
    if (
      !existingUser ||
      existingUser.role !== "SCHOOL_ADMIN" ||
      existingUser.teacherId ||
      existingUser.studentId
    ) {
      return {
        blocked:
          "Bu e-posta adresi zaten farklı bir rolde (öğretmen/veli/öğrenci) veya başka bir kayda bağlı bir portal hesabına ait. Hesap eşlemesini bozmamak için yeni portal hesabı açılmadı — lütfen e-postayı kontrol edin.",
      };
    }
    // Aynı tenant'ta başka bir personele bağlı mı?
    const staffList = await listStaff(ctx.tenantId);
    if (staffList.some((s) => s.portalUserId === existingUserId)) {
      return {
        blocked:
          "Bu e-posta adresi zaten BAŞKA bir personel kaydının portal hesabına bağlı. Hesap eşlemesini bozmamak için yeni portal hesabı açılmadı — lütfen e-postayı kontrol edin.",
      };
    }
    return { userId: existingUserId, linked: true };
  }
  const provisioned = await provisionStaffLogin({ tenantId: ctx.tenantId, email });
  if (!provisioned) {
    return { blocked: "Portal hesabı oluşturulamadı — e-posta adresini kontrol edip tekrar deneyin." };
  }
  return { userId: provisioned.userId, linked: false };
}

async function sendStaffInvitation(
  ctx: ServiceContext,
  staff: { id: string; name: string; email?: string },
  userId: string
): Promise<{ delivered: boolean; blocked?: boolean }> {
  const data = await readData();
  const { sendAccountInvitationEmail } = await import("../auth/invitation");
  const result = await sendAccountInvitationEmail({
    tenantId: ctx.tenantId,
    userId,
    email: staff.email!,
    recipientName: staff.name,
    institutionName: data.settings.name ?? "NeviiHub",
    role: "SCHOOL_ADMIN",
    schoolPhone: data.settings.phone || undefined,
    schoolWebsite: data.settings.website || undefined,
    logoUrl: data.settings.logoUrl || undefined,
  });
  await updateStaffMember(ctx.tenantId, staff.id, { portalInvitedAt: new Date().toISOString() });
  audit(ctx, "staff.portal_invitation_sent", "StaffMember", staff.id, { delivered: result.delivered });
  return { delivered: result.delivered, blocked: result.delivered ? undefined : result.blocked };
}

export async function createStaffMemberTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ staffId: string; portal?: StaffPortalOutcome }>> {
  const auth = requireStaffSensitiveAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(createStaffMemberWithPortalSchema, input);
  if (!v.ok) return v;

  const result = await createStaffMember({
    tenantId: ctx.tenantId,
    createdBy: ctx.userId,
    ...staffFieldsFromInput(v.data),
  });
  if (!result.ok) return fail("VALIDATION_ERROR", result.message);
  audit(ctx, "staff.create", "StaffMember", result.entry.id, { name: result.entry.name, position: result.entry.position });

  // Portal erişimi YALNIZCA yönetici bilinçli olarak işaretlediyse açılır
  // (öğrenci akışındaki createPortalAccess kuralıyla AYNI — e-posta dolu
  // olması tek başına hesap AÇMAZ).
  if (!v.data.createPortalAccess) {
    return ok({ staffId: result.entry.id, portal: { status: "skipped", message: "Portal erişimi oluşturulmadı." } });
  }
  const email = (v.data.email || "").trim();
  if (!email) {
    return ok({ staffId: result.entry.id, portal: { status: "skipped", message: "E-posta girilmeden portal erişimi oluşturulamaz." } });
  }
  const requestedRole = (v.data.portalRole || "SCHOOL_ADMIN").trim();
  if (!(STAFF_PORTAL_ALLOWED_ROLES as readonly string[]).includes(requestedRole)) {
    return ok({ staffId: result.entry.id, portal: { status: "duplicate_blocked", message: STAFF_PORTAL_BLOCKED_MESSAGE } });
  }

  const resolved = await resolveStaffPortalUser(ctx, email);
  if ("blocked" in resolved) {
    return ok({ staffId: result.entry.id, portal: { status: "duplicate_blocked", message: resolved.blocked } });
  }
  await linkStaffToUser(ctx, result.entry.id, resolved.userId, resolved.linked ? "staff.portal_linked" : "staff.login_provisioned");

  if (!v.data.sendInvitation) {
    return ok({ staffId: result.entry.id, portal: { status: resolved.linked ? "linked" : "created", userId: resolved.userId } });
  }
  if (isRateLimited(`invite:${ctx.tenantId}:${email.toLowerCase()}`, 5, 60 * 60 * 1000)) {
    return ok({
      staffId: result.entry.id,
      portal: {
        status: resolved.linked ? "linked" : "created",
        userId: resolved.userId,
        delivered: false,
        blocked: true,
      },
    });
  }
  const invite = await sendStaffInvitation(ctx, { id: result.entry.id, name: result.entry.name, email }, resolved.userId);
  return ok({
    staffId: result.entry.id,
    portal: { status: resolved.linked ? "linked" : "created", userId: resolved.userId, ...invite },
  });
}

export async function updateStaffMemberTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ staffId: string }>> {
  const auth = requireStaffSensitiveAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(updateStaffMemberSchema, input);
  if (!v.ok) return v;

  const result = await updateStaffMember(ctx.tenantId, v.data.staffId, staffFieldsFromInput(v.data));
  if (!result.ok) return fail("VALIDATION_ERROR", result.message);
  audit(ctx, "staff.update", "StaffMember", v.data.staffId, { status: v.data.status });
  return ok({ staffId: v.data.staffId });
}

/* ------------------------------------------------------------------ */
/* P0 personel onboarding revizyonu — personel "Portal erişimi" kartı  */
/* (öğretmen kartıyla AYNI desen: öğretmen tarafı tek hesap, personel   */
/* tarafı da tek hesap — StaffMember.portalUserId). Yeni token/şifre    */
/* mekanizması YOK: davet/sıfırlama mevcut invitation.ts altyapısını    */
/* kullanır; local'de SMTP yoksa console transport BLOCKED döner (sahte */
/* başarı YOK).                                                         */
/* ------------------------------------------------------------------ */

const staffIdOnlySchema = z.object({ staffId: z.string().min(1) });

export type StaffAccountStatusSummary = {
  exists: boolean;
  userId: string | null;
  email: string;
  role: string | null;
  active: boolean;
  lastInvitedAt: string | null;
  lastPasswordResetRequestedAt: string | null;
};

type StaffAccountLookup =
  | { error: string }
  | { staff: import("../types").StaffMember; account: import("../auth/users").UserAccountStatus | null };

async function getStaffAccount(ctx: ServiceContext, staffId: string): Promise<StaffAccountLookup> {
  const staff = await getStaffMember(ctx.tenantId, staffId);
  if (!staff) return { error: "Personel kaydı bulunamadı." };
  if (!staff.portalUserId) return { staff, account: null };
  const account = await getUserAccountStatus(staff.portalUserId);
  return { staff, account };
}

/** Personel detay ekranındaki "Portal erişimi" kartının okuma tarafı — RBAC: hassas personel erişimi. */
export async function getStaffAccountStatusTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<StaffAccountStatusSummary>> {
  const auth = requireStaffSensitiveAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(staffIdOnlySchema, input);
  if (!v.ok) return v;

  const lookup = await getStaffAccount(ctx, v.data.staffId);
  if ("error" in lookup) return fail("NOT_FOUND", "Personel kaydı bulunamadı.");
  const { staff, account } = lookup;
  if (!account) {
    return ok({ exists: false, userId: null, email: "", role: null, active: false, lastInvitedAt: null, lastPasswordResetRequestedAt: null });
  }
  const lastPasswordResetRequestedAt = await getLatestPasswordResetRequestAt(account.userId);
  return ok({
    exists: true,
    userId: account.userId,
    email: account.email,
    role: account.role,
    active: account.active,
    lastInvitedAt: staff.portalInvitedAt ?? null,
    lastPasswordResetRequestedAt,
  });
}

/**
 * Kurum sahibi — personel performans raporu (görev + tahsilat + kurum geneli
 * yeni kayıt bağlamı). Öğretmen performansından ayrıdır. Yalnız SUPER_ADMIN
 * (personel ekranı ile aynı sınır; SCHOOL_ADMIN görmez).
 */
export async function getStaffPerformanceTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<StaffPerformanceReport>> {
  const auth = requireRole(ctx, ["SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", "Personel performansı yalnız kurum sahibi tarafından görülebilir.");
  if (!canViewFinanceAndStaffSummary(ctx)) {
    return fail("FORBIDDEN", "Personel performansı yalnız kurum sahibi tarafından görülebilir.");
  }

  const v = parseOrFail(
    z.object({
      staffId: z.string().min(1),
      /** yyyy-MM — verilmezse kurum saat dilimindeki içinde bulunulan ay. */
      yearMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      /** Test/deterministik tarih için — yyyy-MM-dd; yearMonth yoksa bundan türetilir. */
      todayYmd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }),
    input
  );
  if (!v.ok) return v;

  const staff = await getStaffMember(ctx.tenantId, v.data.staffId);
  if (!staff) return fail("NOT_FOUND", "Personel kaydı bulunamadı.");

  const todayYmd = v.data.todayYmd ?? new Date().toISOString().slice(0, 10);
  const yearMonth = v.data.yearMonth ?? currentYearMonth(todayYmd);

  const [data, tasks, trials] = await Promise.all([readData(), listTasks(ctx.tenantId, {}), listTrialLessons(ctx.tenantId)]);
  const report = computeStaffPerformanceReport({
    staff,
    tasks,
    data,
    trials,
    yearMonth,
    weights: resolvePerformanceWeights(data.settings.performanceWeights).staff,
  });
  return ok(report);
}

/**
 * Personel portal erişimini aç/kapat — `User.active` alanını değiştirir.
 * Kapatmak girişi engeller (bir sonraki istekten itibaren); hiçbir
 * personel/özlük verisi SİLİNMEZ. Açmak MEVCUT hesabı geri açar.
 */
export async function setStaffAccountActiveTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ staffId: string; active: boolean }>> {
  const auth = requireStaffSensitiveAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(z.object({ staffId: z.string().min(1), active: z.boolean() }), input);
  if (!v.ok) return v;

  const lookup = await getStaffAccount(ctx, v.data.staffId);
  if ("error" in lookup) return fail("NOT_FOUND", "Personel kaydı bulunamadı.");
  const { account } = lookup;
  if (!account) return fail("NOT_FOUND", "Bu personel için portal hesabı bulunamadı — önce davet gönderin.");

  const updated = await setUserActive(account.userId, v.data.active);
  if (!updated) return fail("INTERNAL_ERROR", "Hesap durumu güncellenemedi.");

  audit(ctx, v.data.active ? "staff.portal_access_reactivated" : "staff.portal_access_revoked", "StaffMember", v.data.staffId, {
    userId: account.userId,
  });
  return ok({ staffId: v.data.staffId, active: v.data.active });
}

/**
 * Personel daveti (ilk + yeniden gönderme — AYNI fonksiyon, idempotent).
 * Hesap yoksa önce güvenli şekilde oluşturur/bağlar (duplicate kuralı
 * `resolveStaffPortalUser`), sonra mevcut davet akışıyla e-posta gönderir.
 * Rol allowlist server-side zorunludur.
 */
export async function inviteStaffAccountTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ staffId: string; delivered: boolean; blocked?: boolean }>> {
  const auth = requireStaffSensitiveAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(staffIdOnlySchema, input);
  if (!v.ok) return v;

  const staff = await getStaffMember(ctx.tenantId, v.data.staffId);
  if (!staff) return fail("NOT_FOUND", "Personel kaydı bulunamadı.");
  if (!staff.email) return fail("VALIDATION_ERROR", "Önce geçerli bir e-posta adresi ekleyin.");

  if (isRateLimited(`invite:${ctx.tenantId}:${staff.email.toLowerCase()}`, 5, 60 * 60 * 1000)) {
    return fail("RATE_LIMITED", "Bu e-posta adresine çok fazla davet gönderildi. Lütfen bir süre sonra tekrar deneyin.");
  }

  // Mevcut bağlantı hâlâ geçerli mi (hesap silinmiş olabilir)?
  let userId = staff.portalUserId ?? null;
  if (userId) {
    const account = await getUserAccountStatus(userId);
    if (!account || account.role !== "SCHOOL_ADMIN") userId = null;
  }
  if (!userId) {
    const resolved = await resolveStaffPortalUser(ctx, staff.email);
    if ("blocked" in resolved) return fail("VALIDATION_ERROR", resolved.blocked);
    userId = resolved.userId;
    await linkStaffToUser(ctx, staff.id, userId, resolved.linked ? "staff.portal_linked" : "staff.login_provisioned");
  }

  const invite = await sendStaffInvitation(ctx, { id: staff.id, name: staff.name, email: staff.email }, userId);
  return ok({ staffId: staff.id, delivered: invite.delivered, blocked: invite.blocked });
}

/** Personel portal hesabı için şifre sıfırlama bağlantısı (mevcut reset akışı). */
export async function sendStaffPasswordResetTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ staffId: string; delivered: boolean; blocked?: boolean }>> {
  const auth = requireStaffSensitiveAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(staffIdOnlySchema, input);
  if (!v.ok) return v;

  const lookup = await getStaffAccount(ctx, v.data.staffId);
  if ("error" in lookup) return fail("NOT_FOUND", "Personel kaydı bulunamadı.");
  const { staff, account } = lookup;
  if (!account) return fail("NOT_FOUND", "Bu personel için portal hesabı bulunamadı — önce davet gönderin.");
  if (!account.active) {
    return fail("VALIDATION_ERROR", "Erişim kapalıyken şifre sıfırlama bağlantısı gönderilemez. Önce erişimi açın.");
  }
  if (!account.email) {
    return fail("VALIDATION_ERROR", "Önce geçerli bir e-posta adresi ekleyin.");
  }

  if (isRateLimited(`admin-pwreset:${ctx.tenantId}:${account.email.toLowerCase()}`, 5, 60 * 60 * 1000)) {
    return fail("RATE_LIMITED", "Bu hesaba çok fazla şifre sıfırlama isteği gönderildi. Lütfen bir süre sonra tekrar deneyin.");
  }

  const data = await readData();

  try {
    const { sendPasswordResetEmail } = await import("../auth/invitation");
    const result = await sendPasswordResetEmail({
      tenantId: ctx.tenantId,
      userId: account.userId,
      email: account.email,
      recipientName: staff.name,
      institutionName: data.settings.name ?? "NeviiHub",
      logoUrl: data.settings.logoUrl || undefined,
    });
    audit(ctx, "staff.portal_password_reset_sent", "StaffMember", v.data.staffId, { delivered: result.delivered });
    return ok({ staffId: v.data.staffId, delivered: result.delivered, blocked: result.delivered ? undefined : result.blocked });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "sendStaffPasswordReset failed");
  }
}

/** İş 3B — Bordro. Yalnızca hassas erişimi olan roller (bkz. requireStaffSensitiveAccess). */
export async function listPayrollTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ records: import("../types").PayrollRecord[] }>> {
  const auth = requireStaffSensitiveAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(z.object({ staffId: z.string().optional(), month: z.string().optional() }), input);
  if (!v.ok) return v;
  const records = await listPayroll(ctx.tenantId, v.data);
  return ok({ records });
}

export async function createPayrollRecordTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ payrollId: string }>> {
  const auth = requireStaffSensitiveAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(createPayrollRecordSchema, input);
  if (!v.ok) return v;
  const result = await createPayrollRecord({ tenantId: ctx.tenantId, createdBy: ctx.userId, ...v.data });
  if (!result.ok) return fail("VALIDATION_ERROR", result.message);
  audit(ctx, "payroll.create", "PayrollRecord", result.entry.id, { staffId: result.entry.staffId, month: result.entry.month });
  return ok({ payrollId: result.entry.id });
}

export async function updatePayrollStatusTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ payrollId: string }>> {
  const auth = requireStaffSensitiveAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(updatePayrollStatusSchema, input);
  if (!v.ok) return v;
  const result = await updatePayrollStatus(ctx.tenantId, v.data.payrollId, v.data);
  if (!result.ok) return fail("VALIDATION_ERROR", result.message);
  audit(ctx, "payroll.status_update", "PayrollRecord", v.data.payrollId, { status: v.data.status });
  return ok({ payrollId: v.data.payrollId });
}

/** İş 3C — İzin. Salt okuma SCHOOL_ADMIN/SUPER_ADMIN/TEACHER'a (kendi izinlerini görebilsin) açık; onay yalnızca admin. */
export async function listLeaveTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ requests: import("../types").LeaveRequest[] }>> {
  const auth = requireStaffSensitiveAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(z.object({ staffId: z.string().optional() }), input);
  if (!v.ok) return v;
  const requests = await listLeave(ctx.tenantId, v.data.staffId);
  return ok({ requests });
}

export async function createLeaveRequestTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ leaveId: string }>> {
  const auth = requireStaffSensitiveAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(createLeaveRequestSchema, input);
  if (!v.ok) return v;
  const result = await createLeaveRequest({ tenantId: ctx.tenantId, createdBy: ctx.userId, ...v.data });
  if (!result.ok) return fail("VALIDATION_ERROR", result.message);
  audit(ctx, "leave.create", "LeaveRequest", result.entry.id, { staffId: result.entry.staffId });
  // Yönetici bildirimleri — talep oluşturan kişi hariç (kendi bildirimi almaz).
  try {
    const { notifyAdmins } = await import("../manager-notifications");
    const range = `${result.entry.startDate} – ${result.entry.endDate}`;
    await notifyAdmins(
      ctx.tenantId,
      "leave_new_request",
      {
        title: "Yeni izin talebi",
        body: `Onay bekleyen izin talebi (${range}, ${result.entry.dayCount} gün). Detay: /panel/personel/izinler`,
      },
      // Owner kararı: personel ekranı yalnız kurum sahibinde → bildirim de yalnız ona.
      { excludeUserId: ctx.userId, dedupeKey: result.entry.id, roles: ["SUPER_ADMIN"] }
    );
  } catch {
    // best-effort
  }
  return ok({ leaveId: result.entry.id });
}

export async function decideLeaveRequestTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ leaveId: string }>> {
  const auth = requireStaffSensitiveAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(decideLeaveRequestSchema, input);
  if (!v.ok) return v;
  const result = await decideLeaveRequest(ctx.tenantId, v.data.leaveId, { status: v.data.status, approvedBy: ctx.userId });
  if (!result.ok) return fail("VALIDATION_ERROR", result.message);
  audit(ctx, "leave.decide", "LeaveRequest", v.data.leaveId, { status: v.data.status });
  return ok({ leaveId: v.data.leaveId });
}

/** Faz 9B — Avans modülü. leave.ts'teki `requireStaffSensitiveAccess`/RBAC deseniyle AYNI. */
export async function listStaffAdvancesTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ advances: import("../types").StaffAdvance[] }>> {
  const auth = requireStaffSensitiveAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(z.object({ staffId: z.string().optional() }), input);
  if (!v.ok) return v;
  const advances = await listStaffAdvances(ctx.tenantId, v.data.staffId);
  return ok({ advances });
}

export async function createStaffAdvanceTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ advanceId: string }>> {
  const auth = requireStaffSensitiveAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(createStaffAdvanceSchema, input);
  if (!v.ok) return v;

  const staffMember = await getStaffMember(ctx.tenantId, v.data.staffId);
  if (!staffMember) return fail("NOT_FOUND", "Personel kaydı bulunamadı.");

  if (staffMember.annualAdvanceLimit !== undefined) {
    const year = Number(v.data.requestDate.slice(0, 4));
    const usedThisYear = await sumApprovedOrPaidForYear(ctx.tenantId, v.data.staffId, year);
    if (usedThisYear + v.data.amount > staffMember.annualAdvanceLimit) {
      return fail(
        "VALIDATION_ERROR",
        `Yıllık avans limiti aşılıyor (${year} kullanım: ${usedThisYear}, limit: ${staffMember.annualAdvanceLimit}).`
      );
    }
  }

  const result = await createStaffAdvance({ tenantId: ctx.tenantId, createdBy: ctx.userId, ...v.data });
  if (!result.ok) return fail("VALIDATION_ERROR", result.message);
  audit(ctx, "staff_advance.create", "StaffAdvance", result.entry.id, {
    staffId: result.entry.staffId,
    amount: result.entry.amount,
  });
  return ok({ advanceId: result.entry.id });
}

export async function decideStaffAdvanceTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ advanceId: string }>> {
  const auth = requireStaffSensitiveAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(decideStaffAdvanceSchema, input);
  if (!v.ok) return v;
  const result = await decideStaffAdvance(ctx.tenantId, v.data.advanceId, { status: v.data.status, approvedBy: ctx.userId });
  if (!result.ok) return fail("VALIDATION_ERROR", result.message);
  audit(ctx, "staff_advance.decide", "StaffAdvance", v.data.advanceId, { status: v.data.status });
  return ok({ advanceId: v.data.advanceId });
}

export async function markStaffAdvancePaidTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ advanceId: string }>> {
  const auth = requireStaffSensitiveAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(markStaffAdvancePaidSchema, input);
  if (!v.ok) return v;
  const result = await markStaffAdvancePaid(ctx.tenantId, v.data.advanceId, { paymentMethod: v.data.paymentMethod });
  if (!result.ok) return fail("VALIDATION_ERROR", result.message);
  audit(ctx, "staff_advance.mark_paid", "StaffAdvance", v.data.advanceId, {});
  return ok({ advanceId: v.data.advanceId });
}

export async function cancelStaffAdvanceTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ advanceId: string }>> {
  const auth = requireStaffSensitiveAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(cancelStaffAdvanceSchema, input);
  if (!v.ok) return v;
  const result = await cancelStaffAdvance(ctx.tenantId, v.data.advanceId);
  if (!result.ok) return fail("VALIDATION_ERROR", result.message);
  audit(ctx, "staff_advance.cancel", "StaffAdvance", v.data.advanceId, {});
  return ok({ advanceId: v.data.advanceId });
}

/** İş 3D — Gider + mali özet. Yalnızca hassas erişimi olan roller. */
export async function listExpensesTool(
  ctx: ServiceContext,
  _input: unknown
): Promise<ServiceResult<{ expenses: import("../types").ExpenseRecord[] }>> {
  const auth = requireStaffSensitiveAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const expenses = await listExpenses(ctx.tenantId);
  return ok({ expenses });
}

export async function createExpenseTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ expenseId: string }>> {
  const auth = requireStaffSensitiveAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(createExpenseSchema, input);
  if (!v.ok) return v;
  const result = await createExpense({ tenantId: ctx.tenantId, createdBy: ctx.userId, ...v.data });
  if (!result.ok) return fail("VALIDATION_ERROR", result.message);
  audit(ctx, "expense.create", "ExpenseRecord", result.entry.id, { category: result.entry.category, amount: result.entry.amount });
  return ok({ expenseId: result.entry.id });
}

/** Faz 10 — bir gideri ödenmiş işaretler ("bekliyor"/"gecikmiş" listesinden çıkar). */
export async function markExpensePaidTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ expenseId: string }>> {
  const auth = requireStaffSensitiveAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(markExpensePaidSchema, input);
  if (!v.ok) return v;
  const result = await markExpensePaid(ctx.tenantId, v.data.expenseId, { paymentMethod: v.data.paymentMethod });
  if (!result.ok) return fail("VALIDATION_ERROR", result.message);
  audit(ctx, "expense.mark_paid", "ExpenseRecord", v.data.expenseId, {});
  return ok({ expenseId: v.data.expenseId });
}

/** Faz 10 (adım 3) — tekrarlayan gider kuralları. */
export async function listRecurringExpenseRulesTool(
  ctx: ServiceContext,
  _input: unknown
): Promise<ServiceResult<{ rules: import("../types").RecurringExpenseRule[] }>> {
  const auth = requireStaffSensitiveAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const rules = await listRecurringExpenseRules(ctx.tenantId);
  return ok({ rules });
}

export async function createRecurringExpenseRuleTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ ruleId: string }>> {
  const auth = requireStaffSensitiveAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(createRecurringExpenseRuleSchema, input);
  if (!v.ok) return v;
  const result = await createRecurringExpenseRule({ tenantId: ctx.tenantId, createdBy: ctx.userId, ...v.data });
  if (!result.ok) return fail("VALIDATION_ERROR", result.message);
  audit(ctx, "recurring_expense_rule.create", "RecurringExpenseRule", result.entry.id, {
    category: result.entry.category,
    frequency: result.entry.frequency,
  });
  return ok({ ruleId: result.entry.id });
}

export async function setRecurringExpenseRuleActiveTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ ruleId: string }>> {
  const auth = requireStaffSensitiveAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(setRecurringExpenseRuleActiveSchema, input);
  if (!v.ok) return v;
  const result = await setRecurringExpenseRuleActive(ctx.tenantId, v.data.ruleId, v.data.active);
  if (!result.ok) return fail("VALIDATION_ERROR", result.message);
  audit(ctx, "recurring_expense_rule.set_active", "RecurringExpenseRule", v.data.ruleId, { active: v.data.active });
  return ok({ ruleId: v.data.ruleId });
}

/**
 * Faz 10 (adım 3) — vadesi gelmiş tekrarlayan gider kurallarını çalıştırır.
 * İNSAN TARAFINDAN TETİKLENİR (bkz. recurring-expense.ts dosya başı notu —
 * bilinçli olarak workflows/* otonom motoruna bağlanmadı).
 */
export async function tickRecurringExpenseRulesTool(
  ctx: ServiceContext,
  _input: unknown
): Promise<ServiceResult<{ generated: number }>> {
  const auth = requireStaffSensitiveAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const result = await tickRecurringExpenseRules(ctx.tenantId);
  if (result.generated > 0) {
    audit(ctx, "recurring_expense_rule.tick", "RecurringExpenseRule", ctx.tenantId, { generated: result.generated });
  }
  return ok(result);
}

/** Faz 10 (adım 3) — kategori/şube/dönem bazlı hedef gider tutarı. */
export async function listBudgetsTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ budgets: import("../types").Budget[] }>> {
  const auth = requireStaffSensitiveAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(z.object({ period: z.string().optional() }), input);
  if (!v.ok) return v;
  const budgets = await listBudgets(ctx.tenantId, v.data.period);
  return ok({ budgets });
}

export async function upsertBudgetTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ budgetId: string }>> {
  const auth = requireStaffSensitiveAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(upsertBudgetSchema, input);
  if (!v.ok) return v;
  const result = await upsertBudget({ tenantId: ctx.tenantId, createdBy: ctx.userId, ...v.data });
  if (!result.ok) return fail("VALIDATION_ERROR", result.message);
  audit(ctx, "budget.upsert", "Budget", result.entry.id, { category: result.entry.category, period: result.entry.period });
  return ok({ budgetId: result.entry.id });
}

export async function getFinanceSummaryTool(
  ctx: ServiceContext,
  input: unknown
): Promise<
  ServiceResult<
    import("../finance-summary").FinanceSummary & {
      averageMonthlyFee: ReturnType<typeof import("../finance-summary").computeAverageMonthlyFeePerStudent> & { branchId?: string };
      /** 10. tur iş #6 — ücret ortalamasıyla AYNI paydanın tahsilat ortalaması. */
      averageCollected: ReturnType<typeof import("../finance-summary").computeAverageCollectedPerStudent>;
      /** 10. tur iş #6 — trend ayları için ücret + tahsilat ortalaması. */
      averageFeeTrend: ReturnType<typeof import("../finance-summary").computeAverageFeeTrend>;
    }
  >
> {
  const auth = requireStaffSensitiveAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(
    z.object({
      branchId: z.string().min(1).optional(),
      // 10. tur iş #6 — ay seçimi (boş/geçersizse bugünün ayı).
      month: z
        .string()
        .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
        .optional(),
    }),
    input ?? {}
  );
  if (!v.ok) return v;
  const data = await readData();
  const staff = await listStaff(ctx.tenantId);
  const payroll = await listPayroll(ctx.tenantId);
  const expenses = await listExpenses(ctx.tenantId);
  const budgets = await listBudgets(ctx.tenantId);
  const { listContractSummariesByStudent } = await import("../contracts");
  const contractSummaries = await listContractSummariesByStudent(ctx.tenantId);
  const { computeFinanceSummary, computeAverageMonthlyFeePerStudent, computeAverageCollectedPerStudent, computeAverageFeeTrend } =
    await import("../finance-summary");
  const summary = computeFinanceSummary(data, staff, payroll, expenses, new Date(), budgets, v.data.month);
  const contracts = [...contractSummaries.values()];
  const averageMonthlyFee = computeAverageMonthlyFeePerStudent({
    contracts,
    students: data.students,
    month: summary.month,
    branchId: v.data.branchId,
  });
  const averageCollected = computeAverageCollectedPerStudent({
    payments: data.payments,
    studentIds: averageMonthlyFee.studentIds,
    month: summary.month,
  });
  const averageFeeTrend = computeAverageFeeTrend({
    contracts,
    students: data.students,
    payments: data.payments,
    months: summary.trend.map((t) => t.month),
    branchId: v.data.branchId,
  });
  return ok({
    ...summary,
    averageMonthlyFee: { ...averageMonthlyFee, branchId: v.data.branchId },
    averageCollected,
    averageFeeTrend,
  });
}

export async function createPackageTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ packageId: string }>> {
  // Paket & Kampanya Motoru — yazma işlemleri yalnız SUPER_ADMIN (okuma aynen).
  const auth = requireRole(ctx, ["SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(createPackageSchema, input);
  if (!v.ok) return v;

  const result = await addPackage({
    ...v.data,
    defaultDurationMinutes: v.data.defaultDurationMinutes as LessonDurationPreference | undefined,
    applicableBranchIds: v.data.applicableBranchIds as import("../types").BranchId[] | undefined,
    createdBy: ctx.userId,
    createdByUserId: ctx.userId,
  });
  if (!result.ok) return fail("VALIDATION_ERROR", result.message);
  audit(ctx, "package.create", "Package", result.pkg.id, { title: result.pkg.title });
  return ok({ packageId: result.pkg.id });
}

/**
 * ÖNCELİK 4 (devam) — Paket Yönetimi: fiyat/açıklama/durum güncelleme
 * (arşivleme dahil, `status:"archived"`). Hard delete YOK. GEÇMİŞ Payment
 * kayıtlarına dokunmaz — Package sadece ileriye dönük referans/görüntüleme
 * amaçlıdır (bkz. src/lib/packages.ts dokümantasyonu).
 */
export async function updatePackageTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ packageId: string }>> {
  // Paket & Kampanya Motoru — yazma işlemleri yalnız SUPER_ADMIN (okuma aynen).
  const auth = requireRole(ctx, ["SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(updatePackageSchema, input);
  if (!v.ok) return v;

  const { packageId, ...patch } = v.data;
  const result = await updatePackage(packageId, {
    ...patch,
    defaultDurationMinutes: patch.defaultDurationMinutes as LessonDurationPreference | undefined,
    applicableBranchIds: patch.applicableBranchIds as import("../types").BranchId[] | undefined,
  });
  if (!result.ok) return fail("VALIDATION_ERROR", result.message);
  audit(ctx, "package.update", "Package", packageId, patch);
  return ok({ packageId });
}

/**
 * 9. tur — paket silme ön izlemesi: kullanım (öğrenci bağları) ve kalıcı silinebilirlik.
 * Onay kutusu bunu gösterir; asıl karar `deletePackageTool` içinde güncel veriden YENİDEN verilir.
 */
export async function getPackageDeletionImpactTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<import("../packages").PackageDeletionImpact & { criticalPasswordConfigured: boolean }>> {
  // Paket & Kampanya Motoru — paket CRUD yalnız SUPER_ADMIN.
  const auth = requireRole(ctx, ["SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", "Paket silme yalnız kurum sahibi ve kurum yöneticileri tarafından başlatılabilir.");
  const v = parseOrFail(z.object({ packageId: z.string().min(1) }), input);
  if (!v.ok) return v;
  const { computePackageDeletionImpact } = await import("../packages");
  const impact = computePackageDeletionImpact(await readData(), v.data.packageId);
  if (!impact) return fail("NOT_FOUND", "Paket bulunamadı; başka biri silmiş olabilir. Listeyi yenileyin.");
  const { getCriticalActionPasswordStatus } = await import("../critical-action-password");
  const status = await getCriticalActionPasswordStatus(ctx.tenantId);
  return ok({ ...impact, criticalPasswordConfigured: status.configured });
}

/**
 * 9. tur — yanlışlıkla oluşturulmuş, HİÇ kullanılmamış paketi kalıcı siler. Kapılar:
 * rol (SUPER_ADMIN/SCHOOL_ADMIN) → paket adı teyidi → kritik işlem şifresi (sunucuda bcrypt,
 * rate-limit) → güncel veriden kullanım kontrolü + eşzamanlılık (`expectedUpdatedAt`).
 * Kullanılmış paket silinmez (arşivlenir). Her deneme, reddedilen dahil, denetim kaydına yazılır.
 */
export async function deletePackageTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ packageId: string }>> {
  // Paket & Kampanya Motoru — paket CRUD yalnız SUPER_ADMIN.
  const auth = requireRole(ctx, ["SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", "Paket silme yalnız kurum sahibi ve kurum yöneticileri tarafından başlatılabilir.");
  const v = parseOrFail(
    z.object({
      packageId: z.string().min(1),
      confirmationTitle: z.string(),
      criticalPassword: z.string(),
      expectedUpdatedAt: z.string().min(1),
      reason: z.string().trim().min(5, "Silme gerekçesi en az 5 karakter olmalı.").max(500),
    }),
    input
  );
  if (!v.ok) return v;
  const data = await readReferenceData();
  const pkg = (data.packages ?? []).find((p) => p.id === v.data.packageId);
  if (!pkg) return fail("NOT_FOUND", "Paket bulunamadı; başka biri silmiş olabilir. Listeyi yenileyin.");

  const deny = async (reasonCode: string, message: string, code: "FORBIDDEN" | "CONFLICT" = "FORBIDDEN") => {
    await recordAuditLog({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      action: "package.delete",
      entityType: "Package",
      entityId: v.data.packageId,
      outcome: "denied",
      meta: { reasonCode, entityName: pkg.title },
    });
    return fail(code, message);
  };

  if (!sameName(v.data.confirmationTitle, pkg.title)) {
    return deny("confirmation_mismatch", `Onay için paketin adını aynen yazın: "${pkg.title}".`);
  }
  const gate = await checkCriticalPassword(ctx, v.data.criticalPassword);
  if (!gate.ok) return deny(gate.reasonCode, gate.message);

  const result = await deletePackage(v.data.packageId, v.data.expectedUpdatedAt);
  if (!result.ok) {
    if (result.code === "NOT_FOUND") return fail("NOT_FOUND", result.message);
    return deny(result.code === "IN_USE" ? "package_in_use" : "concurrent_change", result.message, "CONFLICT");
  }
  await recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: "package.delete",
    entityType: "Package",
    entityId: v.data.packageId,
    outcome: "success",
    meta: {
      entityName: pkg.title,
      reason: v.data.reason,
      snapshot: {
        title: pkg.title,
        status: pkg.status,
        price30Min: pkg.price30Min,
        price40Min: pkg.price40Min,
        price50Min: pkg.price50Min,
        createdAt: pkg.createdAt,
      },
    },
  });
  return ok({ packageId: v.data.packageId });
}

/**
 * Paket 5 — yüzde tabanlı kampanya/indirim kuralı oluşturur (ör. "Kardeş
 * Kampanyası"). Bu kural şu an OTOMATİK olarak monthlyFee/Payment hesaplama
 * hattına bağlanmaz — bkz. src/lib/discount-campaigns.ts dosya başı notu.
 */
export async function createDiscountCampaignTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ campaignId: string }>> {
  // Paket & Kampanya Motoru — yazma işlemleri yalnız SUPER_ADMIN (okuma aynen).
  const auth = requireRole(ctx, ["SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(createDiscountCampaignSchema, input);
  if (!v.ok) return v;

  const result = await addDiscountCampaign({
    ...v.data,
    applicableBranchIds: v.data.applicableBranchIds as import("../types").BranchId[] | undefined,
    createdBy: ctx.userId,
    createdByUserId: ctx.userId,
  });
  if (!result.ok) return fail("VALIDATION_ERROR", result.message);
  audit(ctx, "discount_campaign.create", "DiscountCampaign", result.campaign.id, {
    name: result.campaign.name,
    discountPercent: result.campaign.discountPercent,
  });
  return ok({ campaignId: result.campaign.id });
}

/**
 * 2026-09-29 — kampanya silme etki özeti (salt okuma): bu kampanyayla kaydolmuş öğrenciler,
 * kullanım sayacı. Silme geçmiş ücretleri DEĞİŞTİRMEZ; yalnız yeni kayıtta seçimi kaldırır.
 */
export async function getDiscountCampaignDeletionImpactTool(
  ctx: ServiceContext,
  input: unknown
): Promise<
  ServiceResult<{
    name: string;
    active: boolean;
    usageCount: number;
    studentCount: number;
    activeStudentCount: number;
    updatedAt: string;
    criticalPasswordConfigured: boolean;
  }>
> {
  const auth = requireRole(ctx, ["SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", "Kampanya silme yalnız kurum sahibi tarafından başlatılabilir.");
  const v = parseOrFail(z.object({ campaignId: z.string().min(1) }), input);
  if (!v.ok) return v;
  const data = await readReferenceData();
  const campaign = (data.discountCampaigns ?? []).find((c) => c.id === v.data.campaignId && !c.deletedAt);
  if (!campaign) return fail("NOT_FOUND", "Kampanya bulunamadı veya zaten silinmiş. Listeyi yenileyin.");
  const beneficiaries = data.students.filter((s) => (s.appliedCampaignIds ?? []).includes(campaign.id));
  const { getCriticalActionPasswordStatus } = await import("../critical-action-password");
  const status = await getCriticalActionPasswordStatus(ctx.tenantId);
  return ok({
    name: campaign.name,
    active: campaign.active,
    usageCount: campaign.usageCount ?? 0,
    studentCount: beneficiaries.length,
    activeStudentCount: beneficiaries.filter((s) => s.active).length,
    updatedAt: campaign.updatedAt,
    criticalPasswordConfigured: status.configured,
  });
}

/**
 * 2026-09-29 — kampanya "Sil" = SOFT DELETE: `deletedAt` + pasif. Satır, kullanım sayacı ve
 * öğrencilerdeki `appliedCampaignIds` korunur (geçmiş fiyat/rapor izi). Kapılar: SUPER_ADMIN →
 * ad teyidi → kritik şifre + gerekçe → eşzamanlılık (`expectedUpdatedAt`).
 */
export async function deleteDiscountCampaignTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ campaignId: string }>> {
  const auth = requireRole(ctx, ["SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", "Kampanya silme yalnız kurum sahibi tarafından yapılabilir.");
  const v = parseOrFail(
    z.object({
      campaignId: z.string().min(1),
      confirmation: z.string(),
      expectedUpdatedAt: z.string().min(1),
      ...criticalDeleteFields,
    }),
    input
  );
  if (!v.ok) return v;
  const campaign = ((await readData()).discountCampaigns ?? []).find((c) => c.id === v.data.campaignId);
  if (!campaign || campaign.deletedAt) {
    return fail("NOT_FOUND", "Kampanya bulunamadı veya zaten silinmiş. Listeyi yenileyin.");
  }
  if (!sameName(v.data.confirmation, campaign.name)) {
    return fail("VALIDATION_ERROR", `Onay için kampanyanın adını aynen yazın: "${campaign.name}".`);
  }
  const denied = await guardCriticalDelete(
    ctx,
    { action: "discount_campaign.delete", entityType: "DiscountCampaign", entityId: campaign.id, entityName: campaign.name },
    v.data.criticalPassword
  );
  if (denied) return denied;
  if (campaign.updatedAt !== v.data.expectedUpdatedAt) {
    return fail("CONFLICT", "Kampanya siz bakarken başka biri tarafından değiştirildi. Sayfayı yenileyip etki özetini tekrar kontrol edin.");
  }
  const result = await updateDiscountCampaign(campaign.id, {
    active: false,
    deletedAt: new Date().toISOString(),
    deletedByUserId: ctx.userId,
    deletionReason: v.data.reason,
  });
  if (!result.ok) return fail("CONFLICT", result.message);
  await recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: "discount_campaign.delete",
    entityType: "DiscountCampaign",
    entityId: campaign.id,
    outcome: "success",
    meta: {
      entityName: campaign.name,
      reason: v.data.reason,
      mode: "soft",
      snapshot: { discountPercent: campaign.discountPercent, active: campaign.active, usageCount: campaign.usageCount ?? 0 },
    },
  });
  return ok({ campaignId: campaign.id });
}

export async function updateDiscountCampaignTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ campaignId: string }>> {
  // Paket & Kampanya Motoru — yazma işlemleri yalnız SUPER_ADMIN (okuma aynen).
  // İSTİSNA: kayıt akışındaki otomatik kullanım sayacı artışı bu kapıdan GEÇMEZ —
  // createStudentTool sayacı store katmanından doğrudan artırır (kayıt yetkisiyle).
  const auth = requireRole(ctx, ["SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(updateDiscountCampaignSchema, input);
  if (!v.ok) return v;

  const { campaignId, ...patch } = v.data;
  const result = await updateDiscountCampaign(campaignId, {
    ...patch,
    branchId: patch.branchId as import("../types").BranchId | null | undefined,
    applicableBranchIds: patch.applicableBranchIds as import("../types").BranchId[] | undefined,
  });
  if (!result.ok) return fail("VALIDATION_ERROR", result.message);
  audit(ctx, "discount_campaign.update", "DiscountCampaign", campaignId, patch);
  return ok({ campaignId });
}

/**
 * ÖNCELİK 4 (devam) — Sosyal medya izni set etme (admin only, audit'li,
 * mevcut SocialMediaConsent modelinden — bkz. social-media-consent.ts).
 * Her çağrı yeni bir tarihçe satırı ekler; öğrenci/veli/öğretmen bu izni
 * göremez/değiştiremez (yalnızca admin RBAC).
 */
export async function setSocialMediaConsentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ studentId: string; status: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(socialMediaConsentSchema, input);
  if (!v.ok) return v;

  if (!(await readStudentById(v.data.studentId))) return fail("NOT_FOUND", "Öğrenci bulunamadı");

  const record = await setSocialMediaConsent({ ...v.data, tenantId: ctx.tenantId, actorUserId: ctx.userId });
  audit(ctx, "student.social_media_consent", "Student", v.data.studentId, { status: record.status });
  return ok({ studentId: v.data.studentId, status: record.status });
}

/** Öğrenci detayında gösterim için en güncel izin — staff erişimi (RBAC mevcut assertStudentAccess ile aynı desen). */
export async function getSocialMediaConsentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ consent: Awaited<ReturnType<typeof getLatestSocialMediaConsent>> }>> {
  // FAZ (2026-2027 SÖZLEŞME KAYNAĞI, PORTAL-CONTRACT-001) — STUDENT rolü
  // (öğrencinin KENDİSİ veya StudentPortalAccess accessType="GUARDIAN" ile
  // giren velisi) burada da erişebilmeli; asıl sahiplik doğrulaması zaten
  // aşağıdaki `assertStudentAccess` içinde YAPILIYOR — requireRole yalnızca
  // STUDENT'ı erkenden reddetmesin diye genişletildi, başka hiçbir rol
  // eklenmedi.
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER", "STUDENT"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(z.object({ studentId: z.string().min(1) }), input);
  if (!v.ok) return v;

  const student = await readStudentById(v.data.studentId);
  const access = await assertStudentAccess(ctx, student, v.data.studentId);
  if (!access.ok) return fail(access.code, access.message);

  const consent = await getLatestSocialMediaConsent(ctx.tenantId, v.data.studentId);
  return ok({ consent });
}

/**
 * Evraklar Faz 2 — onam denetim izi (kural F: "geri çekilme tarihi/nedeni",
 * denetlenebilirlik). `setSocialMediaConsent` HER değişiklikte yeni bir
 * satır ekliyordu ama hiçbir tool bu tarihçeyi dışarı açmıyordu — bu tool
 * yalnızca OKUR, mevcut audit/tarihçe modelini genişletmez.
 */
export async function listSocialMediaConsentHistoryTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ history: Awaited<ReturnType<typeof listSocialMediaConsentHistory>> }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER", "STUDENT"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(z.object({ studentId: z.string().min(1) }), input);
  if (!v.ok) return v;

  const student = await readStudentById(v.data.studentId);
  const access = await assertStudentAccess(ctx, student, v.data.studentId);
  if (!access.ok) return fail(access.code, access.message);

  const history = await listSocialMediaConsentHistory(ctx.tenantId, v.data.studentId);
  return ok({ history });
}

const withdrawSocialMediaConsentSchema = z.object({ studentId: z.string().min(1), reason: z.string().max(500).optional() });

/**
 * 2026-2027 kaynağı Fotoğraf/Video Açık Rıza Formu — "Açık rızamı geleceğe
 * etkili olmak üzere geri çekebileceğimi ... biliyorum." Mevcut
 * `setSocialMediaConsentTool` (SCHOOL_ADMIN/SUPER_ADMIN-only, serbest
 * representativeName/relationship/scopes kabul eder) KONUYA (öğrenci/veli)
 * doğrudan AÇILAMAZ — bu, kişinin kendi adına keyfi yeni bir rıza satırı
 * (farklı scopes/relationship ile) oluşturmasına izin verirdi. Bunun yerine
 * `withdrawKvkkConsentTool` ile AYNI dar model: yalnızca MEVCUT en güncel
 * kaydı "withdrawn" durumuna taşır, başka hiçbir alanı DEĞİŞTİRMEZ.
 */
export async function withdrawSocialMediaConsentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ studentId: string; status: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "STUDENT"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(withdrawSocialMediaConsentSchema, input);
  if (!v.ok) return v;

  const student = await readStudentById(v.data.studentId);
  const access = await assertStudentAccess(ctx, student, v.data.studentId);
  if (!access.ok) return fail(access.code, access.message);

  const latest = await getLatestSocialMediaConsent(ctx.tenantId, v.data.studentId);
  if (!latest) return fail("NOT_FOUND", "Bu öğrenci için henüz bir fotoğraf/video izin kaydı yok.");
  if (latest.status === "withdrawn") return fail("VALIDATION_ERROR", "Bu izin zaten geri çekilmiş.");

  const record = await setSocialMediaConsent({
    tenantId: ctx.tenantId,
    studentId: v.data.studentId,
    status: "withdrawn",
    representativeName: latest.representativeName,
    relationship: latest.relationship,
    scopes: [],
    sourceDocumentRef: latest.sourceDocumentRef,
    actorUserId: ctx.userId,
  });
  audit(ctx, "student.social_media_consent_withdrawn", "Student", v.data.studentId, { reason: v.data.reason });
  return ok({ studentId: v.data.studentId, status: record.status });
}

const SOCIAL_MEDIA_SCOPE_LABELS: Record<string, string> = {
  photo: "Fotoğraf",
  video: "Video",
  name: "Ad Soyad",
  voice: "Ses",
  website: "Kurumun resmi internet sitesi",
  instagram: "Kurumun resmi Instagram ve diğer sosyal medya hesapları",
  print_materials: "Kurumun basılı tanıtım materyalleri (broşür, afiş vb.)",
  digital_ads: "Kurumun dijital tanıtım/reklam çalışmaları",
  in_house_board: "Kurum içi pano ve etkinlik tanıtımları",
  other: "Diğer",
};

const generateStudentDocumentSchema = z.object({ studentId: z.string().min(1) });

/**
 * 2026-2027 kaynağı Madde 20 — KVKK Aydınlatma Metni, işbu kayıt
 * sözleşmesinden AYRI bir belge olarak üretilir (bkz.
 * `2026_2027_CONTRACT_DOCUMENT_TYPE_MAPPING.md`). Sözleşmenin aksine ön
 * koşul GEREKMEZ — bu metin bir AÇIK RIZA değil, salt bilgilendirmedir,
 * herhangi bir zamanda üretilip sunulabilir.
 */
export async function generateKvkkNoticeDocumentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ documentId: string; reference: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(generateStudentDocumentSchema, input);
  if (!v.ok) return v;

  const data = await readReferenceData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  if (!student) return fail("VALIDATION_ERROR", "Seçilen öğrenci bulunamadı veya bu kuruma ait değil.");

  const templates = await listTemplates(ctx.tenantId);
  const template = selectActiveTemplateOfKind(templates, "kvkk");
  if (!template) return fail("NOT_FOUND", "KVKK Aydınlatma Metni şablonu bulunamadı.");

  const doc = await createDocumentInstance({
    tenantId: ctx.tenantId,
    templateId: template.id,
    kind: "kvkk",
    studentId: student.id,
    fieldValues: {
      institutionName: data.settings.name ?? "",
      institutionAddress: data.settings.branches.find((b) => b.id === student.branchId)?.address ?? "",
      studentName: student.name,
      date: formatDate(new Date().toISOString()),
    },
    createdBy: ctx.userId,
  });
  audit(ctx, "document.kvkk_notice_generated", "DocumentInstance", doc.id, { studentId: student.id });
  return ok({ documentId: doc.id, reference: doc.reference });
}

/**
 * 2026-2027 kaynağı Madde 19 — Fotoğraf/Video Açık Rıza Formu, KVKK
 * metninden VE sözleşmeden AYRI. Sözleşme aksine bu belgenin bir ÖN KOŞULU
 * VAR: aile adına açık rıza/ret KARARI zaten `SocialMediaConsent`e
 * kaydedilmiş olmalı (bkz. contract-panel.tsx formu veya
 * `setSocialMediaConsentTool`) — bu belge o kararın YAZILI kaydıdır, kararı
 * KENDİSİ oluşturmaz (personel keyfi bir izin uydurup belgeleyemez).
 */
export async function generatePhotoVideoConsentDocumentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ documentId: string; reference: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(generateStudentDocumentSchema, input);
  if (!v.ok) return v;

  const data = await readReferenceData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  if (!student) return fail("VALIDATION_ERROR", "Seçilen öğrenci bulunamadı veya bu kuruma ait değil.");

  const consent = await getLatestSocialMediaConsent(ctx.tenantId, student.id);
  if (!consent) {
    return fail(
      "VALIDATION_ERROR",
      "Bu öğrenci için henüz bir fotoğraf/video izin kararı kaydedilmemiş — önce sözleşme oluşturma ekranından izni kaydedin."
    );
  }

  const templates = await listTemplates(ctx.tenantId);
  const template = selectActiveTemplateOfKind(templates, "parent_social_media_consent");
  if (!template) return fail("NOT_FOUND", "Fotoğraf/Video Açık Rıza Formu şablonu bulunamadı.");

  const granted = consent.status === "granted";
  const scopesText =
    consent.scopes.length > 0
      ? consent.scopes.map((s) => `${SOCIAL_MEDIA_SCOPE_LABELS[s] ?? s}`).join(", ")
      : "—";

  const doc = await createDocumentInstance({
    tenantId: ctx.tenantId,
    templateId: template.id,
    kind: "parent_social_media_consent",
    studentId: student.id,
    fieldValues: {
      institutionName: data.settings.name ?? "",
      studentName: student.name,
      parentName: consent.representativeName,
      date: formatDate(new Date().toISOString()),
      scopes: scopesText,
      consentGrantedMark: granted ? "☑" : "☐",
      consentDeniedMark: granted ? "☐" : "☑",
    },
    createdBy: ctx.userId,
  });
  audit(ctx, "document.photo_video_consent_generated", "DocumentInstance", doc.id, { studentId: student.id, status: consent.status });
  return ok({ documentId: doc.id, reference: doc.reference });
}

/** Faz 8 — KVKK rıza kayıtları hassas kişisel veridir; requireStaffSensitiveAccess ile AYNI düzey. */
function requireConsentAccess(ctx: ServiceContext) {
  return requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
}

/** Admin her zaman; konu kendisi (subjectType=user → userId, student/parent → StudentPortalAccess). */
async function canAccessConsentSubject(
  ctx: ServiceContext,
  subjectType: ConsentSubjectType,
  subjectId: string
): Promise<boolean> {
  if (ctx.role === "SCHOOL_ADMIN" || ctx.role === "SUPER_ADMIN" || ctx.role === "AI_AGENT") return true;
  if (subjectType === "user") return ctx.userId === subjectId;
  if (subjectType === "student" || subjectType === "parent") return canAccessStudent(ctx, subjectId);
  return false;
}

/** Bir `consentType` için TÜM hukuki metin versiyonları — yönetim ekranı. */
export async function listConsentTextVersionsTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ versions: import("../types").ConsentTextVersion[] }>> {
  const auth = requireConsentAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(z.object({ consentType: z.string().min(1) }), input);
  if (!v.ok) return v;
  const versions = await listConsentTextVersions(ctx.tenantId, v.data.consentType);
  return ok({ versions });
}

/**
 * Yürürlükteki metnin KENDİSİ hassas değildir (rıza vermeden ÖNCE okunması
 * gerekir) — bu yüzden `requireConsentAccess` (admin-only) İLE KİLİTLENMEZ,
 * herhangi bir kimliği doğrulanmış rol okuyabilir (portal first-login
 * gate'i bunu kullanır).
 */
export async function getCurrentConsentTextVersionTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ version: import("../types").ConsentTextVersion | undefined }>> {
  const v = parseOrFail(z.object({ consentType: z.string().min(1) }), input);
  if (!v.ok) return v;
  const version = await getCurrentConsentTextVersion(ctx.tenantId, v.data.consentType);
  return ok({ version });
}

/** Yeni bir hukuki metin versiyonu yayınlar (append-only — mevcut versiyonlar ASLA değişmez). */
export async function createConsentTextVersionTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ textVersionId: string; version: number }>> {
  const auth = requireConsentAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(createConsentTextVersionSchema, input);
  if (!v.ok) return v;
  const result = await createConsentTextVersion({ tenantId: ctx.tenantId, createdBy: ctx.userId, ...v.data });
  if (!result.ok) return fail("VALIDATION_ERROR", result.message);
  audit(ctx, "kvkk.consent_text.create", "ConsentTextVersion", result.entry.id, {
    consentType: result.entry.consentType,
    version: result.entry.version,
  });
  return ok({ textVersionId: result.entry.id, version: result.entry.version });
}

/**
 * Bir konu için rıza kaydeder — çağıranın kendisi hakkında (portal ilk-giriş
 * ekranı) VEYA admin başka bir konu adına. `consentType` için yayınlanmış
 * (yürürlükte) bir metin yoksa reddedilir — "neye rıza gösterildiği"
 * belirsiz bir kayıt asla oluşturulmaz.
 */
export async function grantKvkkConsentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ consentId: string }>> {
  const v = parseOrFail(grantKvkkConsentSchema, input);
  if (!v.ok) return v;
  const allowed = await canAccessConsentSubject(ctx, v.data.subjectType, v.data.subjectId);
  if (!allowed) return fail("FORBIDDEN", "Bu kişi adına rıza kaydı oluşturamazsınız.");

  const currentVersion = await getCurrentConsentTextVersion(ctx.tenantId, v.data.consentType);
  if (!currentVersion) return fail("NOT_FOUND", "Bu rıza türü için yürürlükte bir hukuki metin tanımlı değil.");

  const data = await readReferenceData();
  const settings = data.settings.consentSettings ?? DEFAULT_CONSENT_SETTINGS;
  const record = await grantKvkkConsent({
    tenantId: ctx.tenantId,
    subjectType: v.data.subjectType,
    subjectId: v.data.subjectId,
    consentType: v.data.consentType,
    textVersionId: currentVersion.id,
    channel: v.data.channel,
    deviceInfo: settings.recordDeviceInfo ? v.data.deviceInfo : undefined,
    createdBy: ctx.userId,
  });
  audit(ctx, "kvkk.consent.grant", "KvkkConsent", record.id, {
    subjectType: v.data.subjectType,
    subjectId: v.data.subjectId,
    consentType: v.data.consentType,
  });
  return ok({ consentId: record.id });
}

/**
 * Bir rızayı geri çeker — konu kendisi VEYA admin. Erişim kontrolü
 * MUTASYONDAN ÖNCE yapılır (`getKvkkConsentById` salt-okunur) — yetkisiz
 * bir çağrının önce geri çekip SONRA reddedilmesi gibi bir sıra HATASI
 * burada yok.
 */
export async function withdrawKvkkConsentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ consentId: string }>> {
  const v = parseOrFail(withdrawKvkkConsentSchema, input);
  if (!v.ok) return v;

  const existing = await getKvkkConsentById(ctx.tenantId, v.data.consentId);
  if (!existing) return fail("NOT_FOUND", "Rıza kaydı bulunamadı.");

  const allowed = await canAccessConsentSubject(ctx, existing.subjectType, existing.subjectId);
  if (!allowed) return fail("FORBIDDEN", "Bu rızayı geri çekemezsiniz.");

  const result = await withdrawKvkkConsent(ctx.tenantId, v.data.consentId, { reason: v.data.reason });
  if (!result.ok) return fail("VALIDATION_ERROR", result.message);

  audit(ctx, "kvkk.consent.withdraw", "KvkkConsent", v.data.consentId, {
    subjectType: result.entry.subjectType,
    subjectId: result.entry.subjectId,
  });
  return ok({ consentId: v.data.consentId });
}

/** Bir konunun rıza tarihçesi — admin herkes, konu kendisi. */
export async function listKvkkConsentHistoryTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ history: import("../types").KvkkConsent[] }>> {
  const v = parseOrFail(z.object({ subjectType: z.enum(["student", "parent", "user"]), subjectId: z.string().min(1) }), input);
  if (!v.ok) return v;
  const allowed = await canAccessConsentSubject(ctx, v.data.subjectType, v.data.subjectId);
  if (!allowed) return fail("FORBIDDEN", "Bu kişinin rıza tarihçesini göremezsiniz.");
  const history = await listKvkkConsentHistory(ctx.tenantId, v.data.subjectType, v.data.subjectId);
  return ok({ history });
}

/** Bir konunun bir rıza türü için EFEKTİF durumu — portal first-login gate'i bunu kullanır. */
export async function getConsentStatusTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ status: import("../types").ConsentEffectiveStatus }>> {
  const v = parseOrFail(
    z.object({ subjectType: z.enum(["student", "parent", "user"]), subjectId: z.string().min(1), consentType: z.string().min(1) }),
    input
  );
  if (!v.ok) return v;
  const allowed = await canAccessConsentSubject(ctx, v.data.subjectType, v.data.subjectId);
  if (!allowed) return fail("FORBIDDEN", "Bu kişinin rıza durumunu göremezsiniz.");
  const status = await getEffectiveConsentStatus(ctx.tenantId, v.data.subjectType, v.data.subjectId, v.data.consentType);
  return ok({ status });
}

/** Tenant düzeyinde kısıtlanan özellik listesi + cihaz bilgisi kaydı ayarı. */
export async function updateConsentSettingsTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ consentSettings: import("../types").ConsentSettings }>> {
  const auth = requireConsentAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(updateConsentSettingsSchema, input);
  if (!v.ok) return v;
  await updateConsentSettings(v.data);
  audit(ctx, "school.consent_settings_update", "School", ctx.tenantId, { restrictedFeatures: v.data.restrictedFeatures });
  return ok({ consentSettings: v.data });
}

/** Faz 11 — CRM arama/mesaj günlüğü. Hassas iletişim verisi — yönetici/SUPER_ADMIN düzeyi. */
function requireCrmAccess(ctx: ServiceContext) {
  return requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
}

export async function listCallLogsTool(
  ctx: ServiceContext,
  _input: unknown
): Promise<ServiceResult<{ calls: import("../types").CallLog[] }>> {
  const auth = requireCrmAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const calls = await listCallLogs(ctx.tenantId);
  return ok({ calls });
}

/** Manuel arama kaydı — telefon numarasından otomatik kişi eşleştirme denenir (tekil eşleşmede). */
export async function createCallLogTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ callId: string; matchStatus: "matched" | "ambiguous" | "none" }>> {
  const auth = requireCrmAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(createCallLogSchema, input);
  if (!v.ok) return v;

  const data = await readReferenceData();
  const matchResult = matchContactByPhone(v.data.callerNumber, data.students, data.teachers);
  const result = await createCallLog({
    tenantId: ctx.tenantId,
    createdBy: ctx.userId,
    ...v.data,
    contactType: matchResult.status === "matched" ? matchResult.match.contactType : undefined,
    contactId: matchResult.status === "matched" ? matchResult.match.contactId : undefined,
  });
  if (!result.ok) return fail("VALIDATION_ERROR", result.message);
  audit(ctx, "crm.call_log.create", "CallLog", result.entry.id, {
    matchStatus: matchResult.status,
    autoAssigned: matchResult.status === "matched",
  });
  return ok({ callId: result.entry.id, matchStatus: matchResult.status });
}

/** Otomatik eşleştirme belirsiz/başarısızsa manuel kişi ataması — audit'li. */
export async function assignCallContactTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ callId: string }>> {
  const auth = requireCrmAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(assignCallContactSchema, input);
  if (!v.ok) return v;
  const result = await assignCallContact(ctx.tenantId, v.data.callId, {
    contactType: v.data.contactType,
    contactId: v.data.contactId,
  });
  if (!result.ok) return fail("NOT_FOUND", result.message);
  audit(ctx, "crm.call_log.assign_contact", "CallLog", v.data.callId, {
    contactType: v.data.contactType,
    contactId: v.data.contactId,
  });
  return ok({ callId: v.data.callId });
}

export async function markCallbackDoneTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ callId: string }>> {
  const auth = requireCrmAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(markCallbackDoneSchema, input);
  if (!v.ok) return v;
  const result = await markCallbackDone(ctx.tenantId, v.data.callId, { callbackByUserId: ctx.userId });
  if (!result.ok) return fail("NOT_FOUND", result.message);
  audit(ctx, "crm.call_log.callback_done", "CallLog", v.data.callId, {});
  return ok({ callId: v.data.callId });
}

/** Liste görünümü — ham içerik YOK, yalnızca kırpılmış özet (bkz. message-log.ts dosya başı notu). */
export async function listMessageLogsTool(
  ctx: ServiceContext,
  _input: unknown
): Promise<ServiceResult<{ messages: import("../types").MessageLog[] }>> {
  const auth = requireCrmAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const messages = await listMessageLogs(ctx.tenantId);
  return ok({ messages: messages.map(toPublicSummary) });
}

/** Tam içerik — her görüntüleme audit'e yazılır (hassas iletişim verisi). */
export async function getMessageLogTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ message: import("../types").MessageLog }>> {
  const auth = requireCrmAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(z.object({ messageId: z.string().min(1) }), input);
  if (!v.ok) return v;
  const message = await getMessageLog(ctx.tenantId, v.data.messageId);
  if (!message) return fail("NOT_FOUND", "Mesaj kaydı bulunamadı.");
  audit(ctx, "crm.message_log.reveal", "MessageLog", v.data.messageId, {});
  return ok({ message });
}

export async function createMessageLogTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ messageId: string; matchStatus: "matched" | "ambiguous" | "none" }>> {
  const auth = requireCrmAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(createMessageLogSchema, input);
  if (!v.ok) return v;

  const data = await readReferenceData();
  const matchResult = matchContactByPhone(v.data.senderIdentifier, data.students, data.teachers);
  const result = await createMessageLog({
    tenantId: ctx.tenantId,
    createdBy: ctx.userId,
    ...v.data,
    contactType: matchResult.status === "matched" ? matchResult.match.contactType : undefined,
    contactId: matchResult.status === "matched" ? matchResult.match.contactId : undefined,
  });
  if (!result.ok) return fail("VALIDATION_ERROR", result.message);
  audit(ctx, "crm.message_log.create", "MessageLog", result.entry.id, {
    matchStatus: matchResult.status,
    autoAssigned: matchResult.status === "matched",
  });
  return ok({ messageId: result.entry.id, matchStatus: matchResult.status });
}

export async function assignMessageContactTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ messageId: string }>> {
  const auth = requireCrmAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(assignMessageContactSchema, input);
  if (!v.ok) return v;
  const result = await assignMessageContact(ctx.tenantId, v.data.messageId, {
    contactType: v.data.contactType,
    contactId: v.data.contactId,
  });
  if (!result.ok) return fail("NOT_FOUND", result.message);
  audit(ctx, "crm.message_log.assign_contact", "MessageLog", v.data.messageId, {
    contactType: v.data.contactType,
    contactId: v.data.contactId,
  });
  return ok({ messageId: v.data.messageId });
}

export async function setMessageStatusTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ messageId: string }>> {
  const auth = requireCrmAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(setMessageStatusSchema, input);
  if (!v.ok) return v;
  const result = await setMessageStatus(ctx.tenantId, v.data.messageId, {
    status: v.data.status,
    responderUserId: v.data.status === "replied" ? ctx.userId : undefined,
  });
  if (!result.ok) return fail("NOT_FOUND", result.message);
  audit(ctx, "crm.message_log.set_status", "MessageLog", v.data.messageId, { status: v.data.status });
  return ok({ messageId: v.data.messageId });
}

export async function createBranchTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ branchId: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(branchSchema, input);
  if (!v.ok) return v;

  try {
    const before = await readData();
    // NeviiOS paket limiti: yeni şube açılışını durdurur; mevcut şubeler etkilenmez.
    const branchLimit = await assertWithinLimit(ctx.tenantId, "branches", before.settings.branches.length);
    if (!branchLimit.ok) return branchLimit;
    const ids = new Set(before.settings.branches.map((b) => b.id));
    await addBranch(v.data);
    const after = await readData();
    const created = after.settings.branches.find((b) => !ids.has(b.id));
    return ok({ branchId: created?.id ?? "unknown" });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "createBranch failed");
  }
}

export async function updateBranchTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ branchId: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(updateBranchSchema, input);
  if (!v.ok) return v;

  try {
    const { branchId, ...patch } = v.data;
    await updateBranch(branchId, patch);
    return ok({ branchId });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "updateBranch failed");
  }
}

const csvInputSchema = z.object({ csvText: z.string().min(1) });

/** İş 1 — Ders Programı CSV importu (tekrarlayan seri desteği). */
const lessonScheduleCsvInputSchema = z.object({
  csvText: z.string().min(1),
  term: z.enum(["guz", "yaz"]).optional(),
  academicYearStart: z.coerce.number().int().min(2000).max(2100).optional(),
});
const commitLessonScheduleCsvInputSchema = lessonScheduleCsvInputSchema.extend({
  /** Kullanıcı "uyarılı satırları da dahil et" derse true — açık onay olmadan uyarı satırları atlanır. */
  allowAvailabilityOverride: z.coerce.boolean().optional(),
});

function csvRecords(csvText: string) {
  return rowsToRecords(parseCsv(csvText)).records;
}

export async function previewBranchImportTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<ImportPreview<BranchImportRow>>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(csvInputSchema, input);
  if (!v.ok) return v;
  return ok(validateBranchRows(csvRecords(v.data.csvText)));
}

export async function commitBranchImportTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<ImportCommitResult>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(csvInputSchema, input);
  if (!v.ok) return v;
  const preview = validateBranchRows(csvRecords(v.data.csvText));
  if (preview.errorCount > 0) {
    return fail("VALIDATION_ERROR", "CSV içinde hatalı satır var; hiçbir kayıt eklenmedi.", preview.errors);
  }
  if (preview.valid.length === 0) return fail("VALIDATION_ERROR", "İçe aktarılacak geçerli satır yok.");
  try {
    return ok(await importBranches(preview.valid));
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "importBranches failed");
  }
}

export async function previewTeacherImportTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<ImportPreview<TeacherImportRow>>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(csvInputSchema, input);
  if (!v.ok) return v;
  const data = await readData();
  const activeInstrumentNames = await resolveActiveInstrumentNames(ctx.tenantId);
  return ok(validateTeacherRows(data, csvRecords(v.data.csvText), activeInstrumentNames));
}

export async function commitTeacherImportTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<ImportCommitResult>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(csvInputSchema, input);
  if (!v.ok) return v;
  const data = await readData();
  const activeInstrumentNames = await resolveActiveInstrumentNames(ctx.tenantId);
  const preview = validateTeacherRows(data, csvRecords(v.data.csvText), activeInstrumentNames);
  if (preview.errorCount > 0) {
    return fail("VALIDATION_ERROR", "CSV içinde hatalı satır var; hiçbir kayıt eklenmedi.", preview.errors);
  }
  if (preview.valid.length === 0) return fail("VALIDATION_ERROR", "İçe aktarılacak geçerli satır yok.");
  try {
    return ok(await importTeachers(preview.valid));
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "importTeachers failed");
  }
}

export async function previewRoomImportTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<ImportPreview<RoomImportRow>>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(csvInputSchema, input);
  if (!v.ok) return v;
  const data = await readData();
  return ok(validateRoomRows(data, csvRecords(v.data.csvText)));
}

export async function commitRoomImportTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<ImportCommitResult>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(csvInputSchema, input);
  if (!v.ok) return v;
  const data = await readData();
  const preview = validateRoomRows(data, csvRecords(v.data.csvText));
  if (preview.errorCount > 0) {
    return fail("VALIDATION_ERROR", "CSV içinde hatalı satır var; hiçbir kayıt eklenmedi.", preview.errors);
  }
  if (preview.valid.length === 0) return fail("VALIDATION_ERROR", "İçe aktarılacak geçerli satır yok.");
  try {
    return ok(await importRooms(preview.valid));
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "importRooms failed");
  }
}

export async function previewLessonImportTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<ImportPreview<LessonImportRow>>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(csvInputSchema, input);
  if (!v.ok) return v;
  const data = await readData();
  return ok(validateLessonRows(data, csvRecords(v.data.csvText)));
}

/**
 * Diğer commit tool'larından FARKLI: tek bir toplu store fonksiyonu yok —
 * her satır mevcut `addLesson` (validateLessonSlot ÜZERİNDEN, program/telafi
 * ile TEK doğrulama kaynağı) ile TEK TEK yazılır. `duplicate` satırlar
 * (aynı öğretmen+oda+başlangıç saatinde zaten var olan ders) atlanır —
 * aynı CSV'nin tekrar yüklenmesi kör duplicate üretmez.
 */
export async function commitLessonImportTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<ImportCommitResult>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(csvInputSchema, input);
  if (!v.ok) return v;
  const data = await readData();
  const preview = validateLessonRows(data, csvRecords(v.data.csvText));
  if (preview.errorCount > 0) {
    return fail("VALIDATION_ERROR", "CSV içinde hatalı satır var; hiçbir kayıt eklenmedi.", preview.errors);
  }
  if (preview.valid.length === 0) return fail("VALIDATION_ERROR", "İçe aktarılacak geçerli satır yok.");
  try {
    let created = 0;
    let skipped = 0;
    let latest = data;
    for (const row of preview.valid) {
      if (row.duplicate) {
        skipped++;
        continue;
      }
      latest = await addLesson({
        studentId: row.studentId,
        teacherId: row.teacherId,
        roomId: row.roomId,
        instrument: row.instrument,
        startAt: row.startAt,
        durationMinutes: row.durationMinutes,
        createdByUserId: ctx.userId,
      });
      created++;
    }
    audit(ctx, "lessons.import", "Lesson", "bulk", { created, skipped });
    return ok({ data: latest, created, updated: 0, skipped });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "importLessons failed");
  }
}

/**
 * İş 1 — Ders Programı CSV importuna tekrarlayan (haftalık) seri desteği.
 * bkz. src/lib/import/lesson-schedule.ts modül yorumu — geriye dönük
 * uyumlu (tekil ders satırları eski davranışla birebir), müsaitlik dışı
 * satırlar hard error değil `warnings`'e düşer.
 */
export async function previewLessonScheduleImportTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<LessonScheduleImportPreview>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(lessonScheduleCsvInputSchema, input);
  if (!v.ok) return v;
  const data = await readData();
  const activeInstrumentNames = await resolveActiveInstrumentNames(ctx.tenantId);
  return ok(
    validateLessonScheduleRows(data, csvRecords(v.data.csvText), activeInstrumentNames, {
      term: v.data.term,
      academicYearStart: v.data.academicYearStart,
    })
  );
}

export type LessonScheduleImportCommitResult = {
  createdSeriesCount: number;
  createdSingleLessonCount: number;
  createdTotalLessonCount: number;
  skippedCount: number;
  warningCount: number;
  rowMessages: { row: number; field: string; message: string }[];
};

/**
 * Onaylı önizlemeden SONRA çağrılır (bkz. veri-aktar UI akışı — önce
 * preview, kullanıcı warnings'i görür, "uyarılı satırları da dahil et"
 * derse `allowAvailabilityOverride: true` ile TEKRAR preview + commit
 * çağrılır). Hard error varsa (errorCount > 0) hiçbir kayıt YAZILMAZ —
 * diğer tüm importer'larla aynı ilke. `allowAvailabilityOverride:false`
 * (varsayılan) iken warning'li satırlar da YAZILMAZ, atlanır ve
 * `skippedCount`'a sayılır — kullanıcı onayı olmadan hiçbir uyarı
 * otomatik bypass edilmez.
 */
export async function commitLessonScheduleImportTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<LessonScheduleImportCommitResult>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(commitLessonScheduleCsvInputSchema, input);
  if (!v.ok) return v;
  const data = await readData();
  const activeInstrumentNames = await resolveActiveInstrumentNames(ctx.tenantId);
  const preview = validateLessonScheduleRows(data, csvRecords(v.data.csvText), activeInstrumentNames, {
    term: v.data.term,
    academicYearStart: v.data.academicYearStart,
  });
  if (preview.errorCount > 0) {
    return fail("VALIDATION_ERROR", "CSV içinde hatalı satır var; hiçbir kayıt eklenmedi.", preview.errors);
  }
  if (preview.valid.length === 0) return fail("VALIDATION_ERROR", "İçe aktarılacak geçerli satır yok.");

  const allowOverride = Boolean(v.data.allowAvailabilityOverride);
  let createdSeriesCount = 0;
  let createdSingleLessonCount = 0;
  let createdTotalLessonCount = 0;
  let skippedCount = 0;
  const rowMessages: { row: number; field: string; message: string }[] = [];

  try {
    for (const plan of preview.valid) {
      if (plan.duplicate) {
        skippedCount++;
        rowMessages.push({ row: plan.row, field: "-", message: "Zaten var — atlandı (idempotent)." });
        continue;
      }
      if (plan.kind === "single") {
        if (plan.availabilityWarning && !allowOverride) {
          skippedCount++;
          rowMessages.push({
            row: plan.row,
            field: "baslangic_saati",
            message: "Öğretmen müsaitlik dışı — onay verilmediği için atlandı.",
          });
          continue;
        }
        await addLesson({
          studentId: plan.studentId,
          teacherId: plan.teacherId,
          roomId: plan.roomId,
          instrument: plan.instrument,
          startAt: plan.startAt,
          durationMinutes: plan.durationMinutes,
          allowAvailabilityOverride: Boolean(plan.availabilityWarning) && allowOverride,
          overriddenByUserId: plan.availabilityWarning && allowOverride ? ctx.userId : undefined,
        });
        createdSingleLessonCount++;
        createdTotalLessonCount++;
        continue;
      }
      // series
      if (plan.availabilityWarnings.length > 0 && !allowOverride) {
        skippedCount++;
        rowMessages.push({
          row: plan.row,
          field: "baslangic_saati",
          message: `${plan.availabilityWarnings.length} oluşumda öğretmen müsaitlik dışı — onay verilmediği için tüm satır atlandı.`,
        });
        continue;
      }
      for (const params of plan.seriesParams) {
        const result = await addLessonSeries(params, {
          allowAvailabilityOverride: allowOverride,
          overriddenByUserId: allowOverride ? ctx.userId : undefined,
          createdByUserId: ctx.userId,
        });
        if (!result.ok) {
          rowMessages.push({ row: plan.row, field: "-", message: result.message });
          continue;
        }
        createdSeriesCount++;
        createdTotalLessonCount += result.createdLessonIds.length;
      }
    }
    audit(ctx, "lesson_schedule.import", "Lesson", "bulk", {
      createdSeriesCount,
      createdSingleLessonCount,
      skippedCount,
    });
    return ok({
      createdSeriesCount,
      createdSingleLessonCount,
      createdTotalLessonCount,
      skippedCount,
      warningCount: preview.warningCount,
      rowMessages,
    });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "importLessonSchedule failed");
  }
}

export async function previewStudentImportTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<ImportPreview<StudentImportRow>>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(csvInputSchema, input);
  if (!v.ok) return v;
  const data = await readData();
  const activeInstrumentNames = await resolveActiveInstrumentNames(ctx.tenantId);
  return ok(validateStudentRows(data, csvRecords(v.data.csvText), activeInstrumentNames));
}

export async function commitStudentImportTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<ImportCommitResult>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(csvInputSchema, input);
  if (!v.ok) return v;
  const data = await readData();
  const activeInstrumentNames = await resolveActiveInstrumentNames(ctx.tenantId);
  const preview = validateStudentRows(data, csvRecords(v.data.csvText), activeInstrumentNames);
  if (preview.errorCount > 0) {
    return fail("VALIDATION_ERROR", "CSV içinde hatalı satır var; hiçbir kayıt eklenmedi.", preview.errors);
  }
  if (preview.valid.length === 0) return fail("VALIDATION_ERROR", "İçe aktarılacak geçerli satır yok.");
  try {
    const { withContractReadyFields } = await import("../import/students");
    const rows = preview.valid.map((row) => withContractReadyFields(row, { actorUserId: ctx.userId }));
    const result = await importStudents(rows);
    // ÖNCELİK 4 (devam) — sosyal medya izni Student modelinin dışında,
    // mevcut SocialMediaConsent modeliyle tutulur; import satırında
    // belirtilmişse (Evet/Hayır) commit sonrası, oluşturulan/güncellenen
    // öğrenciyle telefon numarasından eşleştirilerek yazılır.
    for (const row of preview.valid) {
      if (!row.socialMediaConsentStatus) continue;
      const student = result.data.students.find((s) => s.phone.trim() === row.phone.trim());
      if (!student) continue;
      await setSocialMediaConsent({
        tenantId: ctx.tenantId,
        studentId: student.id,
        status: row.socialMediaConsentStatus,
        representativeName: row.parentName,
        relationship: "Veli",
        scopes: row.socialMediaConsentStatus === "granted" ? ["photo", "video", "name"] : ["name"],
        actorUserId: ctx.userId,
      });
    }
    audit(ctx, "student.csv_import", "Student", "bulk", {
      created: result.created,
      updated: result.updated,
    });
    return ok(result);
  } catch (e) {
    logger.error("commitStudentImportTool failed", e);
    return fail("INTERNAL_ERROR", "Öğrenciler içe aktarılamadı; hiçbir kayıt değişmedi. Dosyayı kontrol edip tekrar deneyin.");
  }
}

export async function createRoomTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ roomId: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "AI_AGENT", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(roomSchema, input);
  if (!v.ok) return v;

  try {
    const before = await readData();
    const ids = new Set(before.rooms.map((r) => r.id));
    await addRoom({
      name: v.data.name,
      branchId: v.data.branchId as BranchId,
      capacity: v.data.capacity,
      instruments: v.data.instruments as Instrument[],
    });
    const after = await readData();
    const created = after.rooms.find((r) => !ids.has(r.id));
    return ok({ roomId: created?.id ?? "unknown" });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "createRoom failed");
  }
}

export async function suggestLessonSlotsTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ suggestions: LessonSlotSuggestion[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "AI_AGENT", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(suggestLessonSlotsSchema, input);
  if (!v.ok) return v;

  const data = await readData();
  const suggestions = suggestLessonSlots(data, {
    studentId: v.data.studentId,
    instrument: v.data.instrument as Instrument,
    teacherId: v.data.teacherId,
    daysAhead: v.data.daysAhead,
    maxSlots: v.data.maxSlots,
  });
  return ok({ suggestions });
}

/**
 * İş 4A — ders planlandığında öğretmene bildirim. Tekil çağrı; seri
 * oluşturmada spam olmaması için CAĞIRAN (createLessonSeriesTool) TEK bir
 * özet bildirim üretir, oluşum başına değil. Bildirim gönderimi ders
 * kaydını asla ETKİLEMEZ — öğretmenin henüz login hesabı yoksa (userId
 * bulunamazsa) veya bildirim store'u hata verirse sessizce atlanır, loglanır.
 */
async function notifyTeacherLessonPlanned(
  tenantId: string,
  teacherId: string,
  notification: { title: string; body: string }
): Promise<void> {
  try {
    const targetUserId = await getUserIdByTeacherId(tenantId, teacherId);
    if (!targetUserId) return;
    await createNotification({
      tenantId,
      targetUserId,
      kind: "lesson_planned",
      title: notification.title,
      body: notification.body,
    });
  } catch (e) {
    logger.error("notifyTeacherLessonPlanned failed", e);
  }
}

export async function createLessonTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ lessonId: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "AI_AGENT", "SUPER_ADMIN", "BRANCH_MANAGER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const parsed = parseOrFail(lessonSchema, input);
  if (!parsed.ok) return parsed;
  // Saat kayması kök neden düzeltmesi — formdan gelen ofsetsiz "yyyy-MM-ddTHH:mm"
  // kurum saatidir; sunucu saat dilimine göre YORUMLANMAZ (bkz. wallDateTimeInputToIso).
  const normalizedStartAt = wallDateTimeInputToIso(parsed.data.startAt);
  if (!normalizedStartAt) return fail("VALIDATION_ERROR", "Geçerli bir ders tarihi ve saati seçin.");
  const v = ok({ ...parsed.data, startAt: normalizedStartAt });

  // NeviiOS — şube müdürü: derslik ve öğrenci atanmış şubede olmalı.
  if (ctx.role === "BRANCH_MANAGER") {
    const d = await readData();
    const room = d.rooms.find((r) => r.id === v.data.roomId);
    const student = d.students.find((s) => s.id === v.data.studentId);
    if (!room || !student) return fail("NOT_FOUND", "Derslik veya öğrenci bulunamadı");
    for (const branchId of [room.branchId, student.branchId]) {
      const gate = await assertBranchOperation(ctx, "schedule", "create", branchId);
      if (!gate.ok) return gate;
    }
  }
  /**
   * ÇALIŞMA GÜNÜ TEK KAYNAĞI (2026-09-20). Burada eskiden `isWeeklyClosedDayForTerm`
   * DOĞRUDAN çağrılıyordu; o fonksiyon yöneticinin "zorla açık" istisnasını
   * görmediği için, açılmış bir Pazartesi'ye ders oluşturma `validateLessonSlot`a
   * hiç ULAŞMADAN burada reddediliyordu. Artık her iki katman da
   * `src/lib/work-days.ts`'i kullanır; kural tek yerde tanımlıdır.
   *
   * Kontrol burada da KALIR (store'a inmeden önce) çünkü hata mesajı bu
   * katmanda `VALIDATION_ERROR` olarak, alan bazlı biçimde dönüyor.
   */
  const settingsForClosedDays = await readData();
  const creationTerm =
    v.data.term ?? settingsForClosedDays.students.find((s) => s.id === v.data.studentId)?.termType ?? "guz";
  const creationDay = assertWorkDaySchedulable(
    new Date(v.data.startAt),
    creationTerm,
    settingsForClosedDays.closedDayOverrides ?? [],
    settingsForClosedDays.settings.termWeeklyClosedDays
  );
  if (!creationDay.ok) {
    return fail("VALIDATION_ERROR", creationDay.message);
  }

  try {
    const before = settingsForClosedDays;
    const ids = new Set(before.lessons.map((l) => l.id));
    await addLesson({
      studentId: v.data.studentId,
      teacherId: v.data.teacherId,
      roomId: v.data.roomId,
      instrument: v.data.instrument as Instrument,
      startAt: v.data.startAt,
      durationMinutes: v.data.durationMinutes ?? DEFAULT_LESSON_DURATION_MINUTES,
      term: v.data.term,
      academicYearStart: v.data.academicYearStart,
      allowAvailabilityOverride: v.data.overrideAvailability,
      overriddenByUserId: v.data.overrideAvailability ? ctx.userId : undefined,
      createdByUserId: ctx.userId,
    });
    const after = await readData();
    const created = after.lessons.find((l) => !ids.has(l.id));
    if (created) {
      const student = after.students.find((s) => s.id === created.studentId);
      const room = after.rooms.find((r) => r.id === created.roomId);
      const branch = after.settings.branches.find((b) => b.id === created.branchId);
      const durationMinutes = v.data.durationMinutes ?? DEFAULT_LESSON_DURATION_MINUTES;
      const locationLabel = [branch?.shortName, room?.name].filter(Boolean).join(" · ");
      await notifyTeacherLessonPlanned(ctx.tenantId, v.data.teacherId, {
        title: "Yeni ders planlandı",
        body: `${student?.name ?? "Öğrenci"} — ${formatDate(created.startAt)} ${formatTime(created.startAt)}, ${durationMinutes} dk, ${created.instrument}${locationLabel ? ` (${locationLabel})` : ""}.`,
      });
      // P1 (2026-09-11) — ders planı → İletişim Merkezi kayıtları (veli +
      // öğretmen). Best-effort: taslak oluşmasa bile ders AKIŞI ASLA
      // bozulmaz; idempotency ile tekrar çağrıda duplicate YOK.
      try {
        const teacher = after.teachers.find((t) => t.id === created.teacherId);
        const { createLessonPlanCommunicationDrafts } = await import("../communications/service");
        await createLessonPlanCommunicationDrafts({
          tenantId: ctx.tenantId,
          lessonId: created.id,
          createdBy: ctx.userId,
          vars: {
            veliAdi: student?.parentName ?? "",
            ogrenciAdi: student?.name ?? "Öğrenci",
            ogretmenAdi: teacher?.name ?? "Öğretmen",
            dersAdi: created.instrument,
            tarih: formatDate(created.startAt),
            saat: formatTime(created.startAt),
            sube: branch?.shortName ?? "",
            kurum: after.settings.name ?? "NeviiHub",
          },
          parent: {
            name: student?.parentName || student?.name || "Veli",
            phone: student?.parentPhone || student?.phone || "",
            studentId: student?.id,
            optOut: student?.communicationOptOut,
          },
          teacher: {
            name: teacher?.name || "Öğretmen",
            phone: teacher?.phone || "",
            teacherId: teacher?.id,
          },
        });
      } catch {
        // best-effort — ders oluşturma başarılı sayılır.
      }
    }
    return ok({ lessonId: created?.id ?? "unknown" });
  } catch (e) {
    // İş 3 — TEACHER_UNAVAILABLE tek "soft warning" kodu: `details` içinde
    // yapılandırılmış olarak taşınır ki çağıran (actionAddLesson) mesaj
    // metnini ayrıştırmadan "override edilebilir mi" karar verebilsin.
    if (e instanceof LessonSlotValidationError) {
      return fail("VALIDATION_ERROR", e.message, {
        slotValidationCode: e.code,
        overridable: isOverridableSlotCode(e.code),
      });
    }
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "createLesson failed");
  }
}

export async function updateLessonScheduleTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ lessonId: string; startAt: string; endAt: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "AI_AGENT", "SUPER_ADMIN", "BRANCH_MANAGER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const parsed = parseOrFail(updateLessonScheduleSchema, input);
  if (!parsed.ok) return parsed;
  const normalizedStartAt = parsed.data.startAt === undefined ? undefined : wallDateTimeInputToIso(parsed.data.startAt);
  if (normalizedStartAt === null) return fail("VALIDATION_ERROR", "Geçerli bir ders tarihi ve saati seçin.");
  const v = ok({ ...parsed.data, startAt: normalizedStartAt });

  if (ctx.role === "BRANCH_MANAGER") {
    const lesson = (await readData()).lessons.find((l) => l.id === v.data.lessonId);
    if (!lesson) return fail("NOT_FOUND", "Ders bulunamadı");
    const gate = await assertBranchOperation(ctx, "schedule", "update", lesson.branchId);
    if (!gate.ok) return gate;
  }

  /**
   * P0 mutasyon performansı (2026-09-07) — bu fonksiyon ders TAŞIMA yolunun
   * tamamıdır ve eskiden tenant'ın TÜM `AppData`'sını ÜÇ kez okuyordu: (1)
   * kapalı gün kontrolü + "önceki başlangıç" için burada, (2+3)
   * `updateLessonSchedule`'ın kendi içinde. ÖLÇÜLDÜ: tek taşıma = 64 DB
   * gidiş-dönüşü, bunun 42'si bu üç tam-tenant okumasıydı
   * (bkz. docs/performance/ADMIN_WEB_P0_BASELINE.md).
   *
   * Artık tool HİÇ okuma yapmaz: kapalı gün kuralı saf fonksiyona taşındı
   * (`applyLessonScheduleUpdate`, kod "CLOSED_DAY") ve store yazma çağrısı
   * güncellenmiş ders + önceki başlangıcı DAR bir dilimden döndürür.
   */
  try {
    const outcome = await updateLessonSchedule(v.data);
    if (!outcome.ok) {
      return outcome.code === "LESSON_NOT_FOUND"
        ? fail("NOT_FOUND", outcome.message)
        : fail("VALIDATION_ERROR", outcome.message);
    }
    const { lesson, previousStartAt } = outcome;
    if (previousStartAt !== lesson.startAt) {
      /**
       * Bildirim teslimi ders taşımanın BAŞARISINI belirlemez — ders zaten
       * yazıldı, burada bir hata mutasyonu geri almaz (bu akışta domain
       * kuralı gereği ZORUNLU bir bildirim yoktur; harici mesaj gönderimi
       * PROJECT.md §8.3 gereği ayrı, insan onaylı bir yoldur).
       * Ama sessizce de yutulmaz: teslim edilemeyen bildirim sayısı denetim
       * kaydına yazılır, beklenmedik bir fırlatma loglanır.
       */
      try {
        const { notifyLessonRescheduled } = await import("../lesson-notifications");
        const summary = await notifyLessonRescheduled({
          tenantId: ctx.tenantId,
          lesson,
          previousStartAt,
          actorUserId: ctx.userId,
        });
        if (summary.failed > 0) {
          audit(ctx, "lesson.reschedule.notification_failed", "Lesson", lesson.id, summary);
        }
      } catch (notifyError) {
        logger.error("updateLessonScheduleTool: bildirim katmanı beklenmedik biçimde fırlattı", {
          tenantId: ctx.tenantId,
          lessonId: lesson.id,
          error: notifyError instanceof Error ? notifyError.message : String(notifyError),
        });
        audit(ctx, "lesson.reschedule.notification_failed", "Lesson", lesson.id, { created: 0, duplicate: 0, skipped: 0, failed: 1 });
      }
      // 11. tur iş #2 — taşıma sonrası WhatsApp taslakları (veli SMS+WA, öğretmen WA).
      // Best-effort: taslak oluşmasa bile taşıma başarılıdır; aynı değerler
      // tekrarlanırsa idempotency ile taslak çoğalmaz.
      const { queueLessonUpdateDraftsBestEffort } = await import("../communications/service");
      await queueLessonUpdateDraftsBestEffort({
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        lessonId: lesson.id,
        previous: {
          startAt: previousStartAt,
          teacherId: lesson.teacherId,
          roomId: lesson.roomId,
          branchId: lesson.branchId,
          // Taşıma süreyi değiştirmez — eski süre = güncel başlangıç/bitişten türetilen.
          durationMinutes: Math.round(
            (new Date(lesson.endAt).getTime() - new Date(lesson.startAt).getTime()) / 60000
          ),
        },
      });
    }
    return ok({ lessonId: lesson.id, startAt: lesson.startAt, endAt: lesson.endAt });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "updateLessonSchedule failed");
  }
}

export async function cancelLessonTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ lessonId: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "AI_AGENT", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(cancelLessonSchema.extend(disruptionInputShape), input);
  if (!v.ok) return v;
  const disruptionError = disruptionInputError(v.data);
  if (disruptionError) return fail("VALIDATION_ERROR", disruptionError);

  try {
    const before = await readData();
    const lesson = before.lessons.find((l) => l.id === v.data.lessonId);
    await cancelLesson(v.data.lessonId);
    // 9. tur — iptal artık denetim kaydında (kim/ne zaman/hangi kaynak); kaynak ayrı alana.
    audit(ctx, "lesson.cancel", "Lesson", v.data.lessonId, {
      disruptionSource: v.data.disruptionSource ?? null,
      note: v.data.disruptionNote,
      teacherAttendance: v.data.teacherAttendance,
    });
    if (v.data.disruptionSource) {
      const { buildDisruptionPatch } = await import("../lesson-disruption");
      const saved = await setLessonDisruptionLive(
        v.data.lessonId,
        buildDisruptionPatch({ source: v.data.disruptionSource, note: v.data.disruptionNote }, ctx.userId)
      );
      if (!saved) {
        return fail(
          "INTERNAL_ERROR",
          "Ders iptal edildi ancak iptal kaynağı kaydedilemedi. Ders detayındaki \"Kaynağı düzenle\" ile tekrar girin."
        );
      }
      const warning = await recordTeacherAttendanceForDisruption(ctx, v.data.lessonId, v.data.teacherAttendance, v.data.disruptionNote);
      if (warning) return fail("INTERNAL_ERROR", warning);
    }
    if (lesson) {
      try {
        const { notifyLessonCancelled } = await import("../lesson-notifications");
        await notifyLessonCancelled({
          tenantId: ctx.tenantId,
          lesson,
          actorUserId: ctx.userId,
          reason: typeof (v.data as { reason?: string }).reason === "string" ? (v.data as { reason?: string }).reason : undefined,
        });
      } catch {
        // best-effort
      }
    }
    return ok({ lessonId: v.data.lessonId });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "cancelLesson failed");
  }
}

/**
 * 9. tur — iptal/telafi edilmiş dersin KAYNAĞINI sonradan belirler/düzeltir
 * ("Belirtilmemiş" eski kayıtlar dahil). Ders statüsüne dokunmaz. Kaynak değişince
 * öğrencinin telafi hakkı sayımı bu kaynaktan okunur (öğretmen/kurum → hak düşmez).
 */
export async function setLessonDisruptionTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ lessonId: string; disruptionSource: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", "İptal/telafi kaynağını yalnız kurum yöneticileri girebilir.");
  const v = parseOrFail(
    z.object({ lessonId: z.string().min(1), ...disruptionInputShape, disruptionSource: disruptionInputShape.disruptionSource.unwrap() }),
    input
  );
  if (!v.ok) return v;
  const disruptionError = disruptionInputError(v.data);
  if (disruptionError) return fail("VALIDATION_ERROR", disruptionError);
  const scope = await readLessonScope(v.data.lessonId);
  const lesson = scope?.lessons.find((l) => l.id === v.data.lessonId);
  if (!lesson) return fail("NOT_FOUND", "Ders bulunamadı.");
  const { buildDisruptionPatch, isDisruptedLesson } = await import("../lesson-disruption");
  if (!isDisruptedLesson(lesson)) {
    return fail("VALIDATION_ERROR", "Bu ders iptal edilmemiş veya telafiye alınmamış; kaynak yalnız iptal/telafi kararı için girilir.");
  }
  const saved = await setLessonDisruptionLive(
    v.data.lessonId,
    buildDisruptionPatch({ source: v.data.disruptionSource, note: v.data.disruptionNote }, ctx.userId)
  );
  if (!saved) return fail("NOT_FOUND", "Ders bulunamadı.");
  audit(ctx, "lesson.disruption_source", "Lesson", v.data.lessonId, {
    from: lesson.disruptionSource ?? null,
    to: v.data.disruptionSource,
    note: v.data.disruptionNote,
  });
  const warning =
    v.data.disruptionSource === "teacher"
      ? await recordTeacherAttendanceForDisruption(ctx, v.data.lessonId, v.data.teacherAttendance, v.data.disruptionNote)
      : null;
  if (warning) return fail("INTERNAL_ERROR", warning);
  return ok({ lessonId: v.data.lessonId, disruptionSource: v.data.disruptionSource });
}

/**
 * Dönemlik seri için hiçbir kayıt YAZMADAN önizleme üretir: Türkçe onay
 * cümlesi + her oluşumun tek doğrulama kaynağından (validateLessonSlot)
 * geçmiş çakışma/uygunluk sonucu.
 */
export async function previewLessonSeriesTool(
  ctx: ServiceContext,
  input: unknown
): Promise<
  ServiceResult<{
    previewText: string;
    occurrenceCount: number;
    conflictCount: number;
    checks: SeriesOccurrenceCheck[];
  }>
> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(lessonSeriesParamsSchema, input);
  if (!v.ok) return v;

  const data = await readData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı.");
  if (!data.teachers.some((t) => t.id === v.data.teacherId)) return fail("NOT_FOUND", "Öğretmen bulunamadı.");
  if (!data.rooms.some((r) => r.id === v.data.roomId)) return fail("NOT_FOUND", "Oda bulunamadı.");
  if (!data.settings.branches.some((b) => b.id === v.data.branchId)) return fail("NOT_FOUND", "Şube bulunamadı.");

  const occurrences = computeSeriesOccurrences(v.data);
  // Bkz. validation.ts studentSchema.instrument yorumu — schema artık katalog
  // uyumlu serbest metin; gerçek enstrüman/öğretmen/oda uyumu makeup-engine.ts'te
  // (checkSeriesOccurrences → validateLessonSlot) doğrulanır, burada YALNIZCA tip cast'i.
  const checks = checkSeriesOccurrences(data, { ...v.data, instrument: v.data.instrument as Instrument }, occurrences);
  const previewText = buildSeriesPreviewText({
    studentName: student.name,
    weekday: v.data.weekday,
    startTime: v.data.startTime,
    durationMinutes: v.data.durationMinutes ?? DEFAULT_LESSON_DURATION_MINUTES,
    startsOn: v.data.startsOn,
    endsOn: v.data.endsOn,
    occurrenceCount: occurrences.length,
  });

  return ok({
    previewText,
    occurrenceCount: occurrences.length,
    // Kapalı gün oluşumları otomatik atlanır; kullanıcının çözmesi gereken çakışma sayılmaz.
    conflictCount: checks.filter((c) => !c.ok && c.code !== "DAY_CLOSED").length,
    checks,
  });
}

export async function createLessonSeriesTool(
  ctx: ServiceContext,
  input: unknown
): Promise<
  ServiceResult<{
    seriesId: string;
    createdLessonIds: string[];
    skippedOccurrences: { startAt: string; code: string; message: string }[];
  }>
> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(createLessonSeriesSchema, input);
  if (!v.ok) return v;

  try {
    const { skipConflicts, ...params } = v.data;
    const result = await addLessonSeries(
      { ...params, instrument: params.instrument as Instrument },
      { skipConflicts, createdByUserId: ctx.userId }
    );
    if (!result.ok) return fail("CONFLICT", result.message, result.conflicts);

    // İş 4A — seri için TEK özet bildirim (oluşum başına DEĞİL, spam yok).
    // Aynı Türkçe cümle üretimi `previewLessonSeriesTool` ile PAYLAŞILIR
    // (buildSeriesPreviewText) — ikinci bir metin şablonu icat edilmedi.
    if (result.createdLessonIds.length > 0) {
      const student = await readStudentById(v.data.studentId);
      const summary = buildSeriesPreviewText({
        studentName: student?.name ?? "Öğrenci",
        weekday: v.data.weekday,
        startTime: v.data.startTime,
        durationMinutes: v.data.durationMinutes ?? DEFAULT_LESSON_DURATION_MINUTES,
        startsOn: v.data.startsOn,
        endsOn: v.data.endsOn,
        occurrenceCount: result.createdLessonIds.length,
      });
      await notifyTeacherLessonPlanned(ctx.tenantId, v.data.teacherId, {
        title: "Yeni ders serisi planlandı",
        body: summary,
      });
    }

    return ok({
      seriesId: result.seriesId,
      createdLessonIds: result.createdLessonIds,
      skippedOccurrences: result.skippedOccurrences,
    });
  } catch (e) {
    // Kilit altındaki yeniden kontrol: saat az önce başka derse verildi (bkz. store-db assertSlotFreeLockedTx).
    if (e instanceof LessonSlotValidationError) return fail("CONFLICT", e.message);
    return fail("NOT_FOUND", e instanceof Error ? e.message : "createLessonSeries failed");
  }
}

/**
 * K — SÖZLEŞMEDEN DERS PROGRAMI ÜRETİMİ (2026-09-20).
 *
 * KÖK NEDEN: Ders gün/saati üç yerde soruluyordu (kayıt → sözleşme → Ders
 * Programı) ve hiçbiri diğerini beslemiyordu. Artık:
 *   1. Kayıtta girilen gün/saat `Student.lessonScheduleText`'e YAZILIR,
 *   2. Sözleşme aynı değeri ön-dolu gösterir ve dondurur,
 *   3. Sözleşme onaylandıktan sonra BU tool, sözleşmenin TARİH ARALIĞI +
 *      dondurulmuş gün/saat bilgisiyle tekrar eden dersleri üretir.
 *
 * Güvenlik/veri bütünlüğü: yeni bir planlama yolu AÇILMAZ — her oluşum
 * mevcut `addLessonSeries` (→ `validateLessonSlot` → çalışma günü tek
 * kaynağı) üzerinden geçer. `dryRun` ile hiçbir kayıt yazılmadan tam
 * önizleme alınır; kullanıcı gün/saatleri gözden geçirmeden ders oluşmaz.
 *
 * Yaşam döngüsü: üretilen seriler `contractId` taşır. Sözleşme iptalinde
 * dersler OTOMATİK SİLİNMEZ (yoklama/telafi/ücret kayıtları bağlı olabilir);
 * `countContractLessonSeriesTool` ile sayılır ve kullanıcıya sorulur.
 */
export async function planContractLessonScheduleTool(
  ctx: ServiceContext,
  input: unknown
): Promise<
  ServiceResult<{
    dryRun: boolean;
    contractId: string;
    slots: { weekday: number; time: string; occurrenceCount: number; conflictCount: number; skippedCount: number }[];
    checks: SeriesOccurrenceCheck[];
    createdLessonIds: string[];
    seriesIds: string[];
    message: string;
  }>
> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(
    z.object({
      contractId: z.string().min(1),
      teacherId: z.string().min(1),
      roomId: z.string().min(1),
      durationMinutes: z.number().int().min(30).max(120).optional(),
      /** true = hiçbir kayıt YAZILMAZ, yalnız önizleme. Varsayılan true (kaza ile ders üretilmesin). */
      dryRun: z.boolean().default(true),
      /** Kapalı gün/çakışma olan oluşumları atlayarak kalanları oluştur. */
      skipConflicts: z.boolean().default(true),
    }),
    input
  );
  if (!v.ok) return v;

  const { getContract } = await import("../contracts");
  const contract = await getContract(ctx.tenantId, v.data.contractId);
  if (!contract) return fail("NOT_FOUND", "Sözleşme bulunamadı.");
  if (contract.status === "cancelled") {
    return fail("VALIDATION_ERROR", "İptal edilmiş bir sözleşmeden ders programı üretilemez. Önce yeni bir sözleşme oluşturun.");
  }

  const data = await readData();
  const student = data.students.find((s) => s.id === contract.studentId);
  if (!student) return fail("NOT_FOUND", "Sözleşmenin öğrencisi bulunamadı.");
  const teacher = data.teachers.find((t) => t.id === v.data.teacherId);
  if (!teacher) return fail("NOT_FOUND", "Seçilen öğretmen bulunamadı.");
  const room = data.rooms.find((r) => r.id === v.data.roomId);
  if (!room) return fail("NOT_FOUND", "Seçilen oda bulunamadı.");
  // 10. tur iş #8 — pasif/silinmiş odaya YENİ ders oluşturulamaz. Bu kontrol
  // ÖNİZLEME (dryRun) VE GERÇEK oluşturma için her çağrıda yeniden çalışır:
  // oda önizlemeden sonra pasife alınmışsa oluşturma engellenir. Geçmiş
  // derslerin pasif oda referanslarına dokunulmaz (görünürlük korunur).
  if (room.deletedAt || room.active === false) {
    return fail(
      "VALIDATION_ERROR",
      `"${room.name}" pasif durumda; pasif odaya yeni ders oluşturulamaz. Aktif bir oda seçin veya odayı Odalar ekranından aktifleştirin.`
    );
  }

  const { parseLessonScheduleText } = await import("../lesson-schedule-text");
  const scheduleText = contract.contractDataSnapshot?.lessonScheduleText || student.lessonScheduleText || "";
  const slots = parseLessonScheduleText(scheduleText);
  if (slots.length === 0) {
    return fail(
      "VALIDATION_ERROR",
      "Sözleşmede ders günü/saati kayıtlı değil. Sözleşme Merkezi'ndeki “Ders günü/saati” alanını doldurup sözleşmeyi güncelleyin veya öğrenci kaydında gün/saat seçin."
    );
  }

  const startsOn = contract.enrollmentStartDate.slice(0, 10);
  const endsOn = contract.enrollmentEndDate.slice(0, 10);
  const durationMinutes = v.data.durationMinutes ?? student.lessonDurationMinutes ?? data.settings.lessonDurationMinutes;
  const instrument = (student.instruments[0] ?? contract.programmeName) as Instrument;

  const allChecks: SeriesOccurrenceCheck[] = [];
  const slotSummaries: { weekday: number; time: string; occurrenceCount: number; conflictCount: number; skippedCount: number }[] = [];
  const createdLessonIds: string[] = [];
  const seriesIds: string[] = [];

  for (const slot of slots) {
    const params = {
      studentId: student.id,
      teacherId: teacher.id,
      roomId: room.id,
      branchId: room.branchId,
      instrument,
      weekday: slot.weekday,
      startTime: slot.time,
      durationMinutes,
      startsOn,
      endsOn,
      term: student.termType ?? ("guz" as const),
      contractId: contract.id,
    };
    const occurrences = computeSeriesOccurrences(params);
    const checks = checkSeriesOccurrences(data, params, occurrences);
    allChecks.push(...checks);
    const conflicts = checks.filter((c) => !c.ok);
    slotSummaries.push({
      weekday: slot.weekday,
      time: slot.time,
      occurrenceCount: occurrences.length,
      conflictCount: conflicts.filter((c) => c.code !== "DAY_CLOSED").length,
      skippedCount: conflicts.filter((c) => c.code === "DAY_CLOSED").length,
    });

    if (!v.data.dryRun) {
      const result = await addLessonSeries(params, { skipConflicts: v.data.skipConflicts, createdByUserId: ctx.userId });
      if (!result.ok) return fail("CONFLICT", result.message, result.conflicts);
      createdLessonIds.push(...result.createdLessonIds);
      seriesIds.push(result.seriesId);
    }
  }

  const totalOccurrences = slotSummaries.reduce((n, s2) => n + s2.occurrenceCount, 0);
  const totalConflicts = slotSummaries.reduce((n, s2) => n + s2.conflictCount, 0);
  const totalSkipped = slotSummaries.reduce((n, s2) => n + s2.skippedCount, 0);

  const message = v.data.dryRun
    ? `${scheduleText} · ${startsOn} – ${endsOn} aralığında ${totalOccurrences} ders planlanacak` +
      (totalSkipped > 0 ? `, ${totalSkipped} tanesi kapalı güne denk geldiği için atlanacak` : "") +
      (totalConflicts > 0 ? `, ${totalConflicts} tanesinde çakışma var` : "") +
      "."
    : `${createdLessonIds.length} ders oluşturuldu` +
      (totalSkipped > 0 ? `, ${totalSkipped} ders kapalı güne denk geldiği için atlandı` : "") +
      ".";

  if (!v.data.dryRun) {
    audit(ctx, "contract.lesson_schedule.generate", "StudentContract", contract.id, {
      createdLessonCount: createdLessonIds.length,
      seriesIds,
      scheduleText,
    });
  }

  return ok({
    dryRun: v.data.dryRun,
    contractId: contract.id,
    slots: slotSummaries,
    checks: allChecks,
    createdLessonIds,
    seriesIds,
    message,
  });
}

/**
 * K — bir sözleşmeden üretilmiş GELECEK ders sayısı. Sözleşme iptal
 * edilmeden önce kullanıcıya "N gelecek ders var" uyarısını göstermek için;
 * hiçbir şey silmez.
 */
export async function countContractLessonsTool(
  ctx: ServiceContext,
  input: unknown
): Promise<
  ServiceResult<{
    contractId: string;
    futureLessonCount: number;
    /** Kuralları gereği iptal EDİLEMEYECEK gelecek ders sayısı (işlendi/telafi işaretli vb.). */
    lockedLessonCount: number;
    lockedReasons: string[];
    seriesIds: string[];
  }>
> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(z.object({ contractId: z.string().min(1) }), input);
  if (!v.ok) return v;

  const data = await readData();
  const future = collectContractFutureLessons(data, v.data.contractId);
  const { lessonCancelBlockReason } = await import("../lesson-cancel-rules");
  const lockedReasons = Array.from(
    new Set(
      future.lessons
        .map((l) => lessonCancelBlockReason(l))
        .filter((reason): reason is string => reason !== null)
    )
  );
  return ok({
    contractId: v.data.contractId,
    futureLessonCount: future.lessons.length,
    lockedLessonCount: future.lessons.filter((l) => lessonCancelBlockReason(l) !== null).length,
    lockedReasons,
    seriesIds: future.seriesIds,
  });
}

/**
 * Bir sözleşmeden türeyen GELECEK dersler — sayma ve iptal akışının TEK
 * kaynağı (iki yerde iki farklı "gelecek ders" tanımı bırakılmaz).
 * İptal edilmiş dersler ve geçmiş dersler hariçtir.
 */
function collectContractFutureLessons(
  data: AppData,
  contractId: string,
  now: Date = new Date()
): { seriesIds: string[]; lessons: Lesson[] } {
  const seriesIds = data.lessonSeries.filter((s) => s.contractId === contractId).map((s) => s.id);
  if (seriesIds.length === 0) return { seriesIds, lessons: [] };
  const nowIso = now.toISOString();
  const seriesSet = new Set(seriesIds);
  return {
    seriesIds,
    lessons: data.lessons.filter(
      (l) => l.seriesId && seriesSet.has(l.seriesId) && l.startAt > nowIso && l.status !== "cancelled"
    ),
  };
}

export async function cancelSeriesFromLessonTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ cancelledLessonIds: string[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(cancelSeriesFromLessonSchema, input);
  if (!v.ok) return v;

  try {
    const result = await cancelLessonSeriesFromLesson(v.data.lessonId);
    if (!result.ok) return fail("NOT_FOUND", result.message);
    return ok({ cancelledLessonIds: result.cancelledLessonIds });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "cancelSeriesFromLesson failed");
  }
}

export async function cancelEntireSeriesTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ cancelledLessonIds: string[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(cancelEntireSeriesSchema, input);
  if (!v.ok) return v;

  try {
    const result = await cancelEntireLessonSeries(v.data.seriesId);
    if (!result.ok) return fail("NOT_FOUND", result.message);
    return ok({ cancelledLessonIds: result.cancelledLessonIds });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "cancelEntireSeries failed");
  }
}

/**
 * 2026-09-17 — hatalı planlanmış dersi SİL: yalnız bu ders / bu ders ve sonrası /
 * tüm seri. Yoklama, işlem, tahsilat veya telafi bağı olan dersler korunur ve
 * sonuçta listelenir (bkz. lesson-scope-edit.ts).
 */
export async function deleteLessonsTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ deletedLessonIds: string[]; protectedLessons: { lessonId: string; startAt: string; reason: string }[] }>> {
  const v = parseOrFail(deleteLessonsSchema.extend(criticalDeleteFields), input);
  if (!v.ok) return v;
  const denied = await guardCriticalDelete(
    ctx,
    { action: "lesson.delete", entityType: "Lesson", entityId: v.data.lessonId },
    v.data.criticalPassword
  );
  if (denied) return denied;
  try {
    const result = await deleteLessonsScoped(v.data.lessonId, v.data.scope);
    if (!result.ok) return fail("VALIDATION_ERROR", result.message, result.allProtected ? { allProtected: true } : undefined);
    audit(ctx, "lesson.delete", "Lesson", v.data.lessonId, {
      reason: v.data.reason,
      scope: v.data.scope,
      deletedLessonIds: result.deletedLessonIds,
      protectedCount: result.protectedLessons.length,
    });
    return ok({ deletedLessonIds: result.deletedLessonIds, protectedLessons: result.protectedLessons });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "deleteLessons failed");
  }
}

/**
 * M — statüsü girilmiş (yoklama/işlem/gerçekleşti) TEK dersi tamamen silme.
 * Öğrenci silmeyle aynı prosedür: yetkili rol + gerekçe + kurum sahibinin kritik
 * işlem şifresi. Tahsilat/telafi bağı olan ders bu yolla da silinmez. Geri alınamaz;
 * dersin ve yoklamasının dökümü audit'e yazılır (kim/ne zaman/ne silindi).
 */
export async function forceDeleteLessonTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ lessonId: string }>> {
  const auth = requireRole(ctx, CRITICAL_ROLES_FOR_TOOLS);
  if (!auth.ok) return fail("FORBIDDEN", "Statüsü girilmiş ders yalnız kurum sahibi ve kurum yöneticileri tarafından silinebilir.");
  const v = parseOrFail(
    z.object({
      lessonId: z.string().min(1),
      criticalPassword: z.string().max(200),
      reason: z.string().trim().min(5, "Silme gerekçesi en az 5 karakter olmalı.").max(500),
    }),
    input
  );
  if (!v.ok) return v;
  const data = await readData();
  const lesson = data.lessons.find((l) => l.id === v.data.lessonId);
  if (!lesson) return fail("NOT_FOUND", "Ders bulunamadı. Sayfayı yenileyip tekrar deneyin.");
  const studentName = data.students.find((st) => st.id === lesson.studentId)?.name ?? "Öğrenci";
  const entityName = `${studentName} · ${formatDate(lesson.startAt)} ${formatTime(lesson.startAt)} dersi`;
  const gate = await checkCriticalPassword(ctx, v.data.criticalPassword);
  if (!gate.ok) {
    await recordAuditLog({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      action: "lesson.delete_protected",
      entityType: "Lesson",
      entityId: lesson.id,
      outcome: "denied",
      meta: { reasonCode: gate.reasonCode, entityName },
    });
    return fail("FORBIDDEN", gate.message);
  }
  const result = await forceDeleteLesson(v.data.lessonId);
  if (!result.ok) return fail("CONFLICT", result.message);
  await recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: "lesson.delete_protected",
    entityType: "Lesson",
    entityId: lesson.id,
    outcome: "success",
    meta: {
      entityName,
      reason: v.data.reason,
      protectionReason: result.protectionReason,
      removedAttendanceIds: result.removedAttendanceIds,
      // Geri alınamaz silme — dersin dökümü denetim kaydında kalır.
      snapshot: {
        studentId: lesson.studentId,
        teacherId: lesson.teacherId,
        branchId: lesson.branchId,
        roomId: lesson.roomId,
        instrument: lesson.instrument,
        startAt: lesson.startAt,
        endAt: lesson.endAt,
        status: lesson.status,
        seriesId: lesson.seriesId,
        studentAttended: lesson.studentAttended,
        studentAbsent: lesson.studentAbsent,
        studentExcused: lesson.studentExcused,
        lessonProcessed: lesson.lessonProcessed,
        teacherAttendanceStatus: lesson.teacherAttendanceStatus,
      },
    },
  });
  return ok({ lessonId: lesson.id });
}

/** 2026-09-17 — dersi REVİZE ET (tarih/saat/gün/süre) üç kapsamla; çakışmada hiçbir ders değişmez. */
export async function reviseLessonsTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ updatedLessonIds: string[]; protectedLessons: { lessonId: string; startAt: string; reason: string }[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(reviseLessonsSchema, input);
  if (!v.ok) return v;
  if (v.data.scope === "single" && !v.data.startAt && v.data.durationMinutes === undefined) {
    return fail("VALIDATION_ERROR", "Yeni tarih-saat veya süre girin.");
  }
  if (v.data.scope !== "single" && !v.data.startTime && v.data.weekday === undefined && v.data.durationMinutes === undefined) {
    return fail("VALIDATION_ERROR", "Yeni saat, gün veya süre girin.");
  }
  try {
    const result = await reviseLessonsScoped(v.data);
    if (!result.ok) {
      return fail(result.code === "BLOCKED_BY_CONFLICT" ? "CONFLICT" : "VALIDATION_ERROR", result.message, {
        conflicts: result.conflicts,
        overridable: result.code === "NEEDS_AVAILABILITY_CONFIRM",
      });
    }
    audit(ctx, "lesson.revise", "Lesson", v.data.lessonId, {
      scope: v.data.scope,
      startAt: v.data.startAt,
      startTime: v.data.startTime,
      weekday: v.data.weekday,
      durationMinutes: v.data.durationMinutes,
      updatedCount: result.updatedLessons.length,
    });
    return ok({ updatedLessonIds: result.updatedLessons.map((l) => l.id), protectedLessons: result.protectedLessons });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "reviseLessons failed");
  }
}

/**
 * Faz 13 — bir dersin öğretmenini ve/veya şubesini/odasını değiştirir.
 * "single" | "fromHereOnward" | "entireSeries" — bkz. lesson-reassignment.ts.
 * Değişiklik öncesi öğretmen/oda geçerliliği + çakışma kontrolü yapılır;
 * başarılıysa audit + idempotent bildirim (eski/yeni öğretmen, öğrenci,
 * yöneticiler — bkz. notifyLessonReassigned).
 */
export async function changeLessonTeacherOrBranchTool(
  ctx: ServiceContext,
  input: unknown
): Promise<
  ServiceResult<{
    affectedLessonIds: string[];
    newTeacherId: string;
    newBranchId: string;
    newRoomId: string;
  }>
> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(reassignLessonTeacherOrBranchSchema, input);
  if (!v.ok) return v;

  const data = await readData();
  const lesson = data.lessons.find((l) => l.id === v.data.lessonId);
  if (!lesson) return fail("NOT_FOUND", "Ders bulunamadı.");

  if (v.data.newTeacherId) {
    const newTeacher = data.teachers.find((t) => t.id === v.data.newTeacherId);
    if (!newTeacher) return fail("VALIDATION_ERROR", "Seçilen öğretmen bulunamadı.");
    if (!isTeacherSchedulable(newTeacher)) {
      return fail("VALIDATION_ERROR", `"${newTeacher.name}" pasif/işten ayrılmış — aktif bir öğretmen seçin.`);
    }
    if (!newTeacher.instruments.includes(lesson.instrument)) {
      return fail("VALIDATION_ERROR", `"${newTeacher.name}" "${lesson.instrument}" enstrümanını öğretmiyor.`);
    }
  }
  if (v.data.newRoomId) {
    const newRoom = data.rooms.find((r) => r.id === v.data.newRoomId);
    if (!newRoom) return fail("VALIDATION_ERROR", "Seçilen oda bulunamadı.");
    if (v.data.newBranchId && newRoom.branchId !== v.data.newBranchId) {
      return fail("VALIDATION_ERROR", "Seçilen oda, seçilen şubeye ait değil.");
    }
    if (!newRoom.instruments.includes(lesson.instrument)) {
      return fail("VALIDATION_ERROR", `Seçilen oda "${lesson.instrument}" enstrümanına uygun değil.`);
    }
  }

  try {
    const result = await reassignLessonTeacherOrBranchLive(v.data);
    if (!result.ok) {
      if (result.code === "BLOCKED_BY_CONFLICT") return fail("CONFLICT", result.message, result.conflicts);
      return fail("VALIDATION_ERROR", result.message);
    }

    audit(ctx, "lesson.reassign", "Lesson", v.data.lessonId, {
      scope: v.data.scope,
      previousTeacherId: result.preview.previousTeacherId,
      previousBranchId: result.preview.previousBranchId,
      newTeacherId: result.preview.newTeacherId,
      newBranchId: result.preview.newBranchId,
      affectedLessonCount: result.preview.affectedLessonIds.length,
    });

    try {
      const updatedLesson = result.data.lessons.find((l) => l.id === v.data.lessonId);
      if (updatedLesson) {
        await notifyLessonReassigned({
          tenantId: ctx.tenantId,
          lesson: updatedLesson,
          previousTeacherId: result.preview.previousTeacherId,
          previousBranchId: result.preview.previousBranchId,
          actorUserId: ctx.userId,
        });
        // 11. tur iş #2 — atama sonrası WhatsApp taslakları. YALNIZ çapa ders
        // için (seri üyelerine tek tek WA taslağı spam olur; uygulama-içi
        // bildirimleri zaten gider). Best-effort: atama başarılıdır.
        const { queueLessonUpdateDraftsBestEffort } = await import("../communications/service");
        await queueLessonUpdateDraftsBestEffort({
          tenantId: ctx.tenantId,
          actorUserId: ctx.userId,
          lessonId: updatedLesson.id,
          previous: {
            startAt: updatedLesson.startAt,
            teacherId: result.preview.previousTeacherId,
            roomId: lesson.roomId,
            branchId: result.preview.previousBranchId,
            // Öğretmen/şube değişimi süreyi değiştirmez — güncel aralıktan türetilir.
            durationMinutes: Math.round(
              (new Date(updatedLesson.endAt).getTime() - new Date(updatedLesson.startAt).getTime()) / 60000
            ),
          },
        });
      }
    } catch {
      // best-effort
    }

    return ok({
      affectedLessonIds: result.preview.affectedLessonIds,
      newTeacherId: result.preview.newTeacherId,
      newBranchId: result.preview.newBranchId,
      newRoomId: result.preview.newRoomId,
    });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "changeLessonTeacherOrBranch failed");
  }
}

export async function createPaymentRecordTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ paymentId: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "AI_AGENT", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(paymentRecordSchema, input);
  if (!v.ok) return v;

  try {
    const before = await readData();
    const ids = new Set(before.payments.map((p) => p.id));
    await addPayment({
      studentId: v.data.studentId,
      description: v.data.description,
      amount: v.data.amount,
      dueDate: v.data.dueDate,
    });
    const after = await readData();
    const created = after.payments.find((p) => !ids.has(p.id));
    return ok({ paymentId: created?.id ?? "unknown" });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "createPaymentRecord failed");
  }
}

function mapFeeRuleErrorCode(
  code: "INVALID_RATE" | "INVALID_DATE_RANGE" | "OVERLAPPING_RULE" | "NOT_FOUND"
): ServiceErrorCode {
  if (code === "NOT_FOUND") return "NOT_FOUND";
  if (code === "OVERLAPPING_RULE") return "CONFLICT";
  return "VALIDATION_ERROR";
}

/** Öğretmen için yeni bir dakika-başı ücret kuralı ekler. */
export async function createFeeRuleTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ rule: TeacherFeeRule }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const earnings = await assertTeacherEarningsAccess(ctx); // kurum hakediş politikası
  if (!earnings.ok) return earnings;

  const v = parseOrFail(createFeeRuleSchema, input);
  if (!v.ok) return v;

  try {
    const result = await addTeacherFeeRule(v.data);
    if (!result.ok) return fail(mapFeeRuleErrorCode(result.code), result.message);
    audit(ctx, "teacher_fee.create", "TeacherFeeRule", result.rule.id, {
      teacherId: result.rule.teacherId,
      perMinuteRate: result.rule.perMinuteRate,
    });
    return ok({ rule: result.rule });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "createFeeRule failed");
  }
}

/**
 * Mevcut bir ücret kuralını günceller. Geçmiş `TeacherPayout` snapshot'ları
 * bu güncellemeden asla etkilenmez — onlar oluşturuldukları andaki tutarı
 * kalıcı olarak korur.
 */
export async function updateFeeRuleTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ rule: TeacherFeeRule }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const earnings = await assertTeacherEarningsAccess(ctx); // kurum hakediş politikası
  if (!earnings.ok) return earnings;

  const v = parseOrFail(updateFeeRuleSchema, input);
  if (!v.ok) return v;

  try {
    const { ruleId, ...patch } = v.data;
    const result = await updateTeacherFeeRule(ruleId, patch);
    if (!result.ok) return fail(mapFeeRuleErrorCode(result.code), result.message);
    audit(ctx, "teacher_fee.update", "TeacherFeeRule", result.rule.id, {
      teacherId: result.rule.teacherId,
      perMinuteRate: result.rule.perMinuteRate,
    });
    return ok({ rule: result.rule });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "updateFeeRule failed");
  }
}

/**
 * Öğretmenin kendi geçmiş hakediş kayıtları — mobil `(teacher)/hesabim/hakedis`
 * ekranı. `ownPayouts` web öğretmen portalıyla (src/app/ogretmen/hakedis/page.tsx)
 * AYNI sahiplik yardımcısı — yeni bir sıralama/filtre kuralı İCAT EDİLMEDİ,
 * web'deki `.sort((a,b) => b.periodStart.localeCompare(a.periodStart))` birebir.
 */
export async function listTeacherPayoutsTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ payouts: TeacherPayout[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "TEACHER", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  // Hakediş erişimi kurum politikasıyla (access.teacherEarningsAccess); öğretmen yalnız kendi hakedişini görür.
  if (ctx.role !== "TEACHER") {
    const earnings = await assertTeacherEarningsAccess(ctx);
    if (!earnings.ok) return earnings;
  }

  const v = parseOrFail(z.object({ teacherId: z.string().min(1) }), input);
  if (!v.ok) return v;
  if (!canAccessTeacher(ctx, v.data.teacherId)) {
    return fail("FORBIDDEN", "Bu öğretmenin hakediş kayıtlarına erişiminiz yok.");
  }

  const data = await readData();
  const payouts = ownPayouts(data.teacherPayouts, v.data.teacherId).sort((a, b) =>
    b.periodStart.localeCompare(a.periodStart)
  );
  return ok({ payouts });
}

/**
 * Bir öğretmenin verilen dönem için hakediş dökümünü hesaplar — hiçbir
 * kayıt yazmaz (yalnızca önizleme). Yalnızca `lesson.teacherId` ile
 * filtreler; `Teacher.branchId` ile ek filtre uygulamaz.
 */
export async function computeTeacherPayoutTool(
  ctx: ServiceContext,
  input: unknown
): Promise<
  ServiceResult<
    TeacherEarningsResult & {
      paymentMethodInfo: TeacherPayoutPaymentMethodInfo | null;
      /** Bu dönem için zaten oluşturulmuş bir kayıt varsa — o kaydın ödeme yöntemi (varsayılan veya override) ASLA burada yeniden hesaplanmaz. */
      existingPayout: ExistingPayoutSummary | null;
      /** Aynı dönemin iptal edilmiş kaydı (yeniden oluşturulunca aynı kayıt kullanılır; kalıcı silinebilir). */
      cancelledPayout: { id: string; cancelledAt?: string; cancelReason?: string; hadPayments: boolean } | null;
      /** Kalemin kaynağı: gerçek program dersi mi, silinmiş/işlenmemiş/demo mu. */
      lineSources: Record<string, PayoutLineSource>;
    }
  >
> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const earnings = await assertTeacherEarningsAccess(ctx); // kurum hakediş politikası
  if (!earnings.ok) return earnings;

  const v = parseOrFail(computeTeacherPayoutSchema, input);
  if (!v.ok) return v;

  const data = await readData();
  if (!data.teachers.some((t) => t.id === v.data.teacherId)) {
    return fail("NOT_FOUND", "Öğretmen bulunamadı.");
  }

  const result = computeTeacherEarningsForPeriod(
    data,
    v.data.teacherId,
    v.data.periodStart,
    v.data.periodEnd
  );
  const paymentMethodInfo = computeTeacherPayoutPaymentMethodInfo(
    data,
    v.data.teacherId,
    v.data.periodStart,
    v.data.periodEnd
  );
  const samePeriod = data.teacherPayouts.filter(
    (p) =>
      p.teacherId === v.data.teacherId &&
      payoutPeriodDayKey(p.periodStart) === payoutPeriodDayKey(v.data.periodStart) &&
      payoutPeriodDayKey(p.periodEnd) === payoutPeriodDayKey(v.data.periodEnd)
  );
  const existing = samePeriod.find((p) => p.status !== "cancelled");
  const cancelled = samePeriod.find((p) => p.status === "cancelled");
  // Ekran = kayıt: kayıt varsa donmuş kalemler + satır düzeltmeleri; yoksa canlı hesap.
  const shown = applyPayoutLineOverrides(existing ? payoutBaseEarnings(data, existing) : result, existing?.lineOverrides);
  const lineSources = describeLineSources(data, shown.lines.map((l) => l.lessonId));
  const { resolveActorLabels } = await import("../contract-payment-plan-view");
  const actorLabels = existing
    ? await resolveActorLabels({
        tenantId: ctx.tenantId,
        userIds: [
          existing.revisedByUserId,
          ...(existing.payments ?? []).flatMap((x) => [x.createdByUserId, x.reversedByUserId]),
          ...(existing.adjustments ?? []).flatMap((a) => [a.createdByUserId, a.reversedByUserId]),
        ],
        teachers: data.teachers,
      })
    : new Map<string, string>();
  const nameOf = (id?: string) => (id ? actorLabels.get(id) : undefined);
  const revisedByName = nameOf(existing?.revisedByUserId);
  const existingPayout: ExistingPayoutSummary | null = existing
    ? {
        id: existing.id,
        method: existing.method,
        status: existing.status,
        paidAt: existing.paidAt,
        totalAmount: existing.totalAmount,
        totalMinutes: existing.totalMinutes,
        originalTotalAmount: existing.originalTotalAmount,
        originalTotalMinutes: existing.originalTotalMinutes,
        revisionCount: existing.revisionCount ?? 0,
        revisedAt: existing.revisedAt,
        revisedByName,
        revisionReason: existing.revisionReason,
        lineOverrides: existing.lineOverrides ?? {},
        netAmount: payoutNetAmount(existing),
        paidAmount: payoutPaidAmount(existing),
        balance: payoutBalance(existing),
        drift: payoutDrift(data, existing),
        payments: (existing.payments ?? (existing.status === "paid" ? undefined : [])) === undefined
          ? [{ id: `legacy-${existing.id}`, amount: existing.totalAmount, paidAt: existing.paidAt ?? existing.generatedAt, method: existing.method, note: "Eski kayıt (tek ödeme)", legacy: true }]
          : (existing.payments ?? []).map((x) => ({ ...x, byName: nameOf(x.createdByUserId), reversedByName: x.reversedByUserId ? nameOf(x.reversedByUserId) : undefined })),
        adjustments: (existing.adjustments ?? []).map((a) => ({ ...a, byName: nameOf(a.createdByUserId), reversedByName: a.reversedByUserId ? nameOf(a.reversedByUserId) : undefined })),
        pricingPolicy: existing.pricingPolicy,
        hasSnapshot: Boolean(existing.lineSnapshot),
      }
    : null;
  const cancelledPayout = cancelled
    ? { id: cancelled.id, cancelledAt: cancelled.cancelledAt, cancelReason: cancelled.cancelReason, hadPayments: (cancelled.payments ?? []).length > 0 }
    : null;

  return ok({ ...shown, paymentMethodInfo, existingPayout, cancelledPayout, lineSources });
}

export type ExistingPayoutSummary = {
  id: string;
  method?: string;
  status: string;
  paidAt?: string;
  totalAmount: number;
  totalMinutes: number;
  originalTotalAmount?: number;
  originalTotalMinutes?: number;
  revisionCount: number;
  revisedAt?: string;
  revisedByName?: string;
  revisionReason?: string;
  lineOverrides: Record<string, TeacherPayoutLineOverride>;
  netAmount: number;
  paidAmount: number;
  balance: number;
  /** Kayıt ile güncel hesap farkı (politika/kural/hariç tutma sonrası). */
  drift: number;
  payments: {
    id: string;
    amount: number;
    paidAt: string;
    method?: string;
    note?: string;
    legacy?: boolean;
    byName?: string;
    reversedAt?: string;
    reversedByName?: string;
    reverseReason?: string;
  }[];
  adjustments: {
    id: string;
    amount: number;
    reason: string;
    kind: "manual" | "recalc";
    createdAt: string;
    byName?: string;
    reversedAt?: string;
    reversedByName?: string;
    reverseReason?: string;
  }[];
  pricingPolicy?: string;
  hasSnapshot: boolean;
};

/** Kalem kaynağı — "gerçek program dersi" ile "yalnız hakediş kalemi"ni ayırt eder. */
export type PayoutLineSource = {
  /** ok: program dersi, işlendi · missing: ders programda yok (silinmiş) · not_processed: ders artık işlendi değil */
  state: "ok" | "missing" | "not_processed";
  /** Demo/test tohum serisinden gelen ders. */
  demo: boolean;
  /** Ders Programı'nda o haftaya giden bağlantı. */
  programHref?: string;
  excluded: boolean;
};

function describeLineSources(data: AppData, lessonIds: string[]): Record<string, PayoutLineSource> {
  const excluded = new Set((data.teacherPayoutExclusions ?? []).map((x) => x.lessonId));
  const out: Record<string, PayoutLineSource> = {};
  for (const id of lessonIds) {
    const lesson = data.lessons.find((l) => l.id === id);
    const series = lesson?.seriesId ? data.lessonSeries.find((s) => s.id === lesson.seriesId) : undefined;
    out[id] = {
      state: !lesson ? "missing" : isLessonProcessedForPayout(lesson) ? "ok" : "not_processed",
      demo: Boolean(series?.demoTag),
      programHref: lesson ? `/panel/program?studentId=${lesson.studentId}&week=${lesson.startAt.slice(0, 10)}` : undefined,
      excluded: excluded.has(id),
    };
  }
  return out;
}

const payoutRevisionSchema = z.object({
  payoutId: z.string().min(1),
  lineOverrides: z
    .record(
      z.string(),
      z.object({ minutes: z.number().optional(), hourlyRate: z.number().optional(), amount: z.number().optional() })
    )
    .default({}),
  reason: z.string().trim().min(5, "Revizyon gerekçesi en az 5 karakter olmalı.").max(500),
  criticalPassword: z.string().max(200).optional(),
});

/** Revizyon/geri alma için ortak yükleme + ödenmiş kayıtta kritik şifre kapısı. */
async function loadPayoutForRevision(
  ctx: ServiceContext,
  payoutId: string,
  criticalPassword: string | undefined,
  action: string
): Promise<ServiceResult<{ payout: TeacherPayout; data: AppData; teacherName: string }>> {
  const auth = requireRole(ctx, CRITICAL_ROLES_FOR_TOOLS);
  if (!auth.ok) return fail("FORBIDDEN", "Hakediş revizyonu yalnız kurum sahibi ve kurum yöneticileri tarafından yapılabilir.");
  const earnings = await assertTeacherEarningsAccess(ctx);
  if (!earnings.ok) return earnings;
  const data = await readData();
  const payout = data.teacherPayouts.find((p) => p.id === payoutId);
  if (!payout) return fail("NOT_FOUND", "Hakediş kaydı bulunamadı. Sayfayı yenileyip dönemi tekrar getirin.");
  const teacherName = data.teachers.find((t) => t.id === payout.teacherId)?.name ?? "Öğretmen";
  if (payout.status === "cancelled") return fail("VALIDATION_ERROR", "İptal edilmiş hakediş değiştirilemez; dönemi yeniden oluşturun.");
  // 2026-09-30 owner kararı: ödemesi olan kayıt yeniden yazılmaz — fark düzeltme kaydıyla yönetilir.
  if (action !== "teacher_payout.unpay" && payoutPaidAmount(payout) > 0.005) {
    return fail(
      "VALIDATION_ERROR",
      "Bu hakedişe ödeme yapılmış; döküm yeniden yazılamaz. Farkı “Düzeltme ekle” ile gerekçeli +/− kayıt olarak girin. Ödeme gerçekte yapılmadıysa önce ödemeyi ters kayıtla geri alın."
    );
  }
  if (payoutPaidAmount(payout) > 0.005) {
    const gate = await checkCriticalPassword(ctx, criticalPassword ?? "");
    if (!gate.ok) {
      await recordAuditLog({
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        actorRole: ctx.role,
        action,
        entityType: "TeacherPayout",
        entityId: payout.id,
        outcome: "denied",
        meta: { reasonCode: gate.reasonCode, entityName: `${teacherName} hakedişi` },
      });
      return fail("FORBIDDEN", gate.message);
    }
  }
  return ok({ payout, data, teacherName });
}

function payoutPeriodLabel(p: TeacherPayout): string {
  const fmt = (v: string) => payoutPeriodDayKeySync(v).split("-").reverse().join(".");
  return `${fmt(p.periodStart)}–${fmt(p.periodEnd)}`;
}

function payoutPeriodDayKeySync(v: string): string {
  return /^(\d{4}-\d{2}-\d{2})/.exec(v)?.[1] ?? v.slice(0, 10);
}

/**
 * K — hakediş revizyonu: döküm satırlarında süre/saatlik ücret/tutar elle düzeltilir,
 * toplam yeniden hesaplanır. İlk revizyonda orijinal hesap donar (fark her zaman
 * görünür). Ödenmiş hakedişte kritik işlem şifresi zorunlu; her revizyon gerekçe +
 * satır bazlı önce/sonra ile audit'e yazılır. Geri alma: resetTeacherPayoutRevisionTool.
 */
export async function reviseTeacherPayoutTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ payout: TeacherPayout }>> {
  const v = parseOrFail(payoutRevisionSchema, input);
  if (!v.ok) return v;
  const loaded = await loadPayoutForRevision(ctx, v.data.payoutId, v.data.criticalPassword, "teacher_payout.revise");
  if (!loaded.ok) return loaded;
  const { payout, data, teacherName } = loaded.data;
  const base = payoutBaseEarnings(data, payout);
  const clean = sanitizePayoutLineOverrides(base, v.data.lineOverrides);
  if (!clean.ok) return fail("VALIDATION_ERROR", clean.message);
  const revised = applyPayoutLineOverrides(base, clean.overrides);
  const before = { totalAmount: payout.totalAmount, totalMinutes: payout.totalMinutes };
  const next: TeacherPayout = {
    ...payout,
    lineOverrides: clean.overrides,
    totalAmount: revised.totalAmount,
    totalMinutes: revised.totalMinutes,
    originalTotalAmount: payout.originalTotalAmount ?? payout.totalAmount,
    originalTotalMinutes: payout.originalTotalMinutes ?? payout.totalMinutes,
    revisionCount: (payout.revisionCount ?? 0) + 1,
    revisedAt: new Date().toISOString(),
    revisedByUserId: ctx.userId,
    revisionReason: v.data.reason,
  };
  try {
    await replaceTeacherPayout(next);
  } catch (e) {
    logger.error("reviseTeacherPayoutTool failed", e);
    return fail("INTERNAL_ERROR", "Hakediş revizyonu kaydedilemedi; kayıt değişmedi. Tekrar deneyin.");
  }
  await recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: "teacher_payout.revise",
    entityType: "TeacherPayout",
    entityId: payout.id,
    outcome: "success",
    meta: {
      entityName: `${teacherName} ${payoutPeriodLabel(payout)} hakedişi`,
      teacherId: payout.teacherId,
      wasPaid: payout.status === "paid",
      reason: v.data.reason,
      revisionCount: next.revisionCount,
      changes: diffRecordFields(before, { totalAmount: next.totalAmount, totalMinutes: next.totalMinutes }),
      lines: revised.lines
        .filter((l) => l.original)
        .map((l) => ({ lessonId: l.lessonId, date: l.lessonDate.slice(0, 10), student: l.studentName, from: l.original, to: { durationMinutes: l.durationMinutes, hourlyRate: l.hourlyRate, amount: l.amount } })),
    },
  });
  return ok({ payout: next });
}

/** K — revizyonu geri alır: satır düzeltmeleri silinir, orijinal hesaba dönülür (kendisi de audit'lenir). */
export async function resetTeacherPayoutRevisionTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ payout: TeacherPayout }>> {
  const v = parseOrFail(payoutRevisionSchema.pick({ payoutId: true, reason: true, criticalPassword: true }), input);
  if (!v.ok) return v;
  const loaded = await loadPayoutForRevision(ctx, v.data.payoutId, v.data.criticalPassword, "teacher_payout.reset");
  if (!loaded.ok) return loaded;
  const { payout, teacherName } = loaded.data;
  if (payout.originalTotalAmount === undefined && !payout.lineOverrides) {
    return fail("VALIDATION_ERROR", "Bu hakediş hiç revize edilmemiş; geri alınacak bir değişiklik yok.");
  }
  const next: TeacherPayout = {
    ...payout,
    lineOverrides: undefined,
    totalAmount: payout.originalTotalAmount ?? payout.totalAmount,
    totalMinutes: payout.originalTotalMinutes ?? payout.totalMinutes,
    revisionCount: (payout.revisionCount ?? 0) + 1,
    revisedAt: new Date().toISOString(),
    revisedByUserId: ctx.userId,
    revisionReason: v.data.reason,
  };
  await replaceTeacherPayout(next);
  await recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: "teacher_payout.reset",
    entityType: "TeacherPayout",
    entityId: payout.id,
    outcome: "success",
    meta: {
      entityName: `${teacherName} ${payoutPeriodLabel(payout)} hakedişi`,
      reason: v.data.reason,
      changes: diffRecordFields({ totalAmount: payout.totalAmount, totalMinutes: payout.totalMinutes }, { totalAmount: next.totalAmount, totalMinutes: next.totalMinutes }),
    },
  });
  return ok({ payout: next });
}

/**
 * K — ödenmiş hakedişin "ödendi" işaretini geri alır (yanlış ödeme kaydı / baştan girme).
 * Her zaman kritik işlem şifresi ister; kayıt "bekliyor"a döner, sonra revize edilip
 * yeniden ödenebilir. Öğretmene yapılmış gerçek bir ödeme varsa mutabakat ayrıca yapılır.
 */
export async function unmarkTeacherPayoutPaidTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ payout: TeacherPayout }>> {
  const v = parseOrFail(payoutRevisionSchema.pick({ payoutId: true, reason: true, criticalPassword: true }), input);
  if (!v.ok) return v;
  const loaded = await loadPayoutForRevision(ctx, v.data.payoutId, v.data.criticalPassword, "teacher_payout.unpay");
  if (!loaded.ok) return loaded;
  const { payout, teacherName } = loaded.data;
  if (payoutPaidAmount(payout) <= 0.005) return fail("VALIDATION_ERROR", "Bu hakedişte geri alınacak ödeme yok (bekliyor durumda).");
  const reversed = reversePaymentData(payout, "all", v.data.reason, ctx.userId);
  if (!reversed.ok) return fail("VALIDATION_ERROR", reversed.message);
  const next = reversed.payout;
  const saveErr = await savePayout(next);
  if (saveErr) return saveErr;
  await recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: "teacher_payout.unpay",
    entityType: "TeacherPayout",
    entityId: payout.id,
    outcome: "success",
    meta: {
      entityName: `${teacherName} ${payoutPeriodLabel(payout)} hakedişi`,
      reason: v.data.reason,
      changes: [{ field: "status", from: "Ödendi", to: "Bekliyor" }],
      paidAt: payout.paidAt,
      totalAmount: payout.totalAmount,
    },
  });
  return ok({ payout: next });
}

/**
 * Bir dönem için hakediş snapshot'ı kalıcı olarak oluşturur. Eksik ücret
 * kurallı ders varsa veya bu öğretmen+dönem için zaten bir kayıt varsa
 * reddeder — sessizce 0 TL'lik veya yinelenen kayıt asla oluşturmaz.
 */
export async function createTeacherPayoutTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ payout: TeacherPayout }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const earnings = await assertTeacherEarningsAccess(ctx); // kurum hakediş politikası
  if (!earnings.ok) return earnings;

  const v = parseOrFail(createTeacherPayoutSchema, input);
  if (!v.ok) return v;

  try {
    const result = await createTeacherPayout(
      v.data.teacherId,
      v.data.periodStart,
      v.data.periodEnd,
      v.data.paymentMethod
    );
    if (!result.ok) {
      const code = result.code === "MISSING_FEE_RULE" ? "VALIDATION_ERROR" : "CONFLICT";
      const details = result.code === "MISSING_FEE_RULE" ? result.missingFeeRuleLessonIds : undefined;
      return fail(code, result.message, details);
    }
    audit(ctx, result.reusedCancelledId ? "teacher_payout.recreate" : "teacher_payout.create", "TeacherPayout", result.payout.id, {
      teacherId: result.payout.teacherId,
      totalAmount: result.payout.totalAmount,
      pricingPolicy: result.payout.pricingPolicy,
    });
    return ok({ payout: result.payout });
  } catch (e) {
    logger.error("createTeacherPayoutTool failed", e);
    return fail("INTERNAL_ERROR", "Hakediş kaydı oluşturulamadı. Sayfayı yenileyip tekrar deneyin; sorun sürerse dönem ve ücret kurallarını kontrol edin.");
  }
}

/**
 * PRODUCT_BACKLOG §3.4 — yönetici override: mevcut bir hakediş kaydının
 * nakit/havale seçimini açıkça değiştirir. Tutarı/ders sayısını/statüyü
 * ASLA değiştirmez — yalnızca `method`. Bu değer bir sonraki hesaplamada
 * (`computeTeacherPayoutTool`, `existingPayout.method`) AYNEN korunur.
 */
export async function updateTeacherPayoutPaymentMethodTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ payout: TeacherPayout }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const earnings = await assertTeacherEarningsAccess(ctx); // kurum hakediş politikası
  if (!earnings.ok) return earnings;

  const v = parseOrFail(updateTeacherPayoutPaymentMethodSchema, input);
  if (!v.ok) return v;

  try {
    const result = await updateTeacherPayoutPaymentMethod(v.data.payoutId, v.data.method);
    if (!result.ok) return fail("NOT_FOUND", result.message);
    return ok({ payout: result.payout });
  } catch (e) {
    logger.error("updateTeacherPayoutPaymentMethodTool failed", e);
    return fail("INTERNAL_ERROR", "Hakediş ödeme yöntemi güncellenemedi. Sayfayı yenileyip tekrar deneyin.");
  }
}

/** Bekleyen bir hakedişi ödendi olarak işaretler. Tutarı asla değiştirmez. */
export async function markTeacherPayoutPaidTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ payout: TeacherPayout }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const earnings = await assertTeacherEarningsAccess(ctx); // kurum hakediş politikası
  if (!earnings.ok) return earnings;

  const v = parseOrFail(markTeacherPayoutPaidSchema, input);
  if (!v.ok) return v;

  try {
    // 2026-09-30 — "Hakedişi öde" = kalan bakiye kadar ödeme satırı (defter). Kısmi ödeme: addTeacherPayoutPaymentTool.
    const data = await readData();
    const payout = data.teacherPayouts.find((p) => p.id === v.data.payoutId);
    if (!payout) return fail("NOT_FOUND", "Hakediş kaydı bulunamadı. Sayfayı yenileyip tekrar deneyin.");
    const res = addPaymentData(payout, { method: v.data.method ?? payout.method }, ctx.userId);
    if (!res.ok) return fail("CONFLICT", res.message);
    const saveErr = await savePayout(res.payout);
    if (saveErr) return saveErr;
    audit(ctx, "teacher_payout.payment", "TeacherPayout", payout.id, { amount: payoutPaidAmount(res.payout) - payoutPaidAmount(payout), full: true });
    return ok({ payout: res.payout });
  } catch (e) {
    logger.error("markTeacherPayoutPaidTool failed", e);
    return fail("INTERNAL_ERROR", "Hakediş ödendi olarak kaydedilemedi. Sayfayı yenileyip tekrar deneyin.");
  }
}

// ─── 2026-09-30 · Hakediş defteri (ödeme/düzeltme/iptal/silme/hariç tutma/eşitleme) ──────────────

const STALE_PAYOUT_MESSAGE =
  "Bu hakediş kaydı siz işlem yaparken değişti (başka bir kullanıcı veya ikinci tıklama). İşlem uygulanmadı; sayfayı yenileyip güncel tutarları kontrol edin.";

/** Sürüm kontrollü yazma — eşzamanlı ikinci ödeme/düzeltme çift kayıt üretmez. */
async function savePayout(next: TeacherPayout): Promise<ServiceFailure | null> {
  try {
    await replaceTeacherPayout(next);
    return null;
  } catch (e) {
    if (e instanceof Error && e.message === "STALE_PAYOUT") return fail("CONFLICT", STALE_PAYOUT_MESSAGE);
    logger.error("savePayout failed", e);
    return fail("INTERNAL_ERROR", "Hakediş kaydı güncellenemedi; kayıt değişmedi. Sayfayı yenileyip tekrar deneyin.");
  }
}

/** Defter işlemleri için ortak yükleme: yetki (kurum yöneticisi/sahibi + kurum hakediş politikası). */
async function loadPayoutForLedger(
  ctx: ServiceContext,
  payoutId: string
): Promise<ServiceResult<{ payout: TeacherPayout; data: AppData; teacherName: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", "Hakediş işlemlerini yalnız kurum yöneticisi veya kurum sahibi yapabilir.");
  const earnings = await assertTeacherEarningsAccess(ctx);
  if (!earnings.ok) return earnings;
  const data = await readData();
  const payout = data.teacherPayouts.find((p) => p.id === payoutId);
  if (!payout) return fail("NOT_FOUND", "Hakediş kaydı bulunamadı. Sayfayı yenileyip dönemi tekrar getirin.");
  const teacherName = data.teachers.find((t) => t.id === payout.teacherId)?.name ?? "Öğretmen";
  return ok({ payout, data, teacherName });
}

async function payoutAudit(ctx: ServiceContext, action: string, payout: TeacherPayout, teacherName: string, meta: Record<string, unknown>) {
  await recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action,
    entityType: "TeacherPayout",
    entityId: payout.id,
    outcome: "success",
    meta: { entityName: `${teacherName} ${payoutPeriodLabel(payout)} hakedişi`, teacherId: payout.teacherId, ...meta },
  });
}

async function passwordGate(ctx: ServiceContext, action: string, payout: TeacherPayout, teacherName: string, password?: string): Promise<ServiceFailure | null> {
  const gate = await checkCriticalPassword(ctx, password ?? "");
  if (gate.ok) return null;
  await recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action,
    entityType: "TeacherPayout",
    entityId: payout.id,
    outcome: "denied",
    meta: { reasonCode: gate.reasonCode, entityName: `${teacherName} hakedişi` },
  });
  return fail("FORBIDDEN", gate.message);
}

const reasonField = z.string().trim().min(5, "Gerekçe en az 5 karakter olmalı.").max(500);

/** Kısmi veya tam ödeme satırı. Tutar verilmezse kalan bakiye; bakiyeyi aşan ödeme reddedilir. */
export async function addTeacherPayoutPaymentTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ payout: TeacherPayout }>> {
  const v = parseOrFail(
    z.object({
      payoutId: z.string().min(1),
      amount: z.number().positive("Ödeme tutarı 0'dan büyük olmalı.").optional(),
      paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Ödeme tarihi geçersiz.").optional(),
      method: z.enum(["cash", "transfer"]).optional(),
      note: z.string().max(300).optional(),
    }),
    input
  );
  if (!v.ok) return v;
  const loaded = await loadPayoutForLedger(ctx, v.data.payoutId);
  if (!loaded.ok) return loaded;
  const { payout, teacherName } = loaded.data;
  const paidAt = v.data.paidAt ? new Date(`${v.data.paidAt.slice(0, 10)}T12:00:00.000Z`).toISOString() : undefined;
  const res = addPaymentData(payout, { amount: v.data.amount, paidAt, method: v.data.method, note: v.data.note }, ctx.userId);
  if (!res.ok) return fail("VALIDATION_ERROR", res.message);
  const err = await savePayout(res.payout);
  if (err) return err;
  await payoutAudit(ctx, "teacher_payout.payment", payout, teacherName, {
    amount: round2Money(payoutPaidAmount(res.payout) - payoutPaidAmount(payout)),
    balanceAfter: payoutBalance(res.payout),
  });
  return ok({ payout: res.payout });
}

/** Hatalı ödeme satırı SİLİNMEZ: ters kayıt (kritik şifre + gerekçe). */
export async function reverseTeacherPayoutPaymentTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ payout: TeacherPayout }>> {
  const v = parseOrFail(
    z.object({ payoutId: z.string().min(1), paymentId: z.string().min(1), reason: reasonField, criticalPassword: z.string().max(200) }),
    input
  );
  if (!v.ok) return v;
  const loaded = await loadPayoutForLedger(ctx, v.data.payoutId);
  if (!loaded.ok) return loaded;
  const { payout, teacherName } = loaded.data;
  const gate = await passwordGate(ctx, "teacher_payout.payment_reverse", payout, teacherName, v.data.criticalPassword);
  if (gate) return gate;
  // Eski tek-bayraklı kayıtta sentetik ödeme id'si "legacy-…" → tüm ödeme ters kaydı.
  const res = reversePaymentData(payout, v.data.paymentId.startsWith("legacy-") ? "all" : v.data.paymentId, v.data.reason, ctx.userId);
  if (!res.ok) return fail("VALIDATION_ERROR", res.message);
  const err = await savePayout(res.payout);
  if (err) return err;
  await payoutAudit(ctx, "teacher_payout.payment_reverse", payout, teacherName, {
    reason: v.data.reason,
    amount: round2Money(payoutPaidAmount(payout) - payoutPaidAmount(res.payout)),
  });
  return ok({ payout: res.payout });
}

/** +/− düzeltme kaydı (ödenmiş kayıtta revizyon yerine). Ödemesi olan kayıtta kritik şifre ister. */
export async function addTeacherPayoutAdjustmentTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ payout: TeacherPayout }>> {
  const v = parseOrFail(
    z.object({ payoutId: z.string().min(1), amount: z.number(), reason: reasonField, criticalPassword: z.string().max(200).optional() }),
    input
  );
  if (!v.ok) return v;
  const loaded = await loadPayoutForLedger(ctx, v.data.payoutId);
  if (!loaded.ok) return loaded;
  const { payout, teacherName } = loaded.data;
  if (payoutPaidAmount(payout) > 0.005) {
    const gate = await passwordGate(ctx, "teacher_payout.adjust", payout, teacherName, v.data.criticalPassword);
    if (gate) return gate;
  }
  const res = addAdjustmentData(payout, { amount: v.data.amount, reason: v.data.reason, kind: "manual" }, ctx.userId);
  if (!res.ok) return fail("VALIDATION_ERROR", res.message);
  const err = await savePayout(res.payout);
  if (err) return err;
  await payoutAudit(ctx, "teacher_payout.adjust", payout, teacherName, { amount: v.data.amount, reason: v.data.reason, netAfter: payoutNetAmount(res.payout) });
  return ok({ payout: res.payout });
}

export async function reverseTeacherPayoutAdjustmentTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ payout: TeacherPayout }>> {
  const v = parseOrFail(
    z.object({ payoutId: z.string().min(1), adjustmentId: z.string().min(1), reason: reasonField, criticalPassword: z.string().max(200).optional() }),
    input
  );
  if (!v.ok) return v;
  const loaded = await loadPayoutForLedger(ctx, v.data.payoutId);
  if (!loaded.ok) return loaded;
  const { payout, teacherName } = loaded.data;
  if (payoutPaidAmount(payout) > 0.005) {
    const gate = await passwordGate(ctx, "teacher_payout.adjust_reverse", payout, teacherName, v.data.criticalPassword);
    if (gate) return gate;
  }
  const res = reverseAdjustmentData(payout, v.data.adjustmentId, v.data.reason, ctx.userId);
  if (!res.ok) return fail("VALIDATION_ERROR", res.message);
  const err = await savePayout(res.payout);
  if (err) return err;
  await payoutAudit(ctx, "teacher_payout.adjust_reverse", payout, teacherName, { adjustmentId: v.data.adjustmentId, reason: v.data.reason });
  return ok({ payout: res.payout });
}

/** Ödemesiz kaydı iptal eder (kayıt + iz kalır; toplam ve kilit dışı; dönem yeniden oluşturulabilir). */
export async function cancelTeacherPayoutTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ payout: TeacherPayout }>> {
  const v = parseOrFail(z.object({ payoutId: z.string().min(1), reason: reasonField }), input);
  if (!v.ok) return v;
  const loaded = await loadPayoutForLedger(ctx, v.data.payoutId);
  if (!loaded.ok) return loaded;
  const { payout, teacherName } = loaded.data;
  const res = cancelPayoutData(payout, v.data.reason, ctx.userId);
  if (!res.ok) return fail("VALIDATION_ERROR", res.message);
  const err = await savePayout(res.payout);
  if (err) return err;
  await payoutAudit(ctx, "teacher_payout.cancel", payout, teacherName, { reason: v.data.reason, totalAmount: payout.totalAmount });
  return ok({ payout: res.payout });
}

/** İptal edilmiş + hiç ödeme almamış kaydı kalıcı siler (güvenli silme kapısı). */
export async function deleteTeacherPayoutTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ deleted: true }>> {
  const v = parseOrFail(z.object({ payoutId: z.string().min(1), reason: reasonField, criticalPassword: z.string().max(200) }), input);
  if (!v.ok) return v;
  const loaded = await loadPayoutForLedger(ctx, v.data.payoutId);
  if (!loaded.ok) return loaded;
  const { payout, teacherName } = loaded.data;
  if (payout.status !== "cancelled") return fail("VALIDATION_ERROR", "Yalnız iptal edilmiş hakediş kalıcı silinebilir. Önce kaydı iptal edin.");
  if ((payout.payments ?? []).length > 0) {
    return fail("VALIDATION_ERROR", "Bu kayıtta (ters kaydı yapılmış olsa da) ödeme geçmişi var; muhasebe izi için silinemez, iptal olarak kalır.");
  }
  const denied = await guardCriticalDelete(
    ctx,
    { action: "teacher_payout.delete", entityType: "TeacherPayout", entityId: payout.id, entityName: `${teacherName} ${payoutPeriodLabel(payout)} hakedişi` },
    v.data.criticalPassword
  );
  if (denied) return denied;
  const done = await deleteTeacherPayout(payout.id);
  if (!done) return fail("CONFLICT", "Kayıt silinemedi (durumu değişmiş olabilir). Sayfayı yenileyip tekrar deneyin.");
  await payoutAudit(ctx, "teacher_payout.delete", payout, teacherName, { reason: v.data.reason, totalAmount: payout.totalAmount, cancelReason: payout.cancelReason });
  return ok({ deleted: true });
}

/**
 * Kayıt ile güncel hesap farkını kapatır: ödemesiz kayıt yeniden hesaplanır (kalemler yeniden donar);
 * ödemesi olan kayıtta fark "recalc" düzeltme kaydı olarak eklenir (ödenen tutar yeniden yazılmaz).
 */
export async function settleTeacherPayoutDriftTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ payout: TeacherPayout; mode: "recalculated" | "adjusted" | "none" }>> {
  const v = parseOrFail(z.object({ payoutId: z.string().min(1), reason: reasonField, criticalPassword: z.string().max(200).optional() }), input);
  if (!v.ok) return v;
  const loaded = await loadPayoutForLedger(ctx, v.data.payoutId);
  if (!loaded.ok) return loaded;
  const { payout, data, teacherName } = loaded.data;
  if (payout.status === "cancelled") return fail("VALIDATION_ERROR", "İptal edilmiş hakediş yeniden hesaplanmaz; dönemi yeniden oluşturun.");
  if (payout.status === "pending") {
    const next = recomputePayoutData(data, payout);
    if ("error" in next) return fail("VALIDATION_ERROR", next.error);
    const err = await savePayout(next);
    if (err) return err;
    await payoutAudit(ctx, "teacher_payout.recalculate", payout, teacherName, {
      reason: v.data.reason,
      changes: diffRecordFields({ totalAmount: payout.totalAmount }, { totalAmount: next.totalAmount }),
    });
    return ok({ payout: next, mode: "recalculated" });
  }
  const drift = payoutDrift(data, payout);
  if (Math.abs(drift) < 0.01) return ok({ payout, mode: "none" });
  const gate = await passwordGate(ctx, "teacher_payout.adjust", payout, teacherName, v.data.criticalPassword);
  if (gate) return gate;
  const res = addAdjustmentData(payout, { amount: drift, reason: v.data.reason, kind: "recalc" }, ctx.userId);
  if (!res.ok) return fail("VALIDATION_ERROR", res.message);
  const err = await savePayout(res.payout);
  if (err) return err;
  await payoutAudit(ctx, "teacher_payout.adjust", payout, teacherName, { amount: drift, kind: "recalc", reason: v.data.reason });
  return ok({ payout: res.payout, mode: "adjusted" });
}

/** Ödemesiz kayıtları güncel hesapla yeniler; ödemeli kayıtlarda farkı raporlar. */
async function refreshPendingPayouts(
  ctx: ServiceContext,
  data: AppData,
  payouts: TeacherPayout[],
  reason: string
): Promise<{ recalculated: number; needsAdjustment: { teacherName: string; drift: number }[]; failed: string[] }> {
  const out = { recalculated: 0, needsAdjustment: [] as { teacherName: string; drift: number }[], failed: [] as string[] };
  for (const p of payouts) {
    const teacherName = data.teachers.find((t) => t.id === p.teacherId)?.name ?? "Öğretmen";
    if (p.status === "pending") {
      const next = recomputePayoutData(data, p);
      if ("error" in next || (await savePayout(next))) {
        out.failed.push(teacherName);
        continue;
      }
      out.recalculated += 1;
      await payoutAudit(ctx, "teacher_payout.recalculate", p, teacherName, {
        reason,
        changes: diffRecordFields({ totalAmount: p.totalAmount }, { totalAmount: next.totalAmount }),
      });
    } else if (p.status !== "cancelled") {
      const drift = payoutDrift(data, p);
      if (Math.abs(drift) >= 0.01) out.needsAdjustment.push({ teacherName, drift });
    }
  }
  return out;
}

/** Dersi hakedişten hariç tutar/geri alır; ders, takvim, yoklama ve ödeme kayıtları DEĞİŞMEZ. */
export async function setLessonPayoutExclusionTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ excluded: boolean; recalculated: number; needsAdjustment: { teacherName: string; drift: number }[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", "Hakediş kalemlerini yalnız kurum yöneticisi veya kurum sahibi düzenleyebilir.");
  const earnings = await assertTeacherEarningsAccess(ctx);
  if (!earnings.ok) return earnings;
  const v = parseOrFail(z.object({ lessonId: z.string().min(1), exclude: z.boolean(), reason: reasonField }), input);
  if (!v.ok) return v;
  const before = await readData();
  const lesson = before.lessons.find((l) => l.id === v.data.lessonId);
  const snapLine = before.teacherPayouts.flatMap((p) => (p.lineSnapshot ?? []).map((l) => ({ ...l, teacherId: p.teacherId }))).find((l) => l.lessonId === v.data.lessonId);
  const teacherId = lesson?.teacherId ?? snapLine?.teacherId;
  if (!teacherId) return fail("NOT_FOUND", "Ders bulunamadı. Sayfayı yenileyip tekrar deneyin.");
  if (v.data.exclude) {
    await addTeacherPayoutExclusion({
      id: `tpx_${v.data.lessonId}`,
      lessonId: v.data.lessonId,
      teacherId,
      reason: v.data.reason,
      createdByUserId: ctx.userId,
      createdAt: new Date().toISOString(),
    });
  } else if (!(await removeTeacherPayoutExclusion(v.data.lessonId))) {
    return fail("VALIDATION_ERROR", "Bu ders zaten hakedişe dahil.");
  }
  audit(ctx, v.data.exclude ? "teacher_payout.lesson_exclude" : "teacher_payout.lesson_include", "Lesson", v.data.lessonId, {
    teacherId,
    reason: v.data.reason,
  });
  const data = await readData();
  const day = (lesson?.startAt ?? snapLine?.lessonDate ?? "").slice(0, 10);
  const affected = data.teacherPayouts.filter(
    (p) => p.teacherId === teacherId && payoutPeriodDayKey(p.periodStart) <= day && payoutPeriodDayKey(p.periodEnd) >= day
  );
  const r = await refreshPendingPayouts(ctx, data, affected, `Ders ${v.data.exclude ? "hariç tutuldu" : "tekrar dahil edildi"}: ${v.data.reason}`);
  return ok({ excluded: v.data.exclude, recalculated: r.recalculated, needsAdjustment: r.needsAdjustment });
}

function round2Money(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type PayoutPolicyImpactRow = {
  teacherId: string;
  teacherName: string;
  /** no_record: canlı hesap · recalc: ödemesiz kayıt yeniden hesaplanır · adjust: ödemeli kayıt değişmez, fark düzeltme önerisi */
  state: "no_record" | "recalc" | "adjust";
  before: number;
  after: number;
  diff: number;
  statusLabel: string;
};

function policyImpact(before: AppData, after: AppData, month: string): PayoutPolicyImpactRow[] {
  const first = `${month}-01`;
  const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const last = `${month}-${String(lastDay).padStart(2, "0")}`;
  const rows: PayoutPolicyImpactRow[] = [];
  const active = payoutsOverlappingMonth(before.teacherPayouts, month);
  for (const t of before.teachers) {
    const recs = active.filter((p) => p.teacherId === t.id);
    if (recs.length === 0) {
      const b = computeTeacherEarningsForPeriod(before, t.id, first, last);
      if (b.totalLessons === 0) continue;
      const a = computeTeacherEarningsForPeriod(after, t.id, first, last);
      rows.push({ teacherId: t.id, teacherName: t.name, state: "no_record", before: b.totalAmount, after: a.totalAmount, diff: round2Money(a.totalAmount - b.totalAmount), statusLabel: PAYOUT_STATUS_LABEL.not_created });
      continue;
    }
    for (const p of recs) {
      const net = payoutNetAmount(p);
      if (p.status === "pending") {
        const next = recomputePayoutData(after, p);
        const afterNet = "error" in next ? net : payoutNetAmount(next);
        rows.push({ teacherId: t.id, teacherName: t.name, state: "recalc", before: net, after: afterNet, diff: round2Money(afterNet - net), statusLabel: PAYOUT_STATUS_LABEL.pending });
      } else {
        const drift = payoutDrift(after, p);
        rows.push({ teacherId: t.id, teacherName: t.name, state: "adjust", before: net, after: round2Money(net + drift), diff: drift, statusLabel: PAYOUT_STATUS_LABEL[p.status] });
      }
    }
  }
  return rows;
}

/**
 * 2026-09-30 — ayın politikası: önce `preview:true` ile etki tablosu, sonra uygula.
 * Kilit yok: ödemesiz kayıtlar yeniden hesaplanır; ödemeli kayıtlar değişmez (fark önerisi).
 */
export async function setTeacherPayoutPolicyTool(
  ctx: ServiceContext,
  input: unknown
): Promise<
  ServiceResult<{
    month: string;
    policy: string;
    changed: boolean;
    preview: boolean;
    impact: PayoutPolicyImpactRow[];
    recalculated?: number;
    needsAdjustment?: { teacherName: string; drift: number }[];
    failed?: string[];
  }>
> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", "Hakediş politikasını yalnız kurum yöneticisi veya kurum sahibi değiştirebilir.");
  const earnings = await assertTeacherEarningsAccess(ctx);
  if (!earnings.ok) return earnings;
  const v = parseOrFail(
    z.object({
      month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Dönem ayı geçersiz."),
      policy: z.enum(["per_teacher_rule", "fixed_duration"]),
      rate30: z.number().optional(),
      rate40: z.number().optional(),
      rate50: z.number().optional(),
      preview: z.boolean().optional(),
    }),
    input
  );
  if (!v.ok) return v;
  const { preview, ...policyInput } = v.data;
  const before = await readData();
  const simulated = setPayoutPolicyForMonthData(before, policyInput, ctx.userId);
  if (!simulated.ok) return fail("VALIDATION_ERROR", simulated.message);
  const impact = policyImpact(before, simulated.data, v.data.month);
  if (preview) return ok({ month: v.data.month, policy: v.data.policy, changed: simulated.changed, preview: true, impact });
  try {
    const result = await setTeacherPayoutPolicy(policyInput, ctx.userId);
    if (!result.ok) return fail("VALIDATION_ERROR", result.message);
    if (result.changed) {
      audit(ctx, "teacher_payout.policy", "TeacherPayoutPolicyPeriod", result.record.id, {
        month: v.data.month,
        before: result.previous,
        after: { policy: result.record.policy, rate30: result.record.rate30, rate40: result.record.rate40, rate50: result.record.rate50 },
      });
    }
    const data = await readData();
    const r = await refreshPendingPayouts(ctx, data, payoutsOverlappingMonth(data.teacherPayouts, v.data.month), `${v.data.month} hakediş politikası değişti`);
    return ok({ month: v.data.month, policy: result.record.policy, changed: result.changed, preview: false, impact, ...r });
  } catch (e) {
    logger.error("setTeacherPayoutPolicyTool failed", e);
    return fail("INTERNAL_ERROR", "Hakediş politikası kaydedilemedi; mevcut politika değişmedi. Sayfayı yenileyip tekrar deneyin.");
  }
}

/** Ücret kuralının kullanımı: kayıtlı hakedişler (donmuş kalem) + kayda geçmemiş işlenmiş dersler. */
function feeRuleUsage(data: AppData, rule: TeacherFeeRule): { recordedPayouts: number; openLessons: number } {
  const active = data.teacherPayouts.filter((p) => p.status !== "cancelled" && p.teacherId === rule.teacherId);
  const recordedPayouts = active.filter((p) => payoutBaseEarnings(data, p).lines.some((l) => l.feeRuleId === rule.id)).length;
  const inRecord = (day: string) => active.some((p) => payoutPeriodDayKey(p.periodStart) <= day && payoutPeriodDayKey(p.periodEnd) >= day);
  const openLessons = data.lessons.filter(
    (l) =>
      l.teacherId === rule.teacherId &&
      isLessonProcessedForPayout(l) &&
      !inRecord(l.startAt.slice(0, 10)) &&
      resolveFeeRule(data.teacherFeeRules, { teacherId: l.teacherId, branchId: l.branchId, instrument: l.instrument, lessonDateIso: l.startAt })?.id === rule.id
  ).length;
  return { recordedPayouts, openLessons };
}

/**
 * Ücret kuralını kaldırma: hiç kullanılmadıysa kalıcı silinir (kritik şifre); kullanıldıysa
 * `fromDate`'ten itibaren devre dışı kalır (öncesi ve kayıtlı hakedişler aynen). Kayıtlı hakediş,
 * kalemlerinde hangi kuralla hesaplandığını saklar.
 */
export async function removeFeeRuleTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ mode: "deleted" | "deactivated"; effectiveTo?: string; affectedOpenLessons: number }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const earnings = await assertTeacherEarningsAccess(ctx);
  if (!earnings.ok) return earnings;
  const v = parseOrFail(
    z.object({
      ruleId: z.string().min(1),
      mode: z.enum(["delete", "deactivate"]),
      fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Devre dışı tarihi geçersiz.").optional(),
      reason: reasonField,
      criticalPassword: z.string().max(200).optional(),
    }),
    input
  );
  if (!v.ok) return v;
  const data = await readData();
  const rule = data.teacherFeeRules.find((r) => r.id === v.data.ruleId);
  if (!rule) return fail("NOT_FOUND", "Ücret kuralı bulunamadı. Sayfayı yenileyip tekrar deneyin.");
  const usage = feeRuleUsage(data, rule);
  const teacherName = data.teachers.find((t) => t.id === rule.teacherId)?.name ?? "Öğretmen";
  if (v.data.mode === "delete") {
    if (usage.recordedPayouts > 0 || usage.openLessons > 0) {
      return fail(
        "VALIDATION_ERROR",
        `Bu kural kullanılıyor (${usage.recordedPayouts} kayıtlı hakediş, ${usage.openLessons} kayda geçmemiş ders); geçmiş hesabın izi kaybolmasın diye silinemez. Bunun yerine bir tarihten itibaren devre dışı bırakın.`
      );
    }
    const denied = await guardCriticalDelete(
      ctx,
      { action: "teacher_fee.delete", entityType: "TeacherFeeRule", entityId: rule.id, entityName: `${teacherName} ücret kuralı` },
      v.data.criticalPassword ?? ""
    );
    if (denied) return denied;
    if (!(await deleteTeacherFeeRule(rule.id))) return fail("CONFLICT", "Kural silinemedi; sayfayı yenileyip tekrar deneyin.");
    audit(ctx, "teacher_fee.delete", "TeacherFeeRule", rule.id, { teacherId: rule.teacherId, perMinuteRate: rule.perMinuteRate, reason: v.data.reason });
    return ok({ mode: "deleted", affectedOpenLessons: 0 });
  }
  const from = v.data.fromDate ?? new Date().toISOString().slice(0, 10);
  const effectiveTo = new Date(Date.parse(`${from}T12:00:00.000Z`) - 86_400_000).toISOString().slice(0, 10);
  if (effectiveTo < rule.effectiveFrom.slice(0, 10)) {
    return fail(
      "VALIDATION_ERROR",
      `Devre dışı tarihi, kuralın başlangıcından (${rule.effectiveFrom.slice(0, 10)}) sonra olmalı. Kural hiç kullanılmadıysa “Sil” seçeneğini kullanın.`
    );
  }
  const affectedOpenLessons = data.lessons.filter(
    (l) =>
      l.teacherId === rule.teacherId &&
      isLessonProcessedForPayout(l) &&
      l.startAt.slice(0, 10) >= from &&
      resolveFeeRule(data.teacherFeeRules, { teacherId: l.teacherId, branchId: l.branchId, instrument: l.instrument, lessonDateIso: l.startAt })?.id === rule.id
  ).length;
  const res = await updateTeacherFeeRule(rule.id, {
    effectiveTo,
    deactivatedAt: new Date().toISOString(),
    deactivatedByUserId: ctx.userId,
    deactivationReason: v.data.reason,
  });
  if (!res.ok) return fail(mapFeeRuleErrorCode(res.code), res.message);
  audit(ctx, "teacher_fee.deactivate", "TeacherFeeRule", rule.id, { teacherId: rule.teacherId, from, reason: v.data.reason, affectedOpenLessons });
  return ok({ mode: "deactivated", effectiveTo, affectedOpenLessons });
}

/**
 * Kurumun kesirli ders süresi → ödenecek dakika politikasını değiştirir
 * (EPIC 3). Yalnızca ileri yönlü etkilidir: zaten oluşturulmuş `TeacherPayout`
 * snapshot'larını asla yeniden hesaplamaz.
 */
export async function updateFeeRoundingModeTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ feeRoundingMode: FeeRoundingMode }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(updateFeeRoundingModeSchema, input);
  if (!v.ok) return v;

  try {
    const data = await updateFeeRoundingMode(v.data.feeRoundingMode);
    audit(ctx, "school.fee_rounding_mode.update", "School", ctx.tenantId, {
      feeRoundingMode: v.data.feeRoundingMode,
    });
    return ok({ feeRoundingMode: data.settings.feeRoundingMode });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "updateFeeRoundingMode failed");
  }
}

/**
 * Kurum sahibi — öğretmen/personel performans ağırlıkları. Yalnız SUPER_ADMIN.
 * Toplam 100 zorunlu; 0 metriği pasife alır.
 */
export async function updatePerformanceWeightsTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ performanceWeights: PerformanceWeightsConfig }>> {
  const auth = requireRole(ctx, ["SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", "Performans ağırlıklarını yalnız kurum sahibi değiştirebilir.");

  const v = parseOrFail(
    z.object({
      teacher: z.record(z.string(), z.number()),
      staff: z.record(z.string(), z.number()),
    }),
    input
  );
  if (!v.ok) return v;

  const teacher = validateWeightMap("teacher", v.data.teacher);
  if (!teacher.ok) return fail("VALIDATION_ERROR", `Öğretmen metrikleri: ${teacher.message}`);
  const staff = validateWeightMap("staff", v.data.staff);
  if (!staff.ok) return fail("VALIDATION_ERROR", `Personel metrikleri: ${staff.message}`);

  const performanceWeights = { teacher: teacher.weights, staff: staff.weights };
  try {
    await updatePerformanceWeights(performanceWeights);
    audit(ctx, "school.performance_weights.update", "School", ctx.tenantId, performanceWeights);
    return ok({ performanceWeights });
  } catch (e) {
    logger.error("updatePerformanceWeightsTool failed", e);
    return fail("INTERNAL_ERROR", "Performans ağırlıkları kaydedilemedi. Lütfen tekrar deneyin.");
  }
}

const updateSchoolLogoSchema = z.object({
  fileMimeType: z.string().min(1),
  fileData: z.string().min(1),
});

const SCHOOL_LOGO_ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
// Küçük, tek bir başlık logosu (institution-logo.ts'te 40-56px'e sabitlenmiş
// render) — imzalı belge/ekli dosya limitleriyle (2MB) AYNI GEREKÇE yok,
// çok daha küçük bir tavan yeterli.
const SCHOOL_LOGO_MAX_BYTES = 500_000;

/**
 * Kurum logosu — `institution-logo.ts` (sanitizeLogoUrl/toLogoDataUrl) ve
 * `store.ts` `updateSchoolLogoUrl` (json/db/memory parite) ZATEN mevcuttu;
 * yalnızca bu ince RBAC/doğrulama sarmalayıcısı eksikti (contract-logo-
 * snapshot.test.ts ve actions.ts actionUpdateSchoolLogo bunu ÖNCEDEN
 * varsayıyordu). data-URI olarak saklanır — ayrı bir depolama sağlayıcısı
 * YOK, mevcut base64-in-settings deseniyle AYNI.
 */
export async function updateSchoolLogoTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ logoUrl: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(updateSchoolLogoSchema, input);
  if (!v.ok) return v;

  if (!SCHOOL_LOGO_ALLOWED_MIME.has(v.data.fileMimeType)) {
    return fail("VALIDATION_ERROR", "Desteklenmeyen logo türü — yalnız PNG, JPEG veya WEBP yükleyin.");
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(v.data.fileData, "base64");
  } catch {
    return fail("VALIDATION_ERROR", "Logo dosyası okunamadı.");
  }
  if (buffer.length <= 0) return fail("VALIDATION_ERROR", "Boş dosya yüklenemez.");
  if (buffer.length > SCHOOL_LOGO_MAX_BYTES) {
    return fail("VALIDATION_ERROR", "Logo dosyası çok büyük (maks. 500KB) — daha küçük bir görsel yükleyin.");
  }

  const { toLogoDataUrl, sanitizeLogoUrl } = await import("../institution-logo");
  const dataUrl = toLogoDataUrl(v.data.fileMimeType, v.data.fileData);
  if (!sanitizeLogoUrl(dataUrl)) {
    return fail("VALIDATION_ERROR", "Logo verisi geçersiz.");
  }

  try {
    const data = await updateSchoolLogoUrl(dataUrl);
    audit(ctx, "school.logo.update", "School", ctx.tenantId, {
      byteLength: buffer.length,
      mimeType: v.data.fileMimeType,
    });
    return ok({ logoUrl: data.settings.logoUrl });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "updateSchoolLogo failed");
  }
}

/**
 * P0 (2026-09-05) — KÖK NEDEN: kurum logosu HARİCİ bir `https://…` adres
 * olarak kayıtlıysa uygulamanın Content-Security-Policy'si
 * (`img-src 'self' data: blob:`, bkz. next.config.ts) o görseli SESSİZCE
 * ENGELLER — sözleşme ekranında/yazdırmada/PDF'te logo hiç görünmez, konsolda
 * yalnız bir "csp" hatası kalır. CSP'yi keyfi dış hostlara açmak yerine logo
 * KURUM TARAFINDAN İÇERİ ALINIR: yönetici bir kez bu işlemi çalıştırır,
 * görsel sunucu tarafında indirilip yükleme akışıyla AYNI `data:` URI olarak
 * saklanır ve bundan sonra her yerde (baskı/PDF/e-posta) sorunsuz görünür.
 *
 * SSRF: istemciden serbest URL KABUL EDİLMEZ (yalnız zaten kayıtlı kurum
 * logosu adresi) — ama bu TEK BAŞINA yeterli DEĞİLDİR: dış istek
 * `safeOutboundFetch` üzerinden gider; yalnız https, DNS'ten dönen tüm
 * adresler özel/loopback/link-local bloklarına karşı doğrulanır ve
 * yönlendirmeler her hop yeniden doğrulanarak elle izlenir. Yanıt boyutu ve
 * içerik türü yükleme akışıyla AYNI sınırlara tabidir.
 */
export async function importSchoolLogoFromCurrentUrlTool(
  ctx: ServiceContext
): Promise<ServiceResult<{ logoUrl: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const data = await readData();
  const current = data.settings.logoUrl?.trim() ?? "";
  if (!current) return fail("VALIDATION_ERROR", "Kurum logosu tanımlı değil — önce bir logo yükleyin.");
  if (current.startsWith("data:")) {
    return fail("VALIDATION_ERROR", "Logo zaten uygulama içinde saklanıyor; içeri aktarmaya gerek yok.");
  }
  if (!/^https:\/\//i.test(current)) {
    return fail("VALIDATION_ERROR", "Yalnız https ile başlayan bir logo adresi içeri aktarılabilir.");
  }

  // SSRF: adres KAYITLI olsa bile doğrudan `fetch` GÜVENLİ DEĞİLDİR —
  // `redirect: "follow"` ile meşru bir dış host, isteği 302 ile
  // `169.254.169.254` gibi bir iç adrese taşıyabilir ve indirilen bayt
  // burada SAKLANIP EKRANDA GÖSTERİLDİĞİ için içerik doğrudan sızardı.
  // `safeOutboundFetch` yalnız https'e izin verir, DNS'ten dönen TÜM
  // adresleri özel/loopback/link-local bloklarına karşı doğrular ve
  // yönlendirmeleri HER HOP yeniden doğrulayarak elle izler.
  const { safeOutboundFetch, readBodyWithLimit } = await import("../net/safe-outbound-fetch");
  const fetched = await safeOutboundFetch(current, { timeoutMs: 10_000 });
  if (!fetched.ok) return fail("VALIDATION_ERROR", fetched.reason);
  const response = fetched.response;
  if (!response.ok) {
    return fail("VALIDATION_ERROR", `Logo indirilemedi (HTTP ${response.status}).`);
  }
  const mimeType = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!SCHOOL_LOGO_ALLOWED_MIME.has(mimeType)) {
    return fail("VALIDATION_ERROR", "Adresteki dosya desteklenen bir görsel değil — yalnız PNG, JPEG veya WEBP.");
  }
  const bytes = await readBodyWithLimit(response, SCHOOL_LOGO_MAX_BYTES);
  if (!bytes) {
    return fail("VALIDATION_ERROR", "Logo dosyası çok büyük (maks. 500KB) — daha küçük bir görsel yükleyin.");
  }
  if (bytes.length <= 0) return fail("VALIDATION_ERROR", "Logo dosyası boş.");

  const { toLogoDataUrl, sanitizeLogoUrl } = await import("../institution-logo");
  const dataUrl = toLogoDataUrl(mimeType, bytes.toString("base64"));
  if (!sanitizeLogoUrl(dataUrl)) return fail("VALIDATION_ERROR", "Logo verisi geçersiz.");

  try {
    const next = await updateSchoolLogoUrl(dataUrl);
    audit(ctx, "school.logo.import_from_url", "School", ctx.tenantId, {
      sourceUrl: current,
      byteLength: bytes.length,
      mimeType,
    });
    return ok({ logoUrl: next.settings.logoUrl });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "importSchoolLogoFromCurrentUrl failed");
  }
}

/**
 * Telafi Merkezi politika penceresi (kaç gün içinde telafi hakkı kullanılmalı).
 * Yalnızca ileri yönlü etkilidir — zaten oluşturulmuş `MakeupRequest.expiresAt`
 * değerlerini yeniden hesaplamaz (bkz. buildMakeupRequest, store-json.ts).
 */
export async function updateMakeupWindowDaysTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ makeupWindowDays: number }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(updateMakeupWindowDaysSchema, input);
  if (!v.ok) return v;

  try {
    const data = await updateMakeupWindowDays(v.data.makeupWindowDays);
    audit(ctx, "school.makeup_window_days.update", "School", ctx.tenantId, {
      makeupWindowDays: v.data.makeupWindowDays,
    });
    return ok({ makeupWindowDays: data.settings.makeupWindowDays });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "updateMakeupWindowDays failed");
  }
}

export async function updateMonthlyMakeupAllowanceTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ monthlyMakeupAllowance: number }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(updateMonthlyMakeupAllowanceSchema, input);
  if (!v.ok) return v;

  try {
    const data = await updateMonthlyMakeupAllowance(v.data.monthlyMakeupAllowance);
    audit(ctx, "school.monthly_makeup_allowance.update", "School", ctx.tenantId, {
      monthlyMakeupAllowance: v.data.monthlyMakeupAllowance,
    });
    return ok({
      monthlyMakeupAllowance: data.settings.monthlyMakeupAllowance ?? v.data.monthlyMakeupAllowance,
    });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "updateMonthlyMakeupAllowance failed");
  }
}

/**
 * Paket 6 — Çalışma Takvimi: dönem bazlı haftalık kapalı gün kuralı
 * (ör. Yaz'da Pazartesi açık/hafta sonu kapalı, Güz'de tersi). Yalnızca
 * BUNDAN SONRAKİ planlama/yoklama kontrollerini etkiler — geçmiş dersler
 * (zaten oluşturulmuş) geriye dönük bozulmaz; `resolveDayStatus` her
 * çağrıldığında güncel ayarı okur, hiçbir Lesson satırı bu değişiklikle
 * yeniden yazılmaz.
 */
export async function updateTermWeeklyClosedDaysTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ guz: number[]; yaz: number[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(updateTermWeeklyClosedDaysSchema, input);
  if (!v.ok) return v;

  try {
    const data = await updateTermWeeklyClosedDays(v.data);
    audit(ctx, "school.term_weekly_closed_days.update", "School", ctx.tenantId, v.data);
    return ok(data.settings.termWeeklyClosedDays ?? v.data);
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "updateTermWeeklyClosedDays failed");
  }
}

export async function updateAcademicTermDatesTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ dates: import("../academic-term-dates").AcademicTermDates }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const raw = (input ?? {}) as {
    guzStart?: string;
    guzEnd?: string;
    yazStart?: string;
    yazEnd?: string;
  };
  const validated = validateAcademicTermDates(raw);
  if (!validated.ok) {
    return fail("VALIDATION_ERROR", validated.message, { fieldErrors: validated.fieldErrors });
  }

  try {
    await updateAcademicTermDates(validated.dates);
    audit(ctx, "school.academic_term_dates.update", "School", ctx.tenantId, validated.dates);
    return ok({ dates: validated.dates });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "updateAcademicTermDates failed");
  }
}

/**
 * EPIC 1 (IMPLEMENTATION_PLAN.md) — gecikmiş ödemeler için GERÇEK tenant
 * taraması: `findAvailableTeachers`'ın `{}` girdili tarama deseniyle aynı
 * (bkz. checkMakeupSlaTool). Sabit demo ID listesi TARAMAZ. Her gecikmiş
 * ödeme için: veli communicationOptOut ise atlar; sıklık limiti
 * (collectionsSettings.frequencyLimitDays, varsayılan 3 gün) henüz dolmadıysa
 * atlar; aksi halde upsertFollowUpCase ile taslak/onaylı vaka açar/günceller
 * ve veliye uygulama içi bildirim oluşturur. autoSendEnabled=true olsa bile
 * wa.me linkine tıklamak hâlâ bir insan eylemidir — bu ayar yalnızca
 * taslağın "approved" durumuna otomatik geçmesini sağlar, "sent" durumunu
 * ASLA otomatik üretmez (gerçek gönderim/okundu bilgisi olmadan uydurulmaz).
 */
export async function scanOverduePaymentsTool(
  ctx: ServiceContext
): Promise<ServiceResult<{ scanned: number; casesUpserted: number; notificationsCreated: number }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "AI_AGENT"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  try {
    const data = await readData();
    const settings = data.settings.collectionsSettings ?? DEFAULT_COLLECTIONS_SETTINGS;
    const existingCases = await listFollowUpCases(ctx.tenantId);
    const now = new Date();
    const { listTerminalContractIds } = await import("../contracts");
    const { isLiveObligation } = await import("../payment-profile");
    const terminalContractIds = await listTerminalContractIds(ctx.tenantId);

    let scanned = 0;
    let casesUpserted = 0;
    let notificationsCreated = 0;

    for (const payment of data.payments) {
      if (payment.status !== "overdue") continue;
      // UAT 2026-09-25 — iptal/yenilenmiş sözleşmenin tahsil edilmemiş taksiti için hatırlatma üretilmez.
      if (!isLiveObligation(payment, terminalContractIds)) continue;
      scanned++;

      const student = data.students.find((s) => s.id === payment.studentId);
      if (!student || student.communicationOptOut) continue;

      const openCase = existingCases.find(
        (c) =>
          c.paymentId === payment.id &&
          c.status !== "paid" &&
          c.status !== "lost" &&
          c.status !== "dismissed"
      );
      const lastContactAt = openCase?.sentAt ?? openCase?.updatedAt;
      if (lastContactAt) {
        const daysSinceContact = differenceInCalendarDays(now, parseISO(lastContactAt));
        if (daysSinceContact < settings.frequencyLimitDays) continue;
      }

      const remaining = Math.max(Number(payment.amount) - Number(payment.paidAmount), 0);
      const messageDraft = `Merhaba, ${student.name} için ${formatMoney(remaining)} tutarında gecikmiş ödeme kaydı bulunmaktadır. Size uygun ödeme planı için bizimle iletişime geçebilirsiniz.`;

      const nextCase = await upsertFollowUpCase({
        id: openCase?.id,
        tenantId: ctx.tenantId,
        paymentId: payment.id,
        studentId: student.id,
        status: settings.autoSendEnabled ? "approved" : "draft",
        messageDraft,
        attributedAmount: remaining,
        approvedBy: settings.autoSendEnabled ? ctx.userId : openCase?.approvedBy,
        approvedAt: settings.autoSendEnabled ? now.toISOString() : openCase?.approvedAt,
      });
      casesUpserted++;

      await createNotification({
        tenantId: ctx.tenantId,
        targetStudentId: student.id,
        kind: "payment_overdue",
        title: "Gecikmiş ödeme hatırlatması",
        body: `${payment.description} için ${formatMoney(remaining)} tutarında ödemeniz gecikmiştir.`,
      });
      notificationsCreated++;

      // Aynı frekans kapısından geçen tarama → yöneticilere de (tercihe tabi, 24s dedupe).
      try {
        const { notifyAdmins } = await import("../manager-notifications");
        await notifyAdmins(
          ctx.tenantId,
          "payment_overdue",
          {
            title: "Vadesi geçmiş ödeme",
            body: `${student.name}: ${payment.description} — ${formatMoney(remaining)} gecikmiş. Detay: /panel/odemeler`,
          },
          { excludeUserId: ctx.userId, dedupeKey: payment.id }
        );
      } catch {
        // best-effort
      }

      audit(ctx, "collections.reminder_scan", "PaymentFollowUpCase", nextCase.id, {
        paymentId: payment.id,
        studentId: student.id,
        autoSendEnabled: settings.autoSendEnabled,
      });
    }

    return ok({ scanned, casesUpserted, notificationsCreated });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "scanOverduePayments failed");
  }
}

/** EPIC 1 — veli kendi çocuğu için, admin/AI_AGENT herkes için değiştirebilir. */
export async function updateCommunicationPreferenceTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ studentId: string; communicationOptOut: boolean }>> {
  const v = parseOrFail(updateCommunicationPreferenceSchema, input);
  if (!v.ok) return v;

  const isOwnChild = ctx.role === "STUDENT" && (await canAccessStudent(ctx, v.data.studentId));
  if (!isOwnChild) {
    const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "AI_AGENT"]);
    if (!auth.ok) return fail("FORBIDDEN", auth.message);
  }

  try {
    await updateStudentProfile(v.data.studentId, {
      communicationOptOut: v.data.communicationOptOut,
    });
    audit(ctx, "student.communication_preference_update", "Student", v.data.studentId, {
      communicationOptOut: v.data.communicationOptOut,
    });
    return ok(v.data);
  } catch (e) {
    return fail(
      "INTERNAL_ERROR",
      e instanceof Error ? e.message : "updateCommunicationPreference failed"
    );
  }
}

export async function updateCollectionsSettingsTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ collectionsSettings: CollectionsSettings }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(updateCollectionsSettingsSchema, input);
  if (!v.ok) return v;

  try {
    await updateCollectionsSettings(v.data);
    audit(ctx, "school.collections_settings_update", "School", ctx.tenantId, {
      frequencyLimitDays: v.data.frequencyLimitDays,
      autoSendEnabled: v.data.autoSendEnabled,
      vakifbankIbanSet: !!v.data.vakifbankIban,
      halkbankIbanSet: !!v.data.halkbankIban,
    });
    return ok({ collectionsSettings: v.data });
  } catch (e) {
    return fail(
      "INTERNAL_ERROR",
      e instanceof Error ? e.message : "updateCollectionsSettings failed"
    );
  }
}

/** Yalnızca çağıranın kendi bildirimleri (userId veya kendi studentId'si) — cross-user sızıntı yok. */
export async function listNotificationsTool(
  ctx: ServiceContext,
  input?: unknown
): Promise<ServiceResult<{ notifications: Notification[]; nextCursor: string | null; unreadCount: number }>> {
  const v = parseOrFail(listNotificationsSchema, input ?? {});
  if (!v.ok) return v;

  try {
    // Günlük sözleşme bitiş kontrolü — zamanlayıcı olmayan ortamlarda (test) da çalışır; günde bir kez.
    if (ctx.role === "SCHOOL_ADMIN" || ctx.role === "SUPER_ADMIN") {
      const { ensureStudentContractExpiryCheckedToday } = await import("../student-contract-expiry");
      await ensureStudentContractExpiryCheckedToday(ctx.tenantId);
    }
    const page = await listNotificationsPageForUser(
      { tenantId: ctx.tenantId, userId: ctx.userId, studentId: ctx.studentId },
      { cursor: v.data.cursor, limit: v.data.limit }
    );
    return ok(page);
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "listNotifications failed");
  }
}

export async function markNotificationReadTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ notificationId: string }>> {
  const v = parseOrFail(markNotificationReadSchema, input);
  if (!v.ok) return v;

  try {
    const updated = await markNotificationRead(
      { tenantId: ctx.tenantId, userId: ctx.userId, studentId: ctx.studentId },
      v.data.notificationId
    );
    if (!updated) return fail("NOT_FOUND", "Bildirim bulunamadı");
    return ok({ notificationId: v.data.notificationId });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "markNotificationRead failed");
  }
}

/** Yönetim ekranı: durum fark etmeksizin (draft/published/archived) tüm duyurular. */
export async function listAllAnnouncementsTool(
  ctx: ServiceContext
): Promise<ServiceResult<{ announcements: Announcement[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  try {
    const announcements = await listAnnouncements(ctx.tenantId);
    return ok({ announcements });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "listAllAnnouncements failed");
  }
}

/** Şahsa özel duyuru gönderirken seçilecek gerçek kullanıcı listesi: aktif öğretmenler + portal erişimi olan veli/öğrenciler. */
export async function listAnnouncementRecipientsTool(
  ctx: ServiceContext
): Promise<ServiceResult<{ recipients: { userId: string; name: string; role: string; subLabel?: string }[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  try {
    const data = await readReferenceData();

    const teacherEntries = await Promise.all(
      data.teachers
        .filter((t) => t.active)
        .map(async (t) => {
          const userId = await getUserIdByTeacherId(ctx.tenantId, t.id);
          return userId ? { userId, name: t.name, role: "Öğretmen" } : null;
        })
    );

    const { listActiveAccessForTenant } = await import("../student-portal-access");
    const access = await listActiveAccessForTenant(ctx.tenantId);
    const studentById = new Map(data.students.map((s) => [s.id, s]));
    const studentEntries = access
      .map((a) => {
        const student = studentById.get(a.studentId);
        if (!student) return null;
        return a.accessType === "SELF"
          ? { userId: a.userId, name: student.name, role: "Öğrenci" }
          : { userId: a.userId, name: student.parentName || `${student.name} velisi`, role: "Veli", subLabel: student.name };
      })
      .filter((e): e is NonNullable<typeof e> => e != null);

    const seen = new Set<string>();
    const recipients = [...teacherEntries, ...studentEntries]
      .filter((e): e is NonNullable<typeof e> => e != null)
      .filter((r) => (seen.has(r.userId) ? false : (seen.add(r.userId), true)))
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));

    return ok({ recipients });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "listAnnouncementRecipients failed");
  }
}

/**
 * Faz 4 — PUSH: bir duyuru YAYINDA (published + görünürlük penceresi
 * içinde) hale geldiğinde hedef kitleyi TEK SEFERDE çözer, her benzersiz
 * kullanıcıya bir `Notification` materyalize eder (`resolveAudienceRecipients`
 * zaten userId'ye göre tekilleştiriyor) ve sonucu `recipientCount` olarak
 * kalıcılaştırır. `publishAt` gelecekteyse (henüz `isVisibleNow`=false)
 * BİLİNÇLİ OLARAK atlanır — zamanlanmış duyuruları canlıya alacak bir
 * scheduler bu sprintin kapsamında yok (mevcut PULL modelinde de aynı
 * kısıt zaten vardı); alıcılar içeriği normal pull akışıyla keşfeder.
 * Best-effort: hiçbir hata createAnnouncementTool/updateAnnouncementStatusTool
 * çağrısını bozmaz.
 */
async function publishAnnouncementToRecipients(tenantId: string, announcement: Announcement): Promise<void> {
  if (!isVisibleNow(announcement)) return;
  try {
    const data = await readReferenceData();
    const candidates = await buildAnnouncementRecipientCandidates(tenantId, data.teachers, data.students);
    const recipients = resolveAudienceRecipients(announcement, candidates, {
      students: data.students,
      teachers: data.teachers,
    });
    const { notifyUserIfEnabled } = await import("../notification-dispatch");
    for (const r of recipients) {
      try {
        await notifyUserIfEnabled({
          tenantId,
          userId: r.userId,
          category: "announcement_published",
          title: "Yeni duyuru",
          body: announcement.title,
          dedupeKey: `${announcement.id}:announcement_published`,
        });
      } catch {
        // best-effort — tek kullanıcı hatası diğerlerini bozmasın
      }
    }
    await setAnnouncementRecipientCount(tenantId, announcement.id, recipients.length);
  } catch {
    // best-effort — duyuru oluşturma/durum güncelleme akışını bloklamaz
  }
}

export async function createAnnouncementTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ announcementId: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "BRANCH_MANAGER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const moduleGate = await assertFeatureEnabled(ctx.tenantId, "announcements");
  if (!moduleGate.ok) return moduleGate;

  const v = parseOrFail(createAnnouncementSchema, input);
  if (!v.ok) return v;

  // NeviiOS — şube müdürü yalnız kendi şubesine (tek şube hedefi) duyuru yapar.
  if (ctx.role === "BRANCH_MANAGER") {
    const ref = v.data.audienceRef as { branchId?: string } | undefined;
    if (v.data.audienceType !== "branch" || !ref?.branchId || (v.data.rules?.length ?? 0) > 0) {
      return fail("FORBIDDEN", "Şube müdürü yalnız atanmış şubesine duyuru gönderebilir.");
    }
    const gate = await assertBranchOperation(ctx, "announcements", "create", ref.branchId);
    if (!gate.ok) return gate;
  }

  const uploadedKeys: string[] = [];
  try {
    const attachmentsIn = v.data.attachments ?? [];
    if (attachmentsIn.length > 3) {
      return fail("VALIDATION_ERROR", "En fazla 3 dosya eklenebilir.");
    }
    const [{ uid: makeId }, fileValidation, storage] = await Promise.all([
      import("../utils").then((u) => ({ uid: u.uid })),
      import("../file-upload-validation"),
      import("../storage"),
    ]);
    const builtAttachments: Array<{
      id: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      storageKey: string;
      uploadedAt: string;
    }> = [];

    const decoded: Array<{ fileName: string; mimeType: string; buffer: Buffer }> = [];
    for (const file of attachmentsIn) {
      if (!storage.isAllowedAnnouncementMime(file.mimeType)) {
        return fail(
          "VALIDATION_ERROR",
          `Desteklenmeyen dosya türü: ${file.mimeType}. PDF, JPG, PNG, DOC/DOCX, XLS/XLSX yükleyin.`
        );
      }
      const size = fileValidation.base64ByteSize(file.fileData);
      if (size <= 0 || size > storage.ANNOUNCEMENT_MAX_BYTES) {
        return fail("VALIDATION_ERROR", `Dosya boyutu geçersiz veya 2 MB üstü: ${file.fileName}`);
      }

      const raw = file.fileData.includes(",")
        ? file.fileData.slice(file.fileData.indexOf(",") + 1)
        : file.fileData;
      let buffer: Buffer;
      try {
        buffer = Buffer.from(raw, "base64");
      } catch {
        return fail("VALIDATION_ERROR", `Dosya içeriği okunamadı: ${file.fileName}`);
      }
      try {
        storage.assertAnnouncementFileBuffer(buffer, file.mimeType);
      } catch (guardErr) {
        return fail("VALIDATION_ERROR", guardErr instanceof Error ? guardErr.message : "Dosya geçersiz");
      }
      decoded.push({ fileName: file.fileName, mimeType: file.mimeType, buffer });
    }

    for (const file of decoded) {
      const uploadRes = await storage.uploadAnnouncementAttachment(
        ctx.tenantId,
        file.buffer,
        file.fileName,
        file.mimeType
      );
      uploadedKeys.push(uploadRes.storageKey);

      builtAttachments.push({
        id: makeId("annatt"),
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeBytes: uploadRes.sizeBytes,
        storageKey: uploadRes.storageKey,
        uploadedAt: new Date().toISOString(),
      });
    }

    const announcement = await createAnnouncement({
      tenantId: ctx.tenantId,
      title: v.data.title,
      body: v.data.body,
      attachmentUrl: v.data.attachmentUrl,
      attachments: builtAttachments.length ? builtAttachments : undefined,
      audienceType: v.data.audienceType,
      audienceRef: v.data.audienceRef as AnnouncementAudienceRef | undefined,
      rules: v.data.rules as AudienceRule[] | undefined,
      status: v.data.status,
      pinned: v.data.pinned,
      publishAt: v.data.publishAt,
      expireAt: v.data.expireAt,
      createdBy: ctx.userId,
    });
    audit(ctx, "announcement.create", "Announcement", announcement.id, {
      audienceType: v.data.audienceType,
      status: announcement.status,
      attachmentCount: builtAttachments.length,
    });
    if (announcement.status === "published") {
      await publishAnnouncementToRecipients(ctx.tenantId, announcement);
    }
    return ok({ announcementId: announcement.id });
  } catch (e) {
    if (uploadedKeys.length) {
      try {
        const { deleteAnnouncementAttachment } = await import("../storage");
        await Promise.all(uploadedKeys.map((k) => deleteAnnouncementAttachment(k)));
      } catch {
        // ignore cleanup errors
      }
    }
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "createAnnouncement failed");
  }
}

export async function getAnnouncementAttachmentFileTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ fileName: string; fileMimeType: string; fileData: string }>> {
  const v = parseOrFail(
    z.object({ announcementId: z.string().min(1), attachmentId: z.string().min(1) }),
    input
  );
  if (!v.ok) return v;

  try {
    const { getStoredAnnouncement } = await import("../announcements");
    const stored = await getStoredAnnouncement(ctx.tenantId, v.data.announcementId);
    if (!stored) return fail("NOT_FOUND", "Duyuru bulunamadı");

    const isAdmin = ctx.role === "SCHOOL_ADMIN" || ctx.role === "SUPER_ADMIN";
    if (!isAdmin) {
      const data = await readReferenceData();
      const recipient = {
        role: ctx.role,
        userId: ctx.userId,
        teacherId: ctx.teacherId,
        studentId: ctx.studentId,
      };
      const audienceContext = { students: data.students, teachers: data.teachers };
      if (!isVisibleNow(stored) || !matchesAudience(stored, recipient, audienceContext)) {
        return fail("FORBIDDEN", "Bu ek size açık değil");
      }
    }

    const att = stored.attachments?.find((a) => a.id === v.data.attachmentId);
    if (!att?.storageKey) return fail("NOT_FOUND", "Ek bulunamadı veya bozuk.");

    const { downloadAnnouncementAttachment } = await import("../storage");
    let buffer: Buffer;
    try {
      buffer = await downloadAnnouncementAttachment(ctx.tenantId, att.storageKey);
    } catch {
      return fail("NOT_FOUND", "Ek dosyası okunamadı (kırık veya eksik).");
    }

    return ok({
      fileName: att.fileName,
      fileMimeType: att.mimeType,
      fileData: buffer.toString("base64"),
    });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "getAnnouncementAttachmentFile failed");
  }
}

export async function updateAnnouncementStatusTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ announcementId: string; status: AnnouncementStatus }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(updateAnnouncementStatusSchema, input);
  if (!v.ok) return v;

  try {
    const { getStoredAnnouncement } = await import("../announcements");
    const before = await getStoredAnnouncement(ctx.tenantId, v.data.announcementId);
    const updated = await updateAnnouncementStatus(ctx.tenantId, v.data.announcementId, v.data.status);
    if (!updated) return fail("NOT_FOUND", "Duyuru bulunamadı");
    audit(ctx, "announcement.status_update", "Announcement", v.data.announcementId, {
      status: v.data.status,
    });
    // Faz 4 — yalnızca GERÇEK bir "yayına girme" geçişinde bildirim üret
    // (published → published tekrar çağrısı spam üretmez).
    if (v.data.status === "published" && before?.status !== "published") {
      await publishAnnouncementToRecipients(ctx.tenantId, updated);
    }
    return ok({ announcementId: v.data.announcementId, status: v.data.status });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "updateAnnouncementStatus failed");
  }
}

/**
 * Portal görünümü: yalnızca çağıranın hedef kitlesinde olan, YAYINDA
 * (published + yayın penceresi içinde) duyurular — sunucu tarafında
 * filtrelenir (bkz. src/lib/announcements/audience.ts), asla hedef-dışı
 * duyuru client'a gönderilmez.
 */
export async function listAnnouncementsForUserTool(
  ctx: ServiceContext
): Promise<ServiceResult<{ announcements: Announcement[] }>> {
  try {
    const [data, all] = await Promise.all([readReferenceData(), listAnnouncements(ctx.tenantId)]);
    const accessType = ctx.studentId ? await resolveCallerAccessType(ctx, ctx.studentId) : undefined;
    const recipient = {
      role: ctx.role,
      userId: ctx.userId,
      teacherId: ctx.teacherId,
      studentId: ctx.studentId,
      accessType,
    };
    const audienceContext = { students: data.students, teachers: data.teachers };
    const visible = all.filter(
      (a) => isVisibleNow(a) && matchesAudience(a, recipient, audienceContext)
    );
    return ok({ announcements: visible });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "listAnnouncementsForUser failed");
  }
}

export async function markAnnouncementReadTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ announcementId: string }>> {
  const v = parseOrFail(markAnnouncementReadSchema, input);
  if (!v.ok) return v;

  try {
    await markAnnouncementRead(ctx.tenantId, v.data.announcementId, ctx.userId);
    return ok({ announcementId: v.data.announcementId });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "markAnnouncementRead failed");
  }
}

/** Yönetim ekranı "kim okudu" tablosu. */
export async function listAnnouncementReadersTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ userIds: string[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(z.object({ announcementId: z.string().min(1) }), input);
  if (!v.ok) return v;

  try {
    const userIds = await listReadUserIds(ctx.tenantId, v.data.announcementId);
    return ok({ userIds });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "listAnnouncementReaders failed");
  }
}

/**
 * EPIC 7 (IMPLEMENTATION_PLAN.md) — TEACHER yalnızca kendi öğrencisi için
 * değerlendirme oluşturabilir (mevcut `canAccessStudent`'ın TEACHER için
 * "true, filtrelenir" kuralını burada somut olarak uyguluyoruz).
 * `teacherId` her zaman öğrencinin ATANMIŞ öğretmeninden alınır (istekten
 * değil) — SCHOOL_ADMIN başka bir öğretmen adına oluştursa bile kayıt doğru
 * öğretmene atfedilir.
 */
export async function createAssessmentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ assessmentId: string }>> {
  const auth = requireRole(ctx, ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(createAssessmentSchema, input);
  if (!v.ok) return v;

  const data = await readData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  const access = await assertStudentAccess(ctx, student, v.data.studentId);
  if (!access.ok) return fail(access.code, access.message);
  if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı");
  const lesson = data.lessons.find((l) => l.id === v.data.lessonId);
  if (!lesson) return fail("NOT_FOUND", "Ders bulunamadı");
  if (lesson.studentId !== student.id) {
    return fail("VALIDATION_ERROR", "Seçilen ders bu öğrenciye ait değil.");
  }
  if (ctx.role === "TEACHER" && lesson.teacherId !== ctx.teacherId) {
    return fail("FORBIDDEN", "Yalnızca kendi dersiniz için değerlendirme oluşturabilirsiniz.");
  }

  try {
    const assessment = await createAssessment({
      tenantId: ctx.tenantId,
      lessonId: v.data.lessonId,
      studentId: v.data.studentId,
      teacherId: student.teacherId,
      teknikBecerisi: v.data.teknikBecerisi,
      notaOkuma: v.data.notaOkuma,
      muzikalite: v.data.muzikalite,
      ritimDuyusu: v.data.ritimDuyusu,
      calismaDuzeni: v.data.calismaDuzeni,
      evOdeviTamamlama: v.data.evOdeviTamamlama,
      dersKatilimi: v.data.dersKatilimi,
      motivasyon: v.data.motivasyon,
      genelIlerleme: v.data.genelIlerleme,
      hedefeUlasma: v.data.hedefeUlasma,
      piecesWorked: v.data.piecesWorked,
      etudesWorked: v.data.etudesWorked,
      technicalWork: v.data.technicalWork,
      theoryWork: v.data.theoryWork,
      strengthNote: v.data.strengthNote,
      nextStepsNote: v.data.nextStepsNote,
      improvementNote: v.data.improvementNote,
      parentPrivateNote: v.data.parentPrivateNote,
      parentNoteVisibleToStudent: v.data.parentNoteVisibleToStudent,
      teacherSignedName: v.data.teacherSignedName,
    });
    audit(ctx, "assessment.create", "LessonAssessment", assessment.id, {
      studentId: v.data.studentId,
      lessonId: v.data.lessonId,
    });
    return ok({ assessmentId: assessment.id });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "createAssessment failed");
  }
}

export async function listAssessmentsForStudentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ assessments: LessonAssessment[] }>> {
  const v = parseOrFail(z.object({ studentId: z.string().min(1) }), input);
  if (!v.ok) return v;

  try {
    const student = await readStudentById(v.data.studentId);
    const access = await assertStudentAccess(ctx, student, v.data.studentId);
    if (!access.ok) return fail(access.code, access.message);

    const assessments = await listAssessmentsForStudent(ctx.tenantId, v.data.studentId);
    const accessType = await resolveCallerAccessType(ctx, v.data.studentId);
    return ok({ assessments: assessments.map((a) => stripPrivateNoteForRecipient(a, ctx.role, accessType)) });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "listAssessmentsForStudent failed");
  }
}

export async function getAssessmentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ assessment: LessonAssessment }>> {
  const v = parseOrFail(z.object({ assessmentId: z.string().min(1) }), input);
  if (!v.ok) return v;

  try {
    const assessment = await getAssessment(ctx.tenantId, v.data.assessmentId);
    if (!assessment) return fail("NOT_FOUND", "Değerlendirme bulunamadı");
    const student = await readStudentById(assessment.studentId);
    const access = await assertStudentAccess(ctx, student, assessment.studentId);
    if (!access.ok) return fail(access.code, access.message);
    if (ctx.role === "TEACHER" && assessment.teacherId !== ctx.teacherId) {
      return fail("FORBIDDEN", "Bu kayda erişiminiz yok");
    }
    const accessType = await resolveCallerAccessType(ctx, assessment.studentId);
    return ok({ assessment: stripPrivateNoteForRecipient(assessment, ctx.role, accessType) });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "getAssessment failed");
  }
}

/** 4 haftalık birleşik rapor: geçmiş değerlendirmeler + genel skor trendi. */
export async function getAssessmentReportTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ assessments: LessonAssessment[]; trend: AssessmentTrendPoint[] }>> {
  const v = parseOrFail(z.object({ studentId: z.string().min(1) }), input);
  if (!v.ok) return v;

  try {
    const student = await readStudentById(v.data.studentId);
    const access = await assertStudentAccess(ctx, student, v.data.studentId);
    if (!access.ok) return fail(access.code, access.message);

    const assessments = await listAssessmentsForStudent(ctx.tenantId, v.data.studentId);
    const trend = computeTrend(assessments, 4);
    const accessType = await resolveCallerAccessType(ctx, v.data.studentId);
    return ok({
      assessments: assessments.map((a) => stripPrivateNoteForRecipient(a, ctx.role, accessType)),
      trend,
    });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "getAssessmentReport failed");
  }
}

/**
 * Faz 3B — bir öğretmenin (veya adminin, tüm öğretmenler için) BEKLEYEN
 * dört haftalık değerlendirmelerini listeler. Saf hesaplama (bkz.
 * computePendingPeriodicAssessmentPeriods) — hiçbir "pending" satırı
 * okunmaz/yazılmaz, her çağrıda taze hesaplanır.
 */
export async function listPendingPeriodicAssessmentsTool(
  ctx: ServiceContext,
  input: unknown
): Promise<
  ServiceResult<{
    items: { studentId: string; studentName: string; teacherId: string; periodStart: string; periodEnd: string }[];
  }>
> {
  const auth = requireRole(ctx, ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(z.object({ teacherId: z.string().min(1).optional() }), input);
  if (!v.ok) return v;

  if (ctx.role === "TEACHER" && v.data.teacherId && v.data.teacherId !== ctx.teacherId) {
    return fail("FORBIDDEN", "Yalnızca kendi bekleyen değerlendirmelerinizi görebilirsiniz.");
  }

  try {
    const data = await readReferenceData();
    const targetTeacherIds =
      ctx.role === "TEACHER"
        ? [ctx.teacherId!]
        : v.data.teacherId
          ? [v.data.teacherId]
          : [...new Set(data.teachers.map((t) => t.id))];

    const items: { studentId: string; studentName: string; teacherId: string; periodStart: string; periodEnd: string }[] =
      [];
    for (const teacherId of targetTeacherIds) {
      const submitted = await listPeriodicAssessmentsForTeacher(ctx.tenantId, teacherId);
      const submittedByStudent = new Map<string, PendingPeriod[]>();
      for (const s of submitted) {
        const arr = submittedByStudent.get(s.studentId) ?? [];
        arr.push({ periodStart: s.periodStart, periodEnd: s.periodEnd });
        submittedByStudent.set(s.studentId, arr);
      }
      const students = data.students.filter((s) => s.teacherId === teacherId && s.active);
      for (const student of students) {
        const pending = computePendingPeriodicAssessmentPeriods(student, submittedByStudent.get(student.id) ?? []);
        for (const period of pending) {
          items.push({ studentId: student.id, studentName: student.name, teacherId, ...period });
        }
      }
    }

    return ok({ items });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "listPendingPeriodicAssessments failed");
  }
}

/**
 * Faz 3B — bir dönem için genel gelişim değerlendirmesi gönderir. Talep
 * edilen dönem `computePendingPeriodicAssessmentPeriods`'un ÜRETTİĞİ
 * dönemlerden biriyle EŞLEŞMEK zorundadır (rastgele bir tarih aralığı kabul
 * edilmez) — bu, hem tutarlılığı hem idempotency'yi (aynı dönem ikinci kez
 * gönderilemez) garanti eder.
 */
export async function createPeriodicAssessmentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ id: string }>> {
  const auth = requireRole(ctx, ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(createPeriodicAssessmentSchema, input);
  if (!v.ok) return v;

  const data = await readData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı");
  if (ctx.role === "TEACHER" && student.teacherId !== ctx.teacherId) {
    return fail("FORBIDDEN", "Yalnızca kendi öğrenciniz için değerlendirme gönderebilirsiniz.");
  }

  const submitted = await listPeriodicAssessmentsForTeacher(ctx.tenantId, student.teacherId);
  const submittedForStudent = submitted
    .filter((s) => s.studentId === student.id)
    .map((s) => ({ periodStart: s.periodStart, periodEnd: s.periodEnd }));
  const pending = computePendingPeriodicAssessmentPeriods(student, submittedForStudent);
  const matches = pending.some((p) => p.periodStart === v.data.periodStart && p.periodEnd === v.data.periodEnd);
  if (!matches) {
    return fail(
      "VALIDATION_ERROR",
      "Belirtilen dönem şu anda bekleyen bir değerlendirme değil (zaten gönderilmiş veya henüz tamamlanmamış olabilir)."
    );
  }

  const relatedLessonIds = data.lessons
    .filter(
      (l) =>
        l.studentId === student.id &&
        new Date(l.startAt) >= new Date(v.data.periodStart) &&
        new Date(l.startAt) <= new Date(v.data.periodEnd)
    )
    .map((l) => l.id);

  try {
    const result = await createPeriodicAssessment({
      tenantId: ctx.tenantId,
      studentId: student.id,
      teacherId: student.teacherId,
      periodStart: v.data.periodStart,
      periodEnd: v.data.periodEnd,
      relatedLessonIds,
      overallProgressNote: v.data.overallProgressNote,
      strengthsNote: v.data.strengthsNote,
      areasForImprovementNote: v.data.areasForImprovementNote,
      recommendationNote: v.data.recommendationNote,
      submittedBy: ctx.userId,
    });
    if (!result.ok) return fail("CONFLICT", result.message);
    audit(ctx, "periodic_assessment.create", "PeriodicAssessment", result.assessment.id, {
      studentId: student.id,
      periodStart: v.data.periodStart,
      periodEnd: v.data.periodEnd,
    });
    return ok({ id: result.assessment.id });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "createPeriodicAssessment failed");
  }
}

/**
 * Faz 3B — bir öğrencinin gönderilmiş dönemsel değerlendirmelerini listeler.
 * Görünürlük `assertStudentAccess` (mevcut, tüm rollerde tutarlı kapsam
 * kontrolü) ile aynı — admin tümünü, öğretmen kendi öğrencisini, veli/
 * öğrenci portalı yalnızca KENDİ öğrencisini görür (bu tablo zaten yalnızca
 * "submitted" kayıt tutar, ayrı bir filtre gerekmez).
 */
export async function listPeriodicAssessmentsForStudentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ assessments: PeriodicAssessment[] }>> {
  const v = parseOrFail(z.object({ studentId: z.string().min(1) }), input);
  if (!v.ok) return v;

  try {
    const student = await readStudentById(v.data.studentId);
    const access = await assertStudentAccess(ctx, student, v.data.studentId);
    if (!access.ok) return fail(access.code, access.message);

    const assessments = await listPeriodicAssessmentsForStudent(ctx.tenantId, v.data.studentId);
    return ok({ assessments });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "listPeriodicAssessmentsForStudent failed");
  }
}

/**
 * EPIC 8 — ders başlat/bitir. 2026-09-19 (owner kararı): yönetici merkezli tek
 * yetki modeli — öğretmen dersi başlatamaz/bitiremez (web, API, mobil aynı
 * tool'dan geçer). Hakediş `lessonProcessed` ("İşlendi", yöneticide) ile yürür.
 */
export const TEACHER_LESSON_LIVE_FORBIDDEN_MESSAGE =
  "Dersi başlatma/bitirme yalnız kurum yöneticisi tarafından yapılır. Ders durumu için yöneticinizle iletişime geçin.";

export async function startLessonTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ lessonId: string; status: string }>> {
  if (ctx.role === "TEACHER") return fail("FORBIDDEN", TEACHER_LESSON_LIVE_FORBIDDEN_MESSAGE);
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(startLessonSchema, input);
  if (!v.ok) return v;

  const data = await readData();
  const lesson = data.lessons.find((l) => l.id === v.data.lessonId);
  if (!lesson) return fail("NOT_FOUND", "Ders bulunamadı");

  try {
    const result = await startLessonLive(v.data.lessonId);
    if (!result.ok) return fail("VALIDATION_ERROR", result.message);
    audit(ctx, "lesson.start", "Lesson", v.data.lessonId, {});
    // Notify the student (if they have a login User) that the lesson started.
    try {
      const { getUserIdByStudentId } = await import("../auth/users");
      const { isCategoryEnabledForUser } = await import("../notification-preferences");
      const { createNotification, listNotificationsForUser } = await import("../notifications");
      const studentUserId = await getUserIdByStudentId(ctx.tenantId, result.lesson.studentId);
      if (studentUserId) {
        const enabled = await isCategoryEnabledForUser(ctx.tenantId, studentUserId, "lesson_started");
        if (enabled) {
          const since = Date.now() - 60 * 60 * 1000; // 1 hour dedupe window
          const existing = await listNotificationsForUser({ tenantId: ctx.tenantId, userId: studentUserId });
          const dup = existing.some((n) => n.kind === "lesson_started" && n.body.includes(result.lesson.id) && new Date(n.createdAt).getTime() >= since);
          if (!dup) {
            await createNotification({
              tenantId: ctx.tenantId,
              targetUserId: studentUserId,
              kind: "lesson_started",
              title: "Ders başladı",
              body: `"${result.lesson.instrument}" dersi başladı. Detay: /ogretmen/ogrenciler/${result.lesson.studentId}`,
            });
          }
        }
      }
    } catch {
      // best-effort
    }
    return ok({ lessonId: v.data.lessonId, status: result.lesson.status });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "startLesson failed");
  }
}

export async function endLessonTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ lessonId: string; status: string }>> {
  if (ctx.role === "TEACHER") return fail("FORBIDDEN", TEACHER_LESSON_LIVE_FORBIDDEN_MESSAGE);
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(endLessonSchema, input);
  if (!v.ok) return v;

  const data = await readData();
  const lesson = data.lessons.find((l) => l.id === v.data.lessonId);
  if (!lesson) return fail("NOT_FOUND", "Ders bulunamadı");

  try {
    const result = await endLessonLive(v.data.lessonId);
    if (!result.ok) return fail("VALIDATION_ERROR", result.message);
    audit(ctx, "lesson.end", "Lesson", v.data.lessonId, {});
    return ok({ lessonId: v.data.lessonId, status: result.lesson.status });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "endLesson failed");
  }
}

/** Yalnızca SCHOOL_ADMIN/SUPER_ADMIN — zorunlu not, audit'e yazılır (EPIC 0). */
export async function correctLessonTimesTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ lessonId: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(correctLessonTimesSchema, input);
  if (!v.ok) return v;

  try {
    const result = await correctLessonTimesLive(v.data.lessonId, {
      actualStartAt: v.data.actualStartAt,
      actualEndAt: v.data.actualEndAt,
      correctedBy: ctx.userId,
      note: v.data.note,
    });
    if (!result.ok) return fail("VALIDATION_ERROR", result.message);
    audit(ctx, "lesson.time_correction", "Lesson", v.data.lessonId, {
      actualStartAt: v.data.actualStartAt,
      actualEndAt: v.data.actualEndAt,
      note: v.data.note,
    });
    return ok({ lessonId: v.data.lessonId });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "correctLessonTimes failed");
  }
}

/** EPIC 9 — eski öğretmen öneri yolu; artık her çağrıda reddeder. */
export async function proposeTeacherAvailabilityTool(
  _ctx: ServiceContext,
  _input: unknown
): Promise<ServiceResult<{ requestId: string }>> {
  // 2026-09-17 (owner kararı) — öğretmen self-service müsaitlik değişikliği
  // KAPALI. Web formu kaldırıldı; API/mobil üzerinden elle tetiklenen istek
  // de burada reddedilir. Yönetici yolu: updateTeacherAvailabilityTool.
  // Önceden gönderilmiş bekleyen öneriler yönetici ekranında incelenebilir.
  return fail(
    "FORBIDDEN",
    "Müsaitlik günleri yalnız kurum yöneticisi tarafından düzenlenir. Değişiklik için yöneticinizle iletişime geçin."
  );
}

/**
 * Bir öğretmenin geçmiş/bekleyen müsaitlik önerileri. TEACHER yalnızca
 * kendi kayıtlarını görebilir; SCHOOL_ADMIN/SUPER_ADMIN herhangi birini
 * (onay ekranı için).
 */
export async function listTeacherAvailabilityRequestsTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ requests: TeacherAvailabilityRequest[] }>> {
  const auth = requireRole(ctx, ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(z.object({ teacherId: z.string().min(1) }), input);
  if (!v.ok) return v;

  if (ctx.role === "TEACHER" && v.data.teacherId !== ctx.teacherId) {
    return fail("FORBIDDEN", "Yalnızca kendi müsaitlik önerilerinizi görebilirsiniz.");
  }

  try {
    const requests = await listAvailabilityRequestsForTeacher(ctx.tenantId, v.data.teacherId);
    return ok({ requests });
  } catch (e) {
    return fail(
      "INTERNAL_ERROR",
      e instanceof Error ? e.message : "listTeacherAvailabilityRequests failed"
    );
  }
}

/**
 * Yalnızca SCHOOL_ADMIN/SUPER_ADMIN — onaylanan öneri hemen
 * `Teacher.availability`'ye UYGULANIR (updateTeacherAvailability); reddedilen
 * öneri yalnızca durumu değiştirir, öğretmenin canlı programına dokunmaz.
 * Zaten incelenmiş (approved/rejected) bir öneriyi tekrar incelemek
 * NOT_FOUND döner (idempotent hata, EPIC 8'in aynı deseni).
 */
export async function reviewTeacherAvailabilityRequestTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ requestId: string; status: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(reviewTeacherAvailabilityRequestSchema, input);
  if (!v.ok) return v;

  try {
    const existing = await getAvailabilityRequest(ctx.tenantId, v.data.requestId);
    if (!existing) return fail("NOT_FOUND", "Müsaitlik önerisi bulunamadı.");

    if (v.data.decision === "approved") {
      const data = await readReferenceData();
      const invalidBranch = existing.proposedAvailability.find(
        (w) => w.branchId && !data.settings.branches.some((b) => b.id === w.branchId)
      );
      if (invalidBranch) {
        return fail("VALIDATION_ERROR", `Öneride geçersiz bir şube var: "${invalidBranch.branchId}".`);
      }
    }

    const reviewed = await reviewAvailabilityRequest(ctx.tenantId, v.data.requestId, {
      status: v.data.decision,
      reviewNote: v.data.reviewNote,
      reviewedBy: ctx.userId,
    });
    if (!reviewed) {
      return fail("VALIDATION_ERROR", "Bu öneri zaten incelenmiş.");
    }

    if (reviewed.status === "approved") {
      await updateTeacherAvailability(reviewed.teacherId, reviewed.proposedAvailability);
    }

    audit(
      ctx,
      "teacher.availability_request.review",
      "TeacherAvailabilityRequest",
      reviewed.id,
      { decision: v.data.decision, reviewNote: v.data.reviewNote, teacherId: reviewed.teacherId }
    );
    return ok({ requestId: reviewed.id, status: reviewed.status });
  } catch (e) {
    return fail(
      "INTERNAL_ERROR",
      e instanceof Error ? e.message : "reviewTeacherAvailabilityRequest failed"
    );
  }
}

/** EPIC 6B (IMPLEMENTATION_PLAN.md) — TEACHER kendi öğrencisi için ödev oluşturur. */
export async function createHomeworkTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ homeworkId: string }>> {
  const auth = requireRole(ctx, ["TEACHER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const moduleGate = await assertFeatureEnabled(ctx.tenantId, "homework");
  if (!moduleGate.ok) return moduleGate;

  const v = parseOrFail(createHomeworkSchema, input);
  if (!v.ok) return v;

  const fileCheck = validateUploadedFile(v.data);
  if (!fileCheck.ok) return fail("VALIDATION_ERROR", fileCheck.message);

  const data = await readData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı");
  if (student.teacherId !== ctx.teacherId) {
    return fail("FORBIDDEN", "Yalnızca kendi öğrenciniz için ödev oluşturabilirsiniz.");
  }
  if (v.data.lessonId) {
    const lesson = data.lessons.find((l) => l.id === v.data.lessonId);
    if (!lesson) return fail("NOT_FOUND", "Seçilen ders bulunamadı.");
    if (lesson.studentId !== v.data.studentId || lesson.teacherId !== ctx.teacherId) {
      return fail("VALIDATION_ERROR", "Seçilen ders bu öğrenci/öğretmen ile eşleşmiyor.");
    }
  }

  try {
    const homework = await createHomework({
      tenantId: ctx.tenantId,
      teacherId: ctx.teacherId!,
      studentId: v.data.studentId,
      lessonId: v.data.lessonId,
      title: v.data.title,
      description: v.data.description,
      dueDate: v.data.dueDate,
      fileName: v.data.fileName,
      fileMimeType: v.data.fileMimeType,
      fileData: v.data.fileData,
    });
    audit(ctx, "homework.create", "Homework", homework.id, {
      studentId: v.data.studentId,
      hasFile: Boolean(v.data.fileData),
    });
    return ok({ homeworkId: homework.id });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "createHomework failed");
  }
}

const updateHomeworkDueDateSchema = z.object({
  homeworkId: z.string().min(1),
  dueDate: z.string().min(1),
});

/**
 * FEATURE C — yalnızca ödevi veren öğretmen son teslim tarihini değiştirebilir
 * (admin/SUPER_ADMIN dahil değil — mevcut `createHomeworkTool` ile AYNI dar
 * kural: ödev sahipliği TEACHER'a özgü, bkz. tools.ts createHomeworkTool).
 * Öğrenci/veli DEĞİŞTİREMEZ. Teslim/derecelendirme verisi ve `createdAt`
 * KORUNUR — yalnızca `dueDate` değişir (bkz. src/lib/homework.ts).
 * Geçmiş bir tarihe çekmek de SERBESTTİR (mevcut açık bir kısıtlama yok —
 * "yoksa yetkili öğretmen uzatabilir" kuralı simetrik uygulanır, ama her
 * durumda audit'lenir ve öğrenciye/veliye bildirim gider).
 */
export async function updateHomeworkDueDateTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ homework: Homework }>> {
  const auth = requireRole(ctx, ["TEACHER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(updateHomeworkDueDateSchema, input);
  if (!v.ok) return v;
  if (Number.isNaN(new Date(v.data.dueDate).getTime())) {
    return fail("VALIDATION_ERROR", "Geçersiz tarih.");
  }

  const existing = await getHomework(ctx.tenantId, v.data.homeworkId);
  if (!existing) return fail("NOT_FOUND", "Ödev bulunamadı.");
  if (existing.teacherId !== ctx.teacherId) {
    return fail("FORBIDDEN", "Yalnızca kendi verdiğiniz ödevin son teslim tarihini değiştirebilirsiniz.");
  }

  try {
    const previousDueDate = existing.dueDate;
    const homework = await updateHomeworkDueDate(ctx.tenantId, v.data.homeworkId, v.data.dueDate);
    if (!homework) return fail("NOT_FOUND", "Ödev bulunamadı.");
    audit(ctx, "homework.due_date_update", "Homework", homework.id, {
      studentId: homework.studentId,
      previousDueDate,
      newDueDate: homework.dueDate,
    });
    try {
      const { notifyStudentIfEnabled } = await import("../notification-dispatch");
      await notifyStudentIfEnabled({
        tenantId: ctx.tenantId,
        studentId: homework.studentId,
        category: "homework_due_date_changed",
        title: "Ödev son teslim tarihi değişti",
        body: `"${homework.title}" ödevinin son teslim tarihi ${formatDate(homework.dueDate)} olarak güncellendi.`,
        dedupeKey: homework.id,
      });
    } catch {
      // best-effort — ödev zaten güncellendi.
    }
    return ok({ homework });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "updateHomeworkDueDate failed");
  }
}

/** Öğrencinin kendi ödevleri — STUDENT/PARENT kendi çocuğu, TEACHER kendi öğrencisi, admin herkes. */
export async function listHomeworkForStudentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ homework: Homework[] }>> {
  const v = parseOrFail(z.object({ studentId: z.string().min(1) }), input);
  if (!v.ok) return v;

  try {
    const student = await readStudentById(v.data.studentId);
    const access = await assertStudentAccess(ctx, student, v.data.studentId);
    if (!access.ok) return fail(access.code, access.message);

    const homework = await listHomeworkForStudent(ctx.tenantId, v.data.studentId);
    return ok({ homework });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "listHomeworkForStudent failed");
  }
}

/** EPIC 6D — TEACHER kendi öğrencilerine verdiği ödevlerin listesi. */
export async function listHomeworkForTeacherTool(
  ctx: ServiceContext
): Promise<ServiceResult<{ homework: Homework[] }>> {
  const auth = requireRole(ctx, ["TEACHER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  if (!ctx.teacherId) return fail("FORBIDDEN", "Öğretmen kimliği bulunamadı.");

  try {
    const homework = await listHomeworkForTeacher(ctx.tenantId, ctx.teacherId);
    return ok({ homework });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "listHomeworkForTeacher failed");
  }
}

/**
 * EPIC 6B — STUDENT kendi ödevine teslim yükler (video/foto/dosya). Dosya
 * içeriği base64 — boyut sınırı submitHomeworkSchema'da (bkz. validation.ts).
 */
export async function submitHomeworkTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ submissionId: string }>> {
  const auth = requireRole(ctx, ["STUDENT"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const moduleGate = await assertFeatureEnabled(ctx.tenantId, "homework");
  if (!moduleGate.ok) return moduleGate;
  if (!ctx.studentId) return fail("FORBIDDEN", "Öğrenci kimliği bulunamadı.");

  const v = parseOrFail(submitHomeworkSchema, input);
  if (!v.ok) return v;

  const fileCheck = validateUploadedFile(v.data);
  if (!fileCheck.ok) return fail("VALIDATION_ERROR", fileCheck.message);

  const homework = await getHomework(ctx.tenantId, v.data.homeworkId);
  if (!homework) return fail("NOT_FOUND", "Ödev bulunamadı");
  if (homework.studentId !== ctx.studentId) {
    return fail("FORBIDDEN", "Yalnızca kendi ödevinize teslim yükleyebilirsiniz.");
  }
  // Karma Öğrenci Portalı — eski PARENT rolü ödev teslimi yükleyemiyordu;
  // bu davranış korunur: STUDENT rolündeki bir GUARDIAN (veli) DEĞİL,
  // yalnızca SELF (öğrencinin kendisi) teslim yükleyebilir.
  const { getActiveAccessType } = await import("../student-portal-access");
  const accessType = await getActiveAccessType(ctx.tenantId, ctx.userId, homework.studentId);
  if (accessType !== "SELF") {
    return fail("FORBIDDEN", "Yalnızca öğrencinin kendisi ödev teslimi yükleyebilir.");
  }

  try {
    const submission = await submitHomework({
      tenantId: ctx.tenantId,
      homeworkId: v.data.homeworkId,
      studentId: ctx.studentId,
      note: v.data.note,
      fileName: v.data.fileName,
      fileMimeType: v.data.fileMimeType,
      fileData: v.data.fileData,
    });
    audit(ctx, "homework.submit", "HomeworkSubmission", submission.id, {
      homeworkId: v.data.homeworkId,
    });
    return ok({ submissionId: submission.id });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "submitHomework failed");
  }
}

/** `fileData` içermez (özet) — indirme için getHomeworkSubmissionFileTool kullanılmalı. */
export async function listHomeworkSubmissionsTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ submissions: HomeworkSubmission[] }>> {
  const v = parseOrFail(z.object({ homeworkId: z.string().min(1) }), input);
  if (!v.ok) return v;

  const homework = await getHomework(ctx.tenantId, v.data.homeworkId);
  if (!homework) return fail("NOT_FOUND", "Ödev bulunamadı");

  try {
    const student = await readStudentById(homework.studentId);
    const access = await assertStudentAccess(ctx, student, homework.studentId);
    if (!access.ok) return fail(access.code, access.message);

    const submissions = await listSubmissionsForHomework(ctx.tenantId, v.data.homeworkId);
    return ok({ submissions });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "listHomeworkSubmissions failed");
  }
}

/** EPIC 6D — TEACHER kendi öğrencisinin teslimine geri bildirim yazar. */
export async function reviewHomeworkSubmissionTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ submissionId: string }>> {
  const auth = requireRole(ctx, ["TEACHER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(reviewHomeworkSubmissionSchema, input);
  if (!v.ok) return v;

  const submission = await getSubmission(ctx.tenantId, v.data.submissionId);
  if (!submission) return fail("NOT_FOUND", "Teslim bulunamadı");
  const homework = await getHomework(ctx.tenantId, submission.homeworkId);
  if (!homework || homework.teacherId !== ctx.teacherId) {
    return fail("FORBIDDEN", "Yalnızca kendi öğrencinizin teslimine geri bildirim yazabilirsiniz.");
  }

  try {
    const reviewed = await reviewSubmission(ctx.tenantId, v.data.submissionId, v.data.teacherFeedback);
    if (!reviewed) return fail("NOT_FOUND", "Teslim bulunamadı");
    audit(ctx, "homework.review", "HomeworkSubmission", v.data.submissionId, {});
    return ok({ submissionId: v.data.submissionId });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "reviewHomeworkSubmission failed");
  }
}

/**
 * Dosya indirme rotası için — yalnızca sahiplik kontrolü geçen çağrılar
 * `fileData`yı görür, asla ham/tahmin edilebilir bir URL üzerinden değil.
 */
export async function getHomeworkSubmissionFileTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ fileName?: string; fileMimeType?: string; fileData?: string }>> {
  const v = parseOrFail(z.object({ submissionId: z.string().min(1) }), input);
  if (!v.ok) return v;

  const submission = await getSubmission(ctx.tenantId, v.data.submissionId);
  if (!submission) return fail("NOT_FOUND", "Teslim bulunamadı");

  try {
    const student = await readStudentById(submission.studentId);
    const access = await assertStudentAccess(ctx, student, submission.studentId);
    if (!access.ok) return fail(access.code, access.message);
    if (!submission.fileData) return fail("NOT_FOUND", "Bu teslimde dosya yok");

    return ok({
      fileName: submission.fileName,
      fileMimeType: submission.fileMimeType,
      fileData: submission.fileData,
    });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "getHomeworkSubmissionFile failed");
  }
}

/**
 * Paket 7 — ödevin KENDİSİNE (öğretmenin verirken eklediği) ekli dosyayı
 * indirme rotası için. Aynı sahiplik deseni: getHomeworkSubmissionFileTool.
 */
export async function getHomeworkFileTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ fileName?: string; fileMimeType?: string; fileData?: string }>> {
  const v = parseOrFail(z.object({ homeworkId: z.string().min(1) }), input);
  if (!v.ok) return v;

  const homework = await getHomework(ctx.tenantId, v.data.homeworkId);
  if (!homework) return fail("NOT_FOUND", "Ödev bulunamadı");

  try {
    const student = await readStudentById(homework.studentId);
    const access = await assertStudentAccess(ctx, student, homework.studentId);
    if (!access.ok) return fail(access.code, access.message);
    if (!homework.fileData) return fail("NOT_FOUND", "Bu ödevde dosya yok");

    return ok({
      fileName: homework.fileName,
      fileMimeType: homework.fileMimeType,
      fileData: homework.fileData,
    });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "getHomeworkFile failed");
  }
}

/** EPIC 6B — TEACHER kendi öğrencilerine materyal/pratik videosu paylaşır. */
export async function createTeachingMaterialTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ materialId: string }>> {
  const auth = requireRole(ctx, ["TEACHER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  if (!ctx.teacherId) return fail("FORBIDDEN", "Öğretmen kimliği bulunamadı.");

  const v = parseOrFail(createTeachingMaterialSchema, input);
  if (!v.ok) return v;

  const materialFileCheck = validateUploadedFile(v.data);
  if (!materialFileCheck.ok) return fail("VALIDATION_ERROR", materialFileCheck.message);

  try {
    const material = await createTeachingMaterial({
      tenantId: ctx.tenantId,
      teacherId: ctx.teacherId,
      title: v.data.title,
      description: v.data.description,
      targetStudentType: v.data.targetStudentType,
      targetInstrument: v.data.targetInstrument,
      targetLevel: v.data.targetLevel,
      fileName: v.data.fileName,
      fileMimeType: v.data.fileMimeType,
      fileData: v.data.fileData,
    });
    audit(ctx, "teaching_material.create", "TeachingMaterial", material.id, {});
    return ok({ materialId: material.id });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "createTeachingMaterial failed");
  }
}

/**
 * Bir öğrencinin görebileceği materyaller — yalnızca KENDİ öğretmeninin
 * paylaştığı VE hedefleme kriterlerine uyan materyaller (bkz.
 * matchesMaterialAudience). `fileData` içermez (özet) — indirme için
 * getTeachingMaterialFileTool kullanılmalı.
 */
export async function listTeachingMaterialsForStudentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ materials: TeachingMaterial[] }>> {
  const v = parseOrFail(z.object({ studentId: z.string().min(1) }), input);
  if (!v.ok) return v;

  try {
    const student = await readStudentById(v.data.studentId);
    const access = await assertStudentAccess(ctx, student, v.data.studentId);
    if (!access.ok) return fail(access.code, access.message);
    if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı");

    const all = await listTeachingMaterialsForTeacher(ctx.tenantId, student.teacherId);
    const materials = all.filter((m) => matchesMaterialAudience(m, student));
    return ok({ materials });
  } catch (e) {
    return fail(
      "INTERNAL_ERROR",
      e instanceof Error ? e.message : "listTeachingMaterialsForStudent failed"
    );
  }
}

/** EPIC 6D — TEACHER kendi paylaştığı materyallerin listesi. */
export async function listTeachingMaterialsForTeacherTool(
  ctx: ServiceContext
): Promise<ServiceResult<{ materials: TeachingMaterial[] }>> {
  const auth = requireRole(ctx, ["TEACHER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  if (!ctx.teacherId) return fail("FORBIDDEN", "Öğretmen kimliği bulunamadı.");

  try {
    const materials = await listTeachingMaterialsForTeacher(ctx.tenantId, ctx.teacherId);
    return ok({ materials });
  } catch (e) {
    return fail(
      "INTERNAL_ERROR",
      e instanceof Error ? e.message : "listTeachingMaterialsForTeacher failed"
    );
  }
}

/** Dosya indirme rotası için — hedefleme + sahiplik kontrolü burada yapılır. */
export async function getTeachingMaterialFileTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ fileName?: string; fileMimeType?: string; fileData?: string }>> {
  const v = parseOrFail(z.object({ materialId: z.string().min(1) }), input);
  if (!v.ok) return v;

  const material = await getTeachingMaterial(ctx.tenantId, v.data.materialId);
  if (!material) return fail("NOT_FOUND", "Materyal bulunamadı");

  if (ctx.role === "TEACHER") {
    if (material.teacherId !== ctx.teacherId) return fail("FORBIDDEN", "Bu materyale erişiminiz yok");
  } else if (ctx.role === "STUDENT") {
    if (!ctx.studentId || !(await canAccessStudent(ctx, ctx.studentId))) {
      return fail("FORBIDDEN", "Bu materyale erişiminiz yok");
    }
    const student = await readStudentById(ctx.studentId);
    if (
      !student ||
      student.teacherId !== material.teacherId ||
      !matchesMaterialAudience(material, student)
    ) {
      return fail("FORBIDDEN", "Bu materyale erişiminiz yok");
    }
  } else if (ctx.role !== "SUPER_ADMIN" && ctx.role !== "SCHOOL_ADMIN" && ctx.role !== "AI_AGENT") {
    return fail("FORBIDDEN", "Bu materyale erişiminiz yok");
  }

  if (!material.fileData) return fail("NOT_FOUND", "Bu materyalde dosya yok");
  return ok({
    fileName: material.fileName,
    fileMimeType: material.fileMimeType,
    fileData: material.fileData,
  });
}

/**
 * EPIC 6C (IMPLEMENTATION_PLAN.md) — PARENT/STUDENT kendi çocuğu/kendisi
 * için öğretmen hakkında yapılandırılmış geri bildirim gönderir. Kamuya
 * açık ortalama/sıralama asla oluşturulmaz (bkz. teacher-feedback.ts).
 */
export async function submitTeacherFeedbackTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ feedbackId: string; updated: boolean }>> {
  const auth = requireRole(ctx, ["STUDENT"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const moduleGate = await assertFeatureEnabled(ctx.tenantId, "teacherFeedback");
  if (!moduleGate.ok) return moduleGate;

  const v = parseOrFail(submitTeacherFeedbackSchema, input);
  if (!v.ok) return v;

  // Fail-closed: yalnız aktif StudentPortalAccess (SELF veya GUARDIAN) — JWT studentId tek başına yetmez.
  if (!(await canAccessStudent(ctx, v.data.studentId))) {
    return fail("FORBIDDEN", "Yalnızca kendi çocuğunuz/kendiniz için geri bildirim gönderebilirsiniz.");
  }

  const data = await readReferenceData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı");

  try {
    // Karma Öğrenci Portalı — ctx.role artık HER ZAMAN "STUDENT" (veli de
    // öğrenci de). Admin inceleme ekranının "STUDENT"/"PARENT" kaynak
    // filtresi anlamını korusun diye burada accessType'a göre eski
    // etiketleme davranışı YENİDEN üretilir (GUARDIAN → "PARENT").
    const accessType = await resolveCallerAccessType(ctx, v.data.studentId);
    const submitterRole = accessType === "GUARDIAN" ? "PARENT" : "STUDENT";
    const { feedback, updated } = await submitTeacherFeedback({
      tenantId: ctx.tenantId,
      teacherId: student.teacherId,
      studentId: v.data.studentId,
      submittedBy: ctx.userId,
      submitterRole,
      scores: v.data.scores,
      continueWithTeacher: v.data.continueWithTeacher,
      comment: v.data.comment,
    });
    audit(ctx, updated ? "teacher_feedback.update" : "teacher_feedback.submit", "TeacherFeedback", feedback.id, {
      teacherId: student.teacherId,
    });
    try {
      const teacher = data.teachers.find((t) => t.id === student.teacherId);
      const { notifyAdmins } = await import("../manager-notifications");
      // dedupeKey = feedback.id: aynı ay içindeki tekrar submit (update) aynı
      // satırı güncellediği için aynı id kalır — 24 saat içinde ikinci kez
      // "yeni değerlendirme" bildirimi üretilmez (bkz. notifyAdmins dedupe).
      await notifyAdmins(
        ctx.tenantId,
        "teacher_feedback_submitted",
        {
          title: "Yeni öğretmen değerlendirmesi",
          body: `${teacher?.name ?? "Bir öğretmen"} için yeni bir değerlendirme geldi. Detay: /panel/ogretmenler/${student.teacherId}/geri-bildirim (ref:${feedback.id})`,
        },
        { dedupeKey: feedback.id }
      );
    } catch {
      // best-effort — bildirim gönderilemese de değerlendirme kaydı kalıcıdır
    }
    return ok({ feedbackId: feedback.id, updated });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "submitTeacherFeedback failed");
  }
}

/**
 * Öğrencinin bu öğretmen için cari ayda zaten bir kaydı olup olmadığı —
 * formun "Değerlendir" mi "Değerlendirmeyi Güncelle" mi göstereceğine karar
 * verir. Yalnızca kendi kaydını görebilir (ham veri, ama yalnız kendisininki).
 */
export async function getOwnTeacherFeedbackThisMonthTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ feedback: TeacherFeedback | null }>> {
  const auth = requireRole(ctx, ["STUDENT"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(z.object({ studentId: z.string().min(1), teacherId: z.string().min(1) }), input);
  if (!v.ok) return v;

  if (!(await canAccessStudent(ctx, v.data.studentId))) {
    return fail("FORBIDDEN", "Yalnızca kendi çocuğunuz/kendiniz için geri bildirim görüntüleyebilirsiniz.");
  }

  try {
    const feedback = await findTeacherFeedbackThisMonth(ctx.tenantId, v.data.studentId, v.data.teacherId);
    return ok({ feedback });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "getOwnTeacherFeedback failed");
  }
}

/**
 * Yalnızca SCHOOL_ADMIN/SUPER_ADMIN görebilir — öğretmenin KENDİ geri
 * bildirimini görebileceği bir yol bilerek YAZILMADI (bkz. teacher-feedback.ts).
 */
export async function listTeacherFeedbackTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ feedback: TeacherFeedback[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(z.object({ teacherId: z.string().min(1).optional() }), input);
  if (!v.ok) return v;

  try {
    const feedback = await listTeacherFeedback(ctx.tenantId, v.data.teacherId);
    return ok({ feedback });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "listTeacherFeedback failed");
  }
}

export type MaskedTeacherFeedback = Omit<TeacherFeedback, "studentId" | "submittedBy">;

const feedbackReviewFiltersSchema = z.object({
  teacherId: z.string().min(1).optional(),
  status: z.enum(["pending", "reviewed", "actioned", "archived"]).optional(),
  sourceType: z.enum(["STUDENT", "PARENT"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

/**
 * Yönetici inceleme ekranının ana veri kaynağı — ham öğrenci kimliği
 * (studentId/submittedBy) VARSAYILAN OLARAK maskelenir. Kimlik yalnızca
 * `revealTeacherFeedbackIdentityTool` ile, gerekçeli ve audit'li biçimde
 * açılabilir.
 */
export async function listTeacherFeedbackForReviewTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ feedback: MaskedTeacherFeedback[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(feedbackReviewFiltersSchema, input);
  if (!v.ok) return v;

  try {
    const all = await listTeacherFeedback(ctx.tenantId, v.data.teacherId);
    const filtered = all.filter((f) => {
      if (v.data.status && f.status !== v.data.status) return false;
      if (v.data.sourceType && f.submitterRole !== v.data.sourceType) return false;
      if (v.data.from && f.createdAt < v.data.from) return false;
      if (v.data.to && f.createdAt > v.data.to) return false;
      return true;
    });
    const masked = filtered.map(({ studentId: _s, submittedBy: _b, ...rest }) => {
      void _s;
      void _b;
      return rest;
    });
    return ok({ feedback: masked });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "listTeacherFeedbackForReview failed");
  }
}

const revealTeacherFeedbackIdentitySchema = z.object({
  feedbackId: z.string().min(1),
  reason: z.string().min(5, "Gerekçe en az 5 karakter olmalı").max(500),
});

/**
 * Ham öğrenci kimliğini açar — yalnızca gerekçeli ve audit'li. Her çağrı
 * `teacher_feedback.reveal_identity` olarak, gerekçe metniyle birlikte
 * denetim kaydına yazılır.
 */
export async function revealTeacherFeedbackIdentityTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ studentId: string; studentName: string; submittedBy: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(revealTeacherFeedbackIdentitySchema, input);
  if (!v.ok) return v;

  try {
    const feedback = await getTeacherFeedbackById(ctx.tenantId, v.data.feedbackId);
    if (!feedback) return fail("NOT_FOUND", "Geri bildirim bulunamadı");

    const student = await readStudentById(feedback.studentId);

    audit(ctx, "teacher_feedback.reveal_identity", "TeacherFeedback", feedback.id, {
      reason: v.data.reason,
    });

    return ok({
      studentId: feedback.studentId,
      studentName: student?.name ?? "Bilinmeyen öğrenci",
      submittedBy: feedback.submittedBy,
    });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "revealTeacherFeedbackIdentity failed");
  }
}

/** Yönetici durum yönetimi: İncelendi / Aksiyon Alındı / Arşivlendi. */
export async function updateTeacherFeedbackStatusTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ feedbackId: string; status: TeacherFeedbackStatus }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(
    z.object({ feedbackId: z.string().min(1), status: z.enum(["pending", "reviewed", "actioned", "archived"]) }),
    input
  );
  if (!v.ok) return v;

  try {
    const feedback = await updateTeacherFeedbackStatus(ctx.tenantId, v.data.feedbackId, v.data.status);
    if (!feedback) return fail("NOT_FOUND", "Geri bildirim bulunamadı");
    audit(ctx, "teacher_feedback.status_change", "TeacherFeedback", feedback.id, { status: v.data.status });
    return ok({ feedbackId: feedback.id, status: feedback.status });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "updateTeacherFeedbackStatus failed");
  }
}

/** Yönetici bir yorumu öğretmenin anonim özetinde paylaşmayı seçer/geri alır. */
export async function setTeacherFeedbackSharedTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ feedbackId: string; sharedWithTeacher: boolean }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(z.object({ feedbackId: z.string().min(1), shared: z.boolean() }), input);
  if (!v.ok) return v;

  try {
    const feedback = await setTeacherFeedbackShared(ctx.tenantId, v.data.feedbackId, v.data.shared);
    if (!feedback) return fail("NOT_FOUND", "Geri bildirim bulunamadı");
    audit(ctx, "teacher_feedback.set_shared", "TeacherFeedback", feedback.id, { shared: v.data.shared });
    if (v.data.shared) {
      try {
        const { notifyUserIfEnabled } = await import("../notification-dispatch");
        const teacherUserId = await getUserIdByTeacherId(ctx.tenantId, feedback.teacherId);
        if (teacherUserId) {
          await notifyUserIfEnabled({
            tenantId: ctx.tenantId,
            userId: teacherUserId,
            category: "teacher_feedback_shared",
            title: "Hakkınızda değerlendirme var",
            body: `Yönetim, hakkınızdaki bir değerlendirmeyi anonim özetinizde görünür kıldı. Detay: /ogretmen/geri-bildirim`,
            dedupeKey: feedback.id,
          });
        }
      } catch {
        // best-effort — paylaşım kaydı geri alınmaz
      }
    }
    return ok({ feedbackId: feedback.id, sharedWithTeacher: feedback.sharedWithTeacher });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "setTeacherFeedbackShared failed");
  }
}

/**
 * Öğretmenin GÖREBİLECEĞİ TEK yol — yalnızca kendi (ctx.teacherId) özeti,
 * yalnızca eşik sağlanınca (bkz. TEACHER_FEEDBACK_MIN_ANONYMOUS_RESPONSES),
 * hiçbir ham kayıt/kimlik asla dönmez.
 */
export async function getOwnTeacherFeedbackSummaryTool(
  ctx: ServiceContext
): Promise<ServiceResult<Awaited<ReturnType<typeof computeTeacherFeedbackSummary>>>> {
  const auth = requireRole(ctx, ["TEACHER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  if (!ctx.teacherId) return fail("FORBIDDEN", "Öğretmen kaydı bulunamadı");

  try {
    const summary = await computeTeacherFeedbackSummary(ctx.tenantId, ctx.teacherId);
    return ok(summary);
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "getOwnTeacherFeedbackSummary failed");
  }
}

/**
 * Karşılıklı Değerlendirmeler sprinti — TEACHER kendi öğrencisini
 * değerlendirir. Sahiplik `assertStudentAccess` ile ders/öğretmen-öğrenci
 * ilişkisinden (Student.teacherId) doğrulanır — fail-closed: ownership
 * verisi eksikse veya başka öğretmenin öğrencisiyse FORBIDDEN.
 */
export async function submitStudentFeedbackTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ feedbackId: string; updated: boolean }>> {
  const auth = requireRole(ctx, ["TEACHER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  if (!ctx.teacherId) return fail("FORBIDDEN", "Öğretmen kaydı bulunamadı");

  const v = parseOrFail(submitStudentFeedbackSchema, input);
  if (!v.ok) return v;

  const student = await readStudentById(v.data.studentId);
  const access = await assertStudentAccess(ctx, student, v.data.studentId);
  if (!access.ok) return fail(access.code, access.message);

  try {
    const { feedback, updated } = await submitStudentFeedback({
      tenantId: ctx.tenantId,
      teacherId: ctx.teacherId,
      studentId: v.data.studentId,
      submittedBy: ctx.userId,
      scores: v.data.scores,
      comment: v.data.comment,
    });
    audit(ctx, updated ? "student_feedback.update" : "student_feedback.submit", "StudentFeedback", feedback.id, {
      studentId: v.data.studentId,
    });
    try {
      const { notifyAdmins } = await import("../manager-notifications");
      await notifyAdmins(
        ctx.tenantId,
        "student_feedback_submitted",
        {
          title: "Öğrenci değerlendirmesi",
          body: `${student!.name} için yeni bir öğretmen değerlendirmesi geldi. Detay: /panel/ogrenciler/${v.data.studentId} (ref:${feedback.id})`,
        },
        { dedupeKey: feedback.id }
      );
    } catch {
      // best-effort
    }
    return ok({ feedbackId: feedback.id, updated });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "submitStudentFeedback failed");
  }
}

/** Öğretmenin kendi öğrencisi için cari ayda zaten kaydı var mı — form "Güncelle" moduna geçsin diye. */
export async function getOwnStudentFeedbackThisMonthTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ feedback: StudentFeedback | null }>> {
  const auth = requireRole(ctx, ["TEACHER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  if (!ctx.teacherId) return fail("FORBIDDEN", "Öğretmen kaydı bulunamadı");

  const v = parseOrFail(z.object({ studentId: z.string().min(1) }), input);
  if (!v.ok) return v;

  const student = await readStudentById(v.data.studentId);
  const access = await assertStudentAccess(ctx, student, v.data.studentId);
  if (!access.ok) return fail(access.code, access.message);

  try {
    const feedback = await findStudentFeedbackThisMonth(ctx.tenantId, ctx.teacherId, v.data.studentId);
    return ok({ feedback });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "getOwnStudentFeedbackThisMonth failed");
  }
}

/**
 * Yönetici: tenant içindeki TÜM öğrenci değerlendirmelerini görebilir
 * (opsiyonel teacherId/studentId filtresiyle). Öğretmen: yalnızca KENDİ
 * yazdıklarını (ctx.teacherId zorlanır — client'tan gelen teacherId asla
 * güvenilmez).
 */
export async function listStudentFeedbackTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ feedback: StudentFeedback[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(
    z.object({ teacherId: z.string().min(1).optional(), studentId: z.string().min(1).optional() }),
    input
  );
  if (!v.ok) return v;

  const isAdmin = ctx.role === "SCHOOL_ADMIN" || ctx.role === "SUPER_ADMIN";
  if (!isAdmin) {
    if (!ctx.teacherId) return fail("FORBIDDEN", "Öğretmen kaydı bulunamadı");
  }
  const filter = isAdmin
    ? { teacherId: v.data.teacherId, studentId: v.data.studentId }
    : { teacherId: ctx.teacherId, studentId: v.data.studentId };

  try {
    const feedback = await listStudentFeedback(ctx.tenantId, filter);
    return ok({ feedback });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "listStudentFeedback failed");
  }
}

export async function updateStudentFeedbackStatusTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ feedbackId: string; status: StudentFeedbackStatus }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(
    z.object({ feedbackId: z.string().min(1), status: z.enum(["pending", "reviewed", "actioned", "archived"]) }),
    input
  );
  if (!v.ok) return v;

  try {
    const feedback = await updateStudentFeedbackStatus(ctx.tenantId, v.data.feedbackId, v.data.status);
    if (!feedback) return fail("NOT_FOUND", "Değerlendirme bulunamadı");
    audit(ctx, "student_feedback.status_change", "StudentFeedback", feedback.id, { status: v.data.status });
    return ok({ feedbackId: feedback.id, status: feedback.status });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "updateStudentFeedbackStatus failed");
  }
}

export async function resetDemoTool(
  ctx: ServiceContext
): Promise<ServiceResult<{ reset: true }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  // UAT kararı (2026-09-07) — demo sıfırlama yıkıcı bir GELİŞTİRME aracıdır;
  // hiçbir test/preview/production kullanıcısı (yönetici rolü dahil) bunu
  // çalıştıramaz. UI'ı gizlemek tek başına bir kontrol DEĞİLDİR — server
  // action kimliği hâlâ çağrılabilir olduğu için kapı burada, sunucuda.
  if (!isLocalDevTooling()) {
    return fail(
      "FORBIDDEN",
      "Demo verisi sıfırlama yalnızca yerel geliştirmede kullanılabilir. Test/production ortamında veri reseti bir ops prosedürüdür."
    );
  }
  try {
    await resetData();
    // Tahsilat takip vakaları ve bildirimler AppData'nın dışında ayrı
    // store'larda tutulur; demo sıfırlamasının tekrarlanabilir olması için
    // onları da temizle.
    await clearFollowUpCases(ctx.tenantId);
    await clearNotifications(ctx.tenantId);
    await clearAnnouncements(ctx.tenantId);
    await clearAssessments(ctx.tenantId);
    await clearAvailabilityRequests(ctx.tenantId);
    await clearHomework(ctx.tenantId);
    await clearTeachingMaterials(ctx.tenantId);
    await clearTeacherFeedback(ctx.tenantId);
    await clearStudentFeedback(ctx.tenantId);
    await clearTasksForTenant(ctx.tenantId);
    await seedDemoTasks(ctx.tenantId);
    audit(ctx, "setup.reset_demo_data", "Tenant", ctx.tenantId);
    return ok({ reset: true });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "reset failed");
  }
}

/**
 * İş Takip demo örnekleri — yalnızca `resetDemoTool` (demo veri geri
 * yükleme) çağırır; `resetToCleanTemplateTool` (boş şablon) ÇAĞIRMAZ, o
 * kasıtlı olarak hiçbir örnek kayıt bırakmaz. Farklı durum/öncelik/
 * kategori/sorumlu kombinasyonlarını göstermek için 5 görev — demo seed
 * kimlikleriyle (t1/t2/s1/erzene) uyumlu, gerçek `createTask`/checklist/
 * yorum akışının aynısını kullanır (paralel bir yol değil).
 */
async function seedDemoTasks(tenantId: string): Promise<void> {
  const actor = "user_owner_nilufer";
  const t1 = await createTask({
    tenantId,
    title: "Yeni dönem kayıt formlarını gözden geçir",
    description: "Güz dönemi kayıt formundaki T.C. kimlik alanı doğrulamasını kontrol et.",
    priority: "HIGH",
    category: "Kayıt",
    assigneeId: "t1",
    createdById: actor,
    dueDate: new Date(Date.now() + 2 * 86400000).toISOString(),
    tags: ["kayit", "form"],
  });
  await addChecklistItem(tenantId, t1.id, "Formu indir", 0);
  await addChecklistItem(tenantId, t1.id, "T.C. alanını test et", 1);
  await addActivity(tenantId, t1.id, actor, "created", `Görev oluşturuldu: "${t1.title}"`);

  const t2 = await createTask({
    tenantId,
    title: "s5 için gecikmiş ödeme takibi",
    description: "Veliyle iletişime geçip ödeme planı teyit edilecek.",
    priority: "URGENT",
    category: "Tahsilat",
    assigneeId: "user_owner_nilufer",
    createdById: actor,
    dueDate: new Date().toISOString(),
    studentId: "s5",
    tags: ["tahsilat"],
  });
  await updateTask(tenantId, t2.id, { status: "IN_PROGRESS" });
  await addActivity(tenantId, t2.id, actor, "status_changed", "Durum: TODO → IN_PROGRESS");
  await addComment(tenantId, t2.id, actor, "Veliyle bugün öğleden sonra görüşülecek.");
  await addActivity(tenantId, t2.id, actor, "comment_added", "Yorum eklendi");

  const t3 = await createTask({
    tenantId,
    title: "Piyano odası klima arızası",
    description: "Erzene şubesi 1 numaralı stüdyoda klima çalışmıyor.",
    priority: "MEDIUM",
    category: "Teknik",
    assigneeId: "user_owner_nilufer",
    createdById: actor,
    branchId: "erzene",
    tags: ["bakim"],
  });
  await addActivity(tenantId, t3.id, actor, "created", `Görev oluşturuldu: "${t3.title}"`);

  const t4 = await createTask({
    tenantId,
    title: "t2 sözleşme yenileme evrakı",
    description: "Öğretmen sözleşmesi ay sonunda bitiyor, yenileme evrakı hazırlanacak.",
    priority: "LOW",
    category: "Öğretmen",
    assigneeId: "user_owner_nilufer",
    createdById: actor,
    teacherId: "t2",
    dueDate: new Date(Date.now() + 20 * 86400000).toISOString(),
  });
  await addActivity(tenantId, t4.id, actor, "created", `Görev oluşturuldu: "${t4.title}"`);

  const t5 = await createTask({
    tenantId,
    title: "Veli bilgilendirme toplantısı planı",
    description: "Dönem sonu veli toplantısı için program/salon ayarlanacak.",
    priority: "MEDIUM",
    category: "Veli İletişimi",
    assigneeId: "t1",
    createdById: actor,
  });
  await updateTask(tenantId, t5.id, { status: "COMPLETED", completedAt: new Date().toISOString(), progressPercent: 100 });
  await addActivity(tenantId, t5.id, actor, "completed", "Görev tamamlandı");
}

/**
 * Kurulum Merkezi — "Boş şablona sıfırla": demo verisini geri yüklemekten
 * (resetDemoTool) AYRI, bilinçli olarak farklı bir eylem. Örnek
 * öğretmen/öğrenci/ders/ödeme kaydı BIRAKMAZ — yalnızca kurum kimliğini
 * (tenantId/ad) koruyan boş bir iskelet bırakır, ki Kurulum Merkezi'ndeki
 * adımlar sıfırdan takip edilebilsin. Aynı yan-store temizliğini paylaşır
 * (follow-up cases, bildirimler vb.) çünkü onlar da AppData dışında tutulur.
 */
export async function resetToCleanTemplateTool(
  ctx: ServiceContext
): Promise<ServiceResult<{ reset: true }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  // Güvenlik (2026-09-22): Bu aksiyon tenant'taki TÜM operasyonel veriyi
  // (öğrenci/öğretmen/şube/ödeme/ders + yan store'lar) siler; db modunda
  // kullanıcıları da silip kurumu kilitleyebilir. Demo reset ile AYNI kapı —
  // test/preview/production'da UI'dan ve server action'dan KAPALI; yalnız
  // yerel geliştirme + bilinçli ops prosedürü.
  if (!isLocalDevTooling()) {
    return fail(
      "FORBIDDEN",
      "Boş şablona sıfırlama yalnızca yerel geliştirmede kullanılabilir. Test/production ortamında veri sıfırlama bir ops prosedürüdür; panelden yapılamaz."
    );
  }
  try {
    await resetToCleanTemplate();
    await clearFollowUpCases(ctx.tenantId);
    await clearNotifications(ctx.tenantId);
    await clearAnnouncements(ctx.tenantId);
    await clearAssessments(ctx.tenantId);
    await clearAvailabilityRequests(ctx.tenantId);
    await clearHomework(ctx.tenantId);
    await clearTeachingMaterials(ctx.tenantId);
    await clearTeacherFeedback(ctx.tenantId);
    await clearStudentFeedback(ctx.tenantId);
    await clearTasksForTenant(ctx.tenantId);
    audit(ctx, "setup.reset_clean_template", "Tenant", ctx.tenantId);
    return ok({ reset: true });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "resetToCleanTemplate failed");
  }
}

/**
 * @deprecated Prefer `@/lib/agent` listToolDefinitions / TOOL_REGISTRY.
 * Kept for backward-compatible imports.
 */

/** TEACHER kendi öğrencisine, SCHOOL_ADMIN/SUPER_ADMIN kurumundaki herhangi bir öğrenciye müfredat konusu ekler. */
export async function createCurriculumTopicTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ topicId: string }>> {
  const auth = requireRole(ctx, ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  if (ctx.role === "TEACHER" && !ctx.teacherId) {
    return fail("FORBIDDEN", "Öğretmen kimliği bulunamadı.");
  }

  const v = parseOrFail(createCurriculumTopicSchema, input);
  if (!v.ok) return v;

  const student = await readStudentById(v.data.studentId);
  const access = await assertStudentAccess(ctx, student, v.data.studentId);
  if (!access.ok) return fail(access.code, access.message);

  try {
    const topic = await createCurriculumTopic({
      tenantId: ctx.tenantId,
      studentId: v.data.studentId,
      // Admin'in kendi teacherId'si yok — konu, öğrencinin kendi öğretmenine atanır (sahiplik değişmez).
      teacherId: ctx.teacherId ?? student!.teacherId,
      title: v.data.title,
      description: v.data.description,
      status: v.data.status,
      sortOrder: v.data.sortOrder,
      notes: v.data.notes,
      createdBy: ctx.userId,
    });
    audit(ctx, "curriculum.create", "StudentCurriculumTopic", topic.id, {
      studentId: v.data.studentId,
    });
    return ok({ topicId: topic.id });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "createCurriculumTopic failed");
  }
}

/** TEACHER kendi öğrencisinin, SCHOOL_ADMIN/SUPER_ADMIN kurumundaki herhangi bir konuyu günceller. */
export async function updateCurriculumTopicTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ topicId: string }>> {
  const auth = requireRole(ctx, ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  if (ctx.role === "TEACHER" && !ctx.teacherId) {
    return fail("FORBIDDEN", "Öğretmen kimliği bulunamadı.");
  }

  const v = parseOrFail(updateCurriculumTopicSchema, input);
  if (!v.ok) return v;

  const existing = await getCurriculumTopic(ctx.tenantId, v.data.topicId);
  if (!existing) return fail("NOT_FOUND", "Konu bulunamadı");
  if (ctx.role === "TEACHER" && existing.teacherId !== ctx.teacherId) {
    return fail("FORBIDDEN", "Yalnızca kendi oluşturduğunuz konuları güncelleyebilirsiniz.");
  }

  const student = await readStudentById(existing.studentId);
  const access = await assertStudentAccess(ctx, student, existing.studentId);
  if (!access.ok) return fail(access.code, access.message);

  try {
    const { topicId, ...patch } = v.data;
    const updated = await updateCurriculumTopic(ctx.tenantId, topicId, {
      ...patch,
      updatedBy: ctx.userId,
    });
    if (!updated) return fail("NOT_FOUND", "Konu bulunamadı");
    audit(ctx, "curriculum.update", "StudentCurriculumTopic", topicId, {
      status: patch.status,
    });
    return ok({ topicId });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "updateCurriculumTopic failed");
  }
}

const BULK_CURRICULUM_MAX_RECORDS = 20_000;

/**
 * TEACHER (yalnız kendi öğrencileri) / SCHOOL_ADMIN / SUPER_ADMIN — seçilen
 * öğrenci grubuna aynı konu listesini tek seferde atar. Sunucuda döngüyle
 * mevcut tekil create endpoint'ini N kez ÇAĞIRMAZ — tek istek, tek
 * store round-trip'i (`bulkCreateCurriculumTopics`). Erişilemeyen/bulunamayan
 * öğrenciler sessizce atlanır (sayısı döner, kimliği/tenant'ı döndürülmez);
 * aynı öğrenci+başlık zaten varsa yeni kayıt oluşturulmaz.
 */
export async function bulkAssignCurriculumTopicsTool(
  ctx: ServiceContext,
  input: unknown
): Promise<
  ServiceResult<{
    requestedStudents: number;
    requestedTopics: number;
    created: number;
    skippedInaccessible: number;
    skippedExisting: number;
  }>
> {
  const auth = requireRole(ctx, ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  if (ctx.role === "TEACHER" && !ctx.teacherId) {
    return fail("FORBIDDEN", "Öğretmen kimliği bulunamadı.");
  }

  const v = parseOrFail(bulkAssignCurriculumTopicsSchema, input);
  if (!v.ok) return v;

  const uniqueStudentIds = [...new Set(v.data.studentIds)];
  const totalRecords = uniqueStudentIds.length * v.data.topics.length;
  if (totalRecords > BULK_CURRICULUM_MAX_RECORDS) {
    return fail(
      "VALIDATION_ERROR",
      `Toplam kayıt sayısı (${totalRecords}) izin verilen ${BULK_CURRICULUM_MAX_RECORDS} sınırını aşıyor.`
    );
  }

  const data = await readReferenceData();
  const assignments: { studentId: string; teacherId: string }[] = [];
  let skippedInaccessible = 0;
  for (const studentId of uniqueStudentIds) {
    const student = data.students.find((s) => s.id === studentId);
    const access = await assertStudentAccess(ctx, student, studentId);
    if (!access.ok || !student) {
      skippedInaccessible += 1;
      continue;
    }
    assignments.push({ studentId, teacherId: ctx.teacherId ?? student.teacherId });
  }

  try {
    const result =
      assignments.length > 0
        ? await bulkCreateCurriculumTopics({
            tenantId: ctx.tenantId,
            createdBy: ctx.userId,
            assignments,
            topics: v.data.topics,
          })
        : { created: 0, skippedExisting: 0 };

    audit(ctx, "curriculum.bulk_assign", "StudentCurriculumTopic", ctx.tenantId, {
      requestedStudents: uniqueStudentIds.length,
      requestedTopics: v.data.topics.length,
      created: result.created,
      skippedInaccessible,
      skippedExisting: result.skippedExisting,
    });

    return ok({
      requestedStudents: uniqueStudentIds.length,
      requestedTopics: v.data.topics.length,
      created: result.created,
      skippedInaccessible,
      skippedExisting: result.skippedExisting,
    });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "bulkCreateCurriculumTopics failed");
  }
}

/**
 * TEACHER/PARENT/STUDENT/admin — öğrenci müfredat listesi + genel ilerleme.
 * PARENT/STUDENT özet (history/notes yok); TEACHER/admin tam kayıt.
 */
export async function listCurriculumForStudentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<
  ServiceResult<{
    topics: StudentCurriculumTopic[] | ReturnType<typeof toCurriculumSummary>[];
    overallPercent: number;
    progressExplanation: string;
  }>
> {
  const v = parseOrFail(z.object({ studentId: z.string().min(1) }), input);
  if (!v.ok) return v;

  try {
    const student = await readStudentById(v.data.studentId);
    const access = await assertStudentAccess(ctx, student, v.data.studentId);
    if (!access.ok) return fail(access.code, access.message);

    const topics = await listCurriculumTopicsForStudent(ctx.tenantId, v.data.studentId);
    const overallPercent = computeOverallCurriculumProgress(topics);
    const progressExplanation =
      topics.length === 0
        ? "Henüz konu tanımlanmadı; genel ilerleme 0%."
        : `Genel ilerleme, ${topics.length} konunun progressPercent değerlerinin aritmetik ortalamasıdır (eşit ağırlık).`;

    if (ctx.role === "STUDENT") {
      return ok({
        topics: topics.map(toCurriculumSummary),
        overallPercent,
        progressExplanation,
      });
    }
    return ok({ topics, overallPercent, progressExplanation });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "listCurriculumForStudent failed");
  }
}


/** PRODUCT_BACKLOG — soft archive / restore (hard delete yok) */
export async function archiveStudentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ studentId: string; archived: boolean }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(archiveStudentSchema, input);
  if (!v.ok) return v;
  try {
    const student = await readStudentById(v.data.studentId);
    if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı");
    await updateStudentProfile(v.data.studentId, {
      active: !v.data.archived,
      archivedAt: v.data.archived ? new Date().toISOString() : undefined,
    });
    audit(ctx, v.data.archived ? "student.archive" : "student.restore", "Student", v.data.studentId, {});
    return ok({ studentId: v.data.studentId, archived: v.data.archived });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "archiveStudent failed");
  }
}

export type StudentDeletionImpact = {
  studentId: string;
  name: string;
  displayId?: string;
  active: boolean;
  deletedAt?: string;
  contractCount: number;
  hasCurrentContract: boolean;
  paymentCount: number;
  outstandingAmount: number;
  collectedAmount: number;
  lessonCount: number;
  upcomingLessonCount: number;
  documentCount: number;
  attendanceCount: number;
  /** Yalnız hiçbir bağlı kaydı yoksa (boş/deneme öğrenci) kalıcı silme mümkündür. */
  hardDeleteEligible: boolean;
  criticalPasswordConfigured: boolean;
};

async function computeStudentDeletionImpact(tenantId: string, studentId: string): Promise<StudentDeletionImpact | null> {
  const data = await readData();
  const student = data.students.find((s) => s.id === studentId);
  if (!student) return null;
  const { listContractsForStudent } = await import("../contracts");
  const { listDocumentsForStudent } = await import("../documents");
  const { getCriticalActionPasswordStatus } = await import("../critical-action-password");
  const { selectCurrentContract } = await import("../contract-list-helpers");
  const { isLiveObligation, collectedAmountOf } = await import("../payment-profile");
  const { isTerminalContractStatus } = await import("../contract-list-helpers");
  const [contracts, documents, pw] = await Promise.all([
    listContractsForStudent(tenantId, studentId),
    listDocumentsForStudent(tenantId, studentId),
    getCriticalActionPasswordStatus(tenantId),
  ]);
  const payments = data.payments.filter((p) => p.studentId === studentId);
  const lessons = data.lessons.filter((l) => l.studentId === studentId);
  const nowMs = Date.now();
  const attendanceCount = data.attendances.filter((a) => a.studentId === studentId).length;
  const linked =
    contracts.length +
    payments.length +
    lessons.length +
    documents.length +
    attendanceCount +
    data.lessonSeries.filter((l) => l.studentId === studentId).length +
    data.makeupRequests.filter((m) => m.studentId === studentId).length;
  return {
    studentId,
    name: student.name,
    displayId: student.displayId,
    active: student.active,
    deletedAt: student.deletedAt,
    contractCount: contracts.length,
    hasCurrentContract: selectCurrentContract(contracts) !== null,
    paymentCount: payments.length,
    outstandingAmount: payments
      .filter((p) => isLiveObligation(p, new Set(contracts.filter((c) => isTerminalContractStatus(c.status)).map((c) => c.id))))
      .reduce((sum, p) => sum + Math.max(0, p.amount - p.paidAmount), 0),
    collectedAmount: payments.reduce((sum, p) => sum + collectedAmountOf(p), 0),
    lessonCount: lessons.length,
    upcomingLessonCount: lessons.filter((l) => l.status === "scheduled" && new Date(l.startAt).getTime() > nowMs).length,
    documentCount: documents.length,
    attendanceCount,
    hardDeleteEligible: linked === 0,
    criticalPasswordConfigured: pw.configured,
  };
}

/** Kurum sahibi — silme öncesi etki özeti (yalnız okuma). */
export async function getStudentDeletionImpactTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<StudentDeletionImpact>> {
  const auth = requireRole(ctx, CRITICAL_ROLES_FOR_TOOLS);
  if (!auth.ok) return fail("FORBIDDEN", "Öğrenci silme yalnız kurum sahibi ve kurum yöneticileri tarafından başlatılabilir.");
  const v = parseOrFail(z.object({ studentId: z.string().min(1) }), input);
  if (!v.ok) return v;
  const impact = await computeStudentDeletionImpact(ctx.tenantId, v.data.studentId);
  if (!impact) return fail("NOT_FOUND", "Öğrenci bulunamadı.");
  return ok(impact);
}

const deleteStudentSchema = z.object({
  studentId: z.string().min(1),
  /** "soft" = geri alınabilir silme (varsayılan). "hard" = kalıcı, yalnız bağlı kaydı olmayan öğrenci. */
  mode: z.enum(["soft", "hard"]),
  /** Kullanıcı öğrencinin ad soyadını AYNEN yazar — yanlış öğrenciyi silmeye karşı. */
  confirmationName: z.string().max(200),
  criticalPassword: z.string().max(200),
  reason: z.string().trim().min(5, "Silme gerekçesi en az 5 karakter olmalı.").max(500),
});

function sameName(a: string, b: string): boolean {
  const norm = (x: string) => x.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr");
  return norm(a) === norm(b);
}

/**
 * Kurum sahibi — öğrenci silme. İki kapı: ad soyad teyidi + kritik işlem şifresi.
 * "soft": öğrenci pasife alınır ve silindi işaretlenir; sözleşme/ödeme/evrak/audit
 * korunur, Silinenler'den geri alınabilir. "hard": yalnız hiçbir bağlı kaydı olmayan
 * öğrenci için; geri alınamaz. Her deneme (başarılı/reddedilen) audit'e yazılır.
 */
export async function deleteStudentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ studentId: string; mode: "soft" | "hard" }>> {
  const auth = requireRole(ctx, CRITICAL_ROLES_FOR_TOOLS);
  if (!auth.ok) return fail("FORBIDDEN", "Öğrenci silme yalnız kurum sahibi ve kurum yöneticileri tarafından başlatılabilir.");
  const v = parseOrFail(deleteStudentSchema, input);
  if (!v.ok) return v;
  const impact = await computeStudentDeletionImpact(ctx.tenantId, v.data.studentId);
  if (!impact) return fail("NOT_FOUND", "Öğrenci bulunamadı.");

  const deny = async (reasonCode: string, message: string) => {
    await recordAuditLog({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      action: `student.delete_${v.data.mode}`,
      entityType: "Student",
      entityId: v.data.studentId,
      outcome: "denied",
      meta: { reasonCode },
    });
    return fail("FORBIDDEN", message);
  };

  if (!sameName(v.data.confirmationName, impact.name)) {
    return deny("confirmation_mismatch", `Onay için öğrencinin adını aynen yazın: "${impact.name}".`);
  }
  const gate = await checkCriticalPassword(ctx, v.data.criticalPassword);
  if (!gate.ok) return deny(gate.reasonCode, gate.message);
  if (v.data.mode === "hard" && !impact.hardDeleteEligible) {
    return deny(
      "hard_delete_blocked",
      "Bu öğrencinin sözleşme, ödeme, ders, yoklama veya evrak kaydı var; kalıcı silinemez. Geri alınabilir silmeyi kullanın."
    );
  }

  const meta = {
    mode: v.data.mode,
    displayId: impact.displayId,
    contractCount: impact.contractCount,
    hasCurrentContract: impact.hasCurrentContract,
    paymentCount: impact.paymentCount,
    outstandingAmount: impact.outstandingAmount,
    lessonCount: impact.lessonCount,
    documentCount: impact.documentCount,
    reason: v.data.reason,
    entityName: impact.name,
  };
  try {
    if (v.data.mode === "hard") {
      await hardDeleteStudent(v.data.studentId);
    } else {
      await setStudentDeletion(v.data.studentId, {
        deletedAt: new Date().toISOString(),
        deletedByUserId: ctx.userId,
        deletionReason: v.data.reason,
      });
    }
  } catch (e) {
    if (e instanceof Error && e.message === "STUDENT_HAS_LINKED_RECORDS") {
      return fail("CONFLICT", "Öğrencinin bağlı kayıtları var; kalıcı silinemez. Geri alınabilir silmeyi kullanın.");
    }
    logger.error("deleteStudentTool failed", e);
    return fail("INTERNAL_ERROR", "Öğrenci silinemedi; hiçbir kayıt değişmedi. Tekrar deneyin.");
  }
  // Silme audit'i beklenir — kim/ne zaman/hangi etkiyle kaydı kaybolmaz.
  await recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: `student.delete_${v.data.mode}`,
    entityType: "Student",
    entityId: v.data.studentId,
    outcome: "success",
    meta,
  });
  return ok({ studentId: v.data.studentId, mode: v.data.mode });
}

/** Kurum sahibi — geri alınabilir silmeyi geri alır. Öğrenci pasif döner; ayrıca aktifleştirilir. */
export async function restoreDeletedStudentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ studentId: string }>> {
  const auth = requireRole(ctx, CRITICAL_ROLES_FOR_TOOLS);
  if (!auth.ok) return fail("FORBIDDEN", "Silinen öğrenciyi yalnız kurum sahibi ve kurum yöneticileri geri alabilir.");
  const v = parseOrFail(z.object({ studentId: z.string().min(1) }), input);
  if (!v.ok) return v;
  const student = await readStudentById(v.data.studentId);
  if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı.");
  if (!student.deletedAt) return fail("VALIDATION_ERROR", "Bu öğrenci silinmiş değil.");
  await setStudentDeletion(v.data.studentId, null);
  await recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: "student.delete_restore",
    entityType: "Student",
    entityId: v.data.studentId,
    outcome: "success",
    meta: { displayId: student.displayId, deletedAt: student.deletedAt, entityName: student.name },
  });
  return ok({ studentId: v.data.studentId });
}

/**
 * 2026-10-03 (owner) — pasif öğretmeni sistemden kaldırma. Üç işlem AYRIDIR:
 * - "Listeden kaldırma" (soft, varsayılan): öğretmen tüm listelerden ve yeni seçimlerden çıkar, giriş hesabı
 *   kapanır; satır kalır → geçmiş ders/yoklama/hakediş ve raporlar adı göstermeye devam eder; geri alınabilir.
 * - "Kalıcı silme" (hard): yalnız hiçbir bağlı kaydı (ders, seri, telafi, öğrenci, ücret kuralı, hakediş,
 *   deneme dersi) olmayan öğretmen; geri alınamaz.
 * - "Kişisel veri silme" (KVKK — iletişim/kimlik alanlarının silinmesi/anonimleştirilmesi) BU İŞLEM DEĞİLDİR;
 *   yasal saklama yükümlülükleri (hakediş/ödeme kayıtları) değerlendirilerek ayrı talep ve onayla yapılır.
 */
export type TeacherDeletionImpact = {
  teacherId: string;
  name: string;
  displayId?: string;
  active: boolean;
  deletedAt?: string;
  lessonCount: number;
  /** İleri tarihli planlı/başlamış ders — varsa silinemez (önce taşı/iptal et). */
  upcomingLessonCount: number;
  activeSeriesCount: number;
  /** Bu öğretmene atanmış aktif öğrenci — varsa silinemez (önce başka öğretmene ata). */
  activeStudentCount: number;
  studentCount: number;
  payoutCount: number;
  /** Ödenmemiş (bekleyen/kısmi) hakediş — varsa silinemez (önce öde veya iptal et). */
  openPayoutCount: number;
  feeRuleCount: number;
  makeupRequestCount: number;
  trialLessonCount: number;
  hasLoginAccount: boolean;
  /** Listeden kaldırmayı engelleyen nedenler (boşsa kaldırılabilir). */
  blockers: string[];
  hardDeleteEligible: boolean;
  criticalPasswordConfigured: boolean;
};

async function computeTeacherDeletionImpact(tenantId: string, teacherId: string): Promise<TeacherDeletionImpact | null> {
  const data = await readData();
  const teacher = data.teachers.find((t) => t.id === teacherId);
  if (!teacher) return null;
  const { getCriticalActionPasswordStatus } = await import("../critical-action-password");
  const { listTrialLessons } = await import("../trial-lessons");
  const { getUserIdByTeacherId } = await import("../auth/users");
  const [pw, trials, userId] = await Promise.all([
    getCriticalActionPasswordStatus(tenantId),
    listTrialLessons(tenantId),
    getUserIdByTeacherId(tenantId, teacherId),
  ]);
  const nowIso = new Date().toISOString();
  const lessons = data.lessons.filter((l) => l.teacherId === teacherId);
  const upcomingLessonCount = lessons.filter((l) => (l.status === "scheduled" || l.status === "in_progress") && l.startAt > nowIso).length;
  const activeSeriesCount = data.lessonSeries.filter((s) => s.teacherId === teacherId && s.status === "active").length;
  const students = data.students.filter((s) => s.teacherId === teacherId);
  const activeStudentCount = students.filter((s) => s.active && !s.deletedAt).length;
  const payouts = data.teacherPayouts.filter((p) => p.teacherId === teacherId);
  const openPayoutCount = payouts.filter((p) => p.status === "pending" || p.status === "partial").length;
  const feeRuleCount = data.teacherFeeRules.filter((r) => r.teacherId === teacherId).length;
  const makeupRequestCount = data.makeupRequests.filter((m) => m.teacherId === teacherId).length;
  const trialLessonCount = trials.filter((t) => t.teacherId === teacherId).length;
  const blockers: string[] = [];
  if (teacher.active !== false) blockers.push('Öğretmen aktif. Önce öğretmen sayfasında "Pasife al" deyin.');
  if (upcomingLessonCount > 0) blockers.push(`İleri tarihli ${upcomingLessonCount} planlı dersi var. Önce Ders Programı'nda başka öğretmene taşıyın veya iptal edin.`);
  if (activeSeriesCount > 0) blockers.push(`${activeSeriesCount} aktif ders serisi var. Önce Ders Programı'nda seriyi sonlandırın veya başka öğretmene devredin.`);
  if (activeStudentCount > 0) blockers.push(`${activeStudentCount} aktif öğrencinin öğretmeni. Önce Öğrenciler ekranında bu öğrencileri başka öğretmene atayın.`);
  if (openPayoutCount > 0) blockers.push(`Ödenmemiş ${openPayoutCount} hakedişi var. Önce Hakedişler ekranında ödeyin veya iptal edin.`);
  return {
    teacherId,
    name: teacher.name,
    displayId: teacher.displayId,
    active: teacher.active !== false,
    deletedAt: teacher.deletedAt,
    lessonCount: lessons.length,
    upcomingLessonCount,
    activeSeriesCount,
    activeStudentCount,
    studentCount: students.length,
    payoutCount: payouts.length,
    openPayoutCount,
    feeRuleCount,
    makeupRequestCount,
    trialLessonCount,
    hasLoginAccount: userId !== null,
    blockers,
    hardDeleteEligible:
      blockers.length === 0 &&
      lessons.length + data.lessonSeries.filter((s) => s.teacherId === teacherId).length + students.length + payouts.length + feeRuleCount + makeupRequestCount + trialLessonCount === 0,
    criticalPasswordConfigured: pw.configured,
  };
}

/** Öğretmen silme öncesi etki özeti (yalnız okuma). */
export async function getTeacherDeletionImpactTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<TeacherDeletionImpact>> {
  const auth = requireRole(ctx, CRITICAL_ROLES_FOR_TOOLS);
  if (!auth.ok) return fail("FORBIDDEN", "Öğretmen silme yalnız kurum sahibi ve kurum yöneticileri tarafından başlatılabilir.");
  const v = parseOrFail(z.object({ teacherId: z.string().min(1) }), input);
  if (!v.ok) return v;
  const impact = await computeTeacherDeletionImpact(ctx.tenantId, v.data.teacherId);
  if (!impact) return fail("NOT_FOUND", "Öğretmen bulunamadı.");
  return ok(impact);
}

const deleteTeacherSchema = z.object({
  teacherId: z.string().min(1),
  mode: z.enum(["soft", "hard"]),
  confirmationName: z.string().max(200),
  criticalPassword: z.string().max(200),
  reason: z.string().trim().min(5, "Silme gerekçesi en az 5 karakter olmalı.").max(500),
});

/**
 * Pasif öğretmeni kaldırır (bkz. TeacherDeletionImpact yorumu). İki kapı: ad soyad teyidi + kritik işlem
 * şifresi; engelleyen bağımlılık varsa (aktif, ileri tarihli ders, aktif seri/öğrenci, ödenmemiş hakediş)
 * hiçbir şey yazılmaz ve neden gösterilir. Giriş hesabı kapatılır. Her deneme audit'e yazılır.
 */
export async function deleteTeacherTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ teacherId: string; mode: "soft" | "hard" }>> {
  const auth = requireRole(ctx, CRITICAL_ROLES_FOR_TOOLS);
  if (!auth.ok) return fail("FORBIDDEN", "Öğretmen silme yalnız kurum sahibi ve kurum yöneticileri tarafından başlatılabilir.");
  const v = parseOrFail(deleteTeacherSchema, input);
  if (!v.ok) return v;
  const impact = await computeTeacherDeletionImpact(ctx.tenantId, v.data.teacherId);
  if (!impact || impact.deletedAt) return fail("NOT_FOUND", "Öğretmen bulunamadı veya zaten listeden kaldırılmış; sayfayı yenileyin.");

  const deny = async (reasonCode: string, message: string) => {
    await recordAuditLog({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      action: `teacher.delete_${v.data.mode}`,
      entityType: "Teacher",
      entityId: v.data.teacherId,
      outcome: "denied",
      meta: { reasonCode },
    });
    return fail("FORBIDDEN", message);
  };

  if (!sameName(v.data.confirmationName, impact.name)) {
    return deny("confirmation_mismatch", `Onay için öğretmenin adını aynen yazın: "${impact.name}".`);
  }
  const gate = await checkCriticalPassword(ctx, v.data.criticalPassword);
  if (!gate.ok) return deny(gate.reasonCode, gate.message);
  if (impact.blockers.length > 0) return deny("blocked_by_dependencies", impact.blockers.join(" "));
  if (v.data.mode === "hard" && !impact.hardDeleteEligible) {
    return deny(
      "hard_delete_blocked",
      "Bu öğretmenin geçmiş ders, öğrenci, hakediş, ücret kuralı, telafi veya deneme dersi kaydı var; kalıcı silinemez. Listeden kaldırmayı kullanın — kayıtlar ve raporlardaki adı korunur."
    );
  }

  try {
    if (v.data.mode === "hard") {
      await hardDeleteTeacher(v.data.teacherId);
    } else {
      await setTeacherDeletion(v.data.teacherId, { deletedAt: new Date().toISOString(), deletedByUserId: ctx.userId, deletionReason: v.data.reason });
    }
  } catch (e) {
    if (e instanceof Error && e.message === "TEACHER_HAS_LINKED_RECORDS") {
      return fail("CONFLICT", "Öğretmenin bağlı kayıtları var; kalıcı silinemez. Listeden kaldırmayı kullanın.");
    }
    logger.error("deleteTeacherTool failed", e);
    return fail("INTERNAL_ERROR", "Öğretmen kaldırılamadı; hiçbir kayıt değişmedi. Tekrar deneyin.");
  }
  // Kaldırılan öğretmen artık giriş yapamaz (açık oturumları da düşer — oturum geçerlilik kontrolü `active`).
  let loginClosed = false;
  try {
    const { getUserIdByTeacherId, setUserActive } = await import("../auth/users");
    const userId = await getUserIdByTeacherId(ctx.tenantId, v.data.teacherId);
    if (userId) {
      loginClosed = await setUserActive(userId, false);
      const { invalidateSessionValidity } = await import("../auth/session-validity");
      invalidateSessionValidity(userId);
    }
  } catch (e) {
    logger.error("deleteTeacherTool: giriş hesabı kapatılamadı", e);
  }
  await recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: `teacher.delete_${v.data.mode}`,
    entityType: "Teacher",
    entityId: v.data.teacherId,
    outcome: "success",
    meta: {
      mode: v.data.mode,
      entityName: impact.name,
      displayId: impact.displayId,
      lessonCount: impact.lessonCount,
      payoutCount: impact.payoutCount,
      studentCount: impact.studentCount,
      loginClosed,
      reason: v.data.reason,
    },
  });
  return ok({ teacherId: v.data.teacherId, mode: v.data.mode });
}

/** Listeden kaldırmayı geri alır; öğretmen PASİF döner (ayrıca aktifleştirilir), giriş hesabı kapalı kalır. */
export async function restoreDeletedTeacherTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ teacherId: string }>> {
  const auth = requireRole(ctx, CRITICAL_ROLES_FOR_TOOLS);
  if (!auth.ok) return fail("FORBIDDEN", "Kaldırılan öğretmeni yalnız kurum sahibi ve kurum yöneticileri geri alabilir.");
  const v = parseOrFail(z.object({ teacherId: z.string().min(1) }), input);
  if (!v.ok) return v;
  const teacher = (await readData()).teachers.find((t) => t.id === v.data.teacherId);
  if (!teacher) return fail("NOT_FOUND", "Öğretmen bulunamadı.");
  if (!teacher.deletedAt) return fail("VALIDATION_ERROR", "Bu öğretmen listeden kaldırılmış değil.");
  await setTeacherDeletion(v.data.teacherId, null);
  await recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: "teacher.restore_deleted",
    entityType: "Teacher",
    entityId: v.data.teacherId,
    outcome: "success",
    meta: { displayId: teacher.displayId, deletedAt: teacher.deletedAt, entityName: teacher.name },
  });
  return ok({ teacherId: v.data.teacherId });
}

const bulkStudentActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("branch"), studentIds: z.array(z.string().min(1)).min(1).max(500), branchId: z.string().min(1) }),
  z.object({
    action: z.literal("teacher"),
    studentIds: z.array(z.string().min(1)).min(1).max(500),
    teacherId: z.string().min(1),
    /** true: öğrencinin gelecekteki planlı dersleri de yeni öğretmene devredilir (çakışma kontrolüyle). */
    transferLessons: z.boolean().optional(),
  }),
  z.object({ action: z.literal("instrument"), studentIds: z.array(z.string().min(1)).min(1).max(500), instrument: z.string().min(1).max(80) }),
  z.object({ action: z.literal("package"), studentIds: z.array(z.string().min(1)).min(1).max(500), packageId: z.string().min(1) }),
  z.object({ action: z.literal("deactivate"), studentIds: z.array(z.string().min(1)).min(1).max(500) }),
  z.object({ action: z.literal("activate"), studentIds: z.array(z.string().min(1)).min(1).max(500) }),
  z.object({
    action: z.literal("soft_delete"),
    studentIds: z.array(z.string().min(1)).min(1).max(500),
    criticalPassword: z.string().max(200),
    reason: z.string().trim().min(5, "Silme gerekçesi en az 5 karakter olmalı.").max(500),
  }),
  z.object({ action: z.literal("restore"), studentIds: z.array(z.string().min(1)).min(1).max(500) }),
]);

export type BulkStudentActionResult = {
  bulkId: string;
  updated: string[];
  skipped: { studentId: string; name: string; message: string }[];
  /** Öğretmen değişikliğinde "planlı dersleri de devret" seçildiyse. */
  lessonsTransferred?: number;
  lessonIssues?: { studentId: string; name: string; message: string }[];
};

const BULK_ACTION_LABELS: Record<string, string> = {
  branch: "şube değişikliği",
  teacher: "öğretmen değişikliği",
  instrument: "enstrüman değişikliği",
  package: "paket değişikliği",
  deactivate: "pasife alma",
  activate: "aktifleştirme",
  soft_delete: "silinenlere taşıma",
  restore: "silinenlerden geri alma",
};

/**
 * E — Öğrenciler ekranı toplu işlem. Her öğrenci ayrı ayrı doğrulanır ve ayrı
 * audit satırı alır (öğrencinin kendi değişiklik geçmişinde görünür); ayrıca
 * işlemin tamamı için tek özet satırı yazılır. Bir öğrencideki hata diğerlerini
 * durdurmaz — atlananlar gerekçesiyle döner. Silme kritik işlem şifresi ister;
 * kalıcı silme toplu yapılamaz (yalnız tekil, bağlı kaydı olmayan öğrencide).
 * Planlanmış dersler bu işlemle DEĞİŞMEZ (öğretmen/şube değişikliği yalnız öğrenci kartı).
 */
export async function bulkStudentActionTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<BulkStudentActionResult>> {
  const auth = requireRole(ctx, CRITICAL_ROLES_FOR_TOOLS);
  if (!auth.ok) return fail("FORBIDDEN", "Toplu işlem yalnız kurum sahibi ve kurum yöneticileri tarafından yapılabilir.");
  const v = parseOrFail(bulkStudentActionSchema, input);
  if (!v.ok) return v;
  const req = v.data;
  const data = await readData();
  const bulkId = uid("bulk");
  const ids = Array.from(new Set(req.studentIds));
  const targets = ids.map((id) => data.students.find((s) => s.id === id));
  if (targets.some((t) => !t)) {
    return fail("NOT_FOUND", "Seçilen öğrencilerden bazıları bulunamadı (silinmiş veya başka kuruma ait olabilir). Listeyi yenileyip tekrar seçin.");
  }

  // Hedef değerin doğrulaması — tek sefer, öğrenci döngüsünden önce.
  if (req.action === "branch" && !data.settings.branches.some((b) => b.id === req.branchId)) {
    return fail("VALIDATION_ERROR", "Seçilen şube bulunamadı. Şube listesini yenileyip tekrar seçin.");
  }
  const teacher = req.action === "teacher" ? data.teachers.find((t) => t.id === req.teacherId) : undefined;
  if (req.action === "teacher" && (!teacher || !isTeacherSchedulable(teacher))) {
    return fail("VALIDATION_ERROR", "Seçilen öğretmen bulunamadı veya pasif. Aktif bir öğretmen seçin.");
  }
  if (req.action === "instrument") {
    const activeInstruments = await resolveActiveInstrumentNames(ctx.tenantId);
    if (!activeInstruments.includes(req.instrument)) {
      return fail("VALIDATION_ERROR", `"${req.instrument}" aktif enstrüman kataloğunda yok. Enstrümanlar ekranından ekleyin veya aktifleştirin.`);
    }
  }
  if (req.action === "package" && !data.packages?.some((p) => p.id === req.packageId && p.status === "active")) {
    return fail("VALIDATION_ERROR", "Seçilen paket bulunamadı veya arşivlenmiş. Paketler ekranından aktif bir paket seçin.");
  }
  if (req.action === "soft_delete") {
    const gate = await checkCriticalPassword(ctx, req.criticalPassword);
    if (!gate.ok) {
      await recordAuditLog({
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        actorRole: ctx.role,
        action: "student.bulk_update",
        entityType: "Student",
        entityId: bulkId,
        outcome: "denied",
        meta: { bulkAction: req.action, count: ids.length, reasonCode: gate.reasonCode },
      });
      return fail("FORBIDDEN", gate.message);
    }
  }

  const updated: string[] = [];
  const skipped: BulkStudentActionResult["skipped"] = [];
  let lessonsTransferred = 0;
  const lessonIssues: NonNullable<BulkStudentActionResult["lessonIssues"]> = [];
  const now = new Date().toISOString();
  for (const student of targets as Student[]) {
    const skip = (message: string) => skipped.push({ studentId: student.id, name: student.name, message });
    try {
      let patch: StudentProfilePatch | null = null;
      switch (req.action) {
        case "branch":
          if (student.branchId === req.branchId) { skip("Zaten bu şubede."); continue; }
          patch = { branchId: req.branchId };
          break;
        case "teacher":
          if (student.teacherId === req.teacherId) { skip("Zaten bu öğretmende."); continue; }
          if (!student.instruments.some((i) => teacher!.instruments.includes(i))) {
            skip(`${teacher!.name} bu öğrencinin enstrümanını (${student.instruments.join(", ")}) öğretmiyor.`);
            continue;
          }
          patch = { teacherId: req.teacherId };
          break;
        case "instrument":
          if (student.instruments.length === 1 && student.instruments[0] === req.instrument) { skip("Enstrümanı zaten bu."); continue; }
          {
            const current = data.teachers.find((t) => t.id === student.teacherId);
            if (current && !current.instruments.includes(req.instrument as Instrument)) {
              skip(`Öğretmeni ${current.name} "${req.instrument}" öğretmiyor; önce öğretmen değiştirin.`);
              continue;
            }
          }
          patch = { instruments: [req.instrument as Instrument] };
          break;
        case "package": {
          if (student.packageId === req.packageId) { skip("Paketi zaten bu."); continue; }
          if (!student.lessonDurationMinutes) {
            skip("Ders süresi girilmemiş; paket ücreti hesaplanamaz. Önce öğrencinin ders süresini girin.");
            continue;
          }
          const repriced = await updateStudentPaymentProfileTool(ctx, { studentId: student.id, packageId: req.packageId });
          if (!repriced.ok) { skip(repriced.error.message); continue; }
          break;
        }
        case "deactivate":
          if (!student.active) { skip("Zaten pasif."); continue; }
          patch = { active: false, archivedAt: now };
          break;
        case "activate":
          if (student.active) { skip("Zaten aktif."); continue; }
          if (student.deletedAt) { skip("Silinenlerde; önce geri alın."); continue; }
          patch = { active: true, archivedAt: undefined };
          break;
        case "soft_delete":
          if (student.deletedAt) { skip("Zaten silinenlerde."); continue; }
          await setStudentDeletion(student.id, { deletedAt: now, deletedByUserId: ctx.userId, deletionReason: req.reason });
          break;
        case "restore":
          if (!student.deletedAt) { skip("Silinmiş değil."); continue; }
          await setStudentDeletion(student.id, null);
          break;
      }
      if (patch) await updateStudentProfile(student.id, patch);
      updated.push(student.id);
      if (req.action === "teacher" && req.transferLessons) {
        const moved = await transferFutureLessonsToTeacher(ctx, data, student, req.teacherId);
        lessonsTransferred += moved.count;
        for (const message of moved.issues) lessonIssues.push({ studentId: student.id, name: student.name, message });
      }
      await recordAuditLog({
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        actorRole: ctx.role,
        action: req.action === "soft_delete" ? "student.delete_soft" : req.action === "restore" ? "student.delete_restore" : "student.bulk_update",
        entityType: "Student",
        entityId: student.id,
        outcome: "success",
        meta: {
          bulkId,
          bulkAction: req.action,
          entityName: student.name,
          ...(req.action === "soft_delete" ? { reason: req.reason } : {}),
          changes: patch ? diffRecordFields(student as unknown as Record<string, unknown>, patch as Record<string, unknown>) : [],
        },
      });
    } catch (e) {
      logger.error("bulkStudentActionTool item failed", e);
      skip("Beklenmeyen bir hata nedeniyle bu öğrenci güncellenemedi; diğerleri etkilenmedi.");
    }
  }

  await recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: "student.bulk_update",
    entityType: "Student",
    entityId: bulkId,
    outcome: "success",
    meta: {
      bulkAction: req.action,
      entityName: `${ids.length} öğrenci (${BULK_ACTION_LABELS[req.action]})`,
      requested: ids.length,
      updated: updated.length,
      skipped: skipped.length,
      ...(req.action === "teacher" && req.transferLessons ? { lessonsTransferred, lessonIssues: lessonIssues.length } : {}),
    },
  });
  return ok({
    bulkId,
    updated,
    skipped,
    ...(req.action === "teacher" && req.transferLessons ? { lessonsTransferred, lessonIssues } : {}),
  });
}

/**
 * Toplu öğretmen değişikliğinde öğrencinin GELECEKTEKİ planlı derslerini yeni öğretmene devreder.
 * Tekil devirle aynı yol (changeLessonTeacherOrBranchTool): çakışma/müsaitlik kontrolü, audit,
 * ilgili kişilere bildirim. Seri dersler "bu ders ve sonrası" kapsamıyla tek seferde, serisiz
 * dersler tek tek taşınır. Çakışan grup taşınmaz ve nedeni raporlanır; öğrenci kartı yine değişir.
 * Yalnız öğrencinin eski öğretmenindeki ve yeni öğretmenin verdiği enstrümandaki dersler taşınır.
 */
async function transferFutureLessonsToTeacher(
  ctx: ServiceContext,
  data: AppData,
  student: Student,
  newTeacherId: string
): Promise<{ count: number; issues: string[] }> {
  const newTeacher = data.teachers.find((t) => t.id === newTeacherId);
  const nowMs = Date.now();
  const future = data.lessons
    .filter(
      (l) =>
        l.studentId === student.id &&
        l.status === "scheduled" &&
        l.teacherId === student.teacherId &&
        l.teacherId !== newTeacherId &&
        new Date(l.startAt).getTime() > nowMs &&
        (!newTeacher || newTeacher.instruments.includes(l.instrument))
    )
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const groups: { lessonId: string; scope: "single" | "fromHereOnward"; size: number; startAt: string }[] = [];
  const seenSeries = new Set<string>();
  for (const l of future) {
    if (l.seriesId) {
      if (seenSeries.has(l.seriesId)) continue;
      seenSeries.add(l.seriesId);
      groups.push({ lessonId: l.id, scope: "fromHereOnward", size: future.filter((x) => x.seriesId === l.seriesId).length, startAt: l.startAt });
    } else {
      groups.push({ lessonId: l.id, scope: "single", size: 1, startAt: l.startAt });
    }
  }
  let count = 0;
  const issues: string[] = [];
  for (const g of groups) {
    const res = await changeLessonTeacherOrBranchTool(ctx, { lessonId: g.lessonId, scope: g.scope, newTeacherId });
    if (res.ok) count += res.data.affectedLessonIds.length;
    else
      issues.push(
        `${formatDate(g.startAt)} ${formatTime(g.startAt)}${g.size > 1 ? ` itibarıyla ${g.size} ders` : " dersi"} devredilemedi: ${res.error.message}`
      );
  }
  return { count, issues };
}

/** Kurum sahibi — kritik işlem şifresini belirler/değiştirir. Değiştirmede mevcut şifre zorunlu. */
export async function setCriticalActionPasswordTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ configured: true }>> {
  const auth = requireRole(ctx, ["SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", "Kritik işlem şifresini yalnız kurum sahibi belirleyebilir.");
  const { CRITICAL_PASSWORD_MIN_LENGTH, getCriticalActionPasswordStatus, setCriticalActionPassword, verifyCriticalActionPassword } =
    await import("../critical-action-password");
  const v = parseOrFail(
    z.object({
      newPassword: z.string().min(CRITICAL_PASSWORD_MIN_LENGTH, `Şifre en az ${CRITICAL_PASSWORD_MIN_LENGTH} karakter olmalı.`).max(200),
      currentPassword: z.string().max(200).optional(),
    }),
    input
  );
  if (!v.ok) return v;
  const status = await getCriticalActionPasswordStatus(ctx.tenantId);
  if (status.configured && !(await verifyCriticalActionPassword(ctx.tenantId, v.data.currentPassword ?? ""))) {
    await recordAuditLog({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      action: "security.critical_password_change",
      entityType: "School",
      entityId: ctx.tenantId,
      outcome: "denied",
    });
    return fail("FORBIDDEN", "Mevcut kritik işlem şifresi yanlış. Şifre değiştirilmedi.");
  }
  await setCriticalActionPassword(ctx.tenantId, v.data.newPassword, ctx.userId);
  await recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: status.configured ? "security.critical_password_change" : "security.critical_password_set",
    entityType: "School",
    entityId: ctx.tenantId,
    outcome: "success",
  });
  return ok({ configured: true });
}

const saveStudentListViewSchema = z.object({
  name: z.string().trim().min(1).max(80),
  columns: z.array(z.string()).min(1),
});

/**
 * Öğrenciler ekranı "Sütunlar / Görünüm yönetimi" — tenant içindeki tüm
 * SCHOOL_ADMIN/SUPER_ADMIN'lerin paylaştığı, isim bazlı kaydedilmiş kolon
 * düzeni. `AuditLog`/`AiAuditLog` ile aynı kabul edilen sınır: yalnızca
 * `STORE_MODE=db`'de kalıcıdır (Prisma tablosu); json/memory modda bu
 * araçlar sessizce boş/no-op döner — öğrenci listesi kendisi (readData)
 * ETKİLENMEZ, bu yalnızca bir görüntüleme tercihidir.
 */
export async function listStudentListViewsTool(
  ctx: ServiceContext
): Promise<ServiceResult<{ id: string; name: string; columns: string[]; createdByUserId: string }[]>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  try {
    const rows = await prisma.studentListView.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { name: "asc" },
    });
    return ok(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        columns: Array.isArray(r.columns) ? (r.columns as string[]) : [],
        createdByUserId: r.createdByUserId,
      }))
    );
  } catch {
    return ok([]);
  }
}

export async function saveStudentListViewTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ id: string; name: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(saveStudentListViewSchema, input);
  if (!v.ok) return v;
  try {
    const existing = await prisma.studentListView.findUnique({
      where: { tenantId_name: { tenantId: ctx.tenantId, name: v.data.name } },
    });
    const row = await prisma.studentListView.upsert({
      where: { tenantId_name: { tenantId: ctx.tenantId, name: v.data.name } },
      create: {
        id: uid("view"),
        tenantId: ctx.tenantId,
        name: v.data.name,
        columns: v.data.columns,
        createdByUserId: ctx.userId,
      },
      update: { columns: v.data.columns },
    });
    audit(ctx, existing ? "student_list_view.update" : "student_list_view.create", "StudentListView", row.id, {});
    return ok({ id: row.id, name: row.name });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "saveStudentListView failed");
  }
}

export async function deleteStudentListViewTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ id: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(z.object({ id: z.string().min(1) }), input);
  if (!v.ok) return v;
  try {
    const row = await prisma.studentListView.findFirst({ where: { id: v.data.id, tenantId: ctx.tenantId } });
    if (!row) return fail("NOT_FOUND", "Görünüm bulunamadı");
    await prisma.studentListView.delete({ where: { id: row.id } });
    audit(ctx, "student_list_view.delete", "StudentListView", row.id, {});
    return ok({ id: row.id });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "deleteStudentListView failed");
  }
}

/**
 * ÖNCELİK 4 (devam) — öğretmen arşivleme/geri alma (hard delete YOK,
 * `active:false` + `archivedAt`). Öğretmenin GELECEKTEKİ (startAt > şimdi)
 * planlı/devam eden dersleri varsa arşivleme REDDEDİLİR — sessizce ders
 * iptal edilmez veya başka öğretmene taşınmaz; admin önce bu dersleri
 * mevcut taşıma/iptal akışlarıyla (updateLessonScheduleTool/cancelLessonTool)
 * elle çözmelidir. Geri alma (`archived:false`) bu kontrole tabi değildir.
 */
export async function archiveTeacherTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ teacherId: string; archived: boolean; futureLessonCount?: number }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(archiveTeacherSchema, input);
  if (!v.ok) return v;

  const data = await readData();
  const teacher = data.teachers.find((t) => t.id === v.data.teacherId);
  if (!teacher) return fail("NOT_FOUND", "Öğretmen bulunamadı");

  if (v.data.archived) {
    const nowIso = new Date().toISOString();
    const futureLessonCount = data.lessons.filter(
      (l) =>
        l.teacherId === v.data.teacherId &&
        (l.status === "scheduled" || l.status === "in_progress") &&
        l.startAt > nowIso
    ).length;
    if (futureLessonCount > 0) {
      return fail(
        "CONFLICT",
        `Bu öğretmenin ${futureLessonCount} gelecekteki planlı dersi var. Arşivlemeden önce bu dersleri başka bir öğretmene taşıyın veya iptal edin.`,
        { futureLessonCount }
      );
    }
  }

  try {
    const updated = await archiveTeacher(v.data.teacherId, v.data.archived);
    if (!updated) return fail("NOT_FOUND", "Öğretmen bulunamadı");
    audit(ctx, v.data.archived ? "teacher.archive" : "teacher.restore", "Teacher", v.data.teacherId, {});
    return ok({ teacherId: v.data.teacherId, archived: v.data.archived });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "archiveTeacher failed");
  }
}

/**
 * 2026-09-17 — öğretmen detayındaki "Öğrencilerini pasife al": öğretmene
 * atanmış AKTİF öğrencileri tek tek `archiveStudentTool` ile aynı yazma
 * yoluyla (`updateStudentProfile` active=false + archivedAt) pasife alır.
 * Öğrenci başına hata yakalanır; kısmi sonuç `failed` listesinde döner.
 */
export async function archiveTeacherStudentsTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ teacherId: string; archivedCount: number; failed: { studentId: string; name: string }[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(archiveTeacherStudentsSchema, input);
  if (!v.ok) return v;

  const data = await readReferenceData();
  if (!data.teachers.some((t) => t.id === v.data.teacherId)) return fail("NOT_FOUND", "Öğretmen bulunamadı.");
  const targets = data.students.filter((s) => s.teacherId === v.data.teacherId && s.active);

  const archivedAt = new Date().toISOString();
  const failed: { studentId: string; name: string }[] = [];
  let archivedCount = 0;
  for (const student of targets) {
    try {
      await updateStudentProfile(student.id, { active: false, archivedAt });
      audit(ctx, "student.archive", "Student", student.id, { via: "teacher.archive_students", teacherId: v.data.teacherId });
      archivedCount++;
    } catch {
      failed.push({ studentId: student.id, name: student.name });
    }
  }
  return ok({ teacherId: v.data.teacherId, archivedCount, failed });
}

/**
 * 2026-09-17 (owner kararı) — öğretmen müsaitliği YALNIZ yönetici tarafından
 * doğrudan düzenlenir. Öğretmenin öneri yolu kapatıldı
 * (bkz. proposeTeacherAvailabilityTool).
 */
export async function updateTeacherAvailabilityTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ teacherId: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", "Müsaitlik günlerini yalnız kurum yöneticisi düzenleyebilir.");
  const v = parseOrFail(updateTeacherAvailabilitySchema, input);
  if (!v.ok) return v;

  const data = await readReferenceData();
  if (!data.teachers.some((t) => t.id === v.data.teacherId)) return fail("NOT_FOUND", "Öğretmen bulunamadı.");
  const invalidBranch = v.data.availability.find(
    (w) => w.branchId && !data.settings.branches.some((b) => b.id === w.branchId)
  );
  if (invalidBranch) {
    return fail("VALIDATION_ERROR", "Müsaitlikte seçilen şube bulunamadı; şube seçimini güncelleyip tekrar kaydedin.");
  }

  try {
    const updated = await updateTeacherAvailability(v.data.teacherId, v.data.availability);
    if (!updated) return fail("NOT_FOUND", "Öğretmen bulunamadı.");
    audit(ctx, "teacher.availability_update", "Teacher", v.data.teacherId, { availability: v.data.availability });
    return ok({ teacherId: v.data.teacherId });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "updateTeacherAvailability failed");
  }
}

/** ÖNCELİK 4 (devam) — oda düzenleme (ad/kapasite/şube) + pasife alma/geri alma. Hard delete yok. */
export async function updateRoomTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ roomId: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(updateRoomSchema, input);
  if (!v.ok) return v;

  const data = await readData();
  const room = data.rooms.find((r) => r.id === v.data.roomId);
  if (!room) return fail("NOT_FOUND", "Oda bulunamadı");
  if (v.data.branchId && !data.settings.branches.some((b) => b.id === v.data.branchId)) {
    return fail("VALIDATION_ERROR", "Şube bulunamadı");
  }
  const { validateRoomRevision } = await import("../room-revision");
  const revisionError = validateRoomRevision(data, v.data.roomId, {
    name: v.data.name,
    branchId: v.data.branchId as BranchId | undefined,
    capacity: v.data.capacity,
    instruments: v.data.instruments as Instrument[] | undefined,
  });
  if (revisionError) return fail("VALIDATION_ERROR", revisionError);

  try {
    const { roomId, active, ...rawPatch } = v.data;
    // Yalnız GÖNDERİLEN alanlar yamaya girer: `undefined` bir anahtar json/memory
    // store'da `{...oda, ...yama}` ile mevcut değeri silerdi (ör. yalnız pasife alma adı siliyordu).
    const patch = {
      ...rawPatch,
      ...(rawPatch.name !== undefined ? { name: rawPatch.name.trim() } : {}),
      ...(rawPatch.branchId !== undefined ? { branchId: rawPatch.branchId as BranchId } : {}),
      ...(rawPatch.instruments !== undefined ? { instruments: rawPatch.instruments as Instrument[] } : {}),
    } as Partial<Pick<import("../types").Room, "name" | "capacity" | "branchId" | "instruments">>;
    const updated = await updateRoom(roomId, {
      ...patch,
      ...(active !== undefined
        ? { active, archivedAt: active ? undefined : new Date().toISOString() }
        : {}),
    });
    if (!updated) return fail("NOT_FOUND", "Oda bulunamadı");
    // Denetim kaydında önceki/sonraki değerler — kim neyi değiştirdi izlenebilir.
    const before = Object.fromEntries(Object.keys(rawPatch).map((k) => [k, room[k as keyof typeof room]]));
    audit(ctx, active === false ? "room.archive" : active === true ? "room.restore" : "room.update", "Room", roomId, {
      ...patch,
      before,
    });
    return ok({ roomId });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "updateRoom failed");
  }
}

/**
 * 8. tur (E) — pasif oda silme. Soft delete (`deletedAt`): satır kalır ki geçmiş
 * ders/yoklama kayıtları oda adını göstermeye devam etsin. Aktif oda ve ileri
 * tarihli planlı dersi olan oda silinemez.
 */
export async function deleteRoomTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ roomId: string }>> {
  const v = parseOrFail(z.object({ roomId: z.string().min(1), ...criticalDeleteFields }), input);
  if (!v.ok) return v;

  const data = await readData();
  const room = data.rooms.find((r) => r.id === v.data.roomId && !r.deletedAt);
  if (!room) return fail("NOT_FOUND", "Oda bulunamadı; sayfayı yenileyin.");
  const denied = await guardCriticalDelete(
    ctx,
    { action: "room.delete", entityType: "Room", entityId: room.id, entityName: room.name },
    v.data.criticalPassword
  );
  if (denied) return denied;
  if (room.active !== false) {
    return fail("VALIDATION_ERROR", `"${room.name}" aktif; yalnız pasif odalar silinebilir. Önce Odalar ekranında "Pasife Al" deyin.`);
  }
  const nowIso = new Date().toISOString();
  const upcoming = data.lessons.filter((l) => l.roomId === room.id && l.status !== "cancelled" && l.startAt > nowIso).length;
  if (upcoming > 0) {
    return fail(
      "VALIDATION_ERROR",
      `"${room.name}" odasında ileri tarihli ${upcoming} planlı ders var. Önce bu dersleri Ders Programı'ndan başka bir odaya taşıyın veya iptal edin.`
    );
  }
  const updated = await updateRoom(room.id, { deletedAt: nowIso });
  if (!updated) return fail("NOT_FOUND", "Oda bulunamadı; sayfayı yenileyin.");
  audit(ctx, "room.delete", "Room", room.id, { name: room.name, reason: v.data.reason });
  return ok({ roomId: room.id });
}

/** T.C. kimlik yazma — şifreli saklama */
export async function setNationalIdTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ entityId: string; masked: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(setNationalIdSchema, input);
  if (!v.ok) return v;
  try {
    const { cipher, last2 } = encryptNationalId(v.data.nationalId);
    if (v.data.entity === "student") {
      await updateStudentProfile(v.data.entityId, {
        nationalIdCipher: cipher,
        nationalIdLast2: last2,
      });
    } else {
      const updated = await updateTeacherProfile(v.data.entityId, {
        nationalIdCipher: cipher,
        nationalIdLast2: last2,
      });
      if (!updated) return fail("NOT_FOUND", "Öğretmen bulunamadı");
    }
    audit(ctx, "pii.national_id.set", v.data.entity === "student" ? "Student" : "Teacher", v.data.entityId, {
      last2,
    });
    return ok({ entityId: v.data.entityId, masked: maskNationalId(last2) });
  } catch (e) {
    return fail("VALIDATION_ERROR", e instanceof Error ? e.message : "setNationalId failed");
  }
}

/** Tam T.C. çözümleme — pii:full + audit */
export async function revealNationalIdTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ nationalId: string; masked: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  if (!canViewFullNationalId(ctx.role)) return fail("FORBIDDEN", "Yetkiniz yok");
  const v = parseOrFail(z.object({
    entity: z.enum(["student", "teacher", "staff"]),
    entityId: z.string().min(1),
  }), input);
  if (!v.ok) return v;
  const entity =
    v.data.entity === "staff"
      ? await getStaffMember(ctx.tenantId, v.data.entityId)
      : await (async () => {
          const data = await readReferenceData();
          return v.data.entity === "student"
            ? data.students.find((s) => s.id === v.data.entityId)
            : data.teachers.find((t) => t.id === v.data.entityId);
        })();
  if (!entity || !("nationalIdCipher" in entity) || !entity.nationalIdCipher) {
    return fail("NOT_FOUND", "Kimlik kaydı yok");
  }
  const entityType = v.data.entity === "student" ? "Student" : v.data.entity === "teacher" ? "Teacher" : "StaffMember";
  try {
    const { decryptNationalId } = await import("../pii");
    const nationalId = decryptNationalId(entity.nationalIdCipher as string);
    audit(ctx, "pii.national_id.reveal", entityType, v.data.entityId, {});
    return ok({
      nationalId,
      masked: maskNationalId((entity as { nationalIdLast2?: string }).nationalIdLast2),
    });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "reveal failed");
  }
}

/**
 * UAT 2026-09-24 (B) — Öğrenciler listesi "TC Kimlik No" filtresi. TC şifreli
 * saklandığı için (rastgele IV) DB'de eşitlik sorgusu yapılamaz: açık son 2
 * hane ile daraltılır, yalnız o adaylar çözülür, TAM eşleşme aranır. Yanıt yalnız
 * öğrenci kimlikleri; TC hiçbir yere (yanıt, audit, log) yazılmaz.
 */
export async function findStudentsByNationalIdTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ studentIds: string[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  if (!canViewFullNationalId(ctx.role)) return fail("FORBIDDEN", "TC Kimlik No ile arama yetkiniz yok.");
  const v = parseOrFail(z.object({ nationalId: z.string().max(20) }), input);
  if (!v.ok) return v;
  const wanted = normalizeNationalId(v.data.nationalId);
  if (!/^\d{11}$/.test(wanted)) {
    return fail("VALIDATION_ERROR", "TC Kimlik No 11 haneli olmalı. Rakamları eksiksiz girip tekrar arayın.");
  }
  const { decryptNationalId } = await import("../pii");
  const data = await readReferenceData();
  const studentIds = data.students
    .filter((s) => s.nationalIdCipher && s.nationalIdLast2 === wanted.slice(-2))
    .filter((s) => {
      try {
        return decryptNationalId(s.nationalIdCipher!) === wanted;
      } catch {
        return false; // bozuk/eski anahtarlı kayıt eşleşme sayılmaz
      }
    })
    .map((s) => s.id);
  audit(ctx, "pii.national_id.search", "Student", "list", { matchCount: studentIds.length });
  return ok({ studentIds });
}

/** Faz 9A — IBAN tam çözümleme (StaffMember) — revealNationalIdTool ile AYNI desen (pii:full + audit). */
export async function revealStaffIbanTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ iban: string; masked: string }>> {
  const auth = requireStaffSensitiveAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  if (!canViewFullNationalId(ctx.role)) return fail("FORBIDDEN", "Yetkiniz yok");
  const v = parseOrFail(z.object({ staffId: z.string().min(1) }), input);
  if (!v.ok) return v;
  const staffMember = await getStaffMember(ctx.tenantId, v.data.staffId);
  if (!staffMember?.ibanCipher) return fail("NOT_FOUND", "IBAN kaydı yok");
  try {
    const { decryptIban, maskIban } = await import("../pii");
    const iban = decryptIban(staffMember.ibanCipher);
    audit(ctx, "pii.iban.reveal", "StaffMember", v.data.staffId, {});
    return ok({ iban, masked: maskIban(staffMember.ibanLast4) });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "reveal failed");
  }
}

export async function createTrialLessonTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ trialId: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(createTrialLessonSchema, input);
  if (!v.ok) return v;
  // Çalışma günü tek kaynağı — deneme dersi de yöneticinin kapalı/zorla-açık
  // istisnalarına uyar (eskiden boş liste geçiliyordu, istisnalar hiç okunmuyordu).
  const trialData = await readData();
  const sched = assertSchedulableDate(v.data.startAt, trialData);
  if (!sched.ok) return fail("VALIDATION_ERROR", sched.message);
  if (ctx.role === "TEACHER" && v.data.teacherId !== ctx.teacherId) {
    return fail("FORBIDDEN", "Yalnızca kendi deneme dersinizi planlayabilirsiniz.");
  }
  const start = new Date(v.data.startAt);
  const end = new Date(start.getTime() + v.data.durationMinutes * 60_000);
  // 8. tur — oluşturma da düzenlemeyle aynı çakışma/müsaitlik kuralından geçer.
  const { validateTrialSlot } = await import("../makeup-engine");
  const slot = validateTrialSlot(
    trialData,
    { ...v.data, startAt: start.toISOString() },
    await listTrialLessons(ctx.tenantId),
    { allowAvailabilityOverride: v.data.allowAvailabilityOverride }
  );
  if (!slot.ok) return fail(slot.code === "TEACHER_UNAVAILABLE" ? "CONFLICT" : "VALIDATION_ERROR", slot.message);
  try {
    const trial = await createTrialLesson({
      tenantId: ctx.tenantId,
      name: v.data.name,
      phone: v.data.phone,
      parentName: v.data.parentName,
      instrument: v.data.instrument as Instrument,
      branchId: v.data.branchId,
      teacherId: v.data.teacherId,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      durationMinutes: v.data.durationMinutes,
      createdBy: ctx.userId,
      notes: v.data.notes,
    });
    audit(ctx, "trial.create", "TrialLesson", trial.id, {});
    return ok({ trialId: trial.id });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "createTrial failed");
  }
}

export async function listTrialLessonsTool(
  ctx: ServiceContext
): Promise<ServiceResult<{ trials: Awaited<ReturnType<typeof listTrialLessons>> }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER", "BRANCH_MANAGER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  try {
    let trials = await listTrialLessons(ctx.tenantId);
    if (ctx.role === "TEACHER" && ctx.teacherId) {
      trials = trials.filter((t) => t.teacherId === ctx.teacherId);
    }
    // Şube müdürü yalnız atanmış şubelerinin denemelerini görür (aday
    // telefonları PII — kapsam dışı satır listeye inmez).
    if (ctx.role === "BRANCH_MANAGER") {
      const scope = await resolveBranchScope(ctx);
      if (!scope.ok) return fail("FORBIDDEN", scope.error.message);
      if (scope.data.mode !== "tenant") {
        const ids = scope.data.branchIds;
        trials = trials.filter((t) => ids.includes(t.branchId));
      }
    }
    return ok({ trials });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "listTrial failed");
  }
}

/**
 * Deneme dersi düzenleme (2026-09-26).
 * - Tarih/saat/süre/şube/öğretmen değişirse öğretmen kuralları (`validateTrialSlot`)
 *   normal ders programıyla aynı yardımcılardan yeniden uygulanır.
 * - Gerçekleşmiş (bitmiş), iptal edilmiş veya kayda dönüşmüş denemenin planı ve
 *   hazırlık notu kilitlidir — geçmiş sessizce değişmez; yalnız sonuç notu yazılır.
 * - Sonuç notu yalnız ders başladıktan sonra; hazırlık notunun üzerine yazmaz.
 * - Öğretmen yalnız kendi denemesini düzenler ve başka öğretmene devredemez.
 * - Her değişiklik alan-düzeyi diff ile denetime yazılır.
 */
export async function updateTrialLessonTool(
  ctx: ServiceContext,
  input: unknown,
  now: Date = new Date()
): Promise<ServiceResult<{ trialId: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER", "BRANCH_MANAGER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(updateTrialLessonSchema, input);
  if (!v.ok) return v;
  const existing = await getTrialLesson(ctx.tenantId, v.data.trialId);
  if (!existing) return fail("NOT_FOUND", "Deneme dersi bulunamadı. Listeyi yenileyip tekrar deneyin.");
  if (ctx.role === "TEACHER" && existing.teacherId !== ctx.teacherId) {
    return fail("FORBIDDEN", "Yalnızca kendi deneme derslerinizi düzenleyebilirsiniz.");
  }
  if (ctx.role === "TEACHER" && v.data.teacherId && v.data.teacherId !== ctx.teacherId) {
    return fail("FORBIDDEN", "Deneme dersini başka bir öğretmene yalnız yönetici devredebilir.");
  }
  // Şube müdürü: kaynak şube kapsamda olmalı (hedef şube update öncesi denetlenir).
  const trialSourceGate = await assertTrialBranchScope(ctx, existing.branchId);
  if (trialSourceGate) return trialSourceGate;

  const d = v.data;
  // 11. tur iş #1 — dede kuralı: mevcut süre aynen geri gönderilirse (düzenleme
  // formu her kayıtta yapar) tarihsel değer korunur; süre GERÇEKTEN değişiyorsa
  // 10/15/20 kuralı uygulanır. Kural şemada değil burada: şema mevcut değeri bilmez.
  // Süresi kayıtlarda olmayan çok eski satırlarda mevcut değer başlangıç-bitiş
  // farkıdır (deneme sayfası aynı türetimi yapar — ikisi ayrışamaz).
  const existingDuration =
    existing.durationMinutes ??
    Math.max(1, Math.round((new Date(existing.endAt).getTime() - new Date(existing.startAt).getTime()) / 60000));
  if (
    d.durationMinutes !== undefined &&
    d.durationMinutes !== existingDuration &&
    !(TRIAL_LESSON_DURATION_OPTIONS as readonly number[]).includes(d.durationMinutes)
  ) {
    return fail("VALIDATION_ERROR", "Deneme dersi süresi yalnızca 10, 15 veya 20 dakika olabilir.");
  }
  const scheduleChanged =
    (d.startAt !== undefined && new Date(d.startAt).getTime() !== new Date(existing.startAt).getTime()) ||
    (d.durationMinutes !== undefined && d.durationMinutes !== existing.durationMinutes) ||
    (d.branchId !== undefined && d.branchId !== existing.branchId) ||
    (d.teacherId !== undefined && d.teacherId !== existing.teacherId) ||
    (d.instrument !== undefined && d.instrument !== existing.instrument);
  const identityChanged =
    (d.name !== undefined && d.name !== existing.name) ||
    (d.phone !== undefined && d.phone !== existing.phone) ||
    (d.parentName !== undefined && (d.parentName || undefined) !== (existing.parentName || undefined));
  const prepChanged = d.notes !== undefined && (d.notes.trim() || undefined) !== (existing.notes || undefined);
  const resultChanged =
    d.resultNotes !== undefined && (d.resultNotes.trim() || undefined) !== (existing.resultNotes || undefined);

  // Sahip emri (2026-09-28): kilit YOK — geçmiş/kayıtlı/iptal denemede
  // plan, kimlik ve notların TAMAMI her zaman düzenlenebilir (ad düzeltmesi
  // dahil). Çakışma denetimi, şube kapsamı ve denetim izi aynen korunur.
  const next = {
    instrument: d.instrument ?? existing.instrument,
    branchId: d.branchId ?? existing.branchId,
    teacherId: d.teacherId ?? existing.teacherId,
    startAt: d.startAt ? new Date(d.startAt).toISOString() : existing.startAt,
    durationMinutes: d.durationMinutes ?? existing.durationMinutes,
  };
  const data = await readData();
  if (scheduleChanged) {
    const { validateTrialSlot } = await import("../makeup-engine");
    const all = await listTrialLessons(ctx.tenantId);
    const slot = validateTrialSlot(data, next, all, {
      excludeTrialId: existing.id,
      allowAvailabilityOverride: d.allowAvailabilityOverride,
    });
    if (!slot.ok) return fail(slot.code === "TEACHER_UNAVAILABLE" ? "CONFLICT" : "VALIDATION_ERROR", slot.message);
  }

  const patch: TrialLessonPatch = {};
  if (scheduleChanged) {
    Object.assign(patch, next, {
      endAt: new Date(new Date(next.startAt).getTime() + next.durationMinutes * 60_000).toISOString(),
      instrument: next.instrument as Instrument,
    });
  }
  if (identityChanged) {
    Object.assign(patch, {
      name: d.name ?? existing.name,
      phone: d.phone ?? existing.phone,
      // Boş gönderim veli adını temizler ("" → db'de NULL karşılığı boş metin yerine "").
      ...(d.parentName !== undefined ? { parentName: d.parentName } : {}),
    });
  }
  if (prepChanged) patch.notes = d.notes!.trim();
  if (resultChanged) {
    patch.resultNotes = d.resultNotes!.trim();
    patch.resultNotesAt = now.toISOString();
    patch.resultNotesByUserId = ctx.userId;
  }
  if (Object.keys(patch).length === 0) return ok({ trialId: existing.id });

  // Şube müdürü kaydı kapsam dışına taşıyamaz — hedef şube kapısı.
  if (d.branchId !== undefined && d.branchId !== existing.branchId) {
    const trialTargetGate = await assertTrialBranchScope(ctx, d.branchId);
    if (trialTargetGate) return trialTargetGate;
  }

  try {
    const updated = await updateTrialLesson(ctx.tenantId, existing.id, patch);
    if (!updated) return fail("NOT_FOUND", "Deneme dersi bulunamadı. Listeyi yenileyip tekrar deneyin.");
    const { resultNotesAt: _a, resultNotesByUserId: _b, ...auditable } = patch;
    void _a;
    void _b;
    audit(ctx, "trial.update", "TrialLesson", existing.id, {
      entityName: existing.name,
      changes: diffRecordFields(existing as unknown as Record<string, unknown>, auditable as Record<string, unknown>),
      ...(d.allowAvailabilityOverride && scheduleChanged ? { availabilityOverride: true } : {}),
    });
    return ok({ trialId: existing.id });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "updateTrial failed");
  }
}

/**
 * Deneme dersi silme (sahip emri 2026-09-28: satır her zaman silinebilir).
 * Kalıcı silme + denetim izi. Bağlı ÖĞRENCİ kaydına dokunulmaz (dönüşmüş
 * denemede öğrenci yaşar; `convertedFromTrialId` iz olarak kalır).
 * - Öğretmen yalnız KENDİ denemesini siler.
 * - Şube müdürü yalnız atanmış şubesinde siler (kaynak kapısı, fail-closed).
 */
export async function deleteTrialLessonTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ trialId: string }>> {
  // 2026-09-29 — kalıcı silme: yalnız kurum sahibi/yöneticisi + kritik şifre + gerekçe
  // (öğretmen/şube müdürü artık silemez; arşivleme yolları aynen kalır).
  const v = parseOrFail(z.object({ trialId: z.string().min(1), ...criticalDeleteFields }), input);
  if (!v.ok) return v;
  const existing = await getTrialLesson(ctx.tenantId, v.data.trialId);
  if (!existing) return fail("NOT_FOUND", "Deneme dersi bulunamadı. Listeyi yenileyip tekrar deneyin.");
  const denied = await guardCriticalDelete(
    ctx,
    { action: "trial.delete", entityType: "TrialLesson", entityId: existing.id, entityName: existing.name },
    v.data.criticalPassword
  );
  if (denied) return denied;
  try {
    const { deleteTrialLesson } = await import("../trial-lessons");
    const removed = await deleteTrialLesson(ctx.tenantId, existing.id);
    if (!removed) return fail("NOT_FOUND", "Deneme dersi bulunamadı. Listeyi yenileyip tekrar deneyin.");
    audit(ctx, "trial.delete", "TrialLesson", existing.id, {
      entityName: existing.name,
      reason: v.data.reason,
      status: existing.status,
      ...(existing.convertedStudentId ? { convertedStudentId: existing.convertedStudentId } : {}),
    });
    return ok({ trialId: existing.id });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "deleteTrial failed");
  }
}

/**
 * Şube müdürü yalnız atanmış şubelerindeki denemeleri revize eder (fail-closed).
 * `null` = serbest (admin/öğretmen yolu değişmez); döndürülen değer varsa
 * çağrıcı onu aynen döner. Kaynak + hedef şube İKİSİ de denetlenir.
 */
async function assertTrialBranchScope(
  ctx: ServiceContext,
  branchId: string | undefined | null
): Promise<ServiceFailure | null> {
  if (ctx.role !== "BRANCH_MANAGER") return null;
  const scope = await resolveBranchScope(ctx);
  if (!scope.ok) return fail("FORBIDDEN", scope.error.message);
  if (!inBranchScope(scope.data, branchId)) {
    return fail("FORBIDDEN", "Bu kayıt size atanmış şubelerin dışında.");
  }
  return null;
}

export async function updateTrialLessonStatusTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ trialId: string; status: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER", "BRANCH_MANAGER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(updateTrialLessonStatusSchema, input);
  if (!v.ok) return v;
  const existing = await getTrialLesson(ctx.tenantId, v.data.trialId);
  if (!existing) return fail("NOT_FOUND", "Deneme bulunamadı");
  if (ctx.role === "TEACHER" && existing.teacherId !== ctx.teacherId) {
    return fail("FORBIDDEN", "Yetkiniz yok");
  }
  const branchGate = await assertTrialBranchScope(ctx, existing.branchId);
  if (branchGate) return branchGate;
  try {
    const updated = await updateTrialLessonStatus(ctx.tenantId, v.data.trialId, v.data.status);
    if (!updated) return fail("NOT_FOUND", "Deneme bulunamadı");
    audit(ctx, "trial.status", "TrialLesson", v.data.trialId, { status: v.data.status });
    return ok({ trialId: v.data.trialId, status: updated.status });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "updateTrial failed");
  }
}

export async function listDocumentTemplatesTool(
  ctx: ServiceContext
): Promise<ServiceResult<{ templates: Awaited<ReturnType<typeof listTemplates>> }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  try {
    const templates = await listTemplates(ctx.tenantId);
    return ok({ templates });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "listTemplates failed");
  }
}

/** Şablon yönetim ekranı için — arşivlenmiş (pasif) DAHİL tüm şablonlar. Admin-only. */
export async function listAllDocumentTemplatesTool(
  ctx: ServiceContext
): Promise<ServiceResult<{ templates: Awaited<ReturnType<typeof listAllTemplates>> }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  try {
    const templates = await listAllTemplates(ctx.tenantId);
    return ok({ templates });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "listAllTemplates failed");
  }
}

/** Yönetici yeni şablon oluşturur — `bodyHtml` sunucuda sanitize edilir (script/iframe/event handler/javascript: URL elenir). */
export async function createDocumentTemplateTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ templateId: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(createDocumentTemplateSchema, input);
  if (!v.ok) return v;
  try {
    const tpl = await createTemplate({
      tenantId: ctx.tenantId,
      kind: v.data.kind,
      name: v.data.name,
      bodyHtml: v.data.bodyHtml,
      createdById: ctx.userId,
    });
    audit(ctx, "document_template.create", "DocumentTemplate", tpl.id, { kind: tpl.kind, name: tpl.name });
    return ok({ templateId: tpl.id });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "createDocumentTemplate failed");
  }
}

/** Yönetici şablon düzenler — `bodyHtml` verilirse yeniden sanitize edilir, `version` +1 olur. */
export async function updateDocumentTemplateTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ templateId: string; version: number }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(updateDocumentTemplateSchema, input);
  if (!v.ok) return v;
  try {
    const tpl = await updateTemplate(ctx.tenantId, v.data.templateId, {
      name: v.data.name,
      bodyHtml: v.data.bodyHtml,
    });
    if (!tpl) return fail("NOT_FOUND", "Şablon bulunamadı veya bu kuruma ait değil.");
    audit(ctx, "document_template.update", "DocumentTemplate", tpl.id, { version: tpl.version });
    return ok({ templateId: tpl.id, version: tpl.version });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "updateDocumentTemplate failed");
  }
}

/** Silme yok — arşivleme `active:false`/geri açma `active:true` yapar. */
export async function archiveDocumentTemplateTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ templateId: string; active: boolean }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(archiveDocumentTemplateSchema, input);
  if (!v.ok) return v;
  try {
    const tpl = await archiveTemplate(ctx.tenantId, v.data.templateId, v.data.active);
    if (!tpl) return fail("NOT_FOUND", "Şablon bulunamadı veya bu kuruma ait değil.");
    audit(ctx, "document_template.archive", "DocumentTemplate", tpl.id, { active: tpl.active });
    return ok({ templateId: tpl.id, active: tpl.active });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "archiveDocumentTemplate failed");
  }
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const LEGACY_DOC_MIME = "application/msword";
const DOCX_MAX_BYTES = 10_000_000;

/**
 * P0 (2026-08-30, DOCX-öncelikli şablon iş akışı) — admin bir .docx yükler;
 * ORİJİNAL dosya baytları değişmeden `sourceFileData`'da saklanır (yetkili
 * admin'e aynen geri indirilebilir), `mammoth` ile üretilen HTML bir
 * ÖNİZLEME/taslak gövde olarak `bodyHtml`'e yazılır — DOCX biçimlendirmesinin
 * kayıpsız karşılığı OLDUĞU İDDİA EDİLMEZ (bkz.
 * docs/contracts/TEMPLATE_EDITOR_AND_DOCX_WORKFLOW_REPORT.md). Her zaman
 * YENİ bir TASLAK (`active:false`) olarak oluşturulur — asla otomatik
 * etkinleştirmez, mevcut aktif şablona dokunmaz. `.doc` (eski format)
 * AÇIKÇA reddedilir — sahte bir dönüşüm denenmez.
 */
export async function uploadDocumentTemplateDocxTool(
  ctx: ServiceContext,
  input: unknown
): Promise<
  ServiceResult<{
    templateId: string;
    missingRequiredPlaceholders: string[];
  }>
> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(uploadDocumentTemplateDocxSchema, input);
  if (!v.ok) return v;

  if (v.data.fileMimeType === LEGACY_DOC_MIME || /\.doc$/i.test(v.data.fileName)) {
    return fail(
      "VALIDATION_ERROR",
      "Bu eski Word dosyasını önce .docx formatında kaydedip tekrar yükleyin."
    );
  }
  if (v.data.fileMimeType !== DOCX_MIME || !/\.docx$/i.test(v.data.fileName)) {
    return fail("VALIDATION_ERROR", "Yalnızca .docx dosyaları desteklenir.");
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(v.data.fileData, "base64");
  } catch {
    return fail("VALIDATION_ERROR", "Dosya verisi okunamadı.");
  }
  if (buffer.length <= 0) return fail("VALIDATION_ERROR", "Boş dosya yüklenemez.");
  if (buffer.length > DOCX_MAX_BYTES) return fail("VALIDATION_ERROR", "Dosya çok büyük (maks. 10MB).");
  if (!checkFileMagicBytes(buffer, DOCX_MIME)) {
    return fail("VALIDATION_ERROR", "Dosya içeriği .docx ile uyuşmuyor (bozuk veya yanlış dosya).");
  }

  let extractedHtml: string;
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.convertToHtml({ buffer });
    extractedHtml = result.value;
  } catch (e) {
    return fail(
      "VALIDATION_ERROR",
      `Word dosyası okunamadı: ${e instanceof Error ? e.message : "bilinmeyen hata"}`
    );
  }
  if (!extractedHtml.trim()) {
    return fail("VALIDATION_ERROR", "Word dosyasından metin çıkarılamadı — dosya boş görünüyor.");
  }

  try {
    const tpl = await createTemplate({
      tenantId: ctx.tenantId,
      kind: v.data.kind,
      name: v.data.name,
      bodyHtml: extractedHtml,
      createdById: ctx.userId,
      active: false,
      sourceFileData: v.data.fileData,
      sourceFileName: v.data.fileName,
      sourceMimeType: v.data.fileMimeType,
    });
    const missingRequired =
      v.data.kind === "student_enrollment_contract"
        ? findMissingRequiredContractPlaceholders(tpl.bodyHtml).map((p) => p.key)
        : [];
    audit(ctx, "document_template.upload_docx", "DocumentTemplate", tpl.id, {
      kind: tpl.kind,
      fileName: v.data.fileName,
      missingRequiredCount: missingRequired.length,
    });
    return ok({ templateId: tpl.id, missingRequiredPlaceholders: missingRequired });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "uploadDocumentTemplateDocx failed");
  }
}

/** Yetkili admin, daha önce DOCX olarak yüklenmiş bir şablonun ORİJİNAL dosyasını aynen indirir. */
export async function getDocumentTemplateSourceFileTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ fileName: string; fileMimeType: string; fileData: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(getDocumentTemplateSourceFileSchema, input);
  if (!v.ok) return v;
  const tpl = await getTemplate(ctx.tenantId, v.data.templateId);
  if (!tpl) return fail("NOT_FOUND", "Şablon bulunamadı veya bu kuruma ait değil.");
  if (!tpl.sourceFileData || !tpl.sourceFileName || !tpl.sourceMimeType) {
    return fail("NOT_FOUND", "Bu şablon için DOCX kaynağı henüz yüklenmedi.");
  }
  audit(ctx, "document_template.download_source", "DocumentTemplate", tpl.id, {});
  return ok({ fileName: tpl.sourceFileName, fileMimeType: tpl.sourceMimeType, fileData: tpl.sourceFileData });
}

/**
 * Faz 6 (ENROLLMENT_PAYMENT_RENEWAL_VALIDATION_FIX) — aktif kayıt sözleşmesi
 * şablonunun gerekli alanları içerip içermediğini, eksikse Türkçe etiketleriyle
 * ve kurumsal kaynaktan güvenli bir taslak oluşturma seçeneğiyle birlikte
 * gösterir. Hiçbir yazma işlemi yapmaz.
 */
export async function getContractTemplateDiagnosticsTool(
  ctx: ServiceContext
): Promise<ServiceResult<Awaited<ReturnType<typeof getContractTemplateDiagnostics>>>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  try {
    const diagnostics = await getContractTemplateDiagnostics(ctx.tenantId);
    return ok(diagnostics);
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "getContractTemplateDiagnostics failed");
  }
}

/**
 * Faz 6 — YIKICI OLMAYAN kurtarma: kurumsal kaynak gövdesinden (hukuki metin
 * DEĞİŞTİRİLMEDEN) yeni bir TASLAK şablon oluşturur — `active:false`, mevcut
 * aktif şablona dokunulmaz. Etkinleştirme AYRI ve AÇIK bir adımdır (bkz.
 * activateContractTemplateTool).
 */
export async function createContractTemplateDraftFromCanonicalSourceTool(
  ctx: ServiceContext,
  input?: unknown
): Promise<ServiceResult<{ templateId: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  // P0 (2026-09-05) — `kind` opsiyonel; verilmezse ESKİ davranış (kayıt
  // sözleşmesi) AYNEN korunur. KVKK/fotoğraf-video şablonları sözleşmenin ek
  // bölümlerini besler (bkz. contract-annexes.ts).
  const kindParse = z
    .object({ kind: z.enum(["student_enrollment_contract", "kvkk", "parent_social_media_consent"]).optional() })
    .safeParse(input ?? {});
  if (!kindParse.success) return fail("VALIDATION_ERROR", "Geçersiz şablon türü.");
  try {
    const tpl = await createContractTemplateDraftFromCanonicalSource(
      ctx.tenantId,
      ctx.userId,
      kindParse.data.kind ?? "student_enrollment_contract"
    );
    audit(ctx, "document_template.create_canonical_draft", "DocumentTemplate", tpl.id, { kind: tpl.kind });
    return ok({ templateId: tpl.id });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "createContractTemplateDraftFromCanonicalSource failed");
  }
}

const activateContractTemplateSchema = z.object({ templateId: z.string().min(1) });

/** Faz 6 — bir şablonu etkinleştirir VE aynı tür için diğer tüm şablonları pasifleştirir (tek-aktif garantisi). Açık yönetici onayı gerektirir. */
export async function activateContractTemplateTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ templateId: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(activateContractTemplateSchema, input);
  if (!v.ok) return v;
  try {
    const tpl = await activateTemplateExclusive(ctx.tenantId, v.data.templateId);
    if (!tpl) return fail("NOT_FOUND", "Şablon bulunamadı veya bu kuruma ait değil.");
    audit(ctx, "document_template.activate_exclusive", "DocumentTemplate", tpl.id, { kind: tpl.kind });
    return ok({ templateId: tpl.id });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "activateContractTemplate failed");
  }
}

/** Aynı `idempotencyKey` ile 60sn içinde tekrar çağrılırsa yeni belge YARATILMAZ, mevcut olan döner. */
const DOCUMENT_IDEMPOTENCY_WINDOW_MS = 60_000;

export async function createDocumentInstanceTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ documentId: string; reference: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(createDocumentInstanceSchema, input);
  if (!v.ok) return v;
  const tpl = await getTemplate(ctx.tenantId, v.data.templateId);
  if (!tpl) return fail("NOT_FOUND", "Şablon bulunamadı veya bu kuruma ait değil.");

  const data = await readReferenceData();

  // MT-güvenlik — sahte/başka-tenant öğrenci veya öğretmen ID'si sessizce
  // yok sayılmaz, açıkça reddedilir (`data.students`/`data.teachers` zaten
  // tenant-scoped — cross-tenant bir ID burada asla "bulunur" görünmez).
  const student = v.data.studentId ? data.students.find((s) => s.id === v.data.studentId) : undefined;
  if (v.data.studentId && !student) {
    return fail("VALIDATION_ERROR", "Seçilen öğrenci bulunamadı veya bu kuruma ait değil.");
  }
  const teacher = v.data.teacherId ? data.teachers.find((t) => t.id === v.data.teacherId) : undefined;
  if (v.data.teacherId && !teacher) {
    return fail("VALIDATION_ERROR", "Seçilen öğretmen bulunamadı veya bu kuruma ait değil.");
  }

  // Basit tekrar-koruması: aynı kullanıcı, aynı şablon, aynı idempotencyKey
  // ile kısa süre içinde tekrar çağrılırsa (ör. çift tıklama) yeni belge
  // YARATILMAZ, en son eşleşen belge döner.
  if (v.data.idempotencyKey) {
    const cutoff = Date.now() - DOCUMENT_IDEMPOTENCY_WINDOW_MS;
    const existing = await listDocumentInstances(ctx.tenantId, { studentId: v.data.studentId });
    const dup = existing.find(
      (d) =>
        d.templateId === tpl.id &&
        d.createdBy === ctx.userId &&
        d.fieldValues.__idempotencyKey === v.data.idempotencyKey &&
        new Date(d.createdAt).getTime() >= cutoff
    );
    if (dup) return ok({ documentId: dup.id, reference: dup.reference });
  }

  const branch = student
    ? data.settings.branches.find((b) => b.id === student.branchId)
    : v.data.branchId
      ? data.settings.branches.find((b) => b.id === v.data.branchId)
      : undefined;
  const nowTr = formatDateTr(new Date());
  const autoFields: Record<string, string> = {
    // Legacy düz anahtarlar (mevcut varsayılan şablonlar bunları kullanıyor — bozmuyoruz).
    date: nowTr,
    studentName: student?.name ?? "",
    parentName: student?.parentName ?? "",
    branchName: branch?.name ?? "",
    educationMethod: student?.educationMethod ?? "",
    enrollmentDate: student?.enrollmentStartDate
      ? formatDateTr(student.enrollmentStartDate)
      : "",
    paymentPlan: student?.paymentMethod
      ? `${student.paymentMethod} · ${student.paymentAmount ?? student.monthlyFee} ₺ · ${formatPaymentDueRanges(effectivePaymentDueRanges(student))}`
      : "",
    freeText: "",
    scopes: "",
    name: "",
    phone: "",
    // MT — Evraklar Faz 2 noktalı placeholder seti. `{{document.referenceNumber}}`/
    // `{{document.createdAt}}` referans/oluşturma anındaki id'ye bağlı olduğu
    // için burada henüz bilinmiyor — renderedHtml, documents/index.ts
    // createDocumentInstance içinde reference ÜRETİLDİKTEN SONRA ayrıca
    // enjekte edilir (bkz. o fonksiyondaki `{ ...fieldValues, reference }`).
    // Eksik veri için TÜMÜ güvenli boş string'e düşer (renderTemplate zaten
    // bulunamayan anahtar için "" döner) — asla hata fırlatmaz.
    "institution.name": data.settings.name ?? "",
    "institution.address": branch?.address ?? "",
    "student.fullName": student?.name ?? "",
    "student.birthDate": student?.birthDate ? formatDateTr(student.birthDate) : "",
    "parent.fullName": student?.parentName ?? "",
    "parent.phone": student?.parentPhone ?? "",
    "teacher.fullName": teacher?.name ?? "",
    currentDate: nowTr,
    ...v.data.fieldValues,
    ...(v.data.idempotencyKey ? { __idempotencyKey: v.data.idempotencyKey } : {}),
  };
  try {
    const doc = await createDocumentInstance({
      tenantId: ctx.tenantId,
      templateId: tpl.id,
      kind: tpl.kind,
      fieldValues: autoFields,
      studentId: v.data.studentId,
      teacherId: v.data.teacherId,
      trialLessonId: v.data.trialLessonId,
      branchId: v.data.branchId ?? student?.branchId,
      createdBy: ctx.userId,
    });
    audit(ctx, "document.create", "DocumentInstance", doc.id, {
      reference: doc.reference,
      kind: doc.kind,
      studentId: doc.studentId,
      teacherId: doc.teacherId,
    });
    return ok({ documentId: doc.id, reference: doc.reference });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "createDocument failed");
  }
}

/**
 * Evrak detay ekranı + imzalı dosya servis rotası — SCHOOL_ADMIN/SUPER_ADMIN
 * tam kapsam; BRANCH_MANAGER yalnız atanmış şubelerinin evraklarını görür
 * (fail-closed: şubesiz evrak BM'ye inmez).
 */
export async function getDocumentInstanceTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ document: DocumentInstance }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "BRANCH_MANAGER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(z.object({ documentId: z.string().min(1) }), input);
  if (!v.ok) return v;
  try {
    const { getDocumentInstance } = await import("../documents");
    const document = await getDocumentInstance(ctx.tenantId, v.data.documentId);
    if (!document) return fail("NOT_FOUND", "Belge bulunamadı");
    const gate = await assertDocumentBranchScope(ctx, document.branchId);
    if (gate) return gate;
    return ok({ document });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "getDocument failed");
  }
}
/**
 * Şube müdürü yalnız atanmış şubelerindeki evrakları görür/arşivler
 * (fail-closed: atama yoksa FORBIDDEN, şubesiz evrak kapsam dışı).
 * `null` = serbest (admin yolu değişmez).
 */
async function assertDocumentBranchScope(
  ctx: ServiceContext,
  branchId: string | undefined | null
): Promise<ServiceFailure | null> {
  if (ctx.role !== "BRANCH_MANAGER") return null;
  const scope = await resolveBranchScope(ctx);
  if (!scope.ok) return fail("FORBIDDEN", scope.error.message);
  if (!inBranchScope(scope.data, branchId)) {
    return fail("FORBIDDEN", "Bu evrak size atanmış şubelerin dışında.");
  }
  return null;
}

export async function printDocumentInstanceTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ documentId: string; reference: string; printCount: number; html?: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(z.object({ documentId: z.string().min(1) }), input);
  if (!v.ok) return v;
  try {
    const doc = await markDocumentPrinted(ctx.tenantId, v.data.documentId);
    if (!doc) return fail("NOT_FOUND", "Belge bulunamadı");
    audit(ctx, "document.print", "DocumentInstance", doc.id, {
      reference: doc.reference,
      printCount: doc.printCount,
    });
    return ok({
      documentId: doc.id,
      reference: doc.reference,
      printCount: doc.printCount,
      html: doc.renderedHtml,
    });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "printDocument failed");
  }
}

export async function listStudentDocumentsTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ documents: Awaited<ReturnType<typeof listDocumentsForStudent>> }>> {
  const v = parseOrFail(z.object({ studentId: z.string().min(1) }), input);
  if (!v.ok) return v;
  const student = await readStudentById(v.data.studentId);
  const access = await assertStudentAccess(ctx, student, v.data.studentId);
  if (!access.ok) return fail(access.code, access.message);
  try {
    const documents = await listDocumentsForStudent(ctx.tenantId, v.data.studentId);
    return ok({ documents });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "listDocuments failed");
  }
}

const documentInstanceFiltersSchema = z.object({
  kind: z.string().optional(),
  status: z.string().optional(),
  studentId: z.string().optional(),
  teacherId: z.string().optional(),
  branchId: z.string().optional(),
  reference: z.string().optional(),
});

/**
 * Evraklar Merkezi ana tablosu — adminler kurumun tüm evraklarını,
 * BRANCH_MANAGER yalnız atanmış şubelerin evraklarını görür (fail-closed:
 * şubesiz evrak listeye inmez).
 */
export async function listDocumentInstancesTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ documents: Awaited<ReturnType<typeof listDocumentInstances>> }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "BRANCH_MANAGER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(documentInstanceFiltersSchema, input);
  if (!v.ok) return v;
  try {
    let documents = await listDocumentInstances(ctx.tenantId, v.data as DocumentInstanceFilters);
    if (ctx.role === "BRANCH_MANAGER") {
      const scope = await resolveBranchScope(ctx);
      if (!scope.ok) return fail("FORBIDDEN", scope.error.message);
      if (scope.data.mode !== "tenant") {
        const ids = scope.data.branchIds;
        documents = documents.filter((d) => d.branchId !== undefined && ids.includes(d.branchId));
      }
    }
    return ok({ documents });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "listDocumentInstances failed");
  }
}
/**
 * Silme yok — arşivleme durumu "İptal Edildi"ye geçirir.
 * BRANCH_MANAGER yalnız kendi şubesinin evrağını arşivler (kaynak kapısı).
 */
export async function archiveDocumentInstanceTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ documentId: string; status: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "BRANCH_MANAGER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(z.object({ documentId: z.string().min(1) }), input);
  if (!v.ok) return v;
  try {
    if (ctx.role === "BRANCH_MANAGER") {
      const { getDocumentInstance } = await import("../documents");
      const existing = await getDocumentInstance(ctx.tenantId, v.data.documentId);
      if (!existing) return fail("NOT_FOUND", "Belge bulunamadı");
      const gate = await assertDocumentBranchScope(ctx, existing.branchId);
      if (gate) return gate;
    }
    const doc = await archiveDocumentInstance(ctx.tenantId, v.data.documentId);
    if (!doc) return fail("NOT_FOUND", "Belge bulunamadı");
    audit(ctx, "document.archive", "DocumentInstance", doc.id, {});
    return ok({ documentId: doc.id, status: doc.status });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "archiveDocument failed");
  }
}

/**
 * 2026-09-29 — evrak silme öncesi etki özeti (salt okuma). Silme yalnız ARŞİVLENMİŞ ve
 * sözleşmeye bağlı OLMAYAN evrakta yapılabilir; aksi durum `allowed:false` + nedenle döner.
 */
async function documentDeletionBlockReason(
  tenantId: string,
  doc: DocumentInstance
): Promise<string | null> {
  if (doc.status !== "cancelled") {
    return 'Yalnız arşivlenmiş evrak silinebilir. Önce evrakı "Arşivle" ile arşivleyin; ardından Arşivlenen Evraklar listesinden silebilirsiniz.';
  }
  const { findContractIdByDocumentInstanceId } = await import("../contracts");
  if (await findContractIdByDocumentInstanceId(tenantId, doc.id)) {
    return "Bu evrak bir öğrenci sözleşmesinin yasal nüshası; silinemez. Sözleşmeyi öğrencinin Sözleşmeler sekmesinden iptal edin — nüsha arşivde kalır.";
  }
  return null;
}

export async function getDocumentDeletionImpactTool(
  ctx: ServiceContext,
  input: unknown
): Promise<
  ServiceResult<{
    reference: string;
    status: string;
    hasSignedFile: boolean;
    signedVersionCount: number;
    openTaskCount: number;
    allowed: boolean;
    blockReason?: string;
    criticalPasswordConfigured: boolean;
  }>
> {
  const auth = requireRole(ctx, CRITICAL_ROLES_FOR_TOOLS);
  if (!auth.ok) return fail("FORBIDDEN", "Evrak silme yalnız kurum sahibi ve kurum yöneticileri tarafından başlatılabilir.");
  const v = parseOrFail(z.object({ documentId: z.string().min(1) }), input);
  if (!v.ok) return v;
  const { getDocumentInstance } = await import("../documents");
  const doc = await getDocumentInstance(ctx.tenantId, v.data.documentId);
  if (!doc) return fail("NOT_FOUND", "Evrak bulunamadı; başka biri silmiş olabilir. Listeyi yenileyin.");
  const blockReason = await documentDeletionBlockReason(ctx.tenantId, doc);
  const openTaskCount = (await listTasks(ctx.tenantId)).filter(
    (t) => t.documentId === doc.id && !["COMPLETED", "CANCELLED", "ARCHIVED"].includes(t.status)
  ).length;
  const { getCriticalActionPasswordStatus } = await import("../critical-action-password");
  const status = await getCriticalActionPasswordStatus(ctx.tenantId);
  return ok({
    reference: doc.reference,
    status: doc.status,
    hasSignedFile: Boolean(doc.fileName),
    signedVersionCount: (doc.signedVersions ?? []).filter((x) => !x.deletedAt).length,
    openTaskCount,
    allowed: blockReason === null,
    ...(blockReason ? { blockReason } : {}),
    criticalPasswordConfigured: status.configured,
  });
}

/**
 * 2026-09-29 — arşivlenmiş evrakı SOFT DELETE eder (bkz. softDeleteArchivedDocumentInstance):
 * rol + evrak referans teyidi + kritik şifre + gerekçe. Hard delete / dosya silme YOK.
 */
export async function deleteDocumentInstanceTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ documentId: string }>> {
  const v = parseOrFail(
    z.object({ documentId: z.string().min(1), confirmation: z.string(), ...criticalDeleteFields }),
    input
  );
  if (!v.ok) return v;
  const { getDocumentInstance } = await import("../documents");
  const doc = await getDocumentInstance(ctx.tenantId, v.data.documentId);
  if (!doc) return fail("NOT_FOUND", "Evrak bulunamadı; başka biri silmiş olabilir. Listeyi yenileyin.");
  const target = { action: "document.delete", entityType: "DocumentInstance", entityId: doc.id, entityName: doc.reference };
  if (!sameName(v.data.confirmation, doc.reference)) {
    return fail("VALIDATION_ERROR", `Onay için evrak numarasını aynen yazın: "${doc.reference}".`);
  }
  const denied = await guardCriticalDelete(ctx, target, v.data.criticalPassword);
  if (denied) return denied;
  const blockReason = await documentDeletionBlockReason(ctx.tenantId, doc);
  if (blockReason) return fail("CONFLICT", blockReason);
  if (!(await softDeleteArchivedDocumentInstance(ctx.tenantId, doc.id))) {
    return fail("CONFLICT", "Evrak bu sırada değişti veya zaten silindi. Listeyi yenileyip tekrar kontrol edin.");
  }
  await recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: "document.delete",
    entityType: "DocumentInstance",
    entityId: doc.id,
    outcome: "success",
    meta: { entityName: doc.reference, reason: v.data.reason, kind: doc.kind, previousStatus: doc.status, mode: "soft" },
  });
  return ok({ documentId: doc.id });
}

const uploadSignedDocumentSchema = z.object({
  documentId: z.string().min(1),
  fileName: z
    .string()
    .min(1)
    .max(200)
    .refine((v) => !v.includes("/") && !v.includes("\\") && !v.includes(".."), "Geçersiz dosya adı"),
  fileMimeType: z.string().min(1).max(100),
  fileData: z.string().min(1).max(2_800_000),
});

/**
 * Evraklar — imzalı sürüm dosya güvenliği. Sabit allowlist (PDF + güvenli
 * görsel türleri), yasak uzantı denylist'i (task-attachments ile aynı
 * desen), boş/aşırı boyut reddi. Yeni depolama sağlayıcısı YOK — mevcut
 * base64-in-DB deseni (TeachingMaterial/HomeworkSubmission/TaskAttachment).
 */
const DOCUMENT_SIGNED_FILE_ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const DOCUMENT_SIGNED_FILE_DISALLOWED_EXT =
  /\.(exe|sh|bat|cmd|com|msi|dll|js|mjs|cjs|html?|svg|php\d?|jar|apk|ps1|vbs|scr|jsp)$/i;
const DOCUMENT_SIGNED_FILE_MAX_BYTES = 2_000_000;

function validateSignedDocumentFilePayload(input: {
  fileName: string;
  fileMimeType: string;
  fileData: string;
}): { ok: true; byteLength: number } | { ok: false; message: string } {
  if (DOCUMENT_SIGNED_FILE_DISALLOWED_EXT.test(input.fileName)) {
    return { ok: false, message: "Bu dosya türüne izin verilmiyor." };
  }
  if (!DOCUMENT_SIGNED_FILE_ALLOWED_MIME.has(input.fileMimeType)) {
    return { ok: false, message: "Desteklenmeyen dosya türü — yalnız PDF veya görsel (PNG/JPEG/WEBP) yükleyin." };
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(input.fileData, "base64");
  } catch {
    return { ok: false, message: "Dosya verisi okunamadı." };
  }
  const byteLength = buffer.length;
  if (byteLength <= 0) return { ok: false, message: "Boş dosya yüklenemez." };
  if (byteLength > DOCUMENT_SIGNED_FILE_MAX_BYTES) return { ok: false, message: "Dosya çok büyük (maks. 2MB)." };
  if (!checkFileMagicBytes(buffer, input.fileMimeType)) {
    return { ok: false, message: "Dosya içeriği beyan edilen türle uyuşmuyor." };
  }
  return { ok: true, byteLength };
}

/** İmzalı/taranmış sürüm yükleme — status "uploaded" olur, imzalayan+zaman kaydedilir, önceki sürüm geçmişte kalır. */
export async function uploadSignedDocumentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ documentId: string; status: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(uploadSignedDocumentSchema, input);
  if (!v.ok) return v;

  const fileCheck = validateSignedDocumentFilePayload(v.data);
  if (!fileCheck.ok) return fail("VALIDATION_ERROR", fileCheck.message);

  try {
    const doc = await uploadSignedDocumentFile(
      ctx.tenantId,
      v.data.documentId,
      {
        fileName: v.data.fileName,
        fileMimeType: v.data.fileMimeType,
        fileData: v.data.fileData,
        fileSize: fileCheck.byteLength,
      },
      ctx.userId
    );
    if (!doc) return fail("NOT_FOUND", "Belge bulunamadı.");
    audit(ctx, "document.upload_signed", "DocumentInstance", doc.id, {
      fileName: v.data.fileName,
      fileSize: fileCheck.byteLength,
    });
    return ok({ documentId: doc.id, status: doc.status });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "uploadSignedDocument failed");
  }
}

/**
 * Evraklar — şablon doldurmadan, doğrudan kategori (kind) seçip dosya
 * yükleme. `createDocumentInstance`'ın gerektirdiği `templateId` alanı
 * boş string olarak geçilir (DocumentInstance.templateId'nin Prisma'da
 * bir foreign key/ilişkisi YOK — yalnız serbest bir referans metni,
 * bkz. prisma/schema.prisma) — her kategoride önceden şablon
 * oluşturulmuş olmasına gerek kalmadan çalışır. Aynı anda
 * `uploadSignedDocumentFile` ile dosya eklenip status "uploaded" yapılır
 * — iki ayrı adım (önce boş belge, sonra yükleme) kullanıcıya HİÇ
 * gösterilmez, tek işlemmiş gibi çalışır.
 */
export async function uploadDocumentDirectTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ documentId: string; reference: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(uploadDocumentDirectSchema, input);
  if (!v.ok) return v;

  const fileCheck = validateSignedDocumentFilePayload(v.data);
  if (!fileCheck.ok) return fail("VALIDATION_ERROR", fileCheck.message);

  const data = await readReferenceData();
  const student = v.data.studentId ? data.students.find((s) => s.id === v.data.studentId) : undefined;
  if (v.data.studentId && !student) {
    return fail("VALIDATION_ERROR", "Seçilen öğrenci bulunamadı veya bu kuruma ait değil.");
  }
  const teacher = v.data.teacherId ? data.teachers.find((t) => t.id === v.data.teacherId) : undefined;
  if (v.data.teacherId && !teacher) {
    return fail("VALIDATION_ERROR", "Seçilen öğretmen bulunamadı veya bu kuruma ait değil.");
  }
  const branch = student ? data.settings.branches.find((b) => b.id === student.branchId) : undefined;

  try {
    const instance = await createDocumentInstance({
      tenantId: ctx.tenantId,
      templateId: "",
      kind: v.data.kind,
      fieldValues: {},
      studentId: v.data.studentId,
      teacherId: v.data.teacherId,
      branchId: branch?.id,
      createdBy: ctx.userId,
    });
    const uploaded = await uploadSignedDocumentFile(
      ctx.tenantId,
      instance.id,
      {
        fileName: v.data.fileName,
        fileMimeType: v.data.fileMimeType,
        fileData: v.data.fileData,
        fileSize: fileCheck.byteLength,
      },
      ctx.userId
    );
    if (!uploaded) return fail("INTERNAL_ERROR", "Belge oluşturuldu ama dosya yüklenemedi.");
    audit(ctx, "document.upload_direct", "DocumentInstance", instance.id, {
      kind: v.data.kind,
      fileName: v.data.fileName,
      fileSize: fileCheck.byteLength,
    });
    return ok({ documentId: instance.id, reference: instance.reference });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "uploadDocumentDirect failed");
  }
}

/** Yalnız yükleyen sorumlu veya tenant yöneticisi (her admin zaten TASK_ADMIN eşdeğeri) kaldırabilir — soft-delete, audit'li. */
export async function deleteSignedDocumentVersionTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ documentId: string; status: string }>> {
  const v = parseOrFail(deleteSignedDocumentVersionSchema.extend(criticalDeleteFields), input);
  if (!v.ok) return v;
  const denied = await guardCriticalDelete(
    ctx,
    { action: "document.signed_version_delete", entityType: "DocumentInstance", entityId: v.data.documentId },
    v.data.criticalPassword
  );
  if (denied) return denied;

  try {
    const doc = await softDeleteSignedVersion(ctx.tenantId, v.data.documentId, v.data.versionId);
    if (!doc) return fail("NOT_FOUND", "Belge veya sürüm kaydı bulunamadı.");
    audit(ctx, "document.signed_version_delete", "DocumentInstance", doc.id, {
      versionId: v.data.versionId,
      reason: v.data.reason,
    });
    return ok({ documentId: doc.id, status: doc.status });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "deleteSignedDocumentVersion failed");
  }
}

// ---------------------------------------------------------------------------
// FEATURE A — versiyonlu öğrenci kayıt sözleşmesi + ödeme planı.
// PDF/ıslak-imza CRUD'u MEVCUT belge araçlarına (yukarı) devredilir; bu
// bölüm yalnızca sözleşmeye özgü versiyon zinciri + ödeme planı iş
// kurallarını (RBAC, para/taksit doğrulaması) sarmalar.
// ---------------------------------------------------------------------------

/** Yalnızca yönetici/kurum admini — öğretmen dahil hiçbir başka rol sözleşme OLUŞTURAMAZ/YÖNETEMEZ. */
const CONTRACT_STAFF: AppRole[] = ["SCHOOL_ADMIN", "SUPER_ADMIN"];

/** P0 (2026-09-04) — bkz. contracts.ts `LastPeriodPricingMode`; preview ve create AYNI enum'u paylaşır. */
const lastPeriodPricingModeSchema = z.enum(["remaining_lessons", "regular_fee", "manual"]);

/**
 * `lastPeriodPricingMode`/`lastPeriodManualAmount` girdisini `LastPeriodPricing`'e
 * çözer — preview VE create TEK bu fonksiyonu çağırır (aynı doğrulama mesajı,
 * aynı "regular_fee ⇒ monthlyAmount" kuralı, iki ayrı kopya YOK).
 */
function resolveLastPeriodPricing(input: {
  mode?: z.infer<typeof lastPeriodPricingModeSchema>;
  monthlyAmount: number;
  manualAmount?: number;
}): { ok: true; pricing: import("../contracts").LastPeriodPricing | undefined } | { ok: false; message: string } {
  if (!input.mode || input.mode === "remaining_lessons") return { ok: true, pricing: undefined };
  if (input.mode === "regular_fee") {
    return { ok: true, pricing: { mode: "regular_fee", regularFeeAmount: input.monthlyAmount } };
  }
  if (!input.manualAmount || input.manualAmount <= 0) {
    return { ok: false, message: "Son dönem tutarı manuel seçildiğinde sıfırdan büyük bir tutar girilmelidir." };
  }
  return { ok: true, pricing: { mode: "manual", manualAmount: input.manualAmount } };
}

const contractInstallmentPlanSchema = z.object({
  durationMonths: z.number().int().min(1).max(12),
  monthlyAmount: z.number().int().min(0, "Aylık ücret negatif olamaz."),
  installmentCount: z.number().int().min(1).max(12),
  firstDueDate: z.string().min(1),
  depositAmount: z.number().int().min(0).optional(),
  paymentMethod: z.string().max(50).optional(),
  /** Bkz. createStudentContractTool şema yorumu — AYNI opt-in, önizlemenin GERÇEK planla tutarlı kalması için. */
  usePerLessonBilling: z.boolean().optional(),
  studentId: z.string().min(1).optional(),
  enrollmentStartDate: z.string().min(1).optional(),
  enrollmentEndDate: z.string().min(1).optional(),
  /** P0 (2026-09-04) — "Sözleşmenin son döneminde eksik kalan dersler nasıl ücretlendirilsin?" tercihi; bkz. `resolveLastPeriodPricing`. */
  lastPeriodPricingMode: lastPeriodPricingModeSchema.optional(),
  lastPeriodManualAmount: z.number().int().positive().optional(),
  /** Sözleşme bitiş tercihi — bkz. contracts.ts `computeContractEndDate`; verilmezse "month_end". */
  endDatePreference: z.enum(["month_end", "date_based"]).optional(),
  /** Sahip kararı (2026-09-16) — ilk tahsilat takip eden ayı da kapsıyor mu; verilmezse kayıt anındaki seçim okunur. */
  mergeFirstCollection: z.boolean().optional(),
  /**
   * 2026-09-22 — kayıtta ilk tahsilatı OLMAYAN öğrencinin (ör. CSV) ilk sözleşmesinde
   * formda girilen tahsilat tutarı. Kayıt anı ödemesi varsa o esas alınır, bu yok sayılır.
   * createContract'ın `firstPaymentCollected.amount` kullanımıyla AYNI kaynak.
   */
  firstPaymentAmount: z.number().int().positive().optional(),
  /** Önizleme tablosunda elle düzenlenen taksit tutarları (sıra no → tutar). */
  installmentAmountOverrides: z
    .array(z.object({ sequence: z.number().int().min(1).max(24), amount: z.number().int().min(0) }))
    .max(24)
    .optional(),
  /** 2026-09-19 — önizleme tablosunda elle değiştirilen vade tarihleri (sıra no → yyyy-MM-dd). */
  installmentDueDateOverrides: z
    .array(
      z.object({
        sequence: z.number().int().min(1).max(24),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Vade tarihini takvimden seçin."),
      })
    )
    .max(24)
    .optional(),
});

/** Oluşturmadan ÖNCE taksit planı + toplam tutarı önizler — hiçbir kalıcı kayıt yazmaz. */
export async function previewContractInstallmentPlanTool(
  ctx: ServiceContext,
  input: unknown
): Promise<
  ServiceResult<{
    totalContractAmount: number;
    installments: import("../types").ContractInstallmentSnapshot[];
    isFormal: boolean;
    paymentDueRuleText: string;
    firstDueDateInWindow: boolean;
    /** Sunucunun esas aldığı bitiş — birleşik ilk tahsilatta istemcinin gönderdiğinden farklı olabilir. */
    enrollmentEndDate?: string;
  }>
> {
  const auth = requireRole(ctx, CONTRACT_STAFF);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(contractInstallmentPlanSchema, input);
  if (!v.ok) return v;
  const lastPeriodResolved = resolveLastPeriodPricing({
    mode: v.data.lastPeriodPricingMode,
    monthlyAmount: v.data.monthlyAmount,
    manualAmount: v.data.lastPeriodManualAmount,
  });
  if (!lastPeriodResolved.ok) return fail("VALIDATION_ERROR", lastPeriodResolved.message);
  try {
    const data = await readData();
    const paymentPolicy = data.settings.collectionsSettings;
    let installments: import("../types").ContractInstallmentSnapshot[];
    let totalContractAmount: number;
    // createStudentContractTool ile AYNI kural — birleşik ilk tahsilatta bitiş BİR AY kaymaz.
    let enrollmentEndDate = v.data.enrollmentEndDate;
    const student = v.data.studentId ? data.students.find((s) => s.id === v.data.studentId) : undefined;
    if (
      v.data.usePerLessonBilling &&
      student &&
      studentUsesPerLessonBilling(student) &&
      student.weeklyLessonCount > 0 &&
      v.data.enrollmentStartDate &&
      v.data.enrollmentEndDate
    ) {
      const { computePeriodBillingPreview } = await import("../period-lesson-billing");
      const enrollmentStartDay = v.data.enrollmentStartDate;
      const weeklyLessonCount = student.weeklyLessonCount;
      const computeLines = (enrollmentEndDay: string) => computePeriodBillingPreview({
        enrollmentStartDay,
        enrollmentEndDay,
        // P0-1 (2026-09-09) — taban, öğrencinin DONMUŞ ve YUVARLANMIŞ
        // `derivedPerLessonAmount` alanı DEĞİL, bu sözleşmede ONAYLANAN
        // aylık ücrettir. Böylece normal aylık taksit her zaman tam
        // `monthlyAmount`'a eşit çıkar (5.952 regresyonu).
        monthlyFee: v.data.monthlyAmount,
        weeklyLessonCount,
        studentId: student.id,
        lessons: data.lessons.map((l) => ({
          id: l.id,
          studentId: l.studentId,
          startAt: l.startAt,
          type: l.type,
          status: l.status,
          opsClosedFlag: l.opsClosedFlag,
        })),
        makeupRequests: data.makeupRequests.map((m) => ({ sourceLessonId: m.sourceLessonId, status: m.status })),
      });
      // Bitiş istemciden değil, başlangıç + süreden (başlangıç ayı = 1. ay) — bkz. computeContractEndDate.
      enrollmentEndDate = computeContractEndDate(enrollmentStartDay.slice(0, 10), v.data.durationMonths, v.data.endDatePreference);
      const billingLines = foldBillingLinesIntoContractMonths(
        computeLines(enrollmentEndDate),
        enrollmentStartDay.slice(0, 10),
        v.data.durationMonths
      );
      // Kayıt anında GERÇEKTEN tahsil edilen ilk ödeme — `createContract`'ın
      // (bkz. contracts.ts `firstPaymentActualAmount`/`requiresFirstPaymentAtRegistration`)
      // kullandığı AYNI kaynak ve AYNI koşul (yalnız FORMAL — >=3 ay — süre).
      // Bu olmadan/koşulsuz kullanılırsa önizleme her zaman otomatik tutarı
      // gösterir ya da informal (Tanışma) sürede create'ten FARKLI davranır.
      const registrationFirstPayment = isFormalContractDuration(v.data.durationMonths)
        ? await getRegistrationFirstPayment(student.id)
        : null;
      installments = buildPerLessonInstallmentSchedule({
        billingLines,
        firstPeriodManualNetAmount:
          registrationFirstPayment?.amount ??
          (isFormalContractDuration(v.data.durationMonths) ? v.data.firstPaymentAmount : undefined),
        mergeFirstTwoPeriods: v.data.mergeFirstCollection ?? registrationFirstPayment?.firstCollectionIncludesNextMonth ?? false,
        firstDueDate: v.data.firstDueDate,
        paymentMethod: v.data.paymentMethod,
        paymentPolicy,
        lastPeriodPricing: lastPeriodResolved.pricing,
      });
      totalContractAmount = installments.reduce((s, r) => s + r.amount, 0) + (v.data.depositAmount ?? 0);
    } else {
      totalContractAmount = v.data.durationMonths * v.data.monthlyAmount;
      installments = buildInstallmentSchedule({
        totalContractAmount,
        depositAmount: v.data.depositAmount,
        installmentCount: v.data.installmentCount,
        firstDueDate: v.data.firstDueDate,
        paymentMethod: v.data.paymentMethod,
        paymentPolicy,
      });
    }
    if (v.data.installmentAmountOverrides?.length) {
      // Elle düzenlenen tutarlar — önizlemedeki toplam da AYNI satırlardan yeniden hesaplanır.
      installments = applyInstallmentAmountOverrides(installments, v.data.installmentAmountOverrides);
      totalContractAmount = installments.reduce((s, r) => s + r.amount, 0) + (v.data.depositAmount ?? 0);
    }
    if (v.data.installmentDueDateOverrides?.length) {
      try {
        installments = applyInstallmentDueDateOverrides(installments, v.data.installmentDueDateOverrides);
      } catch (e) {
        return fail("VALIDATION_ERROR", e instanceof Error ? e.message : "Vade tarihi geçersiz.");
      }
    }
    const rule = resolveContractPaymentDueRule(v.data.paymentMethod, paymentPolicy);
    const firstDueDay = new Date(v.data.firstDueDate).getUTCDate();
    const firstDueDateInWindow = firstDueDay >= rule.windowStartDay && firstDueDay <= rule.windowEndDay;
    return ok({
      totalContractAmount,
      installments,
      isFormal: isFormalContractDuration(v.data.durationMonths),
      paymentDueRuleText: rule.ruleText,
      firstDueDateInWindow,
      enrollmentEndDate,
    });
  } catch (e) {
    return fail("VALIDATION_ERROR", e instanceof Error ? e.message : "Taksit planı hesaplanamadı.");
  }
}

const HISTORICAL_CONTRACT_TYPE_LABELS: Record<"initial" | "renewal" | "amendment", string> = {
  initial: "Öğrenci Kayıt Sözleşmesi",
  renewal: "Sözleşme Yenileme",
  amendment: "Sözleşme Değişikliği",
};
const HISTORICAL_DOCUMENT_STATUS_LABELS: Record<string, string> = {
  arsiv_belgesi: "Arşiv Belgesi",
  imzali_nusha_mevcut: "İmzalı Nüsha Mevcut",
  imza_durumu_bilinmiyor: "İmza Durumu Bilinmiyor",
};

/** P0 (2026-08-31) — Veri Aktarım Merkezi, tarihi sözleşme toplu CSV önizleme. */
export async function previewHistoricalContractImportTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<ImportPreview<HistoricalContractImportRow>>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(csvInputSchema, input);
  if (!v.ok) return v;
  const { validateHistoricalContractRows } = await import("../import/historical-contracts");
  const data = await readData();
  return ok(validateHistoricalContractRows(data, csvRecords(v.data.csvText)));
}

/**
 * P0 (2026-08-31) — Veri Aktarım Merkezi, tarihi sözleşme toplu CSV içe
 * aktarım (commit). Her geçerli satır bir ARŞİV `DocumentInstance` olarak
 * oluşturulur — `createContract()`'ın mali doğrulama hattından GEÇMEZ (bkz.
 * historical-contracts.ts dosya başı yorumu), hiçbir `StudentContract`/
 * `Payment` satırı YARATILMAZ. Aktif şablon varsa (yoksa hata ÜRETMEZ,
 * yalnızca placeholder'lar boş kalır) kullanılır — hiçbir şablon otomatik
 * etkinleştirilmez/değiştirilmez.
 */
export async function commitHistoricalContractImportTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ created: number; skipped: number }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(csvInputSchema, input);
  if (!v.ok) return v;

  const { validateHistoricalContractRows } = await import("../import/historical-contracts");
  const data = await readData();
  const preview = validateHistoricalContractRows(data, csvRecords(v.data.csvText));
  if (preview.errorCount > 0) {
    return fail("VALIDATION_ERROR", "CSV içinde hatalı satır var; hiçbir kayıt eklenmedi.", preview.errors);
  }
  if (preview.valid.length === 0) return fail("VALIDATION_ERROR", "İçe aktarılacak geçerli satır yok.");

  const templates = await listAllTemplates(ctx.tenantId);
  const template = selectActiveTemplateOfKind(templates, "student_enrollment_contract");

  let created = 0;
  let skipped = 0;
  try {
    for (const row of preview.valid) {
      const student = data.students.find((s) => s.id === row.studentId);
      if (!student) {
        skipped += 1;
        continue;
      }
      const totalContractAmount = row.durationMonths * row.monthlyAmount;
      const paymentPolicy = data.settings.collectionsSettings;
      const rule = resolveContractPaymentDueRule(row.paymentMethod, paymentPolicy);
      let installments: ReturnType<typeof buildInstallmentSchedule> = [];
      try {
        installments = buildInstallmentSchedule({
          totalContractAmount,
          installmentCount: row.installmentCount,
          firstDueDate: new Date(`${row.contractDate}T00:00:00.000Z`).toISOString(),
          paymentMethod: row.paymentMethod,
          paymentPolicy,
        });
      } catch {
        // Taksit planı hesaplanamazsa (ör. tutarsız veri) boş bırakılır — arşiv belgesi yine de oluşturulur.
      }
      const title = contractTitleFields({
        contractType: row.contractType,
        studentName: student.name,
        enrollmentStartDate: new Date(`${row.enrollmentStartDate}T00:00:00.000Z`).toISOString(),
        durationMonths: row.durationMonths,
        versionNumber: 1,
      });

      const fieldValues: Record<string, string> = {
        institutionName: data.settings.name ?? "",
        titleMain: title.titleMain,
        titleSub: `${title.titleSub} · İçe Aktarılan Tarihi Kayıt · ${HISTORICAL_DOCUMENT_STATUS_LABELS[row.documentStatus]}`,
        contractTypeLabel: HISTORICAL_CONTRACT_TYPE_LABELS[row.contractType],
        studentName: student.name,
        programmeName: row.programmeName,
        enrollmentStartDateText: formatDateTr(row.enrollmentStartDate),
        enrollmentEndDateText: formatDateTr(row.enrollmentEndDate),
        totalContractAmountText: new Intl.NumberFormat("tr-TR").format(totalContractAmount),
        signatoryFullName: row.signatoryFullName,
        paymentDueRuleText: rule.ruleText,
        vatStatusText: "Dahil",
        generatedAtText: formatDateTr(row.contractDate),
      };
      for (let i = 1; i <= 12; i++) {
        const inst = installments[i - 1];
        fieldValues[`taksit${i}Tarih`] = inst ? formatDateTr(inst.dueDate) : "";
        fieldValues[`taksit${i}Tutar`] = inst ? new Intl.NumberFormat("tr-TR").format(inst.amount) : "";
        // P0 revizyonu — "Ödeme Türü" sütunu: içe aktarılan tarihi kayıtta
        // yöntem bilgisi varsa aynen yazılır, yoksa boş (uydurulmaz).
        fieldValues[`taksit${i}Yontem`] = inst ? paymentMethodLabelTr(row.paymentMethod) : "";
      }
      if (row.notes) fieldValues.renewalNoticeText = `İçe aktarım notu: ${row.notes}`;

      await createDocumentInstance({
        tenantId: ctx.tenantId,
        templateId: template?.id ?? "",
        kind: "student_enrollment_contract",
        studentId: student.id,
        fieldValues,
        createdBy: ctx.userId,
        installmentCount: row.installmentCount,
        status: "uploaded",
      });
      created += 1;
    }
    audit(ctx, "contract.historical_csv_import", "DocumentInstance", "bulk", {
      created,
      skipped,
      totalRows: preview.totalRows,
    });
    return ok({ created, skipped });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "commitHistoricalContractImport failed");
  }
}

const createStudentContractSchema = z.object({
  studentId: z.string().min(1),
  contractType: z.enum(["initial", "renewal", "amendment"]),
  previousContractId: z.string().min(1).optional(),
  programmeName: z.string().min(1).max(200),
  lessonScheduleText: z.string().max(200).optional(),
  enrollmentStartDate: z.string().min(1),
  enrollmentEndDate: z.string().min(1),
  durationMonths: z.number().int().min(1).max(12),
  monthlyAmount: z.number().int().min(0, "Aylık ücret negatif olamaz."),
  installmentCount: z.number().int().min(1).max(12),
  firstDueDate: z.string().min(1),
  depositAmount: z.number().int().min(0).optional(),
  paymentMethod: z.string().max(50).optional(),
  signatoryFullName: z.string().min(1).max(200),
  signatoryNationalId: z.string().max(20).optional(),
  signatoryAddress: z.string().max(500).optional(),
  signatoryRelationship: z.string().max(50).optional(),
  allowOverlap: z.boolean().optional(),
  overlapReason: z.string().max(500).optional(),
  /** Faz 2 — ilk taksit tarihi kurumun ödeme penceresi (kart 1–5, havale/nakit ≤15) dışındaysa zorunlu gerekçe. */
  firstPaymentExceptionReason: z.string().max(500).optional(),
  /** Nilüfer Acar politikası §4 — önceki dönem borcu kapanmadan yenilemeyi tamamlamak için yetkili (CONTRACT_STAFF) gerekçesi zorunlu; audit'lenir. */
  renewalDebtOverrideReason: z.string().min(1).max(500).optional(),
  photoVideoConsent: z
    .object({
      granted: z.boolean(),
      representativeName: z.string().min(1).max(200),
      relationship: z.string().min(1).max(50),
      /** 2026-2027 kaynağı Fotoğraf/Video Açık Rıza Formu — 5 kanaldan HER BİRİ ayrı değerlendirilir; boş/undefined ise eski davranış (photo+video) korunur. */
      scopes: z
        .array(
          z.enum(["photo", "video", "name", "voice", "website", "instagram", "other", "print_materials", "digital_ads", "in_house_board"])
        )
        .optional(),
    })
    .optional(),
  /** 2026-2027 kaynağı KAYIT VE İMZA BİLGİLERİ — "KVKK Aydınlatma Metni ayrıca teslim edilmiş/bilgilendirme yapılmıştır" işareti (açık rıza DEĞİL, yalnızca teslimat kaydı). */
  kvkkNoticeDelivered: z.boolean().optional(),
  /**
   * Owner policy (2026-08-29) — "İlk ödeme her zaman kayıt esnasında alınacaktır." Zorunlu için
   * initial/renewal (bkz. contracts.ts createContract) — eksikse FIRST_PAYMENT_REQUIRED_MESSAGE
   * ile reddedilir. amendment için opsiyonel (yeni tahsilat anı yaratmaz).
   */
  firstPaymentCollected: z
    .object({
      method: z.string().min(1).max(50),
      amount: z.number().int().positive(),
      collectedAt: z.string().min(1),
      reference: z.string().max(100).optional(),
      note: z.string().max(500).optional(),
    })
    .optional(),
  /**
   * P0 (2026-09-03) — açık OPT-IN: verilmezse (varsayılan/eski davranış)
   * taksit planı `monthlyAmount` üzerinden SABİT SAYIDA eşit satır olarak
   * üretilir (DEĞİŞMEDİ). true ise — yalnız `Student.derivedPerLessonAmount`
   * dolu (yeni, per-lesson fiyatlandırma kullanan) öğrenciler için —
   * `computePeriodBillingPreview`'in GERÇEK/tahmini dönem ders sayılarına
   * göre değişen taksit satırları + "3 ders eşiği" birleştirme kuralı
   * uygulanır. Mevcut sözleşme oluşturma çağrıları (ör. yenileme ekranı)
   * bu alanı GÖNDERMEDİĞİ sürece hiçbir davranış değişikliği görmez.
   */
  usePerLessonBilling: z.boolean().optional(),
  /** P0 (2026-09-04) — "Sözleşmenin son döneminde eksik kalan dersler nasıl ücretlendirilsin?" tercihi; bkz. `resolveLastPeriodPricing`. Yalnız `usePerLessonBilling` ile birlikte anlamlı, undefined ise davranış DEĞİŞMEZ. */
  lastPeriodPricingMode: lastPeriodPricingModeSchema.optional(),
  lastPeriodManualAmount: z.number().int().positive().optional(),
  /** Sözleşme bitiş tercihi — bkz. contracts.ts `computeContractEndDate`; verilmezse "month_end". */
  endDatePreference: z.enum(["month_end", "date_based"]).optional(),
  /** Sahip kararı (2026-09-16) — ilk tahsilat takip eden ayı da kapsıyor mu; verilmezse kayıt anındaki seçim okunur. */
  mergeFirstCollection: z.boolean().optional(),
  /** Önizleme tablosunda elle düzenlenen taksit tutarları (sıra no → tutar). */
  installmentAmountOverrides: z
    .array(z.object({ sequence: z.number().int().min(1).max(24), amount: z.number().int().min(0) }))
    .max(24)
    .optional(),
  /** 2026-09-19 — önizleme tablosunda elle değiştirilen vade tarihleri (sıra no → yyyy-MM-dd). */
  installmentDueDateOverrides: z
    .array(
      z.object({
        sequence: z.number().int().min(1).max(24),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Vade tarihini takvimden seçin."),
      })
    )
    .max(24)
    .optional(),
});

/** İlk kayıt / yenileme / değişiklik — hepsi TEK giriş noktası, `contractType` iş akışını belirler. */
export async function createStudentContractTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ contract: StudentContract; installments: ContractInstallmentView[] }>> {
  const auth = requireRole(ctx, CONTRACT_STAFF);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(createStudentContractSchema, input);
  if (!v.ok) return v;
  const lastPeriodResolved = resolveLastPeriodPricing({
    mode: v.data.lastPeriodPricingMode,
    monthlyAmount: v.data.monthlyAmount,
    manualAmount: v.data.lastPeriodManualAmount,
  });
  if (!lastPeriodResolved.ok) return fail("VALIDATION_ERROR", lastPeriodResolved.message);

  const data = await readData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  if (!student) return fail("VALIDATION_ERROR", "Seçilen öğrenci bulunamadı veya bu kuruma ait değil.");
  const branch = data.settings.branches.find((b) => b.id === student.branchId);

  const isMinor = student.birthDate ? computeAge(student.birthDate) < 18 : false;

  // 2026-2027 kaynağı Madde 1 — kurumun TÜM şubeleri arasından öğrencinin
  // şubesini işaretleyen hazır metin (renderer dinamik listeyi DESTEKLEMEDİĞİNDEN
  // burada tools katmanında, gerçek Branch verisiyle, düz metne indirgenir).
  const branchOptionsText = data.settings.branches
    .map((b) => `${b.id === student.branchId ? "☑" : "☐"} ${b.name}: ${b.address}`)
    .join("    ");

  let studentNationalId: string | undefined;
  if (student.nationalIdCipher) {
    try {
      const { decryptNationalId } = await import("../pii");
      studentNationalId = decryptNationalId(student.nationalIdCipher);
    } catch {
      // sözleşme üretimini durdurmaz — alan boş bırakılır, personel gerekirse elle ekler.
    }
  }

  // P0 (2026-09-03) — bkz. şema yorumu: yalnız açıkça istenmişse VE öğrenci
  // gerçekten per-lesson fiyatlandırma kullanıyorsa (derivedPerLessonAmount
  // dolu) hesaplanır; aksi halde undefined kalır ve createContract eski
  // (fixed, SABİT SAYIDA eşit taksit) davranışını AYNEN sürdürür.
  let perLessonBillingLines: import("../period-lesson-billing").PeriodBillingLine[] | undefined;
  // Bitiş sunucuda başlangıç + süreden (başlangıç ayı = 1. ay) — bkz. `computeContractEndDate`.
  let enrollmentEndDate = v.data.enrollmentEndDate;
  if (v.data.usePerLessonBilling && studentUsesPerLessonBilling(student) && student.weeklyLessonCount > 0) {
    const { computePeriodBillingPreview } = await import("../period-lesson-billing");
    const weeklyLessonCount = student.weeklyLessonCount;
    const computeLines = (enrollmentEndDay: string) => computePeriodBillingPreview({
      enrollmentStartDay: v.data.enrollmentStartDate,
      enrollmentEndDay,
      // P0-1 (2026-09-09) — önizleme (previewContractInstallmentPlanTool) ile
      // BİREBİR aynı taban: onaylanan aylık ücret. İkisi farklı taban
      // kullanırsa "önizlemede gördüğüm plan kayıtta değişti" hatası doğar.
      monthlyFee: v.data.monthlyAmount,
      weeklyLessonCount,
      studentId: student.id,
      lessons: data.lessons.map((l) => ({
        id: l.id,
        studentId: l.studentId,
        startAt: l.startAt,
        type: l.type,
        status: l.status,
        opsClosedFlag: l.opsClosedFlag,
      })),
      makeupRequests: data.makeupRequests.map((m) => ({ sourceLessonId: m.sourceLessonId, status: m.status })),
    });
    enrollmentEndDate = computeContractEndDate(v.data.enrollmentStartDate.slice(0, 10), v.data.durationMonths, v.data.endDatePreference);
    perLessonBillingLines = foldBillingLinesIntoContractMonths(
      computeLines(enrollmentEndDate),
      v.data.enrollmentStartDate.slice(0, 10),
      v.data.durationMonths
    );
  }

  // Sahip kararı (2026-09-16) — birleştirme kullanıcının AÇIK seçimi: istek söylüyorsa o,
  // söylemiyorsa kayıt anında verilen ve ödemeye yazılan seçim; ders sayısından TÜRETİLMEZ.
  const registrationFirstPaymentRow = await getRegistrationFirstPayment(student.id);
  const mergeFirstCollection =
    v.data.mergeFirstCollection ?? registrationFirstPaymentRow?.firstCollectionIncludesNextMonth ?? false;

  try {
    const { contract, installments } = await createContract({
      tenantId: ctx.tenantId,
      studentId: student.id,
      contractType: v.data.contractType,
      previousContractId: v.data.previousContractId,
      programmeName: v.data.programmeName,
      lessonScheduleText: v.data.lessonScheduleText,
      enrollmentStartDate: v.data.enrollmentStartDate,
      enrollmentEndDate,
      durationMonths: v.data.durationMonths,
      monthlyAmount: v.data.monthlyAmount,
      installmentCount: v.data.installmentCount,
      firstDueDate: v.data.firstDueDate,
      depositAmount: v.data.depositAmount,
      paymentMethod: v.data.paymentMethod,
      signatoryFullName: v.data.signatoryFullName,
      signatoryNationalId: v.data.signatoryNationalId,
      signatoryAddress: v.data.signatoryAddress,
      signatoryRelationship: v.data.signatoryRelationship,
      isMinor,
      photoVideoConsent: v.data.photoVideoConsent,
      photoVideoConsentFormPresented: v.data.photoVideoConsent !== undefined,
      kvkkNoticeDelivered: v.data.kvkkNoticeDelivered,
      studentName: student.name,
      parentName: student.parentName,
      branchName: branch?.name,
      branchOptionsText,
      lessonDurationMinutes: student.lessonDurationMinutes,
      weeklyLessonCount: student.weeklyLessonCount,
      vatInclusive: data.settings.collectionsSettings?.contractVatInclusive,
      studentNationalId,
      studentBirthDateText: student.birthDate ? formatDate(student.birthDate) : undefined,
      studentPhone: student.phone,
      studentEmail: student.email,
      institutionName: data.settings.name ?? "",
      institutionAddress: branch?.address ?? "",
      // P0-E (2026-09-02) — sözleşme oluşturma anındaki AKTİF kurum logosu
      // burada dondurulur (contractDataSnapshot.logoUrl); kurum daha sonra
      // logosunu değiştirse/kaldırsa bile bu sözleşme SESSİZCE değişmez
      // (bkz. getContractHtmlTool — CANLI data.settings.logoUrl DEĞİL, bu
      // donmuş snapshot okunur).
      logoUrl: data.settings.logoUrl,
      createdBy: ctx.userId,
      allowOverlap: v.data.allowOverlap,
      overlapReason: v.data.overlapReason,
      paymentPolicy: data.settings.collectionsSettings,
      firstPaymentExceptionReason: v.data.firstPaymentExceptionReason,
      renewalDebtOverrideReason: v.data.renewalDebtOverrideReason,
      firstPaymentCollected: v.data.firstPaymentCollected,
      perLessonBillingLines,
      mergeFirstCollectionWithNextMonth: mergeFirstCollection,
      installmentAmountOverrides: v.data.installmentAmountOverrides,
      installmentDueDateOverrides: v.data.installmentDueDateOverrides,
      lastPeriodPricing: lastPeriodResolved.pricing,
    });

    if (v.data.contractType !== "initial" && v.data.renewalDebtOverrideReason?.trim()) {
      audit(ctx, "contract.renewal_debt_override", "StudentContract", contract.id, {
        previousContractId: v.data.previousContractId,
        reason: v.data.renewalDebtOverrideReason.trim(),
      });
    }

    if (v.data.firstPaymentCollected) {
      audit(ctx, "contract.first_payment_collected", "StudentContract", contract.id, {
        method: v.data.firstPaymentCollected.method,
        amount: v.data.firstPaymentCollected.amount,
        collectedAt: v.data.firstPaymentCollected.collectedAt,
        reference: v.data.firstPaymentCollected.reference,
        exceptionReason: v.data.firstPaymentExceptionReason,
      });
    }

    if (v.data.photoVideoConsent) {
      try {
        const { setSocialMediaConsent } = await import("../social-media-consent");
        await setSocialMediaConsent({
          tenantId: ctx.tenantId,
          studentId: student.id,
          status: v.data.photoVideoConsent.granted ? "granted" : "denied",
          representativeName: v.data.photoVideoConsent.representativeName,
          relationship: v.data.photoVideoConsent.relationship,
          scopes: v.data.photoVideoConsent.granted ? v.data.photoVideoConsent.scopes ?? ["photo", "video"] : [],
          sourceDocumentRef: contract.contractNumber,
          actorUserId: ctx.userId,
        });
      } catch {
        // best-effort — sözleşme zaten oluşturuldu, izin kaydı ayrıca Kişisel Veriler ekranından girilebilir.
      }
    }

    audit(ctx, `contract.${v.data.contractType}`, "StudentContract", contract.id, {
      contractNumber: contract.contractNumber,
      studentId: student.id,
      totalContractAmount: contract.totalContractAmount,
      previousContractId: v.data.previousContractId,
      overlapAllowed: v.data.allowOverlap ?? false,
    });
    if (v.data.firstPaymentExceptionReason?.trim()) {
      audit(ctx, "contract.first_payment_window_exception", "StudentContract", contract.id, {
        contractNumber: contract.contractNumber,
        studentId: student.id,
        firstDueDate: v.data.firstDueDate,
        reason: v.data.firstPaymentExceptionReason,
      });
    }
    return ok({ contract, installments });
  } catch (e) {
    if (e instanceof ContractTemplateIncompleteError) {
      return fail("VALIDATION_ERROR", e.message);
    }
    if (e instanceof RenewalDebtBlockedError) {
      void recordAuditLog({
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        actorRole: ctx.role,
        action: "contract.renewal_debt_blocked",
        entityType: "StudentContract",
        entityId: v.data.previousContractId ?? student.id,
        outcome: "denied",
        meta: { outstandingAmount: e.outstandingAmount, unpaidInstallmentCount: e.unpaidInstallmentCount },
      });
      return fail("CONFLICT", e.message, {
        outstandingAmount: e.outstandingAmount,
        unpaidInstallmentCount: e.unpaidInstallmentCount,
      });
    }
    return fail("VALIDATION_ERROR", e instanceof Error ? e.message : "Sözleşme oluşturulamadı.");
  }
}

/** Yenileme öncesi UI'ın borç bloğunu ÖNCEDEN göstermesi için — kalıcı kayıt yazmaz, sadece okur. */
export async function getRenewalDebtStatusTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ outstandingAmount: number; unpaidInstallmentCount: number; blocksRenewal: boolean }>> {
  const auth = requireRole(ctx, CONTRACT_STAFF);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(z.object({ previousContractId: z.string().min(1) }), input);
  if (!v.ok) return v;
  try {
    const { outstandingAmount, unpaidInstallmentCount } = await computeOutstandingContractBalance(
      ctx.tenantId,
      v.data.previousContractId
    );
    return ok({ outstandingAmount, unpaidInstallmentCount, blocksRenewal: outstandingAmount > 0 });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "Borç durumu hesaplanamadı.");
  }
}

const contractIdSchema = z.object({ contractId: z.string().min(1) });

/** Sözleşme geçmişi — hem geçerli/en güncel hem eski sürümler (superseded/cancelled dahil), en yeni versiyon önce. */
export async function listStudentContractsTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ contracts: StudentContract[] }>> {
  const v = parseOrFail(z.object({ studentId: z.string().min(1) }), input);
  if (!v.ok) return v;
  const allowed = await canAccessStudent(ctx, v.data.studentId);
  if (!allowed) return fail("FORBIDDEN", "Bu öğrencinin sözleşmelerine erişim yetkiniz yok.");
  try {
    const contracts = await listContractsForStudent(ctx.tenantId, v.data.studentId);
    return ok({ contracts });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "listStudentContracts failed");
  }
}

export async function getStudentContractTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ contract: StudentContract; installments: ContractInstallmentView[] }>> {
  const v = parseOrFail(z.object({ contractId: z.string().min(1) }), input);
  if (!v.ok) return v;
  try {
    const contract = await getContract(ctx.tenantId, v.data.contractId);
    if (!contract) return fail("NOT_FOUND", "Sözleşme bulunamadı.");
    const allowed = await canAccessStudent(ctx, contract.studentId);
    if (!allowed) return fail("FORBIDDEN", "Bu sözleşmeye erişim yetkiniz yok.");
    const installments = await listInstallmentsForContract(ctx.tenantId, contract.id);
    return ok({ contract, installments });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "getStudentContract failed");
  }
}

/** Yazdırılabilir/görüntülenebilir HTML — bağlı DocumentInstance.renderedHtml'i AYNI erişim kuralıyla açar. */
export async function getContractHtmlTool(
  ctx: ServiceContext,
  input: unknown
): Promise<
  ServiceResult<{ html: string; contractNumber: string; status: string; studentId: string; titleMain: string; fileName: string }>
> {
  const v = parseOrFail(contractIdSchema, input);
  if (!v.ok) return v;
  try {
    const contract = await getContract(ctx.tenantId, v.data.contractId);
    if (!contract) return fail("NOT_FOUND", "Sözleşme bulunamadı.");
    const allowed = await canAccessStudent(ctx, contract.studentId);
    if (!allowed) return fail("FORBIDDEN", "Bu sözleşmeye erişim yetkiniz yok.");
    if (!contract.documentInstanceId) {
      return fail("VALIDATION_ERROR", "Bu bir tanışma paketi kaydıdır (1-2 ay); resmi sözleşme belgesi üretilmedi.");
    }
    const { getDocumentInstance } = await import("../documents");
    const doc = await getDocumentInstance(ctx.tenantId, contract.documentInstanceId);
    if (!doc) return fail("NOT_FOUND", "Sözleşme belgesi bulunamadı.");
    const titleFields = contractTitleFields({
      contractType: contract.contractType,
      studentName: contract.contractDataSnapshot.studentName,
      enrollmentStartDate: contract.enrollmentStartDate,
      durationMonths: contract.durationMonths,
      versionNumber: contract.versionNumber,
    });
    const data = await readData();
    const { prependInstitutionLogo } = await import("../institution-logo");
    // P0-E (2026-09-02) — kök neden: burada CANLI `data.settings.logoUrl`
    // okunuyordu, yani kurum logosunu DEĞİŞTİRDİĞİNDE (hatta imzalanmış)
    // TÜM eski sözleşmeler görüntülenirken SESSİZCE yeni logoyu gösterirdi.
    // Artık sözleşme OLUŞTURULDUĞU andaki donmuş logo (`contractDataSnapshot.logoUrl`
    // — bkz. createStudentContractTool/contracts.ts createContract) okunur;
    // bu alan hiç var olmadan üretilmiş eski sözleşmelerde undefined kalır,
    // ki bu da DOĞRU davranıştır (o sözleşmeler zaten hiçbir zaman logo
    // GÖSTERMİYORDU — canlı logoya sessizce geçmemeliler).
    // P0 (2026-09-05) — CSP `img-src 'self' data: blob:` (next.config.ts) bir
    // harici http(s) logo URL'ini SESSİZCE engeller, görünür hata vermez (bkz.
    // LESSONS_LEARNED.md 2026-09-05 kaydı). Data-URI geçişinden ÖNCE dondurulmuş
    // eski sözleşmelerin `logoUrl`si hâlâ böyle bir harici URL olabilir. Yalnız
    // GÖRÜNTÜLEME katmanında güvenli fallback uygula — sözleşmenin dondurulmuş
    // verisi asla değiştirilmez: frozen logo harici bir http(s) URL ise ve
    // kurumun GÜNCEL logosu zaten güvenli bir data: URI ise onu göster, aksi
    // halde kurum adı metnine düş. Frozen logo hiç yoksa (undefined) bu dal
    // ATLANIR — P0-E kararı gereği o sözleşmeler canlı logoya sessizce geçmez.
    const frozenLogoUrl = contract.contractDataSnapshot.logoUrl;
    const isFrozenExternalLogo = typeof frozenLogoUrl === "string" && /^https?:\/\//i.test(frozenLogoUrl.trim());
    const displayLogoUrl = isFrozenExternalLogo
      ? (data.settings.logoUrl?.startsWith("data:image/") ? data.settings.logoUrl : null)
      : frozenLogoUrl;
    const mainHtml = prependInstitutionLogo(
      doc.renderedHtml ?? "",
      displayLogoUrl,
      data.settings.name ?? ""
    );

    // P0 (2026-09-05) — TEK BİRLEŞİK ÇIKTI: ana sözleşme → KVKK → fotoğraf/
    // video, HEP bu sırada. Önizleme, yazdırma sayfası ve
    // `/api/v1/contracts/:id/html` bu TEK fonksiyondan beslendiği için
    // üçünün bölüm sırası birbirinden sapamaz. Sözleşme oluşturulurken
    // dondurulmuş ekler varsa ONLAR kullanılır (immutable); bu alan
    // eklenmeden önce üretilmiş ESKİ sözleşmeler için aktif şablonlardan
    // canlı üretilir — aksi halde eski sözleşmeler birleşik çıktı alamazdı.
    const { buildContractAnnexes, composeContractOutputHtml } = await import("../contract-annexes");
    const snapshot = contract.contractDataSnapshot;
    const student = data.students.find((s2) => s2.id === contract.studentId);
    let annexes = snapshot.annexes ?? [];
    if (annexes.length === 0) {
      const templates = await listTemplates(ctx.tenantId);
      annexes = buildContractAnnexes({
        templates,
        contractNumber: contract.contractNumber,
        institutionName: data.settings.name ?? "",
        institutionAddress:
          data.settings.branches.find((b) => b.id === student?.branchId)?.address ?? data.settings.city ?? "",
        studentName: snapshot.studentName,
        parentName: snapshot.photoVideoConsent?.representativeName || snapshot.signatoryFullName,
        dateText: formatDateTr(contract.createdAt),
        photoVideoConsent: snapshot.photoVideoConsent,
      });
    }
    const html = composeContractOutputHtml(mainHtml, annexes);

    return ok({
      html,
      contractNumber: contract.contractNumber,
      status: contract.status,
      studentId: contract.studentId,
      titleMain: titleFields.titleMain,
      fileName: titleFields.fileName,
    });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "getContractHtml failed");
  }
}

/** İmzalı taranmış nüshanın ham dosya baytı — AYNI erişim kuralı (staff veya sözleşmenin sahibi öğrenci/veli). */
export async function getContractSignedFileTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ fileData: string; fileMimeType: string; fileName: string }>> {
  const v = parseOrFail(contractIdSchema, input);
  if (!v.ok) return v;
  try {
    const contract = await getContract(ctx.tenantId, v.data.contractId);
    if (!contract) return fail("NOT_FOUND", "Sözleşme bulunamadı.");
    const allowed = await canAccessStudent(ctx, contract.studentId);
    if (!allowed) return fail("FORBIDDEN", "Bu sözleşmeye erişim yetkiniz yok.");
    if (!contract.documentInstanceId) {
      return fail("VALIDATION_ERROR", "Bu bir tanışma paketi kaydıdır (1-2 ay); resmi sözleşme belgesi üretilmedi.");
    }
    const { getDocumentInstance } = await import("../documents");
    const doc = await getDocumentInstance(ctx.tenantId, contract.documentInstanceId);
    if (!doc || !doc.fileData) return fail("NOT_FOUND", "İmzalı taranmış nüsha henüz yüklenmemiş.");
    return ok({ fileData: doc.fileData, fileMimeType: doc.fileMimeType || "application/octet-stream", fileName: doc.fileName || "sozlesme" });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "getContractSignedFile failed");
  }
}

/** "Güncel/aktif" sözleşme — Sözleşme Yenile/Süre Uzat akışının başlangıç noktası. */
export async function getLatestStudentContractTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ contract: StudentContract | null }>> {
  const v = parseOrFail(z.object({ studentId: z.string().min(1) }), input);
  if (!v.ok) return v;
  const allowed = await canAccessStudent(ctx, v.data.studentId);
  if (!allowed) return fail("FORBIDDEN", "Bu öğrencinin sözleşmelerine erişim yetkiniz yok.");
  try {
    const contract = await getLatestContractForStudent(ctx.tenantId, v.data.studentId);
    return ok({ contract });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "getLatestStudentContract failed");
  }
}

/** Yazdır/yeniden yazdır — bağlı DocumentInstance.printCount da artar. */
export async function printStudentContractTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ contract: StudentContract }>> {
  const auth = requireRole(ctx, CONTRACT_STAFF);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(contractIdSchema, input);
  if (!v.ok) return v;
  try {
    const contract = await markContractPrinted(ctx.tenantId, v.data.contractId, ctx.userId);
    if (!contract) return fail("NOT_FOUND", "Sözleşme bulunamadı.");
    audit(ctx, "contract.print", "StudentContract", contract.id, { contractNumber: contract.contractNumber });
    return ok({ contract });
  } catch (e) {
    if (e instanceof TrialContractHasNoDocumentError) return fail("VALIDATION_ERROR", e.message);
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "printStudentContract failed");
  }
}

/** Staff, basılan nüshayı ıslak imza için öğrenci/veliye teslim ettiğini bildirir. */
export async function markStudentContractWetSignaturePendingTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ contract: StudentContract }>> {
  const auth = requireRole(ctx, CONTRACT_STAFF);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(contractIdSchema, input);
  if (!v.ok) return v;
  try {
    const contract = await markContractWetSignaturePending(ctx.tenantId, v.data.contractId);
    if (!contract) return fail("NOT_FOUND", "Sözleşme bulunamadı.");
    audit(ctx, "contract.wet_signature_pending", "StudentContract", contract.id, {});
    return ok({ contract });
  } catch (e) {
    if (e instanceof TrialContractHasNoDocumentError) return fail("VALIDATION_ERROR", e.message);
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "markStudentContractWetSignaturePending failed");
  }
}

const uploadContractSignedScanSchema = z.object({
  contractId: z.string().min(1),
  fileName: z
    .string()
    .min(1)
    .max(200)
    // "/","\","..": yol geçişi. "\r"/"\n"/diğer kontrol karakterleri: bu dosya
    // adı sonradan Content-Disposition header'ına yazıldığı için (bkz.
    // src/app/api/v1/contracts/[contractId]/signed-file/route.ts) HTTP
    // response header injection/splitting'e karşı reddedilir.
    .refine(
      (v) => !v.includes("/") && !v.includes("\\") && !v.includes("..") && !/[\r\n\x00-\x1f]/.test(v),
      "Geçersiz dosya adı"
    ),
  fileMimeType: z.string().min(1).max(100),
  fileData: z.string().min(1).max(2_800_000),
});

/** İmzalı taranmış nüsha yükleme — dosya güvenliği MEVCUT evrak-imza doğrulamasıyla AYNI (allowlist/boyut/magic-byte). */
export async function uploadStudentContractSignedScanTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ contract: StudentContract }>> {
  const auth = requireRole(ctx, CONTRACT_STAFF);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(uploadContractSignedScanSchema, input);
  if (!v.ok) return v;

  const fileCheck = validateSignedDocumentFilePayload(v.data);
  if (!fileCheck.ok) return fail("VALIDATION_ERROR", fileCheck.message);

  try {
    const contract = await uploadContractSignedScan(
      ctx.tenantId,
      v.data.contractId,
      { fileName: v.data.fileName, fileMimeType: v.data.fileMimeType, fileData: v.data.fileData, fileSize: fileCheck.byteLength },
      ctx.userId
    );
    if (!contract) return fail("NOT_FOUND", "Sözleşme bulunamadı.");
    audit(ctx, "contract.upload_signed", "StudentContract", contract.id, { fileName: v.data.fileName, fileSize: fileCheck.byteLength });
    return ok({ contract });
  } catch (e) {
    if (e instanceof TrialContractHasNoDocumentError) return fail("VALIDATION_ERROR", e.message);
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "uploadStudentContractSignedScan failed");
  }
}

/** Yanlışlıkla oluşturulmuş bir sözleşmeyi iptal eder — hard delete YOK, tarihçede "cancelled" olarak kalır. */
/**
 * 10. tur iş #9 — sözleşme iptali ÖNCESİ etki özeti (yalnız okuma).
 * İptal bir SİLME değildir (kayıt arşivde kalır) ama geri alınamaz bir durum
 * değişikliğidir: bu yüzden finansal etki (taksit/tahsilat/borç) + ders etkisi
 * + kritik-şifre durumu iptalden ÖNCE gösterilir.
 */
export type ContractCancellationImpact = {
  contractId: string;
  contractNumber: string;
  versionNumber: number;
  status: string;
  studentId: string;
  studentName: string;
  /** Terminal (cancelled/superseded) sözleşme tekrar iptal edilemez. */
  cancellable: boolean;
  cancellableBlockReason?: string;
  isCurrent: boolean;
  installmentCount: number;
  collectedAmount: number;
  outstandingAmount: number;
  unpaidInstallmentCount: number;
  futureLessonCount: number;
  lockedLessonCount: number;
  lockedReasons: string[];
  criticalPasswordConfigured: boolean;
};

export async function getContractCancellationImpactTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<ContractCancellationImpact>> {
  const auth = requireRole(ctx, CONTRACT_STAFF);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(contractIdSchema, input);
  if (!v.ok) return v;
  const { listContractsForStudent, listInstallmentsForContract } = await import("../contracts");
  const contract = await getContract(ctx.tenantId, v.data.contractId);
  if (!contract) return fail("NOT_FOUND", "Sözleşme bulunamadı.");
  const allowed = await canAccessStudent(ctx, contract.studentId);
  if (!allowed) return fail("FORBIDDEN", "Bu sözleşmeye erişim yetkiniz yok.");
  const { collectedAmountOf } = await import("../payment-profile");
  const { getCriticalActionPasswordStatus } = await import("../critical-action-password");
  const { selectCurrentContract } = await import("../contract-list-helpers");
  const { lessonCancelBlockReason } = await import("../lesson-cancel-rules");
  const data = await readData();
  const [contracts, installments, pw, debt] = await Promise.all([
    listContractsForStudent(ctx.tenantId, contract.studentId),
    listInstallmentsForContract(ctx.tenantId, contract.id),
    getCriticalActionPasswordStatus(ctx.tenantId),
    computeOutstandingContractBalance(ctx.tenantId, contract.id),
  ]);
  const future = collectContractFutureLessons(data, contract.id);
  const lockedReasons = Array.from(
    new Set(future.lessons.map((l) => lessonCancelBlockReason(l)).filter((r): r is string => r !== null))
  );
  const terminal = contract.status === "cancelled" || contract.status === "superseded";
  return ok({
    contractId: contract.id,
    contractNumber: contract.contractNumber,
    versionNumber: contract.versionNumber,
    status: contract.status,
    studentId: contract.studentId,
    studentName: data.students.find((s) => s.id === contract.studentId)?.name ?? "—",
    cancellable: !terminal,
    cancellableBlockReason: terminal
      ? contract.status === "cancelled"
        ? "Bu sözleşme zaten iptal edilmiş."
        : "Bu sözleşme yenilenmiş/revize edilmiş eski bir sürümdür; iptal edilemez."
      : undefined,
    isCurrent: selectCurrentContract(contracts)?.id === contract.id,
    installmentCount: installments.length,
    collectedAmount: installments.reduce(
      (s, r) =>
        s +
        collectedAmountOf({
          // Tek kanonik tahsilat formülü; görünümdeki string statü çalışma anında gerçektir.
          status: r.status as Parameters<typeof collectedAmountOf>[0]["status"],
          amount: r.amount,
          paidAmount: r.paidAmount,
        }),
      0
    ),
    outstandingAmount: debt.outstandingAmount,
    unpaidInstallmentCount: debt.unpaidInstallmentCount,
    futureLessonCount: future.lessons.length,
    lockedLessonCount: future.lessons.filter((l) => lessonCancelBlockReason(l) !== null).length,
    lockedReasons,
    criticalPasswordConfigured: pw.configured,
  });
}

export async function cancelStudentContractTool(
  ctx: ServiceContext,
  input: unknown
): Promise<
  ServiceResult<{
    contract: StudentContract;
    cancelledLessonIds: string[];
    keptLessons: { lessonId: string; reason: string }[];
  }>
> {
  const auth = requireRole(ctx, CONTRACT_STAFF);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(
    contractIdSchema.extend({
      /**
       * K (2026-09-20) — bu sözleşmeden ÜRETİLMİŞ gelecek dersler de iptal
       * edilsin mi? Varsayılan FALSE: sessiz/otomatik silme YOKTUR. Kullanıcı
       * Sözleşme Merkezi'ndeki onay ekranında bunu açıkça seçer.
       */
      cancelFutureLessons: z.boolean().default(false),
      /** 10. tur iş #9 — iptal gerekçesi zorunlu (denetim izi, 5-500 karakter). */
      reason: z.string().trim().min(5, "İptal gerekçesi en az 5 karakter olmalıdır.").max(500),
      /** Onay için sözleşme numarasının aynen yazılması (yanlış satır koruması). */
      confirmationNumber: z.string().trim().min(1, "Onay için sözleşme numarasını aynen yazın."),
      /** Tek kritik işlem kapısı (bkz. checkCriticalPassword). */
      criticalPassword: z.string().min(1, "Kritik işlem şifresi zorunludur."),
    }),
    input
  );
  if (!v.ok) return v;
  // Reddedilen HER deneme audit'e 'denied' yazılır (öğrenci/paket silmeyle AYNI desen).
  const deny = async (reasonCode: string, message: string) => {
    await recordAuditLog({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      action: "contract.cancel",
      entityType: "StudentContract",
      entityId: v.data.contractId,
      outcome: "denied",
      meta: { reasonCode },
    });
    return fail("FORBIDDEN", message);
  };
  try {
    const contract = await getContract(ctx.tenantId, v.data.contractId);
    if (!contract) return fail("NOT_FOUND", "Sözleşme bulunamadı.");
    const allowed = await canAccessStudent(ctx, contract.studentId);
    if (!allowed) return fail("FORBIDDEN", "Bu sözleşmeye erişim yetkiniz yok.");
    if (contract.status === "cancelled" || contract.status === "superseded") {
      return deny(
        "already_terminal",
        contract.status === "cancelled" ? "Bu sözleşme zaten iptal edilmiş." : "Yenilenmiş/revize edilmiş eski bir sürüm iptal edilemez."
      );
    }
    const gate = await checkCriticalPassword(ctx, v.data.criticalPassword);
    if (!gate.ok) return deny(gate.reasonCode, gate.message);
    if (v.data.confirmationNumber !== contract.contractNumber) {
      return deny("confirmation_mismatch", "Sözleşme numarası eşleşmedi. İptal edilecek sözleşmenin numarasını aynen yazın.");
    }
    /**
     * Sıra bilinçli: ÖNCE dersler, SONRA sözleşme. Ders iptali kısmen
     * başarısız olursa sözleşme hâlâ aktiftir ve kullanıcı tekrar
     * deneyebilir — tersi durumda "iptal edilmiş sözleşmeye bağlı aktif
     * dersler" gibi tutarsız bir ara durum kalırdı.
     */
    const cancelledLessonIds: string[] = [];
    const keptLessons: { lessonId: string; reason: string }[] = [];
    if (v.data.cancelFutureLessons) {
      const before = await readData();
      const future = collectContractFutureLessons(before, v.data.contractId);
      const { lessonCancelBlockReason } = await import("../lesson-cancel-rules");
      for (const lesson of future.lessons) {
        const blocked = lessonCancelBlockReason(lesson);
        if (blocked) {
          keptLessons.push({ lessonId: lesson.id, reason: blocked });
          continue;
        }
        try {
          await cancelLesson(lesson.id);
          cancelledLessonIds.push(lesson.id);
        } catch (err) {
          keptLessons.push({
            lessonId: lesson.id,
            reason: err instanceof Error ? err.message : "Ders iptal edilemedi.",
          });
        }
      }
    }

    const cancelled = await cancelContract(ctx.tenantId, v.data.contractId);
    if (!cancelled) return fail("NOT_FOUND", "Sözleşme bulunamadı.");
    audit(ctx, "contract.cancel", "StudentContract", cancelled.id, {
      reason: v.data.reason,
      cancelFutureLessons: v.data.cancelFutureLessons,
      cancelledLessonCount: cancelledLessonIds.length,
      keptLessonCount: keptLessons.length,
    });
    return ok({ contract: cancelled, cancelledLessonIds, keptLessons });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "cancelStudentContract failed");
  }
}

export async function resolveCollectionsIbanTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ bank: string; bankLabel: string; iban?: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "AI_AGENT"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(z.object({ studentId: z.string().min(1) }), input);
  if (!v.ok) return v;
  const data = await readReferenceData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  if (!student) return fail("NOT_FOUND", "Öğrenci yok");
  const settings = data.settings.collectionsSettings ?? { frequencyLimitDays: 3, autoSendEnabled: false };
  const r = resolveCollectionsIban(effectiveStudentTypes(student), settings);
  return ok({ bank: r.bank, bankLabel: r.bankLabel, iban: r.iban });
}


/**
 * Geldi / İşlendi / Telafi — TEACHER own lesson, admin all in tenant.
 *
 * ÖNCELİK 4 (devam) — TEK, birbirini dışlayan statü davranışı: ilk tıklama
 * (henüz hiçbir statü etkin değilken) API'ye ANINDA kaydeder. Zaten farklı
 * bir statü etkinse ve `confirmSwitch:true` GÖNDERİLMEMİŞSE hiçbir yazma
 * yapmadan `needsConfirmation:true` + mevcut/istenen statüyü döner — client
 * bunu onay/iptal popup'ı açmak için kullanır; yalnızca kullanıcı onaylayıp
 * `confirmSwitch:true` ile tekrar çağırınca gerçek geçiş (`switchLessonOpsFlagLive`)
 * uygulanır. Aynı statüye tekrar tıklama her zaman no-op/idempotent kalır.
 */

/**
 * 9. tur — İptal/Telafi kaynağı girdisi (Telafi, İptal ve sonradan düzeltme ortak).
 * `teacherAttendance` yalnız öğretmen kaynaklı kararda ve kullanıcı AÇIKÇA seçtiyse yazılır;
 * iptal/telafi kendiliğinden "öğretmen gelmedi" anlamına gelmez.
 */
const disruptionInputShape = {
  disruptionSource: z.enum(["teacher", "institution", "student", "other"]).optional(),
  disruptionNote: z.string().max(500).optional(),
  teacherAttendance: z.enum(["gelmedi", "mazeretli"]).optional(),
};

function disruptionInputError(input: { disruptionSource?: string; teacherAttendance?: string }): string | null {
  if (input.teacherAttendance && input.disruptionSource !== "teacher") {
    return "Öğretmen katılımı yalnız öğretmen kaynaklı iptal/telafide kaydedilebilir. Kurum veya öğrenci kaynaklı karar öğretmen devamsızlığına yazılmaz.";
  }
  return null;
}

/** Öğretmen kaynaklı kararda kullanıcının seçtiği öğretmen katılımını ayrı alana yazar (audit'li). */
async function recordTeacherAttendanceForDisruption(
  ctx: ServiceContext,
  lessonId: string,
  status: "gelmedi" | "mazeretli" | undefined,
  note: string | undefined
): Promise<string | null> {
  if (!status) return null;
  const res = await markTeacherAttendanceLive(lessonId, status, ctx.userId, note);
  if (!res.ok) return `Ders kaydedildi ancak öğretmen katılımı yazılamadı: ${res.message} Ders detayından tekrar deneyin.`;
  if (!res.alreadySet) audit(ctx, "lesson.teacher_attendance", "Lesson", lessonId, { status, via: "disruption" });
  return null;
}

export async function setLessonOpsFlagTool(
  ctx: ServiceContext,
  input: unknown
): Promise<
  ServiceResult<{
    lessonId: string;
    flag: string;
    alreadySet: boolean;
    message: string;
    needsConfirmation?: boolean;
    currentStatus?: string | null;
    /** Ana işlem kaydedildi ama yan kayıt (öğretmen katılımı) yazılamadı. */
    warning?: string;
  }>
> {
  if (ctx.role === "TEACHER") return fail("FORBIDDEN", TEACHER_ATTENDANCE_FORBIDDEN_MESSAGE);
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(
    z.object({
      lessonId: z.string().min(1),
      flag: z.enum(["attended", "processed", "makeup", "absent", "excused"]),
      /** Kullanıcı, farklı bir statüden geçişi onay popup'ında ONAYLADIYSA true. */
      confirmSwitch: z.boolean().optional(),
      /** P0-2 — "İşlendi"/"Telafi" için zorunlu, gerçek kullanıcı gerekçesi (lesson-ops.ts uygular). */
      reason: z.string().optional(),
      ...disruptionInputShape,
    }),
    input
  );
  if (!v.ok) return v;
  const disruptionError = disruptionInputError(v.data);
  if (disruptionError) return fail("VALIDATION_ERROR", disruptionError);
  // Kaynak yalnız Telafi için anlamlı (İşlendi/Geldi kaynak sorusu sormaz).
  const disruption =
    v.data.flag === "makeup" && v.data.disruptionSource
      ? { source: v.data.disruptionSource, note: v.data.disruptionNote }
      : undefined;

  /**
   * P0 mutasyon performansı (2026-09-07) — burada eskiden tenant'ın TÜM
   * `AppData`'sı okunuyordu (ölçüm: statü değişiminin 46 sorgusundan 42'si üç
   * tam-tenant okumasıydı). Bu ön kontroller yalnız DERSİN kendisini,
   * ÖĞRENCİSİNİ ve kurum ayarlarını gerektirir — dar dilim yeter
   * (bkz. src/lib/lesson-scope.ts).
   */
  const data = await readLessonScope(v.data.lessonId);
  const lesson = data?.lessons.find((l) => l.id === v.data.lessonId);
  if (!data || !lesson) return fail("NOT_FOUND", "Ders bulunamadı");
  // ÖNCELİK 4 — Yoklama Takvimi: kapalı günde hiçbir yoklama/mali aksiyon
  // yapılamaz (manuel istisna > resmî tatil > dönem haftalık kuralı sırası).
  const student = data.students.find((s) => s.id === lesson.studentId);
  const term = student?.termType ?? "guz";
  const overrides = await listClosedDays(ctx.tenantId);
  const { resolveWorkDay, FORCE_OPEN_HINT } = await import("../work-days");
  const dayStatus = resolveWorkDay(new Date(lesson.startAt), term, overrides, data.settings.termWeeklyClosedDays);
  if (dayStatus.status === "closed") {
    // Owner kuralı: gerçek neden + nasıl düzeltilir. "Kapalı gün" tek başına yeterli değil.
    return fail("VALIDATION_ERROR", `${dayStatus.explanation} Bu güne yoklama/tahsilat işlemi yapılamaz. ${FORCE_OPEN_HINT}`);
  }

  const current = effectiveLessonOpsStatus(lesson);
  if (current !== null && current !== v.data.flag && !v.data.confirmSwitch) {
    return ok({
      lessonId: v.data.lessonId,
      flag: v.data.flag,
      alreadySet: false,
      needsConfirmation: true,
      currentStatus: current,
      message: `Bu ders zaten "${current}" olarak işaretli. "${v.data.flag}" olarak değiştirmek için onaylayın.`,
    });
  }

  try {
    const result = await switchLessonOpsFlagLive(v.data.lessonId, v.data.flag, ctx.userId, v.data.reason, disruption);
    if (!result.ok) return fail("VALIDATION_ERROR", result.message);
    // Zaten Telafi olan derste kaynak sonradan veriliyorsa yalnız kaynak alanı güncellenir.
    if (result.alreadySet && disruption && result.lesson.disruptionSource !== disruption.source) {
      const { buildDisruptionPatch } = await import("../lesson-disruption");
      await setLessonDisruptionLive(v.data.lessonId, buildDisruptionPatch(disruption, ctx.userId));
      audit(ctx, "lesson.disruption_source", "Lesson", v.data.lessonId, {
        from: result.lesson.disruptionSource ?? null,
        to: disruption.source,
        note: disruption.note,
      });
    }
    if (!result.alreadySet) {
      audit(ctx, `lesson.ops.${v.data.flag}`, "Lesson", v.data.lessonId, {
        flag: v.data.flag,
        switchedFrom: current !== v.data.flag ? current : undefined,
        reason: v.data.reason,
        disruptionSource: disruption?.source,
      });
      // Faz 3C — ders "İşlendi" olduğunda ödev eksikse tek seferlik hatırlatma.
      if (v.data.flag === "processed") {
        await checkAndNotifyMissingHomework(ctx.tenantId, result.lesson);
        // P0-2D — aynı ay içinde 3. "İşlendi" ders: tenant admin/superadmin'e
        // BİR KEZ risk bildirimi (idempotency: student-attendance-risk-log.ts).
        await notifyAttendanceRiskIfThresholdCrossed(ctx.tenantId, result.lesson);
      }
    }
    const attendanceWarning =
      disruption?.source === "teacher"
        ? await recordTeacherAttendanceForDisruption(ctx, v.data.lessonId, v.data.teacherAttendance, disruption.note)
        : null;
    return ok({
      lessonId: v.data.lessonId,
      flag: v.data.flag,
      alreadySet: result.alreadySet,
      message: result.message,
      warning: attendanceWarning ?? undefined,
    });
  } catch (e) {
    const { isMakeupQuotaExceededError } = await import("../makeup-quota");
    if (isMakeupQuotaExceededError(e)) {
      return fail("VALIDATION_ERROR", e instanceof Error ? e.message : "Telafi kotası aşıldı");
    }
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "setLessonOpsFlag failed");
  }
}

/**
 * 2026-09-29 — Yoklama Takvimi: işaretli statüye tekrar basılıp onaylanınca statü geri alınır.
 * Yetki `setLessonOpsFlagTool` ile aynı (öğretmen değil; SCHOOL_ADMIN/SUPER_ADMIN). İşlendi geri
 * alınırken dersin günü, o öğretmenin kayıtlı (bekleyen/ödenmiş) bir hakedişine düşüyorsa reddedilir —
 * donmuş hakediş ile ders gerçeği sessizce ayrışmasın.
 */
export async function clearLessonOpsFlagTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ lessonId: string; cleared: string | null; alreadyClear: boolean; message: string }>> {
  if (ctx.role === "TEACHER") return fail("FORBIDDEN", TEACHER_ATTENDANCE_FORBIDDEN_MESSAGE);
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(
    z.object({
      lessonId: z.string().min(1),
      expected: z.enum(["attended", "processed", "makeup", "absent", "excused"]),
    }),
    input
  );
  if (!v.ok) return v;

  // Geldi de hakediş kaynağı (2026-09-30) — kayıtlı hakedişteki dersin statüsü sessizce geri alınmaz.
  if (v.data.expected === "processed" || v.data.expected === "attended") {
    const data = await readData();
    const lesson = data.lessons.find((l) => l.id === v.data.lessonId);
    if (!lesson) return fail("NOT_FOUND", "Ders bulunamadı. Sayfayı yenileyip tekrar deneyin.");
    const { payoutPeriodDayKey } = await import("../teacher-payout");
    const day = lesson.startAt.slice(0, 10);
    const payout = data.teacherPayouts.find(
      (p) =>
        p.teacherId === lesson.teacherId &&
        p.status !== "cancelled" &&
        payoutPeriodDayKey(p.periodStart) <= day &&
        payoutPeriodDayKey(p.periodEnd) >= day
    );
    if (payout) {
      return fail(
        "CONFLICT",
        `Bu ders, öğretmenin ${payoutPeriodDayKey(payout.periodStart)} – ${payoutPeriodDayKey(payout.periodEnd)} dönemi için oluşturulmuş ` +
          `${payout.status === "paid" ? "ÖDENMİŞ" : "kayıtlı"} hakedişine dahil; "${v.data.expected === "processed" ? "İşlendi" : "Geldi"}" geri alınamaz. ` +
          "Tutarı düzeltmek için öğretmenin hakediş detayındaki revizyonu kullanın."
      );
    }
  }

  try {
    const result = await clearLessonOpsFlagLive(v.data.lessonId, v.data.expected, ctx.userId);
    if (!result.ok) {
      return fail(result.code === "NOT_FOUND" ? "NOT_FOUND" : result.code === "STALE" || result.code === "SLOT_TAKEN" ? "CONFLICT" : "VALIDATION_ERROR", result.message);
    }
    if (!result.alreadyClear) {
      audit(ctx, "lesson.ops.clear", "Lesson", v.data.lessonId, {
        cleared: result.cleared,
        cancelledMakeupIds: result.cancelledMakeupIds.length ? result.cancelledMakeupIds : undefined,
      });
    }
    return ok({ lessonId: v.data.lessonId, cleared: result.cleared, alreadyClear: result.alreadyClear, message: result.message });
  } catch (e) {
    logger.error("clearLessonOpsFlagTool failed", e);
    return fail("INTERNAL_ERROR", "Yoklama statüsü geri alınamadı; statü değişmedi. Sayfayı yenileyip tekrar deneyin.");
  }
}

/**
 * Faz 2 — öğretmenin KENDİ derse gelip gelmediğini işaretler. Öğrenci
 * yoklamasından (setLessonOpsFlagTool) TAMAMEN AYRI — kasıtlı olarak
 * yalnız yönetici işaretleyebilir (öğretmen kendi katılımını kendi
 * onaylayamaz — çıkar çatışması, bkz. plan dokümanı).
 */
export async function markTeacherAttendanceTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ lessonId: string; status: string; alreadySet: boolean }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(markTeacherAttendanceSchema, input);
  if (!v.ok) return v;

  try {
    const result = await markTeacherAttendanceLive(v.data.lessonId, v.data.status, ctx.userId, v.data.note);
    if (!result.ok) return fail("NOT_FOUND", result.message);
    if (!result.alreadySet) {
      audit(ctx, "lesson.teacher_attendance", "Lesson", v.data.lessonId, { status: v.data.status });
    }
    return ok({ lessonId: v.data.lessonId, status: v.data.status, alreadySet: result.alreadySet });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "markTeacherAttendance failed");
  }
}

/**
 * Faz 2 — açıklanabilir öğretmen performans raporu. Görünürlük: SCHOOL_ADMIN/
 * SUPER_ADMIN (tüm öğretmenler) + öğretmenin KENDİSİ (yalnız kendi raporu,
 * salt okunur — TeacherFeedback'in aksine bu ÖZNEL değil, objektif bir
 * katılım+geri bildirim metriğidir).
 */
export async function getTeacherPerformanceReportTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<TeacherPerformanceReport>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(teacherPerformanceReportSchema, input);
  if (!v.ok) return v;

  if (ctx.role === "TEACHER" && ctx.teacherId !== v.data.teacherId) {
    return fail("FORBIDDEN", "Yalnızca kendi performans raporunuzu görüntüleyebilirsiniz.");
  }

  const data = await readData();
  if (!data.teachers.some((t) => t.id === v.data.teacherId)) return fail("NOT_FOUND", "Öğretmen bulunamadı.");

  const report = await computeTeacherPerformanceReport(
    data,
    ctx.tenantId,
    v.data.teacherId,
    v.data.periodStart,
    v.data.periodEnd
  );
  return ok(report);
}

/**
 * teacher-performance-v2 — 4 bileşenli açıklanabilir rapor (yoklama %30,
 * geri bildirim %25, iş takip %20, ödev %25). Görünürlük aynı:
 * SCHOOL_ADMIN/SUPER_ADMIN (tüm öğretmenler) + öğretmenin KENDİSİ (yalnız
 * kendi raporu).
 */
export async function getTeacherPerformanceReportV2Tool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<TeacherPerformanceReportV2>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(teacherPerformanceReportV2Schema, input);
  if (!v.ok) return v;

  if (ctx.role === "TEACHER" && ctx.teacherId !== v.data.teacherId) {
    return fail("FORBIDDEN", "Yalnızca kendi performans raporunuzu görüntüleyebilirsiniz.");
  }

  const data = await readData();
  if (!data.teachers.some((t) => t.id === v.data.teacherId)) return fail("NOT_FOUND", "Öğretmen bulunamadı.");

  const report = await computeTeacherPerformanceReportV2(
    data,
    ctx.tenantId,
    v.data.teacherId,
    v.data.periodStart,
    v.data.periodEnd
  );
  return ok(report);
}

/**
 * ÖNCELİK 4 — Yoklama Takvimi: bir tarih için gün durumu (statü) + o günün
 * dersleri. Admin tüm öğrencileri, öğretmen yalnızca kendi öğrencilerini,
 * PARENT/STUDENT yalnızca (session'a bağlı) KENDİ öğrencisini görebilir —
 * salt okunur, `assertStudentAccess` ile ownership kesin kontrol edilir
 * (rol listesine girmesi TEK BAŞINA erişim vermez, bkz. aşağı).
 */
export type AttendanceCalendarLessonPaymentInfo = {
  /**
   * Takvimden doğrudan tahsilat: bu ID mevcut `/api/v1/payments/:paymentId/pay`
   * (Ödemeler ekranının "Ödendi işaretle" ile AYNI uç noktası — createPaymentTool)
   * ile eşleşir. Yeni/paralel bir ödeme kaydı/ID ŞEMASI YOK; TEK finansal
   * gerçek kaynak (Payment) burada yalnızca OKUNUP ilgili aksiyona bağlanır.
   */
  paymentId: string;
  lessonId: string;
  amount: number;
  paidAmount: number;
  /** ÖNCELİK 4 (devam) — "Tutar kayıt tarihi": bu Payment satırının SİSTEME kaydedildiği an. */
  recordedAt: string;
  /** Ödeme merkezi — GERÇEK tahsilat anı (Payment.paidAt); yalnızca status=paid'de dolu. `recordedAt`'tan (tahakkuk anı) AYRIDIR. */
  paidAt?: string;
  /** Nakit/Havale/Kredi Kartı — Payment.method varsa o, yoksa öğrencinin varsayılan ödeme yöntemi (tahmini olarak işaretlenir). */
  method?: string;
  methodIsStudentDefault: boolean;
  status: string;
  source: string;
};

export type AttendanceCalendarLessonOpsInfo = {
  lessonId: string;
  /** Kullanıcıya gösterilen canonical ders statüsü; legacy yoklama alanları ayrı statüye dönüşmez. */
  opsStatus: LessonFinalStatus;
  /**
   * İş 2 — aynı günde birden fazla ders olduğunda hangi satırın hangi
   * derse ait olduğunu ayırt etmek için gereken minimum bağlam (ders
   * saati, öğretmen, enstrüman, oda, süre). Önceden bu bilgi hiç
   * taşınmıyordu — DayDetail yalnızca lessonId ile eşleşen ayrı
   * Geldi/İşlendi/Telafi butonları gösteriyordu ama hangi butonun HANGİ
   * derse ait olduğu görünür değildi.
   */
  startAt: string;
  durationMinutes: number;
  teacherName?: string;
  instrument: string;
  roomName?: string;
  /** bkz. Lesson.availabilityOverride — öğretmen müsait olmadığı bir saatte, onaylı planlandı. */
  availabilityOverride: boolean;
};

/** Takvimin TEK ay yükünün (gün statüleri + ders/ödeme bilgisi + ücretlendirme) ortak şekli. */
export type AttendanceCalendarMonth = {
  year: number;
  month: number;
  term: string;
  withinTerm: boolean;
  /**
   * P0 (2026-09-09) — bu ayın ödenecek tutarı. ARTIK TAKVİM HESAPLAMAZ:
   * sözleşmenin dondurulmuş ödeme planından OKUNUR (bkz.
   * `attendance-calendar-plan.ts`). Eski `billing` alanı (plannedLessonCount ×
   * legacyUnitFee = suggestedAmount) KALDIRILDI — aynı finansal bilgiyi
   * üreten ikinci bir kaynaktı ve sözleşmeden ayrışabiliyordu.
   */
  plan: CalendarMonthPlan;
  /**
   * YALNIZ BİLGİ — "bu ay kaç ücretlendirilebilir ders var". Tutarla İLGİSİ
   * YOKTUR ve tutar türetmek için KULLANILAMAZ (bkz. `plan`).
   */
  billableLessonCount: number;
  days: Array<{
    date: string;
    status: string;
    reason: string;
    label: string;
    /** Kurum dönem tarihine göre bu gün seçili dönemin içinde mi. */
    inTerm: boolean;
    lessonIds: string[];
    /**
     * Kutu rengi (bkz. ATTENDANCE_CALENDAR_COLORS / resolveDayFillSegments) —
     * o günün derslerinden effectiveLessonOpsStatus ile türetilen gerçek
     * Geldi/İşlendi/Telafi statüleri. Önceden bu bilgi takvime hiç
     * taşınmıyordu (yalnızca lessonIds dönüyordu) — UI kutu rengini
     * tahmin edemiyordu, sadece "planlı ders var" mavisini gösterebiliyordu.
     */
    lessons: AttendanceCalendarLessonOpsInfo[];
    payments: AttendanceCalendarLessonPaymentInfo[];
  }>;
};

/**
 * P0 performans (2026-09-07) — bir ayın takvim yükünü ZATEN OKUNMUŞ
 * `AppData` + kapalı gün listesinden üretir; kendisi HİÇBİR I/O yapmaz.
 * Kök neden buydu: `getAttendanceCalendarMonthTool` her çağrıda tenant'ın
 * TÜM `AppData`'sını (`readData()` — db modunda School + 12 relation) baştan
 * okuyordu ve istemci bir dönem için bunu 10 KEZ, ÜSTELİK SIRAYLA yapıyordu
 * (ölçüm: 10 × ~1.0 sn = ~10 sn). Aynı hesap artık dönem tool'unda tek bir
 * okuma üzerinden 10 kez, I/O'suz çalışır.
 */
/**
 * Takvimin ödeme planı için ihtiyaç duyduğu sözleşme alanları — İSTEK BAŞINA
 * BİR KEZ okunur (dönem uç noktasında 10 ay için tek okuma). Tenant filtresi
 * `listContractsForStudent`in içindedir; başka kurumun sözleşmesi buraya
 * hiçbir koşulda gelmez.
 */
async function loadCalendarPlanContracts(tenantId: string, studentId: string): Promise<CalendarPlanContract[]> {
  const { listContractsForStudent } = await import("../contracts");
  const rows = await listContractsForStudent(tenantId, studentId);
  return rows.map((c) => ({
    id: c.id,
    contractNumber: c.contractNumber,
    status: c.status,
    enrollmentStartDate: c.enrollmentStartDate,
    enrollmentEndDate: c.enrollmentEndDate,
  }));
}

async function buildAttendanceCalendarMonth(
  // Yalnız okunan alanlar: tek öğrenci dilimi (`readStudentScope`) de tam `AppData` de verilebilir.
  data: Pick<AppData, "settings" | "lessons" | "teachers" | "rooms" | "payments" | "makeupRequests">,
  overrides: Awaited<ReturnType<typeof listClosedDays>>,
  student: Student,
  year: number,
  month: number,
  /**
   * Öğrencinin sözleşmeleri — çağıran tarafından İSTEK BAŞINA BİR KEZ okunur
   * (dönem uç noktası 10 ay için 10 kez OKUMAZ). Taksit satırları ayrıca
   * okunmaz: `data.payments` zaten elimizde ve `contractId`/
   * `installmentSequence` taşıyor.
   */
  contracts: CalendarPlanContract[]
): Promise<AttendanceCalendarMonth> {
  const term = student.termType ?? "guz";
  const { resolveMonthStatuses } = await import("../attendance-calendar");
  const statuses = resolveMonthStatuses(year, month, term, overrides, data.settings.termWeeklyClosedDays);
  const timeZone = resolveAppTimezone();
  const storedDates = data.settings.academicTermDates;
  const termDates = storedDates
    ? resolveAcademicTermDatesForAnchor(storedDates, term, term === "yaz" ? year : month >= 9 ? year : year - 1)
    : null;
  // Ay bazında "dönem içi mi" — kurum tarihi varsa o aralık; yoksa belgelenmiş
  // varsayılan (güz: Eylül–Haziran; yaz: Temmuz/Ağustos). Eylül geçişi
  // hard-coded hafta varsayımı kullanmaz.
  const withinTerm = termDates
    ? monthOverlapsAcademicTerm(year, month, term, termDates)
    : term === "yaz"
      ? month === 7 || month === 8
      : month >= 9 || month <= 6;

  const days = statuses.map((s) => {
    // Gün eşleşmesi kurum saat diliminde — Ders Programı günü de böyle
    // çözer. UTC `startAt.slice(0, 10)` 00:00–02:59 dersleri önceki güne
    // kaydırıp iki ekranı ayrıştırıyordu.
    const dayLessons = data.lessons.filter(
      (l) => l.studentId === student.id && toZonedYmd(new Date(l.startAt), timeZone) === s.date
    );
    const lessonIds = dayLessons.map((l) => l.id);
    // Gerçek Geldi/İşlendi/Telafi statüsü — TEK kaynak lesson-ops.ts'deki
    // effectiveLessonOpsStatus (aynı öncelik kuralı server tarafındaki
    // switchLessonOpsFlag ile birebir aynı). Kapalı gün önceliği zaten
    // yukarıda `s.status` ile çözülmüş durumda; bu liste yalnızca AÇIK
    // günlerde anlamlıdır ama kapalı günlerde de (varsa, tutarlılık için)
    // aynen döner — UI kapalı günde zaten statü render ETMEZ.
    const lessons: AttendanceCalendarLessonOpsInfo[] = dayLessons
      .slice()
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
      .map((l) => {
        const teacher = data.teachers.find((t) => t.id === l.teacherId);
        const room = data.rooms.find((r) => r.id === l.roomId);
        const durationMinutes = Math.round(
          (new Date(l.endAt).getTime() - new Date(l.startAt).getTime()) / 60_000
        );
        return {
          lessonId: l.id,
          opsStatus: resolveLessonFinalStatus(l),
          startAt: l.startAt,
          durationMinutes,
          teacherName: teacher?.name,
          instrument: l.instrument,
          roomName: room?.name,
          availabilityOverride: Boolean(l.availabilityOverride),
        };
      });
    // ÖNCELİK 4 (devam) — TEK kaynak: mevcut Payment modeli (source:"lesson_ops"),
    // ikinci/çelişkili bir kayıt yaratılmaz — yalnızca OKUNUR ve gösterilir.
    const payments: AttendanceCalendarLessonPaymentInfo[] = dayLessons
      .map((l) => data.payments.find((p) => p.lessonId === l.id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => ({
        paymentId: p.id,
        lessonId: p.lessonId!,
        amount: p.amount,
        paidAmount: p.paidAmount,
        recordedAt: p.createdAt ?? p.dueDate,
        paidAt: p.paidAt,
        method: p.method ?? student.paymentMethod,
        methodIsStudentDefault: !p.method && !!student.paymentMethod,
        status: p.status,
        source: p.source ?? "manual",
      }));
    const inTerm = termDates ? isYmdWithinAcademicTerm(s.date, term, termDates) : true;
    return { ...s, lessonIds, lessons, payments, inTerm };
  });

  // P0-1 düzeltmesi — ücretlendirilebilir ders TANIMI TEK kaynaktan
  // (period-lesson-billing.ts `isBillableLesson`) gelir: deneme/iptal/
  // kurum-kapalı/telafi-kaynağı dersler hariç tutulur.
  //
  // P0 (2026-09-09) — bu sayı ARTIK YALNIZ BİLGİ AMAÇLIDIR. Ay tutarı bundan
  // TÜRETİLMEZ; sözleşmenin dondurulmuş plan satırından okunur (aşağıya bkz.).
  // `derivePerLessonAmount`/`computePeriodAmount` bu fonksiyonda artık
  // KULLANILMAZ — kullanılırsa takvim yine sözleşmeden ayrışan ikinci bir
  // finansal kaynak haline gelir.
  const { countBillableLessonsInRange, resolveExcludedMakeupSourceLessonIds } = await import(
    "../period-lesson-billing"
  );
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const monthStartDay = `${monthPrefix}-01`;
  const monthEndDay = `${monthPrefix}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}`;
  const excludedSourceLessonIds = resolveExcludedMakeupSourceLessonIds(
    data.makeupRequests.map((m) => ({ sourceLessonId: m.sourceLessonId, status: m.status }))
  );
  const plannedLessonCount = countBillableLessonsInRange(
    data.lessons.map((l) => ({
      id: l.id,
      studentId: l.studentId,
      startAt: l.startAt,
      type: l.type,
      status: l.status,
      opsClosedFlag: l.opsClosedFlag,
    })),
    student.id,
    monthStartDay,
    monthEndDay,
    { excludedSourceLessonIds, frozenRanges: [] }
  );
  // TEK finansal kaynak: sözleşmenin DONDURULMUŞ ödeme planı. `data.payments`
  // zaten okundu ve taksit satırları `contractId`/`installmentSequence`
  // taşıyor — plan için EK bir okuma/sorgu yapılmaz.
  const plan = resolveContractPlanForMonth({
    contracts,
    installments: data.payments.filter((p) => p.studentId === student.id),
    year,
    month,
    studentMonthlyFee: student.monthlyFee,
  });

  return { year, month, term, withinTerm, plan, billableLessonCount: plannedLessonCount, days };
}

export async function getAttendanceCalendarMonthTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<AttendanceCalendarMonth>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "TEACHER", "SUPER_ADMIN", "AI_AGENT", "STUDENT"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(
    z.object({
      studentId: z.string().min(1),
      year: z.number().int(),
      month: z.number().int().min(1).max(12),
    }),
    input
  );
  if (!v.ok) return v;

  // DB egress: yalnız bu öğrencinin dilimi — takvim hesabı zaten yalnız onun satırlarını okur.
  const data = await readStudentScope(v.data.studentId);
  const student = data.students.find((s) => s.id === v.data.studentId);
  const access = await assertStudentAccess(ctx, student, v.data.studentId);
  if (!access.ok) return fail(access.code, access.message);
  if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı");

  const overrides = await listClosedDays(ctx.tenantId);
  const contracts = await loadCalendarPlanContracts(ctx.tenantId, student.id);
  return ok(await buildAttendanceCalendarMonth(data, overrides, student, v.data.year, v.data.month, contracts));
}

/**
 * P0 performans (2026-09-07) — bir DÖNEMİN tüm aylarını TEK istekte, TEK
 * `readData()` ile döndürür. İstemci (attendance-calendar-panel.tsx) eskiden
 * aynı bilgiyi ay ay, `for`+`await` ile SIRAYLA çekiyordu; ölçülen maliyet
 * güz dönemi için 10 istek × ~1.0 sn ≈ 10 sn'ydi (bkz.
 * docs/performance/ADMIN_WEB_P0_BASELINE.md). Yetki/kapsam kontrolü tek ay
 * tool'uyla BİREBİR aynı yoldan (`requireRole` + `assertStudentAccess`)
 * geçer — toplu uç nokta ayrı/gevşek bir yetki yolu AÇMAZ.
 */
export async function getAttendanceCalendarTermTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ term: string; anchorYear: number; months: AttendanceCalendarMonth[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "TEACHER", "SUPER_ADMIN", "AI_AGENT", "STUDENT"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(
    z.object({
      studentId: z.string().min(1),
      term: z.enum(["guz", "yaz"]),
      anchorYear: z.number().int().min(1970).max(2999),
    }),
    input
  );
  if (!v.ok) return v;

  // DB egress: yalnız bu öğrencinin dilimi (bkz. getAttendanceCalendarMonthTool).
  const data = await readStudentScope(v.data.studentId);
  const student = data.students.find((s) => s.id === v.data.studentId);
  const access = await assertStudentAccess(ctx, student, v.data.studentId);
  if (!access.ok) return fail(access.code, access.message);
  if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı");

  const overrides = await listClosedDays(ctx.tenantId);
  // Sözleşmeler dönem başına TEK KEZ okunur — 10 ay için 10 okuma DEĞİL
  // (performans kuralı: yeni tam-tenant/AppData turu eklenmez).
  const contracts = await loadCalendarPlanContracts(ctx.tenantId, student.id);
  const { attendanceCalendarTermMonths } = await import("../attendance-calendar");
  const monthList = data.settings.academicTermDates
    ? academicTermMonths(v.data.term, v.data.anchorYear, data.settings.academicTermDates)
    : attendanceCalendarTermMonths(v.data.term, v.data.anchorYear);
  const months: AttendanceCalendarMonth[] = [];
  for (const m of monthList) {
    months.push(await buildAttendanceCalendarMonth(data, overrides, student, m.year, m.month, contracts));
  }
  return ok({ term: v.data.term, anchorYear: v.data.anchorYear, months });
}

/** ÖNCELİK 4 — admin özel kapalı/zorla-açık gün istisnası (audit'li). */
export async function setDayOverrideTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ date: string; isOpen: boolean }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      name: z.string().default(""),
      isOpen: z.boolean(),
      kind: z.enum(["public_holiday", "custom"]).default("custom"),
    }),
    input
  );
  if (!v.ok) return v;

  try {
    const row = await setClosedDay({
      tenantId: ctx.tenantId,
      date: v.data.date,
      name: v.data.name || (v.data.isOpen ? "Zorla açık" : "Kapalı (yönetici)"),
      kind: v.data.kind,
      isOpen: v.data.isOpen,
      createdBy: ctx.userId,
    });
    audit(ctx, "attendance_calendar.day_override.set", "ClosedDay", row.id, {
      date: v.data.date,
      isOpen: v.data.isOpen,
    });
    return ok({ date: row.date, isOpen: row.isOpen });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "setDayOverride failed");
  }
}

/**
 * Çalışma Günleri ekranı — yöneticinin koyduğu tüm gün istisnalarını listeler.
 * Salt okunur; `readData()`'in `closedDayOverrides` alanıyla AYNI kaynaktır.
 */
export async function listDayOverridesTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ overrides: ClosedDay[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(
    z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }),
    input ?? {}
  );
  if (!v.ok) return v;
  const range = v.data.from && v.data.to ? { from: v.data.from, to: v.data.to } : undefined;
  return ok({ overrides: await listClosedDays(ctx.tenantId, range) });
}

/** İstisnayı kaldırır — gün, altındaki resmî tatil/dönem kuralına geri döner. */
export async function removeDayOverrideTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ date: string; removed: boolean }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), input);
  if (!v.ok) return v;
  const { removeClosedDay } = await import("../closed-day-overrides");
  const removed = await removeClosedDay(ctx.tenantId, v.data.date);
  if (!removed) {
    return fail("NOT_FOUND", `${v.data.date} tarihi için bir istisna kaydı bulunamadı; kaldırılacak bir şey yok.`);
  }
  audit(ctx, "attendance_calendar.day_override.remove", "ClosedDay", v.data.date, { date: v.data.date });
  return ok({ date: v.data.date, removed: true });
}

/**
 * Yoklama Takvimi ay kutusu — "Kaydet" GERÇEK bir tahsilat işlemidir (aylık
 * borç ön-kaydı değil). Ortak Tool Layer/servis mantığı kullanılır — YENİ/
 * paralel bir ödeme yolu YOK:
 *   1. `upsertMonthlyPlanPayment` — öğrenci+ay başına TEK Payment satırını
 *      idempotent şekilde bulur/oluşturur (source:"monthly_plan"), girilen
 *      tutar/tarih/yöntemi `amount`/`dueDate`/`method` alanlarına yazar.
 *   2. `markPaymentPaid` — Ödemeler ekranı "Ödendi işaretle" VE Yoklama
 *      Takvimi "Tahsil Et" ile BİREBİR AYNI fonksiyon; `status:"paid"`,
 *      `paidAmount`, `paidAt` ve `receivedByUserId` (bu işlemi yapan
 *      `ctx.userId`) buradan yazılır.
 * Aynı öğrenci+ay için tekrar çağrılırsa (1) AYNI Payment satırını bulur,
 * (2) `markPaymentPaid` zaten idempotent bir güncelleme yapar — yeni satır
 * ASLA oluşmaz.
 */
export async function collectAttendanceCalendarPaymentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ paymentId: string; studentId: string; month: string; amount: number; status: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(
    z.object({
      studentId: z.string().min(1),
      month: z.string().regex(/^\d{4}-\d{2}$/),
      amount: z.number().positive(),
      /** Ödeme tarihi (yyyy-MM-dd) — tahsilat anının GERÇEK tarihi. Verilmezse bugün. */
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      /** Ödeme şekli — zorunlu değil, verilmezse markPaymentPaid'in mevcut varsayılan zinciri (öğrencinin kayıtlı yöntemi) kullanılır. */
      method: z.enum(["cash", "transfer", "credit_card"]).optional(),
      /**
       * §C.2 — tahsilat notu (dekont no, kısmi ödeme gerekçesi vb.).
       * ZORUNLU DEĞİL ama verilirse `Payment.paymentNote`e KALICI yazılır;
       * "Tahsil Et" düğmesiyle (POST /payments/:id/pay) AYNI alan — ay
       * kutusundan tahsil edilen bir ödeme not taşıyamıyor olamaz.
       */
      note: z.string().trim().max(200).optional(),
    }),
    input
  );
  if (!v.ok) return v;

  const data = await readData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı");

  try {
    // P0 (2026-09-09) — TAHSİLAT, SÖZLEŞMENİN PLAN SATIRINA BAĞLANIR.
    //
    // Önceden bu tool her zaman AYRI bir `source:"monthly_plan"` Payment
    // yaratıyordu; sözleşme taksit satırı (`source:"contract"`) ise ödenmemiş
    // kalıyordu. Takvim artık tutarı sözleşme planından okuduğu için bu,
    // "tahsil ettim ama takvim hâlâ borçlu gösteriyor" demek olurdu. Plan
    // satırı VARSA doğrudan o satır tahsil edilir — ödenen/kalan/durum tek
    // satır üzerinde tutulur, ikinci bir ödeme kaydı YARATILMAZ.
    const [y, mo] = v.data.month.split("-").map(Number) as [number, number];
    const planContracts = await loadCalendarPlanContracts(ctx.tenantId, student.id);
    const plan = resolveContractPlanForMonth({
      contracts: planContracts,
      installments: data.payments.filter((p) => p.studentId === student.id),
      year: y,
      month: mo,
      studentMonthlyFee: student.monthlyFee,
    });
    if (plan.state === "multiple_active_contracts") {
      return fail("VALIDATION_ERROR", plan.message);
    }
    if (plan.state === "ok" && plan.paymentIds.length > 1) {
      // Sessizce satırlara bölüştürmek yerine AÇIK hata — hangi taksitin
      // ödendiği finansal olarak belirsiz kalamaz.
      return fail(
        "VALIDATION_ERROR",
        "Bu ayda birden fazla sözleşme taksiti var; tahsilatı Ödemeler ekranından ilgili taksit üzerinde yapın."
      );
    }

    if (plan.state === "no_installment_for_month") {
      // UAT 2026-09-25 — öğrencinin bu ayı kapsayan sözleşmesi var ama bu aya düşen taksiti yok:
      // serbest "aylık plan" satırı açmak sözleşmenin yanında İKİNCİ bir ödeme planı üretir.
      return fail(
        "VALIDATION_ERROR",
        `${plan.contractNumber} numaralı sözleşmenin bu aya ait taksiti yok. Tahsilatı Ödemeler ekranında sözleşmenin ilgili taksiti üzerinden yapın; taksit planı yanlışsa Sözleşme Merkezi'nden düzeltin.`
      );
    }

    let paymentId: string;
    // 8. tur — sözleşmesiz planda o ayın TEK açık satırı varsa (ör. ödenmemiş kayıt ilk
    // tahsilatı) ona yazılır; yanına ikinci bir "aylık plan" satırı açılmaz.
    const openStudentRow =
      plan.state === "student_plan" && plan.paymentIds.length === 1 && plan.remaining > 0 ? plan.paymentIds[0] : undefined;
    if (plan.state === "ok") {
      paymentId = plan.paymentIds[0]!;
    } else if (openStudentRow) {
      paymentId = openStudentRow;
    } else {
      // Sözleşme planı YOK (ör. sözleşmesiz/legacy öğrenci) — eski davranış
      // korunur: serbest "aylık plan" ödeme satırı. `dueDate`/`method`
      // verilmezse mevcut değerler KORUNUR.
      const upserted = await upsertMonthlyPlanPayment({
        studentId: v.data.studentId,
        month: v.data.month,
        amount: v.data.amount,
        dueDate: v.data.dueDate,
        method: v.data.method,
      });
      paymentId = upserted.paymentId;
    }
    const { collectPayment } = await import("../payments/collect");
    const collected = await collectPayment(paymentId, {
      amount: v.data.amount,
      method: v.data.method,
      paidAt: v.data.dueDate,
      ...(v.data.note ? { paymentNote: v.data.note } : {}),
      receivedByUserId: ctx.userId,
      actorUserId: ctx.userId,
      tenantId: ctx.tenantId,
      // Sözleşme taksitine yazılan tahsilat EKLENİR (kısmi + kalan = plan).
      // monthly_plan fallback eski SET davranışını korur (upsert zaten satır tutarını yazar).
      accumulate: plan.state === "ok" || Boolean(openStudentRow),
    });
    audit(ctx, "PAYMENT_COLLECTED_FROM_ATTENDANCE_CALENDAR", "Payment", paymentId, {
      studentId: v.data.studentId,
      month: v.data.month,
      amount: v.data.amount,
      method: v.data.method,
      dueDate: v.data.dueDate,
      hasNote: Boolean(v.data.note),
      // Hangi kaynağa yazıldığı audit'te GÖRÜNÜR olmalı — sözleşme taksiti mi,
      // sözleşmesiz serbest aylık plan satırı mı.
      planSource: plan.state === "ok" ? "contract_installment" : "monthly_plan_fallback",
      contractId: plan.state === "ok" ? plan.contractId : undefined,
      receivedByUserId: ctx.userId,
    });
    return ok({
      paymentId,
      studentId: v.data.studentId,
      month: v.data.month,
      amount: v.data.amount,
      status: collected.payment.status,
    });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "collectAttendanceCalendarPayment failed");
  }
}

export async function getStudentPaymentAttendanceStatementTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<import("../student-statement").StudentPaymentAttendanceStatement>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(
    z.object({
      studentId: z.string().min(1),
      term: z.enum(["guz", "yaz"]),
      anchorYear: z.number().int().min(1970).max(2999),
    }),
    input
  );
  if (!v.ok) return v;

  const data = await readData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  const access = await assertStudentAccess(ctx, student, v.data.studentId);
  if (!access.ok) return fail(access.code, access.message);
  if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı");

  const contracts = await loadCalendarPlanContracts(ctx.tenantId, student.id);
  const collectorIds = [
    ...new Set(data.payments.filter((p) => p.studentId === student.id && p.receivedByUserId).map((p) => p.receivedByUserId!)),
  ];
  // P0 revizyonu: e-posta DEĞİL ad soyad (öğretmen kaydından; yoksa zarif
  // fallback) — kimlik `receivedByUserId`de aynen korunur (audit bütünlüğü).
  const { resolveCollectorDisplayNames } = await import("../contract-payment-plan-view");
  const collectorNames = await resolveCollectorDisplayNames({ userIds: collectorIds, teachers: data.teachers });

  const { buildStudentPaymentAttendanceStatement } = await import("../student-statement");
  const statement = buildStudentPaymentAttendanceStatement({
    data,
    studentId: student.id,
    term: v.data.term,
    anchorYear: v.data.anchorYear,
    contracts,
    collectorNames,
  });
  if ("error" in statement) return fail("NOT_FOUND", statement.error);
  return ok(statement);
}

// ─── İş Takip (Task) modülü ──────────────────────────────────────────────
// /panel/is-takip (admin — tüm tenant), /ogretmen/is-takip (öğretmen —
// yalnızca kendine atanan/takipçi olduğu görevler). `/panel/workflows`
// (AI otomasyonu) ile İLGİSİZ, tamamen ayrı bir modül. Kalıcılık
// src/lib/tasks.ts'te (AppData'nın DIŞINDA, additive).

function isTaskAdminRole(role: ServiceContext["role"]): boolean {
  return role === "SUPER_ADMIN" || role === "SCHOOL_ADMIN";
}

/** Bu aktörü tanımlayan olası kimlikler — hem User.id (ctx.userId) hem Teacher.id (ctx.teacherId). */
function actorTaskIdentities(ctx: ServiceContext): string[] {
  return [ctx.userId, ctx.teacherId].filter((v): v is string => !!v);
}

/**
 * TEACHER görüş/işlem kapsamı: yalnızca sorumlu OLDUĞU veya takipçi olduğu
 * görevler. `createdById` KASITLI OLARAK dahil değil — Faz 1'de yalnızca
 * admin görev oluşturabilir (createTaskTool admin-only), bu yüzden bir
 * TEACHER hiçbir zaman createdById olamaz; dahil etmek yalnızca test/ileride
 * karışıklığa yol açar.
 */
function isTaskOwnedByActor(
  task: Pick<Task, "assigneeId" | "followerIds" | "createdById">,
  ctx: ServiceContext
): boolean {
  const ids = actorTaskIdentities(ctx);
  return (
    (!!task.assigneeId && ids.includes(task.assigneeId)) ||
    task.followerIds.some((f) => ids.includes(f))
  );
}

type TaskLinks = {
  studentId?: string;
  teacherId?: string;
  branchId?: string;
  lessonId?: string;
  paymentId?: string;
  documentId?: string;
};

/**
 * Bağlı kayıtların (öğrenci/öğretmen/şube/ders/ödeme/evrak) AYNI tenant'a
 * ait olduğunu doğrular — `readData()` zaten tenant-scoped döndürdüğü için
 * cross-tenant bir ID burada asla "bulunamaz" görünür (IDOR'a kapalı,
 * ayrıca bir tenantId karşılaştırması gerekmez).
 */
async function validateTaskLinks(ctx: ServiceContext, links: TaskLinks): Promise<ServiceResult<null>> {
  const data = await readData();
  if (links.studentId && !data.students.some((s) => s.id === links.studentId)) {
    return fail("VALIDATION_ERROR", "Bağlı öğrenci bulunamadı veya bu kuruma ait değil.");
  }
  if (links.teacherId && !data.teachers.some((t) => t.id === links.teacherId)) {
    return fail("VALIDATION_ERROR", "Bağlı öğretmen bulunamadı veya bu kuruma ait değil.");
  }
  if (links.branchId && !data.settings.branches.some((b) => b.id === links.branchId)) {
    return fail("VALIDATION_ERROR", "Bağlı şube bulunamadı veya bu kuruma ait değil.");
  }
  if (links.lessonId && !data.lessons.some((l) => l.id === links.lessonId)) {
    return fail("VALIDATION_ERROR", "Bağlı ders bulunamadı veya bu kuruma ait değil.");
  }
  if (links.paymentId && !data.payments.some((p) => p.id === links.paymentId)) {
    return fail("VALIDATION_ERROR", "Bağlı ödeme bulunamadı veya bu kuruma ait değil.");
  }
  if (links.documentId) {
    const { getDocumentInstance } = await import("../documents");
    const doc = await getDocumentInstance(ctx.tenantId, links.documentId);
    if (!doc) return fail("VALIDATION_ERROR", "Bağlı evrak bulunamadı veya bu kuruma ait değil.");
  }
  return ok(null);
}

/** Admin/TEACHER ortak — görev okuma erişimi olan roller. PARENT/STUDENT hiç erişemez. */
const TASK_VIEW_ROLES: ServiceContext["role"][] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER"];
const TASK_ADMIN_ROLES: ServiceContext["role"][] = ["SUPER_ADMIN", "SCHOOL_ADMIN"];
/**
 * İş Takip Merkezi — bağlamsal görev oluşturma artık TEACHER'a da açık,
 * ANCAK yalnızca kendi erişebildiği bir kayda (relatedEntityType/Id)
 * bağlıysa (bkz. resolveRelatedEntityOwnership). Bağlantısız (serbest) görev
 * oluşturma admin-only kalır — PARENT/STUDENT bu listede hiç yok, dolayısıyla
 * requireRole ile fail-closed reddedilirler.
 */
const TASK_CREATE_ROLES: ServiceContext["role"][] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER"];

type RelatedEntityResolution = {
  /** Bu kaydın "sahibi" sayılan öğretmen — TEACHER rolü için erişim kontrolünde kullanılır. */
  ownerTeacherId?: string;
  ownerStudentId?: string;
  /** Var olan özel FK alanına (studentId/teacherId/...) otomatik doldurma — geriye dönük uyumluluk. */
  derivedLinks: TaskLinks;
};

/**
 * Genel `relatedEntityType/relatedEntityId` bağlantısını tenant-scoped olarak
 * doğrular ve (varsa) sahiplik bilgisini + eşleşen özel FK alanını üretir.
 * `readData()` zaten tenant-filtrelidir — cross-tenant bir id burada asla
 * "bulunamaz" görünür (IDOR'a kapalı).
 */
async function resolveRelatedEntity(
  ctx: ServiceContext,
  type: NonNullable<Task["relatedEntityType"]>,
  id: string
): Promise<ServiceResult<RelatedEntityResolution>> {
  const data = await readData();
  switch (type) {
    case "student": {
      const s = data.students.find((x) => x.id === id);
      if (!s) return fail("VALIDATION_ERROR", "Bağlı öğrenci bulunamadı veya bu kuruma ait değil.");
      return ok({ ownerTeacherId: s.teacherId, ownerStudentId: s.id, derivedLinks: { studentId: s.id } });
    }
    case "teacher": {
      const t = data.teachers.find((x) => x.id === id);
      if (!t) return fail("VALIDATION_ERROR", "Bağlı öğretmen bulunamadı veya bu kuruma ait değil.");
      return ok({ ownerTeacherId: t.id, derivedLinks: { teacherId: t.id } });
    }
    case "payment": {
      const p = data.payments.find((x) => x.id === id);
      if (!p) return fail("VALIDATION_ERROR", "Bağlı ödeme bulunamadı veya bu kuruma ait değil.");
      const s = data.students.find((x) => x.id === p.studentId);
      return ok({ ownerTeacherId: s?.teacherId, ownerStudentId: p.studentId, derivedLinks: { paymentId: p.id, studentId: p.studentId } });
    }
    case "document": {
      const { getDocumentInstance } = await import("../documents");
      const doc = await getDocumentInstance(ctx.tenantId, id);
      if (!doc) return fail("VALIDATION_ERROR", "Bağlı evrak bulunamadı veya bu kuruma ait değil.");
      return ok({ ownerTeacherId: doc.teacherId, ownerStudentId: doc.studentId, derivedLinks: { documentId: doc.id } });
    }
    case "makeup": {
      const m = data.makeupRequests.find((x) => x.id === id);
      if (!m) return fail("VALIDATION_ERROR", "Bağlı telafi kaydı bulunamadı veya bu kuruma ait değil.");
      return ok({
        ownerTeacherId: m.teacherId,
        ownerStudentId: m.studentId,
        derivedLinks: { studentId: m.studentId, teacherId: m.teacherId },
      });
    }
    case "lessonCorrection": {
      const l = data.lessons.find((x) => x.id === id);
      if (!l) return fail("VALIDATION_ERROR", "Bağlı ders bulunamadı veya bu kuruma ait değil.");
      return ok({
        ownerTeacherId: l.teacherId,
        ownerStudentId: l.studentId,
        derivedLinks: { lessonId: l.id, studentId: l.studentId, teacherId: l.teacherId },
      });
    }
    case "branch": {
      const b = data.settings.branches.find((x) => x.id === id);
      if (!b) return fail("VALIDATION_ERROR", "Bağlı şube bulunamadı veya bu kuruma ait değil.");
      // Şube-context görevler personel/idari niteliktedir — TEACHER'a açık değil (aşağıda ayrıca reddedilir).
      return ok({ derivedLinks: { branchId: b.id } });
    }
    default:
      return fail("VALIDATION_ERROR", "Geçersiz ilişkili kayıt tipi.");
  }
}

/** TEACHER rolünün doğrudan bağlanamayacağı ilişki tipleri — idari/finansal alan, ayrı bir sahiplik modeli yok. */
const TEACHER_RESTRICTED_RELATED_TYPES: NonNullable<Task["relatedEntityType"]>[] = ["branch"];

export async function createTaskTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ taskId: string }>> {
  const auth = requireRole(ctx, TASK_CREATE_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const moduleGate = await assertFeatureEnabled(ctx.tenantId, "tasks");
  if (!moduleGate.ok) return moduleGate;

  const v = parseOrFail(createTaskSchema, input);
  if (!v.ok) return v;

  const linkCheck = await validateTaskLinks(ctx, v.data);
  if (!linkCheck.ok) return linkCheck;

  let derivedLinks: TaskLinks = {};
  if (v.data.relatedEntityType && v.data.relatedEntityId) {
    if (ctx.role === "TEACHER" && TEACHER_RESTRICTED_RELATED_TYPES.includes(v.data.relatedEntityType)) {
      return fail("FORBIDDEN", "Öğretmenler bu tür bir kayda bağlı görev oluşturamaz.");
    }
    const resolved = await resolveRelatedEntity(ctx, v.data.relatedEntityType, v.data.relatedEntityId);
    if (!resolved.ok) return resolved;
    if (ctx.role === "TEACHER" && resolved.data.ownerTeacherId !== ctx.teacherId) {
      return fail("FORBIDDEN", "Yalnızca erişebildiğiniz kayıtlara bağlı görev oluşturabilirsiniz.");
    }
    derivedLinks = resolved.data.derivedLinks;
  } else if (ctx.role === "TEACHER") {
    // Faz: TEACHER yalnızca bağlamsal (ilişkili kayıtlı) görev oluşturabilir — serbest görev admin-only.
    return fail("FORBIDDEN", "Öğretmenler yalnızca erişebildikleri bir kayda bağlı görev oluşturabilir.");
  }

  try {
    const task = await createTask({
      tenantId: ctx.tenantId,
      title: v.data.title,
      description: v.data.description,
      priority: v.data.priority,
      category: v.data.category,
      assigneeId: v.data.assigneeId,
      followerIds: v.data.followerIds,
      createdById: ctx.userId,
      startDate: v.data.startDate,
      dueDate: v.data.dueDate,
      tags: v.data.tags,
      studentId: v.data.studentId ?? derivedLinks.studentId,
      teacherId: v.data.teacherId ?? derivedLinks.teacherId,
      branchId: v.data.branchId ?? derivedLinks.branchId,
      lessonId: v.data.lessonId ?? derivedLinks.lessonId,
      paymentId: v.data.paymentId ?? derivedLinks.paymentId,
      documentId: v.data.documentId ?? derivedLinks.documentId,
      relatedEntityType: v.data.relatedEntityType,
      relatedEntityId: v.data.relatedEntityId,
      relatedEntityLabel: v.data.relatedEntityLabel,
    });
    await addActivity(ctx.tenantId, task.id, ctx.userId, "created", `Görev oluşturuldu: "${task.title}"`);
    audit(ctx, "task.create", "Task", task.id, {
      category: task.category,
      priority: task.priority,
      relatedEntityType: task.relatedEntityType,
      relatedEntityId: task.relatedEntityId,
    });
    if (task.relatedEntityType) {
      await addActivity(
        ctx.tenantId,
        task.id,
        ctx.userId,
        "field_updated",
        `İlişkili kayıt bağlandı: ${task.relatedEntityLabel ?? task.relatedEntityType}`
      );
    }
    if (task.assigneeId) {
      const { notifyTaskAssigned } = await import("../task-notifications");
      await notifyTaskAssigned(ctx.tenantId, task.assigneeId, task.title, task.id);
    }
    return ok({ taskId: task.id });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "createTask failed");
  }
}

export type TaskWithMeta = Task;

/**
 * Görev detayındaki "İlişkili kayıt" bölümü için — `relatedEntityType/Id`'yi
 * tenant-scoped olarak çözer ve TIKLANABİLİR bir bağlantı üretir. Kayıt
 * silinmiş/arşivlenmiş/başka kuruma aitse `exists:false` döner — UI bunu
 * kırık link yerine "Bu kayda artık erişilemiyor" mesajıyla gösterir
 * (bkz. task-detail-panel.tsx, evrak bağlamıyla AYNI desen).
 */
export async function resolveTaskRelatedEntityTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ exists: boolean; href?: string; label?: string }>> {
  const auth = requireRole(ctx, TASK_VIEW_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(resolveRelatedEntitySchema, input);
  if (!v.ok) return v;

  const resolved = await resolveRelatedEntity(ctx, v.data.relatedEntityType, v.data.relatedEntityId);
  if (!resolved.ok) return ok({ exists: false });

  const hrefByType: Record<NonNullable<Task["relatedEntityType"]>, string> = {
    student: `/panel/ogrenciler/${v.data.relatedEntityId}`,
    teacher: `/panel/ogretmenler/${v.data.relatedEntityId}`,
    payment: resolved.data.ownerStudentId
      ? `/panel/odemeler/${resolved.data.ownerStudentId}`
      : "/panel/odemeler",
    document: `/panel/evraklar/${v.data.relatedEntityId}`,
    makeup: "/panel/telafi",
    lessonCorrection: "/panel/ders-duzeltme",
    branch: "/panel/subeler",
  };

  return ok({ exists: true, href: hrefByType[v.data.relatedEntityType] });
}

export async function listTasksTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ tasks: TaskWithMeta[] }>> {
  const auth = requireRole(ctx, TASK_VIEW_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(listTasksFilterSchema, input);
  if (!v.ok) return v;

  const now = new Date();
  const todayYmd = now.toISOString().slice(0, 10);
  const weekAheadYmd = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  const filter: TaskFilter = {
    status: v.data.status,
    priority: v.data.priority,
    category: v.data.category,
    assigneeId: v.data.assigneeId,
    followerId: v.data.followerId,
    branchId: v.data.branchId,
    createdById: v.data.createdById,
    tag: v.data.tag,
    search: v.data.search,
    dueBefore: v.data.dueBefore,
    dueAfter: v.data.dueAfter,
  };

  // TEACHER (çalışan) her koşulda yalnızca kendi görevlerini görebilir —
  // filtre ne olursa olsun bu daraltma UNUTULMAZ (IDOR'a kapalı).
  if (!isTaskAdminRole(ctx.role)) {
    filter.ownedByAny = actorTaskIdentities(ctx);
  }

  let tasks = await listTasks(ctx.tenantId, filter);

  switch (v.data.quickFilter) {
    case "mine":
      tasks = tasks.filter(
        (t) =>
          actorTaskIdentities(ctx).includes(t.assigneeId ?? "") ||
          t.followerIds.some((f) => actorTaskIdentities(ctx).includes(f))
      );
      break;
    case "today":
      tasks = tasks.filter((t) => t.dueDate && t.dueDate.slice(0, 10) === todayYmd);
      break;
    case "week":
      tasks = tasks.filter((t) => t.dueDate && t.dueDate.slice(0, 10) >= todayYmd && t.dueDate.slice(0, 10) <= weekAheadYmd);
      break;
    case "overdue":
      tasks = tasks.filter(
        (t) => t.dueDate && t.dueDate.slice(0, 10) < todayYmd && OPEN_TASK_STATUSES.includes(t.status)
      );
      break;
    case "completed":
      tasks = tasks.filter((t) => t.status === "COMPLETED");
      break;
    case "archived":
      tasks = tasks.filter((t) => t.status === "ARCHIVED");
      break;
    default:
      break;
  }

  return ok({ tasks });
}

export async function getTaskKpiSummaryTool(
  ctx: ServiceContext
): Promise<
  ServiceResult<{
    openCount: number;
    assignedToMeCount: number;
    dueTodayCount: number;
    overdueCount: number;
    completedThisWeekCount: number;
  }>
> {
  const auth = requireRole(ctx, TASK_VIEW_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const filter: TaskFilter = isTaskAdminRole(ctx.role) ? {} : { ownedByAny: actorTaskIdentities(ctx) };
  const tasks = await listTasks(ctx.tenantId, filter);

  const now = new Date();
  const todayYmd = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const myIds = actorTaskIdentities(ctx);

  return ok({
    openCount: tasks.filter((t) => OPEN_TASK_STATUSES.includes(t.status)).length,
    assignedToMeCount: tasks.filter((t) => t.assigneeId && myIds.includes(t.assigneeId)).length,
    dueTodayCount: tasks.filter((t) => t.dueDate && t.dueDate.slice(0, 10) === todayYmd).length,
    overdueCount: tasks.filter(
      (t) => t.dueDate && t.dueDate.slice(0, 10) < todayYmd && OPEN_TASK_STATUSES.includes(t.status)
    ).length,
    completedThisWeekCount: tasks.filter((t) => t.status === "COMPLETED" && t.completedAt && t.completedAt >= weekAgo)
      .length,
  });
}

const TASK_REPORT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * İş Takip Faz 3B-3B — yönetici görev raporu. YALNIZ SUPER_ADMIN/SCHOOL_ADMIN
 * (`TASK_ADMIN_ROLES`, `TASK_VIEW_ROLES` DEĞİL — TEACHER'a bu tool tamamen
 * kapalı, hem sayfa hem bu tool seviyesinde). Tüm hesaplama sunucu
 * tarafında, `listTasks(ctx.tenantId, {})` ile TEK sorguda (N+1 yok, ek I/O
 * yok) çekilen tenant-scoped görev listesi üzerinde saf agregasyon
 * (`buildTaskReport`) ile yapılır — istemciye ham görev listesi asla
 * gönderilmez, yalnızca sayılmış/gruplanmış sonuç döner.
 */
export async function getTaskReportTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<TaskReport>> {
  const auth = requireRole(ctx, TASK_ADMIN_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(
    z
      .object({
        startDate: z.string().regex(TASK_REPORT_DATE_RE).optional(),
        endDate: z.string().regex(TASK_REPORT_DATE_RE).optional(),
      })
      .refine((d) => !d.startDate || !d.endDate || d.startDate <= d.endDate, {
        message: "Başlangıç tarihi bitiş tarihinden sonra olamaz.",
      }),
    input
  );
  if (!v.ok) return v;

  const tz = resolveAppTimezone();
  const todayYmd = toZonedYmd(new Date(), tz);
  const defaultRange = defaultTaskReportRange(todayYmd);
  const range: TaskReportRange = {
    startYmd: v.data.startDate ?? defaultRange.startYmd,
    endYmd: v.data.endDate ?? defaultRange.endYmd,
  };

  try {
    const tasks = await listTasks(ctx.tenantId, {});
    const report = buildTaskReport(tasks, range, todayYmd);
    return ok(report);
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "getTaskReport failed");
  }
}

async function assertTaskViewAccess(ctx: ServiceContext, taskId: string): Promise<ServiceResult<Task>> {
  const task = await getTask(ctx.tenantId, taskId);
  if (!task) return fail("NOT_FOUND", "Görev bulunamadı");
  if (!isTaskAdminRole(ctx.role) && !isTaskOwnedByActor(task, ctx)) {
    return fail("FORBIDDEN", "Yalnızca size atanan veya takipçisi olduğunuz görevleri görebilirsiniz.");
  }
  return ok(task);
}

export async function getTaskTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ task: Task }>> {
  const auth = requireRole(ctx, TASK_VIEW_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(z.object({ taskId: z.string().min(1) }), input);
  if (!v.ok) return v;

  const access = await assertTaskViewAccess(ctx, v.data.taskId);
  if (!access.ok) return access;
  return ok({ task: access.data });
}

/**
 * 9. tur — iş silme. Silme GERİ ALINABİLİRDİR (soft delete): iş tüm listelerden, KPI'lardan,
 * raporlardan ve hatırlatmalardan çıkar; yorum/checklist/ek/aktivite ve denetim kaydı korunur,
 * "Silinen işler"den geri alınır. İşler başka kayıtları DEĞİŞTİRMEZ (öğrenci/ödeme vb. bağlar
 * yalnız kimlik referansıdır, FK yok) — silme bağlı kayıtlara dokunmaz.
 * Kapılar: rol (SUPER_ADMIN/SCHOOL_ADMIN) → "SİL" teyidi → kritik işlem şifresi. Her deneme audit'e.
 */
export async function getTaskDeletionImpactTool(
  ctx: ServiceContext,
  input: unknown
): Promise<
  ServiceResult<{
    title: string;
    status: string;
    checklistCount: number;
    commentCount: number;
    attachmentCount: number;
    relatedLabel?: string;
    criticalPasswordConfigured: boolean;
  }>
> {
  const auth = requireRole(ctx, CRITICAL_ROLES_FOR_TOOLS);
  if (!auth.ok) return fail("FORBIDDEN", "İş silme yalnız kurum sahibi ve kurum yöneticileri tarafından başlatılabilir.");
  const v = parseOrFail(z.object({ taskId: z.string().min(1) }), input);
  if (!v.ok) return v;
  const task = await getTask(ctx.tenantId, v.data.taskId);
  if (!task) return fail("NOT_FOUND", "İş bulunamadı; silinmiş veya başka bir kuruma ait olabilir.");
  const [checklist, comments, attachments] = await Promise.all([
    listChecklistItems(ctx.tenantId, task.id),
    listComments(ctx.tenantId, task.id),
    listAttachments(ctx.tenantId, task.id),
  ]);
  const { getCriticalActionPasswordStatus } = await import("../critical-action-password");
  const status = await getCriticalActionPasswordStatus(ctx.tenantId);
  return ok({
    title: task.title,
    status: task.status,
    checklistCount: checklist.length,
    commentCount: comments.length,
    attachmentCount: attachments.length,
    relatedLabel: task.relatedEntityLabel,
    criticalPasswordConfigured: status.configured,
  });
}

export async function deleteTaskTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ taskId: string }>> {
  const auth = requireRole(ctx, CRITICAL_ROLES_FOR_TOOLS);
  if (!auth.ok) return fail("FORBIDDEN", "İş silme yalnız kurum sahibi ve kurum yöneticileri tarafından başlatılabilir.");
  const v = parseOrFail(
    z.object({
      taskId: z.string().min(1),
      confirmation: z.string(),
      criticalPassword: z.string(),
      reason: z.string().trim().min(5, "Silme gerekçesi en az 5 karakter olmalı.").max(500),
    }),
    input
  );
  if (!v.ok) return v;
  const task = await getTask(ctx.tenantId, v.data.taskId);
  if (!task) return fail("NOT_FOUND", "İş bulunamadı; başka biri silmiş olabilir. Listeyi yenileyin.");
  const deny = async (reasonCode: string, message: string) => {
    await recordAuditLog({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      action: "task.delete",
      entityType: "Task",
      entityId: task.id,
      outcome: "denied",
      meta: { reasonCode, entityName: task.title },
    });
    return fail("FORBIDDEN", message);
  };
  // Türkçe olmayan klavyede "SIL" (noktasız I) da kabul edilir.
  if (!["sil", "sıl"].includes(v.data.confirmation.trim().toLocaleLowerCase("tr"))) {
    return deny("confirmation_mismatch", 'Onay için kutuya "SİL" yazın.');
  }
  const gate = await checkCriticalPassword(ctx, v.data.criticalPassword);
  if (!gate.ok) return deny(gate.reasonCode, gate.message);
  const updated = await setTaskDeletion(ctx.tenantId, task.id, {
    deletedAt: new Date().toISOString(),
    deletedByUserId: ctx.userId,
    deletionReason: v.data.reason,
  });
  if (!updated) return fail("NOT_FOUND", "İş bulunamadı; başka biri silmiş olabilir. Listeyi yenileyin.");
  await recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: "task.delete",
    entityType: "Task",
    entityId: task.id,
    outcome: "success",
    meta: { entityName: task.title, reason: v.data.reason, status: task.status },
  });
  return ok({ taskId: task.id });
}

export async function restoreDeletedTaskTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ taskId: string }>> {
  const auth = requireRole(ctx, CRITICAL_ROLES_FOR_TOOLS);
  if (!auth.ok) return fail("FORBIDDEN", "Silinen işi yalnız kurum sahibi ve kurum yöneticileri geri alabilir.");
  const v = parseOrFail(z.object({ taskId: z.string().min(1) }), input);
  if (!v.ok) return v;
  const task = await getTask(ctx.tenantId, v.data.taskId, { includeDeleted: true });
  if (!task) return fail("NOT_FOUND", "İş bulunamadı.");
  if (!task.deletedAt) return fail("VALIDATION_ERROR", "Bu iş silinmiş değil.");
  await setTaskDeletion(ctx.tenantId, task.id, null);
  await recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: "task.delete_restore",
    entityType: "Task",
    entityId: task.id,
    outcome: "success",
    meta: { entityName: task.title, deletedAt: task.deletedAt },
  });
  return ok({ taskId: task.id });
}

export async function listDeletedTasksTool(ctx: ServiceContext): Promise<ServiceResult<{ tasks: Task[] }>> {
  const auth = requireRole(ctx, CRITICAL_ROLES_FOR_TOOLS);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  return ok({ tasks: await listDeletedTasks(ctx.tenantId) });
}

export async function getTaskDetailTool(
  ctx: ServiceContext,
  input: unknown
): Promise<
  ServiceResult<{
    task: Task;
    checklist: TaskChecklistItem[];
    comments: TaskComment[];
    activity: TaskActivity[];
    attachments: TaskAttachment[];
  }>
> {
  const auth = requireRole(ctx, TASK_VIEW_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(z.object({ taskId: z.string().min(1) }), input);
  if (!v.ok) return v;

  const access = await assertTaskViewAccess(ctx, v.data.taskId);
  if (!access.ok) return access;

  const [checklist, comments, activity, attachments] = await Promise.all([
    listChecklistItems(ctx.tenantId, v.data.taskId),
    listComments(ctx.tenantId, v.data.taskId),
    listActivity(ctx.tenantId, v.data.taskId),
    listAttachments(ctx.tenantId, v.data.taskId),
  ]);
  return ok({ task: access.data, checklist, comments, activity, attachments });
}

/** TEACHER'ın kendi görevinde değiştirebileceği TEK alan seti — sorumlu/takipçi/tarih/bağlam DIŞARIDA. */
const TEACHER_EDITABLE_TASK_FIELDS = new Set(["status", "progressPercent"]);

export async function updateTaskTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ taskId: string }>> {
  const auth = requireRole(ctx, TASK_VIEW_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(updateTaskSchema, input);
  if (!v.ok) return v;

  const task = await getTask(ctx.tenantId, v.data.taskId);
  if (!task) return fail("NOT_FOUND", "Görev bulunamadı");

  const isAdmin = isTaskAdminRole(ctx.role);
  if (!isAdmin) {
    if (!isTaskOwnedByActor(task, ctx)) {
      return fail("FORBIDDEN", "Yalnızca size atanan veya takipçisi olduğunuz görevleri güncelleyebilirsiniz.");
    }
    const { taskId: _taskId, ...patchFields } = v.data;
    void _taskId;
    const attemptedFields = Object.keys(patchFields).filter(
      (k) => (patchFields as Record<string, unknown>)[k] !== undefined
    );
    const disallowed = attemptedFields.filter((f) => !TEACHER_EDITABLE_TASK_FIELDS.has(f));
    if (disallowed.length > 0) {
      return fail(
        "FORBIDDEN",
        `Bu alanları yalnızca yönetici değiştirebilir: ${disallowed.join(", ")}.`
      );
    }
    // TEACHER, CANCELLED/ARCHIVED'e bu genel güncelleme yoluyla geçemez —
    // bunlar yalnızca changeTaskStatusTool üzerinden, admin-only aksiyonlardır.
    if (v.data.status && (v.data.status === "CANCELLED" || v.data.status === "ARCHIVED")) {
      return fail("FORBIDDEN", "İptal/arşivleme yalnızca yönetici tarafından yapılabilir.");
    }
  }

  if (v.data.studentId || v.data.teacherId || v.data.branchId || v.data.lessonId || v.data.paymentId || v.data.documentId) {
    const linkCheck = await validateTaskLinks(ctx, v.data);
    if (!linkCheck.ok) return linkCheck;
  }

  const changeSummaries: string[] = [];
  if (v.data.status && v.data.status !== task.status) changeSummaries.push(`Durum: ${task.status} → ${v.data.status}`);
  if (v.data.priority && v.data.priority !== task.priority) changeSummaries.push(`Öncelik: ${task.priority} → ${v.data.priority}`);
  if (v.data.category && v.data.category !== task.category) changeSummaries.push(`Kategori: ${task.category} → ${v.data.category}`);
  if ("assigneeId" in v.data && v.data.assigneeId !== task.assigneeId) {
    changeSummaries.push(`Sorumlu değişti`);
  }
  if (v.data.dueDate !== undefined && v.data.dueDate !== task.dueDate) changeSummaries.push(`Son tarih güncellendi`);

  try {
    const patch: Parameters<typeof updateTask>[2] = {};
    if (v.data.title !== undefined) patch.title = v.data.title;
    if (v.data.description !== undefined) patch.description = v.data.description;
    if (v.data.status !== undefined) patch.status = v.data.status;
    if (v.data.priority !== undefined) patch.priority = v.data.priority;
    if (v.data.category !== undefined) patch.category = v.data.category;
    if ("assigneeId" in v.data) patch.assigneeId = v.data.assigneeId ?? undefined;
    if (v.data.followerIds !== undefined) patch.followerIds = v.data.followerIds;
    if ("startDate" in v.data) patch.startDate = v.data.startDate ?? undefined;
    if ("dueDate" in v.data) patch.dueDate = v.data.dueDate ?? undefined;
    if (v.data.progressPercent !== undefined) patch.progressPercent = v.data.progressPercent;
    if (v.data.tags !== undefined) patch.tags = v.data.tags;
    if (v.data.studentId !== undefined) patch.studentId = v.data.studentId;
    if (v.data.teacherId !== undefined) patch.teacherId = v.data.teacherId;
    if (v.data.branchId !== undefined) patch.branchId = v.data.branchId;
    if (v.data.lessonId !== undefined) patch.lessonId = v.data.lessonId;
    if (v.data.paymentId !== undefined) patch.paymentId = v.data.paymentId;
    if (v.data.documentId !== undefined) patch.documentId = v.data.documentId;
    // Tamamlandı statüsüne genel güncelleme yoluyla geçilirse completedAt atanır
    // (changeTaskStatusTool ile aynı davranış — tek kaynak).
    if (v.data.status === "COMPLETED" && !task.completedAt) patch.completedAt = new Date().toISOString();

    const updated = await updateTask(ctx.tenantId, v.data.taskId, patch);
    if (!updated) return fail("NOT_FOUND", "Görev bulunamadı");

    for (const summary of changeSummaries) {
      await addActivity(ctx.tenantId, updated.id, ctx.userId, "field_updated", summary);
    }
    if (changeSummaries.length === 0) {
      await addActivity(ctx.tenantId, updated.id, ctx.userId, "field_updated", "Görev güncellendi");
    }
    audit(ctx, "task.update", "Task", updated.id, { changedFields: Object.keys(patch) });
    if ("assigneeId" in v.data && updated.assigneeId && updated.assigneeId !== task.assigneeId) {
      const { notifyTaskAssigned } = await import("../task-notifications");
      await notifyTaskAssigned(ctx.tenantId, updated.assigneeId, updated.title, updated.id);
    }
    return ok({ taskId: updated.id });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "updateTask failed");
  }
}

/**
 * Yaşam döngüsü aksiyonları: tamamla/iptal/arşivle/yeniden aç + TEACHER'ın
 * izinli statüler arası geçişi (set_status — CANCELLED/ARCHIVED HARİÇ).
 * Görevler ASLA silinmez.
 */
export async function changeTaskStatusTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ taskId: string; status: TaskStatus }>> {
  const auth = requireRole(ctx, TASK_VIEW_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(changeTaskStatusSchema, input);
  if (!v.ok) return v;

  const task = await getTask(ctx.tenantId, v.data.taskId);
  if (!task) return fail("NOT_FOUND", "Görev bulunamadı");

  const isAdmin = isTaskAdminRole(ctx.role);
  if (!isAdmin) {
    if (!isTaskOwnedByActor(task, ctx)) {
      return fail("FORBIDDEN", "Yalnızca size atanan veya takipçisi olduğunuz görevleri güncelleyebilirsiniz.");
    }
    if (v.data.action !== "set_status") {
      return fail("FORBIDDEN", "Tamamlandı-dışı iptal/arşiv/yeniden-aç yalnızca yönetici tarafından yapılabilir.");
    }
    if (v.data.status === "CANCELLED" || v.data.status === "ARCHIVED") {
      return fail("FORBIDDEN", "İptal/arşivleme yalnızca yönetici tarafından yapılabilir.");
    }
  }

  const now = new Date().toISOString();
  let nextStatus: TaskStatus;
  const patch: Parameters<typeof updateTask>[2] = {};
  let activityAction: TaskActivityAction;
  let activitySummary: string;

  switch (v.data.action) {
    case "complete":
      nextStatus = "COMPLETED";
      patch.status = nextStatus;
      patch.completedAt = now;
      patch.progressPercent = 100;
      activityAction = "completed";
      activitySummary = "Görev tamamlandı";
      break;
    case "cancel":
      nextStatus = "CANCELLED";
      patch.status = nextStatus;
      patch.cancelledAt = now;
      activityAction = "cancelled";
      activitySummary = "Görev iptal edildi";
      break;
    case "archive":
      nextStatus = "ARCHIVED";
      patch.status = nextStatus;
      patch.archivedAt = now;
      activityAction = "archived";
      activitySummary = "Görev arşivlendi";
      break;
    case "reopen":
      nextStatus = "TODO";
      patch.status = nextStatus;
      patch.completedAt = undefined;
      patch.cancelledAt = undefined;
      patch.archivedAt = undefined;
      activityAction = "reopened";
      activitySummary = "Görev yeniden açıldı";
      break;
    case "set_status": {
      if (!v.data.status) return fail("VALIDATION_ERROR", "status gerekli");
      nextStatus = v.data.status;
      patch.status = nextStatus;
      if (nextStatus === "COMPLETED") {
        patch.completedAt = now;
        patch.progressPercent = 100;
      }
      activityAction = "status_changed";
      activitySummary = `Durum: ${task.status} → ${nextStatus}`;
      break;
    }
    default:
      return fail("VALIDATION_ERROR", "Geçersiz aksiyon");
  }

  try {
    const updated = await updateTask(ctx.tenantId, v.data.taskId, patch);
    if (!updated) return fail("NOT_FOUND", "Görev bulunamadı");
    await addActivity(ctx.tenantId, updated.id, ctx.userId, activityAction, activitySummary);
    audit(ctx, `task.${v.data.action}`, "Task", updated.id, { fromStatus: task.status, toStatus: nextStatus });
    return ok({ taskId: updated.id, status: nextStatus });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "changeTaskStatus failed");
  }
}

async function assertTaskWriteAccess(ctx: ServiceContext, taskId: string): Promise<ServiceResult<Task>> {
  const task = await getTask(ctx.tenantId, taskId);
  if (!task) return fail("NOT_FOUND", "Görev bulunamadı");
  if (!isTaskAdminRole(ctx.role) && !isTaskOwnedByActor(task, ctx)) {
    return fail("FORBIDDEN", "Yalnızca size atanan veya takipçisi olduğunuz görevlerde işlem yapabilirsiniz.");
  }
  return ok(task);
}

export async function addTaskChecklistItemTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ itemId: string }>> {
  const auth = requireRole(ctx, TASK_VIEW_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(addTaskChecklistItemSchema, input);
  if (!v.ok) return v;

  const access = await assertTaskWriteAccess(ctx, v.data.taskId);
  if (!access.ok) return access;

  try {
    const existing = await listChecklistItems(ctx.tenantId, v.data.taskId);
    const item = await addChecklistItem(ctx.tenantId, v.data.taskId, v.data.title, existing.length);
    await addActivity(ctx.tenantId, v.data.taskId, ctx.userId, "checklist_added", `Checklist eklendi: "${item.title}"`);
    audit(ctx, "task.checklist.add", "Task", v.data.taskId, { itemId: item.id });
    return ok({ itemId: item.id });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "addTaskChecklistItem failed");
  }
}

/**
 * İlerleme kuralı: `progressPercent` normalde MANUEL alandır (admin
 * doğrudan set eder, veya statü COMPLETED olunca 100'e sabitlenir).
 * Checklist her TIK'lamada otomatik ilerleme YENİDEN HESAPLAMAZ (bir
 * admin ağırlıklı/özel bir yüzde belirlemiş olabilir, sürpriz üzerine
 * yazma istemeyiz). TEK istisna, açık gereksinim gereği: bir checklist
 * ÖĞESİ TAMAMLANDIĞINDA, eğer bu görevin TÜM checklist öğeleri artık
 * tamamlanmışsa, ilerleme 100'e sabitlenir (mantıklı tamamlanma sinyali).
 * Bunun TERSİ uygulanmaz — bir öğeyi geri açmak ilerlemeyi geri DÜŞÜRMEZ
 * (checklist "tekrar aç" kullanımı sık, ilerlemeyi dalgalandırmak kafa
 * karıştırır) — yalnızca admin manuel olarak düşürebilir.
 */
export async function setTaskChecklistItemCompletedTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ itemId: string; allCompleted: boolean }>> {
  const auth = requireRole(ctx, TASK_VIEW_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(setTaskChecklistItemCompletedSchema, input);
  if (!v.ok) return v;

  const access = await assertTaskWriteAccess(ctx, v.data.taskId);
  if (!access.ok) return access;

  try {
    const updatedItem = await setChecklistItemCompleted(ctx.tenantId, v.data.itemId, v.data.isCompleted, ctx.userId);
    if (!updatedItem) return fail("NOT_FOUND", "Checklist öğesi bulunamadı");

    const items = await listChecklistItems(ctx.tenantId, v.data.taskId);
    const allCompleted = items.length > 0 && items.every((i) => i.isCompleted);
    if (v.data.isCompleted && allCompleted) {
      await updateTask(ctx.tenantId, v.data.taskId, { progressPercent: 100 });
    }

    await addActivity(
      ctx.tenantId,
      v.data.taskId,
      ctx.userId,
      "checklist_updated",
      `Checklist "${updatedItem.title}" ${v.data.isCompleted ? "tamamlandı" : "yeniden açıldı"}`
    );
    audit(ctx, "task.checklist.toggle", "Task", v.data.taskId, { itemId: v.data.itemId, isCompleted: v.data.isCompleted });
    return ok({ itemId: updatedItem.id, allCompleted });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "setTaskChecklistItemCompleted failed");
  }
}

/** Soft-archive — hard delete yok (checklist "silme" burada arşivlemedir). */
export async function archiveTaskChecklistItemTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ itemId: string }>> {
  const auth = requireRole(ctx, TASK_VIEW_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(archiveTaskChecklistItemSchema, input);
  if (!v.ok) return v;

  const access = await assertTaskWriteAccess(ctx, v.data.taskId);
  if (!access.ok) return access;

  try {
    const removed = await archiveChecklistItem(ctx.tenantId, v.data.itemId);
    if (!removed) return fail("NOT_FOUND", "Checklist öğesi bulunamadı");
    await addActivity(ctx.tenantId, v.data.taskId, ctx.userId, "checklist_removed", "Checklist öğesi kaldırıldı");
    audit(ctx, "task.checklist.archive", "Task", v.data.taskId, { itemId: v.data.itemId });
    return ok({ itemId: v.data.itemId });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "archiveTaskChecklistItem failed");
  }
}

export async function addTaskCommentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ commentId: string }>> {
  const auth = requireRole(ctx, TASK_VIEW_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(addTaskCommentSchema, input);
  if (!v.ok) return v;

  const access = await assertTaskWriteAccess(ctx, v.data.taskId);
  if (!access.ok) return access;

  try {
    const comment = await addComment(ctx.tenantId, v.data.taskId, ctx.userId, v.data.body);
    await addActivity(ctx.tenantId, v.data.taskId, ctx.userId, "comment_added", "Yorum eklendi");
    audit(ctx, "task.comment.add", "Task", v.data.taskId, { commentId: comment.id });
    return ok({ commentId: comment.id });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "addTaskComment failed");
  }
}

/** Yorum sahibi kendi yorumunu, admin herhangi bir yorumu (moderasyon) düzenleyebilir/silebilir. */
function canModifyComment(comment: { authorId: string }, ctx: ServiceContext): boolean {
  return isTaskAdminRole(ctx.role) || actorTaskIdentities(ctx).includes(comment.authorId);
}

export async function updateTaskCommentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ commentId: string }>> {
  const auth = requireRole(ctx, TASK_VIEW_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(updateTaskCommentSchema, input);
  if (!v.ok) return v;

  const access = await assertTaskWriteAccess(ctx, v.data.taskId);
  if (!access.ok) return access;

  try {
    const existing = await getCommentById(ctx.tenantId, v.data.commentId);
    if (!existing || existing.taskId !== v.data.taskId || existing.deletedAt) {
      return fail("NOT_FOUND", "Yorum bulunamadı");
    }
    if (!canModifyComment(existing, ctx)) {
      return fail("FORBIDDEN", "Yalnızca kendi yorumunuzu düzenleyebilirsiniz.");
    }
    const updated = await updateComment(ctx.tenantId, v.data.commentId, v.data.body);
    if (!updated) return fail("NOT_FOUND", "Yorum bulunamadı");
    await addActivity(ctx.tenantId, v.data.taskId, ctx.userId, "comment_updated", "Yorum düzenlendi");
    audit(ctx, "task.comment.update", "Task", v.data.taskId, { commentId: v.data.commentId });
    return ok({ commentId: updated.id });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "updateTaskComment failed");
  }
}

/** Soft delete — hard delete yok (modül gereksinimi). */
export async function deleteTaskCommentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ commentId: string }>> {
  const auth = requireRole(ctx, TASK_VIEW_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(deleteTaskCommentSchema, input);
  if (!v.ok) return v;

  const access = await assertTaskWriteAccess(ctx, v.data.taskId);
  if (!access.ok) return access;

  try {
    const existing = await getCommentById(ctx.tenantId, v.data.commentId);
    if (!existing || existing.taskId !== v.data.taskId || existing.deletedAt) {
      return fail("NOT_FOUND", "Yorum bulunamadı");
    }
    if (!canModifyComment(existing, ctx)) {
      return fail("FORBIDDEN", "Yalnızca kendi yorumunuzu kaldırabilirsiniz.");
    }
    const removed = await softDeleteComment(ctx.tenantId, v.data.commentId);
    if (!removed) return fail("NOT_FOUND", "Yorum bulunamadı");
    await addActivity(ctx.tenantId, v.data.taskId, ctx.userId, "comment_updated", "Yorum kaldırıldı");
    audit(ctx, "task.comment.delete", "Task", v.data.taskId, { commentId: v.data.commentId });
    return ok({ commentId: v.data.commentId });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "deleteTaskComment failed");
  }
}

// ─── Ekler (İş Takip Faz 3B-2A — güvenli dosya/link eki) ────────────────

/**
 * Sabit, testli allowlist — yeni bir depolama sağlayıcısı YOK, mevcut
 * base64-in-DB desenini (TeachingMaterial/HomeworkSubmission) kullanır.
 * Uzantı + MIME ikisi birden kontrol edilir (savunma katmanı — biri
 * yanıltılsa bile diğeri yakalar).
 */
const TASK_ATTACHMENT_ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-m4a",
  "video/mp4",
  "video/quicktime",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);
const TASK_ATTACHMENT_DISALLOWED_EXT =
  /\.(exe|sh|bat|cmd|com|msi|dll|js|mjs|cjs|html?|svg|php\d?|jar|apk|ps1|vbs|scr|jsp)$/i;
const TASK_ATTACHMENT_MAX_BYTES = 2_000_000;

function validateTaskFileAttachmentPayload(input: {
  fileName: string;
  fileMimeType: string;
  fileData: string;
}): { ok: true; byteLength: number } | { ok: false; message: string } {
  if (TASK_ATTACHMENT_DISALLOWED_EXT.test(input.fileName)) {
    return { ok: false, message: "Bu dosya türüne izin verilmiyor." };
  }
  if (!TASK_ATTACHMENT_ALLOWED_MIME.has(input.fileMimeType)) {
    return { ok: false, message: "Desteklenmeyen dosya türü." };
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(input.fileData, "base64");
  } catch {
    return { ok: false, message: "Dosya verisi okunamadı." };
  }
  const byteLength = buffer.length;
  if (byteLength <= 0) return { ok: false, message: "Boş dosya yüklenemez." };
  if (byteLength > TASK_ATTACHMENT_MAX_BYTES) return { ok: false, message: "Dosya çok büyük (maks. 2MB)." };
  if (!checkFileMagicBytes(buffer, input.fileMimeType)) {
    return { ok: false, message: "Dosya içeriği beyan edilen türle uyuşmuyor." };
  }
  return { ok: true, byteLength };
}

/** http/https dışı şema (javascript:/data:/file: vb.) ve private/loopback ağ adresleri reddedilir. */
const TASK_ATTACHMENT_PRIVATE_HOST = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/,
  /^0\./,
];

function validateTaskLinkAttachmentUrl(raw: string): { ok: true; url: string } | { ok: false; message: string } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, message: "Geçersiz bağlantı." };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, message: "Yalnızca http/https bağlantılara izin verilir." };
  }
  const host = u.hostname.toLowerCase();
  if (TASK_ATTACHMENT_PRIVATE_HOST.some((p) => p.test(host))) {
    return { ok: false, message: "İç ağ adreslerine bağlantı eklenemez." };
  }
  return { ok: true, url: u.toString() };
}

export async function addTaskFileAttachmentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ attachmentId: string }>> {
  const auth = requireRole(ctx, TASK_VIEW_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(addTaskFileAttachmentSchema, input);
  if (!v.ok) return v;

  const access = await assertTaskWriteAccess(ctx, v.data.taskId);
  if (!access.ok) return access;

  const fileCheck = validateTaskFileAttachmentPayload(v.data);
  if (!fileCheck.ok) return fail("VALIDATION_ERROR", fileCheck.message);

  try {
    const attachment = await addFileAttachment({
      tenantId: ctx.tenantId,
      taskId: v.data.taskId,
      createdById: ctx.userId,
      title: v.data.title,
      fileName: v.data.fileName,
      fileMimeType: v.data.fileMimeType,
      fileData: v.data.fileData,
      fileSize: fileCheck.byteLength,
    });
    await addActivity(ctx.tenantId, v.data.taskId, ctx.userId, "attachment_added", `Dosya eklendi: "${v.data.title}"`);
    audit(ctx, "task.attachment.add", "Task", v.data.taskId, { attachmentId: attachment.id, type: "FILE" });
    return ok({ attachmentId: attachment.id });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "addTaskFileAttachment failed");
  }
}

export async function addTaskLinkAttachmentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ attachmentId: string }>> {
  const auth = requireRole(ctx, TASK_VIEW_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(addTaskLinkAttachmentSchema, input);
  if (!v.ok) return v;

  const access = await assertTaskWriteAccess(ctx, v.data.taskId);
  if (!access.ok) return access;

  const urlCheck = validateTaskLinkAttachmentUrl(v.data.url);
  if (!urlCheck.ok) return fail("VALIDATION_ERROR", urlCheck.message);

  try {
    const attachment = await addLinkAttachment({
      tenantId: ctx.tenantId,
      taskId: v.data.taskId,
      createdById: ctx.userId,
      title: v.data.title,
      url: urlCheck.url,
    });
    await addActivity(ctx.tenantId, v.data.taskId, ctx.userId, "attachment_added", `Bağlantı eklendi: "${v.data.title}"`);
    audit(ctx, "task.attachment.add", "Task", v.data.taskId, { attachmentId: attachment.id, type: "LINK" });
    return ok({ attachmentId: attachment.id });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "addTaskLinkAttachment failed");
  }
}

/** Ekleyen kişi veya admin kaldırabilir — yorum silme yetkisiyle AYNI desen. */
function canModifyAttachment(attachment: { createdById: string }, ctx: ServiceContext): boolean {
  return isTaskAdminRole(ctx.role) || actorTaskIdentities(ctx).includes(attachment.createdById);
}

/** Soft delete — hard delete yok (yorum deseniyle aynı). */
export async function deleteTaskAttachmentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ attachmentId: string }>> {
  const auth = requireRole(ctx, TASK_VIEW_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(deleteTaskAttachmentSchema, input);
  if (!v.ok) return v;

  const access = await assertTaskWriteAccess(ctx, v.data.taskId);
  if (!access.ok) return access;

  try {
    const existing = await getAttachmentById(ctx.tenantId, v.data.attachmentId);
    if (!existing || existing.taskId !== v.data.taskId || existing.deletedAt) {
      return fail("NOT_FOUND", "Ek bulunamadı");
    }
    if (!canModifyAttachment(existing, ctx)) {
      return fail("FORBIDDEN", "Yalnızca kendi eklediğiniz eki kaldırabilirsiniz.");
    }
    const removed = await softDeleteAttachment(ctx.tenantId, v.data.attachmentId);
    if (!removed) return fail("NOT_FOUND", "Ek bulunamadı");
    await addActivity(ctx.tenantId, v.data.taskId, ctx.userId, "attachment_removed", `Ek kaldırıldı: "${existing.title}"`);
    audit(ctx, "task.attachment.delete", "Task", v.data.taskId, { attachmentId: v.data.attachmentId });
    return ok({ attachmentId: v.data.attachmentId });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "deleteTaskAttachment failed");
  }
}

/**
 * Dosya indirme rotası için — yalnızca görev erişimi (assertTaskViewAccess:
 * admin VEYA sorumlu/takipçi TEACHER, aynı tenant) geçen çağrılar `fileData`yı
 * görür; ASLA tahmin edilebilir/herkese açık bir URL üzerinden değil.
 */
export async function getTaskAttachmentFileTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ fileName?: string; fileMimeType?: string; fileData?: string }>> {
  const auth = requireRole(ctx, TASK_VIEW_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(z.object({ attachmentId: z.string().min(1) }), input);
  if (!v.ok) return v;

  const attachment = await getAttachmentById(ctx.tenantId, v.data.attachmentId);
  if (!attachment || attachment.deletedAt) return fail("NOT_FOUND", "Ek bulunamadı");

  const access = await assertTaskViewAccess(ctx, attachment.taskId);
  if (!access.ok) return access;

  if (attachment.type !== "FILE" || !attachment.fileData) return fail("NOT_FOUND", "Bu ekte dosya yok");
  return ok({
    fileName: attachment.fileName,
    fileMimeType: attachment.fileMimeType,
    fileData: attachment.fileData,
  });
}

/** Demo/Kurulum Merkezi sıfırlaması — resetDemoTool/resetToCleanTemplateTool tarafından çağrılır. */
export async function clearTasksForTenant(tenantId: string): Promise<void> {
  await clearTasks(tenantId);
  await clearTaskReminderLog(tenantId);
  await clearReminderPreferences(tenantId);
}

// ─── İş Takip hatırlatma tercihleri (Faz 3A) — HER ZAMAN yalnızca kendi
// (ctx.userId) tercihi; admin BAŞKASININ tercihini göremez/değiştiremez —
// input'ta bir userId ALINMAZ, sızdırılamaz bir tasarım kararı, RBAC ayrıca
// yazılmasına gerek bırakmaz. Sorumlu atama bildirimi (notifyTaskAssigned)
// bu tercihlerden BAĞIMSIZDIR, etkilenmez.

export async function getTaskReminderPreferenceTool(
  ctx: ServiceContext
): Promise<ServiceResult<{ dueSoonEnabled: boolean; dueTodayEnabled: boolean; overdueEnabled: boolean }>> {
  const auth = requireRole(ctx, TASK_VIEW_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  try {
    const pref = await getReminderPreference(ctx.tenantId, ctx.userId);
    return ok(pref);
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "getTaskReminderPreference failed");
  }
}

export async function updateTaskReminderPreferenceTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ dueSoonEnabled: boolean; dueTodayEnabled: boolean; overdueEnabled: boolean }>> {
  const auth = requireRole(ctx, TASK_VIEW_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(updateTaskReminderPreferenceSchema, input);
  if (!v.ok) return v;
  try {
    const pref = await setReminderPreference(ctx.tenantId, ctx.userId, v.data);
    audit(ctx, "task.reminder_preference.update", "TaskReminderPreference", ctx.userId, { ...v.data });
    return ok(pref);
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "updateTaskReminderPreference failed");
  }
}

// ─── Yönetici bildirim tercihleri (İş 4) — her zaman yalnız ctx.userId ───

export async function getNotificationPreferencesTool(
  ctx: ServiceContext
): Promise<
  ServiceResult<{
    preferences: Array<{ category: string; inAppEnabled: boolean; pushEnabled: boolean }>;
  }>
> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER", "STUDENT"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  try {
    const { getNotificationPreferences } = await import("../notification-preferences");
    const preferences = await getNotificationPreferences(ctx.tenantId, ctx.userId);
    return ok({ preferences });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "getNotificationPreferences failed");
  }
}

export async function setNotificationPreferencesTool(
  ctx: ServiceContext,
  input: unknown
): Promise<
  ServiceResult<{
    preferences: Array<{ category: string; inAppEnabled: boolean; pushEnabled: boolean }>;
  }>
> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER", "STUDENT"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(setNotificationPreferencesSchema, input);
  if (!v.ok) return v;
  try {
    const { isNotificationCategory, getCategoryDef } = await import("../notification-categories");
    const { setNotificationPreferences, getNotificationPreferences } = await import(
      "../notification-preferences"
    );
    const updates = [];
    for (const u of v.data.updates) {
      if (!isNotificationCategory(u.category)) {
        return fail("VALIDATION_ERROR", `Bilinmeyen bildirim kategorisi: ${u.category}`);
      }
      const def = getCategoryDef(u.category);
      if (!def?.implemented) {
        return fail("VALIDATION_ERROR", `"${def?.label ?? u.category}" henüz etkin değil; tercih değiştirilemez.`);
      }
      if (def.criticalLocked && !u.inAppEnabled) {
        return fail("VALIDATION_ERROR", `"${def.label}" kapatılamaz.`);
      }
      updates.push({ category: u.category, inAppEnabled: u.inAppEnabled, pushEnabled: false as const });
    }
    await setNotificationPreferences(ctx.tenantId, ctx.userId, updates);
    audit(ctx, "notification.preference.update", "NotificationPreference", ctx.userId, {
      count: updates.length,
    });
    const preferences = await getNotificationPreferences(ctx.tenantId, ctx.userId);
    return ok({ preferences });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "setNotificationPreferences failed");
  }
}

export async function resetNotificationPreferencesTool(
  ctx: ServiceContext
): Promise<
  ServiceResult<{
    preferences: Array<{ category: string; inAppEnabled: boolean; pushEnabled: boolean }>;
  }>
> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER", "STUDENT"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  try {
    const { resetNotificationPreferences, getNotificationPreferences } = await import(
      "../notification-preferences"
    );
    await resetNotificationPreferences(ctx.tenantId, ctx.userId);
    audit(ctx, "notification.preference.reset", "NotificationPreference", ctx.userId, {});
    const preferences = await getNotificationPreferences(ctx.tenantId, ctx.userId);
    return ok({ preferences });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "resetNotificationPreferences failed");
  }
}

// ─── Profil fotoğrafı (öğrenci/öğretmen/kullanıcı) ──────────────────────
// Ana Student/Teacher tablolarından AYRI bir depo (bkz. src/lib/profile-photos.ts)
// — DocumentInstance/Homework ile aynı base64-in-DB mimarisi, yeni bir blob/S3
// bağımlılığı yok. Erişim kuralları: yönetme (yükle/sil) yalnızca sahibinin
// KENDİSİ veya admin; görüntüleme (serve route) `assertStudentAccess`/
// `canAccessTeacher` ile AYNI, zaten var olan kurallar (öğretmen yalnızca
// kendi öğrencisi, veli yalnızca kendi çocuğu, admin herkes). "student"
// ownerType için YÖNETME yetkisi Karma Öğrenci Portalı'nın
// StudentPortalAccess.accessType'ı üzerinden SELF'e daraltılır — eski PARENT
// rolü artık yok, `ctx.studentId` JWT alanı GUARDIAN/SELF ayrımını taşımaz
// (bkz. src/lib/services/context.ts canAccessStudent yorumu), bu yüzden
// `ctx.studentId === ownerId` TEK BAŞINA yeterli değildir — bir veli hesabı
// da aynı studentId claim'ini taşıyabilir. `getActiveAccessType` tek gerçek
// kaynaktır (bkz. src/app/ogrenci/layout.tsx AYNI desen).

async function resolvePhotoOwnerRecord(
  ctx: ServiceContext,
  ownerType: ProfilePhotoOwnerType,
  ownerId: string
): Promise<{ ok: true } | { ok: false; code: ServiceErrorCode; message: string }> {
  if (ownerType === "user") {
    // Kendi User.id'si dışında bir "user" fotoğrafını görüntüleme/yönetme senaryosu yok
    // (veli/admin kendi fotoğrafı) — admin bypass'ı canManagePhoto'da zaten var.
    if (ctx.userId === ownerId) return { ok: true };
    if (ctx.role === "SUPER_ADMIN" || ctx.role === "SCHOOL_ADMIN") {
      const target = await getUserById(ownerId);
      if (!target || target.tenantId !== ctx.tenantId) return { ok: false, code: "NOT_FOUND", message: "Kullanıcı bulunamadı" };
      return { ok: true };
    }
    return { ok: false, code: "FORBIDDEN", message: "Bu kullanıcıya erişiminiz yok" };
  }
  const data = await readReferenceData();
  if (ownerType === "student") {
    const student = data.students.find((s) => s.id === ownerId);
    const access = await assertStudentAccess(ctx, student, ownerId);
    if (!access.ok) return access;
    return { ok: true };
  }
  const teacher = data.teachers.find((t) => t.id === ownerId);
  if (!teacher) return { ok: false, code: "NOT_FOUND", message: "Öğretmen bulunamadı" };
  if (!canAccessTeacher(ctx, ownerId)) return { ok: false, code: "FORBIDDEN", message: "Bu öğretmene erişiminiz yok" };
  return { ok: true };
}

/**
 * Yönetme (yükle/sil) yetkisi — GÖRÜNTÜLEME'den daha DAR: yalnızca sahibinin
 * kendisi veya admin. Öğretmen kendi öğrencisinin fotoğrafını YÖNETEMEZ
 * (yalnızca görüntüler). "student" için SELF şartı — bkz. üstteki modül notu:
 * bir veli (GUARDIAN) asla kendi hesap menüsünden çocuğunun Student kaydına
 * bağlı fotoğrafı sessizce değiştiremez, yalnızca KENDİ "user" fotoğrafını
 * yönetebilir.
 */
async function canManagePhoto(ctx: ServiceContext, ownerType: ProfilePhotoOwnerType, ownerId: string): Promise<boolean> {
  if (ctx.role === "SUPER_ADMIN" || ctx.role === "SCHOOL_ADMIN") return true;
  if (ownerType === "student") {
    if (ctx.role !== "STUDENT") return false;
    return (await getActiveAccessType(ctx.tenantId, ctx.userId, ownerId)) === "SELF";
  }
  if (ownerType === "user") return ctx.userId === ownerId;
  return ctx.role === "TEACHER" && ctx.teacherId === ownerId;
}

function photoAuditEntityType(ownerType: ProfilePhotoOwnerType): string {
  if (ownerType === "student") return "Student";
  if (ownerType === "teacher") return "Teacher";
  return "User";
}

export async function uploadProfilePhotoTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ updatedAt: string }>> {
  const v = parseOrFail(uploadProfilePhotoSchema, input);
  if (!v.ok) return v;

  if (!(await canManagePhoto(ctx, v.data.ownerType, v.data.ownerId))) {
    return fail("FORBIDDEN", "Yalnızca kendi profil fotoğrafınızı yönetebilirsiniz.");
  }
  const ownerCheck = await resolvePhotoOwnerRecord(ctx, v.data.ownerType, v.data.ownerId);
  if (!ownerCheck.ok) return fail(ownerCheck.code, ownerCheck.message);

  const validation = validateProfilePhoto({ fileMimeType: v.data.fileMimeType, fileData: v.data.fileData });
  if (!validation.ok) return fail("VALIDATION_ERROR", validation.message);

  try {
    const fileSize = Buffer.from(v.data.fileData, "base64").length;
    const photo = await upsertProfilePhoto({
      tenantId: ctx.tenantId,
      ownerType: v.data.ownerType,
      ownerId: v.data.ownerId,
      fileMimeType: v.data.fileMimeType,
      fileData: v.data.fileData,
      fileSize,
      uploadedBy: ctx.userId,
    });
    audit(ctx, "profilePhoto.upload", photoAuditEntityType(v.data.ownerType), v.data.ownerId, { fileSize });
    return ok({ updatedAt: photo.updatedAt });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "uploadProfilePhoto failed");
  }
}

export async function deleteProfilePhotoTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<null>> {
  const v = parseOrFail(deleteProfilePhotoSchema, input);
  if (!v.ok) return v;

  if (!(await canManagePhoto(ctx, v.data.ownerType, v.data.ownerId))) {
    return fail("FORBIDDEN", "Yalnızca kendi profil fotoğrafınızı yönetebilirsiniz.");
  }
  const ownerCheck = await resolvePhotoOwnerRecord(ctx, v.data.ownerType, v.data.ownerId);
  if (!ownerCheck.ok) return fail(ownerCheck.code, ownerCheck.message);

  try {
    await deleteProfilePhotoRow(ctx.tenantId, v.data.ownerType, v.data.ownerId);
    audit(ctx, "profilePhoto.delete", photoAuditEntityType(v.data.ownerType), v.data.ownerId, {});
    return ok(null);
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "deleteProfilePhoto failed");
  }
}

/** Serve route'u tarafından çağrılır — ham baytları döner, YALNIZCA görüntüleme yetkisi kontrolü (yönetme değil). */
export async function getProfilePhotoTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ fileMimeType: string; fileData: string } | null>> {
  const v = parseOrFail(z.object({ ownerType: z.enum(["student", "teacher", "user"]), ownerId: z.string().min(1) }), input);
  if (!v.ok) return v;

  const ownerCheck = await resolvePhotoOwnerRecord(ctx, v.data.ownerType, v.data.ownerId);
  if (!ownerCheck.ok) return fail(ownerCheck.code, ownerCheck.message);

  try {
    const photo = await getProfilePhoto(ctx.tenantId, v.data.ownerType, v.data.ownerId);
    if (!photo) return ok(null);
    return ok({ fileMimeType: photo.fileMimeType, fileData: photo.fileData });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "getProfilePhoto failed");
  }
}

/** Liste ekranları için toplu "fotoğrafı var mı" — ham baytları YÜKLEMEZ (bkz. listProfilePhotoMeta). */
export async function listProfilePhotoMetaTool(
  ctx: ServiceContext,
  ownerType: ProfilePhotoOwnerType,
  ownerIds: string[]
): Promise<Map<string, string>> {
  const meta = await listProfilePhotoMeta(ctx.tenantId, ownerType, ownerIds);
  const result = new Map<string, string>();
  for (const [ownerId, m] of meta) result.set(ownerId, m.updatedAt);
  return result;
}

/**
 * P0-2C — Yönetici Yoklama Raporu. Yalnız SCHOOL_ADMIN/SUPER_ADMIN erişebilir
 * (öğretmen/öğrenci/veli göremez). Tenant scoping `readData()`'dan miras —
 * bu fonksiyon başka hiçbir tenant'ın verisini okumaz. Hesaplama TAMAMEN
 * `attendance-report.ts`'teki saf fonksiyonlara devredilir.
 */
/**
 * 9. tur — Öğretmen yoklama raporu (katılım + iptal/telafi kaynağı). Yalnız kurum yöneticileri.
 * Hesap saf `teacher-attendance-report.ts`'de; özet ve detay aynı sınıflandırıcıdan.
 */
export async function getTeacherAttendanceReportTool(
  ctx: ServiceContext,
  input: unknown
): Promise<
  ServiceResult<{
    range: { from: string; to: string };
    rows: Array<import("../teacher-attendance-report").TeacherAttendanceRow & { teacherName: string; teacherActive: boolean }>;
    totals: import("../teacher-attendance-report").TeacherAttendanceRow;
    detail: Array<{
      lessonId: string;
      startAt: string;
      teacherName: string;
      studentName: string;
      branchName?: string;
      categories: import("../teacher-attendance-report").TeacherAttendanceCategory[];
      disruptionNote?: string;
      isMakeupLesson: boolean;
    }>;
  }>
> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(
    z.object({
      datePreset: z.enum(["today", "this_week", "this_month", "custom"]).default("this_month"),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      teacherId: z.string().optional(),
      branchId: z.string().optional(),
      category: z
        .enum(["attended", "absent", "excused", "unmarked", "teacher_source", "institution_source", "student_other_source", "unspecified_source"])
        .optional(),
    }),
    input
  );
  if (!v.ok) return v;
  const { resolveReportDateRange } = await import("../attendance-report");
  let range: { from: string; to: string };
  try {
    range = resolveReportDateRange(v.data.datePreset, v.data.from && v.data.to ? { from: v.data.from, to: v.data.to } : undefined);
  } catch (e) {
    return fail("VALIDATION_ERROR", e instanceof Error ? e.message : "Tarih aralığı geçersiz.");
  }
  const { buildTeacherAttendanceReport, teacherAttendanceDetail, lessonTeacherCategories } = await import(
    "../teacher-attendance-report"
  );
  const data = await readData();
  const filters = { ...range, branchId: v.data.branchId, teacherId: v.data.teacherId };
  const now = new Date();
  const report = buildTeacherAttendanceReport(data.lessons, filters, now);
  const teacherById = new Map(data.teachers.map((t) => [t.id, t]));
  const studentById = new Map(data.students.map((s) => [s.id, s]));
  const branchName = (id: string) => data.settings.branches.find((b) => b.id === id)?.shortName;
  const detail = v.data.category || v.data.teacherId
    ? teacherAttendanceDetail(data.lessons, filters, v.data.category, now).map((l) => ({
        lessonId: l.id,
        startAt: l.startAt,
        teacherName: teacherById.get(l.teacherId)?.name ?? "Öğretmen bulunamadı",
        studentName: studentById.get(l.studentId)?.name ?? "Öğrenci bulunamadı",
        branchName: branchName(l.branchId),
        categories: lessonTeacherCategories(l, now),
        disruptionNote: l.disruptionNote,
        isMakeupLesson: l.type === "makeup",
      }))
    : [];
  return ok({
    range,
    rows: report.rows
      .map((r) => ({
        ...r,
        teacherName: teacherById.get(r.teacherId)?.name ?? "Öğretmen bulunamadı",
        teacherActive: teacherById.get(r.teacherId)?.active !== false,
      }))
      .sort((a, b) => a.teacherName.localeCompare(b.teacherName, "tr")),
    totals: report.totals,
    detail,
  });
}

export async function getAttendanceReportTool(
  ctx: ServiceContext,
  input: unknown
): Promise<
  ServiceResult<{
    range: { from: string; to: string };
    summary: import("../attendance-report").AttendanceReportSummary;
    rows: Array<
      import("../attendance-report").AttendanceReportRow & {
        studentName: string;
        teacherName: string;
        branchName?: string;
        roomName?: string;
      }
    >;
    total: number;
    page: number;
    pageSize: number;
  }>
> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(
    z.object({
      datePreset: z.enum(["today", "this_week", "this_month", "custom"]).default("this_month"),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      studentId: z.string().optional(),
      teacherId: z.string().optional(),
      branchId: z.string().optional(),
      instrument: z.string().optional(),
      roomId: z.string().optional(),
      status: z.enum(["attended", "processed", "makeup", "makeup_planned", "cancelled", "planned"]).optional(),
      // 11. tur iş #4 — sunucu taraflı sayfalama. Özet (summary) TÜM
      // filtrelenmiş satırlar üzerinden hesaplanır; yalnız `rows` dilimlenir.
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(200).default(50),
    }),
    input
  );
  if (!v.ok) return v;

  const { resolveReportDateRange, buildAttendanceReport } = await import("../attendance-report");

  let range: { from: string; to: string };
  try {
    range = resolveReportDateRange(
      v.data.datePreset,
      v.data.datePreset === "custom" ? { from: v.data.from ?? "", to: v.data.to ?? "" } : undefined
    );
  } catch (e) {
    return fail("VALIDATION_ERROR", e instanceof Error ? e.message : "Geçersiz tarih aralığı");
  }

  const data = await readData();
  const { rows, summary } = buildAttendanceReport(data.lessons, data.makeupRequests, {
    from: range.from,
    to: range.to,
    studentId: v.data.studentId,
    teacherId: v.data.teacherId,
    branchId: v.data.branchId,
    instrument: v.data.instrument,
    roomId: v.data.roomId,
    status: v.data.status,
  });

  const studentById = new Map(data.students.map((s) => [s.id, s]));
  const teacherById = new Map(data.teachers.map((t) => [t.id, t]));
  const roomById = new Map(data.rooms.map((r) => [r.id, r]));
  const branchById = new Map(data.settings.branches.map((b) => [b.id, b]));

  const enrichedRows = rows.map((r) => ({
    ...r,
    studentName: studentById.get(r.studentId)?.name ?? "Bilinmeyen öğrenci",
    teacherName: teacherById.get(r.teacherId)?.name ?? "Bilinmeyen öğretmen",
    branchName: branchById.get(r.branchId)?.name,
    roomName: roomById.get(r.roomId)?.name,
  }));

  // 11. tur iş #4 — sayfa aralığa kırpılır; özet dilimden ETKİLENMEZ.
  const total = enrichedRows.length;
  const totalPages = Math.max(1, Math.ceil(total / v.data.pageSize));
  const page = Math.min(v.data.page, totalPages);
  const start = (page - 1) * v.data.pageSize;
  return ok({
    range,
    summary,
    rows: enrichedRows.slice(start, start + v.data.pageSize),
    total,
    page,
    pageSize: v.data.pageSize,
  });
}

/**
 * P0-1C (2026-09-02 düzeltme) — Ödeme simülasyonu. Var olan bir öğrenci
 * (`studentId`, gerçek ders kayıtları varsa onları kullanır) VEYA kayıt-
 * öncesi "ne olurdu" keşfi (ham `enrollmentStartDate`/`weeklyLessonCount`/
 * `monthlyFee`) kabul eder — ders başı karşılık HER İKİ yolda da yalnız
 * `derivePerLessonAmount(monthlyFee, weeklyLessonCount)` ile sunucuda
 * türetilir, client bunu ASLA doğrudan göndermez. İkisi de TEK motordan
 * (`period-lesson-billing.ts`) geçer, sözleşme tablosuyla (bkz.
 * `buildPerLessonInstallmentSchedule`, `contracts.ts`) aynı
 * `autoCalculatedAmount` değerlerini üretir. Yalnız OKUR, hiçbir kayıt
 * yazmaz/değiştirmez.
 */
export async function previewPeriodBillingSimulationTool(
  ctx: ServiceContext,
  input: unknown
): Promise<
  ServiceResult<{
    lines: Array<
      import("../period-lesson-billing").PeriodBillingLine & {
        dueDate: string;
        /** Bu dönem için FİİLEN kullanılan tutar — manuel düzeltme yoksa `autoCalculatedAmount` ile aynı. */
        netAmount: number;
        /** Yalnız ilk dönemde ve yalnız manuel net ≠ otomatik tutarsa dolu (netAmount - autoCalculatedAmount). */
        manualAdjustmentDelta?: number;
        cumulativeTotal: number;
      }
    >;
    grandTotal: number;
    firstPeriodManualNetAmount?: number;
  }>
> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "AI_AGENT"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(
    z.object({
      studentId: z.string().optional(),
      enrollmentStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      enrollmentEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      weeklyLessonCount: z.number().int().min(1).max(2).optional(),
      // P0-1 (2026-09-02 düzeltme) — ders başı ücret client'tan ASLA
      // alınmaz; yalnız `monthlyFee` girilebilir, ders başı karşılığı
      // sunucuda `derivePerLessonAmount`den türetilir (bkz. studentId
      // verilmediği "kayıt öncesi ne olurdu" senaryosu).
      monthlyFee: z.number().int().min(0).optional(),
      firstPeriodManualNetAmount: z.number().int().min(0).optional(),
      paymentMethod: z.enum(["credit_card", "cash", "transfer"]).optional(),
    }),
    input
  );
  if (!v.ok) return v;

  const { computePeriodBillingPreview, resolveLessonStartDay } = await import("../period-lesson-billing");
  const data = await readData();

  let enrollmentStartDay = v.data.enrollmentStartDate;
  let enrollmentEndDay = v.data.enrollmentEndDate;
  let weeklyLessonCount = v.data.weeklyLessonCount;
  let monthlyFee = v.data.monthlyFee;
  let studentId = v.data.studentId ?? "__simulation__";

  if (v.data.studentId) {
    const student = data.students.find((s) => s.id === v.data.studentId);
    if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı");
    studentId = student.id;
    // Ücret hesabı DERS başlangıcından (kayıt tarihi yalnız kayıt/denetim bilgisi) — tek kural.
    enrollmentStartDay =
      enrollmentStartDay ||
      resolveLessonStartDay({
        lessonStartDate: student.lessonStartDate,
        enrollmentStartDate: student.enrollmentStartDate,
        fallbackToday: toZonedYmd(new Date(), resolveAppTimezone()),
      });
    enrollmentEndDay = enrollmentEndDay || student.enrollmentEndDate || enrollmentStartDay;
    weeklyLessonCount = weeklyLessonCount ?? student.weeklyLessonCount;
    monthlyFee = monthlyFee ?? student.monthlyFee;
  }

  if (!enrollmentStartDay || !enrollmentEndDay || !weeklyLessonCount || monthlyFee === undefined) {
    return fail(
      "VALIDATION_ERROR",
      "Simülasyon için enrollmentStartDate/enrollmentEndDate/weeklyLessonCount/monthlyFee (veya bir studentId) gerekir."
    );
  }
  const lines = computePeriodBillingPreview({
    enrollmentStartDay,
    enrollmentEndDay,
    // TEK kaynak — ders başı karşılık motorun İÇİNDE türetilir (yalnız
    // gösterim için); tutarlar onaylı aylık ücretten oranlanır.
    monthlyFee,
    weeklyLessonCount,
    studentId,
    lessons: data.lessons.map((l) => ({
      id: l.id,
      studentId: l.studentId,
      startAt: l.startAt,
      type: l.type,
      status: l.status,
      opsClosedFlag: l.opsClosedFlag,
    })),
    makeupRequests: data.makeupRequests.map((m) => ({ sourceLessonId: m.sourceLessonId, status: m.status })),
  });

  const { resolveContractPaymentDueRule } = await import("../contracts");
  const rule = resolveContractPaymentDueRule(v.data.paymentMethod);
  let cumulativeTotal = 0;
  const enrichedLines = lines.map((line, i) => {
    const hasFirstPeriodOverride = i === 0 && v.data.firstPeriodManualNetAmount !== undefined;
    // P0-B — bu `netAmount` ÖNCEDEN yalnız `cumulativeTotal`ı doğru
    // toplamak için kullanılan bir yerel değişkendi, dönen satıra HİÇ
    // yazılmıyordu: istemci `autoCalculatedAmount`ı (her zaman otomatik
    // 2000 gibi) "fiili tahsilat" sanıp yanlış gösterebiliyor, manuel
    // düzeltmeyi (-200) AYRI bir kalem olarak göstermenin hiçbir yolu
    // yoktu. Artık ilk dönem için otomatik/manuel-fark/net üç ayrı alan
    // olarak dönüyor — negatif/float yok, tüm aritmetik tam sayı TL.
    const netAmount = hasFirstPeriodOverride ? v.data.firstPeriodManualNetAmount! : line.autoCalculatedAmount;
    cumulativeTotal += netAmount;
    return {
      ...line,
      dueDate: i === 0 ? enrollmentStartDay! : `${line.periodStart.slice(0, 7)}-${String(rule.windowEndDay).padStart(2, "0")}`,
      netAmount,
      manualAdjustmentDelta: hasFirstPeriodOverride ? netAmount - line.autoCalculatedAmount : undefined,
      cumulativeTotal,
    };
  });

  return ok({
    lines: enrichedLines,
    grandTotal: cumulativeTotal,
    firstPeriodManualNetAmount: v.data.firstPeriodManualNetAmount,
  });
}

export const TOOL_CATALOG = [
  { name: "markAttendance", description: "Mark lesson attendance; may create makeup credit" },
  { name: "findAvailableSlots", description: "Suggest makeup slots for a request" },
  { name: "confirmMakeupLesson", description: "Confirm a makeup slot and schedule lesson" },
  { name: "createMakeupLesson", description: "Create makeup credit from absence/cancel" },
  { name: "cancelMakeupLesson", description: "Cancel a makeup request" },
  { name: "findAvailableTeachers", description: "List teachers by instrument/branch" },
  { name: "getStudentSchedule", description: "Get lessons for a student" },
  { name: "getTeacherSchedule", description: "Get lessons for a teacher" },
  { name: "getParentBalance", description: "Get payment balance for a student" },
  { name: "createPayment", description: "Mark a payment as paid" },
  { name: "sendParentMessage", description: "Build WhatsApp message for parent" },
  { name: "sendTeacherMessage", description: "Build WhatsApp message for teacher" },
  { name: "createStudent", description: "Register a student" },
  { name: "createTeacher", description: "Register a teacher" },
  { name: "suggestLessonSlots", description: "Suggest available times for a regular lesson" },
  { name: "updateLessonSchedule", description: "Move or resize a regular lesson" },
  { name: "cancelLesson", description: "Cancel a regular lesson" },
  { name: "previewLessonSeries", description: "Preview a recurring weekly lesson series without writing" },
  { name: "createLessonSeries", description: "Create a recurring weekly lesson series" },
  { name: "cancelSeriesFromLesson", description: "Cancel a series from a given lesson onward" },
  { name: "cancelEntireSeries", description: "Cancel an entire lesson series" },
  { name: "createBranch", description: "Add a new branch" },
  { name: "updateBranch", description: "Edit an existing branch" },
  { name: "previewBranchImport", description: "Validate a branches CSV without writing" },
  { name: "commitBranchImport", description: "Import branches from CSV" },
  { name: "previewTeacherImport", description: "Validate a teachers CSV without writing" },
  { name: "commitTeacherImport", description: "Import teachers from CSV" },
  { name: "previewRoomImport", description: "Validate a rooms CSV without writing" },
  { name: "commitRoomImport", description: "Import rooms from CSV" },
  { name: "previewStudentImport", description: "Validate a students CSV without writing" },
  { name: "commitStudentImport", description: "Import students from CSV" },
  { name: "resetDemo", description: "Reset tenant demo data" },
] as const;

// silence unused type imports when tree-shaken
export type { Student, Teacher };
