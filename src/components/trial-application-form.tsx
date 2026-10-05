"use client";

import { useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

type Branch = { id: string; name: string; address?: string };
type Slot = { startAt: string; branchId: string };

const TZ = "Europe/Istanbul";
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("tr-TR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

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
  const [instrument, setInstrument] = useState("");
  const [branchId, setBranchId] = useState(branches.length === 1 ? branches[0]!.id : "");
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Slot[]>([]);
  const [availabilityNote, setAvailabilityNote] = useState("");
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

  const req = useRef(0);
  /** Enstrüman/şube değişince uygun zamanlar yeniden yüklenir; geç gelen eski yanıt yok sayılır. */
  function loadSlots(nextInstrument: string, nextBranchId: string) {
    setInstrument(nextInstrument);
    setBranchId(nextBranchId);
    setPicked([]);
    setSlotsError(null);
    if (!nextInstrument) {
      setSlots(null);
      return;
    }
    const id = ++req.current;
    setSlotsLoading(true);
    const qs = new URLSearchParams({ instrument: nextInstrument, ...(nextBranchId ? { branchId: nextBranchId } : {}) });
    fetch(`/api/basvuru/${slug}/deneme?${qs}`)
      .then((r) => r.json() as Promise<{ ok: boolean; slots?: Slot[]; message?: string }>)
      .then((j) => {
        if (id !== req.current) return;
        setSlots(j.ok ? (j.slots ?? []) : []);
        if (!j.ok) setSlotsError(j.message ?? "Uygun zamanlar getirilemedi.");
      })
      .catch(() => {
        if (id !== req.current) return;
        setSlots([]);
        setSlotsError("Uygun zamanlar getirilemedi. Uygun olduğunuz zamanları aşağıya yazabilirsiniz.");
      })
      .finally(() => {
        if (id === req.current) setSlotsLoading(false);
      });
  }

  const byDay = useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const s of slots ?? []) m.set(dayKey(s.startAt), [...(m.get(dayKey(s.startAt)) ?? []), s]);
    return [...m.values()];
  }, [slots]);
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? "";
  const isPicked = (s: Slot) => picked.some((p) => p.startAt === s.startAt && p.branchId === s.branchId);

  function toggle(s: Slot) {
    setPicked((prev) =>
      isPicked(s) ? prev.filter((p) => !(p.startAt === s.startAt && p.branchId === s.branchId)) : prev.length >= 3 ? prev : [...prev, s]
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!instrument) return setError("Önce öğrenmek istediğiniz enstrümanı seçin.");
    if (picked.length === 0 && !availabilityNote.trim()) {
      return setError("Size uygun en az bir zaman seçin ya da uygun olduğunuz zamanları kısaca yazın.");
    }
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
          instrument,
          branchId: branchId || undefined,
          preferredSlots: picked,
          availabilityNote: availabilityNote || undefined,
          note: note || undefined,
          kvkkConsent: true,
          source,
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
          {institutionName} ekibi en kısa sürede sizi arayıp deneme dersinizin gününü ve saatini kesinleştirecek.
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
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">1 · Enstrüman ve şube</legend>
        <div>
          <label htmlFor="ta-instrument" className={label}>Enstrüman</label>
          <select id="ta-instrument" value={instrument} onChange={(e) => loadSlots(e.target.value, branchId)} className={field} required>
            <option value="">Seçin…</option>
            {instruments.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        </div>
        {branches.length > 1 ? (
          <div>
            <label htmlFor="ta-branch" className={label}>Şube</label>
            <select id="ta-branch" value={branchId} onChange={(e) => loadSlots(instrument, e.target.value)} className={field}>
              <option value="">Fark etmez</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        ) : null}
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-sm font-semibold">2 · Size uygun zaman</legend>
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">
          {instrument ? "En fazla 3 seçenek işaretleyin. Kesin saat sizi aradığımızda birlikte belirlenir." : "Uygun zamanları görmek için önce enstrüman seçin."}
        </p>
        {slotsLoading ? (
          <p className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Uygun zamanlar aranıyor…
          </p>
        ) : instrument && slots && slots.length === 0 ? (
          <p className="rounded-lg bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-muted)]">
            {slotsError ?? "Önümüzdeki iki hafta için boş zaman görünmüyor. Size uygun zamanları aşağıya yazın; sizi arayalım."}
          </p>
        ) : (
          <div className="space-y-3">
            {byDay.map((day) => (
              <div key={day[0]!.startAt}>
                <p className="mb-1.5 text-xs font-medium capitalize text-[var(--color-text-muted)]">{dayLabel(day[0]!.startAt)}</p>
                <div className="flex flex-wrap gap-2">
                  {day.map((s) => {
                    const on = isPicked(s);
                    const full = !on && picked.length >= 3;
                    return (
                      <button
                        key={`${s.startAt}-${s.branchId}`}
                        type="button"
                        aria-pressed={on}
                        disabled={full}
                        onClick={() => toggle(s)}
                        className="rounded-full border px-3 py-1.5 text-sm tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                        style={
                          on
                            ? { background: "var(--color-trial)", borderColor: "var(--color-trial)", color: "#fff" }
                            : { borderColor: "var(--color-border)", color: "var(--color-text)" }
                        }
                      >
                        {timeLabel(s.startAt)}
                        {branches.length > 1 ? <span className="ml-1 opacity-80">· {branchName(s.branchId)}</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <label htmlFor="ta-availability" className={`${label} mt-4`}>
          Bu saatler uymuyorsa ya da eklemek istedikleriniz (isteğe bağlı)
        </label>
        <input
          id="ta-availability"
          value={availabilityNote}
          maxLength={300}
          onChange={(e) => setAvailabilityNote(e.target.value)}
          placeholder="Ör. hafta içi 17:00 sonrası, cumartesi öğleden önce"
          className={field}
        />
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
          <label htmlFor="ta-note" className={label}>Bize iletmek istedikleriniz (isteğe bağlı)</label>
          <textarea id="ta-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2} placeholder="Ör. daha önce 1 yıl gitar çaldım" className={field} />
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
