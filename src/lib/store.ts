import type { DemoSeedInput, DemoSeedResult } from "./demo-seed";
import type {
  DashboardData,
  LessonWindowData,
  MakeupCenterData,
  PaymentsPageData,
  PayoutWindowData,
  ReferenceData,
  StudentListData,
  StudentScopeData,
} from "./reference-data";
import { STORE_MODE } from "./config";
import { PLATFORM_TENANT_ID } from "./auth/config";
import { closeExpiredUnplannedMakeups } from "./makeup-lifecycle";
import { patchTouchesEnrollmentTerms, routeTermPatch, splitTermPatch } from "./student-enrollments";
import * as jsonStore from "./store-json";
import * as dbStore from "./store-db";
import * as memoryStore from "./store-memory";
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
  StudentDeletionState,
  TeacherDeletionState,
  StudentTermType,
  Teacher,
  TeacherFeeRule,
  TeacherProfilePatch,
  TeacherPayout,
} from "./types";
import type { BranchImportRow } from "./import/branches";
import type { TeacherImportRow } from "./import/teachers";
import type { RoomImportRow } from "./import/rooms";
import type { StudentImportRow } from "./import/students";
import type { ImportCommitResult } from "./import/commit-result";
import type { AcademicTermDates } from "./academic-term-dates";
import type { CreateSeriesResult, SeriesCancelResult, SeriesParams } from "./lesson-series";
import type { LessonDeletionPlan, LessonEditScope, LessonRevisionInput, LessonRevisionResult } from "./lesson-scope-edit";
import type {
  FeeRuleInput,
  FeeRuleMutationResult,
  CreateTeacherPayoutResult,
  MarkPayoutPaidResult,
  TeacherPayoutPaymentMethod,
  UpdateTeacherPayoutPaymentMethodResult,
} from "./teacher-payout";
import type { MakeupDecision } from "./makeup-engine";
import type { LessonScheduleUpdateOutcome } from "./lesson-update";
import type { LessonTimeCorrection, LessonLiveUpdateResult } from "./lesson-live-status";

/** E-posta/davet şablonları için kurum adı + iletişim + logo (DB egress 2026-10-18: tam okuma yerine tek satır). */
export type SchoolBranding = { name: string; phone: string; website: string; logoUrl: string };

export type TeacherPortalDetails = {
  teacherId: string;
  teacherName: string;
  contactEmail: string;
  institutionName: string;
  schoolPhone: string;
  schoolWebsite: string;
  logoUrl: string;
};

