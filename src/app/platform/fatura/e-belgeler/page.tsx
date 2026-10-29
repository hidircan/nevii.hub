import Link from "@/components/link";
import { PageHeader, EmptyState } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getEDocumentByOrder, listAllInvoiceOrders } from "@/lib/saas-billing/store";
import { E_DOC_KIND_LABELS, E_DOC_STATUS_LABELS } from "@/lib/saas-billing/invoicing-orders";
import { getEffectiveSeller } from "@/lib/saas-billing/seller-profile";
import { formatMinorTR } from "@/lib/saas-billing/types";
import { EDocsManager, type EDocRow } from "@/components/platform/edocs-manager";
import { SellerProfileEditor } from "@/components/platform/seller-profile-editor";

export const dynamic = "force-dynamic";

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
}

/** NeviiOS SaaS satış belgeleri — kurumların veli/öğrenci faturaları BURADA DEĞİL. */
export default async function EDocsPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>;
}) {
  await requireHyperAdminPage("/platform/fatura/e-belgeler");
  const { tenant } = await searchParams;
  const { snapshot: seller, sources } = await getEffectiveSeller();
  const orders = await listAllInvoiceOrders(100).catch(() => null);
  if (!orders) {
    return <EmptyState title="Belgeler yüklenemedi" description="Kayıtlar okunamadı." />;
  }
  const rows: EDocRow[] = [];
  for (const o of orders) {
    if (tenant && o.tenantId !== tenant) continue;
    const doc = await getEDocumentByOrder(o.id).catch(() => null);
    rows.push({
      orderId: o.id,
      docId: doc?.id ?? null,
      tenantId: o.tenantId,
      buyerTitle: o.buyer.legalTitle,
      planLabel: o.planLabel,
      interval: o.billingInterval === "yearly" ? "Yıllık" : "Aylık",
      totalDisplay: formatMinorTR(o.totalMinor, o.currency),
      periodDisplay: `${fmt(o.periodStart)} – ${fmt(o.periodEnd)}`,
      kindLabel: doc ? E_DOC_KIND_LABELS[doc.kind] : "Belge açılmadı",
      status: doc?.status ?? "awaiting",
      statusLabel: doc ? E_DOC_STATUS_LABELS[doc.status] : "Düzenleme bekliyor",
      emailLabel: !doc ? "—" : doc.emailStatus === "sent" ? "Gönderildi" : doc.emailStatus === "failed" ? "Gönderilemedi" : doc.emailStatus === "skipped" ? "Atlandı" : "Bekliyor",
      providerRef: doc?.providerRef ?? null,
      error: doc?.error ?? null,
      retryCount: doc?.retryCount ?? 0,
      createdDisplay: fmt(o.createdAt),
    });
  }
  return (
    <div>
      <Link className="text-sm text-[var(--color-primary)] hover:underline" href="/platform/fatura">
        ← Kurum Abonelikleri
      </Link>
      <div className="mt-2">
        <PageHeader
          title="Faturalar / e-Belgeler"
          description="NeviiHub SaaS satış belgeleri: sipariş, belge durumu, resmî iletim ve e-posta. Kimlik numaraları bu listede gösterilmez."
        />
      </div>
      <SellerProfileEditor seller={seller} sources={sources} />
      {tenant ? (
        <p className="mb-4 text-sm text-[var(--color-text-muted)]">
          Kurum süzgeci etkin.{" "}
          <Link href="/platform/fatura/e-belgeler" className="font-semibold text-[var(--color-primary)] hover:underline">
            Tüm belgeleri göster
          </Link>
        </p>
      ) : null}
      <EDocsManager rows={rows} />
    </div>
  );
}
