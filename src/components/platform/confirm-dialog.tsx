"use client";

import { Button } from "@/components/ui";

export function ConfirmBar({
  open,
  title,
  description,
  onCancel,
  onConfirm,
  pending,
}: {
  open: boolean;
  title: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
  pending?: boolean;
}) {
  if (!open) return null;
  return (
    <div
      role="alertdialog"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-desc"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
    >
      <div
        className="w-full max-w-md rounded-[var(--radius-lg)] border p-5 shadow-[var(--shadow-md)]"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        <h2 id="confirm-title" className="text-base font-semibold text-[var(--color-text)]">
          {title}
        </h2>
        <p id="confirm-desc" className="mt-2 text-sm text-[var(--color-text-muted)]">
          {description}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={pending}>
            Vazgeç
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={pending}>
            {pending ? "Kaydediliyor…" : "Onayla ve kaydet"}
          </Button>
        </div>
      </div>
    </div>
  );
}
