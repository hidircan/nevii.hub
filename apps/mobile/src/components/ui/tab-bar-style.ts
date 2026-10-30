/**
 * Alt sekme çubuğu SAF stil çekirdeği (İş 1, 2026-10-30) — React Native
 * importu YOK (node testleri bu modülü doğrudan okur; RN'e bağımlı hook
 * `tab-bar.tsx`'tadır).
 *
 * KÖK NEDEN — dört portaldaki tab layout'ları `tabBarStyle` içinde sabit
 * `paddingBottom: 6` gönderiyordu. expo-router SDK 57'de React Navigation'ı
 * kendi içinde taşır (`expo-router/tabs`): BottomTabBar iç stilinde
 * `paddingBottom: insets.bottom` uygulayıp SONRA `tabBarStyle`'ı merge
 * eder — yani sabit padding, sistem navigasyon (Android üç düğmeli çubuk,
 * iOS home bar) yüksekliğini EZİYORDU. Edge-to-edge (SDK 57'de Android'de
 * zorunlu) ile çubuk içerik bölümü tam sistem alanına denk gelip düğmelerle
 * kesişiyordu; yükseklik `minHeight: 64`'ü geçip cihazdan cihaza değiştiği
 * için satır hizası da kayıyordu.
 *
 * ÇÖZÜM — kütüphane altyapısıyla uyumlu tek nokta:
 * - `height = TAB_BAR_CONTENT_HEIGHT + bottomInset` → çubuk arka planı
 *   sistem alanına uzar,
 * - `paddingBottom = bottomInset` → simge/etiket şeridi sistem alanının
 *   ÜSTÜNDE kalır (3 düğmeli, hareketli gezinme ve iOS home bar'da aynı).
 * Inset TEK yerde hesaplanır (`tab-bar.tsx` hook'u); portal layout'ları
 * bu stili kullanır. Sabit `bottom: 20/30` gibi cihaz bağımlı yama YOK.
 */
export const TAB_ICON_SIZE = 22;

/** Sistem alanından BAĞIMSIZ etkileşim şeridi — eski 64pt tasarım korunur. */
export const TAB_BAR_CONTENT_HEIGHT = 64;

export type TabBarColors = {
  bg: string;
  border: string;
};

/** Saf stil üretici — `bottomInset` dışarıdan verilir, birim testler bunu doğrular. */
export function portalTabBarStyle(
  colors: TabBarColors,
  bottomInset: number,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  const inset = Math.max(Number(bottomInset) || 0, 0);
  return {
    backgroundColor: colors.bg,
    borderTopColor: colors.border,
    height: TAB_BAR_CONTENT_HEIGHT + inset,
    paddingBottom: inset,
    ...extra,
  };
}
