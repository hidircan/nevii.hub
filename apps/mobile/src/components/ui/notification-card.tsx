import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/theme-context";
import { Card } from "./card";
import { Icon, type IconName } from "./icon";
import type { Notification } from "../../types/api";

const CATEGORY_ICON: Record<string, IconName> = {
  LESSON: "musical-notes-outline",
  ATTENDANCE: "checkmark-done-outline",
  HOMEWORK: "book-outline",
  TASK: "checkbox-outline",
  ANNOUNCEMENT: "megaphone-outline",
  PAYMENT: "card-outline",
  MAKEUP: "swap-horizontal-outline",
};

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Şimdi";
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  const days = Math.floor(hours / 24);
  return `${days} gün önce`;
}

type Props = {
  notification: Notification;
  onPress?: () => void;
};

export function NotificationCard({ notification, onPress }: Props) {
  const t = useTheme();
  const unread = !notification.readAt;
  const icon = CATEGORY_ICON[notification.category ?? ""] ?? "notifications-outline";

  return (
    <Card onPress={onPress} style={{ backgroundColor: unread ? t.colors.primarySoft : t.colors.bgRaised }}>
      <View style={styles.row}>
        <View style={[styles.iconWrap, { backgroundColor: unread ? t.colors.bgRaised : t.colors.bgMuted }]}>
          <Icon name={icon} size={17} color={unread ? t.colors.primary : t.colors.textMuted} />
        </View>
        <View style={styles.content}>
          <Text style={[t.typography.body, { color: t.colors.text, fontWeight: unread ? "700" : "500" }]} numberOfLines={2}>
            {notification.title ?? notification.category ?? "Bildirim"}
          </Text>
          {notification.body ? (
            <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]} numberOfLines={2}>
              {notification.body}
            </Text>
          ) : null}
          <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 4 }]}>
            {timeAgo(notification.createdAt)}
          </Text>
        </View>
        {unread ? <View style={[styles.dot, { backgroundColor: t.colors.primary }]} /> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  iconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  content: { flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
});
