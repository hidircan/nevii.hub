import { ATTENDED_PLANNED_MAKEUP_HINT, ATTENDED_PLANNED_MAKEUP_LABEL } from "@/lib/lesson-live-status";

/**
 * 2026-10-06 — "Planlanan telafiye geldi" işareti (T). Ders kartı/gün kutusu/rozet AYNI işareti kullanır;
 * dolgu rengi normal "Geldi" yeşilidir, ayrım bu işaretle (ve metin/aria etiketiyle) yapılır.
 * Beyaz zemin + koyu yeşil harf: hem yeşil dolgu hem açık rozet üzerinde okunur.
 */
export function PlannedMakeupMarker({ className = "" }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label={ATTENDED_PLANNED_MAKEUP_LABEL}
      title={ATTENDED_PLANNED_MAKEUP_HINT}
      className={`inline-flex h-3.5 w-3.5 shrink-0 select-none items-center justify-center rounded-[3px] bg-white text-[9px] font-extrabold leading-none text-green-800 shadow-sm ring-1 ring-green-700 ${className}`}
    >
      T
    </span>
  );
}