type StoreApi = {
  // DB egress (2026-09-30): yazma sonucunu hiçbir çağıranın kullanmadığı mutasyonlar `AppData | void`
  // döner — json/memory veriyi zaten elinde tuttuğu için döndürebilir, db yazmadan sonra kurumun
  // tamamını YENİDEN OKUMAZ. Genel sarmalayıcılar (aşağıda) `void` döner; sonuca ihtiyaç varsa okuyun.
  readData: () => Promise<AppData>;
  resetData: () => Promise<AppData | void>;
  resetToCleanTemplate: () => Promise<AppData | void>;
  markAttendance: (input: {
    lessonId: string;
    status: AttendanceStatus;
    reason?: string;
  }) => Promise<AppData | void>;
  generateSuggestions: (requestId: string, options?: { maxSlots?: number }) => Promise<Pick<AppData, "makeupRequests">>;
  confirmSlot: (requestId: string, slot: MakeupSlot, decision: MakeupDecision) => Promise<AppData | void>;
  cancelMakeup: (requestId: string, decision: MakeupDecision) => Promise<AppData | void>;
  updateMakeupSlaEscalation: (requestId: string, level: number) => Promise<AppData | void>;
  addStudent: (student: Omit<Student, "id" | "createdAt" | "active">) => Promise<AppData | void>;
  updateStudentProfile: (studentId: string, patch: StudentProfilePatch) => Promise<AppData | void>;
  /**
   * 2026-10-10 — YENİ ÖĞRENCİ KAYDI TEK İŞLEMDE: öğrenci + tüm branş kayıtları + her branşın ilk tahsilatı. Yarım kayıt
   * bırakmaz (db: tek transaction; json/memory: tek kilitli yazım). Aynı `registrationId` ikinci öğrenci/ödeme yaratmaz.
   */
  registerStudent: (input: import("./student-enrollments").RegisterStudentInput) => Promise<import("./student-enrollments").RegisterStudentResult>;
  /**
   * 2026-10-10 — branş listesinde ATOMİK değişiklik (ekle / değiştir / koşul yaz) + öğrenci satırı aynası (+ eklemede ilk
   * tahsilat). db'de öğrenci başına advisory kilit + taze okuma: eşzamanlı iki işlem birbirini ezmez.
   */
  changeStudentEnrollments: (
    input: import("./student-enrollments").ChangeStudentEnrollmentsInput
  ) => Promise<import("./student-enrollments").ChangeStudentEnrollmentsResult>;
  /** MEB Paneli — sunucu-taraflı filtre/sıralama/sayfalama (üç modda AYNI semantik). */
  listMebStudents: (query: import("./meb-list").MebStudentQuery) => Promise<import("./meb-list").MebStudentListResult>;
  setStudentPaymentPause: (studentId: string, state: StudentPaymentPauseState) => Promise<AppData | void>;
  addTeacher: (teacher: Omit<Teacher, "id" | "active" | "color">) => Promise<AppData | void>;
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
  deletePackage: (packageId: string, expectedUpdatedAt: string) => Promise<import("./packages").PackageDeleteResult>;
  addDiscountCampaign: (
    input: import("./discount-campaigns").DiscountCampaignInput
  ) => Promise<import("./discount-campaigns").DiscountCampaignMutationResult>;
  updateDiscountCampaign: (
    campaignId: string,
    patch: import("./discount-campaigns").DiscountCampaignPatch
  ) => Promise<import("./discount-campaigns").DiscountCampaignMutationResult>;
  deletePaymentRow: (paymentId: string) => Promise<AppData>;
  markPaymentPaid: (
    paymentId: string,
    opts?: string | import("./store-json").MarkPaymentPaidOptions
  ) => Promise<AppData>;
  updatePayment: (paymentId: string, patch: import("./store-json").UpdatePaymentPatch) => Promise<AppData>;
  addRoom: (room: Omit<Room, "id">) => Promise<AppData | void>;
  /** ÖNCELİK 4 (devam) — oda düzenleme. */
  updateRoom: (
    roomId: string,
    patch: Partial<Pick<Room, "name" | "capacity" | "branchId" | "instruments" | "active" | "archivedAt" | "deletedAt">>
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
    createdByUserId?: string;
    enrollmentId?: string;
  }) => Promise<string>;
  addClubSessionLessons: (rows: import("./types").Lesson[]) => Promise<void>;
  addGroupLessonRows: (rows: import("./types").Lesson[]) => Promise<void>;
  patchClubLessons: (ids: string[], patch: import("./clubs").ClubLessonPatch) => Promise<number>;
  addPayment: (input: {
    studentId: string;
    description: string;
    amount: number;
    dueDate: string;
    id?: string;
    source?: import("./types").PaymentSource;
    clubMembershipId?: string;
    installmentPeriodLabel?: string;
    enrollmentId?: string;
  }) => Promise<AppData | void>;
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
    /** Ödeme şekli (nakit/kredi kartı/havale) — verilmezse mevcut/varsayılan değer korunur. */
    method?: string;
    /** 2026-10-09 — dönem ayı satırı branş başınadır (bkz. student-enrollments.ts EnrollmentScope). */
    enrollmentId?: string;
    includeUnlinked?: boolean;
  }) => Promise<{ paymentId: string }>;
  /** Owner policy (2026-08-30) — kayıt tamamlanma anında tahsil edilen ilk ödeme; idempotent (bkz. store-json.ts). */
  addRegistrationFirstPayment: (input: {
    studentId: string;
    method: string;
    amount: number;
    collectedAt: string;
    reference?: string;
    note?: string;
    receivedByUserId: string;
    /** Bkz. Payment.firstCollectionIncludesNextMonth — kayıt ekranındaki açık seçim. */
    firstCollectionIncludesNextMonth?: boolean;
    /** 2026-10-09 — branş kaydı; idempotency öğrenci + branş başınadır. */
    enrollmentId?: string;
  }) => Promise<{ paymentId: string }>;
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
    /** 2026-10-09 — sözleşmenin branş kaydı; taksit satırlarına aynen yazılır. */
    enrollmentId?: string;
  }) => Promise<{ installments: ContractInstallmentView[] }>;
  /** P0 dedup fix (2026-08-30) — bir öğrencinin kayıt anında tahsil edilen ilk ödeme satırını bulur (bkz. addRegistrationFirstPayment). Sözleşme oluşturmanın bunu YENİDEN yaratması yerine BULUP yeniden kullanması için. */
  getRegistrationFirstPayment: (studentId: string, scope?: import("./student-enrollments").EnrollmentScope) => Promise<Payment | null>;
  /** 2026-10-09 — bağsız (NULL) kayıtları tek branş kaydına bağlar (bkz. store-db.ts). */
  linkRecordsToEnrollment: (input: {
    studentId: string;
    enrollmentId: string;
    instrument?: string;
    scope?: "student";
    contractIds?: string[];
    paymentIds?: string[];
  }) => Promise<{ payments: number; lessons: number; series: number }>;
  /**
   * P0 mutasyon performansı (2026-09-07) — tam `AppData` DEĞİL, yalnız
   * güncellenmiş ders + önceki başlangıç döner (bkz. lesson-update.ts
   * `LessonScheduleUpdateOutcome`). Doğrulama hatası artık FIRLATMAZ, sonuç
   * nesnesinde döner; yalnız eşzamanlılık çakışması hâlâ fırlatır.
   */
  updateLessonSchedule: (input: {
    lessonId: string;
    startAt?: string;
    durationMinutes?: number;
  }) => Promise<LessonScheduleUpdateOutcome>;
  /**
   * Dar okuma — tek ders mutasyonu için gereken en küçük `AppData` dilimi
   * (bkz. src/lib/lesson-scope.ts). Tenant'ın tamamını OKUMAZ.
   */
  readLessonScope: (lessonId: string, targetStartAt?: string) => Promise<AppData | null>;
  /** Dar okuma — tek öğrenci satırı; `readData().students.find(id)` ile aynı sonuç. */
  /**
   * Dar okuma — YENİ ders/seri doğrulaması (`validateLessonSlot`) dilimi: öğrenci/öğretmen/oda + öğrencinin
   * tüm dersleri + öğretmen/odanın verilen günlerdeki (±1) dersleri (bkz. lesson-scope.ts `narrowSlotScope`).
   */
  readLessonSeriesForStudent: (studentId: string) => Promise<import("./types").LessonSeries[]>;
  readLessonSeriesByIds: (seriesIds: string[]) => Promise<import("./types").LessonSeries[]>;
  readSlotScopeData: (target: import("./lesson-scope").SlotScopeTarget, days?: Date[]) => Promise<AppData>;
  readStudentById: (studentId: string) => Promise<Student | undefined>;
  /** DB egress (2026-10-18) — yalnız şube satırları (`readData().settings.branches` ile aynı). */
  readBranches: () => Promise<AppData["settings"]["branches"]>;
  readNationalIdCandidates: (last2: string) => Promise<{ id: string; nationalIdCipher: string }[]>;
  readLessonById: (lessonId: string) => Promise<import("./types").Lesson | undefined>;
  readLessonsStartingBetween: (fromIso: string, toIso: string) => Promise<import("./types").Lesson[]>;
  readLessonsForTeacher: (teacherId: string) => Promise<import("./types").Lesson[]>;
  readTeacherAttendanceRows: () => Promise<import("./insights/teacher-performance").TeacherAttendanceRow[]>;
  readMobileDashboardCounts: (now: Date) => Promise<import("./dashboard/mobile-counts").MobileDashboardCounts>;
  readTeacherPayoutsForTeacher: (teacherId: string) => Promise<import("./types").TeacherPayout[]>;
  readPaymentById: (paymentId: string) => Promise<import("./types").Payment | undefined>;
  readTeacherPortalDetails: (teacherId: string) => Promise<TeacherPortalDetails | null>;
  readSchoolBranding: () => Promise<SchoolBranding>;
  /** Dar okuma — referans dilimi (bkz. src/lib/reference-data.ts); ders/ödeme/yoklama/telafi yok. */
  readReferenceData: () => Promise<ReferenceData>;
  /** Dar okuma — tek öğrenci dilimi (bkz. src/lib/reference-data.ts `narrowToStudentScope`). */
  readStudentScope: (studentId: string) => Promise<StudentScopeData>;
  /** Dar okuma — referans veri + [from, to] penceresindeki dersler (Ders Programı). */
  readLessonWindow: (fromIso: string, toIso: string, opts?: import("./reference-data").ClubOnlyOptions) => Promise<LessonWindowData>;
  /** Dar okuma — referans veri + tüm dersler (`linked`: yalnız taleplerin dersleri) + tüm telafi talepleri. */
  readMakeupCenterData: (opts?: import("./reference-data").MakeupCenterOptions) => Promise<MakeupCenterData>;
  /** Dar okuma — referans veri + ödeme durum alanları (Öğrenciler listesi). */
  readStudentListData: () => Promise<StudentListData>;
  /** Dar okuma — referans veri + tüm ödemeler + yalnız ödemelere bağlı dersler (Ödemeler). */
  readPaymentsPageData: (opts?: import("./reference-data").ClubOnlyOptions) => Promise<PaymentsPageData>;
  readPaymentsListData: () => Promise<import("./reference-data").PaymentsListData>;
  /** Dar okuma — hakediş penceresi: [from, to] dersleri + kayıtlı hakedişler + hariç tutmalar. */
  readPayoutWindow: (fromIso: string, toIso: string) => Promise<PayoutWindowData>;
  /** Dar okuma — Panel özeti (bkz. reference-data.ts `DashboardData`). */
  readDashboardData: (fromIso: string, toIso: string, nowIso: string) => Promise<DashboardData>;
  cancelLesson: (lessonId: string) => Promise<AppData | void>;
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
    actorUserId: string,
    reason?: string,
    disruption?: import("./lesson-disruption").LessonDisruptionInput,
    attendanceNote?: string | null
  ) => Promise<import("./lesson-ops").ApplyLessonOpsResult>;
  setLessonAttendanceNoteLive: (
    lessonId: string,
    note: string | null
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
  commitMakeupPlanningExpiry: (now?: Date) => Promise<void>;
  previewMakeupLifecycle: (
    op: import("./makeup-lifecycle").MakeupLifecycleOp
  ) => Promise<import("./makeup-lifecycle").MakeupLifecycleResult>;
  applyMakeupLifecycle: (
    op: import("./makeup-lifecycle").MakeupLifecycleOp
  ) => Promise<import("./makeup-lifecycle").MakeupLifecycleResult>;
  clearLessonOpsFlagLive: (
    lessonId: string,
    expected: import("./lesson-ops").LessonOpsFlag,
    actorUserId: string
  ) => Promise<import("./lesson-ops").ClearLessonOpsResult>;
  setLessonDisruptionLive: (
    lessonId: string,
    patch: import("./lesson-disruption").LessonDisruptionPatch
  ) => Promise<import("./types").Lesson | null>;
  /** Faz 13 — ders öğretmeni/şube değişimi. */
  reassignLessonTeacherOrBranchLive: (
    input: import("./lesson-reassignment").ReassignLessonInput
  ) => Promise<import("./lesson-reassignment").ReassignLessonResult>;
  correctLessonTimesLive: (
    lessonId: string,
    correction: LessonTimeCorrection
  ) => Promise<LessonLiveUpdateResult>;
  addBranch: (branch: Omit<Branch, "id">) => Promise<AppData | void>;
  updateBranch: (branchId: string, patch: Partial<Omit<Branch, "id">>) => Promise<AppData | void>;
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
  /** 2026-09-17 — hatalı planlanmış dersleri kapsamla SİL (korunan dersler atlanır). */
  deleteLessonsScoped: (lessonId: string, scope: LessonEditScope) => Promise<LessonDeletionPlan>;
  forceDeleteLesson: (lessonId: string) => Promise<import("./lesson-scope-edit").ForcedLessonDeletionPlan>;
  /** 2026-09-17 — dersleri kapsamla REVİZE ET (saat/gün/süre). */
  reviseLessonsScoped: (input: LessonRevisionInput) => Promise<LessonRevisionResult>;
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
  replaceTeacherPayout: (payout: TeacherPayout) => Promise<AppData | void>;
  deleteTeacherPayout: (payoutId: string) => Promise<boolean>;
  deleteTeacherFeeRule: (ruleId: string) => Promise<boolean>;
  addTeacherPayoutExclusion: (x: import("./types").TeacherPayoutExclusion) => Promise<void>;
  removeTeacherPayoutExclusion: (lessonId: string) => Promise<boolean>;
  setTeacherPayoutPolicy: (
    input: import("./teacher-payout").SetPayoutPolicyInput,
    actorUserId: string
  ) => Promise<import("./teacher-payout").SetPayoutPolicyResult>;
  updateTeacherPayoutPaymentMethod: (
    payoutId: string,
    method: TeacherPayoutPaymentMethod
  ) => Promise<UpdateTeacherPayoutPaymentMethodResult>;
  updateFeeRoundingMode: (feeRoundingMode: FeeRoundingMode) => Promise<AppData>;
  setStudentDeletion: (studentId: string, state: StudentDeletionState) => Promise<AppData | void>;
  setTeacherDeletion: (teacherId: string, state: TeacherDeletionState) => Promise<AppData | void>;
  loadPurgeSnapshot: (kind: import("./person-purge").PurgeKind, id: string) => Promise<import("./person-purge").PurgeSnapshot | null>;
  executePurge: (
    kind: import("./person-purge").PurgeKind,
    id: string,
    expectedFingerprint: string,
    mode?: import("./person-purge").PurgeMode,
    opts?: import("./person-purge").WipeOptions
  ) => Promise<import("./person-purge-db").PurgeExecResult>;
  updatePerformanceWeights: (
    performanceWeights: import("./performance-weights").PerformanceWeightsConfig
  ) => Promise<AppData>;
  updateMakeupWindowDays: (makeupWindowDays: number) => Promise<AppData>;
  updateMonthlyMakeupAllowance: (monthlyMakeupAllowance: number) => Promise<AppData>;
  updateCollectionsSettings: (collectionsSettings: CollectionsSettings) => Promise<AppData | void>;
  updateTermWeeklyClosedDays: (termWeeklyClosedDays: { guz: number[]; yaz: number[] }) => Promise<AppData>;
  updateAcademicTermDates: (academicTermDates: AcademicTermDates) => Promise<AppData | void>;
  updateConsentSettings: (consentSettings: ConsentSettings) => Promise<AppData | void>;
  updateSchoolLogoUrl: (logoUrl: string) => Promise<AppData>;
  getDashboardStats: (data: AppData) => ReturnType<typeof jsonStore.getDashboardStats>;
  listTenants: () => Promise<{ tenantId: string; name: string }[]>;
  /** Demo/QA seed kapısı — bkz. demo-seed.ts. Uygulama kodundan çağrılmaz. */
  seedDemoRecords: (input: DemoSeedInput) => Promise<DemoSeedResult>;
};

