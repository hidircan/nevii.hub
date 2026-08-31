import { Tabs } from "expo-router";
import { PersonaGuard } from "../../src/components/persona-guard";
import { Icon } from "../../src/components/ui";
import { useTheme } from "../../src/theme/theme-context";

export default function ParentLayout() {
  const t = useTheme();
  return (
    <PersonaGuard persona="parent">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: t.colors.primary,
          tabBarInactiveTintColor: t.colors.textMuted,
          tabBarStyle: { backgroundColor: t.colors.bg, borderTopColor: t.colors.border },
        }}
      >
        <Tabs.Screen
          name="anasayfa"
          options={{ title: "Ana Sayfa", tabBarIcon: ({ color, size }) => <Icon name="home-outline" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="dersler"
          options={{ title: "Dersler", tabBarIcon: ({ color, size }) => <Icon name="calendar-outline" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="odevler"
          options={{ title: "Ödevler", tabBarIcon: ({ color, size }) => <Icon name="book-outline" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="gelisim"
          options={{ title: "Gelişim", tabBarIcon: ({ color, size }) => <Icon name="trending-up-outline" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="hesabim"
          options={{ title: "Hesabım", tabBarIcon: ({ color, size }) => <Icon name="person-circle-outline" size={size} color={color} /> }}
        />
        {/* Sekme çubuğunda gösterilmez (href:null) — "Ana Sayfa"daki ödeme özeti kartından erişilir, günlük birincil eylem değil. */}
        <Tabs.Screen name="odemeler" options={{ href: null }} />
        {/*
          app/(parent)/bildirimler.tsx eski/yedek düz bir route dosyası —
          gerçek bildirimler ekranı paylaşılan kök /notifications (AppHeader
          zil ikonu, bkz. app/notifications.tsx). AYNI desen — dosyaya/
          domain'e dokunulmadı, yalnızca istenmeyen fazladan sekme gizlendi.
        */}
        <Tabs.Screen name="bildirimler" options={{ href: null }} />
      </Tabs>
    </PersonaGuard>
  );
}
