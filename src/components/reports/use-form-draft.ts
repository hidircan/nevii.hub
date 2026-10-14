"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Rapor portalı (2026-10-14) — form taslağını bu cihazda (localStorage) tutar: telefon kilitlenir/sekme kapanırsa
 * yazılanlar kaybolmaz. Depolama yoksa/engelliyse sessizce bellekte çalışır. Gönderimden sonra `clear()`.
 */
export function useFormDraft<T extends object>(
  key: string,
  initial: T
): { value: T; update: (patch: Partial<T>) => void; clear: () => void; restored: boolean } {
  const [value, setValue] = useState<T>(initial);
  const [restored, setRestored] = useState(false);
  const ready = useRef(false);
  const initialRef = useRef(initial);

  useEffect(() => {
    ready.current = false;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        // Sunucu render'ı ile hidrasyon uyuşsun diye taslak mount sonrası yüklenir.
        setValue({ ...initialRef.current, ...(JSON.parse(raw) as Partial<T>) });
        setRestored(true);
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
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // kota/özel mod — taslak yalnız bellekte
    }
  }, [key, value]);

  const update = useCallback((patch: Partial<T>) => setValue((prev) => ({ ...prev, ...patch })), []);
  const clear = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // yok say
    }
    setValue(initialRef.current);
    setRestored(false);
  }, [key]);

  return { value, update, clear, restored };
}
