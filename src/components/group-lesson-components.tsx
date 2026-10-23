"use client";

/**
 * 2026-10-23 — Grup Dersleri istemci bileşenleri: tanım formu (oluştur/düzenle), ek oturum, oturum iptali, grubu
 * sonlandırma, satırları yenile ve mevcut öğrenciyi ekleme. Katılım branş kaydıyla açılır (öğrenci kartındaki aynı form):
 * bu bileşenler yalnız yönlendirir, ücret/sözleşme mantığı kopyalanmaz.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api/client-fetch";
import { friendlyApiErrorMessage } from "@/lib/api/friendly-error";
import { StudentSearchCombobox, type StudentSearchOption } from "@/components/student-search-combobox";
import type { GroupLesson } from "@/lib/group-lessons";

const field =
  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-focus-ring)] disabled:opacity-60";
const label = "mb-1 block text-xs font-semibold text-[var(--color-text)]";
const primaryBtn = "rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-[var(--color-text-inverted)] disabled:opacity-60";

async function send(body: unknown, method: "POST" | "PATCH" = "PATCH"): Promise<{ ok: true; data: unknown } | { ok: false; message: string }> {
  try {
    const res = await apiFetch("/api/v1/group-lessons", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await res.json()) as { ok: boolean; data?: unknown; error?: { code?: string; message?: string } };
    return j.ok ? { ok: true, data: j.data } : { ok: false, message: friendlyApiErrorMessage(j.error, "İşlem tamamlanamadı. Bilgileri kontrol edip tekrar deneyin.") };
  } catch {
    return { ok: false, message: "Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin." };
  }
}

function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <p
      role={msg.ok ? "status" : "alert"}
      className="rounded-md px-3 py-2 text-xs"
      style={{ background: msg.ok ? "var(--color-success-soft)" : "var(--color-danger-soft)", color: msg.ok ? "var(--color-success)" : "var(--color-danger)" }}
    >
      {msg.text}
    </p>
  );
}

export type GroupFormTeacher = { id: string; name: string; instruments: string[] };
export type GroupFormRoom = { id: string; name: string; branchName?: string };

/** Grup dersi tanımı. `group` verilirse düzenleme (branş değiştirilemez). */
export function GroupLessonForm({
  group,
  instruments,
  teachers,
  rooms,
}: {
  group?: GroupLesson;
  instruments: string[];
  teachers: GroupFormTeacher[];
  rooms: GroupFormRoom[];
}) {
  const router = useRouter();
  const [name, setName] = useState(group?.name ?? "");
  const [instrument, setInstrument] = useState(group?.instrument ?? "");
  const [teacherId, setTeacherId] = useState(group?.teacherId ?? "");
  const [roomId, setRoomId] = useState(group?.roomId ?? "");
  const [capacity, setCapacity] = useState(String(group?.capacity ?? 4));
  const [durationMinutes, setDurationMinutes] = useState(String(group?.durationMinutes ?? 40));
  const [monthlyFee, setMonthlyFee] = useState(group ? String(group.monthlyFee) : "");
  const [recurrence, setRecurrence] = useState<"weekly" | "once">(group?.recurrence ?? "weekly");
  const [startsOn, setStartsOn] = useState(group?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(group?.recurrence === "weekly" ? group.endsOn : "");
  const [startTime, setStartTime] = useState(group?.startTime ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const eligible = teachers.filter((t) => !instrument || t.instruments.includes(instrument));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!monthlyFee.trim()) return setMsg({ ok: false, text: "Grup öğrencisi başına aylık ücreti yazın (ücretsiz grup için 0)." });
    setBusy(true);
    setMsg(null);
    const body = {
      name,
      instrument,
      teacherId,
      roomId,
      capacity: Number(capacity),
      durationMinutes: Number(durationMinutes),
      monthlyFee: Number(monthlyFee.replace(/[^\d]/g, "")),
      recurrence,
      startsOn,
      endsOn: recurrence === "weekly" ? endsOn : undefined,
      startTime,
    };
    const r = group ? await send({ action: "update", groupLessonId: group.id, ...body }) : await send(body, "POST");
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.message });
    if (!group) {
      router.push(`/panel/grup-dersleri/${(r.data as { groupLessonId: string }).groupLessonId}`);
      return;
    }
    const d = r.data as { cancelled: number; created: number; kept: number };
    setMsg({
      ok: true,
      text:
        d.cancelled || d.created
          ? `Kaydedildi. Gelecek oturumlar yeni düzene göre güncellendi (${d.cancelled} satır kaldırıldı, ${d.created} satır eklendi${d.kept ? `, yoklaması girilmiş ${d.kept} satır korundu` : ""}).`
          : "Kaydedildi.",
    });
    router.refresh();
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="sm:col-span-2">
        <label htmlFor="gl-name" className={label}>Grup adı / etiketi</label>
        <input id="gl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Boş bırakılırsa otomatik (ör. Gitar grubu · Salı 18:00)" className={field} maxLength={80} />
      </div>
      <div>
        <label htmlFor="gl-instrument" className={label}>Branş / enstrüman</label>
        <select id="gl-instrument" value={instrument} onChange={(e) => setInstrument(e.target.value)} className={field} required disabled={!!group}>
          <option value="">Seçin</option>
          {instruments.map((i) => (
            <option key={i} value={i}>{i}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="gl-teacher" className={label}>Öğretmen</label>
        <select id="gl-teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className={field} required>
          <option value="">{instrument ? "Seçin" : "Önce branş seçin"}</option>
          {eligible.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="gl-room" className={label}>Oda</label>
        <select id="gl-room" value={roomId} onChange={(e) => setRoomId(e.target.value)} className={field} required>
          <option value="">Seçin</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>{r.name}{r.branchName ? ` · ${r.branchName}` : ""}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="gl-capacity" className={label}>Kapasite (öğrenci)</label>
        <input id="gl-capacity" type="number" min={2} max={50} step={1} inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} className={field} required />
      </div>
      <div>
        <label htmlFor="gl-duration" className={label}>Ders süresi</label>
        <select id="gl-duration" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} className={field}>
          {[30, 40, 50].map((m) => (
            <option key={m} value={String(m)}>{m} dk</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="gl-fee" className={label}>Öğrenci başı aylık ücret (TL)</label>
        <input id="gl-fee" inputMode="numeric" value={monthlyFee} onChange={(e) => setMonthlyFee(e.target.value.replace(/[^\d]/g, ""))} className={field} required aria-describedby="gl-fee-hint" />
      </div>
      <div>
        <label htmlFor="gl-rec" className={label}>Tekrar düzeni</label>
        <select id="gl-rec" value={recurrence} onChange={(e) => setRecurrence(e.target.value as "weekly" | "once")} className={field}>
          <option value="weekly">Haftalık</option>
          <option value="once">Tek seferlik</option>
        </select>
      </div>
      <div>
        <label htmlFor="gl-start" className={label}>{recurrence === "weekly" ? "Başlangıç tarihi (ilk ders günü)" : "Ders tarihi"}</label>
        <input id="gl-start" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className={field} required />
      </div>
      {recurrence === "weekly" ? (
        <div>
          <label htmlFor="gl-end" className={label}>Bitiş tarihi</label>
          <input id="gl-end" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className={field} required />
        </div>
      ) : null}
      <div>
        <label htmlFor="gl-time" className={label}>Saat</label>
        <input id="gl-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={field} required />
      </div>
      <div className="flex items-end">
        <button type="submit" disabled={busy} className={`${primaryBtn} w-full`}>
          {busy ? "Kaydediliyor…" : group ? "Değişiklikleri kaydet" : "Grup dersini oluştur"}
        </button>
      </div>
      <p id="gl-fee-hint" className="text-[11px] text-[var(--color-text-muted)] sm:col-span-2 lg:col-span-4">
        Haftalık düzende ders günü başlangıç tarihinin günüdür. Ücret, yeni katılan öğrencinin branş kaydına önerilir (sözleşme ve aylık tahakkuk bu
        kayıttan yürür); değişiklik mevcut katılımcıların ücretini değiştirmez. Öğretmen/oda/saat çakışması ve kapalı günler kontrol edilir.
        {group ? " Düzen değişirse yalnız gelecek ve yoklaması girilmemiş oturumlar güncellenir; geçmiş ders ve hakedişler korunur." : ""}
      </p>
      <div className="sm:col-span-2 lg:col-span-4">
        <Msg msg={msg} />
      </div>
    </form>
  );
}

/** Tek tıkla PATCH işlemi (onaylı). */
export function GroupLessonActionButton({
  body,
  label: text,
  confirmText,
  doneText,
  danger,
}: {
  body: Record<string, unknown>;
  label: string;
  confirmText?: string;
  /** Sunucu bileşeninden gelir → fonksiyon olamaz; `{alan}` yer tutucuları yanıt verisiyle doldurulur. */
  doneText: string;
  danger?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run() {
    if (busy || (confirmText && !window.confirm(confirmText))) return;
    setBusy(true);
    setMsg(null);
    const r = await send(body);
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: doneText.replace(/\{(\w+)\}/g, (_, k: string) => String((r.data as Record<string, unknown> | null)?.[k] ?? "")) } : { ok: false, text: r.message });
    if (r.ok) router.refresh();
  }
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className="rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
        style={danger ? { borderColor: "var(--color-danger)", color: "var(--color-danger)" } : { borderColor: "var(--color-border)", color: "var(--color-text)" }}
      >
        {busy ? "İşleniyor…" : text}
      </button>
      <Msg msg={msg} />
    </div>
  );
}

/** Tek seferlik ek oturum. */
export function GroupSessionAdd({ groupLessonId }: { groupLessonId: string }) {
  const router = useRouter();
  const [startLocal, setStartLocal] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const r = await send({ action: "addSession", groupLessonId, startLocal });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.message });
    setMsg({ ok: true, text: `Ek oturum eklendi (${(r.data as { created: number }).created} katılımcı satırı).` });
    setStartLocal("");
    router.refresh();
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-wrap items-end gap-2">
      <div>
        <label htmlFor="gl-extra" className={label}>Ek oturum (tarih ve saat)</label>
        <input id="gl-extra" type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} className={field} required />
      </div>
      <button type="submit" disabled={busy || !startLocal} className={primaryBtn}>{busy ? "Ekleniyor…" : "Oturum ekle"}</button>
      <div className="w-full"><Msg msg={msg} /></div>
    </form>
  );
}

