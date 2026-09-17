import { useFonts, Gloock_400Regular } from "@expo-google-fonts/gloock";

/**
 * Uygulama fontları — Gloock (display) + sistem sans'ı (gövde, yükleme
 * gerektirmez). `false` dönerse arayüz fallback'le (Georgia/sistem) çizilir;
 * arayüz ASLA fontu bekleyip bloklanmaz. Native splash, font hazır olana
 * kadar (en fazla kısa bir üst sınırla) tutulur — bkz. app/_layout.tsx.
 */
export function useAppFonts(): boolean {
  const [loaded] = useFonts({ Gloock_400Regular });
  return loaded;
}
