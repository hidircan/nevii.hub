"use client";

import { useState } from "react";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { Badge, Card, EmptyState } from "@/components/ui";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatPaymentCollectionSummary,
  paymentMethodLabelTr,
  paymentSourceLabel,
} from "@/lib/utils";
import { PaginationControls, usePagination } from "@/components/pagination-controls";
import { PaymentMarkPaidModal } from "@/components/payment-mark-paid-modal";
import type { Payment, PaymentSource } from "@/lib/types";

/**
 * Öğrenci "Ödeme geçmişi" tablosu — gerçekleşmiş hareketler.
 * Vade ile fiili tahsilat anı ayrı kolonlarda; yetkili düzenleme modalı.
 */
type PaymentRow = Payment & { receivedByName?: string; studentName?: string };

export function StudentPaymentHistoryTable({
  payments,
  canWrite = false,
  studentName = "",
}: {
  payments: PaymentRow[];
  canWrite?: boolean;
  studentName?: string;
}) {
  const { pageItems, page, setPage, pageSize, setPageSize, totalPages, totalCount } = usePagination(payments, 10);
  const [modalPayment, setModalPayment] = useState<PaymentRow | null>(null);

  if (payments.length === 0) {
    return (
      <EmptyState title="Ödeme kaydı yok" description="Bu öğrenci için henüz gerçekleşmiş bir ödeme kaydı yok." />
    );
  }

  return (
    <>
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
              <tr>
                <th className="px-4 py-3">Dönem / açıklama</th>
                <th className="px-4 py-3">Vade</th>
                <th className="px-4 py-3">Tahsil edildiği an</th>
                <th className="px-4 py-3">Tutar</th>
                <th className="px-4 py-3">Yöntem / kaynak</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((p) => {
                const sourceLabel = paymentSourceLabel(p.source as PaymentSource | undefined, Boolean(p.lessonId));
                return (
                  <tr key={p.id} className="border-b border-[var(--color-border)]">
                    <td className="px-4 py-3 font-medium text-[var(--color-text)]">
                      {p.description}
                      {p.paymentNote ? (
                        <span className="mt-0.5 block text-xs font-normal text-[var(--color-text-muted)]">
                          Not: {p.paymentNote}
                        </span>
                      ) : null}
                      {p.adjustmentReason ? (
                        <span className="mt-0.5 block text-xs font-normal text-[var(--color-text-muted)]">
                          Kısmi tahsilat gerekçesi: {p.adjustmentReason}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)]">{formatDate(p.dueDate)}</td>
                    <td className="px-4 py-3 text-[var(--color-text)]">
                      {p.paidAt ? (
                        <span className="font-medium">{formatDateTime(p.paidAt)}</span>
                      ) : (
                        <span className="text-[var(--color-text-muted)]">—</span>
                      )}
                      {p.createdAt ? (
                        <span className="mt-0.5 block text-[11px] text-[var(--color-text-muted)]">
                          Kayıt: {formatDateTime(p.createdAt)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium">{formatMoney(p.paidAmount || p.amount)}</span>
                      {p.paidAmount > 0 && p.paidAmount < p.amount ? (
                        <span className="block text-xs text-[var(--color-text-muted)]">
                          Toplam: {formatMoney(p.amount)}
                        </span>
                      ) : null}
                      {p.autoSuggestedAmount != null && p.autoSuggestedAmount !== (p.paidAmount || p.amount) ? (
                        <span className="block text-xs text-[var(--color-text-muted)]">
                          Önerilen: {formatMoney(p.autoSuggestedAmount)} · Fark:{" "}
                          {(p.paidAmount || p.amount) - p.autoSuggestedAmount > 0 ? "+" : ""}
                          {formatMoney((p.paidAmount || p.amount) - p.autoSuggestedAmount)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)]">
                      {paymentMethodLabelTr(p.method)}
                      {sourceLabel ? (
                        <span className="mt-0.5 block text-[11px] text-[var(--color-text-muted)]">{sourceLabel}</span>
                      ) : null}
                      {p.status === "paid" ? (
                        <span className="mt-0.5 block text-[11px] text-[var(--color-text-muted)]">
                          {formatPaymentCollectionSummary({
                            paidAt: p.paidAt,
                            amount: p.paidAmount || p.amount,
                            method: p.method,
                            collectorName: p.receivedByName ?? null,
                          }) ?? "Tahsil anı kayıtlı değil"}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Badge status={p.status} />
                      <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                        Tahsil eden: {p.receivedByName?.trim() || "Kayıtlı değil"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {p.status === "paid" ? (
                          <Link
                            href={`/makbuz/${p.id}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
                          >
                            <Receipt className="h-3.5 w-3.5" /> Makbuz
                          </Link>
                        ) : null}
                        {canWrite && p.status === "paid" ? (
                          <button
                            type="button"
                            onClick={() => setModalPayment(p)}
                            className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
                          >
                            Detayı gör / düzenle
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
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
          studentName={modalPayment.studentName || studentName}
          defaultAmount={modalPayment.paidAmount || modalPayment.amount}
          mode="edit"
          initialMethod={isPaymentMethod(modalPayment.method) ? modalPayment.method : undefined}
          initialNote={modalPayment.paymentNote}
          initialPaidAt={modalPayment.paidAt}
          dueDate={modalPayment.dueDate}
          description={modalPayment.description}
          source={modalPayment.source}
          lessonId={modalPayment.lessonId}
          collectorName={modalPayment.receivedByName}
          suggestedAmount={modalPayment.autoSuggestedAmount}
          adjustmentReason={modalPayment.adjustmentReason}
          onClose={() => setModalPayment(null)}
        />
      ) : null}
    </>
  );
}

function isPaymentMethod(value: string | undefined): value is "credit_card" | "cash" | "transfer" {
  return value === "credit_card" || value === "cash" || value === "transfer";
}
