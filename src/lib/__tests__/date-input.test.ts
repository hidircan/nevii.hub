import { describe, it, expect } from "vitest";
import {
  parseDateOnlyInput,
  toIsoDateOrNull,
  isValidDateOnlyInput,
  dayOfMonthUtc,
  isValidTimeOnlyInput,
  isCompleteDateOnlyInput,
  incompleteDateHint,
} from "../date-input";

describe("date-input — Faz 5B güvenli tarih ayrıştırma (contract-panel.tsx çökme kök nedeni)", () => {
  it("boş string, undefined, null için ASLA fırlatmaz — null döner", () => {
    expect(toIsoDateOrNull("")).toBeNull();
    expect(toIsoDateOrNull(undefined)).toBeNull();
    expect(toIsoDateOrNull(null)).toBeNull();
    expect(parseDateOnlyInput("")).toBeNull();
    expect(isValidDateOnlyInput("")).toBe(false);
  });

  it("bozuk/rastgele metin için fırlatmaz, null döner", () => {
    expect(toIsoDateOrNull("not-a-date")).toBeNull();
    expect(toIsoDateOrNull("2026-13-40")).toBeNull();
    expect(toIsoDateOrNull("2026/09/01")).toBeNull();
  });

  it("imkansız takvim tarihini (ör. 30 Şubat) SESSİZCE bir sonraki aya kaydırmaz — reddeder", () => {
    // Date.UTC(2026, 1, 30) JS'te sessizce Mart'a taşar — bu YAKALANMALI.
    expect(isValidDateOnlyInput("2026-02-30")).toBe(false);
    expect(toIsoDateOrNull("2026-02-30")).toBeNull();
  });

  it("geçerli tarihi doğru ISO'ya çevirir, saat dilimi KAYMASI olmaz", () => {
    const iso = toIsoDateOrNull("2026-09-01");
    expect(iso).not.toBeNull();
    // UTC öğlen ayrıştırıldığı için hem negatif hem pozitif UTC ofsetlerinde gün ASLA kaymaz.
    expect(new Date(iso!).getUTCDate()).toBe(1);
    expect(new Date(iso!).getUTCMonth()).toBe(8);
    expect(new Date(iso!).getUTCFullYear()).toBe(2026);
  });

  it("dayOfMonthUtc geçersiz girdi için null, geçerli için doğru günü döner", () => {
    expect(dayOfMonthUtc(null)).toBeNull();
    expect(dayOfMonthUtc("")).toBeNull();
    expect(dayOfMonthUtc(toIsoDateOrNull("2026-09-20"))).toBe(20);
  });

  it("isValidTimeOnlyInput 24 saat biçimini doğrular", () => {
    expect(isValidTimeOnlyInput("16:00")).toBe(true);
    expect(isValidTimeOnlyInput("00:00")).toBe(true);
    expect(isValidTimeOnlyInput("23:59")).toBe(true);
    expect(isValidTimeOnlyInput("24:00")).toBe(false);
    expect(isValidTimeOnlyInput("9:00")).toBe(false);
    expect(isValidTimeOnlyInput("")).toBe(false);
    expect(isValidTimeOnlyInput(undefined)).toBe(false);
  });
});

describe("2026-09-29 — yıl yazılırken ara değerler (Ders programı paneli çökmesi)", () => {
  it("yılın ilk rakamı/kısmi yıl TAMAMLANMAMIŞ sayılır ve uyarı üretir", () => {
    for (const partial of ["0002-10-15", "0020-10-15", "0202-10-15", "15092-10-15", "2026-02-30", "2026-13-01"]) {
      expect(isCompleteDateOnlyInput(partial)).toBe(false);
      expect(incompleteDateHint(partial)).toMatch(/tamamlanmadı/);
    }
  });

  it("boş (opsiyonel) alan uyarı üretmez, tam tarih geçerlidir", () => {
    expect(incompleteDateHint("")).toBeNull();
    expect(isCompleteDateOnlyInput("2026-10-15")).toBe(true);
    expect(incompleteDateHint("2026-10-15")).toBeNull();
    expect(isCompleteDateOnlyInput("2028-02-29")).toBe(true);
  });

  it("çökme zinciri: kısmi tarihten türetilen gün date-fns ile formatlanabilir kalır", async () => {
    const { format, parseISO, addDays } = await import("date-fns");
    const { toYmd } = await import("../closed-days");
    // Eski davranış: toYmd yılı doldurmadığı için "2-10-17" → parseISO Invalid → format RangeError.
    const ymd = toYmd(addDays(parseISO("0002-10-15T12:00"), 2));
    expect(ymd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(() => format(parseISO(`${ymd}T12:00`), "d MMMM EEEE")).not.toThrow();
  });
});
