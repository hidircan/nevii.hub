"use client";

import { useState } from "react";

/** Davetli checkout formu — plan/periyot davetle sabit, müşteri bilgileri + onay alınır. */
export function InvitationCheckout({
  token,
  planKey,
  billingInterval,
  approved,
}: {
  token: string;
  planKey: string;
  billingInterval: "monthly" | "yearly";
  approved: boolean;
}) {
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutHtml, setCheckoutHtml] = useState<string | null>(null);
  const [customer, setCustomer] = useState({
    name: "",
    surname: "",
    gsmNumber: "",
    identityNumber: "",
    address: "",
    city: "",
    country: "Türkiye",
  });
  const setC = (k: keyof typeof customer) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCustomer((c) => ({ ...c, [k]: e.target.value }));
  const input =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-600 focus:outline-none";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey, billingInterval, acceptedTerms, customer, invitationToken: token }),
      });
      const json = (await res.json()) as { ok: boolean; data?: { checkoutFormContent?: string; mock?: boolean }; error?: { message?: string } };
      setBusy(false);
      if (!json.ok || typeof json.data?.checkoutFormContent !== "string") {
        setError(json.error?.message ?? "Ödeme başlatılamadı.");
        return;
      }
      setCheckoutHtml(json.data.checkoutFormContent);
    } catch {
      setBusy(false);
      setError("Bağlantı hatası.");
    }
  }

  if (!approved) {
    return (
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
        Bu paketin onaylı fiyatı yok; gerçek checkout kapalı.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
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
          Tutarı, periyodu, otomatik yenileme ve iptal koşulunu okudum; kartımdan otomatik
          tahsilatı kabul ediyorum. Kart bilgilerim yalnızca ödeme sağlayıcısının güvenli
          sayfasında alınır.
        </span>
      </label>
      {error ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-800 ring-1 ring-red-200">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60">
        {busy ? "Açılıyor…" : "Güvenli ödemeye geç"}
      </button>
      {checkoutHtml ? (
        <div className="mt-4 rounded-lg ring-1 ring-slate-200">
          <div dangerouslySetInnerHTML={{ __html: checkoutHtml }} />
        </div>
      ) : null}
    </form>
  );
}
