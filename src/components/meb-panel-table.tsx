/**
 * MEB Paneli tablosu — sunucuda sayfalanmış satırlar + GET filtre formu.
 *
 * İstemciye YALNIZCA o sayfanın satırları gider (tüm öğrencileri çekip
 * istemcide sayfalama YOK). Filtre/sıralama/sayfa değişiklikleri URL
 * parametresiyle sunucu round-trip yapar; liste TAZE veriyle render edilir.
 */

import Link from "next/link";
import { Card, Input, Label, PageHeader, Select } from "@/components/ui";
import { MebRowEditor, type MebEditorBranch } from "@/components/meb-row-editor";
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
}

function withQuery(base: MebPageQuery, patch: Partial<MebPageQuery>): string {
  const params = new URLSearchParams();
  const merged: Record<string, string> = {};
  const put = (key: string, value: string | number | undefined) => {
    if (value !== undefined && value !== "") merged[key] = String(value);
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
  for (const [k, v] of Object.entries(merged)) params.set(k, v);
  const qs = params.toString();
  return qs ? `/panel/meb?${qs}` : "/panel/meb";
}

function formatDay(value?: string): string {
  if (!value) return "—";
  const d = value.slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return "—";
  return `${day}.${m}.${y}`;
}

export function MebPanelTable({
  rows,
  total,
  page,
  pageSize,
  query,
  options,
}: {
  rows: MebPanelRow[];
  total: number;
  page: number;
  pageSize: number;
  query: MebPageQuery;
  options: MebFilterOptions;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(total, safePage * pageSize);

  return (
    <div>
      <PageHeader
        title="MEB Paneli"
        description="Yalnız MEB öğrencileri — seviye, dönem tarihleri ve sınav bilgileri. İleride genişletilebilir yapıda, bugün tablo + revizyon."
      />

      <Card>
        <form method="get" action="/panel/meb" className="grid grid-cols-2 gap-2 md:grid-cols-4">
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
              href="/panel/meb"
              className="rounded-xl border border-[var(--color-border)] px-3.5 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
            >
              Temizle
            </Link>
          </div>
        </form>
      </Card>

      <p className="mt-3 text-sm text-[var(--color-text-muted)]" role="status">
        Toplam {total} sonuç — {from}–{to} arası gösteriliyor (sayfa {safePage}/{pageCount}).
      </p>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                <th className="px-2 py-2 font-medium">Öğrenci (ad / numara)</th>
                <th className="px-2 py-2 font-medium">Şube</th>
                <th className="px-2 py-2 font-medium">Enstrüman</th>
                <th className="px-2 py-2 font-medium">Öğretmen</th>
                <th className="px-2 py-2 font-medium">MEB seviye başlangıç</th>
                <th className="px-2 py-2 font-medium">MEB seviye bitiş</th>
                <th className="px-2 py-2 font-medium">MEB seviyesi</th>
                <th className="px-2 py-2 font-medium">MEB sınav tarihi</th>
                <th className="px-2 py-2 font-medium">Sınava girdi mi?</th>
                <th className="px-2 py-2 font-medium">Durum</th>
                <th className="px-2 py-2 font-medium">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-2 py-2">
                    <Link
                      href={`/panel/ogrenciler/${r.id}/bilgiler`}
                      className="font-medium text-[var(--color-primary)] hover:underline"
                    >
                      {r.name}
                    </Link>
                    {r.displayId ? <span className="ml-2 text-xs text-[var(--color-text-muted)]">{r.displayId}</span> : null}
                  </td>
                  <td className="px-2 py-2">{r.branchName ?? "—"}</td>
                  <td className="px-2 py-2">{r.instruments.join(", ") || "—"}</td>
                  <td className="px-2 py-2">{r.teacherName ?? "—"}</td>
                  <td className="px-2 py-2">{formatDay(r.mebLevelStartDate)}</td>
                  <td className="px-2 py-2">{formatDay(r.mebLevelEndDate)}</td>
                  <td className="px-2 py-2">{r.level ? `${r.level}. Seviye` : <span className="text-amber-700">Eksik</span>}</td>
                  <td className="px-2 py-2">{formatDay(r.mebExamDate)}</td>
                  <td className="px-2 py-2">{r.examStatusLabel}</td>
                  <td className="px-2 py-2">{r.active ? "Aktif" : "Pasif"}</td>
                  <td className="px-2 py-2">
                    <MebRowEditor row={r} branches={options.branches} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-2 py-6 text-center text-[var(--color-text-muted)]">
                    Bu filtrede MEB öğrencisi bulunamadı.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between">
          {safePage > 1 ? (
            <Link
              href={withQuery(query, { page: safePage - 1 })}
              className="rounded-xl border border-[var(--color-border)] px-3.5 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
            >
              ← Önceki
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-[var(--color-text-muted)]">
            Sayfa {safePage}/{pageCount}
          </span>
          {safePage < pageCount ? (
            <Link
              href={withQuery(query, { page: safePage + 1 })}
              className="rounded-xl border border-[var(--color-border)] px-3.5 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
            >
              Sonraki →
            </Link>
          ) : (
            <span />
          )}
        </div>
      </Card>
    </div>
  );
}
