import { STORE_MODE } from "./config";
import * as jsonStore from "./store-json";
import type {
  AppData,
  AttendanceStatus,
  Branch,
  CollectionsSettings,
  ConsentSettings,
  ContractInstallmentSnapshot,
  ContractInstallmentView,
  FeeRoundingMode,
  Instrument,
  MakeupSlot,
  Payment,
  Room,
  Student,
  StudentPaymentPauseState,
  StudentProfilePatch,
  StudentTermType,
  Teacher,
  TeacherFeeRule,
  TeacherProfilePatch,
} from "./types";
import type { BranchImportRow } from "./import/branches";
import type { TeacherImportRow } from "./import/teachers";
import type { RoomImportRow } from "./import/rooms";
import type { StudentImportRow } from "./import/students";
import type { ImportCommitResult } from "./import/commit-result";
import type { CreateSeriesResult, SeriesCancelResult, SeriesParams } from "./lesson-series";
import type {
  FeeRuleInput,
  FeeRuleMutationResult,
  CreateTeacherPayoutResult,
  MarkPayoutPaidResult,
  TeacherPayoutPaymentMethod,
  UpdateTeacherPayoutPaymentMethodResult,
} from "./teacher-payout";
import type { MakeupDecision } from "./makeup-engine";
import type { LessonTimeCorrection, LessonLiveUpdateResult } from "./lesson-live-status";

