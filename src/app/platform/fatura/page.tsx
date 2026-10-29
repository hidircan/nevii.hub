import { EmptyState, PageHeader } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getBillingOverview } from "@/lib/saas-billing/overview";
import { BillingManager } from "@/components/platform/billing-manager";

export const dynamic = "force-dynamic";

const DURUM_VALUES = new Set(["sorunlu", "active", "trialing", "pending", "incomplete", "past_due", "suspended", "canceled", "expired"]);

export default async function BillingOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ durum?: string }>;
}) {
  await requireHyperAdminPage("/platform/fatura");
  const { durum } = await searchParams;
  // Başvurular ayrı ekranda (/platform/basvurular); burada gereksiz okuma yok.
  const data = await getBillingOverview({ includeRequests: false }).catch(() => null);
  if (!data) {
    return <EmptyState title="Faturalandırma yüklenemedi" description="Kayıtlar okunamadı." />;
  }
  return (
    <div>
      <PageHeader
        title="Kurum Abonelikleri"
        description="Kurum abonelikleri, ödeme bildirimleri ve istisnalar. Başvurular ve kampanyalar ayrı ekrandadır. Manuel istisna ödenmiş kaydı taklit etmez."
      />
      <BillingManager data={data} initialStatus={durum && DURUM_VALUES.has(durum) ? durum : undefined} />
    </div>
  );
}
