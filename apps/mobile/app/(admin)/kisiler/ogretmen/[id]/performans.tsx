import { useLocalSearchParams } from "expo-router";
import { AppHeader, Screen } from "../../../../../src/components/ui";
import { TeacherPerformanceV2Panel } from "../../../../../src/components/teacher-performance-v2-panel";
import { useLocale } from "../../../../../src/i18n/locale-context";

export default function TeacherPerformanceV2Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t: tr } = useLocale();

  return (
    <Screen>
      <AppHeader title={tr("adm.tchPerfDetail")} showBack showNotifications={false} />
      <TeacherPerformanceV2Panel teacherId={id} />
    </Screen>
  );
}
