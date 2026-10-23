import { Text, type TextProps } from "react-native";
import { useTheme } from "../../theme/theme-context";

/**
 * Sistem yazı boyutu üst sınırı — kullanıcı cihaz ayarını çok büyütüp
 * düzeni bozmasın diye erişilebilirlik sınırı. Kapatılmaz (`allowFontScaling`
 * açık kalır); yalnız üst sınır konur. Uygulama-içi "Yazı boyutu" ayarı
 * bunun üzerine `t.typography` ölçeğini büyütür.
 */
export const MAX_FONT_SIZE_MULTIPLIER = 1.3;

/**
 * Uygulamadaki TEK metin bileşeni. Varsayılanları merkezîleştirir:
 * - Inter regular + tema metin rengi (üzerine `style` ile yazılabilir),
 * - `maxFontSizeMultiplier` ~1.3, `allowFontScaling` açık,
 * - `flexShrink: 1` — uzun Türkçe metin satırı taşırmaz, kırpma
 *   `numberOfLines` + `ellipsizeMode` ile yapılır,
 * - `ellipsizeMode="tail"` (numberOfLines verildiğinde etkili).
 *
 * Yeni ekranlarda `react-native`'den `Text` import edilmez; bu bileşen kullanılır.
 */
export function AppText({
  style,
  maxFontSizeMultiplier = MAX_FONT_SIZE_MULTIPLIER,
  allowFontScaling = true,
  ellipsizeMode = "tail",
  ...rest
}: TextProps) {
  const t = useTheme();
  return (
    <Text
      {...rest}
      allowFontScaling={allowFontScaling}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      ellipsizeMode={ellipsizeMode}
      style={[{ fontFamily: t.fonts.regular, color: t.colors.text, flexShrink: 1 }, style]}
    />
  );
}
