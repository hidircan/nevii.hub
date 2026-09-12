import { PageHeader, EmptyState } from "@/components/ui";
import { IntegrationList } from "@/components/platform/integration-list";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getIntegrationsForScope } from "@/lib/platform/service";

export const dynamic = "force-dynamic";

export default async function PlatformIntegrationsPage() {
  const session = await requireHyperAdminPage("/platform/entegrasyonlar");
  const result = await getIntegrationsForScope(session, "platform", "*");
  if (!result.ok) {
    return <EmptyState title="Entegrasyonlar yüklenemedi" description={result.error.message} />;
  }
  return (
    <div>
      <PageHeader
        title="Platform entegrasyonları"
        description="SMS, WhatsApp, e-posta, ödeme ve AI. Gizli anahtarlar yanıtta ve logda gösterilmez."
      />
      <IntegrationList
        integrations={result.data.integrations}
        endpoint="/api/v1/platform/integrations"
        allowSecrets
        targetLabel="NeviiHub platform"
      />
    </div>
  );
}
