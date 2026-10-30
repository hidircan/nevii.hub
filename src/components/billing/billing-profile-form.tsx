"use client";

import { useState } from "react";
import {
  BILLING_RECIPIENT_LABELS,
  BILLING_RECIPIENT_TYPES,
  type BillingProfileRecord,
  type BillingRecipientType,
} from "@/lib/saas-billing/invoicing-profile";

type Draft = {
  displayName: string;
  recipientType: BillingRecipientType;
  legalTitle: string;
  taxId: string;
  nationalId: string;
  taxOffice: string;
  addressLine: string;
  district: string;
  city: string;
  country: string;
  invoiceEmail: string;
  contactName: string;
  contactPhone: string;
};

function toDraft(p: BillingProfileRecord | null): Draft {
  return {
    displayName: p?.displayName ?? "",
    recipientType: p?.recipientType ?? "corporate",
    legalTitle: p?.legalTitle ?? "",
    taxId: p?.taxId ?? "",
    nationalId: p?.nationalId ?? "",
    taxOffice: p?.taxOffice ?? "",
    addressLine: p?.addressLine ?? "",
    district: p?.district ?? "",
    city: p?.city ?? "",
    country: p?.country ?? "Türkiye",
    invoiceEmail: p?.invoiceEmail ?? "",
    contactName: p?.contactName ?? "",
    contactPhone: p?.contactPhone ?? "",
  };
}

const input =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600";
const label = "mb-1 block text-sm font-medium text-slate-700";
const hint = "mt-0.5 text-xs text-slate-500";

function Field({
  id,
  labelText,
  children,
  hintText,
  optional,
}: {
  id: string;
  labelText: string;
  children: React.ReactNode;
  hintText?: string;
  optional?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className={label}>
        {labelText} {optional ? <span className="font-normal text-slate-400">(opsiyonel)</span> : null}
      </label>
      {children}
      {hintText ? <p className={hint}>{hintText}</p> : null}
    </div>
  );
}

/**
 * Fatura profili formu — checkout öncesi adım ve "Fatura Bilgilerim" sayfası
 * ORTAK kullanır (tekrar yazım yok). Alıcı türüne göre alanlar koşullu açılır.
 */
export function BillingProfileForm({
  initial,
  onSaved,
  compact,
}: {
  initial: BillingProfileRecord | null;
  onSaved?: (p: BillingProfileRecord) => void;
  compact?: boolean;
}) {
  const [d, setD] = useState<Draft>(() => toDraft(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setD((v) => ({ ...v, [k]: e.target.value }));

  const individual = d.recipientType === "individual";

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/v1/billing/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d),
      });
      const json = (await res.json()) as
        | { ok: true; data: { profile: BillingProfileRecord } }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        setError(json.error.message);
        return;
      }
      setD(toDraft(json.data.profile));
      setNotice("Fatura profili kaydedildi.");
      onSaved?.(json.data.profile);
    } catch {
      setError("Kaydedilemedi. Bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className={`grid gap-3 ${compact ? "" : "sm:grid-cols-2"}`}>
        <Field id="bp-display" labelText="Kurum görünen adı" hintText="Uygulamada görünen adınız; faturadaki unvandan ayrıdır.">
          <input id="bp-display" value={d.displayName} onChange={set("displayName")} className={input} autoComplete="organization" maxLength={120} />
        </Field>
        <Field id="bp-type" labelText="Alıcı türü">
          <select id="bp-type" value={d.recipientType} onChange={set("recipientType")} className={input}>
            {BILLING_RECIPIENT_TYPES.map((t) => (
              <option key={t} value={t}>{BILLING_RECIPIENT_LABELS[t]}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field
        id="bp-legal"
        labelText={individual ? "Ad soyad (faturadaki)" : "Resmî ticaret unvanı"}
        hintText={individual ? undefined : "Vergi levhasındaki unvanla aynı yazın."}
      >
        <input id="bp-legal" value={d.legalTitle} onChange={set("legalTitle")} className={input} maxLength={200} />
      </Field>
      {!individual ? (
        <div className={`grid gap-3 ${compact ? "" : "sm:grid-cols-2"}`}>
          <Field id="bp-vkn" labelText="Vergi kimlik numarası (VKN)" hintText="Şirket: 10 haneli VKN. Şahıs işletmesi: 11 haneli T.C. kimlik no. Biçim kontrolü vergi doğrulaması değildir.">
            <input id="bp-vkn" value={d.taxId} onChange={set("taxId")} className={input} inputMode="numeric" maxLength={20} />
          </Field>
          <Field id="bp-office" labelText="Vergi dairesi" optional>
            <input id="bp-office" value={d.taxOffice} onChange={set("taxOffice")} className={input} maxLength={100} />
          </Field>
        </div>
      ) : null}
      <Field
        id="bp-tckn"
        labelText="T.C. kimlik numarası"
        optional={!individual}
        hintText={individual ? "11 basamak. Bireysel faturada zorunludur." : "Gerektiğinde yazın; boş bırakılabilir."}
      >
        <input id="bp-tckn" value={d.nationalId} onChange={set("nationalId")} className={input} inputMode="numeric" maxLength={20} />
      </Field>
      <Field id="bp-addr" labelText="Fatura adresi">
        <input id="bp-addr" value={d.addressLine} onChange={set("addressLine")} className={input} autoComplete="street-address" maxLength={300} />
      </Field>
      <div className={`grid gap-3 ${compact ? "" : "sm:grid-cols-3"}`}>
        <Field id="bp-district" labelText="İlçe" optional>
          <input id="bp-district" value={d.district} onChange={set("district")} className={input} maxLength={100} />
        </Field>
        <Field id="bp-city" labelText="İl">
          <input id="bp-city" value={d.city} onChange={set("city")} className={input} autoComplete="address-level2" maxLength={100} />
        </Field>
        <Field id="bp-country" labelText="Ülke">
          <input id="bp-country" value={d.country} onChange={set("country")} className={input} autoComplete="country-name" maxLength={100} />
        </Field>
      </div>
      <Field id="bp-email" labelText="Fatura e-postası" hintText="Belgeler ve bildirimler bu adrese iletilir.">
        <input id="bp-email" type="email" value={d.invoiceEmail} onChange={set("invoiceEmail")} className={input} autoComplete="email" maxLength={150} />
      </Field>
      <div className={`grid gap-3 ${compact ? "" : "sm:grid-cols-2"}`}>
        <Field id="bp-contact" labelText="İlgili kişi" optional>
          <input id="bp-contact" value={d.contactName} onChange={set("contactName")} className={input} maxLength={120} />
        </Field>
        <Field id="bp-phone" labelText="İlgili telefon" optional>
          <input id="bp-phone" value={d.contactPhone} onChange={set("contactPhone")} className={input} autoComplete="tel" maxLength={30} />
        </Field>
      </div>
      {error ? <p role="alert" className="text-sm font-medium text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="text-sm font-medium text-emerald-700">{notice}</p> : null}
      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2"
      >
        {busy ? "Kaydediliyor…" : initial ? "Profili güncelle" : "Profili kaydet"}
      </button>
    </div>
  );
}
