import { Stack } from "expo-router";

export default function IsTakipStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="yeni" />
      <Stack.Screen name="[taskId]" />
    </Stack>
  );
}
