"use client";

/**
 * 2026-10-06 — Telafi talebinin önerilen saatleri VARSAYILAN KAPALI. Yalnız kullanıcı düğmeye bastığında
 * (fare, Enter veya Boşluk — yerel <button>) açılır; kapalıyken panel DOM'a hiç bağlanmaz ve yer kaplamaz.
 *
 * Öneriler zaten kayıtlıdır (`suggestedSlots`, "Uygun saatleri bul" ile üretilir); sayfa bunları kapsamlı tek
 * okumadan yeniden doğrular. Açılışta ayrı bir sunucu isteği YAPILMAZ: her açılışta kurumun tüm verisini
 * yeniden okumak (Supabase egress'in baskın kaynağı) bellekteki doğrulamadan pahalıdır ve yeni bir veri yüzeyi
 * açardı. Kayıt/yenileme sonrası sayfa yeniden doğrulandığında içerik kendiliğinden güncellenir; açık/kapalı
 * durumu korunur.
 */

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function suggestionsToggleLabel(open: boolean): string {
  return open ? "Önerilen saatleri gizle" : "Önerilen saatleri göster";
}

export function MakeupSuggestionsDisclosure({
  requestId,
  count,
  children,
}: {
  requestId: string;
  /** Kayıtlı öneri sayısı (talep satırından — sayım için öneri yüklenmez). */
  count: number;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = `telafi-oneriler-${requestId}`;
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-focus-ring)]"
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        {suggestionsToggleLabel(open)}
        <span
          aria-hidden="true"
          className="rounded-full bg-[var(--color-surface-muted)] px-1.5 text-xs tabular-nums text-[var(--color-text-muted)]"
        >
          {count}
        </span>
        <span className="sr-only">({count} kayıtlı öneri)</span>
      </button>
      <div id={panelId} hidden={!open} className="order-last basis-full">
        {open ? children : null}
      </div>
    </>
  );
}
