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
  applyDemoSeedRecords,
  assertDemoSeedAllowed,
  type DemoSeedInput,
  type DemoSeedResult,
} from "./demo-seed";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "./config";
import { withFileLock, writeJsonFileAtomic } from "./atomic-json-file";
import { createSeedData, createEmptyTemplateData } from "./seed";
import { tryTenantId } from "./tenant-context";
import { withClosedDayOverrides, withoutClosedDayOverrides } from "./closed-day-overrides";
import { DEFAULT_TENANT_ID } from "./auth/config";
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
import { applyLessonOpsFlag, switchLessonOpsFlag, type LessonOpsFlag } from "./lesson-ops";
import { allocateSequenceValue, formatDisplayId } from "./entity-sequence";
import { markTeacherAttendance, type TeacherAttendanceStatus } from "./teacher-attendance";
import { reassignLessonTeacherOrBranch, type ReassignLessonInput, type ReassignLessonResult } from "./lesson-reassignment";
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
import { mergeLessonScope, narrowLessonScope } from "./lesson-scope";
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

const DATA_DIR = resolveDataDir(path.join(process.cwd(), "data"));
const DATA_FILE = path.join(DATA_DIR, "store.json");

async function ensureDataFile() {
  // Faz 12 doğrulaması sırasında bulunan kök neden düzeltmesi: `fs.access`
  // kontrolü ÖNCEDEN kilit DIŞINDAYDI — soğuk başlangıçta eşzamanlı birden
  // fazla çağrı hepsi "dosya yok" görüp BAĞIMSIZ birer `createSeedData()` +
  // yazım yapabiliyordu; `writeData` kendi içinde kilitli olsa bile her biri
  // TAM bir reseed'di (birleştirme değil), son biten öncekini SİLERDİ — bu,
  // eşzamanlı ilk-istek senaryosunda veri kaybına yol açan gerçek bir
  // yarış durumuydu (yalnızca displayId sayaçlarına özgü değil). Artık TÜM
  // kontrol+yazım TEK kilit altında; `writeData` yerine doğrudan
  // `writeJsonFileAtomic` çağrılır (aksi hâlde `withFileLock` kendi kendini
  // bekleyip kilitlenirdi — reentrant değildir).
  await withFileLock(DATA_FILE, async () => {
    try {
      await fs.access(DATA_FILE);
    } catch {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const seed = createSeedData();
      await writeJsonFileAtomic(DATA_FILE, seed);
    }
  });
}

function assertTenant(data: AppData) {
  const tid = tryTenantId() ?? DEFAULT_TENANT_ID;
  const dataTenant = data.settings.tenantId || DEFAULT_TENANT_ID;
  if (dataTenant !== tid) {
    throw new Error("Cross-tenant access denied");
  }
}

export async function readData(): Promise<AppData> {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, "utf-8");
  const data = JSON.parse(raw) as AppData;
  if (!data.settings.tenantId) data.settings.tenantId = DEFAULT_TENANT_ID;
  if (!data.settings.feeRoundingMode) data.settings.feeRoundingMode = "exact_minutes";
  if (!data.teacherFeeRules) data.teacherFeeRules = [];
  if (!data.teacherPayouts) data.teacherPayouts = [];
  if (!data.packages) data.packages = [];
  if (!data.discountCampaigns) data.discountCampaigns = [];
  assertTenant(data);
  return withClosedDayOverrides(data, data.settings.tenantId);
}

/**
 * Kök neden (data/store.json bozulması) — önceden `writeData` doğrudan
 * `fs.writeFile(DATA_FILE, ..., "utf-8")` kullanıyordu. Node'da `'w'`
 * bayrağı dosyayı yalnızca `open()` ANINDA truncate eder; iki eşzamanlı
 * `writeData` çağrısı (ör. aynı process içinde art arda gelen iki panel
 * action'ı/agent tool çağrısı) ayrı dosya tanımlayıcılarıyla açılırsa, GEÇ
 * biten yazım, ERKEN biten (ve daha KISA) yazımın kapattığı dosyanın
 * SONUNA kendi kalan baytlarını ekleyebilir — gözlemlenen bozulma tam
 * olarak buydu: geçerli/kısa bir JSON'un hemen ardından, daha ÖNCEKİ/uzun
 * bir yazımın yarım kalmış kuyruğu (`}0"..."` gibi) ekleniyordu.
 *
 * Çözüm iki katmanlı (bkz. atomic-json-file.ts — aynı desen depodaki TÜM
 * JSON-dosya tabanlı modüllerde kullanılır):
 * 1) `withFileLock` — aynı process içindeki TÜM `writeData` çağrıları bir
 *    promise kuyruğunda SERİLEŞTİRİLİR; iki yazım asla aynı anda dosyaya
 *    dokunmaz.
 * 2) `writeJsonFileAtomic` — her yazım önce BENZERSİZ bir geçici dosyaya
 *    yazılır, geri okunup `JSON.parse` ile doğrulanır, ancak SONRA
 *    `fs.rename` ile hedefin yerine konur. POSIX'te aynı dosya sistemi
 *    içinde `rename` ATOMİKTİR — store.json okuyan hiçbir süreç asla
 *    yarım/karışık bir dosya GÖREMEZ; ya eski tam içerik ya da yeni tam
 *    içerik görünür, üçüncü bir hâl yoktur.
 */
export async function writeData(data: AppData): Promise<void> {
  assertTenant(data);
  await withFileLock(DATA_FILE, () => writeJsonFileAtomic(DATA_FILE, withoutClosedDayOverrides(data)));
}

/** Tek kilit altında oku-değiştir-yaz. `fn` fırlatırsa dosya yazılmaz. */
export async function mutateStoreUnderLock(
  fn: (data: AppData) => Promise<AppData>,
  onWriteFail?: () => Promise<void>
): Promise<AppData> {
  await ensureDataFile();
  return withFileLock(DATA_FILE, async () => {
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    const data = JSON.parse(raw) as AppData;
    if (!data.settings.tenantId) data.settings.tenantId = DEFAULT_TENANT_ID;
    assertTenant(data);
    const next = await fn(await withClosedDayOverrides(data, data.settings.tenantId));
    assertTenant(next);
    try {
      await writeJsonFileAtomic(DATA_FILE, withoutClosedDayOverrides(next));
    } catch (err) {
      if (onWriteFail) await onWriteFail();
      throw err;
    }
    return next;
  });
}

