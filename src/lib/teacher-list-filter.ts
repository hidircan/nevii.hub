/**
 * 8. tur (D) — Öğretmenler listesi saf filtre/sıralama. Şube filtresi
 * `teacherServesBranch` ile (birincil + ek şubeler) — ders planlamayla aynı kural.
 */

import { teacherServesBranch } from "./teacher-branches";
import type { BranchId } from "./types";

export type TeacherListStatus = "active" | "inactive" | "all";
export type TeacherListSort = "name" | "created_desc" | "students_desc";

export type TeacherListRow = {
  id: string;
  /** Kurum numarası (T00001…) kayıt sırasıyla artar — "oluşturulma" sıralaması buna dayanır. */
  displayId?: string;
  name: string;
  email: string;
  phone: string;
  branchId: BranchId;
  branchIds?: BranchId[];
  instruments: string[];
  active: boolean;
  studentCount: number;
};

export type TeacherListFilter = {
  query: string;
  branches: string[];
  instrument: string;
  status: TeacherListStatus;
  sort: TeacherListSort;
};

const norm = (v: string) => v.toLocaleLowerCase("tr").replace(/\s+/g, "");

export function filterTeacherRows(rows: TeacherListRow[], f: TeacherListFilter): TeacherListRow[] {
  const q = norm(f.query);
  const digits = f.query.replace(/\D/g, "");
  const out = rows.filter((r) => {
    if (f.status === "active" && !r.active) return false;
    if (f.status === "inactive" && r.active) return false;
    if (f.branches.length && !f.branches.some((b) => teacherServesBranch(r, b))) return false;
    if (f.instrument && !r.instruments.includes(f.instrument)) return false;
    if (!q) return true;
    return (
      norm(r.name).includes(q) ||
      norm(r.email).includes(q) ||
      (digits.length >= 3 && r.phone.replace(/\D/g, "").includes(digits))
    );
  });
  const byName = (a: TeacherListRow, b: TeacherListRow) => a.name.localeCompare(b.name, "tr");
  if (f.sort === "students_desc") return out.sort((a, b) => b.studentCount - a.studentCount || byName(a, b));
  if (f.sort === "created_desc") {
    return out.sort((a, b) => (b.displayId ?? "").localeCompare(a.displayId ?? "") || byName(a, b));
  }
  return out.sort(byName);
}

/** Liste satırı ve başlığı aynı ızgarayı paylaşır (sunucu satırı + istemci başlığı). */
export const TEACHER_ROW_GRID = "lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1.5fr)_8.5rem_8rem_10rem]";
