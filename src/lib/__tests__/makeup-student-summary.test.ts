import { describe, it, expect } from "vitest";
import { buildStudentMakeupSummary, makeupStageOf } from "../makeup-student-summary";
import { foldTurkishForSearch } from "../normalize";
import type { AppData, Lesson, MakeupRequest } from "../types";

const lesson = (id: string, startAt: string, extra: Partial<Lesson> = {}): Lesson => ({
  id,
  studentId: "s1",
  teacherId: "t1",
  roomId: "r1",
  branchId: "b1",
  instrument: "Piyano",
  startAt,
  endAt: new Date(new Date(startAt).getTime() + 30 * 60_000).toISOString(),
  type: "regular",
  status: "scheduled",
  ...extra,
});
const req = (id: string, status: MakeupRequest["status"], extra: Partial<MakeupRequest> = {}): MakeupRequest => ({
  id,
  studentId: "s1",
  teacherId: "t1",
  branchId: "b1",
  instrument: "Piyano",
  sourceLessonId: `src_${id}`,
  attendanceId: `att_${id}`,
  status,
  reason: "Hasta",
  expiresAt: "2026-11-30T00:00:00.000Z",
  suggestedSlots: [],
  createdAt: "2026-10-01T00:00:00.000Z",
  policyNote: "",
  ...extra,
});

describe("öğrenci telafi özeti — hak ile talep/ders aşaması ayrı (2026-10-04)", () => {
  const now = new Date("2026-10-15T12:00:00.000Z");
  const data = {
    settings: { monthlyMakeupAllowance: 2, lessonDurationMinutes: 40 },
    teachers: [{ id: "t1", name: "Turgay" }],
    students: [{ id: "s1", name: "Şule Çelik", termType: "guz" }],
    lessons: [
      lesson("src_a", "2026-10-01T10:00:00.000Z", { opsMakeupFlag: true }),
      lesson("src_b", "2026-10-02T10:00:00.000Z", { opsMakeupFlag: true }),
      lesson("src_c", "2026-10-03T10:00:00.000Z", { opsMakeupFlag: true }),
      lesson("mk_b", "2026-10-20T10:00:00.000Z", { type: "makeup" }),
      lesson("mk_c", "2026-10-10T10:00:00.000Z", { type: "makeup", studentAttended: true }),
    ],
    makeupRequests: [
      req("a", "pending"),
      req("b", "confirmed", { confirmedLessonId: "mk_b" }),
      req("c", "confirmed", { confirmedLessonId: "mk_c" }),
      req("d", "cancelled"),
    ],
  } as unknown as AppData;

  it("aşamalar: bekleyen, planlanmış, tamamlanmış, iptal ayrı sayılır", () => {
    const sum = buildStudentMakeupSummary(data, "s1", now);
    expect(sum.counts).toEqual({ pending: 1, planned: 1, completed: 1, cancelled: 1, expired: 0 });
    expect(sum.rows.find((r) => r.requestId === "b")!.durationMinutes).toBe(30);
    expect(sum.rows.find((r) => r.requestId === "b")!.plannedTeacherName).toBe("Turgay");
  });

  it("dönem hakkı kotadan gelir; planlanmış ders sayısı hak sayılmaz", () => {
    const sum = buildStudentMakeupSummary(data, "s1", now);
    expect(sum.quota.allowance).toBe(2);
    expect(sum.quota.remaining).toBe(0); // pending + 2 confirmed = 3 kullanım (kota üstü veri) → kalan 0, negatif değil
  });

  it("onaylı telafinin dersi iptal edildiyse 'iptal' aşamasındadır", () => {
    const d2 = { ...data, lessons: [...data.lessons.filter((l) => l.id !== "mk_b"), lesson("mk_b", "2026-10-20T10:00:00.000Z", { type: "makeup", status: "cancelled" })] } as AppData;
    expect(makeupStageOf(data.makeupRequests[1]!, d2, now)).toBe("cancelled");
  });

  it("Türkçe arama katlaması: 'sule celik' = 'Şule Çelik'", () => {
    expect(foldTurkishForSearch("Şule Çelik")).toContain(foldTurkishForSearch("sule celik"));
    expect(foldTurkishForSearch("ŞULE")).toBe(foldTurkishForSearch("şule"));
  });
});
