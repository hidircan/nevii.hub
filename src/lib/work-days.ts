/**
 * ÇALIŞMA GÜNÜ — TEK KAYNAK (2026-09-20).
 *
 * Bu modülden önce "bu gün açık mı?" sorusunun BEŞ ayrı cevabı vardı ve
 * hepsi farklı bilgiyi görüyordu:
 *   - `isDateClosed` (closed-days.ts)        → yalnız Pazartesi + tarih listesi,
 *                                               `isOpen` bayrağını HİÇ okumuyordu
 *                                               (yani "zorla açık" bir gün yine kapalıydı)
 *   - `assertSchedulableDate`                → yukarıdakini `closedDays: []` ile çağırıyordu
 *                                               (istisnalar planlamaya HİÇ ulaşmıyordu)
 *   - `validateLessonSlot`                   → yalnız resmî tatil
 *   - `program-studio.tsx`                   → yalnız resmî tatil
 *   - `resolveDayStatus` (attendance-calendar)→ TAM kural, ama yalnız Yoklama Takvimi kullanıyordu
 *
 * Sonuç: aynı gün Ders Programı'nda planlanabilir, Yoklama Takvimi'nde kapalı
 * görünebiliyordu; yöneticinin koyduğu "zorla açık" istisnası hiçbir planlama
 * ekranını etkilemiyordu.
 *
 * Artık kural TEK yerde: `resolveWorkDay`. Öncelik sırası (KESİN):
 *   1) Yönetici istisnası (ClosedDay) — zorla AÇIK veya zorla KAPALI
 *   2) Resmî tatil (turkish-holidays.ts, Diyanet doğrulamalı)
 *   3) Dönemin haftalık kapalı gün kuralı (Güz: Pazartesi; Yaz: Cts/Paz)
 *   4) Açık
 *
 * `schedulable === (status === "open")` — İSTİSNASIZ. Yönetici bir günü zorla
 * açtıysa o güne ders planlanır (resmî tatil olsa bile); zorla kapattıysa
 * planlanamaz (normalde açık bir gün olsa bile).
 *
 * Saat dilimi: gün ve hafta günü HER ZAMAN kurum saat diliminden okunur
 * (`toZonedYmd`/`zonedWeekday`) — `getDay()` + `toISOString()` karışımı
 * gece yarısı civarındaki dersleri bir önceki güne kaydırıyordu
 * (bkz. LESSONS_LEARNED 2026-09-09).
 */

import type { ClosedDay, StudentTermType } from "./types";
import { findOfficialHoliday } from "./turkish-holidays";
import { DEFAULT_APP_TIMEZONE, toZonedYmd, zonedWeekday } from "./timezone";

export type DayStatus = "closed" | "open";

export type DayStatusReason =
  | "manual_closed"
  | "manual_open"
  | "official_holiday"
  | "term_weekly_closed"
  | "open";

export type DayStatusResolution = {
  date: string; // yyyy-MM-dd
  status: DayStatus;
  reason: DayStatusReason;
  label: string;
};

/** Güz dönemi: haftanın Pazartesi günü (1) varsayılan kapalı. */
export const FALL_WEEKLY_CLOSED_DAYS: number[] = [1];
/** Yaz dönemi: Cumartesi(6) + Pazar(0) varsayılan kapalı. */
export const SUMMER_WEEKLY_CLOSED_DAYS: number[] = [0, 6];

/** Paket 6 — okulun `SchoolSettings.termWeeklyClosedDays` özelleştirmesi; verilmezse sabit varsayılanlar kullanılır. */
export type TermWeeklyClosedDaysOverride = { guz: number[]; yaz: number[] };

export function weeklyClosedDaysForTerm(
  term: StudentTermType,
  override?: TermWeeklyClosedDaysOverride
): number[] {
  if (override) return term === "yaz" ? override.yaz : override.guz;
  return term === "yaz" ? SUMMER_WEEKLY_CLOSED_DAYS : FALL_WEEKLY_CLOSED_DAYS;
}

/**
 * ÖNCELİK 4 (devam) — Program ekranı dönem-bazlı gün kapatma. `term`
 * verilmezse LEGACY davranış korunur: yalnızca Pazartesi kapalı.
 */
export function isWeeklyClosedDayForTerm(
  date: Date,
  term?: StudentTermType,
  override?: TermWeeklyClosedDaysOverride
): boolean {
  if (!term) return zonedWeekday(date) === 1; // legacy: yalnızca Pazartesi
  return weeklyClosedDaysForTerm(term, override).includes(zonedWeekday(date));
}

/** Yönetici istisnası için gereken en küçük şekil — tam `ClosedDay` beklenmez. */
export type DayOverride = Pick<ClosedDay, "date" | "isOpen" | "name">;

/**
 * Bir günün nihai statüsünü — yönetici istisnası > resmî tatil > dönem
 * haftalık kuralı > açık — sırasıyla çözer.
 */
export function resolveDayStatus(
  date: Date,
  term: StudentTermType,
  manualOverrides: DayOverride[],
  weeklyClosedDaysOverride?: TermWeeklyClosedDaysOverride
): DayStatusResolution {
  const ymd = toZonedYmd(date, DEFAULT_APP_TIMEZONE);

  // 1) Yönetici istisnası — en yüksek öncelik (zorla açık VEYA zorla kapalı).
  const manual = manualOverrides.find((o) => o.date === ymd);
  if (manual) {
    return manual.isOpen
      ? { date: ymd, status: "open", reason: "manual_open", label: manual.name || "Zorla açık" }
      : { date: ymd, status: "closed", reason: "manual_closed", label: manual.name || "Kapalı (yönetici)" };
  }

  // 2) Resmî tatil.
  const holiday = findOfficialHoliday(ymd);
  if (holiday) {
    return { date: ymd, status: "closed", reason: "official_holiday", label: holiday.name };
  }

  // 3) Dönemin haftalık kapalı gün kuralı.
  if (weeklyClosedDaysForTerm(term, weeklyClosedDaysOverride).includes(zonedWeekday(date))) {
    const label = term === "yaz" ? "Hafta sonu (Yaz dönemi kapalı)" : "Pazartesi (Güz dönemi kapalı)";
    return { date: ymd, status: "closed", reason: "term_weekly_closed", label };
  }

  // 4) Açık gün.
  return { date: ymd, status: "open", reason: "open", label: "Açık" };
}

