import { Stack } from "expo-router";

export default function ParentHesabimStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="iletisim-tercihi" />
      <Stack.Screen name="bildirim-tercihleri" />
    </Stack>
  );
}
