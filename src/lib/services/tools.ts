/**
 * AI Tool Layer — single source of business operations.
 * Reuses existing store + makeup-engine + whatsapp templates.
 * Consumable by Web actions, future Mobile API, and AI agents.
 */

import { z } from "zod";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { prisma } from "../db";
import { foldTurkishForSearch } from "../normalize";
import { provisionEntityLogin, getUserIdByTeacherId } from "../auth/users";
import { logger } from "../logger";
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
  cancelLesson,
  cancelLessonSeriesFromLesson,
  cancelMakeup,
  confirmSlot,
  correctLessonTimesLive,
  createTeacherPayout,
  endLessonLive,
  generateSuggestions,
  importBranches,
  importRooms,
  importStudents,
  importTeachers,
  markAttendance,
  markPaymentPaid,
  updatePayment,
  markTeacherPayoutPaid,
  readData,
  resetData,
  resetToCleanTemplate,
  startLessonLive,
  updateBranch,
  updateCollectionsSettings,
  updateFeeRoundingMode,
  updateMakeupWindowDays,
  updateTermWeeklyClosedDays,
  updateLessonSchedule,
  updateMakeupSlaEscalation,
  updateStudentProfile,
  updateTeacherAvailability,
  updateTeacherInstruments,
  updateTeacherProfile,
  updateTeacherFeeRule,
  switchLessonOpsFlagLive,
  upsertMonthlyPlanPayment,
  addPackage,
  updatePackage,
  addDiscountCampaign,
  updateDiscountCampaign,
} from "../store";
import { setClosedDay, listClosedDays } from "../closed-day-overrides";
import { resolveDayStatus, isWeeklyClosedDayForTerm } from "../attendance-calendar";
import {
  setSocialMediaConsent,
  getLatestSocialMediaConsent,
  listSocialMediaConsentHistory,
} from "../social-media-consent";
import {
  createInstrumentCatalogEntry,
  updateInstrumentCatalogEntry,
  listInstrumentCatalog,
  resolveActiveInstrumentNames,
} from "../instrument-catalog";
import { listStaff, createStaffMember, updateStaffMember } from "../staff";
import { listPayroll, createPayrollRecord, updatePayrollStatus } from "../payroll";
import { listLeave, createLeaveRequest, decideLeaveRequest } from "../leave";
import { listExpenses, createExpense } from "../expense";
import { effectiveLessonOpsStatus } from "../lesson-ops";
import { computeTeacherEarningsForPeriod, type TeacherEarningsResult } from "../teacher-payout";
import {
  suggestMakeupSlots,
  resolveSlaEscalationLevel,
  LessonSlotValidationError,
  isOverridableSlotCode,
  type MakeupSlaEscalation,
} from "../makeup-engine";
import { suggestLessonSlots, type LessonSlotSuggestion } from "../lesson-scheduling";
import { DEFAULT_LESSON_DURATION_MINUTES } from "../lesson-duration";
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
  markNotificationRead,
} from "../notifications";
import {
  clearAnnouncements,
  createAnnouncement,
  listAnnouncements,
  listReadUserIds,
  markAnnouncementRead,
  updateAnnouncementStatus,
} from "../announcements";
import { isVisibleNow, matchesAudience } from "../announcements/audience";
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
  createAvailabilityRequest,
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
import { formatMoney, formatDate, formatTime, uid } from "../utils";
import { parseCsv, rowsToRecords } from "../import/csv";
import { validateBranchRows, type BranchImportRow } from "../import/branches";
import { validateTeacherRows, type TeacherImportRow } from "../import/teachers";
import { validateRoomRows, type RoomImportRow } from "../import/rooms";
import { validateStudentRows, type StudentImportRow } from "../import/students";
import { validateLessonRows, type LessonImportRow } from "../import/lessons";
import { validateLessonScheduleRows, type LessonScheduleImportPreview } from "../import/lesson-schedule";
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
  markNotificationReadSchema,
  markTeacherPayoutPaidSchema,
  createHomeworkSchema,
  createTeachingMaterialSchema,
  paymentRecordSchema,
  proposeTeacherAvailabilitySchema,
  reviewHomeworkSubmissionSchema,
  reviewTeacherAvailabilityRequestSchema,
  roomSchema,
  submitHomeworkSchema,
  submitTeacherFeedbackSchema,
  createCurriculumTopicSchema,
  updateCurriculumTopicSchema,
  createTrialLessonSchema,
  updateTrialLessonStatusSchema,
  archiveStudentSchema,
  archiveTeacherSchema,
  updateRoomSchema,
  setNationalIdSchema,
  createDocumentInstanceSchema,
  uploadDocumentDirectSchema,
  createDocumentTemplateSchema,
  updateDocumentTemplateSchema,
  archiveDocumentTemplateSchema,
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
  updateTermWeeklyClosedDaysSchema,
  updateFeeRuleSchema,
  updateLessonScheduleSchema,
  updateStudentProfileSchema,
  updateStudentPaymentProfileSchema,
  updateTeacherInstrumentsSchema,
  updateTeacherProfileSchema,
  createPackageSchema,
  updatePackageSchema,
  createDiscountCampaignSchema,
  updateDiscountCampaignSchema,
  socialMediaConsentSchema,
  createInstrumentCatalogSchema,
  updateInstrumentCatalogSchema,
  createStaffMemberSchema,
  updateStaffMemberSchema,
  createPayrollRecordSchema,
  updatePayrollStatusSchema,
  createLeaveRequestSchema,
  decideLeaveRequestSchema,
  createExpenseSchema,
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
  INSTRUMENTS,
  type Announcement,
  type AnnouncementAudienceRef,
  type AnnouncementStatus,
  type BranchId,
  type CollectionsSettings,
  type FeeRoundingMode,
  type Homework,
  type HomeworkSubmission,
  type Instrument,
  type LessonAssessment,
  type LessonDurationPreference,
  type MakeupSlot,
  type Notification,
  type Student,
  type StudentProfilePatch,
  type Teacher,
  type TeacherAvailabilityRequest,
  type TeacherFeedback,
  type TeacherFeeRule,
  type TeacherPayout,
  type TeachingMaterial,
  type Task,
  type TaskStatus,
  type TaskChecklistItem,
  type TaskComment,
  type TaskActivity,
  type TaskActivityAction,
  type TaskAttachment,
  OPEN_TASK_STATUSES,
} from "../types";
import {
  createTask,
  getTask,
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
import { resolveAppTimezone, toZonedYmd } from "../timezone";
import { clearTaskReminderLog } from "../task-reminder-log";
import { getReminderPreference, setReminderPreference, clearReminderPreferences } from "../task-reminder-preferences";
import {
  assertStudentAccess,
  canAccessStudent,
  canAccessTeacher,
  requireRole,
  type ServiceContext,
} from "./context";
import { fail, fromZodError, ok, type ServiceErrorCode, type ServiceResult } from "./result";
import { recordAuditLog } from "../audit/log";
import {
  createCurriculumTopic,
  updateCurriculumTopic,
  listCurriculumTopicsForStudent,
  computeOverallCurriculumProgress,
  toCurriculumSummary,
  getCurriculumTopic,
} from "../curriculum";
import type { StudentCurriculumTopic, DocumentInstance, TeacherFeedbackStatus } from "../types";
import { createTrialLesson, listTrialLessons, updateTrialLessonStatus, getTrialLesson } from "../trial-lessons";
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
  type DocumentInstanceFilters,
} from "../documents";
import { encryptNationalId, maskNationalId, canViewFullNationalId } from "../pii";
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

