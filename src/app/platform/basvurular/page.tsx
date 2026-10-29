import { EmptyState, PageHeader } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getBillingOverview } from "@/lib/saas-billing/overview";
import { RequestsManager } from "@/components/platform/requests-manager";

export const dynamic = "force-dynamic";

export default async function BillingRequestsPage() {
  await requireHyperAdminPage("/platform/basvurular");
  const data = await getBillingOverview().catch(() => null);
  if (!data) {
    return <EmptyState title="Başvurular yüklenemedi" description="Kayıtlar okunamadı." />;
  }
  return (
    <div>
      <PageHeader
        title="Başvurular ve Teklif Talepleri"
        description="Satın alma ve deneme başvuruları ile teklif istekleri. Onay tek başına ödeme başlatmaz."
      />
      <RequestsManager data={data} />
    </div>
  );
}
