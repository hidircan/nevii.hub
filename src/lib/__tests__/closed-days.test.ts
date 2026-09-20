import { describe, it, expect } from "vitest";
import { CALENDAR_START_HOUR, isMonday, turkeyFixedPublicHolidays } from "../closed-days";
import { resolveWorkDay } from "../work-days";
import type { ClosedDay } from "../types";

/**
 * 2026-09-20 — `isDateClosed` KALDIRILDI. Aynı sorular artık tek kaynaktan
 * (`src/lib/work-days.ts` → `resolveWorkDay`) yanıtlanıyor; eski fonksiyon
 * `ClosedDay.isOpen` bayrağını okumadığı için "zorla açık" bir günü yine
 * kapalı sayıyordu. Bu dosya aynı davranışları YENİ kaynağa karşı doğrular.
 */
const at = (ymd: string) => new Date(`${ymd}T09:00:00.000Z`);

function override(date: string, isOpen: boolean): ClosedDay {
  return {
    id: `cld_${date}`,
    date,
    name: "",
    kind: "custom",
    isOpen,
    createdBy: "u_test",
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
  };
}

describe("Monday closed", () => {
  it("Pazartesi kapalı (Güz dönemi haftalık kuralı)", () => {
    // 2026-08-03 is Monday
    expect(isMonday(new Date("2026-08-03T12:00:00+03:00"))).toBe(true);
    const r = resolveWorkDay(at("2026-08-03"), "guz", []);
    expect(r.status).toBe("closed");
    expect(r.reason).toBe("term_weekly_closed");
    expect(r.explanation).toMatch(/Pazartesi/i);
    expect(r.schedulable).toBe(false);
  });

  it("Salı açık (tatil yoksa)", () => {
    const r = resolveWorkDay(at("2026-08-04"), "guz", []);
    expect(r.status).toBe("open");
    expect(r.schedulable).toBe(true);
  });
});

describe("closed days + holidays", () => {
  it("özel kapalı gün", () => {
    const r = resolveWorkDay(at("2026-08-10"), "guz", [override("2026-08-10", false)]);
    expect(r.status).toBe("closed");
    expect(r.reason).toBe("manual_closed");
  });

  it("özel AÇIK gün — eski isDateClosed'ın gözden kaçırdığı durum", () => {
    // Pazartesi (normalde kapalı) yönetici tarafından açıldı.
    const r = resolveWorkDay(at("2026-08-03"), "guz", [override("2026-08-03", true)]);
    expect(r.status).toBe("open");
    expect(r.schedulable).toBe(true);
  });

  it("Türkiye sabit tatilleri yıl için üretir", () => {
    const h = turkeyFixedPublicHolidays(2026);
    expect(h.find((x) => x.date === "2026-10-29")?.name).toMatch(/Cumhuriyet/);
  });

  it("takvim 10:00 başlar sabiti", () => {
    expect(CALENDAR_START_HOUR).toBe(10);
  });
});
