import { EmptyState, PageHeader } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { listPlatformTenants } from "@/lib/platform/store";
import { listSaasCampaigns } from "@/lib/saas-billing/store";
import { CampaignsManager } from "@/components/platform/campaigns-manager";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  await requireHyperAdminPage("/platform/kampanyalar");
  const [campaigns, tenants] = await Promise.all([
    listSaasCampaigns(100).catch(() => null),
    listPlatformTenants().catch(() => []),
  ]);
  if (!campaigns) {
    return <EmptyState title="Kampanyalar yüklenemedi" description="Kayıtlar okunamadı." />;
  }
  const names = new Map(tenants.map((t) => [t.tenantId, t.name]));
  return (
    <div>
      <PageHeader
        title="Kampanyalar"
        description="Pilot kuruma özel indirimler. Kampanya yalnız bağlı kuruma uygulanır; kapatma geçmiş hakları değiştirmez."
      />
      <CampaignsManager
        campaigns={campaigns.map((c) => ({ ...c, tenantName: c.tenantId ? (names.get(c.tenantId) ?? null) : null }))}
        tenants={tenants.map((t) => ({ tenantId: t.tenantId, name: t.name }))}
      />
    </div>
  );
}
