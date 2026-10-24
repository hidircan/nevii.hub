/**
 * 2026-10-24 — Grup dersi geçmiş başlangıç + grup bağlamı (Çınar–Ege vakası): geçmiş oturumlar yalnız açık "tamamla"
 * işlemiyle, o tarihteki katılımcılarla, tek oturum kimliğiyle ve idempotent yazılır; grup kaydına bireysel ders/seri yazılmaz.
 * Saat 24 Ekim 2026'ya sabit (yalnız Date — zamanlayıcılar gerçek).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { STUDENT_CONTRACTS_FILE } from "../contracts";
import { TRIAL_LESSONS_FILE } from "../trial-lessons";
import { resolveActiveInstrumentNames } from "../instrument-catalog";
import { assertSchedulableDate } from "../lesson-scheduling";
import { computeTeacherEarningsForPeriod } from "../teacher-payout";
import { addDaysYmd, toZonedYmd, DEFAULT_APP_TIMEZONE } from "../timezone";
import {
  GROUP_LESSONS_FILE,
  backfillGroupSessionsTool,
  createGroupLessonTool,
  getGroupLesson,
  planGroupSessions,
  readGroupLessonData,
  type GroupLesson,
} from "../group-lessons";
import { createLessonSeriesTool, createLessonTool, previewLessonSeriesTool, upsertStudentEnrollmentTool } from "../services/tools";
import type { Lesson } from "../types";
import type { ServiceContext } from "../services/context";

vi.mock("../audit/log", () => ({ recordAuditLog: vi.fn().mockResolvedValue({ id: "a", persisted: true }) }));
const notify = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../notifications", async (orig) => ({ ...(await orig<typeof import("../notifications")>()), createNotification: notify }));

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const admin: ServiceContext = { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
const NOW = new Date("2026-10-24T09:00:00.000Z");

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  notify.mockClear();
  for (const f of [DATA_FILE, STUDENT_CONTRACTS_FILE, TRIAL_LESSONS_FILE, GROUP_LESSONS_FILE]) await fs.rm(f, { force: true });
});
afterEach(() => vi.useRealTimers());

describe("plan — geçmiş başlangıç dahil", () => {
  it("6 Eylül 2026 Pazar başlangıçlı pazar tekrarı 6 Eylül'den başlar (başlangıç günü atlanmaz, önceki güne taşmaz)", () => {
    const g = {
      id: "grp_x", recurrence: "weekly" as const, weekday: 0, startTime: "11:00", startsOn: "2026-09-06", endsOn: "2026-10-25",
      durationMinutes: 50, sessionOverrides: { extra: [], cancelled: [] },
    };
    const plan = planGroupSessions(g);
    expect(plan[0]!.startAt).toBe("2026-09-06T08:00:00.000Z"); // 11:00 İstanbul
    expect(plan.map((s) => toZonedYmd(new Date(s.startAt), DEFAULT_APP_TIMEZONE))).toEqual([
      "2026-09-06", "2026-09-13", "2026-09-20", "2026-09-27", "2026-10-04", "2026-10-11", "2026-10-18", "2026-10-25",
    ]);
    // Başlangıç pazar değilse ilk pazara ilerler (geri gitmez).
    expect(toZonedYmd(new Date(planGroupSessions({ ...g, startsOn: "2026-09-02" })[0]!.startAt), DEFAULT_APP_TIMEZONE)).toBe("2026-09-06");
  });
});

/** Geçmişte haftanın aynı günü ardışık açık olan bir başlangıç (kurum saati). */
async function pastOpenStart() {
  const { readData } = await import("../store");
  const data = await readData();
  for (let back = 49; back < 49 + 14; back++) {
    const ymd = addDaysYmd(toZonedYmd(NOW, DEFAULT_APP_TIMEZONE), -back);
    const days = Array.from({ length: 7 }, (_, w) => addDaysYmd(ymd, w * 7));
    if (days.every((d) => assertSchedulableDate(`${d}T09:00:00.000Z`, data).ok)) return ymd;
  }
  throw new Error("açık geçmiş gün yok");
}

