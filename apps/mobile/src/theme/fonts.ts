import { useMemo } from "react";
import { Platform } from "react-native";
import { useFonts, Gloock_400Regular } from "@expo-google-fonts/gloock";
import { Tinos_400Regular, Tinos_700Bold } from "@expo-google-fonts/tinos";

/**
 * Uygulama fontları — Gloock (display) + Tinos (gövde serif'i, YALNIZ
 * Android; iOS yerleşik Times New Roman kullanır, web CSS yığını).
 * `false` dönerse arayüz fallback'le çizilir; arayüz ASLA fontu bekleyip
 * bloklanmaz. Native splash, font hazır olana kadar (en fazla kısa bir üst
 * sınırla) tutulur — bkz. app/_layout.tsx.
 */
export function useAppFonts(): boolean {
  const map = useMemo(
    () => (Platform.OS === "android" ? { Gloock_400Regular, Tinos_400Regular, Tinos_700Bold } : { Gloock_400Regular }),
    []
  );
  const [loaded] = useFonts(map);
  return loaded;
}
