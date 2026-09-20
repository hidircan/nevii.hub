import { Stack } from "expo-router";

export default function ParentTelafilerStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[makeupId]" />
    </Stack>
  );
}
