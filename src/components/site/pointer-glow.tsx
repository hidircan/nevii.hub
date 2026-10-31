"use client";

import { useEffect, useRef } from "react";

/**
 * Fareyi izleyen hafif ışık. Yalnız transform (GPU), karede en çok bir güncelleme; sunucu isteği yok.
 * Dokunmatik cihazda ve "hareketi azalt" tercihinde hiç çalışmaz.
 */
export function PointerGlow() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)").matches) return;
    let frame = 0;
    let x = 0;
    let y = 0;
    const paint = () => {
      frame = 0;
      el.style.transform = `translate3d(${x - 320}px, ${y - 320}px, 0)`;
      el.style.opacity = "1";
    };
    const move = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return <div ref={ref} aria-hidden className="nh-glow" />;
}
