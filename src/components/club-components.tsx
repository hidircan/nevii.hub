"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api/client-fetch";
import { friendlyApiErrorMessage } from "@/lib/api/friendly-error";
import type { Club } from "@/lib/clubs";

const field =
  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-focus-ring)]";
const label = "mb-1 block text-xs font-semibold text-[var(--color-text)]";

async function send(url: string, method: "POST" | "PATCH", body: unknown): Promise<{ ok: true; data: unknown } | { ok: false; message: string }> {
  try {
    const res = await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await res.json()) as { ok: boolean; data?: unknown; error?: { code?: string; message?: string } };
    return j.ok ? { ok: true, data: j.data } : { ok: false, message: friendlyApiErrorMessage(j.error, "İşlem tamamlanamadı. Bilgileri kontrol edip tekrar deneyin.") };
  } catch {
    return { ok: false, message: "Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin." };
  }
}

const area = `${field} min-h-[5.5rem] resize-y leading-relaxed`;

export type SolfegeClubOption = { id: string; name: string; audience?: string; branchId?: string };

/**
 * Kulüp oluştur / düzenle. `club` verilirse düzenleme; `goToDetail` başarıda yeni kulübün detayına gider.
 * 2026-10-07: TASLAK için ad + alan + kontenjan + ücret + süre yeter (öğretmen ve üye gerekmez). "Başvuruya açık"
 * işaretlenirse grup, şube ve dönem tarihleri zorunludur (sunucu ayrıca denetler). Tüm alanlar sonradan düzeltilebilir.
 */
