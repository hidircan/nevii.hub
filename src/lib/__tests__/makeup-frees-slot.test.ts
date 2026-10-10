/**
 * 2026-10-03 (owner) — Telafi'ye alınan (asıl saatinde yapılmayacak) ders saatini boşaltır:
 * ders programda kalır, kaydı ve telafi hakkı silinmez, o saate başka ders planlanabilir.
 * Ders saate geri dönecekse (geri alma, başka statü, başlatma) ve saat dolduysa engellenir.
 */
import { describe, it, expect } from "vitest";
import { createSeedData } from "../seed";
import { clearLessonOpsFlag, isLessonProcessedForPayout, switchLessonOpsFlag } from "../lesson-ops";
import { lessonOccupiesSlot } from "../lesson-occupancy";
import { validateLessonSlot } from "../makeup-engine";
import { applyStartLesson } from "../lesson-live-status";
import { buildTeacherDayAvailability } from "../teacher-day-availability";
import { toZonedYmd, DEFAULT_APP_TIMEZONE } from "../timezone";
import type { AppData, Lesson } from "../types";

function fixture() {
  const base = createSeedData();
  const tpl = base.lessons.find((l) => l.type !== "makeup" && l.status === "scheduled")!;
  const other = base.students.find((s) => s.id !== tpl.studentId)!;
  // 8 hafta sonrası aynı saat — tohum derslerinden uzak; öğretmen/oda/öğrenci başka derste değil.
  const start = new Date(Date.now() + 56 * 86_400_000);
  start.setUTCHours(11, 0, 0, 0);
  const lesson: Lesson = {
    ...tpl,
    id: "les_slot_a",
    type: "regular",
    status: "scheduled",
    seriesId: undefined,
    makeupRequestId: undefined,
    startAt: start.toISOString(),
    endAt: new Date(start.getTime() + 45 * 60_000).toISOString(),
    studentAttended: false,
    lessonProcessed: false,
    opsMakeupFlag: false,
    studentAbsent: false,
    studentExcused: false,
  };
  const data: AppData = {
    ...base,
    lessons: [...base.lessons.filter((l) => l.teacherId !== tpl.teacherId && l.roomId !== tpl.roomId && l.studentId !== tpl.studentId), lesson],
    makeupRequests: [],
    closedDayOverrides: [],
    settings: { ...base.settings, termWeeklyClosedDays: undefined },
  };
  return { data, lesson, otherStudentId: other.id };
}

/** Aynı öğretmen + oda + saatte başka öğrenciye ders planlanabilir mi? */
function canPlanSameSlot(data: AppData, lesson: Lesson, studentId: string) {
  return validateLessonSlot(
    data,
    { instrument: lesson.instrument, studentId },
    { teacherId: lesson.teacherId, roomId: lesson.roomId, startAt: lesson.startAt },
    { durationMinutes: 45, allowAvailabilityOverride: true }
  );
}

function markMakeup(data: AppData, lessonId: string): AppData {
  const r = switchLessonOpsFlag(data, lessonId, "makeup", "u1", new Date(), "öğrenci hasta");
  if (!r.ok) throw new Error(r.message);
  return r.data;
}

/** Boşalan saate yeni ders (B) yazılmış veri. */
function withNewLessonInSlot(data: AppData, lesson: Lesson, studentId: string): AppData {
  const b: Lesson = { ...lesson, id: "les_slot_b", studentId, opsMakeupFlag: false, opsMakeupFlagAt: undefined, opsMakeupFlagBy: undefined };
  return { ...data, lessons: [...data.lessons, b] };
}

describe("saati dolduran statüler — merkezi kural", () => {
  const base = { status: "scheduled", opsMakeupFlag: false, lessonProcessed: false, studentAttended: false } as const;
  it.each([
    ["planlandı", base, true],
    ["başladı", { ...base, status: "in_progress" }, true],
    ["tamamlandı", { ...base, status: "completed" }, true],
    ["işlendi", { ...base, lessonProcessed: true }, true],
    ["geldi", { ...base, studentAttended: true }, true],
    ["gelmedi (no_show)", { ...base, status: "no_show" }, true],
    ["telafi, yapılmamış", { ...base, opsMakeupFlag: true }, false],
    ["telafi + işlendi (eski çift bayrak)", { ...base, opsMakeupFlag: true, lessonProcessed: true }, true],
    ["telafi + tamamlandı", { ...base, opsMakeupFlag: true, status: "completed" }, true],
    ["iptal", { ...base, status: "cancelled" }, false],
  ] as const)("%s → saati doldurur: %s", (_label, lesson, expected) => {
    expect(lessonOccupiesSlot(lesson)).toBe(expected);
  });
});

