import * as SecureStore from "expo-secure-store";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { darkTheme, lightTheme, type Theme } from "./tokens";

export type ThemePreference = "system" | "light" | "dark";

const PREFERENCE_KEY = "notaplan_theme_preference";

type ThemeContextValue = {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    SecureStore.getItemAsync(PREFERENCE_KEY).then((stored) => {
      if (stored === "light" || stored === "dark" || stored === "system") setPreferenceState(stored);
    });
  }, []);

  const setPreference = (pref: ThemePreference) => {
    setPreferenceState(pref);
    void SecureStore.setItemAsync(PREFERENCE_KEY, pref);
  };

  const effectiveMode = preference === "system" ? (systemScheme === "dark" ? "dark" : "light") : preference;
  const theme = effectiveMode === "dark" ? darkTheme : lightTheme;

  const value = useMemo(() => ({ theme, preference, setPreference }), [theme, preference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx.theme;
}

export function useThemePreference(): { preference: ThemePreference; setPreference: (pref: ThemePreference) => void } {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemePreference must be used within ThemeProvider");
  return { preference: ctx.preference, setPreference: ctx.setPreference };
}
