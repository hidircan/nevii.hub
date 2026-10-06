/**
 * 2026-10-06 — "Planlanan telafiye geldi": planlanan telafi dersine "Geldi" işaretlenince statü normal `attended`
 * (aynı yeşil, aynı toplamlar) ama ayrım KALICI kaynaktan (ders tipi + telafi talebi bağı) hesaplanır; yeniden
 * okumada, geri almada ve hakedişte tutarlıdır. Kaçırılan asıl ders hakedişe girmez, telafi bir kez sayılır.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { readData } from "../store";
import { writeData } from "../store-json";
import { clearLessonOpsFlagTool, setLessonOpsFlagTool, teacherEarningsStatementTool } from "../services/tools";
import { computeTeacherEarningsForPeriod } from "../teacher-payout";
import { isAttendedPlannedMakeup, resolveLessonFinalStatus } from "../lesson-live-status";
import { buildAttendanceReport } from "../attendance-report";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import type { Lesson, MakeupRequest } from "../types";

const DIR = resolveDataDir(path.join(process.cwd(), "data"));
const admin: ServiceContext = { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };

beforeEach(async () => {
  await fs.rm(path.join(DIR, "store.json"), { force: true });
});

const at = (iso: string, minutes: number) => ({ startAt: iso, endAt: new Date(Date.parse(iso) + minutes * 60_000).toISOString() });

async function setup() {
  const base = await readData();
  const common = { studentId: "s1", teacherId: "t1", roomId: "r1", branchId: "erzene", instrument: "Piyano" } as const;
  const source: Lesson = { id: "src", ...common, ...at("2026-09-08T10:00:00.000Z", 40), type: "regular", status: "scheduled", opsMakeupFlag: true };
  const makeup: Lesson = { id: "mk", ...common, ...at("2026-09-15T12:00:00.000Z", 40), type: "makeup", status: "scheduled", makeupRequestId: "req1" };
  const ordinary: Lesson = { id: "ord", ...common, ...at("2026-09-22T10:00:00.000Z", 40), type: "regular", status: "scheduled" };
  const request = {
    id: "req1",
    studentId: "s1",
    teacherId: "t1",
    branchId: "erzene",
    instrument: "Piyano",
    sourceLessonId: "src",
    attendanceId: "att1",
    status: "confirmed",
    reason: "Hasta",
    expiresAt: "2026-10-30T00:00:00.000Z",
    suggestedSlots: [],
    confirmedLessonId: "mk",
    createdAt: "2026-09-08T12:00:00.000Z",
    policyNote: "",
  } as MakeupRequest;
  await writeData({
    ...base,
    lessons: [...base.lessons.filter((l) => l.teacherId !== "t1" && l.studentId !== "s1"), source, makeup, ordinary],
    makeupRequests: [...base.makeupRequests.filter((m) => m.studentId !== "s1"), request],
    teacherFeeRules: [{ id: "fee-t1", teacherId: "t1", perMinuteRate: 10, effectiveFrom: "2020-01-01", createdAt: "2020-01-01" }],
    teacherPayouts: [],
  });
}

const lessonOf = async (id: string) => (await readData()).lessons.find((l) => l.id === id)!;

describe("planlanan telafiye geldi", () => {
  it("Geldi → kalıcı ayrım (yeniden okumada), bağlar korunur; sıradan Geldi işaret almaz", async () => {
    await setup();
    expect((await setLessonOpsFlagTool(admin, { lessonId: "mk", flag: "attended" })).ok).toBe(true);
    expect((await setLessonOpsFlagTool(admin, { lessonId: "ord", flag: "attended" })).ok).toBe(true);

    const mk = await lessonOf("mk");
    expect(resolveLessonFinalStatus(mk)).toBe("attended"); // aynı yeşil / aynı toplam
    expect(isAttendedPlannedMakeup(mk)).toBe(true);
    expect(mk.makeupRequestId).toBe("req1");
    const data = await readData();
    const req = data.makeupRequests.find((m) => m.id === "req1")!;
    expect(req.confirmedLessonId).toBe("mk");
    expect(req.sourceLessonId).toBe("src");
    expect(req.status).toBe("confirmed"); // hak ikinci kez tüketilmez / talep değişmez

    const ord = await lessonOf("ord");
    expect(resolveLessonFinalStatus(ord)).toBe("attended");
    expect(isAttendedPlannedMakeup(ord)).toBe(false);

    // Rapor: ikisi de "Geldi"; yalnız telafi T alt kırılımında.
    const report = buildAttendanceReport(data.lessons, [], { from: "2026-09-01", to: "2026-09-30", studentId: "s1" });
    expect(report.summary.attended).toBe(2);
    expect(report.summary.attendedPlannedMakeup).toBe(1);
    expect(report.rows.find((r) => r.lessonId === "mk")?.plannedMakeup).toBe(true);
    expect(report.rows.find((r) => r.lessonId === "ord")?.plannedMakeup).toBe(false);
  });

  it("hakediş: telafi bir kez, kaynak ders hariç; tekrar Geldi çift saymaz; geri alınca düşer", async () => {
    await setup();
    await setLessonOpsFlagTool(admin, { lessonId: "mk", flag: "attended" });
    const again = await setLessonOpsFlagTool(admin, { lessonId: "mk", flag: "attended" });
    expect(again.ok && again.data.alreadySet).toBe(true);
    const e1 = computeTeacherEarningsForPeriod(await readData(), "t1", "2026-09-01", "2026-09-30");
    expect(e1.lines.map((l) => l.lessonId)).toEqual(["mk"]);
    expect(e1.totalAmount).toBe(400);

    const st = await teacherEarningsStatementTool(admin, { teacherId: "t1", year: 2026, month: 9 });
    expect(st.ok && st.data.months[0]!.lines.map((l) => [l.lessonId, l.kind, l.attendedPlannedMakeup])).toEqual([["mk", "makeup", true]]);

    expect((await clearLessonOpsFlagTool(admin, { lessonId: "mk", expected: "attended" })).ok).toBe(true);
    const mk = await lessonOf("mk");
    expect(resolveLessonFinalStatus(mk)).toBe("makeup_planned"); // #e5fb57 planlanan telafi rengine döner
    expect(isAttendedPlannedMakeup(mk)).toBe(false);
    expect(computeTeacherEarningsForPeriod(await readData(), "t1", "2026-09-01", "2026-09-30").lines).toHaveLength(0);
  });
});
