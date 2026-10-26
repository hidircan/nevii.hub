"use client";
import { withReturnTo } from "@/lib/safe-return-to";
import { useCurrentPath } from "@/lib/use-current-path";

import Link from "@/components/link";
import { useMemo, useState } from "react";
import { Receipt } from "lucide-react";
import { Card } from "@/components/ui";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatPaymentCollectionSummary,
  paymentMethodLabelTr,
} from "@/lib/utils";
import { paymentSourceLabel } from "@/lib/payment-source-label";
import { PaymentMarkPaidModal } from "@/components/payment-mark-paid-modal";
import { PaymentDeleteDialog } from "@/components/payment-delete-dialog";
import { PaginationControls, usePagination } from "@/components/pagination-controls";
import type { PaymentStatus } from "@/lib/types";
import type { PaymentDisplayStatus } from "@/lib/payments/status";
import { PaymentStatusBadge } from "@/components/payment-status-badge";
import { filterAndSortPayments, type PaymentSortKey } from "@/lib/payment-table-filter";

export type PaymentRow = {
  id: string;
  studentId: string;
  studentName: string;
  description: string;
  method?: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  /** Filtre için canonical statü ailesi (`canonicalPaymentStatus`) — ham, bayat DB statüsü DEĞİL. */
  status: PaymentStatus;
  /** Rozet: tek çözücüden (payments/status.ts) — ay panosu ve öğrenci detayıyla aynı. */
  displayStatus: PaymentDisplayStatus;
  /** ÖNCELİK 3 — otomatik ders bazlı tahsilatın kaynak dersi; manuel/paket ödemelerde yok. */
  lessonId?: string;
  lessonDate?: string;
  paymentNote?: string;
  paidAt?: string;
  createdAt?: string;
  source?: string;
  receivedByName?: string;
  /** 2026-10-09 — çok branşlı öğrencide satırın branşı ("Keman" / "Branş belirtilmemiş"). */
  branchLabel?: string;
};

type StatusFilter = "all" | PaymentStatus;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Tümü" },
  { value: "pending", label: "Bekliyor" },
  { value: "overdue", label: "Gecikmiş" },
  { value: "partial", label: "Kısmi ödeme" },
  { value: "paid", label: "Ödendi" },
  { value: "voided", label: "İptal edildi" },
];

