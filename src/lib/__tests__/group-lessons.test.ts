/**
 * 2026-10-23 — Grup dersi: plan, çakışma muafiyeti, hakediş (oturum başına bir kez, normal kural), kontenjan,
 * öğrenci çakışması, katılım = branş kaydı (ücret/tahakkuk), kayıt sonu, sözleşmeden program (seri YOK).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { STUDENT_CONTRACTS_FILE } from "../contracts";
import { TRIAL_LESSONS_FILE } from "../trial-lessons";
import { resolveActiveInstrumentNames } from "../instrument-catalog";
import { findSlotConflict } from "../lesson-occupancy";
import { computeTeacherEarningsForPeriod } from "../teacher-payout";
import { assertSchedulableDate } from "../lesson-scheduling";
import { addDaysYmd, toZonedYmd, DEFAULT_APP_TIMEZONE } from "../timezone";
import {
  GROUP_LESSONS_FILE,
  createGroupLessonTool,
  getGroupLesson,
  groupSessionKey,
  planGroupSessions,
  readGroupLessonData,
  updateGroupLessonTool,
  type GroupLesson,
} from "../group-lessons";
import { createStudentContractTool, planContractLessonScheduleTool, upsertStudentEnrollmentTool } from "../services/tools";
import type { AppData, Lesson } from "../types";
import type { ServiceContext } from "../services/context";

vi.mock("../audit/log", () => ({ recordAuditLog: vi.fn().mockResolvedValue({ id: "a", persisted: true }) }));

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const admin: ServiceContext = { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };

beforeEach(async () => {
  for (const f of [DATA_FILE, STUDENT_CONTRACTS_FILE, TRIAL_LESSONS_FILE, GROUP_LESSONS_FILE]) await fs.rm(f, { force: true });
});

const base: Omit<GroupLesson, "recurrence" | "startsOn" | "endsOn" | "weekday"> = {
  id: "grp1",
  name: "G",
  teacherId: "t1",
  instrument: "Gitar",
  branchId: "b1",
  roomId: "r1",
  capacity: 3,
  durationMinutes: 40,
  monthlyFee: 1000,
  startTime: "07:05",
  sessionOverrides: { extra: [], cancelled: [] },
  status: "active",
  createdByUserId: "u1",
  createdAt: "",
  updatedAt: "",
};

describe("grup dersi — saf kurallar", () => {
  it("haftalık plan: başlangıç gününden itibaren her hafta, iptal edilen oturum çıkar, ek oturum eklenir; tek seferlik = 1 oturum", () => {
    // 2026-11-03 Salı → 2026-11-24 dahil: 4 oturum.
    const weekly = { ...base, recurrence: "weekly" as const, weekday: 2, startsOn: "2026-11-03", endsOn: "2026-11-24" };
    const plan = planGroupSessions(weekly);
    expect(plan).toHaveLength(4);
    expect(plan[0]!.key).toBe(groupSessionKey("grp1", plan[0]!.startAt));
    const cancelled = planGroupSessions({ ...weekly, sessionOverrides: { extra: ["2026-11-27T10:00:00.000Z"], cancelled: [plan[1]!.key] } });
    expect(cancelled.map((s) => s.key)).not.toContain(plan[1]!.key);
    expect(cancelled.some((s) => s.extra)).toBe(true);
    expect(planGroupSessions({ ...base, recurrence: "once", weekday: 2, startsOn: "2026-11-03", endsOn: "2026-11-03" })).toHaveLength(1);
  });

  it("çakışma: aynı oturumun satırları öğretmen/odayı paylaşır, başka ders ve aynı öğrencinin başka dersi çakışır", () => {
    const row = (id: string, studentId: string, sess?: string): Lesson => ({
      id, studentId, teacherId: "t1", roomId: "r1", branchId: "b1" as Lesson["branchId"], instrument: "Gitar" as Lesson["instrument"],
      startAt: "2026-11-03T04:05:00.000Z", endAt: "2026-11-03T04:45:00.000Z", type: "regular", status: "scheduled", groupSessionId: sess,
    });
    const rows = [row("a", "s1", "K"), row("b", "s2", "K")];
    expect(findSlotConflict(rows, { ...row("c", "s3"), groupSessionId: "K" })).toBeNull();
    expect(findSlotConflict(rows, row("c", "s3"))?.resource).toBe("teacher");
    expect(findSlotConflict(rows, { ...row("c", "s1"), teacherId: "t9", roomId: "r9", groupSessionId: "K2" })?.resource).toBe("student");
  });
});

describe("grup dersi — hakediş normal ders kuralıyla, oturum başına bir kez", () => {
  const mk = (id: string, studentId: string, flags: Partial<Lesson> = {}): Lesson => ({
    id, studentId, teacherId: "t1", roomId: "r1", branchId: "b1" as Lesson["branchId"], instrument: "Gitar" as Lesson["instrument"],
    startAt: "2026-09-08T10:00:00.000Z", endAt: "2026-09-08T10:40:00.000Z", type: "regular", status: "scheduled",
    groupLessonId: "grp1", groupSessionId: "K", ...flags,
  });
  const data = (lessons: Lesson[]) =>
    ({
      lessons,
      students: [{ id: "s1", name: "A" }, { id: "s2", name: "B" }, { id: "s3", name: "C" }],
      teachers: [{ id: "t1" }],
      settings: { branches: [{ id: "b1", name: "Merkez" }], feeRoundingMode: "exact_minutes", lessonDurationMinutes: 40 },
      teacherFeeRules: [{ id: "fr", teacherId: "t1", perMinuteRate: 10, effectiveFrom: "2026-01-01" }],
      teacherPayoutPolicies: [],
      teacherPayoutExclusions: [],
    }) as unknown as AppData;
  const run = (lessons: Lesson[]) => computeTeacherEarningsForPeriod(data(lessons), "t1", "2026-09-01", "2026-09-30");

  it("kimse gelmediyse sayılmaz; biri/hepsi geldiyse TEK ders, temsilci satır sabit (en küçük kimlik)", () => {
    expect(run([mk("les_b", "s1"), mk("les_a", "s2", { studentAbsent: true }), mk("les_c", "s3")]).lines).toHaveLength(0);
    const one = run([mk("les_b", "s1", { studentAttended: true }), mk("les_a", "s2", { studentAbsent: true }), mk("les_c", "s3")]);
    expect(one.lines).toHaveLength(1);
    expect(one.lines[0]!.lessonId).toBe("les_a");
    expect(one.lines[0]!.amount).toBe(400);
    expect(one.lines[0]!.studentName).toContain("Grup dersi");
    const all = run([mk("les_b", "s1", { studentAttended: true }), mk("les_a", "s2", { lessonProcessed: true }), mk("les_c", "s3", { studentAttended: true })]);
    expect(all.lines.map((l) => l.lessonId)).toEqual(["les_a"]);
    // Bireysel ders aynı kuralla ayrı sayılır (grup dalı onu etkilemez).
    const withSolo = run([mk("les_a", "s2", { studentAttended: true }), mk("solo", "s1", { groupLessonId: undefined, groupSessionId: undefined, studentAttended: true, startAt: "2026-09-09T10:00:00.000Z", endAt: "2026-09-09T10:40:00.000Z" })]);
    expect(withSolo.lines).toHaveLength(2);
  });
});

/** İleri, planlanabilir bir gün (kurum saatiyle). */
async function openDay(daysAhead: number) {
  const { readData } = await import("../store");
  const data = await readData();
  for (let d = daysAhead; d < daysAhead + 30; d++) {
    const ymd = toZonedYmd(new Date(Date.now() + d * 86_400_000), DEFAULT_APP_TIMEZONE);
    if (assertSchedulableDate(`${ymd}T09:00:00.000Z`, data).ok) return ymd;
  }
  throw new Error("açık gün yok");
}

