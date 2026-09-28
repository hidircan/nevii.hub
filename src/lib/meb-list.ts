/**
 * MEB Paneli listesi — sorgu tipi + saf filtre/sıralama/sayfalama.
 *
 * ÜÇ store modu (json/memory/db) AYNI semantiği paylaşır: json/memory bu
 * saf fonksiyonları tenant-kapsamlı `readData()` çıktısına uygular; db modu
 * Prisma `where/orderBy/skip/take` ile eşdeğer sorguyu çalıştırır (bkz.
 * store-db.ts `listMebStudents`). MEB'lik HER YERDE `effectiveStudentTypes`
 * ile belirlenir (çoklu türde MEB varsa listelenir; legacy tekil alan
 * fallback'tir).
 */

import { effectiveStudentTypes } from "./student-types";
import { isMebStudent, resolveMebExamStatus, type MebExamStatus } from "./meb";
import type { Student, StudentType } from "./types";

export type MebStudentSortKey = "name" | "level" | "mebLevelStartDate" | "mebLevelEndDate" | "mebExamDate";

export interface MebStudentQuery {
  /** Ad veya kurum numarası (displayId) içinde arama — boşsa filtresiz. */
  search?: string;
  branchId?: string;
  teacherId?: string;
  /** Tek enstrüman adı (öğrencinin enstrümanlarından biri eşleşirse). */
  instrument?: string;
  /**
   * Aktiflik filtresi: true = yalnız aktif, false = yalnız pasif,
   * undefined = tümü. Varsayılan panelde "Aktif"tir (istemci karar verir;
   * burada tanımsız = filtresiz). Silinmiş (deletedAt dolu) kayıtlar HER
   * ZAMAN dışlanır — tarihsel pasif veri kaybolmaz, yalnız geri alınabilir
   * silinmişler bu listede yoktur (detaydan geri alınır).
   */
  active?: boolean;
  examStatus?: MebExamStatus;
  sort?: MebStudentSortKey;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface MebStudentListItem {
  id: string;
  displayId?: string;
  name: string;
  branchId: string;
  instruments: Student["instruments"];
  teacherId: string;
  active: boolean;
  studentTypes: StudentType[];
  level?: string;
  mebLevelStartDate?: string;
  mebLevelEndDate?: string;
  mebExamDate?: string;
  mebExamAttended?: boolean;
}

export interface MebStudentListResult {
  rows: MebStudentListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export const MEB_LIST_DEFAULT_PAGE_SIZE = 20;
export const MEB_LIST_MAX_PAGE_SIZE = 100;

export function normalizeMebQuery(input: MebStudentQuery): Required<
  Pick<MebStudentQuery, "sort" | "sortDir" | "page" | "pageSize">
> &
  MebStudentQuery {
  const pageSizeRaw = Math.floor(input.pageSize ?? MEB_LIST_DEFAULT_PAGE_SIZE);
  const pageRaw = Math.floor(input.page ?? 1);
  return {
    ...input,
    search: input.search?.trim() || undefined,
    sort: input.sort ?? "name",
    sortDir: input.sortDir ?? "asc",
    page: Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1,
    pageSize:
      Number.isFinite(pageSizeRaw) && pageSizeRaw >= 1
        ? Math.min(pageSizeRaw, MEB_LIST_MAX_PAGE_SIZE)
        : MEB_LIST_DEFAULT_PAGE_SIZE,
  };
}

function compareText(a: string | undefined, b: string | undefined, dir: 1 | -1): number {
  return (a ?? "").localeCompare(b ?? "", "tr") * dir;
}

function compareDateOnly(a: string | undefined, b: string | undefined, dir: 1 | -1): number {
  // ISO date-only / ISO datetime stringler sözlüksel olarak kronolojiktir;
  // boş (bilinmeyen) değerler her zaman SONA atılır (yön bağımsız).
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  if (a === b) return 0;
  return (a < b ? -1 : 1) * dir;
}

/** Saf filtre + kararlı sıralama + sayfalama (json/memory yolu + testler). */
export function applyMebStudentQuery(students: Student[], input: MebStudentQuery): MebStudentListResult {
  const q = normalizeMebQuery(input);
  const dir: 1 | -1 = q.sortDir === "desc" ? -1 : 1;
  const searchLower = q.search?.toLocaleLowerCase("tr");

  const filtered = students.filter((s) => {
    if (s.deletedAt) return false;
    if (!isMebStudent(s)) return false;
    if (q.active !== undefined && s.active !== q.active) return false;
    if (q.branchId && s.branchId !== q.branchId) return false;
    if (q.teacherId && s.teacherId !== q.teacherId) return false;
    if (q.instrument && !s.instruments.includes(q.instrument as Student["instruments"][number])) return false;
    if (q.examStatus && resolveMebExamStatus(s) !== q.examStatus) return false;
    if (searchLower) {
      const hay = `${s.name} ${s.displayId ?? ""}`.toLocaleLowerCase("tr");
      if (!hay.includes(searchLower)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let primary = 0;
    switch (q.sort) {
      case "level":
        primary = compareText(a.level, b.level, dir);
        break;
      case "mebLevelStartDate":
        primary = compareDateOnly(a.mebLevelStartDate, b.mebLevelStartDate, dir);
        break;
      case "mebLevelEndDate":
        primary = compareDateOnly(a.mebLevelEndDate, b.mebLevelEndDate, dir);
        break;
      case "mebExamDate":
        primary = compareDateOnly(a.mebExamDate, b.mebExamDate, dir);
        break;
      case "name":
      default:
        primary = compareText(a.name, b.name, dir);
        break;
    }
    // Kararlı sıralama: eşitlikte id tiebreak (sayfalar arası kayma yok).
    if (primary !== 0) return primary;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const total = sorted.length;
  const start = (q.page - 1) * q.pageSize;
  const rows = sorted.slice(start, start + q.pageSize).map((s) => ({
    id: s.id,
    displayId: s.displayId,
    name: s.name,
    branchId: s.branchId,
    instruments: s.instruments,
    teacherId: s.teacherId,
    active: s.active,
    studentTypes: effectiveStudentTypes(s),
    level: s.level,
    mebLevelStartDate: s.mebLevelStartDate,
    mebLevelEndDate: s.mebLevelEndDate,
    mebExamDate: s.mebExamDate,
    mebExamAttended: s.mebExamAttended,
  }));

  return { rows, total, page: q.page, pageSize: q.pageSize };
}
