import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Ödeme dönüş sayfası. KRİTİK: bu sayfa "ödeme başarılı" İDDİA ETMEZ —
 * doğrulama webhook ile tamamlanır; burası yalnızca "doğrulama bekleniyor"
 * durumunu açıklar.
 */
export default async function BillingResultPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const error = status === "error";
  return (
    <div className="mx-auto max-w-lg px-4 py-12 text-center">
      <div
        aria-hidden
        className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-2xl ${
          error ? "bg-red-100" : "bg-amber-100"
        }`}
      >
        {error ? "!" : "…"}
      </div>
      <h1 className="mt-5 text-xl font-semibold tracking-tight text-slate-900">
        {error ? "Ödeme başlatılamadı" : "Ödeme doğrulaması bekleniyor"}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        {error
          ? "Ödeme sayfasından dönüş alınamadı. Abonelik sayfasından tekrar deneyebilir veya destek ile iletişime geçebilirsiniz."
          : "Ödeme sağlayıcısından doğrulama bekleniyor. Onaylandığında aboneliğiniz otomatik etkinleşir; bu sayfayı kapatabilirsiniz."}
      </p>
      <div className="mt-6">
        <Link
          href="/abonelik"
          className="rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-700"
        >
          Abonelik sayfasına dön
        </Link>
      </div>
    </div>
  );
}
