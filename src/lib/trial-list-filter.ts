/**
 * Deneme dersleri listesi — saf filtre/sıralama (2026-09-26). Varsayılan görünüm
 * "Tümü"; zaman görünümü (Yaklaşan/Geçmiş/Dönüşmeyen) + durum/şube/öğretmen/tarih
 * aralığı + serbest arama birlikte uygulanır.
 */

import type { TrialLessonStatus } from "./types";

export type TrialListView = "all" | "upcoming" | "past" | "open";
export type TrialListSort = "date_desc" | "date_asc" | "name";

export type TrialListRow = {
  id: string;
  name: string;
  phone: string;
  parentName?: string;
  instrument: string;
  teacherId: string;
  teacherName: string;
  branchId: string;
  branchName: string;
  /** ISO */
  startAt: string;
  /** Kurum saat dilimine göre YYYY-MM-DD. */
  dayYmd: string;
  status: TrialLessonStatus;
  convertedStudentId?: string;
  isPast: boolean;
  notes?: string;
  resultNotes?: string;
};

export type TrialListFilter = {
  view: TrialListView;
  query: string;
  status: TrialLessonStatus | "all";
  branchId: string;
  teacherId: string;
  from: string;
  to: string;
  sort: TrialListSort;
};

export const DEFAULT_TRIAL_LIST_FILTER: TrialListFilter = {
  view: "all",
  query: "",
  status: "all",
  branchId: "all",
  teacherId: "all",
  from: "",
  to: "",
  sort: "date_desc",
};

export function isOpenTrial(r: Pick<TrialListRow, "convertedStudentId" | "status">): boolean {
  return !r.convertedStudentId && r.status !== "cancelled" && r.status !== "will_not_continue";
}

function matchesView(r: TrialListRow, view: TrialListView): boolean {
  if (view === "upcoming") return !r.isPast;
  if (view === "past") return r.isPast;
  if (view === "open") return isOpenTrial(r);
  return true;
}

const fold = (s: string) => s.toLocaleLowerCase("tr-TR");

export function filterTrialRows<T extends TrialListRow>(rows: T[], f: TrialListFilter): T[] {
  const q = fold(f.query.trim());
  const digits = f.query.replace(/\D/g, "");
  const out = rows.filter((r) => {
    if (!matchesView(r, f.view)) return false;
    if (f.status !== "all" && r.status !== f.status) return false;
    if (f.branchId !== "all" && r.branchId !== f.branchId) return false;
    if (f.teacherId !== "all" && r.teacherId !== f.teacherId) return false;
    if (f.from && r.dayYmd < f.from) return false;
    if (f.to && r.dayYmd > f.to) return false;
    if (q) {
      const hay = fold([r.name, r.teacherName, r.instrument, r.branchName, r.notes ?? "", r.resultNotes ?? ""].join(" "));
      const phoneHit = digits.length >= 3 && r.phone.replace(/\D/g, "").includes(digits);
      if (!hay.includes(q) && !phoneHit) return false;
    }
    return true;
  });
  return out.sort((a, b) =>
    f.sort === "name"
      ? a.name.localeCompare(b.name, "tr-TR")
      : f.sort === "date_asc"
        ? a.startAt.localeCompare(b.startAt)
        : b.startAt.localeCompare(a.startAt)
  );
}

export function countTrialViews(rows: TrialListRow[]): Record<TrialListView, number> {
  return {
    all: rows.length,
    upcoming: rows.filter((r) => !r.isPast).length,
    past: rows.filter((r) => r.isPast).length,
    open: rows.filter(isOpenTrial).length,
  };
}
