import Link from "@/components/link";
import { SUBSCRIPTION_INACTIVE_MESSAGE } from "@/lib/saas-billing/enforcement";

/**
 * "Kurum aboneliği etkin değil" ekranı — rol güvenli.
 * Finansal detay (tutar, borç, kart) İÇERMEZ; yetkisiz rollere yalnızca
 * genel mesaj + kurum yöneticisine yönlendirme gösterilir.
 */
export function SubscriptionInactive({
  canManageBilling,
  kurumName,
}: {
  /** billing:read izni olan roller (SUPER_ADMIN/SCHOOL_ADMIN). */
  canManageBilling: boolean;
  kurumName?: string | null;
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 py-12 text-center">
      <div
        aria-hidden
        className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-2xl"
      >
        ⏸
      </div>
      <h1 className="mt-5 text-xl font-semibold tracking-tight text-slate-900">
        Kurum aboneliği etkin değil
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        {kurumName ? <strong>{kurumName}</strong> : "Kurumunuzun"} {SUBSCRIPTION_INACTIVE_MESSAGE}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        Verileriniz korunur; hiçbir kayıt silinmez.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {canManageBilling ? (
          <>
            <Link
              href="/abonelik"
              className="rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-700"
            >
              Ödeme ekranına git
            </Link>
            <Link
              href="/#iletisim"
              className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Destek
            </Link>
          </>
        ) : (
          <p className="text-sm text-slate-600">
            Devam etmek için lütfen kurum yöneticinizle görüşün.
          </p>
        )}
      </div>
    </div>
  );
}
