import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  createTeacherTool,
  createTrialLessonTool,
  updateTrialLessonTool,
  updateTrialLessonStatusTool,
  deleteTrialLessonTool,
  listTrialLessonsTool,
  setCriticalActionPasswordTool,
} from "../services/tools";
import { CRITICAL_ACTION_PASSWORD_FILE } from "../critical-action-password";
import { __resetRateLimitForTests } from "../rate-limit";
import { TRIAL_LESSONS_FILE, getTrialLesson, markTrialConverted } from "../trial-lessons";
import { PLATFORM_STORE_FILE, grantBranchAccess } from "../platform/store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

/**
 * Sahip emri (2026-09-28): deneme satırı HER ZAMAN düzenlenebilir
 * (geçmiş/kayıtlı/iptal ayrımı yok — ad düzeltmesi dahil), arşivlenebilir
 * ve silinebilir. Kilitlenen davranış:
 * 1. Geçmiş denemenin planı (tarih/öğretmen) admin tarafından değiştirilir.
 * 2. Kayda dönüşmüş denemenin adı düzeltilir; dönüşüm bağı bozulmaz.
 * 3. Silme satırı kaldırır (öğrenci/evrak arşivine dokunmaz), denetim izli.
 * 4. Arşivleme = statü cancelled (geri açılabilir).
 * 5-6. 2026-09-29 owner kuralı: kalıcı silme yalnız kurum sahibi/yöneticisi + kritik
 *      şifre + gerekçe. Şube müdürü ve öğretmen (kendi denemesi dahil) silemez.
 */
const PW = "Kritik-Deneme-1";
const CRIT = { criticalPassword: PW, reason: "Yanlış girilmiş deneme" };
const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

vi.mock("../audit/log", () => ({ recordAuditLog: vi.fn().mockResolvedValue(undefined) }));

function adminCtx(): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
}
function bmCtx(userId: string): ServiceContext {
  return { role: "BRANCH_MANAGER", userId, tenantId: DEFAULT_TENANT_ID, channel: "web" };
}
function teacherCtx(teacherId: string): ServiceContext {
  return { role: "TEACHER", userId: `user_${teacherId}`, teacherId, tenantId: DEFAULT_TENANT_ID, channel: "web" };
}
function studentCtx(): ServiceContext {
  return { role: "STUDENT", userId: "u_student", tenantId: DEFAULT_TENANT_ID, channel: "web" };
}

let teacherByBranch: Record<string, string> = { erzene: "t1" };
async function teacherFor(branchId: string): Promise<string> {
  if (teacherByBranch[branchId]) return teacherByBranch[branchId]!;
  const created = await createTeacherTool(adminCtx(), {
    name: `${branchId} Öğretmeni`,
    phone: "5554443322",
    branchId,
    instrument: "Piyano",
    hireDate: "2026-01-01",
  });
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error("öğretmen kurulumu başarısız");
  teacherByBranch[branchId] = created.data.teacherId;
  return created.data.teacherId;
}

async function seedTrial(branchId: string, name: string, startAt: string): Promise<string> {
  const created = await createTrialLessonTool(adminCtx(), {
    name,
    phone: "05551234567",
    instrument: "Piyano",
    branchId,
    teacherId: await teacherFor(branchId),
    notes: "",
    allowAvailabilityOverride: true,
    startAt,
    durationMinutes: 20,
  });
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error("kurulum başarısız");
  return created.data.trialId;
}

const FUTURE = "2026-10-06T12:00:00.000Z";
const FUTURE_2 = "2026-10-06T14:00:00.000Z";
const PAST_START = "2026-01-05T12:00:00.000Z";
const PAST_END = "2026-01-05T12:20:00.000Z";

/**
 * Kurulum aracı gelecek tarih ister; "geçmiş deneme" için satır dosyada
 * geriye alınır (yalnız test kurulumu — üretimde zaman makinesi yok).
 */
async function backdateToPast(trialId: string): Promise<void> {
  const raw = await fs.readFile(TRIAL_LESSONS_FILE, "utf8");
  const rows = JSON.parse(raw) as Array<Record<string, unknown>>;
  const row = rows.find((r) => r.id === trialId);
  expect(row).toBeTruthy();
  row!.startAt = PAST_START;
  row!.endAt = PAST_END;
  await fs.writeFile(TRIAL_LESSONS_FILE, JSON.stringify(rows, null, 2));
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(TRIAL_LESSONS_FILE, { force: true });
  await fs.rm(PLATFORM_STORE_FILE, { force: true });
  await fs.rm(CRITICAL_ACTION_PASSWORD_FILE, { force: true });
  __resetRateLimitForTests();
  teacherByBranch = { erzene: "t1" };
  vi.clearAllMocks();
  const pw = await setCriticalActionPasswordTool({ ...adminCtx(), role: "SUPER_ADMIN" }, { newPassword: PW });
  expect(pw.ok).toBe(true);
});

