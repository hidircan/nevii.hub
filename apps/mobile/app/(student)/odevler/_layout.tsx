import { Stack } from "expo-router";

export default function StudentOdevlerStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[homeworkId]" />
    </Stack>
  );
}
