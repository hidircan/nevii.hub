/**
 * Ödemeler tablosu — filtre + sıralama (saf, istemci ve test ortak).
 * Tarih filtreleri gün bazında ve dahildir; tahsil tarihi filtresi ödenmemiş satırı eler.
 */
import type { PaymentStatus } from "./types";

export type PaymentSortKey = "dueDate" | "amount" | "paidAt" | "studentName";

export type PaymentTableFilter = {
  search: string;
  status: "all" | PaymentStatus;
  /** Yalnız aksiyon gerektirenler (gecikmiş / kısmi). */
  actionOnly: boolean;
  dueFrom: string;
  dueTo: string;
  paidFrom: string;
  paidTo: string;
  minAmount: string;
  maxAmount: string;
  sortKey: PaymentSortKey;
  sortDir: "asc" | "desc";
};

type Row = { studentName: string; status: PaymentStatus; dueDate: string; paidAt?: string; amount: number };

function parseAmount(raw: string): number | null {
  const trimmed = raw.trim().replace(/\./g, "").replace(",", ".");
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function filterAndSortPayments<T extends Row>(rows: T[], f: PaymentTableFilter): T[] {
  const query = f.search.trim().toLocaleLowerCase("tr");
  const min = parseAmount(f.minAmount);
  const max = parseAmount(f.maxAmount);
  const next = rows.filter((row) => {
    if (query && !row.studentName.toLocaleLowerCase("tr").includes(query)) return false;
    if (f.actionOnly) {
      if (row.status !== "overdue" && row.status !== "partial") return false;
    } else if (f.status !== "all" && row.status !== f.status) {
      return false;
    }
    const due = row.dueDate.slice(0, 10);
    if (f.dueFrom && due < f.dueFrom) return false;
    if (f.dueTo && due > f.dueTo) return false;
    const paid = row.paidAt?.slice(0, 10);
    if (f.paidFrom && (!paid || paid < f.paidFrom)) return false;
    if (f.paidTo && (!paid || paid > f.paidTo)) return false;
    if (min !== null && row.amount < min) return false;
    if (max !== null && row.amount > max) return false;
    return true;
  });
  const dir = f.sortDir === "asc" ? 1 : -1;
  return next.sort((a, b) => {
    if (f.sortKey === "amount") return (a.amount - b.amount) * dir;
    if (f.sortKey === "studentName") return a.studentName.localeCompare(b.studentName, "tr") * dir;
    if (f.sortKey === "paidAt") {
      // Ödenmemiş satırlar yönden bağımsız hep sonda.
      if (!a.paidAt || !b.paidAt) return a.paidAt ? -1 : b.paidAt ? 1 : 0;
      return a.paidAt.localeCompare(b.paidAt) * dir;
    }
    return a.dueDate.localeCompare(b.dueDate) * dir;
  });
}
