import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { useTheme } from "../../theme/theme-context";
import { Icon } from "./icon";

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
};

export function SearchInput({ value, onChangeText, placeholder = "Ara" }: Props) {
  const t = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: t.colors.bgMuted, borderColor: t.colors.border }]}>
      <Icon name="search" size={18} color={t.colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.colors.textMuted}
        style={[styles.input, { color: t.colors.text }]}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
      />
      {value.length > 0 ? (
        <Pressable accessibilityLabel="Aramayı temizle" onPress={() => onChangeText("")} hitSlop={8}>
          <Icon name="close-circle" size={18} color={t.colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  input: { flex: 1, fontSize: 15, height: "100%" },
});