// ─── helpers ───────────────────────────────────────────────

function parseOrFail<T>(schema: z.ZodType<T>, input: unknown): ServiceResult<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error.flatten());
  return ok(parsed.data);
}

// ─── tools ─────────────────────────────────────────────────

export async function markAttendanceTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ lessonId: string; status: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "TEACHER", "AI_AGENT", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(attendanceSchema, input);
  if (!v.ok) return v;

  if (ctx.role === "TEACHER") {
    const data = await readData();
    const lesson = data.lessons.find((l) => l.id === v.data.lessonId);
    if (!lesson) return fail("NOT_FOUND", "Lesson not found");
    if (!canAccessTeacher(ctx, lesson.teacherId)) {
      return fail("FORBIDDEN", "Cannot mark attendance for another teacher's lesson");
    }
  }

  try {
    await markAttendance(v.data);
    return ok({ lessonId: v.data.lessonId, status: v.data.status });
  } catch (e) {
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
    const data = await readData();
    const request = data.makeupRequests.find((m) => m.id === v.data.requestId);
    if (!request) return fail("NOT_FOUND", "Makeup request not found");

    const options = v.data.maxSlots ? { maxSlots: v.data.maxSlots } : undefined;
    const slots = suggestMakeupSlots(data, request, options);
    // Persist suggestions via existing store path
    await generateSuggestions(v.data.requestId, options);
    return ok({ requestId: v.data.requestId, slots });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "findAvailableSlots failed");
  }
}

/**
 * EPIC 10 — `decisionNote` ZORUNLU (kasıtlı, dokümante edilmiş sözleşme
 * kırılması): "onay/iptal/ret işlemlerinde karar notu zorunlu olmalı" ürün
 * kararı geriye dönük uyumluluktan önceliklidir. Onay, 30 günlük SLA
 * sayacını başlatır (bkz. `confirmMakeupSlot`/`computeSlaDeadline`).
 */
export async function confirmMakeupLessonTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ requestId: string; lessonId?: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "AI_AGENT", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(
    z.object({
      requestId: z.string().min(1),
      slot: makeupSlotSchema,
      decisionNote: z.string().min(1, "Karar notu zorunludur"),
    }),
    input
  );
  if (!v.ok) return v;

  try {
    await confirmSlot(v.data.requestId, v.data.slot as MakeupSlot, {
      decisionNote: v.data.decisionNote,
      decidedBy: ctx.userId,
    });
    const data = await readData();
    const req = data.makeupRequests.find((m) => m.id === v.data.requestId);
    audit(ctx, "makeup.confirm", "MakeupRequest", v.data.requestId, {
      lessonId: req?.confirmedLessonId,
      decisionNote: v.data.decisionNote,
    });
    return ok({ requestId: v.data.requestId, lessonId: req?.confirmedLessonId });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "confirmMakeupLesson failed");
  }
}

