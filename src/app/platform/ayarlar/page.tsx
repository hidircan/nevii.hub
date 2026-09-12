import { PageHeader, EmptyState } from "@/components/ui";
import { SettingsEditor } from "@/components/platform/settings-editor";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getPlatformDefaultSettings } from "@/lib/platform/service";

export const dynamic = "force-dynamic";

export default async function PlatformSettingsPage() {
  const session = await requireHyperAdminPage("/platform/ayarlar");
  const result = await getPlatformDefaultSettings(session);
  if (!result.ok) {
    return <EmptyState title="Ayarlar yüklenemedi" description={result.error.message} />;
  }
  return (
    <div>
      <PageHeader
        title="Platform varsayılanları"
        description="Tüm kurumların üzerine binen varsayılan değerler. Kurum ve şube override'ları daha önceliklidir."
      />
      <SettingsEditor
        settings={result.data.settings}
        endpoint="/api/v1/platform/settings"
        targetLabel="NeviiHub platform varsayılanı"
      />
    </div>
  );
}
