"use client";

import Link from "@/components/link";
import { useState } from "react";
import type {
  SaasAccessDecisionShaped,
  BillingPlanOption,
  SubscriptionView,
  AttemptView,
} from "./billing-view-types";
import { TaxLines } from "./tax-lines";

/** Teknik durum kodları → kullanıcı dili. */
const SUBSCRIPTION_STATUS_TR: Record<string, string> = {
  active: "Aktif",
  trialing: "Denemede",
  pending: "Ödeme bekleniyor",
  incomplete: "Tamamlanmadı",
  past_due: "Ödeme gecikti",
  suspended: "Askıda (ödeme yok)",
  canceled: "İptal edildi",
  expired: "Süresi doldu",
};

/**
 * 24-saat ilk-gün kolaylığı (§9): ilk DOĞRULANMIŞ tahsilattan itibaren 24
 * saat içinde paket değişimi/iade talebi iletilebilir (ticari kolaylık
 * taslağı; yasal haklar ayrıca saklıdır, "iade yok" hükmü YOKTUR).
 * Başlangıç sunucu kaydındaki ödeme zamanıdır (tarayıcı saati değil);
 * yenilemeler süreyi başa sarmaz. Talepler destek üzerinden alınır; iade
 * sağlayıcı onayı SONRASI tamamlanır (doğrulanmadan "iade edildi" denmez).
 */
