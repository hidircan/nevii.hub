import { Stack } from "expo-router";

export default function TeacherHesabimStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="performans" />
      <Stack.Screen name="materyaller" />
      <Stack.Screen name="materyaller-yeni" options={{ presentation: "modal" }} />
      <Stack.Screen name="musaitlik" />
      <Stack.Screen name="hakedis" />
      <Stack.Screen name="geri-bildirim" />
      <Stack.Screen name="bildirim-tercihleri" />
      <Stack.Screen name="sifre-degistir" />
    </Stack>
  );
}
