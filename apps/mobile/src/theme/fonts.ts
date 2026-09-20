import { useMemo } from "react";
import { Platform } from "react-native";
import { useFonts, Gloock_400Regular } from "@expo-google-fonts/gloock";
import {
  NotoSerif_400Regular,
  NotoSerif_500Medium,
  NotoSerif_600SemiBold,
  NotoSerif_700Bold,
} from "@expo-google-fonts/noto-serif";

/**
 * Uygulama fontları — Gloock (display/marka) + Noto Serif gövde ailesi
 * (400/500/600/700; iOS ve Android'de AYNI dosyalar). `false` dönerse
 * arayüz fallback'le çizilir; arayüz ASLA fontu bekleyip bloklanmaz.
 * Native splash, font hazır olana kadar (en fazla kısa bir üst sınırla)
 * tutulur — bkz. app/_layout.tsx. Tinos KALDIRILDI.
 */
export function useAppFonts(): boolean {
  const map = useMemo(
    () =>
      Platform.OS === "web"
        ? { Gloock_400Regular }
        : { Gloock_400Regular, NotoSerif_400Regular, NotoSerif_500Medium, NotoSerif_600SemiBold, NotoSerif_700Bold },
    []
  );
  const [loaded] = useFonts(map);
  return loaded;
}
