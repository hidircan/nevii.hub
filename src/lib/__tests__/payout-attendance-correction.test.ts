/**
 * 2026-10-04 — Turgay vakası: hakediş oluştu diye yoklama düzeltmesi tamamen engellenmez.
 * Ödenmemiş (hesaplanmış) hakediş → otomatik yeniden hesap; ödenmiş → etki + gerekçe + kritik şifre,
 * ödeme satırları değişmez, fark "recalc" düzeltme kaydı olur.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  addTeacherPayoutPaymentTool,
  clearLessonOpsFlagTool,
  createLessonTool,
  createTeacherPayoutTool,
  setLessonOpsFlagTool,
} from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { validateLessonSlot } from "../makeup-engine";
import { CRITICAL_ACTION_PASSWORD_FILE } from "../critical-action-password";
import { setupCriticalPassword, TEST_CRITICAL_PASSWORD } from "./contract-cancel-test-helper";
import { payoutPaidAmount, activeAdjustments } from "../payout-ledger";

const DIR = resolveDataDir(path.join(process.cwd(), "data"));
const ctx: ServiceContext = { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };

beforeEach(async () => {
  await fs.rm(path.join(DIR, "store.json"), { force: true });
  await fs.rm(path.join(DIR, "closed-days.json"), { force: true });
  await fs.rm(CRITICAL_ACTION_PASSWORD_FILE, { force: true });
});

/** Geçmişte (hakediş dönemi kapanmış) açık bir slotta işlenmiş ders. */
async function processedPastLesson(): Promise<{ id: string; day: string }> {
  const data = await readData();
  for (let offset = 3; offset <= 20; offset++) {
    for (let hour = 9; hour <= 16; hour++) {
      const d = new Date();
      d.setDate(d.getDate() - offset);
      d.setHours(hour, 0, 0, 0);
      if (d.getDay() === 1) continue;
      const startAt = d.toISOString();
      const check = validateLessonSlot(data, { instrument: "Piyano", studentId: "s1" }, { teacherId: "t1", roomId: "r1", startAt });
      if (!check.ok) continue;
      const res = await createLessonTool(ctx, { studentId: "s1", teacherId: "t1", roomId: "r1", instrument: "Piyano", startAt });
      if (!res.ok) continue;
      const set = await setLessonOpsFlagTool(ctx, { lessonId: res.data.lessonId, flag: "processed", reason: "Ders işlendi" });
      if (!set.ok) continue;
      const lesson = (await readData()).lessons.find((l) => l.id === res.data.lessonId)!;
      const local = new Date(lesson.startAt);
      const day = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
      return { id: res.data.lessonId, day };
    }
  }
  throw new Error("no open past slot");
}

async function payoutFor(day: string) {
  const created = await createTeacherPayoutTool(ctx, { teacherId: "t1", periodStart: day, periodEnd: day });
  if (!created.ok) throw new Error(created.error.message);
  return created.data.payout;
}

describe("yoklama düzeltmesi ↔ hakediş", () => {
  it("ödenmemiş hakediş: İşlendi geri alınır ve hakediş otomatik yeniden hesaplanır", async () => {
    const { id, day } = await processedPastLesson();
    const payout = await payoutFor(day);
    expect(payout.totalAmount).toBeGreaterThan(0);
    const res = await clearLessonOpsFlagTool(ctx, { lessonId: id, expected: "processed" });
    expect(res.ok ? "ok" : res.error.message).toBe("ok");
    const after = (await readData()).teacherPayouts.find((p) => p.id === payout.id)!;
    expect(after.totalAmount).toBe(0);
    expect(after.lineSnapshot?.some((l) => l.lessonId === id)).toBe(false);
  });

  it("ödenmiş hakediş: onaysız reddedilir (mali etki gösterilir), onay + gerekçe + kritik şifreyle düzeltme kaydı oluşur", async () => {
    await setupCriticalPassword();
    const { id, day } = await processedPastLesson();
    const payout = await payoutFor(day);
    const paid = await addTeacherPayoutPaymentTool(ctx, { payoutId: payout.id });
    expect(paid.ok).toBe(true);

    const blocked = await clearLessonOpsFlagTool(ctx, { lessonId: id, expected: "processed" });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    const impact = (blocked.error.details as { paidPayoutImpact: { delta: number; paidAmount: number } }).paidPayoutImpact;
    expect(impact.delta).toBe(-payout.totalAmount);
    expect((await readData()).lessons.find((l) => l.id === id)!.lessonProcessed).toBe(true);

    const wrongPw = await clearLessonOpsFlagTool(ctx, {
      lessonId: id,
      expected: "processed",
      paidPayoutConfirm: true,
      payoutReason: "Yoklama yanlış girilmiş",
      criticalPassword: "yanlis",
    });
    expect(!wrongPw.ok && wrongPw.error.code).toBe("FORBIDDEN");

    const okRes = await clearLessonOpsFlagTool(ctx, {
      lessonId: id,
      expected: "processed",
      paidPayoutConfirm: true,
      payoutReason: "Yoklama yanlış girilmiş",
      criticalPassword: TEST_CRITICAL_PASSWORD,
    });
    expect(okRes.ok ? "ok" : okRes.error.message).toBe("ok");
    const after = (await readData()).teacherPayouts.find((p) => p.id === payout.id)!;
    // Gerçekte ödenen tutar ödenmiş görünmeye devam eder; fark ters düzeltme kaydıdır.
    expect(payoutPaidAmount(after)).toBe(payoutPaidAmount(paid.ok ? paid.data.payout : payout));
    const recalc = activeAdjustments(after, "recalc");
    expect(recalc).toHaveLength(1);
    expect(recalc[0]!.amount).toBe(-payout.totalAmount);
  });

  it("ödenmiş hakedişte İşlendi → Telafi geçişi de aynı kapıdan geçer", async () => {
    await setupCriticalPassword();
    const { id, day } = await processedPastLesson();
    const payout = await payoutFor(day);
    await addTeacherPayoutPaymentTool(ctx, { payoutId: payout.id });
    const res = await setLessonOpsFlagTool(ctx, { lessonId: id, flag: "makeup", reason: "Öğrenci gelmedi", confirmSwitch: true, disruptionSource: "student" });
    expect(res.ok).toBe(false);
    expect((await readData()).lessons.find((l) => l.id === id)!.lessonProcessed).toBe(true);
  });
});
