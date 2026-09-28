"use client";

import { useEffect, useRef, useState } from "react";

/** Kurum logosu; yüklenemezse baş harf rozetine düşer (kırık görsel gösterilmez). */
export function CareerLogo({ logoUrl, name }: { logoUrl?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // Görsel hidrasyondan ÖNCE hata verdiyse onError hiç tetiklenmez — mount'ta durumu kontrol et.
  useEffect(() => {
    const img = ref.current;
     
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);
  if (logoUrl && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img ref={ref} src={logoUrl} alt={name} onError={() => setFailed(true)} className="h-10 w-auto max-w-[140px] object-contain" />;
  }
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-lg font-semibold text-[var(--color-primary-soft-text)]">
      {name.charAt(0)}
    </span>
  );
}