describe("Telafi'ye alınan ders saati boşaltır", () => {
  it("telafi öncesi aynı saat dolu; telafi sonrası başka öğrenciye planlanabilir, ders ve telafi hakkı kalır", () => {
    const { data, lesson, otherStudentId } = fixture();
    const before = canPlanSameSlot(data, lesson, otherStudentId);
    expect(before.ok).toBe(false);
    if (!before.ok) expect(before.code).toBe("TEACHER_CONFLICT");

    const d = markMakeup(data, lesson.id);
    expect(canPlanSameSlot(d, lesson, otherStudentId).ok).toBe(true);
    // Ders programda kalır (silinmez), Telafi bayrağı ve telafi talebi (hak) durur.
    const kept = d.lessons.find((l) => l.id === lesson.id)!;
    expect(kept.opsMakeupFlag).toBe(true);
    expect(kept.status).toBe("scheduled");
    expect(d.makeupRequests.filter((m) => m.sourceLessonId === lesson.id && m.status !== "cancelled")).toHaveLength(1);
    // Hakediş: Telafi dersi verilmiş ders sayılmaz (değişmedi).
    expect(isLessonProcessedForPayout(kept)).toBe(false);
  });

  it("yapılmış ders (telafi + işlendi) saati boşaltmaz", () => {
    const { data, lesson, otherStudentId } = fixture();
    const d: AppData = { ...data, lessons: data.lessons.map((l) => (l.id === lesson.id ? { ...l, opsMakeupFlag: true, lessonProcessed: true } : l)) };
    expect(canPlanSameSlot(d, lesson, otherStudentId).ok).toBe(false);
  });

  it("öğretmen günlük müsaitlik kartı boşalan saati boş gösterir", () => {
    const { data, lesson } = fixture();
    const ymd = toZonedYmd(new Date(lesson.startAt), DEFAULT_APP_TIMEZONE);
    const busy = (d: AppData) =>
      buildTeacherDayAvailability(d, [], { date: ymd, branchId: lesson.branchId }).find((t) => t.teacherId === lesson.teacherId)?.busy ?? [];
    expect(busy(data)).toHaveLength(1);
    expect(busy(markMakeup(data, lesson.id))).toHaveLength(0);
  });

  it("planlanan telafi dersi kendi yeni saatinde normal çakışma kontrolüne tabidir", () => {
    const { data, lesson, otherStudentId } = fixture();
    const mk: Lesson = { ...lesson, id: "les_makeup_new", type: "makeup", opsMakeupFlag: false };
    const d: AppData = { ...data, lessons: [...data.lessons.filter((l) => l.id !== lesson.id), mk] };
    const r = canPlanSameSlot(d, mk, otherStudentId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("TEACHER_CONFLICT");
  });
});

describe("saat başka derse verildikten sonra Telafi dersini saate geri oturtma", () => {
  function taken() {
    const { data, lesson, otherStudentId } = fixture();
    return { d: withNewLessonInSlot(markMakeup(data, lesson.id), lesson, otherStudentId), lesson };
  }

  it("Telafi geri alma engellenir; neden + çakışan ders + çözüm Türkçe yazılır", () => {
    const { d, lesson } = taken();
    const r = clearLessonOpsFlag(d, lesson.id, "makeup", "u1");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("SLOT_TAKEN");
    expect(r.message).toContain("Telafi'ye alındıktan sonra başka bir derse verilmiş");
    expect(r.message).toContain("Ders Programı");
    // Hiçbir şey yazılmadı: ders hâlâ Telafi.
    expect(d.lessons.find((l) => l.id === lesson.id)!.opsMakeupFlag).toBe(true);
  });

  it("Telafi → Geldi geçişi ve dersi başlatma engellenir", () => {
    const { d, lesson } = taken();
    const sw = switchLessonOpsFlag(d, lesson.id, "attended", "u1", new Date());
    expect(sw.ok).toBe(false);
    const st = applyStartLesson(d, lesson.id);
    expect(st.ok).toBe(false);
    if (!st.ok) expect(st.message).toContain("Ders başlatılamadı");
  });

  it("yeni ders iptal edilince Telafi geri alınabilir", () => {
    const { d, lesson } = taken();
    const freed: AppData = { ...d, lessons: d.lessons.map((l) => (l.id === "les_slot_b" ? { ...l, status: "cancelled" } : l)) };
    const r = clearLessonOpsFlag(freed, lesson.id, "makeup", "u1");
    expect(r.ok, r.ok ? "" : r.message).toBe(true);
  });

  it("saat boşken Telafi geri alma eskisi gibi çalışır", () => {
    const { data, lesson } = fixture();
    const r = clearLessonOpsFlag(markMakeup(data, lesson.id), lesson.id, "makeup", "u1");
    expect(r.ok, r.ok ? "" : r.message).toBe(true);
  });
});
