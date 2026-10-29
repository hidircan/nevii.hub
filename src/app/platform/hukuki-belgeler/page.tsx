import { EmptyState, PageHeader } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getEffectiveDocs } from "@/lib/saas-billing/legal-doc-store";
import { listLegalDocStates } from "@/lib/saas-billing/store";
import { LegalDocsManager } from "@/components/platform/legal-docs-manager";

export const dynamic = "force-dynamic";

export default async function LegalDocsPage() {
  await requireHyperAdminPage("/platform/hukuki-belgeler");
  const [docs, states] = await Promise.all([
    getEffectiveDocs().catch(() => null),
    listLegalDocStates().catch(() => []),
  ]);
  if (!docs) {
    return <EmptyState title="Belgeler yüklenemedi" description="Kayıtlar okunamadı." />;
  }
  const byId = new Map(states.map((s) => [s.docId, s]));
  return (
    <div>
      <PageHeader
        title="Hukuki Belgeler"
        description="Müşteriye sunulan sözleşme ve bilgilendirme metinlerinin tek yönetim yeri. Taslak hazırlama NeviiAds'te kalır; burası yürürlükteki sürümü seçer ve yayımlar. Yayınlanan sürüm yerinde değişmez."
      />
      <p className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-4 py-2.5 text-sm text-[var(--color-warning)]">
        Bu tur yalnız local sentetik sürümlerle demo; gerçek public yayın ve hukuki uygunluk iddiası yok.
      </p>
      <LegalDocsManager docs={docs.map((d) => ({ ...d, state: byId.get(d.id) ?? null }))} />
    </div>
  );
}
