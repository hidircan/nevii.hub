import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "./config";
import { withFileLock, writeJsonFileAtomic } from "./atomic-json-file";
import { createSeedData, createEmptyTemplateData } from "./seed";
import { tryTenantId } from "./tenant-context";
import { DEFAULT_TENANT_ID } from "./auth/config";
import { applyLessonOpsFlag, switchLessonOpsFlag, type LessonOpsFlag } from "./lesson-ops";
import type {
  AppData,
  Attendance,
  AttendanceStatus,
  Branch,
  CollectionsSettings,
  FeeRoundingMode,
  Instrument,
  Lesson,
  MakeupRequest,
  MakeupSlot,
  Payment,
  Room,
  Student,
  StudentProfilePatch,
  Teacher,
  TeacherFeeRule,
  TeacherProfilePatch,
} from "./types";
import {
  suggestMakeupSlots,
  confirmMakeupSlot,
  cancelMakeupData,
  validateLessonSlot,
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
  type FeeRuleInput,
  type FeeRuleMutationResult,
  type CreateTeacherPayoutResult,
  type MarkPayoutPaidResult,
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
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const seed = createSeedData();
    // Atomic yol — bkz. writeData yorumu. Soğuk başlangıçta birden fazla
    // eşzamanlı readData() çağrısı buraya düşebilir; writeQueue + geçici
    // dosya + rename deseni burada da aynı korumayı sağlar.
    await writeData(seed);
  }
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
  return data;
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
  await withFileLock(DATA_FILE, () => writeJsonFileAtomic(DATA_FILE, data));
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

export async function markAttendance(input: {
  lessonId: string;
  status: AttendanceStatus;
  reason?: string;
}): Promise<AppData> {
  const data = await readData();
  const lesson = data.lessons.find((l) => l.id === input.lessonId);
  if (!lesson) throw new Error("Ders bulunamadı");

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
  // Geldi/geç: katılım kaydı; dersi otomatik "completed" yapma (İşlendi ayrı bayrak).
  // late hâlâ katılım sayılır. İşlendi → setLessonOpsFlag("processed").
  if (input.status === "absent") lessonStatus = "no_show";
  if (input.status === "cancelled_by_school") lessonStatus = "cancelled";

  const lessons = data.lessons.map((l) =>
    l.id === input.lessonId ? { ...l, status: lessonStatus } : l
  );

  let makeupRequests = data.makeupRequests.filter((m) => m.sourceLessonId !== input.lessonId);

  if (createsMakeupCredit) {
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
      expiresAt: formatISO(addDays(new Date(), data.settings.makeupWindowDays)),
      suggestedSlots: [],
      createdAt: new Date().toISOString(),
      policyNote:
        input.status === "cancelled_by_school"
          ? `Okul kaynaklı iptal — öncelikli yerleştirme · ${branch?.shortName ?? ""}`
          : `${data.settings.makeupWindowDays} gün içinde · aynı öğretmen · ${branch?.shortName ?? ""}`,
    };
    makeupRequests = [...makeupRequests, req];
  }

  const next: AppData = {
    ...data,
    lessons,
    attendances: [...filtered, attendance],
    makeupRequests,
  };
  await writeData(next);
  return next;
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
  const data = await readData();
  assertBranchExists(data, student.branchId);
  const s: Student = {
    ...student,
    id: uid("stu"),
    active: true,
    createdAt: new Date().toISOString(),
  };
  const next = { ...data, students: [...data.students, s] };
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

export async function addTeacher(
  teacher: Omit<Teacher, "id" | "active" | "color">
): Promise<AppData> {
  const data = await readData();
  assertBranchExists(data, teacher.branchId);
  const colors = ["#7c3aed", "#0891b2", "#db2777", "#ea580c", "#059669", "#4f46e5"];
  const t: Teacher = {
    ...teacher,
    id: uid("tch"),
    active: true,
    color: colors[data.teachers.length % colors.length],
  };
  const next = { ...data, teachers: [...data.teachers, t] };
  await writeData(next);
  return next;
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
  const data = await readData();
  const payments: Payment[] = data.payments.map((p) => {
    if (p.id !== paymentId) return p;
    const student = data.students.find((s) => s.id === p.studentId);
    return {
      ...p,
      status: "paid",
      paidAmount: normalized.amount ?? p.amount,
      paidAt: normalized.paidAt ?? new Date().toISOString(),
      method: normalized.method || p.method || student?.paymentMethod || "Havale",
      ...(normalized.paymentNote !== undefined ? { paymentNote: normalized.paymentNote } : {}),
      ...(normalized.receivedByUserId !== undefined ? { receivedByUserId: normalized.receivedByUserId } : {}),
    };
  });
  const next = { ...data, payments };
  await writeData(next);
  return next;
}

export type UpdatePaymentPatch = {
  method?: string;
  paidAmount?: number;
  paymentNote?: string;
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
  patch: Partial<Pick<Room, "name" | "capacity" | "branchId" | "instruments" | "active" | "archivedAt">>
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
}): Promise<AppData> {
  const data = await readData();
  const validation = validateLessonSlot(
    data,
    { instrument: input.instrument, studentId: input.studentId },
    { teacherId: input.teacherId, roomId: input.roomId, startAt: input.startAt },
    { durationMinutes: input.durationMinutes }
  );
  if (!validation.ok) throw new Error(validation.message);
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
  };
  const next = { ...data, lessons: [...data.lessons, lesson] };
  await writeData(next);
  return next;
}

export async function updateLessonSchedule(input: {
  lessonId: string;
  startAt?: string;
  durationMinutes?: number;
}): Promise<AppData> {
  const data = await readData();
  const result = applyLessonScheduleUpdate(data, input);
  if (!result.ok) throw new Error(result.message);
  await writeData(result.data);
  return result.data;
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
  options?: { skipConflicts?: boolean }
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
  if (result.ok) await writeData(result.data);
  return result;
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
  if (result.ok) await writeData(result.data);
  return result;
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
  periodEnd: string
): Promise<CreateTeacherPayoutResult> {
  const data = await readData();
  assertTeacherExists(data, teacherId);
  const result = createTeacherPayoutSnapshot(data, teacherId, periodStart, periodEnd);
  if (result.ok) await writeData(result.data);
  return result;
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

export async function updateFeeRoundingMode(feeRoundingMode: FeeRoundingMode): Promise<AppData> {
  const data = await readData();
  const next = { ...data, settings: { ...data.settings, feeRoundingMode } };
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
  const next = { ...data, students };
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


export async function applyLessonOpsFlagLive(
  lessonId: string,
  flag: LessonOpsFlag,
  actorUserId: string
): Promise<ReturnType<typeof applyLessonOpsFlag>> {
  const data = await readData();
  const result = applyLessonOpsFlag(data, lessonId, flag, actorUserId);
  if (result.ok && !result.alreadySet) {
    await writeData(result.data);
  }
  return result;
}

/** ÖNCELİK 4 (devam) — onaylı statü DEĞİŞİMİ (bkz. lesson-ops.ts switchLessonOpsFlag). */
export async function switchLessonOpsFlagLive(
  lessonId: string,
  flag: LessonOpsFlag,
  actorUserId: string
): Promise<ReturnType<typeof switchLessonOpsFlag>> {
  const data = await readData();
  const result = switchLessonOpsFlag(data, lessonId, flag, actorUserId);
  if (result.ok && !result.alreadySet) {
    await writeData(result.data);
  }
  return result;
}
