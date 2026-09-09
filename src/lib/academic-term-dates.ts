/**
 * Kurum bazlı Güz/Yaz dönem tarihleri — TEK akademik dönem çözümleyici.
 *
 * Ayar yoksa mevcut, belgelenmiş geriye uyumlu varsayılan kullanılır
 * (Güz: 1 Eylül–30 Haziran; Yaz: 1 Temmuz–31 Ağustos). Geçersiz/boş değer
 * sessizce varsayılana DÜŞMEZ — kayıt anında alan bazlı Türkçe hata döner.
 *
 * Prisma sütunu EKLENMEDİ: db modunda mevcut `termWeeklyClosedDays` Json
 * kolonunun additive `academicTermDates` anahtarına yazılır (migration yok).
 */

import type { StudentTermType } from "./types";
import type { TermMonth } from "./attendance-calendar";

export type AcademicTermDates = {
  /** yyyy-MM-dd — Güz başlangıcı (ör. 2026-09-15) */
  guzStart: string;
  guzEnd: string;
  yazStart: string;
  yazEnd: string;
};

export type AcademicTermDateField = keyof AcademicTermDates;

export type AcademicTermDateValidation =
  | { ok: true; dates: AcademicTermDates }
  | { ok: false; fieldErrors: Partial<Record<AcademicTermDateField, string>>; message: string };

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export const ACADEMIC_TERM_DATE_FIELDS: AcademicTermDateField[] = [
  "guzStart",
  "guzEnd",
  "yazStart",
  "yazEnd",
];

export const ACADEMIC_TERM_DATE_LABELS: Record<AcademicTermDateField, string> = {
  guzStart: "Güz dönemi başlangıç tarihi",
  guzEnd: "Güz dönemi bitiş tarihi",
  yazStart: "Yaz dönemi başlangıç tarihi",
  yazEnd: "Yaz dönemi bitiş tarihi",
};

/** Belgelenmiş geriye uyumlu varsayılan — ayarın olmadığı kurumlar. */
export function defaultAcademicTermDates(anchorYear: number): AcademicTermDates {
  return {
    guzStart: `${anchorYear}-09-01`,
    guzEnd: `${anchorYear + 1}-06-30`,
    yazStart: `${anchorYear}-07-01`,
    yazEnd: `${anchorYear}-08-31`,
  };
}

export function parseYmd(value: string): { y: number; m: number; d: number } | null {
  if (!YMD.test(value)) return null;
  const y = Number(value.slice(0, 4));
  const m = Number(value.slice(5, 7));
  const d = Number(value.slice(8, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return { y, m, d };
}

function ymdToNumber(ymd: string): number {
  return Number(ymd.replace(/-/g, ""));
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return ymdToNumber(aStart) <= ymdToNumber(bEnd) && ymdToNumber(bStart) <= ymdToNumber(aEnd);
}

export function validateAcademicTermDates(input: {
  guzStart?: string | null;
  guzEnd?: string | null;
  yazStart?: string | null;
  yazEnd?: string | null;
}): AcademicTermDateValidation {
  const fieldErrors: Partial<Record<AcademicTermDateField, string>> = {};
  const values: Partial<AcademicTermDates> = {};

  for (const field of ACADEMIC_TERM_DATE_FIELDS) {
    const raw = input[field]?.trim() ?? "";
    if (!raw) {
      fieldErrors[field] = `${ACADEMIC_TERM_DATE_LABELS[field]} boş olamaz.`;
      continue;
    }
    if (!parseYmd(raw)) {
      fieldErrors[field] = `${ACADEMIC_TERM_DATE_LABELS[field]} geçerli bir tarih olmalıdır (YYYY-AA-GG).`;
      continue;
    }
    values[field] = raw;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      fieldErrors,
      message: "Dönem tarihlerinde eksik veya geçersiz alan var.",
    };
  }

  const dates = values as AcademicTermDates;

  if (ymdToNumber(dates.guzStart) > ymdToNumber(dates.guzEnd)) {
    fieldErrors.guzStart = "Güz başlangıç tarihi bitişten sonra olamaz.";
    fieldErrors.guzEnd = "Güz bitiş tarihi başlangıçtan önce olamaz.";
  }
  if (ymdToNumber(dates.yazStart) > ymdToNumber(dates.yazEnd)) {
    fieldErrors.yazStart = "Yaz başlangıç tarihi bitişten sonra olamaz.";
    fieldErrors.yazEnd = "Yaz bitiş tarihi başlangıçtan önce olamaz.";
  }
  if (
    !fieldErrors.guzStart &&
    !fieldErrors.yazStart &&
    rangesOverlap(dates.guzStart, dates.guzEnd, dates.yazStart, dates.yazEnd)
  ) {
    const msg = "Güz ve Yaz dönemleri çakışamaz.";
    fieldErrors.guzStart = msg;
    fieldErrors.guzEnd = msg;
    fieldErrors.yazStart = msg;
    fieldErrors.yazEnd = msg;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, message: "Dönem tarihlerinde çakışma veya sıra hatası var." };
  }
  return { ok: true, dates };
}

/** Bir yyyy-MM-dd tarihin verilen aralıkta olup olmadığı (dahil). */
export function ymdInInclusiveRange(ymd: string, start: string, end: string): boolean {
  const n = ymdToNumber(ymd);
  return n >= ymdToNumber(start) && n <= ymdToNumber(end);
}

