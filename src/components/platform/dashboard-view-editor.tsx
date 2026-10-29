"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DASHBOARD_SECTIONS, DASHBOARD_VIEW_COOKIE } from "@/lib/platform/dashboard-view";

/**
 * Görünümü düzenle: bölüm göster/gizle. Tercih bu tarayıcıda çerezde
 * saklanır (oturumlar arası kalıcı, yalnız bu cihaz). Hassas veri
 * içermez; sunucu yalnız izinli bölüm id'lerini okur.
 */
export function DashboardViewEditor({ hidden: initialHidden }: { hidden: string[] }) {
  const router = useRouter();
  const [hidden, setHidden] = useState<string[]>(initialHidden);
  const [saved, setSaved] = useState(false);

  function toggle(id: string) {
    setHidden((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));
    setSaved(false);
  }

  function save(next: string[]) {
    try {
      document.cookie = `${DASHBOARD_VIEW_COOKIE}=${encodeURIComponent(next.join(","))};path=/;max-age=31536000;SameSite=Lax`;
    } catch {
      /* çerez yazılamazsa görünüm değişmez */
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <details className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5">
      <summary className="cursor-pointer text-sm font-medium text-[var(--color-text)]">
        Görünümü düzenle
      </summary>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
        {DASHBOARD_SECTIONS.map((s) => (
          <label key={s.id} className="flex cursor-pointer items-center gap-2 text-sm text-[var(--color-text)]">
            <input
              type="checkbox"
              checked={!hidden.includes(s.id)}
              onChange={() => toggle(s.id)}
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            {s.label}
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => save(hidden)}
          className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
        >
          Kaydet
        </button>
        <button
          type="button"
          onClick={() => {
            setHidden([]);
            save([]);
          }}
          className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
        >
          Varsayılana dön
        </button>
        {saved ? (
          <span role="status" className="text-xs text-[var(--color-text-muted)]">
            Kaydedildi.
          </span>
        ) : null}
      </div>
    </details>
  );
}
