import { Stack } from "expo-router";

export default function ParentOdevlerStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[homeworkId]" />
    </Stack>
  );
}
