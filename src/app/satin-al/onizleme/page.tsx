import type { CSSProperties, ReactNode } from "react";
import { Lock } from "lucide-react";
import Link from "@/components/link";
import { PlatformLogo } from "@/components/platform-logo";
import { getCheckoutDocContext, getOrderPublicView, getOrderReview } from "@/lib/saas-billing/pending-orders";
import { getPricedPlan, renewalNoteFor } from "@/lib/saas-billing/catalog";
import { CheckoutSteps } from "@/components/billing/checkout-steps";
import { CheckoutTimeoutGuard } from "@/components/billing/checkout-timeout-guard";
import { OrderPayForm } from "@/components/billing/order-pay-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Önizleme ve ödeme | NeviiHub", robots: { index: false, follow: false } };

function Notice({ title, text, href, cta }: { title: string; text: string; href: string; cta: string }) {
  return (
    <div className="nh-site min-h-screen bg-[#fbf8f2] text-slate-900" style={{ "--text-primary": "#0f172a" } as CSSProperties}>
      <main className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="text-3xl">{title}</h1>
        <p className="mt-3 text-sm text-slate-600">{text}</p>
        <Link href={href} className="mt-6 inline-block rounded-xl bg-amber-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-amber-700">
          {cta}
        </Link>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

/**
 * Satın alma 3. adım: bilgileri kontrol, onaylar, ödeme (token'lı). Fiyat sunucuda yeniden çözülür.
 */
export default async function OrderPreviewPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const token = (await searchParams).t ?? "";
  const missing = (
    <Notice title="Kayıt bulunamadı" text="Bağlantı eksik veya süresi dolmuş. Paket seçiminden yeniden başlayın." href="/#fiyatlandirma" cta="Paketlere dön" />
  );
  const view = await getOrderPublicView({ token });
  if (!view.ok) return missing;
  const o = view.data;
  if (o.status === "paid") {
    return <Notice title="Bu kayıt zaten ödendi" text="Sonuç ekranından devam edebilirsiniz." href={`/satin-al/sonuc?t=${encodeURIComponent(token)}`} cta="Sonuç ekranına git" />;
  }
  const review = await getOrderReview({ token });
  if (!review.ok) return missing;
  const r = review.data;
  const b = r.billing;
  const plan = await getPricedPlan(o.planKey, o.interval);
  const docCtx = await getCheckoutDocContext();
  const intervalLabel = o.interval === "yearly" ? "yıllık" : "aylık";
  const editHref = `/satin-al/bilgiler?t=${encodeURIComponent(token)}`;
  const address = [b.addressLine, [b.district, b.city].filter(Boolean).join(" / "), b.country].filter(Boolean).join(", ");

  const details = (
    <section aria-labelledby="bilgileriniz" className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-amber-900/10 sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <h2 id="bilgileriniz" className="text-xl">Bilgileriniz</h2>
        <Link href={editHref} className="rounded-lg border border-slate-300 px-3.5 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
          Düzenle
        </Link>
      </div>
      <div className="mt-5 grid gap-6 sm:grid-cols-2 sm:gap-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Kurum ve yetkili</p>
          <dl className="mt-3 space-y-3">
            <Field label="Kurum">{r.institutionName}</Field>
            <Field label="Yetkili">{r.ownerName}</Field>
            <Field label="Hesap e-postası">{r.ownerEmail}</Field>
            {r.ownerPhone ? <Field label="Telefon">{r.ownerPhone}</Field> : null}
          </dl>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Fatura</p>
          <dl className="mt-3 space-y-3">
            <Field label="Fatura alıcısı">{b.legalTitle}</Field>
            {b.taxId ? <Field label="Vergi kimlik no">{b.taxId}</Field> : null}
            {b.nationalId ? <Field label="T.C. kimlik no">{b.nationalId}</Field> : null}
            {b.taxOffice ? <Field label="Vergi dairesi">{b.taxOffice}</Field> : null}
            <Field label="Adres">{address}</Field>
            <Field label="Fatura e-postası">{b.invoiceEmail}</Field>
          </dl>
        </div>
      </div>
    </section>
  );

  return (
    <div className="nh-site min-h-screen bg-[#fbf8f2] text-slate-900" style={{ "--text-primary": "#0f172a" } as CSSProperties}>
      <CheckoutTimeoutGuard token={token} validatePath={`/api/v1/billing/orders?t=${encodeURIComponent(token)}`} />
      <header className="border-b border-amber-900/10 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 rounded-lg text-lg font-extrabold tracking-tight">
            <PlatformLogo height={32} />
            NeviiHub
          </Link>
          <p className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
            <Lock aria-hidden className="h-4 w-4 text-amber-700" />
            Güvenli bağlantı
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <CheckoutSteps current={2} />
        <h1 className="mt-6 text-3xl sm:text-4xl">Önizleme ve ödeme</h1>
        <p className="mt-2 text-slate-600">Bilgilerinizi kontrol edin, iki zorunlu onayı işaretleyin ve ödemeyi tamamlayın.</p>
        <div className="mt-8">
          {o.totals ? (
            <OrderPayForm
              token={token}
              termsText={`${o.planLabel} (${intervalLabel}), KDV dahil toplam ${o.totals.displayTotal}.`}
              renewalNote={renewalNoteFor(o.interval)}
              summary={{
                planLabel: o.planLabel,
                intervalLabel,
                exVatDisplay: o.totals.displayExcl,
                taxLabel: `KDV (${o.totals.rateLabel}${o.totals.taxDemo ? ", örnek oran" : ""})`,
                taxDisplay: o.totals.displayTax,
                totalDisplay: o.totals.displayTotal,
                demoNote: o.totals.taxDemo ? "Örnek vergi hesabı; oran doğrulanmadı." : null,
              }}
              documents={docCtx.documents}
              acceptedVersions={docCtx.acceptedVersions}
              providerDisplayName={docCtx.provider.displayName}
              providerTermsUrl={docCtx.provider.termsUrl}
              docsApproved={docCtx.docsApproved}
              isMock={docCtx.isMock}
            >
              {details}
            </OrderPayForm>
          ) : (
            <div className="space-y-6">
              {details}
              <p className="rounded-2xl bg-white p-5 text-sm text-slate-600 ring-1 ring-amber-900/10">
                Paket fiyatı şu an çözülemedi ({plan ? "fiyat yayında değil" : "paket yayında değil"}). Kaydınız ödeme beklemeye devam ediyor, bilgileriniz kaybolmadı.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
