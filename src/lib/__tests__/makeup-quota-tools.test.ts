import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  createMakeupLessonTool,
  markAttendanceTool,
  setLessonOpsFlagTool,
  updateMonthlyMakeupAllowanceTool,
  createLessonTool,
} from "../services/tools";
import { readData } from "../store";
import { writeData } from "../store-json";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { validateLessonSlot } from "../makeup-engine";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const CLOSED_DAYS_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "closed-days.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "SCHOOL_ADMIN",
    userId: "u1",
    tenantId: DEFAULT_TENANT_ID,
    channel: "web",
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(CLOSED_DAYS_FILE, { force: true });
});

async function findOpenSlot(): Promise<string> {
  const data = await readData();
  for (let offset = 1; offset <= 14; offset++) {
    for (let hour = 9; hour <= 16; hour++) {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      d.setHours(hour, 0, 0, 0);
      if (d.getDay() === 1) continue;
      const candidate = d.toISOString();
      const check = validateLessonSlot(
        data,
        { instrument: "Piyano", studentId: "s1" },
        { teacherId: "t1", roomId: "r1", startAt: candidate }
      );
      if (check.ok) return candidate;
    }
  }
  throw new Error("no open slot found");
}

async function createTestLesson(): Promise<string> {
  const startAt = await findOpenSlot();
  const res = await createLessonTool(ctx(), {
    studentId: "s1",
    teacherId: "t1",
    roomId: "r1",
    instrument: "Piyano",
    startAt,
  });
  if (!res.ok) throw new Error(res.error.message);
  return res.data.lessonId;
}

describe("telafi kotası — tool katmanı", () => {
  it("hak 0 iken createMakeupLesson VALIDATION_ERROR döner", async () => {
    await updateMonthlyMakeupAllowanceTool(ctx(), { monthlyMakeupAllowance: 0 });
    const lessonId = await createTestLesson();
    const res = await createMakeupLessonTool(ctx(), { lessonId, status: "absent" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("VALIDATION_ERROR");
      expect(res.error.message).toMatch(/kapalı/);
    }
  });

  it("2 hak dolunca 3. markAttendance VALIDATION_ERROR döner", async () => {
    await updateMonthlyMakeupAllowanceTool(ctx(), { monthlyMakeupAllowance: 2 });
    // Kota artık DÖNEM bazlı (Nilüfer Acar politikası §3) — seed talepleri,
    // asıl test dersiyle AYNI eğitim dönemine düşen gerçek derslere bağlanmalı
    // (yoksa periodKeyForLesson farklı/"bilinmeyen-donem" döner ve kota
    // yanlışlıkla sıfırlanmış görünür).
    const seedLessonId1 = await createTestLesson();
    const seedLessonId2 = await createTestLesson();
    const data = await readData();
    const now = new Date().toISOString();
    await writeData({
      ...data,
      makeupRequests: [
        ...data.makeupRequests.filter((m) => m.studentId !== "s1"),
        {
          id: "mk_seed_1",
          studentId: "s1",
          teacherId: "t1",
          branchId: "erzene",
          instrument: "Piyano",
          sourceLessonId: seedLessonId1,
          attendanceId: "a1",
          status: "pending",
          reason: "seed",
          expiresAt: now,
          suggestedSlots: [],
          createdAt: now,
          policyNote: "seed",
        },
        {
          id: "mk_seed_2",
          studentId: "s1",
          teacherId: "t1",
          branchId: "erzene",
          instrument: "Piyano",
          sourceLessonId: seedLessonId2,
          attendanceId: "a2",
          status: "confirmed",
          reason: "seed",
          expiresAt: now,
          suggestedSlots: [],
          createdAt: now,
          policyNote: "seed",
        },
      ],
    });
    const lessonId = await createTestLesson();
    const res = await markAttendanceTool(ctx(), { lessonId, status: "absent" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("öğretmen başka kurum kotasını değiştiremez; admin 0 yapınca telafi bayrağı reddedilir", async () => {
    const forbidden = await updateMonthlyMakeupAllowanceTool(ctx({ role: "TEACHER", teacherId: "t1" }), {
      monthlyMakeupAllowance: 0,
    });
    expect(forbidden.ok).toBe(false);

    await updateMonthlyMakeupAllowanceTool(ctx(), { monthlyMakeupAllowance: 0 });
    const lessonId = await createTestLesson();
    const res = await setLessonOpsFlagTool(ctx(), { lessonId, flag: "makeup" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("VALIDATION_ERROR");
  });
});
