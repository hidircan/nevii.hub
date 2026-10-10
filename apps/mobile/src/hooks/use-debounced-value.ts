import { useEffect, useState } from "react";
import { SEARCH_DEBOUNCE_MS, gateSearchQuery } from "../api/request-policy";

/**
 * Değer gecikmeli kopyası — sunucu aramalarında tuş başına istek engellenir.
 * Girdi değiştikçe zamanlayıcı sıfırlanır; `delayMs` sessizlikten sonra değer
 * yayınlanır. Unmount'ta zamanlayıcı temizlenir (geç/sonuç-yok).
 */
export function useDebouncedValue<T>(value: T, delayMs: number = SEARCH_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}

/**
 * Sunucu araması için commit'lenmiş sorgu: debounce + minimum-karakter eşiği.
 * 1-karakter ara durumda ÖNCEKİ sorgu korunur (aynı path → yeniden istek yok,
 * liste flaş yapmaz); trim'lenmiş ≥2 karakter veya boş sorgu yayınlanır.
 * Render-sırasında türetme (React "derived state" deseni — koşullu setState
 * commit öncesi anında yeniden-render üretir, flicker yok); effect/ref yok.
 */
export function useDebouncedSearchQuery(raw: string, delayMs: number = SEARCH_DEBOUNCE_MS): string {
  const debounced = useDebouncedValue(raw, delayMs);
  const [committed, setCommitted] = useState<string>("");
  const gated = gateSearchQuery(debounced);
  if (gated.fetch && gated.q !== committed) {
    setCommitted(gated.q);
  }
  return committed;
}
