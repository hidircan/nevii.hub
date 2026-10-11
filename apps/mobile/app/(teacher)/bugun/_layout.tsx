import { Stack } from "expo-router";

export default function BugunStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="hafta" />
      <Stack.Screen name="[lessonId]" />
    </Stack>
  );
}
