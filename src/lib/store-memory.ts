import { applyLessonOpsFlag, switchLessonOpsFlag, type LessonOpsFlag } from "./lesson-ops";
import { allocateSequenceValue, formatDisplayId } from "./entity-sequence";
import { markTeacherAttendance, type TeacherAttendanceStatus } from "./teacher-attendance";
import { reassignLessonTeacherOrBranch, type ReassignLessonInput, type ReassignLessonResult } from "./lesson-reassignment";
/**
 * Serverless / demo memory store.
 * Process warm olduğu sürece veri kalır; cold start'ta seed yeniden yüklenir.
 */
import { createSeedData, createEmptyTemplateData } from "./seed";
import { tryTenantId } from "./tenant-context";
import { DEFAULT_TENANT_ID } from "./auth/config";
import type {
  AppData,
  Attendance,
  AttendanceStatus,
  Branch,
  CollectionsSettings,
  ConsentSettings,
  ContractInstallmentSnapshot,
  ContractInstallmentView,
  FeeRoundingMode,
  Instrument,
  Lesson,
  MakeupRequest,
  MakeupSlot,
  Payment,
  Room,
  Student,
  StudentProfilePatch,
  StudentPaymentPauseState,
  Teacher,
  TeacherFeeRule,
  TeacherProfilePatch,
} from "./types";
import {
  suggestMakeupSlots,
  confirmMakeupSlot,
  cancelMakeupData,
  validateLessonSlot,
  LessonSlotValidationError,
  type MakeupDecision,
} from "./makeup-engine";
import { applyLessonScheduleUpdate, applyLessonCancel } from "./lesson-update";
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
import { uid, isOutstandingPaymentStatus } from "./utils";
import { addDays, formatISO } from "date-fns";
import { withKeyLock } from "./keyed-lock";
import { calendarMonthKey, assertCanCreateMakeup, MakeupQuotaExceededError } from "./makeup-quota";

const g = globalThis as unknown as { __notaplanByTenant?: Record<string, AppData> };

function tenantKey(): string {
  return tryTenantId() ?? DEFAULT_TENANT_ID;
}

function load(): AppData {
  if (!g.__notaplanByTenant) g.__notaplanByTenant = {};
  const tid = tenantKey();
  if (!g.__notaplanByTenant[tid]) {
    const seed = createSeedData();
    seed.settings.tenantId = tid;
    g.__notaplanByTenant[tid] = seed;
  }
  const data = g.__notaplanByTenant[tid];
  if (data.settings.tenantId !== tid) {
    throw new Error("Cross-tenant access denied");
  }
  return data;
}

function save(data: AppData): AppData {
  const tid = tenantKey();
  if ((data.settings.tenantId || tid) !== tid) {
    throw new Error("Cross-tenant access denied");
  }
  data.settings.tenantId = tid;
  if (!g.__notaplanByTenant) g.__notaplanByTenant = {};
  g.__notaplanByTenant[tid] = data;
  return data;
}

export async function readData(): Promise<AppData> {
  return load();
}

export async function writeData(data: AppData): Promise<void> {
  save(data);
}

export async function mutateStoreUnderLock(
  fn: (data: AppData) => Promise<AppData>,
  onWriteFail?: () => Promise<void>
): Promise<AppData> {
  return withKeyLock(`memory-store:${tenantKey()}`, async () => {
    const next = await fn(load());
    try {
      return save(next);
    } catch (err) {
      if (onWriteFail) await onWriteFail();
      throw err;
    }
  });
}

export async function resetData(): Promise<AppData> {
  return save(createSeedData());
}

/** Kurulum Merkezi — boş şablona sıfırla (bkz. store.ts resetToCleanTemplate). */
export async function resetToCleanTemplate(): Promise<AppData> {
  const current = load();
  const template = createEmptyTemplateData();
  template.settings.tenantId = current.settings.tenantId;
  template.settings.name = current.settings.name;
  template.settings.shortName = current.settings.shortName;
  return save(template);
}

/** memory modunda tek bir işlem-içi kurum verisi vardır (bkz. store-json.ts'in aynı fonksiyonu). */
export async function listTenants(): Promise<{ tenantId: string; name: string }[]> {
  const data = load();
  return [{ tenantId: data.settings.tenantId, name: data.settings.name }];
}