/**
 * Üç backend de STATİK import edilir ve `satisfies` ile derleme zamanında aynı
 * sözleşmeye (StoreApi) bağlanır.
 *
 * Neden `require()` DEĞİL: eskiden db/memory backend'leri `require("./store-db")`
 * ile çıplak çağrılıyordu. Turbopack (Next 16) bu çağrıyı production server
 * bundle'ında ÇÖZMÜYOR — modülü hiç emit etmiyor, uyarı da vermiyor. Sonuç:
 * `STORE_MODE=db` deploy'unda `store` boş kalıyordu ve /panel'in ilk store
 * çağrısı `store.listTenants is not a function` ile 500 veriyordu. `as StoreApi`
 * cast'i de aynı anda tip kontrolünü susturuyordu. Prisma zaten Tool Layer'dan
 * (`services/tools.ts` → `./db`) her deploy'da yükleniyor; `./db`'deki istemci
 * tembel bir Proxy olduğu için statik import bağlantı AÇMAZ.
 */
const STORES = {
  json: jsonStore,
  db: dbStore,
  memory: memoryStore,
} satisfies Record<typeof STORE_MODE, StoreApi>;

const store: StoreApi = STORES[STORE_MODE];

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
  // Çalışma günü istisnaları (closedDayOverrides) her store modunun kendi readData'sında eklenir
  // (bkz. withClosedDayOverrides) — store içi doğrulama da aynı veriyi görsün diye.
  const data = await withTenantScope(async () => {
    await store.commitMakeupPlanningExpiry(new Date());
    return store.readData();
  });
  return applyMakeupExpiry(data);
}

