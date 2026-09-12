import { PageHeader } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { NewTenantForm } from "@/components/platform/new-tenant-form";
import { getPublishedCatalog } from "@/lib/platform/commercial-catalog";

export const dynamic = "force-dynamic";

export default async function NewTenantPage() {
  await requireHyperAdminPage("/platform/kurumlar/yeni");
  const { catalog } = await getPublishedCatalog();
  const plans = catalog.plans.filter((p) => p.status === "active" && !p.legacy).map((p) => ({ key: p.key, label: p.label, limits: p.limits }));
  return (
    <div>
      <PageHeader
        title="Yeni kurum"
        description="Taslak → kurulum (STORE_MODE=db: tenant + okul + ilk şube + ayarlar + sahip daveti, idempotent) → aktif."
      />
      <NewTenantForm plans={plans} />
    </div>
  );
}
