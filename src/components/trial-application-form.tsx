"use client";

import { useState } from "react";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";

type Branch = { id: string; name: string; address?: string };
type Alternative = { key: number; date: string; time: string };

const TZ = "Europe/Istanbul";
const MAX_ALTERNATIVES = 5;
/** İstanbul takvimine göre bugün (yyyy-MM-dd) ve şu an (HH:mm). */
const istanbulNow = () => {
  const now = new Date();
  return {
    ymd: now.toLocaleDateString("en-CA", { timeZone: TZ }),
    hm: now.toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }),
  };
};
const newKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

/** İstemci ön kontrolü — sunucu aynı kuralları (İstanbul saati) ayrıca uygular. */
function alternativesError(rows: Alternative[]): string | null {
  if (rows.length === 0) return "Size uygun en az bir tarih ve saat yazın.";
  const { ymd, hm } = istanbulNow();
  const seen = new Set<string>();
  for (const [i, r] of rows.entries()) {
    const n = i + 1;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !/^\d{2}:\d{2}$/.test(r.time)) return `${n}. alternatifin tarihini ve saatini eksiksiz seçin.`;
    if (r.date < ymd || (r.date === ymd && r.time <= hm)) return `${n}. alternatif geçmiş bir zaman; ileri bir tarih ve saat seçin.`;
    const k = `${r.date} ${r.time}`;
    if (seen.has(k)) return `${n}. alternatif daha önce yazdığınız bir tarih/saatle aynı; farklı bir seçenek yazın ya da satırı kaldırın.`;
    seen.add(k);
  }
  return null;
}

const field =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-focus-ring)]";
const label = "mb-1 block text-xs font-semibold text-[var(--color-text)]";

