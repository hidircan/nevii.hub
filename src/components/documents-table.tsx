"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown, FileText, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { documentStatusLabel, documentStatusHint } from "@/lib/document-status";

export type DocumentRow = {
  id: string;
  reference: string;
  kindLabel: string;
  personName: string;
  /** Öğrenciyle ilişkiliyse veli adı — arama alanına dahil edilir (kural A: "veli adı" ile arama). */
  parentName?: string;
  branchName?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  /**
   * TEK KANONİK SÖZLEŞME GÖRÜNTÜLEYİCİ (2026-09-20). Belge bir öğrenci kayıt
   * sözleşmesinin dondurulmuş nüshasıysa, bağlı `StudentContract` kimliği.
   * Dolu olduğunda "Görüntüle", öğrenci ekranıyla AYNI güncel görünümü
   * (`/sozlesme-yazdir/[contractId]`) açar — Evraklar artık eski/jenerik
   * evrak şablonunu göstermez.
   */
  contractId?: string;
};

export type DocumentPersonOption = { id: string; name: string };

type SortKey = "reference" | "kindLabel" | "personName" | "status" | "createdAt";
type SortDir = "asc" | "desc";

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "tr"));
}

/** Türkçe sıralama — "İ/ı/ş/ğ" sırası `localeCompare(..., "tr")` ile doğru çalışır. */
function compareRows(a: DocumentRow, b: DocumentRow, key: SortKey): number {
  if (key === "createdAt") return a.createdAt.localeCompare(b.createdAt);
  if (key === "status") return documentStatusLabel(a.status).localeCompare(documentStatusLabel(b.status), "tr");
  return String(a[key] ?? "").localeCompare(String(b[key] ?? ""), "tr");
}

