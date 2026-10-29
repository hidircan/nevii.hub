"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Scroll ile belirme — kurumsal site bölümleri için hafif reveal.
 *
 * Karar (animate skill): pazarlama sayfası nadir ziyaret edilir → açıklama
 * keyfiyle animasyon uygun. CSS transition + IntersectionObserver; yeni
 * kütüphane yok. Yalnız `transform` + `opacity` (GPU). JS kapalıysa veya
 * IntersectionObserver yoksa içerik görünür kalır — gizli içerik riski yok.
 */
export function Reveal({
  children,
  delayMs = 0,
  className = "",
}: {
  children: ReactNode;
  /** Kademeli giriş için gecikme (ms); 30–80ms adımlar önerilir. */
  delayMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    el.classList.add("reveal-init");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal-visible");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      style={delayMs > 0 ? { ["--reveal-delay" as string]: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}