export async function markAttendance(input: {
  lessonId: string;
  status: AttendanceStatus;
  reason?: string;
}): Promise<AppData> {
  // Acquire a keyed in-process lock per tenant:student:month to ensure
  // counting + mutate happen on a transient copy and are atomically saved.
    const preData = load();
    const preLesson = preData.lessons.find((l) => l.id === input.lessonId);
    if (!preLesson) throw new Error("Ders bulunamadı");
    const key = `${tenantKey()}:${calendarMonthKey(new Date().toISOString())}:${preLesson.studentId}`;

    return await withKeyLock(key, async () => {
      const data = load();
      const lesson = data.lessons.find((l) => l.id === input.lessonId);
      if (!lesson) throw new Error("Ders bulunamadı");
    // Nilüfer Acar politikası §3.5 — bilinçli olarak UYGULANMADI, bkz. store-json.ts aynı satır için yorum.
    const createsMakeupCredit =
      input.status === "absent" || input.status === "cancelled_by_school";

    const attendance: Attendance = {
      id: uid("att"),
      lessonId: input.lessonId,
      studentId: lesson.studentId,
      status: input.status,
      reason: input.reason,
      markedAt: new Date().toISOString(),
      createsMakeupCredit,
    };

    const filtered = data.attendances.filter((a) => a.lessonId !== input.lessonId);

    let lessonStatus: typeof lesson.status = lesson.status;
    if (input.status === "absent") lessonStatus = "no_show";
    if (input.status === "cancelled_by_school") lessonStatus = "cancelled";

    const lessons = data.lessons.map((l) => (l.id === input.lessonId ? { ...l, status: lessonStatus } : l));

    let makeupRequests = data.makeupRequests.filter((m) => m.sourceLessonId !== input.lessonId);

    if (createsMakeupCredit) {
      const quota = assertCanCreateMakeup({ ...data, makeupRequests }, lesson.studentId, new Date(), lesson.id);
      if (!quota.ok) throw new MakeupQuotaExceededError(quota.message);
      const branch = data.settings.branches.find((b) => b.id === lesson.branchId);
      const req: MakeupRequest = {
        id: uid("mk"),
        studentId: lesson.studentId,
        teacherId: lesson.teacherId,
        branchId: lesson.branchId,
        instrument: lesson.instrument,
        sourceLessonId: lesson.id,
        attendanceId: attendance.id,
        status: "pending",
        reason: input.reason || (input.status === "cancelled_by_school" ? "Okul iptali" : "Devamsızlık"),
        // §3.4 — 30 günlük telafi süresi ORİJİNAL kayıp ders tarihinden başlar, admin onay anından DEĞİL.
        expiresAt: formatISO(addDays(new Date(lesson.startAt), data.settings.makeupWindowDays)),
        suggestedSlots: [],
        createdAt: new Date().toISOString(),
        policyNote:
          input.status === "cancelled_by_school"
            ? `Okul kaynaklı iptal — öncelikli yerleştirme · ${branch?.shortName ?? ""}`
            : `${data.settings.makeupWindowDays} gün pencere · ${data.settings.monthlyMakeupAllowance ?? 2}/dönem hak · aynı öğretmen · ${branch?.shortName ?? ""}`,
      };
      makeupRequests = [...makeupRequests, req];
    }

    return save({
      ...data,
      lessons,
      attendances: [...filtered, attendance],
      makeupRequests,
    });
  });
}

export async function generateSuggestions(
  requestId: string,
  options?: { maxSlots?: number }
): Promise<AppData> {
  const data = load();
  const request = data.makeupRequests.find((m) => m.id === requestId);
  if (!request) throw new Error("Telafi talebi bulunamadı");

  const slots = suggestMakeupSlots(data, request, options);
  const makeupRequests = data.makeupRequests.map((m) =>
    m.id === requestId
      ? { ...m, status: "suggested" as const, suggestedSlots: slots }
      : m
  );
  return save({ ...data, makeupRequests });
}

export async function confirmSlot(
  requestId: string,
  slot: MakeupSlot,
  decision: MakeupDecision
): Promise<AppData> {
  const data = load();
  const { data: next } = confirmMakeupSlot(data, requestId, slot, decision);
  return save(next);
}

export async function cancelMakeup(requestId: string, decision: MakeupDecision): Promise<AppData> {
  const data = load();
  const { data: next } = cancelMakeupData(data, requestId, decision);
  return save(next);
}

export async function updateMakeupSlaEscalation(requestId: string, level: number): Promise<AppData> {
  const data = load();
  const makeupRequests = data.makeupRequests.map((m) =>
    m.id === requestId ? { ...m, slaEscalationLevel: level } : m
  );
  return save({ ...data, makeupRequests });
}

function assertBranchExists(data: AppData, branchId: string) {
  if (!data.settings.branches.some((b) => b.id === branchId)) {
    throw new Error("Şube bulunamadı");
  }
}

export async function addBranch(branch: Omit<Branch, "id">): Promise<AppData> {
  const data = load();
  const b: Branch = { ...branch, id: uid("branch") };
  return save({
    ...data,
    settings: { ...data.settings, branches: [...data.settings.branches, b] },
  });
}

