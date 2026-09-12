import { requireHyperAdminPage } from "@/lib/platform/session";
import { TenantSettingsSection } from "../settings-section";

export const dynamic = "force-dynamic";

/** Operasyon ayarları — NeviiOS'a özgü kategoriler kendi sekmelerinde. */
export default async function TenantSettingsPage({ params }: { params: Promise<{ tenantId: string }> }) {
  await requireHyperAdminPage("/platform/kurumlar");
  const { tenantId } = await params;
  return (
    <TenantSettingsSection
      tenantId={tenantId}
      exclude={["appearance", "subscription", "forms", "policy", "communication", "auth", "branding"]}
    />
  );
}