async function setup() {
  const { readData } = await import("../store");
  const data = await readData();
  const catalog = await resolveActiveInstrumentNames(DEFAULT_TENANT_ID);
  const teacher = data.teachers.find((t) => t.active && t.instruments.some((i) => catalog.includes(i)))!;
  const instrument = teacher.instruments.find((i) => catalog.includes(i))!;
  const room = data.rooms.find((r) => r.active !== false && !r.deletedAt && r.branchId === teacher.branchId)!;
  const startsOn = await pastOpenStart();
  // Geçmiş başlangıçlı grup oluşturulabilir (eskiden "gelecekte oturum yok" reddi yoktu bile, satırlar yalnız gelecekteydi).
  const created = await createGroupLessonTool(admin, {
    teacherId: teacher.id, instrument, roomId: room.id, capacity: 2, durationMinutes: 40, monthlyFee: 1200,
    recurrence: "weekly", startTime: "06:05", startsOn, endsOn: addDaysYmd(startsOn, 84),
  });
  if (!created.ok) throw new Error(created.error.message);
  const students = data.students.filter((s) => s.active && !s.deletedAt && !(s.enrollments ?? []).some((e) => e.active)).slice(0, 3);
  const others = students.length >= 3 ? students : data.students.filter((s) => s.active && !s.deletedAt).slice(0, 3);
  return { groupId: created.data.groupLessonId, teacher, instrument, room, students: others, startsOn };
}

const join = (studentId: string, groupLessonId: string, startDate: string) =>
  upsertStudentEnrollmentTool(admin, {
    studentId,
    enrollment: { instrument: "x", teacherId: "x", lessonDurationMinutes: 30, groupLessonId, startDate, studentTypes: [] },
  });

const pastRows = async (groupId: string) =>
  (await readGroupLessonData(groupId)).lessons.filter((l) => l.status !== "cancelled" && Date.parse(l.startAt) <= NOW.getTime());