/** Tüm ay için gün gün statü listesi üretir (UI ay kutusu render'ı için). */
export function resolveMonthStatuses(
  year: number,
  month: number, // 1-12
  term: StudentTermType,
  manualOverrides: DayOverride[],
  weeklyClosedDaysOverride?: TermWeeklyClosedDaysOverride
): DayStatusResolution[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const results: DayStatusResolution[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    // Öğlen sabitlemesi: hangi saat diliminde çalışırsak çalışalım gün kaymaz.
    const date = new Date(Date.UTC(year, month - 1, d, 9, 0, 0));
    results.push(resolveDayStatus(date, term, manualOverrides, weeklyClosedDaysOverride));
  }
  return results;
}

// ---------------------------------------------------------------------------
// Ürün katmanı — "planlanabilir mi?" ve kullanıcıya gösterilecek Türkçe cümle
// ---------------------------------------------------------------------------

export type WorkDayResolution = DayStatusResolution & {
  /** Bu güne ders planlanabilir mi? `status === "open"` ile BİREBİR aynıdır. */
  schedulable: boolean;
  /** Günün neden açık/kapalı olduğunu anlatan, ekranda aynen gösterilebilir Türkçe cümle. */
  explanation: string;
  /** Statü bir yönetici istisnasından mı geliyor (rozet/uyarı göstermek için)? */
  overridden: boolean;
  /** Zorla açık gün normalde kapalıysa neden kapalı olduğu (ör. "Pazartesi (Güz dönemi kapalı) — …"). */
  normallyClosedExplanation?: string;
};

const REASON_TEXT: Record<DayStatusReason, (label: string) => string> = {
  manual_open: (label) =>
    `Yönetici bu günü ders yapılabilir olarak işaretledi (zorla açık)${label && label !== "Zorla açık" ? ` — ${label}` : ""}.`,
  manual_closed: (label) =>
    `Yönetici bu günü kapattı (zorla kapalı)${label && label !== "Kapalı (yönetici)" ? ` — ${label}` : ""}.`,
  official_holiday: (label) => `${label} — resmî tatil.`,
  term_weekly_closed: (label) => `${label} — kurumun haftalık kapalı günü.`,
  open: () => "Kurum bu gün açık.",
};

/** Kapalı bir günü açmanın yolu — hata mesajlarında HER ZAMAN söylenir (owner kuralı: neden + nasıl düzeltilir). */
export const FORCE_OPEN_HINT =
  "Bu güne ders planlamak gerekiyorsa Ayarlar → Çalışma Günleri ekranından günü “Zorla açık” olarak işaretleyin.";

export function resolveWorkDay(
  date: Date,
  term: StudentTermType,
  manualOverrides: DayOverride[],
  weeklyClosedDaysOverride?: TermWeeklyClosedDaysOverride
): WorkDayResolution {
  const base = resolveDayStatus(date, term, manualOverrides, weeklyClosedDaysOverride);
  const underlying = base.reason === "manual_open" ? resolveDayStatus(date, term, [], weeklyClosedDaysOverride) : undefined;
  return {
    ...base,
    schedulable: base.status === "open",
    explanation: REASON_TEXT[base.reason](base.label),
    overridden: base.reason === "manual_open" || base.reason === "manual_closed",
    normallyClosedExplanation:
      underlying?.status === "closed" ? REASON_TEXT[underlying.reason](underlying.label) : undefined,
  };
}

/**
 * Planlama guard'ı — ders oluşturma/taşıma/seri/telafi akışlarının hepsi
 * BURADAN geçer. Mesaj hem gerçek nedeni hem düzeltme yolunu söyler.
 */
export function assertWorkDaySchedulable(
  date: Date,
  term: StudentTermType,
  manualOverrides: DayOverride[],
  weeklyClosedDaysOverride?: TermWeeklyClosedDaysOverride
): { ok: true; day: WorkDayResolution } | { ok: false; message: string; day: WorkDayResolution } {
  const day = resolveWorkDay(date, term, manualOverrides, weeklyClosedDaysOverride);
  if (day.schedulable) return { ok: true, day };
  return { ok: false, message: `${day.explanation} ${FORCE_OPEN_HINT}`, day };
}

/**
 * Öneri motorları (telafi + "Uygun saatleri bul") için aday gün. Kayıt kuralı `resolveWorkDay`'dir; öneri
 * bunun üstüne kurumun çalışma günü tercihini (`settings.workingDays`) uygular. Yönetici bir günü ZORLA
 * açtıysa o gün tercihten bağımsız her zaman aday olur (2026-09-30: zorla açık gün hiç önerilmiyordu).
 */
export function isSuggestableWorkDay(
  ymd: string,
  term: StudentTermType,
  manualOverrides: DayOverride[],
  weeklyClosedDaysOverride: TermWeeklyClosedDaysOverride | undefined,
  workingDays: number[]
): boolean {
  const date = new Date(`${ymd}T09:00:00Z`);
  const day = resolveWorkDay(date, term, manualOverrides, weeklyClosedDaysOverride);
  if (!day.schedulable) return false;
  return day.reason === "manual_open" || workingDays.includes(zonedWeekday(date));
}
