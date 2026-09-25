/**
 * UAT 2026-09-25 — Evraklar Merkezi filtre/sıralama tek saf kaynak (istemci + test).
 * ponytail: istemci tarafı sayfalama; evrak sayısı binleri aşarsa listDocumentInstancesTool'a
 * sunucu sayfalaması (skip/take + aynı filtreler) eklenmeli.
 */
import { documentStatusLabel } from "./document-status";

export type DocumentFilterRow = {
  reference: string;
  kindLabel: string;
  personName: string;
  parentName?: string;
  branchName?: string;
  status: string;
  createdAt: string;
  /** Öğrenci evrakıysa öğrencinin aktifliği; öğrenci dışı evrakta undefined. */
  studentActive?: boolean;
};

export type DocumentSortKey = "reference" | "kindLabel" | "personName" | "status" | "createdAt";
export type StudentStateFilter = "all" | "active" | "inactive";

export type DocumentFilters = {
  query: string;
  kinds: string[];
  statuses: string[];
  branches: string[];
  from: string;
  to: string;
  studentState: StudentStateFilter;
  sortKey: DocumentSortKey;
  sortDir: "asc" | "desc";
};

function compare(a: DocumentFilterRow, b: DocumentFilterRow, key: DocumentSortKey): number {
  if (key === "createdAt") return a.createdAt.localeCompare(b.createdAt);
  if (key === "status") return documentStatusLabel(a.status).localeCompare(documentStatusLabel(b.status), "tr");
  return String(a[key] ?? "").localeCompare(String(b[key] ?? ""), "tr");
}

export function filterAndSortDocuments<T extends DocumentFilterRow>(rows: T[], f: DocumentFilters): T[] {
  const q = f.query.trim().toLocaleLowerCase("tr");
  const out = rows.filter((r) => {
    if (
      q &&
      !r.reference.toLocaleLowerCase("tr").includes(q) &&
      !r.personName.toLocaleLowerCase("tr").includes(q) &&
      !(r.parentName ?? "").toLocaleLowerCase("tr").includes(q)
    )
      return false;
    if (f.kinds.length && !f.kinds.includes(r.kindLabel)) return false;
    if (f.statuses.length && !f.statuses.includes(r.status)) return false;
    if (f.branches.length && !(r.branchName && f.branches.includes(r.branchName))) return false;
    if (f.from && r.createdAt.slice(0, 10) < f.from) return false;
    if (f.to && r.createdAt.slice(0, 10) > f.to) return false;
    // Aktif/pasif yalnız ÖĞRENCİ evraklarına uygulanır; öğretmen/kurum evrakı "Tümü" dışında gizlenir.
    if (f.studentState === "active" && r.studentActive !== true) return false;
    if (f.studentState === "inactive" && r.studentActive !== false) return false;
    return true;
  });
  const sign = f.sortDir === "asc" ? 1 : -1;
  return out.sort((a, b) => sign * compare(a, b, f.sortKey));
}
