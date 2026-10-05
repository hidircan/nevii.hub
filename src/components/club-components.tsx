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
