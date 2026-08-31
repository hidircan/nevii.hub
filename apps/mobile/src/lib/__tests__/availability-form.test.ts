import { describe, it, expect } from "vitest";
import {
  buildProposedAvailability,
  emptyAvailabilityRows,
  isAvailabilitySubmittable,
} from "../availability-form";

describe("availability-form", () => {
  it("birden fazla gün seçilip tek seferde gönderilebilir (çoklu-gün önerisi bug'ı)", () => {
    const rows = emptyAvailabilityRows();
    rows[1] = { enabled: true, start: "09:00", end: "12:00" }; // Pazartesi
    rows[3] = { enabled: true, start: "14:00", end: "18:00" }; // Çarşamba

    expect(isAvailabilitySubmittable(rows)).toBe(true);
    expect(buildProposedAvailability(rows)).toEqual([
      { dayOfWeek: 1, start: "09:00", end: "12:00" },
      { dayOfWeek: 3, start: "14:00", end: "18:00" },
    ]);
  });

  it("bir gönderim sonrası formun sıfırlanması ikinci bir öneriye engel olmaz (leave/re-enter regresyonu)", () => {
    const firstBatch = emptyAvailabilityRows();
    firstBatch[1] = { enabled: true, start: "09:00", end: "12:00" };
    expect(isAvailabilitySubmittable(firstBatch)).toBe(true);

    // Gönderim sonrası ekran `emptyAvailabilityRows()` ile sıfırlanır (aynı
    // oturumda ikinci bir öneri girilebilsin diye) — sıfırlanmış hal tek
    // başına gönderilemez olmalı (hiçbir gün seçili değil), ama hemen
    // ardından yeni bir gün işaretlenip TEKRAR gönderilebilir olmalı.
    const resetRows = emptyAvailabilityRows();
    expect(isAvailabilitySubmittable(resetRows)).toBe(false);

    const secondBatch = emptyAvailabilityRows();
    secondBatch[5] = { enabled: true, start: "10:00", end: "16:00" }; // Cuma
    expect(isAvailabilitySubmittable(secondBatch)).toBe(true);
    expect(buildProposedAvailability(secondBatch)).toEqual([{ dayOfWeek: 5, start: "10:00", end: "16:00" }]);
  });

  it("geçersiz saat aralığı (başlangıç >= bitiş) gönderime engel olur", () => {
    const rows = emptyAvailabilityRows();
    rows[2] = { enabled: true, start: "18:00", end: "09:00" };
    expect(isAvailabilitySubmittable(rows)).toBe(false);
  });

  it("hiçbir gün seçili değilse gönderilemez", () => {
    expect(isAvailabilitySubmittable(emptyAvailabilityRows())).toBe(false);
  });
});
