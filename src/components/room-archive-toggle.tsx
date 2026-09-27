"use client";

/**
 * ÖNCELİK 4 (devam) — oda pasife alma/geri alma. 8. tur: pasif oda silinebilir
 * (soft delete — geçmiş ders kayıtları oda adını korur); aktif odada Sil yok.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionDeleteRoom, actionUpdateRoom } from "@/lib/actions";

export function RoomArchiveToggle({ roomId, active }: { roomId: string; active: boolean }) {
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

  function onDelete() {
    if (
      !window.confirm(
        "Bu oda kalıcı olarak silinecek. Geçmiş ders kayıtları etkilenmez. Devam etmek istiyor musunuz?"
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await actionDeleteRoom(roomId);
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
          <button
            type="button"
            disabled={pending}
            onClick={onDelete}
            className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1 text-xs font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] disabled:opacity-50"
          >
            Sil
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="mt-1 text-[11px] font-medium text-[var(--color-danger)]">{error}</p>
      ) : null}
    </div>
  );
}