/** 2026-10-05 — Herkese açık deneme dersi başvuru formu (bkz. /api/basvuru/[kurum]/deneme). */
export function TrialApplicationForm({
  slug,
  institutionName,
  instruments,
  branches,
  source,
}: {
  slug: string;
  institutionName: string;
  instruments: string[];
  branches: Branch[];
  source?: string;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [branchId, setBranchId] = useState(branches.length === 1 ? branches[0]!.id : "");
  const [alternatives, setAlternatives] = useState<Alternative[]>([{ key: 1, date: "", time: "" }]);
  const [nextKey, setNextKey] = useState(2);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [isChild, setIsChild] = useState(false);
  const [parentName, setParentName] = useState("");
  const [age, setAge] = useState("");
  const [note, setNote] = useState("");
  const [kvkk, setKvkk] = useState(false);
  const [showKvkk, setShowKvkk] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // Form başına tek anahtar: ağ kesintisinde yeniden gönderim aynı başvuru sayılır (ikinci kayıt/bildirim yok).
  const [submissionKey] = useState(newKey);
  const today = istanbulNow().ymd;

  const toggleInstrument = (i: string) => setSelected((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));
  const setAlt = (key: number, patch: Partial<Alternative>) => setAlternatives((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addAlt = () => {
    if (alternatives.length >= MAX_ALTERNATIVES) return;
    setAlternatives((rows) => [...rows, { key: nextKey, date: "", time: "" }]);
    setNextKey((k) => k + 1);
  };
  const removeAlt = (key: number) => setAlternatives((rows) => (rows.length <= 1 ? rows : rows.filter((r) => r.key !== key)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (selected.length === 0) return setError("Öğrenmek istediğiniz en az bir enstrüman seçin.");
    const altError = alternativesError(alternatives);
    if (altError) return setError(altError);
    if (!kvkk) return setError("Başvurunun alınması için aydınlatma metnini onaylamanız gerekiyor.");
    setBusy(true);
    try {
      const res = await fetch(`/api/basvuru/${slug}/deneme`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          email,
          parentName: isChild ? parentName : undefined,
          age: age || undefined,
          instruments: selected,
          branchId: branchId || undefined,
          alternatives: alternatives.map(({ date, time }) => ({ date, time })),
          note: note || undefined,
          kvkkConsent: true,
          source,
          submissionKey,
          website,
        }),
      });
      const j = (await res.json()) as { ok: boolean; message?: string };
      if (!j.ok) setError(j.message ?? "Başvurunuz gönderilemedi. Bilgileri kontrol edip tekrar deneyin.");
      else setDone(true);
    } catch {
      setError("Başvurunuz gönderilemedi: sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center shadow-sm" role="status">
        <CheckCircle2 className="mx-auto h-12 w-12" style={{ color: "var(--color-success)" }} aria-hidden="true" />
        <h2 className="mt-4 text-xl font-semibold">Başvurunuz alındı</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          {institutionName} ekibi en kısa sürede sizi arayıp deneme dersinizin gününü ve saatini kesinleştirecek. Yazdığınız
          tarihler tercihtir; randevu, kurum onayladığında kesinleşir.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      noValidate
      className="space-y-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-7"
    >
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">1 · Enstrüman ve şube</legend>
        <p className="mb-2 text-xs text-[var(--color-text-muted)]">Birden fazla enstrüman seçebilirsiniz.</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Enstrümanlar">
          {instruments.map((i) => {
            const on = selected.includes(i);
            return (
              <label
                key={i}
                className="inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-[var(--color-focus-ring)]"
                style={on ? { background: "var(--color-trial)", borderColor: "var(--color-trial)", color: "#fff" } : { borderColor: "var(--color-border)" }}
              >
                <input type="checkbox" className="sr-only" checked={on} onChange={() => toggleInstrument(i)} />
                <span aria-hidden="true">{on ? "✓" : "+"}</span>
                {i}
              </label>
            );
          })}
        </div>
        {branches.length > 1 ? (
          <div className="mt-3 sm:max-w-xs">
            <label htmlFor="ta-branch" className={label}>Şube</label>
            <select id="ta-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} className={field}>
              <option value="">Fark etmez</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        ) : null}
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-sm font-semibold">2 · Size uygun tarih ve saatler</legend>
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">
          Uygun olduğunuz 1–{MAX_ALTERNATIVES} alternatif yazın (Türkiye saati). Bunlar tercihinizdir, kesin randevu değildir;
          kurumumuz sizi arayıp uygun bir saati onaylayacaktır.
        </p>
        <ol className="space-y-2">
          {alternatives.map((r, idx) => (
            <li key={r.key} className="grid grid-cols-[1fr_auto_auto] items-end gap-2 sm:grid-cols-[auto_1fr_8rem_auto]">
              <span className="hidden pb-2 text-xs font-semibold tabular-nums text-[var(--color-text-muted)] sm:block" aria-hidden="true">
                {idx + 1}.
              </span>
              <div>
                <label htmlFor={`ta-date-${r.key}`} className={label}>{idx + 1}. tercih — tarih</label>
                <input id={`ta-date-${r.key}`} type="date" min={today} value={r.date} onChange={(e) => setAlt(r.key, { date: e.target.value })} className={field} required />
              </div>
              <div>
                <label htmlFor={`ta-time-${r.key}`} className={label}>Saat</label>
                <input id={`ta-time-${r.key}`} type="time" step={900} value={r.time} onChange={(e) => setAlt(r.key, { time: e.target.value })} className={field} required />
              </div>
              <button
                type="button"
                onClick={() => removeAlt(r.key)}
                disabled={alternatives.length <= 1}
                aria-label={`${idx + 1}. tercihi kaldır`}
                title={alternatives.length <= 1 ? "En az bir tercih gerekli" : "Bu tercihi kaldır"}
                className="mb-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={addAlt}
          disabled={alternatives.length >= MAX_ALTERNATIVES}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--color-border)] px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {alternatives.length >= MAX_ALTERNATIVES ? `En fazla ${MAX_ALTERNATIVES} alternatif` : "Alternatif ekle"}
        </button>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">3 · İletişim bilgileri</legend>
        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isChild} onChange={(e) => setIsChild(e.target.checked)} />
            Başvuruyu çocuğum için yapıyorum
          </label>
        </div>
        <div>
          <label htmlFor="ta-name" className={label}>{isChild ? "Öğrencinin adı soyadı" : "Adınız soyadınız"}</label>
          <input id="ta-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete={isChild ? "off" : "name"} className={field} required />
        </div>
        <div>
          <label htmlFor="ta-age" className={label}>{isChild ? "Öğrencinin yaşı" : "Yaşınız"} (isteğe bağlı)</label>
          <input id="ta-age" type="number" inputMode="numeric" min={3} max={99} value={age} onChange={(e) => setAge(e.target.value)} className={field} />
        </div>
        {isChild ? (
          <div className="sm:col-span-2">
            <label htmlFor="ta-parent" className={label}>Veli adı soyadı</label>
            <input id="ta-parent" value={parentName} onChange={(e) => setParentName(e.target.value)} maxLength={120} autoComplete="name" className={field} />
          </div>
        ) : null}
        <div>
          <label htmlFor="ta-phone" className={label}>Telefon</label>
          <input id="ta-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} autoComplete="tel" placeholder="0532 123 45 67" className={field} required />
        </div>
        <div>
          <label htmlFor="ta-email" className={label}>E-posta (isteğe bağlı)</label>
          <input id="ta-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={160} autoComplete="email" className={field} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="ta-note" className={label}>Adayın eğitim geçmişi bilgisi (isteğe bağlı)</label>
          <textarea id="ta-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2} placeholder="Ör. 1 yıl gitar dersi aldı, nota biliyor" className={field} />
        </div>
        {/* Bot tuzağı — gerçek kullanıcı görmez/doldurmaz. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="ta-website">Web sitesi</label>
          <input id="ta-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>
      </fieldset>

      <div className="space-y-2 border-t border-[var(--color-border)] pt-5">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={kvkk} onChange={(e) => setKvkk(e.target.checked)} className="mt-0.5" />
          <span>
            Kişisel verilerimin deneme dersi planlaması için işlenmesine ilişkin{" "}
            <button type="button" onClick={() => setShowKvkk((v) => !v)} className="font-medium underline underline-offset-2">
              aydınlatma metnini
            </button>{" "}
            okudum, onaylıyorum.
          </span>
        </label>
        {showKvkk ? (
          <p className="rounded-lg bg-[var(--color-surface-muted)] px-3 py-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
            Veri sorumlusu {institutionName}&apos;dir. Bu formda paylaştığınız ad, iletişim, yaş ve tercih bilgileri yalnızca
            sizinle iletişime geçmek ve deneme dersinizi planlamak amacıyla, açık rızanıza dayanarak işlenir; üçüncü kişilerle
            paylaşılmaz. Başvurunuz sonuçlandıktan sonra makul süre saklanır. 6698 sayılı KVKK kapsamındaki haklarınız için
            kurumla iletişime geçebilirsiniz.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-lg bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          aria-busy={busy || undefined}
          className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-70"
          style={{ background: "var(--color-trial)" }}
        >
          {busy ? "Gönderiliyor…" : "Deneme dersi başvurusu gönder"}
        </button>
      </div>
    </form>
  );
}