export function DocumentsTable({
  rows,
  students = [],
  activeStudentId,
}: {
  rows: DocumentRow[];
  /** Öğrenciye göre filtre — sunucu tarafı `?studentId=` ile daraltır (büyük arşivde tüm satırları çekmeden). */
  students?: DocumentPersonOption[];
  activeStudentId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [archiving, setArchiving] = useState<string | null>(null);

  const search = searchParams.get("q") ?? "";
  const kindFilter = searchParams.getAll("kind");
  const statusFilter = searchParams.getAll("status");
  const branchFilter = searchParams.getAll("branch");
  const fromDate = searchParams.get("from") ?? "";
  const toDate = searchParams.get("to") ?? "";
  const sortKey = (searchParams.get("sort") as SortKey | null) ?? "createdAt";
  const sortDir = (searchParams.get("dir") as SortDir | null) ?? "desc";

  function updateParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function setDateParam(key: "from" | "to", value: string) {
    updateParams((params) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
  }

  function setSearch(value: string) {
    updateParams((params) => {
      if (value) params.set("q", value);
      else params.delete("q");
    });
  }

  function setStudent(value: string) {
    updateParams((params) => {
      if (value) params.set("studentId", value);
      else params.delete("studentId");
    });
  }

  function toggleMulti(key: string, value: string, current: string[]) {
    updateParams((params) => {
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      params.delete(key);
      next.forEach((v) => params.append(key, v));
    });
  }

  function toggleSort(key: SortKey) {
    updateParams((params) => {
      const nextDir: SortDir = sortKey === key && sortDir === "asc" ? "desc" : "asc";
      params.set("sort", key);
      params.set("dir", nextDir);
    });
  }

  function clearAll() {
    router.replace(pathname, { scroll: false });
  }

  async function onArchive(id: string) {
    setArchiving(id);
    try {
      await fetch(`/api/v1/documents/${id}/archive`, { method: "POST" });
      router.refresh();
    } finally {
      setArchiving(null);
    }
  }

  const kindOptions = useMemo(() => uniqueSorted(rows.map((r) => r.kindLabel)), [rows]);
  const statusOptions = useMemo(() => uniqueSorted(rows.map((r) => r.status)), [rows]);
  const branchOptions = useMemo(() => uniqueSorted(rows.map((r) => r.branchName ?? "")), [rows]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const result = rows.filter((r) => {
      if (
        query &&
        !r.reference.toLowerCase().includes(query) &&
        !r.personName.toLowerCase().includes(query) &&
        !(r.parentName ?? "").toLowerCase().includes(query)
      )
        return false;
      if (kindFilter.length && !kindFilter.includes(r.kindLabel)) return false;
      if (statusFilter.length && !statusFilter.includes(r.status)) return false;
      if (branchFilter.length && !(r.branchName && branchFilter.includes(r.branchName))) return false;
      if (fromDate && r.createdAt.slice(0, 10) < fromDate) return false;
      if (toDate && r.createdAt.slice(0, 10) > toDate) return false;
      return true;
    });
    const sign = sortDir === "asc" ? 1 : -1;
    return result.sort((a, b) => sign * compareRows(a, b, sortKey));
  }, [rows, search, kindFilter, statusFilter, branchFilter, fromDate, toDate, sortKey, sortDir]);

  const anyFilterActive =
    Boolean(search) ||
    kindFilter.length > 0 ||
    statusFilter.length > 0 ||
    branchFilter.length > 0 ||
    Boolean(fromDate) ||
    Boolean(toDate) ||
    Boolean(activeStudentId);

  return (
    <>
      <Card className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Referans, öğrenci veya veli adı ara…"
            aria-label="Referans, öğrenci veya veli adı ara"
            className="w-full max-w-xs rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]/30 sm:w-auto"
          />
          {students.length > 0 ? (
            <select
              value={activeStudentId ?? ""}
              onChange={(e) => setStudent(e.target.value)}
              aria-label="Öğrenciye göre filtrele"
              className="rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
            >
              <option value="">Tüm öğrenciler</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : null}
          {anyFilterActive ? (
            <button
              type="button"
              onClick={clearAll}
              className="ml-auto rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
            >
              Filtreleri Temizle
            </button>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <FilterChips
            label="Evrak türü"
            options={kindOptions}
            selected={kindFilter}
            onToggle={(v) => toggleMulti("kind", v, kindFilter)}
          />
          <FilterChips
            label="Durum"
            options={statusOptions}
            selected={statusFilter}
            labelOf={documentStatusLabel}
            onToggle={(v) => toggleMulti("status", v, statusFilter)}
          />
          <FilterChips
            label="Şube"
            options={branchOptions}
            selected={branchFilter}
            onToggle={(v) => toggleMulti("branch", v, branchFilter)}
          />
        </div>
        <div className="grid max-w-sm grid-cols-2 gap-3">
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              Başlangıç tarihi
            </p>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setDateParam("from", e.target.value)}
              aria-label="Başlangıç tarihi"
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-text)]"
            />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              Bitiş tarihi
            </p>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setDateParam("to", e.target.value)}
              aria-label="Bitiş tarihi"
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-text)]"
            />
          </div>
        </div>
        <p className="text-xs font-medium text-[var(--color-text-muted)]">
          Toplam {rows.length} evrak{anyFilterActive ? ` · Filtre sonucu ${filtered.length}` : ""}
        </p>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
            <tr>
              <SortHeader label="Referans No" k="reference" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Evrak Türü" k="kindLabel" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="İlgili Kişi" k="personName" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <th className="px-4 py-3">Şube</th>
              <SortHeader label="Durum" k="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Oluşturulma" k="createdAt" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <th className="px-4 py-3">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
                  Bu filtreye uyan evrak bulunamadı. Filtreleri temizleyip tekrar deneyin.
                </td>
              </tr>
            ) : (
              filtered.map((d) => {
                // Sözleşmeler kanonik görüntüleyiciye gider; diğer evraklar kendi detayına.
                const viewHref = d.contractId ? `/sozlesme-yazdir/${d.contractId}` : `/panel/evraklar/${d.id}`;
                return (
                  <tr key={d.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/panel/evraklar/${d.id}`}
                        className="font-mono text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
                      >
                        {d.reference}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text)]">
                      <span className="inline-flex items-center gap-1.5">
                        {d.contractId ? <FileText className="h-3.5 w-3.5 text-[var(--color-primary)]" /> : null}
                        {d.kindLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)]">{d.personName}</td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)]">{d.branchName ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        title={documentStatusHint(d.status)}
                        className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={
                          d.status === "cancelled" || d.status === "expired"
                            ? { background: "var(--color-surface-muted)", color: "var(--color-text-muted)" }
                            : d.status === "signed" || d.status === "uploaded"
                              ? { background: "var(--color-success-soft)", color: "var(--color-success)" }
                              : { background: "var(--color-info-soft)", color: "var(--color-info)" }
                        }
                      >
                        {documentStatusLabel(d.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)]">{formatDate(d.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={viewHref}
                          className="text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
                        >
                          {d.contractId ? "Sözleşmeyi görüntüle" : "Görüntüle"}
                        </Link>
                        {d.contractId ? (
                          <Link
                            href={`/panel/evraklar/${d.id}`}
                            className="text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                          >
                            Arşiv nüshası
                          </Link>
                        ) : null}
                        {d.status !== "cancelled" ? (
                          <button
                            type="button"
                            disabled={archiving === d.id}
                            onClick={() => void onArchive(d.id)}
                            className="text-xs font-medium text-[var(--color-danger)] hover:opacity-80 disabled:opacity-50"
                          >
                            {archiving === d.id ? "…" : "Arşivle"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Card>

      <p className="mt-3 flex items-start gap-2 text-xs text-[var(--color-text-muted)]">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "var(--color-success)" }} />
        <span>
          Evraklar kalıcıdır. “Arşivle” belgeyi <strong>silmez</strong> — yalnızca <em>İptal edildi</em> olarak
          işaretler; referans numarası, içerik ve yüklenen imzalı nüshalar saklanmaya devam eder.
        </span>
      </p>
    </>
  );
}

function SortHeader({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  const Icon = !active ? ChevronsUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className="px-4 py-3">
      <button
        type="button"
        onClick={() => onSort(k)}
        aria-label={`${label} sütununa göre sırala`}
        className={`inline-flex items-center gap-1 uppercase tracking-wide transition hover:text-[var(--color-text)] ${
          active ? "text-[var(--color-text)]" : ""
        }`}
      >
        {label}
        <Icon className="h-3 w-3" />
      </button>
    </th>
  );
}

function FilterChips({
  label,
  options,
  selected,
  onToggle,
  labelOf,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  /** Ham değeri (ör. statü kodu) ekranda gösterilecek Türkçe karşılığına çevirir. */
  labelOf?: (value: string) => string;
}) {
  if (options.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(opt)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                active
                  ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-text)]"
                  : "border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]"
              }`}
            >
              {labelOf ? labelOf(opt) : opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
