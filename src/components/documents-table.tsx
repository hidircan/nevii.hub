"use client";

import { cloneElement, useId, useMemo, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { withReturnTo } from "@/lib/safe-return-to";
import { useCurrentPath } from "@/lib/use-current-path";
import { useListReturnState } from "@/lib/use-list-return-state";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown, FileText, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui";
import { DocumentArchiveButton } from "@/components/document-archive-button";
import { PaginationControls, usePagination } from "@/components/pagination-controls";
import { filterAndSortDocuments, type DocumentSortKey, type StudentStateFilter } from "@/lib/documents-filter";
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
  /** Öğrenci evrakıysa öğrencinin aktifliği (pasif öğrenci evrakları da listelenir). */
  studentActive?: boolean;
};

export type DocumentPersonOption = { id: string; name: string; kind?: "student" | "teacher"; inactive?: boolean };

type SortKey = DocumentSortKey;
type SortDir = "asc" | "desc";

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "tr"));
}

const FIELD =
  "h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]/30";

export function DocumentsTable({
  rows,
  people = [],
  activeStudentId,
  activeTeacherId,
}: {
  rows: DocumentRow[];
  /** İlgili kişi filtresi — sunucu tarafı `?studentId=` / `?teacherId=` ile daraltır. Aktif + pasif öğrenci ve öğretmen. */
  people?: DocumentPersonOption[];
  activeStudentId?: string;
  activeTeacherId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Arama yalnız yerel state: her tuşta URL değişince sunucu tüm evrakları yeniden okuyordu.
  const [search, setSearchState] = useState("");

  const kindFilter = searchParams.getAll("kind");
  const statusFilter = searchParams.getAll("status");
  const branchFilter = searchParams.getAll("branch");
  const fromDate = searchParams.get("from") ?? "";
  const toDate = searchParams.get("to") ?? "";
  const rawState = searchParams.get("ogrenci");
  const studentState: StudentStateFilter = rawState === "active" || rawState === "inactive" ? rawState : "all";
  const sortKey = (searchParams.get("sort") as SortKey | null) ?? "createdAt";
  const sortDir = (searchParams.get("dir") as SortDir | null) ?? "desc";

  const kindOptions = useMemo(() => uniqueSorted(rows.map((r) => r.kindLabel)), [rows]);
  const statusOptions = useMemo(() => uniqueSorted(rows.map((r) => r.status)), [rows]);
  const branchOptions = useMemo(() => uniqueSorted(rows.map((r) => r.branchName ?? "")), [rows]);

  const filtered = filterAndSortDocuments(rows, {
    query: search,
    kinds: kindFilter,
    statuses: statusFilter,
    branches: branchFilter,
    from: fromDate,
    to: toDate,
    studentState,
    sortKey,
    sortDir,
  });
  const { pageItems, page, setPage, pageSize, setPageSize, totalPages, totalCount } = usePagination(filtered, 20, {
    urlParam: "per",
  });

  const currentPath = useCurrentPath();
  const rememberListState = useListReturnState("evraklar", { search, page }, (saved) => {
    setSearchState(saved.search);
    setPage(saved.page);
  });

  function updateParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    setPage(1);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function setSingle(key: string, value: string) {
    updateParams((params) => {
      params.delete(key);
      if (value) params.set(key, value);
    });
  }

  function setPerson(value: string) {
    updateParams((params) => {
      params.delete("studentId");
      params.delete("teacherId");
      const [kind, id] = value.split(":");
      if (kind === "s" && id) params.set("studentId", id);
      if (kind === "t" && id) params.set("teacherId", id);
    });
  }

  function setSort(value: string) {
    const [key, dir] = value.split(":");
    updateParams((params) => {
      params.set("sort", key!);
      params.set("dir", dir!);
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
    setSearchState("");
    setPage(1);
    router.replace(pathname, { scroll: false });
  }

  // 11. tur iş #10 — arşivleme DocumentArchiveButton içindedir (onay + hata
  // yüzeyi); burada ham fetch kalmadı.

  const personValue = activeStudentId ? `s:${activeStudentId}` : activeTeacherId ? `t:${activeTeacherId}` : "";
  const activeStudents = people.filter((p) => p.kind !== "teacher" && !p.inactive);
  const inactiveStudents = people.filter((p) => p.kind !== "teacher" && p.inactive);
  const teachers = people.filter((p) => p.kind === "teacher");

  const anyFilterActive =
    Boolean(search) ||
    kindFilter.length > 0 ||
    statusFilter.length > 0 ||
    branchFilter.length > 0 ||
    Boolean(fromDate) ||
    Boolean(toDate) ||
    studentState !== "all" ||
    Boolean(personValue);

  return (
    <>
      {/* Masaüstü: 6 kolonluk hizalı ızgara (2 satır); sm: 2 kolon; mobil: alt alta. Her alanın etiketi üstte. */}
      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-6">
          <FilterField label="Ara" className="sm:col-span-2">
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearchState(e.target.value);
                setPage(1);
              }}
              placeholder="Referans, öğrenci veya veli adı…"
              className={FIELD}
            />
          </FilterField>
          <FilterField label="İlgili kişi" className="sm:col-span-2">
            <select value={personValue} onChange={(e) => setPerson(e.target.value)} className={FIELD}>
              <option value="">Tüm kişiler</option>
              {activeStudents.length ? (
                <optgroup label="Öğrenciler (aktif)">
                  {activeStudents.map((p) => (
                    <option key={p.id} value={`s:${p.id}`}>{p.name}</option>
                  ))}
                </optgroup>
              ) : null}
              {inactiveStudents.length ? (
                <optgroup label="Öğrenciler (pasif)">
                  {inactiveStudents.map((p) => (
                    <option key={p.id} value={`s:${p.id}`}>{p.name} (pasif)</option>
                  ))}
                </optgroup>
              ) : null}
              {teachers.length ? (
                <optgroup label="Öğretmenler">
                  {teachers.map((p) => (
                    <option key={p.id} value={`t:${p.id}`}>{p.name}</option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </FilterField>
          <FilterField label="Öğrenci durumu">
            <select value={studentState} onChange={(e) => setSingle("ogrenci", e.target.value === "all" ? "" : e.target.value)} className={FIELD}>
              <option value="all">Tümü</option>
              <option value="active">Yalnız aktif öğrenci</option>
              <option value="inactive">Yalnız pasif öğrenci</option>
            </select>
          </FilterField>
          <FilterField label="Evrak türü">
            <select value={kindFilter[0] ?? ""} onChange={(e) => setSingle("kind", e.target.value)} className={FIELD}>
              <option value="">Tüm türler</option>
              {kindOptions.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Durum">
            <select value={statusFilter[0] ?? ""} onChange={(e) => setSingle("status", e.target.value)} className={FIELD}>
              <option value="">Tüm durumlar</option>
              {statusOptions.map((k) => (
                <option key={k} value={k}>{documentStatusLabel(k)}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Şube">
            <select value={branchFilter[0] ?? ""} onChange={(e) => setSingle("branch", e.target.value)} className={FIELD}>
              <option value="">Tüm şubeler</option>
              {branchOptions.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Başlangıç tarihi">
            <input type="date" value={fromDate} onChange={(e) => setSingle("from", e.target.value)} className={FIELD} />
          </FilterField>
          <FilterField label="Bitiş tarihi">
            <input type="date" value={toDate} onChange={(e) => setSingle("to", e.target.value)} className={FIELD} />
          </FilterField>
          <FilterField label="Sıralama">
            <select value={`${sortKey}:${sortDir}`} onChange={(e) => setSort(e.target.value)} className={FIELD}>
              <option value="createdAt:desc">En yeni önce</option>
              <option value="createdAt:asc">En eski önce</option>
              <option value="personName:asc">Kişi (A→Z)</option>
              <option value="kindLabel:asc">Evrak türü (A→Z)</option>
              <option value="status:asc">Durum (A→Z)</option>
              <option value="reference:asc">Referans (A→Z)</option>
            </select>
          </FilterField>
          <div className="flex items-end">
            <button
              type="button"
              onClick={clearAll}
              disabled={!anyFilterActive}
              className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-xs font-medium text-[var(--color-text-muted)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] disabled:opacity-40"
            >
              Filtreleri temizle
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs font-medium text-[var(--color-text-muted)]">
          Toplam {rows.length} evrak{anyFilterActive ? ` · Filtre sonucu ${filtered.length}` : ""} · Varsayılan kapsam: aktif ve
          pasif öğrencilerin tüm evrakları
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
              pageItems.map((d) => {
                // Sözleşmeler kanonik görüntüleyiciye gider; diğer evraklar kendi detayına.
                // 9. tur: alt ekran açıldığı Evraklar görünümüne (filtreler URL'de) geri döner.
                const viewHref = withReturnTo(
                  d.contractId ? `/sozlesme-yazdir/${d.contractId}` : `/panel/evraklar/${d.id}`,
                  currentPath
                );
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
                          onClick={rememberListState}
                          className="text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
                        >
                          {d.contractId ? "Sözleşmeyi görüntüle" : "Görüntüle"}
                        </Link>
                        {d.contractId ? (
                          <Link
                            href={withReturnTo(`/panel/evraklar/${d.id}`, currentPath)}
                            onClick={rememberListState}
                            className="text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                          >
                            Arşiv nüshası
                          </Link>
                        ) : null}
                        {d.status !== "cancelled" ? (
                          <DocumentArchiveButton documentId={d.id} variant="link" />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <PaginationControls
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
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

/** Etiket + alan; erişilebilir ad yalnız etiket (seçenek metinleri ada karışmaz). */
function FilterField({ label, className, children }: { label: string; className?: string; children: React.ReactElement<{ "aria-labelledby"?: string }> }) {
  const id = useId();
  return (
    <div className={`min-w-0 ${className ?? ""}`}>
      <span id={id} className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </span>
      {cloneElement(children, { "aria-labelledby": id })}
    </div>
  );
}
