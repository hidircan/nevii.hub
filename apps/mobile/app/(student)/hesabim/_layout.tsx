import { Stack } from "expo-router";

export default function StudentHesabimStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="sifre-degistir" />
    </Stack>
  );
}