export function ClubForm({
  club,
  instruments,
  branches,
  teachers,
  solfegeClubs = [],
  goToDetail,
}: {
  club?: Club;
  instruments: string[];
  branches: { id: string; name: string }[];
  teachers: { id: string; name: string }[];
  solfegeClubs?: SolfegeClubOption[];
  goToDetail?: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(club?.name ?? "");
  const [instrument, setInstrument] = useState(club?.instrument ?? "");
  const [branchId, setBranchId] = useState(club?.branchId ?? "");
  const [maxMembers, setMaxMembers] = useState(String(club?.maxMembers ?? 10));
  const [monthlyFee, setMonthlyFee] = useState(club ? String(club.monthlyFee) : "");
  const [feePeriod, setFeePeriod] = useState<string>(club?.feePeriod ?? "monthly");
  const [durationMinutes, setDurationMinutes] = useState(String(club?.durationMinutes ?? 40));
  const [teacherIds, setTeacherIds] = useState<string[]>(club?.teacherIds ?? []);
  const [description, setDescription] = useState(club?.description ?? "");
  const [active, setActive] = useState(club?.active ?? true);
  const [audience, setAudience] = useState<string>(club?.audience ?? "");
  const [minAge, setMinAge] = useState(club?.minAge !== undefined ? String(club.minAge) : "");
  const [maxAge, setMaxAge] = useState(club?.maxAge !== undefined ? String(club.maxAge) : "");
  const [startDate, setStartDate] = useState(club?.startDate ?? "");
  const [endDate, setEndDate] = useState(club?.endDate ?? "");
  const [scheduleText, setScheduleText] = useState(club?.scheduleText ?? "");
  const [includesText, setIncludesText] = useState(club?.includesText ?? "");
  const [internalNote, setInternalNote] = useState(club?.internalNote ?? "");
  const [applicationsOpen, setApplicationsOpen] = useState(club?.applicationsOpen ?? false);
  const [waitlistEnabled, setWaitlistEnabled] = useState(club?.waitlistEnabled ?? false);
  const [includedSolfegeClubId, setIncludedSolfegeClubId] = useState(club?.includedSolfegeClubId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const isSolfege = instrument.toLocaleLowerCase("tr").includes("solfej");
  const solfegeChoices = solfegeClubs.filter(
    (c) => c.id !== club?.id && (!audience || !c.audience || c.audience === audience) && (!branchId || !c.branchId || c.branchId === branchId)
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (monthlyFee.trim() === "") return setError("Ücreti girin (ücretsiz kulüp için 0).");
    if (startDate && endDate && endDate < startDate) return setError("Bitiş tarihi başlangıç tarihinden önce olamaz.");
    setBusy(true);
    setError(null);
    setSaved(false);
    const r = await send("/api/v1/clubs", "POST", {
      ...(club ? { id: club.id } : {}),
      name,
      instrument,
      branchId: branchId || undefined,
      maxMembers: Number(maxMembers),
      monthlyFee: Number(monthlyFee.replace(/[^\d]/g, "")),
      feePeriod,
      durationMinutes: Number(durationMinutes),
      teacherIds,
      description,
      active,
      audience,
      minAge,
      maxAge,
      startDate,
      endDate,
      scheduleText,
      includesText,
      internalNote,
      applicationsOpen,
      waitlistEnabled,
      includedSolfegeClubId: isSolfege ? "" : includedSolfegeClubId,
    });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setSaved(true);
    const id = (r.data as { id: string }).id;
    if (goToDetail) router.push(`/panel/kulupler/${id}`);
    router.refresh();
  }

  const section = "sm:col-span-2 lg:col-span-4 mt-2 border-t border-[var(--color-border)] pt-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]";
  return (
    <form onSubmit={(e) => void submit(e)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <p className="sm:col-span-2 lg:col-span-4 text-xs text-[var(--color-text-muted)]">
        Kulüp üye ve öğretmen seçmeden taslak olarak kaydedilebilir. Başvuru portalında görünmesi için “Başvuruya açık” seçin; bunun için
        yaş grubu, şube ve dönem tarihleri gerekir. Tüm bilgiler sonradan düzeltilebilir.
      </p>
      <div className="sm:col-span-2">
        <label htmlFor="club-name" className={label}>Kulüp adı</label>
        <input id="club-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ör. Keman — Çocuk" className={field} required />
      </div>
      <div>
        <label htmlFor="club-instrument" className={label}>Enstrüman / eğitim alanı</label>
        <select id="club-instrument" value={instrument} onChange={(e) => setInstrument(e.target.value)} className={field} required>
          <option value="">Seçin…</option>
          {club && !instruments.includes(club.instrument) ? <option value={club.instrument}>{club.instrument} (katalogda pasif)</option> : null}
          {instruments.map((i) => (
            <option key={i} value={i}>{i}</option>
          ))}
        </select>
        <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">Listede yoksa (ör. Solfej) Enstrümanlar ekranından ekleyin.</p>
      </div>
      <div>
        <label htmlFor="club-branch" className={label}>Şube</label>
        <select id="club-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} className={field}>
          <option value="">Şube bağımsız</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="club-max" className={label}>Kontenjan (kişi)</label>
        <input id="club-max" type="number" min={1} max={50} value={maxMembers} onChange={(e) => setMaxMembers(e.target.value)} className={field} required />
      </div>
      <div>
        <label htmlFor="club-fee" className={label}>Ücret (₺, üye başına)</label>
        <input id="club-fee" inputMode="numeric" value={monthlyFee} onChange={(e) => setMonthlyFee(e.target.value)} placeholder="Ör. 1500" className={field} required />
      </div>
      <div>
        <label htmlFor="club-fee-period" className={label}>Ücretin niteliği</label>
        <select id="club-fee-period" value={feePeriod} onChange={(e) => setFeePeriod(e.target.value)} className={field}>
          <option value="monthly">Aylık (her ay borçlanır)</option>
          <option value="term">Dönemlik (tek sefer)</option>
          <option value="total">Toplam (tek sefer)</option>
        </select>
      </div>
      <div>
        <label htmlFor="club-duration" className={label}>Ders süresi (dk)</label>
        <input id="club-duration" type="number" min={20} max={240} step={5} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} className={field} required />
      </div>
      <div className="flex items-end">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Aktif (yeni üye alır)
        </label>
      </div>
      <fieldset className="sm:col-span-2 lg:col-span-4">
        <legend className={label}>Kulüp derslerini veren öğretmen(ler) — isteğe bağlı, oturum planlamak için gerekir</legend>
        <div className="flex flex-wrap gap-1.5">
          {teachers.map((t) => {
            const on = teacherIds.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => setTeacherIds((p) => (on ? p.filter((x) => x !== t.id) : [...p, t.id]))}
                className="rounded-full border px-2.5 py-1 text-xs"
                style={on ? { background: "var(--color-primary)", color: "var(--color-text-inverted)", borderColor: "var(--color-primary)" } : { borderColor: "var(--color-border)" }}
              >
                {t.name}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">Öğretmen bilgisi başvuru portalında hiçbir zaman gösterilmez.</p>
      </fieldset>

      <p className={section}>Başvuru portalında görünen bilgiler</p>
      <div>
        <label htmlFor="club-audience" className={label}>Yaş grubu</label>
        <select id="club-audience" value={audience} onChange={(e) => setAudience(e.target.value)} className={field}>
          <option value="">Seçilmedi</option>
          <option value="child">Çocuk</option>
          <option value="adult">Yetişkin</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="club-min-age" className={label}>En küçük yaş</label>
          <input id="club-min-age" type="number" min={3} max={99} value={minAge} onChange={(e) => setMinAge(e.target.value)} placeholder="—" className={field} />
        </div>
        <div>
          <label htmlFor="club-max-age" className={label}>En büyük yaş</label>
          <input id="club-max-age" type="number" min={3} max={99} value={maxAge} onChange={(e) => setMaxAge(e.target.value)} placeholder="—" className={field} />
        </div>
      </div>
      <div>
        <label htmlFor="club-start" className={label}>Başlangıç tarihi</label>
        <input id="club-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={field} />
      </div>
      <div>
        <label htmlFor="club-end" className={label}>Bitiş tarihi</label>
        <input id="club-end" type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} className={field} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="club-schedule" className={label}>Gün / saat (isteğe bağlı)</label>
        <input id="club-schedule" value={scheduleText} onChange={(e) => setScheduleText(e.target.value)} maxLength={200} placeholder="Ör. Cumartesi 10:00–11:00" className={field} />
      </div>
      <div className="sm:col-span-2">
        {isSolfege ? (
          <p className="pt-5 text-xs text-[var(--color-text-muted)]">Bu bir solfej kulübü: enstrüman/şan kulüplerinde “Dahil solfej kulübü” olarak seçilebilir; doğrudan başvuruda kendi ücreti geçerlidir.</p>
        ) : (
          <>
            <label htmlFor="club-solfege" className={label}>Dahil solfej kulübü (isteğe bağlı, ek ücretsiz)</label>
            <select id="club-solfege" value={includedSolfegeClubId} onChange={(e) => setIncludedSolfegeClubId(e.target.value)} className={field}>
              <option value="">Dahil solfej yok</option>
              {club?.includedSolfegeClubId && !solfegeChoices.some((c) => c.id === club.includedSolfegeClubId) ? (
                <option value={club.includedSolfegeClubId}>Mevcut seçim (uyumsuz — değiştirin)</option>
              ) : null}
              {solfegeChoices.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">Yalnız aynı yaş grubundaki, aynı şubedeki (veya şube bağımsız) ve dönemi uyumlu solfej kulüpleri.</p>
          </>
        )}
      </div>
      <div className="sm:col-span-2 lg:col-span-4">
        <label htmlFor="club-desc" className={label}>Açıklama (portalda görünür)</label>
        <textarea id="club-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={4} className={area} />
        <p className="mt-0.5 text-right text-[11px] text-[var(--color-text-muted)]">{description.length}/2000 · köşesinden sürükleyerek büyütebilirsiniz</p>
      </div>
      <div className="sm:col-span-2 lg:col-span-4">
        <label htmlFor="club-includes" className={label}>Ücrete dahil olanlar (portalda görünür)</label>
        <textarea id="club-includes" value={includesText} onChange={(e) => setIncludesText(e.target.value)} maxLength={1000} rows={2} placeholder="Ör. Haftada 1 grup dersi, nota materyali, dönem sonu konseri" className={area} />
      </div>
      <div className="sm:col-span-2 lg:col-span-4">
        <label htmlFor="club-internal" className={label}>Yönetim notu (yalnız panelde — portalda görünmez)</label>
        <textarea id="club-internal" value={internalNote} onChange={(e) => setInternalNote(e.target.value)} maxLength={2000} rows={2} className={area} />
      </div>
      <fieldset className="sm:col-span-2 lg:col-span-4 flex flex-wrap gap-x-6 gap-y-2 rounded-md bg-[var(--color-surface-muted)] px-3 py-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={applicationsOpen} onChange={(e) => setApplicationsOpen(e.target.checked)} /> Başvuruya açık (portalda listelenir)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={waitlistEnabled} onChange={(e) => setWaitlistEnabled(e.target.checked)} /> Kontenjan dolunca bekleme listesi için başvuru al
        </label>
      </fieldset>
      {club && Number(monthlyFee) !== club.monthlyFee && monthlyFee.trim() !== "" ? (
        <p className="sm:col-span-2 lg:col-span-4 rounded-md bg-[var(--color-info-soft)] px-3 py-2 text-xs text-[var(--color-info)]">
          Yeni ücret yalnız bundan sonra katılan üyelere uygulanır; mevcut üyeler katıldıkları ücreti ödemeye devam eder.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="sm:col-span-2 lg:col-span-4 rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-xs text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-3">
        <button type="submit" disabled={busy} className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-text-inverted)] disabled:opacity-60">
          {busy ? "Kaydediliyor…" : club ? "Değişiklikleri kaydet" : "Kulübü oluştur"}
        </button>
        {saved && !goToDetail ? <span className="text-xs text-[var(--color-success)]">Kaydedildi.</span> : null}
      </div>
    </form>
  );
}

type MemberCandidate = { id: string; name: string; phone?: string };

/**
 * Kulübe mevcut bir öğrenciyi ekler (başlangıç ayının ücreti borç olarak yazılır).
 * 2026-10-07 — kök düzeltme: liste 50 kayıtla KESİLİYORDU (`slice(0, 50)`), 50'den sonraki öğrenciler seçilemiyordu.
 * Artık tüm adaylar ad veya telefonla aranır; sonuç kaydırılabilir listede sınırsız gösterilir.
 */
export function ClubMemberAdd({ clubId, candidates, full }: { clubId: string; candidates: MemberCandidate[]; full: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [studentId, setStudentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const k = q.trim().toLocaleLowerCase("tr");
    const digits = q.replace(/\D/g, "");
    if (!k) return candidates;
    return candidates.filter((c) => c.name.toLocaleLowerCase("tr").includes(k) || (digits.length >= 3 && (c.phone ?? "").replace(/\D/g, "").includes(digits)));
  }, [q, candidates]);
  const selected = candidates.find((c) => c.id === studentId);

  async function add() {
    if (!studentId) return setError("Eklenecek öğrenciyi listeden seçin.");
    setBusy(true);
    setError(null);
    const r = await send("/api/v1/clubs/members", "POST", { clubId, studentId });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setStudentId("");
    setQ("");
    router.refresh();
  }

  if (full) return <p className="text-xs text-[var(--color-text-muted)]">Kontenjan dolu — yeni üye için kontenjanı artırın veya bir üyeliği sonlandırın.</p>;
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Öğrenci ara (ad veya telefon) — ${candidates.length} öğrenci`}
            aria-label="Öğrenci ara"
            aria-controls="club-member-results"
            className={field}
          />
          <ul id="club-member-results" role="listbox" aria-label="Öğrenciler" className="mt-1 max-h-60 overflow-y-auto rounded-md border border-[var(--color-border)]">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-[var(--color-text-muted)]">Eşleşen öğrenci yok.</li>
            ) : (
              filtered.map((c) => (
                <li key={c.id} role="option" aria-selected={studentId === c.id}>
                  <button
                    type="button"
                    onClick={() => setStudentId(c.id)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--color-surface-muted)]"
                    style={studentId === c.id ? { background: "var(--color-primary-soft)", color: "var(--color-primary-soft-text)" } : undefined}
                  >
                    <span className="truncate">{c.name}</span>
                    {c.phone ? <span className="shrink-0 text-xs tabular-nums text-[var(--color-text-muted)]">{c.phone}</span> : null}
                  </button>
                </li>
              ))
            )}
          </ul>
          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">{filtered.length} sonuç{selected ? ` · seçili: ${selected.name}` : ""}</p>
        </div>
        <div>
          <button type="button" onClick={() => void add()} disabled={busy || !studentId} className="w-full rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-[var(--color-text-inverted)] disabled:opacity-60">
            {busy ? "Ekleniyor…" : selected ? `${selected.name} — üye ekle` : "Üye ekle"}
          </button>
        </div>
      </div>
      <p className="text-[11px] text-[var(--color-text-muted)]">Eklenince başlangıç ayının kulüp ücreti öğrencinin açık borcuna yazılır (ücret 0 ise yazılmaz); Ödemeler ekranından tahsil edilir.</p>
      {error ? <p role="alert" className="text-xs text-[var(--color-danger)]">{error}</p> : null}
    </div>
  );
}

/** Üyeliği sonlandırır (kayıt silinmez; bu ay son ücretli aydır). Öğrenci kaydı/ders/yoklama/tahsilat/sözleşme değişmez. */
export function ClubMemberEnd({ membershipId, studentName }: { membershipId: string; studentName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  async function end() {
    if (
      !window.confirm(
        `${studentName} kulüpten çıkarılsın mı?\n\nYalnız kulüp üyeliği sonlanır: öğrenci kaydı, geçmiş dersler, yoklama, tahsilat ve sözleşme SİLİNMEZ. Bu ayın kulüp ücreti kalır, sonraki aylar borçlandırılmaz; ileri tarihli kulüp oturumlarından çıkarılır. Yanlışlıkla yaparsanız "Ayrılan üyeler" bölümünden geri alabilirsiniz.`
      )
    )
      return;
    setBusy(true);
    const r = await send("/api/v1/clubs/members", "PATCH", { membershipId });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    const ended = (r.data as { endedIncluded?: string[] }).endedIncluded ?? [];
    if (ended.length) setInfo(`Dahil solfej üyeliği de sonlandı (başka hak kalmadı): ${ended.join(", ")}.`);
    router.refresh();
  }
  return (
    <span className="inline-flex flex-col items-end">
      <button type="button" onClick={() => void end()} disabled={busy} className="text-xs font-medium text-[var(--color-danger)] hover:underline disabled:opacity-60">
        {busy ? "…" : "Üyeliği sonlandır"}
      </button>
      {error ? <span role="alert" className="text-[11px] text-[var(--color-danger)]">{error}</span> : null}
      {info ? <span role="status" className="text-[11px] text-[var(--color-text-muted)]">{info}</span> : null}
    </span>
  );
}

/** Yanlış girilen üyelik tarihlerini düzelt / sonlandırmayı geri al. */
export function ClubMemberDates({ membershipId, startDate, endDate }: { membershipId: string; startDate: string; endDate?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(startDate);
  const [end, setEnd] = useState(endDate ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const r = await send("/api/v1/clubs/members", "PATCH", { action: "update", membershipId, ...body });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setOpen(false);
    router.refresh();
  }
  if (!open) {
    return (
      <span className="inline-flex gap-3">
        <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-[var(--color-primary)] hover:underline">
          Tarihleri düzelt
        </button>
        {endDate ? (
          <button type="button" disabled={busy} onClick={() => void save({ endDate: "" })} className="text-xs font-medium text-[var(--color-primary)] hover:underline disabled:opacity-60">
            {busy ? "…" : "Sonlandırmayı geri al"}
          </button>
        ) : null}
        {error ? <span role="alert" className="text-[11px] text-[var(--color-danger)]">{error}</span> : null}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-end gap-2">
      <label className="text-[11px]">
        Başlangıç
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={`${field} mt-0.5 w-36`} />
      </label>
      <label className="text-[11px]">
        Bitiş {endDate ? "" : "(boş = devam)"}
        <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className={`${field} mt-0.5 w-36`} />
      </label>
      <button type="button" disabled={busy} onClick={() => void save({ startDate: start, endDate: end })} className="rounded-md bg-[var(--color-primary)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-text-inverted)] disabled:opacity-60">
        {busy ? "…" : "Kaydet"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-[var(--color-text-muted)]">Vazgeç</button>
      {error ? <span role="alert" className="basis-full text-[11px] text-[var(--color-danger)]">{error}</span> : null}
    </span>
  );
}

/** Başvurudan (ücretsiz) açılan üyeliğin başlangıç ayı ücretini yöneticinin açık işlemiyle yazar. */
export function ClubMemberStartFee({ membershipId, amountText }: { membershipId: string; amountText: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function write() {
    if (!window.confirm(`Başlangıç ayının kulüp ücreti (${amountText}) öğrencinin açık borcuna yazılsın mı?`)) return;
    setBusy(true);
    const r = await send("/api/v1/clubs/members", "PATCH", { action: "startFee", membershipId });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    router.refresh();
  }
  return (
    <span className="inline-flex flex-col items-start">
      <button type="button" onClick={() => void write()} disabled={busy} className="text-[11px] font-medium text-[var(--color-primary)] hover:underline disabled:opacity-60">
        {busy ? "…" : "Başlangıç ücretini yaz"}
      </button>
      {error ? <span role="alert" className="text-[11px] text-[var(--color-danger)]">{error}</span> : null}
    </span>
  );
}

/** Kulübü başvuruya aç / kapat (eksik bilgi varsa sunucu nedenini söyler). */
export function ClubApplicationsToggle({ clubId, open }: { clubId: string; open: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function toggle() {
    setBusy(true);
    setError(null);
    const r = await send("/api/v1/clubs", "PATCH", { clubId, open: !open });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    router.refresh();
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={open}
        onClick={() => void toggle()}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-60"
        style={open ? { borderColor: "var(--color-success)", color: "var(--color-success)", background: "var(--color-success-soft)" } : { borderColor: "var(--color-border-strong)", color: "var(--color-text-muted)" }}
      >
        <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: open ? "var(--color-success)" : "var(--color-border-strong)" }} />
        {busy ? "…" : open ? "Başvuruya açık" : "Başvuruya kapalı"}
      </button>
      {error ? <span role="alert" className="max-w-md text-[11px] text-[var(--color-danger)]">{error}</span> : null}
    </span>
  );
}

/** Site köküne göre yolu (ör. /basvuru/kurum/kulup) tam bağlantı olarak panoya kopyalar; pano izni yoksa metni gösterir. */
export function CopyLinkButton({ path, label: text = "Bağlantıyı kopyala" }: { path: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const [url, setUrl] = useState(path);
  async function copy() {
    const full = `${window.location.origin}${path}`;
    setUrl(full);
    try {
      await navigator.clipboard.writeText(full);
      setState("copied");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("manual");
    }
  }
  return (
    <span className="inline-flex flex-col">
      <button type="button" onClick={() => void copy()} className="rounded-md border border-[var(--color-border-strong)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--color-surface-muted)]">
        {state === "copied" ? "Kopyalandı ✓" : text}
      </button>
      {state === "manual" ? <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Bağlantı" className={`${field} mt-1 w-72 text-xs`} autoFocus /> : null}
    </span>
  );
}

/** 2. aşama — oturum planla (tek veya haftalık tekrar). Tümü doğrulanmadan hiçbiri yazılmaz (sunucu). */
export function ClubSessionScheduler({
  clubId,
  teachers,
  rooms,
}: {
  clubId: string;
  teachers: { id: string; name: string }[];
  rooms: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [teacherId, setTeacherId] = useState(teachers[0]?.id ?? "");
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [startLocal, setStartLocal] = useState("");
  const [weeks, setWeeks] = useState("1");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!startLocal) return setMsg({ ok: false, text: "İlk oturumun tarih ve saatini seçin." });
    setBusy(true);
    setMsg(null);
    const r = await send("/api/v1/clubs/sessions", "POST", { clubId, teacherId, roomId, startLocal, weeks: Number(weeks) });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.message });
    const n = (r.data as { sessionIds: string[] }).sessionIds.length;
    setMsg({ ok: true, text: `${n} oturum planlandı; ders programında "${n > 1 ? "haftalık" : "tek"}" kulüp kartı olarak görünür.` });
    router.refresh();
  }

  if (teachers.length === 0) {
    return <p className="text-xs text-[var(--color-text-muted)]">Oturum planlamak için önce “Kulübü düzenle” bölümünden kulübe en az bir öğretmen ekleyin.</p>;
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      <div>
        <label htmlFor="cs-start" className={label}>İlk oturum</label>
        <input id="cs-start" type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} className={field} required />
      </div>
      <div>
        <label htmlFor="cs-weeks" className={label}>Haftalık tekrar</label>
        <select id="cs-weeks" value={weeks} onChange={(e) => setWeeks(e.target.value)} className={field}>
          {[1, 2, 4, 8, 12, 16].map((n) => (
            <option key={n} value={n}>{n === 1 ? "Tek oturum" : `${n} hafta`}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="cs-teacher" className={label}>Öğretmen</label>
        <select id="cs-teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className={field}>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="cs-room" className={label}>Oda</label>
        <select id="cs-room" value={roomId} onChange={(e) => setRoomId(e.target.value)} className={field}>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>
      <div className="flex items-end">
        <button type="submit" disabled={busy || !teacherId || !roomId} className="w-full rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-[var(--color-text-inverted)] disabled:opacity-60">
          {busy ? "Planlanıyor…" : "Oturum planla"}
        </button>
      </div>
      <p className="sm:col-span-2 lg:col-span-5 text-[11px] text-[var(--color-text-muted)]">
        Oda kapasitesi aranmaz; yalnız odanın ve öğretmenin o saatte boş olması, üyelerin başka dersinin olmaması kontrol edilir.
      </p>
      {msg ? (
        <p role={msg.ok ? "status" : "alert"} className="sm:col-span-2 lg:col-span-5 rounded-md px-3 py-2 text-xs" style={{ background: msg.ok ? "var(--color-success-soft)" : "var(--color-danger-soft)", color: msg.ok ? "var(--color-success)" : "var(--color-danger)" }}>
          {msg.text}
        </p>
      ) : null}
    </form>
  );
}

const TEACHER_OPTIONS: [string, string][] = [
  ["geldi", "Geldi"],
  ["gelmedi", "Gelmedi"],
  ["mazeretli", "Mazeretli"],
];

/** Oturumun öğretmen yoklaması (tüm üye satırlarına birlikte yazılır; hakediş "Geldi" oturumu bir kez sayar). */
export function ClubSessionTeacher({ sessionId, initial }: { sessionId: string; initial?: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function mark(next: string) {
    setBusy(next);
    setError(null);
    const r = await send("/api/v1/clubs/sessions", "PATCH", { action: "teacher", sessionId, status: next });
    setBusy(null);
    if (!r.ok) return setError(r.message);
    setStatus(next);
    router.refresh();
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-[var(--color-text-muted)]">Öğretmen yoklaması:</span>
      <div role="group" aria-label="Öğretmen yoklaması" className="inline-flex gap-1">
        {TEACHER_OPTIONS.map(([v, l]) => (
          <button
            key={v}
            type="button"
            aria-pressed={status === v}
            disabled={busy !== null}
            onClick={() => void mark(v)}
            className="rounded-md border px-2.5 py-1 text-xs font-semibold disabled:opacity-60"
            style={status === v ? { borderColor: "var(--color-primary)", background: "var(--color-primary-soft)", color: "var(--color-primary-soft-text)" } : { borderColor: "var(--color-border-strong)" }}
          >
            {busy === v ? "…" : l}
          </button>
        ))}
      </div>
      {!status ? <span className="text-xs text-[var(--color-text-muted)]">(girilmedi — hakedişe girmez)</span> : null}
      {error ? <p role="alert" className="basis-full text-xs text-[var(--color-danger)]">{error}</p> : null}
    </div>
  );
}

/** Oturumu toptan ertele (Telafi): tüm üyeler için yeni tarihte yeni oturum; bireysel telafi girilmez. */
export function ClubSessionPostpone({ sessionId, rooms, defaultRoomId, clubId }: { sessionId: string; rooms: { id: string; name: string }[]; defaultRoomId: string; clubId: string }) {
  const router = useRouter();
  const [startLocal, setStartLocal] = useState("");
  const [roomId, setRoomId] = useState(defaultRoomId);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await send("/api/v1/clubs/sessions", "PATCH", { action: "postpone", sessionId, startLocal, roomId, reason });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    router.push(`/panel/kulupler/${clubId}/oturum/${(r.data as { newSessionId: string }).newSessionId}`);
    router.refresh();
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="grid gap-2 sm:grid-cols-4">
      <div>
        <label htmlFor="pp-start" className={label}>Yeni tarih / saat</label>
        <input id="pp-start" type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} className={field} required />
      </div>
      <div>
        <label htmlFor="pp-room" className={label}>Oda</label>
        <select id="pp-room" value={roomId} onChange={(e) => setRoomId(e.target.value)} className={field}>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="pp-reason" className={label}>Gerekçe</label>
        <input id="pp-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Ör. öğretmen hastalandı" className={field} required />
      </div>
      <div className="flex items-end">
        <button type="submit" disabled={busy} className="w-full rounded-md border border-[var(--color-warning)] px-3 py-2 text-sm font-semibold text-[var(--color-warning)] disabled:opacity-60">
          {busy ? "Erteleniyor…" : "Oturumu ertele (Telafi)"}
        </button>
      </div>
      {error ? <p role="alert" className="sm:col-span-4 text-xs text-[var(--color-danger)]">{error}</p> : null}
    </form>
  );
}

/** Yoklaması girilmemiş oturumu iptal et (satırlar silinmez, "İptal" olur). */
export function ClubSessionCancel({ sessionId, clubId }: { sessionId: string; clubId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function cancel() {
    if (!window.confirm("Bu oturum iptal edilsin mi? Üyelerin programından kalkar; yoklama girilmiş oturum iptal edilemez.")) return;
    setBusy(true);
    const r = await send("/api/v1/clubs/sessions", "PATCH", { action: "cancel", sessionId });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    router.push(`/panel/kulupler/${clubId}`);
    router.refresh();
  }
  return (
    <span className="inline-flex flex-col">
      <button type="button" onClick={() => void cancel()} disabled={busy} className="text-sm font-medium text-[var(--color-danger)] hover:underline disabled:opacity-60">
        {busy ? "İptal ediliyor…" : "Oturumu iptal et"}
      </button>
      {error ? <span role="alert" className="text-xs text-[var(--color-danger)]">{error}</span> : null}
    </span>
  );
}

/**
 * 2026-10-07 — Yanlış girilen oturumu düzelt (tarih/saat, oda, öğretmen). Erteleme değildir: Telafi statüsü açılmaz.
 * İsteğe bağlı olarak aynı gün+saatteki sonraki (yoklamasız) oturumlar da aynı farkla kaydırılır.
 */
export function ClubSessionReschedule({
  sessionId,
  initialLocal,
  rooms,
  teachers,
  defaultRoomId,
  defaultTeacherId,
}: {
  sessionId: string;
  initialLocal: string;
  rooms: { id: string; name: string }[];
  teachers: { id: string; name: string }[];
  defaultRoomId: string;
  defaultTeacherId: string;
}) {
  const router = useRouter();
  const [startLocal, setStartLocal] = useState(initialLocal);
  const [roomId, setRoomId] = useState(defaultRoomId);
  const [teacherId, setTeacherId] = useState(defaultTeacherId);
  const [applyToFollowing, setApplyToFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await send("/api/v1/clubs/sessions", "PATCH", { action: "reschedule", sessionId, startLocal, roomId, teacherId, applyToFollowing });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.message });
    const n = (r.data as { moved: number }).moved;
    setMsg({ ok: true, text: n > 1 ? `${n} oturum düzeltildi.` : "Oturum düzeltildi." });
    router.refresh();
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="grid gap-2 sm:grid-cols-4">
      <div>
        <label htmlFor="rs-start" className={label}>Doğru tarih / saat</label>
        <input id="rs-start" type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} className={field} required />
      </div>
      <div>
        <label htmlFor="rs-room" className={label}>Oda</label>
        <select id="rs-room" value={roomId} onChange={(e) => setRoomId(e.target.value)} className={field}>
          {rooms.some((r) => r.id === defaultRoomId) ? null : <option value={defaultRoomId}>Mevcut oda</option>}
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="rs-teacher" className={label}>Öğretmen</label>
        <select id="rs-teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className={field}>
          {teachers.some((t) => t.id === defaultTeacherId) ? null : <option value={defaultTeacherId}>Mevcut öğretmen</option>}
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
      <div className="flex items-end">
        <button type="submit" disabled={busy} className="w-full rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-[var(--color-text-inverted)] disabled:opacity-60">
          {busy ? "Kaydediliyor…" : "Oturumu düzelt"}
        </button>
      </div>
      <label className="sm:col-span-4 flex items-center gap-2 text-xs">
        <input type="checkbox" checked={applyToFollowing} onChange={(e) => setApplyToFollowing(e.target.checked)} />
        Aynı gün ve saatteki sonraki oturumları da aynı farkla kaydır (yanlış kurulmuş haftalık seri için)
      </label>
      {msg ? (
        <p role={msg.ok ? "status" : "alert"} className="sm:col-span-4 rounded-md px-3 py-2 text-xs" style={{ background: msg.ok ? "var(--color-success-soft)" : "var(--color-danger-soft)", color: msg.ok ? "var(--color-success)" : "var(--color-danger)" }}>
          {msg.text}
        </p>
      ) : null}
    </form>
  );
}
