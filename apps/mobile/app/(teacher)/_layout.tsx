import { Tabs } from "expo-router";
import { PersonaGuard } from "../../src/components/persona-guard";
import { Icon } from "../../src/components/ui";
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
          tabBarStyle: { backgroundColor: t.colors.bg, borderTopColor: t.colors.border },
        }}
      >
        <Tabs.Screen
          name="bugun"
          options={{ title: "Bugün", tabBarIcon: ({ color, size }) => <Icon name="today-outline" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="ogrencilerim"
          options={{ title: "Öğrencilerim", tabBarIcon: ({ color, size }) => <Icon name="people-outline" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="odevler"
          options={{ title: "Ödevler", tabBarIcon: ({ color, size }) => <Icon name="book-outline" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="is-takip"
          options={{ title: "İş Takip", tabBarIcon: ({ color, size }) => <Icon name="checkbox-outline" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="hesabim"
          options={{ title: "Hesabım", tabBarIcon: ({ color, size }) => <Icon name="person-circle-outline" size={size} color={color} /> }}
        />
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
      </Tabs>
    </PersonaGuard>
  );
}
