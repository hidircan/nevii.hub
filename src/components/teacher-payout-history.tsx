"use client";

import { Card } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/utils";
import type { TeacherPayout } from "@/lib/types";
import { payoutPaymentRows } from "@/lib/payout-ledger";

const METHOD_LABEL: Record<string, string> = {
  cash: "Nakit",
  transfer: "Havale",
};

/** Gerçekleşen ödeme satırları (kısmi ödemeler ayrı satır; ters kaydı yapılanlar girmez). */
export function TeacherPayoutHistory({ payouts }: { payouts: TeacherPayout[] }) {
  const rows = payoutPaymentRows(payouts);

  return (
    <div className="space-y-3">
      <div>
        {rows.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--color-text-muted)]">Henüz yapılmış hakediş ödemesi yok.</p>
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            {/* Mobil: tablo sayfayı yatay taşırmaz — kendi kapsayıcısında kayar (kolon gizlenmez). */}
            <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
                <tr>
                  <th className="px-4 py-3">Ödeme tarihi</th>
                  <th className="px-4 py-3">Hakediş dönemi</th>
                  <th className="px-4 py-3">Tutar</th>
                  <th className="px-4 py-3">Yöntem</th>
                  <th className="px-4 py-3">Not</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-[var(--color-border)]">
                    <td className="px-4 py-3 text-[var(--color-text-muted)]">{formatDate(r.paidAt)}</td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)]">
                      {formatDate(r.periodStart)} – {formatDate(r.periodEnd)}
                    </td>
                    <td className="px-4 py-3 font-medium text-[var(--color-text)]">{formatMoney(r.amount)}</td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)]">{r.method ? METHOD_LABEL[r.method] ?? r.method : "—"}</td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)]">{r.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