export async function resetData(): Promise<AppData> {
  const seed = createSeedData();
  await writeData(seed);
  return seed;
}

/** Kurulum Merkezi — boş şablona sıfırla (bkz. store.ts resetToCleanTemplate). */
export async function resetToCleanTemplate(): Promise<AppData> {
  const current = await readData();
  const template = createEmptyTemplateData();
  template.settings.tenantId = current.settings.tenantId;
  template.settings.name = current.settings.name;
  template.settings.shortName = current.settings.shortName;
  await writeData(template);
  return template;
}

/**
 * json modunda dosya başına tek bir kurum (tenant) verisi vardır — bu yüzden
 * "tüm kurumlar" listesi her zaman şu an aktif olan tek kurumdan oluşur.
 * Gerçek çoklu-kurum listesi yalnızca db modunda (Prisma Tenant tablosu)
 * mümkündür.
 */
export async function listTenants(): Promise<{ tenantId: string; name: string }[]> {
  const data = await readData();
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

export async function markAttendance(input: {
  lessonId: string;
  status: AttendanceStatus;
  reason?: string;
}): Promise<AppData> {
  await ensureDataFile();
  // Ensure read-modify-write occurs under the same file lock so counting + write are atomic.
  return await withFileLock(DATA_FILE, async () => {
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    const data = JSON.parse(raw) as AppData;
    if (!data.settings.tenantId) data.settings.tenantId = DEFAULT_TENANT_ID;
    assertTenant(data);

    const lesson = data.lessons.find((l) => l.id === input.lessonId);
    if (!lesson) throw new Error("Ders bulunamadı");

    // Nilüfer Acar politikası §3.5 — öğrencinin AYNI GÜN kendi iptali telafi
    // hakkı doğurmamalı. BİLİNÇLİ OLARAK burada UYGULANMADI: `markedAt` (personel
    // yoklamayı ne zaman işlediği) ile "öğrenci dersten ÖNCE aynı gün iptal etti"
    // birbirinden AYRI kavramlar — yoklama neredeyse HER ZAMAN dersle aynı gün
    // işlenir, bu yüzden markedAt/lesson.startAt karşılaştırması normal
    // devamsızlık akışının TAMAMINI yanlışlıkla hariç bırakır (doğrulandı: bkz.
    // makeup-quota-concurrency.test.ts regresyonu). Doğru çözüm, personelin
    // yoklama ekranında "Öğrenci dersten önce aynı gün iptal etti" diye AYRI bir
    // seçenek işaretlemesi (yeni bir alan/UI) — bu oturumun kapsamı dışında.
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
      const { assertCanCreateMakeup, MakeupQuotaExceededError } = await import("./makeup-quota");
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

    const next: AppData = {
      ...data,
      lessons,
      attendances: [...filtered, attendance],
      makeupRequests,
    };
    await writeJsonFileAtomic(DATA_FILE, next);
    return next;
  });
}

export async function generateSuggestions(
  requestId: string,
  options?: { maxSlots?: number }
): Promise<AppData> {
  const data = await readData();
  const request = data.makeupRequests.find((m) => m.id === requestId);
  if (!request) throw new Error("Telafi talebi bulunamadı");

  const slots = suggestMakeupSlots(data, request, options);
  const makeupRequests = data.makeupRequests.map((m) =>
    m.id === requestId
      ? { ...m, status: "suggested" as const, suggestedSlots: slots }
      : m
  );
  const next = { ...data, makeupRequests };
  await writeData(next);
  return next;
}

export async function confirmSlot(
  requestId: string,
  slot: MakeupSlot,
  decision: MakeupDecision
): Promise<AppData> {
  const data = await readData();
  const { data: next } = confirmMakeupSlot(data, requestId, slot, decision);
  await writeData(next);
  return next;
}

export async function cancelMakeup(requestId: string, decision: MakeupDecision): Promise<AppData> {
  const data = await readData();
  const { data: next } = cancelMakeupData(data, requestId, decision);
  await writeData(next);
  return next;
}

export async function updateMakeupSlaEscalation(requestId: string, level: number): Promise<AppData> {
  const data = await readData();
  const makeupRequests = data.makeupRequests.map((m) =>
    m.id === requestId ? { ...m, slaEscalationLevel: level } : m
  );
  const next = { ...data, makeupRequests };
  await writeData(next);
  return next;
}

function assertBranchExists(data: AppData, branchId: string) {
  if (!data.settings.branches.some((b) => b.id === branchId)) {
    throw new Error("Şube bulunamadı");
  }
}

export async function addBranch(branch: Omit<Branch, "id">): Promise<AppData> {
  const data = await readData();
  const b: Branch = { ...branch, id: uid("branch") };
  const next = {
    ...data,
    settings: { ...data.settings, branches: [...data.settings.branches, b] },
  };
  await writeData(next);
  return next;
}

export async function updateBranch(
  branchId: string,
  patch: Partial<Omit<Branch, "id">>
): Promise<AppData> {
  const data = await readData();
  assertBranchExists(data, branchId);
  const branches = data.settings.branches.map((b) => (b.id === branchId ? { ...b, ...patch } : b));
  const next = { ...data, settings: { ...data.settings, branches } };
  await writeData(next);
  return next;
}

export async function addStudent(
  student: Omit<Student, "id" | "createdAt" | "active">
): Promise<AppData> {
  // Faz 12 — displayId sıra numarası oku-artır-yaz gerektirir; tek başına
  // readData()+writeData() (writeData yalnızca YAZMAYI kilitler, okumayı
  // değil) eşzamanlı iki çağrının AYNI numarayı görmesine izin verirdi.
  // mutateStoreUnderLock TÜM oku-değiştir-yaz döngüsünü tek kilit altına alır.
  return mutateStoreUnderLock(async (data) => {
    assertBranchExists(data, student.branchId);
    const { assigned, records } = allocateSequenceValue(data.entitySequences ?? [], DEFAULT_TENANT_ID, "student");
    const s: Student = {
      ...student,
      id: uid("stu"),
      active: true,
      createdAt: new Date().toISOString(),
      displayId: formatDisplayId("student", assigned),
    };
    return { ...data, students: [...data.students, s], entitySequences: records };
  });
}

/**
 * Geri alınabilir öğrenci silme (2026-09-22). Silmede öğrenci pasife alınır;
 * geri almada yalnız silme işareti kalkar (öğrenci pasif kalır, ayrıca aktifleştirilir).
 */
export async function setStudentDeletion(studentId: string, state: StudentDeletionState): Promise<AppData> {
  const data = await readData();
  if (!data.students.some((s) => s.id === studentId)) throw new Error("Öğrenci bulunamadı");
  const students = data.students.map((s) => {
    if (s.id !== studentId) return s;
    if (state) return { ...s, ...state, active: false, archivedAt: s.archivedAt ?? state.deletedAt };
    return { ...s, deletedAt: undefined, deletedByUserId: undefined, deletionReason: undefined };
  });
  const next = { ...data, students };
  await writeData(next);
  return next;
}

/**
 * Kalıcı silme — YALNIZ bağlı kaydı olmayan (boş/deneme) öğrenci. Çağıran tool
 * uygunluğu doğrular; burada da ikinci kez kontrol edilir (savunma derinliği).
 */
export async function hardDeleteStudent(studentId: string): Promise<AppData> {
  const data = await readData();
  const linked =
    data.payments.some((p) => p.studentId === studentId) ||
    data.lessons.some((l) => l.studentId === studentId) ||
    data.lessonSeries.some((l) => l.studentId === studentId) ||
    data.attendances.some((a) => a.studentId === studentId) ||
    data.makeupRequests.some((m) => m.studentId === studentId);
  if (linked) throw new Error("STUDENT_HAS_LINKED_RECORDS");
  const next = { ...data, students: data.students.filter((s) => s.id !== studentId) };
  await writeData(next);
  return next;
}

/** 2026-10-03 — öğretmeni listeden kaldırma (geri alınabilir); kaldırmada pasife alınır. `null` = geri al. */
export async function setTeacherDeletion(teacherId: string, state: TeacherDeletionState): Promise<AppData> {
  const data = await readData();
  if (!data.teachers.some((t) => t.id === teacherId)) throw new Error("Öğretmen bulunamadı");
  const teachers = data.teachers.map((t) => {
    if (t.id !== teacherId) return t;
    if (state) return { ...t, ...state, active: false, archivedAt: t.archivedAt ?? state.deletedAt };
    return { ...t, deletedAt: undefined, deletedByUserId: undefined, deletionReason: undefined };
  });
  const next = { ...data, teachers };
  await writeData(next);
  return next;
}

/** Kalıcı silme — YALNIZ bağlı kaydı olmayan öğretmen; tool uygunluğu doğrular, burada ikinci kez kontrol edilir. */
export async function hardDeleteTeacher(teacherId: string): Promise<AppData> {
  const data = await readData();
  const linked =
    data.students.some((s) => s.teacherId === teacherId) ||
    data.lessons.some((l) => l.teacherId === teacherId) ||
    data.lessonSeries.some((l) => l.teacherId === teacherId) ||
    data.makeupRequests.some((m) => m.teacherId === teacherId) ||
    data.teacherFeeRules.some((r) => r.teacherId === teacherId) ||
    data.teacherPayouts.some((p) => p.teacherId === teacherId);
  if (linked) throw new Error("TEACHER_HAS_LINKED_RECORDS");
  const next = { ...data, teachers: data.teachers.filter((t) => t.id !== teacherId) };
  await writeData(next);
  return next;
}

export async function updateStudentProfile(
  studentId: string,
  patch: StudentProfilePatch
): Promise<AppData> {
  const data = await readData();
  if (!data.students.some((s) => s.id === studentId)) throw new Error("Öğrenci bulunamadı");
  const students = data.students.map((s) => (s.id === studentId ? { ...s, ...patch } : s));
  const next = { ...data, students };
  await writeData(next);
  return next;
}

/**
 * MEB Paneli listesi (json yolu) — tenant kapsamı `readData()`'dan gelir;
 * filtre/sıralama/sayfalama `meb-list.ts` saf fonksiyonuyla (db yoluyla AYNI
 * semantik). Yeni MEB kolonları generic spread ile zaten kalıcıdır.
 */
export async function listMebStudents(query: MebStudentQuery): Promise<MebStudentListResult> {
  const { applyMebStudentQuery } = await import("./meb-list");
  const data = await readData();
  return applyMebStudentQuery(data.students, query);
}

/** Nilüfer Acar politikası §1E — pause/reactivate TEK yol; `state=null` reaktivasyon (alanları temizler). */
export async function setStudentPaymentPause(studentId: string, state: StudentPaymentPauseState): Promise<AppData> {
  const data = await readData();
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
  const next = { ...data, students };
  await writeData(next);
  return next;
}

export async function addTeacher(
  teacher: Omit<Teacher, "id" | "active" | "color">
): Promise<AppData> {
  // Faz 12 — bkz. addStudent'taki aynı yorum: mutateStoreUnderLock, displayId
  // sıra numarasının eşzamanlı iki çağrıda asla çakışmamasını garanti eder.
  return mutateStoreUnderLock(async (data) => {
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
    return { ...data, teachers: [...data.teachers, t], entitySequences: records };
  });
}

/**
 * EPIC 9 (IMPLEMENTATION_PLAN.md) — yalnızca onaylanmış bir
 * TeacherAvailabilityRequest uygulanırken çağrılır (bkz.
 * reviewTeacherAvailabilityRequestTool); doğrudan bir yazma yolu değildir.
 */
export async function updateTeacherAvailability(
  teacherId: string,
  availability: Teacher["availability"]
): Promise<Teacher | null> {
  const data = await readData();
  const idx = data.teachers.findIndex((t) => t.id === teacherId);
  if (idx === -1) return null;
  const updated: Teacher = { ...data.teachers[idx], availability };
  const teachers = [...data.teachers];
  teachers[idx] = updated;
  await writeData({ ...data, teachers });
  return updated;
}

/** ÖNCELİK 4 (devam) — çoklu enstrüman+seviye düzenleme (öğretmen detayı). */
export async function updateTeacherInstruments(
  teacherId: string,
  instruments: Teacher["instruments"],
  instrumentLevels: Teacher["instrumentLevels"]
): Promise<Teacher | null> {
  const data = await readData();
  const idx = data.teachers.findIndex((t) => t.id === teacherId);
  if (idx === -1) return null;
  const updated: Teacher = { ...data.teachers[idx], instruments, instrumentLevels };
  const teachers = [...data.teachers];
  teachers[idx] = updated;
  await writeData({ ...data, teachers });
  return updated;
}

/** Package D — özlük/idari alanlar + ek şube ataması. `updateStudentProfile` ile aynı desen. */
export async function updateTeacherProfile(
  teacherId: string,
  patch: TeacherProfilePatch
): Promise<Teacher | null> {
  const data = await readData();
  const idx = data.teachers.findIndex((t) => t.id === teacherId);
  if (idx === -1) return null;
  const updated: Teacher = { ...data.teachers[idx], ...patch };
  const teachers = [...data.teachers];
  teachers[idx] = updated;
  await writeData({ ...data, teachers });
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

/** 2026-10-03 — yanlışlıkla oluşturulmuş BAĞIMSIZ ödeme satırını kaldırır (sözleşme taksidi asla). Kural/yetki tool'da. */
export async function deletePaymentRow(paymentId: string): Promise<AppData> {
  const data = await readData();
  const payment = data.payments.find((p) => p.id === paymentId);
  if (!payment) throw new Error("Ödeme bulunamadı");
  if (payment.contractId) throw new Error("PAYMENT_IS_CONTRACT_INSTALLMENT");
  const next = { ...data, payments: data.payments.filter((p) => p.id !== paymentId) };
  await writeData(next);
  return next;
}

export type UpdatePaymentPatch = {
  method?: string;
  paidAmount?: number;
  paymentNote?: string;
  /** Tahsilat anı (ISO) — raporlar paidAt üzerinden gider. */
  paidAt?: string;
};

export async function updatePayment(paymentId: string, patch: UpdatePaymentPatch): Promise<AppData> {
  const data = await readData();
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
  const next = { ...data, payments };
  await writeData(next);
  return next;
}

export async function addRoom(room: Omit<Room, "id">): Promise<AppData> {
  const data = await readData();
  assertBranchExists(data, room.branchId);
  const r: Room = { ...room, id: uid("room") };
  const next = { ...data, rooms: [...data.rooms, r] };
  await writeData(next);
  return next;
}

/** ÖNCELİK 4 (devam) — oda düzenleme (ad/kapasite/şube/enstrüman/aktiflik). */
export async function updateRoom(
  roomId: string,
  patch: Partial<Pick<Room, "name" | "capacity" | "branchId" | "instruments" | "active" | "archivedAt" | "deletedAt">>
): Promise<Room | null> {
  const data = await readData();
  const idx = data.rooms.findIndex((r) => r.id === roomId);
  if (idx === -1) return null;
  const updated: Room = { ...data.rooms[idx], ...patch };
  const rooms = [...data.rooms];
  rooms[idx] = updated;
  await writeData({ ...data, rooms });
  return updated;
}

/** ÖNCELİK 4 (devam) — öğretmen arşivleme/geri alma (hard delete YOK). */
export async function archiveTeacher(teacherId: string, archived: boolean): Promise<Teacher | null> {
  const data = await readData();
  const idx = data.teachers.findIndex((t) => t.id === teacherId);
  if (idx === -1) return null;
  const updated: Teacher = {
    ...data.teachers[idx],
    active: !archived,
    archivedAt: archived ? new Date().toISOString() : undefined,
  };
  const teachers = [...data.teachers];
  teachers[idx] = updated;
  await writeData({ ...data, teachers });
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
  /** İş 3 — bkz. validateLessonSlot allowAvailabilityOverride yorumu. */
  allowAvailabilityOverride?: boolean;
  /** Override uygulanırsa Lesson.availabilityOverride.by'a yazılan aktör. */
  overriddenByUserId?: string;
  createdByUserId?: string;
}): Promise<AppData> {
  const data = await readData();
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
    term: input.term,
    academicYearStart: input.academicYearStart,
    availabilityOverride:
      slot.availabilityOverridden && input.overriddenByUserId
        ? { by: input.overriddenByUserId, at: new Date().toISOString() }
        : undefined,
  };
  const next = { ...data, lessons: [...data.lessons, lesson] };
  await writeData(next);
  return next;
}

