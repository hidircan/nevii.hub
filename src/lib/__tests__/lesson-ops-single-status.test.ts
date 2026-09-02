import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createLessonTool, setLessonOpsFlagTool } from "../services/tools";
import { readData } from "../store";
import { writeData } from "../store-json";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import type { Payment } from "../types";
import { validateLessonSlot } from "../makeup-engine";
import { effectiveLessonOpsStatus } from "../lesson-ops";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const CLOSED_DAYS_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "closed-days.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "SCHOOL_ADMIN",
    userId: "u1",
    tenantId: DEFAULT_TENANT_ID,
    channel: "web",
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(CLOSED_DAYS_FILE, { force: true });
});

async function findOpenSlot(): Promise<string> {
  const data = await readData();
  for (let offset = 1; offset <= 14; offset++) {
    for (let hour = 9; hour <= 16; hour++) {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      d.setHours(hour, 0, 0, 0);
      if (d.getDay() === 1) continue;
      const candidate = d.toISOString();
      const check = validateLessonSlot(
        data,
        { instrument: "Piyano", studentId: "s1" },
        { teacherId: "t1", roomId: "r1", startAt: candidate }
      );
      if (check.ok) return candidate;
    }
  }
  throw new Error("no open slot found");
}

async function createTestLesson(): Promise<string> {
  const startAt = await findOpenSlot();
  const res = await createLessonTool(ctx(), {
    studentId: "s1",
    teacherId: "t1",
    roomId: "r1",
    instrument: "Piyano",
    startAt,
  });
  if (!res.ok) throw new Error(res.error.message);
  return res.data.lessonId;
}

describe("ÖNCELİK 4 (devam) — Geldi/İşlendi/Telafi tek, dışlayan statü + onaylı geçiş", () => {
  it("ilk tıklama (hiçbir statü etkin değilken) anında kaydeder, onay istemez", async () => {
    const lessonId = await createTestLesson();
    const res = await setLessonOpsFlagTool(ctx(), { lessonId, flag: "attended" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.needsConfirmation).toBeFalsy();
    expect(res.data.alreadySet).toBe(false);

    const data = await readData();
    const lesson = data.lessons.find((l) => l.id === lessonId)!;
    expect(effectiveLessonOpsStatus(lesson)).toBe("attended");
  });

  it("aynı statüye tekrar tıklama idempotent kalır (alreadySet, onay istemez)", async () => {
    const lessonId = await createTestLesson();
    await setLessonOpsFlagTool(ctx(), { lessonId, flag: "attended" });
    const res = await setLessonOpsFlagTool(ctx(), { lessonId, flag: "attended" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.needsConfirmation).toBeFalsy();
    expect(res.data.alreadySet).toBe(true);
  });

  it("farklı bir statüden geçiş onaysız (confirmSwitch yok) hiçbir şeyi DEĞİŞTİRMEZ, needsConfirmation döner", async () => {
    const lessonId = await createTestLesson();
    await setLessonOpsFlagTool(ctx(), { lessonId, flag: "attended" });

    const res = await setLessonOpsFlagTool(ctx(), { lessonId, flag: "processed", reason: "Ders fiilen işlendi" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.needsConfirmation).toBe(true);
    expect(res.data.currentStatus).toBe("attended");

    const data = await readData();
    const lesson = data.lessons.find((l) => l.id === lessonId)!;
    // Hiçbir şey değişmedi — hâlâ "attended"
    expect(effectiveLessonOpsStatus(lesson)).toBe("attended");
  });

  it("confirmSwitch:true ile geçiş uygulanır — tek statü etkin kalır, diğerleri temizlenir", async () => {
    const lessonId = await createTestLesson();
    await setLessonOpsFlagTool(ctx(), { lessonId, flag: "attended" });

    const res = await setLessonOpsFlagTool(ctx(), { lessonId, flag: "processed", confirmSwitch: true, reason: "Ders fiilen işlendi" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.needsConfirmation).toBeFalsy();

    const data = await readData();
    const lesson = data.lessons.find((l) => l.id === lessonId)!;
    expect(lesson.studentAttended).toBe(false);
    expect(lesson.lessonProcessed).toBe(true);
    expect(effectiveLessonOpsStatus(lesson)).toBe("processed");
  });

  it("statü değişse bile GEÇMİŞ bir Payment (lesson_ops, Package B öncesi simüle) void/silinmez — yeni de üretilmez", async () => {
    const lessonId = await createTestLesson();
    await setLessonOpsFlagTool(ctx(), { lessonId, flag: "attended" });

    // Package B'de Geldi/İşlendi/Telafi artık Payment üretmiyor — bu test,
    // ÖNCEDEN (Package B öncesi) var olmuş olabilecek tarihsel bir kaydın
    // statü geçişlerinden etkilenmediğini doğrular.
    const beforeSwitch = await readData();
    const seeded: Payment = {
      id: "pay_seed_single_status",
      studentId: "s1",
      amount: 500,
      paidAmount: 0,
      status: "pending",
      dueDate: new Date().toISOString(),
      description: "Ders ücreti — tarihsel (Package B öncesi simülasyon)",
      lessonId,
      source: "lesson_ops",
      createdAt: new Date().toISOString(),
    };
    await writeData({ ...beforeSwitch, payments: [...beforeSwitch.payments, seeded] });

    await setLessonOpsFlagTool(ctx(), { lessonId, flag: "processed", confirmSwitch: true, reason: "Ders fiilen işlendi" });

    const after = await readData();
    const paymentsForLesson = after.payments.filter((p) => p.lessonId === lessonId);
    // Hâlâ tam olarak aynı tek (tarihsel) kayıt — ne yeni bir tahsilat ne de void.
    expect(paymentsForLesson).toHaveLength(1);
    expect(paymentsForLesson[0]!.id).toBe(seeded.id);
    expect(paymentsForLesson[0]!.status).not.toBe("voided");
  });
});
