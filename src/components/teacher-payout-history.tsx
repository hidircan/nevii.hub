"use client";

import { Card } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/utils";
import type { TeacherPayout } from "@/lib/types";

const METHOD_LABEL: Record<string, string> = {
  cash: "Nakit",
  transfer: "Havale",
};

/** Yalnız ödenmiş kayıtlar. Bekleyen hakediş ödeme geçmişine girmez. */
export function TeacherPayoutHistory({ payouts }: { payouts: TeacherPayout[] }) {
  const paid = payouts
    .filter((p) => p.status === "paid")
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart));

  return (
    <div className="space-y-3">
      <div>
        {paid.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">Henüz ödenmiş hakediş kaydı yok.</p>
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)] dark:border-slate-800 dark:bg-slate-900/60 dark:text-[var(--color-text-muted)]">
                <tr>
                  <th className="px-4 py-3">Dönem</th>
                  <th className="px-4 py-3">Dakika</th>
                  <th className="px-4 py-3">Tutar</th>
                  <th className="px-4 py-3">Ödeme tarihi</th>
                  <th className="px-4 py-3">Yöntem</th>
                </tr>
              </thead>
              <tbody>
                {paid.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 dark:border-slate-800">
                    <td className="px-4 py-3 text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                      {formatDate(p.periodStart)} – {formatDate(p.periodEnd)}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">{p.totalMinutes} dk</td>
                    <td className="px-4 py-3 font-medium text-[var(--color-text)] dark:text-slate-50">{formatMoney(p.totalAmount)}</td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">{p.paidAt ? formatDate(p.paidAt) : "—"}</td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                      {p.method ? METHOD_LABEL[p.method] ?? p.method : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
