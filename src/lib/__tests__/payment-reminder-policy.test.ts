import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createSeedData } from "../seed";
import { writeData as writeJson } from "../store-json";
import { listNotificationsForUser, NOTIFICATIONS_FILE } from "../notifications";
import { sweepPaymentFailedOrPending } from "../notification-sweeps";
import { DEFAULT_TENANT_ID } from "../auth/config";
import {
  PAYMENT_REMINDER_SELECT,
  resolvePaymentReminderSettings,
  shouldCreatePaymentReminder,
} from "../payment-reminder-policy";

// P0 2026-10-20 — gelecek yıl Mayıs vadeli taksit yöneticilere "bekleyen ödeme" olarak düşüyordu (createdAt + 7 gün).
const NOW = new Date("2026-10-20T06:00:00.000Z");
const day = (offset: number) => new Date(Date.UTC(2026, 9, 20 + offset)).toISOString();
const pay = (dueOffset: number, extra: Record<string, unknown> = {}) => ({
  status: "pending" as const,
  amount: 1000,
  paidAmount: 0,
  dueDate: day(dueOffset),
  contractId: undefined as string | undefined,
  ...extra,
});
const none = new Set<string>();
const defaults = resolvePaymentReminderSettings(undefined);

describe("shouldCreatePaymentReminder", () => {
  it("gelecek yıl Mayıs vadeli ödenmemiş taksit → bildirim yok", () => {
    expect(shouldCreatePaymentReminder(pay(0, { dueDate: "2027-05-15T00:00:00.000Z" }), defaults, none, NOW)).toBeNull();
  });

  it("vadesi bugün → açıkken var, kapalıyken yok", () => {
    expect(shouldCreatePaymentReminder(pay(0), defaults, none, NOW)?.daysUntilDue).toBe(0);
    expect(shouldCreatePaymentReminder(pay(0), { ...defaults, enabled: false }, none, NOW)).toBeNull();
  });

  it("3 gün sonra vadeli → yalnız erken pencere >= 3 ise", () => {
    expect(shouldCreatePaymentReminder(pay(3), defaults, none, NOW)).toBeNull();
    expect(shouldCreatePaymentReminder(pay(3), { ...defaults, daysBefore: 2 }, none, NOW)).toBeNull();
    const hit = shouldCreatePaymentReminder(pay(3), { ...defaults, daysBefore: 3 }, none, NOW);
    expect(hit?.since.toISOString()).toBe(day(0));
  });

  it("ödenmiş / iptal / terminal sözleşme / vadesiz / bakiyesi kalmamış → yok", () => {
    expect(shouldCreatePaymentReminder(pay(-5, { status: "paid" }), defaults, none, NOW)).toBeNull();
    expect(shouldCreatePaymentReminder(pay(-5, { status: "voided" }), defaults, none, NOW)).toBeNull();
    expect(shouldCreatePaymentReminder(pay(-5, { contractId: "c1" }), defaults, new Set(["c1"]), NOW)).toBeNull();
    expect(shouldCreatePaymentReminder(pay(-5, { dueDate: "" }), defaults, none, NOW)).toBeNull();
    expect(shouldCreatePaymentReminder(pay(-5, { paidAmount: 1000 }), defaults, none, NOW)).toBeNull();
    // `overdue` durumu da canlı borçtur.
    expect(shouldCreatePaymentReminder(pay(-5, { status: "overdue" }), defaults, none, NOW)).not.toBeNull();
  });

  it("gecikmede aşama: tekrar aralığı ve en fazla tekrar sayısı aşama başını belirler", () => {
    const s = { ...defaults, repeatDays: 7, maxRepeats: 2 };
    expect(shouldCreatePaymentReminder(pay(-6), s, none, NOW)?.since.toISOString()).toBe(day(-6));
    expect(shouldCreatePaymentReminder(pay(-10), s, none, NOW)?.since.toISOString()).toBe(day(-3));
    // 40 gün gecikme: 2 tekrardan sonra aşama ilerlemez → yeni bildirim yok.
    expect(shouldCreatePaymentReminder(pay(-40), s, none, NOW)?.since.toISOString()).toBe(day(-26));
    expect(shouldCreatePaymentReminder(pay(-40), { ...s, repeatDays: 0 }, none, NOW)?.since.toISOString()).toBe(day(-40));
  });

  it("tarama DB'den yalnız gereken kolonları seçer", () => {
    expect(Object.keys(PAYMENT_REMINDER_SELECT).sort()).toEqual(
      ["amount", "contractId", "description", "dueDate", "enrollmentId", "firstCollectionIncludesNextMonth", "id", "installmentPeriodLabel", "paidAmount", "source", "status", "studentId"]
    );
  });
});

describe("sweepPaymentFailedOrPending", () => {
  const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
  beforeEach(async () => {
    await fs.rm(DATA_FILE, { force: true });
    await fs.rm(NOTIFICATIONS_FILE, { force: true });
  });

  it("gelecek vadeli taksit bildirilmez; gecikmiş olan bir kez bildirilir (iki tur)", async () => {
    const seed = createSeedData();
    const created = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const today = new Date().toISOString().slice(0, 10);
    const base = { studentId: "s1", amount: 1000, paidAmount: 0, status: "pending" as const, createdAt: created };
    seed.payments.push(
      { ...base, id: "pay_future_may", dueDate: `${Number(today.slice(0, 4)) + 1}-05-15T00:00:00.000Z`, description: "Mayıs taksidi" },
      { ...base, id: "pay_late", dueDate: new Date(Date.now() - 2 * 86_400_000).toISOString(), description: "Ekim taksidi" }
    );
    await writeJson(seed);
    await sweepPaymentFailedOrPending(new Date());
    await sweepPaymentFailedOrPending(new Date());
    const admin = await listNotificationsForUser({ tenantId: DEFAULT_TENANT_ID, userId: "user_manager_ezgi" });
    const kinds = admin.filter((n) => n.kind === "payment_failed_or_pending");
    expect(kinds.filter((n) => n.body.includes("pay_future_may"))).toHaveLength(0);
    expect(kinds.filter((n) => n.body.includes("pay_late"))).toHaveLength(1);
  });
});
