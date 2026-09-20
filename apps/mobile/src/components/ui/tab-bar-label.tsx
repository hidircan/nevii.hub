import { Text, type ColorValue } from "react-native";
import { fonts } from "../../theme/tokens";

type Props = {
  children: string;
  /** Sekme çubuğu rengi `ColorValue` verir (tabBarIcon ile aynı desen). */
  color: ColorValue;
};

/**
 * Sekme etiketi — 15pt Noto Serif, dar ekranda 2 satıra sarar (ellipsis
 * YOK; örn. "Öğrencilerim" 320pt genişlikte kırılır). 4 portalda AYNI
 * bileşen kullanılır (tutarlılık); boyut küçültülmez, dokunma hedefi
 * korunur (satır artarsa sekme yükselir).
 */
export function TabBarLabel({ children, color }: Props) {
  return (
    <Text numberOfLines={2} style={{ fontFamily: fonts.serif, fontSize: 15, lineHeight: 18, color, textAlign: "center" }}>
      {children}
    </Text>
  );
}
