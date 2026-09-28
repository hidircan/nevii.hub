import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  createTeacherTool,
  createTrialLessonTool,
  updateTrialLessonTool,
  updateTrialLessonStatusTool,
  listTrialLessonsTool,
} from "../services/tools";
import { TRIAL_LESSONS_FILE } from "../trial-lessons";
import { PLATFORM_STORE_FILE, grantBranchAccess } from "../platform/store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

/**
 * Şube müdürü deneme revizyonu (sahadan gelen bildirim: listede revize
 * düğmesi hiç görünmüyordu — canWrite + tool rolleri BM'yi dışlıyordu).
 *
 * Kilitlenen kapsam (fail-closed):
 * 1. Liste BM'ye yalnız atanmış şubelerinin denemelerini gösterir (aday
 *    telefonları PII — kapsam dışı satır inmez).
 * 2. Revize + statü değişimi kendi şubesinde OK, başka şubede FORBIDDEN.
 * 3. Kapsam dışına ŞUBE TAŞIMA (branchId değişimi) FORBIDDEN.
 * 4. Erişimi OLMAYAN BM (atanmış şube yok) listede/revizde FORBIDDEN alır.
 * 5. Admin yolu değişmez (kapsam filtresi BM dışını etkilemez).
 */
const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

vi.mock("../audit/log", () => ({ recordAuditLog: vi.fn().mockResolvedValue(undefined) }));

function adminCtx(): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
}
function bmCtx(userId: string): ServiceContext {
  return { role: "BRANCH_MANAGER", userId, tenantId: DEFAULT_TENANT_ID, channel: "web" };
}

function openStartAt(): string {
  return new Date("2026-10-06T12:00:00.000Z").toISOString();
}

/** Şube-öğretmen eşleşmesi zorunlu (validateTrialSlot) — evka3 için kendi öğretmeni.
 * store.json her testte silindiğinden bu önbellek de beforeEach'te sıfırlanır. */
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

async function seedTrial(branchId: string, name: string): Promise<string> {
  const created = await createTrialLessonTool(adminCtx(), {
    name,
    phone: "05551234567",
    instrument: "Piyano",
    branchId,
    teacherId: await teacherFor(branchId),
    notes: "",
    allowAvailabilityOverride: true,
    startAt: openStartAt(),
    durationMinutes: 20,
  });
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error("kurulum başarısız");
  return created.data.trialId;
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(TRIAL_LESSONS_FILE, { force: true });
  await fs.rm(PLATFORM_STORE_FILE, { force: true });
  teacherByBranch = { erzene: "t1" };
  vi.clearAllMocks();
});

describe("şube müdürü deneme kapsamı", () => {
  it("liste yalnız atanmış şubeyi gösterir", async () => {
    await seedTrial("erzene", "erzene Adayı");
    await seedTrial("evka3", "Evka Adayı");
    await grantBranchAccess({ tenantId: DEFAULT_TENANT_ID, userId: "user_bm_1", branchId: "erzene", grantedBy: "u1" });
    const res = await listTrialLessonsTool(bmCtx("user_bm_1"));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.trials.map((t) => t.name)).toEqual(["erzene Adayı"]);
  });

  it("atanmış şube yoksa liste FORBIDDEN döner", async () => {
    await seedTrial("erzene", "erzene Adayı");
    const res = await listTrialLessonsTool(bmCtx("user_bm_yetkisiz"));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });

  it("kendi şubesinde revize + statü OK, başka şubede FORBIDDEN", async () => {
    const ownId = await seedTrial("erzene", "erzene Adayı");
    const otherId = await seedTrial("evka3", "Evka Adayı");
    await grantBranchAccess({ tenantId: DEFAULT_TENANT_ID, userId: "user_bm_1", branchId: "erzene", grantedBy: "u1" });
    const bm = bmCtx("user_bm_1");

    const updOwn = await updateTrialLessonTool(bm, { trialId: ownId, notes: "müdür notu", durationMinutes: 20 });
    expect(updOwn.ok).toBe(true);

    const updOther = await updateTrialLessonTool(bm, { trialId: otherId, notes: "yasak not", durationMinutes: 20 });
    expect(updOther.ok).toBe(false);
    if (updOther.ok) return;
    expect(updOther.error.code).toBe("FORBIDDEN");

    const statusOwn = await updateTrialLessonStatusTool(bm, { trialId: ownId, status: "attended" });
    expect(statusOwn.ok).toBe(true);

    const statusOther = await updateTrialLessonStatusTool(bm, { trialId: otherId, status: "attended" });
    expect(statusOther.ok).toBe(false);
    if (statusOther.ok) return;
    expect(statusOther.error.code).toBe("FORBIDDEN");
  });

  it("kapsam dışına şube taşıma FORBIDDEN (hedef şube kapısı)", async () => {
    const ownId = await seedTrial("erzene", "erzene Adayı");
    await grantBranchAccess({ tenantId: DEFAULT_TENANT_ID, userId: "user_bm_1", branchId: "erzene", grantedBy: "u1" });
    // Slot geçerli olsun diye evka3 öğretmeniyle birlikte taşınır — slot
    // doğrulaması geçer, HEDEF ŞUBE kapısı devreye girer.
    const res = await updateTrialLessonTool(bmCtx("user_bm_1"), {
      trialId: ownId,
      branchId: "evka3",
      teacherId: await teacherFor("evka3"),
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });

  it("admin yolu değişmez — tüm şubeler listelenir ve revize edilir", async () => {
    const otherId = await seedTrial("evka3", "Evka Adayı");
    const listed = await listTrialLessonsTool(adminCtx());
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.data.trials.length).toBeGreaterThanOrEqual(1);
    const upd = await updateTrialLessonTool(adminCtx(), { trialId: otherId, notes: "admin notu", durationMinutes: 20 });
    expect(upd.ok).toBe(true);
  });
});
