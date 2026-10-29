import { Stack } from "expo-router";

export default function ParentSozlesmelerStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[contractId]" />
    </Stack>
  );
}
