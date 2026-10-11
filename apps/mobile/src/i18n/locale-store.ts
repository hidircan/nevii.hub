import * as SecureStore from "expo-secure-store";
import type { Locale } from "./locales";
import { LOCALES } from "./locales";

/**
 * Reaktif olmayan aktif-dil deposu — React ağacı dışındaki saf yardımcılar
 * (`lib/date.ts`, rozet etiketleri) buradan okur. React tarafı
 * `locale-context.tsx` içindeki provider, dil değişiminde burayı eşitler;
 * böylece bileşen-olmayan kodda çağrı noktası değişikliği gerekmez.
 */
const STORAGE_KEY = "neviihub_locale";

let active: Locale = "tr";
const listeners = new Set<(locale: Locale) => void>();

export function isLocale(value: unknown): value is Locale {
  return value === "tr" || value === "en";
}

export function getActiveLocale(): Locale {
  return active;
}

export function setActiveLocale(locale: Locale): void {
  if (active === locale) return;
  active = locale;
  for (const fn of listeners) fn(locale);
}

export function subscribeLocale(fn: (locale: Locale) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function loadStoredLocale(): Promise<Locale> {
  try {
    const stored = await SecureStore.getItemAsync(STORAGE_KEY);
    if (isLocale(stored)) {
      setActiveLocale(stored);
      return stored;
    }
  } catch {
    // Güvenli depoya erişilemezse Türkçe varsayılanla devam edilir.
  }
  return active;
}

export async function persistLocale(locale: Locale): Promise<void> {
  setActiveLocale(locale);
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, locale);
  } catch {
    // Kalıcılık başarısız olsa da oturum içi dil yine de uygulanır.
  }
}

export function coerceLocale(value: unknown, fallback: Locale = "tr"): Locale {
  if (isLocale(value)) return value;
  if (typeof value === "string" && (LOCALES as readonly string[]).includes(value)) {
    return value as Locale;
  }
  return fallback;
}
