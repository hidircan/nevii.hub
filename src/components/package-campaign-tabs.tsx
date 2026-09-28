"use client";

/**
 * Paket & Kampanya Motoru — Paketler / Kampanyalar / Rapor sekmeleri,
 * sunucu-taraflı filtre + sayfalama kontrolleri. Filtre/sayfa durumu URL'de
 * taşınır (`searchParams`), liste dilimleme sunucuda yapılır — istemciye
 * yalnız sayfa gider.
 */

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Card, Input, Label, Select } from "@/components/ui";

export type PackageCampaignTab = "paketler" | "kampanyalar" | "rapor";

export function PackageCampaignTabs({
  tab,
  branches,
  totalCount,
  page,
  pageSize,
  totalPages,
  showTermFilter,
  children,
}: {
  tab: PackageCampaignTab;
  branches: { id: string; name: string }[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  showTermFilter: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  function push(params: Record<string, string | null>, resetPage = false) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(params)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (resetPage) next.delete("sayfa");
    router.push(`${pathname}?${next.toString()}`);
  }

  const tabs: { key: PackageCampaignTab; label: string }[] = [
    { key: "paketler", label: "Paketler" },
    { key: "kampanyalar", label: "Kampanyalar" },
    { key: "rapor", label: "Kampanya Raporu" },
  ];

  const q = searchParams.get("q") ?? "";
  const sube = searchParams.get("sube") ?? "";
  const durum = searchParams.get("durum") ?? "all";
  const donem = searchParams.get("donem") ?? "all";

  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(totalCount, page * pageSize);
  const pageNumbers = pageNumbersWindow(page, totalPages);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Paket ve kampanya bölümleri">
        {tabs.map((t) => {
          const active = tab === t.key;
          const next = new URLSearchParams(searchParams.toString());
          next.set("tab", t.key);
          next.delete("sayfa");
          return (
            <Link
              key={t.key}
              role="tab"
              aria-selected={active}
              href={`${pathname}?${next.toString()}`}
              className={
                active
                  ? "rounded-lg bg-[var(--color-primary)] px-3.5 py-2 text-sm font-medium text-white"
                  : "rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-primary)]"
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {tab !== "rapor" ? (
        <Card>
          <form
            className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5"
            onSubmit={(e) => {
              e.preventDefault();
              push({ q: query }, true);
            }}
          >
            <div className="lg:col-span-2">
              <Label>Arama (ad / numara)</Label>
              <div className="flex gap-1.5">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={tab === "paketler" ? "Örn. Piyano, PKT-001" : "Örn. Kardeş, KMP-001"}
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
                >
                  Ara
                </button>
              </div>
            </div>
            <div>
              <Label>Şube</Label>
              <Select value={sube} onChange={(e) => push({ sube: e.target.value }, true)}>
                <option value="">Tüm şubeler</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Durum</Label>
              <Select value={durum} onChange={(e) => push({ durum: e.target.value }, true)}>
                <option value="all">Tümü</option>
                <option value="active">Aktif</option>
                <option value="archived">{tab === "paketler" ? "Arşivli" : "Pasif"}</option>
              </Select>
            </div>
            {showTermFilter ? (
              <div>
                <Label>Dönem</Label>
                <Select value={donem} onChange={(e) => push({ donem: e.target.value }, true)}>
                  <option value="all">Tümü</option>
                  <option value="genel">Genel</option>
                  <option value="guz">Güz</option>
                  <option value="yaz">Yaz</option>
                </Select>
              </div>
            ) : null}
          </form>
          {(q || sube || durum !== "all" || donem !== "all") && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                push({ q: null, sube: null, durum: null, donem: null }, true);
              }}
              className="mt-2 text-xs font-medium text-[var(--color-primary)] hover:underline"
            >
              Filtreleri temizle
            </button>
          )}
        </Card>
      ) : null}

      {children}

      {tab !== "rapor" && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-[var(--color-text-muted)]">
            {totalCount === 0 ? "Kayıt bulunamadı." : `${totalCount} kayıttan ${from}–${to} arası gösteriliyor.`}
          </p>
          {totalPages > 1 && (
            <nav className="flex flex-wrap items-center gap-1" aria-label="Sayfalama">
              <PageLink
                pathname={pathname}
                searchParams={searchParams}
                page={page - 1}
                disabled={page <= 1}
                label="‹ Önceki"
              />
              {pageNumbers.map((p, i) =>
                p === "…" ? (
                  <span key={`gap-${i}`} className="px-1 text-xs text-[var(--color-text-muted)]">
                    …
                  </span>
                ) : (
                  <PageLink key={p} pathname={pathname} searchParams={searchParams} page={p} current={p === page} label={String(p)} />
                )
              )}
              <PageLink
                pathname={pathname}
                searchParams={searchParams}
                page={page + 1}
                disabled={page >= totalPages}
                label="Sonraki ›"
              />
            </nav>
          )}
        </div>
      )}
    </div>
  );
}

function PageLink({
  pathname,
  searchParams,
  page,
  label,
  disabled,
  current,
}: {
  pathname: string;
  searchParams: URLSearchParams;
  page: number;
  label: string;
  disabled?: boolean;
  current?: boolean;
}) {
  const next = new URLSearchParams(searchParams.toString());
  next.set("sayfa", String(page));
  const cls = current
    ? "rounded-md bg-[var(--color-primary)] px-2.5 py-1 text-xs font-semibold text-white"
    : "rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-medium text-[var(--color-text)] hover:border-[var(--color-primary)]";
  if (disabled) {
    return (
      <span className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-muted)] opacity-50">
        {label}
      </span>
    );
  }
  return (
    <Link href={`${pathname}?${next.toString()}`} className={cls} aria-current={current ? "page" : undefined}>
      {label}
    </Link>
  );
}

/** Sayfa numaraları: ilk + son + current±2, aralar "…". */
function pageNumbersWindow(page: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const keep = new Set([1, 2, totalPages - 1, totalPages, page - 1, page, page + 1]);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (let p = 1; p <= totalPages; p++) {
    if (!keep.has(p)) continue;
    if (p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}
