import Link from "@/components/link";
import { getOrderPublicView } from "@/lib/saas-billing/pending-orders";
import { CheckoutSteps } from "@/components/billing/checkout-steps";
import { OrderSummaryRows } from "@/components/billing/order-summary";
import { SetupLinkPanel } from "@/components/billing/setup-link-panel";

export const dynamic = "force-dynamic";

/**
 * Satın alma 5. adım: Ödeme sonucu ve fatura özeti (token'lı).
 * Tarayıcı dönüşü başarı SAYILMAZ — doğrulanmış abonelik/deneme durumu okunur.
 */
export default async function OrderResultPage({
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
  const paid = o.status === "paid" && o.subscription?.status === "active";
  const checking =
    !paid && (o.subscription?.status === "pending" || (o.status === "awaiting_payment" && o.subscription !== null));
  const editHref = `/satin-al/bilgiler?t=${encodeURIComponent(t ?? "")}`;
  const previewHref = `/satin-al/onizleme?t=${encodeURIComponent(t ?? "")}`;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="rounded-lg text-lg font-extrabold tracking-tight">NeviiHub</Link>
          <span className="text-sm text-slate-500">Sipariş sonucu</span>
        </div>
      </header>

      <div className="border-b border-amber-100 bg-gradient-to-b from-amber-50 to-white">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <h1 className="text-3xl font-semibold tracking-tight">
            {paid ? "Ödemeniz başarıyla alındı" : checking ? "Ödemeniz kontrol ediliyor" : "Ödeme tamamlanamadı"}
          </h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            {paid
              ? "Tahsilat doğrulandı; kullanım hakkınız açıldı. Aşağıda sipariş özetiniz ve hesap kurulum adımınız var."
              : checking
                ? "Sağlayıcıdan doğrulama bekleniyor. Bu aşamada yeniden ödeme yapmayın; sayfayı yenileyerek durumu takip edebilirsiniz."
                : "Ödeme başlatılamadı veya yarıda kaldı. Bilgileriniz kaybolmadı; güvenle devam edebilirsiniz."}
          </p>
          <div className="mt-5"><CheckoutSteps current={3} /></div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 md:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            {paid ? (
              <>
                <section aria-label="Ödeme özeti" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-lg font-semibold">Sipariş özeti</h2>
                  <dl className="mt-4 grid gap-x-6 gap-y-2.5 text-sm">
                    <div className="flex justify-between gap-3"><dt className="text-slate-500">Paket</dt><dd className="font-medium">{o.planLabel} ({o.interval === "yearly" ? "yıllık" : "aylık"})</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-slate-500">Kurum</dt><dd className="text-right font-medium">{o.institutionName}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-slate-500">Fatura alıcısı</dt><dd className="text-right font-medium">{o.billing.legalTitle}</dd></div>
                    {o.subscription?.paidThrough ? (
                      <div className="flex justify-between gap-3"><dt className="text-slate-500">Kullanım hakkı bitişi</dt><dd className="font-medium">{new Date(o.subscription.paidThrough).toLocaleDateString("tr-TR")}</dd></div>
                    ) : null}
                  </dl>
                </section>
                <section aria-label="Fatura durumu" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-lg font-semibold">Fatura durumu</h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {!o.invoice || o.invoice.state === "awaiting"
                      ? `Faturanız hazırlanıyor; hazır olduğunda ${o.billing.invoiceEmailMasked} adresine gönderilecek.`
                      : o.invoice.state === "processing"
                        ? "Faturanız düzenleniyor; hazır olduğunda e-posta adresinize gönderilecek."
                        : o.invoice.emailState === "sent"
                          ? "Faturanız e-posta adresinize gönderildi."
                          : "Faturanız düzenlendi; e-posta gönderimi bekleniyor."}
                  </p>
                  {o.invoice?.state === "failed" ? (
                    <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
                      Belge düzenlenirken bir sorun oluştu. Ödemeniz geçerli; yeniden ödeme alınmaz.
                      Destek ekibi belgeyi tamamlayacak.
                    </p>
                  ) : null}
                </section>
                <SetupLinkPanel token={t ?? ""} maskedEmail={o.ownerEmailMasked} />
              </>
            ) : checking ? (
              <section aria-label="Doğrulama bekleniyor" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold">Doğrulama sürüyor</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Ödeme sağlayıcısından bildirim bekleniyor. Onaylandığında aboneliğiniz otomatik etkinleşir.
                  Yeniden ödeme yapmayın — yinelenen bildirimler çift tahsilat üretmez.
                </p>
                <Link href={previewHref} className="mt-4 inline-block rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-100">
                  Önizlemeye dön
                </Link>
              </section>
            ) : (
              <section aria-label="Güvenli devam" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold">Kaldığınız yerden devam edin</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Kaydınız ödeme bekliyor; bilgileriniz korundu. Önizlemeden ödemeyi tekrar deneyebilir
                  veya bilgilerinizi düzenleyebilirsiniz.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={previewHref} className="rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-700">
                    Önizlemeye dön
                  </Link>
                  <Link href={editHref} className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-100">
                    Bilgileri düzenle
                  </Link>
                </div>
              </section>
            )}
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
