/**
 * AI Tool Layer — single source of business operations.
 * Reuses existing store + makeup-engine + whatsapp templates.
 * Consumable by Web actions, future Mobile API, and AI agents.
 */

import { z } from "zod";
import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import { prisma } from "../db";
import { foldTurkishForSearch } from "../normalize";
import { runWithTenantAsync } from "../tenant-context";
import { checkFileMagicBytes } from "../storage/file-guards";
import { computeStudentScore, type StudentScoreReport } from "../student-score";
import {
  provisionEntityLogin,
  provisionStaffLogin,
  getUserIdByTeacherId,
  getUserIdByEmail,
  getUserIdByEmailIncludingInactive,
  getUserById,
  getUserAccountStatus,
  getUserAccountStatusForTeacher,
  setUserActive,
  setTeacherInvitationPending,
  updatePendingTeacherInvitationEmail,
} from "../auth/users";
import {
  isRateLimited,
  getLatestPasswordResetRequestAt,
  hasActiveInvitationToken,
  hasUnacceptedInvitationToken,
  revokeInvitationTokensForUser,
} from "../auth/password-reset";
import { logger } from "../logger";
import { isLocalDevTooling } from "../config";
import { studentUsesPerLessonBilling } from "../contract-prefill";
import { resolvePerformanceWeights, validateWeightMap, type PerformanceWeightsConfig } from "../performance-weights";
import {
  addBranch,
  addLesson,
  addLessonSeries,
  EnrollmentRequiredError,
  addPayment,
  addRoom,
  updateRoom,
  archiveTeacher,
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
  readPayoutWindow,
  deletePaymentRow,
  readLessonScope,
  readStudentById,
  readLessonById,
  readLessonSeriesForStudent,
  readLessonSeriesByIds,
  readMakeupCenterData,
  readLessonsForTeacher,
  readPaymentsPageData,
  readSlotScopeData,
  readTeacherPayoutsForTeacher,
  readPaymentById,
  readReferenceData,
  readNationalIdCandidates,
  readLessonWindow,
  readStudentScope,
  readSchoolBranding,
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
  setTeacherDeletion,
  loadPurgeSnapshot,
  executePurge,
  setStudentPaymentPause,
  updateTeacherAvailability,
  updateTeacherInstruments,
  updateTeacherProfile,
  readTeacherPortalDetails,
  updateTeacherFeeRule,
  switchLessonOpsFlagLive,
  setLessonAttendanceNoteLive,
  previewMakeupLifecycle,
  applyMakeupLifecycle,
  upsertMonthlyPlanPayment,
  getRegistrationFirstPayment,
  registerStudent,
  changeStudentEnrollments,
  addPackage,
  updatePackage,
  deletePackage,
  addDiscountCampaign,
  updateDiscountCampaign,
} from "../store";
import { normalizePaymentDueRanges, effectivePaymentDueRanges, formatPaymentDueRanges } from "../payment-due-ranges";
import { effectiveStudentTypes } from "../student-types";
import { applyProfilePatchToStudent, mirrorPatchFromEnrollments } from "../student-enrollments";
import {
  coerceEnrollmentDraft,
  draftLabel,
  newEnrollmentKey,
  normalizeEnrollmentDraft,
  resolveEnrollmentPricing,
  suggestFirstCollection,
  summarizeEnrollmentErrors,
  validateEnrollmentDrafts,
} from "../enrollment-form";
import { resolveFirstPaymentAdjustment } from "../first-payment-adjustment";
import { derivePerLessonAmount } from "../period-lesson-billing";
import { isMebStudent, mergeMebForUpdate, validateMebFields } from "../meb";
import { setLessonDisruptionLive } from "../store";
import { computeTeacherPerformanceReport, type TeacherPerformanceReport } from "../teacher-performance";
import { computeTeacherPerformanceReportV2, type TeacherPerformanceReportV2 } from "../teacher-performance-v2";
import {
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
import type { Lesson, WithStudentRefs } from "../types";
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
import { normalizeAttendanceNote, type MakeupLifecycleOp } from "../makeup-lifecycle";
import { resolveLessonFinalStatus, type LessonFinalStatus } from "../lesson-live-status";
import { contractInstallmentProgressDescription, monthlyPlanPeriodLabel, resolveContractPlanForMonth, type CalendarMonthPlan, type CalendarPlanContract } from "../attendance-calendar-plan";
import {
  academicTermMonths,
  isYmdWithinAcademicTerm,
  monthOverlapsAcademicTerm,
  resolveAcademicTermDatesForAnchor,
  validateAcademicTermDates,
} from "../academic-term-dates";
import { canViewFinanceAndStaffSummary, isInstitutionOwner } from "../auth/platform-access";
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
  findPayoutCoveringLesson,
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
import { computeMonthlyFee } from "../packages";
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
import { materialTeacherIdsForStudent, materialVisibleToStudent } from "../teaching-materials-audience";
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
import { paymentTargetHref } from "../notification-href";
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
  studentRegistrationSchema,
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
  STUDENT_TYPES,
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
import { isOwnStudent } from "../teacher-portal-scope";

/** NeviiOS — şube müdürünün öğrenci kaydında değiştirebileceği temel operasyonel alanlar. */
const BRANCH_MANAGER_STUDENT_FIELDS = new Set([
  "enrollmentId",
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
  registrationFirstCollectionPeriods,
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
    const lesson = await readLessonById(lessonId);
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
    const lesson = await readLessonById(v.data.lessonId);
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
    let after: Pick<AppData, "makeupRequests">;
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
/**
 * 2026-10-04 — öğretmen müsaitliği istisnası (yalnız TEACHER_UNAVAILABLE) yalnız kurum yöneticisi, kurum sahibi
 * ve şube müdürü tarafından onaylanabilir. Frontend bayrağı tek başına yetmez: AI ajanı, öğretmen ve
 * öğrenci/veli portalı bu bayrağı gönderse de reddedilir.
 */
function canOverrideTeacherAvailability(ctx: ServiceContext): boolean {
  return ctx.role === "SCHOOL_ADMIN" || ctx.role === "SUPER_ADMIN" || ctx.role === "BRANCH_MANAGER";
}
const AVAILABILITY_OVERRIDE_FORBIDDEN =
  "Öğretmenin müsaitlik dışı saatine planlama istisnasını yalnız kurum yöneticisi, kurum sahibi veya şube müdürü onaylayabilir.";

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
      /** 2026-10-04 — kullanıcı müsaitlik uyarısını AÇIKÇA onayladı (yalnız TEACHER_UNAVAILABLE aşılır). */
      overrideAvailability: z.boolean().optional(),
      overrideReason: z.string().max(500).optional().transform((s) => (s?.trim() ? s.trim() : undefined)),
    }),
    input
  );
  if (!v.ok) return v;
  if (v.data.overrideAvailability && !canOverrideTeacherAvailability(ctx)) {
    return fail("FORBIDDEN", AVAILABILITY_OVERRIDE_FORBIDDEN);
  }

  if (ctx.role === "BRANCH_MANAGER") {
    // DB egress (2026-10-18) — kapı yalnız talebin şubesine ve odalara bakar (tam kurum okuması değil).
    const gateData = await readMakeupCenterData({ lessons: "linked" });
    const req = gateData.makeupRequests.find((m) => m.id === v.data.requestId);
    if (!req) return fail("NOT_FOUND", "Telafi talebi bulunamadı");
    const gate = await assertBranchOperation(ctx, "makeup", "update", req.branchId);
    if (!gate.ok) return gate;
    // 2026-10-04 (güvenlik) — ders, ODANIN şubesine yazılır (validateLessonSlot → room.branchId); istemcinin
    // gönderdiği slot.branchId'ye güvenilmez. Kapı gerçek oda şubesi (ve gönderildiyse slot.branchId) üzerinden.
    const room = gateData.rooms.find((r) => r.id === (v.data.slot as { roomId: string }).roomId);
    if (!room) return fail("NOT_FOUND", "Seçilen oda bulunamadı. Sayfayı yenileyip tekrar deneyin.");
    const branches = new Set([room.branchId, (v.data.slot as { branchId?: string }).branchId].filter((b): b is string => Boolean(b)));
    for (const branchId of branches) {
      const slotGate = await assertBranchOperation(ctx, "makeup", "update", branchId);
      if (!slotGate.ok) return slotGate;
    }
  }

  try {
    await confirmSlot(v.data.requestId, v.data.slot as MakeupSlot, {
      decisionNote: v.data.decisionNote,
      decidedBy: ctx.userId,
      allowAvailabilityOverride: Boolean(v.data.overrideAvailability),
    });
    // DB egress (2026-10-16): yeni telafi dersi, slot gününün ders penceresinden bulunur (tam kurum okuması değil);
    // pencere öğrenci/öğretmen/ayarları da taşır. Bulunamazsa (beklenmez) eski tam okumaya düşer.
    const slotMs = new Date(v.data.slot.startAt).getTime();
    const windowData = await readLessonWindow(
      new Date(slotMs - 86_400_000).toISOString(),
      new Date(slotMs + 86_400_000).toISOString()
    );
    const isNewMakeupLesson = (l: Lesson) =>
      l.makeupRequestId === v.data.requestId && l.status !== "cancelled" && new Date(l.startAt).getTime() === slotMs;
    let data: WithStudentRefs<Pick<AppData, "students" | "teachers" | "settings">> = windowData;
    let lesson = windowData.lessons.find(isNewMakeupLesson);
    if (!lesson) {
      const full = await readData();
      const confirmedId = full.makeupRequests.find((m) => m.id === v.data.requestId)?.confirmedLessonId;
      lesson = confirmedId ? full.lessons.find((l) => l.id === confirmedId) : undefined;
      data = full;
    }
    const req = { confirmedLessonId: lesson?.id };
    audit(ctx, "makeup.confirm", "MakeupRequest", v.data.requestId, {
      lessonId: req?.confirmedLessonId,
      decisionNote: v.data.decisionNote,
    });
    if (lesson?.availabilityOverride) {
      audit(ctx, "makeup.availability_override", "Lesson", lesson.id, {
        makeupRequestId: v.data.requestId,
        teacherId: lesson.teacherId,
        startAt: lesson.startAt,
        endAt: lesson.endAt,
        reason: v.data.overrideReason,
      });
    }
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
    // TEACHER_UNAVAILABLE: yetkili kullanıcıya istisna onayı sorulabilir (details.overridable); diğer kodlar aşılamaz.
    if (e instanceof LessonSlotValidationError) {
      return fail("CONFLICT", e.message, {
        slotValidationCode: e.code,
        overridable: isOverridableSlotCode(e.code) && canOverrideTeacherAvailability(ctx),
      });
    }
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
    const lesson = await readLessonById(v.data.lessonId);
    if (!lesson) return fail("NOT_FOUND", "Ders bulunamadı");
    const gate = await assertBranchOperation(ctx, "makeup", "create", lesson.branchId);
    if (!gate.ok) return gate;
  }

  if (ctx.role === "TEACHER") {
    const lesson = await readLessonById(v.data.lessonId);
    if (!lesson) return fail("NOT_FOUND", "Ders bulunamadı");
    if (!canAccessTeacher(ctx, lesson.teacherId)) {
      return fail("FORBIDDEN", "Yalnızca kendi dersiniz için telafi oluşturabilirsiniz.");
    }
  }

  try {
    // Kota (pending/suggested/awaiting_info/confirmed sayılır) — store da korur.
    // DB egress (2026-10-18): kota yalnız öğrencinin ders/telafi satırlarına bakar → öğrenci dilimi (eskiden 2 tam okuma).
    const lesson = await readLessonById(v.data.lessonId);
    if (!lesson) return fail("NOT_FOUND", "Ders bulunamadı");
    const before = await readStudentScope(lesson.studentId);
    const { assertCanCreateMakeup } = await import("../makeup-quota");
    const quota = assertCanCreateMakeup({ ...before, teacherPayouts: [] }, lesson.studentId, new Date(), lesson.id);
    if (!quota.ok) return fail("VALIDATION_ERROR", quota.message);

    await markAttendance(v.data);
    const req = (await readStudentScope(lesson.studentId)).makeupRequests.find((m) => m.sourceLessonId === v.data.lessonId);
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

function lifecycleFail(code: "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "ACK_REQUIRED", message: string): ServiceFailure {
  if (code === "NOT_FOUND") return fail("NOT_FOUND", message);
  if (code === "VALIDATION") return fail("VALIDATION_ERROR", message);
  return fail("CONFLICT", message);
}

/**
 * Telafi süre uzatma, plan revizyonu, plan silme ve hak iptali.
 * Önizleme yazmaz. Hakedişe etkisi olan geçiş, mevcut ödenmiş-hakediş kapısını kullanır.
 */
async function runMakeupLifecycleTool(
  ctx: ServiceContext,
  op: MakeupLifecycleOp,
  confirm: { paidPayoutConfirm?: boolean; payoutReason?: string; criticalPassword?: string }
): Promise<ServiceResult<{ requestId: string; warning?: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  try {
    return await runWithTenantAsync(ctx.tenantId, async () => {
      const preview = await previewMakeupLifecycle(op);
      if (!preview.ok) return lifecycleFail(preview.code, preview.message);
      const payoutPlan = await planMakeupPayoutFlips(ctx, preview.payoutTouches, confirm);
      if (!payoutPlan.ok) return payoutPlan;
      const moveBlock = await blockPayoutCountedMove(preview.changedLessons, op.kind);
      if (moveBlock) return moveBlock;
      // Önizlemede kapıdan geçen çevrilmeler; uygulamada taze durumda başkası çıkarsa yazılmadan reddedilir.
      const expectedPayoutFlipIds = preview.payoutTouches
        .filter((touch) => isLessonProcessedForPayout(touch.before) !== isLessonProcessedForPayout(touch.after))
        .map((touch) => touch.before.id);
      const applied = await applyMakeupLifecycle({ ...op, expectedPayoutFlipIds });
      if (!applied.ok) return lifecycleFail(applied.code, applied.message);
      const warnings: string[] = [];
      for (const plan of payoutPlan.data) {
        const lessonId = applied.changedLessons.find((row) => row.after.teacherId)?.after.id ?? applied.requestId;
        const warning = await settleOpsChangeForPayout(ctx, plan, lessonId);
        if (warning) warnings.push(warning);
      }
      for (const lesson of applied.notifyCancelled) {
        const { notifyLessonCancelled } = await import("../lesson-notifications");
        await notifyLessonCancelled({
          tenantId: ctx.tenantId,
          lesson,
          actorUserId: ctx.userId,
          reason: op.kind === "cancelRight" ? op.decisionNote : "Planlanan telafi silindi",
        });
      }
      if (applied.rescheduled) {
        const { notifyLessonRescheduled } = await import("../lesson-notifications");
        await notifyLessonRescheduled({
          tenantId: ctx.tenantId,
          lesson: applied.rescheduled.after,
          previousStartAt: applied.rescheduled.before.startAt,
          actorUserId: ctx.userId,
        });
      }
      audit(ctx, `makeup.${op.kind}`, "MakeupRequest", applied.requestId, {
        kind: op.kind,
        correctionNote: "correctionNote" in op ? op.correctionNote : undefined,
      });
      return ok({ requestId: applied.requestId, warning: warnings.join(" ") || undefined });
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Cross-tenant")) {
      return fail("NOT_FOUND", "Telafi talebi bulunamadı. Telafi Merkezi'ni yenileyip kaydın bu kurumda durduğunu kontrol edin.");
    }
    return fail("INTERNAL_ERROR", error instanceof Error ? error.message : "Telafi işlemi tamamlanamadı. Sayfayı yenileyip tekrar deneyin.");
  }
}

export async function extendMakeupDeadlineTool(ctx: ServiceContext, input: unknown) {
  const v = parseOrFail(
    z.object({
      requestId: z.string().min(1),
      lastDayYmd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Son gün yyyy-AA-gg biçiminde olmalı."),
      acknowledgeCorrection: z.boolean().optional(),
      correctionNote: z.string().max(500).optional(),
      ...payoutCorrectionShape,
    }),
    input
  );
  if (!v.ok) return v;
  return runMakeupLifecycleTool(
    ctx,
    {
      kind: "extend",
      requestId: v.data.requestId,
      lastDayYmd: v.data.lastDayYmd,
      actorUserId: ctx.userId,
      now: new Date(),
      acknowledgeCorrection: v.data.acknowledgeCorrection,
      correctionNote: v.data.correctionNote,
    },
    v.data
  );
}

export async function reviseMakeupPlanTool(ctx: ServiceContext, input: unknown) {
  const v = parseOrFail(
    z.object({
      requestId: z.string().min(1),
      teacherId: z.string().min(1),
      roomId: z.string().min(1),
      startAt: z.string().min(1),
      allowAvailabilityOverride: z.boolean().optional(),
      acknowledgeCorrection: z.boolean().optional(),
      correctionNote: z.string().max(500).optional(),
      ...payoutCorrectionShape,
    }),
    input
  );
  if (!v.ok) return v;
  if (v.data.allowAvailabilityOverride && !canOverrideTeacherAvailability(ctx)) {
    return fail("FORBIDDEN", AVAILABILITY_OVERRIDE_FORBIDDEN);
  }
  return runMakeupLifecycleTool(
    ctx,
    {
      kind: "revise",
      requestId: v.data.requestId,
      teacherId: v.data.teacherId,
      roomId: v.data.roomId,
      startAt: v.data.startAt,
      actorUserId: ctx.userId,
      now: new Date(),
      acknowledgeCorrection: v.data.acknowledgeCorrection,
      correctionNote: v.data.correctionNote,
      allowAvailabilityOverride: v.data.allowAvailabilityOverride,
    },
    v.data
  );
}

export async function deleteMakeupPlanTool(ctx: ServiceContext, input: unknown) {
  const v = parseOrFail(
    z.object({
      requestId: z.string().min(1),
      acknowledgeCorrection: z.boolean().optional(),
      correctionNote: z.string().max(500).optional(),
      ...payoutCorrectionShape,
    }),
    input
  );
  if (!v.ok) return v;
  return runMakeupLifecycleTool(
    ctx,
    {
      kind: "deletePlan",
      requestId: v.data.requestId,
      actorUserId: ctx.userId,
      now: new Date(),
      acknowledgeCorrection: v.data.acknowledgeCorrection,
      correctionNote: v.data.correctionNote,
    },
    v.data
  );
}

export async function cancelMakeupRightTool(ctx: ServiceContext, input: unknown) {
  const v = parseOrFail(
    z.object({
      requestId: z.string().min(1),
      decisionNote: z.string().min(1, "Telafi hakkını iptal etmek için gerekçe yazın."),
      alsoCancelPlan: z.boolean().optional(),
      acknowledgeCorrection: z.boolean().optional(),
      correctionNote: z.string().max(500).optional(),
      ...payoutCorrectionShape,
    }),
    input
  );
  if (!v.ok) return v;
  return runMakeupLifecycleTool(
    ctx,
    {
      kind: "cancelRight",
      requestId: v.data.requestId,
      decisionNote: v.data.decisionNote,
      alsoCancelPlan: v.data.alsoCancelPlan,
      actorUserId: ctx.userId,
      now: new Date(),
      acknowledgeCorrection: v.data.acknowledgeCorrection,
      correctionNote: v.data.correctionNote,
    },
    v.data
  );
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
  // DB egress (2026-10-10): yalnız o günün dersleri gerekir (kurum saatinde gün eşleşmesi saf fonksiyonda);
  // tüm ders geçmişi yerine günün ±1–2 günlük penceresi okunur (saat dilimi payı).
  const day = new Date(`${v.data.date}T00:00:00.000Z`);
  const [data, trials] = await Promise.all([
    readLessonWindow(addDays(day, -1).toISOString(), addDays(day, 2).toISOString()),
    listTrialLessons(ctx.tenantId),
  ]);
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

  const data = await readReferenceData(); // yalnız öğretmen listesi (DB egress)
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
): Promise<ServiceResult<{ studentId: string; lessons: unknown[]; total: number; truncated: boolean }>> {
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
      // Penceresiz çağrılar (ev özeti, ders detayı) tüm geçmişi çekmesin:
      // üst sınır + kesilme bayrağı. İstemci dar pencere gönderir.
      limit: z.coerce.number().int().min(1).max(2000).optional(),
    }),
    input
  );
  if (!v.ok) return v;

  // DB egress (2026-10-17) — mobil öğrenci/veli: yalnız bu öğrencinin dilimi (tüm süzgeçler studentId ile).
  const data = await readStudentScope(v.data.studentId);
  const student = data.students.find((s) => s.id === v.data.studentId);
  const access = await assertStudentAccess(ctx, student, v.data.studentId);
  if (!access.ok) return fail(access.code, access.message);

  // Mobil `Lesson.teacherName` gösterim alanını doldurur — ham depo kaydı
  // yalnızca `teacherId` taşır, isim BURADA denormalize edilir (bkz.
  // getTeacherScheduleTool'daki simetrik studentName zenginleştirmesi).
  const teacherNameById = new Map(data.teachers.map((t) => [t.id, t.name]));
  const branchNameById = new Map(
    (data.settings.branches ?? []).map((b) => [b.id, b.shortName ?? b.name])
  );
  const { from, to } = v.data;
  // Kök neden: `from`/`to` ve depodaki `startAt` farklı UTC ofset gösterimleri
  // taşıyabiliyor (mobil istemci her zaman `.toISOString()` ile "Z" gönderirken,
  // JSON store'daki kayıtlar "+03:00" yerel ofsetle saklanıyor) — ham string
  // karşılaştırması (`>=`/`<=`) bu durumda hafta sınırlarına yakın gerçek
  // dersleri yanlışça dışarıda bırakıyordu (örn. haftanın son günü akşam
  // dersleri). Karşılaştırma gerçek zaman damgası (epoch ms) üzerinden yapılmalı.
  const fromTs = from ? new Date(from).getTime() : undefined;
  const toTs = to ? new Date(to).getTime() : undefined;
  const limit = v.data.limit ?? 500;
  const matched = data.lessons
    .filter((l) => l.studentId === v.data.studentId)
    .filter((l) => {
      const startTs = new Date(l.startAt).getTime();
      return (fromTs === undefined || startTs >= fromTs) && (toTs === undefined || startTs <= toTs);
    })
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const lessons = matched
    .slice(0, limit)
    .map((l) => ({ ...l, teacherName: teacherNameById.get(l.teacherId), branchName: branchNameById.get(l.branchId) }));

  return ok({ studentId: v.data.studentId, lessons, total: matched.length, truncated: matched.length > limit });
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

  // DB egress (2026-10-17) — mobil öğrenci/veli: yalnız bu öğrencinin dilimi (tüm süzgeçler studentId ile).
  const data = await readStudentScope(v.data.studentId);
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

  // DB egress (2026-10-18): öğrenci dilimi (puan yalnız öğrencinin derslerine bakar).
  const data = await readStudentScope(v.data.studentId);
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
): Promise<ServiceResult<{ teacherId: string; lessons: unknown[]; total: number; truncated: boolean }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "TEACHER", "AI_AGENT", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(
    z.object({
      teacherId: z.string().min(1),
      from: z.string().optional(),
      to: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(2000).optional(),
    }),
    input
  );
  if (!v.ok) return v;
  if (!canAccessTeacher(ctx, v.data.teacherId)) {
    return fail("FORBIDDEN", "Cannot access this teacher's schedule");
  }

  // DB egress (2026-10-17) — mobil öğretmen programı from/to ile gelir: tüm ders geçmişi yerine o pencere (±1 gün pay;
  // kesin süzgeç aşağıda aynen). Aralıksız çağrıda (hesap ekranı `limit=1`) yalnız bu öğretmenin dersleri.
  const windowFrom = new Date((v.data.from ? Date.parse(v.data.from) : NaN) - 86_400_000);
  const windowTo = new Date((v.data.to ? Date.parse(v.data.to) : NaN) + 86_400_000);
  const data =
    Number.isFinite(windowFrom.getTime()) && Number.isFinite(windowTo.getTime())
      ? await readLessonWindow(windowFrom.toISOString(), windowTo.toISOString())
      : await Promise.all([readReferenceData(), readLessonsForTeacher(v.data.teacherId)]).then(([ref, lessons]) => ({ ...ref, lessons }));
  const teacher = data.teachers.find((t) => t.id === v.data.teacherId);
  if (!teacher) return fail("NOT_FOUND", "Teacher not found");

  // Mobil `Lesson.studentName` gösterim alanını doldurur — ham depo kaydı
  // yalnızca `studentId` taşır, isim BURADA denormalize edilir (kök neden:
  // mobil haftalık program kartları isim yerine "Öğrenci" jenerik metnine
  // düşüyordu, bkz. getStudentScheduleTool'daki simetrik teacherName
  // zenginleştirmesi).
  const studentNameById = new Map(data.students.map((s) => [s.id, s.name]));
  const teacherBranchNameById = new Map(
    (data.settings.branches ?? []).map((b) => [b.id, b.shortName ?? b.name])
  );
  const fromTs = v.data.from ? Date.parse(v.data.from) : undefined;
  const toTs = v.data.to ? Date.parse(v.data.to) : undefined;
  const limit = v.data.limit ?? 500;
  const matched = data.lessons
    .filter((l) => l.teacherId === v.data.teacherId)
    .filter((l) => {
      const startTs = Date.parse(l.startAt);
      if (!Number.isFinite(startTs)) return true;
      return (fromTs === undefined || startTs >= fromTs) && (toTs === undefined || startTs <= toTs);
    })
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const lessons = matched
    .slice(0, limit)
    .map((l) => ({ ...l, studentName: studentNameById.get(l.studentId), branchName: teacherBranchNameById.get(l.branchId) }));

  return ok({ teacherId: v.data.teacherId, lessons, total: matched.length, truncated: matched.length > limit });
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

  // DB egress (2026-10-17) — mobil öğrenci/veli: yalnız bu öğrencinin dilimi (tüm süzgeçler studentId ile).
  const data = await readStudentScope(v.data.studentId);
  const student = data.students.find((s) => s.id === v.data.studentId);
  const access = await assertStudentAccess(ctx, student, v.data.studentId);
  if (!access.ok) return fail(access.code, access.message);

  const payments = data.payments.filter((p) => p.studentId === v.data.studentId);
  // 2026-10-04 — TEK borç kuralı (panel/portal ile aynı): iptal edilmiş satır ve iptal/yenilenmiş sözleşme kalanı borç değil.
  const { listTerminalContractIds } = await import("../contracts");
  const { summarizeStudentDebt } = await import("../payment-profile");
  const outstanding = summarizeStudentDebt(payments, await listTerminalContractIds(ctx.tenantId)).openTotal;

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
    // DB egress (2026-10-10): her tahsilatta tenant'ın TÜM verisi iki kez okunuyordu; yalnız bu ödeme satırı
    // ve bildirim metni için öğrenci adı/öğretmen listesi (referans dilimi) gerekir.
    const existing = await readPaymentById(v.data.paymentId);
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
      const data = await readReferenceData();
      const actorName = await resolveActorLabel({ tenantId: ctx.tenantId, userId: ctx.userId, teachers: data.teachers });
      const studentName = data.students.find((s) => s.id === existing.studentId)?.name ?? "Öğrenci";
      const collectedAmount = v.data.amount ?? existing.amount - (existing.paidAmount ?? 0);
      await notifyAdmins(ctx.tenantId, "payment_received", {
        title: "Ödeme alındı",
        body: `${studentName} için ${formatMoney(collectedAmount)} tahsilat ${actorName} tarafından alındı. Detay: ${paymentTargetHref(existing.studentId, v.data.paymentId)}`,
      }, { excludeUserId: ctx.userId, dedupeKey: v.data.paymentId });
    } catch {
      // best-effort
    }
    try {
      const { getUserIdByStudentId } = await import("../auth/users");
      const { isCategoryEnabledForUser } = await import("../notification-preferences");
      const { createNotification, hasRecentNotification } = await import("../notifications");
      // Tahsilat sonrası güncel satır (collectPayment işlem sonrası okudu) — ayrıca tam okuma yok.
      const payment = collected.payment;
      const studentUserId = payment ? await getUserIdByStudentId(ctx.tenantId, payment.studentId) : null;
      if (studentUserId) {
        const enabled = await isCategoryEnabledForUser(ctx.tenantId, studentUserId, "payment_received");
        if (enabled) {
          const since = Date.now() - 24 * 60 * 60 * 1000;
          // DB egress (2026-10-18): kullanıcının tüm bildirimleri yerine aynı kural SQL'de (en fazla 1 satır).
          const dup = await hasRecentNotification({ tenantId: ctx.tenantId, userId: studentUserId, kind: "payment_received", bodyIncludes: v.data.paymentId, since: new Date(since) });
          if (!dup && payment) {
            await createNotification({
              tenantId: ctx.tenantId,
              targetUserId: studentUserId,
              kind: "payment_received",
              title: "Ödemeniz alındı",
              // Öğrenci/veli /panel'i açamaz → kendi makbuzu. Kimlik URL'de kalır (yukarıdaki tekilleştirme buna bakar).
              body: `${formatMoney(payment.amount)} tutarındaki ödemeniz kaydedildi. Detay: /makbuz/${payment.id}`,
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
    // DB egress (2026-10-18): tek ödeme satırı (eskiden tam okuma).
    const existing = await readPaymentById(v.data.paymentId);
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
    // 2026-10-20 — sözleşme taksidinin DONDURULMUŞ tutarı tahsilat düzeltmesiyle değişmez (Yoklama Takvimi
    // "Düzelt"): 3000 → 2500 düzeltmesi taksidi 2500'e çekip 500 TL'lik açığı gizlememeli; satır kısmiye döner.
    const reviseBilledAmount =
      v.data.amount !== undefined &&
      (existing.source === "registration_first_payment" || (!existing.contractId && existing.paidAmount === existing.amount));

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
    const studentName = (await readStudentById(existing.studentId))?.name;
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
 * 2026-10-03 (owner) — yanlışlıkla oluşturulmuş ödemeyi silme / yanlış girilen tahsilatı geri alma.
 * Finans tek kaynak kuralı: sözleşme taksidi (contractId) ASLA silinmez — yalnız tahsilatı geri alınır.
 * Bağımsız satır "kaldır" ile kalıcı silinir; tahsilat takip kaydı veya online ödeme denemesi varsa iz
 * kaybolmasın diye silinmez, İPTAL edilir (hiçbir borç/tahsilat toplamında sayılmaz, listede görünür).
 */
export type PaymentDeletionAction = "reverse_collection" | "remove";
export type PaymentDeletionPlan = {
  paymentId: string;
  studentName: string;
  description: string;
  amount: number;
  paidAmount: number;
  status: import("../types").PaymentStatus;
  contractInstallment: boolean;
  followUpCaseCount: number;
  checkoutAttemptCount: number;
  /** İzin verilen işlemler; boşsa neden `blockedReason`'da. */
  actions: PaymentDeletionAction[];
  /** "remove" seçilirse sonuç: kalıcı silme mi, iptal mi. */
  removeMode: "delete" | "void" | null;
  blockedReason?: string;
  criticalPasswordConfigured: boolean;
};

async function computePaymentDeletionPlan(tenantId: string, paymentId: string): Promise<PaymentDeletionPlan | null> {
  const data = await readData();
  const payment = data.payments.find((p) => p.id === paymentId);
  if (!payment) return null;
  const { listFollowUpCases } = await import("../tahsilat/cases");
  const { countCheckoutAttemptsForPayment } = await import("../payment-checkout");
  const { getCriticalActionPasswordStatus } = await import("../critical-action-password");
  const [cases, checkoutAttemptCount, pw] = await Promise.all([
    listFollowUpCases(tenantId),
    countCheckoutAttemptsForPayment(tenantId, paymentId),
    getCriticalActionPasswordStatus(tenantId),
  ]);
  const followUpCaseCount = cases.filter((c) => c.paymentId === paymentId).length;
  const contractInstallment = !!payment.contractId;
  const collected = payment.paidAmount > 0;
  let actions: PaymentDeletionAction[] = [];
  let blockedReason: string | undefined;
  if (payment.status === "voided") {
    blockedReason = "Bu ödeme zaten iptal edilmiş; hiçbir borç veya tahsilat toplamında sayılmıyor.";
  } else if (contractInstallment) {
    if (collected) actions = ["reverse_collection"];
    else blockedReason = "Sözleşme taksidi silinemez; taksit tutarı veya planı öğrencinin Sözleşme ekranından değiştirilir.";
  } else {
    actions = collected ? ["reverse_collection", "remove"] : ["remove"];
  }
  return {
    paymentId,
    studentName: data.students.find((st) => st.id === payment.studentId)?.name ?? "—",
    description: contractInstallmentProgressDescription(payment),
    amount: payment.amount,
    paidAmount: payment.paidAmount,
    status: payment.status,
    contractInstallment,
    followUpCaseCount,
    checkoutAttemptCount,
    actions,
    removeMode: actions.includes("remove") ? (followUpCaseCount > 0 || checkoutAttemptCount > 0 ? "void" : "delete") : null,
    blockedReason,
    criticalPasswordConfigured: pw.configured,
  };
}

/** Silme/geri alma öncesi plan (yalnız okuma) — arayüz neyin olacağını buradan gösterir. */
export async function getPaymentDeletionPlanTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<PaymentDeletionPlan>> {
  const auth = requireRole(ctx, CRITICAL_ROLES_FOR_TOOLS);
  if (!auth.ok) return fail("FORBIDDEN", "Ödeme silme yalnız kurum sahibi ve kurum yöneticileri tarafından yapılabilir.");
  const v = parseOrFail(z.object({ paymentId: z.string().min(1) }), input);
  if (!v.ok) return v;
  const plan = await computePaymentDeletionPlan(ctx.tenantId, v.data.paymentId);
  return plan ? ok(plan) : fail("NOT_FOUND", "Ödeme bulunamadı; sayfayı yenileyin.");
}

export async function deletePaymentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ paymentId: string; result: "reversed" | "deleted" | "voided" }>> {
  const v = parseOrFail(
    z.object({ paymentId: z.string().min(1), action: z.enum(["reverse_collection", "remove"]), ...criticalDeleteFields }),
    input
  );
  if (!v.ok) return v;
  const plan = await computePaymentDeletionPlan(ctx.tenantId, v.data.paymentId);
  if (!plan) return fail("NOT_FOUND", "Ödeme bulunamadı; sayfayı yenileyin.");
  const entityName = `${plan.studentName} — ${plan.description}`;
  const auditAction = v.data.action === "reverse_collection" ? "payment.collection_reverse" : plan.removeMode === "void" ? "payment.void" : "payment.delete";
  const denied = await guardCriticalDelete(ctx, { action: auditAction, entityType: "Payment", entityId: plan.paymentId, entityName }, v.data.criticalPassword);
  if (denied) return denied;
  if (!plan.actions.includes(v.data.action)) {
    return fail(
      "VALIDATION_ERROR",
      plan.blockedReason ??
        (v.data.action === "reverse_collection"
          ? "Bu ödemede geri alınacak tahsilat yok."
          : "Sözleşme taksidi silinemez; yanlış girilen tahsilat için \"Tahsilatı geri al\" kullanın.")
    );
  }
  const before = await readPaymentById(plan.paymentId); // DB egress (2026-10-18): tek satır
  const { collectPayment } = await import("../payments/collect");
  let result: "reversed" | "deleted" | "voided";
  try {
    if (v.data.action === "reverse_collection") {
      await collectPayment(plan.paymentId, { reverseCollection: true, actorUserId: ctx.userId, tenantId: ctx.tenantId });
      result = "reversed";
    } else if (plan.removeMode === "delete") {
      try {
        await deletePaymentRow(plan.paymentId);
        result = "deleted";
      } catch (e) {
        // Arada takip kaydı/online deneme oluştuysa (yarış) iz kaybolmasın: iptal et.
        if (!(e instanceof Error && e.message === "PAYMENT_HAS_HISTORY")) throw e;
        await collectPayment(plan.paymentId, { voided: true, actorUserId: ctx.userId, tenantId: ctx.tenantId });
        result = "voided";
      }
    } else {
      await collectPayment(plan.paymentId, { voided: true, actorUserId: ctx.userId, tenantId: ctx.tenantId });
      result = "voided";
    }
  } catch (e) {
    logger.error("deletePaymentTool failed", e);
    return fail("INTERNAL_ERROR", "Ödeme silinemedi; hiçbir kayıt değişmedi. Sayfayı yenileyip tekrar deneyin.");
  }
  // Silinen satırın tam görüntüsü denetim kaydında kalır (kim, ne zaman, neden, ne).
  await recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: result === "reversed" ? "payment.collection_reverse" : result === "voided" ? "payment.void" : "payment.delete",
    entityType: "Payment",
    entityId: plan.paymentId,
    outcome: "success",
    meta: {
      entityName,
      reason: v.data.reason,
      studentId: before?.studentId,
      before: before
        ? {
            amount: before.amount,
            paidAmount: before.paidAmount,
            status: before.status,
            dueDate: before.dueDate,
            paidAt: before.paidAt,
            method: before.method,
            description: before.description,
            source: before.source,
            contractId: before.contractId,
            installmentSequence: before.installmentSequence,
            receivedByUserId: before.receivedByUserId,
          }
        : null,
      followUpCaseCount: plan.followUpCaseCount,
      checkoutAttemptCount: plan.checkoutAttemptCount,
    },
  });
  return ok({ paymentId: plan.paymentId, result });
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

  // DB egress (2026-10-18): tek ödeme + tek öğrenci + referans ayarlar (eskiden tam okuma).
  const [payment, data] = await Promise.all([readPaymentById(v.data.paymentId), readReferenceData()]);
  if (!payment) return fail("NOT_FOUND", "Ödeme bulunamadı");

  // Öğrenci sahipliği + AKTİF StudentPortalAccess (GUARDIAN veya SELF) —
  // tek gerçek kaynak assertStudentAccess/canAccessStudent (async).
  const student = await readStudentById(payment.studentId);
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

/* ====================================================================================================================
 * 2026-10-10 — YENİ ÖĞRENCİ KAYDI: tek çekirdek, N eşit branş.
 *
 * Eskiden `createStudentTool` ilk branşın TÜM kuralını (öğretmen/enstrüman, MEB, paket/kampanya/indirim, önerilen ilk
 * tahsilat, gerekçeli düzeltme) satır içi taşıyordu; ek branşlar bunların hiçbirinden geçmiyor, sonradan ayrı çağrıyla
 * ve eksik alanlarla ekleniyordu (yarım kayıt riski). Şimdi:
 * - `prepareBranchRegistration`: BİR branşın hesap/doğrulama kuralları (ücret, önerilen ilk tahsilat, gerekçe) — hem
 *   yeni öğrenci kaydı hem mevcut öğrenciye branş ekleme kullanır; çıktı v2 branş kaydıdır.
 * - `registerStudentCore`: kişi + N branş → TEK store işlemi (öğrenci + tüm branşlar + her branşın ilk tahsilatı).
 * - `createStudentTool` (düz/eski girdi: CSV, AI, deneme dönüşümü, testler) ve `registerStudentWithEnrollmentsTool`
 *   (kayıt formu: N eksiksiz taslak) aynı çekirdeğe iner.
 * ================================================================================================================== */

type StudentInput = z.infer<typeof studentSchema>;

/** Bir branşın kayıt girdisi — düz (eski) `studentSchema` ile çoklu branş taslakları AYNI şekle indirgenir. */
type BranchRegistrationInput = Pick<StudentInput, "instrument" | "teacherId" | "weeklyLessonCount" | "monthlyFee" | "enrollmentStartDate"> &
  Partial<
    Pick<
      StudentInput,
      | "packageName"
      | "studentType"
      | "studentTypes"
      | "lessonStartDate"
      | "intendedDurationMonths"
      | "lessonScheduleText"
      | "enrollmentEndDate"
      | "lessonDays"
      | "level"
      | "targetExam"
      | "mebLevelStartDate"
      | "mebLevelEndDate"
      | "mebExamDate"
      | "mebExamAttended"
      | "packageId"
      | "lessonDurationMinutes"
      | "discountType"
      | "discountValue"
      | "campaignIds"
      | "paymentMethod"
      | "paymentDueDay"
      | "paymentDueRanges"
      | "monthlyFeeOverrideAmount"
      | "monthlyFeeOverrideReason"
      | "firstPaymentCollected"
      | "firstPaymentAdjustmentReason"
      | "firstCollectionIncludesNextMonth"
    >
  > & {
    /** Branşın ayrı şubesi (kişinin şubesinden farklıysa); yoksa kişinin şubesi geçerlidir. */
    branchId?: string;
  };

/** Kayıt gönderiminde BRANŞA özgü olan `studentSchema` anahtarları (geri kalanı kişi düzeyidir). */
const BRANCH_INPUT_KEYS = [
  "instrument",
  "teacherId",
  "packageName",
  "weeklyLessonCount",
  "monthlyFee",
  "studentType",
  "studentTypes",
  "enrollmentStartDate",
  "lessonStartDate",
  "intendedDurationMonths",
  "lessonScheduleText",
  "enrollmentEndDate",
  "lessonDays",
  "level",
  "targetExam",
  "mebLevelStartDate",
  "mebLevelEndDate",
  "mebExamDate",
  "mebExamAttended",
  "packageId",
  "lessonDurationMinutes",
  "discountType",
  "discountValue",
  "campaignIds",
  "paymentMethod",
  "paymentDueDay",
  "paymentDueRanges",
  "monthlyFeeOverrideAmount",
  "monthlyFeeOverrideReason",
  "firstPaymentCollected",
  "firstPaymentExceptionReason",
  "firstPaymentAdjustmentReason",
  "firstCollectionIncludesNextMonth",
] as const satisfies readonly (keyof StudentInput)[];

type PersonRegistrationInput = Omit<StudentInput, (typeof BRANCH_INPUT_KEYS)[number]>;

/** Eski düz girdiyi (kişi + ilk branş) kişi düzeyi ve branş girdisine ayırır. */
function splitFlatStudentInput(data: StudentInput): { person: PersonRegistrationInput; branch: BranchRegistrationInput } {
  const rest: Record<string, unknown> = { ...data };
  const branch: Record<string, unknown> = {};
  for (const k of BRANCH_INPUT_KEYS) {
    branch[k] = rest[k];
    delete rest[k];
  }
  branch.instrument = data.instrument;
  branch.teacherId = data.teacherId;
  return { person: rest as unknown as PersonRegistrationInput, branch: branch as unknown as BranchRegistrationInput };
}

const DEFAULT_REGISTRATION_PACKAGE_NAME = "Bireysel Aylık — 4 ders";

type PreparedBranch = {
  /** v2 branş kaydı (tam koşullar). `primary` (ayna kaynağı) çağıran tarafından atanır. */
  record: import("../types").StudentEnrollment;
  pricing: {
    monthlyFee: number;
    packageBaseMonthlyFee?: number;
    discountType?: Student["discountType"];
    discountValue?: number;
    monthlyFeeManualOverride: boolean;
    monthlyFeeOverrideReason?: string;
    appliedCampaignIds?: string[];
  };
  registrationWarnings: string[];
  /** Tahsilat satırı yazılacak mı? (false: burslu 0 TL veya ilk tahsilat bu çağrıda alınmıyor) */
  noFirstCollection: boolean;
  firstPaymentGiven: boolean;
  autoSuggestedAmount: number;
  includesNextMonth: boolean;
  /** 2026-10-14 — ilk tahsilatın kapsadığı dönem(ler) (etiket + kırılım; kayıt satırına yazılır). */
  firstCollectionPeriods: ReturnType<typeof registrationFirstCollectionPeriods>;
  firstPaymentCollected?: NonNullable<StudentInput["firstPaymentCollected"]>;
  adjustment?: Extract<ReturnType<typeof resolveFirstPaymentAdjustment>, { ok: true }>["result"];
  appliedCampaignIds?: string[];
};

function compactRecord<T extends object>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as T;
}

/**
 * Bir branşın hesap ve iş kuralları (SAF DEĞİL: kampanya/paket okur, ama YAZMAZ). Öğretmen/enstrüman uygunluğu çağıranın
 * işidir (`checkBranchRoster` veya upsert'in kendi mesajları). İlk tahsilat `firstPaymentOptional` ise yoksa atlanır.
 */
async function prepareBranchRegistration(
  ctx: ServiceContext,
  before: Pick<AppData, "settings" | "teachers" | "closedDayOverrides" | "discountCampaigns" | "packages">,
  person: { branchId: string; termType?: import("../types").StudentTermType },
  b: BranchRegistrationInput,
  opts: { enrollmentId: string; nowIso: string; firstPaymentOptional?: boolean }
): Promise<ServiceResult<PreparedBranch>> {
  const branchId = b.branchId ?? person.branchId;

  // `lessonDays` GÖNDERİLDİYSE haftalık sıklıkla TAM ve TEKİL eşleşmeli (istemcinin `required`ına güvenilmez).
  if (b.lessonDays && b.lessonDays.length > 0) {
    const uniqueLessonDays = new Set(b.lessonDays);
    if (b.lessonDays.length !== b.weeklyLessonCount || uniqueLessonDays.size !== b.lessonDays.length) {
      const msg = `Haftalık ${b.weeklyLessonCount} ders için ${b.weeklyLessonCount} farklı ders günü seçmelisiniz.`;
      return fail("VALIDATION_ERROR", msg, { field: "lessonScheduleText", fieldErrors: { lessonDays: [msg] } });
    }
  }

  // MEB — TEK sunucu kapısı (src/lib/meb.ts). Tür LİSTESİNE bakılır. MEB dönemi genel kayıt/ders tarihlerine ASLA yazılmaz.
  const types = effectiveStudentTypes({ studentTypes: b.studentTypes, studentType: b.studentType });
  const mebIsMeb = isMebStudent({ studentTypes: b.studentTypes, studentType: b.studentType });
  const mebCheck = validateMebFields({
    studentTypes: types,
    level: b.level,
    mebLevelStartDate: b.mebLevelStartDate,
    mebLevelEndDate: b.mebLevelEndDate,
    mebExamDate: b.mebExamDate,
    mebExamAttended: b.mebExamAttended,
  });
  if (!mebCheck.ok) {
    return fail("VALIDATION_ERROR", "MEB alanlarını kontrol edin — işaretli alanlarda eksik veya hatalı bilgi var.", {
      fieldErrors: mebCheck.fieldErrors,
    });
  }

  // Paket & kampanya: aylık ücret HER ZAMAN sunucuda, tek merkez hesapla (resolveEnrollmentPricing) üretilir.
  let pricing: PreparedBranch["pricing"] = { monthlyFee: b.monthlyFee, monthlyFeeManualOverride: false };
  const registrationWarnings: string[] = [];

  if (!b.packageId && (b.discountType || b.discountValue !== undefined || b.monthlyFeeOverrideAmount !== undefined)) {
    return fail("VALIDATION_ERROR", "İndirim/manuel ücret yalnızca bir paket seçildiğinde uygulanabilir.", { field: "discountValue" });
  }

  let appliedCampaignIds: string[] | undefined;
  let campaignDiscountPercent: number | undefined;
  if ((b.campaignIds?.length ?? 0) > 0) {
    if (b.discountType || b.discountValue !== undefined) {
      return fail(
        "VALIDATION_ERROR",
        "Kampanya seçildiğinde manuel indirim girilemez — indirimi kampanya belirler, ya kampanyayı kaldırın ya manuel indirimi silin.",
        { field: "campaignIds" }
      );
    }
    const { applicableCampaigns, resolveCampaignStack, campaignLimitWarning } = await import("../discount-campaigns");
    const selected = (b.campaignIds ?? [])
      .map((id) => (before.discountCampaigns ?? []).find((c) => c.id === id))
      .filter((c): c is NonNullable<typeof c> => !!c);
    if (selected.length !== (b.campaignIds ?? []).length) {
      return fail("VALIDATION_ERROR", "Seçilen kampanyalardan biri bulunamadı veya bu kuruma ait değil.", { field: "campaignIds" });
    }
    const now = new Date();
    const applicable = applicableCampaigns(selected, branchId, now);
    if (applicable.length !== selected.length) {
      const bad = selected.find((c) => !applicable.some((a) => a.id === c.id));
      return fail(
        "VALIDATION_ERROR",
        `"${bad?.name ?? "Seçilen kampanya"}" şu an bu öğrenci için geçerli değil (pasif, süresi dışında veya şube kapsamı dışında).`,
        { field: "campaignIds" }
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

  let packageTitle: string | undefined;
  if (b.packageId) {
    const pkg = before.packages?.find((p) => p.id === b.packageId && p.status === "active");
    if (!pkg) return fail("VALIDATION_ERROR", "Seçilen paket bulunamadı veya aktif değil.", { field: "packageId" });
    if (!b.lessonDurationMinutes) {
      return fail("VALIDATION_ERROR", "Paket seçildiğinde ders süresi (30/40/50 dk) zorunludur.", { field: "lessonDurationMinutes" });
    }
    if (b.monthlyFeeOverrideAmount !== undefined && ctx.role !== "SCHOOL_ADMIN" && ctx.role !== "SUPER_ADMIN") {
      return fail("FORBIDDEN", "Aylık ücreti yalnızca yetkili yönetici elle değiştirebilir.", { field: "overrideAmount" });
    }
    packageTitle = pkg.title;
    const rp = resolveEnrollmentPricing({
      pkg,
      durationMinutes: b.lessonDurationMinutes as import("../lesson-duration").LessonDurationMinutes,
      discountType: b.discountType,
      discountValue: b.discountValue,
      campaignPercent: campaignDiscountPercent,
      overrideAmount: b.monthlyFeeOverrideAmount,
    });
    pricing = {
      monthlyFee: rp.monthlyFee,
      packageBaseMonthlyFee: rp.packageBaseMonthlyFee,
      discountType: rp.discountType,
      discountValue: rp.discountValue,
      monthlyFeeManualOverride: rp.monthlyFeeManualOverride,
      monthlyFeeOverrideReason: rp.monthlyFeeManualOverride ? b.monthlyFeeOverrideReason : undefined,
      appliedCampaignIds,
    };
  } else if (campaignDiscountPercent !== undefined) {
    // Paketsiz (legacy) + kampanya: indirim serbest aylık ücrete uygulanır (paket yoluyla AYNI tek formül).
    const rp = resolveEnrollmentPricing({
      pkg: null,
      durationMinutes: 40,
      campaignPercent: campaignDiscountPercent,
      freeMonthlyFee: b.monthlyFee,
    });
    pricing = {
      monthlyFee: rp.monthlyFee,
      packageBaseMonthlyFee: rp.packageBaseMonthlyFee,
      discountType: rp.discountType,
      discountValue: rp.discountValue,
      monthlyFeeManualOverride: false,
      appliedCampaignIds,
    };
  }

  // Önerilen ilk tahsilat — istemci önizlemesiyle AYNI saf fonksiyon (suggestFirstCollection).
  const derivedPerLessonAmount = derivePerLessonAmount(pricing.monthlyFee, b.weeklyLessonCount);
  const suggestion = suggestFirstCollection({
    monthlyFee: pricing.monthlyFee,
    weeklyLessonCount: b.weeklyLessonCount,
    lessonStartDate: b.lessonStartDate,
    enrollmentStartDate: b.enrollmentStartDate,
    fallbackToday: toZonedYmd(new Date(), resolveAppTimezone()),
    enrollmentEndDate: b.enrollmentEndDate,
    lessonDays: b.lessonDays,
    term: person.termType ?? "guz",
    overrides: before.closedDayOverrides ?? [],
    weeklyClosedDays: before.settings.termWeeklyClosedDays,
    includeNextMonth: b.firstCollectionIncludesNextMonth ?? null,
    mergeThresholdLessons: resolveFirstCollectionMergeThreshold({
      firstCollectionMergeThresholdLessons: before.settings.collectionsSettings?.firstCollectionMergeThresholdLessons,
    }),
  });
  if (!suggestion) {
    return fail("VALIDATION_ERROR", "Aylık ücret ve haftalık ders sayısı geçersiz olduğundan ilk dönem tutarı hesaplanamadı. Değerleri kontrol edin.", {
      field: "monthlyFee",
    });
  }
  const autoSuggestedAmount = suggestion.suggestedAmount;
  const includesNextMonth = suggestion.includesNextMonth;

  // İlk ödeme kayıt sırasında alınır (owner politikası). Mevcut öğrenciye branş eklemede (eski API) isteğe bağlı olabilir.
  const firstPaymentCollected = b.firstPaymentCollected;
  let noFirstCollection = false;
  let adjustment: PreparedBranch["adjustment"];
  if (!firstPaymentCollected) {
    if (!opts.firstPaymentOptional) {
      const msg = "İlk ödeme kayıt sırasında tahsil edilmeden kayıt tamamlanamaz.";
      return fail("VALIDATION_ERROR", msg, { fieldErrors: { firstPaymentAmount: [msg] } });
    }
    noFirstCollection = true;
  } else {
    // %100 indirimli/burslu kayıt: önerilen tutar 0 ise 0 TL geçerlidir ve Payment satırı YAZILMAZ.
    noFirstCollection = firstPaymentCollected.amount === 0;
    if (noFirstCollection && autoSuggestedAmount > 0) {
      const msg = `Tahsil edilen tutar 0 TL olamaz: bu kayıt için önerilen ilk tahsilat ${new Intl.NumberFormat("tr-TR").format(autoSuggestedAmount)} TL. 0 TL yalnız ücret %100 indirimli/burslu olduğunda girilebilir — fiilen tahsil edilen tutarı yazın.`;
      return fail("VALIDATION_ERROR", msg, { fieldErrors: { firstPaymentAmount: [msg] } });
    }
    const adj = resolveFirstPaymentAdjustment({
      autoSuggestedAmount,
      manualNetAmount: firstPaymentCollected.amount,
      reason: b.firstPaymentAdjustmentReason,
    });
    if (!adj.ok) {
      return fail("VALIDATION_ERROR", adj.message, { fieldErrors: { firstPaymentAdjustmentReason: [adj.message] } });
    }
    adjustment = adj.result;
  }

  const record: import("../types").StudentEnrollment = compactRecord({
    id: opts.enrollmentId,
    instrument: b.instrument as Instrument,
    teacherId: b.teacherId,
    branchId: b.branchId && b.branchId !== person.branchId ? (b.branchId as BranchId) : undefined,
    lessonDurationMinutes: b.lessonDurationMinutes,
    weeklyLessonCount: b.weeklyLessonCount,
    active: true,
    primary: false,
    startDate: b.enrollmentStartDate ? b.enrollmentStartDate.slice(0, 10) : undefined,
    endDate: b.enrollmentEndDate ? b.enrollmentEndDate.slice(0, 10) : undefined,
    createdAt: opts.nowIso,
    updatedAt: opts.nowIso,
    termsVersion: 2 as const,
    studentTypes: types as import("../types").StudentType[],
    level: b.level,
    targetExam: b.targetExam,
    // MEB değilse MEB değerleri YAZILMAZ (gizli/kurcalanmış alan).
    mebLevelStartDate: mebIsMeb ? b.mebLevelStartDate : undefined,
    mebLevelEndDate: mebIsMeb ? b.mebLevelEndDate : undefined,
    mebExamDate: mebIsMeb ? b.mebExamDate : undefined,
    mebExamAttended: mebIsMeb ? b.mebExamAttended : undefined,
    packageId: b.packageId,
    packageName: packageTitle ?? b.packageName ?? DEFAULT_REGISTRATION_PACKAGE_NAME,
    monthlyFee: pricing.monthlyFee,
    packageBaseMonthlyFee: pricing.packageBaseMonthlyFee,
    discountType: pricing.discountType,
    discountValue: pricing.discountValue,
    monthlyFeeManualOverride: pricing.monthlyFeeManualOverride,
    monthlyFeeOverrideReason: pricing.monthlyFeeOverrideReason,
    derivedPerLessonAmount,
    paymentMethod: b.paymentMethod,
    paymentDueDay: b.paymentDueDay,
    paymentDueRanges: b.paymentDueRanges?.length
      ? b.paymentDueRanges
      : b.paymentDueDay
        ? [{ start: b.paymentDueDay, end: b.paymentDueDay }]
        : undefined,
    lessonStartDate: b.lessonStartDate ? b.lessonStartDate.slice(0, 10) : undefined,
    lessonScheduleText: b.lessonScheduleText,
    intendedDurationMonths: b.intendedDurationMonths,
    appliedCampaignIds,
  });

  return ok({
    record,
    pricing,
    registrationWarnings,
    noFirstCollection,
    firstPaymentGiven: !!firstPaymentCollected,
    autoSuggestedAmount,
    includesNextMonth,
    firstCollectionPeriods: registrationFirstCollectionPeriods(suggestion, pricing.monthlyFee),
    firstPaymentCollected,
    adjustment,
    appliedCampaignIds,
  });
}

/** Kayıt anı öğretmen/enstrüman uygunluğu (createStudentTool'un mesajları — mevcut testler bunlara dayanır). */
function checkBranchRosterForRegistration(
  before: Pick<AppData, "teachers" | "settings">,
  activeInstrumentNames: string[],
  b: Pick<BranchRegistrationInput, "instrument" | "teacherId" | "branchId">
): ServiceResult<true> {
  if (!activeInstrumentNames.includes(b.instrument)) {
    return fail(
      "VALIDATION_ERROR",
      `"${b.instrument}" bu kurumda aktif bir enstrüman değil. Enstrüman kataloğundan aktif bir enstrüman seçin.`,
      { field: "instrument" }
    );
  }
  const teacher = before.teachers.find((t) => t.id === b.teacherId);
  if (!teacher) return fail("VALIDATION_ERROR", "Seçilen öğretmen bulunamadı veya bu kuruma ait değil.", { field: "teacherId" });
  if (!isTeacherSchedulable(teacher)) {
    return fail("VALIDATION_ERROR", `"${teacher.name}" pasif/işten ayrılmış — aktif bir öğretmen seçin.`, { field: "teacherId" });
  }
  if (!teacher.instruments.includes(b.instrument as Instrument)) {
    return fail(
      "VALIDATION_ERROR",
      `"${teacher.name}" "${b.instrument}" enstrümanını öğretmiyor. Bu enstrümanı öğreten aktif bir öğretmen seçin.`,
      { field: "teacherId" }
    );
  }
  if (b.branchId && !before.settings.branches.some((x) => x.id === b.branchId)) {
    return fail("VALIDATION_ERROR", "Seçilen şube bulunamadı. Listeden geçerli bir şube seçin.", { field: "branchId" });
  }
  return ok(true);
}

type RegisterCoreResult = { studentId: string; tempLoginPassword?: string; warnings?: string[]; enrollmentIds: string[]; duplicate?: boolean };

/** Branş hatasının nereden geldiği: çoklu branşta mesaja branş adı eklenir, `details` ile hangi taslak/alan olduğu taşınır. */
function branchFailure(res: import("./result").ServiceFailure, key: string | undefined, label: string, multi: boolean) {
  const details = (res.error.details && typeof res.error.details === "object" ? res.error.details : {}) as Record<string, unknown>;
  return fail(
    res.error.code,
    multi ? `${label}: ${res.error.message}` : res.error.message,
    key ? { ...details, branchKey: key } : details
  );
}

async function registerStudentCore(
  ctx: ServiceContext,
  person: PersonRegistrationInput,
  branches: { key?: string; input: BranchRegistrationInput }[],
  opts: { registrationId?: string }
): Promise<ServiceResult<RegisterCoreResult>> {
  // DB egress (2026-10-18): kayıt yalnız referans veriye bakar (öğrenci sayısı/tekrar, öğretmen, paket, kampanya).
  const before = await readReferenceData();
  // Paket limiti yalnız YENİ kaydı engeller; mevcut öğrenciler etkilenmez.
  const limit = await assertWithinLimit(
    ctx.tenantId,
    "students",
    before.students.filter((st) => st.active !== false).length
  );
  if (!limit.ok) return limit;
  const activeInstrumentNames = await resolveActiveInstrumentNames(ctx.tenantId);

  // Deneme dersinden dönüşüm: kaynak deneme aynı tenant'ta olmalı ve daha önce dönüştürülmemiş olmalı.
  let sourceTrial: Awaited<ReturnType<typeof getTrialLesson>> = null;
  if (person.convertedFromTrialId) {
    sourceTrial = await getTrialLesson(ctx.tenantId, person.convertedFromTrialId);
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

  const multi = branches.length > 1;
  const nowIso = new Date().toISOString();
  const prepared: PreparedBranch[] = [];
  const seen = new Set<string>();
  for (const [i, br] of branches.entries()) {
    const label = br.input.instrument || `Branş ${i + 1}`;
    const roster = checkBranchRosterForRegistration(before, activeInstrumentNames, br.input);
    if (!roster.ok) return branchFailure(roster, br.key, label, multi);
    const sig = `${br.input.instrument}::${br.input.teacherId}`;
    if (seen.has(sig)) {
      return fail(
        "CONFLICT",
        `${label}: aynı öğretmenle ikinci bir ${br.input.instrument} branş kaydı eklenemez. Farklı bir öğretmen seçin ya da bu branşı kaldırın.`,
        { field: "teacherId", ...(br.key ? { branchKey: br.key } : {}) }
      );
    }
    seen.add(sig);
    const res = await prepareBranchRegistration(
      ctx,
      before,
      { branchId: person.branchId, termType: person.termType },
      br.input,
      { enrollmentId: uid("enr"), nowIso }
    );
    if (!res.ok) return branchFailure(res, br.key, label, multi);
    prepared.push(res.data);
  }
  const first = prepared[0]!;

  // Çift gönderim/retry koruması. Açık kimlik (registrationId) varsa store ATOMİK olarak bakar; yoksa eski doğal anahtar
  // (ad+telefon+veli telefonu+öğretmen+şube+tutar, 60 sn) devreye girer.
  if (!opts.registrationId) {
    const RETRY_DEDUPE_WINDOW_MS = 60_000;
    const retryDupe = before.students.find(
      (s) =>
        s.name === person.name &&
        s.phone === person.phone &&
        s.parentPhone === person.parentPhone &&
        s.teacherId === first.record.teacherId &&
        s.branchId === person.branchId &&
        s.monthlyFee === first.pricing.monthlyFee &&
        Date.now() - new Date(s.createdAt).getTime() <= RETRY_DEDUPE_WINDOW_MS
    );
    if (retryDupe) return ok({ studentId: retryDupe.id, enrollmentIds: (retryDupe.enrollments ?? []).map((e) => e.id), duplicate: true });
  }

  // Öğrenci satırı = kişi düzeyi alanlar + branşların UYUMLULUK AYNASI (bkz. student-enrollments.ts).
  const records = prepared.map((p, i) => ({
    ...p.record,
    primary: i === 0,
    ...(i === 0 && opts.registrationId ? { registrationId: opts.registrationId } : {}),
  }));
  const mirror = mirrorPatchFromEnrollments(records);
  const base = {
    id: "",
    createdAt: "",
    active: true,
    // P0 (2026-09-05) — `Student.phone`/`parentPhone`/`parentName` modeli HER ZAMAN dolu kalır (bildirim/sözleşme
    // imza alanları buna güvenir); eksik taraf GİRİLEN diğer değerle doldurulur.
    name: person.name,
    email: person.email ?? "",
    phone: person.phone ?? person.parentPhone ?? "",
    parentName: person.parentName ?? person.name,
    parentPhone: person.parentPhone ?? person.phone ?? "",
    motherName: person.motherName,
    fatherName: person.fatherName,
    referralSource: person.referralSource,
    referralSourceDetail: person.referralSourceDetail,
    branchId: person.branchId as BranchId,
    notes: person.notes ?? "",
    specialNotes: person.specialNotes,
    termType: person.termType,
    birthDate: person.birthDate,
    birthPlace: person.birthPlace,
    schoolOrOccupation: person.schoolOrOccupation,
    address: person.address,
    accountResponsibility: person.accountResponsibility,
    instruments: [] as Instrument[],
    teacherId: "",
    packageName: "",
    weeklyLessonCount: 1,
    monthlyFee: 0,
    createdByUserId: ctx.userId,
    ...(sourceTrial ? { convertedFromTrialId: sourceTrial.id, convertedByUserId: ctx.userId } : {}),
  } as unknown as Student;
  const {
    id: _id,
    createdAt: _createdAt,
    active: _active,
    ...studentRow
  } = applyProfilePatchToStudent(base, mirror);
  void _id;
  void _createdAt;
  void _active;

  const firstPayments = prepared.flatMap((p) => {
    if (p.noFirstCollection || !p.firstPaymentCollected) return [];
    const fp = p.firstPaymentCollected;
    return [
      {
        enrollmentId: p.record.id,
        method: fp.method!,
        amount: fp.amount,
        collectedAt: fp.collectedAt!,
        reference: fp.reference,
        note: fp.note,
        receivedByUserId: ctx.userId,
        firstCollectionIncludesNextMonth: p.includesNextMonth,
        ...p.firstCollectionPeriods,
        // P0-1B — yalnız GERÇEK bir manuel düzeltme varsa dolu.
        ...(p.adjustment?.isManualOverride
          ? { autoSuggestedAmount: p.adjustment.autoSuggestedAmount, adjustmentReason: p.adjustment.reason, adjustedBy: ctx.userId, adjustedAt: nowIso }
          : {}),
      },
    ];
  });

  const reg = await registerStudent({
    student: { ...studentRow, enrollments: records },
    firstPayments,
    registrationId: opts.registrationId,
  });
  if (reg.duplicate) {
    // Aynı gönderim zaten işlendi (çift tık / yeniden deneme): ikinci öğrenci/ödeme/yan etki YOK.
    return ok({ studentId: reg.studentId, enrollmentIds: records.map((r) => r.id), duplicate: true });
  }
  const studentId = reg.studentId;

  audit(ctx, "student.create", "Student", studentId, {
    ...(first.record.packageId ? { pricing: first.pricing } : {}),
    entityName: person.name,
    enrollmentCount: records.length,
    ...(sourceTrial ? { convertedFromTrialId: sourceTrial.id } : {}),
  });

  const registrationWarnings = prepared.flatMap((p, i) =>
    multi ? p.registrationWarnings.map((w) => `${records[i]!.instrument}: ${w}`) : p.registrationWarnings
  );

  // Kampanya kullanım sayacı HER uygulamada artırılır; sayaç artışı kaydı ASLA engellemez.
  for (const p of prepared) {
    for (const cid of p.appliedCampaignIds ?? []) {
      try {
        const latest = (await readReferenceData()).discountCampaigns.find((c) => c.id === cid);
        if (!latest) continue;
        const next = (latest.usageCount ?? 0) + 1;
        await updateDiscountCampaign(cid, { usageCount: next });
        audit(ctx, "discount_campaign.applied", "DiscountCampaign", cid, {
          studentId,
          entityName: latest.name,
          usageCount: next,
          maxUsageCount: latest.maxUsageCount ?? null,
        });
      } catch (e) {
        logger.warn("registerStudent — kampanya sayacı artırılamadı (kayıt korundu)", {
          campaignId: cid,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
  if (sourceTrial) {
    const { markTrialConverted } = await import("../trial-lessons");
    await markTrialConverted(ctx.tenantId, sourceTrial.id, { studentId, userId: ctx.userId });
    audit(ctx, "trial.converted", "TrialLesson", sourceTrial.id, { studentId, entityName: sourceTrial.name });
  }

  const { buildFirstPaymentAdjustmentAuditEntry } = await import("../first-payment-adjustment");
  for (const [i, p] of prepared.entries()) {
    const enrollmentId = records[i]!.id;
    if (i > 0) {
      audit(ctx, "student.enrollment_add", "Student", studentId, {
        enrollmentId,
        instrument: records[i]!.instrument,
        teacherId: records[i]!.teacherId,
        monthlyFee: p.pricing.monthlyFee,
        viaRegistration: true,
      });
    }
    if (p.noFirstCollection) {
      if (p.firstPaymentGiven) {
        // Burslu branş — tahsilat yok, ödeme satırı yok; iz yalnız audit'te.
        audit(ctx, "student.first_payment_waived", "Student", studentId, {
          studentId,
          enrollmentId,
          autoSuggestedAmount: p.autoSuggestedAmount,
          monthlyFee: p.pricing.monthlyFee,
        });
      }
      continue;
    }
    const fp = p.firstPaymentCollected!;
    const paymentId = reg.paymentIds[enrollmentId];
    if (!paymentId) continue;
    audit(ctx, "student.first_payment_collected", "Payment", paymentId, {
      studentId,
      enrollmentId,
      method: fp.method!,
      amount: fp.amount,
    });
    if (p.adjustment?.isManualOverride) {
      audit(
        ctx,
        "student.first_payment_adjusted",
        "Payment",
        paymentId,
        {
          ...buildFirstPaymentAdjustmentAuditEntry(p.adjustment, {
            tenantId: ctx.tenantId,
            studentId,
            paymentId,
            adjustedBy: ctx.userId,
          }),
          enrollmentId,
        }
      );
    }
  }

  // Yöneticilere yeni kayıt bildirimi (best-effort).
  try {
    const { notifyAdmins } = await import("../manager-notifications");
    const { resolveActorLabel } = await import("../contract-payment-plan-view");
    const actorName = await resolveActorLabel({ tenantId: ctx.tenantId, userId: ctx.userId, teachers: before.teachers });
    await notifyAdmins(ctx.tenantId, "student_new_registration", {
      title: sourceTrial ? "Deneme öğrencisi kayda dönüştü" : "Yeni öğrenci kaydı",
      body: sourceTrial
        ? `${person.name} deneme öğrencisi, ${actorName} tarafından kayda dönüştürüldü. Detay: /panel/ogrenciler/${studentId}`
        : `${person.name} öğrencisi, ${actorName} tarafından oluşturuldu. Detay: /panel/ogrenciler/${studentId}`,
    });
  } catch {
    // best-effort
  }

  // Karma Öğrenci Portalı — hesap YALNIZCA yönetici bilinçli olarak işaretlediyse ve e-posta varsa açılır.
  let tempLoginPassword: string | undefined;
  if (person.email && person.createPortalAccess) {
    const provisioned = await provisionEntityLogin({
      tenantId: ctx.tenantId,
      email: person.email,
      role: "STUDENT",
      studentId,
    });
    if (provisioned) {
      audit(ctx, "student.login_provisioned", "Student", studentId);
      // Geçici şifre yalnızca doğrudan insan yönetici çağrısında döner (AI_AGENT'a asla).
      if (ctx.role === "SCHOOL_ADMIN" || ctx.role === "SUPER_ADMIN") {
        tempLoginPassword = provisioned.tempPassword;
      }
      const { grantActiveStudentPortalAccess } = await import("../student-portal-access");
      await grantActiveStudentPortalAccess({
        tenantId: ctx.tenantId,
        userId: provisioned.userId,
        studentId,
        accessType: person.portalAccessType ?? "SELF",
        invitedBy: ctx.userId,
      });
      audit(ctx, "student.portal_access_granted", "Student", studentId, {
        accessType: person.portalAccessType ?? "SELF",
      });
    }
  }

  return ok({
    studentId,
    tempLoginPassword,
    enrollmentIds: records.map((r) => r.id),
    ...(registrationWarnings.length > 0 ? { warnings: registrationWarnings } : {}),
  });
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
    const { person, branch } = splitFlatStudentInput(v.data);
    const res = await registerStudentCore(ctx, person, [{ input: branch }], {});
    if (!res.ok) return res;
    const { enrollmentIds: _enrollmentIds, duplicate: _duplicate, ...out } = res.data;
    void _enrollmentIds;
    void _duplicate;
    return ok(out);
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "createStudent failed");
  }
}

/** Tenant "Yeni Öğrenci Kaydı" yapılandırmasının BRANŞA özgü alanları (kişi düzeyi geçişinden ayrı uygulanır). */
const ENROLLMENT_LEVEL_FORM_CONFIG_KEYS = new Set<string>(["level", "targetExam", "enrollmentStartDate", "enrollmentEndDate"]);

export type RegisterWithEnrollmentsFailureDetails = {
  /** Branş taslağı anahtarı → alan adı → Türkçe hata. Anahtarsız genel hata `formError`'dadır. */
  enrollmentErrors?: Record<string, Record<string, string>>;
  fieldErrors?: Record<string, string[]>;
};

/**
 * 2026-10-10 — Kayıt formu: KİŞİ + N EŞİT BRANŞ (her biri eksiksiz ayarlarla) TEK işlemde. Doğrulama istemciyle AYNI
 * fonksiyondan (enrollment-form.ts) geçer; sunucu yine de asıl kapıdır. Yarım kayıt oluşmaz: ya öğrenci + tüm branşlar +
 * her branşın ilk tahsilatı birlikte yazılır, ya hiçbiri.
 */
export async function registerStudentWithEnrollmentsTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ studentId: string; tempLoginPassword?: string; warnings?: string[]; duplicate?: boolean; enrollmentIds: string[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  // Kurum yapılandırması: kişi düzeyi alanlar bir geçişte, branşa özgü alanlar (seviye, hedef sınav, kayıt tarihi) taslak başına.
  const formConfig = await getStudentFormConfig(ctx.tenantId);
  const personShaped = applyStudentFormConfig(
    { ...formConfig, fields: formConfig.fields.filter((f) => !ENROLLMENT_LEVEL_FORM_CONFIG_KEYS.has(f.key)) },
    raw,
    ctx.role
  );
  if (!personShaped.ok) return fail("VALIDATION_ERROR", personShaped.message);
  const v = parseOrFail(studentRegistrationSchema, personShaped.value);
  if (!v.ok) return v;

  const drafts = v.data.enrollmentDrafts.map(coerceEnrollmentDraft);
  const keys = new Set<string>();
  for (const d of drafts) {
    if (keys.has(d.key)) d.key = newEnrollmentKey();
    keys.add(d.key);
  }
  const enrollCfg = { ...formConfig, fields: formConfig.fields.filter((f) => ENROLLMENT_LEVEL_FORM_CONFIG_KEYS.has(f.key)) };
  for (const [i, d] of drafts.entries()) {
    const cfg = applyStudentFormConfig(enrollCfg, { level: d.level, targetExam: d.targetExam, enrollmentStartDate: d.startDate }, ctx.role);
    if (!cfg.ok) return fail("VALIDATION_ERROR", `${draftLabel(d, i)}: ${cfg.message}`);
    d.level = typeof cfg.value.level === "string" ? cfg.value.level : "";
    d.targetExam = typeof cfg.value.targetExam === "string" ? cfg.value.targetExam : "";
    d.startDate = typeof cfg.value.enrollmentStartDate === "string" ? cfg.value.enrollmentStartDate : "";
  }

  const errors = validateEnrollmentDrafts(drafts, { mode: "register" });
  if (Object.keys(errors).length > 0) {
    const summary = summarizeEnrollmentErrors(drafts, errors, 3);
    return fail("VALIDATION_ERROR", `Branş bilgilerinde düzeltilmesi gereken alanlar var: ${summary.join(" · ")}`, {
      enrollmentErrors: errors,
    } satisfies RegisterWithEnrollmentsFailureDetails);
  }

  const { parseRegistrationFirstPaymentForm } = await import("../first-payment-adjustment");
  const branches: { key: string; input: BranchRegistrationInput }[] = [];
  for (const d of drafts) {
    const n = normalizeEnrollmentDraft(d);
    const fp = parseRegistrationFirstPaymentForm({
      method: d.firstPayment.method,
      amount: d.firstPayment.amount,
      collectedAt: d.firstPayment.collectedAt,
      reference: d.firstPayment.reference,
      note: d.firstPayment.note,
    });
    if (!fp.ok) {
      return fail("VALIDATION_ERROR", fp.message, {
        enrollmentErrors: { [d.key]: { "firstPayment.amount": fp.message } },
      } satisfies RegisterWithEnrollmentsFailureDetails);
    }
    branches.push({
      key: d.key,
      input: {
        instrument: n.instrument,
        teacherId: n.teacherId,
        branchId: n.branchId,
        packageName: DEFAULT_REGISTRATION_PACKAGE_NAME,
        weeklyLessonCount: n.weeklyLessonCount,
        monthlyFee: n.freeMonthlyFee ?? 0,
        studentTypes: n.studentTypes.length > 0 ? n.studentTypes : undefined,
        enrollmentStartDate: n.startDate!,
        lessonStartDate: n.lessonStartDate,
        intendedDurationMonths: n.intendedDurationMonths,
        lessonScheduleText: n.lessonScheduleText,
        lessonDays: n.lessonDays,
        level: n.level,
        targetExam: n.targetExam,
        mebLevelStartDate: n.mebLevelStartDate,
        mebLevelEndDate: n.mebLevelEndDate,
        mebExamDate: n.mebExamDate,
        mebExamAttended: n.mebExamAttended,
        packageId: n.packageId,
        lessonDurationMinutes: n.lessonDurationMinutes,
        discountType: n.discountType as "percent" | "amount" | undefined,
        discountValue: n.discountValue,
        campaignIds: n.campaignIds.length > 0 ? n.campaignIds : undefined,
        paymentMethod: n.paymentMethod,
        paymentDueDay: n.paymentDueDay,
        monthlyFeeOverrideAmount: n.monthlyFeeOverrideAmount,
        monthlyFeeOverrideReason: n.monthlyFeeOverrideReason,
        firstPaymentCollected: {
          method: fp.value.method,
          amount: fp.value.amount,
          collectedAt: fp.value.collectedAt,
          reference: fp.value.reference,
          note: fp.value.note,
        },
        firstPaymentAdjustmentReason: d.firstPayment.adjustmentReason.trim() || undefined,
        firstCollectionIncludesNextMonth: d.firstPayment.includeNextMonth ?? undefined,
      },
    });
  }

  try {
    const { enrollmentDrafts: _drafts, registrationId, ...person } = v.data;
    void _drafts;
    const res = await registerStudentCore(ctx, person as unknown as PersonRegistrationInput, branches, { registrationId });
    if (!res.ok) {
      const details = (res.error.details ?? {}) as { branchKey?: string; field?: string; fieldErrors?: Record<string, string[]> };
      if (details.branchKey) {
        const errs: Record<string, string> = {};
        const mapped: Record<string, string> = {
          lessonDays: "lessonScheduleText",
          firstPaymentAmount: "firstPayment.amount",
          firstPaymentAdjustmentReason: "firstPayment.adjustmentReason",
          mebExamAttended: "mebExamStatus",
        };
        for (const [k, msgs] of Object.entries(details.fieldErrors ?? {})) {
          if (msgs?.[0]) errs[mapped[k] ?? k] = msgs[0];
        }
        if (Object.keys(errs).length === 0) errs[details.field ?? "instrument"] = res.error.message;
        return fail(res.error.code, res.error.message, {
          enrollmentErrors: { [details.branchKey]: errs },
        } satisfies RegisterWithEnrollmentsFailureDetails);
      }
      return res;
    }
    return ok(res.data);
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "registerStudent failed");
  }
}

/**
 * Öğrencinin eğitim profilini günceller (EPIC 4): tür, kayıt dönemi,
 * seviye, hedef sınav, özel not. Öğrencinin temel iletişim/paket bilgilerini
 * değiştirmez — o alanlar için ayrı bir yol yok (mevcut kapsam dışı).
 */
/**
 * 2026-10-04 — öğrencinin bir eğitimini ekler/günceller/kapatır (tek öğrenci, N eğitim).
 * 2026-10-10 — BRANŞ KAYDI v2: her branş eşit ve bağımsızdır; kendi öğrenci türü (MEB dahil), seviye, paketi/ücreti,
 * indirimi, ödeme yöntemi/günü, kayıt ve ders başlangıç tarihleri, ders gün/saati, sözleşme süresi ve (yeni branşta)
 * kayıt anı ilk tahsilatıyla tutulur; birini değiştirmek diğerini EZMEZ. Öğrenci satırındaki eski alanlar yalnız bir
 * uyumluluk aynasıdır (`mirrorPatchFromEnrollments`) — başka bir branşın koşulu için kaynak olarak OKUNMAZ.
 * Yeni branş ekleme ATOMİKTİR (`changeStudentEnrollments`: branş kaydı + ilk tahsilat tek işlemde, kilit altında çift
 * gönderim/aynı enstrüman+öğretmen engeli). İkinci branş eklenirken ÖNCEKİ tek branşın yapısal olarak sahibi belli
 * kayıtları (sözleşme, kayıt ilk tahsilatı, aylık plan, derse bağlı tahsilat, enstrümanı eşleşen ders/seri) ona bağlanır;
 * elle girilmiş genel ödemeler OTOMATİK bağlanmaz ("Branşa bağla" ile açıkça).
 * Kayıt silinmez — sonlandırma `active:false` + bitiş tarihi + gerekçe; öğrencinin başka aktif branşı etkilenmez.
 */
const ymdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarihi takvimden seçin.");
/** Boş metin = "alanı temizle" (düzenleme kipinde). */
const clearableYmdSchema = z.union([ymdSchema, z.literal("")]);
const enrollmentInputSchema = z.object({
  id: z.string().min(1).optional(),
  instrument: z.string().min(1, "Enstrüman seçin."),
  teacherId: z.string().min(1, "Öğretmen seçin."),
  lessonDurationMinutes: z.coerce.number().refine((n) => [30, 40, 50].includes(n), "Ders süresi 30, 40 veya 50 dakika olmalı."),
  weeklyLessonCount: z.coerce.number().int().min(1, "Haftalık ders sayısı en az 1 olmalı.").max(7).optional(),
  /** Branşın ayrı şubesi; kişinin şubesiyle aynı ya da boşsa kişinin şubesini devralır. */
  branchId: z.string().max(100).optional(),
  active: z.boolean().optional(),
  /** Geriye uyum — yok sayılır: öğrenci satırı aynasının kaynağı sistem tarafından seçilir (bkz. student-enrollments.ts mirrorSourceOf). */
  primary: z.boolean().optional(),
  studentTypes: z
    .array(z.string())
    .max(STUDENT_TYPES.length)
    .refine((xs) => xs.every((x) => (STUDENT_TYPES as string[]).includes(x)), "Geçersiz öğrenci türü; listeden seçin.")
    .optional(),
  packageId: z.string().max(100).optional(),
  monthlyFee: z.coerce.number().int("Aylık ücret tam TL olmalı.").min(0, "Aylık ücret negatif olamaz.").max(1_000_000).optional(),
  /** "none" = mevcut indirimi kaldır. */
  discountType: z.enum(["percent", "amount", "none"]).optional(),
  discountValue: z.coerce.number().min(0).optional(),
  monthlyFeeOverrideAmount: z.coerce.number().int().min(0).optional(),
  /** true = mevcut elle girilmiş aylık ücreti kaldır (paket fiyatına dön). */
  dropFeeOverride: z.boolean().optional(),
  monthlyFeeOverrideReason: z.string().trim().max(300).optional(),
  paymentMethod: z.enum(["credit_card", "cash", "transfer"]).optional(),
  paymentDueDay: z.coerce.number().int().min(1).max(31).optional(),
  startDate: ymdSchema.optional(),
  lessonStartDate: clearableYmdSchema.optional(),
  lessonScheduleText: z.string().trim().max(300).optional(),
  intendedDurationMonths: z.coerce.number().int().min(1).max(12).optional(),
  endDate: ymdSchema.optional(),
  endReason: z.string().trim().max(300).optional(),
  /** 2026-10-10 — seviye ve MEB bilgileri BRANŞA özgüdür (boş metin / null = temizle). */
  level: z.string().trim().max(60).optional(),
  targetExam: z.string().trim().max(200).optional(),
  mebLevelStartDate: clearableYmdSchema.optional(),
  mebLevelEndDate: clearableYmdSchema.optional(),
  mebExamDate: clearableYmdSchema.optional(),
  mebExamAttended: z.boolean().nullable().optional(),
  /** Yeni branş eklerken kampanyalar (düzenlemede kampanya uygulanmaz). */
  campaignIds: z.array(z.string().min(1)).max(10).optional(),
  /** Yeni branşın kayıt anı ilk tahsilatı — yeni öğrenci kaydıyla AYNI kurallar (önerilen tutar, gerekçe, 0 TL yalnız burslu). */
  firstPayment: z
    .object({
      method: z.enum(["credit_card", "cash", "transfer"]).optional(),
      amount: z.coerce.number().int().min(0),
      collectedAt: ymdSchema.optional(),
      reference: z.string().trim().max(120).optional(),
      note: z.string().trim().max(300).optional(),
      adjustmentReason: z.string().trim().max(300).optional(),
      includeNextMonth: z.boolean().optional(),
    })
    .optional(),
  /** İyimser eşzamanlılık: kayıt bu zamandan sonra değiştiyse yazım reddedilir. */
  expectedUpdatedAt: z.string().max(40).optional(),
});

export type UpsertEnrollmentFailureDetails = { field?: string; fieldErrors?: Record<string, string[]> };

export async function upsertStudentEnrollmentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<
  ServiceResult<{
    studentId: string;
    enrollmentId: string;
    enrollments: import("../types").StudentEnrollment[];
    warnings?: string[];
    paymentId?: string;
  }>
> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", "Branş kayıtlarını yalnız kurum yöneticisi veya kurum sahibi düzenleyebilir.");
  const v = parseOrFail(z.object({ studentId: z.string().min(1), enrollment: enrollmentInputSchema }), input);
  if (!v.ok) return v;
  // DB egress (2026-10-18): öğrenci dilimi (öğrencinin dersleri + referans veri) — eskiden tam okuma.
  const data = await readStudentScope(v.data.studentId);
  const student = data.students.find((st) => st.id === v.data.studentId);
  if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı. Sayfayı yenileyip tekrar deneyin.");
  const e = v.data.enrollment;
  const instruments = await resolveActiveInstrumentNames(ctx.tenantId);
  if (!instruments.includes(e.instrument)) {
    return fail("VALIDATION_ERROR", `"${e.instrument}" kurumun aktif enstrüman kataloğunda yok. Ayarlar → Enstrümanlar ekranından ekleyin veya listeden seçin.`, { field: "instrument" });
  }
  const teacher = data.teachers.find((t) => t.id === e.teacherId);
  if (!teacher || !isTeacherSchedulable(teacher)) {
    return fail("VALIDATION_ERROR", "Seçilen öğretmen bulunamadı veya aktif değil. Aktif bir öğretmen seçin.", { field: "teacherId" });
  }
  if (!teacher.instruments.includes(e.instrument as Instrument)) {
    return fail("VALIDATION_ERROR", `${teacher.name} "${e.instrument}" eğitimi vermiyor. Bu enstrümanı veren bir öğretmen seçin veya öğretmen kartına enstrümanı ekleyin.`, { field: "teacherId" });
  }
  if (e.branchId && !data.settings.branches.some((b) => b.id === e.branchId)) {
    return fail("VALIDATION_ERROR", "Seçilen şube bulunamadı. Listeden geçerli bir şube seçin.", { field: "branchId" });
  }
  const { LEGACY_ENROLLMENT_PREFIX, enrollmentTerms, lessonEnrollmentId } = await import("../student-enrollments");
  const { ensurePersistedEnrollments, linkStudentHistoryToEnrollment, materializedEnrollmentId } = await import("../enrollment-links");
  const nowIso = new Date().toISOString();
  const todayYmd = toZonedYmd(new Date(), resolveAppTimezone());
  // Eski kayıt → kalıcı branş kayıtları (deterministik kimlik; tek branşlıysa bağsız yapısal kayıtlar ona bağlanır).
  const beforeList: import("../types").StudentEnrollment[] = await ensurePersistedEnrollments(ctx.tenantId, student, data.teachers);
  const studentView = { ...student, enrollments: beforeList };
  const targetId = e.id?.startsWith(LEGACY_ENROLLMENT_PREFIX) ? materializedEnrollmentId(student.id, e.id.split(":").pop() ?? "") : e.id;
  const existing = targetId ? beforeList.find((x) => x.id === targetId) : undefined;
  if (e.id && !existing) return fail("NOT_FOUND", "Düzenlenen branş kaydı bulunamadı. Sayfayı yenileyip tekrar deneyin.");
  if (existing && existing.instrument !== e.instrument) {
    return fail("VALIDATION_ERROR", "Mevcut branş kaydının enstrümanı değiştirilemez (geçmiş ders/sözleşme bu kayda bağlı). Yeni enstrüman için \"Branş kaydı ekle\" ile ayrı kayıt açın.");
  }
  const nextActive = e.active ?? existing?.active ?? true;
  // Çift gönderim (aynı satır 60 sn içinde ikinci kez) ≠ meşru ek branş: ilki sessizce döner, ikinci kayıt/tahsilat açılmaz.
  const duplicate = beforeList.find(
    (x) => x.id !== existing?.id && x.active && nextActive && x.instrument === e.instrument && x.teacherId === e.teacherId
  );
  if (duplicate) {
    if (!existing && Date.now() - new Date(duplicate.createdAt).getTime() <= 60_000 && duplicate.lessonDurationMinutes === e.lessonDurationMinutes) {
      return ok({ studentId: student.id, enrollmentId: duplicate.id, enrollments: beforeList });
    }
    return fail("CONFLICT", `Bu öğrencinin ${teacher.name} ile aktif bir ${e.instrument} branş kaydı zaten var. Mevcut kaydı düzenleyin; farklı öğretmenle ayrı bir ${e.instrument} kaydı gerekiyorsa öğretmeni değiştirin.`, { field: "teacherId" });
  }
  if (e.lessonScheduleText?.trim()) {
    const { parseLessonScheduleText } = await import("../lesson-schedule-text");
    if (parseLessonScheduleText(e.lessonScheduleText).length === 0) {
      return fail("VALIDATION_ERROR", "Ders gün/saati okunamadı. \"Salı 15:00, Perşembe 16:00\" biçiminde yazın.", { field: "lessonScheduleText" });
    }
  }
  if (e.monthlyFeeOverrideAmount !== undefined && (e.monthlyFeeOverrideReason ?? "").length < 3) {
    return fail("VALIDATION_ERROR", "Aylık ücreti elle değiştirirken gerekçe yazın (en az 3 karakter).", { field: "overrideReason" });
  }

  /* ----------------------------------------------------------------------------------------------- YENİ BRANŞ */
  if (!existing) {
    const { lessonWeekdaysFromText } = await import("../lesson-schedule-text");
    const branchInput: BranchRegistrationInput = {
      instrument: e.instrument,
      teacherId: e.teacherId,
      branchId: e.branchId || undefined,
      weeklyLessonCount: e.weeklyLessonCount ?? 1,
      monthlyFee: e.monthlyFee ?? 0,
      enrollmentStartDate: e.startDate ?? todayYmd,
      studentTypes: e.studentTypes && e.studentTypes.length > 0 ? (e.studentTypes as import("../types").StudentType[]) : undefined,
      level: e.level || undefined,
      targetExam: e.targetExam || undefined,
      mebLevelStartDate: e.mebLevelStartDate || undefined,
      mebLevelEndDate: e.mebLevelEndDate || undefined,
      mebExamDate: e.mebExamDate || undefined,
      mebExamAttended: e.mebExamAttended ?? undefined,
      packageId: e.packageId || undefined,
      lessonDurationMinutes: e.lessonDurationMinutes,
      discountType: e.discountType && e.discountType !== "none" ? e.discountType : undefined,
      discountValue: e.discountValue,
      campaignIds: e.campaignIds && e.campaignIds.length > 0 ? e.campaignIds : undefined,
      paymentMethod: e.paymentMethod,
      paymentDueDay: e.paymentDueDay,
      monthlyFeeOverrideAmount: e.monthlyFeeOverrideAmount,
      monthlyFeeOverrideReason: e.monthlyFeeOverrideReason,
      lessonStartDate: e.lessonStartDate || undefined,
      lessonScheduleText: e.lessonScheduleText || undefined,
      lessonDays: e.lessonScheduleText ? lessonWeekdaysFromText(e.lessonScheduleText) : undefined,
      intendedDurationMonths: e.intendedDurationMonths,
      enrollmentEndDate: undefined,
      firstPaymentCollected: e.firstPayment
        ? {
            method: e.firstPayment.method,
            amount: e.firstPayment.amount,
            collectedAt: e.firstPayment.collectedAt,
            reference: e.firstPayment.reference,
            note: e.firstPayment.note,
          }
        : undefined,
      firstPaymentAdjustmentReason: e.firstPayment?.adjustmentReason || undefined,
      firstCollectionIncludesNextMonth: e.firstPayment?.includeNextMonth,
    };
    if (e.firstPayment && e.firstPayment.amount > 0 && (!e.firstPayment.method || !e.firstPayment.collectedAt)) {
      return fail("VALIDATION_ERROR", "İlk tahsilat için ödeme yöntemi ve tahsilat tarihi zorunludur (tutar 0'dan büyük).", {
        field: "firstPayment.amount",
      });
    }
    const prepared = await prepareBranchRegistration(
      ctx,
      data,
      { branchId: student.branchId, termType: student.termType },
      branchInput,
      { enrollmentId: uid("enr"), nowIso, firstPaymentOptional: true }
    );
    if (!prepared.ok) return prepared;
    const p = prepared.data;
    const fp = p.firstPaymentCollected;
    const fpRecord =
      fp && !p.noFirstCollection
        ? {
            enrollmentId: p.record.id,
            method: fp.method!,
            amount: fp.amount,
            collectedAt: fp.collectedAt!,
            reference: fp.reference,
            note: fp.note,
            receivedByUserId: ctx.userId,
            firstCollectionIncludesNextMonth: p.includesNextMonth,
            ...p.firstCollectionPeriods,
            ...(p.adjustment?.isManualOverride
              ? { autoSuggestedAmount: p.adjustment.autoSuggestedAmount, adjustmentReason: p.adjustment.reason, adjustedBy: ctx.userId, adjustedAt: nowIso }
              : {}),
          }
        : undefined;
    const res = await changeStudentEnrollments({
      studentId: student.id,
      change: { kind: "add", record: p.record },
      teachers: data.teachers,
      firstPayment: fpRecord,
    });
    if (!res.ok) {
      if (res.code === "DUPLICATE" && res.existingId) {
        // Eşzamanlı çift gönderim: ilk istek kaydı ve tahsilatı yazdı; ikincisi sessizce o kaydı döner (ikinci kayıt/tahsilat YOK).
        const fresh = (await readStudentById(student.id))?.enrollments ?? beforeList;
        const winner = fresh.find((x) => x.id === res.existingId);
        if (winner && Date.now() - new Date(winner.createdAt).getTime() <= 60_000 && winner.lessonDurationMinutes === e.lessonDurationMinutes) {
          return ok({ studentId: student.id, enrollmentId: winner.id, enrollments: fresh });
        }
      }
      return fail(res.code === "NO_ACTIVE" ? "VALIDATION_ERROR" : "CONFLICT", res.message, { field: res.code === "DUPLICATE" ? "teacherId" : undefined });
    }

    const warnings: string[] = [...p.registrationWarnings];
    // İkinci branş eklenirken: önceki TEK branşın yapısal olarak sahibi belli kayıtları ona bağlanır (sonradan bölünmesin).
    let linked: { contracts: number; payments: number; lessons: number; series: number } | undefined;
    if (beforeList.length === 1) {
      try {
        linked = await linkStudentHistoryToEnrollment(ctx.tenantId, student.id, beforeList[0]!);
      } catch (err) {
        logger.warn("upsertStudentEnrollment — geçmiş kayıtlar branşa bağlanamadı (branş kaydı oluştu)", {
          error: err instanceof Error ? err.message : String(err),
        });
        warnings.push(
          `${beforeList[0]!.instrument} branşının geçmiş kayıtları otomatik bağlanamadı; Sözleşme Merkezi / Ödemeler sekmesindeki "Branşa bağla" ile bağlayın.`
        );
      }
    }
    if (!e.firstPayment) {
      warnings.push(
        `${e.instrument} branşı için kayıt anı ilk tahsilat alınmadı. Bu branşın ilk sözleşmesinde "İlk tahsilat" bölümünden girilir; sözleşmesiz kullanılacaksa Yoklama Takvimi ay kutusundan tahsil edilir.`
      );
    } else if (p.noFirstCollection) {
      audit(ctx, "student.first_payment_waived", "Student", student.id, {
        studentId: student.id,
        enrollmentId: p.record.id,
        autoSuggestedAmount: p.autoSuggestedAmount,
        monthlyFee: p.pricing.monthlyFee,
      });
    } else if (res.paymentId) {
      audit(ctx, "student.first_payment_collected", "Payment", res.paymentId, {
        studentId: student.id,
        enrollmentId: p.record.id,
        method: fp!.method!,
        amount: fp!.amount,
      });
      if (p.adjustment?.isManualOverride) {
        const { buildFirstPaymentAdjustmentAuditEntry } = await import("../first-payment-adjustment");
        audit(ctx, "student.first_payment_adjusted", "Payment", res.paymentId, {
          ...buildFirstPaymentAdjustmentAuditEntry(p.adjustment, {
            tenantId: ctx.tenantId,
            studentId: student.id,
            paymentId: res.paymentId,
            adjustedBy: ctx.userId,
          }),
          enrollmentId: p.record.id,
        });
      }
    }
    for (const cid of p.appliedCampaignIds ?? []) {
      try {
        const latest = (await readReferenceData()).discountCampaigns.find((c) => c.id === cid);
        if (!latest) continue;
        await updateDiscountCampaign(cid, { usageCount: (latest.usageCount ?? 0) + 1 });
      } catch {
        // sayaç artışı kaydı engellemez
      }
    }
    audit(ctx, "student.enrollment_add", "Student", student.id, {
      enrollmentId: p.record.id,
      instrument: p.record.instrument,
      teacherId: p.record.teacherId,
      lessonDurationMinutes: p.record.lessonDurationMinutes,
      studentTypes: p.record.studentTypes,
      packageId: p.record.packageId,
      monthlyFee: p.pricing.monthlyFee,
      firstPaymentAmount: fp?.amount,
      ...(linked ? { linkedHistory: linked } : {}),
    });
    return ok({
      studentId: student.id,
      enrollmentId: p.record.id,
      enrollments: res.enrollments,
      ...(res.paymentId ? { paymentId: res.paymentId } : {}),
      ...(warnings.length ? { warnings } : {}),
    });
  }

  /* ------------------------------------------------------------------------------------------ MEVCUT BRANŞ */
  const current = enrollmentTerms(studentView, existing, data.teachers);
  const weekly = e.weeklyLessonCount ?? current.weeklyLessonCount ?? 1;
  const packageId = e.packageId !== undefined ? e.packageId || undefined : current.packageId;
  if (!packageId && ((e.discountType && e.discountType !== "none") || e.discountValue !== undefined || e.monthlyFeeOverrideAmount !== undefined)) {
    return fail("VALIDATION_ERROR", "İndirim/manuel ücret yalnızca bir paket seçildiğinde uygulanabilir. Paket seçin veya aylık ücreti doğrudan yazın.", { field: "discountValue" });
  }
  let monthlyFee = e.monthlyFee ?? current.monthlyFee ?? 0;
  let packageName: string | undefined = packageId === current.packageId ? current.packageName : undefined;
  let packageBaseMonthlyFee: number | undefined;
  let discountType: Student["discountType"] = e.discountType === "none" ? undefined : (e.discountType ?? current.discountType);
  let discountValue = e.discountType === "none" ? undefined : (e.discountValue ?? current.discountValue);
  let manualOverride = false;
  let overrideReason: string | undefined;
  if (packageId) {
    const pkg = (data.packages ?? []).find((pk) => pk.id === packageId && (pk.status === "active" || pk.id === current.packageId));
    if (!pkg) return fail("VALIDATION_ERROR", "Seçilen paket bulunamadı veya aktif değil. Paketler ekranından aktif bir paket seçin.", { field: "packageId" });
    const keepOverride =
      !e.dropFeeOverride &&
      e.monthlyFeeOverrideAmount === undefined &&
      current.monthlyFeeManualOverride &&
      packageId === current.packageId &&
      e.lessonDurationMinutes === current.lessonDurationMinutes;
    const rp = resolveEnrollmentPricing({
      pkg,
      durationMinutes: e.lessonDurationMinutes as import("../lesson-duration").LessonDurationMinutes,
      discountType,
      discountValue,
      overrideAmount: e.monthlyFeeOverrideAmount ?? (keepOverride ? current.monthlyFee : undefined),
    });
    monthlyFee = rp.monthlyFee;
    packageBaseMonthlyFee = rp.packageBaseMonthlyFee;
    packageName = pkg.title;
    manualOverride = rp.monthlyFeeManualOverride;
    overrideReason = manualOverride ? e.monthlyFeeOverrideReason || current.monthlyFeeOverrideReason : undefined;
  } else {
    packageName = undefined;
    discountType = undefined;
    discountValue = undefined;
  }
  const studentTypesNext = (e.studentTypes as import("../types").StudentType[] | undefined) ?? current.studentTypes;
  const level = e.level !== undefined ? e.level || undefined : current.level;
  const targetExam = e.targetExam !== undefined ? e.targetExam || undefined : current.targetExam;
  const mebStart = e.mebLevelStartDate !== undefined ? e.mebLevelStartDate || undefined : current.mebLevelStartDate?.slice(0, 10);
  const mebEnd = e.mebLevelEndDate !== undefined ? e.mebLevelEndDate || undefined : current.mebLevelEndDate?.slice(0, 10);
  const mebExam = e.mebExamDate !== undefined ? e.mebExamDate || undefined : current.mebExamDate?.slice(0, 10);
  const mebAttended = e.mebExamAttended !== undefined ? e.mebExamAttended ?? undefined : current.mebExamAttended;
  const resultingMeb = studentTypesNext.some((t) => t === "MEB");
  const sameTypes = studentTypesNext.length === current.studentTypes.length && studentTypesNext.every((t) => current.studentTypes.includes(t));
  const touchesMeb =
    !sameTypes ||
    e.level !== undefined ||
    e.mebLevelStartDate !== undefined ||
    e.mebLevelEndDate !== undefined ||
    e.mebExamDate !== undefined ||
    e.mebExamAttended !== undefined;
  if (resultingMeb && touchesMeb) {
    const mebCheck = validateMebFields({
      studentTypes: studentTypesNext,
      level,
      mebLevelStartDate: mebStart,
      mebLevelEndDate: mebEnd,
      mebExamDate: mebExam,
      mebExamAttended: mebAttended,
    });
    if (!mebCheck.ok) {
      return fail("VALIDATION_ERROR", "MEB alanlarını kontrol edin — işaretli alanlarda eksik veya hatalı bilgi var.", {
        fieldErrors: mebCheck.fieldErrors,
      });
    }
  }
  const paymentDueDay = e.paymentDueDay ?? current.paymentDueDay;
  const closing = !nextActive && existing.active;
  const reopening = nextActive && !existing.active;
  const lifecycleEnd = closing ? (e.endDate ?? todayYmd) : e.endDate;
  const startDate = e.startDate ?? current.startDate ?? existing.startDate;
  if (lifecycleEnd && startDate && lifecycleEnd < startDate) {
    return fail("VALIDATION_ERROR", "Branş bitiş tarihi kayıt tarihinden önce olamaz. Bitiş tarihini düzeltin.", { field: "endDate" });
  }

  const terms: Partial<import("../types").StudentEnrollment> = {
    teacherId: e.teacherId,
    lessonDurationMinutes: e.lessonDurationMinutes,
    weeklyLessonCount: weekly,
    studentTypes: studentTypesNext,
    monthlyFee,
    monthlyFeeManualOverride: manualOverride,
    active: nextActive,
    ...(e.branchId !== undefined && e.branchId && e.branchId !== student.branchId ? { branchId: e.branchId as BranchId } : {}),
  };
  const clear: (keyof import("../types").StudentEnrollment)[] = [];
  const setOrClear = <K extends keyof import("../types").StudentEnrollment>(key: K, value: import("../types").StudentEnrollment[K] | undefined) => {
    if (value === undefined) clear.push(key);
    else (terms as Record<string, unknown>)[key] = value;
  };
  if (e.branchId !== undefined && (!e.branchId || e.branchId === student.branchId)) clear.push("branchId");
  setOrClear("packageId", packageId);
  setOrClear("packageName", packageName);
  setOrClear("packageBaseMonthlyFee", packageBaseMonthlyFee);
  setOrClear("discountType", discountType);
  setOrClear("discountValue", discountValue);
  setOrClear("monthlyFeeOverrideReason", overrideReason);
  setOrClear("derivedPerLessonAmount", monthlyFee > 0 ? derivePerLessonAmount(monthlyFee, weekly) : undefined);
  setOrClear("paymentMethod", e.paymentMethod ?? current.paymentMethod);
  if (paymentDueDay !== undefined) {
    terms.paymentDueDay = paymentDueDay;
    if (e.paymentDueDay !== undefined) terms.paymentDueRanges = [{ start: paymentDueDay, end: paymentDueDay }];
  }
  if (e.startDate !== undefined) terms.startDate = e.startDate;
  if (e.lessonStartDate !== undefined) setOrClear("lessonStartDate", e.lessonStartDate || undefined);
  if (e.lessonScheduleText !== undefined) setOrClear("lessonScheduleText", e.lessonScheduleText || undefined);
  if (e.intendedDurationMonths !== undefined) terms.intendedDurationMonths = e.intendedDurationMonths;
  // Seviye/MEB: sonuç MEB ise birleştirilmiş değerler yazılır; MEB değilse kayıtlı eski MEB verisi SİLİNMEZ (UI gizler).
  if (e.level !== undefined) setOrClear("level", level);
  if (e.targetExam !== undefined) setOrClear("targetExam", targetExam);
  if (resultingMeb) {
    if (e.mebLevelStartDate !== undefined) setOrClear("mebLevelStartDate", mebStart);
    if (e.mebLevelEndDate !== undefined) setOrClear("mebLevelEndDate", mebEnd);
    if (e.mebExamDate !== undefined) setOrClear("mebExamDate", mebExam);
    if (e.mebExamAttended !== undefined) setOrClear("mebExamAttended", mebAttended);
  }
  if (closing) {
    terms.endDate = lifecycleEnd!;
    if (e.endReason) terms.endReason = e.endReason;
    else clear.push("endReason");
    terms.endedByUserId = ctx.userId;
  } else if (reopening) {
    clear.push("endDate", "endReason", "endedByUserId");
  } else if (e.endDate !== undefined) {
    terms.endDate = e.endDate;
  }

  const res = await changeStudentEnrollments({
    studentId: student.id,
    change: { kind: "patchTerms", enrollmentId: existing.id, terms, clear, expectedUpdatedAt: e.expectedUpdatedAt },
    teachers: data.teachers,
  });
  if (!res.ok) {
    return fail(res.code === "STALE" ? "CONFLICT" : res.code === "NOT_FOUND" ? "NOT_FOUND" : "VALIDATION_ERROR", res.message);
  }
  const record = res.changed;
  const list = res.enrollments;

  // Kapanan branşın açık işleri SESSİZCE iptal edilmez — kullanıcıya söylenir.
  const warnings: string[] = [];
  if (closing) {
    const refreshed = { ...student, enrollments: list };
    const futureLessons = data.lessons.filter(
      (l) =>
        l.studentId === student.id &&
        l.status === "scheduled" &&
        l.type !== "group" &&
        l.startAt.slice(0, 10) > (record.endDate ?? todayYmd) &&
        lessonEnrollmentId(refreshed, l, data.teachers) === record.id
    ).length;
    const liveContracts = (await listContractsForStudent(ctx.tenantId, student.id)).filter(
      (c) => c.enrollmentId === record.id && c.status !== "cancelled" && c.status !== "superseded"
    );
    if (futureLessons > 0) {
      warnings.push(`${record.instrument} branşının bitiş tarihinden sonra ${futureLessons} planlı dersi var; dersler otomatik iptal edilmedi. Ders Programı'ndan iptal edin.`);
    }
    if (liveContracts.length > 0) {
      warnings.push(`${record.instrument} branşının aktif sözleşmesi var (${liveContracts.map((c) => c.contractNumber).join(", ")}); sözleşme ve taksitleri değişmedi. Gerekiyorsa Sözleşme Merkezi'nden iptal edin veya revize edin.`);
    }
  }
  audit(ctx, closing ? "student.enrollment_end" : "student.enrollment_update", "Student", student.id, {
    enrollmentId: record.id,
    instrument: record.instrument,
    teacherId: record.teacherId,
    previousTeacherId: existing.teacherId,
    lessonDurationMinutes: record.lessonDurationMinutes,
    active: record.active,
    studentTypes: studentTypesNext,
    packageId,
    monthlyFee,
    previousMonthlyFee: current.monthlyFee,
    ...(closing ? { endDate: record.endDate, endReason: record.endReason } : {}),
  });
  return ok({ studentId: student.id, enrollmentId: record.id, enrollments: list, ...(warnings.length ? { warnings } : {}) });
}

/**
 * 2026-10-09 — "Branşa bağla": branşı belirtilmemiş (NULL) bir sözleşmeyi (tüm sürüm zinciriyle) veya sözleşmesiz
 * bir ödeme satırını AÇIKÇA bir branş kaydına bağlar. Yalnız bağsız kayıt bağlanır; bir branşa bağlı kayıt başka
 * branşa TAŞINMAZ (finansal geçmiş sessizce yer değiştirmez). Sözleşmenin taksitleri, serileri ve o serilerin
 * dersleri de aynı branşa bağlanır.
 */
export async function assignRecordEnrollmentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ contracts: number; payments: number; lessons: number; series: number }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", "Kayıtları branşa yalnız kurum yöneticisi veya kurum sahibi bağlayabilir.");
  const v = parseOrFail(
    z
      .object({
        studentId: z.string().min(1),
        enrollmentId: z.string().min(1, "Branş kaydını seçin."),
        contractId: z.string().min(1).optional(),
        paymentId: z.string().min(1).optional(),
      })
      .refine((x) => !!x.contractId !== !!x.paymentId, "Bağlanacak sözleşmeyi veya ödemeyi seçin."),
    input
  );
  if (!v.ok) return v;
  const data = await readData();
  const student = data.students.find((st) => st.id === v.data.studentId);
  if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı. Sayfayı yenileyip tekrar deneyin.");
  const se = await import("../student-enrollments");
  const view = se.effectiveEnrollments(student, data.teachers).find((x) => x.id === v.data.enrollmentId);
  if (!view) return fail("VALIDATION_ERROR", "Seçilen branş kaydı bu öğrenciye ait değil. Sayfayı yenileyip yeniden seçin.");
  let enrollment: Pick<import("../types").StudentEnrollment, "id" | "instrument"> = view;
  if (!se.isPersistedEnrollmentId(view.id)) {
    // Kalıcı kaydı olmayan eski öğrenci: branşlar önce kalıcı yapılır (deterministik kimlik).
    const { ensurePersistedEnrollments, materializedEnrollmentId } = await import("../enrollment-links");
    await ensurePersistedEnrollments(ctx.tenantId, student, data.teachers);
    enrollment = { id: materializedEnrollmentId(student.id, view.instrument), instrument: view.instrument };
  }
  const { linkRecordsToEnrollment } = await import("../store");
  const { linkUnassignedContracts } = await import("../contracts");
  if (v.data.contractId) {
    const all = await listContractsForStudent(ctx.tenantId, student.id);
    const target = all.find((c) => c.id === v.data.contractId);
    if (!target) return fail("NOT_FOUND", "Sözleşme bulunamadı veya bu öğrenciye ait değil.");
    if (target.enrollmentId) return fail("CONFLICT", `${target.contractNumber} zaten bir branş kaydına bağlı; başka branşa taşınamaz.`);
    // Sürüm zinciri (önceki/sonraki sürümler) birlikte bağlanır — bir sözleşmenin sürümleri iki branşa bölünmez.
    const chain = new Set<string>([target.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const c of all) {
        if (chain.has(c.id) && c.previousContractId && !chain.has(c.previousContractId)) {
          chain.add(c.previousContractId);
          grew = true;
        }
        if (c.previousContractId && chain.has(c.previousContractId) && !chain.has(c.id)) {
          chain.add(c.id);
          grew = true;
        }
      }
    }
    const contractIds = await linkUnassignedContracts(ctx.tenantId, student.id, enrollment.id, [...chain]);
    const rows = await linkRecordsToEnrollment({ studentId: student.id, enrollmentId: enrollment.id, contractIds });
    audit(ctx, "contract.enrollment_assigned", "StudentContract", target.id, { enrollmentId: enrollment.id, instrument: enrollment.instrument, contractIds, ...rows });
    return ok({ contracts: contractIds.length, ...rows });
  }
  const payment = data.payments.find((p) => p.id === v.data.paymentId && p.studentId === student.id);
  if (!payment) return fail("NOT_FOUND", "Ödeme satırı bulunamadı veya bu öğrenciye ait değil.");
  if (payment.source === "club" || payment.clubMembershipId) return fail("VALIDATION_ERROR", "Kulüp ücreti bir branş kaydına bağlanmaz.");
  if (payment.contractId) return fail("VALIDATION_ERROR", "Sözleşme taksidi sözleşmesiyle birlikte bağlanır: Sözleşme Merkezi'nde sözleşmeyi \"Branşa bağla\" ile bağlayın.");
  if (payment.enrollmentId) return fail("CONFLICT", "Bu ödeme zaten bir branş kaydına bağlı; başka branşa taşınamaz.");
  const rows = await linkRecordsToEnrollment({ studentId: student.id, enrollmentId: enrollment.id, paymentIds: [payment.id] });
  audit(ctx, "payment.enrollment_assigned", "Payment", payment.id, { enrollmentId: enrollment.id, instrument: enrollment.instrument });
  return ok({ contracts: 0, ...rows });
}

/**
 * 2026-10-10 — BRANŞA özgü bir alanı (tür, tarih, seviye/MEB, süre, ücret, ödeme profili…) yazmadan önce HEDEF BRANŞI çözer.
 * Açık `enrollmentId` verilmişse o branş; verilmemişse yalnız belirsizlik yoksa (tek branş / tek aktif branş). Çok
 * branşlı öğrencide "ilk bulunan" ASLA seçilmez — Türkçe, neyin neden reddedildiğini söyleyen hata döner.
 * Dönen `terms` hedef branşın KENDİ koşullarıdır (öğrenci satırı değil). Kalıcı kaydı olmayan çok branşlı eski öğrencide
 * branşlar önce (idempotent) kalıcı yapılır. `enrollmentId` undefined ise yazım öğrenci satırınadır (tek branşlı eski öğrenci).
 */
type TermWriteTarget = {
  student: Student;
  terms: import("../student-enrollments").EnrollmentTerms;
  view: import("../student-enrollments").EnrollmentView;
  enrollmentId?: string;
};

async function resolveTermWriteTarget(
  ctx: ServiceContext,
  studentId: string,
  requestedEnrollmentId: string | undefined
): Promise<ServiceResult<TermWriteTarget>> {
  const student = await readStudentById(studentId);
  if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı");
  const ref = await readReferenceData();
  const se = await import("../student-enrollments");
  const route = se.routeTermPatch(student, requestedEnrollmentId, ref.teachers);
  if (route.mode === "error") return fail(route.code === "NOT_FOUND" ? "NOT_FOUND" : "VALIDATION_ERROR", route.message);
  let working: Student = student;
  let enrollmentId: string | undefined;
  if (route.mode === "record") {
    enrollmentId = route.enrollmentId;
    if (route.needsPersist) {
      const { ensurePersistedEnrollments, materializedEnrollmentId } = await import("../enrollment-links");
      const instrument = route.enrollmentId.split(":").pop() ?? "";
      const list = await ensurePersistedEnrollments(ctx.tenantId, student, ref.teachers);
      working = { ...student, enrollments: list };
      enrollmentId = materializedEnrollmentId(student.id, instrument);
    }
  }
  const derived = se.effectiveEnrollments(working, ref.teachers);
  const view =
    (enrollmentId ? derived.find((e) => e.id === enrollmentId) : derived[0]) ??
    ({ id: `${se.LEGACY_ENROLLMENT_PREFIX}${student.id}:${student.instruments[0] ?? ""}`, instrument: (student.instruments[0] ?? "Piyano") as Instrument, active: true, createdAt: student.createdAt, legacy: true } satisfies import("../student-enrollments").EnrollmentView);
  return ok({ student: working, terms: se.enrollmentTerms(working, view, ref.teachers), view, enrollmentId });
}

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

  // 2026-10-10 — branşa özgü alanlar (tür, tarih, seviye/MEB, süre, paket…) HEDEF BRANŞIN kaydına yazılır. Çok branşlı
  // öğrencide hedef belirsizse işlem reddedilir; kişi düzeyi alanlar (telefon, veli, adres…) branş gerektirmez.
  const { patchTouchesEnrollmentTerms, studentWithEnrollmentTerms } = await import("../student-enrollments");
  const termTouch = patchTouchesEnrollmentTerms(v.data as unknown as StudentProfilePatch);
  let target: TermWriteTarget | undefined;
  if (termTouch) {
    const resolved = await resolveTermWriteTarget(ctx, v.data.studentId, v.data.enrollmentId);
    if (!resolved.ok) return resolved;
    target = resolved.data;
  }

  // MEB Paneli (2026-09-28) — "MEB ise zorunlu" güncelleme kapısı. HEDEF BRANŞIN mevcut koşullarıyla BİRLEŞTİRİLMİŞ
  // görünüm doğrulanır (bkz. src/lib/meb.ts `mergeMebForUpdate`): sonuç MEB + MEB yüzeyine dokunan ilk ilgili düzenleme
  // tamamlamayı zorunlu kılar; alakasız düzenlemeler eski eksik kayıtları KIRMAZ. Sonuç MEB-değilse gelen MEB
  // değerleri STRIP edilir — gizli alan yazılmaz, kayıtlı eski MEB verisi SİLİNMEZ (tür tekrar seçilince geri gelir).
  let mebStrip = false;
  if (target) {
    const t = target.terms;
    const mebMerged = mergeMebForUpdate(
      {
        studentTypes: t.studentTypes,
        studentType: undefined,
        level: t.level,
        mebLevelStartDate: t.mebLevelStartDate,
        mebLevelEndDate: t.mebLevelEndDate,
        mebExamDate: t.mebExamDate,
        mebExamAttended: t.mebExamAttended,
      },
      v.data
    );
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
  }

  try {
    const { studentId, enrollmentId: _requestedEnrollmentId, ...patch } = v.data;
    void _requestedEnrollmentId;
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
    const before = target ? studentWithEnrollmentTerms(target.student, target.terms) : await readStudentById(studentId);
    await updateStudentProfile(studentId, { ...profilePatch, ...(target?.enrollmentId ? { enrollmentId: target.enrollmentId } : {}) });
    // Ders süresi TEK kanonik alandır (HEDEF BRANŞIN kaydı). Paketli branşta aylık ücret süreye bağlı olduğu için süre
    // hangi ekrandan değişirse değişsin ücret aynı sunucu kuralıyla (updateStudentPaymentProfileTool) yeniden hesaplanır.
    if (
      target &&
      target.terms.packageId &&
      patch.lessonDurationMinutes !== undefined &&
      patch.lessonDurationMinutes !== target.terms.lessonDurationMinutes
    ) {
      const repriced = await updateStudentPaymentProfileTool(ctx, {
        studentId,
        ...(target.enrollmentId ? { enrollmentId: target.enrollmentId } : {}),
        lessonDurationMinutes: patch.lessonDurationMinutes,
        ...(target.terms.monthlyFeeManualOverride
          ? { monthlyFeeOverrideAmount: target.terms.monthlyFee, monthlyFeeOverrideReason: target.terms.monthlyFeeOverrideReason }
          : {}),
      });
      if (!repriced.ok) return repriced;
    }
    // Minimal fark (2026-10-19): ham yama (`...patch` — formun TÜM alanları, telefon/adres gibi kişisel veri dahil)
    // artık meta'ya yazılmaz; yalnız gerçekten değişen alanlar `changes`'ta. Kaydedilmemiş sorumluluk = varsayılanı.
    audit(ctx, "student.profile_update", "Student", studentId, {
      entityName: patch.name ?? before?.name,
      ...(target ? { enrollmentId: target.view.id, instrument: target.view.instrument } : {}),
      changes: before
        ? diffRecordFields(
            { ...before, accountResponsibility: before.accountResponsibility ?? "PARENT_MANAGED" } as unknown as Record<string, unknown>,
            patch as Record<string, unknown>
          )
        : [],
    });
    return ok({ studentId });
  } catch (e) {
    if (e instanceof EnrollmentRequiredError) return fail("VALIDATION_ERROR", e.message);
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
  /** MEB bilgisi BRANŞA özgüdür: aynı öğrencinin her MEB branşı ayrı satırdır (boş = branş kaydı olmayan eski öğrenci). */
  enrollmentId?: string;
  instrument?: string;
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
  /** MEB satırının branşı: öğretmen uyumu ve planlı ders sayısı yalnız bu branş için hesaplanır. */
  enrollmentId: z.string().min(1).max(120).optional(),
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
  const { resolveEnrollmentTarget, lessonEnrollmentId } = await import("../student-enrollments");
  // Branş hedefi: açık kimlik ya da belirsizlik yoksa tek branş; çok branşlıda "ilk bulunan" seçilmez.
  const target = student.enrollments?.length ? resolveEnrollmentTarget(student, v.data.enrollmentId, data.teachers) : undefined;
  if (target && !target.ok) return fail("VALIDATION_ERROR", target.message);
  const targetTeacherId = target?.ok ? (target.enrollment.teacherId ?? student.teacherId) : student.teacherId;
  const teacher = data.teachers.find((t) => t.id === targetTeacherId);
  const targetBranchId = v.data.branchId ?? student.branchId;
  const now = Date.now();
  const futureLessonCount = data.lessons.filter(
    (l) =>
      l.studentId === student.id &&
      l.status !== "cancelled" &&
      new Date(l.startAt).getTime() > now &&
      (!target?.ok || lessonEnrollmentId(student, l, data.teachers) === target.enrollment.id)
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
  // 2026-10-10 — çok branşlı öğrencide kontrol edilen öğretmen, MEB satırının BRANŞININ öğretmenidir (ilk branşınki değil).
  if (v.data.branchId && v.data.branchId !== student.branchId) {
    const { resolveEnrollmentTarget } = await import("../student-enrollments");
    const mebTarget = student.enrollments?.length ? resolveEnrollmentTarget(student, v.data.enrollmentId, data.teachers) : undefined;
    if (mebTarget && !mebTarget.ok) return fail("VALIDATION_ERROR", mebTarget.message);
    const teacherId = mebTarget?.ok ? (mebTarget.enrollment.teacherId ?? student.teacherId) : student.teacherId;
    const teacher = data.teachers.find((t) => t.id === teacherId);
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

  // DB egress (2026-10-18): kurum adı/logo tek satır (readSchoolBranding) — eskiden tam okuma.
  const [branding, student] = await Promise.all([readSchoolBranding(), readStudentById(v.data.studentId)]);
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
      institutionName: branding.name ?? "NeviiHub",
      role: "STUDENT",
      portalAccessType: v.data.accessType,
      schoolPhone: branding.phone || undefined,
      schoolWebsite: branding.website || undefined,
      logoUrl: branding.logoUrl || undefined,
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

  const details = await readTeacherPortalDetails(v.data.teacherId);
  if (!details) return fail("NOT_FOUND", "Öğretmen bulunamadı");
  const email = details.contactEmail.trim().toLowerCase();
  if (!email) return fail("VALIDATION_ERROR", "Öğretmenin iletişim e-postası tanımlı değil.");

  if (isRateLimited(`invite:${ctx.tenantId}:${email}`, 5, 60 * 60 * 1000)) {
    return fail("RATE_LIMITED", "Bu e-posta adresine çok fazla davet gönderildi. Lütfen bir süre sonra tekrar deneyin.");
  }

  const account = await getUserAccountStatusForTeacher(ctx.tenantId, details.teacherId);
  if (account && account.role !== "TEACHER") {
    return fail("VALIDATION_ERROR", "Öğretmen kaydına bağlı portal hesabının rolü uyumsuz. Hesap ilişkisini yöneticiniz kontrol etmelidir.");
  }
  const invitationPending = account
    ? account.invitationPending || await hasUnacceptedInvitationToken(ctx.tenantId, account.userId)
    : false;
  const emailOwnerId = await getUserIdByEmailIncludingInactive(ctx.tenantId, email);
  if (emailOwnerId && emailOwnerId !== account?.userId) {
    return fail(
      "VALIDATION_ERROR",
      "Bu e-posta adresi başka bir portal hesabına ait. Hesaplar birleştirilmedi veya değiştirilmedi; öğretmen için farklı bir e-posta kullanın."
    );
  }

  let userId: string;
  if (account) {
    if (!invitationPending) {
      return fail(
        "VALIDATION_ERROR",
        `Öğretmenin aktif portal giriş e-postası ${account.email}. Giriş adresi profil düzenlemesinden değişmez; öğretmen kendi hesabındaki e-posta doğrulama akışını kullanmalıdır.`
      );
    }
    if (account.email.trim().toLowerCase() !== email && !account.invitationPending) {
      // 2026-10-14 güvenlik — hesap bayrağı "bekleyen" değil (aktif hesapta yalnız eski, kullanılmamış bir davet token'ı
      // kalmış): davetle giriş adresini değiştirmek yeni adres doğrulamasını atlatırdı. Değişiklik doğrulamalı akıştan yapılır.
      return fail(
        "VALIDATION_ERROR",
        `Öğretmenin portal hesabı etkin (giriş e-postası ${account.email}); davetle başka adrese taşınamaz. Kurum sahibi Portal Erişimi → "Portal e-postasını değiştir" ile yeni adrese doğrulama bağlantısı gönderir.`
      );
    }
    if (account.email.trim().toLowerCase() !== email && !isInstitutionOwner({ userId: ctx.userId, role: ctx.role })) {
      // 2026-10-14 — bekleyen davetin giriş adresini başka adrese taşımak = portal giriş e-postasını değiştirmek:
      // yalnız kurum sahibi (iletişim adresi düzenlemesi + yeniden davet bu kısıtı aşamaz).
      return fail(
        "FORBIDDEN",
        `Bekleyen davetin giriş adresi ${account.email}, iletişim e-postası ${email}. Portal giriş e-postasını yalnız kurum sahibi değiştirebilir: kurum sahibinden Portal Erişimi → "Portal e-postasını değiştir" ile güncellemesini isteyin.`
      );
    }
    if (!account.invitationPending) {
      await setTeacherInvitationPending(ctx.tenantId, account.userId, true);
    }
    const updateResult = await updatePendingTeacherInvitationEmail({
      tenantId: ctx.tenantId,
      userId: account.userId,
      teacherId: details.teacherId,
      email,
    });
    if (updateResult === "email_taken") {
      return fail("VALIDATION_ERROR", "Bu e-posta adresi başka bir portal hesabına ait. Öğretmen profili değiştirilmedi; farklı bir adres girin.");
    }
    if (updateResult !== "updated") {
      return fail("VALIDATION_ERROR", "Bekleyen öğretmen daveti artık güncellenemiyor. Sayfayı yenileyip portal erişimini tekrar kontrol edin.");
    }
    userId = account.userId;
  } else {
    if (emailOwnerId) {
      return fail(
        "VALIDATION_ERROR",
        "Bu e-posta adresi başka bir portal hesabına ait. Hesaplar birleştirilmedi veya değiştirilmedi; öğretmen için farklı bir e-posta kullanın."
      );
    }
    let provisioned: Awaited<ReturnType<typeof provisionEntityLogin>>;
    try {
      provisioned = await provisionEntityLogin({
        tenantId: ctx.tenantId,
        email,
        role: "TEACHER",
        teacherId: details.teacherId,
        invitationPending: true,
      });
    } catch (error) {
      const conflictingUserId = await getUserIdByEmailIncludingInactive(ctx.tenantId, email);
      if (conflictingUserId) {
        return fail(
          "VALIDATION_ERROR",
          "Bu e-posta adresi başka bir portal hesabına ait. Hesaplar birleştirilmedi veya değiştirilmedi; öğretmen için farklı bir e-posta kullanın."
        );
      }
      throw error;
    }
    if (!provisioned) {
      return fail("VALIDATION_ERROR", "Portal hesabı oluşturulamadı; e-posta başka bir hesaba bağlanmış olabilir. Adresi kontrol edin.");
    }
    userId = provisioned.userId;
  }

  try {
    const { sendAccountInvitationEmail } = await import("../auth/invitation");
    const result = await sendAccountInvitationEmail({
      tenantId: ctx.tenantId,
      userId,
      email,
      recipientName: details.teacherName,
      institutionName: details.institutionName || "NeviiHub",
      role: "TEACHER",
      schoolPhone: details.schoolPhone || undefined,
      schoolWebsite: details.schoolWebsite || undefined,
      logoUrl: details.logoUrl || undefined,
    });

    audit(ctx, "teacher.invitation_sent", "Teacher", details.teacherId, { delivered: result.delivered });

    return ok({ teacherId: details.teacherId, delivered: result.delivered, blocked: result.delivered ? undefined : result.blocked });
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

  // DB egress (2026-10-18): kurum adı/logo tek satır (readSchoolBranding) — eskiden tam okuma.
  const [branding, student] = await Promise.all([readSchoolBranding(), readStudentById(v.data.studentId)]);

  try {
    const { sendPasswordResetEmail } = await import("../auth/invitation");
    const result = await sendPasswordResetEmail({
      tenantId: ctx.tenantId,
      userId: v.data.userId,
      email: account.email,
      recipientName: student?.name ?? "",
      institutionName: branding.name ?? "NeviiHub",
      logoUrl: branding.logoUrl || undefined,
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
  invitationPending: boolean;
  invitationLinkActive: boolean;
  lastPasswordResetRequestedAt: string | null;
  /** 2026-10-14 — doğrulanmayı bekleyen yeni giriş adresi (değişiklik henüz GERÇEKLEŞMEDİ). */
  pendingEmailChange?: { newEmail: string; expiresAt: string } | null;
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
    return ok({
      exists: false,
      userId: null,
      email: "",
      active: false,
      invitationPending: false,
      invitationLinkActive: false,
      lastPasswordResetRequestedAt: null,
    });
  }
  const invitationPending = account
    ? account.invitationPending || await hasUnacceptedInvitationToken(ctx.tenantId, account.userId)
    : false;
  const lastPasswordResetRequestedAt = await getLatestPasswordResetRequestAt(account.userId);
  const { getPendingEmailChange } = await import("../auth/email-change");
  return ok({
    exists: true,
    userId: account.userId,
    email: account.email,
    active: account.active,
    invitationPending,
    invitationLinkActive: invitationPending && await hasActiveInvitationToken(ctx.tenantId, account.userId),
    lastPasswordResetRequestedAt,
    pendingEmailChange: invitationPending ? null : await getPendingEmailChange(account.userId),
  });
}

const PORTAL_EMAIL_TAKEN_MESSAGE =
  "Bu e-posta adresi portal girişi için kullanılamıyor: başka bir hesaba kayıtlı. Hesaplar birleştirilmez veya devredilmez; öğretmen için başka bir adres girin.";

/** Denetim kaydı için: alan adı + yerel kısmın ilk harfi ("o***@ornek.test"). Tam adres denetim tablosuna yazılmaz. */
function maskEmailForAudit(email: string): string {
  const at = email.lastIndexOf("@");
  return at > 0 ? `${email[0]}***@${email.slice(at + 1)}` : "***";
}

const changeTeacherPortalEmailSchema = z.object({
  teacherId: z.string().min(1),
  newEmail: z.string().trim().min(3).max(254),
  /** Kurum sahibi eski/yeni adresi ve girişe etkisini gördü ve AÇIKÇA onayladı. */
  confirm: z.literal(true),
});

/**
 * 2026-10-14 — Öğretmenin PORTAL GİRİŞ e-postasını değiştirir. YALNIZ kurum sahibi (`isInstitutionOwner`, etkin rol
 * SUPER_ADMIN; kurum yöneticisi/şube yöneticisi/öğretmen yetmez). Yalnız oturumun kurumu (öğretmen ve hesap
 * `ctx.tenantId` ile aranır; başka kurumun öğretmeni "bulunamadı").
 *
 * - Bekleyen davetli hesap: giriş adresi ve iletişim adresi (davet alıcısı) birlikte yeni adrese geçer, eski davet
 *   bağlantıları geçersizleşir; yeni davet kurum sahibinin AYRI onayıyla ("Davet gönder") gider.
 * - Aktif hesap: değişiklik HEMEN yapılmaz — yeni adrese tek kullanımlık doğrulama bağlantısı, eski adrese güvenlik
 *   bildirimi gider; bağlantı açılınca giriş adresi değişir, açık oturumlar kapanır, eski sıfırlama/davet bağlantıları
 *   geçersizleşir. O zamana kadar ekranda "bekleyen yeni adres" görünür.
 * - Adres başka bir hesaba (herhangi bir kurumda, pasif dahil) aitse REDDEDİLİR: hesap birleştirme/devri yapılmaz.
 * Öğretmen kimliği, ders ilişkileri ve yetkileri değişmez (yalnız `User.email`, bekleyen davette `Teacher.email`).
 */
export async function changeTeacherPortalEmailTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ teacherId: string; mode: "pending_invitation_updated" | "verification_sent"; newEmail: string; delivered: boolean }>> {
  if (!isInstitutionOwner({ userId: ctx.userId, role: ctx.role })) {
    return fail(
      "FORBIDDEN",
      "Öğretmenin portal giriş e-postasını yalnız kurum sahibi değiştirebilir. Değişiklik için kurum sahibinden Öğretmenler → Bilgiler → Portal Erişimi bölümünü kullanmasını isteyin."
    );
  }
  const v = parseOrFail(changeTeacherPortalEmailSchema, input);
  if (!v.ok) {
    return fail("VALIDATION_ERROR", "Yeni portal e-postasını girin ve değişikliği onaylayın (eski/yeni adres ve girişe etkisi gösterildikten sonra).");
  }
  const newEmail = v.data.newEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(newEmail)) {
    return fail("VALIDATION_ERROR", `"${v.data.newEmail}" geçerli bir e-posta adresi değil. Adresi kontrol edip tekrar girin.`);
  }

  const details = await readTeacherPortalDetails(v.data.teacherId);
  if (!details) return fail("NOT_FOUND", "Öğretmen bu kurumda bulunamadı. Sayfayı yenileyip öğretmeni listeden yeniden açın.");
  const account = await getUserAccountStatusForTeacher(ctx.tenantId, details.teacherId);
  if (!account) {
    return fail(
      "VALIDATION_ERROR",
      "Bu öğretmenin henüz portal hesabı yok; değiştirilecek bir giriş e-postası bulunmuyor. Önce Portal Erişimi'nden davet gönderin (davet iletişim e-postasına gider)."
    );
  }
  if (account.role !== "TEACHER") {
    return fail("VALIDATION_ERROR", "Öğretmen kaydına bağlı portal hesabının rolü uyumsuz. Hesap ilişkisini platform yöneticisi kontrol etmelidir.");
  }
  const currentEmail = account.email.trim().toLowerCase();
  if (newEmail === currentEmail) {
    return fail("VALIDATION_ERROR", `Portal giriş e-postası zaten ${currentEmail}. Farklı bir adres girin.`);
  }
  // Kurumlar arası çakışma kontrolü bir adresin başka hesapta olup olmadığını söyler: kurum sahibi başına sınırlı
  // deneme (adres taraması yapılamaz); mesaj hangi kurum/rol olduğunu söylemez.
  if (isRateLimited(`teacher-portal-email:${ctx.tenantId}:${ctx.userId}`, 10, 60 * 60 * 1000)) {
    return fail("RATE_LIMITED", "Son bir saatte çok fazla portal e-postası değişikliği denendi. Bir süre sonra tekrar deneyin.");
  }
  const { getAnyUserIdByEmail } = await import("../auth/users");
  const takenBy = await getAnyUserIdByEmail(newEmail);
  if (takenBy && takenBy !== account.userId) {
    return fail("VALIDATION_ERROR", PORTAL_EMAIL_TAKEN_MESSAGE);
  }

  // GÜVENLİK: "bekleyen davet" yalnız hesabın KENDİ bayrağıdır (davet henüz kabul edilmedi). Aktif bir hesapta eski,
  // kullanılmamış bir davet token'ı kalmış olabilir; onu "bekleyen" sayıp giriş adresini doğrulamasız değiştirmek
  // (ve hesabı bekleyen işaretlemek) yeni adres sahipliği kanıtını atlatırdı.
  if (account.invitationPending) {
    const res = await updatePendingTeacherInvitationEmail({ tenantId: ctx.tenantId, userId: account.userId, teacherId: details.teacherId, email: newEmail });
    if (res === "email_taken") {
      return fail("VALIDATION_ERROR", PORTAL_EMAIL_TAKEN_MESSAGE);
    }
    if (res !== "updated") {
      return fail("CONFLICT", "Davet bu sırada kabul edilmiş görünüyor; sayfayı yenileyin — aktif hesapta değişiklik yeni adres doğrulamasıyla yapılır.");
    }
    await revokeInvitationTokensForUser(ctx.tenantId, account.userId);
    // Bekleyen davette davet alıcısı = iletişim adresi: ikisi aynı adreste tutulur (UI, giriş adresi ve davet tutarlı).
    await updateTeacherProfile(details.teacherId, { email: newEmail });
    audit(ctx, "teacher.portal_email_changed", "Teacher", details.teacherId, {
      userId: account.userId,
      mode: "pending_invitation",
      previousEmail: maskEmailForAudit(currentEmail),
      newEmail: maskEmailForAudit(newEmail),
      changedByUserId: ctx.userId,
    });
    return ok({ teacherId: details.teacherId, mode: "pending_invitation_updated", newEmail, delivered: false });
  }

  if (!account.active) {
    return fail("VALIDATION_ERROR", "Öğretmenin portal erişimi kapalı. Giriş e-postasını değiştirmeden önce Portal Erişimi'nden erişimi açın.");
  }
  const { requestEmailChangeByOwner } = await import("../auth/email-change");
  const req = await requestEmailChangeByOwner({
    tenantId: ctx.tenantId,
    userId: account.userId,
    newEmail,
    actorUserId: ctx.userId,
    institutionName: details.institutionName,
  });
  if (!req.ok) {
    const msg: Record<typeof req.code, string> = {
      USER_NOT_FOUND: "Öğretmenin portal hesabı bulunamadı veya kapalı. Sayfayı yenileyip Portal Erişimi durumunu kontrol edin.",
      SAME_EMAIL: `Portal giriş e-postası zaten ${currentEmail}. Farklı bir adres girin.`,
      INVALID_EMAIL: `"${v.data.newEmail}" geçerli bir e-posta adresi değil.`,
      TAKEN: PORTAL_EMAIL_TAKEN_MESSAGE,
      RATE_LIMITED: "Bu hesap için son bir saatte çok fazla değişiklik istendi. Bir süre sonra tekrar deneyin.",
    };
    return fail(req.code === "RATE_LIMITED" ? "RATE_LIMITED" : "VALIDATION_ERROR", msg[req.code]);
  }
  audit(ctx, "teacher.portal_email_change_requested", "Teacher", details.teacherId, {
    userId: account.userId,
    mode: "verification",
    previousEmail: maskEmailForAudit(currentEmail),
    newEmail: maskEmailForAudit(newEmail),
    changedByUserId: ctx.userId,
    delivered: req.sentToNew,
  });
  return ok({ teacherId: details.teacherId, mode: "verification_sent", newEmail, delivered: req.sentToNew });
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

  // DB egress (2026-10-18): kurum adı/logo tek satır (readSchoolBranding) — eskiden tam okuma.
  const [branding, teacher] = await Promise.all([readSchoolBranding(), readTeacherPortalDetails(v.data.teacherId)]);

  try {
    const { sendPasswordResetEmail } = await import("../auth/invitation");
    const result = await sendPasswordResetEmail({
      tenantId: ctx.tenantId,
      userId: account.userId,
      email: account.email,
      recipientName: teacher?.teacherName ?? "",
      institutionName: branding.name ?? "NeviiHub",
      logoUrl: branding.logoUrl || undefined,
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
    // 2026-10-10 — paket/ücret/indirim/ödeme profili HEDEF BRANŞIN kaydıdır; çok branşlı öğrencide branş seçilmeden yazılmaz.
    const resolved = await resolveTermWriteTarget(ctx, v.data.studentId, v.data.enrollmentId);
    if (!resolved.ok) return resolved;
    const { terms, enrollmentId, view } = resolved.data;

    const effectivePackageId = v.data.packageId ?? terms.packageId;
    const effectiveDuration = v.data.lessonDurationMinutes ?? terms.lessonDurationMinutes;
    const effectiveDiscountType = v.data.discountType ?? terms.discountType;
    const effectiveDiscountValue = v.data.discountValue ?? terms.discountValue;

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
      monthlyFee: terms.monthlyFee,
      discountType: terms.discountType,
      discountValue: terms.discountValue,
      monthlyFeeManualOverride: terms.monthlyFeeManualOverride ?? false,
    };

    if (effectivePackageId) {
      // Paket değiştiriliyorsa yeni paket aktif olmalı; branşta zaten
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
      if (v.data.packageId !== undefined) patch.packageName = pkg.title;
    } else if (v.data.monthlyFeeOverrideAmount !== undefined) {
      // Paketsiz (legacy serbest ücret) branş — manuel tutar doğrudan nihai ücrettir.
      patch.monthlyFee = v.data.monthlyFeeOverrideAmount;
      patch.monthlyFeeManualOverride = true;
      patch.monthlyFeeOverrideReason = v.data.monthlyFeeOverrideReason;
    }
    // Ücret değişince ders başı karşılık da branşın kendi haftalık sıklığından yeniden türetilir (eski okuyucular için).
    if (patch.monthlyFee !== undefined) {
      patch.derivedPerLessonAmount = derivePerLessonAmount(patch.monthlyFee, terms.weeklyLessonCount);
    }

    await updateStudentProfile(v.data.studentId, { ...patch, ...(enrollmentId ? { enrollmentId } : {}) });
    audit(ctx, "student.payment_profile_update", "Student", v.data.studentId, {
      enrollmentId: view.id,
      instrument: view.instrument,
      before,
      after: {
        monthlyFee: patch.monthlyFee ?? before.monthlyFee,
        discountType: patch.discountType,
        discountValue: patch.discountValue,
        monthlyFeeManualOverride: patch.monthlyFeeManualOverride ?? before.monthlyFeeManualOverride,
      },
      reason: v.data.monthlyFeeOverrideReason,
    });
    return ok({ studentId: v.data.studentId, monthlyFee: patch.monthlyFee ?? terms.monthlyFee });
  } catch (e) {
    if (e instanceof EnrollmentRequiredError) return fail("VALIDATION_ERROR", e.message);
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
    const account = patch.email !== undefined
      ? await getUserAccountStatusForTeacher(ctx.tenantId, teacherId)
      : null;
    if (account && account.role !== "TEACHER") {
      return fail("VALIDATION_ERROR", "Öğretmen kaydına bağlı portal hesabının rolü uyumsuz. Hesap ilişkisini yöneticiniz kontrol etmelidir.");
    }
    const normalizedEmail = patch.email?.trim().toLowerCase();
    const emailChanged = normalizedEmail !== undefined && normalizedEmail !== teacher.email.trim().toLowerCase();
    if (normalizedEmail) {
      const ownerId = await getUserIdByEmailIncludingInactive(ctx.tenantId, normalizedEmail);
      if (ownerId && ownerId !== account?.userId) {
        return fail(
          "VALIDATION_ERROR",
          "Bu e-posta adresi başka bir portal hesabına ait. Öğretmen profili değiştirilmedi; farklı bir adres girin."
        );
      }
      patch.email = normalizedEmail;
    } else if (patch.email !== undefined) {
      patch.email = "";
    }
    // 2026-10-14 güvenlik — yalnız hesabın KENDİ "bekleyen davet" bayrağı: aktif bir hesapta kalmış eski davet token'ı
    // hesabı bekleyen işaretlemez (aksi halde iletişim adresi düzenlemesi + davet, giriş adresini doğrulamasız taşırdı).
    // Aktif hesapta kullanılmamış eski davet bağlantıları yine iptal edilir (eski adrese gitmiş link işe yaramaz).
    if (emailChanged && account && (account.invitationPending || await hasUnacceptedInvitationToken(ctx.tenantId, account.userId))) {
      await revokeInvitationTokensForUser(ctx.tenantId, account.userId);
    }
    // 8. tur — birincil şube değişebilir; ek şubeler listesi birincili asla
    // tekrar içermez (teacherServesBranch birincili zaten dahil sayar).
    if (patch.branchId !== undefined || patch.branchIds !== undefined) {
      const primary = patch.branchId ?? teacher.branchId;
      patch.branchIds = Array.from(new Set(patch.branchIds ?? teacher.branchIds ?? [])).filter((b) => b !== primary);
    }
    const updated = await updateTeacherProfile(teacherId, patch);
    if (!updated) return fail("NOT_FOUND", "Öğretmen bulunamadı");
    audit(ctx, "teacher.profile_update", "Teacher", teacherId, {
      entityName: patch.name ?? teacher.name,
      changes: diffRecordFields(teacher as unknown as Record<string, unknown>, patch as Record<string, unknown>),
    });
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
  // DB egress (2026-10-18): kurum adı/logo tek satır (readSchoolBranding) — eskiden tam okuma.
  const branding = await readSchoolBranding();
  const { sendAccountInvitationEmail } = await import("../auth/invitation");
  const result = await sendAccountInvitationEmail({
    tenantId: ctx.tenantId,
    userId,
    email: staff.email!,
    recipientName: staff.name,
    institutionName: branding.name ?? "NeviiHub",
    role: "SCHOOL_ADMIN",
    schoolPhone: branding.phone || undefined,
    schoolWebsite: branding.website || undefined,
    logoUrl: branding.logoUrl || undefined,
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

  // DB egress (2026-10-18): kurum adı/logo tek satır (readSchoolBranding) — eskiden tam okuma.
  const branding = await readSchoolBranding();

  try {
    const { sendPasswordResetEmail } = await import("../auth/invitation");
    const result = await sendPasswordResetEmail({
      tenantId: ctx.tenantId,
      userId: account.userId,
      email: account.email,
      recipientName: staff.name,
      institutionName: branding.name ?? "NeviiHub",
      logoUrl: branding.logoUrl || undefined,
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
  // Bilinçli olarak SUNUCU CACHE DIŞI: finans uyarıları read-your-write
  // sözleşmelidir (ödeme işaretlenince uyarı aynı anda düşer —
  // finance-expansion regresyonları). Özet ekranı kasıtlı açılır (düşük
  // sıklık); dashboard/rapor cache'li, finans her zaman taze hesaplanır.
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
  // DB egress (2026-10-18) — özet yalnız ödemeleri, kayıtlı hakedişleri ve referans veriyi okur. Hakediş penceresi
  // boş aralıkla çağrılır: ders satırı gelmez, TÜM kayıtlı hakedişler gelir (aynı tazelik; cache yok).
  const [paymentsData, payoutData] = await Promise.all([readPaymentsPageData(), readPayoutWindow(new Date(0).toISOString(), new Date(0).toISOString())]);
  const data = { ...paymentsData, teacherPayouts: payoutData.teacherPayouts };
  const staff = await listStaff(ctx.tenantId);
  const payroll = await listPayroll(ctx.tenantId);
  const expenses = await listExpenses(ctx.tenantId);
  const budgets = await listBudgets(ctx.tenantId);
  const { listContractSummariesByStudent } = await import("../contracts");
  const contractSummaries = await listContractSummariesByStudent(ctx.tenantId);
  const { computeFinanceSummary, computeAverageMonthlyFeePerStudent, computeAverageCollectedPerStudent, computeAverageFeeTrend } =
    await import("../finance-summary");
  const summary = computeFinanceSummary(data, staff, payroll, expenses, new Date(), budgets, v.data.month);
  // 2026-10-09 — çok branşlı öğrencide her branşın güncel sözleşmesi ayrı (öğrencinin aylık ücreti = branşların toplamı).
  const { listContractSummaryRows } = await import("../contracts");
  const { selectCurrentContract } = await import("../contract-list-helpers");
  const se = await import("../student-enrollments");
  const summaryRows = await listContractSummaryRows(ctx.tenantId);
  const contracts: import("../finance-summary").AverageFeeContractLike[] = [];
  for (const st of data.students) {
    const branches = se.effectiveEnrollments(st, data.teachers);
    if (branches.length < 2) {
      const single = contractSummaries.get(st.id);
      if (single) contracts.push(single);
      continue;
    }
    const own = summaryRows.filter((r) => r.studentId === st.id).map((r) => ({ ...r, id: r.contractId }));
    for (const e of branches) {
      const current = selectCurrentContract(own.filter((r) => se.contractEnrollmentId(st, r, data.teachers) === e.id));
      if (current) contracts.push({ ...current, enrollmentId: e.id });
    }
  }
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
  return ok(validateRoomRows(data, csvRecords(v.data.csvText), await resolveActiveInstrumentNames(ctx.tenantId)));
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
  const preview = validateRoomRows(data, csvRecords(v.data.csvText), await resolveActiveInstrumentNames(ctx.tenantId));
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
  return ok(validateLessonRows(data, csvRecords(v.data.csvText), await resolveActiveInstrumentNames(ctx.tenantId)));
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
  const preview = validateLessonRows(data, csvRecords(v.data.csvText), await resolveActiveInstrumentNames(ctx.tenantId));
  if (preview.errorCount > 0) {
    return fail("VALIDATION_ERROR", "CSV içinde hatalı satır var; hiçbir kayıt eklenmedi.", preview.errors);
  }
  if (preview.valid.length === 0) return fail("VALIDATION_ERROR", "İçe aktarılacak geçerli satır yok.");
  try {
    let created = 0;
    let skipped = 0;
    for (const row of preview.valid) {
      if (row.duplicate) {
        skipped++;
        continue;
      }
      await addLesson({
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
    // DB egress (2026-10-10): addLesson artık tüm veriyi dönmüyor — güncel veri satır başına değil, sonda bir kez okunur.
    return ok({ data: created > 0 ? await readData() : data, created, updated: 0, skipped });
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

/**
 * Oda enstrümanları kurumun AKTİF kataloğundan seçilir (sabit liste değil); düzenlemede odada zaten
 * olan (sonradan pasife alınmış) enstrüman korunabilir. Yazım katalogdaki kanonik ada çevrilir.
 */
async function canonicalRoomInstruments(
  tenantId: string,
  names: readonly string[],
  keep: readonly string[] = []
): Promise<ServiceResult<Instrument[]>> {
  const { resolveCanonicalValue } = await import("../normalize");
  const allowed = Array.from(new Set([...(await resolveActiveInstrumentNames(tenantId)), ...keep]));
  const out: Instrument[] = [];
  for (const name of names) {
    const canonical = resolveCanonicalValue(name, allowed);
    if (!canonical) {
      return fail(
        "VALIDATION_ERROR",
        `"${name}" kurumun aktif enstrüman listesinde yok. Kurulum Merkezi › Enstrümanlar ekranından ekleyin veya aktifleştirin, sonra tekrar deneyin.`
      );
    }
    out.push(canonical as Instrument);
  }
  return ok(Array.from(new Set(out)));
}

export async function createRoomTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ roomId: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "AI_AGENT", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(roomSchema, input);
  if (!v.ok) return v;
  const instruments = await canonicalRoomInstruments(ctx.tenantId, v.data.instruments);
  if (!instruments.ok) return instruments;

  try {
    const before = await readData();
    const ids = new Set(before.rooms.map((r) => r.id));
    await addRoom({
      name: v.data.name,
      branchId: v.data.branchId as BranchId,
      capacity: v.data.capacity,
      instruments: instruments.data,
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

  // DB egress (2026-10-17) — öneri yalnız bugünden `daysAhead` gün sonrasına kadar bakar: tüm ders geçmişi yerine
  // o pencerenin dersleri (±2 gün saat dilimi payı). `validateLessonSlot` seri/yoklama/ödeme/telafi okumaz.
  const now = new Date();
  const win = await readLessonWindow(
    addDays(now, -2).toISOString(),
    addDays(now, (v.data.daysAhead ?? 14) + 2).toISOString()
  );
  const data: WithStudentRefs<AppData> = { ...win, lessonSeries: [], attendances: [], makeupRequests: [], payments: [], teacherPayouts: [] };
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
  if (parsed.data.overrideAvailability && !canOverrideTeacherAvailability(ctx)) {
    return fail("FORBIDDEN", AVAILABILITY_OVERRIDE_FORBIDDEN);
  }
  // Saat kayması kök neden düzeltmesi — formdan gelen ofsetsiz "yyyy-MM-ddTHH:mm"
  // kurum saatidir; sunucu saat dilimine göre YORUMLANMAZ (bkz. wallDateTimeInputToIso).
  const normalizedStartAt = wallDateTimeInputToIso(parsed.data.startAt);
  if (!normalizedStartAt) return fail("VALIDATION_ERROR", "Geçerli bir ders tarihi ve saati seçin.");
  const v = ok({ ...parsed.data, startAt: normalizedStartAt });

  /**
   * DB egress (2026-10-10): eskiden tek ders oluşturma tenant'ın TÜM verisini dört kez okuyordu (burada
   * önce/sonra + store'da doğrulama/dönüş). Bu tool yalnız öğrenci/oda/öğretmen/kurum ayarı ve kapalı günleri
   * okur (referans dilimi — ders oluşturma bunları değiştirmez); oluşan ders kimliğiyle tek satır okunur.
   */
  const ref = await readReferenceData();

  // NeviiOS — şube müdürü: derslik ve öğrenci atanmış şubede olmalı.
  if (ctx.role === "BRANCH_MANAGER") {
    const d = ref;
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
  const settingsForClosedDays = ref;
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

  // 2026-10-04 — eğitim bağı: öğrencinin AKTİF eğitimi olmalı ve dersin enstrümanıyla eşleşmeli.
  let lessonEnrollmentId: string | undefined;
  if (v.data.enrollmentId && !v.data.enrollmentId.startsWith("legacy:")) {
    const st = settingsForClosedDays.students.find((x) => x.id === v.data.studentId);
    const enr = st?.enrollments?.find((x) => x.id === v.data.enrollmentId);
    if (!enr || !enr.active) return fail("VALIDATION_ERROR", "Seçilen branş kaydı bu öğrenciye ait değil veya sonlandırılmış. Branş listesini yenileyip tekrar seçin.");
    if (enr.instrument !== v.data.instrument) {
      return fail("VALIDATION_ERROR", `Seçilen eğitim ${enr.instrument}; ders enstrümanı ${v.data.instrument}. Eğitimi veya enstrümanı düzeltin.`);
    }
    lessonEnrollmentId = enr.id;
  }

  try {
    const createdId = await addLesson({
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
      enrollmentId: lessonEnrollmentId,
    });
    const after = ref;
    const created = await readLessonById(createdId);
    if (created?.availabilityOverride) {
      audit(ctx, "lesson.availability_override", "Lesson", created.id, {
        teacherId: created.teacherId,
        startAt: created.startAt,
        endAt: created.endAt,
        reason: v.data.overrideReason?.trim() || undefined,
      });
    }
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
      // Ders planlama İletişim Merkezi'nde mesaj taslağı OLUŞTURMAZ (sahip kararı 2026-10-18);
      // öğretmen yalnız yukarıdaki uygulama içi bildirimle haberdar edilir.
    }
    return ok({ lessonId: created?.id ?? "unknown" });
  } catch (e) {
    // İş 3 — TEACHER_UNAVAILABLE tek "soft warning" kodu: `details` içinde
    // yapılandırılmış olarak taşınır ki çağıran (actionAddLesson) mesaj
    // metnini ayrıştırmadan "override edilebilir mi" karar verebilsin.
    if (e instanceof EnrollmentRequiredError) return fail("VALIDATION_ERROR", e.message);
    if (e instanceof LessonSlotValidationError) {
      return fail("VALIDATION_ERROR", e.message, {
        slotValidationCode: e.code,
        overridable: isOverridableSlotCode(e.code) && canOverrideTeacherAvailability(ctx),
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
  {
    // 2026-10-06 — kulüp oturumu satırı tek başına değiştirilmez (oturum ekranından yönetilir).
    const { clubRowGuard } = await import("../clubs");
    const clubBlock = await clubRowGuard(ctx.tenantId, v.data.lessonId);
    if (clubBlock) return clubBlock;
  }

  if (ctx.role === "BRANCH_MANAGER") {
    const lesson = await readLessonById(v.data.lessonId);
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
  {
    // 2026-10-06 — kulüp oturumu satırı tek başına değiştirilmez (oturum ekranından yönetilir).
    const { clubRowGuard } = await import("../clubs");
    const clubBlock = await clubRowGuard(ctx.tenantId, v.data.lessonId);
    if (clubBlock) return clubBlock;
  }

  try {
    const lesson = await readLessonById(v.data.lessonId);
    if (!lesson) return fail("NOT_FOUND", "Ders bulunamadı");
    // Idempotent: zaten iptal edilmiş ders tekrar iptal edilmez, bildirim
    // tekrar gönderilmez — mobil retry/çift-tap güvenli.
    if (lesson.status === "cancelled") return ok({ lessonId: v.data.lessonId });
    await cancelLesson(v.data.lessonId);
    // 9. tur — iptal artık denetim kaydında (kim/ne zaman/hangi kaynak); kaynak ayrı alana.
    audit(ctx, "lesson.cancel", "Lesson", v.data.lessonId, {
      studentId: lesson.studentId,
      disruptionSource: v.data.disruptionSource ?? null,
      note: v.data.disruptionNote,
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
    /** Yalnız öğretmen müsaitliği nedeniyle uygun olmayan (istisnayla planlanabilir) tarih sayısı. */
    availabilityConflictCount: number;
    /** İstisnayla planlanacak tarih sayısı (overrideAvailability önizlemesinde). */
    overriddenCount: number;
    canOverrideAvailability: boolean;
  }>
> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(lessonSeriesParamsSchema, input);
  if (!v.ok) return v;
  if (v.data.overrideAvailability && !canOverrideTeacherAvailability(ctx)) {
    return fail("FORBIDDEN", AVAILABILITY_OVERRIDE_FORBIDDEN);
  }

  const occurrences = computeSeriesOccurrences(v.data);
  // DB egress (2026-10-17) — tam kurum verisi yerine oluşturmayla AYNI dar dilim (öğrenci/öğretmen/oda +
  // oluşum günleri; bkz. store-db addLessonSeries). Önizleme ve oluşturma aynı veriyle aynı sonucu verir.
  const data = await readSlotScopeData(
    { ...v.data, startAt: v.data.startsOn },
    occurrences.map((o) => new Date(o.startAt))
  );
  const student = data.students.find((s) => s.id === v.data.studentId);
  if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı.");
  if (!data.teachers.some((t) => t.id === v.data.teacherId)) return fail("NOT_FOUND", "Öğretmen bulunamadı.");
  if (!data.rooms.some((r) => r.id === v.data.roomId)) return fail("NOT_FOUND", "Oda bulunamadı.");
  if (!data.settings.branches.some((b) => b.id === v.data.branchId)) return fail("NOT_FOUND", "Şube bulunamadı.");

  // Bkz. validation.ts studentSchema.instrument yorumu — schema artık katalog
  // uyumlu serbest metin; gerçek enstrüman/öğretmen/oda uyumu makeup-engine.ts'te
  // (checkSeriesOccurrences → validateLessonSlot) doğrulanır, burada YALNIZCA tip cast'i.
  // Önizleme ve oluşturma AYNI kural: aynı istisna bayrağı, aynı dönem (haftalık kapalı gün) bilgisi.
  const checks = checkSeriesOccurrences(
    data,
    { ...v.data, instrument: v.data.instrument as Instrument },
    occurrences,
    new Date(),
    Boolean(v.data.overrideAvailability)
  );
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
    availabilityConflictCount: checks.filter((c) => !c.ok && c.code === "TEACHER_UNAVAILABLE").length,
    overriddenCount: checks.filter((c) => c.ok && c.availabilityOverridden).length,
    canOverrideAvailability: canOverrideTeacherAvailability(ctx),
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
  const override = Boolean(v.data.overrideAvailability);
  if (override && !canOverrideTeacherAvailability(ctx)) return fail("FORBIDDEN", AVAILABILITY_OVERRIDE_FORBIDDEN);
  const overrideReason = v.data.overrideReason?.trim() ?? "";
  if (override && overrideReason.length < 3) {
    return fail("VALIDATION_ERROR", "Müsaitlik dışı planlama için kısa bir gerekçe yazın (en az 3 karakter); gerekçe denetim kaydına işlenir.");
  }

  // Tekrar denemede mükerrer seri yok: aynı öğrenci/öğretmen/gün/saat/aralık için AKTİF seri varsa yeni seri yazılmaz.
  const existing = (await readLessonSeriesForStudent(v.data.studentId)).find(
    (s) =>
      s.status === "active" &&
      s.studentId === v.data.studentId &&
      s.teacherId === v.data.teacherId &&
      s.weekday === v.data.weekday &&
      s.startTime === v.data.startTime &&
      s.startsOn.slice(0, 10) === v.data.startsOn.slice(0, 10) &&
      s.endsOn.slice(0, 10) === v.data.endsOn.slice(0, 10)
  );
  if (existing) {
    return fail(
      "CONFLICT",
      "Bu öğrenci için aynı gün, saat ve tarih aralığında bir ders serisi zaten oluşturulmuş; ikinci kez yazılmadı. Ders Programı'nı yenileyip mevcut seriyi kontrol edin."
    );
  }

  try {
    const { skipConflicts, overrideAvailability: _o, overrideReason: _r, ...params } = v.data;
    const result = await addLessonSeries(
      { ...params, instrument: params.instrument as Instrument },
      { skipConflicts, createdByUserId: ctx.userId, allowAvailabilityOverride: override, overriddenByUserId: override ? ctx.userId : undefined }
    );
    if (!result.ok) return fail("CONFLICT", result.message, result.conflicts);
    if (override) {
      // Yazılan derslerin aynısı (store sonucu; tam okuma yok).
      const overridden = result.data.lessons.filter((l) => l.seriesId === result.seriesId && l.availabilityOverride);
      if (overridden.length > 0) {
        audit(ctx, "lesson_series.availability_override", "LessonSeries", result.seriesId, {
          teacherId: v.data.teacherId,
          studentId: v.data.studentId,
          reason: overrideReason,
          overriddenCount: overridden.length,
          dates: overridden.map((l) => l.startAt),
        });
      }
    }

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
    if (e instanceof EnrollmentRequiredError) return fail("VALIDATION_ERROR", e.message);
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

  // DB egress (2026-10-18): referans veri + her slot için oluşum günlerinin dar slot dilimi (eskiden tam okuma).
  const data = await readReferenceData();
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

  // 2026-10-09 — program sözleşmenin BRANŞINDAN üretilir (enstrüman/süre/gün-saat o branşın; öğrencinin ilk enstrümanı değil).
  const se = await import("../student-enrollments");
  const branchEnrollments = se.effectiveEnrollments(student, data.teachers);
  const contractBranchId = se.contractEnrollmentId(student, contract, data.teachers);
  const branchView = branchEnrollments.find((x) => x.id === contractBranchId);
  if (!branchView && branchEnrollments.length > 1) {
    return fail(
      "VALIDATION_ERROR",
      `${contract.contractNumber} sözleşmesinin branşı belirtilmemiş. Ders programı üretmeden önce Sözleşme Merkezi'nde "Branşa bağla" ile ilgili branş kaydına bağlayın.`
    );
  }
  const branchTerms = branchView ? se.enrollmentTerms(student, branchView, data.teachers) : undefined;
  const { parseLessonScheduleText } = await import("../lesson-schedule-text");
  const scheduleText =
    contract.contractDataSnapshot?.lessonScheduleText || (branchTerms ? branchTerms.lessonScheduleText : student.lessonScheduleText) || "";
  const slots = parseLessonScheduleText(scheduleText);
  if (slots.length === 0) {
    return fail(
      "VALIDATION_ERROR",
      "Sözleşmede ders günü/saati kayıtlı değil. Sözleşme Merkezi'ndeki “Ders günü/saati” alanını doldurup sözleşmeyi güncelleyin veya öğrenci kaydında gün/saat seçin."
    );
  }

  const startsOn = contract.enrollmentStartDate.slice(0, 10);
  const endsOn = contract.enrollmentEndDate.slice(0, 10);
  const durationMinutes =
    v.data.durationMinutes ?? branchTerms?.lessonDurationMinutes ?? student.lessonDurationMinutes ?? data.settings.lessonDurationMinutes;
  const instrument = (branchTerms?.instrument ?? student.instruments[0] ?? contract.programmeName) as Instrument;

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
      enrollmentId: se.isPersistedEnrollmentId(branchView?.id) ? branchView!.id : undefined,
    };
    const occurrences = computeSeriesOccurrences(params);
    const slotScope = await readSlotScopeData({ ...params, startAt: params.startsOn }, occurrences.map((o) => new Date(o.startAt)));
    const checks = checkSeriesOccurrences(slotScope, params, occurrences);
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

  // DB egress (2026-10-18): sözleşmenin serileri öğrencisinindir → öğrenci dilimi (eskiden tam okuma).
  const { getContract } = await import("../contracts");
  const contract = await getContract(ctx.tenantId, v.data.contractId);
  const data = contract ? await readStudentScope(contract.studentId) : { lessonSeries: [], lessons: [] };
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
  data: Pick<AppData, "lessonSeries" | "lessons">,
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
  {
    // 2026-10-06 — kulüp oturumu satırı tek başına değiştirilmez (oturum ekranından yönetilir).
    const { clubRowGuard } = await import("../clubs");
    const clubBlock = await clubRowGuard(ctx.tenantId, v.data.lessonId);
    if (clubBlock) return clubBlock;
  }
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
  {
    // 2026-10-06 — kulüp oturumu satırı tek başına değiştirilmez (oturum ekranından yönetilir).
    const { clubRowGuard } = await import("../clubs");
    const clubBlock = await clubRowGuard(ctx.tenantId, v.data.lessonId);
    if (clubBlock) return clubBlock;
  }
  // DB egress (2026-10-18): tek ders + tek öğrenci satırı (eskiden tam okuma).
  const lesson = await readLessonById(v.data.lessonId);
  if (!lesson) return fail("NOT_FOUND", "Ders bulunamadı. Sayfayı yenileyip tekrar deneyin.");
  const studentName = (await readStudentById(lesson.studentId))?.name ?? "Öğrenci";
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
      // Pasif (iptal/süresi dolmuş) telafi izleri — yalnız kimlik; içerik kopyalanmaz.
      ...(result.removedMakeupRequestIds.length ? { removedMakeupRequestIds: result.removedMakeupRequestIds } : {}),
      ...(result.detachedMakeupLessonIds.length ? { detachedMakeupLessonIds: result.detachedMakeupLessonIds } : {}),
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
        disruptionSource: lesson.disruptionSource,
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
  {
    // 2026-10-06 — kulüp oturumu satırı tek başına değiştirilmez (oturum ekranından yönetilir).
    const { clubRowGuard } = await import("../clubs");
    const clubBlock = await clubRowGuard(ctx.tenantId, v.data.lessonId);
    if (clubBlock) return clubBlock;
  }
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
  {
    // 2026-10-06 — kulüp oturumu satırı tek başına değiştirilmez (oturum ekranından yönetilir).
    const { clubRowGuard } = await import("../clubs");
    const clubBlock = await clubRowGuard(ctx.tenantId, v.data.lessonId);
    if (clubBlock) return clubBlock;
  }

  // DB egress (2026-10-18): ders satırı + referans veri (öğretmen/oda) — eskiden tam okuma.
  const [lesson, data] = await Promise.all([readLessonById(v.data.lessonId), readReferenceData()]);
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
    // DB egress (2026-10-18): öğrenci dilimi (yeni borç da bu öğrencinin; eskiden 2 tam okuma).
    const before = await readStudentScope(v.data.studentId);
    // 2026-10-09 — çok branşlı öğrencide borcun branşı AÇIKÇA seçilir (Keman borcu Piyano'ya yazılmaz);
    // "" = bilinçli "branşa bağlı değil (genel)". Tek branşlı öğrencide eski davranış.
    const student = before.students.find((st) => st.id === v.data.studentId);
    if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı. Listeyi yenileyip tekrar seçin.");
    const { effectiveEnrollments, isPersistedEnrollmentId } = await import("../student-enrollments");
    const enrollments = effectiveEnrollments(student, before.teachers);
    let enrollmentId: string | undefined;
    if (enrollments.length > 1) {
      if (v.data.enrollmentId === undefined) {
        return fail("VALIDATION_ERROR", "Bu öğrencinin birden fazla branş kaydı var; borcun hangi branşa ait olduğunu seçin (veya \"Branşa bağlı değil\").", {
          fieldErrors: { enrollmentId: ["Branş seçin."] },
        });
      }
      if (v.data.enrollmentId) {
        const hit = enrollments.find((x) => x.id === v.data.enrollmentId);
        if (!hit) return fail("VALIDATION_ERROR", "Seçilen branş kaydı bu öğrenciye ait değil. Sayfayı yenileyip yeniden seçin.");
        if (!isPersistedEnrollmentId(hit.id)) {
          const { ensurePersistedEnrollments, materializedEnrollmentId } = await import("../enrollment-links");
          await ensurePersistedEnrollments(ctx.tenantId, student, before.teachers);
          enrollmentId = materializedEnrollmentId(student.id, hit.instrument);
        } else enrollmentId = hit.id;
      }
    } else if (isPersistedEnrollmentId(enrollments[0]?.id)) {
      enrollmentId = enrollments[0]!.id;
    }
    const ids = new Set(before.payments.map((p) => p.id));
    await addPayment({
      studentId: v.data.studentId,
      description: v.data.description,
      amount: v.data.amount,
      dueDate: v.data.dueDate,
      ...(enrollmentId ? { enrollmentId } : {}),
    });
    const after = await readStudentScope(v.data.studentId);
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

  // DB egress (2026-10-18): yalnız bu öğretmenin hakedişleri (mobil Hakedişlerim; eskiden tam okuma).
  const payouts = ownPayouts(await readTeacherPayoutsForTeacher(v.data.teacherId), v.data.teacherId).sort((a, b) =>
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

  // DB egress (2026-10-18) — dönem penceresi (döküm aracıyla aynı ±2 gün pay; kesin kesim gün anahtarıyla hesapta).
  // Hesap, kayıtlı hakedişler ve fark yalnız dönemin derslerine bakar; kalem kaynağı aşağıda tamamlanır.
  const windowFrom = new Date(Date.parse(`${payoutPeriodDayKey(v.data.periodStart)}T00:00:00Z`) - 2 * 86_400_000).toISOString();
  const windowTo = new Date(Date.parse(`${payoutPeriodDayKey(v.data.periodEnd)}T23:59:59Z`) + 2 * 86_400_000).toISOString();
  const data = await readPayoutWindow(windowFrom, windowTo);
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
  const lineSources = await describeLineSources(data, shown.lines.map((l) => l.lessonId));
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

/**
 * 2026-10-06 — Hakediş DÖKÜMÜ (aylık: year+month, yıllık: year). Hesap `buildTeacherEarningsStatement` —
 * her ay hakediş ekranıyla (`computeTeacherPayoutTool`) aynı kayıt/canlı kuralı; yazma YOK.
 * Yetki: hakediş ekranıyla aynı (SCHOOL_ADMIN/SUPER_ADMIN + kurum hakediş politikası); tenant ALS'den.
 */
export async function teacherEarningsStatementTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<import("../teacher-earnings-statement").TeacherEarningsStatement & { teacherName: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", "Hakediş dökümünü yalnız kurum yöneticileri görüntüleyebilir.");
  const earnings = await assertTeacherEarningsAccess(ctx);
  if (!earnings.ok) return earnings;
  const v = parseOrFail(
    z.object({
      teacherId: z.string().min(1),
      year: z.number().int().min(2000).max(2100),
      month: z.number().int().min(1).max(12).optional(),
    }),
    input
  );
  if (!v.ok) return v;
  if (!canAccessTeacher(ctx, v.data.teacherId)) return fail("FORBIDDEN", "Bu öğretmenin hakediş dökümüne erişiminiz yok.");

  const { buildTeacherEarningsStatement, statementMonthPeriod } = await import("../teacher-earnings-statement");
  const first = statementMonthPeriod(v.data.year, v.data.month ?? 1).periodStart;
  const last = statementMonthPeriod(v.data.year, v.data.month ?? 12).periodEnd;
  // İstanbul gün sınırı için ±2 gün pay; kesin kesim gün anahtarıyla hesapta yapılır.
  const from = new Date(Date.parse(`${first}T00:00:00Z`) - 2 * 86_400_000).toISOString();
  const to = new Date(Date.parse(`${last}T23:59:59Z`) + 2 * 86_400_000).toISOString();
  const data = await readPayoutWindow(from, to);
  const teacher = data.teachers.find((t) => t.id === v.data.teacherId);
  if (!teacher) return fail("NOT_FOUND", "Öğretmen bu kurumda bulunamadı; kurum seçimini kontrol edin.");
  return ok({ ...buildTeacherEarningsStatement(data, v.data.teacherId, v.data.year, v.data.month), teacherName: teacher.name });
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
  /** Dersin güncel yoklama işareti (İşlendi / Geldi / Dersi bitir …). */
  attendanceLabel?: string;
  lessonType?: string;
};

async function describeLineSources(
  data: Pick<AppData, "lessons" | "teacherPayoutExclusions">,
  lessonIds: string[]
): Promise<Record<string, PayoutLineSource>> {
  const excluded = new Set((data.teacherPayoutExclusions ?? []).map((x) => x.lessonId));
  // DB egress (2026-10-18) — dersler dönem penceresinden gelir; donmuş kalemin dersi sonradan pencere dışına
  // taşınmışsa tek satır okunur (yoksa silinmiştir). Demo etiketi yalnız kalem derslerinin serilerinden okunur.
  const byId = new Map(data.lessons.map((l) => [l.id, l]));
  const outside = await Promise.all(lessonIds.filter((id) => !byId.has(id)).map((id) => readLessonById(id)));
  for (const l of outside) if (l) byId.set(l.id, l);
  const seriesIds = [...new Set(lessonIds.map((id) => byId.get(id)?.seriesId).filter((s): s is string => Boolean(s)))];
  const seriesById = new Map((await readLessonSeriesByIds(seriesIds)).map((s) => [s.id, s]));
  const out: Record<string, PayoutLineSource> = {};
  for (const id of lessonIds) {
    const lesson = byId.get(id);
    const series = lesson?.seriesId ? seriesById.get(lesson.seriesId) : undefined;
    out[id] = {
      state: !lesson ? "missing" : isLessonProcessedForPayout(lesson) ? "ok" : "not_processed",
      demo: Boolean(series?.demoTag),
      programHref: lesson ? `/panel/program?studentId=${lesson.studentId}&week=${lesson.startAt.slice(0, 10)}` : undefined,
      excluded: excluded.has(id),
      // 2026-10-04 — dökümde yoklama: hakedişe hangi işaretle girdiği (İşlendi / Geldi / Dersi bitir).
      attendanceLabel: !lesson
        ? undefined
        : lesson.lessonProcessed
          ? "İşlendi"
          : lesson.studentAttended
            ? "Geldi"
            : lesson.opsMakeupFlag
              ? "Telafi"
              : lesson.studentAbsent
                ? "Gelmedi"
                : lesson.studentExcused
                  ? "Mazeretli"
                  : lesson.status === "completed"
                    ? "Tamamlandı (Dersi bitir)"
                    : "Yoklama girilmedi",
      lessonType: lesson?.type,
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
 * 2026-10-20 — açık/planlı taleplerin son günü de yeni pencereye göre uzar (asla kısalmaz; bkz.
 * `expiresAtForPolicyWindow`). Eskiden yalnız ileri yönlüydü: öneri yeni pencereyle, doğrulama eski
 * `expiresAt` ile çalışıp "hakkı var ama planlanamaz" çelişkisi üretiyordu.
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
    const { supersededUncollectedMonthlyPlanIds } = await import("../superseded-monthly-plan");
    const terminalContractIds = await listTerminalContractIds(ctx.tenantId);
    const duplicatedPlan = supersededUncollectedMonthlyPlanIds(data.payments, terminalContractIds);
    // 2026-10-09 — çok branşlı öğrencide hatırlatma hangi branşın borcu olduğunu söyler (ödeme satırı başına, çift yok).
    const { listContractEnrollmentLinks } = await import("../contracts");
    const { makePaymentBranchLabeler } = await import("../student-enrollments");
    const branchOf = makePaymentBranchLabeler({
      students: data.students,
      teachers: data.teachers,
      lessons: data.lessons,
      contracts: await listContractEnrollmentLinks(ctx.tenantId),
    });

    let scanned = 0;
    let casesUpserted = 0;
    let notificationsCreated = 0;

    for (const payment of data.payments) {
      if (payment.status !== "overdue") continue;
      // UAT 2026-09-25 — iptal/yenilenmiş sözleşmenin tahsil edilmemiş taksiti için hatırlatma üretilmez.
      if (!isLiveObligation(payment, terminalContractIds) || duplicatedPlan.has(payment.id)) continue;
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
      const branchLabel = branchOf(payment);
      const branchText = branchLabel ? ` (${branchLabel})` : "";
      const messageDraft = `Merhaba, ${student.name} için${branchText} ${formatMoney(remaining)} tutarında gecikmiş ödeme kaydı bulunmaktadır. Size uygun ödeme planı için bizimle iletişime geçebilirsiniz.`;

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
        body: `${branchLabel ? `${branchLabel} · ` : ""}${payment.description} için ${formatMoney(remaining)} tutarında ödemeniz gecikmiştir.`,
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
            body: `${student.name}${branchText}: ${payment.description} — ${formatMoney(remaining)} gecikmiş. Detay: ${paymentTargetHref(student.id, payment.id)}`,
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
    // 2026-10-20 — kayıtlı ayarla BİRLEŞTİR: form yalnız kendi alanlarını gönderir; eskiden tüm JSON üzerine yazıldığı
    // için formda olmayan alanlar (sözleşme ödeme penceresi, KDV, ilk tahsilat eşiği) her kayıtta siliniyordu.
    const current = (await readReferenceData()).settings.collectionsSettings;
    // IBAN boş bırakılınca silinir (form boşu `undefined` gönderir; birleştirme eskisini tutmasın).
    const merged: CollectionsSettings = {
      ...current,
      ...v.data,
      vakifbankIban: v.data.vakifbankIban,
      halkbankIban: v.data.halkbankIban,
    };
    await updateCollectionsSettings(merged);
    audit(ctx, "school.collections_settings_update", "School", ctx.tenantId, {
      frequencyLimitDays: merged.frequencyLimitDays,
      autoSendEnabled: merged.autoSendEnabled,
      vakifbankIbanSet: !!merged.vakifbankIban,
      halkbankIbanSet: !!merged.halkbankIban,
      paymentReminderEnabled: merged.paymentReminderEnabled,
      paymentReminderDaysBefore: merged.paymentReminderDaysBefore,
      paymentReminderRepeatDays: merged.paymentReminderRepeatDays,
      paymentReminderMaxRepeats: merged.paymentReminderMaxRepeats,
    });
    return ok({ collectionsSettings: merged });
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

/** Rapor portalı (2026-10-14): rapor gönderiminde yöneticilere bildirim; bildirim hatası kaydı geri almaz. */
async function notifyReportSubmitted(
  tenantId: string,
  category: "lesson_assessment_submitted" | "periodic_assessment_submitted",
  recordId: string,
  notification: { title: string; body: string }
): Promise<void> {
  try {
    const { notifyAdmins } = await import("../manager-notifications");
    await notifyAdmins(tenantId, category, notification, { dedupeKey: recordId });
  } catch {
    // bildirim en iyi çaba — rapor kaydedildi
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

  // Kota (2026-10-14): tam okuma yerine tek satır okumalar.
  const student = await readStudentById(v.data.studentId);
  const access = await assertStudentAccess(ctx, student, v.data.studentId);
  if (!access.ok) return fail(access.code, access.message);
  if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı");
  const lesson = await readLessonById(v.data.lessonId);
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
      // 2026-10-14 — çoklu branş: rapor dersin öğretmenine aittir (öğrencinin "ilk" öğretmenine değil).
      teacherId: lesson.teacherId,
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
    await notifyReportSubmitted(ctx.tenantId, "lesson_assessment_submitted", assessment.id, {
      title: "Yeni ders gelişim raporu",
      body: `${student.name} için ders gelişim raporu gönderildi. Detay: /panel/raporlar?sekme=gelisim (ref:${assessment.id})`,
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
      const students = data.students.filter((s) => isOwnStudent(s, teacherId) && s.active);
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

  // Kota (2026-10-14): tek öğrenci dilimi (yalnız bu öğrencinin dersleri) — tam okuma değil.
  const data = await readStudentScope(v.data.studentId);
  const student = data.students.find((s) => s.id === v.data.studentId);
  if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı");
  if (ctx.role === "TEACHER" && !isOwnStudent(student, ctx.teacherId ?? "")) {
    return fail("FORBIDDEN", "Yalnızca kendi öğrenciniz için değerlendirme gönderebilirsiniz.");
  }
  // 2026-10-14 — çoklu branş: öğretmen kendi branşı adına yazar; yönetici atanmış öğretmen adına (eski davranış).
  const reportTeacherId = ctx.role === "TEACHER" && ctx.teacherId ? ctx.teacherId : student.teacherId;

  const submitted = await listPeriodicAssessmentsForTeacher(ctx.tenantId, reportTeacherId);
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
      teacherId: reportTeacherId,
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
    await notifyReportSubmitted(ctx.tenantId, "periodic_assessment_submitted", result.assessment.id, {
      title: "Yeni 4 haftalık gelişim raporu",
      body: `${student.name} için 4 haftalık genel değerlendirme gönderildi. Detay: /panel/raporlar?sekme=donemsel (ref:${result.assessment.id})`,
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

  const lesson = await readLessonById(v.data.lessonId);
  if (!lesson) return fail("NOT_FOUND", "Ders bulunamadı");

  try {
    const result = await startLessonLive(v.data.lessonId);
    if (!result.ok) return fail("VALIDATION_ERROR", result.message);
    audit(ctx, "lesson.start", "Lesson", v.data.lessonId, {});
    // Notify the student (if they have a login User) that the lesson started.
    try {
      const { getUserIdByStudentId } = await import("../auth/users");
      const { isCategoryEnabledForUser } = await import("../notification-preferences");
      const { createNotification, hasRecentNotification } = await import("../notifications");
      const studentUserId = await getUserIdByStudentId(ctx.tenantId, result.lesson.studentId);
      if (studentUserId) {
        const enabled = await isCategoryEnabledForUser(ctx.tenantId, studentUserId, "lesson_started");
        if (enabled) {
          const since = Date.now() - 60 * 60 * 1000; // 1 hour dedupe window
          // DB egress (2026-10-18): her ders başlangıcında öğrencinin tüm bildirimleri okunmaz; aynı kural SQL'de.
          const dup = await hasRecentNotification({ tenantId: ctx.tenantId, userId: studentUserId, kind: "lesson_started", bodyIncludes: result.lesson.id, since: new Date(since) });
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

  const lesson = await readLessonById(v.data.lessonId);
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
    const raw = await listAvailabilityRequestsForTeacher(ctx.tenantId, v.data.teacherId);
    // Legacy/satır-kayıtlar `proposedAvailability` taşımayabilir — UI'ın
    // `.map`/`.length` çağrıları çökmemesi için normalize edilir.
    const requests = raw.map((r) => ({
      ...r,
      proposedAvailability: Array.isArray(r.proposedAvailability) ? r.proposedAvailability : [],
    }));
    // Öğretmenin güncel (onaylı) müsaitliği — kayıt yoksa [] (mobil UI
    // `currentAvailability.length` çağırır; undefined dönmek render crash'ti).
    let currentAvailability: Array<{ dayOfWeek: number; start: string; end: string; branchId?: string }> = [];
    try {
      // DB egress (2026-10-18): yalnız öğretmen satırları (referans veri) — eskiden tam okuma.
      const teacher = (await readReferenceData()).teachers.find((t) => t.id === v.data.teacherId);
      if (Array.isArray(teacher?.availability)) currentAvailability = teacher.availability;
    } catch {
      currentAvailability = [];
    }
    return ok({ requests, currentAvailability });
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

  // DB egress (2026-10-18): tek öğrenci + tek ders satırı (eskiden tam okuma).
  const student = await readStudentById(v.data.studentId);
  if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı");
  if (!isOwnStudent(student, ctx.teacherId ?? "")) {
    return fail("FORBIDDEN", "Yalnızca kendi öğrenciniz için ödev oluşturabilirsiniz.");
  }
  if (v.data.lessonId) {
    const lesson = await readLessonById(v.data.lessonId);
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

    const refTeachers = (await readReferenceData()).teachers;
    const lists = await Promise.all(materialTeacherIdsForStudent(student, refTeachers).map((tid) => listTeachingMaterialsForTeacher(ctx.tenantId, tid)));
    const materials = lists.flat().filter((m) => materialVisibleToStudent(m, student, refTeachers));
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
    if (!student || !materialVisibleToStudent(material, student, (await readReferenceData()).teachers)) {
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

  // Tek öğrenci dilimi: öğretmenler + yalnız bu öğrencinin dersleri (uygunluk kuralı için).
  const data = await readStudentScope(v.data.studentId);
  const student = data.students.find((s) => s.id === v.data.studentId);
  if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı");
  // 2026-10-14 — çoklu branş: değerlendirme seçilen öğretmene yazılır; yalnız uygun öğretmen kabul edilir.
  const { eligibleFeedbackTeacherIds } = await import("../teacher-feedback-eligibility");
  const teacherId = v.data.teacherId ?? student.teacherId;
  if (v.data.teacherId && !eligibleFeedbackTeacherIds(student, data.lessons, Date.now()).includes(v.data.teacherId)) {
    return fail(
      "FORBIDDEN",
      "Bu öğretmeni değerlendiremezsiniz: kayıtlı branşlarınızın öğretmeni değil ve son 90 günde birlikte dersiniz yok."
    );
  }

  try {
    // Karma Öğrenci Portalı — ctx.role artık HER ZAMAN "STUDENT" (veli de
    // öğrenci de). Admin inceleme ekranının "STUDENT"/"PARENT" kaynak
    // filtresi anlamını korusun diye burada accessType'a göre eski
    // etiketleme davranışı YENİDEN üretilir (GUARDIAN → "PARENT").
    const accessType = await resolveCallerAccessType(ctx, v.data.studentId);
    const submitterRole = accessType === "GUARDIAN" ? "PARENT" : "STUDENT";
    const { feedback, updated } = await submitTeacherFeedback({
      tenantId: ctx.tenantId,
      teacherId,
      studentId: v.data.studentId,
      submittedBy: ctx.userId,
      submitterRole,
      scores: v.data.scores,
      continueWithTeacher: v.data.continueWithTeacher,
      comment: v.data.comment,
    });
    audit(ctx, updated ? "teacher_feedback.update" : "teacher_feedback.submit", "TeacherFeedback", feedback.id, {
      teacherId,
    });
    try {
      const teacher = data.teachers.find((t) => t.id === teacherId);
      const { notifyAdmins } = await import("../manager-notifications");
      // dedupeKey = feedback.id: aynı ay içindeki tekrar submit (update) aynı
      // satırı güncellediği için aynı id kalır — 24 saat içinde ikinci kez
      // "yeni değerlendirme" bildirimi üretilmez (bkz. notifyAdmins dedupe).
      await notifyAdmins(
        ctx.tenantId,
        "teacher_feedback_submitted",
        {
          title: "Yeni öğretmen değerlendirmesi",
          body: `${teacher?.name ?? "Bir öğretmen"} için yeni bir değerlendirme geldi. Detay: /panel/ogretmenler/${teacherId}/geri-bildirim (ref:${feedback.id})`,
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

/* ------------------------------------------------------------------ */
/* Rapor portalı (2026-10-14) — yönetici "Raporlar" ekranı              */
/* ------------------------------------------------------------------ */

const reportPageSchema = z.object({
  teacherId: z.string().min(1).optional(),
  studentId: z.string().min(1).optional(),
  from: z.string().min(1),
  to: z.string().min(1),
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(5).max(100).default(25),
});

/** Ders gelişimi raporları — yalnız yönetici; filtreli, sayfalı (tüm tablo okunmaz). */
export async function listLessonAssessmentsForAdminTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ rows: LessonAssessment[]; total: number }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(reportPageSchema, input);
  if (!v.ok) return v;
  const { listAssessmentsPage } = await import("../assessment");
  return ok(await listAssessmentsPage(ctx.tenantId, { ...v.data, fromIso: v.data.from, toIso: v.data.to }));
}

/** 4 haftalık değerlendirmeler — yalnız yönetici; filtreli, sayfalı. */
export async function listPeriodicAssessmentsForAdminTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ rows: PeriodicAssessment[]; total: number }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(reportPageSchema, input);
  if (!v.ok) return v;
  const { listPeriodicAssessmentsPage } = await import("../periodic-assessment");
  return ok(await listPeriodicAssessmentsPage(ctx.tenantId, { ...v.data, fromIso: v.data.from, toIso: v.data.to }));
}

/** Üst kartlar: raporu bekleyen dersler (öğretmen bazında, son 14 gün) + etkin değerlendirme bağlantısı sayısı. */
export async function getReportsOverviewTool(
  ctx: ServiceContext
): Promise<ServiceResult<{ pendingByTeacher: { teacherId: string; count: number }[]; pendingTotal: number; activeInvites: number }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const { pendingLessonAssessments, PENDING_LESSON_WINDOW_DAYS } = await import("../reports/pending");
  const { listAssessedLessonIds } = await import("../assessment");
  const { countActiveInvites } = await import("../feedback-invites");
  const now = new Date();
  const win = await readLessonWindow(
    new Date(now.getTime() - (PENDING_LESSON_WINDOW_DAYS + 1) * 86_400_000).toISOString(),
    now.toISOString()
  );
  const assessed = await listAssessedLessonIds(ctx.tenantId, win.lessons.map((l) => l.id));
  const pending = pendingLessonAssessments(win.lessons, assessed, null, now.getTime());
  const byTeacher = new Map<string, number>();
  for (const l of pending) byTeacher.set(l.teacherId, (byTeacher.get(l.teacherId) ?? 0) + 1);
  return ok({
    pendingByTeacher: [...byTeacher].map(([teacherId, count]) => ({ teacherId, count })).sort((a, b) => b.count - a.count),
    pendingTotal: pending.length,
    activeInvites: await countActiveInvites(ctx.tenantId),
  });
}

/* ------------------------------------------------------------------ */
/* Rapor portalı (2026-10-14) — kişiye özel değerlendirme bağlantısı     */
/* ------------------------------------------------------------------ */

const FEEDBACK_INVITE_STATUS_MESSAGES = {
  not_found: "Bu değerlendirme bağlantısı geçersiz. Bağlantıyı eksiksiz kopyaladığınızdan emin olun veya kurumdan yeni bağlantı isteyin.",
  expired: "Bu bağlantının süresi doldu (14 gün). Kurumdan yeni bir değerlendirme bağlantısı isteyin.",
  revoked: "Bu bağlantı kurum tarafından iptal edildi veya yenisiyle değiştirildi. Size gönderilen en son bağlantıyı kullanın.",
} as const;

/** Yönetici: öğrenci için 14 gün geçerli kişiye özel bağlantı üretir; öğrencinin önceki etkin bağlantısı iptal olur. */
export async function createFeedbackInviteTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ inviteId: string; url: string; expiresAt: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const moduleGate = await assertFeatureEnabled(ctx.tenantId, "teacherFeedback");
  if (!moduleGate.ok) return moduleGate;
  const v = parseOrFail(z.object({ studentId: z.string().min(1) }), input);
  if (!v.ok) return v;

  const student = await readStudentById(v.data.studentId);
  if (!student || student.deletedAt) {
    return fail("NOT_FOUND", "Öğrenci bulunamadı. Öğrenciler listesinden kaydın silinmediğini kontrol edin.");
  }
  try {
    const { createInvite } = await import("../feedback-invites");
    const { getPublicAppBaseUrl } = await import("../email/config");
    const { invite, code } = await createInvite(ctx.tenantId, student.id, ctx.userId);
    audit(ctx, "feedback_invite.create", "FeedbackInvite", invite.id, { studentId: student.id });
    return ok({ inviteId: invite.id, url: `${getPublicAppBaseUrl()}/degerlendir/${code}`, expiresAt: invite.expiresAt });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "createFeedbackInvite failed");
  }
}

export async function revokeFeedbackInviteTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ revoked: true }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(z.object({ inviteId: z.string().min(1) }), input);
  if (!v.ok) return v;
  const { revokeInvite } = await import("../feedback-invites");
  if (!(await revokeInvite(ctx.tenantId, v.data.inviteId))) {
    return fail("NOT_FOUND", "İptal edilecek etkin bağlantı bulunamadı; zaten iptal edilmiş veya süresi dolmuş olabilir.");
  }
  audit(ctx, "feedback_invite.revoke", "FeedbackInvite", v.data.inviteId);
  return ok({ revoked: true });
}

type InviteTeacherView = { id: string; name: string; instruments: string[]; done: boolean };

/** `/degerlendir/<kod>` sayfası: bağlantının durumu + öğrencinin adı + değerlendirebileceği öğretmenler (oturum yok). */
export async function describeFeedbackInviteTool(
  code: string
): Promise<
  ServiceResult<
    | { status: "ok" | "completed"; studentName: string; expiresAt: string; teachers: InviteTeacherView[] }
    | { status: "not_found" | "expired" | "revoked"; message: string }
  >
> {
  const { resolveInvite } = await import("../feedback-invites");
  const r = await resolveInvite(code);
  if (r.status !== "ok") return ok({ status: r.status, message: FEEDBACK_INVITE_STATUS_MESSAGES[r.status] });
  const invite = r.invite;
  return runWithTenantAsync(invite.tenantId, async () => {
    const view = await loadInviteTeachers(invite);
    if (!view) return ok({ status: "not_found" as const, message: FEEDBACK_INVITE_STATUS_MESSAGES.not_found });
    const status = view.teachers.length > 0 && view.teachers.every((t) => t.done) ? ("completed" as const) : ("ok" as const);
    return ok({ status, studentName: view.studentName, expiresAt: invite.expiresAt, teachers: view.teachers });
  });
}

async function loadInviteTeachers(
  invite: import("../feedback-invites").FeedbackInviteRow
): Promise<{ studentName: string; teachers: InviteTeacherView[] } | null> {
  const scope = await readStudentScope(invite.studentId);
  const student = scope.students.find((s) => s.id === invite.studentId);
  if (!student || student.deletedAt) return null;
  const { eligibleFeedbackTeacherIds } = await import("../teacher-feedback-eligibility");
  const ids = eligibleFeedbackTeacherIds(student, scope.lessons, Date.now());
  const teachers = ids
    .map((id) => scope.teachers.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t))
    .map((t) => ({ id: t.id, name: t.name, instruments: t.instruments as string[], done: invite.completedTeacherIds.includes(t.id) }))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const { maskStudentName } = await import("../feedback-invites");
  return { studentName: maskStudentName(student.name), teachers };
}

const inviteFeedbackSchema = submitTeacherFeedbackSchema.omit({ studentId: true }).extend({ teacherId: z.string().min(1) });

/**
 * `/degerlendir/<kod>` gönderimi (oturum YOK): tenant ve öğrenci kodun satırından gelir; yalnız uygun ve henüz
 * değerlendirilmemiş öğretmen kabul edilir. Kayıt mevcut aylık öğretmen değerlendirmesi kuralıyla yazılır.
 */
export async function submitTeacherFeedbackViaInviteTool(
  code: string,
  input: unknown,
  clientKey: string
): Promise<ServiceResult<{ feedbackId: string; remaining: number }>> {
  const { consumeRateLimit } = await import("../rate-limit");
  const { resolveInvite, hashInviteCode, markInviteTeacherCompleted, releaseInviteTeacher } = await import("../feedback-invites");
  if (!consumeRateLimit("feedback-invite", `${clientKey}:${hashInviteCode(code).slice(0, 16)}`, { windowMs: 600_000, max: 10 })) {
    return fail("RATE_LIMITED", "Kısa sürede çok fazla deneme yapıldı. Lütfen 10 dakika sonra tekrar deneyin.");
  }
  const r = await resolveInvite(code);
  if (r.status !== "ok") return fail(r.status === "not_found" ? "NOT_FOUND" : "CONFLICT", FEEDBACK_INVITE_STATUS_MESSAGES[r.status]);
  const v = parseOrFail(inviteFeedbackSchema, input);
  if (!v.ok) return v;
  const invite = r.invite;

  return runWithTenantAsync(invite.tenantId, async () => {
    const moduleGate = await assertFeatureEnabled(invite.tenantId, "teacherFeedback");
    if (!moduleGate.ok) return moduleGate;
    const view = await loadInviteTeachers(invite);
    if (!view) return fail("NOT_FOUND", FEEDBACK_INVITE_STATUS_MESSAGES.not_found);
    const target = view.teachers.find((t) => t.id === v.data.teacherId);
    if (!target) {
      return fail("FORBIDDEN", "Bu öğretmeni bu bağlantıyla değerlendiremezsiniz: öğrencinin kayıtlı branş öğretmeni değil ve son 90 günde dersi yok.");
    }
    const alreadyDone = `${target.name} için değerlendirmeniz zaten alındı. Teşekkür ederiz.`;
    if (target.done) return fail("CONFLICT", alreadyDone);
    // Güvenlik incelemesi: önce atomik yer ayırtma (eşzamanlı iki gönderimden yalnız biri geçer).
    if (!(await markInviteTeacherCompleted(invite.id, target.id))) return fail("CONFLICT", alreadyDone);
    // Bu ay portaldan (öğrenci/veli oturumuyla) gelmiş değerlendirmenin ÜZERİNE YAZILMAZ.
    const existing = await findTeacherFeedbackThisMonth(invite.tenantId, invite.studentId, target.id);
    if (existing && !existing.submittedBy.startsWith("invite:")) {
      return fail("CONFLICT", `${target.name} için bu ay öğrenci portalından bir değerlendirme zaten gönderilmiş; tekrar göndermenize gerek yok.`);
    }

    try {
      const { feedback } = await submitTeacherFeedback({
        tenantId: invite.tenantId,
        teacherId: target.id,
        studentId: invite.studentId,
        submittedBy: `invite:${invite.id}`,
        submitterRole: "STUDENT_LINK",
        scores: v.data.scores,
        continueWithTeacher: v.data.continueWithTeacher,
        comment: v.data.comment,
      });
      audit(
        { role: "STUDENT", userId: `invite:${invite.id}`, tenantId: invite.tenantId, channel: "web" },
        "teacher_feedback.submit_via_invite",
        "TeacherFeedback",
        feedback.id,
        { teacherId: target.id, inviteId: invite.id }
      );
      try {
        const { notifyAdmins } = await import("../manager-notifications");
        await notifyAdmins(
          invite.tenantId,
          "teacher_feedback_submitted",
          {
            title: "Yeni öğretmen değerlendirmesi",
            body: `${target.name} için değerlendirme bağlantısından yeni bir değerlendirme geldi. Detay: /panel/raporlar?sekme=degerlendirme (ref:${feedback.id})`,
          },
          { dedupeKey: feedback.id }
        );
      } catch {
        // bildirim en iyi çaba
      }
      const remaining = view.teachers.filter((t) => !t.done && t.id !== target.id).length;
      return ok({ feedbackId: feedback.id, remaining });
    } catch (e) {
      await releaseInviteTeacher(invite.id, target.id).catch(() => undefined);
      // Oturumsuz uç: iç hata metni dışarı verilmez (güvenlik incelemesi); ayrıntı sunucu log'unda.
      logger.error("submitTeacherFeedbackViaInvite", e instanceof Error ? e.message : String(e));
      return fail("INTERNAL_ERROR", "Değerlendirmeniz kaydedilemedi. Lütfen birkaç dakika sonra tekrar deneyin; sorun sürerse kurumla iletişime geçin.");
    }
  });
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
  sourceType: z.enum(["STUDENT", "PARENT", "STUDENT_LINK"]).optional(),
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
  const { supersededUncollectedMonthlyPlanIds } = await import("../superseded-monthly-plan");
  const { isTerminalContractStatus } = await import("../contract-list-helpers");
  const [contracts, documents, pw] = await Promise.all([
    listContractsForStudent(tenantId, studentId),
    listDocumentsForStudent(tenantId, studentId),
    getCriticalActionPasswordStatus(tenantId),
  ]);
  const payments = data.payments.filter((p) => p.studentId === studentId);
  const deletionTerminal = new Set(contracts.filter((c) => isTerminalContractStatus(c.status)).map((c) => c.id));
  const duplicatedPlan = supersededUncollectedMonthlyPlanIds(payments, deletionTerminal);
  const lessons = data.lessons.filter((l) => l.studentId === studentId);
  const nowMs = Date.now();
  const attendanceCount = data.attendances.filter((a) => a.studentId === studentId).length;
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
      .filter((p) => isLiveObligation(p, deletionTerminal) && !duplicatedPlan.has(p.id))
      .reduce((sum, p) => sum + Math.max(0, p.amount - p.paidAmount), 0),
    collectedAmount: payments.reduce((sum, p) => sum + collectedAmountOf(p), 0),
    lessonCount: lessons.length,
    upcomingLessonCount: lessons.filter((l) => l.status === "scheduled" && new Date(l.startAt).getTime() > nowMs).length,
    documentCount: documents.length,
    attendanceCount,
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
  /** "soft" = geri alınabilir silme (varsayılan). "hard" = kalıcı silme → `purgePersonTool` (önizleme parmak izi zorunlu). */
  mode: z.enum(["soft", "hard"]),
  expectedFingerprint: z.string().max(100).optional(),
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
 * korunur, Silinenler'den geri alınabilir. "hard": `purgePersonTool` (Silinenler'deki
 * öğrenci, önizleme parmak izi zorunlu); geri alınamaz. Her deneme audit'e yazılır.
 */
export async function deleteStudentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ studentId: string; mode: "soft" | "hard" }>> {
  const auth = requireRole(ctx, CRITICAL_ROLES_FOR_TOOLS);
  if (!auth.ok) return fail("FORBIDDEN", "Öğrenci silme yalnız kurum sahibi ve kurum yöneticileri tarafından başlatılabilir.");
  const v = parseOrFail(deleteStudentSchema, input);
  if (!v.ok) return v;
  if (v.data.mode === "hard") {
    const r = await purgePersonTool(ctx, { ...v.data, mode: "standard", kind: "student", id: v.data.studentId });
    return r.ok ? ok({ studentId: v.data.studentId, mode: "hard" }) : r;
  }
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
    await setStudentDeletion(v.data.studentId, {
      deletedAt: new Date().toISOString(),
      deletedByUserId: ctx.userId,
      deletionReason: v.data.reason,
    });
  } catch (e) {
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
  if (student.purgedAt) return fail("VALIDATION_ERROR", "Bu öğrenci kalıcı silinmiş (anonimleştirilmiş); geri alınamaz.");
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
 * - "Kalıcı silme" (hard): Kaldırılanlar listesinden, `purgePersonTool` ile — geçmişi olmayan öğretmen silinir,
 *   geçmişi olan anonimleştirilir (bkz. person-purge.ts); geri alınamaz.
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
  const students = data.students.filter((s) => isOwnStudent(s, teacherId));
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
  expectedFingerprint: z.string().max(100).optional(),
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
  if (v.data.mode === "hard") {
    const r = await purgePersonTool(ctx, { ...v.data, mode: "standard", kind: "teacher", id: v.data.teacherId });
    return r.ok ? ok({ teacherId: v.data.teacherId, mode: "hard" }) : r;
  }
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

  try {
    await setTeacherDeletion(v.data.teacherId, { deletedAt: new Date().toISOString(), deletedByUserId: ctx.userId, deletionReason: v.data.reason });
  } catch (e) {
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
  if (teacher.purgedAt) return fail("VALIDATION_ERROR", "Bu öğretmen kalıcı silinmiş (anonimleştirilmiş); geri alınamaz.");
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

/**
 * 2026-10-15 (owner) — kalıcı silme önizlemesi: sunucudaki GERÇEK kayıtlardan plan (silinecek / bağlantısı
 * kaldırılacak / korunacak kayıtlar, hesaplar, engeller) + parmak izi. Silme aynı planı kilit altında yeniden kurar.
 */
export type PersonPurgePreview = import("../person-purge").PurgePlan & {
  criticalPasswordConfigured: boolean;
  /** "Yanlış oluşturuldu — her şeyi sil" (finans dahil) yalnız kurum sahibine açık. */
  canWipe: boolean;
};

const purgeTargetSchema = z.object({
  kind: z.enum(["student", "teacher"]),
  id: z.string().min(1),
  mode: z.enum(["standard", "wipe"]).default("standard"),
  /** Öğretmen tam silme: dersler silinsin mi, seçilen öğretmene mi devredilsin; öğrenci ataması hedefe devredilir. */
  lessonAction: z.enum(["delete", "reassign"]).optional(),
  targetTeacherId: z.string().min(1).max(100).optional(),
});
const wipeOptionsOf = (d: { lessonAction?: "delete" | "reassign"; targetTeacherId?: string }) => ({
  ...(d.lessonAction ? { lessonAction: d.lessonAction } : {}),
  ...(d.targetTeacherId ? { targetTeacherId: d.targetTeacherId } : {}),
});

/** Finansal kayıtları da silen mod yalnız kurum sahibi (SUPER_ADMIN) — kurum yöneticisi standart modu kullanır. */
const canWipePerson = (ctx: ServiceContext) => ctx.role === "SUPER_ADMIN";
const WIPE_FORBIDDEN = "Finansal kayıtlar dahil tam silme (\"Yanlış oluşturuldu — her şeyi sil\") yalnız kurum sahibi tarafından yapılabilir. Standart kalıcı silmeyi kullanın veya kurum sahibinden isteyin.";

export async function getPersonPurgePreviewTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<PersonPurgePreview>> {
  const auth = requireRole(ctx, CRITICAL_ROLES_FOR_TOOLS);
  if (!auth.ok) return fail("FORBIDDEN", "Kalıcı silme yalnız kurum sahibi ve kurum yöneticileri tarafından yapılabilir.");
  const v = parseOrFail(purgeTargetSchema, input);
  if (!v.ok) return v;
  if (v.data.mode === "wipe" && !canWipePerson(ctx)) return fail("FORBIDDEN", WIPE_FORBIDDEN);
  const snap = await loadPurgeSnapshot(v.data.kind, v.data.id);
  if (!snap) return fail("NOT_FOUND", "Kayıt bulunamadı veya zaten kalıcı silinmiş; listeyi yenileyin.");
  const { planPersonPurge } = await import("../person-purge");
  const { getCriticalActionPasswordStatus } = await import("../critical-action-password");
  const pw = await getCriticalActionPasswordStatus(ctx.tenantId);
  return ok({ ...planPersonPurge(snap, v.data.mode, wipeOptionsOf(v.data)), criticalPasswordConfigured: pw.configured, canWipe: canWipePerson(ctx) });
}

const purgePersonSchema = purgeTargetSchema.extend({
  /** Yalnız "wipe": "finansal kayıtlar da silinecek" kutusu işaretlendi. */
  financialAcknowledged: z.boolean().optional(),
  /** Yalnız "wipe": "Seçili kişiye ait tüm silinebilir kayıtları seç" — onaylanan kapsam önizlemenin tamamı. */
  scopeAll: z.boolean().optional(),
  expectedFingerprint: z.string().max(100).optional(),
  confirmationName: z.string().max(200),
  criticalPassword: z.string().max(200),
  reason: z.string().trim().min(5, "Silme gerekçesi en az 5 karakter olmalı.").max(500),
});

export type PersonPurgeResult = {
  kind: "student" | "teacher";
  id: string;
  outcome: "delete" | "anonymize";
  alreadyPurged: boolean;
  removedCount: number;
  accountsClosed: number;
  /** Veritabanı işlemi tamamlandı ama sonrasındaki adım (oturum önbelleği) tamamlanamadıysa — kullanıcıya gösterilir. */
  warnings: string[];
};

const PURGE_STALE_MESSAGE =
  "Önizlemeden sonra bu kişiye bağlı kayıtlar değişti; hiçbir şey silinmedi. Önizleme yenilendi — değişiklikleri inceleyip yeniden onaylayın.";

/**
 * Kalıcı silme — öğrenci veya öğretmen (Silinenler/Kaldırılanlar'daki kişi). Kapılar: rol, ad soyad teyidi, kritik
 * işlem şifresi, engel yok, önizleme parmak izi aynı. Yürütme store'da (db: tek transaction + advisory lock).
 * Tekrar istek güvenli: anonimleştirilmiş kişi için `alreadyPurged`, tamamen silinmiş kişi için NOT_FOUND döner.
 * Audit'te ad ve serbest metin gerekçe TUTULMAZ — yalnız numara, sonuç ve sayılar.
 */
export async function purgePersonTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<PersonPurgeResult>> {
  const auth = requireRole(ctx, CRITICAL_ROLES_FOR_TOOLS);
  if (!auth.ok) return fail("FORBIDDEN", "Kalıcı silme yalnız kurum sahibi ve kurum yöneticileri tarafından yapılabilir.");
  const v = parseOrFail(purgePersonSchema, input);
  if (!v.ok) return v;
  if (v.data.mode === "wipe" && !canWipePerson(ctx)) return fail("FORBIDDEN", WIPE_FORBIDDEN);
  return purgePersonCore(ctx, v.data, { confirmName: true, checkPassword: true });
}

/**
 * Kalıcı silmenin domain çekirdeği — tekli (`purgePersonTool`) ve toplu (`bulkPurgeStudentsTool`) AYNI yoldan geçer:
 * snapshot → plan → engel → parmak izi → `executePurge` → audit. Toplu akış ad teyidi yerine toplu onay ifadesi alır
 * ve kritik şifreyi BİR kez doğrular (şifre denemesi hız sınırı kişi başına tüketilmesin).
 */
async function purgePersonCore(
  ctx: ServiceContext,
  data: z.infer<typeof purgePersonSchema>,
  gates: { confirmName: boolean; checkPassword: boolean }
): Promise<ServiceResult<PersonPurgeResult>> {
  const { kind, id, mode } = data;
  const v = { data };
  const entityType = kind === "student" ? "Student" : "Teacher";
  const action = mode === "wipe" ? `${kind}.purge_wipe` : `${kind}.purge`;
  const snap = await loadPurgeSnapshot(kind, id);
  if (!snap) return fail("NOT_FOUND", "Kayıt bulunamadı veya zaten kalıcı silinmiş; listeyi yenileyin.");
  const result = (outcome: "delete" | "anonymize", extra: Partial<PersonPurgeResult> = {}): PersonPurgeResult => ({
    kind, id, outcome, alreadyPurged: false, removedCount: 0, accountsClosed: 0, warnings: [], ...extra,
  });
  if (snap.person.purgedAt) return ok(result("anonymize", { alreadyPurged: true }));
  const { planPersonPurge, PurgeConflictError } = await import("../person-purge");
  const opts = wipeOptionsOf(v.data);
  const plan = planPersonPurge(snap, mode, opts);

  const deny = async (reasonCode: string, message: string, code: "FORBIDDEN" | "CONFLICT" | "VALIDATION_ERROR" = "FORBIDDEN") => {
    await recordAuditLog({
      tenantId: ctx.tenantId, actorUserId: ctx.userId, actorRole: ctx.role, action, entityType, entityId: id,
      outcome: "denied", meta: { reasonCode, mode, displayId: plan.displayId },
    });
    return fail(code, message);
  };
  if (gates.confirmName && !sameName(v.data.confirmationName, plan.personName)) {
    return deny("confirmation_mismatch", `Onay için kişinin adını aynen yazın: "${plan.personName}".`);
  }
  if (mode === "wipe" && v.data.financialAcknowledged !== true) {
    return deny("financial_not_acknowledged", "Tahsilat, borç, sözleşme ve hakediş kayıtlarının da silineceğini onaylayan kutuyu işaretleyin.", "VALIDATION_ERROR");
  }
  if (mode === "wipe" && v.data.scopeAll !== true) {
    return deny("scope_not_selected", "\"Seçili kişiye ait tüm silinebilir kayıtları seç\" kutusunu işaretleyin; tam silme önizlemedeki kapsamın tamamıyla yapılır.", "VALIDATION_ERROR");
  }
  if (gates.checkPassword) {
    const gate = await checkCriticalPassword(ctx, v.data.criticalPassword);
    if (!gate.ok) return deny(gate.reasonCode, gate.message);
  }
  if (!plan.eligible) {
    return deny("blocked", plan.blockers.map((b) => `${b.reason} ${b.fix}`).join(" "), "VALIDATION_ERROR");
  }
  if (!v.data.expectedFingerprint) {
    return deny("no_preview", "Kalıcı silmeden önce etki önizlemesi yüklenmeli. Pencereyi kapatıp yeniden açın.", "VALIDATION_ERROR");
  }
  if (v.data.expectedFingerprint !== plan.fingerprint) return deny("preview_stale", PURGE_STALE_MESSAGE, "CONFLICT");

  let exec: Awaited<ReturnType<typeof executePurge>>;
  try {
    exec = await executePurge(kind, id, plan.fingerprint, mode, opts);
  } catch (e) {
    if (e instanceof PurgeConflictError) return deny("preview_stale_locked", PURGE_STALE_MESSAGE, "CONFLICT");
    if ((e as { code?: string })?.code === "P2002") {
      return deny(
        "reassign_unique",
        `${plan.reassign?.targetTeacherName ?? "Seçilen öğretmen"} öğretmeninde aynı öğrenci ve dönem için zaten bir kayıt (ör. dönem raporu) var; hiçbir şey silinmedi. Başka bir öğretmen seçin veya "Dersleri sil"i kullanın.`,
        "CONFLICT"
      );
    }
    logger.error("purgePersonTool failed", e);
    return fail("INTERNAL_ERROR", "Kalıcı silme tamamlanamadı; işlem geri alındı, hiçbir kayıt silinmedi. Birkaç dakika sonra tekrar deneyin.");
  }
  if (exec.status === "not_found") return fail("NOT_FOUND", "Kayıt bulunamadı veya zaten kalıcı silinmiş; listeyi yenileyin.");
  if (exec.status === "already_purged") return ok(result("anonymize", { alreadyPurged: true }));

  // DB commit'i tamamlandı; oturum önbelleği süreç içidir — kapatılan hesabın açık oturumu bir sonraki istekte düşer.
  // Tam silinmeyen kısım başarı mesajında gizlenmez: tutarı korunan hakedişler açıkça yazılır.
  const warnings: string[] = exec.plan.payoutChanges
    .filter((c) => c.action !== "recalc")
    .map((c) => `${c.teacherName} — ${c.period} hakedişi ödenmiş/eski kayıt olduğu için tutarı (${formatMoney(c.before)}) korundu; satırlardaki öğrenci adı silindi.`);
  try {
    const { invalidateSessionValidity } = await import("../auth/session-validity");
    for (const userId of exec.closedUserIds) invalidateSessionValidity(userId);
  } catch (e) {
    logger.error("purgePersonTool: oturum önbelleği temizlenemedi", e);
    warnings.push("Kayıtlar silindi; kapatılan hesabın açık oturumu en geç birkaç dakika içinde kendiliğinden düşer.");
  }
  const count = (bs: { key: string; ids: string[] }[]) => Object.fromEntries(bs.map((b) => [b.key, b.ids.length]));
  const removedCount = exec.plan.remove.reduce((n, b) => n + b.ids.length, 0);
  await recordAuditLog({
    tenantId: ctx.tenantId, actorUserId: ctx.userId, actorRole: ctx.role, action, entityType, entityId: id, outcome: "success",
    // Ad ve gerekçe metni YOK: numara, mod, sayılar, tutarlar, aktör.
    meta: {
      outcome: exec.plan.outcome,
      mode,
      displayId: exec.plan.displayId,
      ...(exec.plan.financial ? { financial: exec.plan.financial } : {}),
      removed: count(exec.plan.remove),
      detached: count(exec.plan.detach),
      kept: count(exec.plan.keep),
      accountsClosed: exec.closedUserIds.length,
      accountsUnlinked: exec.plan.accounts.length - exec.closedUserIds.length,
      ...(exec.plan.reassign
        ? { reassigned: { lessons: exec.plan.reassign.lessons.length, students: exec.plan.reassign.students.length, targetTeacherId: exec.plan.reassign.targetTeacherId } }
        : {}),
      ...(exec.plan.payoutChanges.length
        ? { payoutChanges: exec.plan.payoutChanges.map((c) => ({ payoutId: c.payoutId, action: c.action, lines: c.lessonIds.length, before: c.before, after: c.after })) }
        : {}),
    },
  });
  return ok(result(exec.plan.outcome, { removedCount, accountsClosed: exec.closedUserIds.length, warnings }));
}

/** Toplu kalıcı silme tek seferde en fazla bu kadar öğrenci (her biri ayrı transaction; istek süresi sınırı). */
export const BULK_PURGE_MAX = 25;
const BULK_PURGE_TOO_MANY = `Toplu kalıcı silme tek seferde en fazla ${BULK_PURGE_MAX} öğrenciyle yapılabilir. Seçimi azaltıp işlemi parça parça yapın.`;
const bulkPurgeIdsSchema = z.array(z.string().min(1).max(100)).min(1, "En az bir öğrenci seçin.").max(BULK_PURGE_MAX, BULK_PURGE_TOO_MANY);

export type BulkPurgePreview = {
  criticalPasswordConfigured: boolean;
  students: { id: string; name: string; displayId?: string; eligible: boolean; outcome: "delete" | "anonymize"; blockers: { reason: string; fix: string }[] }[];
  /** Uygun öğrencilerin plan gruplarının toplamı: kayıt tipi + işlem + adet. */
  totals: { label: string; action: import("../person-purge").PurgeGroupAction; count: number }[];
  missing: string[];
  fingerprints: Record<string, string>;
};

/**
 * 2026-10-17 — Silinen öğrenciler için toplu kalıcı silme önizlemesi. Her öğrenci için tekli önizlemeyle AYNI plan
 * (`planPersonPurge`, standart mod); yalnız Silinenler'deki öğrenci uygun çıkar (aktif öğrenci engellenir).
 */
export async function getBulkStudentPurgePreviewTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<BulkPurgePreview>> {
  const auth = requireRole(ctx, CRITICAL_ROLES_FOR_TOOLS);
  if (!auth.ok) return fail("FORBIDDEN", "Kalıcı silme yalnız kurum sahibi ve kurum yöneticileri tarafından yapılabilir.");
  const v = parseOrFail(z.object({ studentIds: bulkPurgeIdsSchema }), input);
  if (!v.ok) return v;
  const { planPersonPurge } = await import("../person-purge");
  const { getCriticalActionPasswordStatus } = await import("../critical-action-password");
  const out: BulkPurgePreview = { criticalPasswordConfigured: (await getCriticalActionPasswordStatus(ctx.tenantId)).configured, students: [], totals: [], missing: [], fingerprints: {} };
  const totals = new Map<string, BulkPurgePreview["totals"][number]>();
  for (const id of Array.from(new Set(v.data.studentIds))) {
    const snap = await loadPurgeSnapshot("student", id);
    if (!snap) { out.missing.push(id); continue; }
    const plan = planPersonPurge(snap, "standard", {});
    out.students.push({ id, name: plan.personName, displayId: plan.displayId, eligible: plan.eligible, outcome: plan.outcome, blockers: plan.blockers });
    out.fingerprints[id] = plan.fingerprint;
    if (!plan.eligible) continue;
    for (const item of plan.groups.flatMap((g) => g.items)) {
      const key = `${item.action}|${item.label}`;
      const t = totals.get(key) ?? { label: item.label, action: item.action, count: 0 };
      t.count += item.count;
      totals.set(key, t);
    }
  }
  out.totals = Array.from(totals.values()).filter((t) => t.count > 0);
  return ok(out);
}

export type BulkPurgeItemResult = {
  id: string;
  name: string;
  status: "success" | "blocked" | "error";
  message: string;
  outcome?: "delete" | "anonymize";
  warnings?: string[];
};

/**
 * 2026-10-17 — Toplu kalıcı silme (yalnız Silinenler'deki öğrenciler, standart mod). Onay: gerekçe + kritik şifre
 * (bir kez) + seçili öğrenci sayısının yazılması. Her öğrenci tekli silmeyle AYNI çekirdekten (`purgePersonCore`)
 * kendi transaction'ında geçer; biri engellenir/hata verirse diğerleri etkilenmez, sonuç kayıt bazında döner.
 */
export async function bulkPurgeStudentsTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ results: BulkPurgeItemResult[] }>> {
  const auth = requireRole(ctx, CRITICAL_ROLES_FOR_TOOLS);
  if (!auth.ok) return fail("FORBIDDEN", "Kalıcı silme yalnız kurum sahibi ve kurum yöneticileri tarafından yapılabilir.");
  const v = parseOrFail(
    z.object({
      studentIds: bulkPurgeIdsSchema,
      fingerprints: z.record(z.string(), z.string().max(100)),
      confirmationCount: z.string().max(10),
      criticalPassword: z.string().max(200),
      reason: z.string().trim().min(5, "Silme gerekçesi en az 5 karakter olmalı.").max(500),
    }),
    input
  );
  if (!v.ok) return v;
  const ids = Array.from(new Set(v.data.studentIds));
  if (v.data.confirmationCount.trim() !== String(ids.length)) {
    return fail("VALIDATION_ERROR", `Onay için seçili öğrenci sayısını aynen yazın: ${ids.length}.`);
  }
  const gate = await checkCriticalPassword(ctx, v.data.criticalPassword);
  if (!gate.ok) {
    await recordAuditLog({
      tenantId: ctx.tenantId, actorUserId: ctx.userId, actorRole: ctx.role, action: "student.purge_bulk", entityType: "Student", entityId: "bulk",
      outcome: "denied", meta: { reasonCode: gate.reasonCode, count: ids.length },
    });
    return fail("FORBIDDEN", gate.message);
  }
  const results: BulkPurgeItemResult[] = [];
  for (const id of ids) {
    const name = (await readStudentById(id).catch(() => undefined))?.name ?? id;
    try {
      const r = await purgePersonCore(
        ctx,
        {
          kind: "student", id, mode: "standard", reason: v.data.reason, criticalPassword: "", confirmationName: "",
          expectedFingerprint: v.data.fingerprints[id],
        },
        { confirmName: false, checkPassword: false }
      );
      if (r.ok) {
        results.push({
          id, name, status: "success", outcome: r.data.outcome, warnings: r.data.warnings,
          message: r.data.alreadyPurged ? "Zaten kalıcı silinmişti." : r.data.outcome === "delete" ? "Kalıcı silindi." : "Geçmişi olduğu için anonimleştirildi.",
        });
      } else {
        results.push({ id, name, status: r.error.code === "INTERNAL_ERROR" ? "error" : "blocked", message: r.error.message });
      }
    } catch (e) {
      logger.error("bulkPurgeStudentsTool item failed", e);
      results.push({ id, name, status: "error", message: "Beklenmeyen hata; bu öğrenci için hiçbir kayıt silinmedi. Tekrar deneyin." });
    }
  }
  return ok({ results });
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
  const bulkEnrollments = await import("../student-enrollments");
  for (const student of targets as Student[]) {
    const skip = (message: string) => skipped.push({ studentId: student.id, name: student.name, message });
    // 2026-10-10 — öğretmen / enstrüman / paket BRANŞA özgüdür. Birden fazla aktif branşı olan öğrencide toplu işlem
    // hangi branşı değiştireceğini bilemez → atlanır ve nedeni söylenir (tahmin yok).
    const activeBranches = bulkEnrollments.effectiveEnrollments(student, data.teachers).filter((e) => e.active);
    const multiBranchMessage = (what: string) =>
      `Birden fazla aktif branşı var (${activeBranches.map((e) => bulkEnrollments.enrollmentDisplayName(e, activeBranches, data.teachers)).join(", ")}); toplu işlem hangi branşın ${what} değişeceğini bilemez. Öğrenci → Özet → Branş kayıtları kartından ilgili branşı düzenleyin.`;
    const soleTerms =
      activeBranches.length === 1 ? bulkEnrollments.enrollmentTerms(student, activeBranches[0]!, data.teachers) : undefined;
    try {
      let patch: StudentProfilePatch | null = null;
      switch (req.action) {
        case "branch":
          if (student.branchId === req.branchId) { skip("Zaten bu şubede."); continue; }
          patch = { branchId: req.branchId };
          break;
        case "teacher": {
          if (activeBranches.length > 1) { skip(multiBranchMessage("öğretmeni")); continue; }
          const currentTeacherId = soleTerms?.teacherId ?? student.teacherId;
          const studentInstruments = activeBranches[0] ? [activeBranches[0].instrument] : student.instruments;
          if (currentTeacherId === req.teacherId) { skip("Zaten bu öğretmende."); continue; }
          if (!studentInstruments.some((i) => teacher!.instruments.includes(i))) {
            skip(`${teacher!.name} bu öğrencinin enstrümanını (${studentInstruments.join(", ")}) öğretmiyor.`);
            continue;
          }
          patch = { teacherId: req.teacherId };
          break;
        }
        case "instrument":
          if ((student.enrollments?.length ?? 0) > 0) {
            skip("Branş kayıtları var; enstrüman bir branş kaydı üzerinden değişmez (geçmiş ders/sözleşme o kayda bağlıdır). Yeni enstrüman için Öğrenci → Özet → \"Branş kaydı ekle\" kullanın.");
            continue;
          }
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
          if (activeBranches.length > 1) { skip(multiBranchMessage("paketi")); continue; }
          const currentPackageId = soleTerms?.packageId ?? student.packageId;
          const currentDuration = soleTerms?.lessonDurationMinutes ?? student.lessonDurationMinutes;
          if (currentPackageId === req.packageId) { skip("Paketi zaten bu."); continue; }
          if (!currentDuration) {
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
  let instruments: Instrument[] | undefined;
  if (v.data.instruments !== undefined) {
    const checked = await canonicalRoomInstruments(ctx.tenantId, v.data.instruments, room.instruments);
    if (!checked.ok) return checked;
    instruments = checked.data;
  }
  if (v.data.branchId && !data.settings.branches.some((b) => b.id === v.data.branchId)) {
    return fail("VALIDATION_ERROR", "Şube bulunamadı");
  }
  const { validateRoomRevision } = await import("../room-revision");
  const revisionError = validateRoomRevision(data, v.data.roomId, {
    name: v.data.name,
    branchId: v.data.branchId as BranchId | undefined,
    capacity: v.data.capacity,
    instruments,
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
      ...(instruments !== undefined ? { instruments } : {}),
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
  // DB egress (2026-10-18): referans dilimi TC kolonlarını okumaz — yalnız son iki hanesi eşleşen satırlar.
  const studentIds = (await readNationalIdCandidates(wanted.slice(-2)))
    .filter((s) => {
      try {
        return decryptNationalId(s.nationalIdCipher) === wanted;
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

/**
 * DB egress (2026-10-17) — deneme dersi doğrulamasının (`assertSchedulableDate`, `validateTrialSlot`) okuduğu
 * tek şey o anın çevresindeki dersler + ayarlar/öğretmenler/istisnalar: ±2 gün ders penceresi.
 * Geçersiz tarihte pencere boş (doğrulama tarihi zaten reddeder).
 */
async function readLessonsAroundForTrial(startAtIso: string) {
  const at = new Date(startAtIso);
  if (Number.isNaN(at.getTime())) return { ...(await readReferenceData()), lessons: [] };
  return readLessonWindow(addDays(at, -2).toISOString(), addDays(at, 2).toISOString());
}

export async function createTrialLessonTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ trialId: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(createTrialLessonSchema, input);
  if (!v.ok) return v;
  if (v.data.allowAvailabilityOverride && !canOverrideTeacherAvailability(ctx)) {
    return fail("FORBIDDEN", AVAILABILITY_OVERRIDE_FORBIDDEN);
  }
  // Çalışma günü tek kaynağı — deneme dersi de yöneticinin kapalı/zorla-açık
  // istisnalarına uyar (eskiden boş liste geçiliyordu, istisnalar hiç okunmuyordu).
  // DB egress (2026-10-17) — deneme dersi doğrulaması (çalışma günü + öğretmen çakışması) yalnız o günün
  // dersleri + referans veriyle; tüm ders geçmişi okunmaz.
  const trialData = await readLessonsAroundForTrial(v.data.startAt);
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
    if (v.data.applicationId && ctx.role !== "TEACHER") {
      const { markTrialApplicationPlanned } = await import("../trial-applications");
      await markTrialApplicationPlanned(ctx, v.data.applicationId, trial.id);
    }
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
  if (v.data.allowAvailabilityOverride && !canOverrideTeacherAvailability(ctx)) {
    return fail("FORBIDDEN", AVAILABILITY_OVERRIDE_FORBIDDEN);
  }
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
  if (scheduleChanged) {
    const data = await readLessonsAroundForTrial(next.startAt);
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
    // 2026-10-10 — çok branşlı öğrencide ödeme planı satırı HER aktif branşın kendi koşullarından üretilir (ilk branşınki değil).
    paymentPlan: student
      ? await (async () => {
          const se = await import("../student-enrollments");
          const active = se.effectiveEnrollments(student, data.teachers).filter((e) => e.active);
          if (active.length > 1) {
            return active
              .map((e) => {
                const t = se.enrollmentTerms(student, e, data.teachers);
                const due = formatPaymentDueRanges(effectivePaymentDueRanges(se.studentWithEnrollmentTerms(student, t)));
                return t.paymentMethod ? `${e.instrument}: ${t.paymentMethod} · ${t.monthlyFee} ₺ · ${due}` : "";
              })
              .filter(Boolean)
              .join(" | ");
          }
          return student.paymentMethod
            ? `${student.paymentMethod} · ${student.paymentAmount ?? student.monthlyFee} ₺ · ${formatPaymentDueRanges(effectivePaymentDueRanges(student))}`
            : "";
        })()
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
  // 2026-10-04 — boş ile gerçek 0 ayrı: 0 TL geçerli bir ücretsiz son dönemdir, yalnız boş reddedilir.
  if (input.manualAmount === undefined || !Number.isInteger(input.manualAmount) || input.manualAmount < 0) {
    return { ok: false, message: "Son dönem tutarını manuel seçtiniz ama tutar boş. Tutarı yazın (ücretsiz dönem için 0)." };
  }
  return { ok: true, pricing: { mode: "manual", manualAmount: input.manualAmount } };
}

const contractInstallmentPlanSchema = z.object({
  /** 2026-10-04 — revizyon önizlemesi: önceki sürümde tahsil edilen tutarın mahsubu gösterilir. */
  previousContractId: z.string().min(1).optional(),
  contractType: z.enum(["initial", "renewal", "amendment"]).optional(),
  durationMonths: z.number().int().min(1).max(12),
  monthlyAmount: z.number().int().min(0, "Aylık ücret negatif olamaz."),
  installmentCount: z.number().int().min(1).max(12),
  firstDueDate: z.string().min(1),
  depositAmount: z.number().int().min(0).optional(),
  paymentMethod: z.string().max(50).optional(),
  /** Bkz. createStudentContractTool şema yorumu — AYNI opt-in, önizlemenin GERÇEK planla tutarlı kalması için. */
  usePerLessonBilling: z.boolean().optional(),
  studentId: z.string().min(1).optional(),
  /** 2026-10-09 — sözleşmenin branş kaydı (çok branşlı öğrencide ders sayımı ve ilk tahsilat bu branştan). */
  enrollmentId: z.string().max(100).optional(),
  enrollmentStartDate: z.string().min(1).optional(),
  enrollmentEndDate: z.string().min(1).optional(),
  /** P0 (2026-09-04) — "Sözleşmenin son döneminde eksik kalan dersler nasıl ücretlendirilsin?" tercihi; bkz. `resolveLastPeriodPricing`. */
  lastPeriodPricingMode: lastPeriodPricingModeSchema.optional(),
  // 2026-10-04 — 0 geçerli (ücretsiz son dönem); boş = alan gönderilmez.
  lastPeriodManualAmount: z.number().int().min(0).optional(),
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

/**
 * 2026-10-09 — sözleşmenin BRANŞ bağlamı (önizleme ve oluşturma AYNI kuralı kullanır): hangi branş kaydı, o branşın
 * koşullarıyla öğrenci görünümü (süre/haftalık ders/ücret), yalnız o branşın dersleri ve kayıt ilk tahsilatının
 * aranacağı kapsam. Çok branşlı öğrencide branş AÇIKÇA seçilmelidir; yenileme/revizyon önceki sözleşmenin branşını alır.
 * `persist` ise kalıcı kaydı olmayan eski öğrencinin branşları kalıcı yapılır (sözleşme açık kimlik taşısın diye).
 */
async function resolveContractBranchContext(
  ctx: ServiceContext,
  data: WithStudentRefs<Pick<AppData, "students" | "teachers" | "lessons">>,
  student: Student,
  opts: { enrollmentId?: string; previousContractId?: string; contractType?: "initial" | "renewal" | "amendment"; persist: boolean }
): Promise<
  ServiceResult<{
    enrollmentId?: string;
    label?: string;
    branchStudent: Student;
    lessons: Lesson[];
    scope: import("../student-enrollments").EnrollmentScope;
    multi: boolean;
  }>
> {
  const se = await import("../student-enrollments");
  const enrollments = se.effectiveEnrollments(student, data.teachers);
  const multi = enrollments.length > 1;
  let view: import("../student-enrollments").EnrollmentView | undefined;
  if (opts.contractType && opts.contractType !== "initial" && opts.previousContractId) {
    const prev = await getContract(ctx.tenantId, opts.previousContractId);
    if (prev?.enrollmentId) view = enrollments.find((x) => x.id === prev.enrollmentId);
    else if (multi) {
      return fail(
        "VALIDATION_ERROR",
        `${prev?.contractNumber ?? "Önceki"} sözleşmesinin branşı belirtilmemiş. Yenileme veya revizyondan önce Sözleşme Merkezi'nde "Branşa bağla" ile ilgili branş kaydına bağlayın.`
      );
    } else view = enrollments[0];
  } else if (opts.enrollmentId) {
    view = enrollments.find((x) => x.id === opts.enrollmentId);
    if (!view) return fail("VALIDATION_ERROR", "Seçilen branş kaydı bu öğrenciye ait değil. Sayfayı yenileyip branşı yeniden seçin.");
  } else if (multi) {
    return fail("VALIDATION_ERROR", "Bu öğrencinin birden fazla branş kaydı var; sözleşmenin hangi branşa (enstrümana) ait olduğunu seçin.");
  } else view = enrollments[0];
  if (!view) return ok({ branchStudent: student, lessons: data.lessons.filter((l) => l.studentId === student.id), scope: {}, multi });

  let studentNext = student;
  let viewNext = view;
  if (opts.persist && !se.isPersistedEnrollmentId(view.id)) {
    const { ensurePersistedEnrollments, materializedEnrollmentId } = await import("../enrollment-links");
    const list = await ensurePersistedEnrollments(ctx.tenantId, student, data.teachers);
    studentNext = { ...student, enrollments: list };
    viewNext = list.find((x) => x.id === materializedEnrollmentId(student.id, view!.instrument)) ?? view;
  }
  const terms = se.enrollmentTerms(studentNext, viewNext, data.teachers);
  const persistedId = se.isPersistedEnrollmentId(viewNext.id) ? viewNext.id : undefined;
  return ok({
    enrollmentId: persistedId,
    label: viewNext.instrument,
    branchStudent: se.studentWithEnrollmentTerms(studentNext, terms),
    lessons: data.lessons.filter((l) => l.studentId === student.id && se.lessonEnrollmentId(studentNext, l, data.teachers) === viewNext.id),
    // Tek branşlı öğrencide bağsız eski satır o branşındır; çok branşlıda bağsız satır HİÇBİR branşa sayılmaz.
    scope: persistedId ? { enrollmentId: persistedId, includeUnlinked: !multi } : multi ? { enrollmentId: "__unassigned__" } : {},
    multi,
  });
}

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
    /** Yalnız revizyon: önceki sürümde tahsil edilen / yeni plana mahsup edilen / artan tutar ve kalan borç. */
    amendmentCredit?: { collected: number; applied: number; leftover: number; remainingDue: number };
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
    // DB egress (2026-10-18): öğrenci dilimi (öğrenci yoksa yalnız referans).
    const scope = v.data.studentId ? await readStudentScope(v.data.studentId) : undefined;
    const data = scope ?? { ...(await readReferenceData()), lessons: [], makeupRequests: [] };
    const paymentPolicy = data.settings.collectionsSettings;
    let installments: import("../types").ContractInstallmentSnapshot[];
    let totalContractAmount: number;
    // createStudentContractTool ile AYNI kural — birleşik ilk tahsilatta bitiş BİR AY kaymaz.
    let enrollmentEndDate = v.data.enrollmentEndDate;
    const rawStudent = scope?.students.find((s) => s.id === v.data.studentId);
    let student = rawStudent;
    let branchLessons = rawStudent ? data.lessons.filter((l) => l.studentId === rawStudent.id) : [];
    let firstPaymentScope: import("../student-enrollments").EnrollmentScope | undefined;
    if (rawStudent) {
      const branch = await resolveContractBranchContext(ctx, data, rawStudent, {
        enrollmentId: v.data.enrollmentId,
        previousContractId: v.data.previousContractId,
        contractType: v.data.contractType,
        persist: false,
      });
      if (!branch.ok) return branch;
      student = branch.data.branchStudent;
      branchLessons = branch.data.lessons;
      firstPaymentScope = branch.data.scope;
    }
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
        // 2026-10-09 — yalnız bu branşın dersleri (diğer branşın dersi bu sözleşmenin dönem tutarına girmez).
        lessons: branchLessons.map((l) => ({
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
        ? await getRegistrationFirstPayment(student.id, firstPaymentScope)
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
    let amendmentCredit: { collected: number; applied: number; leftover: number; remainingDue: number } | undefined;
    if (v.data.contractType === "amendment" && v.data.previousContractId) {
      const { computePriorContractCollected, allocatePriorCollections, getContract } = await import("../contracts");
      const previous = await getContract(ctx.tenantId, v.data.previousContractId);
      if (previous && (!v.data.studentId || previous.studentId === v.data.studentId)) {
        const collected = await computePriorContractCollected(ctx.tenantId, previous.id);
        const allocated = allocatePriorCollections(installments, collected, previous.contractNumber);
        amendmentCredit = {
          collected,
          applied: allocated.applied,
          leftover: allocated.leftover,
          remainingDue: allocated.rows.reduce((s, r) => s + r.amount, 0),
        };
      }
    }
    return ok({
      totalContractAmount,
      installments,
      isFormal: isFormalContractDuration(v.data.durationMonths),
      paymentDueRuleText: rule.ruleText,
      firstDueDateInWindow,
      enrollmentEndDate,
      amendmentCredit,
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
  /**
   * 2026-10-04 — sözleşme DIŞI açık borçlardan (aylık plan / elle borç) kullanıcının AÇIKÇA seçtikleri:
   * sözleşme planı bu dönemi zaten kapsadığı için yeniden borçlandırılmaz — satır silinmez, "sözleşmeye
   * taşındı" notuyla iptal edilir (audit'li). Yalnız hiç tahsilat görmemiş canlı satırlar taşınabilir.
   */
  carryOverPaymentIds: z.array(z.string().min(1)).max(60).optional(),
  /** 2026-10-04 — sözleşmenin ait olduğu eğitim (çoklu eğitimli öğrenci); boş/birincil = birincil eğitim. */
  enrollmentId: z.string().max(100).optional(),
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
  // 2026-10-04 — 0 geçerli (ücretsiz son dönem); boş = alan gönderilmez.
  lastPeriodManualAmount: z.number().int().min(0).optional(),
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
): Promise<
  ServiceResult<{
    contract: StudentContract;
    installments: ContractInstallmentView[];
    amendmentCredit?: { collected: number; applied: number; leftover: number };
    carriedOverPaymentIds?: string[];
    /** Doğrulamadan sonra tahsilat gördüğü için taşınmayan borçların açıklaması (ayrı borç olarak kaldı). */
    carryOverSkipped?: string[];
  }>
> {
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

  // DB egress (2026-10-18): öğrenci dilimi + logo tek satır (borç taşıma/branş/ders/telafi hep öğrencinin).
  const [scope, branding] = await Promise.all([readStudentScope(v.data.studentId), readSchoolBranding()]);
  const data = { ...scope, settings: { ...scope.settings, logoUrl: branding.logoUrl } };
  const student = data.students.find((s) => s.id === v.data.studentId);
  if (!student) return fail("VALIDATION_ERROR", "Seçilen öğrenci bulunamadı veya bu kuruma ait değil.");
  const branch = data.settings.branches.find((b) => b.id === student.branchId);

  const isMinor = student.birthDate ? computeAge(student.birthDate) < 18 : false;

  // 2026-10-09 — branş bağı HER ZAMAN açık (ilk branş dahil); çok branşlı öğrencide branş seçimi zorunlu,
  // yenileme/revizyon önceki sözleşmenin branşını alır. Ders sayımı, süre/haftalık ders ve ilk tahsilat o branştan.
  const branchCtx = await resolveContractBranchContext(ctx, data, student, {
    enrollmentId: v.data.enrollmentId,
    previousContractId: v.data.previousContractId,
    contractType: v.data.contractType,
    persist: true,
  });
  if (!branchCtx.ok) return branchCtx;
  const contractEnrollmentId = branchCtx.data.enrollmentId;
  const branchStudent = branchCtx.data.branchStudent;
  // Sözleşmedeki şube = branş kaydının şubesi (varsayılan öğrencinin şubesi).
  const contractBranch = data.settings.branches.find((b) => b.id === branchStudent.branchId) ?? branch;

  // 2026-10-04 — taşınacak sözleşme dışı borçlar ÖNCEDEN doğrulanır (sözleşme yazılmadan): yalnız bu öğrencinin,
  // sözleşmeye bağlı olmayan, hiç tahsilat görmemiş canlı satırları. Uymayan seçim sözleşmeyi de durdurur.
  const carryOver = Array.from(new Set(v.data.carryOverPaymentIds ?? [])).map((id) => data.payments.find((p) => p.id === id));
  const { paymentEnrollmentId } = await import("../student-enrollments");
  const studentForRefs = { ...student, enrollments: branchStudent.enrollments };
  for (const [i, p] of carryOver.entries()) {
    if (!p || p.studentId !== student.id) {
      return fail("VALIDATION_ERROR", "Taşınmak üzere seçilen borçlardan biri bu öğrenciye ait değil veya silinmiş. Sayfayı yenileyip seçimi tekrar yapın.");
    }
    // Satırın kendi durumu (kulüp ücreti, tahsilatlı, iptal, sözleşmeli) önce: branşı olmayan kulüp ücreti için
    // "başka branşa ait" yerine gerçek neden söylenir.
    if (p.contractId || p.source === "club" || p.status === "paid" || p.status === "voided" || p.paidAmount > 0) {
      return fail(
        "VALIDATION_ERROR",
        `Seçilen ${i + 1}. borç ("${p.description}") taşınamaz: tahsilat görmüş, iptal edilmiş veya zaten bir sözleşmeye bağlı. Bu satırı seçimden çıkarın; gerekiyorsa Ödemeler ekranında ayrıca düzeltin.`
      );
    }
    // 2026-10-09 — başka branşın borcu bu sözleşmeye taşınamaz (Keman borcu Piyano planına geçmez).
    if (contractEnrollmentId && paymentEnrollmentId(studentForRefs, p, { lessons: data.lessons }, data.teachers) !== contractEnrollmentId) {
      return fail(
        "VALIDATION_ERROR",
        `Seçilen ${i + 1}. borç ("${p.description}") bu sözleşmenin branşına (${branchCtx.data.label ?? "seçilen branş"}) ait değil. Yalnız aynı branşın sözleşmesiz borcu taşınabilir; satırı seçimden çıkarın.`
      );
    }
  }

  // 2026-2027 kaynağı Madde 1 — kurumun TÜM şubeleri arasından öğrencinin
  // şubesini işaretleyen hazır metin (renderer dinamik listeyi DESTEKLEMEDİĞİNDEN
  // burada tools katmanında, gerçek Branch verisiyle, düz metne indirgenir).
  const branchOptionsText = data.settings.branches
    .map((b) => `${b.id === (contractBranch?.id ?? student.branchId) ? "☑" : "☐"} ${b.name}: ${b.address}`)
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
  if (v.data.usePerLessonBilling && studentUsesPerLessonBilling(branchStudent) && branchStudent.weeklyLessonCount > 0) {
    const { computePeriodBillingPreview } = await import("../period-lesson-billing");
    const weeklyLessonCount = branchStudent.weeklyLessonCount;
    const computeLines = (enrollmentEndDay: string) => computePeriodBillingPreview({
      enrollmentStartDay: v.data.enrollmentStartDate,
      enrollmentEndDay,
      // P0-1 (2026-09-09) — önizleme (previewContractInstallmentPlanTool) ile
      // BİREBİR aynı taban: onaylanan aylık ücret. İkisi farklı taban
      // kullanırsa "önizlemede gördüğüm plan kayıtta değişti" hatası doğar.
      monthlyFee: v.data.monthlyAmount,
      weeklyLessonCount,
      studentId: student.id,
      lessons: branchCtx.data.lessons.map((l) => ({
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
  const registrationFirstPaymentRow = await getRegistrationFirstPayment(student.id, branchCtx.data.scope);
  const mergeFirstCollection =
    v.data.mergeFirstCollection ?? registrationFirstPaymentRow?.firstCollectionIncludesNextMonth ?? false;

  try {
    const { contract, installments, amendmentCredit } = await createContract({
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
      // 2026-10-04 — imzacı öğrencinin kendisiyse ve alan boşsa kayıttaki T.C. kullanılır; veli imzacıya
      // öğrencinin T.C.'si ASLA yazılmaz (velinin T.C.'si sistemde tutulmuyor — boşsa boş kalır).
      signatoryNationalId:
        v.data.signatoryNationalId?.trim() ||
        (v.data.signatoryRelationship === "öğrenci" ? studentNationalId : undefined),
      signatoryAddress: v.data.signatoryAddress,
      signatoryRelationship: v.data.signatoryRelationship,
      isMinor,
      photoVideoConsent: v.data.photoVideoConsent,
      photoVideoConsentFormPresented: v.data.photoVideoConsent !== undefined,
      kvkkNoticeDelivered: v.data.kvkkNoticeDelivered,
      studentName: student.name,
      parentName: student.parentName,
      branchName: contractBranch?.name,
      branchOptionsText,
      lessonDurationMinutes: branchStudent.lessonDurationMinutes,
      weeklyLessonCount: branchStudent.weeklyLessonCount,
      vatInclusive: data.settings.collectionsSettings?.contractVatInclusive,
      studentNationalId,
      studentBirthDateText: student.birthDate ? formatDate(student.birthDate) : undefined,
      studentPhone: student.phone,
      studentEmail: student.email,
      institutionName: data.settings.name ?? "",
      institutionAddress: contractBranch?.address ?? "",
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
      enrollmentId: contractEnrollmentId,
      branchLabel: branchCtx.data.label,
      blockOnUnassignedActive: branchCtx.data.multi,
      registrationPaymentScope: branchCtx.data.scope,
    });

    const carriedOverPaymentIds: string[] = [];
    const carryOverSkipped: string[] = [];
    if (carryOver.length > 0) {
      const { collectPayment } = await import("../payments/collect");
      for (const p of carryOver) {
        if (!p) continue;
        try {
          await collectPayment(p.id, {
            voided: true,
            paymentNote: `Sözleşme ${contract.contractNumber} planına taşındı (yeniden borçlandırılmadı).`,
            actorUserId: ctx.userId,
            tenantId: ctx.tenantId,
            // Doğrulamadan sonra tahsilat girildiyse satır iptal EDİLMEZ (tahsilat sıfırlanmaz).
            onlyIfUntouchedOpenDebt: true,
          });
          carriedOverPaymentIds.push(p.id);
          audit(ctx, "payment.moved_to_contract", "Payment", p.id, {
            contractId: contract.id,
            contractNumber: contract.contractNumber,
            before: { amount: p.amount, status: p.status, dueDate: p.dueDate, source: p.source, description: p.description },
          });
        } catch (e) {
          // Satır arada tahsilat gördüyse dokunulmaz; sözleşme zaten yazıldı — kalan ayrı borç olarak görünür.
          if (!(e instanceof Error && e.message === "PAYMENT_CHANGED")) logger.error("carry-over void failed", e);
          carryOverSkipped.push(p.description);
        }
      }
    }
    // İşaretlenmese bile: yeni taksitlerle AYNI dönemi kapsayan tahsilatsız aylık plan ikinci borç değildir.
    // Elle borç, tahsilat görmüş satır ve başka branş kalır. Satır silinmez.
    {
      const { listTerminalContractIds } = await import("../contracts");
      const { supersededUncollectedMonthlyPlanIds } = await import("../superseded-monthly-plan");
      const terminal = await listTerminalContractIds(ctx.tenantId);
      const fresh = await readStudentScope(student.id);
      const autoIds = [...supersededUncollectedMonthlyPlanIds(fresh.payments.filter((p) => p.studentId === student.id), terminal)].filter(
        (id) => !carriedOverPaymentIds.includes(id)
      );
      if (autoIds.length > 0) {
        const { collectPayment } = await import("../payments/collect");
        for (const id of autoIds) {
          const p = fresh.payments.find((row) => row.id === id);
          if (!p) continue;
          try {
            await collectPayment(id, {
              voided: true,
              paymentNote: `Sözleşme ${contract.contractNumber} planına taşındı (yeniden borçlandırılmadı).`,
              actorUserId: ctx.userId,
              tenantId: ctx.tenantId,
              onlyIfUntouchedOpenDebt: true,
            });
            carriedOverPaymentIds.push(id);
            audit(ctx, "payment.moved_to_contract", "Payment", id, {
              contractId: contract.id,
              contractNumber: contract.contractNumber,
              automatic: true,
              before: { amount: p.amount, status: p.status, dueDate: p.dueDate, source: p.source, description: p.description },
            });
          } catch (e) {
            if (!(e instanceof Error && e.message === "PAYMENT_CHANGED")) logger.error("overlapping monthly plan void failed", e);
            carryOverSkipped.push(p.description);
          }
        }
      }
    }
    if (amendmentCredit && amendmentCredit.collected > 0) {
      audit(ctx, "contract.amendment_credit", "StudentContract", contract.id, {
        previousContractId: v.data.previousContractId,
        ...amendmentCredit,
      });
    }

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
      enrollmentId: contract.enrollmentId,
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
    return ok({
      contract,
      installments,
      amendmentCredit,
      carriedOverPaymentIds: carriedOverPaymentIds.length ? carriedOverPaymentIds : undefined,
      carryOverSkipped: carryOverSkipped.length ? carryOverSkipped : undefined,
    });
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
    // DB egress (2026-10-18): referans veri + logo tek satır (eskiden tam okuma).
    const [scope, branding] = await Promise.all([readReferenceData(), readSchoolBranding()]);
    const data = { ...scope, settings: { ...scope.settings, logoUrl: branding.logoUrl } };
    // 2026-10-09 — sekme başlığı / "PDF olarak kaydet" adı branşı söyler (belge içeriği donmuş snapshot'tır, değişmez).
    const { contractEnrollmentId, effectiveEnrollments } = await import("../student-enrollments");
    const ownerStudent = data.students.find((s2) => s2.id === contract.studentId);
    const contractBranchId = ownerStudent ? contractEnrollmentId(ownerStudent, contract, data.teachers) : contract.enrollmentId;
    const branchLabel = ownerStudent
      ? effectiveEnrollments(ownerStudent, data.teachers).find((x) => x.id === contractBranchId)?.instrument
      : undefined;
    const titleFields = contractTitleFields({
      contractType: contract.contractType,
      studentName: contract.contractDataSnapshot.studentName,
      enrollmentStartDate: contract.enrollmentStartDate,
      durationMonths: contract.durationMonths,
      versionNumber: contract.versionNumber,
      branchLabel,
    });
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
  // DB egress (2026-10-18): öğrenci dilimi (seriler/dersler öğrencinin).
  const data = await readStudentScope(contract.studentId);
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
      // DB egress (2026-10-18): öğrenci dilimi.
      const before = await readStudentScope(contract.studentId);
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
  // 2026-10-10 — tür (dolayısıyla banka) branşa özgüdür: `enrollmentId` verilirse yalnız o branşın türleri esas alınır.
  const v = parseOrFail(z.object({ studentId: z.string().min(1), enrollmentId: z.string().min(1).optional() }), input);
  if (!v.ok) return v;
  const data = await readReferenceData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  if (!student) return fail("NOT_FOUND", "Öğrenci yok");
  const settings = data.settings.collectionsSettings ?? { frequencyLimitDays: 3, autoSendEnabled: false };
  const { studentTypesForPaymentBank } = await import("../student-enrollments");
  const r = resolveCollectionsIban(studentTypesForPaymentBank(student, { enrollmentId: v.data.enrollmentId }, data.teachers), settings);
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
 * "teacher" kaynağı öğretmen performansının tek verisidir (ayrı öğretmen yoklaması yok).
 */
const disruptionInputShape = {
  disruptionSource: z.enum(["teacher", "institution", "student", "other"]).optional(),
  disruptionNote: z.string().max(500).optional(),
};

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
    /** Ana işlem kaydedildi ama yan kayıt (hakediş) güncellenemedi. */
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
      /** Geldi notu. Boş veya null temizler. Alan yoksa mevcut not durur. */
      attendanceNote: z.string().max(500).nullable().optional(),
      ...disruptionInputShape,
      ...payoutCorrectionShape,
    }),
    input
  );
  if (!v.ok) return v;
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
  if (v.data.flag === "attended" && current === "attended" && v.data.attendanceNote !== undefined) {
    const note = normalizeAttendanceNote(v.data.attendanceNote) ?? null;
    const saved = await setLessonAttendanceNoteLive(v.data.lessonId, note);
    if (!saved.ok) return fail("VALIDATION_ERROR", saved.message);
    audit(ctx, "lesson.ops.attendance_note", "Lesson", v.data.lessonId, { note });
    return ok({
      lessonId: v.data.lessonId,
      flag: v.data.flag,
      alreadySet: false,
      message: note ? "Not kaydedildi." : "Not temizlendi.",
    });
  }
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

  const payoutPlan = await planOpsChangeForPayout(
    ctx,
    v.data.lessonId,
    { kind: "set", flag: v.data.flag, reason: v.data.reason, disruption },
    v.data,
    data
  );
  if (!payoutPlan.ok) return payoutPlan;

  try {
    const attendanceNote =
      v.data.flag === "attended" && v.data.attendanceNote !== undefined
        ? normalizeAttendanceNote(v.data.attendanceNote)
        : undefined;
    const result = await switchLessonOpsFlagLive(
      v.data.lessonId,
      v.data.flag,
      ctx.userId,
      v.data.reason,
      disruption,
      attendanceNote
    );
    if (!result.ok) return fail("VALIDATION_ERROR", result.message);
    const payoutWarning = result.alreadySet ? undefined : await settleOpsChangeForPayout(ctx, payoutPlan.data, v.data.lessonId);
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
        attendanceNote: attendanceNote === undefined ? undefined : attendanceNote,
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
    return ok({
      lessonId: v.data.lessonId,
      flag: v.data.flag,
      alreadySet: result.alreadySet,
      message: result.message,
      warning: payoutWarning || undefined,
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
 * 2026-10-04 — YOKLAMA DÜZELTMESİ ↔ HAKEDİŞ (Turgay vakası). Eskiden kayıtlı hakedişe düşen dersin
 * İşlendi/Geldi'si hiç geri alınamıyordu. Artık:
 * - Değişiklik dersin hakedişe girip girmemesini DEĞİŞTİRMİYORSA → serbest.
 * - Kapsayan hakediş ÖDENMEMİŞ (hesaplanmış, bekliyor) → değişiklik yapılır, kayıt güncel hesapla yeniden donar.
 * - Kapsayan hakedişte ÖDEME VARSA → mali etki gösterilir; yetkili kullanıcı gerekçe + kritik şifreyle onaylar.
 *   Ödeme satırları değişmez (gerçekte ödenen ödenmiş görünür); fark "recalc" düzeltme kaydı (ters/ek) olarak eklenir.
 */
const payoutCorrectionShape = {
  /** Ödenmiş hakedişi etkileyen yoklama düzeltmesini kullanıcı mali etkiyi görüp onayladı. */
  paidPayoutConfirm: z.boolean().optional(),
  payoutReason: z.string().max(500).optional(),
  criticalPassword: z.string().max(200).optional(),
};

type OpsPayoutPlan =
  | { mode: "none" }
  | { mode: "recompute"; payoutId: string; teacherName: string }
  | { mode: "adjust"; payoutId: string; teacherName: string; reason: string; delta: number };

type OpsChange =
  | { kind: "clear"; expected: import("../lesson-ops").LessonOpsFlag }
  | { kind: "set"; flag: import("../lesson-ops").LessonOpsFlag; reason?: string; disruption?: import("../lesson-disruption").LessonDisruptionInput };

/**
 * Gerçek işlemin SAF karşılığıyla simüle eder (ör. İşlendi geri alınınca completed → scheduled) — kural ikilenmez.
 * Kural reddederse null: gerçek çağrı aynı nedeni kullanıcıya söyler.
 */
async function simulateOpsChange(
  data: AppData,
  lessonId: string,
  change: OpsChange,
  userId: string
): Promise<{ simulated: AppData; next: import("../types").Lesson } | null> {
  try {
    const { clearLessonOpsFlag, switchLessonOpsFlag } = await import("../lesson-ops");
    const r =
      change.kind === "clear"
        ? clearLessonOpsFlag(data, lessonId, change.expected, userId)
        : switchLessonOpsFlag(data, lessonId, change.flag, userId, new Date(), change.reason, change.disruption);
    if (!r.ok) return null;
    const next = r.data.lessons.find((l) => l.id === lessonId);
    return next ? { simulated: r.data, next } : null;
  } catch {
    return null;
  }
}

async function planOpsChangeForPayout(
  ctx: ServiceContext,
  lessonId: string,
  change: OpsChange,
  confirm: { paidPayoutConfirm?: boolean; payoutReason?: string; criticalPassword?: string },
  /** Çağıran dersin dar dilimini zaten okuduysa (setLessonOpsFlagTool) ikinci kez okunmaz. */
  lessonScope?: AppData | null
): Promise<ServiceResult<OpsPayoutPlan>> {
  /**
   * DB egress (2026-10-10) — eskiden HER yoklama işaretinde/geri almada tenant'ın TÜM verisi okunuyordu
   * (üretimde en sık tam okuma yolu). Önce gerçek yazımın kullandığı AYNI dar dilimle (readLessonScope)
   * simüle edilir ve hakediş kaydı yalnız o öğretmenin kayıtlarında aranır; çoğu işaretlemede (hakediş
   * etkisi yok / kayıtlı hakediş yok) tam okuma yapılmaz. Ders kayıtlı bir hakedişe düşüyorsa (nadir)
   * etki hesabı önceki gibi tam veriyle yapılır — mali sonuç aynı kalır.
   */
  const scope = lessonScope ?? (await readLessonScope(lessonId));
  const scoped = scope?.lessons.find((l) => l.id === lessonId);
  if (!scope || !scoped) return fail("NOT_FOUND", "Ders bulunamadı. Sayfayı yenileyip tekrar deneyin.");
  const quick = await simulateOpsChange(scope, lessonId, change, ctx.userId);
  if (!quick || isLessonProcessedForPayout(scoped) === isLessonProcessedForPayout(quick.next)) return ok({ mode: "none" });
  if (!findPayoutCoveringLesson(await readTeacherPayoutsForTeacher(scoped.teacherId), scoped)) return ok({ mode: "none" });

  const data = await readData();
  const lesson = data.lessons.find((l) => l.id === lessonId);
  if (!lesson) return fail("NOT_FOUND", "Ders bulunamadı. Sayfayı yenileyip tekrar deneyin.");
  const full = await simulateOpsChange(data, lessonId, change, ctx.userId);
  if (!full) return ok({ mode: "none" });
  const { simulated, next } = full;
  if (isLessonProcessedForPayout(lesson) === isLessonProcessedForPayout(next)) return ok({ mode: "none" });
  const payout = findPayoutCoveringLesson(data.teacherPayouts, lesson);
  if (!payout) return ok({ mode: "none" });
  const teacherName = data.teachers.find((t) => t.id === payout.teacherId)?.name ?? "Öğretmen";
  // Güvenlik: hakediş kaydını değiştiren her yol, hakediş ekranlarıyla AYNI kurum hakediş yetkisini ister —
  // yoklama yetkisi tek başına hakedişi yeniden hesaplatamaz/düzeltemez.
  const earnings = await assertTeacherEarningsAccess(ctx);
  if (!earnings.ok) {
    return fail(
      "FORBIDDEN",
      `Bu ders ${teacherName} adlı öğretmenin kayıtlı ${payoutPeriodLabel(payout)} hakedişine dahil ve değişiklik hakedişi etkiler; ` +
        "hakediş işlem yetkiniz olmadığı için yoklama değiştirilmedi. Hakediş yetkisi olan bir yöneticiye başvurun."
    );
  }
  if (payoutPaidAmount(payout) <= 0.005) return ok({ mode: "recompute", payoutId: payout.id, teacherName });

  // Ödemeli kayıt: etki = bu değişikliğin dönem hesabına farkı (snapshot'ı olmayan eski kayıtta da çalışır).
  const periodTotal = (d: typeof data) =>
    applyPayoutLineOverrides(computeTeacherEarningsForPeriod(d, payout.teacherId, payout.periodStart, payout.periodEnd), payout.lineOverrides)
      .totalAmount;
  const delta = round2Money(periodTotal(simulated) - periodTotal(data));
  // Ders hakedişten hariç tutulmuşsa (veya satır düzeltmesiyle etkisizse) tutar değişmez → onay gerekmez.
  if (Math.abs(delta) < 0.01) return ok({ mode: "none" });
  const paid = payoutPaidAmount(payout);
  const fmt = (n: number) => `${new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)} TL`;
  if (!confirm.paidPayoutConfirm) {
    return fail(
      "CONFLICT",
      `Bu ders, ${teacherName} adlı öğretmenin ${payoutPeriodLabel(payout)} hakedişinde ve bu hakedişe ${fmt(paid)} ödeme yapılmış. ` +
        `Değişiklik hakedişi ${delta >= 0 ? "+" : "−"}${fmt(Math.abs(delta))} etkiler; ödenen tutar değişmez, fark düzeltme kaydı olarak eklenir. ` +
        "Devam etmek için gerekçe ve kritik işlem şifresiyle onaylayın.",
      { paidPayoutImpact: { payoutId: payout.id, period: payoutPeriodLabel(payout), teacherName, paidAmount: paid, delta } }
    );
  }
  const reason = (confirm.payoutReason ?? "").trim();
  if (reason.length < 5) return fail("VALIDATION_ERROR", "Ödenmiş hakedişi etkileyen düzeltme için en az 5 karakterlik gerekçe yazın.");
  const gate = await passwordGate(ctx, "teacher_payout.attendance_correction", payout, teacherName, confirm.criticalPassword);
  if (gate) return gate;
  return ok({ mode: "adjust", payoutId: payout.id, teacherName, reason, delta });
}

/**
 * Plan revizyonu (öğretmen/tarih değişimi) hakedişte sayılan bir dersi başka öğretmenin/dönemin hakedişine taşıyabilir;
 * sayılma durumu değişmediği için `planMakeupPayoutFlips` bunu görmez. Eski veya yeni konum kayıtlı bir hakedişe düşüyorsa
 * sessizce taşımak yerine reddedilir (hakediş düzeltmesi Hakedişler ekranından, yetkili ve izli yapılır).
 */
async function blockPayoutCountedMove(
  changed: { before: Lesson; after: Lesson }[],
  kind: MakeupLifecycleOp["kind"]
): Promise<ServiceFailure | null> {
  if (kind !== "revise") return null;
  for (const { before, after } of changed) {
    if (!isLessonProcessedForPayout(before)) continue;
    if (before.teacherId === after.teacherId && before.startAt === after.startAt) continue;
    const [fromPayouts, toPayouts] = await Promise.all([
      readTeacherPayoutsForTeacher(before.teacherId),
      before.teacherId === after.teacherId ? Promise.resolve(null) : readTeacherPayoutsForTeacher(after.teacherId),
    ]);
    const from = findPayoutCoveringLesson(fromPayouts, before);
    const to = findPayoutCoveringLesson(toPayouts ?? fromPayouts, after);
    if (from || to) {
      return fail(
        "CONFLICT",
        "Bu telafi dersi hakedişte sayılıyor ve eski ya da yeni öğretmen/tarih kayıtlı bir hakedişin dönemine düşüyor. " +
          "Öğretmen veya tarih değişirse hakediş sessizce kayardığı için işlem yapılmadı. Önce Hakedişler ekranından ilgili " +
          "hakedişi düzeltin ya da yeniden hesaplayın; sonra planı revize edin."
      );
    }
  }
  return null;
}

/** Telafi düzeltmesinin hakediş etkisi. Kapsayan kayıt yoksa tam okuma yapılmaz. */
async function planMakeupPayoutFlips(
  ctx: ServiceContext,
  touches: { before: Lesson; after: Lesson }[],
  confirm: { paidPayoutConfirm?: boolean; payoutReason?: string; criticalPassword?: string }
): Promise<ServiceResult<OpsPayoutPlan[]>> {
  const flipping = touches.filter((touch) => isLessonProcessedForPayout(touch.before) !== isLessonProcessedForPayout(touch.after));
  if (flipping.length === 0) return ok([]);
  const teacherIds = [...new Set(flipping.map((touch) => touch.before.teacherId))];
  const listed = (await Promise.all(teacherIds.map((teacherId) => readTeacherPayoutsForTeacher(teacherId)))).flat();
  if (!flipping.some((touch) => findPayoutCoveringLesson(listed, touch.before))) return ok([]);

  const data = await readData();
  const afterById = new Map(flipping.map((touch) => [touch.after.id, touch.after]));
  const simulated = { ...data, lessons: data.lessons.map((lesson) => afterById.get(lesson.id) ?? lesson) };
  const plans: OpsPayoutPlan[] = [];
  const seen = new Set<string>();
  for (const touch of flipping) {
    const lesson = data.lessons.find((row) => row.id === touch.before.id) ?? touch.before;
    const payout = findPayoutCoveringLesson(data.teacherPayouts, lesson);
    if (!payout || seen.has(payout.id)) continue;
    seen.add(payout.id);
    const teacherName = data.teachers.find((teacher) => teacher.id === payout.teacherId)?.name ?? "Öğretmen";
    const earnings = await assertTeacherEarningsAccess(ctx);
    if (!earnings.ok) {
      return fail(
        "FORBIDDEN",
        `Bu ders ${teacherName} adlı öğretmenin kayıtlı ${payoutPeriodLabel(payout)} hakedişine dahil ve değişiklik hakedişi etkiler; ` +
          "hakediş işlem yetkiniz olmadığı için işlem yapılmadı. Hakediş yetkisi olan bir yöneticiye başvurun."
      );
    }
    if (payoutPaidAmount(payout) <= 0.005) {
      plans.push({ mode: "recompute", payoutId: payout.id, teacherName });
      continue;
    }
    const periodTotal = (snapshot: typeof data) =>
      applyPayoutLineOverrides(
        computeTeacherEarningsForPeriod(snapshot, payout.teacherId, payout.periodStart, payout.periodEnd),
        payout.lineOverrides
      ).totalAmount;
    const delta = round2Money(periodTotal(simulated) - periodTotal(data));
    if (Math.abs(delta) < 0.01) continue;
    const paid = payoutPaidAmount(payout);
    const fmt = (n: number) =>
      `${new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)} TL`;
    if (!confirm.paidPayoutConfirm) {
      return fail(
        "CONFLICT",
        `Bu ders, ${teacherName} adlı öğretmenin ${payoutPeriodLabel(payout)} hakedişinde ve bu hakedişe ${fmt(paid)} ödeme yapılmış. ` +
          `Değişiklik hakedişi ${delta >= 0 ? "+" : "−"}${fmt(Math.abs(delta))} etkiler; ödenen tutar değişmez, fark düzeltme kaydı olarak eklenir. ` +
          "Devam etmek için gerekçe ve kritik işlem şifresiyle onaylayın.",
        { paidPayoutImpact: { payoutId: payout.id, period: payoutPeriodLabel(payout), teacherName, paidAmount: paid, delta } }
      );
    }
    const reason = (confirm.payoutReason ?? "").trim();
    if (reason.length < 5) return fail("VALIDATION_ERROR", "Ödenmiş hakedişi etkileyen düzeltme için en az 5 karakterlik gerekçe yazın.");
    const gate = await passwordGate(ctx, "teacher_payout.attendance_correction", payout, teacherName, confirm.criticalPassword);
    if (gate) return gate;
    plans.push({ mode: "adjust", payoutId: payout.id, teacherName, reason, delta });
  }
  return ok(plans);
}

/** Yoklama değişikliği YAPILDIKTAN sonra hakediş tarafını tutarlı hâle getirir; hata sessiz değil, uyarı döner. */
async function settleOpsChangeForPayout(ctx: ServiceContext, plan: OpsPayoutPlan, lessonId: string): Promise<string | undefined> {
  if (plan.mode === "none") return undefined;
  const data = await readData();
  const payout = data.teacherPayouts.find((p) => p.id === plan.payoutId);
  if (!payout) return "Yoklama kaydedildi ama ilgili hakediş kaydı bulunamadı; Hakedişler ekranından dönemi kontrol edin.";
  if (plan.mode === "recompute" && payoutPaidAmount(payout) <= 0.005) {
    const next = recomputePayoutData(data, payout);
    if ("error" in next) return `Yoklama kaydedildi ama hakediş yeniden hesaplanamadı: ${next.error}`;
    const err = await savePayout(next);
    if (err) return "Yoklama kaydedildi ama hakediş güncellenemedi; Hakedişler ekranında \"Güncel hesapla\" ile yenileyin.";
    await payoutAudit(ctx, "teacher_payout.recalculate", payout, plan.teacherName, {
      reason: "Yoklama düzeltmesi (ödenmemiş hakediş otomatik yeniden hesaplandı)",
      lessonId,
      changes: diffRecordFields({ totalAmount: payout.totalAmount }, { totalAmount: next.totalAmount }),
    });
    return undefined;
  }
  // Ödemeli (veya arada ödeme girilmiş) kayıt: fark düzeltme kaydı. Onaylı yolda tutar, onayda gösterilen
  // bu değişikliğin etkisidir; arada ödeme girildiyse (recompute planı) güncel fark kullanılır.
  const drift = plan.mode === "adjust" ? plan.delta : payoutDrift(data, payout);
  if (Math.abs(drift) < 0.01) return undefined;
  const reason = plan.mode === "adjust" ? plan.reason : "Yoklama düzeltmesi (hakedişe ödeme girilmişti)";
  const res = addAdjustmentData(payout, { amount: drift, reason: `Yoklama düzeltmesi: ${reason}`, kind: "recalc" }, ctx.userId);
  if (!res.ok) return `Yoklama kaydedildi ama hakediş farkı kaydedilemedi: ${res.message}`;
  const err = await savePayout(res.payout);
  if (err) return "Yoklama kaydedildi ama hakediş farkı kaydedilemedi; Hakedişler ekranında farkı düzeltme kaydıyla kapatın.";
  await payoutAudit(ctx, "teacher_payout.adjust", payout, plan.teacherName, { amount: drift, kind: "recalc", reason, lessonId });
  return undefined;
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
): Promise<ServiceResult<{ lessonId: string; cleared: string | null; alreadyClear: boolean; message: string; warning?: string }>> {
  if (ctx.role === "TEACHER") return fail("FORBIDDEN", TEACHER_ATTENDANCE_FORBIDDEN_MESSAGE);
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(
    z.object({
      lessonId: z.string().min(1),
      expected: z.enum(["attended", "processed", "makeup", "absent", "excused"]),
      ...payoutCorrectionShape,
    }),
    input
  );
  if (!v.ok) return v;

  // 2026-10-04 — hakediş kilidi kaldırıldı: ödenmemiş → yeniden hesap; ödenmiş → etki + gerekçe + kritik şifre + düzeltme kaydı.
  const payoutPlan = await planOpsChangeForPayout(ctx, v.data.lessonId, { kind: "clear", expected: v.data.expected }, v.data);
  if (!payoutPlan.ok) return payoutPlan;

  try {
    const result = await clearLessonOpsFlagLive(v.data.lessonId, v.data.expected, ctx.userId);
    if (!result.ok) {
      return fail(result.code === "NOT_FOUND" ? "NOT_FOUND" : result.code === "STALE" || result.code === "SLOT_TAKEN" ? "CONFLICT" : "VALIDATION_ERROR", result.message);
    }
    let warning: string | undefined;
    if (!result.alreadyClear) {
      audit(ctx, "lesson.ops.clear", "Lesson", v.data.lessonId, {
        cleared: result.cleared,
        cancelledMakeupIds: result.cancelledMakeupIds.length ? result.cancelledMakeupIds : undefined,
        payoutCorrection: payoutPlan.data.mode !== "none" ? payoutPlan.data.mode : undefined,
      });
      warning = await settleOpsChangeForPayout(ctx, payoutPlan.data, v.data.lessonId);
    }
    return ok({ lessonId: v.data.lessonId, cleared: result.cleared, alreadyClear: result.alreadyClear, message: result.message, warning });
  } catch (e) {
    logger.error("clearLessonOpsFlagTool failed", e);
    return fail("INTERNAL_ERROR", "Yoklama statüsü geri alınamadı; statü değişmedi. Sayfayı yenileyip tekrar deneyin.");
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
  /** Dersin kendi şubesi (Lesson.branchId → kurum şube kaydı); ekran filtresinden tahmin edilmez. */
  branchName?: string;
  /** 2026-10-06 — Telafi Merkezi'nden planlanan ders (kalıcı kaynak: `type === "makeup"`); Geldi → T işareti. */
  plannedMakeup: boolean;
  /** bkz. Lesson.availabilityOverride — öğretmen müsait olmadığı bir saatte, onaylı planlandı. */
  availabilityOverride: boolean;
  attendanceNote?: string | null;
  processedReason?: string | null;
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
  /** 2026-10-06 — bu ayın kulüp ücreti satırları (sözleşme planından ayrı). */
  clubFees?: { paymentId: string; label: string; amount: number; paidAmount: number; paidAt?: string; method?: string }[];
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
    enrollmentId: c.enrollmentId,
    contractNumber: c.contractNumber,
    status: c.status,
    enrollmentStartDate: c.enrollmentStartDate,
    enrollmentEndDate: c.enrollmentEndDate,
  }));
}

/**
 * 2026-10-09 — Yoklama Takvimi BRANŞ bağlamı: çok branşlı öğrencide takvim, ay tutarı ve ay kutusu tahsilatı yalnız
 * seçilen branşın dersleri, sözleşmesi ve ödeme satırlarıyla çalışır (Keman tahsilatı Piyano ayını kapatmaz).
 * Tek branşlı öğrencide eski davranış birebir aynıdır.
 */
type CalendarBranch = {
  enrollmentId: string;
  terms: import("../student-enrollments").EnrollmentTerms;
  lessonOf: (l: Lesson) => boolean;
  paymentOf: (p: import("../types").Payment) => boolean;
  contractOf: (c: CalendarPlanContract) => boolean;
};

async function resolveCalendarBranch(
  student: Student,
  data: Pick<AppData, "teachers" | "lessons">,
  contracts: CalendarPlanContract[],
  enrollmentId: string | undefined
): Promise<ServiceResult<CalendarBranch | null>> {
  const se = await import("../student-enrollments");
  const list = se.effectiveEnrollments(student, data.teachers);
  if (list.length === 0) return ok(null);
  const view = enrollmentId ? list.find((x) => x.id === enrollmentId) : list.length === 1 ? list[0] : undefined;
  if (!view) {
    return fail(
      enrollmentId ? "NOT_FOUND" : "VALIDATION_ERROR",
      enrollmentId
        ? "Seçilen branş kaydı bu öğrenciye ait değil. Sayfayı yenileyip branşı yeniden seçin."
        : "Bu öğrencinin birden fazla branş kaydı var; Yoklama Takvimi'nde önce branşı (enstrümanı) seçin."
    );
  }
  const terms = se.enrollmentTerms(student, view, data.teachers);
  return ok({
    enrollmentId: view.id,
    terms,
    lessonOf: (l) => l.studentId === student.id && se.lessonEnrollmentId(student, l, data.teachers) === view.id,
    paymentOf: (p) =>
      p.studentId === student.id && se.paymentEnrollmentId(student, p, { contracts, lessons: data.lessons }, data.teachers) === view.id,
    contractOf: (c) => se.contractEnrollmentId(student, c, data.teachers) === view.id,
  });
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
  contracts: CalendarPlanContract[],
  /** 2026-10-09 — branş bağlamı; null = öğrencinin branş kaydı yok (eski davranış). */
  branch: CalendarBranch | null = null
): Promise<AttendanceCalendarMonth> {
  const term = student.termType ?? "guz";
  const ownLesson = (l: Lesson) => (branch ? branch.lessonOf(l) : l.studentId === student.id);
  const ownPayment = (p: import("../types").Payment) => (branch ? branch.paymentOf(p) : p.studentId === student.id);
  const ownContracts = branch ? contracts.filter(branch.contractOf) : contracts;
  const defaultMethod = branch ? branch.terms.paymentMethod : student.paymentMethod;
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
    const dayAllLessons = data.lessons.filter((l) => ownLesson(l) && toZonedYmd(new Date(l.startAt), timeZone) === s.date);
    // 2026-10-15 (owner) — iptal artık üretilmiyor; eski iptal edilmiş dersler takvimde GÖSTERİLMEZ (kayıt silinmez,
    // raporlar/telafi/sayım okur). Ödeme satırları ise tüm derslerden gelir — tahsilat görünürlüğü kaybolmasın.
    const dayLessons = dayAllLessons.filter((l) => l.status !== "cancelled");
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
          branchName: data.settings.branches.find((b) => b.id === l.branchId)?.name,
          availabilityOverride: Boolean(l.availabilityOverride),
          plannedMakeup: l.type === "makeup",
          attendanceNote: l.studentAttendanceNote ?? null,
          processedReason: l.lessonProcessedReason ?? null,
        };
      });
    // ÖNCELİK 4 (devam) — TEK kaynak: mevcut Payment modeli (source:"lesson_ops"),
    // ikinci/çelişkili bir kayıt yaratılmaz — yalnızca OKUNUR ve gösterilir.
    const payments: AttendanceCalendarLessonPaymentInfo[] = dayAllLessons
      .map((l) => data.payments.find((p) => p.lessonId === l.id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => ({
        paymentId: p.id,
        lessonId: p.lessonId!,
        amount: p.amount,
        paidAmount: p.paidAmount,
        recordedAt: p.createdAt ?? p.dueDate,
        paidAt: p.paidAt,
        method: p.method ?? defaultMethod,
        methodIsStudentDefault: !p.method && !!defaultMethod,
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
    data.lessons.filter(ownLesson).map((l) => ({
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
    contracts: ownContracts,
    installments: data.payments.filter(ownPayment),
    year,
    month,
    studentMonthlyFee: branch ? branch.terms.monthlyFee : student.monthlyFee,
  });

  // 2026-10-06 — bu ayın kulüp ücretleri (sözleşme planından ayrı; ay kutusunda ayrı satır).
  const { clubPeriodLabel } = await import("../clubs");
  const clubLabel = clubPeriodLabel(monthPrefix);
  const clubFees = data.payments
    .filter((p) => p.studentId === student.id && p.source === "club" && p.status !== "voided" && p.installmentPeriodLabel === clubLabel)
    .map((p) => ({
      paymentId: p.id,
      label: p.description.replace(/ — [^—]*kulüp ücreti$/, ""),
      amount: p.amount,
      paidAmount: p.paidAmount,
      paidAt: p.paidAt,
      method: p.method,
    }));

  return { year, month, term, withinTerm, plan, billableLessonCount: plannedLessonCount, days, clubFees };
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
      /** 2026-10-09 — çok branşlı öğrencide zorunlu: takvimin branş kaydı. */
      enrollmentId: z.string().max(100).optional(),
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
  const branch = await resolveCalendarBranch(student, data, contracts, v.data.enrollmentId);
  if (!branch.ok) return branch;
  return ok(await buildAttendanceCalendarMonth(data, overrides, student, v.data.year, v.data.month, contracts, branch.data));
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
      /** 2026-10-09 — çok branşlı öğrencide zorunlu: takvimin branş kaydı. */
      enrollmentId: z.string().max(100).optional(),
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
  const branch = await resolveCalendarBranch(student, data, contracts, v.data.enrollmentId);
  if (!branch.ok) return branch;
  const { attendanceCalendarTermMonths } = await import("../attendance-calendar");
  const monthList = data.settings.academicTermDates
    ? academicTermMonths(v.data.term, v.data.anchorYear, data.settings.academicTermDates)
    : attendanceCalendarTermMonths(v.data.term, v.data.anchorYear);
  const months: AttendanceCalendarMonth[] = [];
  for (const m of monthList) {
    months.push(await buildAttendanceCalendarMonth(data, overrides, student, m.year, m.month, contracts, branch.data));
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
): Promise<ServiceResult<{ paymentId: string; studentId: string; month: string; amount: number; status: string; /** 2026-10-14 — tahsilatın mahsup edildiği dönemler (seçilen ay ilk). */ months?: string[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(
    z.object({
      studentId: z.string().min(1),
      month: z.string().regex(/^\d{4}-\d{2}$/),
      amount: z.number().positive(),
      /**
       * TAHSİLAT TARİHİ (yyyy-MM-dd, İstanbul takvim günü) — paranın fiilen alındığı gün; yalnız `paidAt`.
       * Dönem (hangi ay ödeniyor) DAİMA `month`'tur; tahsilat tarihi dönemi asla değiştirmez. Verilmezse bugün.
       */
      collectedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tahsilat tarihi geçersiz; gün.ay.yıl olarak seçin.").optional(),
      /** ESKİ ad (geriye uyum): takvim bu alanla tahsilat tarihini gönderiyordu — vade DEĞİLDİR. */
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
      /** 2026-10-09 — çok branşlı öğrencide zorunlu: tahsilatın yazılacağı branş kaydı (ödeme planı o branşın). */
      enrollmentId: z.string().max(100).optional(),
    }),
    input
  );
  if (!v.ok) return v;

  const collectedAt = v.data.collectedAt ?? v.data.dueDate;
  const [cy, cm] = v.data.month.split("-").map(Number) as [number, number];
  if (!(cm >= 1 && cm <= 12) || cy < 2000 || cy > 2100) {
    return fail("VALIDATION_ERROR", "Ödenen dönem (ay) geçersiz; takvimde ilgili ay kutusundan tekrar deneyin.");
  }

  // DB egress (2026-10-10): tahsilat yalnız bu öğrencinin sözleşme/ödeme/ders satırlarına bakar (her ödeme ve
  // plan satırı `studentId` ile süzülüyor) — tek öğrenci dilimi; eskiden her tahsilatta tenant'ın tüm verisi.
  const data = await readStudentScope(v.data.studentId);
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
    const branchResult = await resolveCalendarBranch(student, data, planContracts, v.data.enrollmentId);
    if (!branchResult.ok) return branchResult;
    const branch = branchResult.data;
    const branchFee = branch ? branch.terms.monthlyFee : student.monthlyFee;
    const plan = resolveContractPlanForMonth({
      contracts: branch ? planContracts.filter(branch.contractOf) : planContracts,
      installments: data.payments.filter((p) => (branch ? branch.paymentOf(p) : p.studentId === student.id)),
      year: y,
      month: mo,
      studentMonthlyFee: branchFee,
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

    // 2026-10-06 — sözleşmesiz plan, dönem ayı ZATEN tamamen tahsil edilmiş:
    // - aylık plan satırıysa mevcut "düzeltme" davranışı korunur (aynı satır yeni tutara güncellenir; aynı değerle
    //   tekrar gönderim sonucu değiştirmez),
    // - yalnız kayıt ilk tahsilatı gibi başka bir satır karşılıyorsa ikinci bir aylık plan satırı AÇILMAZ (çift tahsilat).
    const paidStudentMonth = plan.state === "student_plan" && plan.paymentIds.length > 0 && plan.remaining <= 0;
    const paidRows = paidStudentMonth ? data.payments.filter((p) => plan.paymentIds.includes(p.id)) : [];
    const correctionRow = paidRows.find((p) => p.source === "monthly_plan");
    if (paidStudentMonth && !correctionRow) {
      const day = collectedAt ?? toZonedYmd(new Date(), resolveAppTimezone());
      const retry = paidRows.find(
        (p) => p.paidAt && toZonedYmd(new Date(p.paidAt), resolveAppTimezone()) === day && Math.trunc(p.paidAmount) === Math.trunc(v.data.amount)
      );
      if (retry) return ok({ paymentId: retry.id, studentId: v.data.studentId, month: v.data.month, amount: v.data.amount, status: retry.status });
      if (plan.state === "student_plan" && plan.coveredByCombinedFirstCollection && plan.amount === 0) {
        return fail(
          "CONFLICT",
          `${monthlyPlanPeriodLabel(v.data.month)} dönemi, kayıtta "takip eden ayı da ekle" seçilerek alınan ilk tahsilata dahil; bu kutudan ayrı tahsilat yazılmadı. İlk tahsilatta eksik kalan bir tutar varsa onu Ödemeler ekranında kayıt ilk tahsilatı satırından tahsil edin.`
        );
      }
      return fail(
        "CONFLICT",
        `${monthlyPlanPeriodLabel(v.data.month)} dönemi kayıt ilk tahsilatıyla zaten ödenmiş; ikinci tahsilat bu kutudan yazılmadı. Ek ödeme için Ödemeler ekranını kullanın.`
      );
    }

    // 8. tur — sözleşmesiz planda o ayın TEK açık satırı varsa (ör. ödenmemiş kayıt ilk
    // tahsilatı) ona yazılır; yanına ikinci bir "aylık plan" satırı açılmaz.
    const openStudentRow =
      plan.state === "student_plan" && plan.paymentIds.length === 1 && plan.remaining > 0 ? plan.paymentIds[0] : undefined;
    // 2026-10-09 — yeni aylık plan satırı branş kaydına AÇIKÇA bağlanır (kalıcı kaydı olmayan çok branşlı eski
    // öğrencide önce branşlar kalıcı yapılır); tek branşlı eski öğrencide bağsız satır o branşındır.
    const multiBranch = (await import("../student-enrollments")).effectiveEnrollments(student, data.teachers).length > 1;
    const resolvePlanEnrollmentId = async (): Promise<string | undefined> => {
      if (!branch) return undefined;
      const { isPersistedEnrollmentId } = await import("../student-enrollments");
      if (isPersistedEnrollmentId(branch.enrollmentId)) return branch.enrollmentId;
      if (!multiBranch) return undefined;
      const { ensurePersistedEnrollments, materializedEnrollmentId } = await import("../enrollment-links");
      await ensurePersistedEnrollments(ctx.tenantId, student, data.teachers);
      return materializedEnrollmentId(student.id, branch.terms.instrument);
    };
    const fee = branchFee > 0 ? Math.trunc(branchFee) : 0;
    const entered = Math.trunc(v.data.amount);

    // 2026-10-14 — TEK tahsilat birden çok dönemi karşılayabilir. Seçilen ayın KALANINI aşan kısım, sonraki
    // dönemlere sırayla mahsup edilir (sözleşme taksiti → o satır; sözleşmesiz ay → o ayın TEK aylık plan satırı,
    // yoksa anlaşılan ücretle açılır — gece tahakkuku aynı dönemi bir daha borçlandırmaz). Hepsi önce DOĞRULANIR,
    // sonra yazılır; dağıtılamayan bir tutar varsa hiçbir şey yazılmaz. Eskiden fazla tutar seçilen ayın satırına
    // yazılıyordu (sözleşmesiz yeni satırda borç = girilen tutar): Ekim "6.000 ödendi" görünür, Kasım yine borçlanırdı.
    if (correctionRow && entered > Math.trunc(correctionRow.amount)) {
      // Çok aylı bir tahsilatın tekrar gönderimi (çift tık): seçilen ay + sonraki aylar aynı gün, toplam aynı tutarla
      // zaten tahsil edilmişse sonuç aynen döner — "düzeltme" sanılıp seçilen ayın satırı büyütülmez (çift sayım).
      // Diğer durumlarda ödenmiş ayın düzeltmesi mevcut davranışla sürer.
      const day = collectedAt ?? toZonedYmd(new Date(), resolveAppTimezone());
      const sameDay = data.payments.filter(
        (p) =>
          (branch ? branch.paymentOf(p) : p.studentId === student.id) &&
          !p.contractId &&
          p.paidAt &&
          p.status !== "voided" &&
          toZonedYmd(new Date(p.paidAt), resolveAppTimezone()) === day
      );
      if (
        sameDay.length > 1 &&
        sameDay.some((p) => p.id === correctionRow.id) &&
        sameDay.reduce((t, p) => t + Math.trunc(p.paidAmount), 0) === entered
      ) {
        return ok({ paymentId: correctionRow.id, studentId: v.data.studentId, month: v.data.month, amount: v.data.amount, status: correctionRow.status });
      }
    }
    type CollectTarget = { month: string; paymentId?: string; newRowAmount?: number; take: number };
    const capacityOfSelected =
      plan.state === "ok" ? (plan.remaining > 0 ? plan.remaining : Infinity)
      : openStudentRow && plan.state === "student_plan" ? plan.remaining
      : correctionRow ? Infinity
      : fee > 0 ? fee : Infinity;
    const targets: CollectTarget[] = [
      plan.state === "ok"
        ? { month: v.data.month, paymentId: plan.paymentIds[0]!, take: Math.min(entered, capacityOfSelected) }
        : openStudentRow
          ? { month: v.data.month, paymentId: openStudentRow, take: Math.min(entered, capacityOfSelected) }
          : {
              month: v.data.month,
              // Düzeltmede girilen tutar satırın tutarı olur (mevcut davranış); yeni satırda borç anlaşılan ücrettir.
              newRowAmount: correctionRow ? entered : fee > 0 ? fee : entered,
              take: Math.min(entered, capacityOfSelected),
            },
    ];
    let excess = entered - targets[0]!.take;
    if (excess > 0) {
      const endDate = branch ? branch.terms.endDate : student.enrollmentEndDate;
      const endMonth = endDate ? endDate.slice(0, 7) : undefined;
      const scopedContracts = branch ? planContracts.filter(branch.contractOf) : planContracts;
      const scopedPayments = data.payments.filter((p) => (branch ? branch.paymentOf(p) : p.studentId === student.id));
      let cursor = v.data.month;
      for (let i = 0; i < 24 && excess > 0; i++) {
        const [cy2, cm2] = cursor.split("-").map(Number) as [number, number];
        cursor = cm2 === 12 ? `${cy2 + 1}-01` : `${cy2}-${String(cm2 + 1).padStart(2, "0")}`;
        const label = monthlyPlanPeriodLabel(cursor);
        const notDistributable = (why: string) =>
          fail(
            "VALIDATION_ERROR",
            `Girilen ${entered.toLocaleString("tr-TR")} TL, ${monthlyPlanPeriodLabel(v.data.month)} kalanını aşıyor ve fazlası ${label} dönemine dağıtılamadı: ${why} Tahsilat yazılmadı — yalnız bu ayın kalanını girin, sonraki ayları kendi kutusundan tahsil edin.`
          );
        const [ny, nm] = cursor.split("-").map(Number) as [number, number];
        const next = resolveContractPlanForMonth({ contracts: scopedContracts, installments: scopedPayments, year: ny, month: nm, studentMonthlyFee: branchFee });
        if (next.state === "multiple_active_contracts" || next.state === "no_installment_for_month") return notDistributable(next.message);
        if (next.state === "no_active_contract") return notDistributable("bu ay için ödeme planı yok.");
        if (next.remaining <= 0 && next.paymentIds.length > 0) continue; // zaten ödenmiş/karşılanmış dönem
        if (next.paymentIds.length > 1) return notDistributable("bu ayda birden fazla açık ödeme satırı var.");
        if (next.paymentIds.length === 1) {
          const take = Math.min(excess, next.remaining);
          targets.push({ month: cursor, paymentId: next.paymentIds[0]!, take });
          excess -= take;
          continue;
        }
        if (endMonth && cursor > endMonth) return notDistributable("öğrencinin kayıt bitişi bu aydan önce.");
        if (fee <= 0) return notDistributable("anlaşılan aylık ücret tanımlı değil.");
        const take = Math.min(excess, fee);
        targets.push({ month: cursor, newRowAmount: fee, take });
        excess -= take;
      }
      if (excess > 0) {
        return fail(
          "VALIDATION_ERROR",
          `Girilen ${entered.toLocaleString("tr-TR")} TL, sonraki 24 ayın toplam borcunu aşıyor; tahsilat yazılmadı. Tutarı kontrol edin.`
        );
      }
    }

    const { collectPayment } = await import("../payments/collect");
    const planEnrollmentId = targets.some((t) => t.newRowAmount !== undefined) ? await resolvePlanEnrollmentId() : undefined;
    // Aynı satır birden çok aya düşüyorsa (birleşik sözleşme taksiti) tek tahsilat olarak yazılır.
    const byPayment = new Map<string, { take: number; months: string[] }>();
    const order: string[] = [];
    for (const t of targets) {
      let id = t.paymentId;
      if (!id) {
        const upserted = await upsertMonthlyPlanPayment({
          studentId: v.data.studentId,
          month: t.month,
          amount: t.newRowAmount!,
          method: v.data.method,
          enrollmentId: planEnrollmentId,
          includeUnlinked: !multiBranch,
        });
        id = upserted.paymentId;
      }
      const cur = byPayment.get(id);
      if (cur) {
        cur.take += t.take;
        cur.months.push(t.month);
      } else {
        byPayment.set(id, { take: t.take, months: [t.month] });
        order.push(id);
      }
    }
    const paymentId = order[0]!;
    let collected: Awaited<ReturnType<typeof collectPayment>> | undefined;
    for (const id of order) {
      const res = await collectPayment(id, {
        amount: byPayment.get(id)!.take,
        method: v.data.method,
        // Tahsilat tarihi YALNIZ paidAt'e yazılır (İstanbul takvim günü, öğlen — gün kaymaz).
        paidAt: collectedAt ? new Date(`${collectedAt}T12:00:00.000+03:00`).toISOString() : undefined,
        ...(v.data.note ? { paymentNote: v.data.note } : {}),
        receivedByUserId: ctx.userId,
        actorUserId: ctx.userId,
        tenantId: ctx.tenantId,
        // Tahsilat satıra EKLENİR (kısmi + kalan = plan; yeni satırda önceki tahsilat 0). Tam ödenmiş aylık plan
        // satırında düzeltme: tutar AYARLANIR (mevcut davranış; yalnız seçilen ay).
        accumulate: id === paymentId ? !correctionRow : true,
      });
      if (id === paymentId) collected = res;
    }
    audit(ctx, "PAYMENT_COLLECTED_FROM_ATTENDANCE_CALENDAR", "Payment", paymentId, {
      studentId: v.data.studentId,
      month: v.data.month,
      amount: v.data.amount,
      method: v.data.method,
      // Dönem = month; tahsilat tarihi ayrı (eski kayıtlarda "dueDate" adıyla tutuluyordu).
      collectedAt,
      hasNote: Boolean(v.data.note),
      // Hangi kaynağa yazıldığı audit'te GÖRÜNÜR olmalı — sözleşme taksiti mi,
      // sözleşmesiz serbest aylık plan satırı mı.
      planSource: plan.state === "ok" ? "contract_installment" : "monthly_plan_fallback",
      contractId: plan.state === "ok" ? plan.contractId : undefined,
      // 2026-10-14 — tek tahsilatın dönemlere dağılımı (izlenebilirlik): satır → tutar → kapsadığı ay(lar).
      ...(order.length > 1 ? { allocations: order.map((id) => ({ paymentId: id, amount: byPayment.get(id)!.take, months: byPayment.get(id)!.months })) } : {}),
      enrollmentId: branch?.enrollmentId,
      receivedByUserId: ctx.userId,
    });
    return ok({
      paymentId,
      studentId: v.data.studentId,
      month: v.data.month,
      amount: v.data.amount,
      status: collected!.payment.status,
      months: targets.map((t) => t.month),
    });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "collectAttendanceCalendarPayment failed");
  }
}

export async function getStudentPaymentAttendanceStatementTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<import("../student-statement").StudentPaymentAttendanceStatement & { branchLabel?: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(
    z.object({
      studentId: z.string().min(1),
      term: z.enum(["guz", "yaz"]),
      anchorYear: z.number().int().min(1970).max(2999),
      /** 2026-10-09 — çok branşlı öğrencide döküm branş başınadır. */
      enrollmentId: z.string().max(100).optional(),
    }),
    input
  );
  if (!v.ok) return v;

  const fullData = await readData();
  const student = fullData.students.find((s) => s.id === v.data.studentId);
  const access = await assertStudentAccess(ctx, student, v.data.studentId);
  if (!access.ok) return fail(access.code, access.message);
  if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı");

  const allContracts = await loadCalendarPlanContracts(ctx.tenantId, student.id);
  const branchResult = await resolveCalendarBranch(student, fullData, allContracts, v.data.enrollmentId);
  if (!branchResult.ok) return branchResult;
  const branch = branchResult.data;
  const contracts = branch ? allContracts.filter(branch.contractOf) : allContracts;
  // Döküm yalnız seçilen branşın ders ve ödeme satırlarını okur (diğer öğrencilerin satırları zaten süzülür).
  const seStatement = await import("../student-enrollments");
  const data = branch
    ? {
        ...fullData,
        // Sözleşmesiz ay için "anlaşılan aylık ücret" öğrenci satırı aynasından değil SEÇİLEN branşın koşulundan gelir.
        students: fullData.students.map((s) => (s.id === student.id ? seStatement.studentWithEnrollmentTerms(s, branch.terms) : s)),
        lessons: fullData.lessons.filter((l) => l.studentId !== student.id || branch.lessonOf(l)),
        payments: fullData.payments.filter((p) => p.studentId !== student.id || branch.paymentOf(p)),
      }
    : fullData;
  const collectorIds = [
    ...new Set(data.payments.filter((p) => p.studentId === student.id && p.receivedByUserId).map((p) => p.receivedByUserId!)),
  ];
  // P0 revizyonu: e-posta DEĞİL ad soyad (öğretmen kaydından; yoksa zarif
  // fallback) — kimlik `receivedByUserId`de aynen korunur (audit bütünlüğü).
  const { resolveActorLabels } = await import("../contract-payment-plan-view");
  const collectorNames = await resolveActorLabels({ tenantId: ctx.tenantId, userIds: collectorIds, teachers: data.teachers });

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
  // 2026-10-09 — çok branşlı öğrencinin dökümü branşını söyler.
  const multiBranch = (await import("../student-enrollments")).effectiveEnrollments(student, fullData.teachers).length > 1;
  return ok({ ...statement, ...(branch && multiBranch ? { branchLabel: branch.terms.instrument } : {}) });
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
      // pushEnabled yalnız push altyapısı aktifken kabul edilir; aksi halde
      // önceki fail-closed davranış korunur (her zaman false).
      const { isPushActive } = await import("../push/config");
      updates.push({
        category: u.category,
        inAppEnabled: u.inAppEnabled,
        pushEnabled: isPushActive() ? (u.pushEnabled ?? false) : (false as const),
      });
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
 * 9. tur — Öğretmen raporu (iptal/telafi kaynağı; öğretmen aksaması = "Öğretmen kaynaklı"). Yalnız kurum yöneticileri.
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
        .enum(["teacher_source", "institution_source", "student_other_source", "unspecified_source"])
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
  const report = buildTeacherAttendanceReport(data.lessons, filters);
  const teacherById = new Map(data.teachers.map((t) => [t.id, t]));
  const studentById = new Map(data.students.map((s) => [s.id, s]));
  const branchName = (id: string) => data.settings.branches.find((b) => b.id === id)?.shortName;
  const detail = v.data.category || v.data.teacherId
    ? teacherAttendanceDetail(data.lessons, filters, v.data.category).map((l) => ({
        lessonId: l.id,
        startAt: l.startAt,
        teacherName: teacherById.get(l.teacherId)?.name ?? "Öğretmen bulunamadı",
        studentName: studentById.get(l.studentId)?.name ?? "Öğrenci bulunamadı",
        branchName: branchName(l.branchId),
        categories: lessonTeacherCategories(l),
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
      /** Çok branşlı öğrencide varsayılanlar hangi branştan okunsun (ilk branş sessizce seçilmez). */
      enrollmentId: z.string().min(1).optional(),
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
    const rawStudent = data.students.find((s) => s.id === v.data.studentId);
    if (!rawStudent) return fail("NOT_FOUND", "Öğrenci bulunamadı");
    // 2026-10-10 — varsayılan ücret/tarih/sıklık BRANŞTAN okunur: çok branşlıda `enrollmentId` verilmeli (ya da değerler
    // açıkça girilmeli); öğrenci satırı aynası başka bir branşın değeri olabilir.
    const se = await import("../student-enrollments");
    const active = se.effectiveEnrollments(rawStudent, data.teachers).filter((e) => e.active);
    let student = rawStudent;
    if (active.length > 1) {
      const sel = v.data.enrollmentId ? active.find((e) => e.id === v.data.enrollmentId) : undefined;
      if (v.data.enrollmentId && !sel) return fail("VALIDATION_ERROR", "Seçilen branş kaydı bu öğrenciye ait değil veya aktif değil.");
      const needsDefaults =
        v.data.enrollmentStartDate === undefined || v.data.enrollmentEndDate === undefined || v.data.weeklyLessonCount === undefined || v.data.monthlyFee === undefined;
      if (!sel && needsDefaults) {
        return fail(
          "VALIDATION_ERROR",
          "Bu öğrencinin birden fazla aktif branşı var; simülasyon hangi branşın ücret/tarih/sıklık bilgisiyle yapılacak? `enrollmentId` verin ya da başlangıç, bitiş, haftalık ders ve aylık ücreti açıkça girin."
        );
      }
      if (sel) student = se.studentWithEnrollmentTerms(rawStudent, se.enrollmentTerms(rawStudent, sel, data.teachers));
    }
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
