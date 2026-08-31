import { Stack } from "expo-router";

export default function OgrencilerimStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[studentId]" />
    </Stack>
  );
}
