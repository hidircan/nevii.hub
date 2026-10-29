"use client";

import { useState } from "react";

/**
 * Herkese açık teklif isteği formu. Abonelik AÇMAZ, davet ÜRETMEZ, kart
 * İSTEMEZ; istek platforma düşer, ekip iletişime geçip NeviiAds teklifi
 * ve checkout daveti yolunu işletir.
 */
export function QuoteForm({ initialPlanKey }: { initialPlanKey: string | null }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    institutionName: "",
    ownerName: "",
    ownerEmail: "",
    ownerPhone: "",
    planKey: initialPlanKey ?? "",
    note: "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const input =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-600 focus:outline-none";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/billing/quote/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institutionName: form.institutionName,
          ownerName: form.ownerName,
          ownerEmail: form.ownerEmail,
          ownerPhone: form.ownerPhone || null,
          planKey: form.planKey || null,
          note: form.note || null,
        }),
      });
      const json = (await res.json()) as { ok: boolean; data?: { requestId: string }; error?: { message?: string } };
      setBusy(false);
      if (!json.ok) {
        setError(json.error?.message ?? "İstek alınamadı.");
        return;
      }
      setDone(json.data?.requestId ?? "alındı");
    } catch {
      setBusy(false);
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl bg-emerald-50 p-6 text-sm text-emerald-900 ring-1 ring-emerald-200" role="status">
        <p className="font-semibold">Teklif isteğiniz alındı.</p>
        <p className="mt-1">
          Ekibimiz 1 iş günü içinde sizinle iletişime geçecek. Bu istek abonelik açmaz;
          devamında size özel teklif ve güvenli ödeme daveti iletilir. Kayıt no: {done}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="q-inst" className="mb-1 block text-sm font-medium text-slate-700">Kurum adı</label>
          <input id="q-inst" className={input} value={form.institutionName} onChange={set("institutionName")} required minLength={2} maxLength={120} autoComplete="organization" />
        </div>
        <div>
          <label htmlFor="q-owner" className="mb-1 block text-sm font-medium text-slate-700">Kurum sahibi adı</label>
          <input id="q-owner" className={input} value={form.ownerName} onChange={set("ownerName")} required minLength={2} maxLength={120} autoComplete="name" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="q-mail" className="mb-1 block text-sm font-medium text-slate-700">Kurumsal e-posta</label>
          <input id="q-mail" type="email" className={input} value={form.ownerEmail} onChange={set("ownerEmail")} required maxLength={160} autoComplete="email" />
        </div>
        <div>
          <label htmlFor="q-phone" className="mb-1 block text-sm font-medium text-slate-700">Telefon (opsiyonel)</label>
          <input id="q-phone" type="tel" className={input} value={form.ownerPhone} onChange={set("ownerPhone")} maxLength={20} autoComplete="tel" />
        </div>
      </div>
      <div>
        <label htmlFor="q-note" className="mb-1 block text-sm font-medium text-slate-700">Notunuz (opsiyonel)</label>
        <textarea id="q-note" className={input} rows={3} value={form.note} onChange={set("note")} maxLength={500} placeholder="Şube sayısı, öğrenci sayısı, özel ihtiyacınız" />
      </div>
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200" role="alert">{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="rounded-xl bg-amber-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2"
      >
        {busy ? "Gönderiliyor…" : "Teklif isteğini gönder"}
      </button>
      <p className="text-xs text-slate-500">
        Kart bilgisi istenmez. Bu form abonelik açmaz; ekibimiz sizinle iletişime geçer.
      </p>
    </form>
  );
}
