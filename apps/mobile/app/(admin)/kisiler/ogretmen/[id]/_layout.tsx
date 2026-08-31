import { Stack } from "expo-router";

export default function TeacherDetailStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="performans" />
      <Stack.Screen name="musaitlik" />
      <Stack.Screen name="geri-bildirim" />
      <Stack.Screen name="hakedis" />
    </Stack>
  );
}
