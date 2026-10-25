"use client";

/**
 * Uzun listeler (Öğrenciler, Ödemeler, Ödeme geçmişi vb.) için ortak
 * sayfalama — sayfa başına kayıt sayısı seçimi (10/20/50/100) + sayfalar
 * arasında geçiş. Tamamen istemci tarafında (rows zaten filtrelenmiş
 * diziyi verir) — mevcut arama/filtre/sıralama mantığına dokunmaz, yalnızca
 * son adımda görüntülenen alt kümeyi keser.
 */

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * 2026-09-20 — kullanıcı talebi: yoğun listelerde (Öğrenciler) sayfa başına
 * 100 kayıt. 10 varsayılan olarak KALIR (küçük ekranlarda ilk açılışı hızlı
 * tutar); 20/50/100 eklendi. Sayfalama tamamen istemci tarafında olduğu için
 * 100 kayıt ek sunucu maliyeti getirmez — yalnız DOM satır sayısını artırır.
 */
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

/**
 * Saf sayfalama matematiği — `usePagination`'dan çıkarıldı ki React
 * render/hook ortamı olmadan (bu repoda component render testi altyapısı
 * yok — jsdom/@testing-library kurulu değil, vitest `environment: "node"`)
 * `src/lib/__tests__` içinde saf bir `.ts` testiyle doğrulanabilsin.
 */
export function computePagination<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  const start = (clampedPage - 1) * pageSize;
  return {
    pageItems: items.slice(start, start + pageSize),
    page: clampedPage,
    totalPages,
    totalCount: items.length,
  };
}

/**
 * Doğrudan sayfa seçimi için kısaltılmış sayfa penceresi (saf — `computePagination`
 * gibi `src/lib/__tests__` içinde test edilir). İlk/son sayfa her zaman görünür,
 * araya "…" konur; yüzlerce düğme üretilmez. `maxButtons` sayısal düğme üst sınırıdır.
 */
export function pageWindow(page: number, totalPages: number, maxButtons = 7): (number | "…")[] {
  const total = Math.max(1, totalPages);
  const current = Math.min(Math.max(1, page), total);
  const max = Math.max(5, maxButtons);
  if (total <= max) return Array.from({ length: total }, (_, i) => i + 1);
  const headCount = max - 1;
  if (current <= headCount - 1) {
    return [...Array.from({ length: headCount }, (_, i) => i + 1), "…", total];
  }
  if (current >= total - headCount + 2) {
    return [1, "…", ...Array.from({ length: headCount }, (_, i) => total - headCount + 1 + i)];
  }
  const side = Math.floor((max - 3) / 2);
  const middle = Array.from({ length: side * 2 + 1 }, (_, i) => current - side + i);
  return [1, "…", ...middle, "…", total];
}

/**
 * `defaultPageSize`/`pageSize` kasıtlı olarak `number` (yalnız `PageSize`
 * değil) — bu, sabit sayfa boyutlu (ör. öğrenci detayında 3'lük, seçici
 * OLMADAN) kullanım alanlarının da aynı sayfalama matematiğini
 * paylaşabilmesi için; `PaginationControls`'un 10/20/50/100 seçicisi ayrı bir
 * UI parçası, `usePagination`'ın kabul ettiği değerleri kısıtlamaz.
 */