/**
 * Kaydedilmiş bir döngüyü (ör. 2026-09-15…2027-06-15) istenen akademik yıl
 * çapasındaki aynı ay-gün aralığına kaydırır.
 */
function shiftYmd(ymd: string, deltaYears: number): string {
  const p = parseYmd(ymd);
  if (!p || deltaYears === 0) return ymd;
  return `${p.y + deltaYears}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export function shiftAcademicTermDatesBy(dates: AcademicTermDates, deltaYears: number): AcademicTermDates {
  if (deltaYears === 0) return dates;
  return {
    guzStart: shiftYmd(dates.guzStart, deltaYears),
    guzEnd: shiftYmd(dates.guzEnd, deltaYears),
    yazStart: shiftYmd(dates.yazStart, deltaYears),
    yazEnd: shiftYmd(dates.yazEnd, deltaYears),
  };
}

export function shiftAcademicTermDates(dates: AcademicTermDates, anchorYear: number): AcademicTermDates {
  const stored = parseYmd(dates.guzStart);
  if (!stored) return dates;
  return shiftAcademicTermDatesBy(dates, anchorYear - stored.y);
}

export function resolveAcademicTermDatesForAnchor(
  stored: AcademicTermDates | null | undefined,
  term: StudentTermType,
  anchorYear: number
): AcademicTermDates {
  if (!stored) return defaultAcademicTermDates(anchorYear);
  const key = term === "yaz" ? stored.yazStart : stored.guzStart;
  const year = parseYmd(key)?.y;
  if (year == null) return defaultAcademicTermDates(anchorYear);
  return shiftAcademicTermDatesBy(stored, anchorYear - year);
}

export function isYmdWithinAcademicTerm(
  ymd: string,
  term: StudentTermType,
  dates: AcademicTermDates
): boolean {
  return term === "yaz"
    ? ymdInInclusiveRange(ymd, dates.yazStart, dates.yazEnd)
    : ymdInInclusiveRange(ymd, dates.guzStart, dates.guzEnd);
}

export function resolveTermForYmd(
  ymd: string,
  dates: AcademicTermDates | null | undefined,
  fallback: StudentTermType = "guz"
): StudentTermType {
  if (!dates) {
    const month = Number(ymd.slice(5, 7));
    if (month === 7 || month === 8) return "yaz";
    if (month === 9 && fallback === "yaz") return "yaz";
    return "guz";
  }
  if (ymdInInclusiveRange(ymd, dates.yazStart, dates.yazEnd)) return "yaz";
  if (ymdInInclusiveRange(ymd, dates.guzStart, dates.guzEnd)) return "guz";
  return fallback;
}

export function monthsOverlappingRange(startYmd: string, endYmd: string): TermMonth[] {
  const start = parseYmd(startYmd);
  const end = parseYmd(endYmd);
  if (!start || !end) return [];
  const months: TermMonth[] = [];
  let y = start.y;
  let m = start.m;
  while (y < end.y || (y === end.y && m <= end.m)) {
    months.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

export function academicTermMonths(
  term: StudentTermType,
  anchorYear: number,
  stored: AcademicTermDates | null | undefined
): TermMonth[] {
  const dates = resolveAcademicTermDatesForAnchor(stored, term, anchorYear);
  if (term === "yaz") return monthsOverlappingRange(dates.yazStart, dates.yazEnd);
  return monthsOverlappingRange(dates.guzStart, dates.guzEnd);
}

export function monthOverlapsAcademicTerm(
  year: number,
  month: number,
  term: StudentTermType,
  dates: AcademicTermDates
): boolean {
  const start = term === "yaz" ? dates.yazStart : dates.guzStart;
  const end = term === "yaz" ? dates.yazEnd : dates.guzEnd;
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return rangesOverlap(monthStart, monthEnd, start, end);
}

/** db Json kolonu: mevcut {guz,yaz} + additive academicTermDates. */
export type TermCalendarJson = {
  guz?: number[];
  yaz?: number[];
  academicTermDates?: AcademicTermDates;
};

export function parseTermCalendarJson(raw: unknown): {
  weekly?: { guz: number[]; yaz: number[] };
  academicTermDates?: AcademicTermDates;
} {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as TermCalendarJson;
  const weekly =
    Array.isArray(obj.guz) && Array.isArray(obj.yaz) ? { guz: obj.guz, yaz: obj.yaz } : undefined;
  const dates = obj.academicTermDates;
  const academicTermDates =
    dates &&
    typeof dates.guzStart === "string" &&
    typeof dates.guzEnd === "string" &&
    typeof dates.yazStart === "string" &&
    typeof dates.yazEnd === "string"
      ? dates
      : undefined;
  return { weekly, academicTermDates };
}

export function mergeTermCalendarJson(
  existing: unknown,
  patch: { weekly?: { guz: number[]; yaz: number[] }; academicTermDates?: AcademicTermDates | null }
): TermCalendarJson {
  const prev = parseTermCalendarJson(existing);
  const next: TermCalendarJson = {};
  const weekly = patch.weekly ?? prev.weekly;
  if (weekly) {
    next.guz = weekly.guz;
    next.yaz = weekly.yaz;
  }
  const dates =
    patch.academicTermDates === null ? undefined : (patch.academicTermDates ?? prev.academicTermDates);
  if (dates) next.academicTermDates = dates;
  return next;
}
