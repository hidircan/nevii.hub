import { Image, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/theme-context";

type Props = {
  size?: "md" | "lg";
  /** `false` ise yalnız logo gösterilir (splash gibi dar alanlar için). */
  wordmark?: boolean;
  /** Marka kelimesinin puntoyu — küçük iPhone'lara sığar, taşmaz. */
  wordmarkSize?: number;
};

/**
 * NeviiHub marka bloğu — gerçek logo asset'i + Gloock kelime. Logo, başlık ve
 * yardımcı metin hizası optik olarak ortalanır; her ekranda aynı düzen kullanılır.
 */
export function BrandMark({ size = "md", wordmark = true, wordmarkSize }: Props) {
  const t = useTheme();
  const logoSize = size === "lg" ? 88 : 64;
  return (
    <View style={styles.center}>
      <Image
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source={require("../../../assets/icon.png")}
        style={{ width: logoSize, height: logoSize, borderRadius: logoSize * 0.24 }}
        alt="NeviiHub logosu"
        accessibilityLabel="NeviiHub logosu"
        resizeMode="contain"
      />
      {wordmark ? (
        <Text
          numberOfLines={1}
          style={[t.typography.display, { color: t.colors.text, marginTop: 14, fontSize: wordmarkSize ?? (size === "lg" ? 36 : 30) }]}
        >
          NeviiHub
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
});
