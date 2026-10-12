import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/theme-context";

type Props = {
  label: string;
  value: number | null;
  onChange: (value: number) => void;
  max?: number;
};

/** 1..max arası tek seçimli puan seçici (değerlendirme formlarında ortak). */
export function ScoreSelector({ label, value, onChange, max = 5 }: Props) {
  const t = useTheme();
  return (
    <View style={styles.container}>
      <Text style={[t.typography.body, { color: t.colors.text }]}>{label}</Text>
      <View style={styles.row}>
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => {
          const selected = value === n;
          return (
            <Pressable
              key={n}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(n)}
              style={[
                styles.circle,
                { backgroundColor: selected ? t.colors.primary : t.colors.bgMuted, borderColor: selected ? t.colors.primary : t.colors.border },
              ]}
            >
              <Text style={[t.typography.bodyStrong, { color: selected ? t.colors.primaryOn : t.colors.textMuted }]}>{n}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  row: { flexDirection: "row", gap: 8 },
  circle: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1 },
});
