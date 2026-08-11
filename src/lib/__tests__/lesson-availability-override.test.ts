import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createLessonTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

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
});

/** t1 (Turgay Hoşbaş) hiçbir Pazar (dayOfWeek 0) penceresi bildirmemiş — bkz. src/lib/seed.ts. */
function nextSundayIso(hour = 11): string {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

/**
 * İş 3 — uçtan uca: createLessonTool üzerinden, öğretmen müsait
 * görünmeyen bir saatte önce reddedilir (overridable detayıyla), sonra
 * `overrideAvailability: true` ile aynı saatte başarıyla oluşturulur ve
 * `Lesson.availabilityOverride` kalıcı olarak işaretlenir.
 */
describe("createLessonTool — İş 3 müsaitlik override akışı", () => {
  it("onaysız istek TEACHER_UNAVAILABLE ile reddedilir ve overridable:true detayı taşır", async () => {
    const res = await createLessonTool(ctx(), {
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      instrument: "Piyano",
      startAt: nextSundayIso(),
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
    expect(res.error.details).toMatchObject({ slotValidationCode: "TEACHER_UNAVAILABLE", overridable: true });
  });

  it("overrideAvailability:true ile aynı saatte ders oluşturulur ve availabilityOverride kalıcı işaretlenir", async () => {
    const res = await createLessonTool(ctx(), {
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      instrument: "Piyano",
      startAt: nextSundayIso(),
      overrideAvailability: true,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const data = await readData();
    const lesson = data.lessons.find((l) => l.id === res.data.lessonId);
    expect(lesson).toBeDefined();
    expect(lesson?.availabilityOverride).toBeDefined();
    expect(lesson?.availabilityOverride?.by).toBe("u1");
  });

  it("overrideAvailability:true olsa bile öğretmenin öğretmediği enstrüman (TEACHER_INSTRUMENT_MISMATCH) hard block kalır", async () => {
    const res = await createLessonTool(ctx(), {
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      instrument: "Bateri",
      startAt: nextSundayIso(),
      overrideAvailability: true,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    const details = res.error.details as { slotValidationCode?: string; overridable?: boolean } | undefined;
    expect(details?.slotValidationCode).toBe("TEACHER_INSTRUMENT_MISMATCH");
    expect(details?.overridable).toBe(false);
  });
});
