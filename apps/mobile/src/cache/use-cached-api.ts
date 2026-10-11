import { useCallback, useEffect, useRef, useState } from "react";
import { personaOf, useAuth } from "../auth/auth-context";
import { useApiGet } from "../hooks/use-api";
import { useSelectedStudentId } from "../student/student-context";
import {
  getProductionBackend,
  readCacheEntry,
  removeCacheEntry,
  writeCacheEntry,
} from "./cache-store";
import {
  CACHE_VERSION,
  cacheClassForPath,
  isEntryFresh,
  type CacheClass,
  type CacheKeyInput,
} from "./cache-keys";
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

type CachedView<T> = { data: T; savedAt: string; fresh: boolean } | null | undefined;

/**
 * Cache'li GET — stale-while-revalidate, salt-okunur.
 *
 * - Cache'e UYGUN yollarda (`cache-keys` allowlist): kayıtlı veri anında
 *   gösterilir; kayıt FRESH ise mount'ta ağa ÇIKILMAZ (TTL-atlama).
 *   Stale/kayıt-yok ise arka-planda tazelenir; ağ hatasında kayıt "stale"
 *   olarak sunulur ("Son güncelleme" rozetiyle).
 * - `refresh()` ZORLA ağa çıkar (pull-to-refresh, tekrar-dene, push).
 * - `autoRefresh()` TTL-bilinçlidir: kayıt fresh ise istek ATMAZ —
 *   focus/foreground kancaları bunu kullanır.
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

  const persona = user ? personaOf(user) : null;
  const cacheClass = cacheClassForPath(path);
  const input: CacheKeyInput | null =
    user && persona && cacheClass
      ? { tenantId: user.tenantId, userId: user.userId, persona, studentId, path }
      : null;
  const scope: RefreshScope | null = cacheClass ? SCOPE_FOR_CLASS[cacheClass] : null;
  const inputKey = input ? `${input.tenantId}::${input.userId}::${input.persona}::${input.studentId ?? "-"}::${input.path}` : "";

  const [cached, setCached] = useState<CachedView<T>>(undefined);
  const [cachedFor, setCachedFor] = useState<string | null>(null);
  // Zorla-ağ bayrağı inputKey'e bağlıdır: çocuk/kullanıcı değişiminde eski
  // zorlama yeni kapsama TAŞINMAZ (yeni kapsamın fresh kaydı atlanır).
  const [force, setForce] = useState<{ forKey: string; n: number }>({ forKey: "", n: 0 });

  // Okuma tamamlanana kadar (cachedFor !== inputKey) ağ BEKLER — karar,
  // render'da türetilir; effect gövdesinde senkron setState YOK.
  const readSettled = cachedFor === inputKey;
  const cacheHit = readSettled && cached ? cached : null;
  const forced = force.forKey === inputKey && force.n > 0;
  const enabled = !input || !path ? Boolean(path) : forced || (readSettled && (!cacheHit || !cacheHit.fresh));

  const network = useApiGet<T>(path, { enabled });

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

  const forceRefresh = useCallback(() => {
    if (inputKey) setForce((f) => ({ forKey: inputKey, n: (f.forKey === inputKey ? f.n : 0) + 1 }));
    network.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputKey]);

  const refreshIfStale = useCallback(() => {
    // Bellekteki kaydın tazeliğini çağrı anında yeniden değerlendir (TTL
    // okuma ile çağrı arasında dolmuş olabilir).
    if (input && cacheClass && cachedFor === inputKey && cached) {
      const stillFresh = isEntryFresh(
        { v: CACHE_VERSION, path: input.path, savedAt: cached.savedAt, data: cached.data },
        cacheClass,
        Date.now()
      );
      if (stillFresh) return;
    }
    if (inputKey) setForce((f) => ({ forKey: inputKey, n: (f.forKey === inputKey ? f.n : 0) + 1 }));
    network.autoRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputKey, cachedFor, cached, input, cacheClass]);

  // Push-tetikli hedefli revalidation: sunucu "değişti" dedi → ZORLA yenile.
  // Abonelik effect'te kurulur; refresh YALNIZ dinleyici geri-çağrısından
  // (olay) çağrılır — effect gövdesinden senkron setState YOK.
  const forceRefreshRef = useRef(forceRefresh);
  useEffect(() => {
    forceRefreshRef.current = forceRefresh;
  });
  useEffect(() => {
    if (!scope) return undefined;
    return subscribeToScopes([scope], () => forceRefreshRef.current());
  }, [scope]);

  // Erişim kaybında stale gösterilmez (kayıt silinir) — memo dışı, render'da türetim.
  const accessLost =
    network.status === "error" && (network.code === "UNAUTHORIZED" || network.code === "FORBIDDEN");
  const visibleCache = !accessLost ? cacheHit : null;

  if (network.status === "success") {
    return { ...network, cachedAt: visibleCache?.savedAt ?? null, isStale: false, refresh: forceRefresh, autoRefresh: refreshIfStale };
  }
  if (visibleCache) {
    return {
      status: "success",
      data: visibleCache.data,
      cachedAt: visibleCache.savedAt,
      isStale: !visibleCache.fresh,
      refresh: forceRefresh,
      autoRefresh: refreshIfStale,
    };
  }
  return { ...network, cachedAt: null, isStale: false, refresh: forceRefresh, autoRefresh: refreshIfStale };
}
