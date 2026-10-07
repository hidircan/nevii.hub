"use client";

import { useMemo, useRef, useState } from "react";
import { CalendarDays, CheckCircle2, Clock, MapPin, Music2, Phone, Users } from "lucide-react";
import type { PublicClub } from "@/lib/club-applications";

const field =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-focus-ring)] aria-[invalid=true]:border-[var(--color-danger)]";
const label = "mb-1 block text-xs font-semibold text-[var(--color-text)]";
const AUDIENCE: Record<string, string> = { child: "Çocuk", adult: "Yetişkin" };
const ymdTr = (ymd?: string) => (ymd ? ymd.split("-").reverse().join(".") : "");
const money = (n: number) => `${n.toLocaleString("tr-TR")} ₺`;
const feeText = (c: Pick<PublicClub, "fee" | "feePeriod">) =>
  c.fee <= 0 ? "Ücretsiz" : c.feePeriod === "monthly" ? `${money(c.fee)} / ay` : c.feePeriod === "term" ? `${money(c.fee)} / dönem` : `${money(c.fee)} (toplam)`;
const feeNature = (c: Pick<PublicClub, "feePeriod">) =>
  c.feePeriod === "monthly" ? "Aylık ücret — her ay ödenir." : c.feePeriod === "term" ? "Dönemlik ücret — dönem başına bir kez." : "Toplam ücret — tüm program için bir kez.";
const newKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

type Errors = Partial<Record<"clubId" | "participantName" | "birthDate" | "age" | "phone" | "email" | "parentName" | "note" | "kvkkConsent" | "form", string>>;

/** Özet kartı — yalnız halka açık teklif alanları (öğretmen yok). */
function ClubSummary({ club }: { club: PublicClub }) {
  const dates = club.startDate || club.endDate ? `${ymdTr(club.startDate) || "—"} – ${ymdTr(club.endDate) || "—"}` : undefined;
  const ages = club.minAge !== undefined || club.maxAge !== undefined ? `${club.minAge ?? ""}${club.minAge !== undefined && club.maxAge !== undefined ? "–" : ""}${club.maxAge ?? ""}${club.maxAge === undefined ? "+" : ""} yaş` : undefined;
  return (
    <article className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm" aria-labelledby="club-summary-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-primary)]">{club.instrument}</p>
          <h2 id="club-summary-title" className="mt-0.5 text-xl font-semibold leading-snug">{club.name}</h2>
        </div>
        <div className="sm:text-right">
          <p className="text-lg font-semibold tabular-nums">{feeText(club)}</p>
          <p className="text-[11px] text-[var(--color-text-muted)]">{feeNature(club)}</p>
        </div>
      </div>
      <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        {club.audience ? (
          <div className="flex gap-2">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden="true" />
            <div><dt className="sr-only">Grup</dt><dd>{AUDIENCE[club.audience]} grubu{ages ? ` · ${ages}` : ""}</dd></div>
          </div>
        ) : null}
        {dates ? (
          <div className="flex gap-2">
            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden="true" />
            <div><dt className="sr-only">Tarihler</dt><dd>{dates}</dd></div>
          </div>
        ) : null}
        <div className="flex gap-2">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden="true" />
          <div><dt className="sr-only">Gün, saat ve süre</dt><dd>{club.scheduleText ? `${club.scheduleText} · ` : ""}{club.durationMinutes} dk ders</dd></div>
        </div>
        {club.branchName ? (
          <div className="flex gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden="true" />
            <div>
              <dt className="sr-only">Şube</dt>
              <dd>
                <span className="font-medium">{club.branchName}</span>
                {club.branchAddress ? <span className="block whitespace-pre-line text-xs text-[var(--color-text-muted)]">{club.branchAddress}</span> : null}
                {club.branchPhone ? (
                  <a href={`tel:${club.branchPhone.replace(/\s/g, "")}`} className="mt-0.5 inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:underline">
                    <Phone className="h-3 w-3" aria-hidden="true" /> {club.branchPhone}
                  </a>
                ) : null}
              </dd>
            </div>
          </div>
        ) : null}
      </dl>
      {club.description ? <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-[var(--color-text-muted)]">{club.description}</p> : null}
      {club.includesText || club.includedSolfege ? (
        <div className="mt-4 rounded-xl bg-[var(--color-surface-muted)] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Ücrete dahil</p>
          {club.includesText ? <p className="mt-1 whitespace-pre-line text-sm">{club.includesText}</p> : null}
          {club.includedSolfege ? (
            <p className="mt-1 text-sm">
              <span className="font-semibold">Solfej grup dersi ücrete dahildir</span> — {club.includedSolfege.name}
              {club.includedSolfege.scheduleText ? ` · ${club.includedSolfege.scheduleText}` : ""} · {club.includedSolfege.durationMinutes} dk
              {club.includedSolfege.startDate || club.includedSolfege.endDate
                ? ` · ${ymdTr(club.includedSolfege.startDate) || "—"} – ${ymdTr(club.includedSolfege.endDate) || "—"}`
                : ""}
              {club.includedSolfege.branchName && club.includedSolfege.branchName !== club.branchName ? ` · ${club.includedSolfege.branchName}` : ""}
            </p>
          ) : null}
        </div>
      ) : null}
      <p className="mt-4 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text)]">
        Kontenjanlar sınırlıdır.
        {club.waitlistOnly ? <span className="block font-normal text-[var(--color-text-muted)]">Bu grubun kontenjanı şu an dolu; başvurunuz bekleme listesine alınır.</span> : null}
      </p>
    </article>
  );
}

