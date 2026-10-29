"use client";

import { useState } from "react";

/**
 * Adım 3 ödeme bölümü: ayrı onay kutuları (koşullar + otomatik tahsilat
 * ZORUNLU; pazarlama İSTEĞE BAĞLI ve önceden işaretsiz) → "Ödemeyi tamamla"
 * → mock paneli veya dürüst "hazır değil" durumu.
 */
export function OrderPayForm({
  token,
  termsText,
  renewalNote,
  totalDisplay,
}: {
  token: string;
  termsText: string;
  renewalNote: string;
  totalDisplay: string;
}) {
  const [terms, setTerms] = useState(false);
  const [recurring, setRecurring] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState<"pay" | "mock" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [providerState, setProviderState] = useState<
    | { kind: "mock"; providerReference: string }
    | { kind: "not_ready"; message: string }
    | null
  >(null);

  async function pay() {
    setError(null);
    setBusy("pay");
    try {
      const res = await fetch("/api/v1/billing/orders/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: token, acceptedTerms: terms, acceptedRecurring: recurring, marketingConsent: marketing }),
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

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-600 ring-1 ring-slate-200">
        <p className="font-semibold text-slate-800">Bilgilendirme</p>
        <p className="mt-1">
          Bu sayfada verdiğiniz kurum, yetkili ve fatura bilgileri; siparişinizin oluşturulması,
          ödemenizin alınması, faturanızın düzenlenmesi ve hesabınızın kurulması için işlenir.
          Bilgileriniz pazarlama izni vermedikçe tanıtım için kullanılmaz.
        </p>
      </div>
      <label className="flex cursor-pointer gap-3 rounded-2xl border border-slate-200 bg-white p-4 ring-1 ring-transparent has-checked:border-amber-400 has-checked:ring-amber-200">
        <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-amber-600" />
        <span className="text-sm leading-relaxed">
          <strong>Ödeme koşulunu kabul ediyorum:</strong> {termsText}
        </span>
      </label>
      <label className="flex cursor-pointer gap-3 rounded-2xl border border-slate-200 bg-white p-4 ring-1 ring-transparent has-checked:border-amber-400 has-checked:ring-amber-200">
        <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-amber-600" />
        <span className="text-sm leading-relaxed">
          <strong>Otomatik tahsilat yetkisi veriyorum:</strong> {renewalNote} Kart bilgilerim
          ödeme sağlayıcısında işlenir; NeviiHub sunucularında kart numarası saklanmaz.
        </span>
      </label>
      <label className="flex cursor-pointer gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-amber-600" />
        <span className="text-sm leading-relaxed text-slate-600">
          Yenilik ve kampanyalardan e-postayla haberdar olmak istiyorum (isteğe bağlı; dilediğimde
          geri alabilirim).
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