/** Dar okuma — bkz. lesson-scope.ts. json modunda dosya zaten tek parça okunur. */
export async function readLessonScope(
  lessonId: string,
  targetStartAt?: string
): Promise<AppData | null> {
  return narrowLessonScope(await readData(), lessonId, targetStartAt);
}

/**
 * P0 mutasyon performansı (2026-09-07) — tam `AppData` yerine yalnız
 * güncellenmiş dersi döndürür (db modunda yazma sonrası tam okumayı kaldırmak
 * için; bkz. lesson-update.ts LessonScheduleUpdateOutcome).
 *
 * Ayrıca oku-değiştir-yaz artık TEK dosya kilidi altında: eskiden
 * `readData()` + `writeData()` kilitsizdi ve eşzamanlı iki taşımadan biri
 * SESSİZCE kaybolabiliyordu (db modunda iyimser `updateMany` WHERE'i bunu
 * zaten engelliyordu — parite açığıydı).
 *
 * Saf fonksiyon burada TAM veriyle çalışır; db modu aynı kuralları DAR bir
 * dilimle çalıştırır. Dilim yetersizse (bir kural dilim dışındaki veriyi
 * okuyorsa) fark testlerde ortaya çıksın diye `narrowLessonScope` uygulanır —
 * iki mod aynı girdiyi görür (mode parity, bkz. lesson-scope.ts).
 */
