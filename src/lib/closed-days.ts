/**
 * PRODUCT_BACKLOG §4.1–4.2 — Pazartesi kapalı + kapalı günler.
 * Saf yardımcılar; store katmanı ClosedDay listesini okur.
 */

import type { ClosedDay } from "./types";

/** Pazartesi = 1 (date-fns / JS: 0=Pazar ... 6=Cumartesi) */
export const SCHOOL_CLOSED_WEEKDAY = 1; // Monday

export function isMonday(date: Date): boolean {
  return date.getDay() === SCHOOL_CLOSED_WEEKDAY;
}

export function isDateClosed(
  isoDateOrDateTime: string,
  closedDays: Pick<ClosedDay, "date">[],
  opts?: { allowMonday?: boolean }
): { closed: boolean; reason?: string } {
  const d = new Date(isoDateOrDateTime);
  if (Number.isNaN(d.getTime())) return { closed: true, reason: "Geçersiz tarih" };
  if (!opts?.allowMonday && isMonday(d)) {
    return { closed: true, reason: "Pazartesi okul kapalıdır." };
  }
  const ymd = toYmd(d);
  if (closedDays.some((c) => c.date === ymd)) {
    return { closed: true, reason: "Bu gün kapalı gün / tatil." };
  }
  return { closed: false };
}

export function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Türkiye sabit tarihli resmî tatiller (yıl parametreli).
 * Dini tatiller (Ramazan/Kurban) ay-takvimine bağlı — bu sürümde sabit
 * millî günler + yılbaşı; dini günler admin özel kapalı gün ile eklenir.
 */
export function turkeyFixedPublicHolidays(year: number): Array<{ date: string; name: string }> {
  return [
    { date: `${year}-01-01`, name: "Yılbaşı" },
    { date: `${year}-04-23`, name: "Ulusal Egemenlik ve Çocuk Bayramı" },
    { date: `${year}-05-01`, name: "Emek ve Dayanışma Günü" },
    { date: `${year}-05-19`, name: "Atatürk’ü Anma, Gençlik ve Spor Bayramı" },
    { date: `${year}-07-15`, name: "Demokrasi ve Millî Birlik Günü" },
    { date: `${year}-08-30`, name: "Zafer Bayramı" },
    // 2429 s. Kanun — dini bayram arefeleriyle tutarlı: 13.00'ten itibaren yarım gün.
    { date: `${year}-10-28`, name: "Cumhuriyet Bayramı Arefesi (yarım gün, 13.00'ten itibaren)" },
    { date: `${year}-10-29`, name: "Cumhuriyet Bayramı" },
  ];
}

/** Takvim UI: ilk görünür saat 10:00 (09:00–10:00 yok). */
export const CALENDAR_START_HOUR = 10;
export const CALENDAR_END_HOUR = 22;
