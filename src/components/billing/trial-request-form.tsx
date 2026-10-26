"use client";

import { useState } from "react";

/**
 * Herkese açık deneme başvuru formu. Tenant açmaz, kart istemez;
 * başvuru NeviiOS'ta değerlendirilir, onay sonrası güvenli davet akışıyla
 * (kurum sahibi daveti → tenant provision) ilerlenir.
 */
export function TrialRequestForm() {
  const [form, setForm] = useState({ institutionName: "", ownerName: "", ownerEmail: "", ownerPhone: "" });
  const [state, setState] = useState<{ kind: "idle" } | { kind: "sending" } | { kind: "done" } | { kind: "error"; message: string }>({ kind: "idle" });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/v1/billing/trial/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, ownerPhone: form.ownerPhone.trim() || null }),
      });
      const json = (await res.json()) as { ok: boolean; error?: { message?: string } };
      if (!json.ok) {
        setState({ kind: "error", message: json.error?.message ?? "Başvuru alınamadı." });
        return;
      }
      setState({ kind: "done" });
    } catch {
      setState({ kind: "error", message: "Bağlantı hatası. Lütfen tekrar deneyin." });
    }
  }

  if (state.kind === "done") {
    return (
      <div className="rounded-2xl bg-emerald-50 p-6 ring-1 ring-emerald-200">
        <h3 className="font-semibold text-emerald-900">Başvurunuz alındı</h3>
        <p className="mt-2 text-sm text-emerald-800">
          Değerlendirme sonrası e-postayla bilgilendirileceksiniz. Onaylanırsa kurum hesabınız
          güvenli davet akışıyla açılır ve 30 günlük denemeniz başlar.
        </p>
      </div>
    );
  }

  const input =
    "w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-600 focus:outline-none";
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="tr-inst" className="mb-1 block text-sm font-medium text-slate-700">Kurum adı</label>
        <input id="tr-inst" required minLength={2} maxLength={120} value={form.institutionName} onChange={set("institutionName")} className={input} placeholder="Örn. Kadıköy Müzik Merkezi" autoComplete="organization" />
      </div>
      <div>
        <label htmlFor="tr-owner" className="mb-1 block text-sm font-medium text-slate-700">Kurum sahibi adı</label>
        <input id="tr-owner" required minLength={2} maxLength={120} value={form.ownerName} onChange={set("ownerName")} className={input} placeholder="Ad Soyad" autoComplete="name" />
      </div>
      <div>
        <label htmlFor="tr-email" className="mb-1 block text-sm font-medium text-slate-700">Kurumsal e-posta</label>
        <input id="tr-email" required type="email" maxLength={160} value={form.ownerEmail} onChange={set("ownerEmail")} className={input} placeholder="ornek@kurum.com" autoComplete="email" />
      </div>
      <div>
        <label htmlFor="tr-phone" className="mb-1 block text-sm font-medium text-slate-700">Telefon (opsiyonel)</label>
        <input id="tr-phone" type="tel" maxLength={20} value={form.ownerPhone} onChange={set("ownerPhone")} className={input} placeholder="05__ ___ __ __" autoComplete="tel" />
      </div>
      {state.kind === "error" ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-800 ring-1 ring-red-200">
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={state.kind === "sending"}
        className="w-full rounded-xl bg-amber-600 px-6 py-3 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
      >
        {state.kind === "sending" ? "Gönderiliyor…" : "Deneme başvurusu gönder"}
      </button>
      <p className="text-xs leading-relaxed text-slate-500">
        Kart bilgisi istenmez. Başvurunuz yalnız deneme değerlendirmesi için kullanılır;
        onaylanmadan ücretlendirme yapılmaz.
      </p>
    </form>
  );
}