type StoreApi = {
  readData: () => Promise<AppData>;
  resetData: () => Promise<AppData>;
  resetToCleanTemplate: () => Promise<AppData>;
  markAttendance: (input: {
    lessonId: string;
    status: AttendanceStatus;
    reason?: string;
  }) => Promise<AppData>;
  generateSuggestions: (requestId: string, options?: { maxSlots?: number }) => Promise<AppData>;
  confirmSlot: (requestId: string, slot: MakeupSlot, decision: MakeupDecision) => Promise<AppData>;
  cancelMakeup: (requestId: string, decision: MakeupDecision) => Promise<AppData>;
  updateMakeupSlaEscalation: (requestId: string, level: number) => Promise<AppData>;
  addStudent: (student: Omit<Student, "id" | "createdAt" | "active">) => Promise<AppData>;
  updateStudentProfile: (studentId: string, patch: StudentProfilePatch) => Promise<AppData>;
  setStudentPaymentPause: (studentId: string, state: StudentPaymentPauseState) => Promise<AppData>;
  addTeacher: (teacher: Omit<Teacher, "id" | "active" | "color">) => Promise<AppData>;
  updateTeacherAvailability: (
    teacherId: string,
    availability: Teacher["availability"]
  ) => Promise<Teacher | null>;
  /** ÖNCELİK 4 (devam) — çoklu enstrüman+seviye düzenleme. */
  updateTeacherInstruments: (
    teacherId: string,
    instruments: Teacher["instruments"],
    instrumentLevels: Teacher["instrumentLevels"]
  ) => Promise<Teacher | null>;
  /** Package D — özlük/idari alanlar + ek şube ataması. */
  updateTeacherProfile: (teacherId: string, patch: TeacherProfilePatch) => Promise<Teacher | null>;
  addPackage: (input: import("./packages").PackageInput) => Promise<import("./packages").PackageMutationResult>;
  updatePackage: (
    packageId: string,
    patch: import("./packages").PackagePatch
  ) => Promise<import("./packages").PackageMutationResult>;
  addDiscountCampaign: (
    input: import("./discount-campaigns").DiscountCampaignInput
  ) => Promise<import("./discount-campaigns").DiscountCampaignMutationResult>;
  updateDiscountCampaign: (
    campaignId: string,
    patch: import("./discount-campaigns").DiscountCampaignPatch
  ) => Promise<import("./discount-campaigns").DiscountCampaignMutationResult>;
  markPaymentPaid: (
    paymentId: string,
    opts?: string | import("./store-json").MarkPaymentPaidOptions
  ) => Promise<AppData>;
  updatePayment: (paymentId: string, patch: import("./store-json").UpdatePaymentPatch) => Promise<AppData>;
  addRoom: (room: Omit<Room, "id">) => Promise<AppData>;
  /** ÖNCELİK 4 (devam) — oda düzenleme. */
  updateRoom: (
    roomId: string,
    patch: Partial<Pick<Room, "name" | "capacity" | "branchId" | "instruments" | "active" | "archivedAt">>
  ) => Promise<Room | null>;
  /** ÖNCELİK 4 (devam) — öğretmen arşivleme/geri alma (hard delete YOK). */
  archiveTeacher: (teacherId: string, archived: boolean) => Promise<Teacher | null>;
  addLesson: (input: {
    studentId: string;
    teacherId: string;
    roomId: string;
    instrument: Instrument;
    startAt: string;
    durationMinutes?: number;
    term?: StudentTermType;
    academicYearStart?: number;
    allowAvailabilityOverride?: boolean;
    overriddenByUserId?: string;
  }) => Promise<AppData>;
  addPayment: (input: {
    studentId: string;
    description: string;
    amount: number;
    dueDate: string;
  }) => Promise<AppData>;
  /**
   * ÖNCELİK 4 — Yoklama Takvimi aylık planlanan tutar. studentId+month
   * (yyyy-MM) başına TEK kayıt — idempotent upsert, asla "paid" yapmaz,
   * source:"monthly_plan" ile lesson_ops'tan ayrışır.
   */
  upsertMonthlyPlanPayment: (input: {
    studentId: string;
    month: string; // yyyy-MM
    amount: number;
    /** Ödeme tarihi (yyyy-MM-dd) — verilmezse ayın 1'i varsayılan kalır (mevcut davranış). */
    dueDate?: string;
    /** Ödeme şekli (nakit/kredi kartı/havale) — verilmezse mevcut/varsayılan değer korunur. */
    method?: string;
  }) => Promise<{ data: AppData; paymentId: string }>;
  /** Owner policy (2026-08-30) — kayıt tamamlanma anında tahsil edilen ilk ödeme; idempotent (bkz. store-json.ts). */
  addRegistrationFirstPayment: (input: {
    studentId: string;
    method: string;
    amount: number;
    collectedAt: string;
    reference?: string;
    note?: string;
    receivedByUserId: string;
  }) => Promise<{ data: AppData; paymentId: string }>;
  /**
   * FEATURE A — bir `StudentContract`'ın SABİT SAYIDA taksitini gerçek
   * `Payment` satırları olarak TEK seferde ekler (contractId/
   * installmentSequence ile etiketlenir). `upsertMonthlyPlanPayment`'tan
   * KASITLI OLARAK AYRI: o AÇIK UÇLU süregelen aylık faturalama, bu ise
   * BELİRLİ bir sözleşmenin sabit taksit planı (bkz. src/lib/contracts.ts).
   */
  addContractInstallments: (input: {
    contractId: string;
    studentId: string;
    installments: ContractInstallmentSnapshot[];
    /** Owner policy — kayıt esnasında tahsil edilen ilk ödeme; verilirse 1. taksit "paid" olarak yaratılır. Yalnızca renewal/amendment için (initial artık reuseFirstPaymentId kullanır). */
    firstPaymentCollected?: { method: string; amount: number; collectedAt: string; reference?: string; note?: string };
    /** P0 dedup fix (2026-08-30) — initial sözleşme için, kayıt sırasında zaten oluşturulan `registration_first_payment` Payment satırının id'si. Verilirse 1. taksit için YENİ satır yaratılmaz — mevcut satır contractId/installmentSequence ile bu sözleşmeye BAĞLANIR (tek gerçek Payment kaydı). */
    reuseFirstPaymentId?: string;
  }) => Promise<{ data: AppData; installments: ContractInstallmentView[] }>;
  /** P0 dedup fix (2026-08-30) — bir öğrencinin kayıt anında tahsil edilen ilk ödeme satırını bulur (bkz. addRegistrationFirstPayment). Sözleşme oluşturmanın bunu YENİDEN yaratması yerine BULUP yeniden kullanması için. */
  getRegistrationFirstPayment: (studentId: string) => Promise<Payment | null>;
  updateLessonSchedule: (input: {
    lessonId: string;
    startAt?: string;
    durationMinutes?: number;
  }) => Promise<AppData>;
  cancelLesson: (lessonId: string) => Promise<AppData>;
  startLessonLive: (lessonId: string) => Promise<LessonLiveUpdateResult>;
  endLessonLive: (lessonId: string) => Promise<LessonLiveUpdateResult>;
  applyLessonOpsFlagLive: (
    lessonId: string,
    flag: import("./lesson-ops").LessonOpsFlag,
    actorUserId: string
  ) => Promise<import("./lesson-ops").ApplyLessonOpsResult>;
  /** ÖNCELİK 4 (devam) — onaylı statü DEĞİŞİMİ (bkz. lesson-ops.ts switchLessonOpsFlag). */
  switchLessonOpsFlagLive: (
    lessonId: string,
    flag: import("./lesson-ops").LessonOpsFlag,
    actorUserId: string
  ) => Promise<import("./lesson-ops").ApplyLessonOpsResult>;
  /** Faz 2 — öğretmen yoklaması, öğrenci ops bayraklarından tamamen ayrı bir yol. */
  markTeacherAttendanceLive: (
    lessonId: string,
    status: import("./teacher-attendance").TeacherAttendanceStatus,
    actorUserId: string,
    note: string | undefined
  ) => Promise<ReturnType<typeof import("./teacher-attendance").markTeacherAttendance>>;
  /** Faz 13 — ders öğretmeni/şube değişimi. */
  reassignLessonTeacherOrBranchLive: (
    input: import("./lesson-reassignment").ReassignLessonInput
  ) => Promise<import("./lesson-reassignment").ReassignLessonResult>;
  correctLessonTimesLive: (
    lessonId: string,
    correction: LessonTimeCorrection
  ) => Promise<LessonLiveUpdateResult>;
  addBranch: (branch: Omit<Branch, "id">) => Promise<AppData>;
  updateBranch: (branchId: string, patch: Partial<Omit<Branch, "id">>) => Promise<AppData>;
  importBranches: (rows: BranchImportRow[]) => Promise<ImportCommitResult>;
  importTeachers: (rows: TeacherImportRow[]) => Promise<ImportCommitResult>;
  importRooms: (rows: RoomImportRow[]) => Promise<ImportCommitResult>;
  importStudents: (rows: StudentImportRow[]) => Promise<ImportCommitResult>;
  addLessonSeries: (
    params: SeriesParams,
    options?: { skipConflicts?: boolean; allowAvailabilityOverride?: boolean; overriddenByUserId?: string }
  ) => Promise<CreateSeriesResult>;
  cancelLessonSeriesFromLesson: (lessonId: string) => Promise<SeriesCancelResult>;
  cancelEntireLessonSeries: (seriesId: string) => Promise<SeriesCancelResult>;
  addTeacherFeeRule: (input: FeeRuleInput) => Promise<FeeRuleMutationResult>;
  updateTeacherFeeRule: (
    ruleId: string,
    patch: Partial<Omit<TeacherFeeRule, "id" | "createdAt">>
  ) => Promise<FeeRuleMutationResult>;
  createTeacherPayout: (
    teacherId: string,
    periodStart: string,
    periodEnd: string,
    paymentMethodOverride?: TeacherPayoutPaymentMethod
  ) => Promise<CreateTeacherPayoutResult>;
  markTeacherPayoutPaid: (payoutId: string, method?: string) => Promise<MarkPayoutPaidResult>;
  updateTeacherPayoutPaymentMethod: (
    payoutId: string,
    method: TeacherPayoutPaymentMethod
  ) => Promise<UpdateTeacherPayoutPaymentMethodResult>;
  updateFeeRoundingMode: (feeRoundingMode: FeeRoundingMode) => Promise<AppData>;
  updateMakeupWindowDays: (makeupWindowDays: number) => Promise<AppData>;
  updateMonthlyMakeupAllowance: (monthlyMakeupAllowance: number) => Promise<AppData>;
  updateCollectionsSettings: (collectionsSettings: CollectionsSettings) => Promise<AppData>;
  updateTermWeeklyClosedDays: (termWeeklyClosedDays: { guz: number[]; yaz: number[] }) => Promise<AppData>;
  updateConsentSettings: (consentSettings: ConsentSettings) => Promise<AppData>;
  getDashboardStats: (data: AppData) => ReturnType<typeof jsonStore.getDashboardStats>;
  listTenants: () => Promise<{ tenantId: string; name: string }[]>;
};

