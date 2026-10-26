/**
 * Faturalama dönemi matematiği — sağlayıcıdan bağımsız, sunucu takvimi.
 *
 * - Aylık dönem SABİT 30 gün DEĞİLDİR; takvim ayı/yılı eklenir.
 * - IANA timezone duvar saatine göre hesap yapılır (varsayılan UTC).
 * - DST geçişlerinde duvar saati korunur; ay sonu taşmasında (31 → Şubat)
 *   hedef ayın son gününe inilir.
 */
import type { SaasBillingInterval } from "./types";

/** Dönem uzunluğu — UTC takvim ayı/yılı. */
export function addPeriod(fromIso: string, interval: SaasBillingInterval): string {
  return addPeriodInTz(fromIso, interval, "UTC");
}

export function addPeriodInTz(
  fromIso: string,
  interval: SaasBillingInterval,
  timeZone: string
): string {
  const d = new Date(fromIso);
  if (Number.isNaN(d.getTime())) throw new Error("Geçersiz dönem tarihi.");
  if (!timeZone || timeZone === "UTC") {
    const next = new Date(d);
    if (interval === "yearly") next.setUTCFullYear(next.getUTCFullYear() + 1);
    else next.setUTCMonth(next.getUTCMonth() + 1);
    return next.toISOString();
  }
  const parts = wallPartsInTz(timeZone, d.getTime());
  let y = parts.year;
  let m = parts.month;
  if (interval === "yearly") y += 1;
  else {
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = Math.min(parts.day, lastDay);
  const wallUtcGuess = Date.UTC(y, m - 1, day, parts.hour % 24, parts.minute, parts.second);
  const offsetMs = tzOffsetMs(timeZone, wallUtcGuess);
  return new Date(wallUtcGuess - offsetMs).toISOString();
}

function wallPartsInTz(timeZone: string, utcMs: number): Record<string, number> {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(new Date(utcMs))
    .reduce<Record<string, number>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = Number(p.value);
      return acc;
    }, {});
}

/** timeZone'un verilen UTC anındaki offset'i (ms, doğu pozitif). */
function tzOffsetMs(timeZone: string, utcMs: number): number {
  const parts = wallPartsInTz(timeZone, utcMs);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
  return asUtc - utcMs;
}
