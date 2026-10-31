"use client";

import { useEffect, useState, type ReactNode } from "react";
import { FileText, Lock, RotateCcw } from "lucide-react";
import { setCheckoutPaymentBusy } from "@/components/billing/checkout-timeout-guard";
import { printText } from "@/lib/print-text";

/**
 * Adım 3 ödeme bölümü (§5): 2 zorunlu kutu (sözleşmeler + otomatik tahsilat, önceden işaretsiz) + bilgilendirme
 * bağlantıları + isteğe bağlı pazarlama izni → "Ödemeyi tamamla" → mock paneli veya dürüst "hazır değil" durumu.
 * Solda bilgiler ve onaylar, sağda tutar ve ödeme düğmesi: düğme tutarın hemen altında durur.
 */
export type CheckoutDocItem = {
  id: string;
  title: string;
  version: string;
  scope: string;
  about: string;
  bodyText: string | null;
  /** Yayınlanmamış hazır taslak (müşteriye "taslak" diye gösterilir). */
  draft?: boolean;
};

export type CheckoutSummary = {
  planLabel: string;
  intervalLabel: string;
  exVatDisplay: string;
  taxLabel: string;
  taxDisplay: string;
  totalDisplay: string;
  demoNote: string | null;
};

function ConsentRow({ checked, onChange, required, title, note, children }: {
  checked: boolean;
  onChange: (value: boolean) => void;
  required?: boolean;
  title: string;
  note: string;
  children?: ReactNode;
}) {
  return (
    <div className={`rounded-2xl border p-4 transition-colors ${checked ? "border-amber-400 bg-amber-50/60" : "border-slate-200 bg-white"}`}>
      <label className="flex cursor-pointer gap-3">
        <input type="checkbox" checked={checked} aria-required={required} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-amber-600" />
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-3">
            <span className="text-sm font-semibold leading-snug text-slate-900">{title}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${required ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-600"}`}>
              {required ? "Zorunlu" : "İsteğe bağlı"}
            </span>
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-slate-600">{note}</span>
        </span>
      </label>
      {children ? <div className="mt-3 pl-8">{children}</div> : null}
    </div>
  );
}

export function OrderPayForm({
  token,
  termsText,
  renewalNote,
  summary,
  documents,
  acceptedVersions,
  providerDisplayName,
  providerTermsUrl,
  docsApproved,
  isMock,
  children,
}: {
  token: string;
  termsText: string;
  renewalNote: string;
  summary: CheckoutSummary;
  children: ReactNode;
  documents: CheckoutDocItem[];
  acceptedVersions: Record<string, string>;
  providerDisplayName: string;
  providerTermsUrl: string | null;
  docsApproved: boolean;
  isMock: boolean;
}) {
  const [terms, setTerms] = useState(false);
  const [recurring, setRecurring] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [openDoc, setOpenDoc] = useState<CheckoutDocItem | null>(null);
  const [busy, setBusy] = useState<"pay" | "mock" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [providerState, setProviderState] = useState<
    | { kind: "mock"; providerReference: string }
    | { kind: "not_ready"; message: string }
    | null
  >(null);

  // Ödeme işlenirken zaman-aşımı perdesi açılmaz (§11).
  useEffect(() => {
    setCheckoutPaymentBusy(busy !== null);
    return () => setCheckoutPaymentBusy(false);
  }, [busy]);

  async function pay() {
    setError(null);
    setBusy("pay");
    try {
      const res = await fetch("/api/v1/billing/orders/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        t: token,
        acceptedTerms: terms,
        acceptedRecurring: recurring,
        marketingConsent: marketing,
        docVersions: acceptedVersions,
      }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { mock?: boolean; providerReference?: string; provider?: string };
        error?: { code?: string; message?: string };
      };
      setBusy(null);
      if (!json.ok) {
        if (json.error?.code === "PROVIDER_NOT_READY") {
          setProviderState({ kind: "not_ready", message: json.error.message ?? "Ödeme entegrasyonu hazır değil." });
          return;
        }
        setError(json.error?.message ?? "Ödeme başlatılamadı.");
        return;
      }
      if (json.data?.mock) {
        setProviderState({ kind: "mock", providerReference: json.data.providerReference ?? "" });
      } else {
        setProviderState({ kind: "not_ready", message: `Sağlayıcı (${json.data?.provider ?? "?"}) akışı bu ekranda tamamlanamadı.` });
      }
    } catch {
      setBusy(null);
      setError("Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.");
    }
  }

  async function completeMock() {
    setError(null);
    setBusy("mock");
    try {
      const res = await fetch("/api/v1/billing/mock/complete-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: token }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { setupPath?: string | null };
        error?: { message?: string };
      };
      if (!json.ok) {
        setBusy(null);
        setError(json.error?.message ?? "Mock ödeme tamamlanamadı.");
        return;
      }
      const setup = json.data?.setupPath ?? "";
      sessionStorage.setItem(`order_setup:${token.slice(0, 16)}`, setup);
      window.location.href = `/satin-al/sonuc?t=${encodeURIComponent(token)}`;
    } catch {
      setBusy(null);
      setError("Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.");
    }
  }

  const openDocById = (id: string) => {
    const d = documents.find((x) => x.id === id);
    if (d) setOpenDoc(d);
  };
  const docChip = (id: string, label: string) => (
    <li key={id}>
      <button
        type="button"
        onClick={() => openDocById(id)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 hover:border-amber-400 hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
      >
        <FileText aria-hidden className="h-3.5 w-3.5 shrink-0 text-amber-700" />
        {label}
      </button>
    </li>
  );
  const docLink = (id: string, label: string) => (
    <button type="button" onClick={() => openDocById(id)} className="rounded font-medium text-amber-800 underline underline-offset-2 hover:text-amber-900">
      {label}
    </button>
  );
  const remaining = (terms ? 0 : 1) + (recurring ? 0 : 1);

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_370px]">
      <div className="min-w-0 space-y-6">
        {children}

        <section aria-labelledby="onaylar" className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-amber-900/10 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="onaylar" className="text-xl">Onaylar</h2>
            <p aria-live="polite" className={`rounded-full px-3 py-1 text-xs font-semibold ${remaining === 0 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
              {remaining === 0 ? "Zorunlu onaylar tamam" : `${2 - remaining} / 2 zorunlu onay`}
            </p>
          </div>
          {!docsApproved ? (
            <p role="status" className="mt-4 rounded-xl bg-amber-50 px-4 py-2.5 text-xs leading-relaxed text-amber-900 ring-1 ring-amber-200">
              Demo ortamı: sözleşme metinleri taslak, hukuk incelemesi bekliyor. Bu ödeme simülasyonu gerçek tahsilat değildir.
            </p>
          ) : null}
          <div className="mt-5 space-y-3">
            <ConsentRow
              checked={terms}
              onChange={setTerms}
              required
              title="Abonelik ve Hizmet Sözleşmesi’ni ve eklerini okudum, kurumum adına kabul ediyorum."
              note={termsText}
            >
              <ul className="flex flex-wrap gap-2">
                {docChip("saas-service-terms", "Abonelik ve Hizmet Sözleşmesi")}
                {docChip("renewal-cancel-refund", "Yenileme, İptal ve İade")}
                {docChip("dpa-note", "Veri İşleme Sözleşmesi")}
                {docChip("sla-note", "Hizmet Seviyesi ve Destek")}
                {docChip("distance-sales-note", "Ön Bilgilendirme Formu")}
              </ul>
            </ConsentRow>
            <ConsentRow
              checked={recurring}
              onChange={setRecurring}
              required
              title="Otomatik yenileme kapsamında belirtilen dönemlerde tahsilat yapılmasını kabul ediyorum."
              note={renewalNote}
            />
            <ConsentRow
              checked={marketing}
              onChange={setMarketing}
              title="Yenilik ve kampanyalardan e-postayla haberdar olmak istiyorum."
              note="Dilediğiniz zaman geri alabilirsiniz; ödemenizi etkilemez."
            >
              <ul className="flex flex-wrap gap-2">{docChip("marketing-consent", "Ticari Elektronik İleti Onay Metni")}</ul>
            </ConsentRow>
          </div>
          <p className="mt-5 text-xs leading-relaxed text-slate-500">
            Bilgileriniz sipariş, ödeme, fatura ve hesap kurulumu için işlenir. Pazarlama izni vermedikçe tanıtım için kullanılmaz. Ayrıntılar:{" "}
            {docLink("kvkk-notice", "KVKK Aydınlatma Metni")} ve {docLink("privacy-policy", "Gizlilik, Bilgi Güvenliği ve Veri Saklama Esasları")}.
          </p>
        </section>
      </div>

      <aside aria-label="Sipariş özeti" className="lg:sticky lg:top-6">
        <div className="overflow-hidden rounded-3xl bg-white shadow-xl shadow-amber-950/10 ring-1 ring-amber-900/10">
          <div className="relative overflow-hidden bg-[#5c3d00] px-6 py-6 text-white">
            <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full opacity-70 blur-2xl" style={{ background: "radial-gradient(closest-side, #a56a00, transparent)" }} />
            <p className="relative text-xs font-bold uppercase tracking-[0.14em] text-amber-300">Ödenecek toplam</p>
            <p className="relative mt-2 whitespace-nowrap text-[2.25rem] font-semibold leading-none tabular-nums">{summary.totalDisplay}</p>
            <p className="relative mt-2 text-sm text-white/75">KDV dahil · {summary.planLabel}, {summary.intervalLabel}</p>
          </div>
          <div className="p-6">
            <dl className="space-y-2.5 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-600">{summary.planLabel} paketi ({summary.intervalLabel})</dt>
                <dd className="shrink-0 whitespace-nowrap font-medium tabular-nums">{summary.exVatDisplay}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-600">{summary.taxLabel}</dt>
                <dd className="shrink-0 whitespace-nowrap font-medium tabular-nums">{summary.taxDisplay}</dd>
              </div>
            </dl>
            {summary.demoNote ? <p className="mt-2 text-xs text-slate-500">{summary.demoNote}</p> : null}

            <div className="mt-5 border-t border-slate-100 pt-5">
              {providerState?.kind === "not_ready" ? (
                <div role="alert" className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <p className="text-sm font-semibold text-slate-900">Ödeme entegrasyonu hazır değil</p>
                  <p className="mt-1 text-sm text-slate-600">{providerState.message}</p>
                  <p className="mt-2 text-xs text-slate-500">Kaydınız ödeme beklemeye devam ediyor; bilgileriniz kaybolmadı. Entegrasyon hazır olduğunda aynı bağlantıdan devam edebilirsiniz.</p>
                </div>
              ) : providerState?.kind === "mock" ? (
                <div className="rounded-2xl bg-slate-900 p-4 ring-1 ring-slate-700">
                  <p className="text-xs font-bold uppercase tracking-wider text-amber-300">Mock ödeme: gerçek tahsilat değildir</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">Bu demo panelidir; kart bilgisi istenmez ve karta dokunulmaz. “Mock ödemeyi tamamla”, sağlayıcıdan doğrulanmış bildirim gelmiş gibi simüle eder.</p>
                  {error ? <p role="alert" className="mt-3 text-sm font-medium text-red-300">{error}</p> : null}
                  <button type="button" onClick={completeMock} disabled={busy === "mock"} className="mt-4 w-full rounded-xl bg-amber-500 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-60">
                    {busy === "mock" ? "Tamamlanıyor…" : "Mock ödemeyi tamamla"}
                  </button>
                </div>
              ) : (
                <>
                  {error ? <p role="alert" className="mb-3 text-sm font-medium text-red-700">{error}</p> : null}
                  <button
                    type="button"
                    onClick={pay}
                    disabled={busy === "pay" || remaining > 0}
                    className="w-full rounded-xl bg-amber-600 px-5 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
                  >
                    {busy === "pay" ? "Ödeme başlatılıyor…" : "Ödemeyi tamamla"}
                  </button>
                  <p className="mt-2 text-center text-xs text-slate-500">
                    {remaining > 0 ? `Devam etmek için ${remaining} zorunlu onay kaldı.` : "Onaylarınız tarih ve belge sürümüyle kayda geçer."}
                  </p>
                </>
              )}
            </div>

            <ul className="mt-5 space-y-2.5 text-xs leading-relaxed text-slate-600">
              <li className="flex gap-2">
                <Lock aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
                <span>
                  {isMock ? "Demo ortamı: gerçek kart işlenmez, çekim yetkisi verilmez." : `Kart bilgileriniz ${providerDisplayName.replace(/^Ödeme/, "ödeme")} altyapısında işlenir; NeviiHub sunucularında kart numarası saklanmaz.`}
                  {providerTermsUrl && !isMock ? (
                    <>
                      {" "}
                      <a href={providerTermsUrl} target="_blank" rel="noreferrer" className="font-medium text-amber-800 underline underline-offset-2">Ödeme koşulları</a>
                    </>
                  ) : null}
                </span>
              </li>
              <li className="flex gap-2">
                <RotateCcw aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
                <span>Dilediğinizde iptal edebilirsiniz; ödenmiş süre sonuna kadar erişiminiz sürer.</span>
              </li>
            </ul>
          </div>
        </div>
      </aside>

      {openDoc ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="doc-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpenDoc(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpenDoc(null);
          }}
        >
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-6 py-5">
              <p id="doc-modal-title" className="text-lg font-semibold text-slate-900">{openDoc.title}</p>
              <p className="mt-1 text-xs text-slate-500">
                Sürüm {openDoc.version} · kabul kaydında saklanır
                {openDoc.draft ? " · Taslak: hukuki incelemesi sürüyor" : ""}
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {openDoc.bodyText ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{openDoc.bodyText}</p>
              ) : (
                <>
                  <p className="text-sm leading-relaxed text-slate-700">{openDoc.about}</p>
                  <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 ring-1 ring-slate-200">
                    Bu belgenin tam metni hukukçu incelemesinden geçtikten sonra burada yayımlanacak. Ödeme adımında bu sürümün sunulduğu kaydedilir.
                  </p>
                </>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-6 py-4 sm:flex-row sm:justify-end">
              {openDoc.bodyText ? (
                <button type="button" onClick={() => printText(openDoc.title, openDoc.bodyText ?? "")} className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
                  PDF olarak indir
                </button>
              ) : null}
              <button type="button" onClick={() => setOpenDoc(null)} autoFocus className="rounded-xl bg-[#5c3d00] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#4a3208]">
                Kapat
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
