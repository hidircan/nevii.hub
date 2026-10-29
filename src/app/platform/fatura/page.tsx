import { EmptyState, PageHeader } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getBillingOverview } from "@/lib/saas-billing/overview";
import { BillingManager } from "@/components/platform/billing-manager";

export const dynamic = "force-dynamic";

export default async function BillingOverviewPage() {
  await requireHyperAdminPage("/platform/fatura");
  // Başvurular ayrı ekranda (/platform/basvurular); burada gereksiz okuma yok.
  const data = await getBillingOverview({ includeRequests: false }).catch(() => null);
  if (!data) {
    return <EmptyState title="Faturalandırma yüklenemedi" description="Kayıtlar okunamadı." />;
  }
  return (
    <div>
      <PageHeader
        title="Kurum Abonelikleri"
        description="Kurum abonelikleri, kampanyalar, ödeme bildirimleri ve istisnalar. Başvurular ayrı ekrandadır. Manuel istisna ödenmiş kaydı taklit etmez."
      />
      <BillingManager data={data} />
    </div>
  );
}
