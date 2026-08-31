import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/theme-context";
import { Icon } from "./icon";
import { useUnreadNotificationCount } from "../../hooks/use-unread-notification-count";

type Props = {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  showNotifications?: boolean;
  right?: React.ReactNode;
};

/** Ortak ekran üstlüğü — geri butonu, başlık/alt başlık ve sağda bildirim zili (rozetli) veya özel aksiyon. */
export function AppHeader({ title, subtitle, showBack, showNotifications = true, right }: Props) {
  const t = useTheme();
  const router = useRouter();
  const unread = useUnreadNotificationCount(showNotifications);

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        {showBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Geri"
            onPress={() => router.back()}
            hitSlop={8}
            style={[styles.iconButton, { backgroundColor: t.colors.bgMuted }]}
          >
            <Icon name="chevron-back" size={20} />
          </Pressable>
        ) : null}
        <View>
          <Text style={[t.typography.screenTitle, { color: t.colors.text }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[t.typography.body, { color: t.colors.textMuted, marginTop: 2 }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      {right ?? (showNotifications ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Bildirimler"
          onPress={() => router.push("/notifications")}
          hitSlop={8}
          style={[styles.iconButton, { backgroundColor: t.colors.bgMuted }]}
        >
          <Icon name="notifications-outline" size={20} />
          {unread > 0 ? (
            <View style={[styles.badge, { backgroundColor: t.colors.danger, borderColor: t.colors.bg }]}>
              <Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text>
            </View>
          ) : null}
        </Pressable>
      ) : null)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    paddingBottom: 16,
    gap: 12,
  },
  left: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
});
