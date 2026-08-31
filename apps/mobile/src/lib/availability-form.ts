import type { AvailabilityWindow } from "../types/api";

export const AVAILABILITY_DAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export type AvailabilityDayRow = { enabled: boolean; start: string; end: string };

export function emptyAvailabilityRows(): AvailabilityDayRow[] {
  return AVAILABILITY_DAYS.map(() => ({ enabled: false, start: "09:00", end: "18:00" }));
}

export function buildProposedAvailability(rows: AvailabilityDayRow[]): AvailabilityWindow[] {
  return rows
    .map((r, i) => ({ ...r, dayOfWeek: i }))
    .filter((r) => r.enabled)
    .map((r) => ({ dayOfWeek: r.dayOfWeek, start: r.start, end: r.end }));
}

export function isAvailabilitySubmittable(rows: AvailabilityDayRow[]): boolean {
  const active = rows.filter((r) => r.enabled);
  return active.length > 0 && active.every((r) => TIME_RE.test(r.start) && TIME_RE.test(r.end) && r.start < r.end);
}
