"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Özet yenileme — anket (polling) YOK. Başvuru ve ödeme kayıtları platformla
 * AYNI depoya yazıldığından her yenilemede günceldir; bu düğme açık sayfayı
 * sunucudan tazeler.
 */
export function DashboardRefresh({ at }: { at: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <span className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
      Son güncelleme: {at}
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          router.refresh();
          setTimeout(() => setBusy(false), 800);
        }}
        className="rounded-[var(--radius-md)] border border-[var(--color-border-strong)] px-2 py-1 font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)] disabled:opacity-60"
      >
        {busy ? "Yenileniyor…" : "Yenile"}
      </button>
    </span>
  );
}
