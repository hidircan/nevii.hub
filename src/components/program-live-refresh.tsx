"use client";

/**
 * İş 4B — "canlı" program güncellemesi. Bu projede SSE/WebSocket altyapısı
 * yok (bkz. keşif notları); en uyumlu/güvenli yaklaşım: sekme görünürken
 * makul aralıklı `router.refresh()` (Server Component'i sunucudan yeniden
 * çeker, scroll/filtre state'ine dokunmaz — tam navigasyon DEĞİL). Sekme
 * arka plandayken hiç istek atılmaz. Görünmez — herhangi bir programlı
 * sayfaya eklenip mount edilir.
 *
 * Aralık sunucudan gelir (`liveRefreshIntervalMs`, src/lib/env/live-refresh.ts):
 * production 45 sn; test/önizleme 5 dk (DB egress). 0 → yalnız sekmeye dönünce.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function ProgramLiveRefresh({ intervalMs = 45_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const interval =
      intervalMs > 0
        ? setInterval(() => {
            if (document.visibilityState === "visible") router.refresh();
          }, intervalMs)
        : undefined;

    function onFocus() {
      if (document.visibilityState === "visible") router.refresh();
    }
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [router, intervalMs]);

  return null;
}
