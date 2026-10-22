"use client";

import { useEffect } from "react";
import Link from "@/components/link";
import { ArrowLeft, FileDown, Printer } from "lucide-react";

/** Basılı çıktıda hiç görünmeyen ekran-only aksiyon çubuğu — PDF olarak kaydet / yazdır desteğiyle. */
export function AssessmentActions({
  backHref,
  backLabel = "Geri dön",
  autoPrint = false,
}: {
  backHref: string;
  backLabel?: string;
  autoPrint?: boolean;
}) {
  useEffect(() => {
    if (!autoPrint) return;
    const timer = window.setTimeout(() => {
      window.print();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [autoPrint]);

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-2 print:hidden">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
      >
        <ArrowLeft className="h-4 w-4" /> {backLabel}
      </Link>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
        >
          <FileDown className="h-4 w-4" /> PDF İndir / Yazdır
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          aria-label="Yazdır"
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
        >
          <Printer className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
