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

/** Kulüp oluştur / düzenle. `club` verilirse düzenleme; `goToDetail` başarıda yeni kulübün detayına gider. */
export function ClubForm({
  club,
  instruments,
  branches,
  teachers,
  goToDetail,
}: {
  club?: Club;
  instruments: string[];
  branches: { id: string; name: string }[];
  teachers: { id: string; name: string }[];
  goToDetail?: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(club?.name ?? "");
  const [instrument, setInstrument] = useState(club?.instrument ?? "");
  const [branchId, setBranchId] = useState(club?.branchId ?? "");
  const [maxMembers, setMaxMembers] = useState(String(club?.maxMembers ?? 10));
  const [monthlyFee, setMonthlyFee] = useState(club ? String(club.monthlyFee) : "");
  const [durationMinutes, setDurationMinutes] = useState(String(club?.durationMinutes ?? 40));
  const [teacherIds, setTeacherIds] = useState<string[]>(club?.teacherIds ?? []);
  const [description, setDescription] = useState(club?.description ?? "");
  const [active, setActive] = useState(club?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (monthlyFee.trim() === "") return setError("Aylık ücreti girin (ücretsiz kulüp için 0).");
    if (teacherIds.length === 0) return setError("Kulüp derslerini verecek en az bir öğretmen seçin.");
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
      durationMinutes: Number(durationMinutes),
      teacherIds,
      description: description || undefined,
      active,
    });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setSaved(true);
    const id = (r.data as { id: string }).id;
    if (goToDetail) router.push(`/panel/kulupler/${id}`);
    router.refresh();
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="sm:col-span-2">
        <label htmlFor="club-name" className={label}>Kulüp adı</label>
        <input id="club-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ör. Solfej Kulübü" className={field} required />
      </div>
      <div>
        <label htmlFor="club-instrument" className={label}>Enstrüman / alan</label>
        <select id="club-instrument" value={instrument} onChange={(e) => setInstrument(e.target.value)} className={field} required>
          <option value="">Seçin…</option>
          {instruments.map((i) => (
            <option key={i} value={i}>{i}</option>
          ))}
        </select>
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
        <label htmlFor="club-fee" className={label}>Aylık ücret (₺, üye başına)</label>
        <input id="club-fee" inputMode="numeric" value={monthlyFee} onChange={(e) => setMonthlyFee(e.target.value)} placeholder="Ör. 1500" className={field} required />
      </div>
      <div>
        <label htmlFor="club-duration" className={label}>Oturum süresi (dk)</label>
        <input id="club-duration" type="number" min={20} max={240} step={5} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} className={field} required />
      </div>
      <div className="flex items-end">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Aktif (yeni üye alır)
        </label>
      </div>
      <fieldset className="sm:col-span-2 lg:col-span-4">
        <legend className={label}>Kulüp derslerini veren öğretmen(ler)</legend>
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
      </fieldset>
      <div className="sm:col-span-2 lg:col-span-4">
        <label htmlFor="club-desc" className={label}>Açıklama (isteğe bağlı)</label>
        <textarea id="club-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={2} className={field} />
      </div>
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

/** Kulübe mevcut bir öğrenciyi ekler (başlangıç ayının ücreti borç olarak yazılır). */
export function ClubMemberAdd({ clubId, candidates, full }: { clubId: string; candidates: { id: string; name: string }[]; full: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [studentId, setStudentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const k = q.trim().toLocaleLowerCase("tr");
    return (k ? candidates.filter((c) => c.name.toLocaleLowerCase("tr").includes(k)) : candidates).slice(0, 50);
  }, [q, candidates]);

  async function add() {
    if (!studentId) return setError("Eklenecek öğrenciyi seçin.");
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
      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Öğrenci ara…" aria-label="Öğrenci ara" className={`${field} max-w-48`} />
        <select value={studentId} onChange={(e) => setStudentId(e.target.value)} aria-label="Eklenecek öğrenci" className={`${field} max-w-72`}>
          <option value="">Öğrenci seçin ({filtered.length})</option>
          {filtered.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button type="button" onClick={() => void add()} disabled={busy} className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm font-semibold text-[var(--color-text-inverted)] disabled:opacity-60">
          {busy ? "Ekleniyor…" : "Üye ekle"}
        </button>
      </div>
      <p className="text-[11px] text-[var(--color-text-muted)]">Eklenince bu ayın kulüp ücreti öğrencinin açık borcuna yazılır; Ödemeler ekranından tahsil edilir.</p>
      {error ? <p role="alert" className="text-xs text-[var(--color-danger)]">{error}</p> : null}
    </div>
  );
}

/** Üyeliği sonlandırır (kayıt silinmez; bu ay son ücretli aydır). */
export function ClubMemberEnd({ membershipId, studentName }: { membershipId: string; studentName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function end() {
    if (!window.confirm(`${studentName} kulüpten ayrılsın mı? Bu ayın ücreti kalır, sonraki aylar borçlandırılmaz.`)) return;
    setBusy(true);
    const r = await send("/api/v1/clubs/members", "PATCH", { membershipId });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    router.refresh();
  }
  return (
    <span className="inline-flex flex-col items-end">
      <button type="button" onClick={() => void end()} disabled={busy} className="text-xs font-medium text-[var(--color-danger)] hover:underline disabled:opacity-60">
        {busy ? "…" : "Üyeliği sonlandır"}
      </button>
      {error ? <span role="alert" className="text-[11px] text-[var(--color-danger)]">{error}</span> : null}
    </span>
  );
}
