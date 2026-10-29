"use client";

import { useEffect, useState } from "react";
import { setCheckoutPaymentBusy } from "@/components/billing/checkout-timeout-guard";

/**
 * Adım 3 ödeme bölümü (§5): 2 zorunlu kutu (sözleşmeler + otomatik
 * tahsilat, önceden işaretsiz) + bilgilendirme bağlantıları + isteğe bağlı
 * pazarlama izni → "Ödemeyi tamamla" → mock paneli veya dürüst
 * "hazır değil" durumu.
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

export function OrderPayForm({
  token,
  termsText,
  renewalNote,
  totalDisplay,
  documents,
  acceptedVersions,
  providerDisplayName,
  providerTermsUrl,
  docsApproved,
  isMock,
}: {
  token: string;
  termsText: string;
  renewalNote: string;
  totalDisplay: string;
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

  if (providerState?.kind === "not_ready") {
    return (
      <div role="alert" className="rounded-2xl bg-slate-50 p-5 ring-1 ring-slate-200">
        <p className="font-semibold text-slate-900">Ödeme entegrasyonu hazır değil</p>
        <p className="mt-1 text-sm text-slate-600">{providerState.message}</p>
        <p className="mt-2 text-xs text-slate-500">
          Kaydınız ödeme beklemeye devam ediyor; bilgileriniz kaybolmadı. Entegrasyon hazır olduğunda aynı bağlantıdan devam edebilirsiniz.
        </p>
      </div>
    );
  }

  if (providerState?.kind === "mock") {
    return (
      <div className="rounded-2xl bg-slate-900 p-5 ring-1 ring-slate-700">
        <p className="text-sm font-bold uppercase tracking-wider text-amber-300">Mock ödeme — gerçek tahsilat değildir</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          Bu local demo panelidir; kart bilgisi istenmez ve karta dokunulmaz. “Mock ödemeyi tamamla”,
          sağlayıcıdan doğrulanmış bildirim gelmiş gibi simüle eder.
        </p>
        {error ? <p role="alert" className="mt-3 text-sm font-medium text-red-300">{error}</p> : null}
        <button
          type="button"
          onClick={completeMock}
          disabled={busy === "mock"}
          className="mt-4 w-full rounded-xl bg-amber-500 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-60 sm:w-auto sm:px-8"
        >
          {busy === "mock" ? "Tamamlanıyor…" : "Mock ödemeyi tamamla"}
        </button>
      </div>
    );
  }

  const contracts = documents.filter((d) => d.scope === "required");
  const notices = documents.filter((d) => d.scope !== "required");
  const docTitle = (id: string, fallback: string) => documents.find((d) => d.id === id)?.title ?? fallback;
  function openDocById(id: string) {
    const d = documents.find((x) => x.id === id);
    if (d) setOpenDoc(d);
  }
  const docLink = (id: string, fallback: string) => (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openDocById(id);
      }}
      className="rounded font-semibold text-amber-700 underline hover:text-amber-800"
    >
      {docTitle(id, fallback)}
    </button>
  );

  return (
    <div className="space-y-4">
      {!docsApproved ? (
        <p role="status" className="rounded-2xl bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 ring-1 ring-amber-200">
          Demo ortamı: sözleşme metinleri taslak, hukuk incelemesi bekliyor. Bu ödeme simülasyonu
          gerçek tahsilat değildir.
        </p>
      ) : null}
      <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-600 ring-1 ring-slate-200">
        <p className="font-semibold text-slate-800">Bilgilendirme</p>
        <p className="mt-1">
          Bilgileriniz sipariş, ödeme, fatura ve hesap kurulumu için işlenir. Pazarlama izni
          vermedikçe tanıtım için kullanılmaz.
        </p>
      </div>
      <label className="flex cursor-pointer gap-3 rounded-2xl border border-slate-200 bg-white p-4 ring-1 ring-transparent has-checked:border-amber-400 has-checked:ring-amber-200">
        <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-amber-600" />
        <span className="text-sm leading-relaxed">
          {docLink("saas-service-terms", "Abonelik ve Hizmet Sözleşmesi")}’ni ve eklerini (
          {docLink("renewal-cancel-refund", "Yenileme, İptal ve İade Koşulları")},{" "}
          {docLink("dpa-note", "Veri İşleme Sözleşmesi")},{" "}
          {docLink("sla-note", "Hizmet Seviyesi ve Destek Esasları")},{" "}
          {docLink("distance-sales-note", "Ön Bilgilendirme Formu")}) okudum; kurumum adına
          kabul ediyorum. <span className="text-slate-600">{termsText}</span>
        </span>
      </label>
      <label className="flex cursor-pointer gap-3 rounded-2xl border border-slate-200 bg-white p-4 ring-1 ring-transparent has-checked:border-amber-400 has-checked:ring-amber-200">
        <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-amber-600" />
        <span className="text-sm leading-relaxed">
          Otomatik yenileme kapsamında belirtilen dönemlerde tahsilat yapılmasını kabul ediyorum.{" "}
          <span className="text-slate-600">{renewalNote}</span>
          <details
            className="mt-2 rounded-xl bg-slate-50 p-3 text-slate-600 ring-1 ring-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <summary
              className="cursor-pointer font-semibold text-slate-800"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const el = e.currentTarget.parentElement;
                if (el instanceof HTMLDetailsElement) el.open = !el.open;
              }}
            >
              Nasıl çalışır?
            </summary>
            <p className="mt-1">
              {isMock
                ? "Demo ortamı: gerçek kart işlenmez, çekim yetkisi verilmez."
                : `Kart bilgileriniz ${providerDisplayName} altyapısında işlenir; NeviiHub sunucularında kart numarası saklanmaz.`}
              {providerTermsUrl && !isMock ? (
                <>
                  {" "}
                  <a
                    href={providerTermsUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="font-semibold text-amber-700 underline hover:text-amber-800"
                  >
                    Sağlayıcı ödeme koşulları
                  </a>
                </>
              ) : null}
            </p>
          </details>
        </span>
      </label>
      <div className="rounded-2xl bg-slate-50 p-4 text-sm ring-1 ring-slate-200">
        <p className="font-semibold text-slate-800">Sözleşmeler (yukarıdaki kutuda kabul edilir)</p>
        <ul className="mt-2 space-y-1.5">
          {contracts.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => setOpenDoc(d)}
                className="rounded text-left font-medium text-amber-700 underline hover:text-amber-800"
              >
                {d.title}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 font-semibold text-slate-800">Bilgilendirme (okumanız için sunulur, onay kutusu değildir)</p>
        <ul className="mt-2 space-y-1.5">
          {notices.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => setOpenDoc(d)}
                className="rounded text-left font-medium text-amber-700 underline hover:text-amber-800"
              >
                {d.title}
              </button>
            </li>
          ))}
        </ul>
      </div>
      {openDoc ? (
        <div role="dialog" aria-modal="true" aria-labelledby="doc-modal-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3 id="doc-modal-title" className="text-lg font-semibold text-slate-900">{openDoc.title}</h3>
            <p className="mt-1 text-xs text-slate-500">
              Sürüm {openDoc.version} · kabul kaydında saklanır
              {openDoc.draft ? " · Taslak: hukuki incelemesi sürüyor" : ""}
            </p>
            {openDoc.bodyText ? (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{openDoc.bodyText}</p>
            ) : (
              <>
                <p className="mt-3 text-sm leading-relaxed text-slate-700">{openDoc.about}</p>
                <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 ring-1 ring-slate-200">
                  Bu belgenin tam metni hukukçu incelemesinden geçtikten sonra burada yayımlanacak.
                  Ödeme adımında bu sürümün sunulduğu kaydedilir.
                </p>
              </>
            )}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              {openDoc.bodyText ? (
                <button
                  type="button"
                  onClick={() => {
                    const blob = new Blob([`${openDoc.title}\nSürüm ${openDoc.version}\n\n${openDoc.bodyText}`], { type: "text/plain;charset=utf-8" });
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = `${openDoc.id}-${openDoc.version}.txt`;
                    a.click();
                    URL.revokeObjectURL(a.href);
                  }}
                  className="w-full rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-100"
                >
                  Metni indir
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setOpenDoc(null)}
                autoFocus
                className="w-full rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <label className="flex cursor-pointer gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-amber-600" />
        <span className="text-sm leading-relaxed text-slate-600">
          {docLink("marketing-consent", "Ticari elektronik ileti")} kapsamında yenilik ve kampanyalardan
          e-postayla haberdar olmak istiyorum (isteğe bağlı; dilediğimde geri alabilirim).
        </span>
      </label>
      {error ? <p role="alert" className="text-sm font-medium text-red-700">{error}</p> : null}
      <button
        type="button"
        onClick={pay}
        disabled={busy === "pay" || !terms || !recurring}
        title={!terms || !recurring ? "Devam etmek için iki zorunlu onayı işaretleyin." : undefined}
        className="w-full rounded-xl bg-amber-600 px-5 py-3.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-8"
      >
        {busy === "pay" ? "Ödeme başlatılıyor…" : `Ödemeyi tamamla (${totalDisplay})`}
      </button>
    </div>
  );
}
