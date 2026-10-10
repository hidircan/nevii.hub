"use client";

import { useCallback, useEffect } from "react";
import { useCurrentPath } from "./use-current-path";

type Saved = { url: string; search: string; page: number; scrollY: number };

/**
 * 9. tur — liste → alt ekran → geri akışında URL'de TUTULMAYAN liste durumunu
 * (arama metni, sayfa, kaydırma) geri yükler. Filtreler zaten URL'dedir ve
 * `returnTo` ile taşınır. Alt ekrana giden linkin `onClick`'inde `remember()`
 * çağrılır; aynı URL'ye (aynı filtrelerle) dönülünce durum bir kez geri
 * yüklenir ve silinir. sessionStorage: yalnız bu sekme, sunucuya gitmez.
 */
export function useListReturnState(
  key: string,
  state: { search: string; page: number },
  restore: (saved: { search: string; page: number }) => void
): () => void {
  const url = useCurrentPath();
  const storageKey = `nevii:list-return:${key}`;

  useEffect(() => {
    let saved: Saved | null = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as Saved | null;
      sessionStorage.removeItem(storageKey);
    } catch {
      return;
    }
    if (!saved || saved.url !== url) return;
    restore({ search: saved.search, page: saved.page });
    const y = saved.scrollY;
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top: y })));
    // Yalnız ilk yüklemede — sonraki URL değişimleri (filtre) geri yükleme tetiklemez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return useCallback(() => {
    try {
      const saved: Saved = { url, search: state.search, page: state.page, scrollY: window.scrollY };
      sessionStorage.setItem(storageKey, JSON.stringify(saved));
    } catch {
      // Depolama kapalıysa (gizli pencere) yalnız filtreler (URL) korunur.
    }
  }, [storageKey, url, state.search, state.page]);
}
