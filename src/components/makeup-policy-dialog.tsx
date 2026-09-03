"use client";

import { useState } from "react";
import { Info, X } from "lucide-react";

export function MakeupPolicyDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
      >
        <Info className="h-4 w-4" aria-hidden="true" />
        Telafi politikası
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={() => setOpen(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="makeup-policy-title"
            className="w-full max-w-lg rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-primary)]">Telafi Merkezi</p>
                <h2 id="makeup-policy-title" className="mt-1 text-xl font-semibold text-[var(--color-text)]">
                  Telafi politikası
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Telafi politikası penceresini kapat"
                className="rounded-md p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-base font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              Dönem başına 2 telafi hakkı
            </p>
            <p className="mt-4 text-sm leading-6 text-[var(--color-text-muted)]">
              Telafi hakları dönem içinde kullanılır. Her öğrenci aktif eğitim dönemi boyunca en fazla 2 telafi hakkı kullanabilir. Kullanılmayan haklar sonraki döneme devretmez.
            </p>
            <p className="mt-3 text-xs text-[var(--color-text-muted)]">
              Açık veya onaylanmış telafi talebi hakkı rezerve eder. İptal edilen ve süresi dolan talepler sayılmaz.
            </p>
          </section>
        </div>
      ) : null}
    </>
  );
}