export async function createMakeupLessonTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ requestId: string }>> {
  /** Creates makeup credit via attendance (absent / school cancel) — reuses store */
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "TEACHER", "AI_AGENT", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(
    attendanceSchema.extend({
      status: z.enum(["absent", "cancelled_by_school"]),
    }),
    input
  );
  if (!v.ok) return v;

  if (ctx.role === "TEACHER") {
    const data = await readData();
    const lesson = data.lessons.find((l) => l.id === v.data.lessonId);
    if (!lesson) return fail("NOT_FOUND", "Ders bulunamadı");
    if (!canAccessTeacher(ctx, lesson.teacherId)) {
      return fail("FORBIDDEN", "Yalnızca kendi dersiniz için telafi oluşturabilirsiniz.");
    }
  }

  try {
    await markAttendance(v.data);
    const data = await readData();
    const req = data.makeupRequests.find((m) => m.sourceLessonId === v.data.lessonId);
    if (!req) return fail("CONFLICT", "Makeup request was not created");
    return ok({ requestId: req.id });
  } catch (e) {
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

export async function getStudentScheduleTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ studentId: string; lessons: unknown[] }>> {
  const auth = requireRole(ctx, [
    "SCHOOL_ADMIN",
    "TEACHER",
    "PARENT",
    "STUDENT",
    "AI_AGENT",
    "SUPER_ADMIN",
  ]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(z.object({ studentId: z.string().min(1) }), input);
  if (!v.ok) return v;

  const data = await readData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  const access = assertStudentAccess(ctx, student, v.data.studentId);
  if (!access.ok) return fail(access.code, access.message);

  const lessons = data.lessons
    .filter((l) => l.studentId === v.data.studentId)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

  return ok({ studentId: v.data.studentId, lessons });
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

  const lessons = data.lessons
    .filter((l) => l.teacherId === v.data.teacherId)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

  return ok({ teacherId: v.data.teacherId, lessons });
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
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "TEACHER", "PARENT", "AI_AGENT", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(z.object({ query: z.string().min(1).max(120) }), input);
  if (!v.ok) return v;

  const needle = v.data.query.trim().toLocaleLowerCase("tr");
  if (!needle) return fail("VALIDATION_ERROR", "query boş olamaz");

  const data = await readData();
  const students = data.students.filter(
    (s) =>
      s.active &&
      s.name.toLocaleLowerCase("tr").includes(needle) &&
      canAccessStudent(ctx, s.id, { teacherId: s.teacherId })
  );
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

  const data = await readData();
  const branchShortName = (branchId?: string) =>
    branchId ? data.settings.branches.find((b) => b.id === branchId)?.shortName : undefined;

  const students: GlobalSearchResultItem[] = data.students
    .filter(
      (s) =>
        s.active &&
        foldTurkishForSearch(s.name).includes(needle) &&
        canAccessStudent(ctx, s.id, { teacherId: s.teacherId })
    )
    .slice(0, 6)
    .map((s) => ({ kind: "student" as const, id: s.id, label: s.name, description: branchShortName(s.branchId) }));

  const teachers: GlobalSearchResultItem[] = data.teachers
    .filter((t) => t.active && foldTurkishForSearch(t.name).includes(needle) && canAccessTeacher(ctx, t.id))
    .slice(0, 6)
    .map((t) => ({ kind: "teacher" as const, id: t.id, label: t.name, description: t.instruments?.join(", ") }));

  let staff: GlobalSearchResultItem[] = [];
  if (ctx.role === "SCHOOL_ADMIN" || ctx.role === "SUPER_ADMIN") {
    const staffList = await listStaff(ctx.tenantId);
    staff = staffList
      .filter((p) => p.status !== "terminated" && foldTurkishForSearch(p.name).includes(needle))
      .slice(0, 6)
      .map((p) => ({ kind: "staff" as const, id: p.id, label: p.name, description: p.position }));
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
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "PARENT", "AI_AGENT", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(z.object({ studentId: z.string().min(1) }), input);
  if (!v.ok) return v;

  const data = await readData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  const access = assertStudentAccess(ctx, student, v.data.studentId);
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
    await markPaymentPaid(v.data.paymentId, {
      method: v.data.method,
      amount: v.data.amount,
      paidAt: v.data.paidAt,
      paymentNote: v.data.paymentNote,
      receivedByUserId: ctx.userId,
    });
    audit(ctx, "payment.mark_paid", "Payment", v.data.paymentId, {
      method: v.data.method,
      amount: v.data.amount,
      receivedByUserId: ctx.userId,
    });
    return ok({ paymentId: v.data.paymentId, status: "paid" });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "createPayment failed");
  }
}

export async function updatePaymentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ paymentId: string }>> {
  /** Zaten "paid" bir ödemenin yöntem/tutar/not alanlarını düzenler — Paket 5 "Düzenle" akışı. */
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(
    z.object({
      paymentId: z.string().min(1),
      method: z.enum(["credit_card", "cash", "transfer"]).optional(),
      amount: z.number().positive().optional(),
      paymentNote: z.string().max(500).optional(),
    }),
    input
  );
  if (!v.ok) return v;

  try {
    const data = await readData();
    const existing = data.payments.find((p) => p.id === v.data.paymentId);
    if (!existing) return fail("NOT_FOUND", "Ödeme bulunamadı");
    if (existing.status !== "paid") {
      return fail("VALIDATION_ERROR", "Yalnızca tamamlanmış ödemeler düzenlenebilir.");
    }

    await updatePayment(v.data.paymentId, {
      method: v.data.method,
      paidAmount: v.data.amount,
      paymentNote: v.data.paymentNote,
    });
    audit(ctx, "payment.update", "Payment", v.data.paymentId, {
      method: v.data.method,
      amount: v.data.amount,
    });
    return ok({ paymentId: v.data.paymentId });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "updatePayment failed");
  }
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
  const access = assertStudentAccess(ctx, student, v.data.studentId);
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
): Promise<ServiceResult<{ studentId: string; tempLoginPassword?: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "AI_AGENT", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(studentSchema, input);
  if (!v.ok) return v;

  try {
    const before = await readData();
    // MT-003 — seçilen öğretmenin AKTİF, AYNI TENANT'ta (`before.teachers`
    // zaten tenant-scoped — cross-tenant bir ID burada asla bulunamaz) ve
    // seçilen enstrümana yetkin olduğu sunucuda doğrulanır; filtre yalnız
    // UI'da kalmaz. Öğretmenin birden fazla enstrümanı varsa eşleşen
    // herhangi biri yeterlidir.
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
    } = { monthlyFee: v.data.monthlyFee, monthlyFeeManualOverride: false };

    if (!v.data.packageId && (v.data.discountType || v.data.discountValue !== undefined || v.data.monthlyFeeOverrideAmount !== undefined)) {
      return fail("VALIDATION_ERROR", "İndirim/manuel ücret yalnızca bir paket seçildiğinde uygulanabilir.");
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
      const computation = computeMonthlyFee({
        pkg,
        durationMinutes: v.data.lessonDurationMinutes as LessonDurationMinutes,
        discountType: v.data.discountType,
        discountValue: v.data.discountValue,
        overrideAmount: v.data.monthlyFeeOverrideAmount,
      });
      pricing = {
        monthlyFee: computation.finalMonthlyFee,
        packageBaseMonthlyFee: computation.baseMonthlyFee,
        discountType: v.data.discountType,
        discountValue: v.data.discountValue,
        monthlyFeeManualOverride: computation.source === "override",
        monthlyFeeOverrideReason: computation.source === "override" ? v.data.monthlyFeeOverrideReason : undefined,
      };
    }

    // `instrument` (tekil) yalnızca giriş şemasının alanı — model karşılığı
    // `instruments` (dizi). STORE_MODE=db'de `addStudent`'ın Prisma
    // `student.create` çağrısı `...student` ile geniş bir spread yapıyor;
    // `instrument` burada süzülmezse Prisma'ya bilinmeyen bir alan olarak
    // gider ve "Unknown argument `instrument`" hatasıyla TÜM öğrenci
    // oluşturma db-modunda kırılır (json/memory modda sessizce yutulduğu
    // için bu hata testlerde hiç görünmüyordu — STORE_MODE=json'da çalışır).
    const { monthlyFeeOverrideAmount: _ignoredOverrideAmount, instrument: _ignoredInstrument, ...studentInput } = v.data;
    const ids = new Set(before.students.map((s) => s.id));
    await addStudent({
      ...studentInput,
      instruments: [v.data.instrument as Instrument],
      email: v.data.email ?? "",
      notes: v.data.notes ?? "",
      lessonDurationMinutes: v.data.lessonDurationMinutes as Student["lessonDurationMinutes"],
      ...pricing,
    });
    const after = await readData();
    const created = after.students.find((s) => !ids.has(s.id));
    if (created) {
      audit(ctx, "student.create", "Student", created.id, v.data.packageId ? { pricing } : undefined);
    }

    // EPIC 6A gap — Student kaydı oluşturmak tek başına giriş sağlamıyordu
    // (bkz. provisionEntityLogin yorumu). E-posta verildiyse otomatik bir
    // login hesabı sağlanır; STORE_MODE=db dışında (json/memory) veya
    // e-posta boşsa sessizce atlanır.
    let tempLoginPassword: string | undefined;
    if (created && v.data.email) {
      const provisioned = await provisionEntityLogin({
        tenantId: ctx.tenantId,
        email: v.data.email,
        role: "STUDENT",
        studentId: created.id,
      });
      if (provisioned) {
        audit(ctx, "student.login_provisioned", "Student", created.id);
        // Geçici şifre yalnızca doğrudan insan yönetici çağrısında API
        // yanıtına dahil edilir — AI_AGENT rolüyle (sohbet/otonom akış)
        // oluşturulduysa dönmez, çünkü LLM tool-result'ı sohbette anlatabilir
        // ve şifre bu yolla sızabilir. Hesap her koşulda oluşur; yönetici
        // şifreyi yalnızca kendi doğrudan isteğiyle görür (tek seferlik).
        if (ctx.role === "SCHOOL_ADMIN" || ctx.role === "SUPER_ADMIN") {
          tempLoginPassword = provisioned.tempPassword;
        }
      }
    }

    return ok({ studentId: created?.id ?? "unknown", tempLoginPassword });
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
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(updateStudentProfileSchema, input);
  if (!v.ok) return v;

  if (v.data.branchId) {
    const data = await readData();
    if (!data.settings.branches.some((b) => b.id === v.data.branchId)) {
      return fail("VALIDATION_ERROR", `Geçersiz şube: "${v.data.branchId}".`);
    }
  }

  try {
    const { studentId, ...patch } = v.data;
    const profilePatch: StudentProfilePatch = {
      ...patch,
      lessonDurationMinutes: patch.lessonDurationMinutes as LessonDurationPreference | undefined,
    };
    await updateStudentProfile(studentId, profilePatch);
    audit(ctx, "student.profile_update", "Student", studentId, patch);
    return ok({ studentId });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "updateStudentProfile failed");
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
    const data = await readData();
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

  const data = await readData();
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

  const data = await readData();
  const teacher = data.teachers.find((t) => t.id === v.data.teacherId);
  if (!teacher) return fail("NOT_FOUND", "Öğretmen bulunamadı");

  if (v.data.branchIds) {
    const invalid = v.data.branchIds.find(
      (bId) => !data.settings.branches.some((b) => b.id === bId)
    );
    if (invalid) return fail("VALIDATION_ERROR", `Geçersiz şube: "${invalid}".`);
  }

  try {
    const { teacherId, ...patch } = v.data;
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
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
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
function requireStaffSensitiveAccess(ctx: ServiceContext) {
  return requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
}

function staffFieldsFromInput(v: {
  name?: string;
  position?: string;
  phone?: string;
  email?: string;
  address?: string;
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
}) {
  return {
    name: v.name,
    position: v.position,
    phone: v.phone,
    email: v.email || undefined,
    address: v.address,
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
  };
}

export async function createStaffMemberTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ staffId: string }>> {
  const auth = requireStaffSensitiveAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(createStaffMemberSchema, input);
  if (!v.ok) return v;

  const result = await createStaffMember({
    tenantId: ctx.tenantId,
    createdBy: ctx.userId,
    ...staffFieldsFromInput(v.data),
  });
  if (!result.ok) return fail("VALIDATION_ERROR", result.message);
  audit(ctx, "staff.create", "StaffMember", result.entry.id, { name: result.entry.name, position: result.entry.position });
  return ok({ staffId: result.entry.id });
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
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
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
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
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
      { excludeUserId: ctx.userId, dedupeKey: result.entry.id }
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
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(decideLeaveRequestSchema, input);
  if (!v.ok) return v;
  const result = await decideLeaveRequest(ctx.tenantId, v.data.leaveId, { status: v.data.status, approvedBy: ctx.userId });
  if (!result.ok) return fail("VALIDATION_ERROR", result.message);
  audit(ctx, "leave.decide", "LeaveRequest", v.data.leaveId, { status: v.data.status });
  return ok({ leaveId: v.data.leaveId });
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

export async function getFinanceSummaryTool(
  ctx: ServiceContext,
  _input: unknown
): Promise<ServiceResult<import("../finance-summary").FinanceSummary>> {
  const auth = requireStaffSensitiveAccess(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const data = await readData();
  const staff = await listStaff(ctx.tenantId);
  const payroll = await listPayroll(ctx.tenantId);
  const expenses = await listExpenses(ctx.tenantId);
  const { computeFinanceSummary } = await import("../finance-summary");
  return ok(computeFinanceSummary(data, staff, payroll, expenses));
}

export async function createPackageTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ packageId: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(createPackageSchema, input);
  if (!v.ok) return v;

  const result = await addPackage({
    ...v.data,
    defaultDurationMinutes: v.data.defaultDurationMinutes as LessonDurationPreference | undefined,
    createdBy: ctx.userId,
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
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(updatePackageSchema, input);
  if (!v.ok) return v;

  const { packageId, ...patch } = v.data;
  const result = await updatePackage(packageId, {
    ...patch,
    defaultDurationMinutes: patch.defaultDurationMinutes as LessonDurationPreference | undefined,
  });
  if (!result.ok) return fail("VALIDATION_ERROR", result.message);
  audit(ctx, "package.update", "Package", packageId, patch);
  return ok({ packageId });
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
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(createDiscountCampaignSchema, input);
  if (!v.ok) return v;

  const result = await addDiscountCampaign({ ...v.data, createdBy: ctx.userId });
  if (!result.ok) return fail("VALIDATION_ERROR", result.message);
  audit(ctx, "discount_campaign.create", "DiscountCampaign", result.campaign.id, {
    name: result.campaign.name,
    discountPercent: result.campaign.discountPercent,
  });
  return ok({ campaignId: result.campaign.id });
}

export async function updateDiscountCampaignTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ campaignId: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(updateDiscountCampaignSchema, input);
  if (!v.ok) return v;

  const { campaignId, ...patch } = v.data;
  const result = await updateDiscountCampaign(campaignId, patch);
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

  const data = await readData();
  if (!data.students.some((s) => s.id === v.data.studentId)) return fail("NOT_FOUND", "Öğrenci bulunamadı");

  const record = await setSocialMediaConsent({ ...v.data, tenantId: ctx.tenantId, actorUserId: ctx.userId });
  audit(ctx, "student.social_media_consent", "Student", v.data.studentId, { status: record.status });
  return ok({ studentId: v.data.studentId, status: record.status });
}

/** Öğrenci detayında gösterim için en güncel izin — staff erişimi (RBAC mevcut assertStudentAccess ile aynı desen). */
export async function getSocialMediaConsentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ consent: Awaited<ReturnType<typeof getLatestSocialMediaConsent>> }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(z.object({ studentId: z.string().min(1) }), input);
  if (!v.ok) return v;

  const data = await readData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  const access = assertStudentAccess(ctx, student, v.data.studentId);
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
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(z.object({ studentId: z.string().min(1) }), input);
  if (!v.ok) return v;

  const data = await readData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  const access = assertStudentAccess(ctx, student, v.data.studentId);
  if (!access.ok) return fail(access.code, access.message);

  const history = await listSocialMediaConsentHistory(ctx.tenantId, v.data.studentId);
  return ok({ history });
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
    const result = await importStudents(preview.valid);
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
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "importStudents failed");
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
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "AI_AGENT", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(lessonSchema, input);
  if (!v.ok) return v;
  // ÖNCELİK 4 (devam) — dönem seçiliyse (Program ekranından geliyorsa) o
  // dönemin haftalık kapalı gün kuralı uygulanır (varsayılan Güz: Pazartesi,
  // Yaz: Cts/Paz — okul `termWeeklyClosedDays` ile özelleştirmişse o esas
  // alınır); term verilmemişse LEGACY davranış (yalnızca Pazartesi) korunur.
  const settingsForClosedDays = await readData();
  if (isWeeklyClosedDayForTerm(new Date(v.data.startAt), v.data.term, settingsForClosedDays.settings.termWeeklyClosedDays)) {
    return fail(
      "VALIDATION_ERROR",
      v.data.term
        ? `${v.data.term === "yaz" ? "Cumartesi/Pazar" : "Pazartesi"} bu dönemde okul kapalıdır — bu gün için ders planlanamaz.`
        : "Pazartesi okul kapalıdır — bu gün için ders planlanamaz."
    );
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
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "AI_AGENT", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(updateLessonScheduleSchema, input);
  if (!v.ok) return v;
  if (v.data.startAt) {
    // ÖNCELİK 4 (devam) — taşınan dersin KENDİ dönem etiketi esas alınır
    // (varsa); yoksa legacy (yalnızca Pazartesi) davranış korunur.
    const rescheduleData = await readData();
    const existing = rescheduleData.lessons.find((l) => l.id === v.data.lessonId);
    if (isWeeklyClosedDayForTerm(new Date(v.data.startAt), existing?.term, rescheduleData.settings.termWeeklyClosedDays)) {
      return fail(
        "VALIDATION_ERROR",
        existing?.term
          ? `${existing.term === "yaz" ? "Cumartesi/Pazar" : "Pazartesi"} bu dönemde okul kapalıdır — ders bu güne taşınamaz.`
          : "Pazartesi okul kapalıdır — ders bu güne taşınamaz."
      );
    }
  }

  try {
    await updateLessonSchedule(v.data);
    const data = await readData();
    const lesson = data.lessons.find((l) => l.id === v.data.lessonId);
    if (!lesson) return fail("NOT_FOUND", "Ders bulunamadı");
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

  const v = parseOrFail(cancelLessonSchema, input);
  if (!v.ok) return v;

  try {
    await cancelLesson(v.data.lessonId);
    return ok({ lessonId: v.data.lessonId });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "cancelLesson failed");
  }
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
  const checks = checkSeriesOccurrences(data, v.data, occurrences);
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
    conflictCount: checks.filter((c) => !c.ok).length,
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
    const result = await addLessonSeries(params, { skipConflicts });
    if (!result.ok) return fail("CONFLICT", result.message, result.conflicts);

    // İş 4A — seri için TEK özet bildirim (oluşum başına DEĞİL, spam yok).
    // Aynı Türkçe cümle üretimi `previewLessonSeriesTool` ile PAYLAŞILIR
    // (buildSeriesPreviewText) — ikinci bir metin şablonu icat edilmedi.
    if (result.createdLessonIds.length > 0) {
      const data = await readData();
      const student = data.students.find((s) => s.id === v.data.studentId);
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
    return fail("NOT_FOUND", e instanceof Error ? e.message : "createLessonSeries failed");
  }
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
 * Bir öğretmenin verilen dönem için hakediş dökümünü hesaplar — hiçbir
 * kayıt yazmaz (yalnızca önizleme). Yalnızca `lesson.teacherId` ile
 * filtreler; `Teacher.branchId` ile ek filtre uygulamaz.
 */
export async function computeTeacherPayoutTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<TeacherEarningsResult>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

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
  return ok(result);
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

  const v = parseOrFail(createTeacherPayoutSchema, input);
  if (!v.ok) return v;

  try {
    const result = await createTeacherPayout(v.data.teacherId, v.data.periodStart, v.data.periodEnd);
    if (!result.ok) {
      const code = result.code === "MISSING_FEE_RULE" ? "VALIDATION_ERROR" : "CONFLICT";
      const details = result.code === "MISSING_FEE_RULE" ? result.missingFeeRuleLessonIds : undefined;
      return fail(code, result.message, details);
    }
    return ok({ payout: result.payout });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "createTeacherPayout failed");
  }
}

