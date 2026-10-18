"use client";

/**
 * 8. tur (D) — Öğretmenler listesi arama/filtre/sıralama/sayfalama. Kartlar
 * sunucuda çizilir (performans skoru vb.); bu bileşen yalnız hangilerinin,
 * hangi sırayla görüneceğine karar verir. Durum URL'de tutulur (yenileme ve
 * paylaşılan bağlantı korunur) — Öğrenciler ekranıyla aynı desen.
 */

import { useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Search, UserX } from "lucide-react";
import { TeacherPerformanceInfo } from "@/components/teacher-performance-info";
import { PaginationControls, usePagination } from "@/components/pagination-controls";
import {
  filterTeacherRows,
  TEACHER_ROW_GRID,
  type TeacherListRow,
  type TeacherListSort,
  type TeacherListStatus,
} from "@/lib/teacher-list-filter";

const STATUS_PARAM: Record<string, TeacherListStatus> = { aktif: "active", pasif: "inactive", arsiv: "inactive", tumu: "all" };
const STATUS_OPTIONS: { value: string; label: string; status: TeacherListStatus }[] = [
  { value: "aktif", label: "Aktif", status: "active" },
  { value: "pasif", label: "Pasif", status: "inactive" },
  { value: "tumu", label: "Tümü", status: "all" },
];
const SORT_OPTIONS: { value: TeacherListSort; label: string }[] = [
  { value: "name", label: "Ada göre (A → Z)" },
  { value: "created_desc", label: "Kayıt tarihi (yeniden eskiye)" },
  { value: "students_desc", label: "Öğrenci sayısı (çoktan aza)" },
];

const controlClass =
  "h-9 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 text-sm text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]";

export function TeacherListView({
  rows,
  cards,
  branches,
  instruments,
  showPerformance,
}: {
  rows: TeacherListRow[];
  showPerformance: boolean;
  cards: Record<string, ReactNode>;
  branches: { id: string; name: string }[];
  instruments: string[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const durum = searchParams.get("durum") ?? "aktif";
  const status = STATUS_PARAM[durum] ?? "active";
  const branchFilter = searchParams.getAll("sube");
  const instrument = searchParams.get("enstruman") ?? "";
  const sortParam = searchParams.get("sirala") as TeacherListSort | null;
  const sort = SORT_OPTIONS.some((o) => o.value === sortParam) ? sortParam! : "name";

  function update(mutate: (p: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    const qs = params.toString();
    // DB egress (2026-10-18): sunucu sayfası bu parametreleri okumaz — native history, sunucu turu YOK (bkz. students-table).
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  }
  const setParam = (key: string, value: string, fallback = "") =>
    update((p) => (value && value !== fallback ? p.set(key, value) : p.delete(key)));

  function toggleBranch(id: string) {
    update((p) => {
      const next = branchFilter.includes(id) ? branchFilter.filter((b) => b !== id) : [...branchFilter, id];
      p.delete("sube");
      next.forEach((b) => p.append("sube", b));
    });
  }

  const visible = filterTeacherRows(rows, { query, branches: branchFilter, instrument, status, sort });
  const { pageItems, page, setPage, pageSize, setPageSize, totalPages, totalCount } = usePagination(visible, 10, {
    urlParam: "per",
  });
  const anyFilter = Boolean(query || branchFilter.length || instrument || durum !== "aktif");

  const statusCounts: Record<TeacherListStatus, number> = {
    active: rows.filter((r) => r.active).length,
    inactive: rows.filter((r) => !r.active).length,
    all: rows.length,
  };
  const currentStatusValue = durum === "arsiv" ? "pasif" : durum;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div role="radiogroup" aria-label="Durum" className="inline-flex shrink-0 self-start rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-0.5">
          {STATUS_OPTIONS.map((o) => {
            const selected = currentStatusValue === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setParam("durum", o.value, "aktif");
                  setPage(1);
                }}
                className={`inline-flex h-8 items-center gap-1.5 rounded-[calc(var(--radius-md)-2px)] px-3 text-sm font-medium transition ${
                  selected
                    ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-[var(--shadow-sm)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                {o.label}
                <span className="tabular-nums text-xs text-[var(--color-text-muted)]">{statusCounts[o.status]}</span>
              </button>
            );
          })}
        </div>
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Öğretmen ara</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setParam("q", e.target.value.trim());
              setPage(1);
            }}
            placeholder="Ad, e-posta veya telefon ile ara"
            className={`${controlClass} w-full pl-8`}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Enstrüman"
            value={instrument}
            onChange={(e) => setParam("enstruman", e.target.value)}
            className={controlClass}
          >
            <option value="">Tüm enstrümanlar</option>
            {instruments.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
          <select aria-label="Sıralama" value={sort} onChange={(e) => setParam("sirala", e.target.value, "name")} className={controlClass}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {branches.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-[var(--color-text-muted)]">Şube:</span>
          {branches.map((b) => {
            const active = branchFilter.includes(b.id);
            return (
              <button
                key={b.id}
                type="button"
                aria-pressed={active}
                onClick={() => toggleBranch(b.id)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  active
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-text)]"
                    : "border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]"
                }`}
              >
                {b.name}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] px-5 py-3 text-xs font-medium text-[var(--color-text-muted)]">
          <span>{visible.length} öğretmen listeleniyor</span>
          {anyFilter ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                window.history.replaceState(null, "", pathname);
              }}
              className="text-[var(--color-primary)] hover:underline"
            >
              Filtreleri temizle
            </button>
          ) : null}
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
            <UserX className="h-8 w-8 text-[var(--color-text-muted)]" />
            <p className="text-sm font-medium text-[var(--color-text)]">
              {anyFilter ? "Bu filtrelere uyan öğretmen yok." : "Henüz öğretmen eklenmemiş."}
            </p>
            <p className="max-w-sm text-xs text-[var(--color-text-muted)]">
              {anyFilter
                ? "Arama metnini kısaltın veya filtreleri temizleyin."
                : "Sağ üstteki \"Yeni Öğretmen\" ile tek tek ekleyebilir ya da \"Toplu aktar\" ile CSV yükleyebilirsiniz."}
            </p>
          </div>
        ) : (
          <>
            <div
              className={`hidden gap-x-6 border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] px-5 py-2 text-xs font-medium text-[var(--color-text-muted)] lg:grid ${TEACHER_ROW_GRID} lg:items-center`}
            >
              <span>Öğretmen</span>
              <span>Şube ve enstrüman</span>
              <span>Ders yükü</span>
              {showPerformance ? (
                <span className="inline-flex items-center gap-1">
                  Performans <TeacherPerformanceInfo />
                </span>
              ) : (
                <span />
              )}
              <span className="sr-only">İşlemler</span>
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {pageItems.map((r) => (
                <div key={r.id}>{cards[r.id]}</div>
              ))}
            </div>
          </>
        )}
      </div>

      <PaginationControls
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}