export async function updateBranch(
  branchId: string,
  patch: Partial<Omit<Branch, "id">>
): Promise<AppData> {
  const data = load();
  assertBranchExists(data, branchId);
  const branches = data.settings.branches.map((b) => (b.id === branchId ? { ...b, ...patch } : b));
  return save({ ...data, settings: { ...data.settings, branches } });
}

export async function addStudent(
  student: Omit<Student, "id" | "createdAt" | "active">
): Promise<AppData> {
  const data = load();
  assertBranchExists(data, student.branchId);
  const { assigned, records } = allocateSequenceValue(data.entitySequences ?? [], DEFAULT_TENANT_ID, "student");
  const s: Student = {
    ...student,
    id: uid("stu"),
    active: true,
    createdAt: new Date().toISOString(),
    displayId: formatDisplayId("student", assigned),
  };
  return save({ ...data, students: [...data.students, s], entitySequences: records });
}

export async function updateStudentProfile(
  studentId: string,
  patch: StudentProfilePatch
): Promise<AppData> {
  const data = load();
  if (!data.students.some((s) => s.id === studentId)) throw new Error("Öğrenci bulunamadı");
  const students = data.students.map((s) => (s.id === studentId ? { ...s, ...patch } : s));
  return save({ ...data, students });
}

/** Nilüfer Acar politikası §1E — bkz. store-json.ts aynı adlı fonksiyon (aynı davranış, in-memory). */
export async function setStudentPaymentPause(studentId: string, state: StudentPaymentPauseState): Promise<AppData> {
  const data = load();
  if (!data.students.some((s) => s.id === studentId)) throw new Error("Öğrenci bulunamadı");
  const students = data.students.map((s) =>
    s.id === studentId
      ? {
          ...s,
          paymentPauseStatus: state ? ("paused" as const) : undefined,
          paymentPausedAt: state?.pausedAt,
          paymentPauseReason: state?.reason,
          paymentPausedBy: state?.pausedBy,
        }
      : s
  );
  return save({ ...data, students });
}

export async function addTeacher(
  teacher: Omit<Teacher, "id" | "active" | "color">
): Promise<AppData> {
  const data = load();
  assertBranchExists(data, teacher.branchId);
  const colors = ["#7c3aed", "#0891b2", "#db2777", "#ea580c", "#059669", "#4f46e5"];
  const { assigned, records } = allocateSequenceValue(data.entitySequences ?? [], DEFAULT_TENANT_ID, "teacher");
  const t: Teacher = {
    ...teacher,
    id: uid("tch"),
    active: true,
    color: colors[data.teachers.length % colors.length],
    displayId: formatDisplayId("teacher", assigned),
  };
  return save({ ...data, teachers: [...data.teachers, t], entitySequences: records });
}

export async function updateTeacherAvailability(
  teacherId: string,
  availability: Teacher["availability"]
): Promise<Teacher | null> {
  const data = load();
  const idx = data.teachers.findIndex((t) => t.id === teacherId);
  if (idx === -1) return null;
  const updated: Teacher = { ...data.teachers[idx], availability };
  const teachers = [...data.teachers];
  teachers[idx] = updated;
  save({ ...data, teachers });
  return updated;
}

/** ÖNCELİK 4 (devam) — çoklu enstrüman+seviye düzenleme (öğretmen detayı). */
export async function updateTeacherInstruments(
  teacherId: string,
  instruments: Teacher["instruments"],
  instrumentLevels: Teacher["instrumentLevels"]
): Promise<Teacher | null> {
  const data = load();
  const idx = data.teachers.findIndex((t) => t.id === teacherId);
  if (idx === -1) return null;
  const updated: Teacher = { ...data.teachers[idx], instruments, instrumentLevels };
  const teachers = [...data.teachers];
  teachers[idx] = updated;
  save({ ...data, teachers });
  return updated;
}

/** Package D — özlük/idari alanlar + ek şube ataması. `updateStudentProfile` ile aynı desen. */
export async function updateTeacherProfile(
  teacherId: string,
  patch: TeacherProfilePatch
): Promise<Teacher | null> {
  const data = load();
  const idx = data.teachers.findIndex((t) => t.id === teacherId);
  if (idx === -1) return null;
  const updated: Teacher = { ...data.teachers[idx], ...patch };
  const teachers = [...data.teachers];
  teachers[idx] = updated;
  save({ ...data, teachers });
  return updated;
}

export type MarkPaymentPaidOptions = {
  method?: string;
  amount?: number;
  paidAt?: string;
  paymentNote?: string;
  /** Tahsilatı alan kullanıcı — bkz. Payment.receivedByUserId yorumu. */
  receivedByUserId?: string;
};

