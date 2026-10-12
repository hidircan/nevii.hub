import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { interpolate, lookup, type Locale } from "./locales";
import { getActiveLocale, loadStoredLocale, persistLocale, subscribeLocale } from "./locale-store";

export type TranslateVars = Record<string, string | number>;

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** Nokta-yollu anahtar → yerelleştirilmiş metin (`{ad}` enterpolasyonlu). */
  t: (path: string, vars?: TranslateVars) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => getActiveLocale());

  useEffect(() => {
    void loadStoredLocale().then((stored) => setLocaleState(stored));
    return subscribeLocale((next) => setLocaleState(next));
  }, []);

  const setLocale = useCallback((next: Locale) => {
    void persistLocale(next);
  }, []);

  const t = useCallback(
    (path: string, vars?: TranslateVars) => interpolate(lookup(locale, path), vars),
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
