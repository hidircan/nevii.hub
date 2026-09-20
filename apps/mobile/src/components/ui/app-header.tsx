import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/theme-context";
import { goBack } from "../../lib/navigation";
import { Icon } from "./icon";
import { useUnreadNotificationCount } from "../../hooks/use-unread-notification-count";
import { fonts } from "../../theme/tokens";

type Props = {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  /**
   * Deep-link ile doğrudan açılışta (yığında önceki ekran yoksa) gidilecek
   * güvenli route. Verilmezse "/" (rol evi). iOS swipe-back / Android sistem
   * geri ile aynı stack kuralı (`goBack`) kullanılır.
   */
  backFallback?: string;
  showNotifications?: boolean;
  /**
   * Hesap kısayolu — verildiğinde zil + sağında bağımsız profil ikonu
   * gösterilir (öğretmen sekme kökleri; Hesabım sekmesi yerine). Değer,
   * gidilecek hesap route'udur (örn. "/(teacher)/hesabim").
   */
  showAccount?: string;
  right?: React.ReactNode;
};

/** Ortak ekran üstlüğü — geri butonu, başlık/alt başlık ve sağda bildirim zili (rozetli) veya özel aksiyon. */
export function AppHeader({ title, subtitle, showBack, backFallback, showNotifications = true, showAccount, right }: Props) {
  const t = useTheme();
  const router = useRouter();
  const unread = useUnreadNotificationCount(showNotifications);

  const bell = showNotifications ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Bildirimler"
      onPress={() => router.push("/notifications")}
      hitSlop={8}
      style={[styles.iconButton, { backgroundColor: t.colors.bgMuted }]}
    >
      <Icon name="notifications-outline" size={22} />
      {unread > 0 ? (
        <View style={[styles.badge, { backgroundColor: t.colors.danger, borderColor: t.colors.bg }]}>
          <Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  ) : null;

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        {showBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Geri"
            onPress={() => goBack(router, backFallback)}
            hitSlop={8}
            style={[styles.iconButton, { backgroundColor: t.colors.bgMuted }]}
          >
            <Icon name="chevron-back" size={22} />
          </Pressable>
        ) : null}
        <View style={{ flexShrink: 1 }}>
          <Text
            numberOfLines={1}
            style={[t.typography.display, { color: t.colors.text, fontSize: 24, lineHeight: 30 }]}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text style={[t.typography.body, { color: t.colors.textMuted, marginTop: 2 }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      {right ?? (showAccount ? (
        <View style={styles.rightGroup}>
          {bell}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Hesabım"
            accessibilityHint="Profil, ayarlar ve hesap işlemleri"
            onPress={() => router.push(showAccount as never)}
            hitSlop={8}
            style={[styles.iconButton, { backgroundColor: t.colors.bgMuted }]}
          >
            <Icon name="person-circle-outline" size={22} />
          </Pressable>
        </View>
      ) : (
        bell
      ))}
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
  rightGroup: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
  badgeText: { color: "#fff", fontFamily: fonts.serifBold, fontSize: 12, fontWeight: "700" },
});
