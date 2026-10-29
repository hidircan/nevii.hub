import Link from "@/components/link";
import { PageHeader, EmptyState } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getEDocumentByOrder, listAllInvoiceOrders } from "@/lib/saas-billing/store";
import { E_DOC_KIND_LABELS, E_DOC_STATUS_LABELS, getSellerSnapshot } from "@/lib/saas-billing/invoicing-orders";
import { formatMinorTR } from "@/lib/saas-billing/types";
import { EDocsManager, type EDocRow } from "@/components/platform/edocs-manager";

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
  const seller = getSellerSnapshot();
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
  const missing = [
    seller.taxId ? null : "vergi kimlik numarası (SAAS_SELLER_TAX_ID)",
    seller.taxOffice ? null : "vergi dairesi (SAAS_SELLER_TAX_OFFICE)",
    seller.addressLine ? null : "adres (SAAS_SELLER_ADDRESS)",
    seller.city ? null : "il (SAAS_SELLER_CITY)",
  ].filter((x): x is string => Boolean(x));
  return (
    <div>
      <PageHeader
        title="Faturalar / e-Belgeler"
        description="NeviiHub SaaS satış belgeleri: sipariş, belge durumu, resmî iletim ve e-posta. Kimlik numaraları bu listede gösterilmez."
      />
      <section aria-label="Satıcı bilgileri" className="mb-6 rounded-[var(--radius-md)] bg-[var(--color-surface)] p-5 border border-[var(--color-border)]">
        <h2 className="text-base font-semibold">Satıcı bilgileri (belgelerdeki NeviiHub kaydı)</h2>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Kaynak: sunucu ortam değişkenleri (SAAS_SELLER_*). Bu ekrandan değiştirilemez; alıcı bilgileri kurumların
          fatura profilinden gelir ve satıcıyla karıştırılmaz.
        </p>
        <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-2"><dt className="text-[var(--color-text-muted)]">Ticaret unvanı</dt><dd className="font-medium">{seller.legalTitle}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-[var(--color-text-muted)]">Vergi kimlik no</dt><dd className="font-medium">{seller.taxId ?? "eksik"}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-[var(--color-text-muted)]">Vergi dairesi</dt><dd className="font-medium">{seller.taxOffice ?? "eksik"}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-[var(--color-text-muted)]">Adres</dt><dd className="font-medium">{[seller.addressLine, seller.city].filter(Boolean).join(", ") || "eksik"}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-[var(--color-text-muted)]">Fatura e-postası</dt><dd className="font-medium">{seller.invoiceEmail}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-[var(--color-text-muted)]">Doğrulama</dt><dd className="font-medium">{seller.verified ? "Tamam" : "Eksik bilgi var — resmî belge düzenlenemez"}</dd></div>
        </dl>
        {missing.length > 0 ? (
          <p className="mt-2 text-xs text-[var(--color-warning)]">Eksikler: {missing.join("; ")}. Gerçek belge için mali müşavir onayı gerekir.</p>
        ) : null}
      </section>
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
