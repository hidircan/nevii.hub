import Link from "@/components/link";
import { getPublishedCatalog } from "@/lib/platform/commercial-catalog";
import { getPricedPlan } from "@/lib/saas-billing/catalog";
import { formatExVat, getTaxConfig } from "@/lib/saas-billing/tax";
import { formatMinorTR } from "@/lib/saas-billing/types";
import { SATIN_AL_MODULE_DETAILS } from "@/lib/site-content";
import { Reveal } from "@/components/site/reveal";
import { CheckoutSteps } from "@/components/billing/checkout-steps";
import { OrderSummaryRows } from "@/components/billing/order-summary";

export const dynamic = "force-dynamic";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5c3d00] focus-visible:ring-offset-2 focus-visible:ring-offset-white";

function CheckIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0 text-[#5c3d00]" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 8.5 3.5 3.5L13 4.5" />
    </svg>
  );
}

/**
 * Herkese açık satın alma / sipariş ekranı. Giriş İSTEMEZ: müşteri önce
 * ne alacağını (tüm modüller, limitler, fiyat kırılımı, koşullar) görür;
 * sonra bilgiler adımında kaydını oluşturur (çıplak login'e düşmez).
 */
export default async function BuyPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; interval?: string }>;
}) {
  const params = await searchParams;
  const interval = params.interval === "yearly" ? "yearly" : "monthly";
  const { catalog } = await getPublishedCatalog();
  const plan = catalog.plans.find((p) => p.key === params.plan && p.status === "active" && !p.legacy);
  const priced = plan ? await getPricedPlan(plan.key, interval) : null;
  const tax = getTaxConfig();

  if (!plan || !priced) {
    return (
      <div className="nh-site min-h-screen bg-white text-slate-900">
        <main className="mx-auto max-w-2xl px-4 py-16 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Paket bulunamadı</h1>
          <p className="mt-2 text-sm text-slate-600">
            Seçtiğiniz paket yayında değil veya bağlantı eksik. Güncel paketlerden yeniden seçin.
          </p>
          <Link
            href="/#fiyatlandirma"
            className={`mt-6 inline-block rounded-xl bg-[#5c3d00] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#4a3208] ${FOCUS}`}
          >
            Paketlere dön
          </Link>
        </main>
      </div>
    );
  }

  const labelOf = new Map(catalog.modules.map((m) => [m.key, m]));
  const modules = plan.includedModules
    .map((k) => labelOf.get(k))
    .filter((m): m is NonNullable<typeof m> => Boolean(m));
  const buyHref = `/satin-al/bilgiler?plan=${encodeURIComponent(plan.key)}&interval=${interval}`;
  const demoPrice = priced.sandbox && priced.amountMinor > 0;
  const noPrice = !priced.approved && !priced.customQuote;
  const taxMinor = Math.round((priced.amountMinor * tax.rateBps) / 10000);
  const totalMinor = priced.amountMinor + taxMinor;
  const stats = [
    { value: plan.limits.students === null ? "Sınırsız" : String(plan.limits.students), label: "Aktif öğrenci" },
    { value: plan.limits.users === null ? "Sınırsız" : String(plan.limits.users), label: "Operasyon kullanıcısı" },
    { value: plan.limits.branches === null ? "Sınırsız" : String(plan.limits.branches), label: "Şube" },
  ];

  return (
    <div className="nh-site min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className={`rounded-lg text-lg font-extrabold tracking-tight ${FOCUS}`}>NeviiHub</Link>
          <Link href="/#fiyatlandirma" className={`rounded-lg text-sm font-semibold text-[#5c3d00] hover:text-[#4a3208] ${FOCUS}`}>
            ← Tüm paketler
          </Link>
        </div>
      </header>

      {/* Başlık bandı */}
      <div className="relative overflow-hidden border-b border-[#e3d6bc] bg-gradient-to-b from-[#fbf8f2] to-white">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_0%,#fde68a55_0%,#ffffff00_70%)]" />
        <div className="relative mx-auto max-w-5xl px-4 py-10 sm:px-6">
          <Reveal>
            <p className="text-sm text-slate-500">
              <Link href="/#fiyatlandirma" className={`rounded hover:text-slate-800 ${FOCUS}`}>Paketler ve Fiyatlar</Link>
              <span aria-hidden="true"> / </span>
              <span aria-current="page">{plan.label}</span>
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{plan.label}</h1>
              <span className="rounded-full bg-[#efe6d3] px-3 py-1 text-xs font-bold text-[#5c3d00] ring-1 ring-[#e3d6bc]">
                {interval === "yearly" ? "Yıllık" : "Aylık"}
              </span>
            </div>
            {plan.description ? <p className="mt-2 max-w-2xl text-slate-600">{plan.description}</p> : null}
            <div className="mt-5"><CheckoutSteps current={0} /></div>
            {demoPrice ? (
              <p className="mt-5 max-w-2xl rounded-xl bg-[#5c3d00] px-4 py-2.5 text-sm font-medium text-white" role="note">
                ÖRNEK FİYAT — bu tutar demo amaçlıdır, gerçek satış fiyatı değildir.
              </p>
            ) : null}
          </Reveal>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 md:grid-cols-[1fr_320px] lg:grid-cols-[1fr_340px]">
          <div className="space-y-8">
            <Reveal>
              <section aria-labelledby="satin-al-limit" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
                <h2 id="satin-al-limit" className="text-lg font-semibold">Kullanım limitleri</h2>
                <ul className="mt-4 grid gap-3 sm:grid-cols-3">
                  {stats.map((s) => (
                    <li key={s.label} className="rounded-xl bg-gradient-to-b from-[#fbf8f2] to-white p-4 text-center ring-1 ring-[#e3d6bc]">
                      <p className="text-2xl font-bold tabular-nums text-slate-900">{s.value}</p>
                      <p className="mt-1 text-xs font-medium text-slate-600">{s.label}</p>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-slate-500">Limit aşımı veri silmez; yalnız yeni kayıtlar durur.</p>
              </section>
            </Reveal>

            <Reveal delayMs={60}>
              <section aria-labelledby="satin-al-icerik" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
                <h2 id="satin-al-icerik" className="text-lg font-semibold">
                  Bu pakette neler var{" "}
                  <span className="ml-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
                    {modules.length} modül
                  </span>
                </h2>
                {modules.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-600">Bu pakete modül atanmamış.</p>
                ) : (
                  <div className="mt-4 space-y-2">
                    {modules.map((m, i) => {
                      const d = SATIN_AL_MODULE_DETAILS[m.key];
                      return (
                        <details
                          key={m.key}
                          open={i === 0}
                          className="group rounded-xl bg-slate-50 ring-1 ring-slate-100 open:bg-white open:shadow-sm open:ring-slate-200"
                        >
                          <summary className={`flex cursor-pointer list-none items-center gap-2.5 rounded-xl p-3.5 text-sm font-semibold text-slate-900 ${FOCUS}`}>
                            <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-[#5c3d00] transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                              <path d="m4 2 4 4-4 4" />
                            </svg>
                            {m.label}
                          </summary>
                          <p className="px-3.5 pb-3.5 pl-9 text-[13px] leading-relaxed text-slate-600">
                            {d?.detail ?? m.description}
                          </p>
                        </details>
                      );
                    })}
                  </div>
                )}
              </section>
            </Reveal>

            <Reveal delayMs={60}>
              <section aria-labelledby="satin-al-kosul" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
                <h2 id="satin-al-kosul" className="text-lg font-semibold">Ödeme ve yenileme koşulları</h2>
                <ul className="mt-3 space-y-2.5 text-sm text-slate-700">
                  {[priced.renewalNote, "İptalde ödenmiş süre sonuna kadar erişim sürer; dönem ortasında ücret iadesi bu ekrandan yapılmaz."].map((t) => (
                    <li key={t.slice(0, 24)} className="flex gap-2.5">
                      <CheckIcon />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </Reveal>
          </div>

          <Reveal delayMs={120} className="h-fit md:sticky md:top-6">
            <aside aria-labelledby="satin-al-ozet" className="overflow-hidden rounded-2xl border border-[#e3d6bc] bg-white shadow-lg shadow-[#5c3d00]/10">
              <div className="border-b border-[#e3d6bc] bg-gradient-to-b from-[#fbf8f2] to-white px-5 py-4">
                <h2 id="satin-al-ozet" className="text-base font-semibold text-slate-900">Sipariş özeti</h2>
                <div className="mt-3 flex gap-1 rounded-xl bg-slate-200/60 p-1 text-sm font-semibold" role="group" aria-label="Ödeme periyodu">
                  <Link
                    href={`/satin-al?plan=${encodeURIComponent(plan.key)}&interval=monthly`}
                    aria-current={interval === "monthly" ? "true" : undefined}
                    className={`flex-1 rounded-lg px-3 py-1.5 text-center ${interval === "monthly" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                  >
                    Aylık
                  </Link>
                  <Link
                    href={`/satin-al?plan=${encodeURIComponent(plan.key)}&interval=yearly`}
                    aria-current={interval === "yearly" ? "true" : undefined}
                    className={`flex-1 rounded-lg px-3 py-1.5 text-center ${interval === "yearly" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                  >
                    Yıllık
                  </Link>
                </div>
              </div>
              <div className="p-5">
                {priced.customQuote ? (
                  <div>
                    <p className="text-2xl font-bold">Özel teklif</p>
                    <p className="mt-1 text-sm text-slate-600">Bu paket kurumunuza özel fiyatlanır; sepette sabit tutar yoktur.</p>
                    <Link
                      href={`/teklif?plan=${encodeURIComponent(plan.key)}`}
                      className={`mt-4 block rounded-xl bg-[#5c3d00] px-5 py-2.5 text-center text-sm font-semibold text-white hover:bg-[#4a3208] ${FOCUS}`}
                    >
                      Teklif iste
                    </Link>
                  </div>
                ) : noPrice ? (
                  <div>
                    <p className="rounded-xl bg-[#f6f0e4] p-3 text-sm font-medium text-[#5c3d00] ring-1 ring-[#e3d6bc]">
                      Bu paketin onaylı fiyatı henüz yayınlanmadı; satın alma kapalı.
                    </p>
                    <Link
                      href={`/teklif?plan=${encodeURIComponent(plan.key)}`}
                      className={`mt-4 block rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-center text-sm font-semibold text-slate-800 hover:bg-slate-100 ${FOCUS}`}
                    >
                      Fiyat sor / Teklif iste
                    </Link>
                  </div>
                ) : (
                  <div>
                    <OrderSummaryRows
                      planLabel={plan.label}
                      intervalLabel={interval === "yearly" ? "yıllık" : "aylık"}
                      exVatDisplay={formatExVat(priced.amountMinor, priced.currency)}
                      monthlyEquivalentDisplay={interval === "yearly" ? priced.displayMonthlyEquivalent : null}
                      subtotalDisplay={formatMinorTR(priced.amountMinor, priced.currency)}
                      taxLabel={`KDV (${tax.rateLabel}${tax.demo ? ", örnek oran" : ""})`}
                      taxDisplay={formatMinorTR(taxMinor, priced.currency)}
                      totalDisplay={formatMinorTR(totalMinor, priced.currency)}
                      demoNote={tax.demo ? "Örnek vergi hesabı; oran doğrulanmadı." : null}
                    />
                    <Link
                      href={buyHref}
                      className={`mt-5 block rounded-xl bg-[#5c3d00] px-5 py-3.5 text-center text-sm font-semibold text-white shadow-sm hover:bg-[#4a3208] ${FOCUS}`}
                    >
                      Devam et →
                    </Link>
                    <p className="mt-3 flex gap-2 text-xs leading-relaxed text-slate-500">
                      <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 translate-y-0.5" fill="none" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="7" width="10" height="6" rx="1.5" /><path d="M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7" /></svg>
                      Sonraki adımda kurum ve fatura bilgileri; mevcut müşteriler aynı seçimle giriş yapabilir.
                    </p>
                  </div>
                )}
                <div className="mt-5 border-t border-slate-100 pt-4 text-center text-sm">
                  <Link href="/deneme" className={`rounded font-semibold text-[#5c3d00] hover:text-[#4a3208] ${FOCUS}`}>
                    Önce 30 gün ücretsiz dene
                  </Link>
                </div>
              </div>
            </aside>
          </Reveal>
        </div>
      </main>
    </div>
  );
}
