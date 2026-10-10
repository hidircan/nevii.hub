"use client";

/**
 * ÖNCELİK 4 (devam) — oda pasife alma/geri alma. 8. tur: pasif oda silinebilir
 * (soft delete — geçmiş ders kayıtları oda adını korur); aktif odada Sil yok.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionDeleteRoom, actionUpdateRoom } from "@/lib/actions";
import { CriticalDeleteDialog } from "@/components/critical-delete-dialog";

export function RoomArchiveToggle({ roomId, roomName, active }: { roomId: string; roomName: string; active: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onToggle() {
    setError(null);
    startTransition(async () => {
      const result = await actionUpdateRoom({ roomId, active: !active });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }


  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={pending}
          onClick={onToggle}
          className={
            active
              ? "rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
              : "rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
          }
        >
          {pending ? "…" : active ? "Pasife Al" : "Aktifleştir"}
        </button>
        {!active ? (
          <CriticalDeleteDialog
            triggerLabel="Sil"
            title={`"${roomName}" odasını sil`}
            meaning="Oda listelerden kaldırılır (geri alınabilir silme). Geçmiş ders kayıtları oda adını korur; ileri tarihli planlı ders varsa silme yapılmaz."
            confirmationName={roomName}
            confirmationLabel="Onay için oda adını aynen yazın"
            submitLabel="Odayı sil"
            loadImpact={async () => ({
              ok: true,
              data: {
                lines: [
                  ["Oda", roomName],
                  ["Durum", "Pasif"],
                  ["Geçmiş dersler", "Değişmez"],
                ],
                allowed: true,
                // Şifre durumu sunucuda doğrulanır; belirlenmemişse sunucu nedenini söyler.
                criticalPasswordConfigured: true,
              },
            })}
            onSubmit={async ({ criticalPassword, reason, confirmation }) => {
              if (confirmation.trim().toLocaleLowerCase("tr") !== roomName.trim().toLocaleLowerCase("tr")) {
                return { ok: false, message: `Onay için oda adını aynen yazın: "${roomName}".` };
              }
              const result = await actionDeleteRoom({ roomId, criticalPassword, reason });
              if (result.ok) router.refresh();
              return result.ok ? { ok: true } : { ok: false, message: result.message };
            }}
          />
        ) : null}
      </div>
      {error ? (
        <p className="mt-1 text-[11px] font-medium text-[var(--color-danger)]">{error}</p>
      ) : null}
    </div>
  );
}
