"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Kurumsal diyalog kabuğu — öğrenci silme diyaloğuyla aynı görsel dil
 * (mobilde alttan sayfa, masaüstünde ortalı panel). Escape ve boş alana
 * tıklama `busy` değilken kapatır; açılınca odak panele alınır.
 *
 * UAT 2026-09-24 (G) — `document.body`'ye portallanır: sticky/overflow bir
 * ebeveynin (ör. Ders Programı'ndaki "Seçili ders" paneli) stacking context'i
 * içinde kalıp takvim çizgilerinin ARKASINA düşmez; görünmeyen diyalog yerine
 * tıklama alttaki takvim hücresine gidip planlama penceresini açıyordu.
 * Portal olayları React ağacında yine ebeveynlere kabarcıklandığı için kök
 * katmanda durdurulur. Kapanınca odak diyaloğu açan öğeye döner.
 */
export function ModalShell({
  open,
  title,
  tone = "default",
  busy = false,
  onClose,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  title: ReactNode;
  tone?: "default" | "danger" | "warning";
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // 10. tur iş #5 — odak YALNIZCA açılış geçişinde panele alınır, kapanışta
  // tetikleyiciye döner. KÖK NEDEN: efekt `[open, busy, onClose]` bağımlıydı
  // ve TÜM kullanıcılar satır-içi (her render'da yeni kimlikli) `onClose`
  // veriyor → metin alanına yazılan HER karakterde efekt yeniden koşuyor,
  // `ref.current?.focus()` odağı panel başına çekiyor, temizlikteki
  // `trigger?.focus?.()` tetikleyiciye sıçratıyordu. `busy`/`onClose`
  // güncelliği ref aynasıyla korunur (yeniden abone yok, odak çalma yok).
  const busyRef = useRef(busy);
  const onCloseRef = useRef(onClose);
  const triggerRef = useRef<HTMLElement | null>(null);

  // Güncellik aynası — render sırasında ref yazımı lint tarafından yasaklı
  // (`react-hooks/refs`); klavye olayları boyadan sonra dağıldığı için
  // efekt-içi senkronizasyon Escape işleyici için yeterince tazedir.
  useEffect(() => {
    busyRef.current = busy;
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busyRef.current) onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // Yalnızca açık→kapalı geçişinde (efekt `open` değişiminde koşar).
      triggerRef.current?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  const accent = tone === "danger" ? "var(--color-danger)" : tone === "warning" ? "var(--color-warning)" : "var(--color-primary)";

  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="presentation"
      onPointerDown={stop}
      onMouseDown={stop}
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`max-h-[90vh] w-full overflow-y-auto rounded-t-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-md)] outline-none sm:rounded-[var(--radius-lg)] ${
          size === "lg" ? "max-w-2xl" : "max-w-lg"
        }`}
        style={{ borderTop: `3px solid ${accent}` }}
      >
        <div className="p-4">
          <h3 id={titleId} className="text-sm font-semibold text-[var(--color-text)]">
            {title}
          </h3>
          <div className="mt-3 text-sm text-[var(--color-text)]">{children}</div>
        </div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-2.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

export const modalButton = {
  secondary:
    "rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)] disabled:opacity-40",
  primary:
    "rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40",
  danger:
    "rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40 bg-[var(--color-danger)] hover:brightness-110",
};
