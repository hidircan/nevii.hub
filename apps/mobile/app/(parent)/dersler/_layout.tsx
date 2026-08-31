import { Stack } from "expo-router";

export default function DerslerStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[lessonId]" />
    </Stack>
  );
}