export async function markPaymentPaid(paymentId: string, opts?: string | MarkPaymentPaidOptions): Promise<AppData> {
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

export async function updatePayment(paymentId: string, patch: UpdatePaymentPatch): Promise<AppData> {
  const data = load();
  const payments: Payment[] = data.payments.map((p) => {
    if (p.id !== paymentId) return p;
    return {
      ...p,
      ...(patch.method !== undefined ? { method: patch.method } : {}),
      ...(patch.paidAmount !== undefined ? { paidAmount: patch.paidAmount } : {}),
      ...(patch.paymentNote !== undefined ? { paymentNote: patch.paymentNote } : {}),
      ...(patch.paidAt !== undefined ? { paidAt: patch.paidAt } : {}),
    };
  });
  return save({ ...data, payments });
}

export async function addRoom(room: Omit<Room, "id">): Promise<AppData> {
  const data = load();
  assertBranchExists(data, room.branchId);
  const r: Room = { ...room, id: uid("room") };
  return save({ ...data, rooms: [...data.rooms, r] });
}

export async function updateRoom(
  roomId: string,
  patch: Partial<Pick<Room, "name" | "capacity" | "branchId" | "instruments" | "active" | "archivedAt">>
): Promise<Room | null> {
  const data = load();
  const idx = data.rooms.findIndex((r) => r.id === roomId);
  if (idx === -1) return null;
  const updated: Room = { ...data.rooms[idx], ...patch };
  const rooms = [...data.rooms];
  rooms[idx] = updated;
  save({ ...data, rooms });
  return updated;
}

export async function archiveTeacher(teacherId: string, archived: boolean): Promise<Teacher | null> {
  const data = load();
  const idx = data.teachers.findIndex((t) => t.id === teacherId);
  if (idx === -1) return null;
  const updated: Teacher = {
    ...data.teachers[idx],
    active: !archived,
    archivedAt: archived ? new Date().toISOString() : undefined,
  };
  const teachers = [...data.teachers];
  teachers[idx] = updated;
  save({ ...data, teachers });
  return updated;
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
  allowAvailabilityOverride?: boolean;
  overriddenByUserId?: string;
}): Promise<AppData> {
  const data = load();
  const validation = validateLessonSlot(
    data,
    { instrument: input.instrument, studentId: input.studentId },
    { teacherId: input.teacherId, roomId: input.roomId, startAt: input.startAt },
    { durationMinutes: input.durationMinutes, allowAvailabilityOverride: input.allowAvailabilityOverride }
  );
  if (!validation.ok) throw new LessonSlotValidationError(validation.code, validation.message);
  const slot = validation.slot;
  const lesson: Lesson = {
    id: uid("les"),
    studentId: input.studentId,
    teacherId: slot.teacherId,
    roomId: slot.roomId,
    branchId: slot.branchId,
    instrument: input.instrument,
    startAt: slot.startAt,
    endAt: slot.endAt,
    type: "regular",
    status: "scheduled",
    term: input.term,
    academicYearStart: input.academicYearStart,
    availabilityOverride:
      slot.availabilityOverridden && input.overriddenByUserId
        ? { by: input.overriddenByUserId, at: new Date().toISOString() }
        : undefined,
  };
  return save({ ...data, lessons: [...data.lessons, lesson] });
}

export async function updateLessonSchedule(input: {
  lessonId: string;
  startAt?: string;
  durationMinutes?: number;
}): Promise<AppData> {
  const data = load();
  const result = applyLessonScheduleUpdate(data, input);
  if (!result.ok) throw new Error(result.message);
  return save(result.data);
}

export async function cancelLesson(lessonId: string): Promise<AppData> {
  const data = load();
  const result = applyLessonCancel(data, lessonId);
  if (!result.ok) throw new Error(result.message);
  return save(result.data);
}

export async function startLessonLive(lessonId: string): Promise<LessonLiveUpdateResult> {
  const data = load();
  const result = applyStartLesson(data, lessonId);
  if (result.ok) save(result.data);
  return result;
}

export async function endLessonLive(lessonId: string): Promise<LessonLiveUpdateResult> {
  const data = load();
  const result = applyEndLesson(data, lessonId);
  if (result.ok) save(result.data);
  return result;
}

export async function correctLessonTimesLive(
  lessonId: string,
  correction: LessonTimeCorrection
): Promise<LessonLiveUpdateResult> {
  const data = load();
  const result = applyCorrectLessonTimes(data, lessonId, correction);
  if (result.ok) save(result.data);
  return result;
}

function assertLessonSeriesRefsExist(data: AppData, params: SeriesParams) {
  if (!data.students.some((s) => s.id === params.studentId)) throw new Error("Öğrenci bulunamadı");
  if (!data.teachers.some((t) => t.id === params.teacherId)) throw new Error("Öğretmen bulunamadı");
  if (!data.rooms.some((r) => r.id === params.roomId)) throw new Error("Oda bulunamadı");
  if (!data.settings.branches.some((b) => b.id === params.branchId)) throw new Error("Şube bulunamadı");
}

