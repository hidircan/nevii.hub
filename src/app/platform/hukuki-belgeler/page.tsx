import { EmptyState, PageHeader } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getEffectiveDocs, getLegalSellerFields } from "@/lib/saas-billing/legal-doc-store";
import { listLegalDocStates } from "@/lib/saas-billing/store";
import { LegalDocsManager } from "@/components/platform/legal-docs-manager";
import { LEGAL_TEMPLATES, renderLegalText } from "@/lib/saas-billing/legal-templates";

export const dynamic = "force-dynamic";

export default async function LegalDocsPage() {
  await requireHyperAdminPage("/platform/hukuki-belgeler");
  const [docs, states, seller] = await Promise.all([
    getEffectiveDocs().catch(() => null),
    listLegalDocStates().catch(() => []),
    getLegalSellerFields().catch(() => null),
  ]);
  if (!docs || !seller) {
    return <EmptyState title="Belgeler yüklenemedi" description="Kayıtlar okunamadı." />;
  }
  const byId = new Map(
    states.map((s) => [s.docId, { ...s, revisions: s.revisions.map((r) => ({ ...r, bodyText: renderLegalText(r.bodyText, seller) })) }])
  );
  return (
    <div>
      <PageHeader
        title="Hukuki Belgeler"
        description="Müşteriye sunulan sözleşme ve bilgilendirme metinlerinin tek yönetim yeri. Her belge için hazır taslak var: Yönet → Hazır taslağı yükle → Taslağı kaydet → hukuki ve ticari onay → Yayınla. Yayınlanan sürüm yerinde değişmez."
      />
      <p className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-4 py-2.5 text-sm text-[var(--color-warning)]">
        Hazır taslaklar kodun gerçek davranışına göre yazıldı; yayından önce bir avukata okutun. Satıcı kimliği
        (unvan, vergi no, adres, MERSİS, KEP) Fatura › E-belgeler › Satıcı profili ekranından metne otomatik yerleşir.
        Zorunlu sözleşmeler yayınlanmadan gerçek satış kapalı kalır.
      </p>
      <LegalDocsManager
        docs={docs.map((d) => ({ ...d, state: byId.get(d.id) ?? null, template: LEGAL_TEMPLATES[d.id] ?? null }))}
      />
    </div>
  );
}
