"use client";

/**
 * 8. tur (D) — Öğretmenler listesi arama/filtre/sıralama/sayfalama. Kartlar
 * sunucuda çizilir (performans skoru vb.); bu bileşen yalnız hangilerinin,
 * hangi sırayla görüneceğine karar verir. Durum URL'de tutulur (yenileme ve
 * paylaşılan bağlantı korunur) — Öğrenciler ekranıyla aynı desen.
 */

import { useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Card } from "@/components/ui";
import { PaginationControls, usePagination } from "@/components/pagination-controls";
import {
  filterTeacherRows,
  type TeacherListRow,
  type TeacherListSort,
  type TeacherListStatus,
} from "@/lib/teacher-list-filter";

const STATUS_PARAM: Record<string, TeacherListStatus> = { aktif: "active", pasif: "inactive", arsiv: "inactive", tumu: "all" };
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "aktif", label: "Aktif" },
  { value: "pasif", label: "Pasif (arşiv)" },
  { value: "tumu", label: "Tümü" },
];
const SORT_OPTIONS: { value: TeacherListSort; label: string }[] = [
  { value: "name", label: "Ada göre (A → Z)" },
  { value: "created_desc", label: "Kayıt tarihi (yeniden eskiye)" },
  { value: "students_desc", label: "Öğrenci sayısı (çoktan aza)" },
];

const controlClass =
  "rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)]";

export function TeacherListView({
  rows,
  cards,
  branches,
  instruments,
}: {
  rows: TeacherListRow[];
  cards: Record<string, ReactNode>;
  branches: { id: string; name: string }[];
  instruments: string[];
}) {
  const router = useRouter();
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
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
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

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-2">
          <label className="relative min-w-[14rem] flex-1">
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
              placeholder="Ad, soyad, e-posta veya telefon ile ara…"
              className={`${controlClass} w-full pl-8`}
            />
          </label>
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
          <select aria-label="Durum" value={durum === "arsiv" ? "pasif" : durum} onChange={(e) => setParam("durum", e.target.value, "aktif")} className={controlClass}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
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
        {branches.length > 1 ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Şube</span>
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
        <p className="mt-3 flex flex-wrap items-center gap-x-3 text-xs font-medium text-[var(--color-text-muted)]">
          <span>{visible.length} öğretmen listeleniyor</span>
          {anyFilter ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                router.replace(pathname, { scroll: false });
              }}
              className="text-[var(--color-primary)] hover:underline"
            >
              Filtreleri temizle
            </button>
          ) : null}
        </p>
      </Card>

      {visible.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--color-text-muted)]">
            {anyFilter ? "Bu filtrelere uyan öğretmen yok. Filtreleri gevşetin veya temizleyin." : "Henüz öğretmen yok."}
          </p>
        </Card>
      ) : (
        pageItems.map((r) => <div key={r.id}>{cards[r.id]}</div>)
      )}

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
