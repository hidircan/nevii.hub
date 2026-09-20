import { Stack } from "expo-router";

export default function AdminHesabimStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="bildirim-tercihleri" />
      <Stack.Screen name="sifre-degistir" />
      <Stack.Screen name="e-posta-degistir" />
    </Stack>
  );
}
