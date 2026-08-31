import { describe, it, expect } from "vitest";
import { formatDateTr, toZonedYmd, DEFAULT_APP_TIMEZONE } from "../timezone";

describe("formatDateTr — P0 (2026-08-31) Sözleşme Merkezi hydration hotfix", () => {
  it("1 Ocak → 01.01.YYYY (gün VE ay sıfırla doldurulur)", () => {
    expect(formatDateTr("2027-01-01T12:00:00.000Z")).toBe("01.01.2027");
  });

  it("2 Mart → 02.03.YYYY (raporlanan tam hydration senaryosu)", () => {
    expect(formatDateTr("2027-03-02T12:00:00.000Z")).toBe("02.03.2027");
  });

  it("9 Kasım → 09.11.YYYY", () => {
    expect(formatDateTr("2027-11-09T12:00:00.000Z")).toBe("09.11.2027");
  });

  it("31 Aralık → 31.12.YYYY", () => {
    expect(formatDateTr("2027-12-31T12:00:00.000Z")).toBe("31.12.2027");
  });

  it("çıktı ASLA tek haneli gün/ay içermez — locale varsayılan doldurma davranışına bağlı DEĞİLDİR", () => {
    for (let day = 1; day <= 9; day++) {
      const iso = `2027-0${1}-0${day}T12:00:00.000Z`;
      const out = formatDateTr(iso);
      const [d, m] = out.split(".");
      expect(d).toHaveLength(2);
      expect(m).toHaveLength(2);
    }
  });

  it("Date nesnesi ve ISO string aynı takvim günü için AYNI sonucu üretir", () => {
    const iso = "2027-03-02T12:00:00.000Z";
    expect(formatDateTr(new Date(iso))).toBe(formatDateTr(iso));
  });

  it("determinizm — aynı girdi, aynı süreç içinde her zaman AYNI çıktıyı üretir (Intl locale'e/motora bağlı sapma yok)", () => {
    const iso = "2027-03-02T12:00:00.000Z";
    const results = Array.from({ length: 20 }, () => formatDateTr(iso));
    expect(new Set(results).size).toBe(1);
  });

  it("geçersiz tarih 'Invalid Date' RENDER ETMEZ — güvenli boş string döner", () => {
    expect(formatDateTr("not-a-date")).toBe("");
    expect(formatDateTr("")).toBe("");
    expect(formatDateTr(new Date(NaN))).toBe("");
  });

  it("tarih-yalnız değer (T00:00:00.000Z gece yarısı) İstanbul saat diliminde takvim gününü KAYDIRMAZ", () => {
    // Türkiye UTC+3 — UTC gece yarısı zaten aynı takvim gününün erken saatleri, kaymamalı.
    expect(formatDateTr("2027-03-02T00:00:00.000Z")).toBe("02.03.2027");
  });

  it("açık timeZone parametresi verildiğinde onu kullanır (varsayılan Europe/Istanbul'dan farklı olsa da)", () => {
    expect(formatDateTr("2027-03-02T12:00:00.000Z", "UTC")).toBe("02.03.2027");
    expect(DEFAULT_APP_TIMEZONE).toBe("Europe/Istanbul");
  });

  it("toZonedYmd ile TUTARLI — formatDateTr yalnızca aynı yyyy-MM-dd'yi dd.mm.yyyy'ye çevirir", () => {
    const date = new Date("2027-03-02T12:00:00.000Z");
    const ymd = toZonedYmd(date, DEFAULT_APP_TIMEZONE);
    const [y, m, d] = ymd.split("-");
    expect(formatDateTr(date)).toBe(`${d}.${m}.${y}`);
  });
});
