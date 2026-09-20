import { Tabs } from "expo-router";
import { PersonaGuard } from "../../src/components/persona-guard";
import { Icon, TabBarLabel } from "../../src/components/ui";
import { useTheme } from "../../src/theme/theme-context";

export default function TeacherLayout() {
  const t = useTheme();
  return (
    <PersonaGuard persona="teacher">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: t.colors.primary,
          tabBarInactiveTintColor: t.colors.textMuted,
          tabBarStyle: {backgroundColor: t.colors.bg,borderTopColor: t.colors.border,borderTopWidth: 0,minHeight: 56,paddingTop: 0,paddingBottom: 0,shadowColor: "#0F172A",shadowOffset: { width: 0, height: -3 },shadowOpacity: 0.12,shadowRadius: 10,elevation: 12,},
          tabBarLabel: ({ children, color }) => <TabBarLabel color={color}>{children}</TabBarLabel>,
          /*tabBarItemStyle: {paddingVertical: 6,marginHorizontal: 3,marginVertical: 4,borderRadius: 800},*/
          tabBarItemStyle: {
          paddingTop: 0,
          paddingBottom: 2,
          marginHorizontal: 3,
          marginVertical: 0,
          borderRadius: 999},
          tabBarIconStyle: {marginTop: -3},

          tabBarActiveBackgroundColor: t.colors.primarySoft,
          tabBarInactiveBackgroundColor: "transparent"
        }}
      >
        <Tabs.Screen
          name="bugun"
          options={{ title: "Program", tabBarIcon: ({ color }) => <Icon name="today-outline" size={26} color={color} /> }}
        />
        <Tabs.Screen
          name="ogrencilerim"
          options={{ title: "Öğrenci", tabBarIcon: ({ color }) => <Icon name="people-outline" size={26} color={color} /> }}
        />
        <Tabs.Screen
          name="odevler"
          options={{ title: "Ödev", tabBarIcon: ({ color }) => <Icon name="book-outline" size={26} color={color} /> }}
        />
        <Tabs.Screen
          name="hakedis"
          options={{ title: "Hakediş", tabBarIcon: ({ color }) => <Icon name="cash-outline" size={26} color={color} /> }}
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