export async function updateLessonSchedule(input: {
  lessonId: string;
  startAt?: string;
  durationMinutes?: number;
}): Promise<LessonScheduleUpdateOutcome> {
  let outcome: LessonScheduleUpdateOutcome = {
    ok: false,
    code: "LESSON_NOT_FOUND",
    message: "Ders bulunamadı.",
  };
  await mutateStoreUnderLock(async (data) => {
    const scope = narrowLessonScope(data, input.lessonId, input.startAt);
    if (!scope) return data;
    const original = scope.lessons.find((l) => l.id === input.lessonId)!;
    const result = applyLessonScheduleUpdate(scope, input);
    if (!result.ok) {
      outcome = result;
      return data;
    }
    outcome = { ok: true, lesson: result.lesson, previousStartAt: original.startAt };
    return { ...data, lessons: data.lessons.map((l) => (l.id === result.lesson.id ? result.lesson : l)) };
  });
  return outcome;
}

export async function cancelLesson(lessonId: string): Promise<AppData> {
  const data = await readData();
  const result = applyLessonCancel(data, lessonId);
  if (!result.ok) throw new Error(result.message);
  await writeData(result.data);
  return result.data;
}

export async function startLessonLive(lessonId: string): Promise<LessonLiveUpdateResult> {
  const data = await readData();
  const result = applyStartLesson(data, lessonId);
  if (result.ok) await writeData(result.data);
  return result;
}

