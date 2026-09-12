import { EmptyState } from "@/components/ui";
import { IntegrationList } from "@/components/platform/integration-list";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getIntegrationsForScope } from "@/lib/platform/service";
import { getPlatformTenant } from "@/lib/platform/store";

export const dynamic = "force-dynamic";

export default async function TenantIntegrationsPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const session = await requireHyperAdminPage("/platform/kurumlar");
  const { tenantId } = await params;
  const [result, tenant] = await Promise.all([
    getIntegrationsForScope(session, "tenant", tenantId),
    getPlatformTenant(tenantId),
  ]);
  if (!result.ok) {
    return <EmptyState title="Entegrasyonlar yüklenemedi" description={result.error.message} />;
  }
  return (
    <IntegrationList
      integrations={result.data.integrations}
      endpoint={`/api/v1/platform/tenants/${tenantId}/integrations`}
      allowSecrets
      targetLabel={`${tenant?.name ?? tenantId} (${tenantId})`}
    />
  );
}