function FirstDayEase({ attempts }: { attempts: AttemptView[] }) {
  // İlk render anı (sabit; pencere hesabı sunucu kaydındaki ödeme zamanına göre).
  const [now] = useState(() => Date.now());
  const firstPaid = attempts
    .filter((a) => a.kind === "charge" && a.status === "succeeded")
    .map((a) => new Date(a.createdAt).getTime())
    .filter(Number.isFinite)
    .sort((x, y) => x - y)[0];
  if (!firstPaid) return null;
  const deadline = firstPaid + 24 * 3600 * 1000;
  const open = deadline > now;
  const dl = new Date(deadline).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600 ring-1 ring-slate-200">
      {open ? (
        <>
          <strong>İlk-gün kolaylığı:</strong> {dl} tarihine kadar paket değişimi veya iade talebi
          iletebilirsiniz. Talebinizi destek üzerinden bildirin; iade sağlayıcı onayı sonrası tamamlanır.
        </>
      ) : (
        <>
          İlk-gün kolaylık süresi doldu. Paket değişimi için dönem bitimine yakın bu ekrandan
          yeniden deneyin veya destek ile iletişime geçin; otomatik iade uygulanmaz.
        </>
      )}
    </p>
  );
}

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
  initialPlanKey,
  initialInterval,
  mockCompleteAvailable,
  tax,
  hasBillingProfile,
}: {
  canWrite: boolean;
  subscription: SubscriptionView | null;
  attempts: AttemptView[];
  access: SaasAccessDecisionShaped;
  plans: BillingPlanOption[];
  /** Ana sayfadan gelen seçim (?plan=&interval=) — geçerliyse korunur. */
  initialPlanKey?: string | null;
  initialInterval?: "monthly" | "yearly" | null;
  /** Local demo: mock webhook simülatörü açıksa pending aboneliği tamamlar. */
  mockCompleteAvailable?: boolean;
  /** Vergi gösterimi (oran etiketi + örnek işareti; tutar sunucuda hesaplanır). */
  tax: { rateBps: number; rateLabel: string; demo: boolean };
  /** Fatura profili tamamlanmış mı? Eksikse checkout sunucuda reddedilir. */
  hasBillingProfile: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [checkoutHtml, setCheckoutHtml] = useState<string | null>(null);
  const [checkoutIsMock, setCheckoutIsMock] = useState(false);
  const [formPost, setFormPost] = useState<{ postUrl: string; fields: Record<string, string> } | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  // §9: değişim formu varsayılan KAPALI — düğmeyle açılır.
  const [showChange, setShowChange] = useState(false);
  const [planKey, setPlanKey] = useState(
    initialPlanKey && plans.some((p) => p.key === initialPlanKey) ? initialPlanKey : (plans[0]?.key ?? "core")
  );
  const [interval, setInterval] = useState<"monthly" | "yearly">(
    initialInterval === "yearly" ? "yearly" : "monthly"
  );
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedRecurring, setAcceptedRecurring] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
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
      setCheckoutIsMock(data.mock === true);
      setFormPost(null);
      setShowCheckout(true);
    } else {
      return;
    }
    setNotice({
      kind: "ok",
      text: data.mock
        ? "MOCK checkout açıldı (gerçek tahsilat değildir). Bu demo alanına gerçek kart bilgisi girmeyin."
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
    const data = (await post("/api/v1/billing/subscription/cancel", {}, "cancel")) as {
      paidThrough?: string | null;
    } | null;
    if (data) {
      setShowCancel(false);
      window.location.reload();
      return;
    }
    // Hata: pencere kapanır, hata ve sonraki adım sayfada görünür.
    setShowCancel(false);
  }

  const lastCharge = attempts
    .filter((a) => a.kind === "charge" && a.status === "succeeded")
    .sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1))[0];
  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

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

      {!hasBillingProfile && canWrite ? (
        <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Ödeme başlatmadan önce <Link href="/abonelik/fatura-bilgilerim" className="font-semibold underline">Fatura Bilgilerinizi</Link> tamamlayın;
          profil olmadan tahsilat başlatılamaz.
        </p>
      ) : null}
      <nav aria-label="Fatura bağlantıları" className="flex flex-wrap gap-2 text-sm">
        <Link href="/abonelik/fatura-bilgilerim" className={btnGhost}>Fatura Bilgilerim</Link>
        <Link href="/abonelik/faturalar" className={btnGhost}>Faturalarım</Link>
      </nav>

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
            <div><dt className="text-slate-500">Paket</dt><dd className="font-medium" title={subscription.planKey}>{subscription.planLabel}</dd></div>
            <div><dt className="text-slate-500">Durum</dt><dd className="font-medium">{SUBSCRIPTION_STATUS_TR[subscription.status] ?? subscription.status}</dd></div>
            <div><dt className="text-slate-500">Periyot</dt><dd className="font-medium">{subscription.billingInterval === "yearly" ? "Yıllık (yılda tek tahsilat)" : "Aylık"}</dd></div>
            <div><dt className="text-slate-500">Dönem tutarı</dt><dd className="font-medium">{subscription.displayTotal}{subscription.sandbox ? " (örnek fiyat)" : ""}</dd></div>
            {subscription.displayMonthlyEquivalent ? (
              <div><dt className="text-slate-500">Aylık eşdeğer</dt><dd className="font-medium">{subscription.displayMonthlyEquivalent} (bilgi amaçlı)</dd></div>
            ) : null}
            <div><dt className="text-slate-500">Ödenmiş kullanım süresi</dt><dd className="font-medium">{subscription.paidThrough ? new Date(subscription.paidThrough).toLocaleDateString("tr-TR") : "—"}</dd></div>
            {subscription.trialEndsAt ? (
              <div><dt className="text-slate-500">Deneme bitışı</dt><dd className="font-medium">{new Date(subscription.trialEndsAt).toLocaleDateString("tr-TR")}</dd></div>
            ) : null}
            <div><dt className="text-slate-500">Kayıtlı ödeme yöntemi</dt><dd className="font-medium">{subscription.paymentOnFile ? `Var (${subscription.provider})` : "Yok"}</dd></div>
            <div><dt className="text-slate-500">Ödeme kanalı</dt><dd className="font-medium">{subscription.provider === "manual" ? "Manuel (banka transferi — otomatik yenileme yok)" : subscription.executionModel === "MERCHANT_SCHEDULED" ? "Kayıtlı kart (otomatik)" : subscription.executionModel === "PROVIDER_MANAGED" ? "Sağlayıcı aboneliği (otomatik)" : "—"}</dd></div>
          </dl>
        )}
        {subscription?.renewalNote ? <p className="mt-3 text-xs leading-relaxed text-slate-500">{subscription.renewalNote}</p> : null}
        {subscription?.taxNote ? <p className="mt-1 text-xs text-slate-500">{subscription.taxNote}</p> : null}
        {subscription && attempts.length > 0 ? <FirstDayEase attempts={attempts} /> : null}
        {subscription?.campaign ? (
          <div className="mt-3 rounded-xl bg-emerald-50 p-4 text-sm ring-1 ring-emerald-200">
            <p><strong>Pilot kampanya:</strong> {subscription.campaign.name}</p>
            <p className="mt-1"><strong>Takvim:</strong> {subscription.campaign.scheduleHeadline}</p>
            <ul className="mt-1 list-disc pl-5">
              {subscription.campaign.scheduleLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {subscription.campaign.afterNote ? (
              <p className="mt-1"><strong>Sonrası:</strong> {subscription.campaign.afterNote}</p>
            ) : null}
          </div>
        ) : null}
        {!access.allowed ? (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
            Erişiminiz kısıtlı. Ödemeyi tamamladığınızda otomatik açılır.
          </p>
        ) : access.billingActionRequired ? (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
            Ödeme işleminiz dikkat gerektiriyor. Kartınızı kontrol edin veya borcunuzu ödeyin.
          </p>
        ) : null}
        {canWrite && subscription && subscription.status === "pending" && mockCompleteAvailable ? (
          <div className="mt-4">
            <button
              onClick={async () => { const d = await post("/api/v1/billing/mock/complete", {}, "mock-complete"); if (d) window.location.reload(); }}
              disabled={busy === "mock-complete"}
              className={btn}
            >
              {busy === "mock-complete" ? "Tamamlanıyor…" : "Mock ödemeyi tamamla (demo)"}
            </button>
            <p className="mt-1 text-xs text-slate-500">Local demo simülatörü: gerçek tahsilat yapmaz, aboneliği active duruma geçirir.</p>
          </div>
        ) : null}
        {subscription?.cancelAtPeriodEnd && subscription.paidThrough ? (
          <p role="status" className="mt-3 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900 ring-1 ring-sky-200">
            İptal planlandı: {fmtDateTime(subscription.paidThrough)} tarihine kadar kullanmaya devam
            edebilirsiniz. Sonraki otomatik yenileme yapılmayacak.
          </p>
        ) : null}
        {canWrite && subscription && (subscription.status === "active" || subscription.status === "past_due") && !subscription.cancelAtPeriodEnd ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={updateCard} disabled={busy === "card"} className={btnGhost}>
              {busy === "card" ? "Açılıyor…" : "Kartı güncelle"}
            </button>
            <button onClick={() => setShowCancel(true)} disabled={busy === "cancel"} className={btnGhost}>
              Dönem sonunda iptal et
            </button>
          </div>
        ) : null}
        {showCancel && subscription ? (
          <div role="dialog" aria-modal="true" aria-labelledby="cancel-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
            <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
              <h3 id="cancel-title" className="text-lg font-semibold text-slate-900">Dönem sonunda iptal</h3>
              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between gap-2"><dt className="text-slate-500">Paket</dt><dd className="font-medium">{subscription.planLabel} ({subscription.billingInterval === "yearly" ? "yıllık" : "aylık"})</dd></div>
                {subscription.paidThrough ? (
                  <div className="flex justify-between gap-2"><dt className="text-slate-500">Erişim bitişi</dt><dd className="font-medium">{fmtDateTime(subscription.paidThrough)}</dd></div>
                ) : null}
                {lastCharge ? (
                  <div className="flex justify-between gap-2"><dt className="text-slate-500">Son tahsilat</dt><dd className="font-medium">{lastCharge.displayAmount} · {fmtDateTime(lastCharge.createdAt)}</dd></div>
                ) : null}
              </dl>
              <div className="mt-3 space-y-2 text-sm leading-relaxed text-slate-700">
                {subscription.paidThrough ? (
                  <p><strong>{fmtDateTime(subscription.paidThrough)} tarihine kadar kullanmaya devam edebilirsiniz.</strong></p>
                ) : null}
                <p>İptal doğrulandığında sonraki otomatik yenileme yapılmaz. Devam eden bir ödeme işlemi varsa ayrıca sonuçlandırılır; çift çekim yapılmaz.</p>
                <p className="text-slate-600">İptal sonrası otomatik iade uygulanmaz; yasal haklarınız saklıdır. İade talebinizi destek üzerinden iletebilirsiniz.</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => setShowCancel(false)} disabled={busy === "cancel"} className={`${btnGhost} flex-1`}>
                  Vazgeç
                </button>
                <button type="button" onClick={cancel} disabled={busy === "cancel"} autoFocus className={`${btn} flex-1`}>
                  {busy === "cancel" ? "İşleniyor…" : "Dönem sonunda iptal et"}
                </button>
              </div>
            </div>
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
          <h2 className="text-base font-semibold text-slate-900">
            {subscription ? "Paket değişimi" : "Yeni abonelik"}
          </h2>
          {!showChange ? (
            <div className="mt-3">
              <p className="text-sm text-slate-600">
                {subscription
                  ? "Paket veya dönem değişimi ödenmiş sürenizi etkilemez. Ödenmiş dönem sürerken değişim kaydı açılamaz; dönem bitimine yakın yeniden deneyin veya destek ile iletişime geçin."
                  : "Paket ve dönem seçerek aboneliğinizi başlatın."}
              </p>
              <button type="button" onClick={() => setShowChange(true)} className={`${btn} mt-3`}>
                {subscription ? "Paketimi değiştir" : "Abonelik başlat"}
              </button>
            </div>
          ) : (
          <>
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
                ) : (
                  <TaxLines amountMinor={selectedPrice.amountMinor} tax={tax} />
                )}
                {selectedPlan?.description ? (
                  <p className="mt-1 text-xs font-medium text-slate-600">{selectedPlan.description}</p>
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
                kabul ediyorum. Kart numaram NeviiHub sunucularında saklanmaz;
                ödeme adımında doğrudan sağlayıcıya iletilir.
              </span>
            </label>
            <button type="submit" disabled={busy === "checkout" || !selectedPrice?.approved} className={btn}>
              {busy === "checkout" ? "Açılıyor…" : "Güvenli ödemeye geç"}
            </button>
          </form>
          {showCheckout && checkoutHtml ? (
            <div className="mt-4 rounded-lg ring-1 ring-slate-200">
              {checkoutIsMock ? (
                <p className="rounded-t-lg bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 ring-1 ring-amber-200" role="note">
                  MOCK ödeme alanı (gerçek tahsilat değildir). Bu demo alanına gerçek kart bilgisi girmeyin.
                </p>
              ) : null}
              <div id="provider-checkout-form" dangerouslySetInnerHTML={{ __html: checkoutHtml }} />
            </div>
          ) : null}
          {showCheckout && formPost ? (
            <form method="POST" action={formPost.postUrl} className="mt-4 space-y-3 rounded-lg p-4 ring-1 ring-slate-200">
              {Object.entries(formPost.fields).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
              <p className="text-sm text-slate-600">
                Kart bilgileriniz bu formdan doğrudan ödeme sağlayıcısına iletilir;
                sunucularımızda ve kayıtlarımızda saklanmaz.
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
          </>
          )}
        </section>
      ) : null}

      <section className={card}>
        <h2 className="text-base font-semibold text-slate-900">Ödeme geçmişi</h2>
        {subscription ? (
          <p className="mt-1 text-xs text-slate-500">
            Plan: {subscription.planLabel} ({subscription.billingInterval === "yearly" ? "yıllık" : "aylık"})
            {subscription.billingInterval === "yearly"
              ? " — satın alınan yıllık dönemin KDV hariç bedeli katalog artışından etkilenmez; yenileme fiyatı dönem sonunda güncel katalogdan belirlenir."
              : null}
          </p>
        ) : null}
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