export async function endLessonLive(lessonId: string): Promise<LessonLiveUpdateResult> {
  const data = await readData();
  const result = applyEndLesson(data, lessonId);
  if (result.ok) await writeData(result.data);
  return result;
}

export async function correctLessonTimesLive(
  lessonId: string,
  correction: LessonTimeCorrection
): Promise<LessonLiveUpdateResult> {
  const data = await readData();
  const result = applyCorrectLessonTimes(data, lessonId, correction);
  if (result.ok) await writeData(result.data);
  return result;
}

function assertLessonSeriesRefsExist(data: AppData, params: SeriesParams) {
  if (!data.students.some((s) => s.id === params.studentId)) throw new Error("Öğrenci bulunamadı");
  if (!data.teachers.some((t) => t.id === params.teacherId)) throw new Error("Öğretmen bulunamadı");
  if (!data.rooms.some((r) => r.id === params.roomId)) throw new Error("Oda bulunamadı");
  assertBranchExists(data, params.branchId);
}

/**
 * Doğrulama anındaki güncel veriyle çalışır (readData → hesapla → writeData
 * tek işlem içinde) — yarım seri asla yazılmaz. Sonuç, tekil `addLesson`'ın
 * aksine fırlatmaz: `ok:false` durumunda `conflicts` listesiyle birlikte
 * döner ki UI her oluşumun hangi kuralla reddedildiğini gösterebilsin.
 */
export async function addLessonSeries(
  params: SeriesParams,
  options?: { skipConflicts?: boolean; allowAvailabilityOverride?: boolean; overriddenByUserId?: string; createdByUserId?: string }
): Promise<CreateSeriesResult> {
  const data = await readData();
  assertLessonSeriesRefsExist(data, params);
  const result = createLessonSeriesData(data, params, options);
  if (result.ok) await writeData(result.data);
  return result;
}

export async function cancelLessonSeriesFromLesson(lessonId: string): Promise<SeriesCancelResult> {
  const data = await readData();
  const result = cancelSeriesFromLesson(data, lessonId);
  if (result.ok) await writeData(result.data);
  return result;
}

export async function cancelEntireLessonSeries(seriesId: string): Promise<SeriesCancelResult> {
  const data = await readData();
  const result = cancelEntireSeries(data, seriesId);
  if (result.ok) await writeData(result.data);
  return result;
}

/** M — kritik şifreyle statülü tek ders silme (bkz. planForcedLessonDeletion). */
export async function forceDeleteLesson(lessonId: string): Promise<ForcedLessonDeletionPlan> {
  const data = await readData();
  const result = planForcedLessonDeletion(data, lessonId);
  if (result.ok) await writeData(result.data);
  return result;
}

export async function deleteLessonsScoped(lessonId: string, scope: LessonEditScope): Promise<LessonDeletionPlan> {
  const data = await readData();
  const result = planLessonDeletion(data, lessonId, scope);
  if (result.ok) await writeData(result.data);
  return result;
}

export async function reviseLessonsScoped(input: LessonRevisionInput): Promise<LessonRevisionResult> {
  const data = await readData();
  const result = applyLessonRevision(data, input);
  if (result.ok) await writeData(result.data);
  return result;
}

function assertTeacherExists(data: AppData, teacherId: string) {
  if (!data.teachers.some((t) => t.id === teacherId)) throw new Error("Öğretmen bulunamadı");
}

export async function addTeacherFeeRule(input: FeeRuleInput): Promise<FeeRuleMutationResult> {
  const data = await readData();
  assertTeacherExists(data, input.teacherId);
  const result = createTeacherFeeRuleData(data, input);
  if (result.ok) await writeData(result.data);
  return result;
}

export async function addPackage(input: PackageInput): Promise<PackageMutationResult> {
  const data = await readData();
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
  await writeData(next);
  return { ok: true, data: next, pkg };
}

export async function updatePackage(packageId: string, patch: PackagePatch): Promise<PackageMutationResult> {
  const data = await readData();
  const result = updatePackageData(data, packageId, patch);
  if (result.ok) await writeData(result.data);
  return result;
}

export async function addDiscountCampaign(input: DiscountCampaignInput): Promise<DiscountCampaignMutationResult> {
  const data = await readData();
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
  await writeData(next);
  return { ok: true, data: next, campaign };
}

export async function updateDiscountCampaign(
  campaignId: string,
  patch: DiscountCampaignPatch
): Promise<DiscountCampaignMutationResult> {
  const data = await readData();
  const result = updateDiscountCampaignData(data, campaignId, patch);
  if (result.ok) await writeData(result.data);
  return result;
}