/** Platformda erişilebilir tüm kurumları (tenant) listeler — kurum seçici bunu kullanır. */
export async function listTenants(): Promise<{ tenantId: string; name: string }[]> {
  return store.listTenants();
}

/**
 * Okul verisi olan kurumlar — kurum başına `readData()` yapan zamanlanmış işler bunu kullanır.
 * NeviiOS platform tenant'ının (`PLATFORM_TENANT_ID`) okul kaydı YOKTUR; canlıda onun için
 * `readData()` bilerek hata fırlatır (2026-10-15: notification-tick her turda 500).
 */
export async function listSchoolTenants(): Promise<{ tenantId: string; name: string }[]> {
  return (await store.listTenants()).filter((t) => t.tenantId !== PLATFORM_TENANT_ID);
}

/**
 * DB egress (2026-09-30) — yalnız tek öğrencinin kaydı (erişim kontrolü için). Sonuç
 * `(await readData()).students.find((s) => s.id === studentId)` ile aynıdır; db modunda
 * tenant'ın tüm ders/ödeme/öğrenci verisi OKUNMAZ.
 */
export async function readStudentById(studentId: string): Promise<Student | undefined> {
  if (!studentId) return undefined;
  return withTenantScope(() => store.readStudentById(studentId));
}

/**
 * DB egress (2026-10-10) — tek ders: `(await readData()).lessons.find((l) => l.id === lessonId)` ile aynı;
 * db modunda yalnız o satır okunur. Ders varlık/şube kontrolü ve bildirim metni içindir.
 */
export async function readLessonById(lessonId: string): Promise<import("./types").Lesson | undefined> {
  if (!lessonId) return undefined;
  return withTenantScope(() => store.readLessonById(lessonId));
}

/** DB egress (2026-10-16) — yalnız penceredeki ders satırları (referans veri yok); bildirim tick'i. */
export async function readBranches(): Promise<AppData["settings"]["branches"]> {
  return withTenantScope(() => store.readBranches());
}

export async function readNationalIdCandidates(last2: string): Promise<{ id: string; nationalIdCipher: string }[]> {
  return withTenantScope(() => store.readNationalIdCandidates(last2));
}

export async function readLessonsStartingBetween(fromIso: string, toIso: string): Promise<import("./types").Lesson[]> {
  return withTenantScope(() => store.readLessonsStartingBetween(fromIso, toIso));
}

/** DB egress (2026-10-17) — bir öğretmenin tüm dersleri (mobil öğretmen programı, aralıksız çağrı). */
export async function readLessonsForTeacher(teacherId: string): Promise<import("./types").Lesson[]> {
  if (!teacherId) return [];
  // readData() ile aynı: süresi dolan telafi planı önce işlenir (dersin durumu bayat görünmesin).
  return withTenantScope(async () => {
    await store.commitMakeupPlanningExpiry(new Date());
    return store.readLessonsForTeacher(teacherId);
  });
}

/** DB egress (2026-10-18) — öğretmen performans puanı girdisi: (dersin öğretmeni, yoklama statüsü) çiftleri. */
export async function readTeacherAttendanceRows(): Promise<import("./insights/teacher-performance").TeacherAttendanceRow[]> {
  return withTenantScope(() => store.readTeacherAttendanceRows());
}

/** DB egress (2026-10-18) — mobil ana sayfa sayaçları (count sorguları; bkz. dashboard/mobile-counts.ts). */
export async function readMobileDashboardCounts(now: Date): Promise<import("./dashboard/mobile-counts").MobileDashboardCounts> {
  // readData() ile aynı: süresi dolan telafi planı önce işlenir (açık telafi sayısı bayat görünmesin).
  return withTenantScope(async () => {
    await store.commitMakeupPlanningExpiry(now);
    return store.readMobileDashboardCounts(now);
  });
}

/** DB egress (2026-10-10) — tek ödeme: `readData().payments.find(id)` ile aynı (makbuz). */
export async function readPaymentById(paymentId: string): Promise<import("./types").Payment | undefined> {
  if (!paymentId) return undefined;
  return withTenantScope(() => store.readPaymentById(paymentId));
}

/** Portal daveti için tek öğretmen + kurum iletişim alanları; DB'de tam readData gerekmez. */
export async function readTeacherPortalDetails(teacherId: string): Promise<TeacherPortalDetails | null> {
  if (!teacherId) return null;
  return withTenantScope(() => store.readTeacherPortalDetails(teacherId));
}

export async function readSchoolBranding(): Promise<SchoolBranding> {
  return withTenantScope(() => store.readSchoolBranding());
}

