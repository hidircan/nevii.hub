import { EmptyState, PageHeader } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getCatalogOverview } from "@/lib/platform/commercial-catalog";
import { PackagesManager } from "@/components/platform/packages-manager";

export const dynamic = "force-dynamic";

export default async function PackagesPage() {
  const session = await requireHyperAdminPage("/platform/paketler");
  const res = await getCatalogOverview(session);
  if (!res.ok) return <EmptyState title="Katalog yüklenemedi" description={res.error.message} />;
  return (
    <div>
      <PageHeader
        title="Paketler, modüller ve fiyat"
        description="Satışa sunulan paketler, içerikleri ve fiyatları. Limit aşımında mevcut veri silinmez; yalnız yeni öğrenci, davet ve şube eklenemez."
      />
      <PackagesManager data={res.data} />
    </div>
  );
}
