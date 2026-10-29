import { AppText } from "./app-text";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../../theme/theme-context";
import { Button } from "./button";
import { Icon, type IconName } from "./icon";

type Props = {
  icon?: IconName;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  /**
   * Bölüm-içi boş durum (ana sayfa kart alanları, sayaç altları): dikey ritmi
   * kırmayan sıkı varyant. Tam-ekran boş durumlarda (kayıt yok / bulunamadı)
   * varsayılan (geniş) kullanılır.
   */
  compact?: boolean;
};

export function EmptyState({ icon = "file-tray-outline", title, description, actionLabel, onAction, compact }: Props) {
  const t = useTheme();
  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <Icon name={icon} size={20} color={t.colors.textMuted} />
        <View style={{ flex: 1 }}>
          <AppText style={[t.typography.bodyStrong, { color: t.colors.text }]}>{title}</AppText>
          {description ? (
            <AppText style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>{description}</AppText>
          ) : null}
        </View>
        {actionLabel && onAction ? (
          <Button label={actionLabel} onPress={onAction} variant="secondary" size="sm" fullWidth={false} />
        ) : null}
      </View>
    );
  }
  return (
    <View style={styles.container}>
      <View style={[styles.iconWrap, { backgroundColor: t.colors.bgMuted }]}>
        <Icon name={icon} size={28} color={t.colors.textMuted} />
      </View>
      <AppText style={[t.typography.cardTitle, { color: t.colors.text, marginTop: 14 }]}>{title}</AppText>
      {description ? (
        <AppText style={[t.typography.body, { color: t.colors.textMuted, marginTop: 6, textAlign: "center" }]}>
          {description}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="secondary" size="sm" fullWidth={false} style={{ marginTop: 16 }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center", paddingVertical: 48, paddingHorizontal: 24 },
  iconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  compactContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
});