/** DB egress (2026-10-10) — bir öğretmenin kayıtlı hakedişleri: `readData().teacherPayouts` süzgeciyle aynı. */
export async function readTeacherPayoutsForTeacher(teacherId: string): Promise<import("./types").TeacherPayout[]> {
  if (!teacherId) return [];
  return withTenantScope(() => store.readTeacherPayoutsForTeacher(teacherId));
}

/**
 * DB egress (2026-09-30) — ders/ödeme/yoklama/telafi satırlarını GÖSTERMEYEN ekranlar ve
 * yalnız öğrenci/öğretmen listesine bakan işler için (bkz. src/lib/reference-data.ts).
 */
export async function readReferenceData(): Promise<ReferenceData> {
  return withTenantScope(() => store.readReferenceData());
}

/**
 * DB egress (2026-09-30) — tek öğrencinin ekranları (öğrenci detayı, Yoklama Takvimi) için;
 * `readData()` ile aynı telafi süre-dolumu türetmesi uygulanır.
 */
export async function readStudentScope(studentId: string): Promise<StudentScopeData> {
  if (!studentId) throw new Error("readStudentScope: studentId gerekli");
  return applyMakeupExpiry(
    await withTenantScope(async () => {
      await store.commitMakeupPlanningExpiry(new Date());
      return store.readStudentScope(studentId);
    })
  );
}

/** DB egress (2026-10-16) — Telafi Merkezi; `readData()` ile aynı telafi süre-dolumu türetmesi uygulanır. */
export async function readMakeupCenterData(opts?: import("./reference-data").MakeupCenterOptions): Promise<MakeupCenterData> {
  return applyMakeupExpiry(
    await withTenantScope(async () => {
      await store.commitMakeupPlanningExpiry(new Date());
      return store.readMakeupCenterData(opts);
    })
  );
}

/** DB egress (2026-09-30) — Ders Programı: referans veri + penceredeki dersler (bkz. reference-data.ts). */
export async function readLessonWindow(
  fromIso: string,
  toIso: string,
  opts?: import("./reference-data").ClubOnlyOptions
): Promise<LessonWindowData> {
  return withTenantScope(async () => {
    await store.commitMakeupPlanningExpiry(new Date());
    return store.readLessonWindow(fromIso, toIso, opts);
  });
}

/** DB egress (2026-09-30) — Öğrenciler listesi: referans veri + ödeme durum alanları. */
export async function readStudentListData(): Promise<StudentListData> {
  return withTenantScope(() => store.readStudentListData());
}

/** DB egress (2026-09-30) — Ödemeler: referans veri + tüm ödemeler + yalnız ödemelere bağlı dersler. */
export async function readPaymentsPageData(opts?: import("./reference-data").ClubOnlyOptions): Promise<PaymentsPageData> {
  return withTenantScope(() => store.readPaymentsPageData(opts));
}

/** DB egress (2026-10-19) — Ödemeler listesi / Tahsilat (bkz. reference-data.ts `PaymentsListData`). */
export async function readPaymentsListData(): Promise<import("./reference-data").PaymentsListData> {
  return withTenantScope(() => store.readPaymentsListData());
}

/** DB egress (2026-09-30) — Hakedişler / ay hakediş özeti (bkz. reference-data.ts `PayoutWindowData`). */
export async function readPayoutWindow(fromIso: string, toIso: string): Promise<PayoutWindowData> {
  return withTenantScope(async () => {
    await store.commitMakeupPlanningExpiry(new Date());
    return store.readPayoutWindow(fromIso, toIso);
  });
}

/** DB egress (2026-09-30) — Panel özeti; `readData()` ile aynı telafi süre-dolumu türetmesi uygulanır. */
export async function readDashboardData(fromIso: string, toIso: string, nowIso: string): Promise<DashboardData> {
  return applyMakeupExpiry(
    await withTenantScope(async () => {
      await store.commitMakeupPlanningExpiry(new Date());
      return store.readDashboardData(fromIso, toIso, nowIso);
    })
  );
}

/**
 * Planlanmamış telafinin son yerel günü bittiyse talebi expired, kaynak dersi
 * "Telafi planlama süresi doldu" İşlendi olarak gösterir. Kalıcı yazım
 * `commitMakeupPlanningExpiry` ile aynı saf fonksiyondur; bu katman okuma
 * anında da uygular ki ekran commit'ten önce de aynı statüyü görsün.
 */
function applyMakeupExpiry<T extends { makeupRequests: AppData["makeupRequests"]; lessons?: AppData["lessons"] }>(data: T): T {
  if (!data.lessons) return data;
  const closed = closeExpiredUnplannedMakeups({ ...data, lessons: data.lessons }, new Date(), "system", { legacyView: true });
  if (!closed.changed) return data;
  return { ...data, makeupRequests: closed.data.makeupRequests, lessons: closed.data.lessons };
}

export async function resetData(): Promise<void> {
  await withTenantScope(() => store.resetData());
}

/**
 * Kurulum Merkezi — "Boş şablona sıfırla". Demo verisinden ayrı, ayrık bir
 * eylem: mevcut kurum kimliğini (tenantId/ad) korur ama tüm demo
 * öğretmen/öğrenci/ders/ödeme kayıtlarını temizler.
 */
export async function resetToCleanTemplate(): Promise<void> {
  await withTenantScope(() => store.resetToCleanTemplate());
}

export async function markAttendance(input: {
  lessonId: string;
  status: AttendanceStatus;
  reason?: string;
}): Promise<void> {
  await withTenantScope(() => store.markAttendance(input));
}

export async function generateSuggestions(
  requestId: string,
  options?: { maxSlots?: number }
): Promise<Pick<AppData, "makeupRequests">> {
  return withTenantScope(() => store.generateSuggestions(requestId, options));
}

export async function confirmSlot(
  requestId: string,
  slot: MakeupSlot,
  decision: MakeupDecision
): Promise<void> {
  await withTenantScope(() => store.confirmSlot(requestId, slot, decision));
}

export async function cancelMakeup(requestId: string, decision: MakeupDecision): Promise<void> {
  await withTenantScope(() => store.cancelMakeup(requestId, decision));
}

export async function updateMakeupSlaEscalation(requestId: string, level: number): Promise<void> {
  await withTenantScope(() => store.updateMakeupSlaEscalation(requestId, level));
}

export async function addStudent(
  student: Omit<Student, "id" | "createdAt" | "active">
): Promise<void> {
  await withTenantScope(() => store.addStudent(student));
}

export async function setStudentDeletion(studentId: string, state: StudentDeletionState): Promise<void> {
  await withTenantScope(() => store.setStudentDeletion(studentId, state));
}

