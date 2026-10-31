"use client";

import { useState } from "react";
import Link from "@/components/link";
import { BillingProfileForm } from "@/components/billing/billing-profile-form";
import type { BillingProfileRecord } from "@/lib/saas-billing/invoicing-profile";

/**
 * Checkout fatura adımı: profil varsa özet + devam, yoksa form.
 * Kaydetme sonrası sayfa yenilemeden devam düğmesi belirir.
 */
export function CheckoutProfileStep({
  initial,
  continueHref,
}: {
  initial: BillingProfileRecord | null;
  continueHref: string;
}) {
  const [profile, setProfile] = useState<BillingProfileRecord | null>(initial);
  const [editing, setEditing] = useState(!initial);

  if (profile && !editing) {
    return (
      <div className="space-y-4">
        <dl className="grid gap-x-6 gap-y-2 rounded-2xl bg-slate-50 p-5 text-sm ring-1 ring-slate-200">
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Faturadaki alıcı</dt>
            <dd className="text-right font-medium">{profile.legalTitle}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Vergi kimlik no</dt>
            <dd className="font-medium">{profile.taxId ? `${profile.taxId.slice(0, 3)}••••••` : "—"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Fatura e-postası</dt>
            <dd className="font-medium">{profile.invoiceEmail}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-3">
          <Link
            href={continueHref}
            className="rounded-xl bg-[#5c3d00] px-6 py-3 text-sm font-semibold text-white hover:bg-[#4a3208]"
          >
            Bu bilgilerle ödemeye devam et →
          </Link>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-100"
          >
            Düzenle
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Tüm profilinizi <Link href="/abonelik/fatura-bilgilerim" className="font-semibold text-[#5c3d00] hover:underline">Fatura Bilgilerim</Link> sayfasından da yönetebilirsiniz.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <BillingProfileForm
        initial={profile}
        onSaved={(p) => {
          setProfile(p);
          setEditing(false);
        }}
      />
      {profile ? (
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          ← Değişiklikten vazgeç
        </button>
      ) : null}
    </div>
  );
}