function getStore(): StoreApi {
  if (STORE_MODE === "db") {
    // Lazy require: json deploy'da Prisma adapter yüklenmesin
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./store-db") as StoreApi;
  }
  if (STORE_MODE === "memory") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./store-memory") as StoreApi;
  }
  return jsonStore;
}

const store = getStore();

/** Bind tenant from ALS or authenticated web session */
async function withTenantScope<T>(fn: () => Promise<T>): Promise<T> {
  const { tryTenantId, runWithTenantAsync } = await import("./tenant-context");
  if (tryTenantId()) return fn();

  try {
    const { getSessionContext } = await import("./auth/session");
    const session = await getSessionContext();
    if (session?.tenantId) {
      return runWithTenantAsync(session.tenantId, fn);
    }
  } catch {
    // no session (public / build)
  }

  const { DEFAULT_TENANT_ID } = await import("./auth/config");
  return runWithTenantAsync(DEFAULT_TENANT_ID, fn);
}

export async function readData(): Promise<AppData> {
  const data = await withTenantScope(() => store.readData());
  return applyMakeupExpiry(data);
}

/** Platformda erişilebilir tüm kurumları (tenant) listeler — kurum seçici bunu kullanır. */
export async function listTenants(): Promise<{ tenantId: string; name: string }[]> {
  return store.listTenants();
}

