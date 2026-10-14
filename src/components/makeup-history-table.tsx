"use client";

import { useMemo, useState } from "react";
import { Badge, Card } from "@/components/ui";
import { PaginationControls, usePagination } from "@/components/pagination-controls";
import { statusLabel } from "@/lib/utils";
import { filterMakeupHistory, type MakeupHistoryRow } from "@/lib/makeup-history-filter";
import { MakeupLifecycleActions } from "@/components/makeup-lifecycle-actions";

export type { MakeupHistoryRow };

const FIELD = "mt-1 block rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm text-[var(--color-text)]";

type PersonOption = { id: string; name: string; branchId: string; branchIds?: string[]; active?: boolean; deletedAt?: string };

/** Sonuçlanan telafi talepleri — filtre, sayfalama ve işlemi yapan kişi. */
export function MakeupHistoryTable({
  rows,
  canManage = false,
  teachers = [],
  rooms = [],
}: {
  rows: MakeupHistoryRow[];
  canManage?: boolean;
  teachers?: PersonOption[];
  rooms?: PersonOption[];
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [actor, setActor] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const actors = useMemo(() => Array.from(new Set(rows.map((r) => r.actorName))).sort((a, b) => a.localeCompare(b, "tr")), [rows]);
  const statuses = useMemo(() => Array.from(new Set(rows.map((r) => r.status))), [rows]);
  const filtered = useMemo(() => filterMakeupHistory(rows, { query, status, actor, from, to }), [rows, query, status, actor, from, to]);
  const { pageItems, page, setPage, pageSize, setPageSize, totalPages, totalCount } = usePagination(filtered, 20);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-[var(--color-text-muted)]">Ara
          <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Öğrenci, enstrüman, not" className={FIELD} />
        </label>
        <label className="text-xs text-[var(--color-text-muted)]">Durum
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={FIELD}>
            <option value="all">Tümü</option>
            {statuses.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
        </label>
        <label className="text-xs text-[var(--color-text-muted)]">İşlemi yapan
          <select value={actor} onChange={(e) => { setActor(e.target.value); setPage(1); }} className={FIELD}>
            <option value="all">Tümü</option>
            {actors.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="text-xs text-[var(--color-text-muted)]">Karar tarihi (başlangıç)
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className={FIELD} />
        </label>
        <label className="text-xs text-[var(--color-text-muted)]">Karar tarihi (bitiş)
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className={FIELD} />
        </label>
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
            <tr>
              <th className="px-3 py-2">Öğrenci</th>
              <th className="px-3 py-2">Enstrüman</th>
              <th className="px-3 py-2">Durum</th>
              <th className="px-3 py-2">Onaylı ders</th>
              <th className="px-3 py-2">İşlemi yapan</th>
              <th className="px-3 py-2">Karar notu</th>
              <th className="px-3 py-2">Karar tarihi</th>
              {canManage ? <th className="px-3 py-2">İşlem</th> : null}
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 ? (
              <tr><td colSpan={canManage ? 8 : 7} className="px-3 py-6 text-center text-[var(--color-text-muted)]">Bu filtreye uyan telafi kaydı yok.</td></tr>
            ) : pageItems.map((req) => (
              <tr key={req.id} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-3 py-2 font-medium text-[var(--color-text)]">{req.studentName}</td>
                <td className="px-3 py-2 text-[var(--color-text-muted)]">{req.instrument}</td>
                <td className="px-3 py-2"><Badge status={req.status} /></td>
                <td className="px-3 py-2 text-[var(--color-text-muted)]">{req.lessonLabel}</td>
                <td className="px-3 py-2 text-[var(--color-text)]">{req.actorName}</td>
                <td className="px-3 py-2 text-xs text-[var(--color-text-muted)]">
                  {req.decisionNote}
                  {req.sourceClosedByExpiry ? <span className="mt-1 block font-semibold text-[var(--color-text)]">İşlendi — Telafi planlama süresi doldu</span> : null}
                  {req.changeSummary ? <span className="mt-1 block">{req.changeSummary}</span> : null}
                  {req.slaBreached ? <span className="ml-1 font-semibold text-rose-600">SLA aşıldı</span> : null}
                </td>
                <td className="px-3 py-2 text-xs text-[var(--color-text-muted)]">{req.decidedAtLabel || "—"}</td>
                {canManage ? (
                  <td className="px-3 py-2">
                    <MakeupLifecycleActions row={req} teachers={teachers} rooms={rooms} />
                  </td>
                ) : null}
              </tr>
            ))}
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
    </div>
  );
}