/** Bekleyen bir hakedişi ödendi olarak işaretler. Tutarı asla değiştirmez. */
export async function markTeacherPayoutPaidTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ payout: TeacherPayout }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(markTeacherPayoutPaidSchema, input);
  if (!v.ok) return v;

  try {
    const result = await markTeacherPayoutPaid(v.data.payoutId, v.data.method);
    if (!result.ok) {
      const code = result.code === "NOT_FOUND" ? "NOT_FOUND" : "CONFLICT";
      return fail(code, result.message);
    }
    return ok({ payout: result.payout });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "markTeacherPayoutPaid failed");
  }
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

    let scanned = 0;
    let casesUpserted = 0;
    let notificationsCreated = 0;

    for (const payment of data.payments) {
      if (payment.status !== "overdue") continue;
      scanned++;

      const student = data.students.find((s) => s.id === payment.studentId);
      if (!student || student.communicationOptOut) continue;

      const openCase = existingCases.find(
        (c) => c.paymentId === payment.id && c.status !== "paid" && c.status !== "lost"
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

  const isOwnChild = ctx.role === "PARENT" && canAccessStudent(ctx, v.data.studentId);
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
    audit(ctx, "school.collections_settings_update", "School", ctx.tenantId, v.data);
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
  ctx: ServiceContext
): Promise<ServiceResult<{ notifications: Notification[] }>> {
  try {
    const notifications = await listNotificationsForUser({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      studentId: ctx.studentId,
    });
    return ok({ notifications });
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

export async function createAnnouncementTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ announcementId: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(createAnnouncementSchema, input);
  if (!v.ok) return v;

  try {
    const announcement = await createAnnouncement({
      tenantId: ctx.tenantId,
      title: v.data.title,
      body: v.data.body,
      attachmentUrl: v.data.attachmentUrl,
      audienceType: v.data.audienceType,
      audienceRef: v.data.audienceRef as AnnouncementAudienceRef | undefined,
      status: v.data.status,
      pinned: v.data.pinned,
      publishAt: v.data.publishAt,
      expireAt: v.data.expireAt,
      createdBy: ctx.userId,
    });
    audit(ctx, "announcement.create", "Announcement", announcement.id, {
      audienceType: v.data.audienceType,
      status: announcement.status,
    });
    return ok({ announcementId: announcement.id });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "createAnnouncement failed");
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
    const updated = await updateAnnouncementStatus(ctx.tenantId, v.data.announcementId, v.data.status);
    if (!updated) return fail("NOT_FOUND", "Duyuru bulunamadı");
    audit(ctx, "announcement.status_update", "Announcement", v.data.announcementId, {
      status: v.data.status,
    });
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
    const [data, all] = await Promise.all([readData(), listAnnouncements(ctx.tenantId)]);
    const recipient = { role: ctx.role, userId: ctx.userId, teacherId: ctx.teacherId, studentId: ctx.studentId };
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
  const access = assertStudentAccess(ctx, student, v.data.studentId);
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
    const data = await readData();
    const student = data.students.find((s) => s.id === v.data.studentId);
    const access = assertStudentAccess(ctx, student, v.data.studentId);
    if (!access.ok) return fail(access.code, access.message);

    const assessments = await listAssessmentsForStudent(ctx.tenantId, v.data.studentId);
    return ok({ assessments: assessments.map((a) => stripPrivateNoteForRecipient(a, ctx.role)) });
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
    const data = await readData();
    const student = data.students.find((s) => s.id === assessment.studentId);
    const access = assertStudentAccess(ctx, student, assessment.studentId);
    if (!access.ok) return fail(access.code, access.message);
    if (ctx.role === "TEACHER" && assessment.teacherId !== ctx.teacherId) {
      return fail("FORBIDDEN", "Bu kayda erişiminiz yok");
    }
    return ok({ assessment: stripPrivateNoteForRecipient(assessment, ctx.role) });
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
    const data = await readData();
    const student = data.students.find((s) => s.id === v.data.studentId);
    const access = assertStudentAccess(ctx, student, v.data.studentId);
    if (!access.ok) return fail(access.code, access.message);

    const assessments = await listAssessmentsForStudent(ctx.tenantId, v.data.studentId);
    const trend = computeTrend(assessments, 4);
    return ok({
      assessments: assessments.map((a) => stripPrivateNoteForRecipient(a, ctx.role)),
      trend,
    });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "getAssessmentReport failed");
  }
}

