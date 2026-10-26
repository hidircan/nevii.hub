"use client";

import { useState } from "react";
import type {
  SaasAccessDecisionShaped,
  BillingPlanOption,
  SubscriptionView,
  AttemptView,
} from "./billing-view-types";

/**
 * Kurum sahibi fatura paneli. Tüm yazma işlemleri billing API'lerine gider;
 * kart bilgisi bu sayfaya ASLA girilmez — ödeme sağlayıcının hosted formunda alınır.
 */
export function BillingDashboard({
  canWrite,
  subscription,
  attempts,
  access,
  plans,
}: {
  canWrite: boolean;
  subscription: SubscriptionView | null;
  attempts: AttemptView[];
  access: SaasAccessDecisionShaped;
  plans: BillingPlanOption[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [checkoutHtml, setCheckoutHtml] = useState<string | null>(null);
  const [formPost, setFormPost] = useState<{ postUrl: string; fields: Record<string, string> } | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [planKey, setPlanKey] = useState(plans[0]?.key ?? "core");
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedRecurring, setAcceptedRecurring] = useState(false);
  const [customer, setCustomer] = useState({
    name: "",
    surname: "",
    gsmNumber: "",
    identityNumber: "",
    address: "",
    city: "",
    country: "Türkiye",
  });

  async function post(path: string, body: unknown, label: string) {
    setBusy(label);
    setNotice(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: Record<string, unknown>;
        error?: { message?: string };
      };
      setBusy(null);
      if (!json.ok) {
        setNotice({ kind: "error", text: json.error?.message ?? "İşlem başarısız." });
        return null;
      }
      return json.data ?? {};
    } catch {
      setBusy(null);
      setNotice({ kind: "error", text: "Bağlantı hatası." });
      return null;
    }
  }

  function openCheckoutResult(data: Record<string, unknown> | null) {
    if (!data) return;
    if (data.kind === "form_post" && typeof data.postUrl === "string" && typeof data.fields === "object" && data.fields) {
      setFormPost({ postUrl: data.postUrl, fields: data.fields as Record<string, string> });
      setCheckoutHtml(null);
      setShowCheckout(true);
    } else if (typeof data.checkoutFormContent === "string") {
      setCheckoutHtml(data.checkoutFormContent);
      setFormPost(null);
      setShowCheckout(true);
    } else {
      return;
    }
    setNotice({
      kind: "ok",
      text: data.mock
        ? "MOCK checkout açıldı (gerçek tahsilat değildir)."
        : "Güvenli ödeme formu açıldı. Kart bilgileriniz yalnızca ödeme sağlayıcısına iletilir.",
    });
  }

  async function startCheckout(e: React.FormEvent) {
    e.preventDefault();
    const data = await post("/api/v1/billing/checkout", { planKey, billingInterval: interval, acceptedTerms, acceptedRecurring, customer }, "checkout");
    openCheckoutResult(data);
  }

  async function updateCard() {
    const data = await post("/api/v1/billing/card", {}, "card");
    if (data && typeof data.checkoutFormContent === "string") {
      setCheckoutHtml(data.checkoutFormContent);
      setShowCheckout(true);
    }
  }

  async function cancel() {
    if (!window.confirm("Aboneliği dönem sonunda iptal etmek istiyor musunuz? Ödenmiş süreniz sonuna kadar erişiminiz sürer.")) return;
    const data = await post("/api/v1/billing/subscription/cancel", {}, "cancel");
    if (data) {
      setNotice({ kind: "ok", text: "İptal alındı. Ödenmiş süre sonuna kadar erişiminiz sürer." });
      window.location.reload();
    }
  }

  async function reactivate() {
    const data = await post("/api/v1/billing/subscription/reactivate", {}, "reactivate");
    if (data) {
      setNotice({ kind: "ok", text: "Yeniden etkinleştirme alındı. Ödeme tamamlanınca erişim açılır." });
      window.location.reload();
    }
  }

  async function startTrial() {
    const data = await post("/api/v1/billing/trial", {}, "trial");
    if (data) {
      setNotice({ kind: "ok", text: "30 günlük denemeniz başladı." });
      window.location.reload();
    }
  }

  const setC = (k: keyof typeof customer) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCustomer((c) => ({ ...c, [k]: e.target.value }));
  const input =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-600 focus:outline-none";
  const card = "rounded-xl bg-white p-5 ring-1 ring-slate-200";
  const btn =
    "rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60";
  const btnGhost =
    "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60";

  const selectedPlan = plans.find((p) => p.key === planKey);
  const selectedPrice = interval === "yearly" ? selectedPlan?.yearly : selectedPlan?.monthly;

  return (
    <div className="space-y-5">
      {notice ? (
        <p
          role={notice.kind === "error" ? "alert" : "status"}
          className={`rounded-xl px-4 py-2.5 text-sm ring-1 ${
            notice.kind === "error" ? "bg-red-50 text-red-800 ring-red-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200"
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      <section className={card}>
        <h2 className="text-base font-semibold text-slate-900">Mevcut abonelik</h2>
        {!subscription ? (
          <div className="mt-3">
            <p className="text-sm text-slate-600">Aktif aboneliğiniz yok.</p>
            {canWrite ? (
              <button onClick={startTrial} disabled={busy === "trial"} className={`${btn} mt-3`}>
                {busy === "trial" ? "Başlatılıyor…" : "30 günlük ücretsiz denemeyi başlat"}
              </button>
            ) : null}
          </div>
        ) : (
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">Paket</dt><dd className="font-medium">{subscription.planLabel} ({subscription.planKey})</dd></div>
            <div><dt className="text-slate-500">Durum</dt><dd className="font-medium">{subscription.status}</dd></div>
            <div><dt className="text-slate-500">Periyot</dt><dd className="font-medium">{subscription.billingInterval === "yearly" ? "Yıllık (yılda tek tahsilat)" : "Aylık"}</dd></div>
            <div><dt className="text-slate-500">Dönem tutarı</dt><dd className="font-medium">{subscription.displayTotal}{subscription.sandbox ? " (SANDBOX)" : ""}</dd></div>
            {subscription.displayMonthlyEquivalent ? (
              <div><dt className="text-slate-500">Aylık eşdeğer</dt><dd className="font-medium">{subscription.displayMonthlyEquivalent} (bilgi amaçlı)</dd></div>
            ) : null}
            <div><dt className="text-slate-500">Geçerlilik (paid-through)</dt><dd className="font-medium">{subscription.paidThrough ? new Date(subscription.paidThrough).toLocaleDateString("tr-TR") : "—"}</dd></div>
            {subscription.trialEndsAt ? (
              <div><dt className="text-slate-500">Deneme bitışı</dt><dd className="font-medium">{new Date(subscription.trialEndsAt).toLocaleDateString("tr-TR")}</dd></div>
            ) : null}
            <div><dt className="text-slate-500">Kayıtlı ödeme yöntemi</dt><dd className="font-medium">{subscription.paymentOnFile ? `Var (${subscription.provider})` : "Yok"}</dd></div>
            <div><dt className="text-slate-500">Ödeme kanalı</dt><dd className="font-medium">{subscription.provider === "manual" ? "Manuel (banka transferi — otomatik yenileme yok)" : subscription.executionModel === "MERCHANT_SCHEDULED" ? "Kayıtlı kart (otomatik)" : subscription.executionModel === "PROVIDER_MANAGED" ? "Sağlayıcı aboneliği (otomatik)" : "—"}</dd></div>
          </dl>
        )}
        {subscription?.renewalNote ? <p className="mt-3 text-xs leading-relaxed text-slate-500">{subscription.renewalNote}</p> : null}
        {subscription?.taxNote ? <p className="mt-1 text-xs text-slate-500">{subscription.taxNote}</p> : null}
        {!access.allowed ? (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
            Erişiminiz kısıtlı. Ödemeyi tamamladığınızda otomatik açılır.
          </p>
        ) : access.billingActionRequired ? (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
            Ödeme işleminiz dikkat gerektiriyor. Kartınızı kontrol edin veya borcunuzu ödeyin.
          </p>
        ) : null}
        {canWrite && subscription && (subscription.status === "active" || subscription.status === "past_due") && !subscription.cancelAtPeriodEnd ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={updateCard} disabled={busy === "card"} className={btnGhost}>
              {busy === "card" ? "Açılıyor…" : "Kartı güncelle"}
            </button>
            <button onClick={cancel} disabled={busy === "cancel"} className={btnGhost}>
              {busy === "cancel" ? "İşleniyor…" : "Dönem sonunda iptal et"}
            </button>
          </div>
        ) : null}
        {canWrite && subscription && (subscription.status === "canceled" || subscription.status === "expired" || subscription.status === "suspended") ? (
          <div className="mt-4">
            <button onClick={reactivate} disabled={busy === "reactivate"} className={btn}>
              {busy === "reactivate" ? "İşleniyor…" : "Yeniden etkinleştir"}
            </button>
          </div>
        ) : null}
      </section>

      {canWrite ? (
        <section className={card}>
          <h2 className="text-base font-semibold text-slate-900">Yeni abonelik / paket değişimi</h2>
          <form onSubmit={startCheckout} className="mt-3 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="bd-plan" className="mb-1 block text-sm font-medium text-slate-700">Paket</label>
                <select id="bd-plan" value={planKey} onChange={(e) => setPlanKey(e.target.value)} className={input}>
                  {plans.map((p) => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="bd-interval" className="mb-1 block text-sm font-medium text-slate-700">Periyot</label>
                <select id="bd-interval" value={interval} onChange={(e) => setInterval(e.target.value as "monthly" | "yearly")} className={input}>
                  <option value="monthly">Aylık</option>
                  <option value="yearly">Yıllık (yılda tek tahsilat)</option>
                </select>
              </div>
            </div>
            {selectedPrice ? (
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200">
                <p><strong>{selectedPrice.displayTotal}</strong>
                  {interval === "yearly" && selectedPrice.displayMonthlyEquivalent ? ` (aylık eşdeğer ${selectedPrice.displayMonthlyEquivalent})` : ""}
                  {selectedPrice.sandbox ? " — SANDBOX test tutarı" : ""}</p>
                {!selectedPrice.approved ? (
                  <p className="mt-1 text-amber-800">Bu paketin onaylı fiyatı yok; gerçek checkout kapalı.</p>
                ) : null}
                <p className="mt-1 text-xs text-slate-500">{selectedPrice.renewalNote}</p>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <input required minLength={2} placeholder="Ad" aria-label="Ad" value={customer.name} onChange={setC("name")} className={input} autoComplete="given-name" />
              <input required minLength={2} placeholder="Soyad" aria-label="Soyad" value={customer.surname} onChange={setC("surname")} className={input} autoComplete="family-name" />
              <input required minLength={10} placeholder="GSM (05__ ___ __ __)" aria-label="GSM" value={customer.gsmNumber} onChange={setC("gsmNumber")} className={input} autoComplete="tel" />
              <input required minLength={11} maxLength={11} placeholder="T.C. Kimlik No" aria-label="T.C. Kimlik No" value={customer.identityNumber} onChange={setC("identityNumber")} className={input} inputMode="numeric" />
              <input required minLength={5} placeholder="Fatura adresi" aria-label="Fatura adresi" value={customer.address} onChange={setC("address")} className={`${input} sm:col-span-2`} autoComplete="street-address" />
              <input required minLength={2} placeholder="Şehir" aria-label="Şehir" value={customer.city} onChange={setC("city")} className={input} autoComplete="address-level2" />
              <input required minLength={2} placeholder="Ülke" aria-label="Ülke" value={customer.country} onChange={setC("country")} className={input} autoComplete="country-name" />
            </div>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} className="mt-1" required />
              <span>
                Tutarı, periyodu, yenileme ve iptal koşulunu okudum; kabul ediyorum.
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={acceptedRecurring} onChange={(e) => setAcceptedRecurring(e.target.checked)} className="mt-1" required />
              <span>
                Kartımın güvenli saklanmasını ve her dönem başında otomatik tahsilatı
                kabul ediyorum. Kart bilgilerim yalnızca ödeme sağlayıcısının güvenli
                sayfasında alınır.
              </span>
            </label>
            <button type="submit" disabled={busy === "checkout" || !selectedPrice?.approved} className={btn}>
              {busy === "checkout" ? "Açılıyor…" : "Güvenli ödemeye geç"}
            </button>
          </form>
          {showCheckout && checkoutHtml ? (
            <div className="mt-4 rounded-lg ring-1 ring-slate-200">
              <div id="provider-checkout-form" dangerouslySetInnerHTML={{ __html: checkoutHtml }} />
            </div>
          ) : null}
          {showCheckout && formPost ? (
            <form method="POST" action={formPost.postUrl} className="mt-4 space-y-3 rounded-lg p-4 ring-1 ring-slate-200">
              {Object.entries(formPost.fields).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
              <p className="text-sm text-slate-600">
                Kart bilgileriniz doğrudan ödeme sağlayıcısına iletilir; NeviiHub kart bilginizi görmez.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <input required name="cc_owner" placeholder="Kart üzerindeki isim" aria-label="Kart üzerindeki isim" className={input} autoComplete="cc-name" />
                <input required name="card_number" placeholder="Kart numarası" aria-label="Kart numarası" className={input} inputMode="numeric" autoComplete="cc-number" />
                <input required name="expiry_month" placeholder="AA" aria-label="Son kullanma ayı" className={input} inputMode="numeric" maxLength={2} autoComplete="cc-exp-month" />
                <input required name="expiry_year" placeholder="YYYY" aria-label="Son kullanma yılı" className={input} inputMode="numeric" maxLength={4} autoComplete="cc-exp-year" />
                <input required name="cvv" placeholder="CVV" aria-label="CVV" className={input} inputMode="numeric" maxLength={4} autoComplete="cc-csc" />
              </div>
              <button type="submit" className={btn}>Kartı kaydet ve öde</button>
            </form>
          ) : null}
        </section>
      ) : null}

      <section className={card}>
        <h2 className="text-base font-semibold text-slate-900">Ödeme geçmişi</h2>
        {attempts.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">Henüz ödeme kaydı yok.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3 font-medium">Tarih</th>
                  <th className="py-2 pr-3 font-medium">Dönem</th>
                  <th className="py-2 pr-3 font-medium">Tutar</th>
                  <th className="py-2 pr-3 font-medium">Tür</th>
                  <th className="py-2 font-medium">Durum</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3">{new Date(a.createdAt).toLocaleDateString("tr-TR")}</td>
                    <td className="py-2 pr-3">{new Date(a.periodStart).toLocaleDateString("tr-TR")} – {new Date(a.periodEnd).toLocaleDateString("tr-TR")}</td>
                    <td className="py-2 pr-3">{a.displayAmount}</td>
                    <td className="py-2 pr-3">{a.kind === "charge" ? "Tahsilat" : a.kind === "refund" ? "İade" : "Chargeback"}</td>
                    <td className="py-2">{a.status === "succeeded" ? "Başarılı" : a.status === "failed" ? "Başarısız" : a.status === "voided" ? "Hükümsüz" : "Bekliyor"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Bu liste ödeme bilgisidir; vergi faturası yerine geçmez.
        </p>
      </section>
    </div>
  );
}
