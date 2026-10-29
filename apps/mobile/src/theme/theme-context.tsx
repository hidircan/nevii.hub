import * as SecureStore from "expo-secure-store";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import {
  FONT_SCALE,
  buildTheme,
  type FontScalePreference,
  type Theme,
} from "./tokens";

export type ThemePreference = "system" | "light" | "dark";

const PREFERENCE_KEY = "neviihub_theme_preference";
/** Eski marka anahtarı — mevcut kullanıcı seçimi kaybolmasın diye okunur, yazılmaz. */
const LEGACY_PREFERENCE_KEY = "notaplan_theme_preference";
const FONT_SIZE_KEY = "neviihub_font_size_preference";

type ThemeContextValue = {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
  fontSize: FontScalePreference;
  setFontSize: (size: FontScalePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function isFontSizePreference(value: string | null): value is FontScalePreference {
  return value === "normal" || value === "large" || value === "xlarge";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  // Varsayılan AÇIK tema: sistem koyu modda olsa bile ilk görünüm açıktır.
  // Kullanıcı seçimi SecureStore'da saklanır ve geri yüklenir (açık kayıt).
  const [preference, setPreferenceState] = useState<ThemePreference>("light");
  const [fontSize, setFontSizeState] = useState<FontScalePreference>("normal");

  useEffect(() => {
    let mounted = true;
    void Promise.all([
      SecureStore.getItemAsync(PREFERENCE_KEY),
      SecureStore.getItemAsync(FONT_SIZE_KEY),
      SecureStore.getItemAsync(LEGACY_PREFERENCE_KEY),
    ]).then(([storedTheme, storedFontSize, legacyTheme]) => {
      if (!mounted) return;
      const themeValue = isThemePreference(storedTheme)
        ? storedTheme
        : isThemePreference(legacyTheme)
          ? legacyTheme
          : null;
      if (themeValue) {
        setPreferenceState(themeValue);
        // Eski anahtardan okunduysa yeni anahtara taşı (tek seferlik).
        if (!isThemePreference(storedTheme)) void SecureStore.setItemAsync(PREFERENCE_KEY, themeValue);
      }
      if (isFontSizePreference(storedFontSize)) setFontSizeState(storedFontSize);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const setPreference = (pref: ThemePreference) => {
    setPreferenceState(pref);
    void SecureStore.setItemAsync(PREFERENCE_KEY, pref);
  };

  const setFontSize = (size: FontScalePreference) => {
    setFontSizeState(size);
    void SecureStore.setItemAsync(FONT_SIZE_KEY, size);
  };

  const effectiveMode = preference === "system" ? (systemScheme === "dark" ? "dark" : "light") : preference;
  const scale = FONT_SCALE[fontSize];
  const theme = useMemo(
    () => buildTheme(effectiveMode, scale),
    [effectiveMode, scale]
  );

  const value = useMemo(
    () => ({ theme, preference, setPreference, fontSize, setFontSize }),
    [theme, preference, fontSize]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx.theme;
}

export function useThemePreference(): {
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
  fontSize: FontScalePreference;
  setFontSize: (size: FontScalePreference) => void;
} {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemePreference must be used within ThemeProvider");
  return {
    preference: ctx.preference,
    setPreference: ctx.setPreference,
    fontSize: ctx.fontSize,
    setFontSize: ctx.setFontSize,
  };
}
