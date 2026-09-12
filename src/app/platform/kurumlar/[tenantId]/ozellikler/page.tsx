import { EmptyState } from "@/components/ui";
import { FeatureToggles } from "@/components/platform/feature-toggles";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getTenantFeatures } from "@/lib/platform/service";

export const dynamic = "force-dynamic";

export default async function TenantFeaturesPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const session = await requireHyperAdminPage("/platform/kurumlar");
  const { tenantId } = await params;
  const result = await getTenantFeatures(session, tenantId);
  if (!result.ok) {
    return <EmptyState title="Özellikler yüklenemedi" description={result.error.message} />;
  }
  const name = result.data.tenant?.name ?? tenantId;
  return (
    <FeatureToggles
      features={result.data.features}
      endpoint={`/api/v1/platform/tenants/${tenantId}/features`}
      targetLabel={`${name} (${tenantId})`}
      actorRole="HYPER_ADMIN"
    />
  );
}