/**
 * EPIC 8 (IMPLEMENTATION_PLAN.md) — TEACHER yalnızca kendi dersini
 * başlatabilir/bitirebilir. Erken/geç başlatma toleransı bilinçli: planlanan
 * saatten ne kadar sapmış olursa olsun kabul edilir (bkz.
 * lesson-live-status.ts) — yalnızca dersin MEVCUT durumu geçişi engeller.
 */
export async function startLessonTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ lessonId: string; status: string }>> {
  const auth = requireRole(ctx, ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(startLessonSchema, input);
  if (!v.ok) return v;

  const data = await readData();
  const lesson = data.lessons.find((l) => l.id === v.data.lessonId);
  if (!lesson) return fail("NOT_FOUND", "Ders bulunamadı");
  if (ctx.role === "TEACHER" && lesson.teacherId !== ctx.teacherId) {
    return fail("FORBIDDEN", "Yalnızca kendi dersinizi başlatabilirsiniz.");
  }

  try {
    const result = await startLessonLive(v.data.lessonId);
    if (!result.ok) return fail("VALIDATION_ERROR", result.message);
    audit(ctx, "lesson.start", "Lesson", v.data.lessonId, {});
    return ok({ lessonId: v.data.lessonId, status: result.lesson.status });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "startLesson failed");
  }
}

