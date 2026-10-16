import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { updateLessonScheduleTool, cancelLessonTool, createLessonTool } from "../services/tools";
import { readData, updateLessonSchedule } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { isWeeklyClosedDayForTerm } from "../attendance-calendar";


// Seed dersleri ve göreli tarihler "bugün"e göre üretilir; gün kapalı güne/geçmişe/müsaitlik dışına düşünce test
// takvime bağlı kırılıyordu (2026-10 CI baseline). Saat sabit bir SALI sabahına dondurulur — yalnız Date sahte.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-15T06:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

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

async function scheduleFutureLesson(): Promise<string> {
  const data = await readData();
  const teacher = data.teachers.find((t) => t.active && t.instruments.includes("Piyano"))!;
  const student = data.students.find((s) => s.active && s.instruments.includes("Piyano"))!;
  const room = data.rooms.find(
    (r) => r.instruments.includes("Piyano") && r.branchId === teacher.branchId
  )!;

  let startAt: string | null = null;
  for (let offset = 1; offset <= 14 && !startAt; offset++) {
    const day = new Date();
    day.setDate(day.getDate() + offset);
    // Merkezi kapalı gün kuralı (legacy: yalnızca Pazartesi) — testin
    // çalıştığı gün tesadüfen Pazartesi'ye denk gelen bir hafta penceresine
    // girerse bile yanlış (kapalı) bir gün denenmesin.
    if (isWeeklyClosedDayForTerm(day)) continue;
    for (let hour = 9; hour <= 17 && !startAt; hour++) {
      const d = new Date(day);
      d.setHours(hour, 0, 0, 0);
      const candidate = d.toISOString();
      const res = await createLessonTool(ctx(), {
        studentId: student.id,
        teacherId: teacher.id,
        roomId: room.id,
        instrument: "Piyano",
        startAt: candidate,
      });
      if (res.ok) startAt = res.data.lessonId;
    }
  }
  if (!startAt) throw new Error("could not schedule a lesson for test setup");
  return startAt;
}

describe("updateLessonScheduleTool · store entegrasyonu", () => {
  it("başarılı resize, veri kaynağındaki ders süresini kalıcı olarak günceller", async () => {
    const lessonId = await scheduleFutureLesson();
    const before = await readData();
    const original = before.lessons.find((l) => l.id === lessonId)!;

    const res = await updateLessonScheduleTool(ctx(), { lessonId, durationMinutes: 90 });
    expect(res.ok).toBe(true);

    const after = await readData();
    const updated = after.lessons.find((l) => l.id === lessonId)!;
    expect(new Date(updated.startAt).getTime()).toBe(new Date(original.startAt).getTime());
    const durationMs = new Date(updated.endAt).getTime() - new Date(updated.startAt).getTime();
    expect(durationMs).toBe(90 * 60 * 1000);
  });

  it("başarılı taşıma, veri kaynağındaki startAt/endAt değerini kalıcı olarak günceller", async () => {
    const lessonId = await scheduleFutureLesson();
    const before = await readData();
    const original = before.lessons.find((l) => l.id === lessonId)!;
    const newStartAt = new Date(new Date(original.startAt).getTime() + 24 * 3600 * 1000).toISOString();

    const res = await updateLessonScheduleTool(ctx(), { lessonId, startAt: newStartAt });
    // Aynı saatte hedef günde çakışma olabilir; öyleyse en az bir sonraki günü dene.
    if (!res.ok) {
      const altStartAt = new Date(new Date(original.startAt).getTime() + 48 * 3600 * 1000).toISOString();
      const res2 = await updateLessonScheduleTool(ctx(), { lessonId, startAt: altStartAt });
      expect(res2.ok).toBe(true);
      return;
    }
    expect(res.ok).toBe(true);

    const after = await readData();
    const updated = after.lessons.find((l) => l.id === lessonId)!;
    expect(new Date(updated.startAt).getTime()).toBe(new Date(newStartAt).getTime());
  });

  it("veli/öğretmen rolü ders taşıyamaz veya süresini değiştiremez (FORBIDDEN)", async () => {
    const lessonId = await scheduleFutureLesson();
    const res = await updateLessonScheduleTool(ctx({ role: "TEACHER" }), {
      lessonId,
      durationMinutes: 60,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });

  it("20 dakikalık geçersiz süre VALIDATION_ERROR ile reddedilir", async () => {
    const lessonId = await scheduleFutureLesson();
    const res = await updateLessonScheduleTool(ctx(), { lessonId, durationMinutes: 20 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  /**
   * P0 mutasyon performansı (2026-09-07) — kapalı gün kuralı tool'dan saf
   * fonksiyona (`applyLessonScheduleUpdate`) taşındı. Kural artık STORE
   * çağrısından geçen HER yolda uygulanır; tool'u atlayan bir çağıran da
   * korunur. Eskiden yalnız tool içinde vardı.
   */
  it("kapalı güne taşıma, tool'u ATLAYIP doğrudan store çağrıldığında da reddedilir", async () => {
    const lessonId = await scheduleFutureLesson();
    const monday = new Date();
    monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7));
    monday.setHours(14, 0, 0, 0);
    expect(monday.getDay()).toBe(1);

    const outcome = await updateLessonSchedule({ lessonId, startAt: monday.toISOString() });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("CLOSED_DAY");
      // 2026-09-20 — mesaj artık çalışma günü TEK KAYNAĞINDAN gelir:
      // gerçek neden + nasıl açılacağı (owner kuralı: her hata nedenini ve
      // çözümünü söyler). Eski sabit "…kapalıdır" metni yerine bunu doğrula.
      expect(outcome.message).toContain("Pazartesi");
      expect(outcome.message).toContain("kapalı günü");
      expect(outcome.message).toContain("Zorla açık");
    }
  });

  it("başarılı taşıma, store'dan tam AppData DEĞİL yalnız güncellenmiş dersi döndürür", async () => {
    const lessonId = await scheduleFutureLesson();
    const before = await readData();
    const original = before.lessons.find((l) => l.id === lessonId)!;
    const target = new Date(new Date(original.startAt).getTime() + 60 * 60 * 1000).toISOString();

    const outcome = await updateLessonSchedule({ lessonId, startAt: target });
    if (!outcome.ok) return; // hedef saat doluysa bu tur bilgi vermez
    expect(outcome.lesson.id).toBe(lessonId);
    expect(outcome.previousStartAt).toBe(original.startAt);
    expect(outcome).not.toHaveProperty("lessons");
  });
});

describe("cancelLessonTool · store entegrasyonu", () => {
  it("planlanmış dersi iptal eder, veri kaynağı durumu yansıtır", async () => {
    const lessonId = await scheduleFutureLesson();
    const res = await cancelLessonTool(ctx(), { lessonId });
    expect(res.ok).toBe(true);

    const after = await readData();
    expect(after.lessons.find((l) => l.id === lessonId)!.status).toBe("cancelled");
  });

  it("veli rolü ders iptal edemez (FORBIDDEN)", async () => {
    const lessonId = await scheduleFutureLesson();
    const res = await cancelLessonTool(ctx({ role: "STUDENT" }), { lessonId });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });
});
