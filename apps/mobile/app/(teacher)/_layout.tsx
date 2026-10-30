import { Tabs } from "expo-router";
import { PersonaGuard } from "../../src/components/persona-guard";
import { Icon, TabBarLabel, TAB_ICON_SIZE, usePortalTabBarStyle } from "../../src/components/ui";
import { useLocale } from "../../src/i18n/locale-context";
import { useTheme } from "../../src/theme/theme-context";

export default function TeacherLayout() {
  const t = useTheme();
  const { t: tr } = useLocale();
  // Alt menü tek kaynak: yükseklik + bottom safe-area pocket (tab-bar.tsx);
  // öğretmen portalına özgü gölge/bordoverride ekstra geçilir.
  const tabBarStyle = usePortalTabBarStyle({
    borderTopWidth: 0,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0 as const, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 12,
  });
  return (
    <PersonaGuard persona="teacher">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: t.colors.primary,
          tabBarInactiveTintColor: t.colors.textMuted,
          tabBarStyle,
          tabBarLabel: ({ children, color }) => <TabBarLabel color={color}>{children}</TabBarLabel>,
          tabBarItemStyle: {
            paddingTop: 2,
            paddingBottom: 2,
            marginHorizontal: 3,
            marginVertical: 0,
            borderRadius: 999,
            justifyContent: "center",
          },
          tabBarIconStyle: { marginBottom: 0 },

          tabBarActiveBackgroundColor: t.colors.primarySoft,
          tabBarInactiveBackgroundColor: "transparent"
        }}
      >
        <Tabs.Screen
          name="bugun"
          options={{ title: tr("tabs.program"), tabBarIcon: ({ color }) => <Icon name="today-outline" size={TAB_ICON_SIZE} color={color} /> }}
        />
        <Tabs.Screen
          name="ogrencilerim"
          options={{ title: tr("tabs.myStudent"), tabBarIcon: ({ color }) => <Icon name="people-outline" size={TAB_ICON_SIZE} color={color} /> }}
        />
        <Tabs.Screen
          name="odevler"
          options={{ title: tr("tabs.homeworkShort"), tabBarIcon: ({ color }) => <Icon name="book-outline" size={TAB_ICON_SIZE} color={color} /> }}
        />
        <Tabs.Screen
          name="hakedis"
          options={{ title: tr("tabs.compensation"), tabBarIcon: ({ color }) => <Icon name="cash-outline" size={TAB_ICON_SIZE} color={color} /> }}
        />
        {/*
          İş Takip ve Hesabım sekmeleri kaldırıldı — İş Takip Hesabım içinden,
          Hesabım üst header'daki profil ikonundan açılır (zil ikonunun sağı).
          Route'lar korunur (deep link + Hesabım kısayolları çalışır).
        */}
        <Tabs.Screen name="is-takip" options={{ href: null }} />
        <Tabs.Screen name="hesabim" options={{ href: null }} />
        {/*
          Bu iki dosya (app/(teacher)/odevlerim.tsx, bildirimler.tsx) eski/yedek
          düz route dosyaları — gerçek ödev sekmesi "odevler" (nested,
          yukarıda), gerçek bildirimler ekranı paylaşılan kök /notifications
          (AppHeader zil ikonu, bkz. app/notifications.tsx). Sekme çubuğunda
          gösterilmez (href:null) — "odemeler" ile AYNI desen; dosyalar/
          domain/backend'e dokunulmadı, yalnızca istenmeyen fazladan sekme
          gizlendi.
        */}
        <Tabs.Screen name="odevlerim" options={{ href: null }} />
        <Tabs.Screen name="bildirimler" options={{ href: null }} />
        {/* Telafiler: Bugün ve Hesabım'dan açılır; sekme çubuğu 5 sekmede kalır. */}
        <Tabs.Screen name="telafi" options={{ href: null }} />
      </Tabs>
    </PersonaGuard>
  );
}
