import { redirect } from "next/navigation";
import { PageHeader, EmptyState } from "@/components/ui";
import { requireSessionContext } from "@/lib/auth/session";
import { getOwnInstitutionIntegrations } from "@/lib/platform/service";
import { IntegrationList } from "@/components/platform/integration-list";

export const dynamic = "force-dynamic";

export default async function PanelKurumEntegrasyonlarPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/ayarlar/entegrasyonlar");
  }
  if (session.role === "HYPER_ADMIN") redirect("/platform");
  if (session.role !== "SUPER_ADMIN") redirect("/panel/ayarlar/kurum");

  const result = await getOwnInstitutionIntegrations(session);
  if (!result.ok) {
    return <EmptyState title="Entegrasyonlar yüklenemedi" description={result.error.message} />;
  }

  return (
    <div>
      <PageHeader
        title="Kurum entegrasyonları"
        description="Yalnız kendi kurumunuz. Platform gizli anahtarları gösterilmez."
      />
      <IntegrationList
        integrations={result.data.integrations}
        endpoint="/api/v1/institution/integrations"
        allowSecrets={false}
        targetLabel={session.tenantId}
      />
    </div>
  );
}
