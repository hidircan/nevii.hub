import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyTaskReminder, DUE_TODAY_MORNING_HOUR, buildTaskReminderText, taskReminderNotificationKind } from "../task-reminders";
import { toZonedYmd } from "../timezone";

const TZ = "Europe/Istanbul";
const FIXED_NOW = new Date("2026-03-15T12:00:00Z");

beforeEach(() => {
  process.env.TZ = TZ;
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function isoAtLocalNoon(daysFromToday: number, timeZone = TZ): string {
  const target = new Date(FIXED_NOW.getTime() + daysFromToday * 86_400_000);
  const ymd = toZonedYmd(target, timeZone);
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 9, 0, 0)).toISOString();
}

describe("İş Takip hatırlatma sınıflandırması — classifyTaskReminder", () => {
  it("dueDate yoksa hiçbir hatırlatma üretmez", () => {
    expect(classifyTaskReminder({ status: "TODO", dueDate: undefined }, FIXED_NOW, TZ)).toBeNull();
  });

  it("COMPLETED/CANCELLED/ARCHIVED görevler için hiç hatırlatma üretmez (dueDate geçmiş olsa bile)", () => {
    const pastDue = isoAtLocalNoon(-5);
    expect(classifyTaskReminder({ status: "COMPLETED", dueDate: pastDue }, FIXED_NOW, TZ)).toBeNull();
    expect(classifyTaskReminder({ status: "CANCELLED", dueDate: pastDue }, FIXED_NOW, TZ)).toBeNull();
    expect(classifyTaskReminder({ status: "ARCHIVED", dueDate: pastDue }, FIXED_NOW, TZ)).toBeNull();
  });

  it("tam olarak yarın son tarihi olan açık bir görev DUE_SOON döner", () => {
    const tomorrow = isoAtLocalNoon(1);
    const result = classifyTaskReminder({ status: "TODO", dueDate: tomorrow }, FIXED_NOW, TZ);
    expect(result?.kind).toBe("DUE_SOON");
  });

  it("2+ gün sonrası son tarihli görev için hiçbir hatırlatma üretmez", () => {
    const inTwoDays = isoAtLocalNoon(3);
    expect(classifyTaskReminder({ status: "IN_PROGRESS", dueDate: inTwoDays }, FIXED_NOW, TZ)).toBeNull();
  });

  it("son tarih bugünse VE saat sabah eşiğinden sonraysa DUE_TODAY döner", () => {
    const todayYmd = toZonedYmd(FIXED_NOW, TZ);
    const [y, m, d] = todayYmd.split("-").map(Number);
    const dueToday = new Date(Date.UTC(y!, m! - 1, d!, 9, 0, 0)).toISOString();
    const now = new Date(FIXED_NOW.getTime());
    now.setHours(DUE_TODAY_MORNING_HOUR + 2, 0, 0, 0);
    const result = classifyTaskReminder({ status: "BLOCKED", dueDate: dueToday }, now, TZ);
    expect(result?.kind).toBe("DUE_TODAY");
  });

  it("son tarih bugün AMA henüz sabah eşiği geçmediyse null döner (bir sonraki tick'te tekrar denenir)", () => {
    const todayYmd = toZonedYmd(FIXED_NOW, TZ);
    const [y, m, d] = todayYmd.split("-").map(Number);
    const dueToday = new Date(Date.UTC(y!, m! - 1, d!, 9, 0, 0)).toISOString();
    const earlyMorning = new Date(FIXED_NOW.getTime());
    earlyMorning.setHours(0, 30, 0, 0);
    const result = classifyTaskReminder({ status: "TODO", dueDate: dueToday }, earlyMorning, TZ);
    expect(result).toBeNull();
  });

  it("geçmiş tarihli açık bir görev için OVERDUE döner", () => {
    const past = isoAtLocalNoon(-3);
    const result = classifyTaskReminder({ status: "TODO", dueDate: past }, FIXED_NOW, TZ);
    expect(result?.kind).toBe("OVERDUE");
  });

  it("OVERDUE'nun calendarDay değeri BUGÜNÜN günüdür (dueDate'in günü değil) — 'günde en fazla 1' tekilleştirmesinin temeli", () => {
    const past = isoAtLocalNoon(-10);
    const result = classifyTaskReminder({ status: "TODO", dueDate: past }, FIXED_NOW, TZ);
    expect(result?.calendarDay).toBe(toZonedYmd(FIXED_NOW, TZ));
  });
});

describe("İş Takip hatırlatma metinleri", () => {
  it("her tür için Türkçe, göreve link içeren kısa metin üretir", () => {
    const dueSoon = buildTaskReminderText("DUE_SOON", "Kayıt formunu güncelle", "task_1");
    expect(dueSoon.body).toContain("Kayıt formunu güncelle");
    expect(dueSoon.body).toContain("yarın");
    expect(dueSoon.body).toContain("/panel/is-takip/task_1");

    const dueToday = buildTaskReminderText("DUE_TODAY", "X", "task_2");
    expect(dueToday.body).toContain("bugün");

    const overdue = buildTaskReminderText("OVERDUE", "Y", "task_3");
    expect(overdue.body).toContain("gecikti");
  });

  it("her tür farklı bir Notification.kind değerine eşlenir", () => {
    expect(taskReminderNotificationKind("DUE_SOON")).toBe("task_due_soon");
    expect(taskReminderNotificationKind("DUE_TODAY")).toBe("task_due_today");
    expect(taskReminderNotificationKind("OVERDUE")).toBe("task_overdue");
  });
});
