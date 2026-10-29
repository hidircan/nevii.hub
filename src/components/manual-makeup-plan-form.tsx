"use client";

import { useMemo, useState } from "react";
import { resolveAppTimezone, toZonedYmd, zonedWallTimeToUtc } from "@/lib/timezone";
import { makeupPlanningDeadline } from "@/lib/makeup-deadline";
import { useRouter } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui";

type TeacherOption = { id: string; name: string; branchId: string; branchIds?: string[] };
type RoomOption = { id: string; name: string; branchId: string };

export function ManualMakeupPlanForm({
  requestId,
  preferredTeacherId,
  sourceBranchId,
  lessonDurationMinutes,
  teachers,
  rooms,
  canWrite,
  expiresAt,
}: {
  requestId: string;
  preferredTeacherId: string;
  sourceBranchId: string;
  lessonDurationMinutes: number;
  teachers: TeacherOption[];
  rooms: RoomOption[];
  /** "Tüm kurumlar" görünümünde false — manuel telafi planlanamaz. */
  canWrite: boolean;
  /** Talebin son kullanım anı — üst sınır (sunucu AFTER_EXPIRY ile aynı). Alt sınır yok: geçmiş tarih serbest. */
  expiresAt?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const initialTeacherId =
    teachers.find((t) => t.id === preferredTeacherId)?.id ??
    teachers.find((t) => t.branchId === sourceBranchId)?.id ??
    teachers[0]?.id ??
    "";
  const [teacherId, setTeacherId] = useState(initialTeacherId);
  const selectedTeacher = teachers.find((t) => t.id === teacherId);
  const availableRooms = useMemo(
    // Öğretmenin ders verdiği TÜM şubeler (birincil + ek) — sunucu kuralı teacherServesBranch ile aynı.
    () => rooms.filter((r) => r.branchId === selectedTeacher?.branchId || (selectedTeacher?.branchIds ?? []).includes(r.branchId)),
    [rooms, selectedTeacher]
  );
  const [roomId, setRoomId] = useState(availableRooms[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  // Sayfa açılış anı — render içinde Date.now() çağrılmaz (saf render).
  const [nowMs] = useState(() => Date.now());
  const expiryDay = expiresAt ? toZonedYmd(new Date(expiresAt), resolveAppTimezone()) : undefined;
  const pickedStart = date && time ? zonedWallTimeToUtc(date, time) : null;
  const isPast = Boolean(pickedStart && !Number.isNaN(pickedStart.getTime()) && pickedStart.getTime() < nowMs);
  // Sunucu AFTER_EXPIRY ile AYNI kural (makeup-engine): dersin BİTİŞİ, son günün ertesi 00:00'ını aşamaz.
  // Eskiden yalnız gün karşılaştırılıyordu; gece yarısını aşan son gün dersi formdan geçip sunucuda reddediliyordu.
  const afterExpiry = Boolean(
    expiresAt &&
      pickedStart &&
      !Number.isNaN(pickedStart.getTime()) &&
      pickedStart.getTime() + lessonDurationMinutes * 60_000 > makeupPlanningDeadline(expiresAt).getTime()
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  // 2026-10-04 — öğretmen müsaitlik dışı: yetkili kullanıcıya açık onay (normal ders planlamasıyla aynı kural).
  const [overridePrompt, setOverridePrompt] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [draft, setDraft] = useState<{
    smsSendable: boolean;
    smsBlockReason?: string;
    smsBody: string;
    parent: { body: string; waLink: string | null; missingPhoneReason?: string };
    whatsappDeliveryNote: string;
  } | null>(null);

  function onTeacherChange(nextTeacherId: string) {
    setTeacherId(nextTeacherId);
    const nextTeacher = teachers.find((t) => t.id === nextTeacherId);
    const nextRooms = rooms.filter((r) => r.branchId === nextTeacher?.branchId || (nextTeacher?.branchIds ?? []).includes(r.branchId));
    if (!nextRooms.some((r) => r.id === roomId)) {
      setRoomId(nextRooms[0]?.id ?? "");
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    await submit(false);
  }

  async function submit(overrideAvailability: boolean) {
    if (!date || !time || !teacherId || !roomId) {
      setError("Tarih, saat, öğretmen ve oda seçimi zorunlu.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(false);
    try {
      const startAt = zonedWallTimeToUtc(date, time);
      if (Number.isNaN(startAt.getTime())) {
        setError("Geçerli bir tarih ve saat seçin.");
        setBusy(false);
        return;
      }
      const endAt = new Date(startAt.getTime() + lessonDurationMinutes * 60000);
      const branchId = availableRooms.find((r) => r.id === roomId)?.branchId ?? sourceBranchId;
      const res = await fetch("/api/v1/makeup/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          slot: {
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
            teacherId,
            roomId,
            branchId,
            score: 0,
            reasons: ["Manuel planlama"],
          },
          // Boş gerekçe gönderilmez — sunucu da boşu saklamaz.
          decisionNote: decisionNote.trim() || undefined,
          ...(overrideAvailability ? { overrideAvailability: true, overrideReason: overrideReason.trim() || undefined } : {}),
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        error?: { message: string; details?: { overridable?: boolean } };
        data?: {
          communication?: {
            smsSendable: boolean;
            smsBlockReason?: string;
            smsBody: string;
            parent: { body: string; waLink: string | null; missingPhoneReason?: string };
            whatsappDeliveryNote: string;
          } | null;
        };
      };
      if (!json.ok) {
        if (!overrideAvailability && json.error?.details?.overridable) {
          setOverridePrompt(json.error.message);
          setBusy(false);
          return;
        }
        setError(json.error?.message || "Telafi dersi planlanamadı.");
        setBusy(false);
        return;
      }
      setOverridePrompt(null);
      setOverrideReason("");
      setSuccess(true);
      setDraft(json.data?.communication ?? null);
      router.refresh();
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    if (!canWrite) {
      return (
        <p className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          &quot;Tüm kurumlar&quot; görünümündesiniz — manuel telafi planlamak için üstteki kurum
          seçiciden tek bir kurum seçin.
        </p>
      );
    }
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
      >
        <CalendarPlus className="h-4 w-4" /> Başka bir saat planla
      </button>
    );
  }

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      className="order-last mt-1 w-full basis-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)]/70 p-4"
    >
      <p className="text-sm font-medium text-[var(--color-text)] dark:text-slate-200">Başka bir saat planla</p>
      <p className="mb-3 mt-0.5 text-xs text-[var(--color-text-muted)]">
        Listede yalnız aktif odalar var. Kaydederken öğretmen, oda ve öğrenci çakışması, kapalı gün ve son kullanım tarihi
        kontrol edilir; uygun değilse ders yazılmaz ve nedeni gösterilir.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">Tarih</label>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            max={expiryDay}
            required
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-muted)] outline-none ring-amber-200 focus:ring-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">Başlangıç saati</label>
          <input
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            required
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-muted)] outline-none ring-amber-200 focus:ring-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">Öğretmen</label>
          <select
            value={teacherId}
            onChange={(event) => onTeacherChange(event.target.value)}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-muted)] outline-none ring-amber-200 focus:ring-2"
          >
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">Oda</label>
          <select
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-muted)] outline-none ring-amber-200 focus:ring-2"
          >
            {availableRooms.length === 0 ? (
              <option value="">Bu öğretmenin şubelerinde bu enstrümana uygun aktif oda yok</option>
            ) : (
              availableRooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))
            )}
          </select>
        </div>
      </div>
      {isPast ? (
        <p role="status" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
          Geçmiş bir tarih seçtiniz. Telafi dersi bu tarihle programa ve yoklama takvimine “Planlanan telafi” olarak
          eklenir; yapılmış/işlenmiş sayılmaz ve yoklamada “Geldi” ya da “İşlendi” girilene kadar hakedişe girmez.
          Öğretmen, oda ve öğrenci çakışmaları yine kontrol edilir.
        </p>
      ) : null}
      {afterExpiry ? (
        <p className="mt-3 text-xs font-medium text-rose-600">
          Ders, talebin son kullanım gününü ({expiryDay}) aşıyor; bu talep için planlanamaz. Daha erken bir gün/saat seçin veya yetkili yönetici son günü uzatsın.
        </p>
      ) : null}
      <div className="mt-3">
        <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
          Planlama gerekçesi (isteğe bağlı)
        </label>
        <textarea
          value={decisionNote}
          onChange={(event) => setDecisionNote(event.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="Bu tarihe neden planlamak istiyorsunuz?"
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-muted)] outline-none ring-amber-200 focus:ring-2"
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="submit" variant="success" disabled={busy || availableRooms.length === 0 || afterExpiry}>
          {busy ? "Planlanıyor..." : "Telafi dersini planla"}
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-muted)] dark:text-slate-300"
        >
          Vazgeç
        </button>
      </div>
      {overridePrompt ? (
        <div role="alertdialog" aria-label="Öğretmen müsaitlik dışı" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
          <p className="text-sm font-semibold">Öğretmenin müsaitlik saati dışında</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <dt>Öğretmen</dt>
            <dd className="font-medium">{selectedTeacher?.name ?? "—"}</dd>
            <dt>Tarih</dt>
            <dd className="font-medium">{date ? new Date(`${date}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", weekday: "long" }) : "—"}</dd>
            <dt>Saat</dt>
            <dd className="font-medium">
              {time}
              {pickedStart ? `–${new Date(pickedStart.getTime() + lessonDurationMinutes * 60000).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" })}` : ""} ({lessonDurationMinutes} dk)
            </dd>
          </dl>
          <p className="mt-2"><strong>Neden:</strong> {overridePrompt}</p>
          <p className="mt-1">
            Onay YALNIZ öğretmenin bildirdiği müsaitliği aşar. Öğretmenin, odanın veya öğrencinin aynı saatteki başka dersi,
            kapalı gün ve son kullanım tarihi yine kontrol edilir; bunlar aşılamaz.
          </p>
          <label className="mt-2 block font-medium">
            Kısa gerekçe (önerilir — denetim kaydına yazılır)
            <textarea
              value={overrideReason}
              onChange={(event) => setOverrideReason(event.target.value.slice(0, 500))}
              rows={2}
              maxLength={500}
              className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-2 py-1 text-xs text-[var(--color-text)]"
            />
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" variant="danger" disabled={busy} onClick={() => void submit(true)}>
              {busy ? "Planlanıyor..." : "Müsaitlik dışında planla"}
            </Button>
            <button type="button" className="text-xs font-medium underline" onClick={() => setOverridePrompt(null)}>
              Vazgeç
            </button>
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs font-medium text-rose-600">{error}</p> : null}
      {success ? (
        <div className="mt-2 space-y-2 text-xs text-emerald-800">
          <p className="font-medium">Telafi dersi planlandı: programda ve yoklama takviminde turuncu “Planlanan telafi” olarak görünür.</p>
          {draft ? (
            <div className="rounded-lg border border-emerald-100 bg-[var(--color-surface)] p-2 text-[var(--color-text-muted)]">
              <p className="font-medium text-[var(--color-text)]">Veli iletişim taslağı (otomatik gönderilmez)</p>
              <p className="mt-1 whitespace-pre-wrap">{draft.parent.body}</p>
              {draft.parent.waLink ? (
                <a href={draft.parent.waLink} target="_blank" rel="noreferrer" className="mt-1 inline-block text-emerald-700 underline">
                  WhatsApp’ta aç
                </a>
              ) : (
                <p className="mt-1">{draft.parent.missingPhoneReason ?? "WhatsApp taslağı gönderilemez."}</p>
              )}
              <p className="mt-1 text-[11px]">{draft.whatsappDeliveryNote}</p>
              <p className="mt-2 font-medium">SMS taslağı</p>
              <p className="whitespace-pre-wrap">{draft.smsBody}</p>
              {draft.smsSendable ? (
                <p className="mt-1">SMS gönderilebilir — mevcut onaylı SMS akışından elle başlatın.</p>
              ) : (
                <p className="mt-1 text-amber-700">{draft.smsBlockReason ?? "SMS gönderilemez."}</p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
