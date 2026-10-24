import { describe, it, expect } from "vitest";
import { narrowToMakeupCenter } from "../reference-data";
import type { AppData } from "../types";

/** DB egress (2026-10-18) — Telafi Merkezi `"planning"` dilimi (json/memory kolu; store-db aynı kuralı SQL'de uygular). */
describe("narrowToMakeupCenter planning", () => {
  const lesson = (id: string, startAt: string, extra: Record<string, unknown> = {}) => ({ id, startAt, endAt: startAt, ...extra });
  const data = {
    settings: { branches: [] },
    teachers: [],
    students: [],
    rooms: [],
    teacherFeeRules: [],
    lessons: [
      lesson("src", "2026-09-01T10:00:00.000Z"),
      lesson("mk", "2026-08-01T10:00:00.000Z", { makeupRequestId: "m_done" }),
      lesson("near", "2026-10-21T09:00:00.000Z"),
      lesson("far", "2026-12-01T10:00:00.000Z"),
      lesson("doneSlotDay", "2027-01-10T10:00:00.000Z"),
    ],
    makeupRequests: [
      { id: "m_open", status: "suggested", sourceLessonId: "src", suggestedSlots: [{ startAt: "2026-10-20T10:00:00.000Z" }] },
      { id: "m_done", status: "confirmed", sourceLessonId: "src", suggestedSlots: [{ startAt: "2027-01-10T10:00:00.000Z" }] },
    ],
  } as unknown as AppData;

  it("bağlı + telafi dersleri + açık slotların ±1 günü; kapalı talebin slotu pencereyi genişletmez", () => {
    expect(narrowToMakeupCenter(data, { lessons: "planning" }).lessons.map((l) => l.id)).toEqual(["src", "mk", "near"]);
    expect(narrowToMakeupCenter(data, { lessons: "linked" }).lessons.map((l) => l.id)).toEqual(["src"]);
    expect(narrowToMakeupCenter(data).lessons).toHaveLength(5);
  });
});