export async function addLessonSeries(
  params: SeriesParams,
  options?: { skipConflicts?: boolean; allowAvailabilityOverride?: boolean; overriddenByUserId?: string }
): Promise<CreateSeriesResult> {
  const data = load();
  assertLessonSeriesRefsExist(data, params);
  const result = createLessonSeriesData(data, params, options);
  if (result.ok) save(result.data);
  return result;
}

export async function cancelLessonSeriesFromLesson(lessonId: string): Promise<SeriesCancelResult> {
  const data = load();
  const result = cancelSeriesFromLesson(data, lessonId);
  if (result.ok) save(result.data);
  return result;
}

export async function cancelEntireLessonSeries(seriesId: string): Promise<SeriesCancelResult> {
  const data = load();
  const result = cancelEntireSeries(data, seriesId);
  if (result.ok) save(result.data);
  return result;
}

function assertTeacherExists(data: AppData, teacherId: string) {
  if (!data.teachers.some((t) => t.id === teacherId)) throw new Error("Öğretmen bulunamadı");
}

export async function addTeacherFeeRule(input: FeeRuleInput): Promise<FeeRuleMutationResult> {
  const data = load();
  assertTeacherExists(data, input.teacherId);
  const result = createTeacherFeeRuleData(data, input);
  if (result.ok) save(result.data);
  return result;
}

export async function addPackage(input: PackageInput): Promise<PackageMutationResult> {
  const data = load();
  const result = createPackageData(data, input);
  if (result.ok) save(result.data);
  return result;
}

export async function updatePackage(packageId: string, patch: PackagePatch): Promise<PackageMutationResult> {
  const data = load();
  const result = updatePackageData(data, packageId, patch);
  if (result.ok) save(result.data);
  return result;
}

export async function addDiscountCampaign(input: DiscountCampaignInput): Promise<DiscountCampaignMutationResult> {
  const data = load();
  const result = createDiscountCampaignData(data, input);
  if (result.ok) save(result.data);
  return result;
}

export async function updateDiscountCampaign(
  campaignId: string,
  patch: DiscountCampaignPatch
): Promise<DiscountCampaignMutationResult> {
  const data = load();
  const result = updateDiscountCampaignData(data, campaignId, patch);
  if (result.ok) save(result.data);
  return result;
}

export async function updateTeacherFeeRule(
  ruleId: string,
  patch: Partial<Omit<TeacherFeeRule, "id" | "createdAt">>
): Promise<FeeRuleMutationResult> {
  const data = load();
  const result = updateTeacherFeeRuleData(data, ruleId, patch);
  if (result.ok) save(result.data);
  return result;
}

export async function createTeacherPayout(
  teacherId: string,
  periodStart: string,
  periodEnd: string,
  paymentMethodOverride?: TeacherPayoutPaymentMethod
): Promise<CreateTeacherPayoutResult> {
  const data = load();
  assertTeacherExists(data, teacherId);
  const result = createTeacherPayoutSnapshot(data, teacherId, periodStart, periodEnd, new Date(), paymentMethodOverride);
  if (result.ok) save(result.data);
  return result;
}

export async function updateTeacherPayoutPaymentMethod(
  payoutId: string,
  method: TeacherPayoutPaymentMethod
): Promise<UpdateTeacherPayoutPaymentMethodResult> {
  const data = load();
  const result = updateTeacherPayoutPaymentMethodData(data, payoutId, method);
  if (result.ok) save(result.data);
  return result;
}

export async function markTeacherPayoutPaid(
  payoutId: string,
  method?: string
): Promise<MarkPayoutPaidResult> {
  const data = load();
  const result = markTeacherPayoutPaidData(data, payoutId, method);
  if (result.ok) save(result.data);
  return result;
}

export async function updateFeeRoundingMode(feeRoundingMode: FeeRoundingMode): Promise<AppData> {
  const data = load();
  return save({ ...data, settings: { ...data.settings, feeRoundingMode } });
}

export async function updateMonthlyMakeupAllowance(monthlyMakeupAllowance: number): Promise<AppData> {
  const data = load();
  return save({ ...data, settings: { ...data.settings, monthlyMakeupAllowance } });
}

export async function updateMakeupWindowDays(makeupWindowDays: number): Promise<AppData> {
  const data = load();
  return save({ ...data, settings: { ...data.settings, makeupWindowDays } });
}

export async function updateCollectionsSettings(
  collectionsSettings: CollectionsSettings
): Promise<AppData> {
  const data = load();
  return save({ ...data, settings: { ...data.settings, collectionsSettings } });
}

export async function updateTermWeeklyClosedDays(
  termWeeklyClosedDays: { guz: number[]; yaz: number[] }
): Promise<AppData> {
  const data = load();
  return save({ ...data, settings: { ...data.settings, termWeeklyClosedDays } });
}