/** `canDelete`: kurum sahibi/yöneticisi + tek kurum görünümü — sunucu (deletePaymentTool) ayrıca kritik şifre ister. */
export function PaymentsTable({ rows, canWrite, canDelete = false }: { rows: PaymentRow[]; canWrite: boolean; canDelete?: boolean }) {
  const currentPath = useCurrentPath();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [actionOnly, setActionOnly] = useState(false);
  const [modalPayment, setModalPayment] = useState<PaymentRow | null>(null);
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [paidFrom, setPaidFrom] = useState("");
  const [paidTo, setPaidTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [sortKey, setSortKey] = useState<PaymentSortKey>("dueDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(
    () =>
      filterAndSortPayments(rows, {
        search,
        status: statusFilter,
        actionOnly,
        dueFrom,
        dueTo,
        paidFrom,
        paidTo,
        minAmount,
        maxAmount,
        sortKey,
        sortDir,
      }),
    [rows, search, statusFilter, actionOnly, dueFrom, dueTo, paidFrom, paidTo, minAmount, maxAmount, sortKey, sortDir]
  );

  const { pageItems, page, setPage, pageSize, setPageSize, totalPages, totalCount } = usePagination(filtered, 10);

  return (
    <>
      {!canWrite ? (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          &quot;Tüm kurumlar&quot; görünümündesiniz — kayıt düzeltmek için üstteki kurum seçiciden tek
          bir kurum seçin.
        </p>
      ) : null}
      <p className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
        Bu ekran tahsilat almaz — ödemeler{" "}
        <Link href="/panel/yoklama" className="font-medium text-[var(--color-primary)] hover:underline">
          Yoklama Takvimi
        </Link>{" "}
        üzerinden tahsil edilir. Burada takip, filtreleme ve kayıt düzeltme yapılır.
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Öğrenci adına göre ara..."
          aria-label="Öğrenci adına göre ara"
          className="w-full max-w-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-muted)] outline-none ring-amber-200 focus:ring-2 sm:w-auto"
        />

        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => {
                setStatusFilter(filter.value);
                setActionOnly(false);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                !actionOnly && statusFilter === filter.value
                  ? "bg-slate-900 text-white"
                  : "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
              }`}
            >
              {filter.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setActionOnly((value) => !value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              actionOnly
                ? "bg-rose-600 text-white"
                : "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
            }`}
          >
            Aksiyon gerekenler
          </button>
        </div>

        <label className="text-xs text-[var(--color-text-muted)]">Vade
          <span className="mt-1 flex gap-1"><input type="date" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} className="rounded border border-[var(--color-border)] px-1 py-1" /><input type="date" value={dueTo} onChange={(e) => setDueTo(e.target.value)} className="rounded border border-[var(--color-border)] px-1 py-1" /></span>
        </label>
        <label className="text-xs text-[var(--color-text-muted)]">Tahsil tarihi
          <span className="mt-1 flex gap-1"><input type="date" value={paidFrom} onChange={(e) => setPaidFrom(e.target.value)} className="rounded border border-[var(--color-border)] px-1 py-1" /><input type="date" value={paidTo} onChange={(e) => setPaidTo(e.target.value)} className="rounded border border-[var(--color-border)] px-1 py-1" /></span>
        </label>
        <label className="text-xs text-[var(--color-text-muted)]">Tutar
          <span className="mt-1 flex gap-1"><input inputMode="numeric" placeholder="min" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} className="w-16 rounded border border-[var(--color-border)] px-1 py-1" /><input inputMode="numeric" placeholder="max" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} className="w-16 rounded border border-[var(--color-border)] px-1 py-1" /></span>
        </label>
        <label className="text-xs text-[var(--color-text-muted)]">Sırala
          <select value={`${sortKey}:${sortDir}`} onChange={(e) => { const [k, d] = e.target.value.split(":"); setSortKey(k as typeof sortKey); setSortDir(d as typeof sortDir); }} className="mt-1 block rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1">
            <option value="dueDate:asc">Vade (eski)</option>
            <option value="dueDate:desc">Vade (yeni)</option>
            <option value="amount:desc">Tutar (yüksek)</option>
            <option value="amount:asc">Tutar (düşük)</option>
            <option value="paidAt:desc">Tahsil (yeni)</option>
            <option value="studentName:asc">Öğrenci</option>
          </select>
        </label>
        <span className="ml-auto text-xs font-medium text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
          {filtered.length} sonuç
        </span>
      </div>

      <Card className="overflow-hidden p-0">
        {/* Mobil: tablo sayfayı yatay taşırmaz — kendi kapsayıcısında kayar (kolon gizlenmez). */}
        <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)] dark:border-slate-800 dark:bg-slate-900/60 dark:text-[var(--color-text-muted)]">
            <tr>
              <th className="px-4 py-3">Öğrenci</th>
              <th className="px-4 py-3">Açıklama</th>
              <th className="px-4 py-3">Vade</th>
              <th className="px-4 py-3">Ödemenin alındığı tarih</th>
              <th className="px-4 py-3">Ödeme türü</th>
              <th className="px-4 py-3">Tutar</th>
              <th className="px-4 py-3">Ödemeyi alan</th>
              <th className="px-4 py-3">Durum</th>
              <th className="px-4 py-3">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
                  Bu filtreye uyan ödeme bulunamadı.
                </td>
              </tr>
            ) : (
              pageItems.map((p) => {
                const sourceLabel = paymentSourceLabel(p);
                return (
                <tr key={p.id} className="border-b border-[var(--color-border)]">
                  <td className="break-words px-4 py-3 font-medium text-[var(--color-text)]">
                    <Link
                      href={`/panel/odemeler/${p.studentId}`}
                      className="hover:text-[var(--color-primary)] hover:underline"
                    >
                      {p.studentName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">
                    {p.branchLabel ? (
                      <span className="mr-1.5 inline-block rounded bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-text)]">
                        {p.branchLabel}
                      </span>
                    ) : null}
                    {p.description}
                    {p.status === "paid" && p.paidAt ? (
                      <span className="mt-0.5 block text-[11px] text-[var(--color-text-muted)]">
                        {formatPaymentCollectionSummary({
                          paidAt: p.paidAt,
                          amount: p.paidAmount || p.amount,
                          method: p.method,
                        })}
                      </span>
                    ) : null}
                    {sourceLabel ? (
                      <span className="mt-0.5 block text-[11px] text-[var(--color-text-muted)]">{sourceLabel}</span>
                    ) : null}
                    {p.lessonId ? (
                      <Link
                        href={`/panel/program?studentId=${p.studentId}&returnTo=${encodeURIComponent(
                          `/panel/odemeler/${p.studentId}`
                        )}`}
                        className="mt-0.5 block text-xs font-medium text-[var(--color-primary)] hover:underline"
                      >
                        Kaynak ders{p.lessonDate ? `: ${formatDate(p.lessonDate)}` : ""} →
                      </Link>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">{formatDate(p.dueDate)}</td>
                  <td className="px-4 py-3 text-[var(--color-text)]">
                    {p.status === "paid" && p.paidAt ? (
                      <span className="text-xs font-medium sm:text-sm">{formatDateTime(p.paidAt)}</span>
                    ) : (
                      <span className="text-[var(--color-text-muted)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text)]">
                    <span className="text-xs font-medium sm:text-sm">{paymentMethodLabelTr(p.method)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{formatMoney(p.amount)}</span>
                    {p.paidAmount > 0 && p.paidAmount < p.amount ? (
                      <span className="block text-xs text-[var(--color-text-muted)]">
                        Ödenen: {formatMoney(p.paidAmount)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">{p.receivedByName ?? "—"}</td>
                  <td className="px-4 py-3">
                    <PaymentStatusBadge status={p.displayStatus} />
                  </td>
                  <td className="px-4 py-3">
                    {p.status === "voided" ? (
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {p.source === "lesson_ops"
                          ? "Ders iptal edildiği için tahsilat iptal edildi."
                          : "İptal edildi (silindi); hiçbir borç ve tahsilat toplamında sayılmaz."}
                      </span>
                    ) : p.status !== "paid" ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {canDelete ? <PaymentDeleteDialog paymentId={p.id} /> : (
                          <span className="text-xs text-[var(--color-text-muted)]">—</span>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={withReturnTo(`/makbuz/${p.id}`, currentPath)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
                        >
                          <Receipt className="h-3.5 w-3.5" /> Makbuz
                        </Link>
                        {canWrite ? (
                          <button
                            type="button"
                            onClick={() => setModalPayment(p)}
                            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
                          >
                            Detayı gör / düzenle
                          </button>
                        ) : null}
                        {canDelete ? <PaymentDeleteDialog paymentId={p.id} /> : null}
                      </div>
                    )}
                  </td>
                </tr>
              );
              })
            )}
          </tbody>
        </table>
        </div>
        <PaginationControls
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </Card>

      {modalPayment ? (
        <PaymentMarkPaidModal
          paymentId={modalPayment.id}
          studentName={modalPayment.studentName}
          defaultAmount={modalPayment.paidAmount || modalPayment.amount}
          initialMethod={isPaymentMethod(modalPayment.method) ? modalPayment.method : undefined}
          initialNote={modalPayment.paymentNote}
          initialPaidAt={modalPayment.paidAt}
          dueDate={modalPayment.dueDate}
          description={modalPayment.description}
          source={modalPayment.source}
          lessonId={modalPayment.lessonId}
          onClose={() => setModalPayment(null)}
        />
      ) : null}
    </>
  );
}

function isPaymentMethod(value: string | undefined): value is "credit_card" | "cash" | "transfer" {
  return value === "credit_card" || value === "cash" || value === "transfer";
}