/**
 * Süresi geçmiş (expiresAt < şimdi) ama hâlâ pending/suggested olan telafi
 * taleplerini "expired" olarak gösterir. Salt okunur türetme — kalıcı kaydı
 * değiştirmez, dashboard ve Telafi Merkezi'nin süresi dolmuş talepleri açık
 * talep gibi saymasını engeller.
 */
function applyMakeupExpiry(data: AppData): AppData {
  const now = Date.now();
  const makeupRequests = data.makeupRequests.map((m) =>
    (m.status === "pending" || m.status === "suggested" || m.status === "awaiting_info") &&
    new Date(m.expiresAt).getTime() < now
      ? { ...m, status: "expired" as const }
      : m
  );
  return { ...data, makeupRequests };
}

export async function resetData(): Promise<AppData> {
  return withTenantScope(() => store.resetData());
}

/**
 * Kurulum Merkezi — "Boş şablona sıfırla". Demo verisinden ayrı, ayrık bir
 * eylem: mevcut kurum kimliğini (tenantId/ad) korur ama tüm demo
 * öğretmen/öğrenci/ders/ödeme kayıtlarını temizler.
 */
export async function resetToCleanTemplate(): Promise<AppData> {
  return withTenantScope(() => store.resetToCleanTemplate());
}

export async function markAttendance(input: {
  lessonId: string;
  status: AttendanceStatus;
  reason?: string;
}): Promise<AppData> {
  return withTenantScope(() => store.markAttendance(input));
}

export async function generateSuggestions(
  requestId: string,
  options?: { maxSlots?: number }
): Promise<AppData> {
  return withTenantScope(() => store.generateSuggestions(requestId, options));
}

export async function confirmSlot(
  requestId: string,
  slot: MakeupSlot,
  decision: MakeupDecision
): Promise<AppData> {
  return withTenantScope(() => store.confirmSlot(requestId, slot, decision));
}

export async function cancelMakeup(requestId: string, decision: MakeupDecision): Promise<AppData> {
  return withTenantScope(() => store.cancelMakeup(requestId, decision));
}