export async function updateConsentSettings(consentSettings: ConsentSettings): Promise<AppData> {
  const data = load();
  return save({ ...data, settings: { ...data.settings, consentSettings } });
}

const TEACHER_COLORS = ["#7c3aed", "#0891b2", "#db2777", "#ea580c", "#059669", "#4f46e5"];

export async function importBranches(rows: BranchImportRow[]): Promise<ImportCommitResult> {
  const data = load();
  const branches = [...data.settings.branches];
  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const idx = branches.findIndex((b) => b.shortName.trim().toLowerCase() === row.shortName.trim().toLowerCase());
    if (idx >= 0) {
      branches[idx] = { ...branches[idx], ...row };
      updated++;
    } else {
      branches.push({ ...row, id: uid("branch") });
      created++;
    }
  }
  const next = save({ ...data, settings: { ...data.settings, branches } });
  return { data: next, created, updated };
}

export async function importTeachers(rows: TeacherImportRow[]): Promise<ImportCommitResult> {
  const data = load();
  const teachers = [...data.teachers];
  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const idx = teachers.findIndex((t) => t.email.trim().toLowerCase() === row.email.trim().toLowerCase());
    const instruments = row.instrumentLevels?.length
      ? Array.from(new Set(row.instrumentLevels.map((r) => r.instrument)))
      : [row.instrument];
    if (idx >= 0) {
      teachers[idx] = {
        ...teachers[idx],
        name: row.name,
        phone: row.phone,
        branchId: row.branchId,
        instruments,
        instrumentLevels: row.instrumentLevels ?? teachers[idx].instrumentLevels,
        highSchool: row.highSchool ?? teachers[idx].highSchool,
        university: row.university ?? teachers[idx].university,
        graduationYear: row.graduationYear ?? teachers[idx].graduationYear,
        contractStartDate: row.contractStartDate ?? teachers[idx].contractStartDate,
        contractEndDate: row.contractEndDate ?? teachers[idx].contractEndDate,
      };
      updated++;
    } else {
      teachers.push({
        id: uid("tch"),
        name: row.name,
        email: row.email,
        phone: row.phone,
        branchId: row.branchId,
        instruments,
        instrumentLevels: row.instrumentLevels,
        availability: [
          { dayOfWeek: 1, start: "10:00", end: "18:00" },
          { dayOfWeek: 2, start: "10:00", end: "18:00" },
          { dayOfWeek: 3, start: "10:00", end: "18:00" },
          { dayOfWeek: 4, start: "10:00", end: "18:00" },
          { dayOfWeek: 5, start: "10:00", end: "16:00" },
        ],
        maxDailyLessons: 8,
        active: true,
        color: TEACHER_COLORS[teachers.length % TEACHER_COLORS.length],
        highSchool: row.highSchool,
        university: row.university,
        graduationYear: row.graduationYear,
        contractStartDate: row.contractStartDate,
        contractEndDate: row.contractEndDate,
      });
      created++;
    }
  }
  const next = save({ ...data, teachers });
  return { data: next, created, updated };
}

export async function importRooms(rows: RoomImportRow[]): Promise<ImportCommitResult> {
  const data = load();
  const rooms = [...data.rooms];
  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const idx = rooms.findIndex(
      (r) => r.branchId === row.branchId && r.name.trim().toLowerCase() === row.name.trim().toLowerCase()
    );
    if (idx >= 0) {
      rooms[idx] = { ...rooms[idx], capacity: row.capacity, instruments: row.instruments };
      updated++;
    } else {
      rooms.push({ id: uid("room"), name: row.name, branchId: row.branchId, capacity: row.capacity, instruments: row.instruments });
      created++;
    }
  }
  const next = save({ ...data, rooms });
  return { data: next, created, updated };
}

export async function importStudents(rows: StudentImportRow[]): Promise<ImportCommitResult> {
  const data = load();
  const students = [...data.students];
  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const idx = students.findIndex((s) => s.phone.trim() === row.phone.trim());
    if (idx >= 0) {
      students[idx] = {
        ...students[idx],
        name: row.name,
        email: row.email || students[idx].email,
        parentName: row.parentName,
        parentPhone: row.parentPhone,
        branchId: row.branchId,
        instruments: [row.instrument],
        teacherId: row.teacherId,
        packageName: row.packageName,
        weeklyLessonCount: row.weeklyLessonCount,
        monthlyFee: row.monthlyFee,
        notes: row.notes || students[idx].notes,
        lessonDurationMinutes: row.lessonDurationMinutes ?? students[idx].lessonDurationMinutes,
        birthDate: row.birthDate ?? students[idx].birthDate,
        birthPlace: row.birthPlace ?? students[idx].birthPlace,
        schoolOrOccupation: row.schoolOrOccupation ?? students[idx].schoolOrOccupation,
        address: row.address ?? students[idx].address,
        nationalIdCipher: row.nationalIdCipher ?? students[idx].nationalIdCipher,
        nationalIdLast2: row.nationalIdLast2 ?? students[idx].nationalIdLast2,
        enrollmentStartDate: row.enrollmentStartDate ?? students[idx].enrollmentStartDate,
      };
      updated++;
    } else {
      students.push({
        id: uid("stu"),
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
        createdAt: new Date().toISOString(),
        lessonDurationMinutes: row.lessonDurationMinutes,
        birthDate: row.birthDate,
        birthPlace: row.birthPlace,
        schoolOrOccupation: row.schoolOrOccupation,
        address: row.address,
        nationalIdCipher: row.nationalIdCipher,
        nationalIdLast2: row.nationalIdLast2,
        enrollmentStartDate: row.enrollmentStartDate,
      });
      created++;
    }
  }
  const next = save({ ...data, students });
  return { data: next, created, updated };
}

