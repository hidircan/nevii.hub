import { Stack } from "expo-router";

export default function OdevlerStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="yeni" options={{ presentation: "modal" }} />
      <Stack.Screen name="[homeworkId]" />
    </Stack>
  );
}
