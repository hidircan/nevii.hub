import { Card } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { TenantSettingsSection } from "../settings-section";
import { TemplatePreview } from "@/components/platform/template-preview";

export const dynamic = "force-dynamic";

export default async function TenantPoliciesPage({ params }: { params: Promise<{ tenantId: string }> }) {
  await requireHyperAdminPage("/platform/kurumlar");
  const { tenantId } = await params;
  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-sm font-semibold">Snapshot güvencesi</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Dönem, finans ve sözleşme politikaları yalnız <strong>yeni</strong> kayıtlara uygulanır. Kayıt oluşturulurken
          politika içerik parmak iziyle kopyalanır (<code>snapshotPolicy</code>); sonradan yapılan değişiklik mevcut
          sözleşme/tahsilatı değiştirmez. Her değişiklik önceki/yeni değerle denetim kaydına yazılır.
        </p>
      </Card>
      <TenantSettingsSection tenantId={tenantId} categories={["policy", "communication", "auth"]} />
      <TemplatePreview />
    </div>
  );
}
