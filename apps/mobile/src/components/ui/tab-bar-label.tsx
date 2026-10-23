import type { ColorValue } from "react-native";
import { useTheme } from "../../theme/theme-context";
import { AppText } from "./app-text";

type Props = {
  children: string;
  /** Sekme çubuğu rengi `ColorValue` verir (tabBarIcon ile aynı desen). */
  color: ColorValue;
};

/**
 * Sekme etiketi — 13pt Inter, 64pt'lik çubukta dikey ortalı; dar ekranda
 * 2 satıra sarar (ellipsis YOK; örn. "Öğrencilerim" 320pt genişlikte
 * kırılır). 4 portalda AYNI bileşen kullanılır (tutarlılık); dokunma hedefi
 * korunur. Uzun etiket + büyük yazı boyutunda satır artarsa sekme yükselir.
 */
export function TabBarLabel({ children, color }: Props) {
  const t = useTheme();
  return (
    <AppText
      numberOfLines={2}
      ellipsizeMode="tail"
      style={{
        fontFamily: t.fonts.medium,
        fontSize: 13,
        lineHeight: 16,
        color,
        textAlign: "center",
      }}
    >
      {children}
    </AppText>
  );
}
