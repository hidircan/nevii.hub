import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/theme-context";
import { Button } from "./button";
import { Icon, type IconName } from "./icon";

type Props = {
  icon?: IconName;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ icon = "file-tray-outline", title, description, actionLabel, onAction }: Props) {
  const t = useTheme();
  return (
    <View style={styles.container}>
      <View style={[styles.iconWrap, { backgroundColor: t.colors.bgMuted }]}>
        <Icon name={icon} size={28} color={t.colors.textMuted} />
      </View>
      <Text style={[t.typography.cardTitle, { color: t.colors.text, marginTop: 14 }]}>{title}</Text>
      {description ? (
        <Text style={[t.typography.body, { color: t.colors.textMuted, marginTop: 6, textAlign: "center" }]}>
          {description}
        </Text>
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
});
