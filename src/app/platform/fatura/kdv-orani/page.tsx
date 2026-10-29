import Link from "@/components/link";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getEffectiveTaxSummary, listTaxDecisions } from "@/lib/saas-billing/tax-decisions";
import { TaxDecisionManager } from "@/components/platform/tax-decision-manager";

export const dynamic = "force-dynamic";

export default async function TaxDecisionPage() {
  const gate = await requireHyperAdminPage("/platform/fatura/kdv-orani").catch(() => null);
  if (!gate) {
    return <EmptyState title="KDV oranı yüklenemedi" description="Yetki doğrulanamadı." />;
  }
  const effective = getEffectiveTaxSummary();
  const history = await listTaxDecisions(gate);
  return (
    <div>
      <Link className="text-sm text-[var(--color-primary)] hover:underline" href="/platform/fatura">
        ← Kurum Abonelikleri
      </Link>
      <div className="mt-2">
        <PageHeader
          title="KDV Oranı"
          description="Yürürlükteki oran (env, tek kaynak) ve oran karar geçmişi. Karar kaydı oranı yürürlüğe koymaz."
        />
      </div>
      <TaxDecisionManager effective={effective} initialRows={history.ok ? history.data : []} />
    </div>
  );
}
