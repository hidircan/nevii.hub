"use client";

import { useState } from "react";
import Link from "@/components/link";

/** "Sizi arayalım" formu: talep NeviiOS › Başvurular ve Teklif Talepleri'ne düşer; hesap açmaz, kart istemez. */
export function CallMeForm({ source }: { source: string }) {
  const [form, setForm] = useState({ institutionName: "", ownerName: "", ownerPhone: "", ownerEmail: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const input = "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/billing/quote/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, planKey: null, note: `Sizi arayalım talebi (${source})` }),
      });
      const json = (await res.json()) as { ok: boolean; error?: { message?: string } };
      if (json.ok) setDone(true);
      else setError(json.error?.message ?? "Talebiniz alınamadı. Bilgileri kontrol edip tekrar deneyin.");
    } catch {
      setError("Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin veya info@neviihub.com adresine yazın.");
    }
    setBusy(false);
  }

  if (done) {
    return (
      <p role="status" className="rounded-2xl bg-emerald-50 p-5 text-sm font-medium text-emerald-900 ring-1 ring-emerald-200">
        Talebinizi aldık. En kısa sürede sizi arayacağız.
      </p>
    );
  }
  return (
    <form onSubmit={submit} className="relative grid gap-3 text-left sm:grid-cols-2">
      <label className="sr-only" htmlFor={`${source}-kurum`}>Kurum adı</label>
      <input id={`${source}-kurum`} required minLength={2} autoComplete="organization" placeholder="Kurum adı" value={form.institutionName} onChange={set("institutionName")} className={input} />
      <label className="sr-only" htmlFor={`${source}-ad`}>Adınız soyadınız</label>
      <input id={`${source}-ad`} required minLength={2} autoComplete="name" placeholder="Adınız soyadınız" value={form.ownerName} onChange={set("ownerName")} className={input} />
      <label className="sr-only" htmlFor={`${source}-tel`}>Telefon</label>
      <input id={`${source}-tel`} required type="tel" inputMode="tel" autoComplete="tel" placeholder="Telefon" value={form.ownerPhone} onChange={set("ownerPhone")} className={input} />
      <label className="sr-only" htmlFor={`${source}-eposta`}>E-posta</label>
      <input id={`${source}-eposta`} required type="email" autoComplete="email" placeholder="E-posta" value={form.ownerEmail} onChange={set("ownerEmail")} className={input} />
      {/* Tuzak alan: insanlar görmez, botlar doldurur. */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-px w-px opacity-0" value={form.website} onChange={set("website")} />
      <button type="submit" disabled={busy} aria-busy={busy} className="rounded-xl bg-amber-600 px-5 py-3 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60 sm:col-span-2">
        {busy ? "Gönderiliyor…" : "Sizi arayalım"}
      </button>
      {error ? <p role="alert" className="text-sm font-medium text-red-700 sm:col-span-2">{error}</p> : null}
      <p className="text-xs leading-relaxed text-slate-500 sm:col-span-2">
        Bilgileriniz yalnız size dönüş yapmak için kullanılır.{" "}
        <Link href="/hukuk/kvkk-aydinlatma" className="font-medium text-amber-800 underline">KVKK Aydınlatma Metni</Link>
      </p>
    </form>
  );
}
