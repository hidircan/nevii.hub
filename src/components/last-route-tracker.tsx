"use client";

/**
 * P1 (2026-09-11) — son güvenli rota izleyici: panel içi gezinmede
 * güvenli rotaları hesap kaydına yazar (debounce'lu, best-effort).
 * Güvensiz hedefler server'da (`isSafeLastRoute`) atılır.
 */
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { actionSaveLastRoute } from "@/lib/actions";

export function LastRouteTracker() {
  const pathname = usePathname();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!pathname || pathname === "/login") return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void actionSaveLastRoute(pathname);
    }, 800);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [pathname]);

  return null;
}