export async function updateMakeupSlaEscalation(requestId: string, level: number): Promise<AppData> {
  return withTenantScope(() => store.updateMakeupSlaEscalation(requestId, level));
}

export async function addStudent(
  student: Omit<Student, "id" | "createdAt" | "active">
): Promise<AppData> {
  return withTenantScope(() => store.addStudent(student));
}

export async function updateStudentProfile(
  studentId: string,
  patch: StudentProfilePatch
): Promise<AppData> {
  return withTenantScope(() => store.updateStudentProfile(studentId, patch));
}

export async function setStudentPaymentPause(studentId: string, state: StudentPaymentPauseState): Promise<AppData> {
  return withTenantScope(() => store.setStudentPaymentPause(studentId, state));
}

export async function addTeacher(
  teacher: Omit<Teacher, "id" | "active" | "color">
): Promise<AppData> {
  return withTenantScope(() => store.addTeacher(teacher));
}

export async function updateTeacherAvailability(
  teacherId: string,
  availability: Teacher["availability"]
): Promise<Teacher | null> {
  return withTenantScope(() => store.updateTeacherAvailability(teacherId, availability));
}

export async function updateTeacherInstruments(
  teacherId: string,
  instruments: Teacher["instruments"],
  instrumentLevels: Teacher["instrumentLevels"]
): Promise<Teacher | null> {
  return withTenantScope(() => store.updateTeacherInstruments(teacherId, instruments, instrumentLevels));
}

export async function updateTeacherProfile(
  teacherId: string,
  patch: TeacherProfilePatch
): Promise<Teacher | null> {
  return withTenantScope(() => store.updateTeacherProfile(teacherId, patch));
}

export async function addPackage(
  input: import("./packages").PackageInput
): Promise<import("./packages").PackageMutationResult> {
  return withTenantScope(() => store.addPackage(input));
}

export async function updatePackage(
  packageId: string,
  patch: import("./packages").PackagePatch
): Promise<import("./packages").PackageMutationResult> {
  return withTenantScope(() => store.updatePackage(packageId, patch));
}

export async function addDiscountCampaign(
  input: import("./discount-campaigns").DiscountCampaignInput
): Promise<import("./discount-campaigns").DiscountCampaignMutationResult> {
  return withTenantScope(() => store.addDiscountCampaign(input));
}

export async function updateDiscountCampaign(
  campaignId: string,
  patch: import("./discount-campaigns").DiscountCampaignPatch
): Promise<import("./discount-campaigns").DiscountCampaignMutationResult> {
  return withTenantScope(() => store.updateDiscountCampaign(campaignId, patch));
}

export async function markPaymentPaid(
  paymentId: string,
  opts?: string | import("./store-json").MarkPaymentPaidOptions
): Promise<AppData> {
  return withTenantScope(() => store.markPaymentPaid(paymentId, opts));
}

export async function updatePayment(
  paymentId: string,
  patch: import("./store-json").UpdatePaymentPatch
): Promise<AppData> {
  return withTenantScope(() => store.updatePayment(paymentId, patch));
}

export async function addRoom(room: Omit<Room, "id">): Promise<AppData> {
  return withTenantScope(() => store.addRoom(room));
}

export async function updateRoom(
  roomId: string,
  patch: Partial<Pick<Room, "name" | "capacity" | "branchId" | "instruments" | "active" | "archivedAt">>
): Promise<Room | null> {
  return withTenantScope(() => store.updateRoom(roomId, patch));
}

export async function archiveTeacher(teacherId: string, archived: boolean): Promise<Teacher | null> {
  return withTenantScope(() => store.archiveTeacher(teacherId, archived));
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
  return withTenantScope(() => store.addLesson(input));
}

export async function addPayment(input: {
  studentId: string;
  description: string;
  amount: number;
  dueDate: string;
}): Promise<AppData> {
  return withTenantScope(() => store.addPayment(input));
}

