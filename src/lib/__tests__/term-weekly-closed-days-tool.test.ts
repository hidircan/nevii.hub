import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { updateTermWeeklyClosedDaysTool, createLessonTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import type { AppData } from "../types";
import { validateLessonSlot } from "../makeup-engine";

/** Herhangi bir gelecek Pazartesi'de gerçekten boş bir saat bulur (kapalı-gün kuralını BİLEREK atlamaz — çağıran taraf kararlaştırır). */
function findOpenMondaySlot(
  data: AppData,
  studentId: string,
  teacherId: string,
  roomId: string,
  /** 2026-09-20 — haftalık kapalı gün kuralı DERSİN dönemine göre çözülür. */
  term: "guz" | "yaz" = "yaz"
): string {
  const now = new Date();
  for (let offset = 1; offset <= 60; offset++) {
    const day = new Date(now);
    day.setDate(day.getDate() + offset);
    if (day.getDay() !== 1) continue; // yalnız Pazartesi
    for (const hour of [9, 10, 11, 12, 13, 14, 15, 16]) {
      const candidate = new Date(day);
      candidate.setHours(hour, 0, 0, 0);
      const iso = candidate.toISOString();
      const check = validateLessonSlot(data, { instrument: "Piyano", studentId, term }, { teacherId, roomId, startAt: iso });
      if (check.ok) return iso;
    }
  }
  throw new Error("no open Monday slot found");
}

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

describe("Çalışma Takvimi — dönem bazlı haftalık kapalı gün özelleştirmesi (Paket 6)", () => {
  it("RBAC dışı bir rol kaydı değiştiremez", async () => {
    const res = await updateTermWeeklyClosedDaysTool(ctx({ role: "TEACHER" }), { guz: [1], yaz: [0, 6] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });

  it("geçerli bir kural setiyle günceller ve okunabilir", async () => {
    const res = await updateTermWeeklyClosedDaysTool(ctx(), { guz: [1, 2], yaz: [0, 6] });
    expect(res.ok).toBe(true);
    const data = await readData();
    expect(data.settings.termWeeklyClosedDays).toEqual({ guz: [1, 2], yaz: [0, 6] });
  });

  it("0-6 dışı gün değeri reddedilir", async () => {
    const res = await updateTermWeeklyClosedDaysTool(ctx(), { guz: [7], yaz: [] });
    expect(res.ok).toBe(false);
  });

  it("güncellenen kural, dönem etiketli yeni ders planlamasında kullanılır (Yaz'da Pazartesi artık açık)", async () => {
    await updateTermWeeklyClosedDaysTool(ctx(), { guz: [1], yaz: [] }); // Yazın hiçbir gün kapalı değil

    const data = await readData();
    const startAt = findOpenMondaySlot(data, "s1", "t1", "r1");
    const res = await createLessonTool(ctx(), {
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      instrument: "Piyano",
      startAt,
      term: "yaz",
    });
    expect(res.ok).toBe(true);
  });

  it("özelleştirme olmadan (varsayılan) Yaz'da Pazartesi zaten planlanabilir — davranış bozulmadı", async () => {
    const data = await readData();
    const startAt = findOpenMondaySlot(data, "s1", "t1", "r1");
    const res = await createLessonTool(ctx(), {
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      instrument: "Piyano",
      startAt,
      term: "yaz",
    });
    expect(res.ok).toBe(true);
  });

  it("özelleştirmeyle Güz döneminde Pazartesi+Salı kapalıyken Salı planlanamaz", async () => {
    await updateTermWeeklyClosedDaysTool(ctx(), { guz: [1, 2], yaz: [0, 6] });
    const now = new Date();
    let tuesday: Date | null = null;
    for (let offset = 1; offset <= 14; offset++) {
      const day = new Date(now);
      day.setDate(day.getDate() + offset);
      if (day.getDay() === 2) {
        tuesday = day;
        break;
      }
    }
    if (!tuesday) throw new Error("no tuesday found");
    tuesday.setHours(10, 0, 0, 0);
    const res = await createLessonTool(ctx(), {
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      instrument: "Piyano",
      startAt: tuesday.toISOString(),
      term: "guz",
    });
    expect(res.ok).toBe(false);
  });
});
