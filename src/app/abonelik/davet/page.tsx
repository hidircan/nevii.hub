import { redirect } from "next/navigation";
import { requireSessionContext, homePathForRole } from "@/lib/auth/session";
import { getValidInvitation } from "@/lib/saas-billing/neviiads-import";
import { getPricedPlan, prePaymentSummary } from "@/lib/saas-billing/catalog";
import { InvitationCheckout } from "@/components/billing/invitation-checkout";

export const dynamic = "force-dynamic";

/**
 * Davetli checkout sayfası (/abonelik/davet?token=...). Davet doğrulanır
 * (hash + süre + tenant bağı); plan/periyot davetle sabitlenir; ödeme
 * koşulları gösterilir; tek kullanımlık tüketim checkout'ta yapılır.
 */
export default async function InvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/abonelik/davet${token ? `?token=${encodeURIComponent(token)}` : ""}`);
  }
  if (session.role !== "SUPER_ADMIN") {
    redirect(homePathForRole(session.role));
  }
  if (!token) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center">
        <h1 className="text-xl font-semibold">Davet bağlantısı eksik</h1>
        <p className="mt-2 text-sm text-slate-600">Size iletilen bağlantının tamamını kullanın.</p>
      </div>
    );
  }
  const inv = await getValidInvitation({ token, tenantId: session.tenantId });
  if (!inv.ok) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center">
        <h1 className="text-xl font-semibold">Davet geçersiz</h1>
        <p className="mt-2 text-sm text-slate-600">{inv.error.message}</p>
      </div>
    );
  }
  const plan = await getPricedPlan(inv.data.planKey, inv.data.billingInterval);
  if (!plan) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center">
        <h1 className="text-xl font-semibold">Paket bulunamadı</h1>
        <p className="mt-2 text-sm text-slate-600">Davetteki paket artık satışta değil.</p>
      </div>
    );
  }
  const summary = prePaymentSummary(plan);
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Abonelik daveti</h1>
      <p className="mt-1 text-sm text-slate-600">
        {plan.planLabel} — {summary.total} ({summary.period})
      </p>
      <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm ring-1 ring-slate-200">
        <p><strong>Yenileme:</strong> {summary.renewal}</p>
        <p className="mt-1"><strong>Vergi:</strong> {summary.tax}</p>
        {summary.sandbox ? <p className="mt-1 text-amber-800">SANDBOX test tutarıdır.</p> : null}
      </div>
      <div className="mt-5">
        <InvitationCheckout
          token={token}
          planKey={plan.planKey}
          billingInterval={plan.billingInterval}
          approved={plan.approved}
        />
      </div>
    </div>
  );
}