export async function setTeacherDeletion(teacherId: string, state: TeacherDeletionState): Promise<void> {
  await withTenantScope(() => store.setTeacherDeletion(teacherId, state));
}

/** Kalıcı silme önizlemesi için anlık görüntü (tenant kapsamlı). Plan: `planPersonPurge` (person-purge.ts). */
export async function loadPurgeSnapshot(kind: import("./person-purge").PurgeKind, id: string) {
  return withTenantScope(() => store.loadPurgeSnapshot(kind, id));
}

/** Kalıcı silme — kilit altında planı yeniden kurar; parmak izi önizlemeyle aynı değilse PurgeConflictError. */
export async function executePurge(
  kind: import("./person-purge").PurgeKind,
  id: string,
  expectedFingerprint: string,
  mode: import("./person-purge").PurgeMode = "standard",
  opts: import("./person-purge").WipeOptions = {}
) {
  return withTenantScope(() => store.executePurge(kind, id, expectedFingerprint, mode, opts));
}

/**
 * Öğrenci yaması TEK kapısı. Kişi düzeyi alanlar satıra yazılır. BRANŞA özgü koşullar (tür, ücret, tarih, MEB…) için:
 * - kalıcı branş kaydı olmayan TEK branşlı eski öğrenci: satır o branşın kendisidir → satıra yazılır (davranış aynı);
 * - aksi halde yazım `patch.enrollmentId` ile belirtilen (veya tek aktif) branşın KAYDINA gider, öğrenci satırı aynası
 *   yenilenir. Çok branşlı öğrencide hedef belirsizse yazım REDDEDİLİR — tahmin yok (`EnrollmentRequiredError`).
 */
export async function updateStudentProfile(
  studentId: string,
  patch: StudentProfilePatch
): Promise<void> {
  const { enrollmentId, ...rest } = patch;
  await withTenantScope(async () => {
    // Branş listesini BİLİNÇLİ olarak bütün yazan dahili çağıran (ör. eski kaydın kalıcılaştırılması) tutarlılığı kendisi
    // sağlar; kullanıcı düzenlemeleri bu yoldan değil `changeStudentEnrollments` / branş araçlarından geçer.
    if (rest.enrollments !== undefined || !patchTouchesEnrollmentTerms(rest)) {
      await store.updateStudentProfile(studentId, rest);
      return;
    }
    const student = await store.readStudentById(studentId);
    if (!student) throw new Error("Öğrenci bulunamadı");
    const route = routeTermPatch(student, enrollmentId);
    if (route.mode === "error") throw new EnrollmentRequiredError(route.message);
    if (route.mode === "row") {
      await store.updateStudentProfile(studentId, rest);
      return;
    }
    if (route.needsPersist) {
      throw new EnrollmentRequiredError(
        "Bu öğrencinin branş kayıtları henüz oluşturulmamış. Öğrenci → Özet → Branş kayıtları kartını açıp kayıtları oluşturduktan sonra tekrar deneyin."
      );
    }
    const { person, terms, clear } = splitTermPatch(rest);
    const res = await store.changeStudentEnrollments({
      studentId,
      change: { kind: "patchTerms", enrollmentId: route.enrollmentId, terms, clear },
      person,
    });
    if (!res.ok) throw new Error(res.message);
  });
}

/** 2026-10-10 — bkz. StoreApi.registerStudent. */
export async function registerStudent(
  input: import("./student-enrollments").RegisterStudentInput
): Promise<import("./student-enrollments").RegisterStudentResult> {
  return withTenantScope(() => store.registerStudent(input));
}

/** 2026-10-10 — bkz. StoreApi.changeStudentEnrollments. */
export async function changeStudentEnrollments(
  input: import("./student-enrollments").ChangeStudentEnrollmentsInput
): Promise<import("./student-enrollments").ChangeStudentEnrollmentsResult> {
  return withTenantScope(() => store.changeStudentEnrollments(input));
}

export async function listMebStudents(
  query: import("./meb-list").MebStudentQuery
): Promise<import("./meb-list").MebStudentListResult> {
  return withTenantScope(() => store.listMebStudents(query));
}

export async function setStudentPaymentPause(studentId: string, state: StudentPaymentPauseState): Promise<void> {
  await withTenantScope(() => store.setStudentPaymentPause(studentId, state));
}

