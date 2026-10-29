import Link from "@/components/link";
import { QuoteForm } from "@/components/site/quote-form";

export const dynamic = "force-dynamic";

/**
 * Herkese açık teklif isteği sayfası. Satın alma ve denemeden farklıdır:
 * anında erişim verilmez; istek platforma düşer, ekip dönüş yapar.
 */
export default async function QuotePage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const params = await searchParams;
  const planKey = params.plan && /^[a-z][a-z0-9_]{1,31}$/.test(params.plan) ? params.plan : null;
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">NeviiHub</Link>
          <Link href="/#fiyatlandirma" className="text-sm font-semibold text-amber-700 hover:text-amber-800">
            Paketlere dön
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Teklif isteyin</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Kurumunuza uygun paketi birlikte belirleyelim. İsteğiniz platforma iletilir;
          ekibimiz 1 iş günü içinde sizinle iletişime geçer. Bu form abonelik açmaz,
          kart bilgisi istemez.
          {planKey ? (
            <> İlgilendiğiniz paket: <strong>{planKey}</strong>.</>
          ) : null}
        </p>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <QuoteForm initialPlanKey={planKey} />
        </div>
      </main>
    </div>
  );
}
