import { Stack } from "expo-router";

export default function StudentOdemelerStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[paymentId]" />
    </Stack>
  );
}