export async function addTeacher(
  teacher: Omit<Teacher, "id" | "active" | "color">
): Promise<void> {
  await withTenantScope(() => store.addTeacher(teacher));
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

export async function deletePackage(packageId: string, expectedUpdatedAt: string): Promise<import("./packages").PackageDeleteResult> {
  return withTenantScope(() => store.deletePackage(packageId, expectedUpdatedAt));
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

export async function deletePaymentRow(paymentId: string): Promise<AppData> {
  return withTenantScope(() => store.deletePaymentRow(paymentId));
}

export async function updatePayment(
  paymentId: string,
  patch: import("./store-json").UpdatePaymentPatch
): Promise<AppData> {
  return withTenantScope(() => store.updatePayment(paymentId, patch));
}

export async function addRoom(room: Omit<Room, "id">): Promise<void> {
  await withTenantScope(() => store.addRoom(room));
}

export async function updateRoom(
  roomId: string,
  patch: Partial<Pick<Room, "name" | "capacity" | "branchId" | "instruments" | "active" | "archivedAt" | "deletedAt">>
): Promise<Room | null> {
  return withTenantScope(() => store.updateRoom(roomId, patch));
}

export async function archiveTeacher(teacherId: string, archived: boolean): Promise<Teacher | null> {
  return withTenantScope(() => store.archiveTeacher(teacherId, archived));
}

/** Dersi doğrular ve yazar; oluşan dersin kimliğini döner (DB egress 2026-10-10: eskiden tüm veriyi yeniden okuyup dönerdi). */
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
  return withTenantScope(async () => {
    const enrollmentId = input.enrollmentId ?? (await inferLessonEnrollmentId(input.studentId, input.instrument, input.teacherId));
    return store.addLesson({ ...input, enrollmentId });
  });
}

/** 2026-10-09 — çok branşlı öğrencide branşı belirlenemeyen ders yazılmaz (yanlış branşa yoklama/telafi/hakediş riski). */
export class EnrollmentRequiredError extends Error {
  readonly code = "ENROLLMENT_REQUIRED" as const;
}

/**
 * TÜM ders/seri yazım yollarının (ekran, CSV, sözleşmeden program, AI) TEK branş kapısı: açık bağ verilmediyse
 * öğrencinin AKTİF branş kayıtlarından enstrüman (gerekirse öğretmen) ile TEK eşleşme aranır. Kalıcı branş kaydı
 * olmayan / tek branşlı öğrencide eski davranış (bağsız = öğrencinin tek branşı). Belirsizlik varsa hata — tahmin yok.
 */
async function inferLessonEnrollmentId(studentId: string, instrument: string, teacherId?: string): Promise<string | undefined> {
  const student = await store.readStudentById(studentId);
  const active = (student?.enrollments ?? []).filter((e) => e.active);
  if (active.length === 0) return undefined;
  const byInstrument = active.filter((e) => e.instrument === instrument);
  if (byInstrument.length === 1) return byInstrument[0]!.id;
  if (byInstrument.length > 1) {
    const byTeacher = byInstrument.filter((e) => e.teacherId === teacherId);
    if (byTeacher.length === 1) return byTeacher[0]!.id;
    throw new EnrollmentRequiredError(
      `Bu öğrencinin birden fazla aktif ${instrument} branş kaydı var ve seçilen öğretmen bunlardan birine ait değil. Dersi ilgili branş kaydının öğretmeniyle planlayın veya tekil ders planlamada "Eğitim" alanından branşı seçin.`
    );
  }
  if (active.length === 1) return undefined;
  throw new EnrollmentRequiredError(
    `Öğrencinin aktif ${instrument} branş kaydı yok. Önce öğrenci kartından "Branş kaydı ekle" ile ${instrument} kaydını açın veya dersin enstrümanını düzeltin.`
  );
}

/** 2026-10-06 — kulüp oturumu satırları (bkz. clubs.ts). */
export async function addClubSessionLessons(rows: import("./types").Lesson[]): Promise<void> {
  return withTenantScope(() => store.addClubSessionLessons(rows));
}

/** 2026-10-23 — grup dersi katılımcı satırları (bkz. group-lessons.ts); kilit altında yeniden çakışma denetimi. */
export async function addGroupLessonRows(rows: import("./types").Lesson[]): Promise<void> {
  return withTenantScope(() => store.addGroupLessonRows(rows));
}

export async function patchClubLessons(ids: string[], patch: import("./clubs").ClubLessonPatch): Promise<number> {
  return withTenantScope(() => store.patchClubLessons(ids, patch));
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
  /** 2026-10-09 — satırın branş kaydı. */
  enrollmentId?: string;
}): Promise<void> {
  await withTenantScope(() => store.addPayment(input));
}

export async function addContractInstallments(input: {
  contractId: string;
  studentId: string;
  installments: ContractInstallmentSnapshot[];
  firstPaymentCollected?: { method: string; amount: number; collectedAt: string; reference?: string; note?: string };
  reuseFirstPaymentId?: string;
  enrollmentId?: string;
}): Promise<{ installments: ContractInstallmentView[] }> {
  return withTenantScope(() => store.addContractInstallments(input));
}

/** P0 dedup fix (2026-08-30) — bkz. StoreApi.getRegistrationFirstPayment. 2026-10-09: `scope` = branş kapsamı. */
export async function getRegistrationFirstPayment(
  studentId: string,
  scope?: import("./student-enrollments").EnrollmentScope
): Promise<Payment | null> {
  return withTenantScope(() => store.getRegistrationFirstPayment(studentId, scope));
}

/** 2026-10-09 — bkz. StoreApi.linkRecordsToEnrollment. */
export async function linkRecordsToEnrollment(input: {
  studentId: string;
  enrollmentId: string;
  instrument?: string;
  scope?: "student";
  contractIds?: string[];
  paymentIds?: string[];
}): Promise<{ payments: number; lessons: number; series: number }> {
  return withTenantScope(() => store.linkRecordsToEnrollment(input));
}

export async function upsertMonthlyPlanPayment(input: {
  studentId: string;
  month: string;
  amount: number;
  method?: string;
  enrollmentId?: string;
  includeUnlinked?: boolean;
}): Promise<{ paymentId: string }> {
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
  /** Bkz. Payment.firstCollectionIncludesNextMonth — kayıt ekranındaki açık seçim. */
  firstCollectionIncludesNextMonth?: boolean;
  /** 2026-10-09 — branş kaydı. */
  enrollmentId?: string;
}): Promise<{ paymentId: string }> {
  return withTenantScope(() => store.addRegistrationFirstPayment(input));
}

export async function updateLessonSchedule(input: {
  lessonId: string;
  startAt?: string;
  durationMinutes?: number;
}): Promise<LessonScheduleUpdateOutcome> {
  return withTenantScope(() => store.updateLessonSchedule(input));
}

/** DB egress (2026-10-17) — öğrencinin ders serileri: `readData().lessonSeries` süzgeciyle aynı. */
export async function readLessonSeriesForStudent(studentId: string): Promise<import("./types").LessonSeries[]> {
  if (!studentId) return [];
  return withTenantScope(() => store.readLessonSeriesForStudent(studentId));
}

/** DB egress (2026-10-18) — verilen kimliklerin ders serileri (`readData().lessonSeries` süzgeciyle aynı satırlar). */
export async function readLessonSeriesByIds(seriesIds: string[]): Promise<import("./types").LessonSeries[]> {
  if (seriesIds.length === 0) return [];
  return withTenantScope(() => store.readLessonSeriesByIds(seriesIds));
}

/** DB egress (2026-10-17) — bkz. StoreApi.readSlotScopeData (seri önizleme/oluşturma, uygun saat önerisi). */
export async function readSlotScopeData(
  target: import("./lesson-scope").SlotScopeTarget,
  days?: Date[]
): Promise<AppData> {
  return withTenantScope(() => store.readSlotScopeData(target, days));
}

/** Dar okuma — bkz. StoreApi.readLessonScope / src/lib/lesson-scope.ts. */
export async function readLessonScope(
  lessonId: string,
  targetStartAt?: string
): Promise<AppData | null> {
  return withTenantScope(() => store.readLessonScope(lessonId, targetStartAt));
}

export async function cancelLesson(lessonId: string): Promise<void> {
  await withTenantScope(() => store.cancelLesson(lessonId));
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
  actorUserId: string,
  reason?: string,
  disruption?: import("./lesson-disruption").LessonDisruptionInput,
  attendanceNote?: string | null
): Promise<import("./lesson-ops").ApplyLessonOpsResult> {
  return withTenantScope(() =>
    store.switchLessonOpsFlagLive(lessonId, flag, actorUserId, reason, disruption, attendanceNote)
  );
}

