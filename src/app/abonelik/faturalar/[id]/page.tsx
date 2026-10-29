import Link from "@/components/link";
import { redirect } from "next/navigation";
import { requireSessionContext, homePathForRole } from "@/lib/auth/session";
import { getEDocumentByOrder, getInvoiceOrder, getSaasAttemptById, getSaasPendingOrderBySubscriptionId } from "@/lib/saas-billing/store";
import { E_DOC_KIND_LABELS, E_DOC_STATUS_LABELS } from "@/lib/saas-billing/invoicing-orders";
import { LEGAL_DOCS } from "@/lib/saas-billing/legal-documents";
import { formatMinorTR } from "@/lib/saas-billing/types";

export const dynamic = "force-dynamic";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

/** Saatler açıkça Türkiye saatiyle (sunucu saat diliminden bağımsız). */
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PROVIDER_TR: Record<string, string> = {
  mock: "Test ödemesi",
  manual: "Banka transferi",
  paytr: "PayTR",
  iyzico: "iyzico",
};

/** Belge detayı — tenant izolasyonlu; demo önizleme filigranlıdır. */
export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/abonelik/faturalar/${encodeURIComponent(id)}`);
  }
  // Owner kararı (2026-10-29): yalnız kurum sahibi (SUPER_ADMIN).
  if (session.role !== "SUPER_ADMIN") {
    redirect(homePathForRole(session.role));
  }
  const order = await getInvoiceOrder(id);
  // Başka kurumun belgesi: yokmuş gibi davran (bilgi sızdırmaz).
  if (!order || order.tenantId !== session.tenantId) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <h1 className="text-xl font-semibold">Belge bulunamadı</h1>
        <p className="mt-2 text-sm text-slate-600">Aradığınız kayıt mevcut değil.</p>
        <p className="mt-4 text-sm">
          <Link href="/abonelik/faturalar" className="font-medium text-amber-700">Faturalarıma dön →</Link>
        </p>
      </div>
    );
  }
  const doc = await getEDocumentByOrder(order.id);
  const demo = doc?.kind === "demo_preview";
  const attempt = await getSaasAttemptById(order.attemptId).catch(() => null);
  const originOrder = await getSaasPendingOrderBySubscriptionId(order.subscriptionId).catch(() => null);
  const consents = originOrder?.consents?.docVersions ? Object.entries(originOrder.consents.docVersions) : [];
  const docTitle = (id: string) => LEGAL_DOCS.find((d) => d.id === id)?.title ?? id;
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <p className="text-sm text-slate-500">
        <Link href="/abonelik/faturalar" className="hover:text-slate-800">Faturalarım</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Belge detayı</span>
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        {order.planLabel} — {fmtDate(order.periodStart)}
      </h1>

      {!doc || doc.status === "awaiting" || doc.status === "processing" ? (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          Ödemeniz alındı. Faturanız hazırlanıyor.
        </p>
      ) : null}
      {doc?.status === "manual_pending" ? (
        <p className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200">
          Belgeniz hazırlanıyor. Kısa süre içinde burada yayınlanacak.
        </p>
      ) : null}
      {doc?.status === "failed" ? (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">
          Belge düzenlenirken bir sorun oluştu. Ödemeniz kayıtlarda güvende; ekibimiz ilgileniyor.
        </p>
      ) : null}

      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Tahsilat bildirimi (ödeme özeti)</h2>
        <p className="mt-1 text-xs text-slate-500">Bu özet GİB faturası veya banka dekontu değildir. Saatler Türkiye saatiyle gösterilir.</p>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between gap-2"><dt className="text-slate-600">Hizmet dönemi</dt><dd>{fmtDate(order.periodStart)} – {fmtDate(order.periodEnd)}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-slate-600">Alıcı</dt><dd className="text-right">{order.buyer.legalTitle}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-slate-600">Satıcı</dt><dd className="text-right">{order.seller.legalTitle}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-slate-600">KDV hariç bedel</dt><dd className="tabular-nums">{formatMinorTR(order.exclMinor, order.currency)}</dd></div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-600">KDV{order.taxRateBps !== null ? ` (%${(order.taxRateBps / 100).toLocaleString("tr-TR")})` : ""}{order.taxDemo ? ", örnek oran" : ""}</dt>
            <dd className="tabular-nums">{order.taxMinor !== null ? formatMinorTR(order.taxMinor, order.currency) : "—"}</dd>
          </div>
          <div className="flex justify-between gap-2 border-t border-slate-100 pt-2 font-semibold">
            <dt>Genel toplam</dt><dd className="tabular-nums">{formatMinorTR(order.totalMinor, order.currency)}</dd>
          </div>
          {order.campaignCode ? (
            <div className="flex justify-between gap-2"><dt className="text-slate-600">Kampanya</dt><dd>{order.campaignCode}</dd></div>
          ) : null}
          <div className="flex justify-between gap-2"><dt className="text-slate-600">Ödeme kanalı</dt><dd>{attempt ? (PROVIDER_TR[attempt.provider] ?? attempt.provider) : "—"}</dd></div>
          {attempt?.providerRef ? <div className="flex justify-between gap-2"><dt className="text-slate-600">İşlem referansı</dt><dd className="font-mono text-xs">{attempt.providerRef}</dd></div> : null}
          {attempt ? <div className="flex justify-between gap-2"><dt className="text-slate-600">Ödeme kaydı</dt><dd>{fmtDateTime(attempt.createdAt)}</dd></div> : null}
          <div className="flex justify-between gap-2"><dt className="text-slate-600">Kayıt zamanı</dt><dd>{fmtDateTime(order.createdAt)}</dd></div>
        </dl>
      </div>

      {doc ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold">Belge durumu</h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between gap-2"><dt className="text-slate-600">Tür</dt><dd>{E_DOC_KIND_LABELS[doc.kind]}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-slate-600">Durum</dt><dd><strong>{E_DOC_STATUS_LABELS[doc.status]}</strong></dd></div>
            {doc.documentNo ? <div className="flex justify-between gap-2"><dt className="text-slate-600">Belge no</dt><dd>{doc.documentNo}</dd></div> : null}
            {doc.ettn ? <div className="flex justify-between gap-2"><dt className="text-slate-600">ETTN</dt><dd className="font-mono text-xs">{doc.ettn}</dd></div> : null}
            {doc.transmissionStatus ? <div className="flex justify-between gap-2"><dt className="text-slate-600">Resmî iletim</dt><dd>{doc.transmissionStatus}</dd></div> : null}
            <div className="flex justify-between gap-2">
              <dt className="text-slate-600">E-posta iletimi</dt>
              <dd>{doc.emailStatus === "sent" ? "Gönderildi" : doc.emailStatus === "failed" ? "Gönderilemedi" : doc.emailStatus === "skipped" ? "Atlandı" : "Bekliyor"}</dd>
            </div>
            <div className="flex justify-between gap-2"><dt className="text-slate-600">Belge kaydı</dt><dd>{fmtDateTime(doc.createdAt)}</dd></div>
          </dl>
        </div>
      ) : null}

      {consents.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold">Kabul edilen sözleşmeler</h2>
          <p className="mt-1 text-xs text-slate-500">Ödeme anında kabul ettiğiniz sürümler (sonradan değişmez).</p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {consents.map(([id, version]) => (
              <li key={id} className="flex justify-between gap-2">
                <span>{docTitle(id)}</span>
                <span className="text-slate-500">sürüm {version}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {demo ? (
        <div className="relative mt-4 overflow-hidden rounded-2xl border-2 border-dashed border-red-300 bg-white p-6 text-center shadow-sm">
          <p aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center rotate-[-12deg] text-2xl font-extrabold uppercase tracking-widest text-red-200">
            Demo — mali belge değildir
          </p>
          <div className="relative">
            <p className="text-sm font-bold uppercase tracking-wide text-red-700">Demo — mali belge değildir</p>
            <p className="mt-2 text-sm text-slate-600">
              Bu önizleme, gerçek ödeme ve entegratör bağlantısı olmadan üretilmiştir.
              Resmî belge numarası veya ETTN içermez.
            </p>
            <p className="mt-3 text-sm"><strong>{order.buyer.legalTitle}</strong></p>
            <p className="text-sm tabular-nums">{formatMinorTR(order.totalMinor, order.currency)} (KDV dahil toplam)</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
