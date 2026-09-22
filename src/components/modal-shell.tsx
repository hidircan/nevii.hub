"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * Kurumsal diyalog kabuğu — öğrenci silme diyaloğuyla aynı görsel dil
 * (mobilde alttan sayfa, masaüstünde ortalı panel). Escape ve boş alana
 * tıklama `busy` değilken kapatır; açılınca odak panele alınır.
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

  useEffect(() => {
    if (!open) return;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;
  const accent = tone === "danger" ? "var(--color-danger)" : tone === "warning" ? "var(--color-warning)" : "var(--color-primary)";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={(e) => {
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
    </div>
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
