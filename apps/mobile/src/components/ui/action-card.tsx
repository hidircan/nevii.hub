import { AppText } from "./app-text";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../../theme/theme-context";
import { Card } from "./card";
import { Icon, type IconName } from "./icon";

type Props = {
  icon: IconName;
  label: string;
  onPress: () => void;
};

/** Hızlı işlemler grid'indeki tekil eylem kartı (ör. "Duyuru oluştur"). */
export function ActionCard({ icon, label, onPress }: Props) {
  const t = useTheme();
  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: t.colors.primarySoft }]}>
        <Icon name={icon} size={20} color={t.colors.primary} />
      </View>
      <AppText style={[t.typography.bodyStrong, { color: t.colors.text, marginTop: 10 }]} numberOfLines={2}>
        {label}
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, minWidth: 140, alignItems: "flex-start" },
  iconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
