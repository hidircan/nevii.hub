"use client";

/**
 * Öğretmen performans skoru bilgi popover — yalnızca kodda tanımlı faktörler.
 * Bkz. src/lib/insights/teacher-performance.ts
 */
import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";

export function TeacherPerformanceInfo() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointer(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Performans skoru nasıl hesaplanır?"
        title="Performans skoru nasıl hesaplanır?"
        className="inline-flex h-8 min-h-8 w-8 min-w-8 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-labelledby={titleId}
          className="absolute right-0 top-full z-30 mt-1.5 w-72 max-w-[min(18rem,calc(100vw-2rem))] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[var(--shadow-md)]"
        >
          <p id={titleId} className="text-sm font-semibold text-[var(--color-text)]">
            Performans skoru (0–100)
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-text-muted)]">
            Yalnızca işlenmiş yoklama kayıtlarından hesaplanır; AI skoru üretmez. En az 3 yoklamalı
            ders gerekir; aksi halde “yetersiz veri” gösterilir.
          </p>
          <ul className="mt-2 space-y-1 text-xs text-[var(--color-text)]">
            <li>
              <span className="font-medium">Geldi</span> — tam katkı
            </li>
            <li>
              <span className="font-medium">Geç</span> — %60 katkı
            </li>
            <li>
              <span className="font-medium">Gelmedi</span> — katkı yok (paydada sayılır)
            </li>
            <li>
              <span className="font-medium">Okul iptali</span> — oran üzerinden ceza (−20 × iptal oranı)
            </li>
          </ul>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
            Formül: ((geldi + geç×0,6) / yoklama sayısı)×100 − (okul iptali / yoklama sayısı)×20.
            Sonuç 0–100 aralığına yuvarlanır. Karar desteğidir; tek başına değerlendirme ölçütü
            değildir.{" "}
            <a href="/panel/yardim#performans-skoru" className="font-medium text-[var(--color-primary)] hover:underline">
              Yardım Merkezi
            </a>
          </p>
        </div>
      ) : null}
    </div>
  );
}