describe("geçmiş oturumları tamamla (json store)", () => {
  it("o tarihteki katılımcılarla tek oturum kimliği, idempotent, gelecek kopyalanmaz, bildirim/yoklama yok, hakediş oturum başına bir", async () => {
    const { groupId, students, startsOn } = await setup();
    const [a, b] = students;
    const ja = await join(a!.id, groupId, startsOn);
    if (!ja.ok) throw new Error(ja.error.message);
    const lateStart = addDaysYmd(startsOn, 21); // B üç hafta sonra katıldı
    const jb = await join(b!.id, groupId, lateStart);
    if (!jb.ok) throw new Error(jb.error.message);
    // Katılım KENDİLİĞİNDEN geçmişe yazmaz (önizlemesiz geçmiş satır yok).
    expect(await pastRows(groupId)).toHaveLength(0);
    const futureBefore = (await readGroupLessonData(groupId)).lessons.filter((l) => Date.parse(l.startAt) > NOW.getTime()).length;
    expect(futureBefore).toBeGreaterThan(0);
    notify.mockClear();

    const preview = await backfillGroupSessionsTool(admin, { groupLessonId: groupId, dryRun: true });
    if (!preview.ok) throw new Error(preview.error.message);
    const sessions = preview.data.sessions!;
    expect(sessions.length).toBeGreaterThanOrEqual(7);
    expect(sessions.every((s) => s.status === "create")).toBe(true);
    const ymdOf = (iso: string) => toZonedYmd(new Date(iso), DEFAULT_APP_TIMEZONE);
    for (const s of sessions) expect(s.students.includes(b!.name)).toBe(ymdOf(s.startAt) >= lateStart);
    expect(await pastRows(groupId)).toHaveLength(0); // önizleme yazmaz

    const res = await backfillGroupSessionsTool(admin, { groupLessonId: groupId });
    if (!res.ok) throw new Error(res.error.message);
    const rows = await pastRows(groupId);
    expect(rows).toHaveLength(res.data.created);
    expect(rows.filter((r) => r.studentId === a!.id)).toHaveLength(sessions.length);
    expect(rows.filter((r) => r.studentId === b!.id).every((r) => ymdOf(r.startAt) >= lateStart)).toBe(true);
    // Aynı oturumun katılımcıları ortak oturum kimliği; durum "Planlandı", yoklama/işlendi/telafi yok.
    expect(new Set(rows.map((r) => r.groupSessionId)).size).toBe(sessions.length);
    expect(rows.every((r) => r.status === "scheduled" && !r.studentAttended && !r.lessonProcessed && !r.opsMakeupFlag && r.type === "regular")).toBe(true);
    expect(notify).not.toHaveBeenCalled();

    // Tekrar gönderim: hiçbir şey yazmaz; gelecek satırlar aynı.
    const again = await backfillGroupSessionsTool(admin, { groupLessonId: groupId });
    expect(again.ok && again.data.created).toBe(0);
    expect((await pastRows(groupId)).length).toBe(rows.length);
    expect((await readGroupLessonData(groupId)).lessons.filter((l) => Date.parse(l.startAt) > NOW.getTime()).length).toBe(futureBefore);

    // İptal edilmiş geçmiş satır "eksik" sayılıp yeniden açılmaz.
    const { readData } = await import("../store");
    const { writeData } = await import("../store-json");
    const victim = rows.find((r) => r.studentId === a!.id)!;
    const d0 = await readData();
    await writeData({ ...d0, lessons: d0.lessons.map((l) => (l.id === victim.id ? { ...l, status: "cancelled" as const } : l)) });
    const third = await backfillGroupSessionsTool(admin, { groupLessonId: groupId });
    expect(third.ok && third.data.created).toBe(0);

    // Hakediş: iki katılımcı da geldi → oturum TEK ders.
    const shared = rows.filter((r) => r.studentId === b!.id)[0]!;
    const pair = rows.filter((r) => r.groupSessionId === shared.groupSessionId);
    expect(pair).toHaveLength(2);
    const d1 = await readData();
    await writeData({ ...d1, lessons: d1.lessons.map((l) => (pair.some((p) => p.id === l.id) ? { ...l, studentAttended: true } : l)) });
    const g = (await getGroupLesson(DEFAULT_TENANT_ID, groupId))!;
    const day = ymdOf(shared.startAt);
    const earn = computeTeacherEarningsForPeriod(await readData(), g.teacherId, day, day);
    expect(earn.lines.filter((l) => pair.some((p) => p.id === l.lessonId))).toHaveLength(1);
  });

  it("gerçek öğretmen çakışması raporlanır: onaysız hiçbir şey yazılmaz, 'atla' ile yalnız sorunlu oturum atlanır", async () => {
    const { groupId, students, startsOn, teacher, instrument } = await setup();
    expect((await join(students[0]!.id, groupId, startsOn)).ok).toBe(true);
    const g = (await getGroupLesson(DEFAULT_TENANT_ID, groupId)) as GroupLesson;
    const s1 = planGroupSessions(g)[1]!;
    const { readData } = await import("../store");
    const { writeData } = await import("../store-json");
    const data = await readData();
    const other = data.students.find((x) => x.id !== students[0]!.id && x.active)!;
    const otherRoom = data.rooms.find((r) => r.active !== false && !r.deletedAt && r.id !== g.roomId) ?? data.rooms[0]!;
    await writeData({
      ...data,
      lessons: [
        ...data.lessons,
        { id: "solo_past", studentId: other.id, teacherId: teacher.id, roomId: otherRoom.id, branchId: otherRoom.branchId, instrument: instrument as Lesson["instrument"], startAt: s1.startAt, endAt: s1.endAt, type: "regular", status: "scheduled" },
      ],
    });
    const preview = await backfillGroupSessionsTool(admin, { groupLessonId: groupId, dryRun: true });
    if (!preview.ok) throw new Error(preview.error.message);
    const issue = preview.data.sessions!.find((s) => s.key === s1.key)!;
    expect(issue.status).toBe("issue");
    expect(issue.message).toContain("Öğretmenin bu saatte başka dersi var");

    const blocked = await backfillGroupSessionsTool(admin, { groupLessonId: groupId });
    expect(!blocked.ok && blocked.error.message).toContain("hiçbir satır yazılmadı");
    expect(await pastRows(groupId)).toHaveLength(0);

    const skipped = await backfillGroupSessionsTool(admin, { groupLessonId: groupId, skipIssues: true });
    if (!skipped.ok) throw new Error(skipped.error.message);
    const rows = await pastRows(groupId);
    expect(rows.length).toBe(preview.data.sessions!.filter((s) => s.status === "create").length);
    expect(rows.some((r) => r.groupSessionId === s1.key)).toBe(false);
  });
});