export async function setLessonAttendanceNoteLive(
  lessonId: string,
  note: string | null
): Promise<{ ok: true } | { ok: false; message: string }> {
  return withTenantScope(() => store.setLessonAttendanceNoteLive(lessonId, note));
}

export async function commitMakeupPlanningExpiry(now?: Date): Promise<void> {
  return withTenantScope(() => store.commitMakeupPlanningExpiry(now));
}

export async function previewMakeupLifecycle(
  op: import("./makeup-lifecycle").MakeupLifecycleOp
): Promise<import("./makeup-lifecycle").MakeupLifecycleResult> {
  return withTenantScope(() => store.previewMakeupLifecycle(op));
}

export async function applyMakeupLifecycle(
  op: import("./makeup-lifecycle").MakeupLifecycleOp
): Promise<import("./makeup-lifecycle").MakeupLifecycleResult> {
  return withTenantScope(() => store.applyMakeupLifecycle(op));
}

/** 2026-09-29 — yoklama statüsünü geri alma (bkz. lesson-ops.ts clearLessonOpsFlag). */
export async function clearLessonOpsFlagLive(
  lessonId: string,
  expected: import("./lesson-ops").LessonOpsFlag,
  actorUserId: string
): Promise<import("./lesson-ops").ClearLessonOpsResult> {
  return withTenantScope(() => store.clearLessonOpsFlagLive(lessonId, expected, actorUserId));
}

/** 9. tur — İptal/Telafi kaynağı (ders statüsünden ayrı alan). */
export async function setLessonDisruptionLive(
  lessonId: string,
  patch: import("./lesson-disruption").LessonDisruptionPatch
): Promise<import("./types").Lesson | null> {
  return withTenantScope(() => store.setLessonDisruptionLive(lessonId, patch));
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

export async function addBranch(branch: Omit<Branch, "id">): Promise<void> {
  await withTenantScope(() => store.addBranch(branch));
}

export async function updateBranch(
  branchId: string,
  patch: Partial<Omit<Branch, "id">>
): Promise<void> {
  await withTenantScope(() => store.updateBranch(branchId, patch));
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
  options?: { skipConflicts?: boolean; allowAvailabilityOverride?: boolean; overriddenByUserId?: string; createdByUserId?: string }
): Promise<CreateSeriesResult> {
  return withTenantScope(async () => {
    const enrollmentId = params.enrollmentId ?? (await inferLessonEnrollmentId(params.studentId, params.instrument, params.teacherId));
    return store.addLessonSeries({ ...params, enrollmentId }, options);
  });
}

export async function cancelLessonSeriesFromLesson(lessonId: string): Promise<SeriesCancelResult> {
  return withTenantScope(() => store.cancelLessonSeriesFromLesson(lessonId));
}

export async function cancelEntireLessonSeries(seriesId: string): Promise<SeriesCancelResult> {
  return withTenantScope(() => store.cancelEntireLessonSeries(seriesId));
}

export async function forceDeleteLesson(lessonId: string): Promise<import("./lesson-scope-edit").ForcedLessonDeletionPlan> {
  return withTenantScope(() => store.forceDeleteLesson(lessonId));
}

export async function deleteLessonsScoped(lessonId: string, scope: LessonEditScope): Promise<LessonDeletionPlan> {
  return withTenantScope(() => store.deleteLessonsScoped(lessonId, scope));
}

export async function reviseLessonsScoped(input: LessonRevisionInput): Promise<LessonRevisionResult> {
  return withTenantScope(() => store.reviseLessonsScoped(input));
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

export async function setTeacherPayoutPolicy(
  input: import("./teacher-payout").SetPayoutPolicyInput,
  actorUserId: string
): Promise<import("./teacher-payout").SetPayoutPolicyResult> {
  return withTenantScope(() => store.setTeacherPayoutPolicy(input, actorUserId));
}

export async function deleteTeacherPayout(payoutId: string): Promise<boolean> {
  return withTenantScope(() => store.deleteTeacherPayout(payoutId));
}

export async function deleteTeacherFeeRule(ruleId: string): Promise<boolean> {
  return withTenantScope(() => store.deleteTeacherFeeRule(ruleId));
}

export async function addTeacherPayoutExclusion(x: import("./types").TeacherPayoutExclusion): Promise<void> {
  return withTenantScope(() => store.addTeacherPayoutExclusion(x));
}

export async function removeTeacherPayoutExclusion(lessonId: string): Promise<boolean> {
  return withTenantScope(() => store.removeTeacherPayoutExclusion(lessonId));
}

export async function replaceTeacherPayout(payout: TeacherPayout): Promise<void> {
  await withTenantScope(() => store.replaceTeacherPayout(payout));
}

export async function markTeacherPayoutPaid(
  payoutId: string,
  method?: string
): Promise<MarkPayoutPaidResult> {
  return withTenantScope(() => store.markTeacherPayoutPaid(payoutId, method));
}

export async function updatePerformanceWeights(
  performanceWeights: import("./performance-weights").PerformanceWeightsConfig
): Promise<AppData> {
  return withTenantScope(() => store.updatePerformanceWeights(performanceWeights));
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
): Promise<void> {
  await withTenantScope(() => store.updateCollectionsSettings(collectionsSettings));
}

export async function updateConsentSettings(consentSettings: ConsentSettings): Promise<void> {
  await withTenantScope(() => store.updateConsentSettings(consentSettings));
}

export async function updateSchoolLogoUrl(logoUrl: string): Promise<AppData> {
  return withTenantScope(() => store.updateSchoolLogoUrl(logoUrl));
}

export async function updateTermWeeklyClosedDays(
  termWeeklyClosedDays: { guz: number[]; yaz: number[] }
): Promise<AppData> {
  return withTenantScope(() => store.updateTermWeeklyClosedDays(termWeeklyClosedDays));
}

export async function updateAcademicTermDates(academicTermDates: AcademicTermDates): Promise<void> {
  await withTenantScope(() => store.updateAcademicTermDates(academicTermDates));
}

export function getDashboardStats(data: AppData) {
  return store.getDashboardStats(data);
}

/**
 * Demo/QA seed kapısı — AKTİF store'a yazar (json/memory/db), böylece
 * `STORE_MODE=db` altında seed verisi JSON dosyasına DEĞİL veritabanına
 * gider. Yalnız `scripts/seed-*.ts` tarafından çağrılır.
 */
export async function seedDemoRecords(input: DemoSeedInput): Promise<DemoSeedResult> {
  return withTenantScope(() => store.seedDemoRecords(input));
}