async function setup(capacity = 2) {
  const { readData } = await import("../store");
  const data = await readData();
  const catalog = await resolveActiveInstrumentNames(DEFAULT_TENANT_ID);
  const teacher = data.teachers.find((t) => t.active && t.instruments.some((i) => catalog.includes(i)))!;
  const instrument = teacher.instruments.find((i) => catalog.includes(i))!;
  const room = data.rooms.find((r) => r.active !== false && !r.deletedAt && r.branchId === teacher.branchId)!;
  const startsOn = await openDay(9);
  const created = await createGroupLessonTool(admin, {
    teacherId: teacher.id, instrument, roomId: room.id, capacity, durationMinutes: 40, monthlyFee: 1200,
    recurrence: "weekly", startTime: "07:05", startsOn, endsOn: addDaysYmd(startsOn, 14),
  });
  if (!created.ok) throw new Error(created.error.message);
  const students = data.students.filter((s) => s.active && !s.deletedAt).slice(0, 4);
  return { groupId: created.data.groupLessonId, teacher, instrument, room, students, startsOn };
}

const join = (studentId: string, groupLessonId: string, startDate: string) =>
  upsertStudentEnrollmentTool(admin, {
    studentId,
    enrollment: { instrument: "x", teacherId: "x", lessonDurationMinutes: 30, groupLessonId, startDate, studentTypes: [] },
  });

