import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { STUDENT_CONTRACTS_FILE } from "../contracts";
import { TRIAL_LESSONS_FILE } from "../trial-lessons";
import { resolveActiveInstrumentNames } from "../instrument-catalog";
import { findSlotConflict } from "../lesson-occupancy";
import { isBillableLesson } from "../period-lesson-billing";
import { computeTeacherEarningsForPeriod } from "../teacher-payout";
import { applyLessonOpsFlag } from "../lesson-ops";
import { assertSchedulableDate } from "../lesson-scheduling";
import { cancelLessonTool } from "../services/tools";
import {
  CLUBS_FILE,
  CLUB_MEMBERSHIPS_FILE,
  addClubMemberTool,
  deleteClubTool,
  endClubMembershipTool,
  groupClubSessions,
  listClubs,
  postponeClubSessionTool,
  saveClubTool,
  scheduleClubSessionsTool,
} from "../clubs";
import { CRIT, withTestCriticalPassword } from "./helpers/critical-delete";
import type { Lesson } from "../types";
import type { ServiceContext } from "../services/context";

vi.mock("../audit/log", () => ({ recordAuditLog: vi.fn().mockResolvedValue({ id: "a", persisted: true }) }));

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const admin: ServiceContext = { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };

beforeEach(async () => {
  for (const f of [DATA_FILE, STUDENT_CONTRACTS_FILE, CLUBS_FILE, CLUB_MEMBERSHIPS_FILE, TRIAL_LESSONS_FILE]) await fs.rm(f, { force: true });
});

/** İleri, planlanabilir bir gün (kurum saatiyle "YYYY-MM-DDT07:05" — sabah erken; seed dersleriyle çakışmasın). */
async function openDayLocal(daysAhead: number) {
  const { readData } = await import("../store");
  const data = await readData();
  for (let d = daysAhead; d < daysAhead + 30; d++) {
    const ymd = new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
    if (assertSchedulableDate(`${ymd}T09:00:00.000Z`, data).ok) return `${ymd}T07:05`;
  }
  throw new Error("açık gün yok");
}

async function setup() {
  const { readData } = await import("../store");
  const data = await readData();
  const catalog = await resolveActiveInstrumentNames(DEFAULT_TENANT_ID);
  const teacher = data.teachers.find((t) => t.active && t.instruments.some((i) => catalog.includes(i)))!;
  const instrument = teacher.instruments.find((i) => catalog.includes(i))!;
  const room = data.rooms.find((r) => r.active !== false && !r.deletedAt && r.branchId === teacher.branchId)!;
  const club = await saveClubTool(admin, { name: "Solfej Kulübü", instrument, branchId: room.branchId, maxMembers: 10, monthlyFee: 1500, durationMinutes: 40, teacherIds: [teacher.id] });
  if (!club.ok) throw new Error(club.error.message);
  const students = data.students.filter((s) => s.active && !s.deletedAt).slice(0, 3);
  for (const s of students.slice(0, 2)) expect((await addClubMemberTool(admin, { clubId: club.data.id, studentId: s.id })).ok).toBe(true);
  return { club: club.data, teacher, room, students };
}

