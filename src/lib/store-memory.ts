import { collectedAmountOf } from "./payment-profile";
import { mergeImportRowIntoStudent } from "./import/student-merge";
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
  applyDemoSeedRecords,
  assertDemoSeedAllowed,
  type DemoSeedInput,
  type DemoSeedResult,
} from "./demo-seed";
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
import { withClosedDayOverrides, withoutClosedDayOverrides } from "./closed-day-overrides";
import { DEFAULT_TENANT_ID } from "./auth/config";
import {
  applyEnrollmentChange,
  applyProfilePatchToStudent,
  mergeStudentPatches,
  type ChangeStudentEnrollmentsInput,
  type ChangeStudentEnrollmentsResult,
  type RegisterStudentInput,
  type RegisterStudentResult,
} from "./student-enrollments";
import { buildRegistrationFirstPayment, REGISTRATION_FIRST_PAYMENT_SOURCE, registrationPaymentIdsByEnrollment } from "./registration-payment";
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
  StudentDeletionState,
  TeacherDeletionState,
  StudentPaymentPauseState,
  Teacher,
  TeacherFeeRule,
  TeacherProfilePatch,
  TeacherPayout,
} from "./types";
import type { MebStudentListResult, MebStudentQuery } from "./meb-list";
import {
  suggestMakeupSlots,
  confirmMakeupSlot,
  cancelMakeupData,
  validateLessonSlot,
  LessonSlotValidationError,
  type MakeupDecision,
} from "./makeup-engine";
import {
  applyLessonScheduleUpdate,
  applyLessonCancel,
  type LessonScheduleUpdateOutcome,
} from "./lesson-update";
import { mergeLessonScope, narrowLessonScope, narrowSlotScope } from "./lesson-scope";
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

function save(input: AppData): AppData {
  const data = withoutClosedDayOverrides(input);
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
  const data = load();
  return withClosedDayOverrides(data, data.settings.tenantId);
}

export async function writeData(data: AppData): Promise<void> {
  save(data);
}

