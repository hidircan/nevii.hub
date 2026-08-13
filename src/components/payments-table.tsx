"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Receipt } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatPaymentCollectionSummary,
  paymentMethodLabelTr,
  paymentSourceLabel,
} from "@/lib/utils";
import { PaymentMarkPaidModal } from "@/components/payment-mark-paid-modal";
import { PaginationControls, usePagination } from "@/components/pagination-controls";
import type { PaymentStatus } from "@/lib/types";

export type PaymentRow = {
  id: string;
  studentId: string;
  studentName: string;
  description: string;
  method?: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: PaymentStatus;
  /** ÖNCELİK 3 — otomatik ders bazlı tahsilatın kaynak dersi; manuel/paket ödemelerde yok. */
  lessonId?: string;
  lessonDate?: string;
  paymentNote?: string;
  paidAt?: string;
  createdAt?: string;
  source?: string;
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

export function PaymentsTable({ rows, canWrite }: { rows: PaymentRow[]; canWrite: boolean }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [actionOnly, setActionOnly] = useState(false);
  const [modalPayment, setModalPayment] = useState<PaymentRow | null>(null);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (query && !row.studentName.toLowerCase().includes(query)) return false;
      if (actionOnly) return row.status === "overdue" || row.status === "partial";
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      return true;
    });
  }, [rows, search, statusFilter, actionOnly]);

  const { pageItems, page, setPage, pageSize, setPageSize, totalPages, totalCount } = usePagination(filtered, 10);

  return (
    <>
      {!canWrite ? (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          &quot;Tüm kurumlar&quot; görünümündesiniz — ödeme işaretlemek için üstteki kurum seçiciden tek
          bir kurum seçin.
        </p>
      ) : null}
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

        <span className="ml-auto text-xs font-medium text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
          {filtered.length} sonuç
        </span>
      </div>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)] dark:border-slate-800 dark:bg-slate-900/60 dark:text-[var(--color-text-muted)]">
            <tr>
              <th className="px-4 py-3">Öğrenci</th>
              <th className="px-4 py-3">Açıklama</th>
              <th className="px-4 py-3">Vade</th>
              <th className="px-4 py-3">Tahsil anı</th>
              <th className="px-4 py-3">Tutar</th>
              <th className="px-4 py-3">Durum</th>
              <th className="px-4 py-3">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
                  Bu filtreye uyan ödeme bulunamadı.
                </td>
              </tr>
            ) : (
              pageItems.map((p) => {
                const sourceLabel = paymentSourceLabel(p.source, Boolean(p.lessonId));
                return (
                <tr key={p.id} className="border-b border-[var(--color-border)]">
                  <td className="px-4 py-3 font-medium text-[var(--color-text)]">
                    <Link
                      href={`/panel/odemeler/${p.studentId}`}
                      className="hover:text-[var(--color-primary)] hover:underline"
                    >
                      {p.studentName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">
                    {p.description}
                    {p.method ? (
                      <span className="block text-xs text-[var(--color-text-muted)]">
                        {paymentMethodLabelTr(p.method)}
                      </span>
                    ) : null}
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
                  <td className="px-4 py-3">
                    <span className="font-medium">{formatMoney(p.amount)}</span>
                    {p.paidAmount > 0 && p.paidAmount < p.amount ? (
                      <span className="block text-xs text-[var(--color-text-muted)]">
                        Ödenen: {formatMoney(p.paidAmount)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <Badge status={p.status} />
                  </td>
                  <td className="px-4 py-3">
                    {p.status === "voided" ? (
                      <span className="text-xs text-[var(--color-text-muted)]">
                        Ders iptal edildiği için tahsilat iptal edildi.
                      </span>
                    ) : p.status !== "paid" ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="!py-1.5 text-xs"
                        disabled={!canWrite}
                        onClick={() => {
                          setModalMode("create");
                          setModalPayment(p);
                        }}
                      >
                        Ödendi işaretle
                      </Button>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/makbuz/${p.id}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
                        >
                          <Receipt className="h-3.5 w-3.5" /> Makbuz
                        </Link>
                        {canWrite ? (
                          <button
                            type="button"
                            onClick={() => {
                              setModalMode("edit");
                              setModalPayment(p);
                            }}
                            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
                          >
                            Detayı gör / düzenle
                          </button>
                        ) : null}
                      </div>
                    )}
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

      {modalPayment ? (
        <PaymentMarkPaidModal
          paymentId={modalPayment.id}
          studentName={modalPayment.studentName}
          defaultAmount={
            modalMode === "edit"
              ? modalPayment.paidAmount || modalPayment.amount
              : modalPayment.amount - modalPayment.paidAmount
          }
          mode={modalMode}
          initialMethod={
            modalMode === "edit" && isPaymentMethod(modalPayment.method) ? modalPayment.method : undefined
          }
          initialNote={modalMode === "edit" ? modalPayment.paymentNote : undefined}
          initialPaidAt={modalMode === "edit" ? modalPayment.paidAt : undefined}
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
