"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { Button, Label, Select } from "@/components/ui";
import { friendlyApiErrorMessage } from "@/lib/api/friendly-error";

export type SchedulePickerOption = { id: string; name: string };

type SlotSummary = {
  weekday: number;
  time: string;
  occurrenceCount: number;
  conflictCount: number;
  skippedCount: number;
};

type PlanResponse = {
  dryRun: boolean;
  slots: SlotSummary[];
  checks: { startAt: string; ok: boolean; message?: string }[];
  createdLessonIds: string[];
  message: string;
};

const WEEKDAY_LABELS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

/**
 * K — "Ders programını oluştur" (2026-09-20).
 *
 * Akış bilinçli olarak İKİ ADIMLIDIR: önce ÖNİZLEME (`dryRun: true`, hiçbir
 * kayıt yazılmaz), kullanıcı gün/saatleri ve atlanacak/çakışan tarihleri
 * gördükten sonra ONAY. Tek tıkla ders üretmek, yanlış öğretmen/oda seçiminde
 * onlarca hatalı dersi sessizce yaratırdı.
 *
 * Gün/saat BURADA SORULMAZ — sözleşmede dondurulmuş değer kullanılır. Aynı
 * bilgiyi üçüncü kez girdirmek bu işin çözmeye çalıştığı problemin ta kendisi.
 */
export function ContractLessonScheduleGenerator({
  contractId,
  scheduleText,
  teachers,
  rooms,
  defaultTeacherId,
}: {
  contractId: string;
  scheduleText: string;
  teachers: SchedulePickerOption[];
  rooms: SchedulePickerOption[];
  defaultTeacherId?: string;
}) {
  const router = useRouter();
  const [teacherId, setTeacherId] = useState(defaultTeacherId ?? teachers[0]?.id ?? "");
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function call(dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/contracts/${contractId}/lesson-schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId, roomId, dryRun, skipConflicts: true }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { ok?: boolean; data?: PlanResponse; error?: { code?: string; message?: string } }
        | null;
      if (!res.ok || !payload?.data) {
        setError(
          friendlyApiErrorMessage(payload?.error, payload?.error?.message ?? "Ders programı oluşturulamadı.")
        );
        return;
      }
      if (dryRun) {
        setPlan(payload.data);
        setDone(null);
      } else {
        setPlan(null);
        setDone(payload.data.message);
        router.refresh();
      }
    } catch {
      setError("Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  if (!scheduleText.trim()) {
    return (
      <p className="text-xs text-[var(--color-text-muted)]">
        Bu sözleşmede ders günü/saati kayıtlı değil, bu yüzden ders programı otomatik oluşturulamaz.
        Öğrenci kaydındaki veya sözleşmedeki “Ders günü/saati” alanını doldurun.
      </p>
    );
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
      <p className="text-sm font-semibold text-[var(--color-text)]">Ders programını oluştur</p>
      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
        Sözleşmede kayıtlı gün/saat kullanılır: <strong>{scheduleText}</strong>. Gün ve saati tekrar
        girmeniz gerekmez; yalnız öğretmen ve oda seçin.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Öğretmen</Label>
          <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Oda</Label>
          {rooms.length > 0 ? (
            <Select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          ) : (
            <p className="mt-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
              Aktif oda yok. Pasif odalara ders oluşturulamaz — önce Odalar ekranından bir odayı aktifleştirin.
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={busy || !teacherId || !roomId} onClick={() => void call(true)}>
          <CalendarPlus className="mr-1.5 h-4 w-4" />
          {busy && !plan ? "Hesaplanıyor…" : "Önizle"}
        </Button>
        {plan ? (
          <Button type="button" disabled={busy} onClick={() => void call(false)}>
            {busy ? "Oluşturuluyor…" : "Dersleri oluştur"}
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 text-sm font-medium" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      ) : null}

      {done ? (
        <p className="mt-3 text-sm font-medium" style={{ color: "var(--color-success)" }}>
          {done} Ders Programı ekranından görüntüleyebilirsiniz.
        </p>
      ) : null}

      {plan ? (
        <div className="mt-3 rounded-[var(--radius-md)] bg-[var(--color-surface-muted)] p-3 text-xs">
          <p className="font-medium text-[var(--color-text)]">{plan.message}</p>
          <ul className="mt-2 space-y-1 text-[var(--color-text-muted)]">
            {plan.slots.map((s) => (
              <li key={`${s.weekday}-${s.time}`}>
                {WEEKDAY_LABELS[s.weekday]} {s.time} — {s.occurrenceCount} ders
                {s.skippedCount > 0 ? ` · ${s.skippedCount} kapalı gün atlanacak` : ""}
                {s.conflictCount > 0 ? ` · ${s.conflictCount} çakışma` : ""}
              </li>
            ))}
          </ul>
          {plan.checks.some((c) => !c.ok) ? (
            <details className="mt-2">
              <summary className="cursor-pointer font-medium text-[var(--color-text)]">
                Oluşturulamayacak tarihleri göster
              </summary>
              <ul className="mt-1 space-y-0.5">
                {plan.checks
                  .filter((c) => !c.ok)
                  .slice(0, 20)
                  .map((c) => (
                    <li key={c.startAt}>
                      {c.startAt.slice(0, 10)} — {c.message}
                    </li>
                  ))}
              </ul>
            </details>
          ) : null}
          <p className="mt-2 text-[var(--color-text-muted)]">
            Oluşturulan dersler bu sözleşmeye bağlanır. Sözleşme sonradan iptal edilirse dersler
            otomatik silinmez; size kaç gelecek ders olduğu sorulur.
          </p>
        </div>
      ) : null}
    </div>
  );
}
