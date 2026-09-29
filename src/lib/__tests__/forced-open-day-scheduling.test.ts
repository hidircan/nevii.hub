/**
 * 2026-09-30 KRİTİK — "zorla açık" günde Ders Programı'ndan ders planlanamıyordu.
 * Kök neden: tool katmanı istisnayı görüyordu ama store'un `addLesson`/seri/taşıma/telafi
 * doğrulaması store'un KENDİ `readData`'sını kullanıyordu; o okumada `closedDayOverrides` yoktu →
 * gün yine "kapalı" sayılıyordu. Zorla açma gerçek kaynak çakışmasını aşmamalı.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createLessonTool, setDayOverrideTool, updateLessonScheduleTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

const DIR = resolveDataDir(path.join(process.cwd(), "data"));
const ctx = (o?: Partial<ServiceContext>): ServiceContext => ({ role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...o });

beforeEach(async () => {
  await fs.rm(path.join(DIR, "store.json"), { force: true });
  await fs.rm(path.join(DIR, "closed-days.json"), { force: true });
});

const MONDAY = "2026-11-02"; // Güz döneminde haftalık kapalı gün

describe("zorla açık gün — ders planlama", () => {
  it("kapalı Pazartesi reddedilir; zorla açılınca ders kaydedilir; aynı öğretmen/saat çakışması yine reddedilir", async () => {
    const base = { studentId: "s1", teacherId: "t1", roomId: "r1", instrument: "Piyano", startAt: `${MONDAY}T11:00`, overrideAvailability: true };
    const closed = await createLessonTool(ctx(), base);
    expect(closed.ok).toBe(false);
    expect(!closed.ok && closed.error.message).toContain("Zorla açık");

    expect((await setDayOverrideTool(ctx(), { date: MONDAY, isOpen: true })).ok).toBe(true);
    const created = await createLessonTool(ctx(), base);
    expect(created.ok ? "ok" : created.error.message).toBe("ok");
    expect((await readData()).lessons.some((l) => created.ok && l.id === created.data.lessonId)).toBe(true);

    const clash = await createLessonTool(ctx(), { ...base, studentId: "s2", roomId: "r2" });
    expect(clash.ok).toBe(false);
  });

  it("mevcut bir ders zorla açık Pazartesi'ye taşınabilir (dar veri dilimi de istisnayı görür)", async () => {
    const created = await createLessonTool(ctx(), { studentId: "s1", teacherId: "t1", roomId: "r1", instrument: "Piyano", startAt: "2026-11-03T11:00", overrideAvailability: true });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const closed = await updateLessonScheduleTool(ctx(), { lessonId: created.data.lessonId, startAt: `${MONDAY}T12:00` });
    expect(closed.ok).toBe(false);
    await setDayOverrideTool(ctx(), { date: MONDAY, isOpen: true });
    const moved = await updateLessonScheduleTool(ctx(), { lessonId: created.data.lessonId, startAt: `${MONDAY}T12:00` });
    expect(moved.ok ? "ok" : moved.error.message).toBe("ok");
  });
});
