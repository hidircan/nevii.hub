"use client";

/**
 * İş 4B — "canlı" program güncellemesi. Bu projede SSE/WebSocket altyapısı
 * yok (bkz. keşif notları); en uyumlu/güvenli yaklaşım: sekme görünürken
 * makul aralıklı `router.refresh()` (Server Component'i sunucudan yeniden
 * çeker, scroll/filtre state'ine dokunmaz — tam navigasyon DEĞİL). Sekme
 * arka plandayken hiç istek atılmaz. Görünmez — herhangi bir programlı
 * sayfaya eklenip mount edilir.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL_MS = 45_000;

export function ProgramLiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_INTERVAL_MS);

    function onFocus() {
      if (document.visibilityState === "visible") router.refresh();
    }
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [router]);

  return null;
}