export async function updateTeacherFeeRule(
  ruleId: string,
  patch: Partial<Omit<TeacherFeeRule, "id" | "createdAt">>
): Promise<FeeRuleMutationResult> {
  const data = await readData();
  const result = updateTeacherFeeRuleData(data, ruleId, patch);
  if (result.ok) await writeData(result.data);
  return result;
}

export async function createTeacherPayout(
  teacherId: string,
  periodStart: string,
  periodEnd: string,
  paymentMethodOverride?: TeacherPayoutPaymentMethod
): Promise<CreateTeacherPayoutResult> {
  // Kilit altında: eşzamanlı iki "Hakediş oluştur" çift kayıt üretmez.
  let result!: CreateTeacherPayoutResult;
  await mutateStoreUnderLock(async (data) => {
    assertTeacherExists(data, teacherId);
    result = createTeacherPayoutSnapshot(data, teacherId, periodStart, periodEnd, new Date(), paymentMethodOverride);
    return result.ok ? result.data : data;
  });
  return result;
}

export async function updateTeacherPayoutPaymentMethod(
  payoutId: string,
  method: TeacherPayoutPaymentMethod
): Promise<UpdateTeacherPayoutPaymentMethodResult> {
  const data = await readData();
  const result = updateTeacherPayoutPaymentMethodData(data, payoutId, method);
  if (result.ok) await writeData(result.data);
  return result;
}

/** 2026-09-29 — ay bazlı hakediş politikası; kilit kontrolü + yazma tek dosya kilidi altında. */
export async function setTeacherPayoutPolicy(
  input: import("./teacher-payout").SetPayoutPolicyInput,
  actorUserId: string
): Promise<import("./teacher-payout").SetPayoutPolicyResult> {
  const { setPayoutPolicyForMonthData } = await import("./teacher-payout");
  let result!: import("./teacher-payout").SetPayoutPolicyResult;
  await mutateStoreUnderLock(async (data) => {
    result = setPayoutPolicyForMonthData(data, input, actorUserId);
    return result.ok ? result.data : data;
  });
  return result;
}

/** K — kaydı bütün olarak değiştirir (kurallar tool katmanında). İyimser kilit: okunan sürüm değilse STALE_PAYOUT. */
export async function replaceTeacherPayout(payout: TeacherPayout): Promise<AppData> {
  let next!: AppData;
  await mutateStoreUnderLock(async (data) => {
    const cur = data.teacherPayouts.find((p) => p.id === payout.id);
    if (!cur) throw new Error("Hakediş kaydı bulunamadı");
    if ((cur.version ?? 0) !== (payout.version ?? 0)) throw new Error("STALE_PAYOUT");
    const written = { ...payout, version: (payout.version ?? 0) + 1 };
    next = { ...data, teacherPayouts: data.teacherPayouts.map((p) => (p.id === payout.id ? written : p)) };
    return next;
  });
  return next;
}

export async function deleteTeacherPayout(payoutId: string): Promise<boolean> {
  let ok = false;
  await mutateStoreUnderLock(async (data) => {
    ok = data.teacherPayouts.some((p) => p.id === payoutId && p.status === "cancelled");
    return ok ? { ...data, teacherPayouts: data.teacherPayouts.filter((p) => p.id !== payoutId) } : data;
  });
  return ok;
}

export async function deleteTeacherFeeRule(ruleId: string): Promise<boolean> {
  let ok = false;
  await mutateStoreUnderLock(async (data) => {
    ok = data.teacherFeeRules.some((r) => r.id === ruleId);
    return ok ? { ...data, teacherFeeRules: data.teacherFeeRules.filter((r) => r.id !== ruleId) } : data;
  });
  return ok;
}

export async function addTeacherPayoutExclusion(x: import("./types").TeacherPayoutExclusion): Promise<void> {
  await mutateStoreUnderLock(async (data) => ({
    ...data,
    teacherPayoutExclusions: [...(data.teacherPayoutExclusions ?? []).filter((e) => e.lessonId !== x.lessonId), x],
  }));
}

export async function removeTeacherPayoutExclusion(lessonId: string): Promise<boolean> {
  let ok = false;
  await mutateStoreUnderLock(async (data) => {
    ok = (data.teacherPayoutExclusions ?? []).some((e) => e.lessonId === lessonId);
    return ok ? { ...data, teacherPayoutExclusions: data.teacherPayoutExclusions!.filter((e) => e.lessonId !== lessonId) } : data;
  });
  return ok;
}

export async function markTeacherPayoutPaid(
  payoutId: string,
  method?: string
): Promise<MarkPayoutPaidResult> {
  const data = await readData();
  const result = markTeacherPayoutPaidData(data, payoutId, method);
  if (result.ok) await writeData(result.data);
  return result;
}

export async function updatePerformanceWeights(
  performanceWeights: import("./performance-weights").PerformanceWeightsConfig
): Promise<AppData> {
  const data = await readData();
  const next = { ...data, settings: { ...data.settings, performanceWeights } };
  await writeData(next);
  return next;
}

export async function updateFeeRoundingMode(feeRoundingMode: FeeRoundingMode): Promise<AppData> {
  const data = await readData();
  const next = { ...data, settings: { ...data.settings, feeRoundingMode } };
  await writeData(next);
  return next;
}

export async function updateMonthlyMakeupAllowance(monthlyMakeupAllowance: number): Promise<AppData> {
  const data = await readData();
  const next = {
    ...data,
    settings: { ...data.settings, monthlyMakeupAllowance },
  };
  await writeData(next);
  return next;
}

export async function updateMakeupWindowDays(makeupWindowDays: number): Promise<AppData> {
  const data = await readData();
  const next = { ...data, settings: { ...data.settings, makeupWindowDays } };
  await writeData(next);
  return next;
}

export async function updateCollectionsSettings(
  collectionsSettings: CollectionsSettings
): Promise<AppData> {
  const data = await readData();
  const next = { ...data, settings: { ...data.settings, collectionsSettings } };
  await writeData(next);
  return next;
}

export async function updateTermWeeklyClosedDays(
  termWeeklyClosedDays: { guz: number[]; yaz: number[] }
): Promise<AppData> {
  const data = await readData();
  const next = { ...data, settings: { ...data.settings, termWeeklyClosedDays } };
  await writeData(next);
  return next;
}

