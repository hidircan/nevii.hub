import { useMemo } from "react";
import { useFonts } from "expo-font";
import { Gloock_400Regular } from "@expo-google-fonts/gloock";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";

/**
 * Uygulama fontları — Inter (gövde + başlık, 400/500/600/700) ve Gloock
 * (yalnız marka kelimesi, bkz. `components/ui/brand-mark.tsx`). Serif gövde
 * ailesi kaldırıldı; tek tipografi ailesi okunabilirlik ve tutarlılık
 * sağlar. `false` dönerse arayüz fallback'le çizilir — font beklenirken
 * arayüz ASLA kilitlenmez (bkz. app/_layout.tsx güvenlik supabı).
 */
export function useAppFonts(): boolean {
  const map = useMemo(
    () => ({
      Gloock_400Regular,
      Inter_400Regular,
      Inter_500Medium,
      Inter_600SemiBold,
      Inter_700Bold,
    }),
    []
  );
  const [loaded] = useFonts(map);
  return loaded;
}