export function usePagination<T>(
  items: T[],
  defaultPageSize: number = 10,
  /**
   * Verilirse sayfa boyutu URL'de (`?<urlParam>=100`) saklanır — yenilemede,
   * geri/ileri'de ve paylaşılan bağlantıda korunur. Verilmezse davranış
   * eskisi gibi yalnız bileşen ömrü boyunca yaşar.
   */
  options?: { urlParam?: string }
) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlParam = options?.urlParam;
  const urlPageSize = urlParam ? Number(searchParams.get(urlParam)) : NaN;

  const [page, setPage] = useState(1);
  const [localPageSize, setLocalPageSize] = useState<number>(defaultPageSize);
  const pageSize =
    urlParam && PAGE_SIZE_OPTIONS.includes(urlPageSize as (typeof PAGE_SIZE_OPTIONS)[number])
      ? urlPageSize
      : localPageSize;
  const setPageSize = setLocalPageSize;

  // Filtre/arama değişip liste küçüldüğünde, artık var olmayan bir sayfada
  // görüntü kalmasın diye render sırasında kırpılır (bkz. `page` state'i
  // kendisi hiç değiştirilmez — bir sonraki manuel sayfa değişiminde veya
  // listenin tekrar büyümesiyle doğal olarak düzelir; ekstra bir efekt/
  // setState döngüsü gerekmez).
  const { pageItems, page: clampedPage, totalPages, totalCount } = useMemo(
    () => computePagination(items, page, pageSize),
    [items, page, pageSize]
  );

  function changePageSize(size: number) {
    setPageSize(size);
    setPage(1);
    if (urlParam) {
      const params = new URLSearchParams(searchParams.toString());
      if (size === defaultPageSize) params.delete(urlParam);
      else params.set(urlParam, String(size));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }

  return { pageItems, page: clampedPage, setPage, pageSize, setPageSize: changePageSize, totalPages, totalCount };
}

export function PaginationControls({
  page,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
  /**
   * Opsiyonel genişletmeler (varsayılanlar mevcut davranışı aynen korur —
   * diğer 11 tüketici etkilenmez):
   * - `pageSizeOptions`: bu liste için geçerli sayfa boyutları.
   * - `showPageNumbers`: Önceki/Sonraki arasına kısaltılmış doğrudan sayfa seçimi.
   * - `showRange`: "Toplam N kayıttan X–Y arası" bilgisi.
   */
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  showPageNumbers = false,
  showRange = false,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: readonly number[];
  showPageNumbers?: boolean;
  showRange?: boolean;
}) {
  if (totalCount === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(totalCount, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] px-4 py-3 text-sm">
      <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
        <span>Sayfa başına</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value) as PageSize)}
          aria-label="Sayfa başına kayıt sayısı"
          className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1 text-sm text-[var(--color-text)]"
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <span>{showRange ? `kayıt · Toplam ${totalCount} kayıttan ${from}–${to} arası` : `kayıt · Toplam ${totalCount}`}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Önceki sayfa"
          className="inline-flex items-center justify-center rounded-md border border-[var(--color-border-strong)] p-1.5 text-[var(--color-text)] hover:bg-[var(--color-surface-muted)] disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {showPageNumbers ? (
          <span className="flex items-center gap-1" role="group" aria-label="Sayfa seçimi">
            {pageWindow(page, totalPages).map((entry, i) =>
              entry === "…" ? (
                <span key={`gap-${i}`} aria-hidden="true" className="px-0.5 text-[var(--color-text-muted)]">
                  …
                </span>
              ) : (
                <button
                  key={entry}
                  type="button"
                  onClick={() => onPageChange(entry)}
                  aria-label={`Sayfa ${entry}`}
                  aria-current={entry === page ? "page" : undefined}
                  className={
                    entry === page
                      ? "inline-flex min-h-9 min-w-9 items-center justify-center rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-muted)] px-2 py-1 text-sm font-semibold text-[var(--color-text)]"
                      : "inline-flex min-h-9 min-w-9 items-center justify-center rounded-md border border-transparent px-2 py-1 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
                  }
                >
                  {entry}
                </button>
              )
            )}
          </span>
        ) : (
          <span className="px-1 text-[var(--color-text-muted)]">
            Sayfa {page} / {totalPages}
          </span>
        )}
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Sonraki sayfa"
          className="inline-flex items-center justify-center rounded-md border border-[var(--color-border-strong)] p-1.5 text-[var(--color-text)] hover:bg-[var(--color-surface-muted)] disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
