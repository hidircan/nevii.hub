import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSessionContext, homePathForRole } from "@/lib/auth/session";
import { getValidInvitation, resolveInvitationCampaign } from "@/lib/saas-billing/neviiads-import";
import { getPricedPlan, prePaymentSummary } from "@/lib/saas-billing/catalog";
import { describeCampaignSchedule, validateCampaignForTenant } from "@/lib/saas-billing/campaigns";
import { getBillingProfile, getSaasCampaign } from "@/lib/saas-billing/store";
import { formatMinorTR, monthlyEquivalentOfYearly } from "@/lib/saas-billing/types";
import { getTaxConfig } from "@/lib/saas-billing/tax";
import { InvitationCheckout } from "@/components/billing/invitation-checkout";
import { TaxLines } from "@/components/billing/tax-lines";

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
  // Davet kampanyası: checkout ile AYNI doğrulama; gösterilen tutar
  // tahsil edilecek tutardır (liste fiyatı değil).
  const invCampaign = await resolveInvitationCampaign(inv.data);
  let campaignView: {
    ok: true;
    name: string;
    listTotal: string;
    payTotal: string;
    payMinor: number;
    schedule: { headline: string; lines: string[] };
    note: string;
  } | { ok: false; error: string } | null = null;
  if (invCampaign) {
    const val = await validateCampaignForTenant({
      code: invCampaign.code,
      tenantId: session.tenantId,
      interval: plan.billingInterval,
      listAmountMinor: plan.amountMinor,
      renewalsUsed: 0,
    });
    if (val.ok) {
      const rec = inv.data.campaignId ? await getSaasCampaign(inv.data.campaignId) : null;
      const schedule = describeCampaignSchedule({
        maxRenewals: rec?.maxRenewals ?? null,
        validTo: rec?.validTo ?? null,
      });
      campaignView = {
        ok: true,
        name: rec?.name ?? invCampaign.code,
        listTotal: summary.total,
        payTotal: formatMinorTR(val.amountMinor, plan.currency),
        payMinor: val.amountMinor,
        schedule,
        note: val.note,
      };
    } else {
      campaignView = { ok: false, error: val.error };
    }
  }
  const billingProfile = await getBillingProfile(session.tenantId);
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Abonelik daveti</h1>
      {!billingProfile ? (
        <p role="alert" className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Ödeme başlatmadan önce <Link href="/abonelik/fatura-bilgilerim" className="font-semibold underline">Fatura Bilgilerinizi</Link> tamamlayın;
          profil olmadan tahsilat başlatılamaz.
        </p>
      ) : null}
      <p className="mt-1 text-sm text-slate-600">
        {plan.planLabel} — {campaignView?.ok ? campaignView.payTotal : summary.total} ({campaignView?.ok && plan.billingInterval === "yearly"
          ? `Yıllık (yılda tek tahsilat, aylık eşdeğer ${formatMinorTR(monthlyEquivalentOfYearly(campaignView.payMinor), plan.currency)})`
          : summary.period})
      </p>
      {campaignView?.ok ? (
        <div className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm ring-1 ring-emerald-200">
          <p><strong>Pilot kampanya:</strong> {campaignView.name}</p>
          <p className="mt-1">Liste fiyatı: <s>{campaignView.listTotal}</s> → <strong>Ödenecek: {campaignView.payTotal}</strong></p>
          <p className="mt-1"><strong>Takvim:</strong> {campaignView.schedule.headline}</p>
          <ul className="mt-1 list-disc pl-5">
            {campaignView.schedule.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mt-1"><strong>Sonrası:</strong> {campaignView.note}</p>
        </div>
      ) : null}
      {campaignView && !campaignView.ok ? (
        <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          Davetinizdeki kampanya şu anda geçerli değil: {campaignView.error} Ödeme bu hâliyle başlatılamaz.
        </div>
      ) : null}
      <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm ring-1 ring-slate-200">
        <p><strong>Yenileme:</strong> {summary.renewal}</p>
        <p className="mt-1"><strong>Vergi:</strong> {summary.tax}</p>
        {summary.sandbox ? <p className="mt-1 text-amber-800">SANDBOX test tutarıdır.</p> : null}
        <div className="mt-1">
          <TaxLines
            amountMinor={campaignView?.ok ? campaignView.payMinor : plan.amountMinor}
            tax={(() => {
              const t = getTaxConfig();
              return { rateBps: t.rateBps, rateLabel: t.rateLabel, demo: t.demo };
            })()}
          />
        </div>
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
