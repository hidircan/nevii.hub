import { useLocalSearchParams } from "expo-router";
import { AppHeader, Screen } from "../../../../../src/components/ui";
import { TeacherPerformanceV2Panel } from "../../../../../src/components/teacher-performance-v2-panel";

export default function TeacherPerformanceV2Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <Screen>
      <AppHeader title="Detaylı performans" showBack showNotifications={false} />
      <TeacherPerformanceV2Panel teacherId={id} />
    </Screen>
  );
}
