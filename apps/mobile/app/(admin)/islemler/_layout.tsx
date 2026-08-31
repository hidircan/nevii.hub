import { Stack } from "expo-router";

export default function IslemlerStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="duyurular/index" />
      <Stack.Screen name="duyurular/yeni" options={{ presentation: "modal" }} />
      <Stack.Screen name="is-takip/index" />
      <Stack.Screen name="is-takip/[taskId]" />
      <Stack.Screen name="ogretmen-performans" />
      <Stack.Screen name="odev-raporu" />
      <Stack.Screen name="finans" />
      <Stack.Screen name="yoklama" />
      <Stack.Screen name="telafi" />
      <Stack.Screen name="tahsilat" />
      <Stack.Screen name="workflows" />
      <Stack.Screen name="katalog" />
    </Stack>
  );
}
