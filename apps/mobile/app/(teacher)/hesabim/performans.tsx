import { AppHeader, EmptyState, Screen } from "../../../src/components/ui";
import { TeacherPerformanceV2Panel } from "../../../src/components/teacher-performance-v2-panel";
import { useAuth } from "../../../src/auth/auth-context";

export default function TeacherPerformansim() {
  const { user } = useAuth();

  return (
    <Screen>
      <AppHeader title="Performansım" showBack showNotifications={false} />
      {user?.teacherId ? (
        <TeacherPerformanceV2Panel teacherId={user.teacherId} />
      ) : (
        <EmptyState icon="alert-circle-outline" title="Öğretmen hesabı bulunamadı" />
      )}
    </Screen>
  );
}
