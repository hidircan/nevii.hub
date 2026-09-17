import { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "../src/auth/auth-context";
import { ThemeProvider, useTheme } from "../src/theme/theme-context";
import { useAppFonts } from "../src/theme/fonts";

// Font hazır olana kadar native splash tutulur — arayüz fallback'le de
// çizilebilir, ama marka başlığı (Gloock) ilk karede doğru görünsün.
try {
  void SplashScreen.preventAutoHideAsync();
} catch {
  // Test ortamı / tekrarlı çağrı — yoksay.
}

function RootStack() {
  const t = useTheme();
  const fontsLoaded = useAppFonts();

  useEffect(() => {
    if (!fontsLoaded) return;
    void SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsLoaded]);

  // Güvenlik supabı: font ağda takılırsa uygulama en fazla 2,5 sn bekler.
  useEffect(() => {
    const id = setTimeout(() => {
      void SplashScreen.hideAsync().catch(() => undefined);
    }, 2500);
    return () => clearTimeout(id);
  }, []);

  return (
    <>
      <StatusBar style={t.mode === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="welcome" />
        <Stack.Screen name="login" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="(admin)" />
        <Stack.Screen name="(teacher)" />
        <Stack.Screen name="(parent)" />
        <Stack.Screen name="(student)" />
        <Stack.Screen name="notifications" options={{ presentation: "modal" }} />
        <Stack.Screen name="assessment/[lessonId]" options={{ presentation: "modal" }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RootStack />
      </AuthProvider>
    </ThemeProvider>
  );
}