describe("kulüp oturumları — 2. aşama (2026-10-06)", () => {
  it("planla: üye başına satır, aynı oturum satırları çakışmaz; öğretmen/oda o saatte başka derse dolu; üye ekle/çıkar gelecek oturumlara yansır", async () => {
    const { club, teacher, room, students } = await setup();
    const startLocal = await openDayLocal(10);
    const res = await scheduleClubSessionsTool(admin, { clubId: club.id, teacherId: teacher.id, roomId: room.id, startLocal, weeks: 2 });
    if (!res.ok) throw new Error(res.error.message);
    const { readData } = await import("../store");
    let sessions = groupClubSessions((await readData()).lessons, club.id);
    expect(sessions).toHaveLength(2);
    expect(sessions.every((s) => s.rows.length === 2 && s.rows.every((r) => r.type === "group"))).toBe(true);
    const s0 = sessions[0]!;
    // Aynı oturumun satırları birbirini doldurmaz; başka bir ders aynı öğretmenle çakışır.
    expect(findSlotConflict(s0.rows, { ...s0.rows[0]!, id: "new", studentId: "x", clubSessionId: s0.sessionId })).toBeNull();
    expect(findSlotConflict(s0.rows, { teacherId: teacher.id, roomId: "baska", studentId: "x", startAt: s0.startAt, endAt: s0.endAt })?.resource).toBe("teacher");
    // Aynı saate ikinci planlama reddedilir (öğretmen dolu).
    const again = await scheduleClubSessionsTool(admin, { clubId: club.id, teacherId: teacher.id, roomId: room.id, startLocal, weeks: 1 });
    expect(!again.ok && again.error.message).toContain("başka dersi var");
    // Yeni üye gelecek oturumlara eklenir; ayrılan üyenin gelecek satırları iptal olur.
    const joined = await addClubMemberTool(admin, { clubId: club.id, studentId: students[2]!.id });
    expect(joined.ok).toBe(true);
    sessions = groupClubSessions((await readData()).lessons, club.id);
    expect(sessions.every((s) => s.rows.length === 3)).toBe(true);
    if (joined.ok) expect((await endClubMembershipTool(admin, { membershipId: joined.data.membership.id })).ok).toBe(true);
    sessions = groupClubSessions((await readData()).lessons, club.id);
    expect(sessions.every((s) => s.rows.length === 2)).toBe(true);
    // Tek ders aracı kulüp satırına uygulanmaz.
    const single = await cancelLessonTool(admin, { lessonId: s0.rows[0]!.id });
    expect(!single.ok && single.error.message).toContain("kulüp oturumu");
  });

  it("ertele: eski satırlar Telafi (telafi talebi yok), yeni tarihte aynı üyelerle oturum; kulüp silinince ödenmemiş ücretler iptal, oturumlar iptal", async () => {
    await withTestCriticalPassword();
    const { club, teacher, room } = await setup();
    const res = await scheduleClubSessionsTool(admin, { clubId: club.id, teacherId: teacher.id, roomId: room.id, startLocal: await openDayLocal(10), weeks: 1 });
    if (!res.ok) throw new Error(res.error.message);
    const pp = await postponeClubSessionTool(admin, { sessionId: res.data.sessionIds[0], startLocal: await openDayLocal(13), reason: "öğretmen hastalandı" });
    if (!pp.ok) throw new Error(pp.error.message);
    const { readData } = await import("../store");
    let data = await readData();
    const sessions = groupClubSessions(data.lessons, club.id);
    expect(sessions.find((s) => s.sessionId === res.data.sessionIds[0])?.postponed).toBe(true);
    expect(sessions.find((s) => s.sessionId === pp.data.newSessionId)?.rows).toHaveLength(2);
    expect(data.makeupRequests.filter((m) => sessions.some((s) => s.rows.some((r) => r.id === m.sourceLessonId)))).toHaveLength(0);

    const del = await deleteClubTool(admin, { clubId: club.id, ...CRIT });
    if (!del.ok) throw new Error(del.error.message);
    data = await readData();
    expect(await listClubs(DEFAULT_TENANT_ID)).toHaveLength(0);
    expect(data.payments.filter((p) => p.source === "club").every((p) => p.status === "voided")).toBe(true);
    expect(groupClubSessions(data.lessons, club.id).every((s) => s.cancelled || s.postponed)).toBe(true);
  });

  it("hakediş: oturum başına TEK ders (öğretmen 'geldi'), öğrenci statüsünden bağımsız; sözleşme sayımına girmez; öğrenci Telafi'si talep açmaz", async () => {
    const { readData } = await import("../store");
    const data = await readData();
    const t = data.teachers.find((x) => x.active)!;
    const students = data.students.slice(0, 3);
    const base = { teacherId: t.id, roomId: data.rooms[0]!.id, branchId: t.branchId, instrument: t.instruments[0]!, type: "group" as const, status: "scheduled" as const, clubId: "c1" };
    const mk = (id: string, sid: string, sess: string, start: string, extra: Partial<Lesson> = {}): Lesson => ({
      ...base, id, studentId: sid, clubSessionId: sess, startAt: start, endAt: new Date(Date.parse(start) + 40 * 60_000).toISOString(), ...extra,
    });
    const lessons: Lesson[] = [
      mk("a1", students[0]!.id, "s1", "2026-09-10T10:00:00.000Z", { teacherAttendanceStatus: "geldi", studentAbsent: true }),
      mk("a2", students[1]!.id, "s1", "2026-09-10T10:00:00.000Z", { teacherAttendanceStatus: "geldi", studentAttended: true }),
      mk("a3", students[2]!.id, "s1", "2026-09-10T10:00:00.000Z", { teacherAttendanceStatus: "geldi" }),
      mk("b1", students[0]!.id, "s2", "2026-09-17T10:00:00.000Z", { teacherAttendanceStatus: "gelmedi", studentAttended: true }),
    ];
    const earnings = computeTeacherEarningsForPeriod(
      { ...data, lessons, teacherPayoutPolicies: [{ id: "p", teacherId: t.id, month: "2026-09", policy: "fixed_duration", rates: { 30: 300, 40: 400, 50: 500 } } as never] },
      t.id,
      "2026-09-01",
      "2026-09-30"
    );
    expect(earnings.lines.filter((l) => l.lessonId.startsWith("a") || l.lessonId.startsWith("b")).map((l) => [l.lessonId, l.durationMinutes])).toEqual([["a1", 40]]);
    expect(isBillableLesson(lessons[1]!, { excludedSourceLessonIds: new Set(), frozenRanges: [] })).toBe(false);
    const flagged = applyLessonOpsFlag({ ...data, lessons }, "a3", "makeup", "u1", new Date("2026-09-10T12:00:00.000Z"), "oturuma gelemedi");
    expect(flagged.ok).toBe(true);
    if (flagged.ok) expect(flagged.data.makeupRequests.some((m) => m.sourceLessonId === "a3")).toBe(false);
  });
});