export async function addPayment(input: {
  studentId: string;
  description: string;
  amount: number;
  dueDate: string;
}): Promise<AppData> {
  const data = load();
  const isOverdue = new Date(input.dueDate).getTime() < Date.now();
  const payment: Payment = {
    id: uid("pay"),
    studentId: input.studentId,
    amount: input.amount,
    paidAmount: 0,
    status: isOverdue ? "overdue" : "pending",
    dueDate: input.dueDate,
    description: input.description,
    createdAt: new Date().toISOString(),
  };
  return save({ ...data, payments: [...data.payments, payment] });
}

/** FEATURE A — bkz. store.ts yorumu. */
export async function addContractInstallments(input: {
  contractId: string;
  studentId: string;
  installments: ContractInstallmentSnapshot[];
  firstPaymentCollected?: { method: string; amount: number; collectedAt: string; reference?: string; note?: string };
  reuseFirstPaymentId?: string;
}): Promise<{ data: AppData; installments: ContractInstallmentView[] }> {
  const data = load();
  const now = new Date().toISOString();
  const fp = input.firstPaymentCollected;
  const reuseId = input.reuseFirstPaymentId;
  const newRows: Payment[] = input.installments
    .filter((inst) => !(inst.sequence === 1 && reuseId))
    .map((inst) => {
      const isFirstCollected = inst.sequence === 1 && !!fp;
      const noteSuffix = fp?.reference || fp?.note
        ? ` (${[fp.reference && `ref:${fp.reference}`, fp.note].filter(Boolean).join(" · ")})`
        : "";
      return {
        id: uid("pay"),
        studentId: input.studentId,
        amount: inst.amount,
        paidAmount: isFirstCollected ? fp!.amount : 0,
        status: isFirstCollected ? "paid" : "pending",
        dueDate: inst.dueDate,
        paidAt: isFirstCollected ? fp!.collectedAt : undefined,
        description: `Sözleşme taksiti ${inst.sequence}/${input.installments.length}${isFirstCollected ? ` — Kayıt anında tahsil edildi${noteSuffix}` : ""}`,
        method: isFirstCollected ? fp!.method : inst.paymentMethod,
        source: "contract",
        contractId: input.contractId,
        installmentSequence: inst.sequence,
        createdAt: now,
      };
    });
  let reusedRow: Payment | undefined;
  let payments = data.payments;
  if (reuseId) {
    const firstInst = input.installments.find((i) => i.sequence === 1);
    payments = payments.map((p) => {
      if (p.id !== reuseId) return p;
      reusedRow = {
        ...p,
        amount: firstInst?.amount ?? p.amount,
        contractId: input.contractId,
        installmentSequence: 1,
        description: `Sözleşme taksiti 1/${input.installments.length} — Kayıt anında tahsil edildi (kayıt ödemesi)`,
      };
      return reusedRow;
    });
  }
  const next = save({ ...data, payments: [...payments, ...newRows] });
  const installmentRows = reusedRow ? [reusedRow, ...newRows] : newRows;
  const installments: ContractInstallmentView[] = installmentRows.map((r) => ({
    paymentId: r.id,
    sequence: r.installmentSequence ?? 0,
    dueDate: r.dueDate,
    amount: r.amount,
    paidAmount: r.paidAmount,
    status: r.status,
    paymentMethod: r.method,
  }));
  return { data: next, installments };
}

