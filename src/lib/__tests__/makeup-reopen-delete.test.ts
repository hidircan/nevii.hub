import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createLessonTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import type { AppData } from "../types";
import { applyLessonOpsFlag, clearLessonOpsFlag } from "../lesson-ops";
import { lessonHardBlockReason, lessonProtectionReason, planForcedLessonDeletion } from "../lesson-scope-edit";
import { makeupLinksOfLesson } from "../makeup-deadline";
import { findOpenLessonSlot } from "./helpers/lesson-slot";

/**
 * 2026-10-15 — Telafi → Geri al → yeniden Telafi → silme. Ders başına tek yoklama + yoklama başına tek talep
 * (@unique): yeniden Telafi kapanmış talebi yeniden açar; kapanmış (pasif) talep silmeyi engellemez, aktif talep engeller.
 */
const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const ctx: ServiceContext = { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

async function lessonWithData(): Promise<{ data: AppData; lessonId: string }> {
  const seed = await readData();
  const startAt = await findOpenLessonSlot(seed, "s1", "t1", "r1");
  const res = await createLessonTool(ctx, { studentId: "s1", teacherId: "t1", roomId: "r1", instrument: "Piyano", startAt });
  if (!res.ok) throw new Error(res.error.message);
  return { data: await readData(), lessonId: res.data.lessonId };
}

function mark(data: AppData, lessonId: string): AppData {
  const r = applyLessonOpsFlag(data, lessonId, "makeup", "u1", new Date(), "Öğrenci hasta");
  if (!r.ok) throw new Error(r.message);
  return r.data;
}

function undo(data: AppData, lessonId: string): AppData {
  const r = clearLessonOpsFlag(data, lessonId, "makeup", "u1");
  if (!r.ok) throw new Error(r.message);
  return r.data;
}

describe("telafi → geri al → yeniden telafi → silme", () => {
  it("yeniden Telafi kapanmış talebi yeniden açar; ikinci talep/yoklama oluşmaz", async () => {
    const { data, lessonId } = await lessonWithData();
    const again = mark(undo(mark(data, lessonId), lessonId), lessonId);
    const rows = again.makeupRequests.filter((m) => m.sourceLessonId === lessonId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending");
    expect(rows[0].changeLog?.at(-1)).toMatchObject({ action: "reopened", from: "cancelled", to: "pending" });
    expect(again.attendances.filter((a) => a.lessonId === lessonId)).toHaveLength(1);
  });

  it("aktif telafi silmeyi engeller ve nerede görüleceğini söyler", async () => {
    const { data, lessonId } = await lessonWithData();
    const marked = mark(data, lessonId);
    const lesson = marked.lessons.find((l) => l.id === lessonId)!;
    expect(lessonHardBlockReason(marked, lesson)).toMatch(/geçerli bir telafi var.*Telafi Merkezi/);
    expect(planForcedLessonDeletion(marked, lessonId).ok).toBe(false);
  });

  it("geri alınmış (pasif) telafi izi engel değil: kritik silme dersi, yoklamayı ve pasif talebi birlikte kaldırır", async () => {
    const { data, lessonId } = await lessonWithData();
    const undone = undo(mark(data, lessonId), lessonId);
    const lesson = undone.lessons.find((l) => l.id === lessonId)!;
    expect(makeupLinksOfLesson(undone, lessonId)).toMatchObject({ active: [], passive: [{ status: "cancelled" }] });
    expect(lessonHardBlockReason(undone, lesson)).toBeNull();
    expect(lessonProtectionReason(undone, lesson)).toMatch(/eski bir telafi kaydı/);
    const plan = planForcedLessonDeletion(undone, lessonId);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.removedMakeupRequestIds).toHaveLength(1);
    expect(plan.data.makeupRequests.some((m) => m.sourceLessonId === lessonId)).toBe(false);
    expect(plan.data.attendances.some((a) => a.lessonId === lessonId)).toBe(false);
    expect(plan.data.lessons.some((l) => l.id === lessonId)).toBe(false);
  });
});
