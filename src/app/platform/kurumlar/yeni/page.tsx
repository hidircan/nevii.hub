import Link from "@/components/link";
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
      <Link className="text-sm text-[var(--color-primary)] hover:underline" href="/platform/kurumlar">
        ← Kurum portföyü
      </Link>
      <div className="mt-2">
        <PageHeader
          title="Yeni kurum"
          description="Taslak kayıttan kurulum: kurum + okul + ilk şube + ayarlar + sahip daveti, ardından aktif."
        />
      </div>
      <NewTenantForm plans={plans} />
    </div>
  );
}