describe("deneme satırı her zaman yönetilebilir", () => {
  it("geçmiş denemenin adı + tarihi düzeltilir (kilit yok)", async () => {
    const id = await seedTrial("erzene", "Yanlıs İsim", FUTURE);
    await backdateToPast(id);
    const res = await updateTrialLessonTool(adminCtx(), {
      trialId: id,
      name: "Doğru İsim",
      startAt: "2026-01-06T12:00:00.000Z",
      durationMinutes: 20,
      allowAvailabilityOverride: true,
    });
    expect(res.ok).toBe(true);
    const row = await getTrialLesson(DEFAULT_TENANT_ID, id);
    expect(row?.name).toBe("Doğru İsim");
  });

  it("kayda dönüşmüş denemenin adı düzelir, dönüşüm bağı korunur", async () => {
    const id = await seedTrial("erzene", "Yanlıs İsim", FUTURE);
    await backdateToPast(id);
    const converted = await markTrialConverted(DEFAULT_TENANT_ID, id, { studentId: "stu_1", userId: "u1" });
    expect(converted).toBe(true);
    const res = await updateTrialLessonTool(adminCtx(), { trialId: id, name: "Doğru İsim", durationMinutes: 20 });
    expect(res.ok).toBe(true);
    const row = await getTrialLesson(DEFAULT_TENANT_ID, id);
    expect(row?.name).toBe("Doğru İsim");
    expect(row?.convertedStudentId).toBe("stu_1");
  });

  it("iptal deneme geri açılıp planı değiştirilir", async () => {
    const id = await seedTrial("erzene", "Aday", FUTURE);
    const cancelled = await updateTrialLessonStatusTool(adminCtx(), { trialId: id, status: "cancelled" });
    expect(cancelled.ok).toBe(true);
    const upd = await updateTrialLessonTool(adminCtx(), { trialId: id, notes: "iptalken not", durationMinutes: 20 });
    expect(upd.ok).toBe(true);
  });

  it("silme satırı kaldırır, arşivleme cancelled işaretler", async () => {
    const delId = await seedTrial("erzene", "Silinecek", FUTURE);
    const archId = await seedTrial("erzene", "Arşivlenecek", FUTURE_2);
    const del = await deleteTrialLessonTool(adminCtx(), { trialId: delId, ...CRIT });
    expect(del.ok).toBe(true);
    expect(await getTrialLesson(DEFAULT_TENANT_ID, delId)).toBeNull();
    const listed = await listTrialLessonsTool(adminCtx());
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.data.trials.some((t) => t.id === delId)).toBe(false);
    const arch = await updateTrialLessonStatusTool(adminCtx(), { trialId: archId, status: "cancelled" });
    expect(arch.ok).toBe(true);
    expect((await getTrialLesson(DEFAULT_TENANT_ID, archId))?.status).toBe("cancelled");
    const reopen = await updateTrialLessonStatusTool(adminCtx(), { trialId: archId, status: "planned" });
    expect(reopen.ok).toBe(true);
  });

  it("olmayan satırı silme NOT_FOUND döner", async () => {
    const res = await deleteTrialLessonTool(adminCtx(), { trialId: "trial_yok", ...CRIT });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("NOT_FOUND");
  });

  it("şube müdürü kendi şubesindeki denemeyi de şifreyle bile silemez (yalnız sahip/yönetici)", async () => {
    const ownId = await seedTrial("erzene", "Kendi", FUTURE);
    await grantBranchAccess({ tenantId: DEFAULT_TENANT_ID, userId: "user_bm_1", branchId: "erzene", grantedBy: "u1" });
    const res = await deleteTrialLessonTool(bmCtx("user_bm_1"), { trialId: ownId, ...CRIT });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
    expect(await getTrialLesson(DEFAULT_TENANT_ID, ownId)).not.toBeNull();
  });

  it("öğretmen (kendi denemesi dahil) ve öğrenci silemez", async () => {
    const otherTeacher = await teacherFor("evka3");
    const otherId = await seedTrial("evka3", "Başka", FUTURE);
    const teacher = await deleteTrialLessonTool(teacherCtx(otherTeacher), { trialId: otherId, ...CRIT });
    expect(teacher.ok).toBe(false);
    const student = await deleteTrialLessonTool(studentCtx(), { trialId: otherId, ...CRIT });
    expect(student.ok).toBe(false);
    expect(await getTrialLesson(DEFAULT_TENANT_ID, otherId)).not.toBeNull();
  });

  it("yanlış şifre veya boş gerekçe hiçbir satırı silmez", async () => {
    const id = await seedTrial("erzene", "Korunan", FUTURE);
    const wrong = await deleteTrialLessonTool(adminCtx(), { trialId: id, criticalPassword: "yanlis", reason: "Yanlış girildi" });
    expect(wrong.ok).toBe(false);
    const noReason = await deleteTrialLessonTool(adminCtx(), { trialId: id, criticalPassword: PW, reason: "  " });
    expect(noReason.ok).toBe(false);
    expect(await getTrialLesson(DEFAULT_TENANT_ID, id)).not.toBeNull();
  });
});
