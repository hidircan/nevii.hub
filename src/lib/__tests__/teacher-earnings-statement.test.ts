/**
 * 2026-10-06 — Hakediş dökümü (aylık/yıllık): seçili ay korunur, yıl 12 ayın tamamı, toplamlar aylık
 * hakediş hesabıyla uzlaşır, kayıtlı ayın düzeltme/ödemesi ayrı, İstanbul gün sınırı, planlanan telafiye
 * geldi (T) bir kez sayılır. Sentetik veri (json STORE_MODE).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  addTeacherPayoutAdjustmentTool,
  addTeacherPayoutPaymentTool,
  computeTeacherPayoutTool,
  createTeacherPayoutTool,
  teacherEarningsStatementTool,
} from "../services/tools";
import { readData } from "../store";
import { writeData } from "../store-json";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import type { Lesson } from "../types";
import { toDayKey } from "../teacher-payout";

const DIR = resolveDataDir(path.join(process.cwd(), "data"));
const admin: ServiceContext = { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
const teacher: ServiceContext = { role: "TEACHER", userId: "ut1", tenantId: DEFAULT_TENANT_ID, teacherId: "t1", channel: "web" };

function lesson(id: string, start: string, minutes: number, extra: Partial<Lesson> = {}): Lesson {
  const s = new Date(start);
  return {
    id,
    studentId: "s1",
    teacherId: "t1",
    roomId: "r1",
    branchId: "erzene",
    instrument: "Piyano",
    startAt: s.toISOString(),
    endAt: new Date(s.getTime() + minutes * 60_000).toISOString(),
    type: "regular",
    status: "completed",
    lessonProcessed: true,
    ...extra,
  } as Lesson;
}

async function seed() {
  await fs.rm(path.join(DIR, "store.json"), { force: true });
  const data = await readData();
  await writeData({
    ...data,
    lessons: [
      ...data.lessons.filter((l) => l.teacherId !== "t1"),
      lesson("sep1", "2026-09-07T10:00:00Z", 40),
      // Kaçırılan asıl ders (Telafi) — hakedişe girmez.
      lesson("sep-src", "2026-09-14T10:00:00Z", 40, { lessonProcessed: false, opsMakeupFlag: true, status: "scheduled" }),
      // Planlanan telafi dersi "Geldi" — bir kez sayılır, T işaretli.
      lesson("sep-mk", "2026-09-21T10:00:00Z", 40, { type: "makeup", makeupRequestId: "mk1", lessonProcessed: false, studentAttended: true, status: "scheduled" }),
      // İstanbul 01.10.2026 01:30 = UTC 30.09 22:30 → EKİM'e yazılır.
      lesson("oct-edge", "2026-09-30T22:30:00Z", 30),
      lesson("oct1", "2026-10-05T10:00:00Z", 30),
    ],
    teacherFeeRules: [{ id: "fee-t1", teacherId: "t1", perMinuteRate: 10, effectiveFrom: "2020-01-01", createdAt: "2020-01-01" }],
    teacherPayouts: [],
  });
}

beforeEach(async () => {
  await fs.rm(path.join(DIR, "store.json"), { force: true });
});

describe("hakediş dökümü", () => {
  it("İstanbul gün anahtarı: UTC 30.09 22:30 → 2026-10-01; tarih alanları yazılı günü korur", () => {
    expect(toDayKey("2026-09-30T22:30:00.000Z")).toBe("2026-10-01");
    expect(toDayKey("2026-09-01T00:00:00.000Z")).toBe("2026-09-01");
    expect(toDayKey("2026-09-01")).toBe("2026-09-01");
    expect(toDayKey("2026-09-30T10:00:00.000Z")).toBe("2026-09-30");
  });

  it("aylık döküm seçilen ayı (Eylül) basar; kayıt + düzeltme + ödeme ayrı; telafi bir kez, T işaretli", async () => {
    await seed();
    const created = await createTeacherPayoutTool(admin, { teacherId: "t1", periodStart: "2026-09-01", periodEnd: "2026-09-30" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const payoutId = created.data.payout.id;
    expect((await addTeacherPayoutAdjustmentTool(admin, { payoutId, amount: 50, reason: "Ek konser provası" })).ok).toBe(true);
    expect((await addTeacherPayoutPaymentTool(admin, { payoutId, amount: 300, paidAt: "2026-10-03", method: "cash" })).ok).toBe(true);

    const st = await teacherEarningsStatementTool(admin, { teacherId: "t1", year: 2026, month: 9 });
    expect(st.ok).toBe(true);
    if (!st.ok) return;
    expect(st.data.months.map((m) => m.month)).toEqual(["2026-09"]);
    const sep = st.data.months[0]!;
    expect(sep.lines.map((l) => l.lessonId)).toEqual(["sep1", "sep-mk"]);
    expect(sep.makeups).toBe(1);
    expect(sep.lines.find((l) => l.lessonId === "sep-mk")?.attendedPlannedMakeup).toBe(true);
    expect(sep.lines.find((l) => l.lessonId === "sep1")?.attendedPlannedMakeup).toBe(false);
    expect(sep.accrued).toBe(800);
    expect(sep.adjustments).toBe(50);
    expect(sep.net).toBe(850);
    expect(sep.paid).toBe(300);
    expect(sep.balance).toBe(550);
    expect(sep.status).toBe("partial");
    // Ödeme EKİM'de yapıldı ama Eylül hakedişine yazılır; işlem tarihi ayrı.
    const pay = st.data.ledger.find((e) => e.type === "payment")!;
    expect(pay.month).toBe("2026-09");
    expect(pay.date.slice(0, 10)).toBe("2026-10-03");

    // Hakediş ekranıyla aynı rakam.
    const screen = await computeTeacherPayoutTool(admin, { teacherId: "t1", periodStart: "2026-09-01", periodEnd: "2026-09-30" });
    expect(screen.ok).toBe(true);
    if (!screen.ok) return;
    expect(screen.data.totalAmount).toBe(sep.accrued);
    expect(screen.data.existingPayout?.balance).toBe(sep.balance);
  });

  it("yıllık döküm 12 ayın tamamı; toplam = aylık hesapların toplamı; kalem tekrarı yok", async () => {
    await seed();
    await createTeacherPayoutTool(admin, { teacherId: "t1", periodStart: "2026-09-01", periodEnd: "2026-09-30" });
    const st = await teacherEarningsStatementTool(admin, { teacherId: "t1", year: 2026 });
    expect(st.ok).toBe(true);
    if (!st.ok) return;
    expect(st.data.months).toHaveLength(12);
    expect(st.data.months.map((m) => m.month)).toEqual(Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`));
    const ids = st.data.months.flatMap((m) => m.lines.map((l) => l.lessonId));
    expect(new Set(ids).size).toBe(ids.length);
    expect(st.data.months[9]!.lines.map((l) => l.lessonId)).toEqual(["oct-edge", "oct1"]);
    expect(st.data.months[9]!.status).toBe("not_created");
    expect(st.data.months[0]!.status).toBe("no_lessons");

    let sum = 0;
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, "0");
      const last = new Date(Date.UTC(2026, m, 0)).getUTCDate();
      const r = await computeTeacherPayoutTool(admin, { teacherId: "t1", periodStart: `2026-${mm}-01`, periodEnd: `2026-${mm}-${last}` });
      if (!r.ok) throw new Error(r.error.message);
      sum += r.data.totalAmount;
      const mo = await teacherEarningsStatementTool(admin, { teacherId: "t1", year: 2026, month: m });
      if (!mo.ok) throw new Error(mo.error.message);
      expect(mo.data.totals.accrued).toBe(st.data.months[m - 1]!.accrued);
    }
    expect(st.data.totals.accrued).toBe(Math.round(sum * 100) / 100);
    expect(st.data.totals.accrued).toBe(800 + 600);
  });

  it("öğretmen rolü dökümü alamaz", async () => {
    await seed();
    const st = await teacherEarningsStatementTool(teacher, { teacherId: "t1", year: 2026, month: 9 });
    expect(st.ok).toBe(false);
  });
});
