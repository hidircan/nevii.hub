import { Card } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { BrandPreview } from "@/components/platform/brand-preview";
import { TenantSettingsSection } from "../settings-section";

export const dynamic = "force-dynamic";

export default async function TenantAppearancePage({ params }: { params: Promise<{ tenantId: string }> }) {
  await requireHyperAdminPage("/platform/kurumlar");
  const { tenantId } = await params;
  return (
    <div className="space-y-4">
      <BrandPreview tenantId={tenantId} />
      <Card>
        <h2 className="text-sm font-semibold">Görünüm politikası nasıl uygulanır?</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--color-text-muted)]">
          <li>
            <strong>light_only</strong>: koyu profil (Gece Obsidyen) seçilemez; <strong>dark_only</strong>: koyu profil
            zorunlu; <strong>light_and_dark</strong>: kullanıcı seçer.
          </li>
          <li>Sabit tema / font seçilirse kullanıcının kişisel tercihi yok sayılır (sunucu render + server action).</li>
          <li>Kurum logosu (<code>institution.logoUrl</code>) yalnız bu kurumu etkiler; global platform logosu ayrıdır (Platform → Marka).</li>
        </ul>
      </Card>
      <TenantSettingsSection tenantId={tenantId} categories={["appearance", "branding", "locale"]} />
    </div>
  );
}
