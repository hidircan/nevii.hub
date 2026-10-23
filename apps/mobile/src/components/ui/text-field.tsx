import { AppText } from "./app-text";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { useTheme } from "../../theme/theme-context";
import { fonts } from "../../theme/tokens";

type Props = TextInputProps & {
  label: string;
  error?: string;
};

export function TextField({ label, error, style, ...inputProps }: Props) {
  const t = useTheme();
  return (
    <View style={styles.container}>
      <AppText style={[t.typography.label, { color: t.colors.textMuted }]}>{label}</AppText>
      <TextInput
        placeholderTextColor={t.colors.textMuted}
        style={[
          styles.input,
          { borderColor: error ? t.colors.danger : t.colors.border, color: t.colors.text, backgroundColor: t.colors.bgMuted },
          style,
        ]}
        {...inputProps}
      />
      {error ? <AppText style={[t.typography.caption, { color: t.colors.danger }]}>{error}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.regular, fontSize: 17 },
});