/**
 * Mevcut öğrenciyi gruba ekle: öğrenci seçilir, öğrenci kartındaki "Branş kaydı ekle" formu bu grupla açılır — ücret,
 * ödeme, ilk tahsilat ve sözleşme bireysel kayıtla aynı akıştan geçer (yarım kayıt/kopya kural yok).
 */
export function GroupMemberAddExisting({ groupLessonId, candidates, full }: { groupLessonId: string; candidates: StudentSearchOption[]; full: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<StudentSearchOption | null>(null);
  const options = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    return q ? candidates.filter((c) => c.name.toLocaleLowerCase("tr").includes(q)) : candidates;
  }, [candidates, query]);
  if (full) return <p className="text-xs text-[var(--color-text-muted)]">Kontenjan dolu; yeni öğrenci eklemek için kapasiteyi artırın.</p>;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <StudentSearchCombobox
        idPrefix="gl-member"
        label="Mevcut öğrenci"
        placeholder="Öğrenci adı yazın"
        query={query}
        onQueryChange={setQuery}
        options={options}
        selectedId={selected?.id ?? null}
        onSelect={(o) => {
          setSelected(o);
          setQuery(o.name);
        }}
        onClear={() => {
          setSelected(null);
          setQuery("");
        }}
        className="min-w-[16rem]"
      />
      <button
        type="button"
        disabled={!selected}
        onClick={() => selected && router.push(`/panel/ogrenciler/${selected.id}?grupDersi=${encodeURIComponent(groupLessonId)}`)}
        className={primaryBtn}
      >
        Gruba ekle (kayıt formu)
      </button>
      <button type="button" onClick={() => router.push(`/panel/ogrenciler/yeni?grupDersi=${encodeURIComponent(groupLessonId)}`)} className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--color-text)]">
        Yeni öğrenciyle ekle
      </button>
    </div>
  );
}
