/**
 * Telafi planlama süresi, plan silme/uzatma ve Geldi notu.
 * Sınır testleri duvar saatine bağlı değildir: `now` saf fonksiyona ve
 * `commitMakeupPlanningExpiry`'ye verilir. 2099 tarihleri bugünün okuma
 * commit'inin kaydı erken kapatmaması için seçildi.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { readData, commitMakeupPlanningExpiry } from "../store";
import { readData as readStored, writeData } from "../store-json";
import {
  cancelMakeupRightTool,
  confirmMakeupLessonTool,
  deleteMakeupPlanTool,
  extendMakeupDeadlineTool,
  reviseMakeupPlanTool,
  setLessonOpsFlagTool,
} from "../services/tools";
import { closeExpiredUnplannedMakeups } from "../makeup-lifecycle";
import {
  isMakeupPlanningExpiryClosure,
  isPastMakeupPlanningDeadline,
  MAKEUP_PLANNING_EXPIRED_REASON,
  makeupPlanningDeadline,
} from "../makeup-deadline";
import { isLessonProcessedForPayout } from "../lesson-ops";
import { lessonOccupiesSlot } from "../lesson-occupancy";
import { isAttendedPlannedMakeup, resolveLessonFinalStatus } from "../lesson-live-status";
import { isMakeupStatusCountingTowardQuota } from "../makeup-quota";
import { isBillableLesson, resolveExcludedMakeupSourceLessonIds } from "../period-lesson-billing";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { runWithTenantAsync } from "../tenant-context";
import type { ServiceContext } from "../services/context";
import type { AppData, Lesson, MakeupRequest } from "../types";

const DIR = resolveDataDir(path.join(process.cwd(), "data"));
const ctx: ServiceContext = { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };

beforeEach(async () => {
  await fs.rm(path.join(DIR, "store.json"), { force: true });
  await fs.rm(path.join(DIR, "closed-days.json"), { force: true });
});

const ALL_DAY = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, start: "08:00", end: "22:00" }));
const EXPIRES = "2099-06-15T09:00:00.000Z";

function request(partial: Partial<MakeupRequest> & Pick<MakeupRequest, "id" | "status" | "expiresAt">, lesson: Lesson): MakeupRequest {
  return {
    studentId: lesson.studentId,
    teacherId: lesson.teacherId,
    branchId: lesson.branchId,
    instrument: lesson.instrument,
    sourceLessonId: lesson.id,
    attendanceId: "att_src_life",
    reason: "Öğrenci hasta",
    suggestedSlots: [],
    createdAt: "2099-06-01T09:00:00.000Z",
    policyNote: "",
    ...partial,
  };
}

async function seed(partial: Partial<MakeupRequest> & Pick<MakeupRequest, "id" | "status" | "expiresAt">, lessonPatch: Partial<Lesson> = {}) {
  const base = await readStored();
  const teacher = base.teachers.find((t) => t.active && t.instruments.includes("Piyano"))!;
  const room = base.rooms.find((r) => r.instruments.includes("Piyano") && r.branchId === teacher.branchId && r.active !== false && !r.deletedAt)!;
  const student = base.students.find((s) => s.active !== false)!;
  const source: Lesson = {
    id: "l_src_life",
    studentId: student.id,
    teacherId: teacher.id,
    roomId: room.id,
    branchId: teacher.branchId,
    instrument: "Piyano",
    startAt: "2099-06-01T08:00:00.000Z",
    endAt: "2099-06-01T08:40:00.000Z",
    type: "regular",
    status: "no_show",
    studentAbsent: true,
    opsMakeupFlag: true,
    ...lessonPatch,
  };
  const req = request(partial, source);
  const data: AppData = {
    ...base,
    teachers: base.teachers.map((t) => (t.id === teacher.id ? { ...t, availability: ALL_DAY, maxDailyLessons: 20 } : t)),
    lessons: [...base.lessons.filter((l) => l.id !== source.id), source],
    makeupRequests: [...base.makeupRequests.filter((m) => m.id !== req.id), req],
    attendances: [
      ...base.attendances.filter((a) => a.id !== "att_src_life"),
      { id: "att_src_life", lessonId: source.id, studentId: student.id, status: "absent", markedAt: "2099-06-01T08:40:00.000Z", createsMakeupCredit: true },
    ],
  };
  await writeData(data);
  const slot = (startAt: string, roomId = room.id) => ({
    startAt,
    endAt: new Date(new Date(startAt).getTime() + base.settings.lessonDurationMinutes * 60_000).toISOString(),
    teacherId: teacher.id,
    roomId,
    branchId: teacher.branchId,
    score: 0,
    reasons: ["Manuel planlama"],
  });
  return { req, teacher, room, student, source, slot };
}

describe("telafi planlama süresi — sınır", () => {
  const deadline = makeupPlanningDeadline(EXPIRES);

  it("son yerel günden önce açık, tam sınırda ve sonra kapalı", async () => {
    const { source } = await seed({ id: "mk_bound", status: "pending", expiresAt: EXPIRES });
    const stored = await readStored();
    const isolated = { ...stored, makeupRequests: stored.makeupRequests.filter((m) => m.id === "mk_bound") };
    const before = closeExpiredUnplannedMakeups(isolated, new Date(deadline.getTime() - 1));
    expect(before.changed).toBe(false);
    expect(isPastMakeupPlanningDeadline(EXPIRES, new Date(deadline.getTime() - 1))).toBe(false);

    await commitMakeupPlanningExpiry(new Date(deadline.getTime() - 1));
    expect((await readStored()).makeupRequests.find((m) => m.id === "mk_bound")!.status).toBe("pending");

    const at = closeExpiredUnplannedMakeups(stored, deadline);
    expect(at.changed).toBe(true);
    const atReq = at.data.makeupRequests.find((m) => m.id === "mk_bound")!;
    const atSource = at.data.lessons.find((l) => l.id === source.id)!;
    expect(atReq.status).toBe("expired");
    expect(atReq.decisionNote).toBe(MAKEUP_PLANNING_EXPIRED_REASON);
    expect(atSource.lessonProcessedReason).toBe(MAKEUP_PLANNING_EXPIRED_REASON);
    expect(resolveLessonFinalStatus(atSource, deadline)).toBe("processed");

    await commitMakeupPlanningExpiry(new Date(deadline.getTime() + 1));
    const saved = await readStored();
    const savedReq = saved.makeupRequests.find((m) => m.id === "mk_bound")!;
    const savedSource = saved.lessons.find((l) => l.id === source.id)!;
    expect(savedReq.status).toBe("expired");
    expect(savedReq.changeLog?.map((e) => e.action)).toEqual(["planning_expired"]);
    expect(savedSource.studentAttended).not.toBe(true);
    expect(savedSource.status).toBe("no_show");
    expect(savedSource.actualStartAt).toBeUndefined();
    expect(savedSource.actualEndAt).toBeUndefined();
    expect(isAttendedPlannedMakeup(savedSource)).toBe(false);
    expect(saved.lessons.some((l) => l.type === "makeup" && l.makeupRequestId === "mk_bound")).toBe(false);
    expect(saved.attendances.some((a) => a.id === "att_src_life" && a.status === "absent")).toBe(true);
    expect(saved.payments).toHaveLength(stored.payments.length);

    await commitMakeupPlanningExpiry(new Date(deadline.getTime() + 60_000));
    expect((await readStored()).makeupRequests.find((m) => m.id === "mk_bound")!.changeLog).toHaveLength(1);
  });

  it("süre dolumu Geldi üretmez; hakedişe girer, saati doldurmaz, kotadan düşer, ücrete kaynak tekrar girer", async () => {
    const { source } = await seed({ id: "mk_fin", status: "awaiting_info", expiresAt: EXPIRES });
    const open = await readStored();
    expect(resolveExcludedMakeupSourceLessonIds(open.makeupRequests).has(source.id)).toBe(true);
    expect(isMakeupStatusCountingTowardQuota("pending")).toBe(true);

    await commitMakeupPlanningExpiry(new Date(makeupPlanningDeadline(EXPIRES).getTime() + 1));
    const saved = await readStored();
    const lesson = saved.lessons.find((l) => l.id === source.id)!;
    const req = saved.makeupRequests.find((m) => m.id === "mk_fin")!;
    expect(req.status).toBe("expired");
    expect(isMakeupPlanningExpiryClosure(lesson)).toBe(true);
    expect(lesson.studentAttended).not.toBe(true);
    expect(isLessonProcessedForPayout(lesson)).toBe(true);
    expect(lessonOccupiesSlot(lesson)).toBe(false);
    expect(isMakeupStatusCountingTowardQuota(req.status)).toBe(false);
    expect(resolveExcludedMakeupSourceLessonIds(saved.makeupRequests).has(source.id)).toBe(false);
    expect(
      isBillableLesson(
        { id: lesson.id, studentId: lesson.studentId, startAt: lesson.startAt, type: "regular", status: lesson.status },
        { excludedSourceLessonIds: resolveExcludedMakeupSourceLessonIds(saved.makeupRequests), frozenRanges: [] }
      )
    ).toBe(true);
    expect(saved.payments.filter((p) => p.lessonId === lesson.id)).toHaveLength(0);
  });

  it("planlanmış telafi eski süre doldu diye kapanmaz", async () => {
    const { teacher, room, student, source } = await seed({ id: "mk_plan", status: "confirmed", expiresAt: "2020-01-01T09:00:00.000Z", confirmedLessonId: "l_mk_keep" });
    const base = await readStored();
    const planned: Lesson = {
      ...source,
      id: "l_mk_keep",
      type: "makeup",
      status: "scheduled",
      makeupRequestId: "mk_plan",
      studentAbsent: false,
      opsMakeupFlag: false,
      startAt: "2099-07-01T08:00:00.000Z",
      endAt: "2099-07-01T08:40:00.000Z",
    };
    await writeData({ ...base, lessons: [...base.lessons, planned] });
    await commitMakeupPlanningExpiry(new Date("2099-12-31T00:00:00.000Z"));
    const saved = await readStored();
    const req = saved.makeupRequests.find((m) => m.id === "mk_plan")!;
    expect(req.status).toBe("confirmed");
    expect(req.confirmedLessonId).toBe("l_mk_keep");
    expect(saved.lessons.find((l) => l.id === "l_mk_keep")!.status).toBe("scheduled");
    expect(isMakeupPlanningExpiryClosure(saved.lessons.find((l) => l.id === source.id)!)).toBe(false);
    void teacher;
    void room;
    void student;
  });

  it("insan İşlendi gerekçesini ve Geldi yoklamasını süre dolumu ezmez", async () => {
    await seed(
      { id: "mk_human", status: "pending", expiresAt: EXPIRES },
      { lessonProcessed: true, lessonProcessedReason: "Öğretmen raporu işlendi", opsMakeupFlag: false, status: "completed" }
    );
    await commitMakeupPlanningExpiry(makeupPlanningDeadline(EXPIRES));
    const human = (await readStored()).lessons.find((l) => l.id === "l_src_life")!;
    expect(human.lessonProcessedReason).toBe("Öğretmen raporu işlendi");
    expect((await readStored()).makeupRequests.find((m) => m.id === "mk_human")!.status).toBe("expired");

    await fs.rm(path.join(DIR, "store.json"), { force: true });
    await seed(
      { id: "mk_came", status: "suggested", expiresAt: EXPIRES },
      { studentAttended: true, studentAbsent: false, opsMakeupFlag: false, status: "scheduled" }
    );
    await commitMakeupPlanningExpiry(new Date(makeupPlanningDeadline(EXPIRES).getTime() + 5));
    const came = (await readStored()).lessons.find((l) => l.id === "l_src_life")!;
    expect(came.studentAttended).toBe(true);
    expect(came.lessonProcessedReason).not.toBe(MAKEUP_PLANNING_EXPIRED_REASON);
    expect((await readStored()).makeupRequests.find((m) => m.id === "mk_came")!.status).toBe("expired");
  });
});

describe("süresi dolanı uzatma ve planı silme", () => {
  afterEach(() => {
    delete process.env.MAKEUP_EXPIRY_CLOSURE_FROM;
  });

  it("kesme tarihinden ÖNCE dolan talep yalnız görünümde expired olur; kaynak ders ve DB'ye dokunulmaz", async () => {
    // Varsayılan kesme 2026-10-15: 2026-01-01 sınırı legacy sayılır (hakediş geçmişi korunur).
    const { req } = await seed({ id: "mk_legacy", status: "pending", expiresAt: "2026-01-01T09:00:00.000Z" });
    const view = await readData();
    expect(view.makeupRequests.find((m) => m.id === req.id)!.status).toBe("expired");
    expect(view.lessons.find((l) => l.id === "l_src_life")!.lessonProcessed).not.toBe(true);
    await commitMakeupPlanningExpiry(new Date());
    const stored = await readStored();
    expect(stored.makeupRequests.find((m) => m.id === req.id)!.status).toBe("pending");
    expect(stored.makeupRequests.find((m) => m.id === req.id)!.changeLog ?? []).toHaveLength(0);
    const src = stored.lessons.find((l) => l.id === "l_src_life")!;
    expect(src.lessonProcessed).not.toBe(true);
    expect(src.lessonProcessedReason).toBeUndefined();
  });

  it("süre uzanınca hak yeniden planlanır; onaysız uzatma reddedilir", async () => {
    process.env.MAKEUP_EXPIRY_CLOSURE_FROM = "2020-01-01T00:00:00+03:00";
    const { req, slot } = await seed({ id: "mk_ext", status: "pending", expiresAt: "2026-01-01T09:00:00.000Z" });
    await readData();
    const closed = await readStored();
    expect(closed.makeupRequests.find((m) => m.id === req.id)!.status).toBe("expired");
    expect(isMakeupPlanningExpiryClosure(closed.lessons.find((l) => l.id === "l_src_life")!)).toBe(true);

    const denied = await extendMakeupDeadlineTool(ctx, { requestId: req.id, lastDayYmd: "2099-12-31" });
    expect(denied.ok).toBe(false);

    const extended = await extendMakeupDeadlineTool(ctx, {
      requestId: req.id,
      lastDayYmd: "2099-12-31",
      acknowledgeCorrection: true,
      correctionNote: "Veli yeni tarih istedi",
    });
    expect(extended.ok ? "ok" : extended.error.message).toBe("ok");
    const opened = await readStored();
    const openedReq = opened.makeupRequests.find((m) => m.id === req.id)!;
    expect(openedReq.status).toBe("pending");
    expect(openedReq.changeLog?.some((e) => e.action === "deadline_extended" && e.by === "u1" && e.note === "Veli yeni tarih istedi")).toBe(true);
    const reopened = opened.lessons.find((l) => l.id === "l_src_life")!;
    expect(reopened.lessonProcessed).toBe(false);
    expect(reopened.opsMakeupFlag).toBe(true);
    expect(isLessonProcessedForPayout(reopened)).toBe(false);

    const planned = await confirmMakeupLessonTool(ctx, { requestId: req.id, slot: slot("2099-08-11T10:00:00.000Z"), decisionNote: "" });
    expect(planned.ok ? "ok" : planned.error.message).toBe("ok");
    expect((await readStored()).makeupRequests.find((m) => m.id === req.id)!.status).toBe("confirmed");
  });

  it("plan silinince saat boşalır, kaynak ders ve hak durur; hak iptali ayrı kapanır", async () => {
    const { req, slot, source } = await seed({ id: "mk_del", status: "pending", expiresAt: "2099-12-31T09:00:00.000Z" });
    const planned = await confirmMakeupLessonTool(ctx, { requestId: req.id, slot: slot("2099-08-11T10:00:00.000Z") });
    expect(planned.ok ? "ok" : planned.error.message).toBe("ok");
    const withPlan = await readStored();
    const plan = withPlan.lessons.find((l) => l.makeupRequestId === req.id && l.status !== "cancelled")!;
    expect(lessonOccupiesSlot(plan)).toBe(true);

    const removed = await deleteMakeupPlanTool(ctx, { requestId: req.id });
    expect(removed.ok ? "ok" : removed.error.message).toBe("ok");
    const after = await readStored();
    const cancelled = after.lessons.find((l) => l.id === plan.id)!;
    expect(cancelled.status).toBe("cancelled");
    expect(lessonOccupiesSlot(cancelled)).toBe(false);
    expect(after.lessons.some((l) => l.id === source.id && l.status !== "cancelled")).toBe(true);
    const kept = after.makeupRequests.find((m) => m.id === req.id)!;
    expect(kept.status).toBe("pending");
    expect(kept.confirmedLessonId).toBeUndefined();
    expect(kept.changeLog?.some((e) => e.action === "plan_deleted" && e.by === "u1")).toBe(true);

    const again = await confirmMakeupLessonTool(ctx, { requestId: req.id, slot: slot("2099-08-12T10:00:00.000Z") });
    expect(again.ok ? "ok" : again.error.message).toBe("ok");
    const second = (await readStored()).lessons.find((l) => l.type === "makeup" && l.makeupRequestId === req.id && l.status !== "cancelled")!;
    const revised = await reviseMakeupPlanTool(ctx, {
      requestId: req.id,
      teacherId: second.teacherId,
      roomId: second.roomId,
      startAt: "2099-08-13T11:00:00.000Z",
    });
    expect(revised.ok ? "ok" : revised.error.message).toBe("ok");
    const moved = (await readStored()).lessons.find((l) => l.id === second.id)!;
    expect(moved.startAt).toBe("2099-08-13T11:00:00.000Z");
    expect(moved.status).not.toBe("cancelled");
    expect((await readStored()).makeupRequests.find((m) => m.id === req.id)!.changeLog?.some((e) => e.action === "plan_revised")).toBe(true);

    const cancel = await cancelMakeupRightTool(ctx, { requestId: req.id, decisionNote: "Veli hakkından vazgeçti", alsoCancelPlan: true });
    expect(cancel.ok ? "ok" : cancel.error.message).toBe("ok");
    const ended = await readStored();
    expect(ended.makeupRequests.find((m) => m.id === req.id)!.status).toBe("cancelled");
    expect(ended.lessons.find((l) => l.id === source.id)!.status).not.toBe("cancelled");
    expect(ended.lessons.find((l) => l.id === second.id)!.status).toBe("cancelled");
    const replay = await confirmMakeupLessonTool(ctx, { requestId: req.id, slot: slot("2099-08-14T10:00:00.000Z") });
    expect(replay.ok).toBe(false);
  });

  it("aynı hak iki kez planlanamaz", async () => {
    const { req, slot } = await seed({ id: "mk_race", status: "pending", expiresAt: "2099-12-31T09:00:00.000Z" });
    const [a, b] = await Promise.all([
      confirmMakeupLessonTool(ctx, { requestId: req.id, slot: slot("2099-08-20T08:00:00.000Z") }),
      confirmMakeupLessonTool(ctx, { requestId: req.id, slot: slot("2099-08-20T12:00:00.000Z") }),
    ]);
    const wins = [a, b].filter((r) => r.ok);
    expect(wins).toHaveLength(1);
    const active = (await readStored()).lessons.filter((l) => l.type === "makeup" && l.makeupRequestId === req.id && l.status !== "cancelled");
    expect(active).toHaveLength(1);
  });

  it("yoklaması olan plan onaysız silinmez; onay iz bırakır ve ders satırını silmez", async () => {
    const { req, slot } = await seed({ id: "mk_cond", status: "pending", expiresAt: "2099-12-31T09:00:00.000Z" });
    const planned = await confirmMakeupLessonTool(ctx, { requestId: req.id, slot: slot("2099-08-21T08:00:00.000Z") });
    expect(planned.ok).toBe(true);
    const plan = (await readStored()).lessons.find((l) => l.makeupRequestId === req.id && l.status !== "cancelled")!;
    const marked = await setLessonOpsFlagTool(ctx, { lessonId: plan.id, flag: "attended", attendanceNote: "Telafiye geldi" });
    expect(marked.ok ? "ok" : marked.error.message).toBe("ok");

    const blocked = await deleteMakeupPlanTool(ctx, { requestId: req.id });
    expect(blocked.ok).toBe(false);
    expect((await readStored()).lessons.find((l) => l.id === plan.id)!.status).toBe("scheduled");

    const removed = await deleteMakeupPlanTool(ctx, {
      requestId: req.id,
      acknowledgeCorrection: true,
      correctionNote: "Yoklama yanlış güne girilmişti",
    });
    expect(removed.ok ? "ok" : removed.error.message).toBe("ok");
    const after = await readStored();
    const lesson = after.lessons.find((l) => l.id === plan.id)!;
    expect(lesson.status).toBe("cancelled");
    expect(lesson.studentAttended).toBe(true);
    expect(lesson.studentAttendanceNote).toBe("Telafiye geldi");
    expect(after.makeupRequests.find((m) => m.id === req.id)!.changeLog?.some((e) => e.action === "plan_deleted" && e.note === "Yoklama yanlış güne girilmişti")).toBe(true);
    expect(after.lessons.find((l) => l.id === "l_src_life")).toBeTruthy();
  });

  it("öğretmen, öğrenci ve başka kurum reddedilir", async () => {
    await seed({ id: "mk_auth", status: "pending", expiresAt: "2099-12-31T09:00:00.000Z" });
    const teacher = await extendMakeupDeadlineTool({ ...ctx, role: "TEACHER", teacherId: "t1" }, { requestId: "mk_auth", lastDayYmd: "2099-12-31" });
    expect(!teacher.ok && teacher.error.code).toBe("FORBIDDEN");
    const student = await deleteMakeupPlanTool({ ...ctx, role: "STUDENT" }, { requestId: "mk_auth" });
    expect(!student.ok && student.error.code).toBe("FORBIDDEN");

    await runWithTenantAsync(DEFAULT_TENANT_ID, async () => {
      const other = await cancelMakeupRightTool(
        { ...ctx, tenantId: "tenant_other_kurum" },
        { requestId: "mk_auth", decisionNote: "Başka kurum" }
      );
      expect(other.ok).toBe(false);
      if (!other.ok) expect(other.error.code).toBe("NOT_FOUND");
    });
    expect((await readStored()).makeupRequests.find((m) => m.id === "mk_auth")!.status).toBe("pending");
  });
});

describe("Geldi yoklama notu", () => {
  async function lessonId() {
    const { createLessonTool } = await import("../services/tools");
    const { findOpenLessonSlot } = await import("./helpers/lesson-slot");
    const data = await readData();
    const startAt = await findOpenLessonSlot(data, "s1", "t1", "r1");
    const res = await createLessonTool(ctx, { studentId: "s1", teacherId: "t1", roomId: "r1", instrument: "Piyano", startAt });
    if (!res.ok) throw new Error(res.error.message);
    return res.data.lessonId;
  }

  it("boş not, dolu not, düzenleme, temizleme ve statü değişince notun durması", async () => {
    const id = await lessonId();
    const beforePay = (await readStored()).payments.length;
    const empty = await setLessonOpsFlagTool(ctx, { lessonId: id, flag: "attended", attendanceNote: "" });
    expect(empty.ok ? "ok" : empty.error.message).toBe("ok");
    let lesson = (await readStored()).lessons.find((l) => l.id === id)!;
    expect(lesson.studentAttended).toBe(true);
    expect(lesson.studentAttendanceNote ?? null).toBeNull();
    expect(isLessonProcessedForPayout(lesson)).toBe(true);

    const filled = await setLessonOpsFlagTool(ctx, { lessonId: id, flag: "attended", attendanceNote: "  Parça çalışıldı  " });
    expect(filled.ok && filled.data.message).toBe("Not kaydedildi.");
    lesson = (await readStored()).lessons.find((l) => l.id === id)!;
    expect(lesson.studentAttendanceNote).toBe("Parça çalışıldı");
    const payoutWithNote = isLessonProcessedForPayout(lesson);

    const edited = await setLessonOpsFlagTool(ctx, { lessonId: id, flag: "attended", attendanceNote: "Tempo düzeldi" });
    expect(edited.ok).toBe(true);
    expect((await readStored()).lessons.find((l) => l.id === id)!.studentAttendanceNote).toBe("Tempo düzeldi");

    const cleared = await setLessonOpsFlagTool(ctx, { lessonId: id, flag: "attended", attendanceNote: null });
    expect(cleared.ok && cleared.data.message).toBe("Not temizlendi.");
    expect((await readStored()).lessons.find((l) => l.id === id)!.studentAttendanceNote ?? null).toBeNull();

    await setLessonOpsFlagTool(ctx, { lessonId: id, flag: "attended", attendanceNote: "Duracak not" });
    const switched = await setLessonOpsFlagTool(ctx, { lessonId: id, flag: "absent", confirmSwitch: true });
    expect(switched.ok ? "ok" : switched.error.message).toBe("ok");
    lesson = (await readStored()).lessons.find((l) => l.id === id)!;
    expect(lesson.studentAbsent).toBe(true);
    expect(lesson.studentAttendanceNote).toBe("Duracak not");
    expect((await readStored()).payments).toHaveLength(beforePay);
    expect(payoutWithNote).toBe(true);
    expect(isLessonProcessedForPayout({ ...lesson, studentAttended: true, studentAbsent: false })).toBe(true);
  });

  it("Gelmedi'den tekrar Geldi'ye dönerken not alanı gönderilmezse mevcut not silinmez", async () => {
    const id = await lessonId();
    await setLessonOpsFlagTool(ctx, { lessonId: id, flag: "attended", attendanceNote: "Web'de yazılan not" });
    await setLessonOpsFlagTool(ctx, { lessonId: id, flag: "absent", confirmSwitch: true });
    const back = await setLessonOpsFlagTool(ctx, { lessonId: id, flag: "attended", confirmSwitch: true });
    expect(back.ok ? "ok" : back.error.message).toBe("ok");
    const lesson = (await readStored()).lessons.find((l) => l.id === id)!;
    expect(lesson.studentAttended).toBe(true);
    expect(lesson.studentAttendanceNote).toBe("Web'de yazılan not");
  });

  it("öğretmen not yazamaz; başka kurumun dersine yazılmaz", async () => {
    const id = await lessonId();
    const teacher = await setLessonOpsFlagTool({ ...ctx, role: "TEACHER", teacherId: "t1" }, { lessonId: id, flag: "attended", attendanceNote: "gizli" });
    expect(!teacher.ok && teacher.error.code).toBe("FORBIDDEN");
    await runWithTenantAsync("tenant_other_kurum", async () => {
      await expect(
        setLessonOpsFlagTool({ ...ctx, tenantId: "tenant_other_kurum" }, { lessonId: id, flag: "attended", attendanceNote: "yabancı" })
      ).rejects.toThrow(/Cross-tenant access denied/);
    });
    expect((await readStored()).lessons.find((l) => l.id === id)!.studentAttended).not.toBe(true);
  });
});
