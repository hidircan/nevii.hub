"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { actionUpdateMakeupWindowDays } from "@/lib/actions";

export function MakeupWindowDaysEditor({
  currentDays,
  canWrite,
  compact = false,
}: {
  currentDays: number;
  /** "Tüm kurumlar" görünümünde false — politika değiştirilemez. */
  canWrite: boolean;
  /** Üst özet satırında daha sıkı tipografi. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(currentDays));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
      setError("1-365 arası tam sayı girin.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const result = await actionUpdateMakeupWindowDays(parsed);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <div>
        <p
          className={
            compact
              ? "text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]"
              : "text-sm text-[var(--color-text-muted)]"
          }
        >
          Politika penceresi
        </p>
        <div className="mt-0.5 flex items-center gap-2">
          <p
            className={
              compact
                ? "text-xl font-semibold tabular-nums text-[var(--color-text)]"
                : "text-2xl font-semibold text-[var(--color-text)]"
            }
          >
            {currentDays} gün
          </p>
          {canWrite ? (
            <button
              type="button"
              onClick={() => {
                setValue(String(currentDays));
                setError(null);
                setEditing(true);
              }}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
            >
              Düzenle
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        Politika penceresi
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <input
          type="number"
          min={1}
          max={365}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Telafi politika penceresi (gün)"
          className="w-16 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm font-semibold text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]"
        />
        <button
          type="button"
          disabled={submitting}
          onClick={() => void handleSave()}
          className="rounded-md bg-[var(--color-primary)] px-2 py-1 text-[11px] font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
        >
          {submitting ? "…" : "Kaydet"}
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => {
            setEditing(false);
            setError(null);
          }}
          className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[11px] font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
        >
          Vazgeç
        </button>
      </div>
      {error ? <p className="mt-1 text-[11px] font-medium text-[var(--color-danger)]">{error}</p> : null}
    </div>
  );
}