export async function mutateStoreUnderLock(
  fn: (data: AppData) => Promise<AppData>,
  onWriteFail?: () => Promise<void>
): Promise<AppData> {
  return withKeyLock(`memory-store:${tenantKey()}`, async () => {
    const current = load();
    const next = await fn(await withClosedDayOverrides(current, current.settings.tenantId));
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

/** Bkz. src/lib/reference-data.ts — json/memory tam veriden türetir (db ile aynı şekil). */
export async function readReferenceData(): Promise<ReferenceData> {
  return toReferenceData(await readData());
}

/** Bkz. src/lib/reference-data.ts `narrowToStudentScope` — db ile aynı dilim. */
export async function readStudentScope(studentId: string): Promise<StudentScopeData> {
  return narrowToStudentScope(await readData(), studentId);
}

/** Bkz. src/lib/reference-data.ts `narrowToLessonWindow`. */
export async function readLessonWindow(fromIso: string, toIso: string): Promise<LessonWindowData> {
  return narrowToLessonWindow(await readData(), new Date(fromIso), new Date(toIso));
}

/** Bkz. src/lib/reference-data.ts `narrowToPayoutWindow`. */
export async function readPayoutWindow(fromIso: string, toIso: string): Promise<PayoutWindowData> {
  return narrowToPayoutWindow(await readData(), new Date(fromIso), new Date(toIso));
}

/** Bkz. src/lib/reference-data.ts `narrowToDashboard`. */
export async function readDashboardData(fromIso: string, toIso: string, nowIso: string): Promise<DashboardData> {
  return narrowToDashboard(await readData(), new Date(fromIso), new Date(toIso), new Date(nowIso));
}

/** Bkz. src/lib/reference-data.ts `narrowToPaymentsPage`. */
export async function readPaymentsPageData(): Promise<PaymentsPageData> {
  return narrowToPaymentsPage(await readData());
}

/** Bkz. src/lib/reference-data.ts `StudentListData`. */
export async function readStudentListData(): Promise<StudentListData> {
  const data = await readData();
  return { ...toReferenceData(data), payments: data.payments.map(toPaymentStatusRow) };
}

/** Bkz. store-db.readStudentById — tek dosya/süreç verisi zaten okunur; sonuç `readData()` ile aynı. */
export async function readStudentById(studentId: string): Promise<Student | undefined> {
  return (await readData()).students.find((s) => s.id === studentId);
}

/** Bkz. store-db.readLessonById — sonuç `readData().lessons.find` ile aynı. */
export async function readLessonById(lessonId: string): Promise<Lesson | undefined> {
  return (await readData()).lessons.find((l) => l.id === lessonId);
}

/** Bkz. store-db.readPaymentById — sonuç `readData().payments.find` ile aynı. */
export async function readPaymentById(paymentId: string): Promise<Payment | undefined> {
  return (await readData()).payments.find((p) => p.id === paymentId);
}

/** Bkz. store-db.readTeacherPayoutsForTeacher — sonuç `readData().teacherPayouts` süzgeciyle aynı. */
export async function readTeacherPayoutsForTeacher(teacherId: string): Promise<TeacherPayout[]> {
  return (await readData()).teacherPayouts.filter((p) => p.teacherId === teacherId);
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

/** 2026-10-10 — bkz. store-json.ts `registerStudent` (aynı davranış; mode parity). */
export async function registerStudent(input: RegisterStudentInput): Promise<RegisterStudentResult> {
  const data = load();
  if (input.registrationId) {
    const dup = data.students.find((s) => s.enrollments?.some((e) => e.registrationId === input.registrationId));
    if (dup) return { studentId: dup.id, duplicate: true, paymentIds: registrationPaymentIdsByEnrollment(data.payments, dup.id) };
  }
  assertBranchExists(data, input.student.branchId);
  const { assigned, records } = allocateSequenceValue(data.entitySequences ?? [], DEFAULT_TENANT_ID, "student");
  const nowIso = new Date().toISOString();
  const studentId = uid("stu");
  const s: Student = { ...input.student, id: studentId, active: true, createdAt: nowIso, displayId: formatDisplayId("student", assigned) };
  const paymentIds: Record<string, string> = {};
  const payments = input.firstPayments.map((fp) => {
    const id = uid("pay");
    paymentIds[fp.enrollmentId] = id;
    return buildRegistrationFirstPayment(id, studentId, fp, nowIso);
  });
  save({ ...data, students: [...data.students, s], payments: [...data.payments, ...payments], entitySequences: records });
  return { studentId, duplicate: false, paymentIds };
}

/** 2026-10-10 — bkz. store-json.ts `changeStudentEnrollments` (aynı davranış; mode parity). */
export async function changeStudentEnrollments(input: ChangeStudentEnrollmentsInput): Promise<ChangeStudentEnrollmentsResult> {
  const data = load();
  const idx = data.students.findIndex((s) => s.id === input.studentId);
  if (idx < 0) return { ok: false, code: "NOT_FOUND", message: "Öğrenci bulunamadı. Sayfayı yenileyip tekrar deneyin." };
  const student = data.students[idx]!;
  const applied = applyEnrollmentChange(student, input.change, input.teachers);
  if (!applied.ok) return applied;
  const nextStudent = applyProfilePatchToStudent(
    { ...student, enrollments: applied.enrollments },
    mergeStudentPatches(input.person, applied.mirror)
  );
  let payments = data.payments;
  let paymentId: string | undefined;
  const fp = input.firstPayment;
  if (fp && input.change.kind === "add") {
    const existing = data.payments.find(
      (p) => p.studentId === student.id && p.source === REGISTRATION_FIRST_PAYMENT_SOURCE && (p.enrollmentId ?? null) === fp.enrollmentId
    );
    if (existing) {
      paymentId = existing.id;
    } else {
      paymentId = uid("pay");
      payments = [...payments, buildRegistrationFirstPayment(paymentId, student.id, fp, new Date().toISOString())];
    }
  }
  save({ ...data, students: data.students.map((s, i) => (i === idx ? nextStudent : s)), payments });
  return { ok: true, enrollments: applied.enrollments, changed: applied.changed, ...(paymentId ? { paymentId } : {}) };
}

/**
 * Geri alınabilir öğrenci silme (2026-09-22). Silmede öğrenci pasife alınır;
 * geri almada yalnız silme işareti kalkar (öğrenci pasif kalır, ayrıca aktifleştirilir).
 */
export async function setStudentDeletion(studentId: string, state: StudentDeletionState): Promise<AppData> {
  const data = load();
  if (!data.students.some((s) => s.id === studentId)) throw new Error("Öğrenci bulunamadı");
  const students = data.students.map((s) => {
    if (s.id !== studentId) return s;
    if (state) return { ...s, ...state, active: false, archivedAt: s.archivedAt ?? state.deletedAt };
    return { ...s, deletedAt: undefined, deletedByUserId: undefined, deletionReason: undefined };
  });
  const next = { ...data, students };
  return save(next);
}

/**
 * Kalıcı silme — YALNIZ bağlı kaydı olmayan (boş/deneme) öğrenci. Çağıran tool
 * uygunluğu doğrular; burada da ikinci kez kontrol edilir (savunma derinliği).
 */
export async function hardDeleteStudent(studentId: string): Promise<AppData> {
  const data = load();
  const linked =
    data.payments.some((p) => p.studentId === studentId) ||
    data.lessons.some((l) => l.studentId === studentId) ||
    data.lessonSeries.some((l) => l.studentId === studentId) ||
    data.attendances.some((a) => a.studentId === studentId) ||
    data.makeupRequests.some((m) => m.studentId === studentId);
  if (linked) throw new Error("STUDENT_HAS_LINKED_RECORDS");
  const next = { ...data, students: data.students.filter((s) => s.id !== studentId) };
  return save(next);
}

/** 2026-10-03 — öğretmeni listeden kaldırma (geri alınabilir); kaldırmada pasife alınır. `null` = geri al. */
export async function setTeacherDeletion(teacherId: string, state: TeacherDeletionState): Promise<AppData> {
  const data = load();
  if (!data.teachers.some((t) => t.id === teacherId)) throw new Error("Öğretmen bulunamadı");
  const teachers = data.teachers.map((t) => {
    if (t.id !== teacherId) return t;
    if (state) return { ...t, ...state, active: false, archivedAt: t.archivedAt ?? state.deletedAt };
    return { ...t, deletedAt: undefined, deletedByUserId: undefined, deletionReason: undefined };
  });
  const next = { ...data, teachers };
  return save(next);
}

/** Kalıcı silme — YALNIZ bağlı kaydı olmayan öğretmen; tool uygunluğu doğrular, burada ikinci kez kontrol edilir. */
export async function hardDeleteTeacher(teacherId: string): Promise<AppData> {
  const data = load();
  const linked =
    data.students.some((s) => s.teacherId === teacherId || s.enrollments?.some((e) => e.teacherId === teacherId)) ||
    data.lessons.some((l) => l.teacherId === teacherId) ||
    data.lessonSeries.some((l) => l.teacherId === teacherId) ||
    data.makeupRequests.some((m) => m.teacherId === teacherId) ||
    data.teacherFeeRules.some((r) => r.teacherId === teacherId) ||
    data.teacherPayouts.some((p) => p.teacherId === teacherId);
  if (linked) throw new Error("TEACHER_HAS_LINKED_RECORDS");
  const next = { ...data, teachers: data.teachers.filter((t) => t.id !== teacherId) };
  return save(next);
}

export async function updateStudentProfile(
  studentId: string,
  patch: StudentProfilePatch
): Promise<AppData> {
  const data = load();
  if (!data.students.some((s) => s.id === studentId)) throw new Error("Öğrenci bulunamadı");
  const { clearFields, ...rest } = patch;
  const students = data.students.map((s) => {
    if (s.id !== studentId) return s;
    const next = { ...s, ...rest };
    for (const k of clearFields ?? []) delete next[k];
    return next;
  });
  return save({ ...data, students });
}

/** MEB Paneli listesi (memory yolu) — bkz. store-json.ts aynı adlı fonksiyon. */
export async function listMebStudents(query: MebStudentQuery): Promise<MebStudentListResult> {
  const { applyMebStudentQuery } = await import("./meb-list");
  const data = load();
  return applyMebStudentQuery(data.students, query, data.teachers);
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
  await collectPayment(paymentId, normalized);
  return readData();
}

/** 2026-10-03 — yanlışlıkla oluşturulmuş BAĞIMSIZ ödeme satırını kaldırır (sözleşme taksidi asla). Kural/yetki tool'da. */
export async function deletePaymentRow(paymentId: string): Promise<AppData> {
  const data = load();
  const payment = data.payments.find((p) => p.id === paymentId);
  if (!payment) throw new Error("Ödeme bulunamadı");
  if (payment.contractId) throw new Error("PAYMENT_IS_CONTRACT_INSTALLMENT");
  return save({ ...data, payments: data.payments.filter((p) => p.id !== paymentId) });
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
  patch: Partial<Pick<Room, "name" | "capacity" | "branchId" | "instruments" | "active" | "archivedAt" | "deletedAt">>
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

/** 2026-10-06 — bkz. store-db.ts addClubSessionLessons (mode parity). */
export async function addClubSessionLessons(rows: Lesson[]): Promise<void> {
  if (rows.length === 0) return;
  const data = load();
  save({ ...data, lessons: [...data.lessons, ...rows] });
}

/** 2026-10-06 — bkz. store-db.ts patchClubLessons (yalnız `type: "group"`). */
export async function patchClubLessons(ids: string[], patch: import("./clubs").ClubLessonPatch): Promise<number> {
  let count = 0;
  const set = new Set(ids);
  const data = load();
  save({
    ...data,
    lessons: data.lessons.map((l) => {
      if (!set.has(l.id) || l.type !== "group") return l;
      count++;
      return { ...l, ...patch };
    }),
  });
  return count;
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
  createdByUserId?: string;
  enrollmentId?: string;
}): Promise<string> {
  const data = load();
  // Doğrulama db moduyla AYNI dar dilimde (bkz. lesson-scope.ts narrowSlotScope); yazım tam veriye.
  const validation = validateLessonSlot(
    narrowSlotScope(data, input),
    // `term` verilmişse haftalık kapalı gün kuralı DERSİN dönemine göre
    // çözülür (öğrencinin varsayılan dönemine göre değil) — bkz. work-days.ts.
    { instrument: input.instrument, studentId: input.studentId, term: input.term },
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
    createdByUserId: input.createdByUserId,
    enrollmentId: input.enrollmentId,
    term: input.term,
    academicYearStart: input.academicYearStart,
    availabilityOverride:
      slot.availabilityOverridden && input.overriddenByUserId
        ? { by: input.overriddenByUserId, at: new Date().toISOString() }
        : undefined,
  };
  save({ ...data, lessons: [...data.lessons, lesson] });
  return lesson.id;
}

/** Dar okuma — bkz. lesson-scope.ts. */
export async function readLessonScope(
  lessonId: string,
  targetStartAt?: string
): Promise<AppData | null> {
  return narrowLessonScope(load(), lessonId, targetStartAt);
}

/** Bkz. store-json.ts aynı fonksiyon — dar dilim + dar dönüş (mode parity). */
export async function updateLessonSchedule(input: {
  lessonId: string;
  startAt?: string;
  durationMinutes?: number;
}): Promise<LessonScheduleUpdateOutcome> {
  const data = load();
  const scope = narrowLessonScope(data, input.lessonId, input.startAt);
  if (!scope) return { ok: false, code: "LESSON_NOT_FOUND", message: "Ders bulunamadı." };
  const original = scope.lessons.find((l) => l.id === input.lessonId)!;
  const result = applyLessonScheduleUpdate(scope, input);
  if (!result.ok) return result;
  save({ ...data, lessons: data.lessons.map((l) => (l.id === result.lesson.id ? result.lesson : l)) });
  return { ok: true, lesson: result.lesson, previousStartAt: original.startAt };
}

export async function cancelLesson(lessonId: string): Promise<AppData> {
  const data = load();
  // Mode parity (DB egress 2026-10-10): kural db'deki dar dilimin AYNISIYLA çalışır; sonuç bütüne birleştirilir.
  const scope = narrowLessonScope(data, lessonId);
  if (!scope) throw new Error("Ders bulunamadı.");
  const result = applyLessonCancel(scope, lessonId);
  if (!result.ok) throw new Error(result.message);
  return save(mergeLessonScope(data, result.data, lessonId));
}

export async function startLessonLive(lessonId: string): Promise<LessonLiveUpdateResult> {
  const data = load();
  // Mode parity (DB egress 2026-10-10): kural db'deki dar dilimin AYNISIYLA çalışır; sonuç bütüne birleştirilir.
  const scope = narrowLessonScope(data, lessonId);
  if (!scope) return { ok: false, message: "Ders bulunamadı." };
  const result = applyStartLesson(scope, lessonId);
  if (!result.ok) return result;
  const next = mergeLessonScope(data, result.data, lessonId);
  save(next);
  return { ...result, data: next };
}

export async function endLessonLive(lessonId: string): Promise<LessonLiveUpdateResult> {
  const data = load();
  // Mode parity (DB egress 2026-10-10): kural db'deki dar dilimin AYNISIYLA çalışır; sonuç bütüne birleştirilir.
  const scope = narrowLessonScope(data, lessonId);
  if (!scope) return { ok: false, message: "Ders bulunamadı." };
  const result = applyEndLesson(scope, lessonId);
  if (!result.ok) return result;
  const next = mergeLessonScope(data, result.data, lessonId);
  save(next);
  return { ...result, data: next };
}

export async function correctLessonTimesLive(
  lessonId: string,
  correction: LessonTimeCorrection
): Promise<LessonLiveUpdateResult> {
  const data = load();
  // Mode parity (DB egress 2026-10-10): kural db'deki dar dilimin AYNISIYLA çalışır; sonuç bütüne birleştirilir.
  const scope = narrowLessonScope(data, lessonId);
  if (!scope) return { ok: false, message: "Ders bulunamadı." };
  const result = applyCorrectLessonTimes(scope, lessonId, correction);
  if (!result.ok) return result;
  const next = mergeLessonScope(data, result.data, lessonId);
  save(next);
  return { ...result, data: next };
}

function assertLessonSeriesRefsExist(data: AppData, params: SeriesParams) {
  if (!data.students.some((s) => s.id === params.studentId)) throw new Error("Öğrenci bulunamadı");
  if (!data.teachers.some((t) => t.id === params.teacherId)) throw new Error("Öğretmen bulunamadı");
  if (!data.rooms.some((r) => r.id === params.roomId)) throw new Error("Oda bulunamadı");
  if (!data.settings.branches.some((b) => b.id === params.branchId)) throw new Error("Şube bulunamadı");
}

export async function addLessonSeries(
  params: SeriesParams,
  options?: { skipConflicts?: boolean; allowAvailabilityOverride?: boolean; overriddenByUserId?: string; createdByUserId?: string }
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

/** M — kritik şifreyle statülü tek ders silme (bkz. planForcedLessonDeletion). */
export async function forceDeleteLesson(lessonId: string): Promise<ForcedLessonDeletionPlan> {
  const data = load();
  const result = planForcedLessonDeletion(data, lessonId);
  if (result.ok) save(result.data);
  return result;
}

export async function deleteLessonsScoped(lessonId: string, scope: LessonEditScope): Promise<LessonDeletionPlan> {
  const data = load();
  const result = planLessonDeletion(data, lessonId, scope);
  if (result.ok) save(result.data);
  return result;
}

export async function reviseLessonsScoped(input: LessonRevisionInput): Promise<LessonRevisionResult> {
  const data = load();
  const result = applyLessonRevision(data, input);
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
  if (!result.ok) return result;
  // Paket & Kampanya Motoru — displayId tenant sayaçtan (öğrenci deseniyle aynı).
  const { assigned, records } = allocateSequenceValue(
    result.data.entitySequences ?? [],
    DEFAULT_TENANT_ID,
    "package"
  );
  const pkg = { ...result.pkg, displayId: formatDisplayId("package", assigned) };
  const next = {
    ...result.data,
    packages: (result.data.packages ?? []).map((p) => (p.id === pkg.id ? pkg : p)),
    entitySequences: records,
  };
  save(next);
  return { ok: true, data: next, pkg };
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
  if (!result.ok) return result;
  // Paket & Kampanya Motoru — displayId tenant sayaçtan (öğrenci deseniyle aynı).
  const { assigned, records } = allocateSequenceValue(
    result.data.entitySequences ?? [],
    DEFAULT_TENANT_ID,
    "campaign"
  );
  const campaign = { ...result.campaign, displayId: formatDisplayId("campaign", assigned) };
  const next = {
    ...result.data,
    discountCampaigns: (result.data.discountCampaigns ?? []).map((c) => (c.id === campaign.id ? campaign : c)),
    entitySequences: records,
  };
  save(next);
  return { ok: true, data: next, campaign };
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

/** 2026-09-29 — ay bazlı hakediş politikası (memory modu senkron; kilit gerekmez). */
export async function setTeacherPayoutPolicy(
  input: import("./teacher-payout").SetPayoutPolicyInput,
  actorUserId: string
): Promise<import("./teacher-payout").SetPayoutPolicyResult> {
  const { setPayoutPolicyForMonthData } = await import("./teacher-payout");
  const result = setPayoutPolicyForMonthData(load(), input, actorUserId);
  if (result.ok && result.changed) save(result.data);
  return result;
}

/** K — kaydı bütün olarak değiştirir (kurallar tool katmanında). İyimser kilit: okunan sürüm değilse STALE_PAYOUT. */
export async function replaceTeacherPayout(payout: TeacherPayout): Promise<AppData> {
  const data = load();
  const cur = data.teacherPayouts.find((p) => p.id === payout.id);
  if (!cur) throw new Error("Hakediş kaydı bulunamadı");
  if ((cur.version ?? 0) !== (payout.version ?? 0)) throw new Error("STALE_PAYOUT");
  const written = { ...payout, version: (payout.version ?? 0) + 1 };
  const next = { ...data, teacherPayouts: data.teacherPayouts.map((p) => (p.id === payout.id ? written : p)) };
  save(next);
  return next;
}

export async function deleteTeacherPayout(payoutId: string): Promise<boolean> {
  const data = load();
  if (!data.teacherPayouts.some((p) => p.id === payoutId && p.status === "cancelled")) return false;
  save({ ...data, teacherPayouts: data.teacherPayouts.filter((p) => p.id !== payoutId) });
  return true;
}

export async function deleteTeacherFeeRule(ruleId: string): Promise<boolean> {
  const data = load();
  if (!data.teacherFeeRules.some((r) => r.id === ruleId)) return false;
  save({ ...data, teacherFeeRules: data.teacherFeeRules.filter((r) => r.id !== ruleId) });
  return true;
}

export async function addTeacherPayoutExclusion(x: import("./types").TeacherPayoutExclusion): Promise<void> {
  const data = load();
  save({ ...data, teacherPayoutExclusions: [...(data.teacherPayoutExclusions ?? []).filter((e) => e.lessonId !== x.lessonId), x] });
}

export async function removeTeacherPayoutExclusion(lessonId: string): Promise<boolean> {
  const data = load();
  if (!(data.teacherPayoutExclusions ?? []).some((e) => e.lessonId === lessonId)) return false;
  save({ ...data, teacherPayoutExclusions: data.teacherPayoutExclusions!.filter((e) => e.lessonId !== lessonId) });
  return true;
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

export async function updatePerformanceWeights(
  performanceWeights: import("./performance-weights").PerformanceWeightsConfig
): Promise<AppData> {
  const data = load();
  return save({ ...data, settings: { ...data.settings, performanceWeights } });
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

export async function updateAcademicTermDates(
  academicTermDates: import("./academic-term-dates").AcademicTermDates
): Promise<AppData> {
  const data = load();
  return save({ ...data, settings: { ...data.settings, academicTermDates } });
}

export async function updateConsentSettings(consentSettings: ConsentSettings): Promise<AppData> {
  const data = load();
  return save({ ...data, settings: { ...data.settings, consentSettings } });
}

export async function updateSchoolLogoUrl(logoUrl: string): Promise<AppData> {
  const data = load();
  return save({ ...data, settings: { ...data.settings, logoUrl } });
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
  // Normal kayıtla aynı insan-okunur numara (S00001…) — CSV öğrencisi numarasız kalmaz.
  let sequences = data.entitySequences ?? [];
  const nextDisplayId = () => {
    const { assigned, records } = allocateSequenceValue(sequences, DEFAULT_TENANT_ID, "student");
    sequences = records;
    return formatDisplayId("student", assigned);
  };
  for (const row of rows) {
    const idx = students.findIndex((s) => s.phone.trim() === row.phone.trim());
    if (idx >= 0) {
      students[idx] = mergeImportRowIntoStudent(students[idx], row, nextDisplayId);
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
        // Normal kayıtla aynı sözleşmeye hazır alanlar (bkz. withContractReadyFields).
        derivedPerLessonAmount: row.derivedPerLessonAmount,
        accountResponsibility: row.accountResponsibility,
        monthlyFeeManualOverride: false,
        createdByUserId: row.createdByUserId,
        displayId: nextDisplayId(),
      });
      created++;
    }
  }
  const next = save({ ...data, students, entitySequences: sequences });
  return { data: next, created, updated };
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
  /** 2026-10-09 — satırın branş kaydı (yoksa eski davranış: bağsız). */
  enrollmentId?: string;
}): Promise<AppData> {
  const data = load();
  const isOverdue = new Date(input.dueDate).getTime() < Date.now();
  const payment: Payment = {
    id: input.id ?? uid("pay"),
    studentId: input.studentId,
    amount: input.amount,
    paidAmount: 0,
    status: isOverdue ? "overdue" : "pending",
    dueDate: input.dueDate,
    description: input.description,
    createdAt: new Date().toISOString(),
    ...(input.source ? { source: input.source } : {}),
    ...(input.clubMembershipId ? { clubMembershipId: input.clubMembershipId } : {}),
    ...(input.installmentPeriodLabel ? { installmentPeriodLabel: input.installmentPeriodLabel } : {}),
    ...(input.enrollmentId ? { enrollmentId: input.enrollmentId } : {}),
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
  /** 2026-10-09 — sözleşmenin branş kaydı; taksit satırlarına (ve bağlanan kayıt ödemesine) aynen yazılır. */
  enrollmentId?: string;
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
        description: `Sözleşme taksiti ${inst.sequence}/${input.installments.at(-1)?.sequence ?? input.installments.length}${isFirstCollected ? ` — Kayıt anında tahsil edildi${noteSuffix}` : ""}`,
        method: isFirstCollected ? fp!.method : inst.paymentMethod,
        source: "contract",
        contractId: input.contractId,
        ...(input.enrollmentId ? { enrollmentId: input.enrollmentId } : {}),
        installmentSequence: inst.sequence,
        installmentKind: inst.kind,
        installmentPeriodLabel: inst.periodLabel,
        installmentBreakdown: inst.breakdown,
        installmentComputationSource: inst.computationSource,
        installmentNote: inst.note,
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
        ...(input.enrollmentId ? { enrollmentId: input.enrollmentId } : {}),
        installmentSequence: 1,
        description: `Sözleşme taksiti 1/${input.installments.at(-1)?.sequence ?? input.installments.length} — Kayıt anında tahsil edildi (kayıt ödemesi)`,
        installmentKind: firstInst?.kind,
        installmentPeriodLabel: firstInst?.periodLabel,
        installmentBreakdown: firstInst?.breakdown,
        installmentComputationSource: firstInst?.computationSource,
        installmentNote: firstInst?.note,
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
    kind: r.installmentKind,
    periodLabel: r.installmentPeriodLabel,
    breakdown: r.installmentBreakdown,
    computationSource: r.installmentComputationSource,
    note: r.installmentNote,
  }));
  return { data: next, installments };
}

export async function upsertMonthlyPlanPayment(input: {
  studentId: string;
  month: string;
  amount: number;
  method?: string;
  /** 2026-10-09 — dönem ayı satırı BRANŞ başınadır (bkz. store-db.ts). */
  enrollmentId?: string;
  includeUnlinked?: boolean;
}): Promise<{ data: AppData; paymentId: string }> {
  const data = load();
  const student = data.students.find((s) => s.id === input.studentId);
  if (!student) throw new Error("Öğrenci bulunamadı");
  // Bkz. store-json.ts — dönem ayı başına tek satır, tahsilat tarihi vadeye yazılmaz.
  const { isMonthlyPlanRowForMonth, monthlyPlanPeriodLabel } = await import("./attendance-calendar-plan");
  const { matchesEnrollmentScope } = await import("./student-enrollments");
  const scope = { enrollmentId: input.enrollmentId, includeUnlinked: input.includeUnlinked };
  const existing = data.payments.find(
    (p) => p.studentId === input.studentId && isMonthlyPlanRowForMonth(p, input.month) && matchesEnrollmentScope(p.enrollmentId, scope)
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
            installmentPeriodLabel: p.installmentPeriodLabel ?? monthlyPlanPeriodLabel(input.month),
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
      dueDate: new Date(`${input.month}-01T12:00:00.000Z`).toISOString(),
      description: `Aylık plan — ${input.month} (${input.amount} TL)`,
      installmentPeriodLabel: monthlyPlanPeriodLabel(input.month),
      source: "monthly_plan",
      method: input.method,
      createdAt: new Date().toISOString(),
      ...(input.enrollmentId ? { enrollmentId: input.enrollmentId } : {}),
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
  autoSuggestedAmount?: number;
  adjustmentReason?: string;
  adjustedBy?: string;
  adjustedAt?: string;
  /** Bkz. Payment.firstCollectionIncludesNextMonth. */
  firstCollectionIncludesNextMonth?: boolean;
  /** 2026-10-09 — branş kaydı; idempotency öğrenci + branş başınadır. */
  enrollmentId?: string;
}): Promise<{ data: AppData; paymentId: string }> {
  const data = load();
  const existing = data.payments.find(
    (p) =>
      p.studentId === input.studentId &&
      p.source === "registration_first_payment" &&
      (p.enrollmentId ?? null) === (input.enrollmentId ?? null)
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
    autoSuggestedAmount: input.autoSuggestedAmount,
    adjustmentReason: input.adjustmentReason,
    adjustedBy: input.adjustedBy,
    adjustedAt: input.adjustedAt,
    firstCollectionIncludesNextMonth: input.firstCollectionIncludesNextMonth,
    ...(input.enrollmentId ? { enrollmentId: input.enrollmentId } : {}),
  };
  const next = save({ ...data, payments: [...data.payments, payment] });
  return { data: next, paymentId: payment.id };
}

/** P0 dedup fix (2026-08-30) — bkz. store.ts StoreApi.getRegistrationFirstPayment. */
export async function getRegistrationFirstPayment(
  studentId: string,
  scope?: import("./student-enrollments").EnrollmentScope
): Promise<Payment | null> {
  const data = load();
  const { matchesEnrollmentScope } = await import("./student-enrollments");
  return (
    data.payments.find(
      (p) => p.studentId === studentId && p.source === "registration_first_payment" && matchesEnrollmentScope(p.enrollmentId, scope)
    ) ?? null
  );
}

/** 2026-10-09 — bkz. store-db.ts `linkRecordsToEnrollment` (aynı kural; yalnız bağsız satırlar). */
export async function linkRecordsToEnrollment(input: {
  studentId: string;
  enrollmentId: string;
  instrument?: string;
  scope?: "student";
  contractIds?: string[];
  paymentIds?: string[];
}): Promise<{ payments: number; lessons: number; series: number }> {
  const { linkRecordsInData } = await import("./student-enrollments");
  const r = linkRecordsInData(load(), input);
  save(r.data);
  return r.counts;
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



async function persistLessonOpsUnderLock(
  lessonId: string,
  _flag: LessonOpsFlag,
  actorUserId: string,
  apply: typeof applyLessonOpsFlag | typeof switchLessonOpsFlag,
  reason?: string,
  disruption?: import("./lesson-disruption").LessonDisruptionInput
): Promise<ReturnType<typeof applyLessonOpsFlag>> {
  const pre = load();
  const preLesson = pre.lessons.find((l) => l.id === lessonId);
  const key = `${tenantKey()}:ops:${preLesson?.studentId ?? lessonId}`;
  return withKeyLock(key, async () => {
    /**
     * Mode parity (2026-09-07) — saf kural, db modundaki DAR dilimin AYNISIYLA
     * çalıştırılır (bkz. lesson-scope.ts); sonuç bütüne birleştirilir. Böylece
     * dilim yetersiz kalırsa json modunda koşan testler bunu YAKALAR.
     */
    const data = load();
    const scope = narrowLessonScope(data, lessonId);
    if (!scope) return { ok: false, message: "Ders bulunamadı." };
    const result = apply(scope, lessonId, _flag, actorUserId, undefined, reason, disruption);
    if (result.ok && !result.alreadySet) {
      save(mergeLessonScope(data, result.data, lessonId));
    }
    return result;
  });
}

export async function applyLessonOpsFlagLive(
  lessonId: string,
  flag: LessonOpsFlag,
  actorUserId: string,
  reason?: string
): Promise<ReturnType<typeof applyLessonOpsFlag>> {
  return persistLessonOpsUnderLock(lessonId, flag, actorUserId, applyLessonOpsFlag, reason);
}

export async function switchLessonOpsFlagLive(
  lessonId: string,
  flag: LessonOpsFlag,
  actorUserId: string,
  reason?: string,
  disruption?: import("./lesson-disruption").LessonDisruptionInput
): Promise<ReturnType<typeof switchLessonOpsFlag>> {
  return persistLessonOpsUnderLock(lessonId, flag, actorUserId, switchLessonOpsFlag, reason, disruption);
}

/** 2026-09-29 — yoklama statüsünü geri alma (bkz. lesson-ops.ts clearLessonOpsFlag). */
export async function clearLessonOpsFlagLive(
  lessonId: string,
  expected: LessonOpsFlag,
  actorUserId: string
): Promise<import("./lesson-ops").ClearLessonOpsResult> {
  const { clearLessonOpsFlag } = await import("./lesson-ops");
  const pre = load().lessons.find((l) => l.id === lessonId);
  return withKeyLock(`${tenantKey()}:ops:${pre?.studentId ?? lessonId}`, async () => {
    const data = load();
    const scope = narrowLessonScope(data, lessonId);
    if (!scope) return { ok: false, code: "NOT_FOUND", message: "Ders bulunamadı. Sayfayı yenileyip tekrar deneyin." };
    const result = clearLessonOpsFlag(scope, lessonId, expected, actorUserId);
    if (result.ok && !result.alreadyClear) save(mergeLessonScope(data, result.data, lessonId));
    return result;
  });
}

/** Faz 2 — memory modu tamamen senkron; ekstra kilit gerekmez. */
export async function markTeacherAttendanceLive(
  lessonId: string,
  status: TeacherAttendanceStatus,
  actorUserId: string,
  note: string | undefined
): Promise<ReturnType<typeof markTeacherAttendance>> {
  const data = load();
  // Mode parity (DB egress 2026-10-10): kural db'deki dar dilimin AYNISIYLA çalışır; sonuç bütüne birleştirilir.
  const scope = narrowLessonScope(data, lessonId);
  if (!scope) return { ok: false, message: "Ders bulunamadı." };
  const result = markTeacherAttendance(scope, lessonId, status, actorUserId, note);
  if (result.ok && !result.alreadySet) save(mergeLessonScope(data, result.data, lessonId));
  return result;
}

/** Faz 13 — ders öğretmeni/şube değişimi (tek/bundan sonrası/tüm seri). */
export async function reassignLessonTeacherOrBranchLive(input: ReassignLessonInput): Promise<ReassignLessonResult> {
  const data = load();
  const result = reassignLessonTeacherOrBranch(data, input);
  if (result.ok) save(result.data);
  return result;
}

/**
 * Demo/QA seed kapısı — bkz. `demo-seed.ts`. json uygulamasıyla AYNI saf
 * mantık, yalnız kalıcılık katmanı farklı. Production'da fail-closed.
 */
export async function seedDemoRecords(input: DemoSeedInput): Promise<DemoSeedResult> {
  assertDemoSeedAllowed();
  const data = load();
  const result = applyDemoSeedRecords(data, input);
  await save(result.data);
  return { lessonIds: result.lessonIds };
}

/** 9. tur — İptal/Telafi kaynağını sonradan belirleme/düzeltme. */
export async function setLessonDisruptionLive(
  lessonId: string,
  patch: import("./lesson-disruption").LessonDisruptionPatch
): Promise<Lesson | null> {
  const data = load();
  let updated: Lesson | null = null;
  const lessons = data.lessons.map((l) => (l.id === lessonId ? (updated = { ...l, ...patch }) : l));
  if (updated) save({ ...data, lessons });
  return updated;
}

/** 9. tur — kullanılmamış paketi kalıcı siler (packages.ts kuralı). */
export async function deletePackage(packageId: string, expectedUpdatedAt: string): Promise<import("./packages").PackageDeleteResult> {
  const { deletePackageData } = await import("./packages");
  const result = deletePackageData(load(), packageId, expectedUpdatedAt);
  if (result.ok) save(result.data);
  return result;
}