export async function updateAcademicTermDates(
  academicTermDates: import("./academic-term-dates").AcademicTermDates
): Promise<AppData> {
  const data = await readData();
  const next = { ...data, settings: { ...data.settings, academicTermDates } };
  await writeData(next);
  return next;
}

export async function updateConsentSettings(consentSettings: ConsentSettings): Promise<AppData> {
  const data = await readData();
  const next = { ...data, settings: { ...data.settings, consentSettings } };
  await writeData(next);
  return next;
}

export async function updateSchoolLogoUrl(logoUrl: string): Promise<AppData> {
  const data = await readData();
  const next = { ...data, settings: { ...data.settings, logoUrl } };
  await writeData(next);
  return next;
}

const TEACHER_COLORS = ["#7c3aed", "#0891b2", "#db2777", "#ea580c", "#059669", "#4f46e5"];

/**
 * Şube importu, "kısa ad" eşleşen kaydı GÜNCELLER; yoksa yeni oluşturur —
 * aynı dosyanın yeniden yüklenmesi duplicate şube üretmez.
 */
export async function importBranches(rows: BranchImportRow[]): Promise<ImportCommitResult> {
  const data = await readData();
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
  const next = { ...data, settings: { ...data.settings, branches } };
  await writeData(next);
  return { data: next, created, updated };
}

/** Öğretmen importu e-postaya göre upsert yapar. */
export async function importTeachers(rows: TeacherImportRow[]): Promise<ImportCommitResult> {
  const data = await readData();
  const teachers = [...data.teachers];
  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const idx = teachers.findIndex((t) => t.email.trim().toLowerCase() === row.email.trim().toLowerCase());
    // ÖNCELİK 4 (devam) — çoklu enstrüman: instrumentLevels verilmişse
    // instruments listesi bundan türetilir (benzersiz), yoksa legacy
    // tek-enstrüman davranışı ([row.instrument]) korunur.
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
  const next = { ...data, teachers };
  await writeData(next);
  return { data: next, created, updated };
}

/** Oda importu (şube, ad) çiftine göre upsert yapar. */
export async function importRooms(rows: RoomImportRow[]): Promise<ImportCommitResult> {
  const data = await readData();
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
  const next = { ...data, rooms };
  await writeData(next);
  return { data: next, created, updated };
}

/** Öğrenci importu telefon numarasına göre upsert yapar (e-posta opsiyonel olduğu için). */
export async function importStudents(rows: StudentImportRow[]): Promise<ImportCommitResult> {
  const data = await readData();
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
        derivedPerLessonAmount: row.derivedPerLessonAmount ?? students[idx].derivedPerLessonAmount,
        accountResponsibility: students[idx].accountResponsibility ?? row.accountResponsibility,
        displayId: students[idx].displayId ?? nextDisplayId(),
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
  const next = { ...data, students, entitySequences: sequences };
  await writeData(next);
  return { data: next, created, updated };
}

export async function addPayment(input: {
  studentId: string;
  description: string;
  amount: number;
  dueDate: string;
}): Promise<AppData> {
  const data = await readData();
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
  const next = { ...data, payments: [...data.payments, payment] };
  await writeData(next);
  return next;
}

