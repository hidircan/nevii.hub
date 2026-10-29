import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, type ApiResult } from "../api/client";
import {
  shouldSkipAutoRefresh,
  shouldSkipManualRefresh,
} from "../api/request-policy";

type UseApiState<T> =
  | { status: "loading" }
  | { status: "error"; message: string; code: string }
  | { status: "success"; data: T };

export type UseApiGetOptions = {
  /**
   * `false` iken ağ isteği ATILMAZ (cache'li katman fresh veride bunu kullanır).
   * `true`'ya dönünce (veya path değişince) istek ateşlenir. Varsayılan `true`.
   */
  enabled?: boolean;
  /**
   * `true` ise her istek kendi AbortController'ıyla açılır; path değişiminde /
   * unmount'ta ağ isteği GERÇEKTEN iptal edilir (stale arama sonucunun yeni
   * sonucu ezmesi + terk edilmiş istek bant genişliği engellenir). Bu modda
   * istek in-flight dedupe'a katılmaz — yalnız arama gibi terk-edilebilir
   * isteklerde kullanın. Varsayılan `false`.
   */
  abortable?: boolean;
};

/**
 * Basit GET veri çekme kancası — loading/error/success durumlarını
 * standartlaştırır.
 *
 * "loading" durumu, effect gövdesinde senkron bir `setState` ile
 * ayarlanmıyor (react-hooks/set-state-in-effect bunu yasaklıyor); bunun
 * yerine `resolvedFor`in güncel istek anahtarıyla eşleşip eşleşmediğinden
 * render sırasında TÜRETİLİYOR. Effect yalnız asenkron işi yapıyor (fetch +
 * `.then()` içinde setState — bu serbest), `resolvedFor`'u yalnız istek
 * gerçekten sonuçlandığında güncelliyor. `path` veya `refresh()` (tick)
 * değiştiğinde `requestKey` değişir, `resolvedFor` artık eşleşmez ve
 * `effectiveState` otomatik olarak "loading"a döner — eski senkron
 * `setState({status:"loading"})` ile aynı görünür sonuç, yalnız effect
 * gövdesinde değil render'da hesaplanıyor.
 *
 * Yenileme kanalları (maliyet hardening):
 * - `refresh()` — ZORLA yenileme: pull-to-refresh, tekrar-dene, push. Kısa
 *   spam kilidi dışında her zaman ağa çıkar.
 * - `autoRefresh()` — otomatik tetikleyiciler (focus/foreground) için: son
 *   tamamlanan isteğin üzerinden dedupe penceresi geçmediyse atlanır
 *   (mount+focus+foreground üçlüsü tek istek olur).
 */
export function useApiGet<T>(
  path: string,
  opts: UseApiGetOptions = {}
): UseApiState<T> & { refresh: () => void; autoRefresh: () => void } {
  const enabled = opts.enabled ?? true;
  const abortable = opts.abortable ?? false;
  const [state, setState] = useState<UseApiState<T>>({ status: "loading" });
  const [resolvedFor, setResolvedFor] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const requestKey = `${path}::${tick}`;
  const lastCompletedAt = useRef<number | null>(null);
  const lastManualRefreshAt = useRef<number | null>(null);

  useEffect(() => {
    if (!path || !enabled) return undefined;
    let cancelled = false;
    const ctrl = abortable ? new AbortController() : null;
    apiGet<T>(path, abortable && ctrl ? { signal: ctrl.signal } : undefined).then(
      (res: ApiResult<T>) => {
        if (cancelled) return;
        lastCompletedAt.current = Date.now();
        setResolvedFor(requestKey);
        if (res.ok) setState({ status: "success", data: res.data });
        else setState({ status: "error", message: res.error.message, code: res.error.code });
      }
    );
    return () => {
      cancelled = true;
      ctrl?.abort();
    };
  }, [path, requestKey, enabled, abortable]);

  const effectiveState: UseApiState<T> = resolvedFor === requestKey ? state : { status: "loading" };

  const refresh = useCallback(() => {
    const now = Date.now();
    if (shouldSkipManualRefresh(lastManualRefreshAt.current, now)) return;
    lastManualRefreshAt.current = now;
    setTick((n) => n + 1);
  }, []);

  const autoRefresh = useCallback(() => {
    if (shouldSkipAutoRefresh(lastCompletedAt.current)) return;
    setTick((n) => n + 1);
  }, []);

  return { ...effectiveState, refresh, autoRefresh };
}
