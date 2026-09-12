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
        description="Paket ≠ entitlement ≠ modül bayrağı ≠ izin. Limit aşımı veri silmez; yalnız yeni öğrenci, yeni davet ve yeni şube durur."
      />
      <PackagesManager data={res.data} />
    </div>
  );
}