describe("grup kaydı bireysel ders/seriye dönüşmez", () => {
  it("yalnız grup kaydı olan öğrencide tekrarlayan seri ve tekil ders reddedilir (açık kayıtla da, kayıtsız da)", async () => {
    const { groupId, startsOn, teacher, instrument, room } = await setup();
    // Bu branşta bireysel kaydı OLMAYAN öğrenci (tek aday grup kaydıdır).
    const { readData: rd } = await import("../store");
    const s = (await rd()).students.find((x) => x.active && !x.deletedAt && !x.instruments.includes(instrument as never) && !(x.enrollments ?? []).some((e) => e.instrument === instrument))!;
    const ja = await join(s.id, groupId, startsOn);
    if (!ja.ok) throw new Error(ja.error.message);
    const g = (await getGroupLesson(DEFAULT_TENANT_ID, groupId))!;
    const series = {
      studentId: s.id, teacherId: teacher.id, roomId: room.id, branchId: room.branchId, instrument,
      weekday: g.weekday, startTime: "13:00", durationMinutes: 40, startsOn, endsOn: addDaysYmd(startsOn, 42),
    };
    for (const input of [series, { ...series, enrollmentId: ja.data.enrollmentId }]) {
      const p = await previewLessonSeriesTool(admin, input);
      expect(!p.ok && p.error.message).toContain("grup dersine bağlı");
      const c = await createLessonSeriesTool(admin, input);
      expect(!c.ok && c.error.message).toContain("grup dersine bağlı");
    }
    const single = await createLessonTool(admin, { studentId: s.id, teacherId: teacher.id, roomId: room.id, instrument, startAt: `${addDaysYmd(startsOn, 70)}T13:00`, durationMinutes: 40, enrollmentId: ja.data.enrollmentId });
    expect(!single.ok && single.error.message).toContain("grup dersine bağlı");
    const { readData } = await import("../store");
    expect((await readData()).lessons.filter((l) => l.enrollmentId === ja.data.enrollmentId && !l.groupLessonId)).toHaveLength(0);
  });

  it("hem bireysel hem grup kaydı olan öğrencide kayıtsız seri BİREYSEL kayda bağlanır (grup kaydı tahmin edilmez)", async () => {
    const { groupId, students, startsOn, teacher, instrument, room } = await setup();
    const s = students[1]!;
    const ja = await join(s.id, groupId, startsOn);
    if (!ja.ok) throw new Error(ja.error.message);
    const solo = await upsertStudentEnrollmentTool(admin, {
      studentId: s.id,
      enrollment: { instrument, teacherId: teacher.id, lessonDurationMinutes: 40, startDate: startsOn, studentTypes: [], monthlyFee: 1000 },
    });
    if (!solo.ok) throw new Error(solo.error.message);
    const g = (await getGroupLesson(DEFAULT_TENANT_ID, groupId))!;
    const res = await createLessonSeriesTool(admin, {
      studentId: s.id, teacherId: teacher.id, roomId: room.id, branchId: room.branchId, instrument,
      weekday: [2, 3, 4].find((d) => d !== g.weekday)!, startTime: "13:00", durationMinutes: 40, startsOn: addDaysYmd(toZonedYmd(NOW, DEFAULT_APP_TIMEZONE), 1), endsOn: addDaysYmd(toZonedYmd(NOW, DEFAULT_APP_TIMEZONE), 30),
      skipConflicts: true,
    });
    if (!res.ok) throw new Error(res.error.message);
    const { readData } = await import("../store");
    const made = (await readData()).lessons.filter((l) => res.data.createdLessonIds.includes(l.id));
    expect(made.length).toBeGreaterThan(0);
    expect(made.every((l) => l.enrollmentId === solo.data.enrollmentId && !l.groupLessonId)).toBe(true);
  });
});
