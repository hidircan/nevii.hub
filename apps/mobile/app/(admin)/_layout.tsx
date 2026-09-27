import { Tabs } from "expo-router";
import { PersonaGuard } from "../../src/components/persona-guard";
import { Icon, TabBarLabel } from "../../src/components/ui";
import { useLocale } from "../../src/i18n/locale-context";
import { useTheme } from "../../src/theme/theme-context";

export default function AdminLayout() {
  const t = useTheme();
  const { t: tr } = useLocale();
  return (
    <PersonaGuard persona="admin">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: t.colors.primary,
          tabBarInactiveTintColor: t.colors.textMuted,
          tabBarStyle: { backgroundColor: t.colors.bg, borderTopColor: t.colors.border },
          tabBarLabel: ({ children, color }) => <TabBarLabel color={color}>{children}</TabBarLabel>,
        }}
      >
        <Tabs.Screen
          name="ozet"
          options={{ title: tr("tabs.summary"), tabBarIcon: ({ color, size }) => <Icon name="grid-outline" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="program"
          options={{ title: tr("tabs.program"), tabBarIcon: ({ color, size }) => <Icon name="calendar-outline" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="kisiler"
          options={{ title: tr("tabs.people"), tabBarIcon: ({ color, size }) => <Icon name="people-outline" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="islemler"
          options={{ title: tr("tabs.operations"), tabBarIcon: ({ color, size }) => <Icon name="briefcase-outline" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="hesabim"
          options={{ title: tr("tabs.account"), tabBarIcon: ({ color, size }) => <Icon name="person-circle-outline" size={size} color={color} /> }}
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
