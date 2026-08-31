import { useLocalSearchParams } from "expo-router";
import { StudentScopeLessonDetailScreen } from "../../../src/features/student-scope/lessons-screen";

export default function StudentLessonDetail() {
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  return <StudentScopeLessonDetailScreen lessonId={lessonId} />;
}
