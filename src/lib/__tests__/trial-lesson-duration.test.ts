import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createTrialLessonTool } from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { isWeeklyClosedDayForTerm } from "../attendance-calendar";
import { listTrialLessons, getTrialLesson, TRIAL_LESSONS_FILE } from "../trial-lessons";

/** createTrialLessonTool `assertSchedulableDate` ile Pazartesi'yi reddeder — Date.now()+N gün Pazartesi'ye denk gelmesin. */
function openStartAt(openDaysAhead: number): string {
  const d = new Date();
  let added = 0;
  while (added < openDaysAhead) {
    d.setDate(d.getDate() + 1);
    if (!isWeeklyClosedDayForTerm(d)) added++;
  }
  d.setHours(11, 0, 0, 0);
  return d.toISOString();
}

/**
 * KESİN İŞ KURALI (2026-09-01 revizyonu) — deneme dersleri öğretmenlerin
 * ders araları için planlanır ve yalnızca 10, 15 veya 20 dakika olabilir
 * (bkz. src/lib/lesson-duration.ts TRIAL_LESSON_DURATION_OPTIONS). Normal
 * ders serisinin 30/40/50 dk seçenekleriyle (LESSON_DURATION_OPTIONS)
 * KARIŞTIRILMAMALI — önceki "serbest süre" (1-240 dk) davranışı YANLIŞTI ve
 * bu revizyonla kaldırıldı. 20 dakikadan uzun bir deneme dersi ASLA kabul
 * edilmemelidir.
 */
const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

vi.mock("../audit/log", () => ({ recordAuditLog: vi.fn().mockResolvedValue(undefined) }));

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(TRIAL_LESSONS_FILE, { force: true });
  vi.clearAllMocks();
});

const baseInput = {
  name: "Deneme Öğrencisi",
  phone: "05551234567",
  instrument: "Piyano",
  branchId: "erzene",
  teacherId: "t1",
  startAt: openStartAt(3),
  notes: "",
};

describe("createTrialLessonTool — süre sınırı (yalnızca 10/15/20 dk)", () => {
  it("10 dk kabul edilir", async () => {
    const res = await createTrialLessonTool(ctx(), { ...baseInput, startAt: openStartAt(3), durationMinutes: 10 });
    expect(res.ok).toBe(true);
  });

  it("15 dk kabul edilir", async () => {
    const res = await createTrialLessonTool(ctx(), { ...baseInput, startAt: openStartAt(4), durationMinutes: 15 });
    expect(res.ok).toBe(true);
  });

  it("20 dk kabul edilir (üst sınır dahil)", async () => {
    const res = await createTrialLessonTool(ctx(), { ...baseInput, startAt: openStartAt(5), durationMinutes: 20 });
    expect(res.ok).toBe(true);
  });

  it("0 dk VALIDATION_ERROR ile reddedilir", async () => {
    const res = await createTrialLessonTool(ctx(), { ...baseInput, startAt: openStartAt(6), durationMinutes: 0 });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("negatif süre VALIDATION_ERROR ile reddedilir", async () => {
    const res = await createTrialLessonTool(ctx(), { ...baseInput, startAt: openStartAt(7), durationMinutes: -10 });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("NaN süre VALIDATION_ERROR ile reddedilir", async () => {
    const res = await createTrialLessonTool(ctx(), { ...baseInput, startAt: openStartAt(8), durationMinutes: Number.NaN });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("ondalıklı süre (ör. 15.5 dk) VALIDATION_ERROR ile reddedilir", async () => {
    const res = await createTrialLessonTool(ctx(), { ...baseInput, startAt: openStartAt(9), durationMinutes: 15.5 });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("21 dk (20'den yalnızca 1 fazla) VALIDATION_ERROR ile reddedilir", async () => {
    const res = await createTrialLessonTool(ctx(), { ...baseInput, startAt: openStartAt(10), durationMinutes: 21 });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("normal ders serisinin 30/40/50 dk süreleri artık deneme dersinde REDDEDİLİR", async () => {
    for (const [i, dur] of [30, 40, 50].entries()) {
      const res = await createTrialLessonTool(ctx(), {
        ...baseInput,
        startAt: openStartAt(11 + i),
        durationMinutes: dur,
      });
      expect(res.ok).toBe(false);
      if (res.ok) continue;
      expect(res.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("60 dk ve 90 dk VALIDATION_ERROR ile reddedilir", async () => {
    const res60 = await createTrialLessonTool(ctx(), {
      ...baseInput,
      startAt: openStartAt(15),
      durationMinutes: 60,
    });
    expect(res60.ok).toBe(false);
    if (!res60.ok) expect(res60.error.code).toBe("VALIDATION_ERROR");

    const res90 = await createTrialLessonTool(ctx(), {
      ...baseInput,
      startAt: openStartAt(16),
      durationMinutes: 90,
    });
    expect(res90.ok).toBe(false);
    if (!res90.ok) expect(res90.error.code).toBe("VALIDATION_ERROR");
  });

  it("geçersiz süre isteğinde HİÇBİR deneme dersi kaydı oluşturulmaz", async () => {
    const before = await listTrialLessons(DEFAULT_TENANT_ID);
    const res = await createTrialLessonTool(ctx(), { ...baseInput, startAt: openStartAt(17), durationMinutes: 90 });
    expect(res.ok).toBe(false);
    const after = await listTrialLessons(DEFAULT_TENANT_ID);
    expect(after.length).toBe(before.length);
  });

  it("takvim çakışma denetimi gerçek seçili süreyi (10/15/20) kullanır — endAt startAt + durationMinutes'tir", async () => {
    const startAt = openStartAt(18);
    const res = await createTrialLessonTool(ctx(), { ...baseInput, startAt, durationMinutes: 20 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const trial = await getTrialLesson(DEFAULT_TENANT_ID, res.data.trialId);
    expect(trial).not.toBeNull();
    const expectedEnd = new Date(new Date(startAt).getTime() + 20 * 60_000).toISOString();
    expect(trial?.endAt).toBe(expectedEnd);
    expect(trial?.durationMinutes).toBe(20);
  });

  it("TEACHER rolü yalnızca kendi deneme dersini oluşturabilir — başka öğretmen adına FORBIDDEN alır", async () => {
    const res = await createTrialLessonTool(
      ctx({ role: "TEACHER", teacherId: "t-other" }),
      { ...baseInput, startAt: openStartAt(19), teacherId: "t1", durationMinutes: 15 }
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });

  it("tenant kapsamı korunur — oluşturulan deneme dersi çağıran ctx().tenantId'ye ait olur", async () => {
    const startAt = openStartAt(20);
    const res = await createTrialLessonTool(ctx(), { ...baseInput, startAt, durationMinutes: 10 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const trial = await getTrialLesson(DEFAULT_TENANT_ID, res.data.trialId);
    expect(trial).not.toBeNull();
  });
});
