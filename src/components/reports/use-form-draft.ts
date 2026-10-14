"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Taslak en çok bu kadar yaşar; sonra yok sayılır ve silinir. */
const DRAFT_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Rapor portalı (2026-10-14) — form taslağını bu SEKMEDE (`sessionStorage`) tutar: telefon kilitlenir / sayfa yeniden
 * yüklenirse yazılanlar kaybolmaz. Güvenlik (commit incelemesi): öğrenci notları kişisel veridir → kalıcı `localStorage`
 * yerine sekmeyle biten depolama, 12 saat süre, anahtar öğretmene özel (ortak cihazda başkasına geri yüklenmez) ve
 * `exclude` alanları (ör. veliye özel not) hiç yazılmaz. Depolama kapalıysa bellekte çalışır. Gönderimden sonra `clear()`.
 */
export function useFormDraft<T extends object>(
  key: string,
  initial: T,
  options: { exclude?: (keyof T)[] } = {}
): { value: T; update: (patch: Partial<T>) => void; clear: () => void; restored: boolean } {
  const [value, setValue] = useState<T>(initial);
  const [restored, setRestored] = useState(false);
  const ready = useRef(false);
  const initialRef = useRef(initial);
  const excludeRef = useRef(options.exclude ?? []);

  useEffect(() => {
    ready.current = false;
    try {
      const raw = window.sessionStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as { savedAt?: number; data?: Partial<T> };
        if (parsed.savedAt && Date.now() - parsed.savedAt < DRAFT_TTL_MS && parsed.data) {
          // Sunucu render'ı ile hidrasyon uyuşsun diye taslak mount sonrası yüklenir.
          setValue({ ...initialRef.current, ...parsed.data });
          setRestored(true);
        } else {
          window.sessionStorage.removeItem(key);
        }
      }
    } catch {
      // bozuk taslak / depolama kapalı → boş form
    }
    ready.current = true;
  }, [key]);

  useEffect(() => {
    // Boş (başlangıç) form kaydedilmez — temizlenen taslak geri gelmez.
    if (!ready.current || value === initialRef.current) return;
    try {
      const data: Partial<T> = { ...value };
      for (const k of excludeRef.current) delete data[k];
      window.sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data }));
    } catch {
      // kota/özel mod — taslak yalnız bellekte
    }
  }, [key, value]);

  const update = useCallback((patch: Partial<T>) => setValue((prev) => ({ ...prev, ...patch })), []);
  const clear = useCallback(() => {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // yok say
    }
    setValue(initialRef.current);
    setRestored(false);
  }, [key]);

  return { value, update, clear, restored };
}
