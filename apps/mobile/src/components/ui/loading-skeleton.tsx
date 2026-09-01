import { useEffect, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { useTheme } from "../../theme/theme-context";

function useShimmer() {
  // `Animated.Value` render boyunca kimliği SABİT kalması gereken, mutasyonu
  // React state'i üzerinden değil kendi (native sürücülü) iç mekanizmasıyla
  // yapılan bir nesne — bu yüzden `useRef` yerine `useState`'in lazy
  // initializer'ında tutuyoruz (setter'ı hiç çağrılmıyor, kimlik `useRef`
  // ile aynı şekilde stabil kalıyor). react-hooks/refs, render sırasında
  // `.current` okumayı yasaklıyor; `useState`'in lazy initializer'ı ise
  // (tek seferlik, render'a bağlı olmayan üretim) bu kısıtlamadan muaf.
  const [value] = useState(() => new Animated.Value(0.4));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(value, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [value]);
  return value;
}

function SkeletonBlock({ height, width, radius = 10 }: { height: number; width: number | `${number}%`; radius?: number }) {
  const t = useTheme();
  const opacity = useShimmer();
  return (
    <Animated.View
      style={[styles.block, { height, width, borderRadius: radius, backgroundColor: t.colors.bgMuted, opacity }]}
    />
  );
}

/** Kart listelerinde spinner yerine gösterilen nabız animasyonlu iskelet — birkaç sahte kart satırı. */
export function LoadingSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <View style={styles.container}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.card}>
          <SkeletonBlock height={40} width={40} radius={20} />
          <View style={styles.lines}>
            <SkeletonBlock height={14} width="70%" />
            <SkeletonBlock height={12} width="45%" />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12, paddingTop: 4 },
  card: { flexDirection: "row", alignItems: "center", gap: 12 },
  lines: { flex: 1, gap: 8 },
  block: {},
});