/** 2026-10-07 — Herkese açık grup dersi başvuru portalı (bkz. /api/basvuru/[kurum]/kulup). */
export function ClubApplicationPortal({
  slug,
  institutionName,
  institutionPhone,
  clubs,
  preselectClubId,
  kvkkText,
  source,
}: {
  slug: string;
  institutionName: string;
  institutionPhone?: string;
  clubs: PublicClub[];
  preselectClubId?: string;
  kvkkText: string;
  source?: string;
}) {
  const [branch, setBranch] = useState("");
  const [instrument, setInstrument] = useState("");
  const [audience, setAudience] = useState("");
  const [clubId, setClubId] = useState(() => (preselectClubId && clubs.some((c) => c.clubId === preselectClubId) ? preselectClubId : clubs.length === 1 ? clubs[0]!.clubId : ""));
  const [participantName, setParticipantName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [age, setAge] = useState("");
  const [parentName, setParentName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [kvkk, setKvkk] = useState(false);
  const [showKvkk, setShowKvkk] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [done, setDone] = useState<{ reference?: string; clubName?: string; waitlist?: boolean } | null>(null);
  const [submissionKey] = useState(newKey);
  const [openedAt] = useState(() => Date.now());
  const formRef = useRef<HTMLFormElement>(null);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });

  const branches = useMemo(() => Array.from(new Map(clubs.filter((c) => c.branchId).map((c) => [c.branchId!, c.branchName ?? ""])).entries()), [clubs]);
  const instruments = useMemo(() => Array.from(new Set(clubs.map((c) => c.instrument))).sort((a, b) => a.localeCompare(b, "tr")), [clubs]);
  const audiences = useMemo(() => Array.from(new Set(clubs.map((c) => c.audience).filter(Boolean))) as string[], [clubs]);
  const visible = clubs.filter((c) => (!branch || c.branchId === branch) && (!instrument || c.instrument === instrument) && (!audience || c.audience === audience));
  const selected = clubs.find((c) => c.clubId === clubId);
  const isChild = selected?.audience === "child";

  function focusFirstError(errs: Errors) {
    const first = Object.keys(errs).find((k) => k !== "form");
    if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
  }

  function validate(): Errors {
    const e: Errors = {};
    if (!selected) e.clubId = "Başvurmak istediğiniz grubu seçin.";
    if (participantName.trim().length < 2) e.participantName = "Katılımcının adını ve soyadını yazın.";
    if (isChild) {
      if (!birthDate) e.birthDate = "Katılımcının doğum tarihini seçin.";
      if (parentName.trim().length < 2) e.parentName = "Veli adı ve soyadını yazın.";
    } else if (selected && !birthDate && !age) {
      e.age = "Yaşınızı yazın.";
    }
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 12) e.phone = "Telefon numarasını alan koduyla eksiksiz yazın (ör. 0532 123 45 67).";
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = "E-posta adresi geçerli görünmüyor; düzeltin ya da boş bırakın.";
    if (!kvkk) e.kvkkConsent = "Başvurunun alınması için aydınlatma metnini okuyup onaylayın.";
    return e;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy) return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return focusFirstError(e);
    setBusy(true);
    try {
      const res = await fetch(`/api/basvuru/${encodeURIComponent(slug)}/kulup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clubId,
          participantName,
          birthDate: birthDate || undefined,
          age: !isChild && !birthDate ? age : undefined,
          parentName: isChild ? parentName : undefined,
          phone,
          email,
          note: note || undefined,
          kvkkConsent: true,
          source,
          submissionKey,
          elapsedMs: Date.now() - openedAt,
          website,
        }),
      });
      const j = (await res.json()) as { ok: boolean; message?: string; field?: string; reference?: string; clubName?: string; waitlist?: boolean };
      if (!j.ok) {
        const k = (j.field && ["clubId", "participantName", "birthDate", "age", "phone", "email", "parentName", "note", "kvkkConsent"].includes(j.field) ? j.field : "form") as keyof Errors;
        const next = { [k]: j.message ?? "Başvurunuz gönderilemedi. Bilgileri kontrol edip tekrar deneyin." } as Errors;
        setErrors(next);
        focusFirstError(next);
      } else {
        setDone({ reference: j.reference, clubName: j.clubName ?? selected?.name, waitlist: j.waitlist });
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch {
      setErrors({ form: "Başvurunuz gönderilemedi: sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin; bilgileriniz silinmedi." });
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center shadow-sm" role="status">
        <CheckCircle2 className="mx-auto h-12 w-12" style={{ color: "var(--color-success)" }} aria-hidden="true" />
        <h2 className="mt-4 text-xl font-semibold">Başvurunuz alındı</h2>
        {done.clubName ? <p className="mt-2 text-sm">Grup: <span className="font-semibold">{done.clubName}</span>{done.waitlist ? " (bekleme listesi)" : ""}</p> : null}
        {done.reference ? (
          <p className="mt-1 text-sm">
            Başvuru referansınız: <span className="font-mono text-base font-semibold tracking-wider">{done.reference}</span>
          </p>
        ) : null}
        <p className="mt-4 text-sm text-[var(--color-text-muted)]">
          Başvuru, kesin kayıt anlamına gelmez. {institutionName} sizinle iletişime geçecektir. Bu aşamada herhangi bir ödeme alınmaz.
        </p>
      </div>
    );
  }

  if (clubs.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
        <Music2 className="mx-auto h-10 w-10 text-[var(--color-text-muted)]" aria-hidden="true" />
        <h2 className="mt-3 text-lg font-semibold">Şu an başvuruya açık grup dersi yok</h2>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Yeni gruplar açıldığında bu sayfada listelenecek.{institutionPhone ? ` Bilgi için ${institutionPhone} numarasını arayabilirsiniz.` : ""}
        </p>
      </div>
    );
  }

  const err = (k: keyof Errors) =>
    errors[k] ? (
      <p id={`err-${k}`} role="alert" className="mt-1 text-xs font-medium text-[var(--color-danger)]">
        {errors[k]}
      </p>
    ) : null;
  const inv = (k: keyof Errors) => ({ "aria-invalid": errors[k] ? true : undefined, "aria-describedby": errors[k] ? `err-${k}` : undefined });

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start lg:gap-8">
      <section aria-labelledby="choose-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="choose-title" className="text-base font-semibold">1 · Grubu seçin</h2>
          {branches.length > 1 || instruments.length > 1 || audiences.length > 1 ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtreler">
              {branches.length > 1 ? (
                <select aria-label="Şube" value={branch} onChange={(e) => setBranch(e.target.value)} className={`${field} w-auto py-1.5 text-xs`}>
                  <option value="">Tüm şubeler</option>
                  {branches.map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
              ) : null}
              {instruments.length > 1 ? (
                <select aria-label="Enstrüman" value={instrument} onChange={(e) => setInstrument(e.target.value)} className={`${field} w-auto py-1.5 text-xs`}>
                  <option value="">Tüm alanlar</option>
                  {instruments.map((i) => (
                    <option key={i} value={i}>{i}</option>
                  ))}
                </select>
              ) : null}
              {audiences.length > 1 ? (
                <select aria-label="Yaş grubu" value={audience} onChange={(e) => setAudience(e.target.value)} className={`${field} w-auto py-1.5 text-xs`}>
                  <option value="">Çocuk ve yetişkin</option>
                  {audiences.map((a) => (
                    <option key={a} value={a}>{AUDIENCE[a] ?? a}</option>
                  ))}
                </select>
              ) : null}
            </div>
          ) : null}
        </div>
        <div role="radiogroup" aria-label="Gruplar" aria-describedby={errors.clubId ? "err-clubId" : undefined} className="grid gap-2 sm:grid-cols-2">
          {visible.length === 0 ? <p className="text-sm text-[var(--color-text-muted)] sm:col-span-2">Bu filtrelere uyan grup yok. Filtreleri değiştirin.</p> : null}
          {visible.map((c) => {
            const on = c.clubId === clubId;
            return (
              <label
                key={c.clubId}
                className="flex cursor-pointer flex-col rounded-xl border bg-[var(--color-surface)] px-3.5 py-3 transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-[var(--color-focus-ring)]"
                style={on ? { borderColor: "var(--color-primary)", boxShadow: "0 0 0 1px var(--color-primary)" } : { borderColor: "var(--color-border)" }}
              >
                <input type="radio" name="clubId" value={c.clubId} checked={on} onChange={() => { setClubId(c.clubId); setErrors((p) => ({ ...p, clubId: undefined })); }} className="sr-only" />
                <span className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold leading-snug">{c.name}</span>
                  {c.waitlistOnly ? <span className="shrink-0 rounded-full bg-[var(--color-warning-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-warning)]">Bekleme listesi</span> : null}
                </span>
                <span className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                  {c.instrument}{c.audience ? ` · ${AUDIENCE[c.audience]}` : ""}{c.branchName ? ` · ${c.branchName}` : ""}
                </span>
                <span className="mt-1.5 text-xs font-medium tabular-nums">{feeText(c)}</span>
              </label>
            );
          })}
        </div>
        {err("clubId")}
        {selected ? <ClubSummary club={selected} /> : <p className="rounded-xl border border-dashed border-[var(--color-border)] px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">Ayrıntıları görmek için bir grup seçin.</p>}
      </section>

      <form ref={formRef} onSubmit={(e) => void submit(e)} noValidate className="space-y-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-6 lg:sticky lg:top-6">
        <h2 className="text-base font-semibold">2 · Bilgileriniz</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="ca-name" className={label}>{isChild ? "Katılımcının (çocuğun) adı soyadı" : "Katılımcının adı soyadı"}</label>
            <input id="ca-name" name="participantName" value={participantName} onChange={(e) => setParticipantName(e.target.value)} maxLength={120} autoComplete={isChild ? "off" : "name"} className={field} {...inv("participantName")} />
            {err("participantName")}
          </div>
          {isChild ? (
            <>
              <div>
                <label htmlFor="ca-birth" className={label}>Doğum tarihi</label>
                <input id="ca-birth" name="birthDate" type="date" max={today} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className={field} {...inv("birthDate")} />
                {err("birthDate")}
              </div>
              <div>
                <label htmlFor="ca-parent" className={label}>Veli adı soyadı</label>
                <input id="ca-parent" name="parentName" value={parentName} onChange={(e) => setParentName(e.target.value)} maxLength={120} autoComplete="name" className={field} {...inv("parentName")} />
                {err("parentName")}
              </div>
            </>
          ) : (
            <div>
              <label htmlFor="ca-age" className={label}>Yaş</label>
              <input id="ca-age" name="age" type="number" inputMode="numeric" min={3} max={99} value={age} onChange={(e) => setAge(e.target.value)} className={field} {...inv("age")} />
              {err("age")}
              {err("birthDate")}
            </div>
          )}
          <div>
            <label htmlFor="ca-phone" className={label}>{isChild ? "Veli telefonu" : "Telefon"}</label>
            <input id="ca-phone" name="phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} autoComplete="tel" placeholder="0532 123 45 67" className={field} {...inv("phone")} />
            {err("phone")}
          </div>
          <div className={isChild ? "" : "sm:col-span-2"}>
            <label htmlFor="ca-email" className={label}>E-posta (isteğe bağlı)</label>
            <input id="ca-email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={160} autoComplete="email" className={field} {...inv("email")} />
            {err("email")}
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="ca-note" className={label}>Not (isteğe bağlı)</label>
            <textarea id="ca-note" name="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} placeholder="Ör. daha önce 1 yıl keman çaldı" className={`${field} min-h-[4.5rem] resize-y`} {...inv("note")} />
            {err("note")}
          </div>
          {/* Bot tuzağı — gerçek kullanıcı görmez/doldurmaz. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label htmlFor="ca-website">Web sitesi</label>
            <input id="ca-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>
        </div>

        <div className="space-y-3 border-t border-[var(--color-border)] pt-4">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="kvkkConsent" checked={kvkk} onChange={(e) => { setKvkk(e.target.checked); setErrors((p) => ({ ...p, kvkkConsent: undefined })); }} className="mt-0.5" {...inv("kvkkConsent")} />
            <span>
              Kişisel verilerimin başvurunun değerlendirilmesi için işlenmesine ilişkin{" "}
              <button type="button" onClick={() => setShowKvkk((v) => !v)} aria-expanded={showKvkk} className="font-medium underline underline-offset-2">
                aydınlatma metnini
              </button>{" "}
              okudum, onaylıyorum.
            </span>
          </label>
          {err("kvkkConsent")}
          {showKvkk ? (
            <p className="max-h-56 overflow-y-auto whitespace-pre-line rounded-lg bg-[var(--color-surface-muted)] px-3 py-2 text-xs leading-relaxed text-[var(--color-text-muted)]">{kvkkText}</p>
          ) : null}
          <p className="rounded-lg bg-[var(--color-surface-muted)] px-3 py-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
            <span className="font-semibold text-[var(--color-text)]">Kontenjanlar sınırlıdır.</span> Başvuru, kesin kayıt anlamına gelmez. Kurumumuz sizinle iletişime geçecektir.
          </p>
          {errors.form ? (
            <p role="alert" className="rounded-lg bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{errors.form}</p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            aria-busy={busy || undefined}
            className="w-full rounded-lg bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-[var(--color-text-inverted)] transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-70"
          >
            {busy ? "Gönderiliyor…" : selected ? `${selected.name} için başvur` : "Başvuruyu gönder"}
          </button>
        </div>
      </form>
    </div>
  );
}
