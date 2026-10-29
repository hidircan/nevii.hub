import { AppText } from "./ui/app-text";
import { Pressable, StyleSheet, View } from "react-native";
import { LOCALES, LOCALE_LABEL, type Locale } from "../i18n/locales";
import { useLocale } from "../i18n/locale-context";
import { useTheme } from "../theme/theme-context";

/**
 * Dil seçici — Türkçe / English. Tüm portalların (admin, öğretmen, veli,
 * öğrenci) hesap ekranlarında ve karşılama ekranında aynı bileşen kullanılır.
 * Seçim cihazda saklanır (`neviihub_locale`), tüm portal metinleri anında
 * değişir; kiracı/rol verisine dokunmaz.
 */
export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const t = useTheme();
  const { locale, setLocale, t: tr } = useLocale();

  return (
    <View
      accessible
      accessibilityLabel={tr("common.language")}
      accessibilityRole="radiogroup"
      style={[styles.group, { borderColor: t.colors.border, backgroundColor: t.colors.bgMuted }]}
    >
      {LOCALES.map((code: Locale) => {
        const selected = locale === code;
        return (
          <Pressable
            key={code}
            onPress={() => setLocale(code)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={LOCALE_LABEL[code]}
            style={[
              styles.option,
              compact && styles.optionCompact,
              selected && { backgroundColor: t.colors.primary },
            ]}
          >
            <AppText
              style={[
                t.typography.body,
                styles.label,
                { color: selected ? t.colors.primaryOn : t.colors.text },
                selected && styles.labelSelected,
              ]}
            >
              {LOCALE_LABEL[code]}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  option: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  optionCompact: {
    minHeight: 44,
  },
  label: {
    textAlign: "center",
  },
  labelSelected: {
    fontWeight: "700",
  },
});
