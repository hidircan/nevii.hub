import Link from "@/components/link";
import { getPublishedCatalog } from "@/lib/platform/commercial-catalog";
import { getPricedPlan } from "@/lib/saas-billing/catalog";
import { formatExVat, getTaxConfig } from "@/lib/saas-billing/tax";
import { formatMinorTR } from "@/lib/saas-billing/types";
import { getOrderByToken } from "@/lib/saas-billing/pending-orders";
import { CheckoutSteps } from "@/components/billing/checkout-steps";
import { OrderInfoForm } from "@/components/billing/order-info-form";
import { OrderSummaryRows } from "@/components/billing/order-summary";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

/**
 * Satın alma 2. adım: Kurum ve fatura bilgileri (giriş İSTEMEZ).
 * ?t= ile düzenleme kipinde açılır (Adım 3 "Bilgileri düzenle" dönüşü).
 */
export default async function OrderInfoPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; interval?: string; t?: string }>;
}) {
  const params = await searchParams;
  const editToken = (params.t ?? "").trim() || null;
  let editOrder = null;
  if (editToken) {
    const r = await getOrderByToken({ token: editToken });
    if (!r.ok || r.data.status !== "awaiting_payment") {
      return (
        <div className="min-h-screen bg-white text-slate-900">
          <main className="mx-auto max-w-2xl px-4 py-16 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Kayıt bulunamadı</h1>
            <p className="mt-2 text-sm text-slate-600">
              Bağlantının süresi dolmuş olabilir. Paket seçiminden yeniden başlayın.
            </p>
            <Link
              href="/#fiyatlandirma"
              className="mt-6 inline-block rounded-xl bg-amber-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-amber-700"
            >
              Paketlere dön
            </Link>
          </main>
        </div>
      );
    }
    editOrder = r.data;
  }

  const interval = (editOrder?.interval ?? params.interval) === "yearly" ? "yearly" : "monthly";
  const planKey = editOrder?.planKey ?? params.plan;
  const { catalog } = await getPublishedCatalog();
  const plan = catalog.plans.find((p) => p.key === planKey && p.status === "active" && !p.legacy);
  const priced = plan ? await getPricedPlan(plan.key, interval) : null;
  const tax = getTaxConfig();

  if (!plan || !priced || !priced.approved) {
    return (
      <div className="min-h-screen bg-white text-slate-900">
        <main className="mx-auto max-w-2xl px-4 py-16 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Bu seçimle devam edilemiyor</h1>
          <p className="mt-2 text-sm text-slate-600">
            Paket yayında değil veya onaylı fiyatı yok. Güncel paketlerden yeniden seçin.
          </p>
          <Link
            href="/#fiyatlandirma"
            className="mt-6 inline-block rounded-xl bg-amber-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-amber-700"
          >
            Paketlere dön
          </Link>
        </main>
      </div>
    );
  }

  const taxMinor = Math.round((priced.amountMinor * tax.rateBps) / 10000);
  const totalMinor = priced.amountMinor + taxMinor;
  const faturaHref = `/satin-al/fatura?plan=${encodeURIComponent(plan.key)}&interval=${interval}`;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="rounded-lg text-lg font-extrabold tracking-tight">NeviiHub</Link>
          <Link href={`/satin-al?plan=${encodeURIComponent(plan.key)}&interval=${interval}`} className="rounded-lg text-sm font-semibold text-amber-700 hover:text-amber-800">
            ← Paket detayına dön
          </Link>
        </div>
      </header>

      <div className="border-b border-amber-100 bg-gradient-to-b from-amber-50 to-white">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <p className="text-sm text-slate-500">
            <Link href="/#fiyatlandirma" className="rounded hover:text-slate-800">Paketler ve Fiyatlar</Link>
            <span aria-hidden="true"> / </span>
            <span>{plan.label}</span>
            <span aria-hidden="true"> / </span>
            <span aria-current="page">Bilgiler</span>
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            {editOrder ? "Bilgileri düzenle" : "Kurum ve fatura bilgileri"}
          </h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            {editOrder
              ? "Değişiklikleriniz önizlemeye aynen yansır; kayıt ödeme beklemeye devam eder."
              : "Kurum, yetkili ve fatura bilgilerinizi girin. Bu adımda ödeme alınmaz ve parola istenmez."}
          </p>
          <div className="mt-5"><CheckoutSteps current={1} /></div>
          {priced.sandbox && priced.amountMinor > 0 ? (
            <p className="mt-5 max-w-2xl rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-amber-300 ring-1 ring-slate-700" role="note">
              ÖRNEK FİYAT — bu tutar demo amaçlıdır, gerçek satış fiyatı değildir.
            </p>
          ) : null}
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 md:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <section aria-label="Kayıt formu" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <OrderInfoForm
                planKey={plan.key}
                interval={interval}
                editToken={editToken}
                initial={
                  editOrder
                    ? {
                        institutionName: editOrder.institutionName,
                        ownerName: editOrder.ownerName,
                        ownerEmail: editOrder.ownerEmail,
                        ownerPhone: editOrder.ownerPhone ?? "",
                        displayName: editOrder.billing.displayName,
                        recipientType: editOrder.billing.recipientType,
                        legalTitle: editOrder.billing.legalTitle,
                        taxId: editOrder.billing.taxId ?? "",
                        nationalId: editOrder.billing.nationalId ?? "",
                        taxOffice: editOrder.billing.taxOffice ?? "",
                        addressLine: editOrder.billing.addressLine,
                        district: editOrder.billing.district ?? "",
                        city: editOrder.billing.city,
                        country: editOrder.billing.country,
                        invoiceEmail: editOrder.billing.invoiceEmail,
                      }
                    : null
                }
              />
            </section>
            {!editOrder ? (
              <section aria-labelledby="bilgi-giris" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 id="bilgi-giris" className="text-lg font-semibold">Zaten müşteriyim</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Kayıtlı kurum hesabınızla giriş yapın; kayıtlı bilgilerinizle aynı seçimle ödemeye devam edin.
                  Yeni kayıt açılmaz.
                </p>
                <div className="mt-4 max-w-sm"><LoginForm nextPath={faturaHref} /></div>
              </section>
            ) : null}
          </div>

          <aside aria-label="Sipariş özeti" className="h-fit rounded-2xl border border-amber-200/70 bg-white p-5 shadow-lg shadow-amber-900/5 md:sticky md:top-6">
            <h2 className="text-base font-semibold">Sipariş özeti</h2>
            <div className="mt-3">
              <OrderSummaryRows
                planLabel={plan.label}
                intervalLabel={interval === "yearly" ? "yıllık" : "aylık"}
                exVatDisplay={formatExVat(priced.amountMinor, priced.currency)}
                monthlyEquivalentDisplay={interval === "yearly" ? priced.displayMonthlyEquivalent : null}
                taxLabel={`KDV (${tax.rateLabel}${tax.demo ? ", örnek oran" : ""})`}
                taxDisplay={formatMinorTR(taxMinor, priced.currency)}
                totalDisplay={formatMinorTR(totalMinor, priced.currency)}
                demoNote={tax.demo ? "Örnek vergi hesabı; oran doğrulanmadı." : null}
              />
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
