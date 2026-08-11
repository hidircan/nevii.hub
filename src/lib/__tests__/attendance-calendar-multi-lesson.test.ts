import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createLessonTool, setLessonOpsFlagTool, getAttendanceCalendarMonthTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { validateLessonSlot } from "../makeup-engine";

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

/** t1 (Turgay Hoşbaş) için o gün hiç ders olmayan bir Salı/Perşembe/vb. iş günü bulur. */
async function findFreeWeekday(): Promise<string> {
  const data = await readData();
  const busyDates = new Set(
    data.lessons.filter((l) => l.studentId === "s1" || l.teacherId === "t1").map((l) => l.startAt.slice(0, 10))
  );
  for (let offset = 1; offset <= 20; offset++) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    if (d.getDay() === 0 || d.getDay() === 1) continue; // Pazar kapalı, Pazartesi zaten dolu olabilir
    const dateKey = d.toISOString().slice(0, 10);
    if (!busyDates.has(dateKey)) return dateKey;
  }
  throw new Error("no free weekday found");
}

/**
 * İş 2 — aynı öğrencinin aynı günde birden fazla dersi olduğunda takvim
 * her birini AYRI, kimliklenebilir bir satır olarak döner ve statü
 * güncellemeleri birbirinden bağımsız kalır.
 */
describe("getAttendanceCalendarMonthTool — aynı gün birden fazla ders (İş 2)", () => {
  it("aynı öğrencinin aynı gün 2 dersi ayrı satırlar olarak, saat/öğretmen/enstrüman/oda/süre bilgisiyle döner", async () => {
    const dateKey = await findFreeWeekday();
    const morning = `${dateKey}T10:00:00.000Z`;
    const afternoon = `${dateKey}T14:00:00.000Z`;

    const data0 = await readData();
    for (const startAt of [morning, afternoon]) {
      const check = validateLessonSlot(
        data0,
        { instrument: "Piyano", studentId: "s1" },
        { teacherId: "t1", roomId: "r1", startAt }
      );
      expect(check.ok, `slot ${startAt} beklenmedik şekilde geçersiz`).toBe(true);
    }

    const l1 = await createLessonTool(ctx(), { studentId: "s1", teacherId: "t1", roomId: "r1", instrument: "Piyano", startAt: morning });
    expect(l1.ok).toBe(true);
    if (!l1.ok) return;
    const l2 = await createLessonTool(ctx(), { studentId: "s1", teacherId: "t1", roomId: "r1", instrument: "Piyano", startAt: afternoon });
    expect(l2.ok).toBe(true);
    if (!l2.ok) return;

    const [year, month] = dateKey.split("-").map(Number) as [number, number];
    const monthRes = await getAttendanceCalendarMonthTool(ctx(), { studentId: "s1", year, month });
    expect(monthRes.ok).toBe(true);
    if (!monthRes.ok) return;

    const day = monthRes.data.days.find((d) => d.date === dateKey);
    expect(day).toBeDefined();
    expect(day?.lessonIds).toHaveLength(2);
    expect(day?.lessons).toHaveLength(2);

    const [first, second] = day!.lessons;
    expect(first!.startAt < second!.startAt).toBe(true); // saat sırasına göre sıralı
    expect(first!.teacherName).toBe("Turgay Hoşbaş");
    expect(first!.instrument).toBe("Piyano");
    expect(first!.roomName).toBeDefined();
    expect(first!.durationMinutes).toBeGreaterThan(0);
  });

  it("bir dersi 'telafi', diğerini 'geldi' işaretlemek birbirinden bağımsız kalır", async () => {
    const dateKey = await findFreeWeekday();
    const morning = `${dateKey}T10:00:00.000Z`;
    const afternoon = `${dateKey}T14:00:00.000Z`;

    const l1 = await createLessonTool(ctx(), { studentId: "s1", teacherId: "t1", roomId: "r1", instrument: "Piyano", startAt: morning });
    const l2 = await createLessonTool(ctx(), { studentId: "s1", teacherId: "t1", roomId: "r1", instrument: "Piyano", startAt: afternoon });
    expect(l1.ok && l2.ok).toBe(true);
    if (!l1.ok || !l2.ok) return;

    const flag1 = await setLessonOpsFlagTool(ctx(), { lessonId: l1.data.lessonId, flag: "attended" });
    expect(flag1.ok).toBe(true);
    const flag2 = await setLessonOpsFlagTool(ctx(), { lessonId: l2.data.lessonId, flag: "makeup" });
    expect(flag2.ok).toBe(true);

    const [year, month] = dateKey.split("-").map(Number) as [number, number];
    const monthRes = await getAttendanceCalendarMonthTool(ctx(), { studentId: "s1", year, month });
    expect(monthRes.ok).toBe(true);
    if (!monthRes.ok) return;
    const day = monthRes.data.days.find((d) => d.date === dateKey)!;

    const status1 = day.lessons.find((l) => l.lessonId === l1.data.lessonId)?.opsStatus;
    const status2 = day.lessons.find((l) => l.lessonId === l2.data.lessonId)?.opsStatus;
    expect(status1).toBe("attended");
    expect(status2).toBe("makeup");
  });
});
