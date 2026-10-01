"use client";

import Link from "@/components/link";
import { ArrowLeft, Printer } from "lucide-react";

/** Basılı çıktıda hiç görünmeyen ekran-only aksiyon çubuğu — bkz. receipt-actions.tsx. */
export function AssessmentActions({ backHref }: { backHref: string }) {
  return (
    <div className="mb-6 flex items-center justify-between print:hidden">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
      >
        <ArrowLeft className="h-4 w-4" /> Geri dön
      </Link>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-amber-700"
      >
        <Printer className="h-4 w-4" /> Yazdır
      </button>
    </div>
  );
}
