import Link from "@/components/link";
import { redirect } from "next/navigation";
import { requireSessionContext, homePathForRole } from "@/lib/auth/session";
import { getEDocumentByOrder, getInvoiceOrder } from "@/lib/saas-billing/store";
import { E_DOC_KIND_LABELS, E_DOC_STATUS_LABELS } from "@/lib/saas-billing/invoicing-orders";
import { formatMinorTR } from "@/lib/saas-billing/types";

export const dynamic = "force-dynamic";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

/** Belge detayı — tenant izolasyonlu; demo önizleme filigranlıdır. */
export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/abonelik/faturalar/${encodeURIComponent(id)}`);
  }
  if (session.role !== "SUPER_ADMIN" && session.role !== "SCHOOL_ADMIN") {
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
        <h2 className="text-base font-semibold">Sipariş özeti (kayıt anı)</h2>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between gap-2"><dt className="text-slate-600">Hizmet dönemi</dt><dd>{fmtDate(order.periodStart)} – {fmtDate(order.periodEnd)}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-slate-600">Alıcı</dt><dd className="text-right">{order.buyer.legalTitle}</dd></div>
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
        </dl>
      </div>

      {doc ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold">Belge durumu</h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between gap-2"><dt className="text-slate-600">Tür</dt><dd>{E_DOC_KIND_LABELS[doc.kind]}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-slate-600">Durum</dt><dd><strong>{E_DOC_STATUS_LABELS[doc.status]}</strong></dd></div>
            {doc.documentNo ? <div className="flex justify-between gap-2"><dt className="text-slate-600">Belge no</dt><dd>{doc.documentNo}</dd></div> : null}
            {doc.transmissionStatus ? <div className="flex justify-between gap-2"><dt className="text-slate-600">Resmî iletim</dt><dd>{doc.transmissionStatus}</dd></div> : null}
            <div className="flex justify-between gap-2">
              <dt className="text-slate-600">E-posta iletimi</dt>
              <dd>{doc.emailStatus === "sent" ? "Gönderildi" : doc.emailStatus === "failed" ? "Gönderilemedi" : doc.emailStatus === "skipped" ? "Atlandı" : "Bekliyor"}</dd>
            </div>
          </dl>
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