describe("grup dersi — katılım akışı (json store)", () => {
  it("mevcut öğrenci gruba katılır: branş kaydı grup koşullarıyla, ücret grup fiyatı, oturum başına satır; kontenjan doluysa ret, kapasite artınca kabul", async () => {
    const { groupId, teacher, students, startsOn } = await setup(2);
    const [a, b, c] = students;
    const ja = await join(a!.id, groupId, startsOn);
    if (!ja.ok) throw new Error(ja.error.message);
    const enr = ja.data.enrollments.find((e) => e.id === ja.data.enrollmentId)!;
    expect(enr.groupLessonId).toBe(groupId);
    expect(enr.teacherId).toBe(teacher.id); // istemcinin "x" değeri değil — gruptan zorlandı
    expect(enr.monthlyFee).toBe(1200);
    expect((await join(b!.id, groupId, startsOn)).ok).toBe(true);
    let rows = (await readGroupLessonData(groupId)).lessons.filter((l) => l.status !== "cancelled");
    expect(rows).toHaveLength(6); // 3 oturum × 2 öğrenci
    expect(rows.every((r) => r.type === "regular" && r.groupSessionId && r.enrollmentId)).toBe(true);
    expect(new Set(rows.map((r) => r.groupSessionId)).size).toBe(3);

    const full = await join(c!.id, groupId, startsOn);
    expect(!full.ok && full.error.message).toContain("kontenjanı dolu");

    const g = (await getGroupLesson(DEFAULT_TENANT_ID, groupId))!;
    const up = await updateGroupLessonTool(admin, { groupLessonId: groupId, ...g, endsOn: g.endsOn, capacity: 3 });
    expect(up.ok).toBe(true);
    expect((await join(c!.id, groupId, startsOn)).ok).toBe(true);
    rows = (await readGroupLessonData(groupId)).lessons.filter((l) => l.status !== "cancelled");
    expect(rows).toHaveLength(9);

    // Tahakkuk: grup kaydı normal branş kaydı gibi grup fiyatıyla planlanır (sözleşmesiz öğrenci).
    const { syncStandaloneAccruals } = await import("../standalone-monthly-accrual");
    const plan = await syncStandaloneAccruals(DEFAULT_TENANT_ID, { apply: false, studentId: a!.id });
    const mine = plan.planned.filter((p) => p.enrollmentId === enr.id);
    expect(mine.every((p) => p.amount === 1200)).toBe(true);

    // Kayıt sonu: koltuk boşalır, bitişten sonraki grup satırları iptal edilir.
    const end = await upsertStudentEnrollmentTool(admin, {
      studentId: a!.id,
      enrollment: { id: enr.id, instrument: enr.instrument, teacherId: enr.teacherId, lessonDurationMinutes: enr.lessonDurationMinutes, active: false, endDate: startsOn, endReason: "ayrıldı" },
    });
    if (!end.ok) throw new Error(end.error.message);
    // Bitiş günü (ilk oturum) dahil; sonraki iki oturumun satırları iptal.
    rows = (await readGroupLessonData(groupId)).lessons.filter((l) => l.status !== "cancelled" && l.studentId === a!.id);
    expect(rows).toHaveLength(1);
  });

  it("öğrencinin oturum saatinde başka dersi varsa katılım engellenir (kayıt açılmaz)", async () => {
    const { groupId, students, startsOn, instrument } = await setup(3);
    const d = students[3]!;
    const plan = planGroupSessions((await getGroupLesson(DEFAULT_TENANT_ID, groupId))!);
    const { readData } = await import("../store");
    const { writeData } = await import("../store-json");
    const data = await readData();
    const otherRoom = data.rooms.find((r) => r.active !== false && !r.deletedAt)!;
    await writeData({
      ...data,
      lessons: [
        ...data.lessons,
        { id: "busy1", studentId: d.id, teacherId: "other-t", roomId: otherRoom.id, branchId: otherRoom.branchId, instrument: instrument as Lesson["instrument"], startAt: plan[1]!.startAt, endAt: plan[1]!.endAt, type: "regular", status: "scheduled" },
      ],
    });
    const res = await join(d.id, groupId, startsOn);
    expect(!res.ok && res.error.message).toContain("başka bir dersi var");
    const after = (await readData()).students.find((s) => s.id === d.id)!;
    expect((after.enrollments ?? []).some((e) => e.groupLessonId === groupId)).toBe(false);
  });

  it("sözleşmeden ders programı: grup branşında bireysel seri ÜRETİLMEZ", async () => {
    const { groupId, students, startsOn } = await setup(3);
    const s = students[0]!;
    const ja = await join(s.id, groupId, startsOn);
    if (!ja.ok) throw new Error(ja.error.message);
    const { addRegistrationFirstPayment } = await import("../store-json");
    await addRegistrationFirstPayment({ studentId: s.id, enrollmentId: ja.data.enrollmentId, method: "cash", amount: 1200, collectedAt: startsOn, receivedByUserId: "u1" });
    const contract = await createStudentContractTool(admin, {
      studentId: s.id,
      enrollmentId: ja.data.enrollmentId,
      contractType: "initial",
      programmeName: "Grup",
      enrollmentStartDate: `${startsOn}T00:00:00.000Z`,
      enrollmentEndDate: `${addDaysYmd(startsOn, 80)}T00:00:00.000Z`,
      durationMonths: 3,
      monthlyAmount: 1200,
      installmentCount: 3,
      firstDueDate: `${startsOn}T00:00:00.000Z`,
      signatoryFullName: "Veli Test",
      signatoryRelationship: "veli",
    });
    if (!contract.ok) throw new Error(contract.error.message);
    const { readData } = await import("../store");
    const g = (await getGroupLesson(DEFAULT_TENANT_ID, groupId))!;
    const res = await planContractLessonScheduleTool(admin, { contractId: contract.data.contract.id, teacherId: g.teacherId, roomId: g.roomId, dryRun: false });
    if (!res.ok) throw new Error(res.error.message);
    expect(res.data.seriesIds).toHaveLength(0);
    const data = await readData();
    expect(data.lessonSeries.filter((x) => x.studentId === s.id && x.contractId === contract.data.contract.id)).toHaveLength(0);
    expect(data.lessons.filter((l) => l.studentId === s.id && l.groupLessonId === groupId && l.status !== "cancelled")).toHaveLength(3);
  });
});
