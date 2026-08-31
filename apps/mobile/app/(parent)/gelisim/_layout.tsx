import { Stack } from "expo-router";

export default function GelisimStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="materyaller" />
      <Stack.Screen name="degerlendirme" options={{ presentation: "modal" }} />
    </Stack>
  );
}