export async function addContractInstallments(input: {
  contractId: string;
  studentId: string;
  installments: ContractInstallmentSnapshot[];
  firstPaymentCollected?: { method: string; amount: number; collectedAt: string; reference?: string; note?: string };
  reuseFirstPaymentId?: string;
}): Promise<{ data: AppData; installments: ContractInstallmentView[] }> {
  return withTenantScope(() => store.addContractInstallments(input));
}

/** P0 dedup fix (2026-08-30) — bkz. StoreApi.getRegistrationFirstPayment. */
export async function getRegistrationFirstPayment(studentId: string): Promise<Payment | null> {
  return withTenantScope(() => store.getRegistrationFirstPayment(studentId));
}

export async function upsertMonthlyPlanPayment(input: {
  studentId: string;
  month: string;
  amount: number;
  dueDate?: string;
  method?: string;
}): Promise<{ data: AppData; paymentId: string }> {
  return withTenantScope(() => store.upsertMonthlyPlanPayment(input));
}

/** Owner policy (2026-08-30) — bkz. store-json.ts addRegistrationFirstPayment. */
export async function addRegistrationFirstPayment(input: {
  studentId: string;
  method: string;
  amount: number;
  collectedAt: string;
  reference?: string;
  note?: string;
  receivedByUserId: string;
}): Promise<{ data: AppData; paymentId: string }> {
  return withTenantScope(() => store.addRegistrationFirstPayment(input));
}

export async function updateLessonSchedule(input: {
  lessonId: string;
  startAt?: string;
  durationMinutes?: number;
}): Promise<AppData> {
  return withTenantScope(() => store.updateLessonSchedule(input));
}

export async function cancelLesson(lessonId: string): Promise<AppData> {
  return withTenantScope(() => store.cancelLesson(lessonId));
}

export async function startLessonLive(lessonId: string): Promise<LessonLiveUpdateResult> {
  return withTenantScope(() => store.startLessonLive(lessonId));
}

export async function endLessonLive(lessonId: string): Promise<LessonLiveUpdateResult> {
  return withTenantScope(() => store.endLessonLive(lessonId));
}

export async function applyLessonOpsFlagLive(
  lessonId: string,
  flag: import("./lesson-ops").LessonOpsFlag,
  actorUserId: string
): Promise<import("./lesson-ops").ApplyLessonOpsResult> {
  return withTenantScope(() => store.applyLessonOpsFlagLive(lessonId, flag, actorUserId));
}

export async function switchLessonOpsFlagLive(
  lessonId: string,
  flag: import("./lesson-ops").LessonOpsFlag,
  actorUserId: string
): Promise<import("./lesson-ops").ApplyLessonOpsResult> {
  return withTenantScope(() => store.switchLessonOpsFlagLive(lessonId, flag, actorUserId));
}

/** Faz 2 — öğretmen yoklaması, öğrenci ops bayraklarından tamamen ayrı bir yol. */
export async function markTeacherAttendanceLive(
  lessonId: string,
  status: import("./teacher-attendance").TeacherAttendanceStatus,
  actorUserId: string,
  note: string | undefined
): Promise<ReturnType<typeof import("./teacher-attendance").markTeacherAttendance>> {
  return withTenantScope(() => store.markTeacherAttendanceLive(lessonId, status, actorUserId, note));
}

/** Faz 13 — ders öğretmeni/şube değişimi. */
export async function reassignLessonTeacherOrBranchLive(
  input: import("./lesson-reassignment").ReassignLessonInput
): Promise<import("./lesson-reassignment").ReassignLessonResult> {
  return withTenantScope(() => store.reassignLessonTeacherOrBranchLive(input));
}

export async function correctLessonTimesLive(
  lessonId: string,
  correction: LessonTimeCorrection
): Promise<LessonLiveUpdateResult> {
  return withTenantScope(() => store.correctLessonTimesLive(lessonId, correction));
}

export async function addBranch(branch: Omit<Branch, "id">): Promise<AppData> {
  return withTenantScope(() => store.addBranch(branch));
}

export async function updateBranch(
  branchId: string,
  patch: Partial<Omit<Branch, "id">>
): Promise<AppData> {
  return withTenantScope(() => store.updateBranch(branchId, patch));
}