export async function upsertMonthlyPlanPayment(input: {
  studentId: string;
  month: string;
  amount: number;
  dueDate?: string;
  method?: string;
}): Promise<{ data: AppData; paymentId: string }> {
  const data = load();
  const student = data.students.find((s) => s.id === input.studentId);
  if (!student) throw new Error("Öğrenci bulunamadı");
  const defaultDueDate = new Date(`${input.month}-01T12:00:00.000Z`).toISOString();
  const dueDate = input.dueDate ? new Date(`${input.dueDate}T12:00:00.000Z`).toISOString() : defaultDueDate;
  const existing = data.payments.find(
    (p) => p.studentId === input.studentId && p.source === "monthly_plan" && p.dueDate.slice(0, 7) === input.month
  );
  let payments: Payment[];
  let paymentId: string;
  if (existing) {
    paymentId = existing.id;
    payments = data.payments.map((p) =>
      p.id === existing.id
        ? {
            ...p,
            amount: input.amount,
            description: `Aylık plan — ${input.month} (${input.amount} TL)`,
            dueDate: input.dueDate ? dueDate : p.dueDate,
            method: input.method ?? p.method,
          }
        : p
    );
  } else {
    const payment: Payment = {
      id: uid("pay"),
      studentId: input.studentId,
      amount: input.amount,
      paidAmount: 0,
      status: "pending",
      dueDate,
      description: `Aylık plan — ${input.month} (${input.amount} TL)`,
      source: "monthly_plan",
      method: input.method,
      createdAt: new Date().toISOString(),
    };
    paymentId = payment.id;
    payments = [...data.payments, payment];
  }
  const next = save({ ...data, payments });
  return { data: next, paymentId };
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
}): Promise<{ data: AppData; paymentId: string }> {
  const data = load();
  const existing = data.payments.find(
    (p) => p.studentId === input.studentId && p.source === "registration_first_payment"
  );
  if (existing) return { data, paymentId: existing.id };
  const noteSuffix = input.reference || input.note
    ? ` (${[input.reference && `ref:${input.reference}`, input.note].filter(Boolean).join(" · ")})`
    : "";
  const payment: Payment = {
    id: uid("pay"),
    studentId: input.studentId,
    amount: input.amount,
    paidAmount: input.amount,
    status: "paid",
    dueDate: input.collectedAt,
    paidAt: input.collectedAt,
    description: `İlk Ödeme — Kayıt Anında Tahsil Edildi${noteSuffix}`,
    method: input.method,
    source: "registration_first_payment",
    receivedByUserId: input.receivedByUserId,
    paymentNote: input.note,
    createdAt: new Date().toISOString(),
  };
  const next = save({ ...data, payments: [...data.payments, payment] });
  return { data: next, paymentId: payment.id };
}

/** P0 dedup fix (2026-08-30) — bkz. store.ts StoreApi.getRegistrationFirstPayment. */
export async function getRegistrationFirstPayment(studentId: string): Promise<Payment | null> {
  const data = load();
  return data.payments.find((p) => p.studentId === studentId && p.source === "registration_first_payment") ?? null;
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



async function persistLessonOpsUnderLock(
  lessonId: string,
  _flag: LessonOpsFlag,
  actorUserId: string,
  apply: typeof applyLessonOpsFlag | typeof switchLessonOpsFlag
): Promise<ReturnType<typeof applyLessonOpsFlag>> {
  const pre = load();
  const preLesson = pre.lessons.find((l) => l.id === lessonId);
  const key = `${tenantKey()}:ops:${preLesson?.studentId ?? lessonId}`;
  return withKeyLock(key, async () => {
    const data = load();
    const result = apply(data, lessonId, _flag, actorUserId);
    if (result.ok && !result.alreadySet) {
      save(result.data);
    }
    return result;
  });
}

export async function applyLessonOpsFlagLive(
  lessonId: string,
  flag: LessonOpsFlag,
  actorUserId: string
): Promise<ReturnType<typeof applyLessonOpsFlag>> {
  return persistLessonOpsUnderLock(lessonId, flag, actorUserId, applyLessonOpsFlag);
}

export async function switchLessonOpsFlagLive(
  lessonId: string,
  flag: LessonOpsFlag,
  actorUserId: string
): Promise<ReturnType<typeof switchLessonOpsFlag>> {
  return persistLessonOpsUnderLock(lessonId, flag, actorUserId, switchLessonOpsFlag);
}

/** Faz 2 — memory modu tamamen senkron; ekstra kilit gerekmez. */
export async function markTeacherAttendanceLive(
  lessonId: string,
  status: TeacherAttendanceStatus,
  actorUserId: string,
  note: string | undefined
): Promise<ReturnType<typeof markTeacherAttendance>> {
  const data = load();
  const result = markTeacherAttendance(data, lessonId, status, actorUserId, note);
  if (result.ok && !result.alreadySet) save(result.data);
  return result;
}

/** Faz 13 — ders öğretmeni/şube değişimi (tek/bundan sonrası/tüm seri). */
export async function reassignLessonTeacherOrBranchLive(input: ReassignLessonInput): Promise<ReassignLessonResult> {
  const data = load();
  const result = reassignLessonTeacherOrBranch(data, input);
  if (result.ok) save(result.data);
  return result;
}
