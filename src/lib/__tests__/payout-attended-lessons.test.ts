/**
 * 2026-09-30 KRİTİK — Tuçe Avşar vakası: Eylül dersleri yoklamada "Geldi" (tek statü) işaretliydi,
 * hakediş motoru yalnız "İşlendi"yi saydığı için hakediş 0 / "Ders yok" görünüyordu. Ayrıca DB'de
 * `lessonProcessed` varsayılanı false olduğundan "Dersi bitir" ile tamamlanan ders db modda düşüyordu.
 * Owner kararı: Geldi ve tamamlanmış ders hakedişe girer; Telafi/Gelmedi/Mazeretli/iptal girmez.
 * Zincir: yoklama → hesap → kayıt → liste → öğretmen portalı/yazdırma (aynı motor) → mükerrer kayıt yok.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { clearLessonOpsFlagTool, createTeacherPayoutTool, setLessonOpsFlagTool, setTeacherPayoutPolicyTool } from "../services/tools";
import { readData } from "../store";
import { writeData } from "../store-json";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { computeTeacherEarningsForPeriod, computeTeacherEarningsWithRevisions } from "../teacher-payout";
import { buildPayoutOverviewRows } from "../payout-overview";
import type { Lesson } from "../types";

const DIR = resolveDataDir(path.join(process.cwd(), "data"));

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(path.join(DIR, "store.json"), { force: true });
  await fs.rm(path.join(DIR, "closed-days.json"), { force: true });
});

/** DB'den okunan biçim: bayraklar hep boolean (varsayılan false). */
function dbLesson(id: string, start: string, patch: Partial<Lesson> = {}): Lesson {
  const s = new Date(start);
  return {
    id,
    studentId: "s1",
    teacherId: "t1",
    roomId: "r1",
    branchId: "erzene",
    instrument: "Piyano",
    startAt: s.toISOString(),
    endAt: new Date(s.getTime() + 50 * 60_000).toISOString(),
    type: "regular",
    status: "scheduled",
    lessonProcessed: false,
    studentAttended: false,
    opsMakeupFlag: false,
    studentAbsent: false,
    studentExcused: false,
    ...patch,
  } as Lesson;
}

const START = "2026-11-01";
const END = "2026-11-30";

describe("hakediş — Geldi ve tamamlanmış dersler (Tuçe vakası)", () => {
  it("yoklamada Geldi işaretlenen ders hesaba, kayda, listeye ve portala aynı tutarla girer; mükerrer kayıt yok", async () => {
    const data = await readData();
    await writeData({
      ...data,
      lessons: [...data.lessons, dbLesson("g1", "2026-11-17T11:15:00Z"), dbLesson("g2", "2026-11-24T11:15:00Z")],
    });
    expect((await setTeacherPayoutPolicyTool(ctx(), { month: "2026-11", policy: "fixed_duration", rate30: 350, rate40: 450, rate50: 600 })).ok).toBe(true);

    // Kök neden: yalnız Geldi (İşlendi değil) → eskiden 0 ders.
    for (const lessonId of ["g1", "g2"]) {
      expect((await setLessonOpsFlagTool(ctx(), { lessonId, flag: "attended" })).ok).toBe(true);
    }
    const live = computeTeacherEarningsForPeriod(await readData(), "t1", START, END);
    expect(live.lines.map((l) => l.lessonId).sort()).toEqual(["g1", "g2"]);
    expect(live.totalAmount).toBe(1200);

    const beforeRecord = buildPayoutOverviewRows(await readData(), START, END).find((r) => r.teacher.id === "t1")!;
    expect(beforeRecord).toMatchObject({ lessonCount: 2, totalAmount: 1200, hasRecord: false, status: "pending" });

    const created = await createTeacherPayoutTool(ctx(), { teacherId: "t1", periodStart: START, periodEnd: END });
    expect(created.ok).toBe(true);
    const after = await readData();
    const row = buildPayoutOverviewRows(after, START, END).find((r) => r.teacher.id === "t1")!;
    expect(row).toMatchObject({ lessonCount: 2, totalAmount: 1200, hasRecord: true, drift: 0 });
    // Öğretmen portalı / detay / yazdırma aynı motoru okur.
    expect(computeTeacherEarningsWithRevisions(after, "t1", START, END).totalAmount).toBe(1200);

    const dup = await createTeacherPayoutTool(ctx(), { teacherId: "t1", periodStart: START, periodEnd: END });
    expect(dup.ok).toBe(false);
    expect((await readData()).teacherPayouts.filter((p) => p.teacherId === "t1" && p.status !== "cancelled" && p.periodStart.startsWith("2026-11"))).toHaveLength(1);

    // 2026-10-04 (owner, Turgay vakası): ödenmemiş (hesaplanmış) hakedişte Geldi geri alınabilir;
    // hakediş kaydı sessizce eski kalmaz, güncel hesapla yeniden donar.
    const undo = await clearLessonOpsFlagTool(ctx(), { lessonId: "g1", expected: "attended" });
    expect(undo.ok ? "ok" : undo.error.message).toBe("ok");
    const recalculated = (await readData()).teacherPayouts.find((p) => p.teacherId === "t1" && p.status !== "cancelled" && p.periodStart.startsWith("2026-11"))!;
    expect(recalculated.totalAmount).toBe(600);
  });

  it("DB biçimi: Dersi bitir (completed, lessonProcessed=false) sayılır; Telafi/Gelmedi/Mazeretli/iptal/planlı sayılmaz", async () => {
    const base = await readData();
    const data = {
      ...base,
      lessons: [
        dbLesson("c1", "2026-11-03T10:00:00Z", { status: "completed" }),
        dbLesson("m1", "2026-11-04T10:00:00Z", { status: "completed", opsMakeupFlag: true }),
        dbLesson("a1", "2026-11-05T10:00:00Z", { studentAbsent: true }),
        dbLesson("e1", "2026-11-06T10:00:00Z", { studentExcused: true }),
        dbLesson("x1", "2026-11-07T10:00:00Z", { status: "cancelled", studentAttended: true }),
        dbLesson("p1", "2026-11-08T10:00:00Z"),
      ],
    };
    const res = computeTeacherEarningsForPeriod(data, "t1", START, END);
    expect(res.lines.map((l) => l.lessonId)).toEqual(["c1"]);
  });
});
