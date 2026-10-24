"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { actionUpdateMakeupWindowDays, actionUpdateMonthlyMakeupAllowance } from "@/lib/actions";

export function MakeupWindowDaysEditor({
  currentDays,
  monthlyAllowance = 2,
  canWrite,
  compact = false,
}: {
  currentDays: number;
  monthlyAllowance?: number;
  /** "Tüm kurumlar" görünümünde false — politika değiştirilemez. */
  canWrite: boolean;
  /** Üst özet satırında daha sıkı tipografi. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(currentDays));
  const [allowance, setAllowance] = useState(String(monthlyAllowance));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const parsed = Number(value);
    const parsedAllowance = Number(allowance);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
      setError("Pencere: 1-365 gün.");
      return;
    }
    if (!Number.isInteger(parsedAllowance) || parsedAllowance < 0 || parsedAllowance > 31) {
      setError("Dönem başına hak: 0-31.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const [windowRes, allowanceRes] = await Promise.all([
      actionUpdateMakeupWindowDays(parsed),
      actionUpdateMonthlyMakeupAllowance(parsedAllowance),
    ]);
    setSubmitting(false);
    if (!windowRes.ok) {
      setError(windowRes.message);
      return;
    }
    if (!allowanceRes.ok) {
      setError(allowanceRes.message);
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
          Politika
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <p
            className={
              compact
                ? "text-sm font-semibold tabular-nums text-[var(--color-text)]"
                : "text-base font-semibold text-[var(--color-text)]"
            }
          >
            {currentDays} gün pencere
          </p>
          <p className="text-sm font-semibold tabular-nums text-[var(--color-text)]">
            Dönem başına {monthlyAllowance} hak
          </p>
          {canWrite ? (
            <button
              type="button"
              onClick={() => {
                setValue(String(currentDays));
                setAllowance(String(monthlyAllowance));
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
      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Politika</p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <label className="text-[10px] text-[var(--color-text-muted)]">
          Gün
          <input
            type="number"
            min={1}
            max={365}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Telafi politika penceresi (gün)"
            className="ml-1 w-14 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm font-semibold text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]"
          />
        </label>
        <label className="text-[10px] text-[var(--color-text-muted)]">
          Dönem başına hak
          <input
            type="number"
            min={0}
            max={31}
            value={allowance}
            onChange={(e) => setAllowance(e.target.value)}
            aria-label="Dönem başına telafi hakkı"
            className="ml-1 w-14 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm font-semibold text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]"
          />
        </label>
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
      <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">
        Pencere artırılınca açık ve planlı telafilerin son günü de uzar; azaltmak mevcut talepleri kısaltmaz.
      </p>
      {error ? <p className="mt-1 text-[11px] font-medium text-[var(--color-danger)]">{error}</p> : null}
    </div>
  );
}
