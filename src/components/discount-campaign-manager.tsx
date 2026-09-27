"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionCreateDiscountCampaign, actionUpdateDiscountCampaign } from "@/lib/actions";
import { Badge, Button, Card, Input, Label } from "@/components/ui";
import { applyPercentDiscount } from "@/lib/discount-campaigns";
import type { DiscountCampaign } from "@/lib/types";

const KIND_LABELS: Record<DiscountCampaign["kind"], string> = {
  sibling: "Kardeş kampanyası",
};

export function DiscountCampaignManager({
  campaigns,
  canWrite,
  /** İndirim etkisini örneklemek için — herhangi bir aktif paketin 30 dk fiyatı. */
  samplePrice,
}: {
  campaigns: DiscountCampaign[];
  canWrite: boolean;
  samplePrice?: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [percent, setPercent] = useState("10");

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const result = await actionCreateDiscountCampaign({
        name,
        kind: "sibling",
        discountPercent: Number(percent),
      });
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      setName("");
      setPercent("10");
      router.refresh();
    });
  }

  function toggleActive(campaign: DiscountCampaign) {
    startTransition(async () => {
      const result = await actionUpdateDiscountCampaign({
        campaignId: campaign.id,
        active: !campaign.active,
      });
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-1 font-semibold text-[var(--color-text)]">Kampanyalar / indirimler</h2>
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">
          Yüzde tabanlı otomatik kural tanımları. Bu kurallar şu an için bir REFERANS ve önizlemedir —
          nihai ücret hâlâ öğrenci kaydındaki mevcut indirim alanından (manuel, admin onaylı) uygulanır;
          burada tanımlı yüzde o alana girilecek değeri belirlemek için kullanılır.
        </p>
        {campaigns.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">Henüz kampanya tanımlanmamış.</p>
        ) : (
          <div className="space-y-2">
            {campaigns.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] p-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-[var(--color-text)]">{c.name}</p>
                    <Badge status={c.active ? "confirmed" : "archived"}>{c.active ? "Aktif" : "Pasif"}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                    {KIND_LABELS[c.kind]} · %{c.discountPercent} indirim
                    {samplePrice !== undefined
                      ? ` · örn. ${samplePrice.toLocaleString("tr-TR")} ₺ → ${applyPercentDiscount(
                          samplePrice,
                          c.discountPercent
                        ).toLocaleString("tr-TR")} ₺`
                      : ""}
                  </p>
                </div>
                {canWrite ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => toggleActive(c)}
                    className="rounded-md border border-stone-300 bg-white px-2.5 py-1 text-xs font-semibold text-stone-800 hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-muted)] disabled:opacity-50"
                  >
                    {c.active ? "Pasife al" : "Aktif et"}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      {canWrite ? (
        <Card>
          <h2 className="mb-3 font-semibold text-[var(--color-text)]">Yeni kampanya</h2>
          <form onSubmit={onCreate} className="space-y-3">
            <div>
              <Label>Kampanya adı</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Örn. Kardeş Kampanyası"
              />
            </div>
            <div className="max-w-[160px]">
              <Label>İndirim oranı (%)</Label>
              <Input
                type="number"
                min={1}
                max={100}
                step={1}
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                required
              />
            </div>
            <p className="text-xs text-[var(--color-text-muted)]">
              Tür şu an yalnızca &quot;Kardeş kampanyası&quot; — aynı veli telefonuna kayıtlı ikinci ve
              sonraki öğrenciler için geçerli olacak şekilde tasarlanmıştır.
            </p>
            {formError ? <p className="text-xs font-medium text-[var(--color-danger)]">{formError}</p> : null}
            <Button type="submit" disabled={pending}>
              {pending ? "Kaydediliyor…" : "Kampanya oluştur"}
            </Button>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
