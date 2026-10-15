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
 * her ortamda 5 dk (Vercel Active CPU + DB egress). 0 → yalnız sekmeye dönünce.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LIVE_REFRESH_MS } from "@/lib/env/live-refresh";
import { isUserIdle } from "@/lib/user-activity";

export function ProgramLiveRefresh({ intervalMs = LIVE_REFRESH_MS }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    // 2026-10-16 — gizli sekmede ve 5 dk gerçek etkileşim yokken yenilenmez; kullanıcı dönünce (sekmeye dönüş veya
    // ilk etkileşim) TEK yenileme — 60 sn içinde ikincisi yapılmaz (istek fırtınası yok).
    let last = Date.now();
    function refresh() {
      if (document.visibilityState !== "visible" || Date.now() - last < 60_000) return;
      last = Date.now();
      router.refresh();
    }
    const interval =
      intervalMs > 0
        ? setInterval(() => {
            if (!isUserIdle()) refresh();
          }, intervalMs)
        : undefined;

    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("nh:active-again", refresh);

    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("nh:active-again", refresh);
    };
  }, [router, intervalMs]);

  return null;
}
