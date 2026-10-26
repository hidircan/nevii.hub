import { EmptyState, PageHeader } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getBillingOverview } from "@/lib/saas-billing/overview";
import { BillingManager } from "@/components/platform/billing-manager";

export const dynamic = "force-dynamic";

export default async function BillingOverviewPage() {
  await requireHyperAdminPage("/platform/fatura");
  const data = await getBillingOverview().catch(() => null);
  if (!data) {
    return <EmptyState title="Faturalandırma yüklenemedi" description="Kayıtlar okunamadı." />;
  }
  return (
    <div>
      <PageHeader
        title="Abonelik tahsilatı"
        description="Kurum abonelikleri, denemeler, kampanyalar, webhook/mutabakat ve istisnalar. Manuel istisna ödenmiş kaydı taklit etmez."
      />
      <BillingManager data={data} />
    </div>
  );
}
