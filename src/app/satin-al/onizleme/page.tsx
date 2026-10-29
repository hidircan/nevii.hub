import Link from "next/link";
import { getOrderPublicView } from "@/lib/saas-billing/pending-orders";
import { getPricedPlan, renewalNoteFor } from "@/lib/saas-billing/catalog";
import { CheckoutSteps } from "@/components/billing/checkout-steps";
import { OrderSummaryRows } from "@/components/billing/order-summary";
import { OrderPayForm } from "@/components/billing/order-pay-form";

export const dynamic = "force-dynamic";

/**
 * Satın alma 3. adım: Bilgi önizlemesi ve ödemeyi tamamlama (token'lı).
 * Kimlik bilgileri maskeli gösterilir; fiyat sunucuda yeniden çözülür.
 */
export default async function OrderPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const view = await getOrderPublicView({ token: t ?? "" });
  if (!view.ok) {
    return (
      <div className="min-h-screen bg-white text-slate-900">
        <main className="mx-auto max-w-2xl px-4 py-16 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Kayıt bulunamadı</h1>
          <p className="mt-2 text-sm text-slate-600">
            Bağlantı eksik veya süresi dolmuş. Paket seçiminden yeniden başlayın.
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
  const o = view.data;
  if (o.status === "paid") {
    return (
      <div className="min-h-screen bg-white text-slate-900">
        <main className="mx-auto max-w-2xl px-4 py-16 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Bu kayıt zaten ödendi</h1>
          <p className="mt-2 text-sm text-slate-600">Sonuç ekranından devam edebilirsiniz.</p>
          <Link
            href={`/satin-al/sonuc?t=${encodeURIComponent(t ?? "")}`}
            className="mt-6 inline-block rounded-xl bg-amber-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-amber-700"
          >
            Sonuç ekranına git
          </Link>
        </main>
      </div>
    );
  }
  const plan = await getPricedPlan(o.planKey, o.interval);
  const renewalNote = renewalNoteFor(o.interval);
  const editHref = `/satin-al/bilgiler?t=${encodeURIComponent(t ?? "")}`;
  const termsText = o.totals
    ? `${o.planLabel} (${o.interval === "yearly" ? "yıllık" : "aylık"}), KDV dahil toplam ${o.totals.displayTotal}.`
    : `${o.planLabel} (${o.interval === "yearly" ? "yıllık" : "aylık"}).`;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="rounded-lg text-lg font-extrabold tracking-tight">NeviiHub</Link>
          <Link href={editHref} className="rounded-lg text-sm font-semibold text-amber-700 hover:text-amber-800">
            ← Bilgileri düzenle
          </Link>
        </div>
      </header>

      <div className="border-b border-amber-100 bg-gradient-to-b from-amber-50 to-white">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <p className="text-sm text-slate-500">
            <span>{o.planLabel}</span>
            <span aria-hidden="true"> / </span>
            <span aria-current="page">Önizleme ve ödeme</span>
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Önizleme ve ödeme</h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Bilgilerinizi kontrol edin, koşulları onaylayın ve ödemeyi tamamlayın.
          </p>
          <div className="mt-5"><CheckoutSteps current={2} /></div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 md:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <section aria-label="Kayıt özeti" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Kayıt özeti</h2>
                <Link href={editHref} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100">
                  Bilgileri düzenle
                </Link>
              </div>
              <dl className="mt-4 grid gap-x-6 gap-y-2.5 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Kurum</dt><dd className="text-right font-medium">{o.institutionName}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Yetkili</dt><dd className="text-right font-medium">{o.ownerName}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Hesap e-postası</dt><dd className="font-medium">{o.ownerEmailMasked}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Fatura alıcısı</dt><dd className="text-right font-medium">{o.billing.legalTitle}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Vergi kimlik no</dt><dd className="font-medium">{o.billing.taxIdMasked}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Fatura e-postası</dt><dd className="font-medium">{o.billing.invoiceEmailMasked}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Paket</dt><dd className="font-medium">{o.planLabel} ({o.interval === "yearly" ? "yıllık" : "aylık"})</dd></div>
              </dl>
            </section>

            <section aria-label="Onay ve ödeme" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold">Onay ve ödeme</h2>
              {o.totals ? (
                <OrderPayForm
                  token={t ?? ""}
                  termsText={termsText}
                  renewalNote={renewalNote}
                  totalDisplay={o.totals.displayTotal}
                />
              ) : (
                <p className="text-sm text-slate-600">
                  Paket fiyatı şu an çözülemedi ({plan ? "fiyat yayında değil" : "paket yayında değil"}).
                  Kayıt ödeme beklemeye devam ediyor.
                </p>
              )}
            </section>
          </div>

          <aside aria-label="Sipariş özeti" className="h-fit rounded-2xl border border-amber-200/70 bg-white p-5 shadow-lg shadow-amber-900/5 md:sticky md:top-6">
            <h2 className="text-base font-semibold">Sipariş özeti</h2>
            <div className="mt-3">
              {o.totals ? (
                <OrderSummaryRows
                  planLabel={o.planLabel}
                  intervalLabel={o.interval === "yearly" ? "yıllık" : "aylık"}
                  exVatDisplay={o.totals.displayExcl}
                  monthlyEquivalentDisplay={null}
                  taxLabel={`KDV (${o.totals.rateLabel}${o.totals.taxDemo ? ", örnek oran" : ""})`}
                  taxDisplay={o.totals.displayTax}
                  totalDisplay={o.totals.displayTotal}
                  demoNote={o.totals.taxDemo ? "Örnek vergi hesabı; oran doğrulanmadı." : null}
                />
              ) : (
                <p className="text-sm text-slate-600">Fiyat çözülemedi.</p>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
