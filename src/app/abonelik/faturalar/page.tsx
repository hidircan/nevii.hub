import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSessionContext, homePathForRole } from "@/lib/auth/session";
import { listTenantInvoiceOrders, getEDocumentByOrder } from "@/lib/saas-billing/store";
import { E_DOC_KIND_LABELS, E_DOC_STATUS_LABELS } from "@/lib/saas-billing/invoicing-orders";
import { formatMinorTR } from "@/lib/saas-billing/types";

export const dynamic = "force-dynamic";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

/** Müşteri Faturalarım — yalnız kendi kurumunun belgeleri. */
export default async function InvoicesPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/abonelik/faturalar");
  }
  if (session.role !== "SUPER_ADMIN" && session.role !== "SCHOOL_ADMIN") {
    redirect(homePathForRole(session.role));
  }
  const orders = await listTenantInvoiceOrders(session.tenantId, 50);
  const docs = await Promise.all(orders.map((o) => getEDocumentByOrder(o.id)));
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <p className="text-sm text-slate-500">
        <Link href="/abonelik" className="hover:text-slate-800">Aboneliğim</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Faturalarım</span>
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Faturalarım</h1>
      <p className="mt-1 text-sm text-slate-600">
        Abonelik ödemelerinize ait belgeler. Ödeme dekontu ile resmî fatura farklıdır;
        düzenlenmemiş belge “gönderildi” diye gösterilmez.
      </p>
      {orders.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm font-medium text-slate-700">Henüz belgeniz yok</p>
          <p className="mt-1 text-sm text-slate-500">Doğrulanmış ödemeleriniz burada listelenir.</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {orders.map((o, i) => {
            const doc = docs[i];
            const pending = !doc || doc.status === "awaiting" || doc.status === "processing";
            return (
              <li key={o.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {o.planLabel} — {o.billingInterval === "yearly" ? "Yıllık" : "Aylık"}
                  </p>
                  <p className="text-sm font-bold tabular-nums">{formatMinorTR(o.totalMinor, o.currency)}</p>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Hizmet dönemi: {fmtDate(o.periodStart)} – {fmtDate(o.periodEnd)} ·{" "}
                  {doc ? E_DOC_KIND_LABELS[doc.kind] : "Belge hazırlanıyor"}
                </p>
                {pending ? (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
                    Ödemeniz alındı. Faturanız hazırlanıyor.
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">
                    Durum: <strong>{doc ? E_DOC_STATUS_LABELS[doc.status] : "—"}</strong>
                    {doc?.documentNo ? ` · Belge no: ${doc.documentNo}` : null}
                  </p>
                )}
                <p className="mt-2 text-sm">
                  <Link href={`/abonelik/faturalar/${o.id}`} className="font-medium text-amber-700 hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600">
                    Detayı görüntüle →
                  </Link>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