export async function endLessonTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ lessonId: string; status: string }>> {
  const auth = requireRole(ctx, ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(endLessonSchema, input);
  if (!v.ok) return v;

  const data = await readData();
  const lesson = data.lessons.find((l) => l.id === v.data.lessonId);
  if (!lesson) return fail("NOT_FOUND", "Ders bulunamadı");
  if (ctx.role === "TEACHER" && lesson.teacherId !== ctx.teacherId) {
    return fail("FORBIDDEN", "Yalnızca kendi dersinizi bitirebilirsiniz.");
  }

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

/**
 * EPIC 9 (IMPLEMENTATION_PLAN.md) — TEACHER kendi müsaitliği için bir öneri
 * oluşturur; `Teacher.availability` bu çağrıyla DEĞİŞMEZ, yalnızca onay
 * bekleyen bir kayıt eklenir (bkz. reviewTeacherAvailabilityRequestTool).
 */
export async function proposeTeacherAvailabilityTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ requestId: string }>> {
  const auth = requireRole(ctx, ["TEACHER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  if (!ctx.teacherId) return fail("FORBIDDEN", "Öğretmen kimliği bulunamadı.");

  // Arşivlenmiş/pasif öğretmen yeni müsaitlik önerisi gönderemez — mevcut
  // "arşiv öğretmene yeni atama/değişiklik yapılamaz" kısıtıyla tutarlı
  // (bkz. TeacherArchiveAction dokümantasyonu).
  const dataForActiveCheck = await readData();
  const teacherRecord = dataForActiveCheck.teachers.find((t) => t.id === ctx.teacherId);
  if (teacherRecord && !teacherRecord.active) {
    return fail("FORBIDDEN", "Arşivlenmiş öğretmen için müsaitlik önerisi oluşturulamaz.");
  }

  const v = parseOrFail(proposeTeacherAvailabilitySchema, input);
  if (!v.ok) return v;

  try {
    const request = await createAvailabilityRequest({
      tenantId: ctx.tenantId,
      teacherId: ctx.teacherId,
      proposedAvailability: v.data.proposedAvailability,
      exceptions: v.data.exceptions,
    });
    audit(ctx, "teacher.availability_request.create", "TeacherAvailabilityRequest", request.id, {
      teacherId: ctx.teacherId,
    });
    return ok({ requestId: request.id });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "proposeTeacherAvailability failed");
  }
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
      const data = await readData();
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

  try {
    const homework = await createHomework({
      tenantId: ctx.tenantId,
      teacherId: ctx.teacherId!,
      studentId: v.data.studentId,
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

/** Öğrencinin kendi ödevleri — STUDENT/PARENT kendi çocuğu, TEACHER kendi öğrencisi, admin herkes. */
export async function listHomeworkForStudentTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ homework: Homework[] }>> {
  const v = parseOrFail(z.object({ studentId: z.string().min(1) }), input);
  if (!v.ok) return v;

  try {
    const data = await readData();
    const student = data.students.find((s) => s.id === v.data.studentId);
    const access = assertStudentAccess(ctx, student, v.data.studentId);
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
    const data = await readData();
    const student = data.students.find((s) => s.id === homework.studentId);
    const access = assertStudentAccess(ctx, student, homework.studentId);
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
    const data = await readData();
    const student = data.students.find((s) => s.id === submission.studentId);
    const access = assertStudentAccess(ctx, student, submission.studentId);
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
    const data = await readData();
    const student = data.students.find((s) => s.id === homework.studentId);
    const access = assertStudentAccess(ctx, student, homework.studentId);
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
    const data = await readData();
    const student = data.students.find((s) => s.id === v.data.studentId);
    const access = assertStudentAccess(ctx, student, v.data.studentId);
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
  } else if (ctx.role === "PARENT" || ctx.role === "STUDENT") {
    if (!ctx.studentId) return fail("FORBIDDEN", "Bu materyale erişiminiz yok");
    const data = await readData();
    const student = data.students.find((s) => s.id === ctx.studentId);
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
  const auth = requireRole(ctx, ["PARENT", "STUDENT"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(submitTeacherFeedbackSchema, input);
  if (!v.ok) return v;

  // Fail-closed: ctx.studentId eksikse (beklenmez ama) hiçbir öğrenciye eşleşmez.
  if (!ctx.studentId || ctx.studentId !== v.data.studentId) {
    return fail("FORBIDDEN", "Yalnızca kendi çocuğunuz/kendiniz için geri bildirim gönderebilirsiniz.");
  }

  const data = await readData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı");

  try {
    const { feedback, updated } = await submitTeacherFeedback({
      tenantId: ctx.tenantId,
      teacherId: student.teacherId,
      studentId: v.data.studentId,
      submittedBy: ctx.userId,
      submitterRole: ctx.role,
      scores: v.data.scores,
      continueWithTeacher: v.data.continueWithTeacher,
      comment: v.data.comment,
    });
    audit(ctx, updated ? "teacher_feedback.update" : "teacher_feedback.submit", "TeacherFeedback", feedback.id, {
      teacherId: student.teacherId,
    });
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
  const auth = requireRole(ctx, ["PARENT", "STUDENT"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(z.object({ studentId: z.string().min(1), teacherId: z.string().min(1) }), input);
  if (!v.ok) return v;

  if (!ctx.studentId || ctx.studentId !== v.data.studentId) {
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

    const data = await readData();
    const student = data.students.find((s) => s.id === feedback.studentId);

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

export async function resetDemoTool(
  ctx: ServiceContext
): Promise<ServiceResult<{ reset: true }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
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
  const actor = "user_admin";
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
    assigneeId: "user_admin",
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
    assigneeId: "user_admin",
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
    assigneeId: "user_admin",
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

/** TEACHER kendi öğrencisine müfredat konusu ekler. */
export async function createCurriculumTopicTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ topicId: string }>> {
  const auth = requireRole(ctx, ["TEACHER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  if (!ctx.teacherId) return fail("FORBIDDEN", "Öğretmen kimliği bulunamadı.");

  const v = parseOrFail(createCurriculumTopicSchema, input);
  if (!v.ok) return v;

  const data = await readData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  const access = assertStudentAccess(ctx, student, v.data.studentId);
  if (!access.ok) return fail(access.code, access.message);

  try {
    const topic = await createCurriculumTopic({
      tenantId: ctx.tenantId,
      studentId: v.data.studentId,
      teacherId: ctx.teacherId,
      title: v.data.title,
      description: v.data.description,
      status: v.data.status,
      progressPercent: v.data.progressPercent,
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

/** TEACHER kendi öğrencisinin konusunu günceller. */
export async function updateCurriculumTopicTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ topicId: string }>> {
  const auth = requireRole(ctx, ["TEACHER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  if (!ctx.teacherId) return fail("FORBIDDEN", "Öğretmen kimliği bulunamadı.");

  const v = parseOrFail(updateCurriculumTopicSchema, input);
  if (!v.ok) return v;

  const existing = await getCurriculumTopic(ctx.tenantId, v.data.topicId);
  if (!existing) return fail("NOT_FOUND", "Konu bulunamadı");
  if (existing.teacherId !== ctx.teacherId) {
    return fail("FORBIDDEN", "Yalnızca kendi oluşturduğunuz konuları güncelleyebilirsiniz.");
  }

  const data = await readData();
  const student = data.students.find((s) => s.id === existing.studentId);
  const access = assertStudentAccess(ctx, student, existing.studentId);
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
      progressPercent: patch.progressPercent,
    });
    return ok({ topicId });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "updateCurriculumTopic failed");
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
    const data = await readData();
    const student = data.students.find((s) => s.id === v.data.studentId);
    const access = assertStudentAccess(ctx, student, v.data.studentId);
    if (!access.ok) return fail(access.code, access.message);

    const topics = await listCurriculumTopicsForStudent(ctx.tenantId, v.data.studentId);
    const overallPercent = computeOverallCurriculumProgress(topics);
    const progressExplanation =
      topics.length === 0
        ? "Henüz konu tanımlanmadı; genel ilerleme 0%."
        : `Genel ilerleme, ${topics.length} konunun progressPercent değerlerinin aritmetik ortalamasıdır (eşit ağırlık).`;

    if (ctx.role === "PARENT" || ctx.role === "STUDENT") {
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
    const data = await readData();
    const student = data.students.find((s) => s.id === v.data.studentId);
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

  try {
    const { roomId, active, ...patch } = v.data;
    const updated = await updateRoom(roomId, {
      ...patch,
      ...(active !== undefined
        ? { active, archivedAt: active ? undefined : new Date().toISOString() }
        : {}),
    });
    if (!updated) return fail("NOT_FOUND", "Oda bulunamadı");
    audit(ctx, active === false ? "room.archive" : active === true ? "room.restore" : "room.update", "Room", roomId, patch);
    return ok({ roomId });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "updateRoom failed");
  }
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
    entity: z.enum(["student", "teacher"]),
    entityId: z.string().min(1),
  }), input);
  if (!v.ok) return v;
  const data = await readData();
  const entity =
    v.data.entity === "student"
      ? data.students.find((s) => s.id === v.data.entityId)
      : data.teachers.find((t) => t.id === v.data.entityId);
  if (!entity || !("nationalIdCipher" in entity) || !entity.nationalIdCipher) {
    return fail("NOT_FOUND", "Kimlik kaydı yok");
  }
  try {
    const { decryptNationalId } = await import("../pii");
    const nationalId = decryptNationalId(entity.nationalIdCipher as string);
    audit(ctx, "pii.national_id.reveal", v.data.entity === "student" ? "Student" : "Teacher", v.data.entityId, {});
    return ok({
      nationalId,
      masked: maskNationalId((entity as { nationalIdLast2?: string }).nationalIdLast2),
    });
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
  const sched = assertSchedulableDate(v.data.startAt, []);
  if (!sched.ok) return fail("VALIDATION_ERROR", sched.message);
  if (ctx.role === "TEACHER" && v.data.teacherId !== ctx.teacherId) {
    return fail("FORBIDDEN", "Yalnızca kendi deneme dersinizi planlayabilirsiniz.");
  }
  const start = new Date(v.data.startAt);
  const end = new Date(start.getTime() + v.data.durationMinutes * 60_000);
  try {
    const trial = await createTrialLesson({
      tenantId: ctx.tenantId,
      name: v.data.name,
      phone: v.data.phone,
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
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  try {
    let trials = await listTrialLessons(ctx.tenantId);
    if (ctx.role === "TEACHER" && ctx.teacherId) {
      trials = trials.filter((t) => t.teacherId === ctx.teacherId);
    }
    return ok({ trials });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "listTrial failed");
  }
}

export async function updateTrialLessonStatusTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ trialId: string; status: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(updateTrialLessonStatusSchema, input);
  if (!v.ok) return v;
  const existing = await getTrialLesson(ctx.tenantId, v.data.trialId);
  if (!existing) return fail("NOT_FOUND", "Deneme bulunamadı");
  if (ctx.role === "TEACHER" && existing.teacherId !== ctx.teacherId) {
    return fail("FORBIDDEN", "Yetkiniz yok");
  }
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

  const data = await readData();

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
  const nowTr = new Date().toLocaleDateString("tr-TR");
  const autoFields: Record<string, string> = {
    // Legacy düz anahtarlar (mevcut varsayılan şablonlar bunları kullanıyor — bozmuyoruz).
    date: nowTr,
    studentName: student?.name ?? "",
    parentName: student?.parentName ?? "",
    branchName: branch?.name ?? "",
    educationMethod: student?.educationMethod ?? "",
    enrollmentDate: student?.enrollmentStartDate
      ? new Date(student.enrollmentStartDate).toLocaleDateString("tr-TR")
      : "",
    paymentPlan: student?.paymentMethod
      ? `${student.paymentMethod} · ${student.paymentAmount ?? student.monthlyFee} ₺ · gün ${student.paymentDueDay ?? "—"}`
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
    "student.birthDate": student?.birthDate ? new Date(student.birthDate).toLocaleDateString("tr-TR") : "",
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

/** Evrak detay ekranı + imzalı dosya servis rotası — SCHOOL_ADMIN/SUPER_ADMIN. */
export async function getDocumentInstanceTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ document: DocumentInstance }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(z.object({ documentId: z.string().min(1) }), input);
  if (!v.ok) return v;
  try {
    const { getDocumentInstance } = await import("../documents");
    const document = await getDocumentInstance(ctx.tenantId, v.data.documentId);
    if (!document) return fail("NOT_FOUND", "Belge bulunamadı");
    return ok({ document });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "getDocument failed");
  }
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
  const data = await readData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  const access = assertStudentAccess(ctx, student, v.data.studentId);
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

/** Evraklar Merkezi ana tablosu — kurumun tüm evrakları, isteğe bağlı filtrelerle. */
export async function listDocumentInstancesTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ documents: Awaited<ReturnType<typeof listDocumentInstances>> }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(documentInstanceFiltersSchema, input);
  if (!v.ok) return v;
  try {
    const documents = await listDocumentInstances(ctx.tenantId, v.data as DocumentInstanceFilters);
    return ok({ documents });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "listDocumentInstances failed");
  }
}

/** Silme yok — arşivleme durumu "İptal Edildi"ye geçirir. */
export async function archiveDocumentInstanceTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ documentId: string; status: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(z.object({ documentId: z.string().min(1) }), input);
  if (!v.ok) return v;
  try {
    const doc = await archiveDocumentInstance(ctx.tenantId, v.data.documentId);
    if (!doc) return fail("NOT_FOUND", "Belge bulunamadı");
    audit(ctx, "document.archive", "DocumentInstance", doc.id, {});
    return ok({ documentId: doc.id, status: doc.status });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "archiveDocument failed");
  }
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
  let byteLength = 0;
  try {
    byteLength = Buffer.from(input.fileData, "base64").length;
  } catch {
    return { ok: false, message: "Dosya verisi okunamadı." };
  }
  if (byteLength <= 0) return { ok: false, message: "Boş dosya yüklenemez." };
  if (byteLength > DOCUMENT_SIGNED_FILE_MAX_BYTES) return { ok: false, message: "Dosya çok büyük (maks. 2MB)." };
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

  const data = await readData();
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
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(deleteSignedDocumentVersionSchema, input);
  if (!v.ok) return v;

  try {
    const doc = await softDeleteSignedVersion(ctx.tenantId, v.data.documentId, v.data.versionId);
    if (!doc) return fail("NOT_FOUND", "Belge veya sürüm kaydı bulunamadı.");
    audit(ctx, "document.signed_version_delete", "DocumentInstance", doc.id, { versionId: v.data.versionId });
    return ok({ documentId: doc.id, status: doc.status });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "deleteSignedDocumentVersion failed");
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
  const data = await readData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  if (!student) return fail("NOT_FOUND", "Öğrenci yok");
  const settings = data.settings.collectionsSettings ?? { frequencyLimitDays: 3, autoSendEnabled: false };
  const r = resolveCollectionsIban(student.studentType, settings);
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
  }>
> {
  const auth = requireRole(ctx, ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(
    z.object({
      lessonId: z.string().min(1),
      flag: z.enum(["attended", "processed", "makeup", "absent", "excused"]),
      /** Kullanıcı, farklı bir statüden geçişi onay popup'ında ONAYLADIYSA true. */
      confirmSwitch: z.boolean().optional(),
    }),
    input
  );
  if (!v.ok) return v;

  const data = await readData();
  const lesson = data.lessons.find((l) => l.id === v.data.lessonId);
  if (!lesson) return fail("NOT_FOUND", "Ders bulunamadı");
  if (ctx.role === "TEACHER" && lesson.teacherId !== ctx.teacherId) {
    return fail("FORBIDDEN", "Yalnızca kendi dersinizde işlem yapabilirsiniz.");
  }

  // ÖNCELİK 4 — Yoklama Takvimi: kapalı günde hiçbir yoklama/mali aksiyon
  // yapılamaz (manuel istisna > resmî tatil > dönem haftalık kuralı sırası).
  const student = data.students.find((s) => s.id === lesson.studentId);
  const term = student?.termType ?? "guz";
  const overrides = await listClosedDays(ctx.tenantId);
  const dayStatus = resolveDayStatus(new Date(lesson.startAt), term, overrides, data.settings.termWeeklyClosedDays);
  if (dayStatus.status === "closed") {
    return fail(
      "VALIDATION_ERROR",
      `Bu gün kapalı (${dayStatus.label}) — yoklama/tahsilat işlemi yapılamaz.`
    );
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
    const result = await switchLessonOpsFlagLive(v.data.lessonId, v.data.flag, ctx.userId);
    if (!result.ok) return fail("VALIDATION_ERROR", result.message);
    if (!result.alreadySet) {
      audit(ctx, `lesson.ops.${v.data.flag}`, "Lesson", v.data.lessonId, {
        flag: v.data.flag,
        switchedFrom: current !== v.data.flag ? current : undefined,
      });
    }
    return ok({
      lessonId: v.data.lessonId,
      flag: v.data.flag,
      alreadySet: result.alreadySet,
      message: result.message,
    });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "setLessonOpsFlag failed");
  }
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
  /** Nakit/Havale/Kredi Kartı — Payment.method varsa o, yoksa öğrencinin varsayılan ödeme yöntemi (tahmini olarak işaretlenir). */
  method?: string;
  methodIsStudentDefault: boolean;
  status: string;
  source: string;
};

export type AttendanceCalendarLessonOpsInfo = {
  lessonId: string;
  /** effectiveLessonOpsStatus(lesson) — İşlendi > Geldi > Telafi > Gelmedi > Mazeretli öncelikli, TEK statü; hiçbiri set değilse null. */
  opsStatus: "attended" | "processed" | "makeup" | "absent" | "excused" | null;
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

export async function getAttendanceCalendarMonthTool(
  ctx: ServiceContext,
  input: unknown
): Promise<
  ServiceResult<{
    year: number;
    month: number;
    term: string;
    days: Array<{
      date: string;
      status: string;
      reason: string;
      label: string;
      lessonIds: string[];
      /**
       * Kutu rengi (bkz. ATTENDANCE_CALENDAR_COLORS / resolveDayFillColor) —
       * o günün derslerinden effectiveLessonOpsStatus ile türetilen gerçek
       * Geldi/İşlendi/Telafi statüleri. Önceden bu bilgi takvime hiç
       * taşınmıyordu (yalnızca lessonIds dönüyordu) — UI kutu rengini
       * tahmin edemiyordu, sadece "planlı ders var" mavisini gösterebiliyordu.
       */
      lessons: AttendanceCalendarLessonOpsInfo[];
      payments: AttendanceCalendarLessonPaymentInfo[];
    }>;
  }>
> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "TEACHER", "SUPER_ADMIN", "AI_AGENT", "PARENT", "STUDENT"]);
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

  const data = await readData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  const access = assertStudentAccess(ctx, student, v.data.studentId);
  if (!access.ok) return fail(access.code, access.message);
  if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı");

  const term = student.termType ?? "guz";
  const overrides = await listClosedDays(ctx.tenantId);
  const { resolveMonthStatuses } = await import("../attendance-calendar");
  const statuses = resolveMonthStatuses(v.data.year, v.data.month, term, overrides, data.settings.termWeeklyClosedDays);

  const days = statuses.map((s) => {
    const dayLessons = data.lessons.filter((l) => l.studentId === student.id && l.startAt.slice(0, 10) === s.date);
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
          opsStatus: effectiveLessonOpsStatus(l),
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
        method: p.method ?? student.paymentMethod,
        methodIsStudentDefault: !p.method && !!student.paymentMethod,
        status: p.status,
        source: p.source ?? "manual",
      }));
    return { ...s, lessonIds, lessons, payments };
  });

  return ok({ year: v.data.year, month: v.data.month, term, days });
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
    }),
    input
  );
  if (!v.ok) return v;

  const data = await readData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı");

  try {
    // `dueDate`/`method` verilmezse (bu çağrıda değiştirilmek istenmiyorsa)
    // `upsertMonthlyPlanPayment`'a undefined geçilir — o da mevcut değeri
    // KORUR (aşağıya bkz. store implementasyonları); yalnızca verilenler
    // güncellenir. `markPaymentPaid`'in kendi "paidAt verilmezse şimdi"
    // varsayılanı, tahsilat ANI için ayrıca doğru davranıştır.
    const { paymentId } = await upsertMonthlyPlanPayment({
      studentId: v.data.studentId,
      month: v.data.month,
      amount: v.data.amount,
      dueDate: v.data.dueDate,
      method: v.data.method,
    });
    await markPaymentPaid(paymentId, {
      amount: v.data.amount,
      method: v.data.method,
      paidAt: v.data.dueDate,
      receivedByUserId: ctx.userId,
    });
    audit(ctx, "PAYMENT_COLLECTED_FROM_ATTENDANCE_CALENDAR", "Payment", paymentId, {
      studentId: v.data.studentId,
      month: v.data.month,
      amount: v.data.amount,
      method: v.data.method,
      dueDate: v.data.dueDate,
      receivedByUserId: ctx.userId,
    });
    return ok({ paymentId, studentId: v.data.studentId, month: v.data.month, amount: v.data.amount, status: "paid" });
  } catch (e) {
    return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "collectAttendanceCalendarPayment failed");
  }
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
  let byteLength = 0;
  try {
    byteLength = Buffer.from(input.fileData, "base64").length;
  } catch {
    return { ok: false, message: "Dosya verisi okunamadı." };
  }
  if (byteLength <= 0) return { ok: false, message: "Boş dosya yüklenemez." };
  if (byteLength > TASK_ATTACHMENT_MAX_BYTES) return { ok: false, message: "Dosya çok büyük (maks. 2MB)." };
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
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"]);
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
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"]);
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
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"]);
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
