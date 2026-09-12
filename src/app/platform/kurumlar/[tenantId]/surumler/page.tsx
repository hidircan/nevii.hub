import { EmptyState, PageHeader } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { listPolicyHistory } from "@/lib/platform/policy-versions";
import { getTenantSettings } from "@/lib/platform/service";
import { listFeatureOverrides } from "@/lib/platform/store";
import { FEATURES_POLICY_KEY, isGovernedPolicyKey } from "@/lib/platform/policy-version-log";
import { PolicyVersionsPanel } from "@/components/platform/policy-versions-panel";

export const dynamic = "force-dynamic";

export default async function TenantPolicyVersionsPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const session = await requireHyperAdminPage("/platform/kurumlar");
  const { tenantId } = await params;
  const [history, settings, features] = await Promise.all([
    listPolicyHistory(session, tenantId),
    getTenantSettings(session, tenantId),
    listFeatureOverrides(tenantId),
  ]);
  if (!history.ok || !settings.ok) {
    return <EmptyState title="Sürümler yüklenemedi" description={!history.ok ? history.error.message : ""} />;
  }
  const governed = settings.data.settings.filter((s) => isGovernedPolicyKey(s.key));
  const currentValues: Record<string, unknown> = Object.fromEntries(governed.map((s) => [s.key, s.effectiveValue]));
  currentValues[FEATURES_POLICY_KEY] = Object.fromEntries(features.map((f) => [f.flagKey, f.enabled]));
  return (
    <div>
      <PageHeader
        title="Politika sürümleri"
        description="Görünüm, modül, paket/entitlement, form, mobil ve dönem/finans politikaları: Taslak → Etki önizleme → Yayınla → Audit → Geri al."
      />
      <PolicyVersionsPanel
        scope={tenantId}
        versions={history.data.versions}
        draftKeys={[...governed.map((s) => s.key), FEATURES_POLICY_KEY]}
        currentValues={currentValues}
      />
    </div>
  );
}
