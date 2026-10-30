import { Tabs } from "expo-router";
import { PersonaGuard } from "../../src/components/persona-guard";
import { Icon, TabBarLabel, TAB_ICON_SIZE, usePortalTabBarStyle } from "../../src/components/ui";
import { useLocale } from "../../src/i18n/locale-context";
import { useTheme } from "../../src/theme/theme-context";

export default function StudentLayout() {
  const t = useTheme();
  const { t: tr } = useLocale();
  // Alt menü tek kaynak: yükseklik + bottom safe-area pocket (tab-bar.tsx).
  const tabBarStyle = usePortalTabBarStyle();
  return (
    <PersonaGuard persona="student">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: t.colors.primary,
          tabBarInactiveTintColor: t.colors.textMuted,
          tabBarStyle,
          tabBarLabel: ({ children, color }) => <TabBarLabel color={color}>{children}</TabBarLabel>,
          tabBarItemStyle: { paddingVertical: 4, justifyContent: "center" },
          tabBarIconStyle: { marginBottom: 0 },
        }}
      >
        <Tabs.Screen
          name="anasayfa"
          options={{ title: tr("tabs.home"), tabBarIcon: ({ color }) => <Icon name="home-outline" size={TAB_ICON_SIZE} color={color} /> }}
        />
        <Tabs.Screen
          name="odevler"
          options={{ title: tr("tabs.homework"), tabBarIcon: ({ color }) => <Icon name="book-outline" size={TAB_ICON_SIZE} color={color} /> }}
        />
        <Tabs.Screen
          name="gelisim"
          options={{ title: tr("tabs.growth"), tabBarIcon: ({ color }) => <Icon name="trending-up-outline" size={TAB_ICON_SIZE} color={color} /> }}
        />
        <Tabs.Screen
          name="odemeler"
          options={{ title: tr("tabs.payments"), tabBarIcon: ({ color }) => <Icon name="card-outline" size={TAB_ICON_SIZE} color={color} /> }}
        />
        {/*
          Program ("dersler") sekmede YOK — ana sayfadaki sıradaki ders /
          "Bu haftanın dersleri → Tümü"nden ve push deep-link'lerinden açılır.
          Route korunur (href:null yalnız sekmeyi gizler).
        */}
        <Tabs.Screen name="dersler" options={{ href: null }} />
        {/* Telafiler ana sayfadaki "Telafi hakları"ndan açılır; sekmede yer almaz. */}
        <Tabs.Screen name="telafiler" options={{ href: null }} />
        {/*
          Sözleşmelerim YALNIZ Hesabım içinden açılır (ana panel/tab/hızlı
          erişimde kısayol yok). Route korunur.
        */}
        <Tabs.Screen name="sozlesmeler" options={{ href: null }} />
        {/* Devam raporu sayaç/kart dokunuşlarıyla açılır (push-only); sekmede yer almaz. */}
        <Tabs.Screen name="devam-raporu" options={{ href: null }} />
        {/*
          Hesabım sekmesi kaldırıldı — hesap erişimi sekme köklerindeki üst
          header'da zil ikonunun sağındaki profil ikonundadır. Route korunur.
        */}
        <Tabs.Screen name="hesabim" options={{ href: null }} />
      </Tabs>
    </PersonaGuard>
  );
}
