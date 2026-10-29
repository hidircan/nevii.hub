import { PageHeader, EmptyState } from "@/components/ui";
import { IntegrationList } from "@/components/platform/integration-list";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getIntegrationsForScope } from "@/lib/platform/service";

export const dynamic = "force-dynamic";

export default async function PlatformIntegrationsPage() {
  const session = await requireHyperAdminPage("/platform/entegrasyonlar");
  const result = await getIntegrationsForScope(session, "platform", "*");
  if (!result.ok) {
    return <EmptyState title="Entegrasyonlar yüklenemedi" description={result.error.message} />;
  }
  // Kart tahsilatı (PayTR/iyzico SaaS) tek yetkili ekrandan yönetilir;
  // burada ikinci bir ödeme girişi gösterilmez (çakışan durum yok).
  const rows = result.data.integrations.filter((i) => i.kind !== "payments");
  return (
    <div className="space-y-4">
      <PageHeader
        title="Mesajlaşma ve servisler"
        description="SMS, WhatsApp, e-posta ve AI servisleri. Gizli anahtarlar yanıtta ve logda gösterilmez."
      />
      <p className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-text-muted)]">
        Kart tahsilatı ve abonelik ödemeleri bu listede değildir;{" "}
        <a href="/platform/odeme-saglayicilari" className="font-medium text-[var(--color-primary)] hover:underline">
          Ödeme Sağlayıcıları
        </a>{" "}
        ekranından yönetilir.
      </p>
      <IntegrationList
        integrations={rows}
        endpoint="/api/v1/platform/integrations"
        allowSecrets
        targetLabel="NeviiHub platform"
      />
    </div>
  );
}
