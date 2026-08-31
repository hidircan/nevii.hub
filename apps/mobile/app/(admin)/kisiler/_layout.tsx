import { Stack } from "expo-router";

export default function KisilerStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="ogretmen/[id]" />
      <Stack.Screen name="ogrenci/[id]" />
    </Stack>
  );
}
