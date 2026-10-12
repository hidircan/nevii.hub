import { AppHeader, EmptyState, Screen } from "../../../src/components/ui";
import { TeacherPerformanceV2Panel } from "../../../src/components/teacher-performance-v2-panel";
import { useAuth } from "../../../src/auth/auth-context";
import { useLocale } from "../../../src/i18n/locale-context";

export default function TeacherPerformansim() {
  const { user } = useAuth();
  const { t: tr } = useLocale();

  return (
    <Screen>
      <AppHeader title={tr("perf.myTitle")} showBack showNotifications={false} />
      {user?.teacherId ? (
        <TeacherPerformanceV2Panel teacherId={user.teacherId} />
      ) : (
        <EmptyState icon="alert-circle-outline" title={tr("fbSum.noAccount")} />
      )}
    </Screen>
  );
}
