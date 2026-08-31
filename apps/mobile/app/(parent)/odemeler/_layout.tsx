import { Stack } from "expo-router";

export default function ParentOdemelerStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[paymentId]" />
    </Stack>
  );
}
