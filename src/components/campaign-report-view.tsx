"use client";

/**
 * Paket & Kampanya Motoru — "hangi kampanyadan kimler faydalanmış" detaylı
 * raporu. Veri sunucuda `buildCampaignReport` ile üretilir (saf seçici);
 * bu bileşen yalnız filtre ve gösterimdir.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Badge, Card, Input, Label, Select } from "@/components/ui";
import type { CampaignReportEntry } from "@/lib/discount-campaigns";

function formatTL(amount: number): string {
  return `${amount.toLocaleString("tr-TR")} TL`;
}

export function CampaignReportView({
  entries,
  campaigns,
  branches,
}: {
  entries: CampaignReportEntry[];
  campaigns: { id: string; name: string; displayId?: string }[];
  branches: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [campaignId, setCampaignId] = useState(searchParams.get("rkampanya") ?? "");
  const [branchId, setBranchId] = useState(searchParams.get("rsube") ?? "");
  const [from, setFrom] = useState(searchParams.get("rfrom") ?? "");
  const [to, setTo] = useState(searchParams.get("rto") ?? "");

  function apply() {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", "rapor");
    if (campaignId) next.set("rkampanya", campaignId);
    else next.delete("rkampanya");
    if (branchId) next.set("rsube", branchId);
    else next.delete("rsube");
    if (from) next.set("rfrom", from);
    else next.delete("rfrom");
    if (to) next.set("rto", to);
    else next.delete("rto");
    router.push(`${pathname}?${next.toString()}`);
  }

  function clear() {
    setCampaignId("");
    setBranchId("");
    setFrom("");
    setTo("");
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", "rapor");
    next.delete("rkampanya");
    next.delete("rsube");
    next.delete("rfrom");
    next.delete("rto");
    router.push(`${pathname}?${next.toString()}`);
  }

  const totalBeneficiaries = entries.reduce((s, e) => s + e.beneficiaries.length, 0);
  const totalDiscount = entries.reduce((s, e) => s + e.totalDiscountAmount, 0);

  return (
    <div className="space-y-4">
      <Card>
        <form
          className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <div>
            <Label>Kampanya</Label>
            <Select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">Tümü</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayId ? `${c.displayId} · ` : ""}
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Şube</Label>
            <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">Tümü</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Başlangıç</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label>Bitiş</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end gap-1.5">
            <button
              type="submit"
              className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
            >
              Uygula
            </button>
            <button
              type="button"
              onClick={clear}
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] hover:border-[var(--color-primary)]"
            >
              Temizle
            </button>
          </div>
        </form>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="font-semibold text-[var(--color-text)]">Yararlanıcılar</h2>
          <Badge status="confirmed">{totalBeneficiaries} öğrenci</Badge>
          <Badge status="scheduled">Toplam indirim: {formatTL(totalDiscount)}</Badge>
        </div>
        {entries.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            Seçili filtrelerde kampanyadan faydalanmış öğrenci bulunamadı. Not: rapor yalnız motor üzerinden
            kampanyayla kaydedilen öğrencileri gösterir; eski/kampanyasız kayıtlar listelenmez.
          </p>
        ) : (
          <div className="space-y-4">
            {entries.map((e) => (
              <div key={e.campaign.id} className="rounded-lg border border-[var(--color-border)] p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {e.campaign.displayId ? (
                    <span className="rounded bg-[var(--color-surface-muted)] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--color-text-muted)]">
                      {e.campaign.displayId}
                    </span>
                  ) : null}
                  <p className="font-medium text-[var(--color-text)]">{e.campaign.name}</p>
                  <Badge status="scheduled">%{e.campaign.discountPercent}</Badge>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {e.beneficiaries.length} yararlanıcı · dağıtılan indirim: {formatTL(e.totalDiscountAmount)}
                  </span>
                </div>
                {e.beneficiaries.length === 0 ? (
                  <p className="text-xs text-[var(--color-text-muted)]">Bu kampanyadan faydalanmış öğrenci yok.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                          <th className="py-1.5 pr-3 font-medium">Öğrenci</th>
                          <th className="py-1.5 pr-3 font-medium">Şube</th>
                          <th className="py-1.5 pr-3 font-medium">Paket</th>
                          <th className="py-1.5 pr-3 text-right font-medium">Taban</th>
                          <th className="py-1.5 pr-3 text-right font-medium">Nihai</th>
                          <th className="py-1.5 pr-3 font-medium">Uygulama</th>
                        </tr>
                      </thead>
                      <tbody>
                        {e.beneficiaries.map((b) => (
                          <tr key={b.studentId} className="border-b border-[var(--color-border)] last:border-0">
                            <td className="py-1.5 pr-3 font-medium text-[var(--color-text)]">
                              {b.studentDisplayId ? `${b.studentDisplayId} · ` : ""}
                              {b.studentName}
                            </td>
                            <td className="py-1.5 pr-3 text-[var(--color-text-muted)]">{b.branchName}</td>
                            <td className="py-1.5 pr-3 text-[var(--color-text-muted)]">{b.packageTitle ?? "—"}</td>
                            <td className="py-1.5 pr-3 text-right text-[var(--color-text-muted)]">
                              {b.baseMonthlyFee != null ? formatTL(b.baseMonthlyFee) : "—"}
                            </td>
                            <td className="py-1.5 pr-3 text-right font-medium text-[var(--color-text)]">
                              {formatTL(b.finalMonthlyFee)}
                            </td>
                            <td className="py-1.5 pr-3 text-[var(--color-text-muted)]">
                              {new Date(b.appliedAt).toLocaleDateString("tr-TR")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
