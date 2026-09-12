import { PageHeader, EmptyState } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getPlatformLogoMeta } from "@/lib/platform/branding";
import { PlatformLogoManager } from "@/components/platform/platform-logo-manager";
import { PolicyVersionsPanel } from "@/components/platform/policy-versions-panel";
import { listPolicyHistory } from "@/lib/platform/policy-versions";

export const dynamic = "force-dynamic";

export default async function PlatformBrandPage() {
  const session = await requireHyperAdminPage("/platform/marka");
  const [result, history] = await Promise.all([getPlatformLogoMeta(session), listPolicyHistory(session, "platform")]);
  if (!result.ok) return <EmptyState title="Marka ayarı yüklenemedi" description={result.error.message} />;
  return (
    <div>
      <PageHeader title="Platform markası" description="NeviiHub global platform logosu — yalnız platform sahibi değiştirebilir." />
      <PlatformLogoManager initial={result.data.logo} fallbackPath={result.data.fallbackPath} />
      <div className="mt-6">
        <PolicyVersionsPanel
          scope="platform"
          versions={history.ok ? history.data.versions.filter((v) => v.key === "platform.logo") : []}
          draftKeys={[]}
          currentValues={{}}
        />
      </div>
    </div>
  );
}
