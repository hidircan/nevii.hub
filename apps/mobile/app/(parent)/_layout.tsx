import { Tabs } from "expo-router";
import { PersonaGuard } from "../../src/components/persona-guard";
import { Icon } from "../../src/components/ui";
import { useTheme } from "../../src/theme/theme-context";
import { fonts } from "../../src/theme/tokens";

export default function ParentLayout() {
  const t = useTheme();
  return (
    <PersonaGuard persona="parent">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: t.colors.primary,
          tabBarInactiveTintColor: t.colors.textMuted,
          tabBarStyle: { backgroundColor: t.colors.bg, borderTopColor: t.colors.border, minHeight: 64 },
          tabBarLabelStyle: { fontFamily: fonts.serif, fontSize: 15 },
          tabBarItemStyle: { paddingVertical: 6 },
        }}
      >
        <Tabs.Screen
          name="anasayfa"
          options={{ title: "Ana Sayfa", tabBarIcon: ({ color }) => <Icon name="home-outline" size={26} color={color} /> }}
        />
        <Tabs.Screen
          name="cocugum"
          options={{ title: "Çocuğum", tabBarIcon: ({ color }) => <Icon name="people-outline" size={26} color={color} /> }}
        />
        <Tabs.Screen
          name="odevler"
          options={{ title: "Ödevler", tabBarIcon: ({ color }) => <Icon name="book-outline" size={26} color={color} /> }}
        />
        <Tabs.Screen
          name="gelisim"
          options={{ title: "Gelişim", tabBarIcon: ({ color }) => <Icon name="trending-up-outline" size={26} color={color} /> }}
        />
        <Tabs.Screen
          name="odemeler"
          options={{ title: "Ödemeler", tabBarIcon: ({ color }) => <Icon name="card-outline" size={26} color={color} /> }}
        />
        {/*
          Program ("dersler") sekmede YOK — ana sayfadaki sıradaki ders /
          "Bu haftanın dersleri → Tümü"nden ve push deep-link'lerinden açılır.
          Route korunur (href:null yalnız sekmeyi gizler).
        */}
        <Tabs.Screen name="dersler" options={{ href: null }} />
        {/*
          Hesabım sekmesi kaldırıldı — hesap erişimi sekme köklerindeki üst
          header'da zil ikonunun sağındaki profil ikonundadır. Route korunur.
        */}
        <Tabs.Screen name="hesabim" options={{ href: null }} />
        {/* Sekme çubuğunda gösterilmez (href:null) — "Çocuğum"daki hızlı erişimden açılır. */}
        <Tabs.Screen name="telafiler" options={{ href: null }} />
        {/* Yoklama özeti "Çocuğum" hızlı erişiminden açılır; sekmede yer almaz. */}
        <Tabs.Screen name="yoklama" options={{ href: null }} />
        {/* Devam raporu sayaç/kart dokunuşlarıyla açılır (push-only); sekmede yer almaz. */}
        <Tabs.Screen name="devam-raporu" options={{ href: null }} />
        {/*
          Sözleşmelerim YALNIZ Hesabım içinden açılır (ana panel/tab/hızlı
          erişimde kısayol yok). Route korunur.
        */}
        <Tabs.Screen name="sozlesmeler" options={{ href: null }} />
        {/*
          app/(parent)/degerlendirme.tsx eski/yedek placeholder — gerçek
          değerlendirme akışı gelisim/degerlendirme altındadır. Sekmede
          gösterilmez (href:null); dosyaya/domain'e dokunulmadı.
        */}
        <Tabs.Screen name="degerlendirme" options={{ href: null }} />
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
