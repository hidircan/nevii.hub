import { Tabs } from "expo-router";
import { PersonaGuard } from "../../src/components/persona-guard";
import { Icon, TabBarLabel, TAB_ICON_SIZE, usePortalTabBarStyle } from "../../src/components/ui";
import { useLocale } from "../../src/i18n/locale-context";
import { useTheme } from "../../src/theme/theme-context";

export default function AdminLayout() {
  const t = useTheme();
  const { t: tr } = useLocale();
  // Alt menü tek kaynak: yükseklik + bottom safe-area pocket (tab-bar.tsx).
  const tabBarStyle = usePortalTabBarStyle();
  return (
    <PersonaGuard persona="admin">
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
          name="ozet"
          options={{ title: tr("tabs.summary"), tabBarIcon: ({ color }) => <Icon name="grid-outline" size={TAB_ICON_SIZE} color={color} /> }}
        />
        <Tabs.Screen
          name="program"
          options={{ title: tr("tabs.program"), tabBarIcon: ({ color }) => <Icon name="calendar-outline" size={TAB_ICON_SIZE} color={color} /> }}
        />
        <Tabs.Screen
          name="kisiler"
          options={{ title: tr("tabs.people"), tabBarIcon: ({ color }) => <Icon name="people-outline" size={TAB_ICON_SIZE} color={color} /> }}
        />
        <Tabs.Screen
          name="islemler"
          options={{ title: tr("tabs.operations"), tabBarIcon: ({ color }) => <Icon name="briefcase-outline" size={TAB_ICON_SIZE} color={color} /> }}
        />
        <Tabs.Screen
          name="hesabim"
          options={{ title: tr("tabs.account"), tabBarIcon: ({ color }) => <Icon name="person-circle-outline" size={TAB_ICON_SIZE} color={color} /> }}
        />
        {/*
          Eski/yedek düz route dosyaları (dersler/duyurular/ogretmenler) —
          gerçek ekranlar program/kisiler/islemler altındadır. Sekme
          çubuğunda gösterilmez (href:null); dosyalara/domain'e dokunulmadı.
        */}
        <Tabs.Screen name="dersler" options={{ href: null }} />
        <Tabs.Screen name="duyurular" options={{ href: null }} />
        <Tabs.Screen name="ogretmenler" options={{ href: null }} />
      </Tabs>
    </PersonaGuard>
  );
}
