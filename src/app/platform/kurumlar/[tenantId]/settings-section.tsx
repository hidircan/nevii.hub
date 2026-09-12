import { EmptyState } from "@/components/ui";
import { SettingsEditor } from "@/components/platform/settings-editor";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getTenantSettings } from "@/lib/platform/service";
import type { SettingCategory } from "@/lib/platform/types";

/** Bir kurumun belirli ayar kategorilerini düzenleyen ortak sunucu bölümü. */
export async function TenantSettingsSection({
  tenantId,
  categories,
  exclude,
}: {
  tenantId: string;
  categories?: SettingCategory[];
  exclude?: SettingCategory[];
}) {
  const session = await requireHyperAdminPage("/platform/kurumlar");
  const result = await getTenantSettings(session, tenantId);
  if (!result.ok) return <EmptyState title="Ayarlar yüklenemedi" description={result.error.message} />;
  const settings = result.data.settings.filter(
    (s) => (!categories || categories.includes(s.category)) && !exclude?.includes(s.category)
  );
  const name = result.data.tenant?.name ?? tenantId;
  return (
    <SettingsEditor
      settings={settings}
      endpoint={`/api/v1/platform/tenants/${tenantId}/settings`}
      targetLabel={`${name} (${tenantId})`}
      allowReset
    />
  );
}
