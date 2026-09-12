import { redirect } from "next/navigation";
import { PageHeader, EmptyState } from "@/components/ui";
import { requireSessionContext } from "@/lib/auth/session";
import { getOwnInstitutionSettings } from "@/lib/platform/service";
import { SettingsEditor } from "@/components/platform/settings-editor";

export const dynamic = "force-dynamic";

export default async function PanelKurumAyarlariPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/ayarlar/kurum");
  }
  if (session.role === "HYPER_ADMIN") redirect("/platform");
  if (session.role !== "SUPER_ADMIN" && session.role !== "SCHOOL_ADMIN") redirect("/panel");

  const result = await getOwnInstitutionSettings(session);
  if (!result.ok) {
    return <EmptyState title="Kurum ayarları yüklenemedi" description={result.error.message} />;
  }

  return (
    <div>
      <PageHeader
        title="Kurum ayarları"
        description="Yalnız bağlı olduğunuz kurum. Platform varsayılanlarını ve diğer kurumları göremezsiniz."
      />
      <SettingsEditor
        settings={result.data.settings}
        endpoint="/api/v1/institution/settings"
        targetLabel={result.data.tenant?.name ?? session.tenantId}
        lockPlatformOnly
        allowReset
      />
    </div>
  );
}
