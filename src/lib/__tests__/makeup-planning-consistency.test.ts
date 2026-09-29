/**
 * 2026-09-30 — Telafi Merkezi: pasif oda reddi, öneri = kayıt kuralı, planlanan telafi statüsü/rengi,
 * zorla açık günün öneriye girmesi.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { addDays } from "date-fns";
import { resolveDataDir } from "../config";
import { readData } from "../store";
import { confirmMakeupSlot, suggestMakeupSlots, validateLessonSlot } from "../makeup-engine";
import { resolveLessonFinalStatus } from "../lesson-live-status";
import { ATTENDANCE_CALENDAR_COLORS, lessonCardFillStyle, resolveDayFillSegments } from "../attendance-calendar";
import { isSuggestableWorkDay } from "../work-days";
import type { AppData, MakeupRequest } from "../types";

const DIR = resolveDataDir(path.join(process.cwd(), "data"));
beforeEach(async () => {
  await fs.rm(path.join(DIR, "store.json"), { force: true });
  await fs.rm(path.join(DIR, "closed-days.json"), { force: true });
});

function request(data: AppData): MakeupRequest {
  const teacher = data.teachers.find((t) => t.active && t.instruments.includes("Piyano"))!;
  const student = data.students.find((s) => s.active !== false)!;
  return {
    id: "mk_test",
    studentId: student.id,
    teacherId: teacher.id,
    branchId: teacher.branchId,
    instrument: "Piyano",
    sourceLessonId: "l_src",
    attendanceId: "att_src",
    status: "pending",
    reason: "Öğrenci hasta",
    expiresAt: addDays(new Date(), 30).toISOString(),
    suggestedSlots: [],
    createdAt: new Date().toISOString(),
    policyNote: "",
  };
}

describe("telafi önerisi ↔ kayıt — aynı kural", () => {
  it("pasif oda hiç önerilmez; her öneri kayıt doğrulamasından geçer; öneriden sonra oda pasife alınırsa kayıt reddedilir", async () => {
    const base = await readData();
    const req = request(base);
    const pianoRoom = base.rooms.find((r) => r.instruments.includes("Piyano") && r.branchId === req.branchId)!;
    // Şubenin ilk piyano odası pasif (testteki "Stüdyo 1 — Piyano" gibi) — eskiden sıralamada ilk olduğu için
    // öneriye/kayda giriyordu. Aynı şubeye aktif bir oda eklenir.
    const passiveId = pianoRoom.id;
    const data: AppData = {
      ...base,
      rooms: [...base.rooms.map((r) => (r.id === passiveId ? { ...r, active: false } : r)), { ...pianoRoom, id: "r_active", name: "Aktif oda" }],
      makeupRequests: [...base.makeupRequests, req],
    };

    const slots = suggestMakeupSlots(data, req, { maxSlots: 10 });
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.some((s) => s.roomId === passiveId)).toBe(false);
    for (const s of slots) expect(validateLessonSlot(data, req, s).ok).toBe(true);
    expect(slots[0].reasons.join(" ")).not.toMatch(/slot/i);

    const direct = validateLessonSlot(data, req, { ...slots[0], roomId: passiveId });
    expect(direct.ok ? "ok" : direct.code).toBe("ROOM_INACTIVE");

    // Öneri gösterildi, sonra oda pasife alındı → kayıt anında red, ders yazılmaz.
    const after: AppData = { ...data, rooms: data.rooms.map((r) => (r.id === slots[0].roomId ? { ...r, active: false } : r)) };
    expect(() => confirmMakeupSlot(after, req.id, slots[0], { decisionNote: "not", decidedBy: "u1" })).toThrow(/oda pasif/);
  });
});

describe("planlanan telafi statüsü", () => {
  const base = { startAt: addDays(new Date(), 3).toISOString(), status: "scheduled" as const, studentAttended: false, lessonProcessed: false, opsMakeupFlag: false };
  it("Telafi Merkezi'nden planlanan ders 'Planlanan telafi' (turuncu); işlenince yoklama statüsü; kaçan ders 'Telafi'", () => {
    expect(resolveLessonFinalStatus({ ...base, type: "makeup" })).toBe("makeup_planned");
    expect(resolveLessonFinalStatus({ ...base, type: "makeup", lessonProcessed: true })).toBe("processed");
    expect(resolveLessonFinalStatus({ ...base, type: "makeup", studentAttended: true })).toBe("attended");
    expect(resolveLessonFinalStatus({ ...base, type: "regular", opsMakeupFlag: true })).toBe("makeup");
    expect(resolveLessonFinalStatus({ ...base, type: "makeup", status: "cancelled" })).toBe("cancelled");
    expect(lessonCardFillStyle("makeup_planned").backgroundColor).toBe(ATTENDANCE_CALENDAR_COLORS.makeup_planned);
    expect(ATTENDANCE_CALENDAR_COLORS.makeup_planned).toBe("#ea580c");
    expect(resolveDayFillSegments("open", [{ lessonId: "x", opsStatus: "makeup_planned" }])).toEqual(["makeup_planned"]);
  });
});

describe("öneri günleri — zorla açık gün", () => {
  const workingDays = [1, 2, 3, 4, 5, 6];
  it("Güz Pazartesi normalde önerilmez, zorla açılınca önerilir; çalışma günü olmayan Pazar yalnız zorla açılınca", () => {
    expect(isSuggestableWorkDay("2026-11-02", "guz", [], undefined, workingDays)).toBe(false);
    expect(isSuggestableWorkDay("2026-11-02", "guz", [{ date: "2026-11-02", isOpen: true, name: "" }], undefined, workingDays)).toBe(true);
    expect(isSuggestableWorkDay("2026-11-01", "guz", [], undefined, workingDays)).toBe(false);
    expect(isSuggestableWorkDay("2026-11-01", "guz", [{ date: "2026-11-01", isOpen: true, name: "" }], undefined, workingDays)).toBe(true);
    expect(isSuggestableWorkDay("2026-11-03", "guz", [{ date: "2026-11-03", isOpen: false, name: "" }], undefined, workingDays)).toBe(false);
  });
});
