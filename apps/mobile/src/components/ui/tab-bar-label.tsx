import type { ColorValue } from "react-native";
import { useTheme } from "../../theme/theme-context";
import { AppText } from "./app-text";

type Props = {
  children: string;
  /** Sekme çubuğu rengi `ColorValue` verir (tabBarIcon ile aynı desen). */
  color: ColorValue;
};

/**
 * Sekme etiketi — 12pt Inter, 15pt tek satır (İş 1, 2026-10-30):
 * daha önce 13pt/2 satırlık sarma vardı; satır sayısının sekmeden sekme
 * değişmesi simgeleri aynı eksenden kaydırıyordu. Artık tek satır + sabit
 * `lineHeight`: simgeler aynı dikey eksende, etiketler aynı taban
 * çizgisinde. Etiket metinleri i18n'de kısa biçimdedir ("Öğrenci", "Ödev");
 * ekran başlık/erişilebilirlik adı ayrı anahtarlarda korunur.
 * `AppText` varsayılan `maxFontSizeMultiplier` (1.3) erişilebilirliği
 * korur — yalnız bu menüde satır taşmasını engelleyecek üst sınır aynıdır.
 */
export function TabBarLabel({ children, color }: Props) {
  const t = useTheme();
  return (
    <AppText
      numberOfLines={1}
      ellipsizeMode="tail"
      style={{
        fontFamily: t.fonts.medium,
        fontSize: 12,
        lineHeight: 15,
        color,
        textAlign: "center",
      }}
    >
      {children}
    </AppText>
  );
}