export async function importBranches(rows: BranchImportRow[]): Promise<ImportCommitResult> {
  return withTenantScope(() => store.importBranches(rows));
}

export async function importTeachers(rows: TeacherImportRow[]): Promise<ImportCommitResult> {
  return withTenantScope(() => store.importTeachers(rows));
}

export async function importRooms(rows: RoomImportRow[]): Promise<ImportCommitResult> {
  return withTenantScope(() => store.importRooms(rows));
}

export async function importStudents(rows: StudentImportRow[]): Promise<ImportCommitResult> {
  return withTenantScope(() => store.importStudents(rows));
}

export async function addLessonSeries(
  params: SeriesParams,
  options?: { skipConflicts?: boolean; allowAvailabilityOverride?: boolean; overriddenByUserId?: string }
): Promise<CreateSeriesResult> {
  return withTenantScope(() => store.addLessonSeries(params, options));
}

export async function cancelLessonSeriesFromLesson(lessonId: string): Promise<SeriesCancelResult> {
  return withTenantScope(() => store.cancelLessonSeriesFromLesson(lessonId));
}

export async function cancelEntireLessonSeries(seriesId: string): Promise<SeriesCancelResult> {
  return withTenantScope(() => store.cancelEntireLessonSeries(seriesId));
}

export async function addTeacherFeeRule(input: FeeRuleInput): Promise<FeeRuleMutationResult> {
  return withTenantScope(() => store.addTeacherFeeRule(input));
}

export async function updateTeacherFeeRule(
  ruleId: string,
  patch: Partial<Omit<TeacherFeeRule, "id" | "createdAt">>
): Promise<FeeRuleMutationResult> {
  return withTenantScope(() => store.updateTeacherFeeRule(ruleId, patch));
}

export async function createTeacherPayout(
  teacherId: string,
  periodStart: string,
  periodEnd: string,
  paymentMethodOverride?: TeacherPayoutPaymentMethod
): Promise<CreateTeacherPayoutResult> {
  return withTenantScope(() =>
    store.createTeacherPayout(teacherId, periodStart, periodEnd, paymentMethodOverride)
  );
}

export async function updateTeacherPayoutPaymentMethod(
  payoutId: string,
  method: TeacherPayoutPaymentMethod
): Promise<UpdateTeacherPayoutPaymentMethodResult> {
  return withTenantScope(() => store.updateTeacherPayoutPaymentMethod(payoutId, method));
}

export async function markTeacherPayoutPaid(
  payoutId: string,
  method?: string
): Promise<MarkPayoutPaidResult> {
  return withTenantScope(() => store.markTeacherPayoutPaid(payoutId, method));
}

export async function updateFeeRoundingMode(feeRoundingMode: FeeRoundingMode): Promise<AppData> {
  return withTenantScope(() => store.updateFeeRoundingMode(feeRoundingMode));
}

export async function updateMakeupWindowDays(makeupWindowDays: number): Promise<AppData> {
  return withTenantScope(() => store.updateMakeupWindowDays(makeupWindowDays));
}

export async function updateMonthlyMakeupAllowance(monthlyMakeupAllowance: number): Promise<AppData> {
  return withTenantScope(() => store.updateMonthlyMakeupAllowance(monthlyMakeupAllowance));
}

export async function updateCollectionsSettings(
  collectionsSettings: CollectionsSettings
): Promise<AppData> {
  return withTenantScope(() => store.updateCollectionsSettings(collectionsSettings));
}

export async function updateConsentSettings(consentSettings: ConsentSettings): Promise<AppData> {
  return withTenantScope(() => store.updateConsentSettings(consentSettings));
}

export async function updateTermWeeklyClosedDays(
  termWeeklyClosedDays: { guz: number[]; yaz: number[] }
): Promise<AppData> {
  return withTenantScope(() => store.updateTermWeeklyClosedDays(termWeeklyClosedDays));
}

export function getDashboardStats(data: AppData) {
  return store.getDashboardStats(data);
}
