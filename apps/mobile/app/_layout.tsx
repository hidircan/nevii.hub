import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "../src/auth/auth-context";
import { ThemeProvider, useTheme } from "../src/theme/theme-context";

function RootStack() {
  const t = useTheme();
  return (
    <>
      <StatusBar style={t.mode === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.bg } }}>
        <Stack.Screen name="index" />
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
