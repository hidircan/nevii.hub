import { useEffect, useState } from "react";
import { useRef } from "react";
import { personaOf, useAuth } from "../auth/auth-context";
import { useApiGet } from "../hooks/use-api";
import { useSelectedStudentId } from "../student/student-context";
import {
  getProductionBackend,
  readCacheEntry,
  removeCacheEntry,
  writeCacheEntry,
} from "./cache-store";
import { cacheClassForPath, type CacheClass, type CacheKeyInput } from "./cache-keys";
import { subscribeToScopes, type RefreshScope } from "./refresh-bus";

const SCOPE_FOR_CLASS: Record<CacheClass, RefreshScope> = {
  notifications: "notifications",
  schedule: "schedule",
  homework: "homework",
  payments: "payments",
  makeup: "makeup",
  attendance: "attendance",
  reference: "reference",
};

/**
 * Cache'li GET (Faz 7 — stale-while-revalidate, salt-okunur).
 *
 * - Cache'e UYGUN yollarda (`cache-keys` allowlist): kayıtlı veri anında
 *   gösterilir + arka-planda tazelenir; ağ hatasında kayıt "stale" olarak
 *   sunulur ("Son güncelleme" rozetiyle).
 * - 401/403'te (oturum/erişim kaybı) kayıt SİLİNİR — eski hassas veri
 *   gösterilmez; revoke/erişim-kaybı senaryosu budur.
 * - Allowlist DIŞI yollarda `useApiGet` ile birebir davranır (cache YOK).
 * - Yazma (POST/PUT/PATCH/DELETE) bu katmandan GEÇMEZ — offline mutation
 *   kuyruğu YOKTUR; yazma hataları ekranda görünür (sahte başarı YOK).
 */
export function useCachedApiGet<T>(
  path: string
): ReturnType<typeof useApiGet<T>> & { cachedAt: string | null; isStale: boolean } {
  const { user } = useAuth();
  const studentId = useSelectedStudentId();
  const network = useApiGet<T>(path);

  const persona = user ? personaOf(user) : null;
  const cacheClass = cacheClassForPath(path);
  const input: CacheKeyInput | null =
    user && persona && cacheClass
      ? { tenantId: user.tenantId, userId: user.userId, persona, studentId, path }
      : null;
  const scope: RefreshScope | null = cacheClass ? SCOPE_FOR_CLASS[cacheClass] : null;
  const inputKey = input ? `${input.tenantId}::${input.userId}::${input.persona}::${input.studentId ?? "-"}::${input.path}` : "";

  const [cached, setCached] = useState<{ data: T; savedAt: string; fresh: boolean } | null>(null);
  const [cachedFor, setCachedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!input || !inputKey) return undefined;
    let cancelled = false;
    readCacheEntry<T>(getProductionBackend(), input).then(({ entry, fresh }) => {
      if (cancelled) return;
      setCachedFor(inputKey);
      setCached(entry ? { data: entry.data, savedAt: entry.savedAt, fresh } : null);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputKey]);

  useEffect(() => {
    if (!input || network.status === "loading") return undefined;
    if (network.status === "success") {
      void writeCacheEntry(getProductionBackend(), input, network.data);
      return undefined;
    }
    if (network.status === "error" && (network.code === "UNAUTHORIZED" || network.code === "FORBIDDEN")) {
      void removeCacheEntry(getProductionBackend(), input);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network, inputKey]);

  // Faz 8: push-tetikli hedefli revalidation. Abonelik effect'te kurulur;
  // refresh YALNIZ dinleyici geri-çağrısından (olay) çağrılır — effect
  // gövdesinden senkron setState YOK (react-hooks/set-state-in-effect).
  const refreshRef = useRef(network.refresh);
  refreshRef.current = network.refresh;
  useEffect(() => {
    if (!scope) return undefined;
    return subscribeToScopes([scope], () => refreshRef.current());
  }, [scope]);

  // Erişim kaybında stale gösterilmez (kayıt silinir) — memo dışı, render'da türetim.
  const accessLost =
    network.status === "error" && (network.code === "UNAUTHORIZED" || network.code === "FORBIDDEN");
  const cacheHit = !accessLost && cachedFor === inputKey && cached ? cached : null;

  if (network.status === "success") {
    return { ...network, cachedAt: cacheHit?.savedAt ?? null, isStale: false, refresh: network.refresh };
  }
  if (cacheHit) {
    return {
      status: "success",
      data: cacheHit.data,
      cachedAt: cacheHit.savedAt,
      isStale: !cacheHit.fresh,
      refresh: network.refresh,
    };
  }
  return { ...network, cachedAt: null, isStale: false, refresh: network.refresh };
}
