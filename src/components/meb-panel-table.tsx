"use client";

/**
 * MEB Paneli öğrenci tablosu — Öğrenciler ekranındaki (`students-table.tsx`)
 * tablo UI/UX'inin aynısı: aynı başlık/satır stilleri, ad hücresi + Pasif
 * işareti, Badge rozetler, font-mono öğrenci no, "Sütunlar" ile aç/kapa +
 * sürükle-sırala (kişiye özel localStorage). Satırlar sunucudan sayfalanmış
 * gelir (istemciye yalnız sayfa gider); filtre/sayfa geçişleri URL ile
 * sunucu turu yapar.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge, Card, Input, Label, Select } from "@/components/ui";
import { MebRowEditor, type MebEditorBranch } from "@/components/meb-row-editor";
import {
  DEFAULT_MEB_COLUMNS,
  MEB_COLUMN_LABELS,
  MebColumnViewManager,
  loadLastUsedMebColumns,
  type MebColumnKey,
} from "@/components/meb-column-view-manager";
import type { MebPanelRow } from "@/lib/services/tools";
import { MEB_EXAM_STATUS_LABELS } from "@/lib/meb";

export interface MebFilterOptions {
  branches: MebEditorBranch[];
  teachers: { id: string; name: string }[];
  instruments: string[];
}

export interface MebPageQuery {
  q?: string;
  branchId?: string;
  teacherId?: string;
  instrument?: string;
  active?: "active" | "passive" | "all";
  examStatus?: "unknown" | "not_attended" | "attended";
  sort?: "name" | "level" | "mebLevelStartDate" | "mebLevelEndDate" | "mebExamDate";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

const BASE = "/panel/meb/ogrenciler";

function withQuery(base: MebPageQuery, patch: Partial<MebPageQuery>): string {
  const params = new URLSearchParams();
  const put = (key: string, value: string | number | undefined) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  };
  put("q", patch.q !== undefined ? patch.q : base.q);
  put("sube", patch.branchId !== undefined ? patch.branchId : base.branchId);
  put("ogretmen", patch.teacherId !== undefined ? patch.teacherId : base.teacherId);
  put("enstruman", patch.instrument !== undefined ? patch.instrument : base.instrument);
  put("durum", patch.active !== undefined ? patch.active : base.active);
  put("sinav", patch.examStatus !== undefined ? patch.examStatus : base.examStatus);
  put("siralama", patch.sort !== undefined ? patch.sort : base.sort);
  put("yon", patch.sortDir !== undefined ? patch.sortDir : base.sortDir);
  put("sayfa", patch.page !== undefined ? patch.page : base.page);
  put("sayfaBoyutu", patch.pageSize !== undefined ? patch.pageSize : base.pageSize);
  const qs = params.toString();
  return qs ? `${BASE}?${qs}` : BASE;
}

function formatDay(value?: string): string {
  if (!value) return "—";
  const [y, m, day] = value.slice(0, 10).split("-");
  if (!y || !m || !day) return "—";
  return `${day}.${m}.${y}`;
}

const PAGE_SIZES = [20, 50, 100] as const;

export function MebPanelTable({
  rows,
  total,
  page,
  pageSize,
  query,
  options,
  tenantId,
  userId,
}: {
  rows: MebPanelRow[];
  total: number;
  page: number;
  pageSize: number;
  query: MebPageQuery;
  options: MebFilterOptions;
  tenantId: string;
  userId: string;
}) {
  const [columns, setColumns] = useState<MebColumnKey[]>(DEFAULT_MEB_COLUMNS);

  useEffect(() => {
    const lastUsed = loadLastUsedMebColumns(tenantId, userId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage senkron, yalnız mount'ta bir kez
    if (lastUsed) setColumns(lastUsed);
  }, [tenantId, userId]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);

  return (
    <div>
      <Card>
        <form method="get" action={BASE} className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {query.pageSize && query.pageSize !== 20 ? (
            <input type="hidden" name="sayfaBoyutu" value={query.pageSize} />
          ) : null}
          <div>
            <Label>Arama (ad / numara)</Label>
            <Input name="q" defaultValue={query.q ?? ""} placeholder="Örn. Deniz veya S00012" />
          </div>
          <div>
            <Label>Şube</Label>
            <Select name="sube" defaultValue={query.branchId ?? ""}>
              <option value="">Tümü</option>
              {options.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Öğretmen</Label>
            <Select name="ogretmen" defaultValue={query.teacherId ?? ""}>
              <option value="">Tümü</option>
              {options.teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Enstrüman</Label>
            <Select name="enstruman" defaultValue={query.instrument ?? ""}>
              <option value="">Tümü</option>
              {options.instruments.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Durum</Label>
            <Select name="durum" defaultValue={query.active ?? "active"}>
              <option value="active">Aktif</option>
              <option value="passive">Pasif</option>
              <option value="all">Tümü (aktif + pasif)</option>
            </Select>
          </div>
          <div>
            <Label>Sınav durumu</Label>
            <Select name="sinav" defaultValue={query.examStatus ?? ""}>
              <option value="">Tümü</option>
              <option value="unknown">{MEB_EXAM_STATUS_LABELS.unknown}</option>
              <option value="not_attended">{MEB_EXAM_STATUS_LABELS.not_attended}</option>
              <option value="attended">{MEB_EXAM_STATUS_LABELS.attended}</option>
            </Select>
          </div>
          <div>
            <Label>Sıralama</Label>
            <Select name="siralama" defaultValue={query.sort ?? "name"}>
              <option value="name">Ada göre</option>
              <option value="level">Seviyeye göre</option>
              <option value="mebLevelStartDate">Dönem başlangıcına göre</option>
              <option value="mebLevelEndDate">Dönem bitişine göre</option>
              <option value="mebExamDate">Sınav tarihine göre</option>
            </Select>
          </div>
          <div>
            <Label>Yön</Label>
            <Select name="yon" defaultValue={query.sortDir ?? "asc"}>
              <option value="asc">Artan</option>
              <option value="desc">Azalan</option>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="rounded-xl bg-[var(--color-primary)] px-3.5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
            >
              Filtrele
            </button>
            <Link
              href={BASE}
              className="rounded-xl border border-[var(--color-border)] px-3.5 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
            >
              Temizle
            </Link>
            <div className="ml-auto">
              <MebColumnViewManager tenantId={tenantId} userId={userId} columns={columns} onChange={setColumns} />
            </div>
          </div>
        </form>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
              <tr>
                <th className="px-4 py-3">Öğrenci</th>
                {columns.map((key) => (
                  <th key={key} className="px-4 py-3">
                    {MEB_COLUMN_LABELS[key]}
                  </th>
                ))}
                <th className="px-4 py-3">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={2 + columns.length} className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
                    Bu filtrede MEB öğrencisi bulunamadı.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--color-border)] align-top last:border-0">
                    <td className="p-0">
                      <Link
                        href={`/panel/ogrenciler/${r.id}/bilgiler`}
                        className="block px-4 py-3 hover:bg-[var(--color-surface-muted)] focus-visible:bg-[var(--color-surface-muted)] focus-visible:outline-none"
                      >
                        <p className="font-medium text-[var(--color-text)]">{r.name}</p>
                        {!r.active ? (
                          <span className="text-xs font-medium text-[var(--color-danger)]">Pasif</span>
                        ) : null}
                      </Link>
                    </td>
                    {columns.map((key) => (
                      <td key={key} className="px-4 py-3">
                        {key === "displayId" ? (
                          <span className="font-mono text-xs text-[var(--color-text)]">{r.displayId ?? "—"}</span>
                        ) : key === "branch" ? (
                          <span className="text-[var(--color-text-muted)]">{r.branchName ?? "—"}</span>
                        ) : key === "instruments" ? (
                          r.instruments.length > 0 ? (
                            r.instruments.map((i) => <Badge key={i}>{i}</Badge>)
                          ) : (
                            <span className="text-[var(--color-text-muted)]">—</span>
                          )
                        ) : key === "teacher" ? (
                          <span className="text-[var(--color-text)]">{r.teacherName ?? "—"}</span>
                        ) : key === "type" ? (
                          r.studentTypes.length > 0 ? (
                            <span className="flex flex-wrap gap-1">
                              {r.studentTypes.map((t) => (
                                <Badge key={t}>{t}</Badge>
                              ))}
                            </span>
                          ) : (
                            <span className="text-xs text-[var(--color-text-muted)]">Belirtilmemiş</span>
                          )
                        ) : key === "mebLevelStartDate" ? (
                          <span className="text-[var(--color-text-muted)]">{formatDay(r.mebLevelStartDate)}</span>
                        ) : key === "mebLevelEndDate" ? (
                          <span className="text-[var(--color-text-muted)]">{formatDay(r.mebLevelEndDate)}</span>
                        ) : key === "level" ? (
                          r.level ? (
                            <span className="text-[var(--color-text)]">{r.level}. Seviye</span>
                          ) : (
                            <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Eksik</span>
                          )
                        ) : key === "mebExamDate" ? (
                          <span className="text-[var(--color-text-muted)]">{formatDay(r.mebExamDate)}</span>
                        ) : key === "examStatus" ? (
                          <span
                            className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold"
                            style={
                              r.examStatus === "attended"
                                ? { background: "var(--color-success-soft)", color: "var(--color-success)" }
                                : r.examStatus === "not_attended"
                                  ? { background: "var(--color-surface-muted)", color: "var(--color-text-muted)" }
                                  : {
                                      background: "var(--color-primary-soft)",
                                      color: "var(--color-primary-soft-text)",
                                    }
                            }
                          >
                            {r.examStatusLabel}
                          </span>
                        ) : null}
                      </td>
                    ))}
                    <td className="px-4 py-3">
                      <MebRowEditor row={r} branches={options.branches} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total === 0 ? null : (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] px-4 py-3 text-sm">
            <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
              <span>Sayfa başına</span>
              {PAGE_SIZES.map((size) =>
                size === pageSize ? (
                  <span key={size} className="font-semibold text-[var(--color-text)]">
                    {size}
                  </span>
                ) : (
                  <Link
                    key={size}
                    href={withQuery(query, { pageSize: size, page: 1 })}
                    className="hover:text-[var(--color-text)] hover:underline"
                  >
                    {size}
                  </Link>
                )
              )}
              <span>kayıt · Toplam {total}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {safePage > 1 ? (
                <Link
                  href={withQuery(query, { page: safePage - 1 })}
                  aria-label="Önceki sayfa"
                  className="inline-flex items-center justify-center rounded-md border border-[var(--color-border-strong)] p-1.5 text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Link>
              ) : (
                <span
                  aria-hidden
                  className="inline-flex items-center justify-center rounded-md border border-[var(--color-border-strong)] p-1.5 opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </span>
              )}
              <span className="px-1 text-[var(--color-text-muted)]">
                Sayfa {safePage} / {pageCount}
              </span>
              {safePage < pageCount ? (
                <Link
                  href={withQuery(query, { page: safePage + 1 })}
                  aria-label="Sonraki sayfa"
                  className="inline-flex items-center justify-center rounded-md border border-[var(--color-border-strong)] p-1.5 text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
                >
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : (
                <span
                  aria-hidden
                  className="inline-flex items-center justify-center rounded-md border border-[var(--color-border-strong)] p-1.5 opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </span>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
