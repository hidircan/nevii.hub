import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSessionContext, homePathForRole } from "@/lib/auth/session";
import { getPublishedCatalog } from "@/lib/platform/commercial-catalog";
import { getPricedPlan } from "@/lib/saas-billing/catalog";
import { formatExVat, getTaxConfig } from "@/lib/saas-billing/tax";
import { formatMinorTR } from "@/lib/saas-billing/types";
import { getBillingProfile } from "@/lib/saas-billing/store";
import { CheckoutSteps } from "@/components/billing/checkout-steps";
import { CheckoutProfileStep } from "@/components/billing/checkout-profile-step";
import { OrderSummaryRows } from "@/components/billing/order-summary";

export const dynamic = "force-dynamic";

/**
 * Mevcut müşteri fatura adımı ("Zaten müşteriyim" kolu). Oturum + kurum
 * sahibi/yöneticisi ŞART — girişsiz gelinirse bilgiler adımına
 * (çıplak login'e değil) yönlendirilir.
 */
export default async function CheckoutInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; interval?: string }>;
}) {
  const params = await searchParams;
  const interval = params.interval === "yearly" ? "yearly" : "monthly";
  const backHref = `/satin-al/bilgiler?plan=${encodeURIComponent(params.plan ?? "")}&interval=${interval}`;
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(backHref);
  }
  if (session.role !== "SUPER_ADMIN" && session.role !== "SCHOOL_ADMIN") {
    redirect(homePathForRole(session.role));
  }
  const { catalog } = await getPublishedCatalog();
  const plan = catalog.plans.find((p) => p.key === params.plan && p.status === "active" && !p.legacy);
  const priced = plan ? await getPricedPlan(plan.key, interval) : null;
  if (!plan || !priced || !priced.approved) {
    redirect(`/satin-al?plan=${encodeURIComponent(params.plan ?? "")}&interval=${interval}`);
  }
  const profile = await getBillingProfile(session.tenantId);
  const tax = getTaxConfig();
  const taxMinor = Math.round((priced.amountMinor * tax.rateBps) / 10000);
  const totalMinor = priced.amountMinor + taxMinor;
  const payHref = `/abonelik?plan=${encodeURIComponent(plan.key)}&interval=${interval}`;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="rounded-lg text-lg font-extrabold tracking-tight">NeviiHub</Link>
          <Link href={backHref} className="rounded-lg text-sm font-semibold text-amber-700 hover:text-amber-800">
            ← Bilgiler adımına dön
          </Link>
        </div>
      </header>

      <div className="border-b border-amber-100 bg-gradient-to-b from-amber-50 to-white">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <p className="text-sm text-slate-500">
            <span>{plan.label}</span>
            <span aria-hidden="true"> / </span>
            <span aria-current="page">Fatura bilgileri</span>
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Fatura bilgileri</h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Belgelerinizdeki alıcı bilgileri. Ödeme öncesi son kez özet gösterilir; profil sonradan
            değişse bile düzenlenmiş belgeler değişmez.
          </p>
          <div className="mt-5"><CheckoutSteps current={1} /></div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 md:grid-cols-[1fr_320px]">
          <section aria-label="Fatura profili" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <CheckoutProfileStep initial={profile} continueHref={payHref} />
          </section>

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
