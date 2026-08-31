import { useCallback, useEffect, useState } from "react";
import { apiGet, type ApiResult } from "../api/client";

type UseApiState<T> =
  | { status: "loading" }
  | { status: "error"; message: string; code: string }
  | { status: "success"; data: T };

/** Basit GET veri çekme kancası — loading/error/success durumlarını standartlaştırır. */
export function useApiGet<T>(path: string): UseApiState<T> & { refresh: () => void } {
  const [state, setState] = useState<UseApiState<T>>({ status: "loading" });
  const [tick, setTick] = useState(0);

  const load = useCallback(() => {
    if (!path) return undefined;
    let cancelled = false;
    setState({ status: "loading" });
    apiGet<T>(path).then((res: ApiResult<T>) => {
      if (cancelled) return;
      if (res.ok) setState({ status: "success", data: res.data });
      else setState({ status: "error", message: res.error.message, code: res.error.code });
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  useEffect(() => load(), [load, tick]);

  return { ...state, refresh: () => setTick((n) => n + 1) };
}
