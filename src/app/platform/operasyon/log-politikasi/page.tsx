import { EmptyState, PageHeader } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getRetentionOverview } from "@/lib/platform/retention";
import { RetentionManager } from "@/components/platform/retention-manager";

export const dynamic = "force-dynamic";

export default async function RetentionPage() {
  const session = await requireHyperAdminPage("/platform/operasyon/log-politikasi");
  const res = await getRetentionOverview(session);
  if (!res.ok) return <EmptyState title="Log politikası yüklenemedi" description={res.error.message} />;
  return (
    <div>
      <PageHeader
        title="Log saklama politikası"
        description="Finans, sözleşme, tahsilat, rol ve destek erişimi denetim kayıtları otomatik silinmez. Çevrimiçi durumu ve kullanım ölçümleri kısa süreli tutulur."
      />
      <RetentionManager policies={res.data.policies} jobs={res.data.jobs} storeMode={res.data.storeMode} />
    </div>
  );
}
