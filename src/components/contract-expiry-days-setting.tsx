"use client";

import { useState, useTransition } from "react";
import { actionSetStudentContractExpiryDays } from "@/lib/actions";
import { Button } from "@/components/ui";

/** Bildirim Ayarları — öğrenci sözleşmesi bitiş uyarısının süresi (kurum geneli). */
export function ContractExpiryDaysSetting({ initialDays, canEdit }: { initialDays: number; canEdit: boolean }) {
  const [days, setDays] = useState(String(initialDays));
  const [saved, setSaved] = useState(initialDays);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const n = Number(days);
    startTransition(async () => {
      const res = await actionSetStudentContractExpiryDays(n);
      if (res.ok) {
        setSaved(res.days);
        setMessage({ ok: true, text: `Kaydedildi: sözleşme bitişine ${res.days} gün kala uyarı oluşturulacak.` });
      } else {
        setMessage({ ok: false, text: res.message });
      }
    });
  }

  return (
    <div className="mt-6 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-[var(--color-text)]">Öğrenci sözleşmesi bitiş uyarısı</h2>
      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
        Öğrencinin güncel sözleşmesinin bitişine seçilen gün kadar kala, kurumun yöneticilerine uygulama içi bildirim
        oluşturulur (aynı sözleşme ve bitiş tarihi için bir kez; bitiş tarihi değişirse yeniden). Öğrenciye veya veliye
        mesaj gönderilmez. Bildirimi kendiniz için açıp kapatmak: yukarıdaki listede “Öğrenci sözleşmesi bitiyor”.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium text-[var(--color-text-muted)]">
          Bitişten kaç gün önce
          <input
            type="number"
            min={1}
            max={90}
            inputMode="numeric"
            value={days}
            disabled={!canEdit || pending}
            onChange={(e) => setDays(e.target.value)}
            className="mt-1 block w-28 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
          />
        </label>
        {canEdit ? (
          <Button type="button" onClick={save} disabled={pending || Number(days) === saved}>
            {pending ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        ) : (
          <p className="text-xs text-[var(--color-text-muted)]">Bu süreyi yalnız kurum yöneticileri değiştirebilir.</p>
        )}
      </div>
      {message ? (
        <p role="status" className={`mt-2 text-xs font-medium ${message.ok ? "text-emerald-700" : "text-rose-600"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
