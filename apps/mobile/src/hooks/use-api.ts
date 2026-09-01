import { useEffect, useState } from "react";
import { apiGet, type ApiResult } from "../api/client";

type UseApiState<T> =
  | { status: "loading" }
  | { status: "error"; message: string; code: string }
  | { status: "success"; data: T };

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
 */
export function useApiGet<T>(path: string): UseApiState<T> & { refresh: () => void } {
  const [state, setState] = useState<UseApiState<T>>({ status: "loading" });
  const [resolvedFor, setResolvedFor] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const requestKey = `${path}::${tick}`;

  useEffect(() => {
    if (!path) return undefined;
    let cancelled = false;
    apiGet<T>(path).then((res: ApiResult<T>) => {
      if (cancelled) return;
      setResolvedFor(requestKey);
      if (res.ok) setState({ status: "success", data: res.data });
      else setState({ status: "error", message: res.error.message, code: res.error.code });
    });
    return () => {
      cancelled = true;
    };
  }, [path, requestKey]);

  const effectiveState: UseApiState<T> = resolvedFor === requestKey ? state : { status: "loading" };

  return { ...effectiveState, refresh: () => setTick((n) => n + 1) };
}
