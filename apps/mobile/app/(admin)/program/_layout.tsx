import { Stack } from "expo-router";

export default function ProgramStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[lessonId]" />
    </Stack>
  );
}