/** FEATURE A — bkz. store.ts yorumu. `mutateStoreUnderLock` altında TEK atomik oku-değiştir-yaz. */
export async function addContractInstallments(input: {
  contractId: string;
  studentId: string;
  installments: ContractInstallmentSnapshot[];
  firstPaymentCollected?: { method: string; amount: number; collectedAt: string; reference?: string; note?: string };
  reuseFirstPaymentId?: string;
}): Promise<{ data: AppData; installments: ContractInstallmentView[] }> {
  const now = new Date().toISOString();
  const fp = input.firstPaymentCollected;
  const reuseId = input.reuseFirstPaymentId;
  // P0 dedup fix — sequence 1 için reuseFirstPaymentId verilmişse (initial sözleşme, kayıt
  // sırasında zaten tahsil edilmiş) YENİ bir Payment satırı YARATILMAZ; mevcut
  // `registration_first_payment` satırı bu sözleşmeye bağlanır. Diğer taksitler her zaman
  // yeni `pending` satırlar olarak eklenir.
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
  const data = await mutateStoreUnderLock(async (d) => {
    let payments = d.payments;
    if (reuseId) {
      const firstInst = input.installments.find((i) => i.sequence === 1);
      payments = payments.map((p) => {
        if (p.id !== reuseId) return p;
        reusedRow = {
          ...p,
          amount: firstInst?.amount ?? p.amount,
          contractId: input.contractId,
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
    return { ...d, payments: [...payments, ...newRows] };
  });
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
  return { data, installments };
}

/** P0 dedup fix (2026-08-30) — bkz. store.ts StoreApi.getRegistrationFirstPayment. */
export async function getRegistrationFirstPayment(studentId: string): Promise<Payment | null> {
  const data = await readData();
  return data.payments.find((p) => p.studentId === studentId && p.source === "registration_first_payment") ?? null;
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

export async function upsertMonthlyPlanPayment(input: {
  studentId: string;
  month: string;
  amount: number;
  dueDate?: string;
  method?: string;
}): Promise<{ data: AppData; paymentId: string }> {
  const data = await readData();
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
  const next = { ...data, payments };
  await writeData(next);
  return { data: next, paymentId };
}

/**
 * Owner policy (2026-08-30) — kayıt (createStudentTool) TAMAMLANMA anında tahsil edilen
 * ilk ödeme. `addContractInstallments`'ın `firstPaymentCollected` satırıyla AYNI şekli
 * paylaşır ama contractId GEREKTİRMEZ (henüz sözleşme yok — kayıt sözleşmeden önce gelir).
 * İdempotent: aynı öğrenci için `source:"registration_first_payment"` zaten varsa YENİ
 * satır yaratılmaz, mevcut olan döner (çift gönderim/retry güvenli).
 */
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
  let paymentId = "";
  const data = await mutateStoreUnderLock(async (d) => {
    const existing = d.payments.find(
      (p) => p.studentId === input.studentId && p.source === "registration_first_payment"
    );
    if (existing) {
      paymentId = existing.id;
      return d;
    }
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
    };
    paymentId = payment.id;
    return { ...d, payments: [...d.payments, payment] };
  });
  return { data, paymentId };
}

async function persistLessonOpsUnderLock(
  lessonId: string,
  _flag: LessonOpsFlag,
  actorUserId: string,
  apply: typeof applyLessonOpsFlag | typeof switchLessonOpsFlag,
  reason?: string,
  disruption?: import("./lesson-disruption").LessonDisruptionInput
): Promise<ReturnType<typeof applyLessonOpsFlag>> {
  await ensureDataFile();
  return withFileLock(DATA_FILE, async () => {
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    const data = JSON.parse(raw) as AppData;
    if (!data.settings.tenantId) data.settings.tenantId = DEFAULT_TENANT_ID;
    assertTenant(data);
    /**
     * Mode parity (2026-09-07) — saf kural, db modundaki DAR dilimin AYNISIYLA
     * çalıştırılır (bkz. lesson-scope.ts); sonuç bütüne birleştirilir. Böylece
     * dilim yetersiz kalırsa json modunda koşan testler bunu YAKALAR.
     */
    const scope = narrowLessonScope(data, lessonId);
    if (!scope) return { ok: false, message: "Ders bulunamadı." };
    const result = apply(scope, lessonId, _flag, actorUserId, undefined, reason, disruption);
    if (result.ok && !result.alreadySet) {
      await writeJsonFileAtomic(DATA_FILE, mergeLessonScope(data, result.data, lessonId));
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

/** ÖNCELİK 4 (devam) — onaylı statü DEĞİŞİMİ (bkz. lesson-ops.ts switchLessonOpsFlag). */
export async function switchLessonOpsFlagLive(
  lessonId: string,
  flag: LessonOpsFlag,
  actorUserId: string,
  reason?: string,
  disruption?: import("./lesson-disruption").LessonDisruptionInput
): Promise<ReturnType<typeof switchLessonOpsFlag>> {
  return persistLessonOpsUnderLock(lessonId, flag, actorUserId, switchLessonOpsFlag, reason, disruption);
}

/** 2026-09-29 — yoklama statüsünü geri alma (bkz. lesson-ops.ts clearLessonOpsFlag); dar dilim + dosya kilidi. */
export async function clearLessonOpsFlagLive(
  lessonId: string,
  expected: LessonOpsFlag,
  actorUserId: string
): Promise<import("./lesson-ops").ClearLessonOpsResult> {
  const { clearLessonOpsFlag } = await import("./lesson-ops");
  await ensureDataFile();
  return withFileLock(DATA_FILE, async () => {
    const data = JSON.parse(await fs.readFile(DATA_FILE, "utf-8")) as AppData;
    if (!data.settings.tenantId) data.settings.tenantId = DEFAULT_TENANT_ID;
    assertTenant(data);
    const scope = narrowLessonScope(data, lessonId);
    if (!scope) return { ok: false, code: "NOT_FOUND", message: "Ders bulunamadı. Sayfayı yenileyip tekrar deneyin." };
    const result = clearLessonOpsFlag(scope, lessonId, expected, actorUserId);
    if (result.ok && !result.alreadyClear) {
      await writeJsonFileAtomic(DATA_FILE, mergeLessonScope(data, result.data, lessonId));
    }
    return result;
  });
}

/** Faz 2 — öğretmen yoklaması, öğrenci ops bayraklarından tamamen ayrı bir yol. */
export async function markTeacherAttendanceLive(
  lessonId: string,
  status: TeacherAttendanceStatus,
  actorUserId: string,
  note: string | undefined
): Promise<ReturnType<typeof markTeacherAttendance>> {
  let result!: ReturnType<typeof markTeacherAttendance>;
  await mutateStoreUnderLock(async (data) => {
    result = markTeacherAttendance(data, lessonId, status, actorUserId, note);
    return result.ok ? result.data : data;
  });
  return result;
}

/** Faz 13 — ders öğretmeni/şube değişimi (tek/bundan sonrası/tüm seri). */
export async function reassignLessonTeacherOrBranchLive(input: ReassignLessonInput): Promise<ReassignLessonResult> {
  let result!: ReassignLessonResult;
  await mutateStoreUnderLock(async (data) => {
    result = reassignLessonTeacherOrBranch(data, input);
    return result.ok ? result.data : data;
  });
  return result;
}

/**
 * Demo/QA seed kapısı — bkz. `demo-seed.ts`. Üç backend'in json uygulaması.
 * Production'da fail-closed.
 */
export async function seedDemoRecords(input: DemoSeedInput): Promise<DemoSeedResult> {
  assertDemoSeedAllowed();
  const data = await readData();
  const result = applyDemoSeedRecords(data, input);
  await writeData(result.data);
  return { lessonIds: result.lessonIds };
}

/** 9. tur — İptal/Telafi kaynağını sonradan belirleme/düzeltme (kilit altında). */
export async function setLessonDisruptionLive(
  lessonId: string,
  patch: import("./lesson-disruption").LessonDisruptionPatch
): Promise<Lesson | null> {
  let updated: Lesson | null = null;
  await mutateStoreUnderLock(async (data) => {
    const lessons = data.lessons.map((l) => (l.id === lessonId ? (updated = { ...l, ...patch }) : l));
    return updated ? { ...data, lessons } : data;
  });
  return updated;
}

/** 9. tur — kullanılmamış paketi kalıcı siler; karar ve eşzamanlılık kontrolü kilit altında (packages.ts). */
export async function deletePackage(packageId: string, expectedUpdatedAt: string): Promise<import("./packages").PackageDeleteResult> {
  const { deletePackageData } = await import("./packages");
  let result!: import("./packages").PackageDeleteResult;
  await mutateStoreUnderLock(async (data) => {
    result = deletePackageData(data, packageId, expectedUpdatedAt);
    return result.ok ? result.data : data;
  });
  return result;
}
