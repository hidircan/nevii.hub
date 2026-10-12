import { describe, expect, it, beforeEach, vi } from "vitest";
import { __resetRefreshBus, bumpScope, subscribeToScopes } from "../refresh-bus";
import { scopesForPushKind } from "../invalidate";

beforeEach(() => {
  __resetRefreshBus();
});

describe("refresh-bus", () => {
  it("yalnız ilgili kapsam dinleyicileri tetiklenir", () => {
    const schedule = vi.fn();
    const payments = vi.fn();
    subscribeToScopes(["schedule"], schedule);
    subscribeToScopes(["payments"], payments);
    bumpScope("schedule");
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(payments).not.toHaveBeenCalled();
  });

  it("'all' herkesi tetikler; cleanup çalışır", () => {
    const a = vi.fn();
    const off = subscribeToScopes(["homework"], a);
    bumpScope("all");
    expect(a).toHaveBeenCalledTimes(1);
    off();
    bumpScope("all");
    expect(a).toHaveBeenCalledTimes(1);
  });

  it("dinleyici hatası veriyolunu kırmaz", () => {
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    const good = vi.fn();
    subscribeToScopes(["schedule"], bad);
    subscribeToScopes(["schedule"], good);
    bumpScope("schedule");
    expect(good).toHaveBeenCalledTimes(1);
  });
});

describe("scopesForPushKind", () => {
  it("ders → program + devam + bildirim", () => {
    expect(scopesForPushKind("lesson_reminder_1h")).toEqual(["schedule", "attendance", "notifications"]);
    expect(scopesForPushKind("lesson_cancelled")).toEqual(["schedule", "attendance", "notifications"]);
    expect(scopesForPushKind("lesson_rescheduled")).toContain("schedule");
  });

  it("ödev/ödeme kapsamları", () => {
    expect(scopesForPushKind("homework_due_date_changed")).toEqual(["homework", "notifications"]);
    expect(scopesForPushKind("payment_received")).toEqual(["payments", "notifications"]);
  });

  it("bilinmeyen/boş kategori güvenli varsayılan", () => {
    expect(scopesForPushKind("future_kind_xyz")).toEqual(["notifications"]);
    expect(scopesForPushKind(undefined)).toEqual(["notifications"]);
  });
});
